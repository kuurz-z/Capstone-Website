import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertCircle,
  Bed,
  Calculator,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CreditCard,

  Info,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  X,
  Zap,
} from "lucide-react";
import SpotlightCard from "../components/SpotlightCard";
import BedSelector from "../components/BedSelector";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";
import {
  LEASE_OPTIONS,
  getAvailableLeaseOptions,
  getMoveInDateConstraints,
} from "../pages/reservation-steps/applicationFormConstants";
import { validateTargetMoveInDate } from "../utils/reservationValidation";
import { getOptimizedUrl, getThumbnailUrl } from "../../../shared/utils/imageOptimizer";
import { calculateRoomDetailsCost, getFlyerRates } from "../utils/roomDetailsPricing";


// Global cache of preloaded image URLs to prevent duplicate instances
const PRELOADED_URLS = new Set();

// ─── Helpers ──────────────────────────────────────────────────

function getAvailabilityMeta(room) {
  const beds = room.beds || [];
  const totalBeds = room.capacity || beds.length || 0;
  const availableBeds =
    room.availableBeds ??
    beds.filter(
      (bed) =>
        String(bed.status || "").toLowerCase().trim() === "available" ||
        (bed.status === undefined && bed.available),
    ).length;

  let label = "Available";
  if (totalBeds) {
    if (availableBeds === 0) {
      label = room.unavailableBeds > 0 ? "Unavailable" : "Full";
    } else if (availableBeds <= Math.max(1, Math.ceil(totalBeds * 0.25))) {
      label = "Limited";
    }
  }

  const meta = {
    Available: { bg: "var(--success)", fg: "var(--success-foreground)" },
    Limited: { bg: "var(--warning)", fg: "var(--warning-foreground)" },
    Full: { bg: "var(--danger)", fg: "var(--danger-foreground)" },
    Unavailable: { bg: "var(--neutral)", fg: "var(--neutral-foreground)" },
  }[label];

  return { label, ...meta };
}

function getImages(room) {
  if (room?.images?.length) return room.images;
  if (room?.image) return [room.image];
  return [];
}

function isPrivateRoomType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return normalized === "private" || normalized.includes("private");
}


// ─── Small presentational pieces ─────────────────────────────

const SectionHeading = ({ icon: Icon, tone = "primary", title, subtitle, action }) => (
  <div className="flex items-center justify-between gap-3 mb-3.5">
    <div className="flex items-center gap-2.5 min-w-0">
      {Icon && (
        <Icon
          className="w-5 h-5 shrink-0"
          style={{ color: tone && tone !== "neutral" ? `var(--${tone})` : "var(--primary)" }}
        />
      )}
      <div className="min-w-0">
        <h3 className="font-semibold text-sm text-foreground tracking-tight truncate">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

const StatChip = ({ icon: Icon, label, value, tone = "neutral" }) => (
  <div className="flex-1 min-w-[110px] rounded-xl border border-border/70 bg-card px-3.5 py-2.5">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
      {Icon && (
        <Icon
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: tone && tone !== "neutral" ? `var(--${tone})` : "var(--muted-foreground)" }}
        />
      )}
      {label}
    </div>
    <p className="text-lg font-semibold text-foreground leading-none">{value}</p>
  </div>
);

// ─── Component ────────────────────────────────────────────────

