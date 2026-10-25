/**
 * 3D LUT (Look-Up Table) Processing Engine for Snappix
 * Supports Adobe .CUBE files (33x33x33) with high-speed WebGL2 trilinear interpolation
 * and robust CPU fallbacks for live camera preview, photos, strips & video recording.
 */

export const SHUTTERSTOCK_LUTS = [
  {
    id: 'lut-magic-hour',
    name: 'Magic Hour',
    category: 'Cinematic LUTs',
    lutFile: 'MagicHour.cube',
    defaultIntensity: 100,
    emoji: '🌅',
    description: 'Golden hour sunset glow with rich warm highlights and cinematic depth'
  },
  {
    id: 'lut-orange-blue',
    name: 'Orange & Blue',
    category: 'Cinematic LUTs',
    lutFile: 'OrangeAndBlue.cube',
    defaultIntensity: 100,
    emoji: '🎬',
    description: 'Iconic blockbuster teal and orange color grade for punchy portraits'
  },
  {
    id: 'lut-blue-hour',
    name: 'Blue Hour',
    category: 'Cinematic LUTs',
    lutFile: 'BlueHour.cube',
    defaultIntensity: 100,
    emoji: '🌆',
    description: 'Ethereal twilight atmosphere with moody cool blues and soft tones'
  },
  {
    id: 'lut-cold-chrome',
    name: 'Cold Chrome',
    category: 'Cinematic LUTs',
    lutFile: 'ColdChrome.cube',
    defaultIntensity: 100,
    emoji: '❄️',
    description: 'Sleek metallic cool tones, steel highlights, and futuristic contrast'
  },
  {
    id: 'lut-crisp-autumn',
    name: 'Crisp Autumn',
    category: 'Cinematic LUTs',
    lutFile: 'CrispAutumn.cube',
    defaultIntensity: 100,
    emoji: '🍂',
    description: 'Cozy warm amber, golden foliage tones, and deep earthy contrast'
  },
  {
    id: 'lut-dark-somber',
    name: 'Dark & Somber',
    category: 'Cinematic LUTs',
    lutFile: 'DarkAndSomber.cube',
    defaultIntensity: 100,
    emoji: '🌑',
    description: 'Moody noir drama with deep shadowed tones and subdued saturation'
  },
  {
    id: 'lut-hard-boost',
    name: 'Hard Boost',
    category: 'Cinematic LUTs',
    lutFile: 'HardBoost.cube',
    defaultIntensity: 90,
    emoji: '⚡',
    description: 'High-impact punchy vibrancy with ultra-crisp blacks and dynamic range'
  },
  {
    id: 'lut-natural-boost',
    name: 'Natural Boost',
    category: 'Cinematic LUTs',
    lutFile: 'NaturalBoost.cube',
    defaultIntensity: 100,
    emoji: '✨',
    description: 'Professional broadcast color lift for glowing skin and clean clarity'
  },
  {
    id: 'lut-lush-green',
    name: 'Lush Green',
    category: 'Cinematic LUTs',
    lutFile: 'LushGreen.cube',
    defaultIntensity: 100,
    emoji: '🌿',
    description: 'Vibrant emerald botanical tones inspired by nature documentaries'
  },
  {
    id: 'lut-long-beach',
    name: 'Long Beach Morning',
    category: 'Cinematic LUTs',
    lutFile: 'LongBeachMorning.cube',
    defaultIntensity: 100,
    emoji: '🏖️',
    description: 'Gentle coastal pastel morning light and sun-bleached seaside warmth'
  },
  {
    id: 'lut-soft-bw',
    name: 'Soft B&W',
    category: 'Cinematic LUTs',
    lutFile: 'SoftBlackAndWhite.cube',
    defaultIntensity: 100,
    emoji: '🎞️',
    description: 'Art-house monochrome with silky shadow transitions and creamy whites'
  },
  {
    id: 'lut-blue-architecture',
    name: 'Blue Architecture',
    category: 'Cinematic LUTs',
    lutFile: 'BlueArchitecture.cube',
    defaultIntensity: 100,
    emoji: '🏛️',
    description: 'Architectural editorial look with crisp cyan, steel blues, and modern punch'
  },
  {
    id: 'lut-waves',
    name: 'Waves',
    category: 'Cinematic LUTs',
    lutFile: 'Waves.cube',
    defaultIntensity: 100,
    emoji: '🌊',
    description: 'Marine aquamarine and oceanic turquoise with bright surf highlights'
  }
];

