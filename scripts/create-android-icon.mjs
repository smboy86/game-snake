import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = process.cwd();
const sourcePath = path.join(root, "assets/images/backgrounds/city-alley-field.png");
const iconDir = path.join(root, "assets/images/icons");
const androidDrawableDir = path.join(root, "android/app/src/main/res/drawable-nodpi");
const androidMipmapDir = path.join(root, "android/app/src/main/res/mipmap-anydpi-v26");

const CANVAS = 1024;
const SAFE_DIAMETER = Math.round(CANVAS * (66 / 108));
const SAFE_RADIUS = SAFE_DIAMETER / 2;
const CENTER = CANVAS / 2;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sampleBilinear(image, x, y) {
  const x0 = clamp(Math.floor(x), 0, image.width - 1);
  const y0 = clamp(Math.floor(y), 0, image.height - 1);
  const x1 = clamp(x0 + 1, 0, image.width - 1);
  const y1 = clamp(y0 + 1, 0, image.height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const weights = [
    [(1 - tx) * (1 - ty), x0, y0],
    [tx * (1 - ty), x1, y0],
    [(1 - tx) * ty, x0, y1],
    [tx * ty, x1, y1],
  ];
  const out = [0, 0, 0, 0];
  for (const [weight, sx, sy] of weights) {
    const idx = (sy * image.width + sx) * 4;
    out[0] += image.data[idx] * weight;
    out[1] += image.data[idx + 1] * weight;
    out[2] += image.data[idx + 2] * weight;
    out[3] += image.data[idx + 3] * weight;
  }
  return out;
}

function setPixel(image, x, y, rgba) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const idx = (y * image.width + x) * 4;
  const alpha = rgba[3] / 255;
  const baseAlpha = image.data[idx + 3] / 255;
  const outAlpha = alpha + baseAlpha * (1 - alpha);
  if (outAlpha <= 0) return;

  image.data[idx] = Math.round((rgba[0] * alpha + image.data[idx] * baseAlpha * (1 - alpha)) / outAlpha);
  image.data[idx + 1] = Math.round((rgba[1] * alpha + image.data[idx + 1] * baseAlpha * (1 - alpha)) / outAlpha);
  image.data[idx + 2] = Math.round((rgba[2] * alpha + image.data[idx + 2] * baseAlpha * (1 - alpha)) / outAlpha);
  image.data[idx + 3] = Math.round(outAlpha * 255);
}

function drawCircle(image, cx, cy, radius, rgba) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist <= radius) {
        const edge = clamp(radius - dist, 0, 1);
        setPixel(image, x, y, [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * edge)]);
      }
    }
  }
}

function drawThickLine(image, x1, y1, x2, y2, radius, rgba) {
  const minX = Math.floor(Math.min(x1, x2) - radius);
  const maxX = Math.ceil(Math.max(x1, x2) + radius);
  const minY = Math.floor(Math.min(y1, y2) - radius);
  const maxY = Math.ceil(Math.max(y1, y2) + radius);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = lengthSq === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
      const nx = x1 + t * dx;
      const ny = y1 + t * dy;
      const dist = Math.hypot(px - nx, py - ny);
      if (dist <= radius) {
        const edge = clamp(radius - dist, 0, 1);
        setPixel(image, x, y, [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * edge)]);
      }
    }
  }
}

