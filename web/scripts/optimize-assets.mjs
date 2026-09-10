import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../src/assets/images");

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
      results.push({ path: fullPath, name: file.name, size: fs.statSync(fullPath).size });
    }
  }
  return results;
}

async function optimizeImages() {
  const images = getFiles(ASSETS_DIR);
  const oversized = images.filter((img) => img.size > 2 * 1024 * 1024);
  console.log(`Found ${oversized.length} oversized images (>2MB) to optimize.`);

  for (const img of oversized) {
    try {
      const inputBuffer = fs.readFileSync(img.path);
      const isJpeg = /\.(jpe?g)$/i.test(img.name);
      const isPng = /\.png$/i.test(img.name);

      let transformer = sharp(inputBuffer).resize({
        width: 1920,
        withoutEnlargement: true,
      });

      let outputBuffer;
      if (isJpeg) {
        outputBuffer = await transformer.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      } else if (isPng) {
        outputBuffer = await transformer.png({ quality: 80, compressionLevel: 8 }).toBuffer();
      } else {
        outputBuffer = await transformer.toBuffer();
      }

      fs.writeFileSync(img.path, outputBuffer);
      console.log(
        `Optimized ${img.name}: ${(img.size / 1024 / 1024).toFixed(2)}MB -> ${(
          outputBuffer.length / 1024 / 1024
        ).toFixed(2)}MB (-${Math.round((1 - outputBuffer.length / img.size) * 100)}%)`
      );
    } catch (err) {
      console.error(`Failed to optimize ${img.name}:`, err.message);
    }
  }
}

optimizeImages();
