import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = fileURLToPath(new URL("./public/dragon_logo.png", import.meta.url));
const outputDirectoryUrl = new URL("./public/icons/", import.meta.url);
const outputDirectory = fileURLToPath(outputDirectoryUrl);

await mkdir(outputDirectory, { recursive: true });

const standardIcons = [
  [32, "favicon-32.png"],
  [48, "favicon-48.png"],
  [180, "apple-touch-icon.png"],
  [192, "app-icon-192.png"],
  [512, "app-icon-512.png"],
];

await Promise.all(
  standardIcons.map(([size, filename]) =>
    sharp(source)
      .resize(size, size, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toFile(fileURLToPath(new URL(filename, outputDirectoryUrl))),
  ),
);

// Android may crop maskable icons into a circle, squircle, or rounded square.
// Keep the complete dragon inside the maskable safe area while retaining the
// same radial-green background as the original artwork.
const maskableSize = 512;
const foregroundSize = 430;
const center = (maskableSize - 1) / 2;
const maximumRadiusSquared = center ** 2 * 2;
const background = Buffer.alloc(maskableSize * maskableSize * 4);

for (let y = 0; y < maskableSize; y += 1) {
  for (let x = 0; x < maskableSize; x += 1) {
    const radiusSquared = (x - center) ** 2 + (y - center) ** 2;
    const green = Math.round(128 - 60 * (radiusSquared / maximumRadiusSquared));
    const offset = (y * maskableSize + x) * 4;

    background[offset] = 0;
    background[offset + 1] = Math.max(68, green);
    background[offset + 2] = 0;
    background[offset + 3] = 255;
  }
}

const foreground = await sharp(source)
  .resize(foregroundSize, foregroundSize, { fit: "fill" })
  .png()
  .toBuffer();

await sharp(background, {
  raw: { width: maskableSize, height: maskableSize, channels: 4 },
})
  .composite([
    {
      input: foreground,
      left: Math.floor((maskableSize - foregroundSize) / 2),
      top: Math.floor((maskableSize - foregroundSize) / 2),
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(fileURLToPath(new URL("app-icon-maskable-512.png", outputDirectoryUrl)));

console.log(`Generated ${standardIcons.length + 1} app icons in public/icons`);
