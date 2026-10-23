import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [activeNav, setActiveNav] = useState('CAMERA');
  const [isStreaming, setIsStreaming] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
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
            {activeNav === item && <span className="nav-indicator" />}
          </button>
        ))}
      </nav>

      {/* Decorative Storybook Cloud Elements */}
      <div className="cloud cloud-top-left" aria-hidden="true" />
      <div className="cloud cloud-top-right" aria-hidden="true" />

      {/* Main Hero & Camera Frame */}
      <main className="hero-section">
        <div className="header-titles">
          <h1 className="display-headline">SNAPPIX</h1>
          <p className="sub-headline">LIVE STORYBOOK WEBCAM</p>
        </div>

        {/* Focal Globe Surface with Camera Viewfinder */}
        <div className="globe-surface">
          <div className="camera-frame">
            <video
              ref={videoRef}
              className={`camera-video ${isStreaming ? 'visible' : 'hidden'}`}
              autoPlay
              playsInline
              muted
            />

            {!isStreaming && (
              <div className="camera-placeholder">
                <span className="placeholder-icon">📷</span>
                <p className="placeholder-text">
                  {cameraError ? cameraError : 'Camera is currently sleeping.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Camera Action Controls */}
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
      </main>
    </div>
  );
}

export default App;