// Global in-memory cache for parsed LUT data
const lutCache = new Map();

/**
 * Parses Adobe .CUBE file text into size and Uint8Array (RGBA)
 */
export function parseCubeLut(cubeText) {
  let size = 0;
  let title = '';
  const lines = cubeText.split(/\r?\n/);
  let data = null;
  let idx = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.charCodeAt(0) === 35) continue; // skip '#' and blank

    if (raw.startsWith('LUT_3D_SIZE')) {
      size = parseInt(raw.split(/\s+/)[1], 10);
      data = new Uint8Array(size * size * size * 4);
      continue;
    }
    if (raw.startsWith('TITLE')) {
      title = raw.replace(/TITLE\s*"?([^"]*)"?/, '$1');
      continue;
    }
    // Skip other metadata headers
    if (raw.charCodeAt(0) >= 65 && raw.charCodeAt(0) <= 90) continue;

    if (data && idx < data.length) {
      const parts = raw.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        data[idx++] = Math.max(0, Math.min(255, Math.round(r * 255)));
        data[idx++] = Math.max(0, Math.min(255, Math.round(g * 255)));
        data[idx++] = Math.max(0, Math.min(255, Math.round(b * 255)));
        data[idx++] = 255;
      }
    }
  }

  return { size, data, title };
}

/**
 * Fetches and caches a .CUBE file from public assets
 */
export async function loadLut(lutFileName) {
  if (lutCache.has(lutFileName)) {
    return lutCache.get(lutFileName);
  }

  // Try clean /luts/ path first, fallback to URL-encoded original directory
  const paths = [
    `/luts/${encodeURIComponent(lutFileName)}`,
    `/Shutterstock Free  LUTs/${encodeURIComponent(lutFileName)}`
  ];

  let text = null;
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        text = await res.text();
        break;
      }
    } catch {
      // try next path
    }
  }

  if (!text) {
    throw new Error(`Failed to load LUT file: ${lutFileName}`);
  }

  const parsed = parseCubeLut(text);
  lutCache.set(lutFileName, parsed);
  return parsed;
}

/**
 * CPU Fallback: Fast trilinear interpolation for canvas 2D ImageData
 */
export function applyLutToImageData(imageData, lutData, size, intensity = 100) {
  if (!lutData || size <= 0) return;
  const pixels = imageData.data;
  const len = pixels.length;
  const factor = Math.max(0, Math.min(100, intensity)) / 100;
  if (factor === 0) return;

  const scale = (size - 1) / 255;
  const size2 = size * size;

  for (let i = 0; i < len; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const rf = r * scale;
    const gf = g * scale;
    const bf = b * scale;

    const r0 = Math.floor(rf);
    const r1 = Math.min(size - 1, r0 + 1);
    const g0 = Math.floor(gf);
    const g1 = Math.min(size - 1, g0 + 1);
    const b0 = Math.floor(bf);
    const b1 = Math.min(size - 1, b0 + 1);

    const dr = rf - r0;
    const dg = gf - g0;
    const db = bf - b0;

    // Index calculation: ((b * size + g) * size + r) * 4
    const i000 = (b0 * size2 + g0 * size + r0) * 4;
    const i100 = (b0 * size2 + g0 * size + r1) * 4;
    const i010 = (b0 * size2 + g1 * size + r0) * 4;
    const i110 = (b0 * size2 + g1 * size + r1) * 4;
    const i001 = (b1 * size2 + g0 * size + r0) * 4;
    const i101 = (b1 * size2 + g0 * size + r1) * 4;
    const i011 = (b1 * size2 + g1 * size + r0) * 4;
    const i111 = (b1 * size2 + g1 * size + r1) * 4;

    for (let c = 0; c < 3; c++) {
      const c00 = lutData[i000 + c] * (1 - dr) + lutData[i100 + c] * dr;
      const c01 = lutData[i001 + c] * (1 - dr) + lutData[i101 + c] * dr;
      const c10 = lutData[i010 + c] * (1 - dr) + lutData[i110 + c] * dr;
      const c11 = lutData[i011 + c] * (1 - dr) + lutData[i111 + c] * dr;

      const c0 = c00 * (1 - dg) + c10 * dg;
      const c1 = c01 * (1 - dg) + c11 * dg;

      const targetVal = c0 * (1 - db) + c1 * db;
      pixels[i + c] = Math.round(pixels[i + c] * (1 - factor) + targetVal * factor);
    }
  }
}

