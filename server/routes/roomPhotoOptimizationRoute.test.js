import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import express from "express";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import roomsRoutes from "./roomsRoutes.js";
import { globalErrorHandler } from "../middleware/errorHandler.js";
import { clearMemoryCache } from "../controllers/imageOptimizationController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_CACHE_DIR = path.resolve(__dirname, "../tmp/route-test-image-cache");

process.env.IMAGE_CACHE_DIR = TEST_CACHE_DIR;

describe("Room Photo Optimization Route (/api/rooms/photos/optimize)", () => {
  let app;
  let server;
  let baseUrl;
  let sampleImageBuffer;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    // Generate valid sample image buffer for image optimization pipeline tests
    sampleImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toBuffer();

    app = express();
    app.use(express.json());
    app.use("/api/rooms", roomsRoutes);
    app.use(globalErrorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    clearMemoryCache();
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
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const clientFetch = (...args) => originalFetch(...args);

  test("GET /api/rooms/photos/optimize without url query param returns 400 with INVALID_IMAGE_URL", async () => {
    const res = await clientFetch(`${baseUrl}/api/rooms/photos/optimize`);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("INVALID_IMAGE_URL");
    expect(data.error.message).toContain("Invalid or disallowed image URL");
  });

  test("GET /api/rooms/photos/optimize?url=https://disallowed.com/img.jpg returns 400 with INVALID_IMAGE_URL", async () => {
    const res = await clientFetch(
      `${baseUrl}/api/rooms/photos/optimize?url=https://disallowed.com/img.jpg`,
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("INVALID_IMAGE_URL");
  });

  test("GET /api/rooms/photos/optimize is handled by optimizeRoomPhoto and not by parameterized :roomId route", async () => {
    // Mock successful fetch from allowed Google Cloud Storage host
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => sampleImageBuffer.buffer.slice(
        sampleImageBuffer.byteOffset,
        sampleImageBuffer.byteOffset + sampleImageBuffer.byteLength,
      ),
    });

    const validImageUrl =
      "https://storage.googleapis.com/test-bucket/room-photos/room101/photo.jpg";
    const res = await clientFetch(
      `${baseUrl}/api/rooms/photos/optimize?url=${encodeURIComponent(validImageUrl)}&w=300&q=80`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-cache")).toBe("MISS");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBeDefined();

    const imageBuffer = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(imageBuffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(100);
  });

  test("GET /api/rooms/photos/optimize route order precedes :roomId parameter capture", async () => {
    const res = await clientFetch(`${baseUrl}/api/rooms/photos/optimize?url=invalid-url`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_IMAGE_URL");
    expect(data.error.code).not.toBe("ROOM_NOT_FOUND");
  });
});
