/**
 * Hands-Free Shutter Control:
 * 1. Speech Recognition Shutter (keywords: "cheese", "snap", "capture", "smile", "photo")
 * 2. Motion / Hand Wave Detector (detects waving or sudden gesture via frame difference)
 */

export function createVoiceShutter({ onTrigger, onListeningChange }) {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    return {
      supported: false,
      start: () => false,
      stop: () => {}
    };
  }

  let recognition = null;
  let isListening = false;
  let shouldRestart = false;

  const start = () => {
    try {
      if (recognition) {
        recognition.abort();
      }

      recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        shouldRestart = true;
        onListeningChange?.(true);
      };

      recognition.onresult = (event) => {
        const lastIndex = event.results.length - 1;
        const transcript = event.results[lastIndex][0].transcript.toLowerCase().trim();

        const triggerWords = ['cheese', 'snap', 'capture', 'photo', 'smile', 'shoot'];
        const matched = triggerWords.some((word) => transcript.includes(word));

        if (matched) {
          onTrigger?.(transcript);
        }
      };

      recognition.onerror = (err) => {
        // Ignore aborted or no-speech
        if (err.error !== 'no-speech' && err.error !== 'aborted') {
          console.warn('Speech recognition error:', err);
        }
      };

      recognition.onend = () => {
        isListening = false;
        onListeningChange?.(false);
        // Auto restart if still desired
        if (shouldRestart) {
          try {
            recognition.start();
          } catch (e) {}
        }
      };

      recognition.start();
      return true;
    } catch (e) {
      console.warn('Voice shutter start failed:', e);
      return false;
    }
  };

  const stop = () => {
    shouldRestart = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
      recognition = null;
    }
    isListening = false;
    onListeningChange?.(false);
  };

  return {
    supported: true,
    start,
    stop,
    get isListening() {
      return isListening;
    }
  };
}

/**
 * Real-time Motion Wave Detector
 * Compares webcam frame difference to detect a wave or sudden pose change
 */
export class MotionGestureDetector {
  constructor({ onMotionTrigger, threshold = 40, minArea = 0.08 }) {
    this.onMotionTrigger = onMotionTrigger;
    this.threshold = threshold; // Pixel brightness delta
    this.minArea = minArea; // % of frame that changed
    this.prevFrameData = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.canvas.width = 64; // Downsampled for instant 60fps analysis
    this.canvas.height = 48;
    this.cooldown = false;
  }

  processVideoFrame(videoElement) {
    if (!videoElement || videoElement.videoWidth === 0 || this.cooldown) return;

    this.ctx.drawImage(videoElement, 0, 0, 64, 48);
    const frame = this.ctx.getImageData(0, 0, 64, 48);
    const data = frame.data;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data);
      return;
    }

    let changedPixels = 0;
    const totalPixels = 64 * 48;

    for (let i = 0; i < data.length; i += 4) {
      // Grayscale difference
      const curLuma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      const prevLuma =
        (this.prevFrameData[i] * 299 +
          this.prevFrameData[i + 1] * 587 +
          this.prevFrameData[i + 2] * 114) /
        1000;

      if (Math.abs(curLuma - prevLuma) > this.threshold) {
        changedPixels++;
      }
      this.prevFrameData[i] = data[i];
      this.prevFrameData[i + 1] = data[i + 1];
      this.prevFrameData[i + 2] = data[i + 2];
    }

    const changedRatio = changedPixels / totalPixels;

    // Detect wave / large motion gesture
    if (changedRatio > this.minArea && changedRatio < 0.6) {
      this.cooldown = true;
      this.onMotionTrigger?.();
      // Cooldown for 4 seconds so it doesn't repeatedly fire
      setTimeout(() => {
        this.cooldown = false;
      }, 4000);
    }
  }

  reset() {
    this.prevFrameData = null;
    this.cooldown = false;
  }
}
