/**
 * Video Recording Utility for Snappix
 * Records live video stream with real-time 3D LUT color grading and audio in 9:16 Reel or standard landscape format.
 */

export class VideoRecorderManager {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = 0;
    this.timerInterval = null;
    this.animFrameId = null;
    this.isRecording = false;

    // Off-screen canvas for compositing video stream + 3D LUT grading
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = 720;
    this.compositeCanvas.height = 1280; // 9:16 vertical reel format
    this.compositeCtx = this.compositeCanvas.getContext('2d', { alpha: false });
  }

  /**
   * Starts recording the composite (webcam + 3D LUT / filter) or raw stream with audio
   */
  start({ videoElement, stream, overlayCanvas, lutCanvas, onTick, filterCss = 'none', isMirrored = true, reelRatio = true }) {
    if (this.isRecording) return;

    this.recordedChunks = [];
    let recordStream = stream;

    // Composite stream into Reel (720x1280) or landscape canvas with active filters/LUT and audio
    if (videoElement) {
      try {
        const targetW = reelRatio ? 720 : (videoElement.videoWidth || 1280);
        const targetH = reelRatio ? 1280 : (videoElement.videoHeight || 720);
        this.compositeCanvas.width = targetW;
        this.compositeCanvas.height = targetH;
        const cCtx = this.compositeCtx;

        const renderCompositeFrame = () => {
          if (!this.isRecording) return;

          // 1. Draw source (either real-time graded lutCanvas or filtered videoElement)
          const source = (lutCanvas && lutCanvas.width > 0) ? lutCanvas : videoElement;
          const sW = source.videoWidth || source.width || 640;
          const sH = source.videoHeight || source.height || 480;

          cCtx.save();
          if (source === videoElement) {
            if (filterCss && filterCss !== 'none') {
              cCtx.filter = filterCss;
            }
            if (isMirrored) {
              cCtx.translate(targetW, 0);
              cCtx.scale(-1, 1);
            }
          }

          if (sW > 0 && sH > 0) {
            const scale = Math.max(targetW / sW, targetH / sH);
            const drawW = sW * scale;
            const drawH = sH * scale;
            const drawX = (targetW - drawW) / 2;
            const drawY = (targetH - drawH) / 2;
            cCtx.drawImage(source, drawX, drawY, drawW, drawH);
          }
          cCtx.restore();

          // 2. Draw overlay if present
          if (overlayCanvas && overlayCanvas.width > 0) {
            cCtx.drawImage(overlayCanvas, 0, 0, targetW, targetH);
          }

          this.animFrameId = requestAnimationFrame(renderCompositeFrame);
        };

        this.isRecording = true;
        renderCompositeFrame();

        const canvasStream = this.compositeCanvas.captureStream(30);
        if (stream) {
          stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        }
        recordStream = canvasStream;
      } catch (err) {
        console.warn('Composite stream fallback to direct stream:', err);
        recordStream = stream;
      }
    }

    // Determine supported mimeType
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    let selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';

    try {
      this.mediaRecorder = new MediaRecorder(recordStream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 3000000 // 3.0 Mbps for crisp 60fps Reels
      });
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(recordStream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(250); // 250ms chunks
    this.isRecording = true;
    this.startTime = Date.now();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      onTick?.(elapsed);
    }, 500);
  }

  /**
   * Stops recording and returns video blob, URL, and duration
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        this.isRecording = false;
        resolve(null);
        return;
      }

      this.isRecording = false;

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      this.mediaRecorder.onstop = () => {
        const durationSec = Math.round((Date.now() - this.startTime) / 1000);
        const mimeType = this.mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const videoUrl = URL.createObjectURL(blob);

        resolve({
          blob,
          videoUrl,
          durationSec,
          mimeType
        });
      };

      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (err) {
        console.warn('MediaRecorder stop warning:', err);
        resolve(null);
      }
    });
  }
}

/**
 * Saves recorded video file locally
 */
export async function saveVideoBlob(blob, customName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = customName || `snappix-video-clip-${timestamp}.webm`;

  // Electron contextBridge
  if (window.snappix?.savePhoto) {
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onloadend = async () => {
        const dataUrl = reader.result;
        const res = await window.snappix.savePhoto(dataUrl, 'webm', defaultName);
        resolve(res);
      };
      reader.readAsDataURL(blob);
    });
  }

  // Web Browser fallback download
  try {
    const link = document.createElement('a');
    link.download = defaultName;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true, filePath: defaultName };
  } catch (err) {
    console.error('Browser video download error:', err);
    return { success: false, error: err.message };
  }
}
