/**
 * Sound synthesis using Web Audio API (zero external asset dependencies)
 */
export function playShutterSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // 1. Mechanical pre-click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(120, ctx.currentTime);
    clickGain.gain.setValueAtTime(0.4, ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start();
    clickOsc.stop(ctx.currentTime + 0.04);

    // 2. Main Shutter Curtain (Filtered Noise Burst)
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime + 0.02);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, ctx.currentTime);
    noiseGain.gain.setValueAtTime(0.7, ctx.currentTime + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(ctx.currentTime + 0.01);
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

export function playCountdownBeep(freq = 600, duration = 0.09) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn('Countdown beep error:', err);
  }
}

/**
 * Captures the current video frame onto a canvas with active filters, mirroring, and aspect ratio crop.
 */
export function captureFrame({
  videoElement,
  filterCss = 'none',
  isMirrored = true,
  aspectRatio = 'native' // 'native', '1:1', '4:3', '16:9'
}) {
  if (!videoElement || videoElement.videoWidth === 0) {
    throw new Error('Camera stream is not ready for capture.');
  }

  const vWidth = videoElement.videoWidth;
  const vHeight = videoElement.videoHeight;

  let cropWidth = vWidth;
  let cropHeight = vHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (aspectRatio === '1:1') {
    const minDim = Math.min(vWidth, vHeight);
    cropWidth = minDim;
    cropHeight = minDim;
    offsetX = (vWidth - cropWidth) / 2;
    offsetY = (vHeight - cropHeight) / 2;
  } else if (aspectRatio === '4:3') {
    const targetRatio = 4 / 3;
    const currentRatio = vWidth / vHeight;
    if (currentRatio > targetRatio) {
      cropWidth = vHeight * targetRatio;
      cropHeight = vHeight;
      offsetX = (vWidth - cropWidth) / 2;
    } else {
      cropWidth = vWidth;
      cropHeight = vWidth / targetRatio;
      offsetY = (vHeight - cropHeight) / 2;
    }
  } else if (aspectRatio === '16:9') {
    const targetRatio = 16 / 9;
    const currentRatio = vWidth / vHeight;
    if (currentRatio > targetRatio) {
      cropWidth = vHeight * targetRatio;
      cropHeight = vHeight;
      offsetX = (vWidth - cropWidth) / 2;
    } else {
      cropWidth = vWidth;
      cropHeight = vWidth / targetRatio;
      offsetY = (vHeight - cropHeight) / 2;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  // Set filter if supported and non-empty
  if (filterCss && filterCss !== 'none') {
    ctx.filter = filterCss;
  }

  ctx.save();

  // If camera is mirrored in UI, mirror canvas horizontally
  if (isMirrored) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // Draw the cropped video frame
  ctx.drawImage(
    videoElement,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.restore();

  return canvas.toDataURL('image/png', 0.95);
}

/**
 * Saves photo using Electron IPC if available, or falls back to browser file download.
 */
export async function savePhotoFile(dataUrl, format = 'png', customName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = format.toLowerCase();
  const defaultName = customName || `snappix-${timestamp}.${ext}`;

  if (window.snappix?.savePhoto) {
    return await window.snappix.savePhoto(dataUrl, defaultName, ext);
  }

  // Web Browser fallback
  try {
    const link = document.createElement('a');
    link.download = defaultName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true, filePath: defaultName };
  } catch (err) {
    console.error('Browser download error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Quick-saves photo directly to default ~/Pictures/Snappix/ folder without a dialog
 */
export async function quickSavePhotoFile(dataUrl, format = 'png', customName) {
  if (window.snappix?.quickSave || window.snappix?.quickSavePhoto) {
    const quickFn = window.snappix.quickSave || window.snappix.quickSavePhoto;
    return await quickFn(dataUrl, format, customName);
  }
  return await savePhotoFile(dataUrl, format, customName);
}


/**
 * Copies captured image data to system clipboard
 */
export async function copyImageToClipboard(dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ]);
    return { success: true };
  } catch (err) {
    console.error('Clipboard copy error:', err);
    return { success: false, error: err.message };
  }
}
