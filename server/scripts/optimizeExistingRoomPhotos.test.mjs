/**
 * =============================================================================
 * TESTS: ROOM PHOTO WEBP OPTIMIZATION MIGRATION SCRIPT
 * =============================================================================
 *
 * Test runner: Node.js built-in test runner (node --test)
 *
 * Usage:
 *   node --test scripts/optimizeExistingRoomPhotos.test.mjs
 * =============================================================================
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldOptimizeUrl,
  buildWebpStoragePaths,
  extractCleanFilename,
  parseCliArgs,
} from "./optimizeExistingRoomPhotos.mjs";

describe("optimizeExistingRoomPhotos unit tests", () => {
  describe("shouldOptimizeUrl", () => {
    it("returns true for lowercase .jpg URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/room.jpg"),
        true,
      );
    });

    it("returns true for uppercase .JPG URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/Private_Rm_T_B.JPG"),
        true,
      );
    });

    it("returns true for .jpeg and .JPEG URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/photo.jpeg"),
        true,
      );
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/PHOTO.JPEG"),
        true,
      );
    });

    it("returns true for .png and .PNG URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/floorplan.png"),
        true,
      );
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/FLOORPLAN.PNG"),
        true,
      );
    });

    it("returns true for non-WebP URLs with query parameters", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://firebasestorage.googleapis.com/v0/b/bucket/o/photo.jpg?alt=media&token=xyz"),
        true,
      );
    });

    it("returns false for lowercase .webp URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/room.webp"),
        false,
      );
    });

    it("returns false for uppercase .WEBP URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/ROOM.WEBP"),
        false,
      );
    });

    it("returns false for mixed-case .WebP URLs", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://storage.googleapis.com/bucket/room-photos/101/Room.WebP"),
        false,
      );
    });

    it("returns false for .webp URLs with query parameters", () => {
      assert.strictEqual(
        shouldOptimizeUrl("https://firebasestorage.googleapis.com/v0/b/bucket/o/room.webp?alt=media&token=12345"),
        false,
      );
    });

    it("returns false for empty or non-string inputs", () => {
      assert.strictEqual(shouldOptimizeUrl(""), false);
      assert.strictEqual(shouldOptimizeUrl("   "), false);
      assert.strictEqual(shouldOptimizeUrl(null), false);
      assert.strictEqual(shouldOptimizeUrl(undefined), false);
      assert.strictEqual(shouldOptimizeUrl(12345), false);
      assert.strictEqual(shouldOptimizeUrl({ url: "photo.jpg" }), false);
      assert.strictEqual(shouldOptimizeUrl(["photo.jpg"]), false);
    });
  });

  describe("extractCleanFilename", () => {
    it("extracts clean filename without extension from simple URL", () => {
      assert.strictEqual(
        extractCleanFilename("https://storage.googleapis.com/bucket/room-photos/101/room.jpg"),
        "room",
      );
    });

    it("decodes percent-encoded characters like %20", () => {
      assert.strictEqual(
        extractCleanFilename("https://storage.googleapis.com/bucket/room-photos/101/Pic%20quad.jpg"),
        "Pic_quad",
      );
    });

    it("decodes encoded slashes and handles query tokens", () => {
      assert.strictEqual(
        extractCleanFilename("https://firebasestorage.googleapis.com/v0/b/bucket/o/room-photos%2F101%2Fprivate_room.jpg?alt=media&token=abc"),
        "private_room",
      );
    });

    it("sanitizes special characters into underscores", () => {
      assert.strictEqual(
        extractCleanFilename("https://storage.googleapis.com/bucket/room-photos/101/Quad & double Common CR.jpg"),
        "Quad___double_Common_CR",
      );
    });

    it("handles bare filename strings without path", () => {
      assert.strictEqual(extractCleanFilename("bedroom-view.png"), "bedroom-view");
    });
  });

  describe("buildWebpStoragePaths", () => {
    it("constructs fullPath and thumbPath for a standard .jpg URL", () => {
      const paths = buildWebpStoragePaths(
        "https://storage.googleapis.com/bucket/room-photos/room-gp-101/bedroom.jpg",
        "room-gp-101",
      );
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/room-gp-101/bedroom.webp",
        thumbPath: "room-photos/room-gp-101/bedroom-thumb.webp",
      });
    });

    it("constructs paths for an uppercase .JPG URL", () => {
      const paths = buildWebpStoragePaths(
        "https://storage.googleapis.com/dormitorymanagement-caps-572cf.firebasestorage.app/room-photos/69d9e9be39100a9aa9ba3d6d/Private_Rm_T_B.JPG",
        "69d9e9be39100a9aa9ba3d6d",
      );
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/69d9e9be39100a9aa9ba3d6d/Private_Rm_T_B.webp",
        thumbPath: "room-photos/69d9e9be39100a9aa9ba3d6d/Private_Rm_T_B-thumb.webp",
      });
    });

    it("constructs paths for an encoded URL (%20)", () => {
      const paths = buildWebpStoragePaths(
        "https://storage.googleapis.com/bucket/room-photos/room-202/Pic%20quad.jpg",
        "room-202",
      );
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/room-202/Pic_quad.webp",
        thumbPath: "room-photos/room-202/Pic_quad-thumb.webp",
      });
    });

    it("constructs paths for an unencoded URL with spaces and ampersands", () => {
      const paths = buildWebpStoragePaths(
        "https://storage.googleapis.com/bucket/room-photos/room-303/Quad & double Common CR.jpg",
        "room-303",
      );
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/room-303/Quad___double_Common_CR.webp",
        thumbPath: "room-photos/room-303/Quad___double_Common_CR-thumb.webp",
      });
    });

    it("constructs paths for Firebase Storage URL with query params and encoded slashes", () => {
      const paths = buildWebpStoragePaths(
        "https://firebasestorage.googleapis.com/v0/b/caps.appspot.com/o/room-photos%2F65f123%2Fliving_room.png?alt=media&token=tok-999",
        "65f123",
      );
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/65f123/living_room.webp",
        thumbPath: "room-photos/65f123/living_room-thumb.webp",
      });
    });

    it("handles empty or missing URL gracefully with fallback", () => {
      const paths = buildWebpStoragePaths("", "room-1");
      assert.deepStrictEqual(paths, {
        fullPath: "room-photos/room-1/photo.webp",
        thumbPath: "room-photos/room-1/photo-thumb.webp",
      });
    });
  });

  describe("parseCliArgs", () => {
    it("defaults to dryRun: true, write: false, limit: null when no args passed", () => {
      const parsed = parseCliArgs([]);
      assert.deepStrictEqual(parsed, { write: false, dryRun: true, limit: null });
    });

    it("parses --write correctly", () => {
      const parsed = parseCliArgs(["--write"]);
      assert.deepStrictEqual(parsed, { write: true, dryRun: false, limit: null });
    });

    it("parses --dry-run explicitly", () => {
      const parsed = parseCliArgs(["--dry-run"]);
      assert.deepStrictEqual(parsed, { write: false, dryRun: true, limit: null });
    });

    it("gives precedence to --dry-run if both --write and --dry-run are supplied", () => {
      const parsed = parseCliArgs(["--write", "--dry-run"]);
      assert.deepStrictEqual(parsed, { write: false, dryRun: true, limit: null });
    });

    it("parses --limit=N syntax", () => {
      const parsed = parseCliArgs(["--limit=15"]);
      assert.deepStrictEqual(parsed, { write: false, dryRun: true, limit: 15 });
    });

    it("parses --limit N syntax", () => {
      const parsed = parseCliArgs(["--write", "--limit", "5"]);
      assert.deepStrictEqual(parsed, { write: true, dryRun: false, limit: 5 });
    });
  });
});
