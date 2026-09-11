import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { getOptimizedUrl, getThumbnailUrl, getImageFallbackUrl } from "../../../../shared/utils/imageOptimizer";

/**
 * RoomImageLightboxModal — Fullscreen High-Resolution Image Lightbox for Room Management
 *
 * Provides enterprise-grade full-view image inspection with:
 * - High-resolution uncompressed / HD optimized display
 * - Multi-image gallery navigation (Next / Prev / Mini-thumbnails / Home / End)
 * - Interactive zoom controls (50% to 300% with wheel zoom and double-click toggle)
 * - Smooth mouse and touch drag/pan navigation when zoomed in
 * - Keyboard shortcuts (Esc, Left/Right arrows, +/-, 0/r, Home/End)
 * - Safe cross-origin image download and direct link opening
 * - Robust input normalization supporting strings, objects, files, and fallback states
 * - Accessible dialog modal semantics with body scroll lock
 */
export default function RoomImageLightboxModal({
  images = [],
  initialIndex = 0,
  roomNumber = "",
  roomType = "",
  onClose,
}) {
  // Track dynamically created object URLs for cleanup on unmount
  const createdObjectUrlsRef = useRef(new Set());

  useEffect(() => {
    return () => {
      // Revoke any locally created object URLs when unmounting
      createdObjectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
      createdObjectUrlsRef.current.clear();
    };
  }, []);

  // Normalize incoming images to standard items
  const normalizedImages = useMemo(() => {
    const rawList = Array.isArray(images)
      ? images
      : typeof images === "string" && images.trim()
      ? [images.trim()]
      : images && typeof images === "object"
      ? [images]
      : [];

    return rawList
      .map((entry, idx) => {
        if (!entry) return null;

        // String URL
        if (typeof entry === "string") {
          const cleanUrl = entry.trim();
          if (!cleanUrl) return null;
          const stdThumb = getThumbnailUrl(cleanUrl);
          return {
            id: `img-${idx}`,
            url: cleanUrl,
            fullUrl: cleanUrl,
            thumbUrl: stdThumb,
            previewUrl: stdThumb,
            name: `Photo ${idx + 1}`,
          };
        }

        // Object structure (e.g. from imagesState, form.images, or API response)
        const rawValue = entry.value;
        const previewUrl = typeof entry.preview === "string" ? entry.preview.trim() : "";
        let fullUrl = "";

        if (typeof rawValue === "string" && rawValue.trim()) {
          fullUrl = rawValue.trim();
        } else if (entry.url && typeof entry.url === "string") {
          fullUrl = entry.url.trim();
        } else if (entry.secure_url && typeof entry.secure_url === "string") {
          fullUrl = entry.secure_url.trim();
        } else if (entry.src && typeof entry.src === "string") {
          fullUrl = entry.src.trim();
        } else if (previewUrl) {
          fullUrl = previewUrl;
        } else if (
          rawValue instanceof Blob ||
          (typeof File !== "undefined" && rawValue instanceof File)
        ) {
          try {
            fullUrl = URL.createObjectURL(rawValue);
            createdObjectUrlsRef.current.add(fullUrl);
          } catch {
            fullUrl = previewUrl;
          }
        }

        if (!fullUrl && !previewUrl) return null;

        const effectiveUrl = fullUrl || previewUrl;
        const name =
          entry.name ||
          (typeof rawValue === "object" && rawValue?.name
            ? rawValue.name
            : `Photo ${idx + 1}`);

        const effectiveThumb = previewUrl || getThumbnailUrl(effectiveUrl);
        return {
          id: entry.id || `img-${idx}`,
          url: effectiveUrl,
          fullUrl: effectiveUrl,
          thumbUrl: effectiveThumb,
          previewUrl: effectiveThumb,
          name,
        };
      })
      .filter(Boolean);
  }, [images]);

  const total = normalizedImages.length;

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (total === 0) return 0;
    return Math.max(0, Math.min(Number(initialIndex) || 0, total - 1));
  });

  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Persistent map of loaded image indices to prevent blank screen flicker on slide switch
  const [hdLoadedMap, setHdLoadedMap] = useState({});
  const [hdFailedMap, setHdFailedMap] = useState({});
  const [baseFailedMap, setBaseFailedMap] = useState({});

  const markHdLoaded = useCallback((idx) => {
    setHdLoadedMap((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
  }, []);

  const markHdFailed = useCallback((idx) => {
    setHdFailedMap((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
  }, []);

  const markBaseFailed = useCallback((idx) => {
    setBaseFailedMap((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
  }, []);

  const currentItem = normalizedImages[currentIndex] || null;

  const isLocalUrl = Boolean(
    currentItem?.fullUrl &&
      (currentItem.fullUrl.startsWith("blob:") || currentItem.fullUrl.startsWith("data:"))
  );

  const isHdLoaded = isLocalUrl || Boolean(hdLoadedMap[currentIndex]);
  const isHdFailed = Boolean(hdFailedMap[currentIndex]);
  const isBaseFailed = Boolean(baseFailedMap[currentIndex]);
  const isLoaded = isHdLoaded; // Maintained for backward compatibility with component references

  const [loadError, setLoadError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Drag interaction tracking refs
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Sync index when initialIndex or normalizedImages changes
  useEffect(() => {
    if (total === 0) return;
    const targetIdx = Math.max(0, Math.min(Number(initialIndex) || 0, total - 1));
    setCurrentIndex(targetIdx);
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setLoadError(false);
  }, [initialIndex, total]);

  // Base preview URL from already-cached thumbnail / preview for immediate 0ms perceived render
  const basePreviewUrl = useMemo(() => {
    if (!currentItem || isBaseFailed) return "";
    return currentItem.previewUrl || currentItem.thumbUrl || currentItem.url || "";
  }, [currentItem, isBaseFailed]);

  // HD optimized URL for high-res viewing — aligns with 1200px/82% WebP across app for immediate server cache hits
  const hdDisplayUrl = useMemo(() => {
    if (!currentItem?.fullUrl) return "";
    if (currentItem.fullUrl.startsWith("blob:") || currentItem.fullUrl.startsWith("data:")) {
      return currentItem.fullUrl;
    }
    return getOptimizedUrl(currentItem.fullUrl, { width: 1200, quality: 82 });
  }, [currentItem]);

  // Proactively preload all gallery photos in the background (current first, then next/prev, then rest)
  const preloadedUrlsRef = useRef(new Set());
  useEffect(() => {
    if (typeof window === "undefined" || typeof Image === "undefined" || total === 0) return;

    const sequence = [currentIndex];
    if (currentIndex + 1 < total) sequence.push(currentIndex + 1);
    if (currentIndex - 1 >= 0) sequence.push(currentIndex - 1);
    for (let i = 0; i < total; i++) {
      if (!sequence.includes(i)) sequence.push(i);
    }

    let isCancelled = false;
    const preloadTimer = setTimeout(() => {
      sequence.forEach((idx, order) => {
        if (isCancelled) return;
        const item = normalizedImages[idx];
        if (!item?.fullUrl) return;

        const targetHdUrl = item.fullUrl.startsWith("blob:") || item.fullUrl.startsWith("data:")
          ? item.fullUrl
          : getOptimizedUrl(item.fullUrl, { width: 1200, quality: 82 });

        if (!targetHdUrl || preloadedUrlsRef.current.has(targetHdUrl)) return;
        preloadedUrlsRef.current.add(targetHdUrl);

        // Stagger non-current photos slightly to prevent network choke
        const delay = order === 0 ? 0 : Math.min(order * 100, 500);
        setTimeout(() => {
          if (isCancelled) return;
          const preloader = new Image();
          preloader.decoding = "async";
          preloader.onload = () => {
            markHdLoaded(idx);
          };
          preloader.onerror = () => {
            markHdFailed(idx);
          };
          preloader.src = targetHdUrl;
        }, delay);
      });
    }, 40);

    return () => {
      isCancelled = true;
      clearTimeout(preloadTimer);
    };
  }, [currentIndex, total, normalizedImages, markHdLoaded, markHdFailed]);

  // Navigate next / prev
  const handlePrev = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setLoadError(false);
  }, [total]);

  const handleNext = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setLoadError(false);
  }, [total]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const nextZoom = Math.max(Number((z - 0.25).toFixed(2)), 0.5);
      if (nextZoom <= 1.0) {
        setPanOffset({ x: 0, y: 0 });
      }
      return nextZoom;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Double click / tap toggle zoom (1.0x <-> 2.0x)
  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    setZoom((prev) => {
      if (prev > 1.0) {
        setPanOffset({ x: 0, y: 0 });
        return 1.0;
      }
      return 2.0;
    });
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(Number((z + 0.2).toFixed(2)), 3.0));
    } else {
      setZoom((z) => {
        const nextZoom = Math.max(Number((z - 0.2).toFixed(2)), 0.5);
        if (nextZoom <= 1.0) {
          setPanOffset({ x: 0, y: 0 });
        }
        return nextZoom;
      });
    }
  }, []);

  // Mouse / Pointer drag to pan when zoomed
  const handlePointerDown = useCallback((e) => {
    if (zoom <= 1.0) return;
    e.stopPropagation();
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
    if (e.target && e.target.setPointerCapture) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }, [zoom, panOffset]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || zoom <= 1.0) return;
    e.stopPropagation();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDraggedRef.current = true;
    }
    setPanOffset({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }, [isDragging, zoom]);

  const handlePointerUp = useCallback((e) => {
    if (isDragging) {
      setIsDragging(false);
      if (e.target && e.target.releasePointerCapture) {
        try {
          e.target.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }
  }, [isDragging]);

  // Clean room title text
  const roomTitle = useMemo(() => {
    if (!roomNumber) return "Room Photo Full View";
    const str = String(roomNumber).trim();
    if (str.toLowerCase().startsWith("room")) return str;
    return `Room ${str}`;
  }, [roomNumber]);

  // Download handler supporting cross-origin blob fetching
  const handleDownload = useCallback(async (e) => {
    e.preventDefault();
    if (!currentItem?.fullUrl || isDownloading) return;

    setIsDownloading(true);
    const safeRoomStr = (roomNumber || "room")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const filename = `${safeRoomStr}-photo-${currentIndex + 1}.jpg`;

    try {
      if (currentItem.fullUrl.startsWith("blob:") || currentItem.fullUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = currentItem.fullUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloading(false);
        return;
      }

      // Fetch as blob to overcome cross-origin download restrictions
      const response = await fetch(currentItem.fullUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Image fetch failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 2000);
    } catch {
      // Fallback: direct window open
      window.open(currentItem.fullUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsDownloading(false);
    }
  }, [currentItem, roomNumber, currentIndex, isDownloading]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if an input is active
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          onClose?.();
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          handlePrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          handleNext();
          break;
        case "+":
        case "=":
          e.preventDefault();
          e.stopPropagation();
          handleZoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          e.stopPropagation();
          handleZoomOut();
          break;
        case "0":
        case "r":
        case "R":
          e.preventDefault();
          e.stopPropagation();
          handleResetZoom();
          break;
        case "Home":
          e.preventDefault();
          e.stopPropagation();
          if (total > 1) {
            setCurrentIndex(0);
            setZoom(1.0);
            setPanOffset({ x: 0, y: 0 });
            setLoadError(false);
          }
          break;
        case "End":
          e.preventDefault();
          e.stopPropagation();
          if (total > 1) {
            setCurrentIndex(total - 1);
            setZoom(1.0);
            setPanOffset({ x: 0, y: 0 });
            setLoadError(false);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleResetZoom, total]);

  // Lock background body scroll while open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!currentItem || total === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex flex-col bg-black/92 backdrop-blur-md animate-in fade-in duration-150 select-none text-white"
      onClick={(e) => {
        e.stopPropagation();
        if (!hasDraggedRef.current) {
          onClose?.();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${roomTitle} Full View`}
    >
      {/* Top Header Bar */}
      <header
        className="shrink-0 w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white shrink-0">
              <ImageIcon size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white truncate max-w-[200px] sm:max-w-xs">
                  {roomTitle}
                </h3>
                {roomType && (
                  <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/15">
                    {roomType}
                  </span>
                )}
                {!isHdLoaded && !isHdFailed && !loadError && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>Loading HD</span>
                  </span>
                )}
                {isHdFailed && basePreviewUrl && !loadError && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-white/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>Standard Quality</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/70 truncate max-w-[260px] sm:max-w-md mt-0.5">
                {currentItem.name}
                {total > 1 && ` • Photo ${currentIndex + 1} of ${total}`}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Zoom In */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10 disabled:opacity-40"
            title="Zoom In (+)"
            aria-label="Zoom In"
            disabled={zoom >= 3.0}
          >
            <ZoomIn size={15} />
          </button>

          {/* Zoom Reset / Percentage Display */}
          <button
            type="button"
            onClick={handleResetZoom}
            className="hidden sm:flex items-center justify-center px-2 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono font-semibold text-white transition-colors cursor-pointer border border-white/10"
            title="Reset Zoom (0 or R)"
            aria-label="Reset Zoom"
          >
            {Math.round(zoom * 100)}%
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10 disabled:opacity-40"
            title="Zoom Out (-)"
            aria-label="Zoom Out"
            disabled={zoom <= 0.5}
          >
            <ZoomOut size={15} />
          </button>

          {zoom !== 1.0 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="flex sm:hidden items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10"
              title="Reset Zoom (100%)"
              aria-label="Reset Zoom"
            >
              <RotateCcw size={14} />
            </button>
          )}

          <div className="w-px h-5 bg-white/15 mx-0.5" />

          {/* Open in new tab */}
          <a
            href={currentItem.fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10"
            title="Open original photo in new tab"
            aria-label="Open original photo in new tab"
          >
            <ExternalLink size={14} />
          </a>

          {/* Download Original */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/10 disabled:opacity-50"
            title="Download full size photo"
            aria-label="Download photo"
          >
            <Download size={14} />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-rose-600 text-white transition-colors cursor-pointer border border-white/15 ml-1"
            title="Close full view (Esc)"
            aria-label="Close full view"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Viewport */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-6"
        onClick={(e) => {
          e.stopPropagation();
          if (!hasDraggedRef.current) {
            onClose?.();
          }
        }}
        onWheel={handleWheel}
      >
        {/* Previous Navigation Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-3 sm:left-6 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/20 shadow-xl backdrop-blur-sm transition-transform hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
            title="Previous photo (Arrow Left)"
            aria-label="Previous photo"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Central Image Container */}
        <div
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-100 ease-out"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            cursor: zoom > 1.0 ? (isDragging ? "grabbing" : "grab") : "default",
            touchAction: zoom > 1.0 ? "none" : "auto",
          }}
        >
          {/* Subtle loading spinner if neither base preview nor HD is available yet */}
          {!isHdLoaded && !basePreviewUrl && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center min-w-[200px] min-h-[200px]">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Layer 1: Instant Low-Res / Thumbnail Base Layer (0ms perceived load time) */}
          {basePreviewUrl && !loadError && (
            <img
              key={`base-${currentItem.id}-${basePreviewUrl}`}
              src={basePreviewUrl}
              alt=""
              aria-hidden="true"
              className="max-w-[90vw] max-h-[75vh] sm:max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-none select-none"
              style={{
                filter: isHdLoaded || isHdFailed ? "none" : "blur(4px)",
                opacity: isHdLoaded ? 0 : 1,
                transition: "opacity 0.35s ease, filter 0.35s ease",
              }}
              onError={(e) => {
                const fallback = getImageFallbackUrl(basePreviewUrl);
                if (fallback && fallback !== e.currentTarget.src) {
                  e.currentTarget.src = fallback;
                  return;
                }
                markBaseFailed(currentIndex);
                if (isHdFailed) {
                  setLoadError(true);
                }
              }}
            />
          )}

          {/* Layer 2: High-Resolution HD Layer (Fades in smoothly over base layer) */}
          {!loadError && (
            <img
              key={`hd-${currentItem.id}-${hdDisplayUrl}`}
              src={hdDisplayUrl}
              alt={currentItem.name || "Room full view"}
              className={`max-w-[90vw] max-h-[75vh] sm:max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-none select-none ${
                basePreviewUrl ? "absolute inset-0 m-auto" : ""
              }`}
              style={{
                opacity: isHdLoaded ? 1 : (basePreviewUrl ? 0 : 1),
                transition: "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                willChange: "opacity",
              }}
              loading="eager"
              fetchpriority="high"
              decoding="async"
              ref={(node) => {
                if (node && node.complete && !isHdLoaded) {
                  markHdLoaded(currentIndex);
                }
              }}
              onLoad={() => {
                markHdLoaded(currentIndex);
                setLoadError(false);
              }}
              onError={(e) => {
                const fallback = getImageFallbackUrl(hdDisplayUrl);
                if (fallback && fallback !== e.currentTarget.src) {
                  e.currentTarget.src = fallback;
                  return;
                }
                markHdFailed(currentIndex);
                if (!basePreviewUrl) {
                  setLoadError(true);
                }
              }}
            />
          )}

          {/* Error Fallback Card */}
          {(loadError || (!basePreviewUrl && isHdFailed)) && (
            <div className="p-6 rounded-xl bg-slate-900 border border-white/10 text-center space-y-2 max-w-sm">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-sm font-semibold text-white">Image Preview Unavailable</h4>
              <p className="text-xs text-white/60">
                The high-resolution photo could not be rendered directly.
              </p>
              {currentItem.fullUrl && (
                <a
                  href={currentItem.fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Open Direct Link</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Next Navigation Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-3 sm:right-6 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/20 shadow-xl backdrop-blur-sm transition-transform hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
            title="Next photo (Arrow Right)"
            aria-label="Next photo"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip & Indicator Bar */}
      <footer
        className="shrink-0 w-full flex flex-col items-center justify-center gap-2 px-4 py-3 border-t border-white/10 bg-black/50 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {total > 1 ? (
          <div className="flex items-center gap-2 max-w-full overflow-x-auto py-1 px-2 no-scrollbar">
            {normalizedImages.map((img, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(idx);
                    setZoom(1.0);
                    setPanOffset({ x: 0, y: 0 });
                    setLoadError(false);
                  }}
                  className={`relative w-14 h-10 sm:w-16 sm:h-11 rounded-md overflow-hidden shrink-0 border transition-all cursor-pointer ${
                    isActive
                      ? "border-white ring-2 ring-white/80 opacity-100 scale-105"
                      : "border-white/20 opacity-50 hover:opacity-90"
                  }`}
                  title={img.name || `Photo ${idx + 1}`}
                  aria-label={`Switch to photo ${idx + 1}`}
                >
                  <img
                    src={img.thumbUrl || img.url}
                    alt={img.name || `Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const fb = getImageFallbackUrl(img.thumbUrl || img.url);
                      if (fb && fb !== e.currentTarget.src) {
                        e.currentTarget.src = fb;
                      }
                    }}
                  />
                  {isActive && (
                    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-white" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-white/60 font-medium">
            Use keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Esc</kbd> to close, <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">+</kbd>/<kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">-</kbd> to zoom, double-click or drag to pan
          </div>
        )}
      </footer>
    </div>,
    document.body
  );
}
