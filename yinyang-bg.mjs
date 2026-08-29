import sharp from 'sharp';

const inputPath  = './vector-dragon-logo-enhanced.png';
const outputPath = './vector-dragon-logo-yinyang.png';

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
const src = Buffer.from(data);
const out = Buffer.alloc(width * height * 4);

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// ── Yin-Yang divider ─────────────────────────────────────────────────────
// Classic yin-yang: circle divided by vertical S-curve
// Upper half: one colour; lower half: other; two small dots swapped.
// We use the signed-distance approach for smooth anti-aliased edge.

const cx = width  / 2;
const cy = height / 2;
const R  = Math.min(cx, cy) * 0.98;   // outer circle radius
const r  = R / 2;                     // S-curve radius

// Returns +1 for "green zone", -1 for "white zone"  (yin-yang logic)
function yinYangZone(x, y) {
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > R) return 0; // outside circle

  // small dot centres
  const dotTopCy    = cy - r;   // top small dot centre
  const dotBottomCy = cy + r;   // bottom small dot centre
  const dotR        = r / 2;    // dot radius

  const distTop    = Math.sqrt(dx * dx + (y - dotTopCy)    ** 2);
  const distBottom = Math.sqrt(dx * dx + (y - dotBottomCy) ** 2);

  // Top small circle: belongs to green (yin) even though it's in white half
  if (distTop    <= dotR) return +1;
  // Bottom small circle: belongs to white even though it's in green half
  if (distBottom <= dotR) return -1;

  // Upper half (y < cy): check if inside top S-circle → green, else white
  if (y <= cy) {
    const d = Math.sqrt(dx * dx + (y - dotTopCy) ** 2);
    return (d <= r) ? +1 : -1;
  } else {
    // Lower half: check if inside bottom S-circle → white, else green
    const d = Math.sqrt(dx * dx + (y - dotBottomCy) ** 2);
    return (d <= r) ? -1 : +1;
  }
}

// Soft-edge signed distance for anti-aliasing at the YY boundary
function softZone(x, y) {
  // sample 4 sub-pixels and average
  const offsets = [-0.35, 0.35];
  let sum = 0;
  for (const ox of offsets) for (const oy of offsets)
    sum += yinYangZone(x + ox, y + oy);
  return sum / 4; // -1 to +1, fractional near edges
}

// ── colour palette ───────────────────────────────────────────────────────
// Green zone: deep emerald with subtle radial gradient
// White zone: soft warm white with hint of brightness variation

function greenColour(x, y, t) {
  // t = 0..1 radial fade from centre
  const base = [10, 130, 30];
  // add subtle light source top-left
  const lightFactor = 1 + 0.25 * (1 - (x / width)) * (1 - (y / height));
  return [
    clamp(base[0] * lightFactor),
    clamp(base[1] * lightFactor + t * 15),
    clamp(base[2] * lightFactor),
  ];
}

function whiteColour(x, y, t) {
  // slightly warm white; top-right slightly brighter
  const warm = 1 + 0.12 * (x / width) * (1 - y / height);
  const v = clamp(245 * warm + t * 8);
  return [v, v, clamp(v - 4)];
}

// ── noise helper (simple value noise for texture) ────────────────────────
function hash(n) {
  let x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
}
function valueNoise(x, y, scale = 0.03) {
  const ix = Math.floor(x * scale), iy = Math.floor(y * scale);
  const fx = (x * scale) - ix, fy = (y * scale) - iy;
  const u = fx * fx * (3 - 2 * fx), v2 = fy * fy * (3 - 2 * fy);
  const a = hash(ix + iy * 57), b = hash(ix + 1 + iy * 57);
  const c = hash(ix + (iy + 1) * 57), d = hash(ix + 1 + (iy + 1) * 57);
  return a + (b - a) * u + (c - a) * v2 + (d - a + a - b - c + b) * u * v2;
}

// ── render ───────────────────────────────────────────────────────────────
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i4 = (y * width + x) * 4;

    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Outside the outer circle → transparent (PNG logo style)
    if (dist > R + 2) {
      out[i4] = out[i4+1] = out[i4+2] = 0;
      out[i4+3] = 0;
      continue;
    }

    // Smooth zone value: +1 green, -1 white, fractional at boundary
    const zone = softZone(x, y);
    const t = clamp((dist / R) * 255) / 255; // radial 0=centre 1=edge

    // subtle texture noise
    const noise = (valueNoise(x, y, 0.045) - 0.5) * 14;

    let bgR, bgG, bgB;
    if (zone >= 0) {
      // fully or mostly green
      const blend = (zone + 1) / 2; // 0..1
      const [gr, gg, gb] = greenColour(x, y, t);
      const [wr, wg, wb] = whiteColour(x, y, t);
      bgR = clamp(gr * blend + wr * (1 - blend) + noise * 0.3);
      bgG = clamp(gg * blend + wg * (1 - blend) + noise * 0.3);
      bgB = clamp(gb * blend + wb * (1 - blend) + noise * 0.3);
    } else {
      // fully or mostly white
      const blend = (-zone + 1) / 2;
      const [wr, wg, wb] = whiteColour(x, y, t);
      const [gr, gg, gb] = greenColour(x, y, t);
      bgR = clamp(wr * blend + gr * (1 - blend) + noise * 0.2);
      bgG = clamp(wg * blend + gg * (1 - blend) + noise * 0.2);
      bgB = clamp(wb * blend + gb * (1 - blend) + noise * 0.2);
    }

    // Outer circle ring: thin dark green outline
    const ringFade = Math.max(0, 1 - (R - dist) / 6);
    bgR = clamp(bgR * (1 - ringFade * 0.6));
    bgG = clamp(bgG * (1 - ringFade * 0.3));
    bgB = clamp(bgB * (1 - ringFade * 0.6));

    // ── Composite: layer dragon logo on top ──────────────────────────────
    const srcR = src[i4], srcG = src[i4+1], srcB = src[i4+2], srcA = src[i4+3];
    const alpha = srcA / 255;

    out[i4]   = clamp(srcR * alpha + bgR * (1 - alpha));
    out[i4+1] = clamp(srcG * alpha + bgG * (1 - alpha));
    out[i4+2] = clamp(srcB * alpha + bgB * (1 - alpha));
    out[i4+3] = 255; // fully opaque result
  }
}

// Final sharpen pass
const buf = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
await sharp(buf)
  .sharpen({ sigma: 0.8, m1: 0.3, m2: 0.3 })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log('Done →', outputPath);
