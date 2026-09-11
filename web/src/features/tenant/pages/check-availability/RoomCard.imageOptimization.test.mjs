import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  getOptimizedUrl,
  getThumbnailUrl,
  getImageFallbackUrl,
  isRemoteImage,
} from "../../../../shared/utils/imageOptimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readRelative = (relPath) =>
  readFileSync(resolve(__dirname, relPath), "utf-8");

describe("Room Photo Optimization - Frontend Components", () => {
  const roomCardCode = readRelative("./RoomCard.jsx");
  const modalCode = readRelative("../../modals/RoomDetailsModal.jsx");
  const inventoryCode = readRelative("../../../public/components/RoomInventory.jsx");
  const progressiveImageCode = readRelative("../../../../shared/components/ProgressiveImage.jsx");

  describe("1. ProgressiveImage.jsx Upgrade", () => {
    test("imports getImageFallbackUrl from imageOptimizer", () => {
      assert.match(
        progressiveImageCode,
        /import\s+{[^}]*getImageFallbackUrl[^}]*}\s+from\s+["']\.\.\/utils\/imageOptimizer(\.js)?["']/
      );
    });

    test("implements retry logic on proxy error before setting status to error", () => {
      assert.match(progressiveImageCode, /(?:currentSrc|optimizedSrc)\.includes\(["']\/api\/rooms\/photos\/optimize["']\)/);
      assert.match(progressiveImageCode, /getImageFallbackUrl\((?:currentSrc|optimizedSrc)\)/);
      assert.match(progressiveImageCode, /setStatus\(["']error["']\)/);
      assert.match(progressiveImageCode, /hasRetriedRef/);
    });

    test("strictly maintains solid neutral placeholder without gradients", () => {
      assert.ok(
        progressiveImageCode.includes('var(--card-muted, #f1f5f9)'),
        "Must use neutral card-muted placeholder"
      );
      assert.ok(
        !progressiveImageCode.includes("linear-gradient"),
        "Must not contain linear gradients"
      );
    });
  });

  describe("2. RoomCard.jsx Upgrade", () => {
    test("imports getImageFallbackUrl from imageOptimizer", () => {
      assert.match(
        roomCardCode,
        /import\s+{[^}]*getImageFallbackUrl[^}]*}\s+from\s+["'].*\/imageOptimizer(\.js)?["']/
      );
    });

    test("maps images array using getThumbnailUrl", () => {
      assert.match(roomCardCode, /rawImages\.map\(\s*\(src\)\s*=>\s*getThumbnailUrl\(src\)\)/);
    });

    test("prefetches 1200px HD photo with quality 82 on handleCardMouseEnter", () => {
      assert.match(roomCardCode, /const\s+primaryRaw\s*=\s*room\.images\?\.\[0\]\s*\|\|\s*room\.image/);
      assert.match(
        roomCardCode,
        /getOptimizedUrl\(primaryRaw,\s*{\s*width:\s*1200,\s*quality:\s*82\s*}\)/
      );
    });

    test("retries image load on error using getImageFallbackUrl before giving up", () => {
      assert.match(roomCardCode, /getImageFallbackUrl\(/);
      assert.match(roomCardCode, /retriedIndicesRef/);
      assert.match(roomCardCode, /onError={handleImageError}/);
    });

    test("strictly maintains solid neutral placeholder without gradients", () => {
      assert.ok(
        roomCardCode.includes('var(--card-muted, #f1f5f9)'),
        "Must use solid neutral placeholder"
      );
      assert.ok(
        !roomCardCode.includes("linear-gradient"),
        "Must not contain linear gradients"
      );
    });
  });

  describe("3. RoomDetailsModal.jsx Upgrade", () => {
    test("imports getImageFallbackUrl from imageOptimizer", () => {
      assert.match(
        modalCode,
        /import\s+{[^}]*getImageFallbackUrl[^}]*}\s+from\s+["'].*\/imageOptimizer(\.js)?["']/
      );
    });

    test("configures base layer with 480px thumbnail and quality 75", () => {
      assert.match(
        modalCode,
        /getThumbnailUrl\(images\[currentImageIndex\],\s*{\s*width:\s*480,\s*quality:\s*75\s*}\)/
      );
    });

    test("configures overlay layer with 1200px HD and quality 82", () => {
      assert.match(
        modalCode,
        /getOptimizedUrl\(images\[currentImageIndex\],\s*{\s*width:\s*1200,\s*quality:\s*82\s*}\)/
      );
    });

    test("retries both base and overlay layers on error using getImageFallbackUrl", () => {
      assert.match(modalCode, /onError={handleBaseImageError}/);
      assert.match(modalCode, /onError={handleHdImageError}/);
      assert.match(modalCode, /getImageFallbackUrl\(/);
    });
  });

  describe("4. RoomInventory.jsx Upgrade", () => {
    test("passes optimizerOpts 480px and priority for first card to ProgressiveImage", () => {
      assert.match(
        inventoryCode,
        /<ProgressiveImage[\s\S]*?priority={cardIdx === 0}[\s\S]*?optimizerOpts={{\s*width:\s*480,\s*quality:\s*75\s*}}/
      );
    });
  });

  describe("5. End-to-End Image Optimization & Fallback Pipeline", () => {
    const jpgGcsUrl = "https://storage.googleapis.com/capstone-bucket/rooms/room101/photo.jpg";
    const webpGcsUrl = "https://storage.googleapis.com/capstone-bucket/rooms/room101/main.webp";

    test("generates expected proxy URLs for thumbnail and HD targets", () => {
      const thumbUrl = getThumbnailUrl(jpgGcsUrl, { width: 480, quality: 75 });
      assert.ok(thumbUrl.includes("w=480"));
      assert.ok(thumbUrl.includes("q=75"));
      assert.ok(thumbUrl.includes(encodeURIComponent(jpgGcsUrl)));

      const hdUrl = getOptimizedUrl(jpgGcsUrl, { width: 1200, quality: 82 });
      assert.ok(hdUrl.includes("w=1200"));
      assert.ok(hdUrl.includes("q=82"));
      assert.ok(hdUrl.includes(encodeURIComponent(jpgGcsUrl)));

      // WebP automatically derives companion -thumb.webp for thumbnail proxying
      const webpThumb = getThumbnailUrl(webpGcsUrl, { width: 480, quality: 75 });
      assert.ok(webpThumb.includes(encodeURIComponent("https://storage.googleapis.com/capstone-bucket/rooms/room101/main-thumb.webp")));
    });

    test("recovers original cloud source when proxy URL is passed to getImageFallbackUrl", () => {
      const thumbUrl = getThumbnailUrl(jpgGcsUrl, { width: 480, quality: 75 });
      const fallbackFromThumb = getImageFallbackUrl(thumbUrl);
      assert.equal(fallbackFromThumb, jpgGcsUrl);

      const hdUrl = getOptimizedUrl(jpgGcsUrl, { width: 1200, quality: 82 });
      const fallbackFromHd = getImageFallbackUrl(hdUrl);
      assert.equal(fallbackFromHd, jpgGcsUrl);

      const webpThumb = getThumbnailUrl(webpGcsUrl);
      const fallbackFromWebpThumb = getImageFallbackUrl(webpThumb);
      assert.equal(fallbackFromWebpThumb, "https://storage.googleapis.com/capstone-bucket/rooms/room101/main-thumb.webp");
    });

    test("preserves non-proxy URLs untouched through getImageFallbackUrl", () => {
      const rawAsset = "/assets/images/branches/gil-puyat/Private - GP/private room copy.webp";
      assert.equal(getImageFallbackUrl(rawAsset), rawAsset);
      assert.equal(isRemoteImage(rawAsset), false);
    });
  });
});
