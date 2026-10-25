import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import filtersData from './data/filters.json';
import { getCssFilterString } from './utils/filterUtils';
import {
  playShutterSound,
  playCountdownBeep,
  captureFrame,
  savePhotoFile,
  quickSavePhotoFile,
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

  // Gallery state with localStorage persistence
  const [capturedPhotos, setCapturedPhotos] = useState(() => {
    try {
      const saved = localStorage.getItem('snappix_gallery');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activePreviewPhoto, setActivePreviewPhoto] = useState(null);
  const [exportFormat, setExportFormat] = useState('png'); // 'png' or 'jpg'
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [lastSavedPath, setLastSavedPath] = useState(null);
  const [galleryFilter, setGalleryFilter] = useState('ALL');

  // Sync gallery to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('snappix_gallery', JSON.stringify(capturedPhotos));
    } catch (err) {
      console.warn('LocalStorage quota or write error:', err);
    }
  }, [capturedPhotos]);


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

  // Quick Save directly to ~/Pictures/Snappix/ without dialog
  const handleQuickSave = async (photo = activePreviewPhoto) => {
    if (!photo) return;
    const cleanFilterName = photo.filterName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `snappix-${cleanFilterName}-${Date.now()}.${exportFormat}`;

    setFeedbackMsg('Saving to ~/Pictures/Snappix...');
    const result = await quickSavePhotoFile(photo.dataUrl, exportFormat, filename);

    if (result.success) {
      setLastSavedPath(result.filePath || null);
      setFeedbackMsg(`✓ Quick-saved to ~/Pictures/Snappix/!`);
      setTimeout(() => setFeedbackMsg(null), 4000);
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

  // Reveal saved file in macOS Finder / OS File Explorer
  const handleShowInFolder = () => {
    if (lastSavedPath && (window.snappix?.openInFinder || window.snappix?.showInFolder)) {
      const openFn = window.snappix.openInFinder || window.snappix.showInFolder;
      openFn(lastSavedPath);
    }
  };


  // Delete photo from captures
  const handleDeletePhoto = (id) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== id));
    if (activePreviewPhoto?.id === id) {
      setActivePreviewPhoto(null);
    }
  };

  // Extract unique filter names present in captured photos
  const galleryFilterCategories = useMemo(() => {
    const filtersUsed = ['ALL', ...new Set(capturedPhotos.map((p) => p.filterName))];
    return filtersUsed;
  }, [capturedPhotos]);

  // Photos filtered for gallery display
  const displayedGalleryPhotos = useMemo(() => {
    if (galleryFilter === 'ALL') return capturedPhotos;
    return capturedPhotos.filter((p) => p.filterName === galleryFilter);
  }, [capturedPhotos, galleryFilter]);

  // Active photo index in current array
  const activeIndex = useMemo(() => {
    return capturedPhotos.findIndex((p) => p.id === activePreviewPhoto?.id);
  }, [capturedPhotos, activePreviewPhoto]);

  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < capturedPhotos.length - 1;

  // Carousel handlers
  const handlePrevPhoto = useCallback(() => {
    if (hasPrev) {
      setActivePreviewPhoto(capturedPhotos[activeIndex - 1]);
      setFeedbackMsg(null);
      setLastSavedPath(null);
    }
  }, [hasPrev, activeIndex, capturedPhotos]);

  const handleNextPhoto = useCallback(() => {
    if (hasNext) {
      setActivePreviewPhoto(capturedPhotos[activeIndex + 1]);
      setFeedbackMsg(null);
      setLastSavedPath(null);
    }
  }, [hasNext, activeIndex, capturedPhotos]);

  // Batch Export All photos in current view
  const handleExportAll = async () => {
    if (displayedGalleryPhotos.length === 0) return;
    setFeedbackMsg(`Exporting ${displayedGalleryPhotos.length} photos...`);
    for (let i = 0; i < displayedGalleryPhotos.length; i++) {
      const photo = displayedGalleryPhotos[i];
      const cleanName = photo.filterName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const filename = `snappix-batch-${i + 1}-${cleanName}.${exportFormat}`;
      await savePhotoFile(photo.dataUrl, exportFormat, filename);
    }
    setFeedbackMsg(`✓ Exported ${displayedGalleryPhotos.length} photos!`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Filter switching via keyboard (Left / Right arrows)
  const handleNextFilter = useCallback(() => {
    if (!filteredList || filteredList.length === 0) return;
    const currentIndex = filteredList.findIndex((f) => f.id === selectedFilter.id);
    const nextIndex = currentIndex < filteredList.length - 1 ? currentIndex + 1 : 0;
    handleSelectFilter(filteredList[nextIndex]);
  }, [filteredList, selectedFilter]);

  const handlePrevFilter = useCallback(() => {
    if (!filteredList || filteredList.length === 0) return;
    const currentIndex = filteredList.findIndex((f) => f.id === selectedFilter.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredList.length - 1;
    handleSelectFilter(filteredList[prevIndex]);
  }, [filteredList, selectedFilter]);

  // Smooth scroll selected filter into view
  useEffect(() => {
    const el = document.querySelector(`.filter-card-item[data-filter-id="${selectedFilter.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedFilter.id]);

  // Keyboard shortcuts:
  // - Space / Enter: Snap photo
  // - Cmd/Ctrl + S: Save photo
  // - ArrowLeft / ArrowRight: Switch filters (in camera) or carousel (in modal)
  // - Escape: Close preview modal / cancel countdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      // Cmd/Ctrl + S to Save
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (activePreviewPhoto) {
          handleSavePhoto(activePreviewPhoto);
        } else if (capturedPhotos.length > 0) {
          handleSavePhoto(capturedPhotos[0]);
        }
        return;
      }

      // Spacebar or Enter to Snap Photo
      if (e.code === 'Space' || e.key === 'Enter') {
        if (!activePreviewPhoto) {
          e.preventDefault();
          if (isStreaming) {
            handleTriggerShutter();
          }
        }
        return;
      }

      // Escape to dismiss modal or countdown
      if (e.key === 'Escape') {
        if (activePreviewPhoto) {
          setActivePreviewPhoto(null);
        }
        if (countdownRemaining !== null) {
          cancelCountdown();
        }
        return;
      }

      // Left / Right arrow keys
      if (e.key === 'ArrowLeft') {
        if (activePreviewPhoto) {
          handlePrevPhoto();
        } else if (isStreaming && activeNav !== 'GALLERY') {
          e.preventDefault();
          handlePrevFilter();
        }
      } else if (e.key === 'ArrowRight') {
        if (activePreviewPhoto) {
          handleNextPhoto();
        } else if (isStreaming && activeNav !== 'GALLERY') {
          e.preventDefault();
          handleNextFilter();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activePreviewPhoto,
    isStreaming,
    activeNav,
    countdownRemaining,
    capturedPhotos,
    handleTriggerShutter,
    cancelCountdown,
    handleSavePhoto,
    handlePrevPhoto,
    handleNextPhoto,
    handlePrevFilter,
    handleNextFilter
  ]);



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
              <div>
                <h2 className="gallery-title">YOUR CAPTURES ({capturedPhotos.length})</h2>
                <p className="gallery-subtitle">Review, inspect, re-export, or download past snaps</p>
              </div>

              <div className="gallery-header-actions">
                {capturedPhotos.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="action-btn primary small"
                      onClick={handleExportAll}
                      title="Save all photos to disk"
                    >
                      💾 EXPORT ALL ({displayedGalleryPhotos.length})
                    </button>
                    <button
                      type="button"
                      className="action-btn secondary small"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to clear your entire gallery?')) {
                          setCapturedPhotos([]);
                        }
                      }}
                    >
                      CLEAR ALL
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="action-btn secondary small"
                  onClick={() => setActiveNav('CAMERA')}
                >
                  ← BACK TO CAMERA
                </button>
              </div>
            </div>

            {/* Filter by applied filter preset */}
            {galleryFilterCategories.length > 2 && (
              <div className="gallery-filter-bar">
                <span className="gallery-filter-label">FILTER BY STYLE:</span>
                <div className="category-tabs inline">
                  {galleryFilterCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-pill ${galleryFilter === cat ? 'active' : ''}`}
                      onClick={() => setGalleryFilter(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {capturedPhotos.length === 0 ? (
              <div className="gallery-empty-state">
                <span className="empty-state-icon">📸</span>
                <p className="empty-state-text">NO PHOTOS IN YOUR GALLERY YET!</p>
                <p className="empty-state-desc">Head over to the camera to apply aesthetic filters and capture snaps.</p>
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => setActiveNav('CAMERA')}
                >
                  START CAMERA & SNAP
                </button>
              </div>
            ) : displayedGalleryPhotos.length === 0 ? (
              <div className="gallery-empty-state">
                <p className="empty-state-text">No photos found for "{galleryFilter}"</p>
                <button
                  type="button"
                  className="action-btn secondary small"
                  onClick={() => setGalleryFilter('ALL')}
                >
                  SHOW ALL STYLES
                </button>
              </div>
            ) : (
              <div className="gallery-grid">
                {displayedGalleryPhotos.map((photo, idx) => (
                  <div key={photo.id || idx} className="gallery-card">
                    <div
                      className="gallery-card-thumb-wrap"
                      onClick={() => setActivePreviewPhoto(photo)}
                    >
                      <img src={photo.dataUrl} alt={`Snap ${photo.timestamp}`} className="gallery-card-img" />
                      <div className="gallery-thumb-overlay">
                        <span>🔍 INSPECT</span>
                      </div>
                      <span className="gallery-ratio-badge">{photo.aspectRatio || 'FULL'}</span>
                    </div>

                    <div className="gallery-card-footer">
                      <div className="gallery-card-meta">
                        <strong className="photo-filter-tag">{photo.filterName}</strong>
                        <span className="photo-time-tag">{photo.date} • {photo.timestamp}</span>
                      </div>
                      <div className="gallery-card-actions">
                        <button
                          type="button"
                          className="card-mini-btn"
                          title="Save photo locally"
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
                title="Capture Photo (Spacebar or Enter)"
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

              {/* Keyboard shortcuts legend */}
              <div className="shortcuts-legend">
                <span className="shortcut-tag"><kbd>SPACE</kbd> / <kbd>ENTER</kbd> Snap</span>
                <span className="shortcut-tag"><kbd>◀</kbd> <kbd>▶</kbd> Switch Filter</span>
                <span className="shortcut-tag"><kbd>⌘/Ctrl</kbd>+<kbd>S</kbd> Save</span>
              </div>
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
                      data-filter-id={filter.id}
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

      {/* CAPTURED PHOTO PREVIEW MODAL & INSPECTOR */}
      {activePreviewPhoto && (
        <div className="preview-modal-backdrop" onClick={() => setActivePreviewPhoto(null)}>
          <div className="preview-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-meta">
                <div className="preview-title-row">
                  <h3 className="preview-headline">PHOTO INSPECTOR</h3>
                  {capturedPhotos.length > 1 && (
                    <span className="carousel-index-tag">
                      {activeIndex >= 0 ? `${activeIndex + 1} / ${capturedPhotos.length}` : ''}
                    </span>
                  )}
                </div>
                <span className="preview-sub">
                  {activePreviewPhoto.filterName} • {activePreviewPhoto.date || ''} {activePreviewPhoto.timestamp} • RATIO: {activePreviewPhoto.aspectRatio || 'FULL'}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActivePreviewPhoto(null)}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Main Stage with Carousel Nav */}
            <div className="preview-stage-wrap">
              {hasPrev && (
                <button
                  type="button"
                  className="stage-nav-btn prev"
                  onClick={handlePrevPhoto}
                  title="Previous Photo (Left Arrow)"
                >
                  ◀
                </button>
              )}

              <div className="preview-image-container">
                <img
                  src={activePreviewPhoto.dataUrl}
                  alt="Captured Snapshot"
                  className="preview-image"
                />
              </div>

              {hasNext && (
                <button
                  type="button"
                  className="stage-nav-btn next"
                  onClick={handleNextPhoto}
                  title="Next Photo (Right Arrow)"
                >
                  ▶
                </button>
              )}
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
                <span className="format-label">RE-EXPORT FORMAT:</span>
                <div className="toggle-pill-group">
                  {['png', 'jpg', 'webp'].map((fmt) => (
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
                <span className="carousel-nav-hint">⌨ Press ◀ / ▶ arrows to flip</span>
              </div>

              <div className="preview-action-buttons">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => handleQuickSave(activePreviewPhoto)}
                  title="Instantly save to ~/Pictures/Snappix/"
                >
                  ⚡ QUICK SAVE
                </button>

                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => handleSavePhoto(activePreviewPhoto)}
                  title="Choose custom folder and file name"
                >
                  💾 SAVE AS...
                </button>


                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => handleCopyToClipboard(activePreviewPhoto)}
                >
                  📋 COPY IMAGE
                </button>

                {lastSavedPath && (window.snappix?.openInFinder || window.snappix?.showInFolder) && (
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
                  className="action-btn danger-outline"
                  onClick={() => {
                    const toDeleteId = activePreviewPhoto.id;
                    const next = hasNext ? capturedPhotos[activeIndex + 1] : hasPrev ? capturedPhotos[activeIndex - 1] : null;
                    handleDeletePhoto(toDeleteId);
                    setActivePreviewPhoto(next);
                  }}
                >
                  ✕ DELETE
                </button>

                <button
                  type="button"
                  className="action-btn ghost"
                  onClick={() => setActivePreviewPhoto(null)}
                >
                  CLOSE
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


