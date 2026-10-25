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
import {
  generatePhotoBoothCanvas,
  BOOTH_THEMES,
  BOOTH_STICKERS
} from './utils/boothUtils';
import {
  createVoiceShutter,
  MotionGestureDetector
} from './utils/gestureVoiceUtils';
import {
  MotionCatchGame,
  SNAPCHAT_AR_PRESETS,
  renderSnapchatOverlay
} from './utils/gameFilterUtils';
import {
  VideoRecorderManager,
  saveVideoBlob
} from './utils/videoRecorderUtils';

import './App.css';

function App() {
  const [activeNav, setActiveNav] = useState('CAMERA');
  const [isStreaming, setIsStreaming] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraError, setCameraError] = useState(null);

  // Shoot Mode: 'PHOTO' | 'BOOTH' | 'GAME' | 'VIDEO'
  const [shootMode, setShootMode] = useState('PHOTO');

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

  // Hands-Free Trigger States (Voice & Wave)
  const [isVoiceShutterEnabled, setIsVoiceShutterEnabled] = useState(false);
  const [isWaveShutterEnabled, setIsWaveShutterEnabled] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [handsFreeHint, setHandsFreeHint] = useState(null);

  // Snapchat-style AR Filter Overlays
  const [activeAROverlay, setActiveAROverlay] = useState('none');

  // Unified Effects Drawer State
  const [activeEffectsTab, setActiveEffectsTab] = useState('FILTERS'); // 'FILTERS' | 'AR'
  const [isEffectsDrawerExpanded, setIsEffectsDrawerExpanded] = useState(true);

  // Photo Booth Strip & Collage State
  const [boothCurrentShotNum, setBoothCurrentShotNum] = useState(null); // 1, 2, 3, 4
  const [boothShots, setBoothShots] = useState([]);
  const [boothLayout, setBoothLayout] = useState('4x1'); // '4x1' or '2x2'
  const [boothThemeId, setBoothThemeId] = useState('cream');
  const [boothSticker, setBoothSticker] = useState(BOOTH_STICKERS[0]);
  const [boothShowDate, setBoothShowDate] = useState(true);
  const [activeBoothCollage, setActiveBoothCollage] = useState(null);
  const [isBoothStudioOpen, setIsBoothStudioOpen] = useState(false);

  // Motion Game State
  const [isGameActive, setIsGameActive] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [gameCombo, setGameCombo] = useState(1);
  const [gameOverScore, setGameOverScore] = useState(null);

  // Video Recording State
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedVideo, setRecordedVideo] = useState(null);

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
  const overlayCanvasRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const gameInstanceRef = useRef(null);
  const motionDetectorRef = useRef(null);
  const videoRecorderRef = useRef(new VideoRecorderManager());

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

  // Start live webcam stream (with audio support for video recording)
  const startCamera = async (deviceId = selectedDeviceId) => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true
        });
      } catch (audioErr) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        });
      }

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

  // Perform the actual snap (includes AR overlays if active)
  const executeCapture = useCallback(() => {
    if (!videoRef.current || !isStreaming) return;

    try {
      // 1. Shutter sound
      playShutterSound();

      // 2. White flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 220);

      // 3. Render frame to canvas with active filter, mirroring, and AR overlay
      const dataUrl = captureFrame({
        videoElement: videoRef.current,
        filterCss: activeCssFilter,
        isMirrored,
        aspectRatio,
        overlayCanvas: overlayCanvasRef.current
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

  // 4-Shot Korean Photo Booth Sequence (Life4Cuts Style)
  const runPhotoBoothSequence = useCallback(async () => {
    if (!isStreaming || !videoRef.current) return;
    setBoothCurrentShotNum(1);
    const captured = [];

    for (let shot = 1; shot <= 4; shot++) {
      setBoothCurrentShotNum(shot);

      // 3-second countdown with beeps
      for (let sec = 3; sec >= 1; sec--) {
        setCountdownRemaining(sec);
        playCountdownBeep(650, 0.08);
        await new Promise((r) => setTimeout(r, 1000));
      }

      setCountdownRemaining(null);
      playCountdownBeep(1100, 0.12);

      // Snap frame
      playShutterSound();
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 220);

      const shotDataUrl = captureFrame({
        videoElement: videoRef.current,
        filterCss: activeCssFilter,
        isMirrored,
        aspectRatio: '4:3',
        overlayCanvas: overlayCanvasRef.current
      });

      captured.push(shotDataUrl);

      // Brief pose pause between shots
      if (shot < 4) {
        setHandsFreeHint(`Shot ${shot} of 4 captured! Strike your next pose! 📸`);
        await new Promise((r) => setTimeout(r, 1200));
        setHandsFreeHint(null);
      }
    }

    setBoothCurrentShotNum(null);
    setBoothShots(captured);

    // Compile into photo booth collage
    try {
      const collageUrl = await generatePhotoBoothCanvas({
        photos: captured,
        layout: boothLayout,
        themeId: boothThemeId,
        stickerText: boothSticker,
        showDate: boothShowDate
      });
      setActiveBoothCollage(collageUrl);
      setIsBoothStudioOpen(true);

      // Add to gallery
      const boothSnap = {
        id: `booth-${Date.now()}`,
        dataUrl: collageUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: new Date().toLocaleDateString(),
        filterName: `Photobooth (${boothLayout})`,
        aspectRatio: boothLayout === '4x1' ? '1:3' : '1:1'
      };
      setCapturedPhotos((prev) => [boothSnap, ...prev]);
    } catch (err) {
      console.error('Collage generation error:', err);
    }
  }, [isStreaming, activeCssFilter, isMirrored, boothLayout, boothThemeId, boothSticker, boothShowDate]);

  // Video Recording Controls
  const handleToggleVideoRecording = async () => {
    if (isRecordingVideo) {
      const res = await videoRecorderRef.current.stop();
      setIsRecordingVideo(false);
      if (res) {
        setRecordedVideo(res);
      }
    } else {
      if (!streamRef.current) {
        await startCamera();
      }
      setIsRecordingVideo(true);
      setRecordDuration(0);
      videoRecorderRef.current.start({
        stream: streamRef.current,
        overlayCanvas: overlayCanvasRef.current,
        onTick: (elapsed) => setRecordDuration(elapsed)
      });
    }
  };

  // Motion Game Controls
  const handleStartGame = () => {
    if (!overlayCanvasRef.current) return;
    setIsGameActive(true);
    setGameOverScore(null);
    setGameScore(0);
    setGameCombo(1);

    if (!gameInstanceRef.current) {
      gameInstanceRef.current = new MotionCatchGame({
        canvas: overlayCanvasRef.current,
        onScoreUpdate: (score, combo) => {
          setGameScore(score);
          setGameCombo(combo);
        },
        onGameOver: (finalScore) => {
          setIsGameActive(false);
          setGameOverScore(finalScore);
        }
      });
    }
    gameInstanceRef.current.start();
  };

  const handleStopGame = () => {
    setIsGameActive(false);
    gameInstanceRef.current?.stop();
  };

  // Cancel countdown
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownRemaining(null);
    setBoothCurrentShotNum(null);
  }, []);

  // Trigger shutter button or shortcut
  const handleTriggerShutter = useCallback(() => {
    if (!isStreaming) {
      startCamera();
      return;
    }

    if (shootMode === 'BOOTH') {
      runPhotoBoothSequence();
      return;
    }

    if (shootMode === 'VIDEO') {
      handleToggleVideoRecording();
      return;
    }

    if (shootMode === 'GAME') {
      if (!isGameActive) {
        handleStartGame();
      } else {
        handleStopGame();
      }
      return;
    }

    // Single photo mode
    if (countdownRemaining !== null) {
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
  }, [
    isStreaming,
    shootMode,
    isGameActive,
    runPhotoBoothSequence,
    countdownRemaining,
    selectedTimer,
    executeCapture,
    cancelCountdown
  ]);


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

  // Photo Booth Strip actions
  const handleSaveBoothStrip = async () => {
    if (!activeBoothCollage) return;
    const filename = `snappix-photobooth-${boothLayout}-${Date.now()}.png`;
    setFeedbackMsg('Saving Photo Booth Strip...');
    const result = await savePhotoFile(activeBoothCollage, 'png', filename);
    if (result.success) {
      setLastSavedPath(result.filePath || null);
      setFeedbackMsg('✓ Photo Booth Strip saved!');
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else if (!result.canceled) {
      setFeedbackMsg(`Failed to save: ${result.error || 'Unknown error'}`);
    }
  };

  const handleQuickSaveBoothStrip = async () => {
    if (!activeBoothCollage) return;
    const filename = `snappix-photobooth-${boothLayout}-${Date.now()}.png`;
    setFeedbackMsg('Quick-saving strip to ~/Pictures/Snappix...');
    const result = await quickSavePhotoFile(activeBoothCollage, 'png', filename);
    if (result.success) {
      setLastSavedPath(result.filePath || null);
      setFeedbackMsg('✓ Quick-saved strip to ~/Pictures/Snappix/!');
      setTimeout(() => setFeedbackMsg(null), 4000);
    } else {
      setFeedbackMsg(`Failed to quick-save: ${result.error || 'Unknown error'}`);
    }
  };

  const handleCopyBoothStrip = async () => {
    if (!activeBoothCollage) return;
    const result = await copyImageToClipboard(activeBoothCollage);
    if (result.success) {
      setFeedbackMsg('✓ Copied strip to clipboard!');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } else {
      setFeedbackMsg('Could not copy strip to clipboard.');
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

  // Voice Shutter effect
  useEffect(() => {
    if (!isVoiceShutterEnabled || !isStreaming) return;
    const voice = createVoiceShutter({
      onTrigger: (word) => {
        setHandsFreeHint(`🎤 Heard "${word}"! Capturing...`);
        setTimeout(() => setHandsFreeHint(null), 2500);
        handleTriggerShutter();
      },
      onListeningChange: (listening) => setIsVoiceListening(listening)
    });
    voice.start();
    return () => voice.stop();
  }, [isVoiceShutterEnabled, isStreaming, handleTriggerShutter]);

  // Wave Motion Shutter effect
  useEffect(() => {
    if (!isWaveShutterEnabled || !isStreaming) return;
    motionDetectorRef.current = new MotionGestureDetector({
      onMotionTrigger: () => {
        setHandsFreeHint(`👋 Wave Detected! Snapping in 3s...`);
        setTimeout(() => setHandsFreeHint(null), 2500);
        handleTriggerShutter();
      }
    });
    return () => {
      motionDetectorRef.current?.reset();
    };
  }, [isWaveShutterEnabled, isStreaming, handleTriggerShutter]);

  // Real-time AR overlay & Motion Game Render Loop
  useEffect(() => {
    let animId;
    const renderLoop = (time) => {
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Render Motion Game
        if (shootMode === 'GAME' && isGameActive && gameInstanceRef.current) {
          gameInstanceRef.current.updatePlayerTracking(videoRef.current);
          gameInstanceRef.current.render();
        }

        // Render Snapchat-style AR overlay
        if (activeAROverlay !== 'none') {
          renderSnapchatOverlay(ctx, activeAROverlay, w, h, time);
        }

        // Process wave detector
        if (isWaveShutterEnabled && motionDetectorRef.current && videoRef.current) {
          motionDetectorRef.current.processVideoFrame(videoRef.current);
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [shootMode, isGameActive, activeAROverlay, isWaveShutterEnabled]);

  // Live update of Photo Booth Studio preview when customization changes
  useEffect(() => {
    if (isBoothStudioOpen && boothShots.length === 4) {
      generatePhotoBoothCanvas({
        photos: boothShots,
        layout: boothLayout,
        themeId: boothThemeId,
        stickerText: boothSticker,
        showDate: boothShowDate
      })
        .then((collageUrl) => {
          setActiveBoothCollage(collageUrl);
        })
        .catch((e) => console.error(e));
    }
  }, [isBoothStudioOpen, boothShots, boothLayout, boothThemeId, boothSticker, boothShowDate]);


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
      {/* Streamlined Studio Header & Nav */}
      <header className="top-header-bar">
        <div className="brand-badge-box">
          <span className="brand-icon">📸</span>
          <span className="brand-name">SNAPPIX</span>
          <span className="brand-sub">STUDIO</span>
        </div>

        <nav className="nav-pills-center">
          <button
            type="button"
            className={`header-nav-pill ${activeNav === 'CAMERA' && shootMode !== 'BOOTH' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('CAMERA');
              if (shootMode === 'BOOTH') setShootMode('PHOTO');
            }}
          >
            📸 CAMERA
          </button>

          <button
            type="button"
            className={`header-nav-pill ${activeNav === 'CAMERA' && shootMode === 'BOOTH' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('CAMERA');
              setShootMode('BOOTH');
            }}
          >
            🎞️ PHOTO BOOTH
          </button>

          <button
            type="button"
            className={`header-nav-pill ${activeNav === 'GALLERY' ? 'active' : ''}`}
            onClick={() => setActiveNav('GALLERY')}
          >
            🖼️ GALLERY
            {capturedPhotos.length > 0 && (
              <span className="gallery-counter">{capturedPhotos.length}</span>
            )}
          </button>
        </nav>

        {/* Quick Camera Device Switcher */}
        <div className="header-cam-tools">
          {devices.length > 1 && (
            <select
              className="header-device-select"
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              title="Select Camera Device"
            >
              {devices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  📷 {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`cam-power-btn ${isStreaming ? 'on' : 'off'}`}
            onClick={isStreaming ? stopCamera : () => startCamera()}
            title={isStreaming ? "Pause Camera Stream" : "Start Camera Stream"}
          >
            <span className="power-indicator-dot" />
            {isStreaming ? 'PAUSE' : 'START'}
          </button>
        </div>
      </header>

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
          /* CLEAN UNIFIED CAMERA STUDIO CONSOLE */
          <div className="studio-console-layout">
            {/* Viewfinder Card with Built-in Top HUD & Bottom Modes */}
            <div className={`viewfinder-stage-card aspect-${aspectRatio}`}>
              {/* Floating Top Quick HUD Bar */}
              <div className="viewfinder-hud-bar">
                {/* Ratio Selector */}
                <div className="hud-pill-group">
                  <span className="hud-label">RATIO</span>
                  {['native', '1:1', '4:3', '16:9'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`hud-pill-btn ${aspectRatio === r ? 'active' : ''}`}
                      onClick={() => setAspectRatio(r)}
                    >
                      {r === 'native' ? 'FULL' : r}
                    </button>
                  ))}
                </div>

                {/* Timer Selector */}
                <div className="hud-pill-group">
                  <span className="hud-label">TIMER</span>
                  {[0, 3, 5, 10].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className={`hud-pill-btn ${selectedTimer === sec ? 'active' : ''}`}
                      onClick={() => setSelectedTimer(sec)}
                    >
                      {sec === 0 ? 'OFF' : `${sec}s`}
                    </button>
                  ))}
                </div>

                {/* Selfie Mirror */}
                <button
                  type="button"
                  className={`hud-action-btn ${isMirrored ? 'active' : ''}`}
                  onClick={() => setIsMirrored(!isMirrored)}
                  title="Toggle selfie mirror flip"
                >
                  🪞 MIRROR
                </button>

                {/* Voice Shutter */}
                <button
                  type="button"
                  className={`hud-action-btn ${isVoiceShutterEnabled ? 'active' : ''}`}
                  onClick={() => setIsVoiceShutterEnabled(!isVoiceShutterEnabled)}
                  title="Say 'Cheese', 'Snap', or 'Smile' to capture"
                >
                  🎤 VOICE {isVoiceShutterEnabled ? (isVoiceListening ? '●' : 'ON') : 'OFF'}
                </button>

                {/* Wave Shutter */}
                <button
                  type="button"
                  className={`hud-action-btn ${isWaveShutterEnabled ? 'active' : ''}`}
                  onClick={() => setIsWaveShutterEnabled(!isWaveShutterEnabled)}
                  title="Wave hand to trigger countdown snap"
                >
                  👋 WAVE {isWaveShutterEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Viewfinder Frame */}
              <div className="camera-frame">
                <video
                  ref={videoRef}
                  className={`camera-video ${isStreaming ? 'visible' : 'hidden'} ${isMirrored ? 'mirrored' : ''}`}
                  style={{ filter: activeCssFilter }}
                  autoPlay
                  playsInline
                  muted
                />

                {/* Real-time AR / Motion Game Overlay Canvas */}
                <canvas
                  ref={overlayCanvasRef}
                  width={640}
                  height={480}
                  className="camera-overlay-canvas"
                />

                {/* Shutter Screen Flash Overlay */}
                <div className={`shutter-flash-overlay ${isFlashing ? 'active' : ''}`} />

                {/* Booth Shot Progress Indicator */}
                {boothCurrentShotNum && (
                  <div className="booth-shot-indicator">
                    SHOT {boothCurrentShotNum} OF 4
                  </div>
                )}

                {/* Video Recording Live Badge */}
                {isRecordingVideo && (
                  <div className="video-rec-live-badge">
                    <span className="rec-dot" />
                    <span>REC {String(Math.floor(recordDuration / 60)).padStart(2, '0')}:{String(recordDuration % 60).padStart(2, '0')}</span>
                  </div>
                )}

                {/* Hands-Free Voice / Wave Toast */}
                {handsFreeHint && (
                  <div className="handsfree-toast-bubble">
                    {handsFreeHint}
                  </div>
                )}

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
                    <button
                      type="button"
                      className="action-btn primary small"
                      onClick={() => startCamera()}
                    >
                      START CAMERA
                    </button>
                  </div>
                )}
              </div>

              {/* Integrated Mode Bar (Attached to bottom of viewfinder card) */}
              <div className="viewfinder-mode-bar">
                {[
                  { id: 'PHOTO', label: '📸 PHOTO' },
                  { id: 'BOOTH', label: '🎞️ 4-CUT BOOTH' },
                  { id: 'GAME', label: '🎮 STAR CATCHER' },
                  { id: 'VIDEO', label: '📹 VIDEO' }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`mode-tab-item ${shootMode === mode.id ? 'active' : ''}`}
                    onClick={() => {
                      setShootMode(mode.id);
                      if (mode.id !== 'GAME') handleStopGame();
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Core Action Trio Deck: [ Filters Toggle ] [ SHUTTER ] [ Recent Thumb / Gallery ] */}
            <div className="action-trio-deck">
              {/* Left: Quick Active Filter Button / Drawer Toggle */}
              <div className="trio-side-slot left">
                <button
                  type="button"
                  className={`trio-filter-btn ${isEffectsDrawerExpanded ? 'open' : ''}`}
                  onClick={() => setIsEffectsDrawerExpanded(!isEffectsDrawerExpanded)}
                  title="Toggle Effects Drawer"
                >
                  <div
                    className="trio-filter-swatch"
                    style={{ filter: activeCssFilter }}
                  />
                  <div className="trio-filter-text">
                    <span className="trio-filter-title">{selectedFilter.name}</span>
                    <span className="trio-filter-subtitle">
                      {activeAROverlay !== 'none' ? `AR: ${activeAROverlay.toUpperCase()}` : `${filterIntensity}% STRENGTH`}
                    </span>
                  </div>
                  <span className="trio-chevron">{isEffectsDrawerExpanded ? '▼' : '▲'}</span>
                </button>
              </div>

              {/* Center: Iconic Shutter Button */}
              <div className="trio-center-slot">
                <button
                  type="button"
                  className={`master-shutter-btn ${shootMode.toLowerCase()} ${countdownRemaining !== null ? 'counting' : ''} ${isRecordingVideo ? 'recording' : ''}`}
                  onClick={handleTriggerShutter}
                  title="Trigger Action (Spacebar / Enter)"
                >
                  <div className="shutter-disc-inner">
                    <span className="shutter-disc-icon">
                      {shootMode === 'BOOTH' ? '🎞️' : shootMode === 'VIDEO' ? (isRecordingVideo ? '⏹' : '🔴') : shootMode === 'GAME' ? (isGameActive ? '🛑' : '▶') : '📸'}
                    </span>
                    <span className="shutter-disc-label">
                      {countdownRemaining !== null
                        ? `IN ${countdownRemaining}s`
                        : shootMode === 'BOOTH'
                        ? (boothCurrentShotNum ? `SHOT ${boothCurrentShotNum}/4` : 'START BOOTH')
                        : shootMode === 'VIDEO'
                        ? (isRecordingVideo ? `STOP [${recordDuration}s]` : 'RECORD')
                        : shootMode === 'GAME'
                        ? (isGameActive ? 'STOP GAME' : 'PLAY GAME')
                        : 'SNAP'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Right: Last Snap Thumbnail / Gallery Link */}
              <div className="trio-side-slot right">
                {capturedPhotos.length > 0 ? (
                  <button
                    type="button"
                    className="trio-gallery-thumb-btn"
                    onClick={() => setActivePreviewPhoto(capturedPhotos[0])}
                    title="Inspect latest photo"
                  >
                    <img
                      src={capturedPhotos[0].dataUrl}
                      alt="Last Snapshot"
                      className="trio-thumb-preview"
                    />
                    <span className="trio-counter-badge">{capturedPhotos.length}</span>
                    <span className="trio-thumb-sub">GALLERY</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="trio-gallery-thumb-btn empty"
                    onClick={() => setActiveNav('GALLERY')}
                  >
                    <span className="trio-empty-icon">🖼️</span>
                    <span className="trio-thumb-sub">0 SNAPS</span>
                  </button>
                )}
              </div>
            </div>

            {/* Streamlined Effects Console Drawer */}
            {isEffectsDrawerExpanded && (
              <div className="effects-console-card">
                {/* Console Navigation Header */}
                <div className="effects-console-header">
                  <div className="console-tab-group">
                    <button
                      type="button"
                      className={`console-tab-btn ${activeEffectsTab === 'FILTERS' ? 'active' : ''}`}
                      onClick={() => setActiveEffectsTab('FILTERS')}
                    >
                      ✨ AESTHETIC FILTERS ({filteredList.length})
                    </button>
                    <button
                      type="button"
                      className={`console-tab-btn ${activeEffectsTab === 'AR' ? 'active' : ''}`}
                      onClick={() => setActiveEffectsTab('AR')}
                    >
                      🎭 SNAPCHAT AR ({SNAPCHAT_AR_PRESETS.length})
                    </button>
                  </div>

                  {/* Filter Intensity Slider */}
                  {activeEffectsTab === 'FILTERS' && selectedFilter.id !== 'natural' && (
                    <div className="console-intensity-box">
                      <span className="console-intensity-label">STRENGTH: {filterIntensity}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={filterIntensity}
                        onChange={(e) => setFilterIntensity(Number(e.target.value))}
                        className="karl-slider compact"
                      />
                    </div>
                  )}
                </div>

                {/* Tab 1: Filters */}
                {activeEffectsTab === 'FILTERS' ? (
                  <div className="console-filters-body">
                    {/* Category Filter Pills */}
                    <div className="console-category-strip">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`console-cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                          onClick={() => setSelectedCategory(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Horizontal Swatch Scroll Tray */}
                    <div className="console-swatch-carousel">
                      {filteredList.map((filter) => {
                        const isSelected = selectedFilter.id === filter.id;
                        const sampleCss = getCssFilterString(filter, 85);
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            className={`console-swatch-card ${isSelected ? 'active' : ''}`}
                            onClick={() => handleSelectFilter(filter)}
                            title={filter.description}
                          >
                            <div className="swatch-card-circle">
                              <div
                                className="swatch-card-color"
                                style={{ filter: sampleCss }}
                              />
                            </div>
                            <span className="swatch-card-title">{filter.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Tab 2: Snapchat AR Overlays */
                  <div className="console-ar-body">
                    <div className="console-ar-grid">
                      {SNAPCHAT_AR_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`console-ar-card ${activeAROverlay === preset.id ? 'active' : ''}`}
                          onClick={() => setActiveAROverlay(preset.id)}
                        >
                          <span className="ar-card-emoji">{preset.icon}</span>
                          <div className="ar-card-texts">
                            <strong className="ar-card-name">{preset.name}</strong>
                            <span className="ar-card-desc">{preset.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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

      {/* PHOTO BOOTH STUDIO MODAL */}
      {isBoothStudioOpen && activeBoothCollage && (
        <div className="preview-modal-backdrop" onClick={() => setIsBoothStudioOpen(false)}>
          <div className="preview-modal-card booth-studio-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-meta">
                <div className="preview-title-row">
                  <h3 className="preview-headline">🎞️ PHOTO BOOTH STUDIO</h3>
                  <span className="carousel-index-tag">LIFE4CUTS / RETRO</span>
                </div>
                <span className="preview-sub">
                  Customize your 4-cut filmstrip borders, retro stickers, and date stamps.
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsBoothStudioOpen(false)}
                title="Close Studio (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="booth-studio-body">
              {/* Left Side: Live Strip Canvas Preview */}
              <div className="booth-stage-wrap">
                <div className="booth-preview-scroller">
                  <img
                    src={activeBoothCollage}
                    alt="Custom Photo Booth Strip"
                    className="booth-preview-strip-img"
                  />
                </div>
              </div>

              {/* Right Side: Studio Customization Panel */}
              <div className="booth-studio-sidebar">
                {/* 1. Layout Selection */}
                <div className="booth-config-section">
                  <span className="booth-config-label">LAYOUT FORMAT</span>
                  <div className="booth-layout-pill-row">
                    <button
                      type="button"
                      className={`booth-layout-pill ${boothLayout === '4x1' ? 'active' : ''}`}
                      onClick={() => setBoothLayout('4x1')}
                    >
                      <span className="pill-icon">▯</span> 4x1 VERTICAL STRIP
                    </button>
                    <button
                      type="button"
                      className={`booth-layout-pill ${boothLayout === '2x2' ? 'active' : ''}`}
                      onClick={() => setBoothLayout('2x2')}
                    >
                      <span className="pill-icon">⊞</span> 2x2 GRID COLLAGE
                    </button>
                  </div>
                </div>

                {/* 2. Border Color Themes */}
                <div className="booth-config-section">
                  <span className="booth-config-label">BORDER THEME</span>
                  <div className="booth-theme-swatches">
                    {Object.values(BOOTH_THEMES).map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        className={`booth-theme-btn ${boothThemeId === th.id ? 'active' : ''}`}
                        onClick={() => setBoothThemeId(th.id)}
                        style={{
                          backgroundColor: th.background,
                          color: th.text,
                          borderColor: th.border || '#333333'
                        }}
                      >
                        <span className="theme-dot" style={{ backgroundColor: th.accent }} />
                        {th.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Sticker / Stamp text */}
                <div className="booth-config-section">
                  <span className="booth-config-label">HEADER STICKER & STAMP</span>
                  <div className="booth-stickers-grid">
                    {BOOTH_STICKERS.map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`booth-sticker-btn ${boothSticker === st ? 'active' : ''}`}
                        onClick={() => setBoothSticker(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Date Toggle */}
                <div className="booth-config-section">
                  <span className="booth-config-label">PRINT OPTIONS</span>
                  <label className="booth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={boothShowDate}
                      onChange={(e) => setBoothShowDate(e.target.checked)}
                    />
                    <span>Print Today's Date Stamp ({new Date().toLocaleDateString()})</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Notification message */}
            {feedbackMsg && (
              <div className="preview-feedback-banner">
                {feedbackMsg}
              </div>
            )}

            {/* Studio Action Bar */}
            <div className="preview-actions-bar booth-studio-actions">
              <div className="preview-action-buttons">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={handleQuickSaveBoothStrip}
                  title="Quick Save to ~/Pictures/Snappix"
                >
                  ⚡ QUICK SAVE STRIP
                </button>
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={handleSaveBoothStrip}
                  title="Save to custom folder"
                >
                  💾 SAVE STRIP AS...
                </button>
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={handleCopyBoothStrip}
                >
                  📋 COPY STRIP
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
                  className="action-btn ghost"
                  onClick={() => setIsBoothStudioOpen(false)}
                >
                  CLOSE STUDIO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECORDED VIDEO PLAYER MODAL */}
      {recordedVideo && (
        <div className="preview-modal-backdrop" onClick={() => setRecordedVideo(null)}>
          <div className="preview-modal-card video-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-meta">
                <div className="preview-title-row">
                  <h3 className="preview-headline">🎥 VIDEO RECORDING</h3>
                  <span className="carousel-index-tag">READY</span>
                </div>
                <span className="preview-sub">
                  Length: {recordedVideo.durationSec}s • Format: {recordedVideo.mimeType} • Includes AR filter / motion game overlays & audio
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRecordedVideo(null)}
                title="Close Player"
              >
                ✕
              </button>
            </div>

            <div className="video-player-container">
              <video
                src={recordedVideo.videoUrl}
                controls
                autoPlay
                className="recorded-video-player"
              />
            </div>

            {feedbackMsg && (
              <div className="preview-feedback-banner">
                {feedbackMsg}
              </div>
            )}

            <div className="preview-actions-bar">
              <div className="preview-action-buttons">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={async () => {
                    setFeedbackMsg('Saving video clip...');
                    const res = await saveVideoBlob(recordedVideo.blob);
                    if (res?.success) {
                      setFeedbackMsg('✓ Video saved successfully!');
                      setTimeout(() => setFeedbackMsg(null), 4000);
                    } else if (res?.error) {
                      setFeedbackMsg(`Failed to save: ${res.error}`);
                    }
                  }}
                >
                  💾 SAVE VIDEO CLIP
                </button>
                <button
                  type="button"
                  className="action-btn ghost"
                  onClick={() => setRecordedVideo(null)}
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOTION GAME OVER MODAL */}
      {gameOverScore !== null && (
        <div className="preview-modal-backdrop" onClick={() => setGameOverScore(null)}>
          <div className="preview-modal-card game-over-card" onClick={(e) => e.stopPropagation()}>
            <div className="game-over-content">
              <span className="game-over-badge">🕹️ GAME FINISHED</span>
              <h2 className="game-over-title">STAR CATCHER</h2>
              <div className="game-over-score-box">
                <span className="game-score-label">FINAL SCORE</span>
                <span className="game-score-number">{gameOverScore}</span>
                <span className="game-score-stars">⭐⭐⭐</span>
              </div>
              <p className="game-over-desc">
                Great job dodging bombs and catching cosmic items with your head movements!
              </p>
              <div className="game-over-actions">
                <button
                  type="button"
                  className="action-btn primary large-game-btn"
                  onClick={() => {
                    setGameOverScore(null);
                    handleStartGame();
                  }}
                >
                  ▶ PLAY AGAIN
                </button>
                <button
                  type="button"
                  className="action-btn ghost"
                  onClick={() => setGameOverScore(null)}
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


