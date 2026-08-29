import sharp from 'sharp';

const inputPath = './vector-dragon-logo_1058698-1648.avif';
const outputPath = './vector-dragon-logo-green-white.png';

// Read the image, get raw pixels
const image = sharp(inputPath);
const { data, info } = await image
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info; // channels = 4 (RGBA)

const pixels = Buffer.from(data);

for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  const a = pixels[i + 3];

  if (a < 30) continue; // fully transparent, leave as-is

  // Convert to perceived brightness
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

  if (brightness > 200) {
    // Near-white: keep white
    pixels[i]     = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
  } else {
    // Everything else: map to green, scaling darkness
    // Darker original → darker green; brighter → lighter green
    const factor = brightness / 255;
    pixels[i]     = Math.round(0   + factor * 50);   // R: 0–50
    pixels[i + 1] = Math.round(100 + factor * 100);  // G: 100–200
    pixels[i + 2] = Math.round(0   + factor * 30);   // B: 0–30
  }
}

await sharp(pixels, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(outputPath);

console.log(`Done! Saved to ${outputPath}`);
