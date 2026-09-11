import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getOptimizedUrl,
  getThumbnailUrl,
  getImageFallbackUrl,
  isRemoteImage,
  isCloudStorageUrl,
} from "./imageOptimizer.js";

describe("imageOptimizer Utility Behavior", () => {
  // 1. getOptimizedUrl with Firebase/GCS URL -> returns proxy URL with encoded url, w=1200, q=82
  test("getOptimizedUrl transforms Firebase/GCS URL to backend proxy with default w=1200 and q=82", () => {
    const originalGcs = "https://storage.googleapis.com/bucket/room-photos/1/photo.jpg";
    const optimizedGcs = getOptimizedUrl(originalGcs);

    assert.ok(optimizedGcs.startsWith("/api/rooms/photos/optimize?url="));
    assert.ok(optimizedGcs.includes(`url=${encodeURIComponent(originalGcs)}`));
    assert.ok(optimizedGcs.includes("w=1200"));
    assert.ok(optimizedGcs.includes("q=82"));
    assert.ok(optimizedGcs.includes("format=webp"));

    const originalFirebase = "https://firebasestorage.googleapis.com/v0/b/app/o/photo.jpg?alt=media";
    const optimizedFirebase = getOptimizedUrl(originalFirebase, { width: 800, quality: 90 });

    assert.ok(optimizedFirebase.startsWith("/api/rooms/photos/optimize?url="));
    assert.ok(optimizedFirebase.includes(`url=${encodeURIComponent(originalFirebase)}`));
    assert.ok(optimizedFirebase.includes("w=800"));
    assert.ok(optimizedFirebase.includes("q=90"));
    assert.ok(optimizedFirebase.includes("format=webp"));
  });

  // 2. getThumbnailUrl with Firebase/GCS URL -> returns proxy URL with w=480, q=75
  test("getThumbnailUrl transforms Firebase/GCS URL to backend proxy with default w=480 and q=75", () => {
    const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.jpg";
    const thumb = getThumbnailUrl(original);

    assert.ok(thumb.startsWith("/api/rooms/photos/optimize?url="));
    assert.ok(thumb.includes(`url=${encodeURIComponent(original)}`));
    assert.ok(thumb.includes("w=480"));
    assert.ok(thumb.includes("q=75"));
    assert.ok(thumb.includes("format=webp"));
  });

  // 3. Companion thumb derivation for .webp cloud storage URLs
  test("getThumbnailUrl derives companion -thumb.webp for .webp cloud storage URLs without -thumb.", () => {
    const originalWebp = "https://storage.googleapis.com/bucket/room-photos/1/room-view.webp";
    const thumb = getThumbnailUrl(originalWebp);

    const expectedCompanion = "https://storage.googleapis.com/bucket/room-photos/1/room-view-thumb.webp";
    assert.ok(thumb.includes(`url=${encodeURIComponent(expectedCompanion)}`));
    assert.ok(thumb.includes("w=480"));
    assert.ok(thumb.includes("q=75"));
  });

  test("getThumbnailUrl preserves already-thumbnailed -thumb.webp URLs without duplicating suffix", () => {
    const alreadyThumb = "https://storage.googleapis.com/bucket/room-photos/1/room-view-thumb.webp";
    const thumb = getThumbnailUrl(alreadyThumb);

    assert.ok(thumb.includes(`url=${encodeURIComponent(alreadyThumb)}`));
    assert.ok(!thumb.includes("-thumb-thumb.webp"));
    assert.ok(thumb.includes("w=480"));
    assert.ok(thumb.includes("q=75"));
  });

  // 4. getImageFallbackUrl extracts original URL
  test("getImageFallbackUrl extracts original URL from optimization proxy URL", () => {
    const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
    const proxyUrl = getOptimizedUrl(original, { width: 1200, quality: 82 });
    const fallback = getImageFallbackUrl(proxyUrl);

    assert.equal(fallback, original);
  });

  test("getImageFallbackUrl extracts original Firebase URL containing query parameters", () => {
    const original = "https://firebasestorage.googleapis.com/v0/b/app/o/photo.jpg?alt=media&token=test-token";
    const proxyUrl = getOptimizedUrl(original);
    const fallback = getImageFallbackUrl(proxyUrl);

    assert.equal(fallback, original);
  });

  test("getImageFallbackUrl returns non-proxy URLs unchanged", () => {
    const directUrl = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
    assert.equal(getImageFallbackUrl(directUrl), directUrl);

    const localAsset = "/assets/images/branches/gil-puyat/Pic_quad.webp";
    assert.equal(getImageFallbackUrl(localAsset), localAsset);
  });

  // 5. Local assets remain untouched
  test("getOptimizedUrl and getThumbnailUrl leave bundled local assets and relative paths untouched", () => {
    const localAsset = "/assets/images/branches/gil-puyat/Pic_quad.webp";
    assert.equal(getOptimizedUrl(localAsset), localAsset);
    assert.equal(getThumbnailUrl(localAsset), localAsset);

    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    assert.equal(getOptimizedUrl(dataUrl), dataUrl);
    assert.equal(getThumbnailUrl(dataUrl), dataUrl);
  });

  // 6. Object { url, thumbnailUrl } handling
  test("getOptimizedUrl handles object with url or thumbnailUrl", () => {
    const objWithBoth = {
      url: "https://storage.googleapis.com/bucket/room-photos/1/full.webp",
      thumbnailUrl: "https://storage.googleapis.com/bucket/room-photos/1/full-thumb.webp",
    };
    const optimized = getOptimizedUrl(objWithBoth);
    assert.ok(optimized.includes(`url=${encodeURIComponent(objWithBoth.url)}`));

    const objWithOnlyThumb = {
      thumbnailUrl: "https://storage.googleapis.com/bucket/room-photos/1/only-thumb.webp",
    };
    const optimizedThumbOnly = getOptimizedUrl(objWithOnlyThumb);
    assert.ok(optimizedThumbOnly.includes(`url=${encodeURIComponent(objWithOnlyThumb.thumbnailUrl)}`));
  });

  test("getThumbnailUrl handles object with explicit thumbnailUrl", () => {
    const obj = {
      url: "https://storage.googleapis.com/bucket/room-photos/1/full.webp",
      thumbnailUrl: "https://storage.googleapis.com/bucket/room-photos/1/custom-thumb.webp",
    };
    const thumb = getThumbnailUrl(obj);
    assert.ok(thumb.includes(`url=${encodeURIComponent(obj.thumbnailUrl)}`));
    assert.ok(thumb.includes("w=480"));
    assert.ok(thumb.includes("q=75"));
  });

  test("getThumbnailUrl handles object with only url by deriving companion thumb", () => {
    const obj = {
      url: "https://storage.googleapis.com/bucket/room-photos/1/gallery.webp",
    };
    const thumb = getThumbnailUrl(obj);
    const expectedCompanion = "https://storage.googleapis.com/bucket/room-photos/1/gallery-thumb.webp";
    assert.ok(thumb.includes(`url=${encodeURIComponent(expectedCompanion)}`));
    assert.ok(thumb.includes("w=480"));
    assert.ok(thumb.includes("q=75"));
  });

  // 7. Already-proxied URLs are not double-wrapped
  test("already-proxied URLs are not double-wrapped by getOptimizedUrl or getThumbnailUrl", () => {
    const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
    const proxied = getOptimizedUrl(original, { width: 1200, quality: 82 });

    const reOptimized = getOptimizedUrl(proxied, { width: 800 });
    assert.equal(reOptimized, proxied);

    const reThumb = getThumbnailUrl(proxied);
    assert.equal(reThumb, proxied);
  });

  // 8. isRemoteImage helper tests
  test("isRemoteImage returns true for http, https, and /api/ paths", () => {
    assert.equal(isRemoteImage("https://storage.googleapis.com/bucket/photo.jpg"), true);
    assert.equal(isRemoteImage("http://localhost:5000/photo.jpg"), true);
    assert.equal(isRemoteImage("/api/rooms/photos/optimize?url=abc"), true);
    assert.equal(isRemoteImage({ url: "https://example.com/pic.jpg" }), true);
    assert.equal(isRemoteImage({ thumbnailUrl: "/api/rooms/photos/optimize" }), true);

    assert.equal(isRemoteImage("/assets/images/local.webp"), false);
    assert.equal(isRemoteImage("data:image/png;base64,..."), false);
    assert.equal(isRemoteImage(""), false);
    assert.equal(isRemoteImage(null), false);
    assert.equal(isRemoteImage(undefined), false);
  });

  // 9. isCloudStorageUrl helper tests
  test("isCloudStorageUrl accurately identifies GCS and Firebase URLs, excluding proxy URLs", () => {
    assert.equal(isCloudStorageUrl("https://storage.googleapis.com/bucket/photo.jpg"), true);
    assert.equal(isCloudStorageUrl("https://firebasestorage.googleapis.com/v0/b/app/o/photo.jpg"), true);
    assert.equal(isCloudStorageUrl("https://cloudinary.com/demo/image/upload/sample.jpg"), false);
    assert.equal(isCloudStorageUrl("/assets/images/sample.jpg"), false);
    assert.equal(isCloudStorageUrl("/api/rooms/photos/optimize?url=https%3A%2F%2Fstorage.googleapis.com"), false);
  });
});
