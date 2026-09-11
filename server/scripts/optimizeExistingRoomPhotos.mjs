/**
 * =============================================================================
 * ROOM PHOTO WEBP OPTIMIZATION MIGRATION SCRIPT
 * =============================================================================
 *
 * Scans all Room records in MongoDB whose `images` array is non-empty.
 * Identifies legacy non-WebP room photos (JPEG, PNG, etc.), downloads them,
 * produces optimized Full HD (1200x900) and Thumbnail (480x360) WebP variants
 * via Sharp, uploads both to Firebase Storage under the room-photos/ bucket path,
 * and non-destructively updates the Room document with the new Full HD WebP URLs.
 *
 * SAFETY INVARIANTS:
 * - Read-only DRY-RUN by default unless --write is explicitly supplied.
 * - Non-destructive: legacy original files are NEVER deleted from Firebase Storage.
 * - Failed conversions keep the original URL so photos are never lost.
 *
 * CLI Usage (from server directory):
 *   node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --dry-run
 *   node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --write
 *   node --env-file=.env scripts/optimizeExistingRoomPhotos.mjs --limit=5
 * =============================================================================
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import sharp from "sharp";
import { getFirebaseStorage } from "../config/firebase.js";
import Room from "../models/Room.js";

// Load environment variables relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Checks whether a given photo URL requires WebP optimization.
 * Returns true if the URL is a non-empty string and does NOT contain '.webp' (case-insensitive).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function shouldOptimizeUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }
  return !url.toLowerCase().includes(".webp");
}

/**
 * Extracts a clean, sanitized filename without extension from a URL or filename string.
 * Decodes URI encoding (such as %20 or %2F) and replaces special characters with underscores.
 *
 * @param {string} url
 * @returns {string}
 */
export function extractCleanFilename(url) {
  const urlString = String(url || "").trim();
  const urlWithoutQuery = urlString.split(/[?#]/)[0];

  let decoded = urlWithoutQuery;
  try {
    decoded = decodeURIComponent(urlWithoutQuery);
  } catch {
    decoded = urlWithoutQuery;
  }

  const lastSlashIndex = decoded.lastIndexOf("/");
  const filenameWithExt = lastSlashIndex !== -1 ? decoded.slice(lastSlashIndex + 1) : decoded;
  const ext = path.extname(filenameWithExt);
  const rawName = ext ? filenameWithExt.slice(0, -ext.length) : filenameWithExt;

  return (rawName || "photo").replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
}

/**
 * Constructs the target Firebase Storage paths for Full HD and Thumbnail WebP variants.
 *
 * @param {string} url
 * @param {string} roomId
 * @returns {{ fullPath: string, thumbPath: string }}
 */
export function buildWebpStoragePaths(url, roomId) {
  const safeRoomId = String(roomId || "").trim();
  const cleanName = extractCleanFilename(url);

  return {
    fullPath: `room-photos/${safeRoomId}/${cleanName}.webp`,
    thumbPath: `room-photos/${safeRoomId}/${cleanName}-thumb.webp`,
  };
}

/**
 * Parses CLI arguments.
 *
 * @param {string[]} argv
 * @returns {{ write: boolean, dryRun: boolean, limit: number | null }}
 */
export function parseCliArgs(argv = process.argv.slice(2)) {
  const hasWrite = argv.includes("--write");
  const hasDryRun = argv.includes("--dry-run");

  let limit = null;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const val = parseInt(arg.split("=")[1], 10);
      if (!Number.isNaN(val) && val > 0) {
        limit = val;
      }
    }
  }

  if (limit === null) {
    const limitIdx = argv.indexOf("--limit");
    if (limitIdx !== -1 && argv[limitIdx + 1]) {
      const val = parseInt(argv[limitIdx + 1], 10);
      if (!Number.isNaN(val) && val > 0) {
        limit = val;
      }
    }
  }

  const dryRun = hasDryRun || !hasWrite;
  const write = hasWrite && !hasDryRun;

  return { write, dryRun, limit };
}

/**
 * Core migration and audit runner.
 *
 * @param {object} options
 * @param {boolean} [options.write=false] - Whether to perform live writes
 * @param {boolean} [options.dryRun=true] - Whether to perform read-only audit
 * @param {number|null} [options.limit=null] - Maximum rooms to process
 * @returns {Promise<object>} Summary statistics
 */
