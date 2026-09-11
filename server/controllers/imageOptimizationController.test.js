import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from "@jest/globals";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import sharp from "sharp";
import {
  validateImageUrl,
  getCacheKey,
  clampNumber,
  clearMemoryCache,
  getMemoryCacheSize,
  setMemoryCacheLimit,
  optimizeRoomPhoto,
  ALLOWED_IMAGE_HOSTS,
  normalizeOriginImageUrl,
  MAX_IMAGE_SIZE_BYTES,
} from "./imageOptimizationController.js";
import { AppError } from "../middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_CACHE_DIR = path.resolve(__dirname, "../tmp/test-image-cache");

process.env.IMAGE_CACHE_DIR = TEST_CACHE_DIR;

const createMockReq = ({ query = {}, headers = {} } = {}) => ({
  query,
  headers,
  get: (headerName) => headers[headerName.toLowerCase()],
});

const createMockRes = () => {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    setHeader: jest.fn((key, value) => {
      headers[key.toLowerCase()] = value;
      return res;
    }),
    getHeader: (key) => headers[key.toLowerCase()],
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    send: jest.fn((body) => {
      res.body = body;
      return res;
    }),
    end: jest.fn(() => res),
  };
  return res;
};

describe("imageOptimizationController", () => {
  let sampleImageBuffer;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    // Generate a valid source PNG to feed into real Sharp pipelines
    sampleImageBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 120, g: 180, b: 240 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    clearMemoryCache();
    setMemoryCacheLimit(500);
    globalThis.fetch = jest.fn();
    try {
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {}
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    try {
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // 1. validateImageUrl (SSRF Protection)
  // ==========================================================================
  describe("validateImageUrl", () => {
    test("allows valid storage.googleapis.com HTTPS URLs", () => {
      const url = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-101.jpg";
      expect(validateImageUrl(url)).toBe(true);
    });

    test("allows valid firebasestorage.googleapis.com HTTPS URLs", () => {
      const url =
        "https://firebasestorage.googleapis.com/v0/b/lilycrest-app.appspot.com/o/rooms%2Froom-202.png?alt=media&token=abc-123";
      expect(validateImageUrl(url)).toBe(true);
    });

    test("rejects HTTP (insecure) URLs even if domain matches", () => {
      const url = "http://storage.googleapis.com/lilycrest-bucket/rooms/room-101.jpg";
      expect(validateImageUrl(url)).toBe(false);
      expect(validateImageUrl("http://firebasestorage.googleapis.com/image.png")).toBe(false);
    });

    test("rejects disallowed external domains", () => {
      expect(validateImageUrl("https://example.com/image.png")).toBe(false);
      expect(validateImageUrl("https://images.unsplash.com/photo.jpg")).toBe(false);
      expect(validateImageUrl("https://attacker.com/malicious.jpg")).toBe(false);
    });

    test("rejects subdomain and suffix trickery to prevent SSRF bypass", () => {
      expect(validateImageUrl("https://storage.googleapis.com.attacker.com/photo.jpg")).toBe(false);
      expect(validateImageUrl("https://evil-storage.googleapis.com/photo.jpg")).toBe(false);
      expect(validateImageUrl("https://not-firebasestorage.googleapis.com/photo.jpg")).toBe(false);
    });

    test("rejects cloud metadata and internal network IP addresses (SSRF)", () => {
      expect(validateImageUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
      expect(validateImageUrl("https://127.0.0.1:8080/image.jpg")).toBe(false);
      expect(validateImageUrl("https://localhost/image.jpg")).toBe(false);
    });

    test("rejects URLs containing user/password credentials", () => {
      expect(validateImageUrl("https://user:pass@storage.googleapis.com/photo.jpg")).toBe(false);
    });

    test("rejects empty pathname or root path", () => {
      expect(validateImageUrl("https://storage.googleapis.com")).toBe(false);
      expect(validateImageUrl("https://storage.googleapis.com/")).toBe(false);
      expect(validateImageUrl("https://firebasestorage.googleapis.com")).toBe(false);
      expect(validateImageUrl("https://firebasestorage.googleapis.com/")).toBe(false);
    });

    test("rejects path traversal attempts with .. or encoded traversal", () => {
      expect(
        validateImageUrl("https://storage.googleapis.com/lilycrest-bucket/../secret.jpg"),
      ).toBe(false);
      expect(
        validateImageUrl("https://storage.googleapis.com/lilycrest-bucket/%2e%2e/secret.jpg"),
      ).toBe(false);
      expect(
        validateImageUrl(
          "https://firebasestorage.googleapis.com/v0/b/lilycrest-bucket/o/..%2Fsecret.jpg",
        ),
      ).toBe(false);
    });

    test("rejects storage URLs targeting incomplete or invalid resources", () => {
      // storage.googleapis.com requires at least bucket and object segments
      expect(validateImageUrl("https://storage.googleapis.com/only-bucket")).toBe(false);
      // firebasestorage.googleapis.com requires /v0/b/<bucket>/...
      expect(validateImageUrl("https://firebasestorage.googleapis.com/v0/b/")).toBe(false);
      expect(validateImageUrl("https://firebasestorage.googleapis.com/v0/")).toBe(false);
      expect(validateImageUrl("https://firebasestorage.googleapis.com/other/path")).toBe(false);
    });

    describe("production bucket confinement", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalBucket = process.env.FIREBASE_STORAGE_BUCKET;

      beforeEach(() => {
        process.env.NODE_ENV = "production";
        process.env.FIREBASE_STORAGE_BUCKET = "authorized-prod-bucket.appspot.com";
      });

      afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        process.env.FIREBASE_STORAGE_BUCKET = originalBucket;
      });

      test("allows URLs targeting the authorized bucket in production", () => {
        const gcsUrl =
          "https://storage.googleapis.com/authorized-prod-bucket.appspot.com/rooms/room-1.jpg";
        const firebaseUrl =
          "https://firebasestorage.googleapis.com/v0/b/authorized-prod-bucket.appspot.com/o/rooms%2Froom-1.jpg";
        expect(validateImageUrl(gcsUrl)).toBe(true);
        expect(validateImageUrl(firebaseUrl)).toBe(true);
      });

      test("rejects URLs targeting an unauthorized bucket in production", () => {
        const unauthorizedGcs =
          "https://storage.googleapis.com/unauthorized-bucket/rooms/room-1.jpg";
        const unauthorizedFirebase =
          "https://firebasestorage.googleapis.com/v0/b/unauthorized-bucket/o/rooms%2Froom-1.jpg";
        expect(validateImageUrl(unauthorizedGcs)).toBe(false);
        expect(validateImageUrl(unauthorizedFirebase)).toBe(false);
      });
    });

    test("rejects null, undefined, non-string, or empty input", () => {
      expect(validateImageUrl(null)).toBe(false);
      expect(validateImageUrl(undefined)).toBe(false);
      expect(validateImageUrl("")).toBe(false);
      expect(validateImageUrl("   ")).toBe(false);
      expect(validateImageUrl(12345)).toBe(false);
      expect(validateImageUrl({})).toBe(false);
      expect(validateImageUrl("javascript:alert(1)")).toBe(false);
    });
  });

  // ==========================================================================
  // 2. getCacheKey
  // ==========================================================================
  describe("getCacheKey", () => {
    test("generates deterministic MD5 hash string (32 hex characters)", () => {
      const url = "https://storage.googleapis.com/bucket/room.jpg";
      const key1 = getCacheKey(url, 480, 80);
      const key2 = getCacheKey(url, 480, 80);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{32}$/);
    });

    test("changes hash when url, width, quality, or format changes", () => {
      const url = "https://storage.googleapis.com/bucket/room.jpg";
      const baseKey = getCacheKey(url, 480, 80, "webp");

      expect(getCacheKey("https://storage.googleapis.com/bucket/other.jpg", 480, 80, "webp")).not.toBe(baseKey);
      expect(getCacheKey(url, 800, 80, "webp")).not.toBe(baseKey);
      expect(getCacheKey(url, 480, 90, "webp")).not.toBe(baseKey);
      expect(getCacheKey(url, 480, 80, "jpeg")).not.toBe(baseKey);
    });

    test("defaults format to webp when omitted", () => {
      const url = "https://storage.googleapis.com/bucket/room.jpg";
      const withDefault = getCacheKey(url, 480, 80);
      const explicitWebp = getCacheKey(url, 480, 80, "webp");

      expect(withDefault).toBe(explicitWebp);
    });

    test("produces the exact same key for a Firebase storage URL whether or not alt=media is pre-appended when normalized", () => {
      const urlWithoutAlt = "https://firebasestorage.googleapis.com/v0/b/bucket/o/room.jpg";
      const urlWithAlt = "https://firebasestorage.googleapis.com/v0/b/bucket/o/room.jpg?alt=media";
      const key1 = getCacheKey(normalizeOriginImageUrl(urlWithoutAlt), 480, 80);
      const key2 = getCacheKey(normalizeOriginImageUrl(urlWithAlt), 480, 80);

      expect(key1).toBe(key2);
    });
  });

  // ==========================================================================
  // 3. clampNumber
  // ==========================================================================
  describe("clampNumber", () => {
    test("clamps values within min and max boundaries", () => {
      expect(clampNumber("10", 50, 1920, 480)).toBe(50);
      expect(clampNumber("3000", 50, 1920, 480)).toBe(1920);
      expect(clampNumber("720", 50, 1920, 480)).toBe(720);
    });

    test("returns default when input is NaN or invalid", () => {
      expect(clampNumber(undefined, 50, 1920, 480)).toBe(480);
      expect(clampNumber("abc", 50, 1920, 480)).toBe(480);
      expect(clampNumber(null, 50, 1920, 480)).toBe(480);
    });
  });

  // ==========================================================================
  // 4. optimizeRoomPhoto - Error handling (400 for invalid/disallowed URLs)
  // ==========================================================================
  describe("optimizeRoomPhoto - URL validation", () => {
    test("rejects missing url query param with 400 INVALID_IMAGE_URL", async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_IMAGE_URL",
        }),
      );
    });

    test("rejects disallowed external URL with 400 INVALID_IMAGE_URL", async () => {
      const req = createMockReq({
        query: { url: "https://evil.com/fake-room.jpg" },
      });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_IMAGE_URL",
        }),
      );
    });

    test("throws AppError if next is not provided", async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await expect(optimizeRoomPhoto(req, res)).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_IMAGE_URL",
      });
    });
  });

  // ==========================================================================
  // 5. optimizeRoomPhoto - HTTP 304 Not Modified on ETag match
  // ==========================================================================
  describe("optimizeRoomPhoto - ETag & 304 handling", () => {
    test("returns 304 Not Modified when if-none-match header matches calculated ETag", async () => {
      const url = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-101.jpg";
      const expectedKey = getCacheKey(url, 480, 80, "webp");
      const expectedEtag = `W/"${expectedKey}"`;

      const req = createMockReq({
        query: { url },
        headers: { "if-none-match": expectedEtag },
      });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(res.status).toHaveBeenCalledWith(304);
      expect(res.end).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith("ETag", expectedEtag);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      // Fetch should never be called when ETag matches
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. optimizeRoomPhoto - Caching Tiers & Headers (MISS -> HIT-MEMORY -> HIT-DISK)
  // ==========================================================================
  describe("optimizeRoomPhoto - Caching Headers and Tiers", () => {
    const validUrl = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-101.jpg";

    test("Tier 3 (Cache MISS): fetches, optimizes, saves to disk & memory, returns X-Cache: MISS", async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req = createMockReq({
        query: { url: validUrl, w: "600", q: "85" },
      });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      const expectedKey = getCacheKey(validUrl, 600, 85, "webp");
      const expectedEtag = `W/"${expectedKey}"`;

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/webp");
      expect(res.setHeader).toHaveBeenCalledWith("ETag", expectedEtag);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      expect(res.setHeader).toHaveBeenCalledWith("X-Cache", "MISS");
      expect(Buffer.isBuffer(res.body)).toBe(true);

      // Verify cached in memory
      expect(getMemoryCacheSize()).toBe(1);

      // Verify cached on disk
      const diskFile = path.join(TEST_CACHE_DIR, `${expectedKey}.webp`);
      const diskExists = await fs
        .stat(diskFile)
        .then(() => true)
        .catch(() => false);
      expect(diskExists).toBe(true);
    });

    test("Tier 1 (HIT-MEMORY): serves immediately from memory cache without disk or origin access", async () => {
      // First request to populate caches
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req1 = createMockReq({ query: { url: validUrl, w: "480", q: "80" } });
      const res1 = createMockRes();
      await optimizeRoomPhoto(req1, res1, jest.fn());
      expect(res1.setHeader).toHaveBeenCalledWith("X-Cache", "MISS");

      // Second identical request
      const req2 = createMockReq({ query: { url: validUrl, w: "480", q: "80" } });
      const res2 = createMockRes();
      await optimizeRoomPhoto(req2, res2, jest.fn());

      expect(res2.status).toHaveBeenCalledWith(200);
      expect(res2.setHeader).toHaveBeenCalledWith("X-Cache", "HIT-MEMORY");
      expect(res2.setHeader).toHaveBeenCalledWith("Content-Type", "image/webp");
      expect(res2.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Not called again
    });

    test("Tier 2 (HIT-DISK): serves from disk cache if memory cache is purged, and re-populates memory", async () => {
      // First request to populate caches
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req1 = createMockReq({ query: { url: validUrl, w: "480", q: "80" } });
      const res1 = createMockRes();
      await optimizeRoomPhoto(req1, res1, jest.fn());
      expect(res1.setHeader).toHaveBeenCalledWith("X-Cache", "MISS");

      // Purge in-memory cache to simulate server restart with persistent disk cache
      clearMemoryCache();
      expect(getMemoryCacheSize()).toBe(0);

      // Second request: should hit disk
      const req2 = createMockReq({ query: { url: validUrl, w: "480", q: "80" } });
      const res2 = createMockRes();
      await optimizeRoomPhoto(req2, res2, jest.fn());

      expect(res2.status).toHaveBeenCalledWith(200);
      expect(res2.setHeader).toHaveBeenCalledWith("X-Cache", "HIT-DISK");
      expect(res2.setHeader).toHaveBeenCalledWith("Content-Type", "image/webp");
      expect(res2.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Fetch not called on disk hit

      // Memory cache should now be populated again
      expect(getMemoryCacheSize()).toBe(1);

      // Third request: should hit memory now
      const req3 = createMockReq({ query: { url: validUrl, w: "480", q: "80" } });
      const res3 = createMockRes();
      await optimizeRoomPhoto(req3, res3, jest.fn());
      expect(res3.setHeader).toHaveBeenCalledWith("X-Cache", "HIT-MEMORY");
    });
  });

  // ==========================================================================
  // 7. Width and Quality Clamping
  // ==========================================================================
  describe("optimizeRoomPhoto - Clamping Parameters", () => {
    const validUrl = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-101.jpg";

    test("clamps w to [50, 1920] and q to [50, 95]", async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => sampleImageBuffer,
      });

      // Request with w=10 (below min 50) and q=20 (below min 50)
      const req1 = createMockReq({ query: { url: validUrl, w: "10", q: "20" } });
      const res1 = createMockRes();
      await optimizeRoomPhoto(req1, res1, jest.fn());

      const expectedKeyMin = getCacheKey(validUrl, 50, 50, "webp");
      expect(res1.setHeader).toHaveBeenCalledWith("ETag", `W/"${expectedKeyMin}"`);

      // Request with w=5000 (above max 1920) and q=100 (above max 95)
      const req2 = createMockReq({ query: { url: validUrl, w: "5000", q: "100" } });
      const res2 = createMockRes();
      await optimizeRoomPhoto(req2, res2, jest.fn());

      const expectedKeyMax = getCacheKey(validUrl, 1920, 95, "webp");
      expect(res2.setHeader).toHaveBeenCalledWith("ETag", `W/"${expectedKeyMax}"`);
    });
  });

  // ==========================================================================
  // 8. LRU Cache Eviction
  // ==========================================================================
  describe("In-memory LRU Eviction", () => {
    test("evicts oldest entries when memory cache limit is exceeded", async () => {
      setMemoryCacheLimit(2); // Set low limit for testing

      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => sampleImageBuffer,
      });

      const url1 = "https://storage.googleapis.com/lilycrest/img1.jpg";
      const url2 = "https://storage.googleapis.com/lilycrest/img2.jpg";
      const url3 = "https://storage.googleapis.com/lilycrest/img3.jpg";

      // Fill cache with entry 1 and 2
      await optimizeRoomPhoto(createMockReq({ query: { url: url1 } }), createMockRes(), jest.fn());
      await optimizeRoomPhoto(createMockReq({ query: { url: url2 } }), createMockRes(), jest.fn());
      expect(getMemoryCacheSize()).toBe(2);

      // Add entry 3 -> entry 1 should be evicted from memory
      await optimizeRoomPhoto(createMockReq({ query: { url: url3 } }), createMockRes(), jest.fn());
      expect(getMemoryCacheSize()).toBe(2);

      // Request entry 1 again -> should be a disk hit (or miss if disk cleared), not memory hit
      const res1Again = createMockRes();
      await optimizeRoomPhoto(createMockReq({ query: { url: url1 } }), res1Again, jest.fn());
      expect(res1Again.setHeader).toHaveBeenCalledWith("X-Cache", "HIT-DISK");
    });
  });

  // ==========================================================================
  // 9. Error handling on Origin Fetch Failure
  // ==========================================================================
  describe("optimizeRoomPhoto - Origin fetch errors", () => {
    const validUrl = "https://storage.googleapis.com/lilycrest-bucket/rooms/not-found.jpg";

    test("handles 404 from origin storage with 404 IMAGE_NOT_FOUND", async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "IMAGE_NOT_FOUND",
        }),
      );
    });

    test("handles fetch network/timeout error with 504 IMAGE_FETCH_TIMEOUT", async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      globalThis.fetch.mockRejectedValueOnce(timeoutErr);

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 504,
          code: "IMAGE_FETCH_TIMEOUT",
        }),
      );
    });
  });

  // ==========================================================================
  // 10. Firebase Storage alt=media handling
  // ==========================================================================
  describe("Firebase Storage alt=media handling", () => {
    test("appends alt=media to Firebase Storage URLs without alt parameter before fetching", async () => {
      let capturedUrl = "";
      globalThis.fetch = jest.fn(async (url) => {
        capturedUrl = url.toString();
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          arrayBuffer: async () => sampleImageBuffer,
        };
      });

      const firebaseUrl =
        "https://firebasestorage.googleapis.com/v0/b/lilycrest.appspot.com/o/rooms%2Froom1.jpg";
      const req = createMockReq({ query: { url: firebaseUrl, w: "300" } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(capturedUrl).toContain("alt=media");
    });
  });

  // ==========================================================================
  // 11. In-flight origin fetch deduplication
  // ==========================================================================
  describe("In-flight origin fetch deduplication", () => {
    test("deduplicates origin fetch when concurrent requests ask for different dimensions of the same image", async () => {
      let fetchCount = 0;
      globalThis.fetch = jest.fn(async () => {
        fetchCount++;
        // Small artificial delay to simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          arrayBuffer: async () => sampleImageBuffer,
        };
      });

      const url = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-concurrent.jpg";
      const req480 = createMockReq({ query: { url, w: "480", q: "75" } });
      const req1200 = createMockReq({ query: { url, w: "1200", q: "82" } });
      const res480 = createMockRes();
      const res1200 = createMockRes();
      const next480 = jest.fn();
      const next1200 = jest.fn();

      await Promise.all([
        optimizeRoomPhoto(req480, res480, next480),
        optimizeRoomPhoto(req1200, res1200, next1200),
      ]);

      expect(fetchCount).toBe(1);
      expect(res480.statusCode).toBe(200);
      expect(res1200.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // 12. Payload size (413) and MIME type (415) guards
  // ==========================================================================
  describe("optimizeRoomPhoto - Payload size and MIME type guards", () => {
    const validUrl = "https://storage.googleapis.com/lilycrest-bucket/rooms/room-guard.jpg";

    test("rejects origin assets with Content-Length header > 15MB with 413 IMAGE_TOO_LARGE", async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-length": String(15 * 1024 * 1024 + 1), // 1 byte over 15MB
          "content-type": "image/jpeg",
        }),
        arrayBuffer: jest.fn(), // Should not even be called
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 413,
          code: "IMAGE_TOO_LARGE",
          message: "Image exceeds maximum allowed size (15MB)",
        }),
      );
    });

    test("rejects origin assets with byteLength > 15MB (secondary guard) with 413 IMAGE_TOO_LARGE", async () => {
      // Simulate chunked transfer or missing content-length where body is oversized
      const oversizedBuffer = new ArrayBuffer(15 * 1024 * 1024 + 50);

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "image/jpeg",
          // content-length omitted
        }),
        arrayBuffer: async () => oversizedBuffer,
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 413,
          code: "IMAGE_TOO_LARGE",
          message: "Image exceeds maximum allowed size (15MB)",
        }),
      );
    });

    test("rejects origin assets with non-image Content-Type (e.g. application/pdf) with 415 UNSUPPORTED_MEDIA_TYPE", async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-length": "1024",
          "content-type": "application/pdf",
        }),
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Remote asset is not a valid image",
        }),
      );
    });

    test("rejects origin assets with text/html Content-Type with 415 UNSUPPORTED_MEDIA_TYPE", async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "text/html; charset=utf-8",
        }),
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
        }),
      );
    });

    test("allows origin assets with Content-Type application/octet-stream", async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-length": String(sampleImageBuffer.length),
          "content-type": "application/octet-stream",
        }),
        arrayBuffer: async () => sampleImageBuffer,
      });

      const req = createMockReq({ query: { url: validUrl } });
      const res = createMockRes();
      const next = jest.fn();

      await optimizeRoomPhoto(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/webp");
    });
  });

  // ==========================================================================
  // 13. Pre-normalized cache key consistency in optimizeRoomPhoto
  // ==========================================================================
  describe("Pre-normalized cache key consistency in optimizeRoomPhoto", () => {
    test("requests for Firebase URL with and without alt=media share identical cache entry and ETag", async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "image/jpeg",
        }),
        arrayBuffer: async () => sampleImageBuffer,
      });

      const firebaseUrlWithoutAlt =
        "https://firebasestorage.googleapis.com/v0/b/lilycrest.appspot.com/o/rooms%2Fcanonical-test.jpg";
      const firebaseUrlWithAlt =
        "https://firebasestorage.googleapis.com/v0/b/lilycrest.appspot.com/o/rooms%2Fcanonical-test.jpg?alt=media";

      // First request without alt=media
      const req1 = createMockReq({ query: { url: firebaseUrlWithoutAlt, w: "400" } });
      const res1 = createMockRes();
      await optimizeRoomPhoto(req1, res1, jest.fn());

      expect(res1.statusCode).toBe(200);
      expect(res1.setHeader).toHaveBeenCalledWith("X-Cache", "MISS");
      const etag1 = res1.headers["etag"];

      // Second request with alt=media
      const req2 = createMockReq({ query: { url: firebaseUrlWithAlt, w: "400" } });
      const res2 = createMockRes();
      await optimizeRoomPhoto(req2, res2, jest.fn());

      expect(res2.statusCode).toBe(200);
      // Must be a memory hit because both URLs normalized to the same cache key
      expect(res2.setHeader).toHaveBeenCalledWith("X-Cache", "HIT-MEMORY");
      const etag2 = res2.headers["etag"];

      expect(etag1).toBe(etag2);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Fetch called only once
    });
  });
});
