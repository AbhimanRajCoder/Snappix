/**
 * Photo Booth Strip & Collage Generator (Korean Photobooth Style: Life4Cuts / Photism)
 * Renders 4 captured shots into a high-res printable filmstrip or 2x2 grid on HTML5 Canvas.
 */

export const BOOTH_THEMES = {
  cream: {
    id: 'cream',
    name: 'Retro Cream',
    background: '#fcf8ec',
    text: '#2d2d2d',
    accent: '#ef3b2c',
    border: '#d9d0b5'
  },
  charcoal: {
    id: 'charcoal',
    name: 'Noir Ink',
    background: '#1a1a1a',
    text: '#f5f5f5',
    accent: '#ffe600',
    border: '#333333'
  },
  white: {
    id: 'white',
    name: 'Classic White',
    background: '#ffffff',
    text: '#333333',
    accent: '#007fff',
    border: '#e5e5e5'
  },
  yellow: {
    id: 'yellow',
    name: 'Karl Signal',
    background: '#ffe600',
    text: '#333333',
    accent: '#ef3b2c',
    border: '#333333'
  },
  pink: {
    id: 'pink',
    name: 'Pastel Dream',
    background: '#ffd6e7',
    text: '#3b1c2b',
    accent: '#ff3385',
    border: '#f0b8d2'
  },
  azure: {
    id: 'azure',
    name: 'Globe Azure',
    background: '#007fff',
    text: '#ffffff',
    accent: '#ffe600',
    border: '#005bb5'
  }
};

export const BOOTH_STICKERS = [
  '✦ SNAPPIX DIARY ✦',
  '✌️ BEST MEMORIES ✌️',
  '🎞️ LIFE4CUTS RETRO',
  '✨ SHINE LIKE A STAR ✨',
  '☕ HAPPY MOMENTS',
  '❤️ LOVE & SMILES'
];

/**
 * Loads an image from a DataURL into an HTMLImageElement
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Compiles 4 photos into a Photo Booth Canvas strip or grid
 */
export async function generatePhotoBoothCanvas({
  photos, // Array of 4 photo objects or dataURLs
  layout = '4x1', // '4x1' (vertical strip) or '2x2' (grid)
  themeId = 'cream',
  stickerText = '✦ SNAPPIX DIARY ✦',
  showDate = true,
  customTitle = 'SNAPPIX STUDIO'
}) {
  if (!photos || photos.length === 0) {
    throw new Error('At least 1 photo is required to build a photo booth collage.');
  }

  // Load all 4 images
  const loadedImages = await Promise.all(
    photos.map((p) => {
      const src = typeof p === 'string' ? p : p.dataUrl;
      return loadImage(src);
    })
  );

  const theme = BOOTH_THEMES[themeId] || BOOTH_THEMES.cream;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (layout === '4x1') {
    // Vertical Korean Filmstrip dimensions: 600px width x 1800px height
    const width = 640;
    const paddingX = 40;
    const paddingY = 40;
    const photoWidth = width - paddingX * 2; // 560px
    const photoHeight = Math.round(photoWidth * (3 / 4)); // 420px (4:3 ratio)
    const gap = 24;
    const headerHeight = 60;
    const footerHeight = 150;

    const height = headerHeight + paddingY + 4 * photoHeight + 3 * gap + footerHeight;

    canvas.width = width;
    canvas.height = height;

    // 1. Strip Background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    // 2. Filmstrip decorative holes on the borders (classic Life4Cuts detail)
    ctx.fillStyle = theme.border;
    for (let y = 30; y < height - 30; y += 45) {
      ctx.fillRect(10, y, 10, 18);
      ctx.fillRect(width - 20, y, 10, 18);
    }

    // 3. Top Header
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText(customTitle.toUpperCase(), width / 2, 45);

    // 4. Render 4 Photos with thin border and inner frame
    let currentY = headerHeight + paddingY;
    for (let i = 0; i < 4; i++) {
      const img = loadedImages[i % loadedImages.length];

      // White/contrast matte background behind photo
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(paddingX - 4, currentY - 4, photoWidth + 8, photoHeight + 8);

      // Draw photo maintaining center cover crop
      drawCoverImage(ctx, img, paddingX, currentY, photoWidth, photoHeight);

      // Frame outline
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(paddingX, currentY, photoWidth, photoHeight);

      currentY += photoHeight + gap;
    }

    // 5. Retro Footer with Sticker, Date & Stamp
    const footerY = height - footerHeight + 35;

    // Sticker Badge
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(stickerText, width / 2, footerY);

    // Date and Time
    if (showDate) {
      const dateText = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      ctx.fillStyle = theme.text;
      ctx.font = '14px monospace';
      ctx.letterSpacing = '2px';
      ctx.fillText(`● REC: ${dateText.toUpperCase()} ●`, width / 2, footerY + 36);
    }

    // Bottom trademark
    ctx.fillStyle = theme.text;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('SNAPPIX BOOTH • ALL RIGHTS RESERVED', width / 2, footerY + 68);

  } else {
    // 2x2 Photobooth Grid dimensions: 900px width x 1050px height
    const width = 900;
    const padding = 44;
    const gap = 20;
    const photoWidth = (width - padding * 2 - gap) / 2; // ~396px
    const photoHeight = Math.round(photoWidth * (3 / 4)); // ~297px
    const headerHeight = 70;
    const footerHeight = 130;
    const height = headerHeight + padding + 2 * photoHeight + gap + footerHeight;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    // Header Title
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText(customTitle.toUpperCase(), width / 2, 50);

    // 2x2 Grid Coordinates
    const positions = [
      { x: padding, y: headerHeight + padding },
      { x: padding + photoWidth + gap, y: headerHeight + padding },
      { x: padding, y: headerHeight + padding + photoHeight + gap },
      { x: padding + photoWidth + gap, y: headerHeight + padding + photoHeight + gap }
    ];

    for (let i = 0; i < 4; i++) {
      const img = loadedImages[i % loadedImages.length];
      const pos = positions[i];

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pos.x - 4, pos.y - 4, photoWidth + 8, photoHeight + 8);

      drawCoverImage(ctx, img, pos.x, pos.y, photoWidth, photoHeight);

      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x, pos.y, photoWidth, photoHeight);
    }

    // Footer
    const footerY = height - footerHeight + 45;
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(stickerText, width / 2, footerY);

    if (showDate) {
      const dateText = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      ctx.fillStyle = theme.text;
      ctx.font = '14px monospace';
      ctx.letterSpacing = '2px';
      ctx.fillText(`● DATE: ${dateText.toUpperCase()} ●`, width / 2, footerY + 36);
    }
  }

  return canvas.toDataURL('image/png', 0.96);
}

/**
 * Draws image into rect using cover crop to prevent stretching
 */
function drawCoverImage(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;

  let sWidth = img.width;
  let sHeight = img.height;
  let sX = 0;
  let sY = 0;

  if (imgRatio > targetRatio) {
    sWidth = img.height * targetRatio;
    sX = (img.width - sWidth) / 2;
  } else {
    sHeight = img.width / targetRatio;
    sY = (img.height - sHeight) / 2;
  }

  ctx.drawImage(img, sX, sY, sWidth, sHeight, x, y, w, h);
}
