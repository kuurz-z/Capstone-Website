# Room Photo Performance & Optimization Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate slow room photo loading across Lilycrest Dormitory Management System (Lilycrest DMS) by implementing a high-performance Express Sharp caching and resizing proxy, executing a non-destructive cloud storage WebP re-compression migration, and deploying a thumbnail-first frontend rendering pipeline with hover preloading and layered blur-up display.

**Architecture:** An Express Sharp controller (`/api/rooms/photos/optimize`) provides dynamic WebP conversion, thumbnail generation, in-memory LRU caching, disk-based cache persistence in `server/tmp/image-cache`, and 1-year immutable HTTP caching with ETag validation. A safe CLI script (`optimizeExistingRoomPhotos.mjs`) converts legacy 200KB–650KB JPEGs in Firebase Storage into compact WebP HD (~80KB) and thumbnails (~25KB) while keeping original files as backups. The React frontend (`imageOptimizer.js`, `RoomCard.jsx`, `RoomDetailsModal.jsx`, `RoomInventory.jsx`) routes room photos through the caching proxy, requesting 480px thumbnails for grids and preloading 1200px HD photos on hover for instantaneous modal opening.

**Tech Stack:** Node.js, Express, Sharp, MongoDB / Mongoose, Firebase Admin SDK, React 19, Vite, Tailwind CSS, Lucide React, Jest, Node.js Test Runner (`node:test`, `node:assert/strict`).

**Spec:** Alignment from `/grill-me` architectural interview on September 11, 2026.

## Global Constraints

- **Solid Colors & Strictly No Gradients**: All image container surfaces, loading states, and skeleton placeholders must strictly use solid neutral tokens (`1px solid var(--border)` / `bg-slate-100 dark:bg-slate-800` / `var(--card-muted, #f1f5f9)`). Strictly no background gradients, colored outlines, or decorative radial gradients.
- **Terminology Invariants**: Always use **"Tenant"** (never "Resident"), **"Assistant"** (never "Copilot"), **"Owner"** (never "Super Admin"), and **"Rent"** (never "Rental Fee").
- **100% Backward & Mobile Parity**: `Room.images` in MongoDB must strictly remain an array of string URLs (`[String]`) with valid public HTTPS URLs, ensuring full backward compatibility with mobile endpoints (`/api/mobile/...`) and existing controllers.
- **Zero Data Loss**: Legacy raw image files in Firebase Storage must be preserved as non-destructive safety fallbacks when new WebP variants are generated.
- **Verification Gates**: Every task must end with clean automated test execution. All backend tests (`npm test`) and frontend production build (`npm run build`) must pass with zero errors before completion.

---

## What to Expect from These Changes

| Dimension | Before Optimization | After Optimization |
|:---|:---|:---|
| **Room Card Picture Load Time** | **2.0s – 3.5s+** (heavy download from remote storage for every card) | **< 150ms** on first visit; **0ms (instant)** on subsequent visits via disk/memory cache |
| **Download Payload per Room Photo** | **200 KB – 650 KB** (raw uncompressed JPEGs) | **18 KB – 35 KB** (tightly compressed 480px WebP thumbnails) — **~90% bandwidth reduction** |
| **Repeat Browsing / Scrolling** | Re-downloads images repeatedly across rooms due to unshared paths | Served from browser disk cache or instant HTTP 304 (0 bytes transferred) |
| **Room Details Modal Opening** | Noticeable white/gray flash or delayed blank image loading | **Instant 0ms blank time**: Hovering any card preloads the HD image, and modal displays instant crisp thumbnail with smooth HD fade-in |
| **Visual Styling & Accessibility** | Layout shift and slow spinners | Solid neutral surfaces (`1px solid var(--border)` / `bg-slate-100 dark:bg-slate-800`), strictly no gradients, zero layout shift |
| **Database & Mobile Parity** | Raw uncompressed JPEG URLs in MongoDB | 100% backward compatible: `Room.images` array remains `[String]` containing valid HTTPS URLs, safe for mobile and web |

---

## File Structure & Responsibility Map

```
Capstone-Website/
├── server/
│   ├── controllers/
│   │   ├── imageOptimizationController.js     # NEW: Express controller with Sharp resizing, LRU & disk cache, ETags
│   │   ├── imageOptimizationController.test.js# NEW: Unit tests for caching proxy, SSRF validation, and headers
│   │   └── roomPhotoController.js             # MODIFY: Ensure new uploads produce 1-year immutable cache WebPs
│   ├── routes/
│   │   ├── roomsRoutes.js                     # MODIFY: Expose public GET /api/rooms/photos/optimize
│   │   └── roomPhotoOptimizationRoute.test.js # NEW: Integration tests for optimization route
│   └── scripts/
│       ├── optimizeExistingRoomPhotos.mjs     # NEW: Safe CLI migration script for Firebase Storage & MongoDB
│       └── optimizeExistingRoomPhotos.test.mjs# NEW: Tests verifying migration logic and dry-run safety
└── web/
    └── src/
        ├── shared/
        │   ├── utils/
        │   │   ├── imageOptimizer.js          # MODIFY: Route Firebase URLs to optimization proxy + fallback safety
        │   │   └── imageOptimizer.behavior.test.mjs # NEW: Unit tests for URL transformations and fallbacks
        │   └── components/
        │       └── ProgressiveImage.jsx       # MODIFY: Proxy resilience fallback handling
        └── features/
            ├── tenant/
            │   ├── pages/
            │   │   └── check-availability/
            │   │       ├── RoomCard.jsx       # MODIFY: Request 480px thumbnail, prefetch 1200px HD on hover
            │   │       └── RoomCard.imageOptimization.test.mjs # NEW: Tests verifying thumbnail URLs and preloading
            │   └── modals/
            │       └── RoomDetailsModal.jsx   # MODIFY: Layered blur-up (thumbnail base + HD smooth fade-in)
            └── public/
                └── components/
                    └── RoomInventory.jsx      # MODIFY: Wire thumbnails to public landing cards
```

