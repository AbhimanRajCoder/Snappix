/**
 * Interactive Camera Motion Game & Snapchat-Style AR Filter Engine
 * Renders real-time interactive games & stickers over the live webcam feed.
 */

export class MotionCatchGame {
  constructor({ canvas, onScoreUpdate, onGameOver }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onScoreUpdate = onScoreUpdate;
    this.onGameOver = onGameOver;

    this.isPlaying = false;
    this.score = 0;
    this.lives = 3;
    this.combo = 1;
    this.basketX = canvas.width / 2;
    this.targetBasketX = canvas.width / 2;
    this.items = [];
    this.particles = [];
    this.lastSpawn = 0;
    this.gameTimeRemaining = 30; // 30-second game round
    this.prevFrameData = null;
    this.diffCanvas = document.createElement('canvas');
    this.diffCtx = this.diffCanvas.getContext('2d', { willReadFrequently: true });
    this.diffCanvas.width = 64;
    this.diffCanvas.height = 48;
  }

  start() {
    this.isPlaying = true;
    this.score = 0;
    this.lives = 3;
    this.combo = 1;
    this.items = [];
    this.particles = [];
    this.gameTimeRemaining = 30;
    this.lastSpawn = Date.now();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isPlaying) return;
      this.gameTimeRemaining -= 1;
      if (this.gameTimeRemaining <= 0) {
        this.stop();
        this.onGameOver?.(this.score);
      }
    }, 1000);
  }

  stop() {
    this.isPlaying = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Estimates player motion/head position from webcam feed
   */
  updatePlayerTracking(videoElement) {
    if (!videoElement || videoElement.videoWidth === 0) return;

    this.diffCtx.drawImage(videoElement, 0, 0, 64, 48);
    const frame = this.diffCtx.getImageData(0, 0, 64, 48);
    const data = frame.data;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data);
      return;
    }

    let weightedXSum = 0;
    let motionCount = 0;

    // Track motion in upper half of frame (head / face region)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        const idx = (y * 64 + x) * 4;
        const curLuma = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
        const prevLuma =
          (this.prevFrameData[idx] * 299 +
            this.prevFrameData[idx + 1] * 587 +
            this.prevFrameData[idx + 2] * 114) /
          1000;

        if (Math.abs(curLuma - prevLuma) > 28) {
          weightedXSum += x;
          motionCount++;
        }

        this.prevFrameData[idx] = data[idx];
        this.prevFrameData[idx + 1] = data[idx + 1];
        this.prevFrameData[idx + 2] = data[idx + 2];
      }
    }

    if (motionCount > 15) {
      // Invert X because camera is mirrored
      const normX = 1 - weightedXSum / motionCount / 64;
      this.targetBasketX = normX * this.canvas.width;
    }

    // Smooth lerp basket position
    this.basketX += (this.targetBasketX - this.basketX) * 0.18;
    this.basketX = Math.max(50, Math.min(this.canvas.width - 50, this.basketX));
  }

  // Fallback direct movement (mouse / touch / keyboard)
  setManualPosition(normX) {
    this.targetBasketX = normX * this.canvas.width;
  }

  /**
   * Spawns falling items (Stars, Berries, Diamonds, Bombs)
   */
  spawnItems() {
    const now = Date.now();
    if (now - this.lastSpawn > 650) {
      this.lastSpawn = now;
      const types = [
        { icon: '⭐', points: 10, speed: 4.5, color: '#ffe600' },
        { icon: '🍓', points: 20, speed: 5.5, color: '#ef3b2c' },
        { icon: '💎', points: 50, speed: 6.5, color: '#00e5ff' },
        { icon: '💣', points: -25, speed: 4.8, isBomb: true, color: '#222' }
      ];

      const chosen = types[Math.floor(Math.random() * types.length)];
      this.items.push({
        x: 40 + Math.random() * (this.canvas.width - 80),
        y: -30,
        ...chosen,
        size: 38
      });
    }
  }

  /**
   * Main game update & render loop
   */
  render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!this.isPlaying) return;

    this.spawnItems();

    // 1. Update and draw falling items
    const basketY = height - 70;
    const basketWidth = 90;
    const basketHeight = 44;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.y += item.speed;

      // Draw item
      ctx.font = `${item.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(item.icon, item.x, item.y);

      // Collision detection with basket
      const inX = Math.abs(item.x - this.basketX) < basketWidth / 2 + 15;
      const inY = item.y >= basketY && item.y <= basketY + basketHeight;

      if (inX && inY) {
        // Caught!
        this.score = Math.max(0, this.score + item.points);
        if (item.isBomb) {
          this.combo = 1;
          this.lives -= 1;
          this.createExplosion(item.x, item.y, '#ef3b2c', 16);
          if (this.lives <= 0) {
            this.stop();
            this.onGameOver?.(this.score);
            return;
          }
        } else {
          this.combo += 1;
          this.createExplosion(item.x, item.y, item.color, 12);
        }

        this.onScoreUpdate?.(this.score, this.combo);
        this.items.splice(i, 1);
        continue;
      }

      // Out of bounds
      if (item.y > height + 40) {
        if (!item.isBomb) this.combo = 1;
        this.items.splice(i, 1);
      }
    }

    // 2. Render particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.04;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw Karl-styled Cartoon Catcher Basket
    ctx.save();
    ctx.translate(this.basketX, basketY);

    // Basket shadow & bowl
    ctx.fillStyle = '#ffe600';
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-basketWidth / 2, 0, basketWidth, basketHeight, [0, 0, 16, 16]);
    ctx.fill();
    ctx.stroke();

    // Basket label
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SNAPPIX', 0, 26);
    ctx.restore();

    // 4. Render Cute Game HUD on Screen
    ctx.save();
    // Top Score Box
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 3;
    ctx.fillRect(20, 20, 170, 48);
    ctx.strokeRect(20, 20, 170, 48);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${this.score}`, 32, 44);
    ctx.font = '12px sans-serif';
    ctx.fillText(`TIME: ${this.gameTimeRemaining}s`, 32, 60);

    // Lives & Combo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(width - 150, 20, 130, 48);
    ctx.strokeRect(width - 150, 20, 130, 48);
    ctx.fillStyle = '#ef3b2c';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️'.repeat(this.lives), width - 85, 42);
    ctx.fillStyle = '#007fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`COMBO x${this.combo}`, width - 85, 60);
    ctx.restore();
  }

  createExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 3,
        alpha: 1,
        color
      });
    }
  }
}

