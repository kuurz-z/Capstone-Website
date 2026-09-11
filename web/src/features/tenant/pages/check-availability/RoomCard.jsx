import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, MapPin, Bed } from "lucide-react";
import { getThumbnailUrl, getOptimizedUrl, getImageFallbackUrl } from "../../../../shared/utils/imageOptimizer.js";

function highlightTokens(text, query) {
  if (!text || !query || !String(query).trim()) return text;
  const terms = String(query)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = String(text).split(regex);

  return parts.map((part, index) =>
    terms.includes(part.toLowerCase()) ? (
      <mark key={index} className="ca-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Redesigned Room Card — solid HSL tokens, bed availability dots, clear lease pricing.
 */
const RoomCard = React.memo(({
  room,
  onClick,
  onSelect,
  selectedLeaseTermFilter = "All",
  searchQuery = "",
  isPriority = false,
  cardIndex = 0,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [previousImageIndex, setPreviousImageIndex] = useState(null);
  const [loadedMap, setLoadedMap] = useState({}); // { [index]: true } when fully loaded
  const debounceRef = useRef(false);
  const prefetchedRef = useRef(false);
  const retriedIndicesRef = useRef(new Set());
  const prevRoomIdRef = useRef(room._id || room.id);

  const images = useMemo(() => {
    const rawImages = room.images?.length ? room.images : (room.image ? [room.image] : []);
    const mapped = rawImages.map((src) => getThumbnailUrl(src)).filter(Boolean);
    return mapped.length > 0 ? mapped : (room.image ? [room.image] : []);
  }, [room.images, room.image]);

  useEffect(() => {
    const currentId = room._id || room.id;
    if (prevRoomIdRef.current !== currentId) {
      prevRoomIdRef.current = currentId;
      setCurrentImageIndex(0);
      setPreviousImageIndex(null);
      setLoadedMap({});
      retriedIndicesRef.current.clear();
      prefetchedRef.current = false;
    }
  }, [room._id || room.id]);

  useEffect(() => {
    retriedIndicesRef.current.clear();
  }, [images]);

  const handleImageError = useCallback(
    (e) => {
      const currentSrc = images[currentImageIndex];
      if (
        !retriedIndicesRef.current.has(currentImageIndex) &&
        currentSrc &&
        currentSrc.includes("/api/rooms/photos/optimize")
      ) {
        retriedIndicesRef.current.add(currentImageIndex);
        const fallback = getImageFallbackUrl(currentSrc);
        if (fallback && fallback !== currentSrc) {
          e.currentTarget.src = fallback;
          return;
        }
      }
      if (e.currentTarget.src && e.currentTarget.src.includes("-thumb.webp")) {
        const rawWebp = e.currentTarget.src.replace("-thumb.webp", ".webp");
        if (rawWebp !== e.currentTarget.src) {
          e.currentTarget.src = rawWebp;
          return;
        }
      }
      setLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }));
    },
    [images, currentImageIndex]
  );

  const matchedAmenities = useMemo(() => {
    if (!searchQuery || !searchQuery.trim() || !Array.isArray(room.amenities)) return [];
    const terms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return room.amenities.filter((amenity) =>
      terms.some((term) => String(amenity).toLowerCase().includes(term))
    );
  }, [room.amenities, searchQuery]);

  // Preload secondary carousel images, primary HD image, and modal chunk on hover
  const handleCardMouseEnter = useCallback(() => {
    if (!prefetchedRef.current) {
      prefetchedRef.current = true;

      // Prefetch modal component chunk
      import("../../modals/RoomDetailsModal").catch(() => {});

      if (typeof Image !== "undefined") {
        // Preload primary HD image for instant modal display
        const primaryRaw = room.images?.[0] || room.image;
        if (primaryRaw) {
          const hd = new Image();
          hd.src = getOptimizedUrl(primaryRaw, { width: 1200, quality: 82 });
        }

        // Preload secondary carousel slides
        if (images.length > 1) {
          images.slice(1).forEach((src) => {
            if (src) {
              const preloader = new Image();
              preloader.src = src;
            }
          });
        }
      }
    }
  }, [images, room.images, room.image]);

  const handleCardClick = useCallback(() => {
    if (onSelect) {
      onSelect(room);
    } else if (onClick) {
      onClick(room);
    }
  }, [onSelect, onClick, room]);

  const navigate = useCallback((delta, e) => {
    e.stopPropagation();
    if (debounceRef.current) return;
    debounceRef.current = true;
    setPreviousImageIndex(currentImageIndex);
    setCurrentImageIndex((prev) => (prev + delta + images.length) % images.length);
    setTimeout(() => { debounceRef.current = false; }, 150);
  }, [images.length, currentImageIndex]);

  const nextImage = useCallback((e) => navigate(1, e), [navigate]);
  const prevImage = useCallback((e) => navigate(-1, e), [navigate]);

  const isCurrentLoaded = Boolean(loadedMap[currentImageIndex]);

  // Memoized bed metrics & rate calculations
  const {
    totalBeds,
    reservedBeds,
    lockedBeds,
    availableBeds,
    takenBeds,
    availabilityLabel,
    isPrivate,
    minMonths,
    shortTermRate,
    longTermRate,
    regularLongRate,
    regularShortRate,
    discountPercent,
  } = useMemo(() => {
    const totalBedsCount = room.capacity || room.beds?.length || parseInt(room.occupancy?.split("/")[1]) || 0;
    const occupiedFromBedsCount = room.beds
      ? room.beds.filter((b) => String(b.status || "").toLowerCase() === "occupied" || (b.status === undefined && b.available === false)).length
      : parseInt(room.occupancy?.split("/")[0]) || 0;
    const occupiedCount = room.beds?.length > 0 ? occupiedFromBedsCount : Math.max(room.currentOccupancy ?? 0, occupiedFromBedsCount);
    const reservedBedsCount = room.reservedBeds ?? (
      room.beds
        ? room.beds.filter((b) => String(b.status || "").toLowerCase() === "reserved").length
        : 0
    );
    const lockedBedsCount = room.unavailableBeds ?? (
      room.beds
        ? room.beds.filter((b) => ["locked", "maintenance"].includes(String(b.status || "").toLowerCase())).length
        : 0
    );
    const availableBedsCount = room.availableBeds ?? Math.max(0, totalBedsCount - occupiedCount - reservedBedsCount - lockedBedsCount);
    const takenBedsCount = Math.min(totalBedsCount, occupiedCount);
    const availLabel = availableBedsCount === 0 && lockedBedsCount > 0 ? "Unavailable" : "Full";

    const privateType = String(room.type || "").toLowerCase().includes("private");
    const minMonthsVal = 6;

    // Flyer calculation logic
    const norm = String(room.type || "").toLowerCase();
    let regularLong = room.regularLongRate ?? 6000;
    let regularShort = room.regularShortRate ?? 7000;
    let defaultDiscount = room.quadrupleDiscountPercent ?? 10;

    if (norm.includes("double")) {
      regularLong = room.regularLongRate ?? 9000;
      regularShort = room.regularShortRate ?? 10000;
      defaultDiscount = room.doubleDiscountPercent ?? 20;
    } else if (norm.includes("private")) {
      regularLong = room.regularLongRate ?? 15000;
      regularShort = room.regularShortRate ?? 16000;
      defaultDiscount = room.privateDiscountPercent ?? 10;
    }

    const discountPercentConfig = typeof room.longTermDiscountPercent === "number"
      ? room.longTermDiscountPercent
      : defaultDiscount;

    let longTermCalculated = typeof room.monthlyPrice === "number" && room.monthlyPrice > 0
      ? room.monthlyPrice
      : Math.round(regularLong * (1 - discountPercentConfig / 100));

    let shortTermCalculated = typeof room.shortTermRate === "number" && room.shortTermRate > 0
      ? room.shortTermRate
      : (typeof room.price === "number" && room.price > 0 ? room.price : Math.round(regularShort * (1 - discountPercentConfig / 100)));

    if (discountPercentConfig > 0 && discountPercentConfig < 100) {
      regularLong = Math.round(longTermCalculated / (1 - discountPercentConfig / 100));
      regularShort = Math.round(shortTermCalculated / (1 - discountPercentConfig / 100));
    }

    const discountEnabled = room.isDiscountEnabled !== false;
    const activeRegRate = regularLong;
    const finalLongTermRate = !discountEnabled ? regularLong : (room.monthlyPrice || longTermCalculated);
    const finalShortTermRate = !discountEnabled ? regularShort : (room.shortTermRate || shortTermCalculated);

    const activeDiscount = (discountEnabled && activeRegRate > finalLongTermRate)
      ? (activeRegRate - finalLongTermRate)
      : 0;

    const discountPct = (discountEnabled && activeRegRate > 0 && activeDiscount > 0)
      ? Math.round((activeDiscount / activeRegRate) * 100)
      : 0;

    return {
      totalBeds: totalBedsCount,
      reservedBeds: reservedBedsCount,
      lockedBeds: lockedBedsCount,
      availableBeds: availableBedsCount,
      takenBeds: takenBedsCount,
      availabilityLabel: availLabel,
      isPrivate: privateType,
      minMonths: minMonthsVal,
      shortTermRate: finalShortTermRate,
      longTermRate: finalLongTermRate,
      regularLongRate: activeRegRate,
      regularShortRate: regularShort,
      discountPercent: discountPct,
    };
  }, [room]);

  return (
    <div
      className="ca-card"
      onClick={handleCardClick}
      onMouseEnter={handleCardMouseEnter}
      style={{ "--card-index": cardIndex }}
    >
      {/* Image carousel */}
      <div className="ca-card-image-wrap">
        {/* Solid neutral placeholder surface — strictly no gradients */}
        <div
          aria-hidden="true"
          className={`ca-card-placeholder ${isCurrentLoaded ? "ca-card-placeholder--hidden" : ""}`}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            backgroundColor: "var(--card-muted, #f1f5f9)",
            borderRadius: "inherit",
            opacity: isCurrentLoaded ? 0 : 1,
            transition: "opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
            pointerEvents: "none",
            willChange: "opacity",
          }}
        />

        {images.length === 0 ? (
          <div
            className="ca-card-no-photo flex flex-col items-center justify-center text-muted-foreground gap-1.5"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              backgroundColor: "var(--card-muted, #f1f5f9)",
            }}
          >
            <Bed className="w-8 h-8 stroke-[1.5] text-muted-foreground/60" />
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground/70">No photos available</span>
          </div>
        ) : (
          <>
            {/* Previous image layer kept visible during carousel slide cross-fade */}
            {previousImageIndex !== null && images[previousImageIndex] && (
              <img
                key={`prev-${previousImageIndex}`}
                src={images[previousImageIndex]}
                alt=""
                aria-hidden="true"
                className="ca-card-img--prev-slide"
                onAnimationEnd={() => setPreviousImageIndex(null)}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
            )}

            <img
              key={`current-${currentImageIndex}-${room._id || room.id}`}
              src={images[currentImageIndex]}
              alt={room.title || "Room photo"}
              loading={currentImageIndex === 0 ? "eager" : "lazy"}
              fetchpriority={isPriority && currentImageIndex === 0 ? "high" : "auto"}
              decoding="auto"
              ref={(node) => {
                if (node && node.complete && !loadedMap[currentImageIndex]) {
                  setLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }));
                }
              }}
              onLoad={() => setLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }))}
              onError={handleImageError}
              className={isCurrentLoaded ? "ca-card-img--fade-in" : ""}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                zIndex: 3,
                opacity: isCurrentLoaded ? 1 : 0,
                transform: isCurrentLoaded ? "scale(1)" : "scale(1.04)",
                transition: "opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
                willChange: "opacity, transform",
                pointerEvents: "none",
              }}
            />
          </>
        )}

        {/* Discount Badge */}
        {discountPercent > 0 && (
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm z-10"
            style={{
              backgroundColor: "var(--chart-3, #d97706)",
              color: "#ffffff",
              border: "1px solid color-mix(in srgb, var(--chart-3, #d97706) 40%, transparent)",
            }}
          >
            {discountPercent}% OFF
          </div>
        )}

        {/* Nav buttons (visible on hover via CSS) */}
        {images.length > 1 && (
          <>
            <button
              className="ca-card-nav-btn left"
              onClick={prevImage}
              type="button"
              aria-label="Previous image"
            >
              <ChevronLeft style={{ width: 16, height: 16, color: "var(--foreground, #0f172a)" }} />
            </button>
            <button
              className="ca-card-nav-btn right"
              onClick={nextImage}
              type="button"
              aria-label="Next image"
            >
              <ChevronRight style={{ width: 16, height: 16, color: "var(--foreground, #0f172a)" }} />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {images.length > 1 && (
          <div className="ca-card-dots">
            {images.map((_, index) => (
              <div
                key={index}
                className={`ca-card-dot ${index === currentImageIndex ? "active" : ""}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="ca-card-body">
        <div className="ca-card-title">
          {highlightTokens(room.title, searchQuery)}
          <span className="ca-type-badge">{room.type}</span>
        </div>

        {/* Bed availability status */}
        <div className="ca-bed-dots">
          {!isPrivate && (
            <div className="dots">
              {/* Available beds first (green) */}
              {Array.from({ length: availableBeds }).map((_, i) => (
                <div key={`a-${i}`} className="ca-bed-dot available" title="Available Bed" />
              ))}
              {/* Taken beds (red) */}
              {Array.from({ length: takenBeds }).map((_, i) => (
                <div key={`t-${i}`} className="ca-bed-dot taken" title="Occupied Bed" />
              ))}
              {Array.from({ length: reservedBeds }).map((_, i) => (
                <div key={`r-${i}`} className="ca-bed-dot reserved" title="Reserved Bed" />
              ))}
              {Array.from({ length: lockedBeds }).map((_, i) => (
                <div key={`l-${i}`} className="ca-bed-dot locked" title="Under Maintenance" />
              ))}
            </div>
          )}
          <span className="label">
            {isPrivate
              ? availableBeds > 0
                ? "Available"
                : availabilityLabel
              : availableBeds === 0
                ? availabilityLabel
                : `${availableBeds} of ${totalBeds} open`}
          </span>
        </div>

        {/* Location & Matched Amenities */}
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="ca-card-location">
            <MapPin size={13} />
            <span>{highlightTokens(room.branch, searchQuery)}</span>
          </div>

          {matchedAmenities.length > 0 && (
            <div className="flex items-center gap-1">
              {matchedAmenities.slice(0, 2).map((amenity, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--chart-3, #d97706) 12%, var(--card, #fff))",
                    color: "var(--chart-3, #d97706)",
                    border: "1px solid color-mix(in srgb, var(--chart-3, #d97706) 25%, transparent)",
                  }}
                >
                  ✓ {highlightTokens(amenity, searchQuery)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Transparent Price UI with Lease Term Awareness */}
        <div className="ca-card-price-container flex items-center flex-wrap gap-1.5">
          {selectedLeaseTermFilter === "shortTerm" ? (
            <>
              <span className="ca-price-primary">
                ₱{shortTermRate.toLocaleString()}
              </span>
              <span className="ca-price-unit">/ mo</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--info, #2563eb) 12%, var(--card, #fff))",
                  color: "var(--info-dark, #1e40af)",
                  border: "1px solid color-mix(in srgb, var(--info, #2563eb) 25%, transparent)",
                }}
              >
                Short-Term
              </span>
            </>
          ) : selectedLeaseTermFilter === "longTerm" ? (
            <>
              {discountPercent > 0 && regularLongRate > longTermRate && (
                <span className="text-xs line-through opacity-60 font-normal text-muted-foreground mr-0.5">
                  ₱{regularLongRate.toLocaleString()}
                </span>
              )}
              <span className="ca-price-primary">
                ₱{longTermRate.toLocaleString()}
              </span>
              <span className="ca-price-unit">/ mo</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--success, #059669) 12%, var(--card, #fff))",
                  color: "var(--success-dark, #065f46)",
                  border: "1px solid color-mix(in srgb, var(--success, #059669) 25%, transparent)",
                }}
              >
                Long-Term Rate
              </span>
            </>
          ) : (
            <>
              {shortTermRate > longTermRate && !discountPercent && (
                <span className="ca-price-prefix">Starts at</span>
              )}
              {discountPercent > 0 && regularLongRate > longTermRate && (
                <span className="text-xs line-through opacity-60 font-normal text-muted-foreground mr-0.5">
                  ₱{regularLongRate.toLocaleString()}
                </span>
              )}
              <span className="ca-price-primary">
                ₱{longTermRate.toLocaleString()}
              </span>
              <span className="ca-price-unit">/ mo</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--chart-3, #d97706) 12%, var(--card, #fff))",
                  color: "var(--chart-3, #d97706)",
                  border: "1px solid color-mix(in srgb, var(--chart-3, #d97706) 25%, transparent)",
                }}
              >
                Flexi-Lease
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default RoomCard;
