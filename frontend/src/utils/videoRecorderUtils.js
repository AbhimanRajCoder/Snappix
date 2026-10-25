/**
 * Video Recording Utility for Snappix
 * Records live video stream + AR filters / Motion Game canvas overlay with audio.
 */

export class VideoRecorderManager {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = 0;
    this.timerInterval = null;
    this.isRecording = false;
  }

  /**
   * Starts recording the video stream + optional composite canvas
   */
  start({ stream, overlayCanvas, onTick }) {
    if (this.isRecording) return;

    this.recordedChunks = [];
    let recordStream = stream;

    // If there is an overlay canvas (game or AR filter), merge canvas with video stream
    if (overlayCanvas && overlayCanvas.captureStream) {
      try {
        const canvasStream = overlayCanvas.captureStream(30);
        // Include audio tracks from webcam stream if available
        stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        recordStream = canvasStream;
      } catch (e) {
        console.warn('Canvas stream capture fallback:', e);
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

    this.mediaRecorder = new MediaRecorder(recordStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 2500000 // 2.5 Mbps
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(200); // 200ms time slice
    this.isRecording = true;
    this.startTime = Date.now();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      onTick?.(elapsed);
    }, 500);
  }

  /**
   * Stops recording and returns video blob and data URL
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
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
        this.mediaRecorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }
}

/**
 * Saves recorded video file locally
 */
export async function saveVideoBlob(blob, customName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = customName || `snappix-video-${timestamp}.webm`;

  // Convert Blob to data URL for Electron IPC if supported
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

  // Web Browser fallback
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