export default function RoomDetailsModal({
  isOpen,
  room,
  onClose,
  onProceed,
  isOverbooked,
  selectedBed,
  onSelectBed,
  selectedAppliances = {},
  onApplianceQuantityChange,
  calculateApplianceFees,
  availableAppliances = [],
  proceedButtonText = "Proceed to Reservation",
  selectedLeaseDuration = "",
  onSelectLeaseDuration,
  selectedIntendedMoveInDate = "",
  onSelectIntendedMoveInDate,
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [hdLoadedMap, setHdLoadedMap] = useState({});
  const [internalLeaseDuration, setInternalLeaseDuration] = useState("");
  const [internalMoveInDate, setInternalMoveInDate] = useState("");
  const datePickerRef = React.useRef(null);


  useEscapeClose(isOpen && !!room, onClose);

  // Stable memoized image array
  const images = useMemo(
    () => getImages(room || {}),
    [room?.id, room?.images, room?.image]
  );

  // Preload all full-res and thumbnail photos on modal mount exactly once
  useEffect(() => {
    if (!isOpen || images.length === 0 || typeof Image === "undefined") return;
    images.forEach((imgSrc) => {
      if (!imgSrc) return;
      const hdUrl = getOptimizedUrl(imgSrc, { width: 1200, quality: 82 });
      const thumbUrl = getThumbnailUrl(imgSrc, { width: 120, quality: 70 });
      if (!PRELOADED_URLS.has(hdUrl)) {
        PRELOADED_URLS.add(hdUrl);
        const hd = new Image();
        hd.src = hdUrl;
      }
      if (!PRELOADED_URLS.has(thumbUrl)) {
        PRELOADED_URLS.add(thumbUrl);
        const thumb = new Image();
        thumb.src = thumbUrl;
      }
    });
  }, [isOpen, images]);

  const isHdLoaded = Boolean(hdLoadedMap[currentImageIndex]);

  const activeLeaseDuration =
    onSelectLeaseDuration && selectedLeaseDuration !== undefined
      ? selectedLeaseDuration
      : internalLeaseDuration;

  const hasLeaseSelected = Boolean(
    activeLeaseDuration && String(activeLeaseDuration).trim() !== "",
  );

  const handleLeaseChange = useCallback((val) => {
    setInternalLeaseDuration(val);
    if (onSelectLeaseDuration) onSelectLeaseDuration(val);
  }, [onSelectLeaseDuration]);

  const activeMoveInDate =
    onSelectIntendedMoveInDate && selectedIntendedMoveInDate !== undefined
      ? selectedIntendedMoveInDate
      : internalMoveInDate;

  const handleMoveInDateChange = useCallback(
    (val) => {
      setInternalMoveInDate(val);
      if (onSelectIntendedMoveInDate) onSelectIntendedMoveInDate(val);
    },
    [onSelectIntendedMoveInDate],
  );

  const { minMoveInDate, maxMoveInDate } = useMemo(() => {
    return getMoveInDateConstraints();
  }, []);

  const isMoveInDateValid = useMemo(() => {
    if (!activeMoveInDate) return true; // Optional on room selection
    const validation = validateTargetMoveInDate(activeMoveInDate);
    return validation.valid;
  }, [activeMoveInDate]);

  const cost = useMemo(
    () =>
      calculateRoomDetailsCost({
        room,
        roomType: room?.type,
        activeLeaseDuration,
        calculateApplianceFees,
      }),
    [room, activeLeaseDuration, calculateApplianceFees],
  );

  const {
    isLongTerm,
    leaseMonths,
    activeRegularRate,
    activeMonthlyRate,
    activeFlyerDiscount,
    discountPercent,
    applianceFeesAmount,
    securityDepositAmount,
    calculatedUpfrontTotal,
    totalSavingsAmount,
  } = cost;


  const isDiscountEnabled = room?.isDiscountEnabled !== false;

  const minMonths = 6;

  const requiresBedSelection = useMemo(
    () => Boolean(room?.beds && room.beds.length > 1 && !isPrivateRoomType(room.type)),
    [room?.beds, room?.type]
  );

  const proceedDisabled =
    isOverbooked || !hasLeaseSelected || !isMoveInDateValid || (requiresBedSelection && !selectedBed);

  const handleProceedClick = useCallback(() => {
    if (!hasLeaseSelected) {
      showNotification("Please select a preferred lease term before proceeding.", "warning");
      return;
    }
    if (requiresBedSelection && !selectedBed) {
      showNotification("Please select a bed location before proceeding.", "warning");
      return;
    }
    if (activeMoveInDate && !isMoveInDateValid) {
      showNotification(
        "Intended move-in date must be at least 3 days from today, up to 3 months.",
        "warning",
      );
      return;
    }
    if (isOverbooked) {
      showNotification("This room is currently fully booked.", "warning");
      return;
    }
    if (onProceed) onProceed();
  }, [hasLeaseSelected, requiresBedSelection, selectedBed, activeMoveInDate, isMoveInDateValid, isOverbooked, onProceed]);

  const { totalBeds, availableBeds, occupancyPercentage } = useMemo(() => {
    if (!room) return { totalBeds: 0, availableBeds: 0, occupancyPercentage: 0 };
    const total = room.capacity || room.beds?.length || 0;
    const available =
      room.availableBeds ??
      (room.beds
        ? room.beds.filter(
            (bed) =>
              String(bed.status || "").toLowerCase().trim() === "available" ||
              (bed.status === undefined && bed.available),
          ).length
        : 0);
    const pct = total ? ((total - available) / total) * 100 : 0;
    return { totalBeds: total, availableBeds: available, occupancyPercentage: pct };
  }, [room?.capacity, room?.beds, room?.availableBeds]);

  const handlePrevImage = useCallback(() => {
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleNextImage = useCallback(() => {
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const availability = useMemo(() => (room ? getAvailabilityMeta(room) : { label: "Available", bg: "var(--success)", fg: "#fff" }), [room]);

  const defaultTerms = useMemo(() => {
    return getAvailableLeaseOptions(minMonths).map((opt) => opt.months);
  }, [minMonths]);

  if (!isOpen || !room) return null;

  return (
    <div
      className="rdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <style>{`
        @keyframes rdm-rise { from { opacity: 0; transform: translateY(16px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .rdm-panel {
          animation: rdm-rise 0.22s cubic-bezier(0.16,1,0.3,1);
          contain: content;
          will-change: transform;
          transform: translateZ(0);
          backface-visibility: hidden;
        }
        @media (prefers-reduced-motion: reduce) { .rdm-panel { animation: none; } }
        .rdm-scroller::-webkit-scrollbar { width: 8px; }
        .rdm-scroller::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
        .rdm-thumbstrip::-webkit-scrollbar { display: none; }
        .rdm-chip {
          border: 1px solid var(--border);
          background: var(--muted);
          transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
          will-change: transform;
          transform: translateZ(0);
        }
        .rdm-chip:hover { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); }
        .rdm-chip.is-active {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--primary-foreground);
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rdm-title"
        className="rdm-panel bg-card w-full sm:max-w-6xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-border">
          <div className="min-w-0">
            <h2 id="rdm-title" className="text-xl sm:text-2xl font-semibold text-foreground truncate">
              {room.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {room.branch}
              </span>
              <span className="opacity-50">•</span>
              <span>{room.type}</span>
              <span className="opacity-50">•</span>
              <span>{room.bedLayout}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close room details"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — unified single scroll for entire modal */}
        <div className="rdm-scroller flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-8 p-5 sm:p-7 items-start">
            {/* ── LEFT: visual identity ── */}
            <div className="space-y-5">
              <SpotlightCard className="p-0">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
                  {images.length > 0 && (
                    <>
                      {/* Base layer: Instant thumbnail from cache (0ms blank time) */}
                      <img
                        src={getThumbnailUrl(images[currentImageIndex], { width: 480, quality: 75 })}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full object-cover"
                        style={{
                          filter: isHdLoaded ? "none" : "blur(4px)",
                          transform: isHdLoaded ? "scale(1)" : "scale(1.03)",
                          transition: "filter 0.3s ease, transform 0.3s ease",
                        }}
                      />

                      {/* Overlay layer: Full 1200px HD image fading in smoothly */}
                      <img
                        src={getOptimizedUrl(images[currentImageIndex], { width: 1200, quality: 82 })}
                        alt={`${room.title} — photo ${currentImageIndex + 1}`}
                        loading="eager"
                        fetchpriority="high"
                        decoding="async"
                        onLoad={() => setHdLoadedMap((prev) => ({ ...prev, [currentImageIndex]: true }))}
                        className="w-full h-full object-cover absolute inset-0"
                        style={{
                          opacity: isHdLoaded ? 1 : 0,
                          transition: "opacity 0.3s ease",
                        }}
                      />
                    </>
                  )}

                  <span
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm"
                    style={{ backgroundColor: availability.bg, color: availability.fg }}
                  >
                    {availability.label}
                  </span>

                  {images.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevImage}
                        aria-label="Previous photo"
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center hover:bg-card shadow-md transition-all"
                      >
                        <ChevronLeft className="w-5 h-5 text-foreground" />
                      </button>
                      <button
                        onClick={handleNextImage}
                        aria-label="Next photo"
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center hover:bg-card shadow-md transition-all"
                      >
                        <ChevronRight className="w-5 h-5 text-foreground" />
                      </button>
                      <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs">
                        {currentImageIndex + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>
              </SpotlightCard>

              {images.length > 1 && (
                <div className="rdm-thumbstrip flex gap-2 overflow-x-auto pb-1 items-center">
                  {images.map((image, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCurrentImageIndex(index)}
                      aria-label={`View photo ${index + 1}`}
                      aria-current={currentImageIndex === index}
                      className="shrink-0 w-16 h-16 min-w-[4rem] min-h-[4rem] aspect-square rounded-lg overflow-hidden border bg-muted relative flex items-center justify-center cursor-pointer transition-all"
                      style={{
                        borderColor: currentImageIndex === index ? "var(--primary)" : "transparent",
                        opacity: currentImageIndex === index ? 1 : 0.75,
                        boxShadow: currentImageIndex === index ? "0 0 0 1px var(--primary)" : "none",
                      }}
                    >
                      <img
                        src={getThumbnailUrl(image, { width: 120, quality: 70 })}
                        alt={`Photo thumbnail ${index + 1}`}
                        loading="eager"
                        fetchpriority="high"
                        decoding="async"
                        className="w-full h-full object-cover block"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Quick facts */}
              <div className="flex flex-wrap gap-2">
                <StatChip icon={Users} label="Capacity" value={`${totalBeds} ${totalBeds === 1 ? "Bed" : "Beds"}`} />
                <StatChip
                  icon={Bed}
                  label="Available"
                  value={`${availableBeds} / ${totalBeds}`}
                  tone={availableBeds === 0 ? "danger" : "success"}
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Current occupancy</span>
                  <span>{totalBeds - availableBeds} / {totalBeds} unavailable</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${occupancyPercentage}%`,
                      backgroundColor: occupancyPercentage >= 75 ? "var(--warning)" : "var(--success)",
                    }}
                  />
                </div>
              </div>

              {room.intendedTenant && (
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground font-medium">Intended for:</strong> {room.intendedTenant}
                </p>
              )}

              {/* Amenities */}
              {room.amenities?.length > 0 && (
                <div>
                  <SectionHeading icon={Sparkles} title="Amenities" />
                  <div className="flex flex-wrap gap-2">
                    {room.amenities.map((amenity, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-muted/40 text-foreground"
                      >
                        <Check className="w-3.5 h-3.5" style={{ color: "var(--success)" }} />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Policies */}
              {room.policies?.length > 0 && (
                <details className="group rounded-xl border border-border/70 bg-muted/30 open:bg-muted/40">
                  <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
                    <span className="flex items-center gap-2">
                      <Info className="w-4 h-4" style={{ color: "var(--neutral-dark)" }} />
                      Policies & important notes
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-4 pb-4 space-y-2">
                    {room.policies.map((policy, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
                        <span className="text-xs text-muted-foreground leading-relaxed">{policy}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* ── RIGHT: booking configuration ── */}
            <div className="space-y-5">
              {requiresBedSelection && (
                <div className="rounded-2xl border border-border/70 p-5">
                  <SectionHeading icon={Bed} title="Choose your bed" subtitle="Pick an available bed location" />
                  <BedSelector beds={room.beds} selectedBed={selectedBed} onSelect={onSelectBed} />
                </div>
              )}

              {/* Lease term */}
              <div className="rounded-2xl border border-border/70 p-5">
                <SectionHeading icon={Calendar} title="Lease term" subtitle="Choose how long you'll stay" />

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {defaultTerms.map((m) => {
                    const valStr = String(m);
                    const labelStr = m === 12 ? "1 yr" : `${m} mo${m > 1 ? "s" : ""}`;
                    const isSelected = activeLeaseDuration === valStr;
                    const itemIsLongTerm = m >= minMonths;
                    return (
                      <button
                        key={valStr}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleLeaseChange(valStr)}
                        className={`rdm-chip py-2 px-1 rounded-lg text-xs flex flex-col items-center justify-center${isSelected ? " is-active" : ""}`}
                      >
                        <span className="font-semibold">{labelStr}</span>
                        {isDiscountEnabled && discountPercent > 0 ? (
                          <span
                            className="text-[9px] font-semibold mt-0.5"
                            style={{ color: isSelected ? "inherit" : "var(--success)" }}
                          >
                            {discountPercent}% OFF
                          </span>
                        ) : (
                          <span className="text-[9px] mt-0.5 opacity-70">
                            {itemIsLongTerm ? "Long-term" : "Short-term"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {!hasLeaseSelected && (
                  <div
                    className="mt-4 p-3 rounded-lg text-xs flex items-center gap-2.5"
                    style={{ backgroundColor: "var(--status-warning-bg)", color: "var(--warning-dark)" }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--warning)" }} />
                    Select a lease term above to see pricing.
                  </div>
                )}
              </div>

              {/* Intended Move-in Date */}
              <div className="rounded-2xl border border-border/70 p-5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm text-foreground">Intended Move-in Date</span>
                  </div>
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    Optional
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Feel free to pick a date now or skip this step. You can also adjust this date before submitting in your application form.
                </p>

                <div className="relative flex items-center group mt-2">
                  <input
                    ref={datePickerRef}
                    id="modalIntendedMoveInDate"
                    type="date"
                    min={minMoveInDate}
                    max={maxMoveInDate}
                    value={activeMoveInDate ? String(activeMoveInDate).substring(0, 10) : ""}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch (_) {}
                    }}
                    onChange={(e) => handleMoveInDateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-16 text-sm rounded-xl border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs cursor-pointer hide-native-date-indicator"
                    style={{
                      colorScheme: "light",
                      border: activeMoveInDate && !isMoveInDateValid ? "1.5px solid var(--danger)" : "1px solid var(--border)",
                    }}
                  />
                  <div className="absolute right-2.5 flex items-center gap-1">
                    {activeMoveInDate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveInDateChange("");
                        }}
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors focus:outline-none cursor-pointer"
                        title="Clear date"
                        aria-label="Clear date"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          datePickerRef.current?.showPicker?.();
                        } catch (_) {
                          datePickerRef.current?.focus();
                        }
                      }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors focus:outline-none cursor-pointer"
                      title="Open calendar picker"
                      aria-label="Open calendar picker"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {activeMoveInDate && !isMoveInDateValid ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium">
                    Must be at least 3 days from today, up to 3 months.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    {activeMoveInDate
                      ? "Selected date will be automatically pre-filled in your application form."
                      : "Optional on room selection. If selected, must be at least 3 days from today, up to 3 months."}
                  </p>
                )}
              </div>

              {/* Appliance add-ons */}
              {room.applianceFeeEnabled && (
                <div className="rounded-2xl border border-border/70 p-5">
                  <SectionHeading icon={Zap} title="Appliance add-ons" subtitle="Optional, billed monthly per tenant" />
                  <div className="divide-y divide-border/60">
                    {availableAppliances.map((appliance) => {
                      const qty = selectedAppliances[appliance.id] || 0;
                      const maxQty = appliance.maxQuantity || 5;
                      const unitFee = Number(appliance.monthlyFee ?? appliance.price ?? 200);
                      return (
                        <div key={appliance.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{appliance.name}</p>
                            <p className="text-xs text-muted-foreground">₱{unitFee.toLocaleString()}/month each</p>
                            {appliance.description && (
                              <p className="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">{appliance.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              aria-label={`Decrease ${appliance.name} quantity`}
                              onClick={() => onApplianceQuantityChange(appliance.id, Math.max(0, qty - 1))}
                              className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-all disabled:opacity-40"
                              disabled={qty === 0}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-7 text-center text-sm font-semibold text-foreground tabular-nums">{qty}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${appliance.name} quantity`}
                              onClick={() => onApplianceQuantityChange(appliance.id, Math.min(maxQty, qty + 1))}
                              className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-all disabled:opacity-40"
                              disabled={qty >= maxQty}
                              title={qty >= maxQty ? `Max limit reached (${maxQty})` : `Add ${appliance.name}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {applianceFeesAmount > 0 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60 text-sm">
                      <span className="text-muted-foreground">Total add-on fees</span>
                      <span className="font-semibold" style={{ color: "var(--primary)" }}>
                        ₱{applianceFeesAmount.toLocaleString()}/mo
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Monthly Rate Summary Card */}
              <div className="rounded-2xl border border-border/70 overflow-hidden bg-card">
                <div className="p-5">
                  <SectionHeading
                    icon={Calculator}
                    tone="primary"
                    title="Monthly Rate Summary"
                    subtitle="Base rent and selected monthly options"
                    action={
                      hasLeaseSelected ? (
                        <div
                          className="inline-flex items-center h-7 gap-1.5 px-2.5 rounded-md text-xs font-medium border border-border bg-card text-foreground whitespace-nowrap"
                          aria-label={
                            isLongTerm
                              ? `Long-term rate${discountPercent > 0 ? `, ${discountPercent}% discount` : ""}`
                              : "Short-term rate"
                          }
                        >
                          <Tag
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isLongTerm
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-sky-600 dark:text-sky-400"
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={`font-semibold ${
                              isLongTerm
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-sky-700 dark:text-sky-400"
                            }`}
                          >
                            {isLongTerm ? "Long-term rate" : "Short-term rate"}
                          </span>
                          {isLongTerm && discountPercent > 0 && (
                            <span
                              className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none tracking-tight shrink-0"
                              style={{
                                backgroundColor: "var(--success)",
                                color: "var(--success-foreground)",
                              }}
                            >
                              -{discountPercent}%
                            </span>
                          )}
                        </div>
                      ) : null
                    }
                  />

                  {!hasLeaseSelected ? (
                    <div className="mt-2 p-3.5 rounded-xl text-xs flex items-center gap-2.5" style={{ backgroundColor: "var(--status-warning-bg)" }}>
                      <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--warning)" }} />
                      <span style={{ color: "var(--warning-dark)" }}>
                        Choose a lease term above to see the monthly rate.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-sm pt-1">
                      {/* Base Room Rent */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Base room rent</span>
                        <div className="text-right">
                          <span className="font-semibold text-foreground tabular-nums">
                            ₱{activeMonthlyRate.toLocaleString()}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                          {activeFlyerDiscount > 0 && (
                            <span className="text-[11px] text-muted-foreground line-through ml-2">
                              ₱{activeRegularRate.toLocaleString()}/mo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Promo Discount line if applicable */}
                      {activeFlyerDiscount > 0 && (
                        <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Promo discount (-{discountPercent}%):
                          </span>
                          <span className="tabular-nums">-₱{activeFlyerDiscount.toLocaleString()}/mo</span>
                        </div>
                      )}

                      {/* Add-on Appliances (Total) */}
                      {applianceFeesAmount > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Add-on appliances (Total)</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            +₱{applianceFeesAmount.toLocaleString()}/mo
                          </span>
                        </div>
                      )}

                      {/* Total Monthly Stay Rate */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <div>
                          <span className="font-bold text-foreground block">Total Monthly Rate</span>
                          <span className="text-[11px] text-muted-foreground">
                            {isLongTerm ? "Long-term stay rate" : "Short-term stay rate"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-extrabold tabular-nums" style={{ color: "var(--primary)" }}>
                            ₱{((activeMonthlyRate || 0) + (applianceFeesAmount || 0)).toLocaleString()}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                        </div>
                      </div>

                      {/* Informational Callout pointing to Step 1 */}
                      <div className="mt-3 pt-3 border-t border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="leading-relaxed">
                          Initial reservation deposit, 1-month advance, security deposit, and payment schedule are reviewed in <strong>Step 1</strong> of your reservation.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — persistent price + CTA */}
        <div
          className="shrink-0 border-t border-border px-5 sm:px-7 py-4 bg-card shadow-[0_-6px_18px_-8px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 shrink-0" style={{ color: "var(--primary)" }} />
              {hasLeaseSelected ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Monthly Stay Rate</p>
                  <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: "var(--primary)" }}>
                    ₱{((activeMonthlyRate || 0) + (applianceFeesAmount || 0)).toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground ml-1.5">
                      / month ({isLongTerm ? "Long-term" : "Short-term"})
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">Select a lease term to see your rate.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleProceedClick}
              className="w-full sm:w-auto min-h-[48px] px-7 py-3.5 rounded-xl font-semibold text-sm transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed hover:brightness-95 flex items-center justify-center"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
                opacity: proceedDisabled ? 0.55 : 1,
              }}
            >
              {!hasLeaseSelected
                ? "Select a lease term"
                : requiresBedSelection && !selectedBed
                ? "Select a bed"
                : activeMoveInDate && !isMoveInDateValid
                ? "Invalid move-in date"
                : proceedButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


