import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import filtersData from './data/filters.json';
import { getCssFilterString } from './utils/filterUtils';
import {
  playShutterSound,
  playCountdownBeep,
  captureFrame,
  savePhotoFile,
  copyImageToClipboard
} from './utils/captureUtils';
import './App.css';

function App() {
  const [activeNav, setActiveNav] = useState('CAMERA');
  const [isStreaming, setIsStreaming] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraError, setCameraError] = useState(null);

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState(filtersData[0]);
  const [filterIntensity, setFilterIntensity] = useState(filtersData[0]?.defaultIntensity ?? 100);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Capture & Shutter Engine State
  const [selectedTimer, setSelectedTimer] = useState(0); // 0 (off), 3, 5, 10
  const [countdownRemaining, setCountdownRemaining] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('native'); // 'native', '1:1', '4:3', '16:9'
  const [isMirrored, setIsMirrored] = useState(true);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [activePreviewPhoto, setActivePreviewPhoto] = useState(null);
  const [exportFormat, setExportFormat] = useState('png'); // 'png' or 'jpg'
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [lastSavedPath, setLastSavedPath] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = ['ALL', ...new Set(filtersData.map((f) => f.category))];
    return cats;
  }, []);

  // Filtered list based on category
  const filteredList = useMemo(() => {
    if (selectedCategory === 'ALL') return filtersData;
    return filtersData.filter((f) => f.category === selectedCategory);
  }, [selectedCategory]);

  // Computed CSS filter string
  const activeCssFilter = useMemo(() => {
    return getCssFilterString(selectedFilter, filterIntensity);
  }, [selectedFilter, filterIntensity]);

  // Enumerate video input devices
  const getCameraDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((device) => device.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  };

  // Start live webcam stream
  const startCamera = async (deviceId = selectedDeviceId) => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsStreaming(true);
      await getCameraDevices();
    } catch (err) {
      console.error('Camera access error:', err);
      setIsStreaming(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow access in system settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device was detected on your machine.');
      } else {
        setCameraError(`Camera error: ${err.message || 'Unable to open camera.'}`);
      }
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownRemaining(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  // Switch camera device
  const handleDeviceChange = (e) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);
    if (isStreaming) {
      startCamera(newDeviceId);
    }
  };

  // Select a filter
  const handleSelectFilter = (filter) => {
    setSelectedFilter(filter);
    setFilterIntensity(filter.defaultIntensity ?? 100);
  };

  // Perform the actual snap
  const executeCapture = useCallback(() => {
    if (!videoRef.current || !isStreaming) return;

    try {
      // 1. Shutter sound
      playShutterSound();

      // 2. White flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 220);

      // 3. Render frame to canvas with active filter and mirroring
      const dataUrl = captureFrame({
        videoElement: videoRef.current,
        filterCss: activeCssFilter,
        isMirrored,
        aspectRatio
      });

      const now = new Date();
      const newSnap = {
        id: `snap-${Date.now()}`,
        dataUrl,
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: now.toLocaleDateString(),
        filterName: selectedFilter.name,
        aspectRatio,
      };

      setCapturedPhotos((prev) => [newSnap, ...prev]);
      setActivePreviewPhoto(newSnap);
      setFeedbackMsg(null);
      setLastSavedPath(null);
    } catch (err) {
      console.error('Capture execution failed:', err);
      alert('Failed to capture photo: ' + err.message);
    }
  }, [isStreaming, activeCssFilter, isMirrored, aspectRatio, selectedFilter.name]);

  // Cancel countdown
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownRemaining(null);
  }, []);

  // Trigger shutter button or shortcut
  const handleTriggerShutter = useCallback(() => {
    if (!isStreaming) {
      startCamera();
      return;
    }

    if (countdownRemaining !== null) {
      // If already counting down, cancel on click
      cancelCountdown();
      return;
    }

    if (selectedTimer === 0) {
      executeCapture();
    } else {
      let count = selectedTimer;
      setCountdownRemaining(count);
      playCountdownBeep(650, 0.08);

      countdownTimerRef.current = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdownRemaining(count);
          playCountdownBeep(650, 0.08);
        } else {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdownRemaining(null);
          playCountdownBeep(1100, 0.12);
          executeCapture();
        }
      }, 1000);
    }
  }, [isStreaming, countdownRemaining, selectedTimer, executeCapture, cancelCountdown]);

  // Save active photo
  const handleSavePhoto = async (photo = activePreviewPhoto) => {
    if (!photo) return;
    const cleanFilterName = photo.filterName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `snappix-${cleanFilterName}-${Date.now()}.${exportFormat}`;

    setFeedbackMsg('Saving photo...');
    const result = await savePhotoFile(photo.dataUrl, exportFormat, filename);

    if (result.success) {
      setLastSavedPath(result.filePath || null);
      setFeedbackMsg(`✓ Photo saved successfully!`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else if (result.canceled) {
      setFeedbackMsg(null);
    } else {
      setFeedbackMsg(`Failed to save: ${result.error || 'Unknown error'}`);
    }
  };

  // Copy photo to clipboard
  const handleCopyToClipboard = async (photo = activePreviewPhoto) => {
    if (!photo) return;
    const result = await copyImageToClipboard(photo.dataUrl);
    if (result.success) {
      setFeedbackMsg('✓ Copied to clipboard!');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } else {
      setFeedbackMsg('Could not copy to clipboard.');
    }
  };

  // Reveal saved file in folder
  const handleShowInFolder = () => {
    if (lastSavedPath && window.snappix?.showInFolder) {
      window.snappix.showInFolder(lastSavedPath);
    }
  };

  // Delete photo from captures
  const handleDeletePhoto = (id) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== id));
    if (activePreviewPhoto?.id === id) {
      setActivePreviewPhoto(null);
    }
  };

  // Keyboard shortcuts (Space = snap, Esc = close preview / cancel countdown)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!activePreviewPhoto && isStreaming) {
          handleTriggerShutter();
        }
      } else if (e.key === 'Escape') {
        if (activePreviewPhoto) {
          setActivePreviewPhoto(null);
        }
        if (countdownRemaining !== null) {
          cancelCountdown();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePreviewPhoto, isStreaming, countdownRemaining, handleTriggerShutter, cancelCountdown]);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="canvas-sky">
      {/* Karl Top Centered Nav */}
      <nav className="top-nav">
        {['HOME', 'CAMERA', 'FILTERS', 'GALLERY'].map((item) => (
          <button
            key={item}
            type="button"
            className={`nav-link ${activeNav === item ? 'active' : ''}`}
            onClick={() => setActiveNav(item)}
          >
            {item}
            {item === 'GALLERY' && capturedPhotos.length > 0 && (
              <span className="gallery-counter">{capturedPhotos.length}</span>
            )}
            {activeNav === item && <span className="nav-indicator" />}
          </button>
        ))}
      </nav>

      {/* Decorative Storybook Cloud Elements */}
      <div className="cloud cloud-top-left" aria-hidden="true" />
      <div className="cloud cloud-top-right" aria-hidden="true" />

      {/* Main Content Area */}
      <main className="hero-section">
        <div className="header-titles">
          <h1 className="display-headline">SNAPPIX</h1>
          <p className="sub-headline">LIVE STORYBOOK WEBCAM & PHOTO STUDIO</p>
        </div>

        {/* GALLERY VIEW */}
        {activeNav === 'GALLERY' ? (
          <div className="gallery-full-view">
            <div className="gallery-header-bar">
              <h2 className="gallery-title">YOUR CAPTURES ({capturedPhotos.length})</h2>
              {capturedPhotos.length > 0 && (
                <button
                  type="button"
                  className="action-btn secondary small"
                  onClick={() => setCapturedPhotos([])}
                >
                  CLEAR GALLERY
                </button>
              )}
            </div>

            {capturedPhotos.length === 0 ? (
              <div className="gallery-empty-state">
                <span className="empty-state-icon">📸</span>
                <p className="empty-state-text">NO PHOTOS CAPTURED YET!</p>
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => setActiveNav('CAMERA')}
                >
                  OPEN CAMERA & SNAP
                </button>
              </div>
            ) : (
              <div className="gallery-grid">
                {capturedPhotos.map((photo) => (
                  <div key={photo.id} className="gallery-card">
                    <div
                      className="gallery-card-thumb-wrap"
                      onClick={() => setActivePreviewPhoto(photo)}
                    >
                      <img src={photo.dataUrl} alt={`Snap ${photo.timestamp}`} className="gallery-card-img" />
                      <div className="gallery-thumb-overlay">
                        <span>INSPECT</span>
                      </div>
                    </div>
                    <div className="gallery-card-footer">
                      <div className="gallery-card-meta">
                        <strong className="photo-filter-tag">{photo.filterName}</strong>
                        <span className="photo-time-tag">{photo.timestamp}</span>
                      </div>
                      <div className="gallery-card-actions">
                        <button
                          type="button"
                          className="card-mini-btn"
                          title="Save photo"
                          onClick={() => handleSavePhoto(photo)}
                        >
                          💾
                        </button>
                        <button
                          type="button"
                          className="card-mini-btn"
                          title="Copy to clipboard"
                          onClick={() => handleCopyToClipboard(photo)}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          className="card-mini-btn danger"
                          title="Delete photo"
                          onClick={() => handleDeletePhoto(photo.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* CAMERA & FILTERS VIEW */
          <>
            {/* Focal Globe Surface with Camera Viewfinder */}
            <div className={`globe-surface aspect-${aspectRatio}`}>
              <div className="camera-frame">
                <video
                  ref={videoRef}
                  className={`camera-video ${isStreaming ? 'visible' : 'hidden'} ${isMirrored ? 'mirrored' : ''}`}
                  style={{ filter: activeCssFilter }}
                  autoPlay
                  playsInline
                  muted
                />

                {/* Shutter Screen Flash Overlay */}
                <div className={`shutter-flash-overlay ${isFlashing ? 'active' : ''}`} />

                {/* Countdown Large Visual Digit Overlay */}
                {countdownRemaining !== null && (
                  <div className="countdown-overlay">
                    <div className="countdown-number-pulse">{countdownRemaining}</div>
                    <button
                      type="button"
                      className="cancel-countdown-btn"
                      onClick={cancelCountdown}
                    >
                      CANCEL
                    </button>
                  </div>
                )}

                {!isStreaming && (
                  <div className="camera-placeholder">
                    <span className="placeholder-icon">📷</span>
                    <p className="placeholder-text">
                      {cameraError ? cameraError : 'Camera is currently paused.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Framing & Mode Bar (Aspect Ratio, Timer, Mirror) */}
            <div className="framing-bar">
              {/* Aspect Ratio Selector */}
              <div className="framing-group">
                <span className="framing-label">RATIO</span>
                <div className="toggle-pill-group">
                  {[
                    { id: 'native', label: 'FULL' },
                    { id: '1:1', label: '1:1' },
                    { id: '4:3', label: '4:3' },
                    { id: '16:9', label: '16:9' }
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      type="button"
                      className={`pill-btn ${aspectRatio === ratio.id ? 'active' : ''}`}
                      onClick={() => setAspectRatio(ratio.id)}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shutter Timer Selector */}
              <div className="framing-group">
                <span className="framing-label">TIMER</span>
                <div className="toggle-pill-group">
                  {[
                    { sec: 0, label: 'OFF' },
                    { sec: 3, label: '3s' },
                    { sec: 5, label: '5s' },
                    { sec: 10, label: '10s' }
                  ].map((t) => (
                    <button
                      key={t.sec}
                      type="button"
                      className={`pill-btn ${selectedTimer === t.sec ? 'active' : ''}`}
                      onClick={() => setSelectedTimer(t.sec)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mirror Camera Toggle */}
              <div className="framing-group">
                <button
                  type="button"
                  className={`pill-btn mirror-btn ${isMirrored ? 'active' : ''}`}
                  onClick={() => setIsMirrored(!isMirrored)}
                  title="Toggle selfie mirror"
                >
                  🪞 MIRROR: {isMirrored ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Prominent Storybook Shutter Trigger Area */}
            <div className="shutter-hub">
              <button
                type="button"
                className={`shutter-trigger-btn ${countdownRemaining !== null ? 'counting' : ''}`}
                onClick={handleTriggerShutter}
                title="Capture Photo (Spacebar)"
              >
                <div className="shutter-inner-ring">
                  <span className="shutter-camera-icon">📸</span>
                  <span className="shutter-label-text">
                    {countdownRemaining !== null
                      ? `SNAP IN ${countdownRemaining}s`
                      : 'SNAP PHOTO'}
                  </span>
                </div>
              </button>
              <div className="shutter-hint-key">PRESS <strong>SPACEBAR</strong> TO SNAP</div>
            </div>

            {/* Current Active Filter Badge & Intensity Control */}
            <div className="filter-status-card">
              <div className="filter-badge-header">
                <span className="current-filter-tag">ACTIVE FILTER</span>
                <span className="current-filter-name">{selectedFilter.name}</span>
                <span className="current-filter-desc">{selectedFilter.description}</span>
              </div>

              {selectedFilter.id !== 'natural' && (
                <div className="intensity-slider-box">
                  <label htmlFor="intensity-input" className="intensity-label">
                    INTENSITY: <strong>{filterIntensity}%</strong>
                  </label>
                  <input
                    id="intensity-input"
                    type="range"
                    min="0"
                    max="100"
                    value={filterIntensity}
                    onChange={(e) => setFilterIntensity(Number(e.target.value))}
                    className="karl-slider"
                  />
                </div>
              )}
            </div>

            {/* Camera Switcher & Controls Toolbar */}
            <div className="camera-toolbar">
              <button
                type="button"
                className="action-btn primary"
                onClick={isStreaming ? stopCamera : () => startCamera()}
              >
                {isStreaming ? 'PAUSE CAMERA' : 'START CAMERA'}
              </button>

              {devices.length > 1 && (
                <select
                  className="device-select"
                  value={selectedDeviceId}
                  onChange={handleDeviceChange}
                >
                  {devices.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Category Pills */}
            <div className="category-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 30+ Filters Carousel / Grid Tray */}
            <div className="filters-carousel-container">
              <div className="filters-scroll-tray">
                {filteredList.map((filter) => {
                  const isSelected = selectedFilter.id === filter.id;
                  const sampleCss = getCssFilterString(filter, 85);
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={`filter-card-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectFilter(filter)}
                    >
                      <div className="filter-preview-circle">
                        <div
                          className="filter-preview-swatch"
                          style={{ filter: sampleCss }}
                        />
                      </div>
                      <span className="filter-card-name">{filter.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mini Recent Snaps Tray */}
            {capturedPhotos.length > 0 && (
              <div className="recent-snaps-tray">
                <div className="recent-snaps-header">
                  <span className="recent-title">RECENT SNAPS ({capturedPhotos.length})</span>
                  <button
                    type="button"
                    className="view-gallery-link"
                    onClick={() => setActiveNav('GALLERY')}
                  >
                    VIEW ALL →
                  </button>
                </div>
                <div className="recent-snaps-list">
                  {capturedPhotos.slice(0, 5).map((snap) => (
                    <div
                      key={snap.id}
                      className="recent-snap-thumb"
                      onClick={() => setActivePreviewPhoto(snap)}
                      title={`Captured at ${snap.timestamp}`}
                    >
                      <img src={snap.dataUrl} alt="Thumbnail" />
                      <span className="recent-snap-tag">{snap.filterName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* CAPTURED PHOTO PREVIEW MODAL */}
      {activePreviewPhoto && (
        <div className="preview-modal-backdrop" onClick={() => setActivePreviewPhoto(null)}>
          <div className="preview-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-meta">
                <h3 className="preview-headline">PHOTO CAPTURED!</h3>
                <span className="preview-sub">
                  {activePreviewPhoto.filterName} • {activePreviewPhoto.timestamp}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActivePreviewPhoto(null)}
              >
                ✕
              </button>
            </div>

            <div className="preview-image-container">
              <img
                src={activePreviewPhoto.dataUrl}
                alt="Captured Snapshot"
                className="preview-image"
              />
            </div>

            {/* Feedback notification toast inside modal */}
            {feedbackMsg && (
              <div className="preview-feedback-banner">
                {feedbackMsg}
              </div>
            )}

            {/* Action Bar */}
            <div className="preview-actions-bar">
              <div className="format-selector-box">
                <label className="format-label">FORMAT:</label>
                <div className="toggle-pill-group">
                  {['png', 'jpg'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className={`pill-btn small ${exportFormat === fmt ? 'active' : ''}`}
                      onClick={() => setExportFormat(fmt)}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="preview-action-buttons">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => handleSavePhoto(activePreviewPhoto)}
                >
                  💾 SAVE PHOTO
                </button>

                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => handleCopyToClipboard(activePreviewPhoto)}
                >
                  📋 COPY IMAGE
                </button>

                {lastSavedPath && window.snappix?.showInFolder && (
                  <button
                    type="button"
                    className="action-btn tertiary"
                    onClick={handleShowInFolder}
                  >
                    📁 SHOW IN FOLDER
                  </button>
                )}

                <button
                  type="button"
                  className="action-btn ghost"
                  onClick={() => setActivePreviewPhoto(null)}
                >
                  RETAKE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

