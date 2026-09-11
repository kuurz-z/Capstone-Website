/**
 * ============================================================================
 * IMAGE OPTIMIZATION CONTROLLER & CACHE ENGINE
 * ============================================================================
 *
 * Provides on-the-fly image resizing, format conversion (WebP), and a 2-tier
 * caching strategy (in-memory LRU + persistent disk cache) with HTTP conditional
 * caching (ETag / 304 Not Modified) and SSRF protection.
 * ============================================================================
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { AppError } from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import { resolveFirebaseStorageBucket } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ALLOWED_IMAGE_HOSTS = new Set([
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
]);

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const DEFAULT_IMAGE_CACHE_DIR = path.resolve(__dirname, "../tmp/image-cache");

export const getImageCacheDir = () =>
  process.env.IMAGE_CACHE_DIR || DEFAULT_IMAGE_CACHE_DIR;

/**
 * Validates that an image URL uses HTTPS and targets allowed Google Cloud Storage
 * or Firebase Storage hosts to prevent SSRF vulnerabilities.
 *
 * @param {string} rawUrl - Target image URL
 * @returns {boolean} - True if allowed, false otherwise
 */
export const validateImageUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") {
    return false;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (!ALLOWED_IMAGE_HOSTS.has(hostname)) {
      return false;
    }

    const pathname = parsed.pathname;
    if (!pathname || pathname === "/" || pathname.trim() === "") {
      return false;
    }

    // Guard against directory traversal attacks
    let decodedPathname;
    try {
      decodedPathname = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    if (pathname.includes("..") || decodedPathname.includes("..")) {
      return false;
    }

    // Verify valid storage resource structure
    if (hostname === "firebasestorage.googleapis.com") {
      if (!pathname.startsWith("/v0/b/")) {
        return false;
      }
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length < 3 || !segments[2]) {
        return false;
      }
    } else if (hostname === "storage.googleapis.com") {
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length < 2 || !segments[0] || !segments[1]) {
        return false;
      }
    }

    // Production bucket confinement check
    if (process.env.NODE_ENV === "production") {
      const configuredBucket = resolveFirebaseStorageBucket();
      if (configuredBucket) {
        const lowerBucket = configuredBucket.toLowerCase();
        const lowerPath = pathname.toLowerCase();
        const isFirebaseBucket =
          lowerPath.startsWith(`/v0/b/${lowerBucket}/`) ||
          lowerPath === `/v0/b/${lowerBucket}`;
        const isGcsBucket =
          lowerPath.startsWith(`/${lowerBucket}/`) ||
          lowerPath === `/${lowerBucket}`;
        if (!isFirebaseBucket && !isGcsBucket) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Generates a deterministic MD5 hash string representing the image cache key.
 *
 * @param {string} url - Source image URL
 * @param {number} width - Target width in pixels
 * @param {number} quality - WebP compression quality (50-95)
 * @param {string} [format="webp"] - Target format
 * @returns {string} - Deterministic MD5 hex string
 */
export const getCacheKey = (url, width, quality, format = "webp") => {
  const payload = `${url}|w=${width}|q=${quality}|f=${format}`;
  return crypto.createHash("md5").update(payload).digest("hex");
};

/**
 * Clamps a parsed integer between min and max, returning defaultVal if NaN.
 */
export const clampNumber = (val, min, max, defaultVal) => {
  const num = parseInt(val, 10);
  if (Number.isNaN(num)) return defaultVal;
  return Math.min(Math.max(num, min), max);
};

/**
 * Ensures Firebase Storage URLs include alt=media parameter before fetching origin bytes.
 */
export const normalizeOriginImageUrl = (rawUrl) => {
  if (typeof rawUrl !== "string") return rawUrl;
  if (rawUrl.includes("firebasestorage.googleapis.com") && !rawUrl.includes("alt=media")) {
    return rawUrl + (rawUrl.includes("?") ? "&" : "?") + "alt=media";
  }
  return rawUrl;
};

// ============================================================================
// IN-MEMORY LRU CACHE
// ============================================================================
const MAX_MEMORY_ITEMS = 500;
let memoryCacheLimit = MAX_MEMORY_ITEMS;
const memoryCache = new Map();

export const clearMemoryCache = () => {
  memoryCache.clear();
  inFlightRequests.clear();
  inFlightOriginFetches.clear();
};

export const getMemoryCacheSize = () => memoryCache.size;

export const setMemoryCacheLimit = (limit) => {
  memoryCacheLimit = limit;
};

const getFromMemoryCache = (key) => {
  if (!memoryCache.has(key)) return null;
  const value = memoryCache.get(key);
  // Re-insert to mark as most recently used in insertion-order Map
  memoryCache.delete(key);
  memoryCache.set(key, value);
  return value;
};

const setToMemoryCache = (key, buffer) => {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= memoryCacheLimit) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      memoryCache.delete(oldestKey);
    }
  }
  memoryCache.set(key, buffer);
};