export async function optimizeExistingRoomPhotos(options = {}) {
  const isWrite = Boolean(options.write);
  const isDryRun = options.dryRun ?? !isWrite;
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : null;

  const stats = {
    mode: isDryRun ? "DRY-RUN (Audit Only)" : "WRITE (Live Migration)",
    roomsScanned: 0,
    imagesScanned: 0,
    imagesNeedingOptimization: 0,
    imagesConverted: 0,
    roomsUpdated: 0,
    errors: [],
  };

  console.log("\n=============================================================================");
  console.log("             ROOM PHOTO WEBP OPTIMIZATION MIGRATION                          ");
  console.log("=============================================================================");
  console.log(`Execution Mode:  ${stats.mode}`);
  if (limit) console.log(`Room Limit:      ${limit}`);
  console.log("-----------------------------------------------------------------------------\n");

  let shouldDisconnect = false;
  if (mongoose.connection.readyState !== 1) {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment variables.");
    }
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    shouldDisconnect = true;
    console.log("✅ Connected to MongoDB.\n");
  }

  let bucket = null;
  try {
    bucket = getFirebaseStorage();
    console.log(`📦 Firebase Storage Bucket: ${bucket.name}\n`);
  } catch (err) {
    if (isWrite) {
      throw new Error(`Firebase Storage initialization failed in write mode: ${err.message}`);
    } else {
      console.warn(`⚠️  Firebase Storage not initialized (${err.message}). Continuing dry-run audit.\n`);
    }
  }

  try {
    // Find rooms where images array exists and has at least one element
    const query = Room.find({ images: { $exists: true, $type: "array", $ne: [] } });
    if (limit) {
      query.limit(limit);
    }
    const rooms = await query.exec();

    console.log(`📋 Found ${rooms.length} room(s) with photos to scan.\n`);

    for (const room of rooms) {
      stats.roomsScanned++;
      const roomId = String(room._id);
      const roomLabel = room.name || room.roomNumber || roomId;
      const images = Array.isArray(room.images) ? room.images : [];
      stats.imagesScanned += images.length;

      const needsOpt = images.filter((img) => shouldOptimizeUrl(img));
      stats.imagesNeedingOptimization += needsOpt.length;

      if (needsOpt.length === 0) {
        console.log(`  [${stats.roomsScanned}/${rooms.length}] "${roomLabel}" (${roomId}): all ${images.length} photo(s) are already WebP.`);
        continue;
      }

      console.log(`  [${stats.roomsScanned}/${rooms.length}] "${roomLabel}" (${roomId}): ${needsOpt.length} of ${images.length} photo(s) need WebP optimization.`);

      if (isDryRun) {
        for (const imgUrl of images) {
          if (shouldOptimizeUrl(imgUrl)) {
            const { fullPath, thumbPath } = buildWebpStoragePaths(imgUrl, roomId);
            console.log(`      [DRY-RUN] Will convert: ${imgUrl}`);
            console.log(`        -> Full HD WebP:  ${fullPath}`);
            console.log(`        -> Thumbnail:     ${thumbPath}`);
          }
        }
        continue;
      }

      // Write mode: process conversions
      const updatedImages = [];
      let roomConvertedCount = 0;

      for (const imgUrl of images) {
        if (!shouldOptimizeUrl(imgUrl)) {
          // Already WebP or invalid string: keep as-is
          updatedImages.push(imgUrl);
          continue;
        }

        const { fullPath, thumbPath } = buildWebpStoragePaths(imgUrl, roomId);
        console.log(`      ⏳ Converting: ${imgUrl}`);

        try {
          const fetchUrl =
            imgUrl.includes("firebasestorage.googleapis.com") && !imgUrl.includes("alt=media")
              ? imgUrl + (imgUrl.includes("?") ? "&" : "?") + "alt=media"
              : imgUrl;
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error(`Failed to download image (HTTP ${response.status} ${response.statusText})`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const inputBuffer = Buffer.from(arrayBuffer);

          // 1) Full HD WebP: 1200x900 inside fit, quality 82
          const fullBuffer = await sharp(inputBuffer)
            .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();

          // 2) Thumbnail WebP: 480x360 inside fit, quality 75
          const thumbBuffer = await sharp(inputBuffer)
            .resize({ width: 480, height: 360, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 75 })
            .toBuffer();

          // Upload Full HD WebP to Firebase Storage
          const fullFileRef = bucket.file(fullPath);
          await fullFileRef.save(fullBuffer, {
            metadata: {
              contentType: "image/webp",
              cacheControl: "public, max-age=31536000, immutable",
              metadata: { roomId, variant: "full" },
            },
          });
          await fullFileRef.makePublic();
          const newFullUrl = `https://storage.googleapis.com/${bucket.name}/${fullPath}`;

          // Upload Thumbnail WebP to Firebase Storage
          const thumbFileRef = bucket.file(thumbPath);
          await thumbFileRef.save(thumbBuffer, {
            metadata: {
              contentType: "image/webp",
              cacheControl: "public, max-age=31536000, immutable",
              metadata: { roomId, variant: "thumbnail" },
            },
          });
          await thumbFileRef.makePublic();

          updatedImages.push(newFullUrl);
          roomConvertedCount++;
          stats.imagesConverted++;

          console.log(`      ✅ Uploaded: ${newFullUrl}`);
        } catch (err) {
          console.error(`      ❌ Error processing ${imgUrl}:`, err.message);
          stats.errors.push({ roomId, url: imgUrl, error: err.message });
          // Non-destructive fallback: preserve existing photo URL if conversion fails
          updatedImages.push(imgUrl);
        }
      }

      if (roomConvertedCount > 0) {
        await Room.updateOne({ _id: room._id }, { $set: { images: updatedImages } });
        stats.roomsUpdated++;
        console.log(`      💾 Updated Room "${roomLabel}" in MongoDB with ${roomConvertedCount} new WebP URL(s).`);
      }
    }
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("\n🔌 Disconnected from MongoDB.");
    }
  }

  console.log("\n=============================================================================");
  console.log("             ROOM PHOTO WEBP OPTIMIZATION MIGRATION SUMMARY                  ");
  console.log("=============================================================================");
  console.log(` Execution Mode:              ${stats.mode}`);
  console.log(` Rooms Scanned:               ${stats.roomsScanned}`);
  console.log(` Images Scanned:              ${stats.imagesScanned}`);
  console.log(` Images Needing Optimization: ${stats.imagesNeedingOptimization}`);
  console.log(` Images Converted:            ${stats.imagesConverted}`);
  console.log(` Rooms Updated:               ${stats.roomsUpdated}`);
  console.log(` Errors Encountered:          ${stats.errors.length}`);
  console.log("=============================================================================\n");

  return stats;
}

// CLI Execution entry point
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectExecution) {
  const options = parseCliArgs(process.argv.slice(2));
  optimizeExistingRoomPhotos(options).catch((err) => {
    console.error("❌ Fatal migration error:", err);
    process.exit(1);
  });
}
