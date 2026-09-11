/**
 * imageOptimizer.js
 *
 * Utility helpers for optimizing image URLs before rendering.
 * Routes cloud storage room photos through the backend Sharp caching proxy
 * (`/api/rooms/photos/optimize`) to provide:
 *  1. Lightweight WebP compression (from 600KB -> ~25KB)
 *  2. On-demand thumbnail resizing (480px for grids, 1200px for HD modals)
 *  3. In-memory & disk caching with HTTP 304 ETags for 0ms repeat loads
 *  4. Safe fallback extraction when proxy requests encounter network issues
 */

const CLOUDINARY_CLOUD =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) ||
  (typeof process !== "undefined" && process.env ? process.env.VITE_CLOUDINARY_CLOUD_NAME : undefined);

/**
 * Returns true if the URL belongs to Firebase Storage or Google Cloud Storage.
 * Excludes already-proxied optimization URLs.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isCloudStorageUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.includes("/api/rooms/photos/optimize")) return false;
  return (
    url.includes("storage.googleapis.com") ||
    url.includes("firebasestorage.googleapis.com")
  );
}

/**
 * Returns an optimized image URL.
 *
 * - Handles string URLs or image objects { url, thumbnailUrl }
 * - Already-proxied URLs (/api/rooms/photos/optimize) returned as-is
 * - Cloud storage URLs: routed to backend Sharp caching proxy (/api/rooms/photos/optimize)
 * - Cloudinary URLs: appends f_auto,q_auto,w_{width} transforms if CLOUDINARY_CLOUD is set
 * - Local / bundled assets, data URLs, relative paths: returned as-is
 *
 * @param {string | { url?: string, thumbnailUrl?: string }} src - Original image URL or object
 * @param {{ width?: number, quality?: number, format?: string }} opts
 * @returns {string}
 */
export function getOptimizedUrl(src, opts = {}) {
  if (!src) return "";

  // Support structured image objects
  const rawSrc = typeof src === "object" ? src.url || src.thumbnailUrl || "" : src;
  if (!rawSrc || typeof rawSrc !== "string") return "";

  const { width = 1200, quality = 82, format = "webp" } = opts;

  // ── Optimization Proxy Guard: prevent double-wrapping ─────────────────────
  if (rawSrc.includes("/api/rooms/photos/optimize")) {
    return rawSrc;
  }

  // ── Cloudinary ────────────────────────────────────────────────────────────
  if (CLOUDINARY_CLOUD && rawSrc.includes("cloudinary.com")) {
    return rawSrc.replace(
      /\/upload\//,
      `/upload/f_auto,q_auto:${quality},w_${width},c_fill,dpr_auto/`
    );
  }

  // ── Firebase Storage / Google Storage -> Route to Backend Sharp Proxy ─────
  if (isCloudStorageUrl(rawSrc)) {
    return `/api/rooms/photos/optimize?url=${encodeURIComponent(rawSrc)}&w=${width}&q=${quality}&format=${format}`;
  }

  // ── Fallback: return as-is (e.g. bundled local assets, data URLs) ──────────
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

  const defaultOpts = { width: 480, quality: 75, ...opts };

  // If object already has explicit thumbnailUrl
  if (typeof src === "object" && src.thumbnailUrl) {
    return getOptimizedUrl(src.thumbnailUrl, defaultOpts);
  }

  const rawSrc = typeof src === "object" ? src.url || "" : src;
  if (!rawSrc || typeof rawSrc !== "string") return "";

  // If string already contains thumb suffix
  if (rawSrc.includes("-thumb.")) {
    return getOptimizedUrl(rawSrc, defaultOpts);
  }

  // If string ends with .webp and is cloud storage without -thumb., use companion thumb
  if (isCloudStorageUrl(rawSrc) && !rawSrc.includes("-thumb.") && /\.webp(\?.*)?$/i.test(rawSrc)) {
    const thumbCompanionUrl = rawSrc.replace(/\.webp(\?.*)?$/i, (match, query) => `-thumb.webp${query || ""}`);
    return getOptimizedUrl(thumbCompanionUrl, defaultOpts);
  }

  // Cloudinary transform or default pass
  return getOptimizedUrl(rawSrc, defaultOpts);
}

/**
 * Extracts the original source URL if the image URL is an optimization proxy URL.
 * Used for graceful fallback if the proxy request encounters an error.
 * If not a proxy URL, returns url unchanged.
 *
 * @param {string} url
 * @returns {string}
 */
export function getImageFallbackUrl(url) {
  if (!url || typeof url !== "string") return url || "";
  if (url.includes("/api/rooms/photos/optimize")) {
    try {
      const parsed = new URL(url, "http://localhost");
      const originUrl = parsed.searchParams.get("url");
      if (originUrl) {
        return originUrl.startsWith("http%3A") || originUrl.startsWith("https%3A")
          ? decodeURIComponent(originUrl)
          : originUrl;
      }
    } catch {
      // return unchanged on parse failure
    }
  }
  return url;
}

/**
 * Returns true if the src is a remote URL (Firebase / Cloudinary / http / proxy endpoint)
 * as opposed to a local bundled asset.
 *
 * @param {string | { url?: string, thumbnailUrl?: string }} src
 * @returns {boolean}
 */
export function isRemoteImage(src) {
  const target = typeof src === "object" ? src?.url || src?.thumbnailUrl : src;
  if (!target || typeof target !== "string") return false;
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("/api/")
  );
}

/**
 * Global cache set of preloaded image URLs to prevent redundant network calls
 */
const PRELOADED_IMAGE_SET = new Set();

/**
 * Proactively prefetches an optimized image URL into the browser cache.
 * Safe to call repeatedly during user interactions (e.g. mouse hover or modal mount).
 *
 * @param {string | { url?: string, thumbnailUrl?: string }} src
 * @param {{ width?: number, quality?: number, format?: string }} opts
 * @returns {string} - The optimized URL that was prefetched
 */
export function prefetchOptimizedImage(src, opts = { width: 1200, quality: 82 }) {
  if (typeof window === "undefined" || typeof Image === "undefined" || !src) return "";
  const targetUrl = getOptimizedUrl(src, opts);
  if (!targetUrl || targetUrl.startsWith("blob:") || targetUrl.startsWith("data:")) return targetUrl;

  if (PRELOADED_IMAGE_SET.has(targetUrl)) return targetUrl;
  PRELOADED_IMAGE_SET.add(targetUrl);

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = targetUrl;
  } catch {
    // Non-blocking catch if Image constructor is not available in test runner
  }

  return targetUrl;
}

