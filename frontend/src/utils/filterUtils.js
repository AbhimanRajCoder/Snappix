/**
 * Interpolates filter settings with intensity (0 to 100)
 * to produce a valid CSS filter string.
 */
export function getCssFilterString(filter, intensity = 100) {
  if (!filter || !filter.settings || filter.id === 'natural') {
    return 'none';
  }

  // Normalize factor from 0.0 to 1.0
  const i = Math.max(0, Math.min(100, intensity)) / 100;
  const s = filter.settings;

  const contrast = 100 + ((s.contrast ?? 100) - 100) * i;
  const brightness = 100 + ((s.brightness ?? 100) - 100) * i;
  const saturate = 100 + ((s.saturate ?? 100) - 100) * i;
  const sepia = (s.sepia ?? 0) * i;
  const grayscale = (s.grayscale ?? 0) * i;
  const hueRotate = (s.hueRotate ?? 0) * i;
  const invert = (s.invert ?? 0) * i;
  const blur = (s.blur ?? 0) * i;

  const parts = [];
  if (Math.abs(contrast - 100) > 0.1) parts.push(`contrast(${contrast.toFixed(1)}%)`);
  if (Math.abs(brightness - 100) > 0.1) parts.push(`brightness(${brightness.toFixed(1)}%)`);
  if (Math.abs(saturate - 100) > 0.1) parts.push(`saturate(${saturate.toFixed(1)}%)`);
  if (sepia > 0.1) parts.push(`sepia(${sepia.toFixed(1)}%)`);
  if (grayscale > 0.1) parts.push(`grayscale(${grayscale.toFixed(1)}%)`);
  if (Math.abs(hueRotate) > 0.1) parts.push(`hue-rotate(${hueRotate.toFixed(1)}deg)`);
  if (invert > 0.1) parts.push(`invert(${invert.toFixed(1)}%)`);
  if (blur > 0.05) parts.push(`blur(${blur.toFixed(2)}px)`);

  return parts.length > 0 ? parts.join(' ') : 'none';
}