function drawSnakeLayer(monochrome = false) {
  const image = new PNG({ width: CANVAS, height: CANVAS });
  const iconScale = 0.78;
  const rawPoints = [
    [CENTER - 260, CENTER + 118],
    [CENTER - 168, CENTER + 20],
    [CENTER - 40, CENTER + 100],
    [CENTER + 86, CENTER + 18],
    [CENTER + 198, CENTER + 52],
    [CENTER + 232, CENTER - 82],
    [CENTER + 96, CENTER - 154],
    [CENTER - 42, CENTER - 92],
  ];
  const points = rawPoints.map(([x, y]) => [
    CENTER + (x - CENTER) * iconScale,
    CENTER + (y - CENTER) * iconScale,
  ]);
  const shadow = [3, 12, 22, 90];
  const outline = monochrome ? [255, 255, 255, 255] : [219, 255, 232, 255];
  const body = monochrome ? [255, 255, 255, 255] : [46, 237, 130, 255];
  const bodyDark = monochrome ? [255, 255, 255, 235] : [25, 156, 86, 255];
  const highlight = monochrome ? [255, 255, 255, 180] : [151, 255, 185, 210];

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    drawThickLine(image, x1 + 10, y1 + 18, x2 + 10, y2 + 18, 50, shadow);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    drawThickLine(image, x1, y1, x2, y2, 52, outline);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    drawThickLine(image, x1, y1, x2, y2, 39, body);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    drawThickLine(image, x1, y1 + 14, x2, y2 + 14, 17, bodyDark);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    drawThickLine(image, x1 - 6, y1 - 14, x2 - 6, y2 - 14, 11, highlight);
  }

  const [headX, headY] = points.at(-1);
  drawCircle(image, headX + 6, headY - 3, 62, outline);
  drawCircle(image, headX + 6, headY - 3, 48, body);
  drawCircle(image, headX - 10, headY - 25, 10, [245, 255, 244, monochrome ? 0 : 255]);
  drawCircle(image, headX + 28, headY - 17, 10, [245, 255, 244, monochrome ? 0 : 255]);
  drawCircle(image, headX - 6, headY - 24, 5, [7, 30, 19, monochrome ? 0 : 255]);
  drawCircle(image, headX + 31, headY - 16, 5, [7, 30, 19, monochrome ? 0 : 255]);
  drawCircle(image, headX + 8, headY + 6, 5, [10, 75, 38, monochrome ? 0 : 210]);

  // Light apple accent keeps the game identity readable at launcher size.
  if (!monochrome) {
    drawCircle(image, CENTER - 134, CENTER - 132, 27, [255, 80, 86, 235]);
    drawCircle(image, CENTER - 117, CENTER - 152, 8, [139, 211, 118, 230]);
  }

  return image;
}

function drawBackgroundLayer() {
  const src = readPng(sourcePath);
  const out = new PNG({ width: CANVAS, height: CANVAS });
  const scale = Math.max(CANVAS / src.width, CANVAS / src.height);
  const cropW = CANVAS / scale;
  const cropH = CANVAS / scale;
  const startX = (src.width - cropW) / 2;
  const startY = (src.height - cropH) / 2;

  for (let y = 0; y < CANVAS; y += 1) {
    for (let x = 0; x < CANVAS; x += 1) {
      const [r, g, b, a] = sampleBilinear(src, startX + x / scale, startY + y / scale);
      const dist = Math.hypot(x - CENTER, y - CENTER) / (CANVAS * 0.72);
      const vignette = clamp(1 - dist * 0.42, 0.58, 1);
      const centerBoost = Math.max(0, 1 - Math.hypot(x - CENTER, y - CENTER) / SAFE_RADIUS);
      const idx = (y * CANVAS + x) * 4;
      out.data[idx] = Math.round(r * vignette + 18 * centerBoost);
      out.data[idx + 1] = Math.round(g * vignette + 24 * centerBoost);
      out.data[idx + 2] = Math.round(b * vignette + 28 * centerBoost);
      out.data[idx + 3] = Math.round(a);
    }
  }
  return out;
}

function compositeIcon(background, foreground) {
  const out = PNG.sync.read(PNG.sync.write(background));
  for (let y = 0; y < foreground.height; y += 1) {
    for (let x = 0; x < foreground.width; x += 1) {
      const idx = (y * foreground.width + x) * 4;
      setPixel(out, x, y, [
        foreground.data[idx],
        foreground.data[idx + 1],
        foreground.data[idx + 2],
        foreground.data[idx + 3],
      ]);
    }
  }
  return out;
}

const background = drawBackgroundLayer();
const foreground = drawSnakeLayer(false);
const monochrome = drawSnakeLayer(true);
const preview = compositeIcon(background, foreground);

writePng(path.join(iconDir, "android-icon-background.png"), background);
writePng(path.join(iconDir, "android-icon-foreground.png"), foreground);
writePng(path.join(iconDir, "android-icon-monochrome.png"), monochrome);
writePng(path.join(iconDir, "android-icon-preview.png"), preview);

writePng(path.join(androidDrawableDir, "snake_launcher_background.png"), background);
writePng(path.join(androidDrawableDir, "snake_launcher_foreground.png"), foreground);
writePng(path.join(androidDrawableDir, "snake_launcher_monochrome.png"), monochrome);

ensureDir(androidMipmapDir);
const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@drawable/snake_launcher_background" />\n  <foreground android:drawable="@drawable/snake_launcher_foreground" />\n  <monochrome android:drawable="@drawable/snake_launcher_monochrome" />\n</adaptive-icon>\n`;
fs.writeFileSync(path.join(androidMipmapDir, "ic_launcher.xml"), adaptiveIcon);
fs.writeFileSync(path.join(androidMipmapDir, "ic_launcher_round.xml"), adaptiveIcon);

console.log(`Generated Android adaptive icon assets. Safe diameter: ${SAFE_DIAMETER}px on ${CANVAS}px canvas.`);