// ============================================================================
// IN-FLIGHT DEDUPLICATION
// ============================================================================
const inFlightRequests = new Map();
const inFlightOriginFetches = new Map();

export const getInFlightRequestsCount = () => inFlightRequests.size;
export const getInFlightOriginFetchesCount = () => inFlightOriginFetches.size;

// ============================================================================
// CONTROLLER HANDLER
// ============================================================================

/**
 * Express handler for optimizing room photos on the fly.
 * @route GET /api/rooms/photo-optimized
 */
export const optimizeRoomPhoto = async (req, res, next) => {
  try {
    const rawUrl = req.query?.url;
    if (!rawUrl || !validateImageUrl(rawUrl)) {
      throw new AppError(
        "Invalid or disallowed image URL. Only Firebase Storage / Google Cloud Storage URLs are supported.",
        400,
        "INVALID_IMAGE_URL",
      );
    }

    const width = clampNumber(req.query?.w, 50, 1920, 480);
    const quality = clampNumber(req.query?.q, 50, 95, 80);
    const format = "webp";

    const normalizedUrl = normalizeOriginImageUrl(rawUrl);
    const cacheKey = getCacheKey(normalizedUrl, width, quality, format);
    const etag = `W/"${cacheKey}"`;

    const clientEtag =
      typeof req.get === "function"
        ? req.get("if-none-match")
        : req.headers?.["if-none-match"] || req.headers?.["If-None-Match"];

    if (
      clientEtag &&
      (clientEtag === etag ||
        clientEtag === cacheKey ||
        clientEtag === `"${cacheKey}"`)
    ) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(304).end();
    }

    // 1. Check in-memory LRU cache (Tier 1)
    const memBuffer = getFromMemoryCache(cacheKey);
    if (memBuffer) {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Cache", "HIT-MEMORY");
      return res.status(200).send(memBuffer);
    }

    // 2. Check disk cache (Tier 2)
    const cacheDir = getImageCacheDir();
    const diskPath = path.join(cacheDir, `${cacheKey}.webp`);
    try {
      const diskBuffer = await fs.readFile(diskPath);
      setToMemoryCache(cacheKey, diskBuffer);
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Cache", "HIT-DISK");
      return res.status(200).send(diskBuffer);
    } catch {
      // Disk cache miss or read error, proceed to fetch
    }

    // 3. Deduplicate in-flight fetch and Sharp processing (Tier 3)
    let optimizedBuffer;
    if (inFlightRequests.has(cacheKey)) {
      optimizedBuffer = await inFlightRequests.get(cacheKey);
    } else {
      const workPromise = (async () => {
        const fetchUrl = normalizedUrl;

        let originBuffer;
        if (inFlightOriginFetches.has(fetchUrl)) {
          originBuffer = await inFlightOriginFetches.get(fetchUrl);
        } else {
          const fetchPromise = (async () => {
            let originResponse;
            try {
              originResponse = await fetch(fetchUrl, {
                signal: AbortSignal.timeout(25000),
              });
            } catch (fetchErr) {
              if (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError") {
                throw new AppError(
                  "Image fetch timed out from origin storage",
                  504,
                  "IMAGE_FETCH_TIMEOUT",
                );
              }
              throw new AppError(
                `Failed to fetch image from origin: ${fetchErr.message}`,
                502,
                "IMAGE_FETCH_FAILED",
              );
            }

            if (
              !originResponse.ok &&
              (originResponse.status === 404 || originResponse.status === 403) &&
              /-thumb\.(webp|jpe?g|png)/i.test(fetchUrl)
            ) {
              // Companion thumbnail not found in storage — fall back to full original image and resize on the fly
              const originalUrl = fetchUrl.replace(/-thumb\.(webp|jpe?g|png)/i, ".$1");
              try {
                const fallbackRes = await fetch(originalUrl, {
                  signal: AbortSignal.timeout(25000),
                });
                if (fallbackRes.ok) {
                  originResponse = fallbackRes;
                }
              } catch {}
            }

            if (!originResponse.ok) {
              throw new AppError(
                `Failed to fetch image from origin storage (status: ${originResponse.status})`,
                originResponse.status === 404 ? 404 : 502,
                originResponse.status === 404 ? "IMAGE_NOT_FOUND" : "ORIGIN_FETCH_FAILED",
              );
            }

            // Pre-buffering payload guards: Content-Length and Content-Type
            const contentLengthHeader =
              typeof originResponse.headers?.get === "function"
                ? originResponse.headers.get("content-length")
                : originResponse.headers?.["content-length"] || originResponse.headers?.["Content-Length"];

            if (contentLengthHeader) {
              const contentLength = parseInt(contentLengthHeader, 10);
              if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_SIZE_BYTES) {
                throw new AppError(
                  "Image exceeds maximum allowed size (15MB)",
                  413,
                  "IMAGE_TOO_LARGE",
                );
              }
            }

            const contentTypeHeader =
              typeof originResponse.headers?.get === "function"
                ? originResponse.headers.get("content-type")
                : originResponse.headers?.["content-type"] || originResponse.headers?.["Content-Type"];

            if (contentTypeHeader) {
              const cleanContentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
              if (
                !cleanContentType.startsWith("image/") &&
                cleanContentType !== "application/octet-stream"
              ) {
                throw new AppError(
                  "Remote asset is not a valid image",
                  415,
                  "UNSUPPORTED_MEDIA_TYPE",
                );
              }
            }

            const arrayBuffer = await originResponse.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
              throw new AppError(
                "Image exceeds maximum allowed size (15MB)",
                413,
                "IMAGE_TOO_LARGE",
              );
            }

            return Buffer.from(arrayBuffer);
          })();

          inFlightOriginFetches.set(fetchUrl, fetchPromise);
          try {
            originBuffer = await fetchPromise;
          } finally {
            inFlightOriginFetches.delete(fetchUrl);
          }
        }

        let buf;
        try {
          buf = await sharp(originBuffer)
            .resize({ width, fit: "inside", withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();
        } catch (sharpErr) {
          throw new AppError(
            `Failed to process and optimize image: ${sharpErr.message}`,
            500,
            "IMAGE_PROCESSING_FAILED",
          );
        }

        // Save to disk cache asynchronously
        try {
          await fs.mkdir(cacheDir, { recursive: true });
          await fs.writeFile(diskPath, buf);
        } catch (writeErr) {
          logger.warn({ err: writeErr }, "Failed to write image to disk cache");
        }

        // Save to in-memory LRU cache
        setToMemoryCache(cacheKey, buf);
        return buf;
      })();

      inFlightRequests.set(cacheKey, workPromise);
      try {
        optimizedBuffer = await workPromise;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    }

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS");
    return res.status(200).send(optimizedBuffer);
  } catch (error) {
    if (typeof next === "function") {
      return next(error);
    }
    throw error;
  }
};
