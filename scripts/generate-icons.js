/**
 * GolfSum App Icon Generator
 * 
 * Generates icon.png, adaptive-icon.png, splash-icon.png, and favicon.png
 * matching the GolfSum brand: dark background (#0f1419), 
 * white "G" letter in a green (#10B981) rounded square, clean and modern.
 *
 * Usage: node scripts/generate-icons.js
 * Requires: npm install canvas (one-time)
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const BRAND_GREEN = '#10B981';
const DARK_BG = '#0f1419';

function generateIcon(size, outputName, { padding = 0.15, showBackground = true } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  if (showBackground) {
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Transparent
    ctx.clearRect(0, 0, size, size);
  }

  const pad = size * padding;
  const innerSize = size - pad * 2;

  // Green rounded square
  const cornerRadius = innerSize * 0.22;
  const x = pad;
  const y = pad;
  const w = innerSize;
  const h = innerSize;

  ctx.beginPath();
  ctx.moveTo(x + cornerRadius, y);
  ctx.lineTo(x + w - cornerRadius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius);
  ctx.lineTo(x + w, y + h - cornerRadius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h);
  ctx.lineTo(x + cornerRadius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius);
  ctx.lineTo(x, y + cornerRadius);
  ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
  ctx.closePath();
  ctx.fillStyle = BRAND_GREEN;
  ctx.fill();

  // "G" letter — white, bold serif
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = innerSize * 0.58;
  ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
  // Slight vertical offset since "G" sits a bit high
  ctx.fillText('G', size / 2, size / 2 + fontSize * 0.03);

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, '..', 'assets', outputName);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Generated ${outPath} (${size}x${size})`);
}

function generateSplashIcon(width, height, outputName) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2 - 30;

  // Small green accent bar
  const barWidth = 48;
  const barHeight = 4;
  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.roundRect(centerX - barWidth / 2, centerY - 60, barWidth, barHeight, 2);
  ctx.fill();

  // "GOLFSUM" text
  const wordmarkSize = 42;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${wordmarkSize}px Georgia, "Times New Roman", serif`;

  // "GOLF" in white
  const golfText = 'GOLF';
  const sumText = 'SUM';
  const golfWidth = ctx.measureText(golfText).width;
  const sumWidth = ctx.measureText(sumText).width;
  const totalWidth = golfWidth + sumWidth;
  const startX = centerX - totalWidth / 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(golfText, startX, centerY);

  // "SUM" in green
  ctx.fillStyle = BRAND_GREEN;
  ctx.fillText(sumText, startX + golfWidth, centerY);

  // Tagline
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'center';
  ctx.font = `500 14px Arial, Helvetica, sans-serif`;
  ctx.letterSpacing = '3px';
  ctx.fillText('Track  ·  Analyze  ·  Improve', centerX, centerY + 40);

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, '..', 'assets', outputName);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Generated ${outPath} (${width}x${height})`);
}

// Generate all assets
console.log('🎨 Generating GolfSum app icons...\n');

// App icon (1024x1024 for App Store, will be auto-resized)
generateIcon(1024, 'icon.png', { padding: 0.1 });

// Android adaptive icon foreground (1024x1024, with safe zone padding)
generateIcon(1024, 'adaptive-icon.png', { padding: 0.2 });

// Favicon (48x48)
generateIcon(48, 'favicon.png', { padding: 0.08 });

// Splash icon (larger wordmark version)
generateSplashIcon(400, 200, 'splash-icon.png');

console.log('\n✅ All icons generated!');
