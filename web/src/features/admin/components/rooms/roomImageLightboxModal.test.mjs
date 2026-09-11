import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Room Management Image Full View & Lightbox Suite", () => {
  const lightboxModalPath = path.join(__dirname, "RoomImageLightboxModal.jsx");
  const roomConfigModalPath = path.join(__dirname, "RoomConfigModal.jsx");
  const roomFormModalPath = path.join(__dirname, "RoomFormModal.jsx");
  const doubleDeckCardPath = path.join(__dirname, "DoubleDeckRoomCard.jsx");
  const roomAvailabilityPagePath = path.join(__dirname, "..", "..", "pages", "RoomAvailabilityPage.jsx");
  const roomPublicEditFormPath = path.join(__dirname, "RoomPublicEditForm.jsx");
  const roomPublicPreviewCardPath = path.join(__dirname, "RoomPublicPreviewCard.jsx");

  test("1. RoomImageLightboxModal provides full view features, robust input normalization, and zoom/pan controls", () => {
    assert.ok(fs.existsSync(lightboxModalPath), "RoomImageLightboxModal.jsx must exist");
    const code = fs.readFileSync(lightboxModalPath, "utf8");

    // Portal & Accessibility
    assert.ok(code.includes('createPortal('), "Must mount via createPortal");
    assert.ok(code.includes('role="dialog"'), "Must include role='dialog' for accessible modal semantics");
    assert.ok(code.includes('aria-modal="true"'), "Must include aria-modal='true'");

    // High resolution optimization & error fallback
    assert.ok(code.includes("getOptimizedUrl"), "Must optimize full view with getOptimizedUrl");
    assert.ok(code.includes("getImageFallbackUrl"), "Must provide fallback with getImageFallbackUrl");

    // Input normalization: handles single string, objects, and arrays without empty fullUrl bug
    assert.ok(code.includes("rawList"), "Must normalize raw input into a list");
    assert.ok(code.includes("fullUrl: cleanUrl"), "Must populate fullUrl when single or string array provided");
    assert.ok(code.includes("thumbUrl:"), "Must populate thumbUrl during normalization");

    // Interactive zoom and pan drag controls
    assert.ok(code.includes("handleZoomIn"), "Must support zoom in");
    assert.ok(code.includes("handleZoomOut"), "Must support zoom out");
    assert.ok(code.includes("handleResetZoom"), "Must support reset zoom");
    assert.ok(code.includes("handleDoubleClick"), "Must support double-click zoom toggle");
    assert.ok(code.includes("handleWheel"), "Must support mouse wheel zoom");
    assert.ok(code.includes("handlePointerDown"), "Must support pointer down for drag panning");
    assert.ok(code.includes("handlePointerMove"), "Must support pointer move for drag panning");
    assert.ok(code.includes("handlePointerUp"), "Must support pointer up for drag panning");
    assert.ok(code.includes("panOffset"), "Must track panOffset state for moving zoomed images");

    // Keyboard navigation (including Home/End)
    assert.ok(code.includes('"Escape"'), "Must handle Escape key to close");
    assert.ok(code.includes('"ArrowLeft"'), "Must handle ArrowLeft key for previous photo");
    assert.ok(code.includes('"ArrowRight"'), "Must handle ArrowRight key for next photo");
    assert.ok(code.includes('"Home"'), "Must handle Home key to jump to first photo");
    assert.ok(code.includes('"End"'), "Must handle End key to jump to last photo");

    // Actions & Cross-origin download
    assert.ok(code.includes("handleDownload"), "Must provide robust download handler");
    assert.ok(code.includes("ExternalLink"), "Must provide open in new tab action");
    assert.ok(code.includes("overflow"), "Must lock body scroll while open");

    // Error state: image element hidden when loadError is true
    assert.ok(code.includes("!loadError &&"), "Must guard image rendering with !loadError to avoid broken image overlay");
  });

  test("2. DoubleDeckRoomCard robustly extracts room photos even when room.images is an empty array", () => {
    const code = fs.readFileSync(doubleDeckCardPath, "utf8");

    assert.ok(code.includes("onViewPhotos"), "Must accept onViewPhotos prop");
    assert.ok(code.includes("roomImages"), "Must extract roomImages");

    // Verify empty array bug is fixed (must not shadow room.image)
    assert.ok(
      code.includes("fromImages.length > 0") && code.includes("room.image"),
      "Must fall back to room.image when room.images is an empty array"
    );

    // Button in footer
    assert.ok(code.includes("onViewPhotos(room)"), "Must trigger onViewPhotos with room object on button click");
    assert.ok(code.includes("Photo"), "Must display Photo count in footer button");
  });

  test("3. RoomAvailabilityPage passes onViewPhotos and safely falls back to room.image when room.images is empty", () => {
    const code = fs.readFileSync(roomAvailabilityPagePath, "utf8");

    assert.ok(code.includes('import RoomImageLightboxModal from "../components/rooms/RoomImageLightboxModal"'), "Must import RoomImageLightboxModal");
    assert.ok(code.includes("const [lightboxRoom, setLightboxRoom] = useState(null);"), "Must declare lightboxRoom state");
    assert.ok(code.includes("onViewPhotos={(roomToView) => setLightboxRoom(roomToView)}"), "Must pass onViewPhotos callback to DoubleDeckRoomCard");

    // Verify empty array fallback fix
    assert.ok(
      code.includes("lightboxRoom.images.filter(Boolean).length > 0") ||
      code.includes("lightboxRoom.images.length > 0"),
      "Must check lightboxRoom.images length before falling back to lightboxRoom.image"
    );
    assert.ok(code.includes("<RoomImageLightboxModal"), "Must render RoomImageLightboxModal when lightboxRoom is set");
    assert.ok(code.includes("onClose={() => setLightboxRoom(null)}"), "Must provide onClose handler resetting lightboxRoom");
  });

  test("4. RoomConfigModal integrates RoomImageLightboxModal for View & Edit modes", () => {
    const code = fs.readFileSync(roomConfigModalPath, "utf8");

    assert.ok(code.includes('import RoomImageLightboxModal from "./RoomImageLightboxModal"'), "Must import RoomImageLightboxModal");
    assert.ok(code.includes("const [lightboxIndex, setLightboxIndex] = useState(null);"), "Must declare lightboxIndex state");
    assert.ok(code.includes("setLightboxIndex(idx)"), "Must set lightboxIndex when clicking a photo in RoomConfigModal");
    assert.ok(code.includes("Full View"), "Must display Full View visual indicator on hover");
    assert.ok(code.includes("Maximize2"), "Must render Maximize2 icon button for full view");
    assert.ok(code.includes("<RoomImageLightboxModal"), "Must render RoomImageLightboxModal in RoomConfigModal");
    assert.ok(code.includes("onClose={() => setLightboxIndex(null)}"), "Must provide onClose handler resetting lightboxIndex");
  });

  test("5. RoomFormModal integrates RoomImageLightboxModal in Step 4 Room Photos", () => {
    const code = fs.readFileSync(roomFormModalPath, "utf8");

    assert.ok(code.includes('import RoomImageLightboxModal from "./RoomImageLightboxModal"'), "Must import RoomImageLightboxModal");
    assert.ok(code.includes("const [lightboxIndex, setLightboxIndex] = useState(null);"), "Must declare lightboxIndex state");
    assert.ok(code.includes("setLightboxIndex(index)"), "Must set lightboxIndex when clicking a photo in RoomFormModal");
    assert.ok(code.includes("Full View"), "Must display Full View visual indicator on hover");
    assert.ok(code.includes("<RoomImageLightboxModal"), "Must render RoomImageLightboxModal in RoomFormModal");
    assert.ok(code.includes("onClose={() => setLightboxIndex(null)}"), "Must provide onClose handler resetting lightboxIndex");
  });

  test("6. RoomPublicEditForm integrates RoomImageLightboxModal with keyboard accessibility", () => {
    const code = fs.readFileSync(roomPublicEditFormPath, "utf8");

    assert.ok(code.includes('import RoomImageLightboxModal from "./RoomImageLightboxModal"'), "Must import RoomImageLightboxModal");
    assert.ok(code.includes("const [lightboxIndex, setLightboxIndex] = useState(null);"), "Must declare lightboxIndex state");
    assert.ok(code.includes("setLightboxIndex(index)"), "Must trigger lightboxIndex on photo click");
    assert.ok(code.includes('role="button"'), "Must include role='button' on clickable photo thumbnails");
    assert.ok(code.includes("tabIndex={0}"), "Must include tabIndex={0} for keyboard accessibility");
    assert.ok(code.includes("onKeyDown"), "Must include onKeyDown listener for keyboard activation");
    assert.ok(code.includes("<RoomImageLightboxModal"), "Must render RoomImageLightboxModal in RoomPublicEditForm");
  });

  test("7. RoomPublicPreviewCard integrates RoomImageLightboxModal with interactive banner", () => {
    const code = fs.readFileSync(roomPublicPreviewCardPath, "utf8");

    assert.ok(code.includes('import RoomImageLightboxModal from "./RoomImageLightboxModal"'), "Must import RoomImageLightboxModal");
    assert.ok(code.includes("showLightbox"), "Must declare showLightbox state");
    assert.ok(code.includes("setShowLightbox(true)"), "Must open lightbox on banner click");
    assert.ok(code.includes('role="button"'), "Must include role='button' on banner");
    assert.ok(code.includes("tabIndex={0}"), "Must include tabIndex={0} on banner");
    assert.ok(code.includes("onKeyDown"), "Must include onKeyDown on banner");
    assert.ok(code.includes("Full View"), "Must display Full View hover badge on banner");
    assert.ok(code.includes("<RoomImageLightboxModal"), "Must render RoomImageLightboxModal in RoomPublicPreviewCard");
  });

  test("8. Performance Boost: Lightbox provides progressive two-layer loading, async decoding, persistent loaded map, and hover prefetch", () => {
    const lightboxCode = fs.readFileSync(lightboxModalPath, "utf8");
    const roomConfigCode = fs.readFileSync(roomConfigModalPath, "utf8");
    const roomFormCode = fs.readFileSync(roomFormModalPath, "utf8");
    const doubleDeckCode = fs.readFileSync(doubleDeckCardPath, "utf8");

    // HD URL aligns with 1200px / 82% WebP app-wide cache for 0ms server hits
    assert.ok(
      lightboxCode.includes("width: 1200, quality: 82"),
      "Must align HD resolution to 1200px at 82% quality to match server cache",
    );

    // Progressive two-layer loading: base thumbnail preview renders immediately (0ms)
    assert.ok(
      lightboxCode.includes("basePreviewUrl"),
      "Must compute basePreviewUrl from cached preview or thumbnail",
    );
    assert.ok(
      lightboxCode.includes("previewUrl:"),
      "Must extract previewUrl during normalization",
    );
    assert.ok(
      lightboxCode.includes("blur(4px)"),
      "Must apply subtle smoothing on base preview layer while HD sharpens",
    );

    // Persistent loaded map prevents blank flickers when navigating between photos
    assert.ok(
      lightboxCode.includes("hdLoadedMap") && lightboxCode.includes("markHdLoaded"),
      "Must maintain persistent hdLoadedMap so previously viewed photos stay loaded",
    );

    // Async decoding & high fetch priority
    assert.ok(
      lightboxCode.includes('decoding="async"'),
      "Must use decoding='async' to prevent UI thread blocking",
    );
    assert.ok(
      lightboxCode.includes('fetchpriority="high"'),
      "Must set fetchpriority='high' on high-res image",
    );

    // Proactive background gallery preloading
    assert.ok(
      lightboxCode.includes("preloadedUrlsRef"),
      "Must track preloaded URLs in ref to avoid duplicate requests",
    );

    // Hover prefetching across parent components
    assert.ok(
      roomConfigCode.includes("prefetchOptimizedImage"),
      "RoomConfigModal must import and invoke prefetchOptimizedImage on mouse enter",
    );
    assert.ok(
      roomFormCode.includes("prefetchOptimizedImage"),
      "RoomFormModal must import and invoke prefetchOptimizedImage on mouse enter",
    );
    assert.ok(
      doubleDeckCode.includes("prefetchOptimizedImage"),
      "DoubleDeckRoomCard must import and invoke prefetchOptimizedImage on mouse enter",
    );
  });

  test("9. Robustness Boost: Standardized 480px thumbnail alignment, staggered preloading, and HD error recovery", () => {
    const lightboxCode = fs.readFileSync(lightboxModalPath, "utf8");

    // Standardized thumbnail & preview alignment (reuses standard 480px WebP instead of cold 160px)
    assert.ok(
      lightboxCode.includes("getThumbnailUrl(cleanUrl)") || lightboxCode.includes("stdThumb"),
      "Must align string image thumbnails to getThumbnailUrl to eliminate cold dimension cache misses",
    );

    // Staggered gallery preloading to prevent connection choke
    assert.ok(
      lightboxCode.includes("preloadTimer") && lightboxCode.includes("clearTimeout"),
      "Must manage preloading with timer and cleanup to prevent background connection starvation",
    );

    // Instant local blob/data URL handling without blur
    assert.ok(
      lightboxCode.includes("isLocalUrl"),
      "Must identify local blob/data URLs to avoid unnecessary blur or loading indicators",
    );

    // Error recovery when HD fails to load (unblurs base layer and removes loading spinner)
    assert.ok(
      lightboxCode.includes("hdFailedMap") && lightboxCode.includes("markHdFailed"),
      "Must track hdFailedMap to handle HD failures gracefully",
    );
    assert.ok(
      lightboxCode.includes("Standard Quality"),
      "Must display accessible Standard Quality indicator when HD fails instead of perpetual loading",
    );
    assert.ok(
      lightboxCode.includes("isHdLoaded || isHdFailed ? \"none\" : \"blur(4px)\""),
      "Must remove blur from base preview if HD fails so user can view standard photo cleanly",
    );
  });

  test("10. Modal Hierarchy & Event Isolation: Lightbox exit preserves parent modal state", () => {
    const lightboxCode = fs.readFileSync(lightboxModalPath, "utf8");
    const roomConfigCode = fs.readFileSync(roomConfigModalPath, "utf8");
    const roomFormCode = fs.readFileSync(roomFormModalPath, "utf8");

    // Capture-phase keydown interception with stopImmediatePropagation to isolate Escape
    assert.ok(
      lightboxCode.includes('window.addEventListener("keydown", handleKeyDown, true)'),
      "Lightbox must listen to keydown in capture phase (true) to intercept Escape before parent modals",
    );
    assert.ok(
      lightboxCode.includes("e.stopImmediatePropagation?.()"),
      "Lightbox must call e.stopImmediatePropagation to prevent parent document escape handlers from firing",
    );
    assert.ok(
      lightboxCode.includes("e.stopPropagation()"),
      "Lightbox must stop event propagation on keyboard and click events",
    );

    // Parent modals must disable their own useEscapeClose when lightbox is active
    assert.ok(
      roomConfigCode.includes("useEscapeClose(lightboxIndex === null"),
      "RoomConfigModal must disable useEscapeClose while lightboxIndex !== null",
    );
    assert.ok(
      roomFormCode.includes("useEscapeClose(lightboxIndex === null"),
      "RoomFormModal must disable useEscapeClose while lightboxIndex !== null",
    );

    // RoomConfigModal must render lightbox outside admin-modal-overlay to avoid React synthetic click bubbling
    assert.ok(
      roomConfigCode.includes("</div>\n\n      {lightboxIndex !== null && (") ||
      roomConfigCode.includes("</div>\r\n\r\n      {lightboxIndex !== null && ("),
      "RoomConfigModal must close admin-modal-overlay before mounting RoomImageLightboxModal",
    );
  });
});

