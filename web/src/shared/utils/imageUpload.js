/**
 * ImageKit Upload Utility
 *
 * Uploads files directly from the browser to ImageKit
 * using server-side authentication tokens.
 */

import { authFetch } from "../api/httpClient";

const IMAGEKIT_PUBLIC_KEY =
  import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || "public_eaJhOUIs0CoSulY6AXFvfCI5WVo=";
const IMAGEKIT_URL_ENDPOINT =
  import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/g5vnq9bvb";

// ── Validation ─────────────────────────────────────────────
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Only JPEG, PNG, and PDF are accepted.
// HEIC (iPhone) and WebP are excluded because:
//   - HEIC has limited browser/server support and causes display issues
//   - WebP is a delivery format, not a document format — photos and IDs
//     should be submitted in universally readable formats
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

/**
 * Validate a file before uploading.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file) {
  if (!file || !(file instanceof File)) {
    return { valid: false, error: "No file selected" };
  }
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return { valid: false, error: `File too large (${sizeMB}MB). Maximum is 5MB.` };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: "Only JPEG, PNG, and PDF files are allowed. Please convert HEIC or WebP images before uploading." };
  }
  return { valid: true };
}

/**
 * Get authentication parameters from the server.
 * @returns {Promise<{ token: string, expire: number, signature: string }>}
 */
async function getAuthParams() {
  const data = await authFetch("/upload/imagekit-auth");
  // authFetch auto-unwraps { success, data } → returns data directly
  if (!data || !data.token) throw new Error("Unable to prepare file upload. Please try again.");
  return data;
}

/**
 * Upload a file to ImageKit.
 *
 * @param {File}     file         - The File object from <input type="file">
 * @param {Function} [onProgress] - Optional callback receiving 0-100 percent
 * @returns {Promise<string>}     - Resolves to the file URL
 */
export async function uploadToImageKit(file, onProgress) {
  // Validate first
  const check = validateFile(file);
  if (!check.valid) throw new Error(check.error);

  // Get server-side auth params
  const auth = await getAuthParams();

  const url = "https://upload.imagekit.io/api/v1/files/upload";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", auth.signature);
  formData.append("expire", auth.expire);
  formData.append("token", auth.token);
  formData.append("fileName", file.name);
  formData.append("folder", "/lilycrest");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Progress tracking
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url);
        } catch {
          reject(new Error("Upload completed but we couldn't process the response. Please try again."));
        }
      } else {
        reject(new Error("File upload failed. Please check your connection and try again."));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error — check your connection and try again")));
    xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled")));

    xhr.open("POST", url);
    xhr.send(formData);
  });
}

/**
 * Upload a file if it's a File object, otherwise return the existing value.
 *
 * @param {File|string|null} value - File object or existing URL/base64 string
 * @param {Function} [onProgress]  - Optional progress callback
 * @returns {Promise<string|null>} - ImageKit URL or existing value
 */
export async function uploadIfFile(value, onProgress) {
  if (value instanceof File) {
    return uploadToImageKit(value, onProgress);
  }
  return value || null;
}