/**
 * Snapchat-Style AR Graphic Overlays
 */
export const SNAPCHAT_AR_PRESETS = [
  { id: 'none', name: 'No Overlay', icon: '🚫' },
  { id: 'cat_ears', name: 'Kawaii Cat Ears', icon: '🐱' },
  { id: 'camcorder_90s', name: '90s Camcorder VHS', icon: '📹' },
  { id: 'cyber_sparkles', name: 'Y2K Sparkle Stars', icon: '✨' },
  { id: 'cool_sunglasses', name: 'Pixel Thug Shades', icon: '🕶️' }
];

export function renderSnapchatOverlay(ctx, presetId, width, height, timestamp = Date.now()) {
  if (!presetId || presetId === 'none') return;

  ctx.save();

  if (presetId === 'camcorder_90s') {
    // 90s Camcorder REC overlay
    const isBlinking = Math.floor(timestamp / 600) % 2 === 0;

    // Blinking RED REC Dot
    if (isBlinking) {
      ctx.fillStyle = '#ef3b2c';
      ctx.beginPath();
      ctx.arc(45, 45, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('REC', 65, 52);

    // Playback timecode
    const sec = Math.floor((timestamp / 1000) % 60);
    const min = Math.floor((timestamp / 60000) % 60);
    const hr = Math.floor((timestamp / 3600000) % 24);
    const pad = (n) => String(n).padStart(2, '0');
    ctx.fillText(`SP ${pad(hr)}:${pad(min)}:${pad(sec)}`, 45, 80);

    // VHS Date stamp bottom left
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(dateStr, 45, height - 40);

    // Four corner focus brackets
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    const bracketSize = 25;
    const m = 30;

    // Top-left
    ctx.strokeRect(m, m, bracketSize, 0);
    ctx.strokeRect(m, m, 0, bracketSize);
    // Top-right
    ctx.strokeRect(width - m - bracketSize, m, bracketSize, 0);
    ctx.strokeRect(width - m, m, 0, bracketSize);
    // Bottom-left
    ctx.strokeRect(m, height - m, bracketSize, 0);
    ctx.strokeRect(m, height - m - bracketSize, 0, bracketSize);
    // Bottom-right
    ctx.strokeRect(width - m - bracketSize, height - m, bracketSize, 0);
    ctx.strokeRect(width - m, height - m - bracketSize, 0, bracketSize);

  } else if (presetId === 'cat_ears') {
    // Kawaii Cat Ears + Whiskers positioned at top center
    const centerX = width / 2;
    const earY = 80;

    // Left Ear
    ctx.fillStyle = '#ffb6c1';
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerX - 130, earY + 70);
    ctx.lineTo(centerX - 80, earY - 40);
    ctx.lineTo(centerX - 30, earY + 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Ear
    ctx.beginPath();
    ctx.moveTo(centerX + 30, earY + 60);
    ctx.lineTo(centerX + 80, earY - 40);
    ctx.lineTo(centerX + 130, earY + 70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cute pink nose
    ctx.fillStyle = '#ff69b4';
    ctx.beginPath();
    ctx.ellipse(centerX, earY + 160, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute whiskers
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 3;
    // Left whiskers
    ctx.beginPath();
    ctx.moveTo(centerX - 30, earY + 160);
    ctx.lineTo(centerX - 110, earY + 145);
    ctx.moveTo(centerX - 30, earY + 168);
    ctx.lineTo(centerX - 110, earY + 172);
    ctx.stroke();

    // Right whiskers
    ctx.beginPath();
    ctx.moveTo(centerX + 30, earY + 160);
    ctx.lineTo(centerX + 110, earY + 145);
    ctx.moveTo(centerX + 30, earY + 168);
    ctx.lineTo(centerX + 110, earY + 172);
    ctx.stroke();

  } else if (presetId === 'cyber_sparkles') {
    // Y2K Anime/Cyber twinkling sparkles
    const sparkles = [
      { x: width * 0.25, y: height * 0.28, size: 28 },
      { x: width * 0.75, y: height * 0.26, size: 34 },
      { x: width * 0.2, y: height * 0.65, size: 22 },
      { x: width * 0.8, y: height * 0.68, size: 26 },
      { x: width * 0.5, y: height * 0.15, size: 30 }
    ];

    sparkles.forEach((s, idx) => {
      const pulse = Math.sin((timestamp / 200) + idx) * 0.3 + 1;
      const size = s.size * pulse;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#ffe600';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      // Draw 4-point sparkle star
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(0, 0, size, 0);
      ctx.quadraticCurveTo(0, 0, 0, size);
      ctx.quadraticCurveTo(0, 0, -size, 0);
      ctx.quadraticCurveTo(0, 0, 0, -size);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

  } else if (presetId === 'cool_sunglasses') {
    // Pixel / Cool shades
    const centerX = width / 2;
    const centerY = height * 0.38;
    const glassW = 200;
    const glassH = 46;

    ctx.fillStyle = '#111111';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    // Sunglasses frame
    ctx.fillRect(centerX - glassW / 2, centerY, glassW, glassH);
    ctx.strokeRect(centerX - glassW / 2, centerY, glassW, glassH);

    // White glare diagonal stripes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerX - 70, centerY + 8, 14, 28);
    ctx.fillRect(centerX + 30, centerY + 8, 14, 28);
  }

  ctx.restore();
}