---

## Tasks

### Task 1: Backend Image Optimization Controller & Cache Engine

**Files:**
- Create: `Capstone-Website/server/controllers/imageOptimizationController.js`
- Create: `Capstone-Website/server/controllers/imageOptimizationController.test.js`

**Interfaces:**
- Consumes: Node `crypto`, `fs`, `path`, `sharp`, `AppError` from `../middleware/errorHandler.js`
- Produces: `export const optimizeRoomPhoto = async (req, res, next) => { ... }`
  - Handles `GET /api/rooms/photos/optimize?url=...&w=...&q=...`
  - Responds with `image/webp` binary buffer, `ETag`, `Cache-Control: public, max-age=31536000, immutable`, or `304 Not Modified`.

- [ ] **Step 1: Write the failing test**

Create `Capstone-Website/server/controllers/imageOptimizationController.test.js`:

```javascript
import { jest } from "@jest/globals";
import { optimizeRoomPhoto, validateImageUrl, getCacheKey } from "./imageOptimizationController.js";

describe("Image Optimization Controller", () => {
  test("validateImageUrl allows Firebase Storage and Google Storage URLs only", () => {
    expect(validateImageUrl("https://storage.googleapis.com/bucket/room-photos/1/photo.jpg")).toBe(true);
    expect(validateImageUrl("https://firebasestorage.googleapis.com/v0/b/bucket/o/photo.jpg")).toBe(true);
    expect(validateImageUrl("https://malicious-site.com/exploit.jpg")).toBe(false);
    expect(validateImageUrl("http://localhost:5000/internal")).toBe(false);
    expect(validateImageUrl("")).toBe(false);
    expect(validateImageUrl(null)).toBe(false);
  });

  test("getCacheKey generates deterministic MD5 hash string", () => {
    const key1 = getCacheKey("https://storage.googleapis.com/photo.jpg", 480, 80, "webp");
    const key2 = getCacheKey("https://storage.googleapis.com/photo.jpg", 480, 80, "webp");
    const key3 = getCacheKey("https://storage.googleapis.com/photo.jpg", 1200, 80, "webp");

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(typeof key1).toBe("string");
    expect(key1.length).toBe(32);
  });

  test("optimizeRoomPhoto rejects disallowed URLs with 400 AppError", async () => {
    const req = { query: { url: "https://evil.com/pic.jpg" }, headers: {} };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();

    await optimizeRoomPhoto(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_IMAGE_URL");
  });

  test("optimizeRoomPhoto responds with 304 when ETag matches If-None-Match", async () => {
    const targetUrl = "https://storage.googleapis.com/bucket/room-photos/test.webp";
    const cacheKey = getCacheKey(targetUrl, 480, 80, "webp");
    const expectedEtag = `W/"${cacheKey}"`;

    const req = {
      query: { url: targetUrl, w: "480", q: "80" },
      headers: { "if-none-match": expectedEtag },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    await optimizeRoomPhoto(req, res, next);
    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `Capstone-Website/server`:
```bash
npm test -- controllers/imageOptimizationController.test.js
```
Expected: FAIL with "Cannot find module './imageOptimizationController.js'"

- [ ] **Step 3: Write minimal implementation**

Create `Capstone-Website/server/controllers/imageOptimizationController.js`:

```javascript
/**
 * =============================================================================
 * IMAGE OPTIMIZATION CONTROLLER
 * =============================================================================
 *
 * High-performance image resizing and WebP conversion proxy for room photos.
 *
 * Features:
 *   - SSRF Protection: strictly whitelists Firebase Storage & Google Storage hosts
 *   - Two-tier caching: In-Memory LRU (500 items) + Local Disk Cache (`server/tmp/image-cache`)
 *   - HTTP ETag & 304 Not Modified validation for instant repeat visits
 *   - 1-Year immutable browser caching (`Cache-Control: public, max-age=31536000, immutable`)
 *   - Aspect-ratio preserving WebP conversion via Sharp
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { AppError } from "../middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuration ────────────────────────────────────────────────────────────
const DISK_CACHE_DIR = path.resolve(__dirname, "../tmp/image-cache");
const MAX_MEMORY_CACHE_ITEMS = 500;
const ALLOWED_HOSTS = new Set([
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
]);

// In-Memory LRU Cache: Map<cacheKey, { buffer: Buffer, etag: string, contentType: string, timestamp: number }>
const memoryCache = new Map();

// Ensure local disk cache directory exists
try {
  if (!fs.existsSync(DISK_CACHE_DIR)) {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("⚠️  Could not create disk cache directory:", err.message);
}

/**
 * Validates whether the given URL string belongs to an authorized cloud storage origin.
 * Prevents Server-Side Request Forgery (SSRF).
 */
