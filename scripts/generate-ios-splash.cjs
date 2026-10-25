const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Source splash with PTE Ninja emblem
const srcPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable-port-xxxhdpi', 'splash.png');
const targetDir = path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');

console.log('Reading source image from:', srcPath);
const srcData = fs.readFileSync(srcPath);
const srcPng = PNG.sync.read(srcData);

// Bounding box of the emblem in source (found: x: 416-863, y: 736-1183, size: 448x448)
const cropX = 416;
const cropY = 736;
const cropW = 448;
const cropH = 448;

// Create target 2732x2732 image
const TARGET_SIZE = 2732;
const dstPng = new PNG({ width: TARGET_SIZE, height: TARGET_SIZE });

// Background color #0B0C10 (RGB: 11, 12, 16, Alpha: 255)
const bgR = 11;
const bgG = 12;
const bgB = 16;
const bgA = 255;

for (let i = 0; i < dstPng.data.length; i += 4) {
  dstPng.data[i] = bgR;
  dstPng.data[i + 1] = bgG;
  dstPng.data[i + 2] = bgB;
  dstPng.data[i + 3] = bgA;
}

// Scale factor: scale 448x448 emblem to 672x672 (1.5x) so it looks crisp on iPad & iPhone displays
const scale = 1.5;
const dstEmblemW = Math.round(cropW * scale); // 672
const dstEmblemH = Math.round(cropH * scale); // 672
const dstStartX = Math.round((TARGET_SIZE - dstEmblemW) / 2);
const dstStartY = Math.round((TARGET_SIZE - dstEmblemH) / 2);

console.log(`Centering emblem (${dstEmblemW}x${dstEmblemH}) at (${dstStartX}, ${dstStartY}) on 2732x2732 canvas...`);

// Bilinear interpolation
for (let dy = 0; dy < dstEmblemH; dy++) {
  const srcY = cropY + (dy / scale);
  const y0 = Math.floor(srcY);
  const y1 = Math.min(y0 + 1, cropY + cropH - 1);
  const fy = srcY - y0;

  for (let dx = 0; dx < dstEmblemW; dx++) {
    const srcX = cropX + (dx / scale);
    const x0 = Math.floor(srcX);
    const x1 = Math.min(x0 + 1, cropX + cropW - 1);
    const fx = srcX - x0;

    const idx00 = (y0 * srcPng.width + x0) * 4;
    const idx10 = (y0 * srcPng.width + x1) * 4;
    const idx01 = (y1 * srcPng.width + x0) * 4;
    const idx11 = (y1 * srcPng.width + x1) * 4;

    const dstIdx = ((dstStartY + dy) * TARGET_SIZE + (dstStartX + dx)) * 4;

    for (let c = 0; c < 4; c++) {
      const top = srcPng.data[idx00 + c] * (1 - fx) + srcPng.data[idx10 + c] * fx;
      const btm = srcPng.data[idx01 + c] * (1 - fx) + srcPng.data[idx11 + c] * fx;
      dstPng.data[dstIdx + c] = Math.round(top * (1 - fy) + btm * fy);
    }
  }
}

const outBuf = PNG.sync.write(dstPng);

const files = [
  'splash-2732x2732.png',
  'splash-2732x2732-1.png',
  'splash-2732x2732-2.png'
];

files.forEach(file => {
  const destFile = path.join(targetDir, file);
  fs.writeFileSync(destFile, outBuf);
  console.log(`Wrote ${outBuf.length} bytes to ${destFile}`);
});

console.log('iOS splash screens updated successfully with PTE Ninja emblem on dark #0B0C10 background!');