/**
 * WebGL2 3D LUT Color Grading Processor
 * Runs hardware trilinear 3D texture interpolation at 60fps
 */
export class LutWebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas || document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      alpha: false,
      premultipliedAlpha: false
    });

    this.program = null;
    this.lutTexture = null;
    this.videoTexture = null;
    this.currentLutKey = null;
    this.currentLutSize = 33;
    this.isSupported = !!this.gl;

    if (this.isSupported) {
      this.initGL();
    } else {
      console.warn('WebGL2 not supported on this device. Fallback to CPU grading.');
    }
  }

  initGL() {
    const gl = this.gl;

    const vsSource = `#version 300 es
      in vec2 aPosition;
      out vec2 vUv;
      uniform bool uFlipX;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        if (uFlipX) {
          vUv.x = 1.0 - vUv.x;
        }
        // HTML video coords are top-down, WebGL is bottom-up
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fsSource = `#version 300 es
      precision highp float;
      precision highp sampler3D;

      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D uVideo;
      uniform sampler3D uLut;
      uniform float uIntensity;
      uniform float uLutSize;

      void main() {
        vec4 color = texture(uVideo, vUv);
        // Map [0, 1] color values to center of 3D voxels
        vec3 lutCoord = (color.rgb * (uLutSize - 1.0) + 0.5) / uLutSize;
        vec4 graded = texture(uLut, lutCoord);
        fragColor = vec4(mix(color.rgb, graded.rgb, uIntensity), color.a);
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('WebGL2 LUT shader error:', gl.getProgramInfoLog(this.program));
      this.isSupported = false;
      return;
    }

    // Fullscreen quad buffer
    const quad = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Create textures
    this.videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.lutTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  }

  /**
   * Uploads 3D LUT to GPU memory
   */
  uploadLut(lutData, size = 33, key = '') {
    if (!this.isSupported || !lutData) return;
    if (this.currentLutKey === key && this.currentLutSize === size) return;

    const gl = this.gl;
    this.currentLutSize = size;
    this.currentLutKey = key;

    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      size,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      lutData
    );
  }

  /**
   * Renders video element through 3D LUT onto this.canvas
   */
  render(sourceElement, { intensity = 100, isMirrored = true } = {}) {
    if (!this.isSupported || !sourceElement) return;
    const gl = this.gl;

    const sWidth = sourceElement.videoWidth || sourceElement.width;
    const sHeight = sourceElement.videoHeight || sourceElement.height;
    if (!sWidth || !sHeight) return;

    if (this.canvas.width !== sWidth || this.canvas.height !== sHeight) {
      this.canvas.width = sWidth;
      this.canvas.height = sHeight;
    }

    gl.viewport(0, 0, sWidth, sHeight);
    gl.useProgram(this.program);

    // 1. Upload video frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceElement);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uVideo'), 0);

    // 2. Bind 3D LUT
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uLut'), 1);

    // 3. Uniforms
    gl.uniform1f(gl.getUniformLocation(this.program, 'uIntensity'), Math.max(0, Math.min(100, intensity)) / 100);
    gl.uniform1f(gl.getUniformLocation(this.program, 'uLutSize'), this.currentLutSize);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uFlipX'), isMirrored ? 1 : 0);

    // 4. Render
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Color-grades a canvas or image source at full resolution
   */
  applyToTargetCanvas(sourceCanvasOrVideo, targetCanvas, { intensity = 100, isMirrored = false }) {
    if (!this.isSupported) return;
    const gl = this.gl;
    const w = targetCanvas.width;
    const h = targetCanvas.height;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    this.render(sourceCanvasOrVideo, { intensity, isMirrored });

    // Draw result into target 2D canvas
    const tCtx = targetCanvas.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(this.canvas, 0, 0, w, h);
    }
  }
}