export function validateImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Generates a deterministic MD5 hash for a given URL and transformation parameters.
 */
export function getCacheKey(url, width, quality, format = "webp") {
  return crypto
    .createHash("md5")
    .update(`${url}|${width}|${quality}|${format}`)
    .digest("hex");
}

/**
 * Evicts the oldest item from memory cache if size limit is reached.
 */
function setMemoryCache(key, value) {
  if (memoryCache.size >= MAX_MEMORY_CACHE_ITEMS) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, value);
}

/**
 * GET /api/rooms/photos/optimize
 *
 * Query Parameters:
 *   - url: Firebase Storage / Google Storage HTTPS URL (required)
 *   - w: Target width (int, 50-1920, default 480)
 *   - q: WebP quality (int, 50-95, default 80)
 *   - format: "webp" (default)
 */
export const optimizeRoomPhoto = async (req, res, next) => {
  try {
    const { url, w, q, format = "webp" } = req.query;

    // 1. SSRF and parameter validation
    if (!validateImageUrl(url)) {
      throw new AppError(
        "Invalid or disallowed image URL. Only authorized cloud storage URLs are accepted.",
        400,
        "INVALID_IMAGE_URL",
      );
    }

    const width = Math.min(1920, Math.max(50, parseInt(w, 10) || 480));
    const quality = Math.min(95, Math.max(50, parseInt(q, 10) || 80));
    const targetFormat = format === "webp" ? "webp" : "webp";

    const cacheKey = getCacheKey(url, width, quality, targetFormat);
    const etag = `W/"${cacheKey}"`;

    // 2. HTTP 304 / ETag validation
    const clientEtag = req.headers["if-none-match"];
    if (clientEtag && clientEtag === etag) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(304).end();
    }

    // 3. Tier 1: In-Memory LRU Cache Hit
    const memoryHit = memoryCache.get(cacheKey);
    if (memoryHit) {
      res.setHeader("Content-Type", memoryHit.contentType);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Cache", "HIT-MEMORY");
      return res.status(200).send(memoryHit.buffer);
    }

    // 4. Tier 2: Local Disk Cache Hit
    const diskPath = path.join(DISK_CACHE_DIR, `${cacheKey}.${targetFormat}`);
    if (fs.existsSync(diskPath)) {
      try {
        const diskBuffer = await fs.promises.readFile(diskPath);
        setMemoryCache(cacheKey, {
          buffer: diskBuffer,
          etag,
          contentType: "image/webp",
          timestamp: Date.now(),
        });

        res.setHeader("Content-Type", "image/webp");
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("X-Cache", "HIT-DISK");
        return res.status(200).send(diskBuffer);
      } catch (readErr) {
        console.warn("⚠️  Failed reading disk cache, proceeding to fresh fetch:", readErr.message);
      }
    }

    // 5. Cache Miss: Fetch origin image from Firebase Storage
    const originResponse = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!originResponse.ok) {
      throw new AppError(
        `Failed to retrieve origin photo (HTTP ${originResponse.status}).`,
        502,
        "IMAGE_FETCH_FAILED",
      );
    }

    const arrayBuffer = await originResponse.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // 6. Process with Sharp
    const optimizedBuffer = await sharp(inputBuffer)
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    // 7. Store in caches (asynchronous disk write)
    setMemoryCache(cacheKey, {
      buffer: optimizedBuffer,
      etag,
      contentType: "image/webp",
      timestamp: Date.now(),
    });

    fs.promises.writeFile(diskPath, optimizedBuffer).catch((writeErr) => {
      console.warn("⚠️  Could not write to disk cache:", writeErr.message);
    });

    // 8. Send Response
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS");
    return res.status(200).send(optimizedBuffer);
  } catch (err) {
    next(err);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run from `Capstone-Website/server`:
```bash
npm test -- controllers/imageOptimizationController.test.js
```
Expected: PASS with 4 tests passed.

- [ ] **Step 5: Commit changes**

```bash
git add server/controllers/imageOptimizationController.js server/controllers/imageOptimizationController.test.js
git commit -m "feat(server): add image optimization controller with Sharp and two-tier caching"
```

---

### Task 2: Wire Optimization Route & Enhance Upload Controller

**Files:**
- Modify: `Capstone-Website/server/routes/roomsRoutes.js:40-85`
- Modify: `Capstone-Website/server/controllers/roomPhotoController.js:100-175`
- Create: `Capstone-Website/server/routes/roomPhotoOptimizationRoute.test.js`

**Interfaces:**
- Consumes: `optimizeRoomPhoto` from `../controllers/imageOptimizationController.js`
- Produces: Route `GET /api/rooms/photos/optimize` registered before `/:roomId/photos`
- Enhances: `POST /api/rooms/:roomId/photos` to return `{ urls, items: [{ url, thumbnailUrl }] }` with 1-year cache headers.

- [ ] **Step 1: Write the failing test**

Create `Capstone-Website/server/routes/roomPhotoOptimizationRoute.test.js`:

```javascript
import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";
import roomsRouter from "./roomsRoutes.js";

describe("Room Photo Optimization Route", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/rooms", roomsRouter);
    // Standard error handler
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        error: { message: err.message, code: err.code },
      });
    });
  });

  test("GET /api/rooms/photos/optimize returns 400 for missing url parameter", async () => {
    const res = await request(app).get("/api/rooms/photos/optimize");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_IMAGE_URL");
  });

  test("GET /api/rooms/photos/optimize rejects non-whitelisted host with 400", async () => {
    const res = await request(app)
      .get("/api/rooms/photos/optimize")
      .query({ url: "https://unknown-host.com/image.jpg" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_IMAGE_URL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `Capstone-Website/server`:
```bash
npm test -- routes/roomPhotoOptimizationRoute.test.js
```
Expected: FAIL (either 404 Route Not Found or path misrouted to `:roomId`).

- [ ] **Step 3: Implement minimal route wiring and upload controller updates**

In `Capstone-Website/server/routes/roomsRoutes.js`:
Add import:
```javascript
import { optimizeRoomPhoto } from "../controllers/imageOptimizationController.js";
```
Register the public route BEFORE `/:roomId/photos`:
```javascript
/**
 * GET /api/rooms/photos/optimize
 *
 * Public dynamic image optimization and caching proxy for room photos.
 * Generates WebP format, resizes on demand, and returns 1-year immutable cache headers.
 */
router.get("/photos/optimize", optimizeRoomPhoto);
```

In `Capstone-Website/server/controllers/roomPhotoController.js`:
Ensure lines 135-156 explicitly include `cacheControl: "public, max-age=31536000, immutable"` and `uploadResults` maps both `url` and `thumbnailUrl`:
```javascript
    res.status(200).json({
      success: true,
      data: {
        urls: uploadedUrls,
        items: uploadResults,
      },
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run from `Capstone-Website/server`:
```bash
npm test -- routes/roomPhotoOptimizationRoute.test.js
```
Expected: PASS with 2 tests passed.

- [ ] **Step 5: Commit changes**

```bash
git add server/routes/roomsRoutes.js server/controllers/roomPhotoController.js server/routes/roomPhotoOptimizationRoute.test.js
git commit -m "feat(server): register /api/rooms/photos/optimize public endpoint"
```

---

### Task 3: Cloud Storage & Database WebP Re-Compression Migration Script

**Files:**
- Create: `Capstone-Website/server/scripts/optimizeExistingRoomPhotos.mjs`
- Create: `Capstone-Website/server/scripts/optimizeExistingRoomPhotos.test.mjs`

**Interfaces:**
- Consumes: Mongoose `Room` model, Firebase Admin Storage bucket, `sharp`.
- Produces: CLI tool `node scripts/optimizeExistingRoomPhotos.mjs [--dry-run] [--write] [--limit=N]`.
  - Non-destructive: converts legacy `.jpg` files to `.webp` and `-thumb.webp`, uploads to Firebase Storage, and updates `Room.images` in MongoDB while leaving original JPGs intact.

- [ ] **Step 1: Write the failing test**

Create `Capstone-Website/server/scripts/optimizeExistingRoomPhotos.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldOptimizeUrl, buildWebpStoragePaths } from "./optimizeExistingRoomPhotos.mjs";

test("shouldOptimizeUrl identifies non-webp or missing thumbnail URLs", () => {
  assert.equal(
    shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/123/photo.jpg"),
    true,
  );
  assert.equal(
    shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/123/Private_Rm_T_B.JPG"),
    true,
  );
  assert.equal(
    shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/123/photo.webp"),
    false,
  );
  assert.equal(shouldOptimizeUrl(""), false);
  assert.equal(shouldOptimizeUrl(null), false);
});

test("buildWebpStoragePaths extracts clean WebP and thumbnail storage paths", () => {
  const paths = buildWebpStoragePaths(
    "https://storage.googleapis.com/bucket/room-photos/room123/private_room_copy.jpg",
    "room123",
  );

  assert.equal(paths.fullPath, "room-photos/room123/private_room_copy.webp");
  assert.equal(paths.thumbPath, "room-photos/room123/private_room_copy-thumb.webp");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `Capstone-Website/server`:
```bash
node --test scripts/optimizeExistingRoomPhotos.test.mjs
```
Expected: FAIL with "Cannot find module './optimizeExistingRoomPhotos.mjs'"

- [ ] **Step 3: Write the migration script**

Create `Capstone-Website/server/scripts/optimizeExistingRoomPhotos.mjs`:

```javascript
/**
 * =============================================================================
 * ROOM PHOTO WEBP RE-COMPRESSION & MIGRATION SCRIPT
 * =============================================================================
 *
 * Inspects all rooms in MongoDB, checks for uncompressed or legacy JPEG photos,
 * generates optimized WebP variants (1200px HD and 480px thumbnail) via Sharp,
 * uploads them to Firebase Storage with 1-year immutable cache control, and updates
 * MongoDB `Room.images` pointers.
 *
 * SAFETY INVARIANT: Legacy JPG files in Firebase Storage are NOT deleted.
 *
 * Usage:
 *   Dry run (scan only):
 *     node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --dry-run
 *
 *   Live migration (write to Storage and MongoDB):
 *     node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --write
 */

import "dotenv/config";
import path from "path";
import mongoose from "mongoose";
import admin from "firebase-admin";
import sharp from "sharp";

export function shouldOptimizeUrl(url) {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  // If it's not already a webp, it definitely needs optimization
  return !lower.includes(".webp");
}

export function buildWebpStoragePaths(url, roomId) {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    const basename = path.basename(pathname);
    const nameWithoutExt = path.parse(basename).name.replace(/[^a-zA-Z0-9._-]/g, "_");
    return {
      fullPath: `room-photos/${roomId}/${nameWithoutExt}.webp`,
      thumbPath: `room-photos/${roomId}/${nameWithoutExt}-thumb.webp`,
    };
  } catch {
    const fallbackName = `photo-${Date.now()}`;
    return {
      fullPath: `room-photos/${roomId}/${fallbackName}.webp`,
      thumbPath: `room-photos/${roomId}/${fallbackName}-thumb.webp`,
    };
  }
}

function initFirebase() {
  if (admin.apps.length) return;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      universe_domain: "googleapis.com",
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

async function run() {
  const isWrite = process.argv.includes("--write");
  const isDryRun = process.argv.includes("--dry-run") || !isWrite;

  console.log("==================================================");
  console.log("  ROOM PHOTO WEBP OPTIMIZATION MIGRATION TOOL");
  console.log(`  Mode: ${isWrite ? "🔥 LIVE WRITE" : "🔍 DRY RUN (Audit Only)"}`);
  console.log("==================================================\n");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅  Connected to MongoDB");

  initFirebase();
  const bucket = admin.storage().bucket();
  console.log(`✅  Connected to Firebase Storage: ${bucket.name}\n`);

  const Room = mongoose.model(
    "Room",
    new mongoose.Schema({}, { strict: false }),
    "rooms",
  );

  const rooms = await Room.find({
    images: { $exists: true, $not: { $size: 0 } },
  }).lean();

  console.log(`📋  Scanning ${rooms.length} room(s) with photos...\n`);

  let totalImagesScanned = 0;
  let totalNeedingOptimization = 0;
  let totalOptimized = 0;
  let roomsUpdated = 0;

  for (const room of rooms) {
    const roomId = String(room._id);
    const roomLabel = room.name || room.roomNumber || roomId;
    const images = Array.isArray(room.images) ? room.images : [];
    let roomModified = false;
    const updatedImages = [];

    for (const imgUrl of images) {
      totalImagesScanned++;
      if (!shouldOptimizeUrl(imgUrl)) {
        updatedImages.push(imgUrl);
        continue;
      }

      totalNeedingOptimization++;
      console.log(`  📸 [${roomLabel}] Found legacy photo: ${path.basename(imgUrl)}`);

      if (isDryRun) {
        updatedImages.push(imgUrl);
        continue;
      }

      // Download original image
      try {
        const response = await fetch(imgUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Process WebP Full HD (1200px max, 82% quality)
        const fullWebpBuffer = await sharp(buffer)
          .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        // Process WebP Thumbnail (480px max, 75% quality)
        const thumbWebpBuffer = await sharp(buffer)
          .resize({ width: 480, height: 360, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer();

        const { fullPath, thumbPath } = buildWebpStoragePaths(imgUrl, roomId);

        // Upload Full HD
        const fullFileRef = bucket.file(fullPath);
        await fullFileRef.save(fullWebpBuffer, {
          metadata: {
            contentType: "image/webp",
            cacheControl: "public, max-age=31536000, immutable",
            metadata: { roomId, variant: "full" },
          },
        });
        await fullFileRef.makePublic();
        const newFullUrl = `https://storage.googleapis.com/${bucket.name}/${fullPath}`;

        // Upload Thumbnail
        const thumbFileRef = bucket.file(thumbPath);
        await thumbFileRef.save(thumbWebpBuffer, {
          metadata: {
            contentType: "image/webp",
            cacheControl: "public, max-age=31536000, immutable",
            metadata: { roomId, variant: "thumbnail" },
          },
        });
        await thumbFileRef.makePublic();

        console.log(`    ↳ Converted to WebP HD: ${(fullWebpBuffer.length / 1024).toFixed(1)} KB`);
        console.log(`    ↳ Converted to Thumbnail: ${(thumbWebpBuffer.length / 1024).toFixed(1)} KB`);

        updatedImages.push(newFullUrl);
        roomModified = true;
        totalOptimized++;
      } catch (err) {
        console.error(`    ✗ Failed to optimize image ${imgUrl}: ${err.message}`);
        updatedImages.push(imgUrl); // retain original on error
      }
    }

    if (isWrite && roomModified) {
      await Room.updateOne({ _id: room._id }, { $set: { images: updatedImages } });
      roomsUpdated++;
    }
  }

  console.log("\n──────────────────────────────────────────────────");
  console.log(`Total Rooms Scanned:          ${rooms.length}`);
  console.log(`Total Images Scanned:         ${totalImagesScanned}`);
  console.log(`Legacy Images Identified:     ${totalNeedingOptimization}`);
  if (isWrite) {
    console.log(`Successfully Converted:       ${totalOptimized}`);
    console.log(`Rooms Updated in MongoDB:     ${roomsUpdated}`);
  }
  console.log("──────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

if (process.argv[1] && process.argv[1].endsWith("optimizeExistingRoomPhotos.mjs")) {
  run().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `Capstone-Website/server`:
```bash
node --test scripts/optimizeExistingRoomPhotos.test.mjs
```
Expected: PASS with 2 tests passed.

- [ ] **Step 5: Commit changes**

```bash
git add server/scripts/optimizeExistingRoomPhotos.mjs server/scripts/optimizeExistingRoomPhotos.test.mjs
git commit -m "feat(server): add room photo WebP re-compression migration script"
```

---

### Task 4: Enhance Frontend Image Optimizer Utility

**Files:**
- Modify: `Capstone-Website/web/src/shared/utils/imageOptimizer.js`
- Create: `Capstone-Website/web/src/shared/utils/imageOptimizer.behavior.test.mjs`

**Interfaces:**
- Consumes: Image URLs or `{ url, thumbnailUrl }` objects
- Produces:
  - `getOptimizedUrl(src, opts)`: routes Firebase photos to `/api/rooms/photos/optimize` with target dimensions
  - `getThumbnailUrl(src, opts)`: routes or maps to companion thumbnail (~480px)
  - `getImageFallbackUrl(src)`: decodes original URL if proxy encounters network error

- [ ] **Step 1: Write the failing test**

Create `Capstone-Website/web/src/shared/utils/imageOptimizer.behavior.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getOptimizedUrl, getThumbnailUrl, getImageFallbackUrl } from "./imageOptimizer.js";

test("getOptimizedUrl transforms Firebase Storage URL to backend proxy with width and quality", () => {
  const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
  const optimized = getOptimizedUrl(original, { width: 800, quality: 80 });

  assert.match(optimized, /\/api\/rooms\/photos\/optimize\?url=/);
  assert.match(optimized, /w=800/);
  assert.match(optimized, /q=80/);
});

test("getThumbnailUrl transforms URL to 480px width thumbnail", () => {
  const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
  const thumb = getThumbnailUrl(original);

  assert.match(thumb, /\/api\/rooms\/photos\/optimize\?url=/);
  assert.match(thumb, /w=480/);
  assert.match(thumb, /q=75/);
});

test("getImageFallbackUrl extracts raw URL from an optimization proxy URL", () => {
  const original = "https://storage.googleapis.com/bucket/room-photos/1/photo.webp";
  const proxyUrl = getOptimizedUrl(original, { width: 480 });
  const fallback = getImageFallbackUrl(proxyUrl);

  assert.equal(fallback, original);
});

test("getOptimizedUrl leaves bundled local assets untouched", () => {
  const localAsset = "/assets/images/branches/gil-puyat/Pic_quad.webp";
  assert.equal(getOptimizedUrl(localAsset), localAsset);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from project root:
```bash
node --test Capstone-Website/web/src/shared/utils/imageOptimizer.behavior.test.mjs
```
Expected: FAIL (proxy routing not yet implemented).

- [ ] **Step 3: Update `imageOptimizer.js`**

Modify `Capstone-Website/web/src/shared/utils/imageOptimizer.js`:

```javascript
/**
 * imageOptimizer.js
 *
 * Utility helpers for optimizing image URLs before rendering.
 * Routes cloud storage room photos through the backend Sharp caching proxy
 * (`/api/rooms/photos/optimize`) to provide:
 *  1. Lightweight WebP compression (from 600KB -> 25KB)
 *  2. On-demand thumbnail resizing (480px for grids, 1200px for HD modals)
 *  3. In-memory & disk caching with HTTP 304 ETags for 0ms repeat loads
 */

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

/**
 * Returns true if the URL belongs to Firebase Storage or Google Cloud Storage.
 */
function isCloudStorageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    url.includes("storage.googleapis.com") ||
    url.includes("firebasestorage.googleapis.com")
  );
}

/**
 * Returns an optimized image URL.
 *
 * @param {string | { url?: string, thumbnailUrl?: string }} src - Original image URL or object
 * @param {{ width?: number, quality?: number }} opts
 * @returns {string}
 */
export function getOptimizedUrl(src, opts = {}) {
  if (!src) return "";

  const rawSrc = typeof src === "object" ? src.url || src.thumbnailUrl || "" : src;
  if (!rawSrc || typeof rawSrc !== "string") return "";

  const { width = 1200, quality = 82 } = opts;

  // ── Cloudinary ────────────────────────────────────────────────────────────
  if (CLOUDINARY_CLOUD && rawSrc.includes("cloudinary.com")) {
    return rawSrc.replace(
      /\/upload\//,
      `/upload/f_auto,q_auto:${quality},w_${width},c_fill,dpr_auto/`
    );
  }

  // ── Firebase Storage / Google Storage -> Route to Backend Sharp Proxy ─────
  if (isCloudStorageUrl(rawSrc)) {
    // If the URL already targets our optimization proxy, don't double-wrap
    if (rawSrc.includes("/api/rooms/photos/optimize")) {
      return rawSrc;
    }
    return `/api/rooms/photos/optimize?url=${encodeURIComponent(rawSrc)}&w=${width}&q=${quality}&format=webp`;
  }

  // ── Fallback: return as-is (e.g. bundled local assets) ────────────────────
  return rawSrc;
}

/**
 * Returns a lightweight thumbnail image URL (~480px, ~75% quality).
 * Ideal for card grid previews to prevent bandwidth choke.
 *
 * @param {string | { url?: string, thumbnailUrl?: string }} src
 * @param {{ width?: number, quality?: number }} opts
 * @returns {string}
 */
export function getThumbnailUrl(src, opts = {}) {
  if (!src) return "";

  // If object already has explicit thumbnailUrl
  if (typeof src === "object" && src.thumbnailUrl) {
    return getOptimizedUrl(src.thumbnailUrl, { width: 480, quality: 75, ...opts });
  }

  const rawSrc = typeof src === "object" ? src.url || "" : src;
  if (!rawSrc || typeof rawSrc !== "string") return "";

  // If string has a companion -thumb.webp in cloud storage
  if (isCloudStorageUrl(rawSrc) && !rawSrc.includes("-thumb.") && rawSrc.endsWith(".webp")) {
    const thumbDirectUrl = rawSrc.replace(/\.webp$/, "-thumb.webp");
    return getOptimizedUrl(thumbDirectUrl, { width: 480, quality: 75, ...opts });
  }

  return getOptimizedUrl(rawSrc, { width: 480, quality: 75, ...opts });
}

/**
 * Extracts the original source URL if the image URL is an optimization proxy URL.
 * Used for graceful fallback if the proxy request encounters an error.
 *
 * @param {string} url
 * @returns {string}
 */
export function getImageFallbackUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.includes("/api/rooms/photos/optimize?url=")) {
    try {
      const parsed = new URL(url, "http://localhost");
      const originUrl = parsed.searchParams.get("url");
      if (originUrl) return decodeURIComponent(originUrl);
    } catch {
      // ignore
    }
  }
  return url;
}

/**
 * Returns true if the src is a remote URL (Firebase / Cloudinary / http).
 * @param {string | object} src
 * @returns {boolean}
 */
export function isRemoteImage(src) {
  const target = typeof src === "object" ? src?.url || src?.thumbnailUrl : src;
  if (!target || typeof target !== "string") return false;
  return target.startsWith("http://") || target.startsWith("https://") || target.startsWith("/api/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from project root:
```bash
node --test Capstone-Website/web/src/shared/utils/imageOptimizer.behavior.test.mjs
```
Expected: PASS with 4 tests passed.

- [ ] **Step 5: Commit changes**

```bash
git add web/src/shared/utils/imageOptimizer.js web/src/shared/utils/imageOptimizer.behavior.test.mjs
git commit -m "feat(web): route cloud photos to Sharp optimization proxy with thumbnail defaults"
```

---

### Task 5: Upgrade Frontend Components (RoomCard, RoomDetailsModal, RoomInventory, ProgressiveImage)

**Files:**
- Modify: `Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.jsx`
- Modify: `Capstone-Website/web/src/features/tenant/modals/RoomDetailsModal.jsx`
- Modify: `Capstone-Website/web/src/features/public/components/RoomInventory.jsx`
- Modify: `Capstone-Website/web/src/shared/components/ProgressiveImage.jsx`
- Create: `Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.imageOptimization.test.mjs`

**Interfaces:**
- Consumes: `getThumbnailUrl`, `getOptimizedUrl`, `getImageFallbackUrl` from `imageOptimizer.js`
- Produces:
  - `RoomCard`: Loads 480px thumbnails, hover-preloads 1200px HD photo
  - `RoomDetailsModal`: Dual-layer blur-up (instant thumbnail base + smooth HD overlay)
  - `ProgressiveImage`: Fallback recovery on error

- [ ] **Step 1: Write the failing test**

Create `Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.imageOptimization.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("RoomCard.jsx uses getThumbnailUrl and preloads HD image on mouse enter", () => {
  const roomCardPath = path.resolve(__dirname, "./RoomCard.jsx");
  const content = fs.readFileSync(roomCardPath, "utf-8");

  // Verify getThumbnailUrl is imported and used
  assert.match(content, /getThumbnailUrl/);
  // Verify HD preloading on hover with getOptimizedUrl
  assert.match(content, /getOptimizedUrl\(primaryRaw,\s*\{\s*width:\s*1200/);
  // Verify solid neutral placeholder
  assert.match(content, /var\(--card-muted,\s*#f1f5f9\)/);
});

test("RoomDetailsModal.jsx implements layered blur-up with getThumbnailUrl and getOptimizedUrl", () => {
  const modalPath = path.resolve(__dirname, "../../modals/RoomDetailsModal.jsx");
  const content = fs.readFileSync(modalPath, "utf-8");

  assert.match(content, /getThumbnailUrl\(images\[currentImageIndex\],\s*\{\s*width:\s*480/);
  assert.match(content, /getOptimizedUrl\(images\[currentImageIndex\],\s*\{\s*width:\s*1200/);
});
```

- [ ] **Step 2: Run test to verify it passes or check baseline**

Run from project root:
```bash
node --test Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.imageOptimization.test.mjs
```

- [ ] **Step 3: Update `ProgressiveImage.jsx`, `RoomCard.jsx`, `RoomDetailsModal.jsx`, and `RoomInventory.jsx`**

In `Capstone-Website/web/src/shared/components/ProgressiveImage.jsx`:
Import `getImageFallbackUrl` and add graceful retry:
```javascript
import { getOptimizedUrl, getImageFallbackUrl } from "../utils/imageOptimizer";
...
  const [hasFallbackRetried, setHasFallbackRetried] = useState(false);
  const optimizedSrc = getOptimizedUrl(src, optimizerOpts);

  const handleImageError = () => {
    if (!hasFallbackRetried && optimizedSrc.includes("/api/rooms/photos/optimize")) {
      setHasFallbackRetried(true);
      if (imgRef.current) {
        imgRef.current.src = getImageFallbackUrl(optimizedSrc);
      }
    } else {
      setStatus("error");
    }
  };
```

In `Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.jsx`:
Ensure image tag has error fallback:
```javascript
<img
  src={images[currentImageIndex]}
  alt={room.title || "Room photo"}
  loading={isPriority && currentImageIndex === 0 ? "eager" : "lazy"}
  fetchpriority={isPriority && currentImageIndex === 0 ? "high" : "low"}
  decoding="async"
  onLoad={() => setLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }))}
  onError={(e) => {
    const fallback = getImageFallbackUrl(images[currentImageIndex]);
    if (fallback && e.currentTarget.src !== fallback) {
      e.currentTarget.src = fallback;
    } else {
      setLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }));
    }
  }}
  style={{
    opacity: isCurrentLoaded ? 1 : 0,
    transition: "opacity 0.3s ease",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  }}
/>
```

In `Capstone-Website/web/src/features/public/components/RoomInventory.jsx`:
Ensure `ProgressiveImage` uses `optimizerOpts={{ width: 480, quality: 75 }}` and the first card has `priority`.

- [ ] **Step 4: Run test to verify it passes**

Run from project root:
```bash
node --test Capstone-Website/web/src/features/tenant/pages/check-availability/RoomCard.imageOptimization.test.mjs
```
Expected: PASS with 2 tests passed.

- [ ] **Step 5: Commit changes**

```bash
git add web/src/features/tenant/pages/check-availability/RoomCard.jsx web/src/features/tenant/modals/RoomDetailsModal.jsx web/src/features/public/components/RoomInventory.jsx web/src/shared/components/ProgressiveImage.jsx web/src/features/tenant/pages/check-availability/RoomCard.imageOptimization.test.mjs
git commit -m "feat(web): implement thumbnail-first rendering, hover preloading, and fallback resilience"
```

---

### Task 6: Migration Execution, Full Build & End-to-End Verification

**Files:**
- Execute: `Capstone-Website/server/scripts/optimizeExistingRoomPhotos.mjs`
- Verify: Full test suite in `Capstone-Website/server` and production build in `Capstone-Website/web`

- [ ] **Step 1: Run dry-run scan of room photos**

Run from `Capstone-Website/server`:
```bash
node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --dry-run
```
Expected: Scans all rooms, prints legacy photos identified without modifying database or storage.

- [ ] **Step 2: Run live migration to optimize existing photos**

Run from `Capstone-Website/server`:
```bash
node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --write
```
Expected: Converts legacy JPGs into `.webp` and `-thumb.webp`, uploads with public immutable cache headers, and updates MongoDB `Room.images` records.

- [ ] **Step 3: Run all backend tests**

Run from `Capstone-Website/server`:
```bash
npm test
```
Expected: All test suites pass with 0 failures.

- [ ] **Step 4: Run frontend production build**

Run from `Capstone-Website/web`:
```bash
npm run build
```
Expected: Vite build succeeds with 0 errors.

- [ ] **Step 5: Commit migration artifacts and final plan**

```bash
git add docs/superpowers/plans/2026-09-11-room-photo-optimization.md
git commit -m "docs: finalize room photo performance and optimization architecture plan"
```

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
