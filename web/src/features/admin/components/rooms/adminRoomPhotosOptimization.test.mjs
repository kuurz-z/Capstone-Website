import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Admin Room Management Photos Optimization Audit", () => {
  const roomConfigPath = path.join(__dirname, "RoomConfigModal.jsx");
  const roomFormPath = path.join(__dirname, "RoomFormModal.jsx");
  const roomPublicEditPath = path.join(__dirname, "RoomPublicEditForm.jsx");
  const roomPublicPreviewPath = path.join(__dirname, "RoomPublicPreviewCard.jsx");
  const reservationDetailsPath = path.join(__dirname, "..", "ReservationDetailsModal.jsx");

  test("1. RoomConfigModal imports and uses getThumbnailUrl in buildImageState with fallback error handling", () => {
    const code = fs.readFileSync(roomConfigPath, "utf8");
    assert.ok(code.includes("getThumbnailUrl") && code.includes("getImageFallbackUrl") && code.includes("imageOptimizer"));
    assert.ok(code.includes("getThumbnailUrl(value"));
    assert.ok(code.includes('loading="lazy"'));
    assert.ok(code.includes('decoding="async"'));
    assert.ok(code.includes("getImageFallbackUrl(entry.preview)"));
  });

  test("2. RoomFormModal imports and uses getThumbnailUrl in buildImageState with fallback error handling", () => {
    const code = fs.readFileSync(roomFormPath, "utf8");
    assert.ok(code.includes("getThumbnailUrl") && code.includes("getImageFallbackUrl") && code.includes("imageOptimizer"));
    assert.ok(code.includes("getThumbnailUrl(value"));
    assert.ok(code.includes('loading="lazy"'));
    assert.ok(code.includes('decoding="async"'));
    assert.ok(code.includes("getImageFallbackUrl(entry.preview)"));
  });

  test("3. RoomPublicEditForm imports and uses getThumbnailUrl in buildImageState with fallback error handling", () => {
    const code = fs.readFileSync(roomPublicEditPath, "utf8");
    assert.ok(code.includes("getThumbnailUrl") && code.includes("getImageFallbackUrl") && code.includes("imageOptimizer"));
    assert.ok(code.includes("getThumbnailUrl(value"));
    assert.ok(code.includes('loading="lazy"'));
    assert.ok(code.includes('decoding="async"'));
    assert.ok(code.includes("getImageFallbackUrl(entry.preview)"));
  });

  test("4. RoomPublicPreviewCard optimizes displayImage with getThumbnailUrl and fallback error handling", () => {
    const code = fs.readFileSync(roomPublicPreviewPath, "utf8");
    assert.ok(code.includes("getThumbnailUrl") && code.includes("getImageFallbackUrl") && code.includes("imageOptimizer"));
    assert.ok(code.includes("getThumbnailUrl(rawDisplayImage"));
    assert.ok(code.includes('loading="lazy"'));
    assert.ok(code.includes('decoding="async"'));
    assert.ok(code.includes("getImageFallbackUrl(displayImage)"));
  });

  test("5. ReservationDetailsModal uses getThumbnailUrl for assigned room photo thumbnails", () => {
    const code = fs.readFileSync(reservationDetailsPath, "utf8");
    assert.ok(code.includes('import { getThumbnailUrl, getImageFallbackUrl } from "../../../shared/utils/imageOptimizer"'));
    assert.ok(code.includes("src={getThumbnailUrl(imageUrl, { width: 160, quality: 75 })}"));
    assert.ok(code.includes('loading="lazy"'));
    assert.ok(code.includes('decoding="async"'));
    assert.ok(code.includes("getImageFallbackUrl(event.target.src)"));
  });
});
