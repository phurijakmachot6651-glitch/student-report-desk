import sharp from 'sharp';

const inputPath  = './vector-dragon-logo-green-white.png';
const outputPath = './vector-dragon-logo-enhanced.png';

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
const src = Buffer.from(data);
const dst = Buffer.from(data); // copy to write into

const idx = (x, y) => (y * width + x) * 4;

// ── helpers ──────────────────────────────────────────────────────────────
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function toHSL(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHSL(h, s, l) {
  if (s === 0) { const v = clamp(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hue2rgb(p, q, h + 1/3) * 255),
    clamp(hue2rgb(p, q, h)       * 255),
    clamp(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

// ── 1. per-pixel: brightness/contrast boost + green vibrancy ─────────────
for (let i = 0; i < src.length; i += 4) {
  let r = src[i], g = src[i+1], b = src[i+2];
  const a = src[i+3];

  // contrast S-curve (mild)
  const curve = v => clamp(((v / 255 - 0.5) * 1.15 + 0.5) * 255);
  r = curve(r); g = curve(g); b = curve(b);

  // boost saturation of green tones
  const [h, s, l] = toHSL(r, g, b);
  let newS = s, newL = l;
  const isGreenHue = h >= 0.22 && h <= 0.44; // ~80°–160° hue
  if (isGreenHue && s > 0.1) {
    newS = Math.min(1, s * 1.35);            // richer green
    newL = Math.min(0.95, l * 1.05);
  }
  [r, g, b] = fromHSL(h, newS, newL);

  dst[i] = r; dst[i+1] = g; dst[i+2] = b; dst[i+3] = a;
}

// ── 2. radial vignette (darkens outer ring subtly) ────────────────────────
const cx = width / 2, cy = height / 2;
const maxR = Math.sqrt(cx * cx + cy * cy);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = idx(x, y);
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const t = dist / maxR;                   // 0 = center, 1 = corner
    const vig = 1 - 0.35 * Math.pow(Math.max(0, t - 0.5) / 0.5, 2);
    dst[i]   = clamp(dst[i]   * vig);
    dst[i+1] = clamp(dst[i+1] * vig);
    dst[i+2] = clamp(dst[i+2] * vig);
  }
}

// ── 3. inner glow: lighten near-white pixels toward pure white ────────────
for (let i = 0; i < dst.length; i += 4) {
  const r = dst[i], g = dst[i+1], b = dst[i+2];
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  if (brightness > 180) {                    // near-white → push to bright
    const blend = (brightness - 180) / 75;  // 0→1 over the range 180–255
    dst[i]   = clamp(r + (255 - r) * blend * 0.6);
    dst[i+1] = clamp(g + (255 - g) * blend * 0.6);
    dst[i+2] = clamp(b + (255 - b) * blend * 0.6);
  }
}

// ── 4. soft drop-shadow baked into canvas ─────────────────────────────────
// Create a blurred mask of non-transparent pixels, composite under the image
const SHADOW_OFFSET_X = 6, SHADOW_OFFSET_Y = 8, SHADOW_BLUR = 18;

// alpha-only buffer for shadow
const alphaBuf = Buffer.alloc(width * height);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    alphaBuf[y * width + x] = src[idx(x, y) + 3];

// box-blur the alpha several times to approximate Gaussian
function boxBlurAlpha(buf, w, h, r) {
  const tmp = Buffer.alloc(buf.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let kx = -r; kx <= r; kx++) {
        const nx = x + kx;
        if (nx >= 0 && nx < w) { sum += buf[y * w + nx]; count++; }
      }
      tmp[y * w + x] = sum / count;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let ky = -r; ky <= r; ky++) {
        const ny = y + ky;
        if (ny >= 0 && ny < h) { sum += tmp[ny * w + x]; count++; }
      }
      buf[y * w + x] = sum / count;
    }
  }
}

const blurRadius = Math.round(SHADOW_BLUR / 2);
boxBlurAlpha(alphaBuf, width, height, blurRadius);
boxBlurAlpha(alphaBuf, width, height, blurRadius);

// composite: where the shadow has alpha and the main image is transparent, paint dark
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const di = idx(x, y);
    if (dst[di + 3] > 20) continue;         // main pixel is opaque – skip
    const sx = x - SHADOW_OFFSET_X, sy = y - SHADOW_OFFSET_Y;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const shadowAlpha = alphaBuf[sy * width + sx];
    if (shadowAlpha < 5) continue;
    // dark semi-transparent shadow pixel
    const sa = (shadowAlpha / 255) * 0.45;
    dst[di]   = clamp(0   * sa + dst[di]   * (1 - sa));
    dst[di+1] = clamp(20  * sa + dst[di+1] * (1 - sa));
    dst[di+2] = clamp(5   * sa + dst[di+2] * (1 - sa));
    dst[di+3] = clamp(shadowAlpha * 0.45);
  }
}

// ── 5. final: slight overall sharpening via unsharp-mask via sharp ─────────
const intermediate = await sharp(dst, { raw: { width, height, channels: 4 } })
  .png()
  .toBuffer();

await sharp(intermediate)
  .sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`Enhanced logo saved → ${outputPath}`);
