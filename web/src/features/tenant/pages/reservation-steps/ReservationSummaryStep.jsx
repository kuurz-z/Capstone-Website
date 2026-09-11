import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bed,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Image as ImageIcon,
  Maximize2,
  Wallet,
  X,
  MapPin,
  AlertCircle,
  Wind,
  Wifi,
  BookOpen,
  UserCheck,
  Box,
  ShowerHead,
  Bath,
  CheckCircle2,
  Layers,
  Users,
  ShieldCheck,
  Calendar,
  Lock,
  Edit3,
  Loader2,
  Sparkles,
  Info,
} from "lucide-react";
import { formatBranch, formatRoomType, formatDate } from "../../../../shared/utils/formatDate";
import { getBedDisplayLabel } from "../../../../shared/utils/bedIdentifier";
import {
  getResolvedMonthlyRate,
  isPricingDisplayUsable,
  getEffectiveMonthlyStayRate,
} from "../../utils/pricingDisplayHelpers";
import { getAvailableLeaseOptions, getMoveInDateConstraints } from "./applicationFormConstants";
import { validateTargetMoveInDate } from "../../utils/reservationValidation";
import { showNotification } from "../../../../shared/utils/notification";
import { ROOM_SELECTION_LOCKED_MESSAGE } from "../../utils/reservationRoomLock";
import { calculatePaymentBreakdown } from "../../utils/roomDetailsPricing";
import { getRoomImages } from "../check-availability/checkAvailabilityConstants";




const toDisplayString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.map((item) => toDisplayString(item)).filter(Boolean).join(", ");
    return text || fallback;
  }
  if (typeof value === "object") {
    return toDisplayString(
      value.displayName ??
        value.name ??
        value.label ??
        value.title ??
        value.roomNumber ??
        value.slug ??
        value.key ??
        value.code ??
        value.value ??
        value.id,
      fallback,
    );
  }
  return fallback;
};

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatCurrency = (value) => `\u20b1${toFiniteNumber(value).toLocaleString()}`;

const getRoomName = (room) =>
  toDisplayString(room?.name || room?.roomNumber || room?.title || room?.id, "N/A");

const getSelectedBedLabel = (selectedBed) => {
  if (!selectedBed) return "No bed selected";
  return getBedDisplayLabel(selectedBed);
};

const getAvailableSlots = (room) => {
  if (Number.isFinite(Number(room?.availableSlots))) {
    return Number(room.availableSlots);
  }
  const capacity = Number(room?.capacity);
  const currentOccupancy = Number(room?.currentOccupancy);
  if (Number.isFinite(capacity) && Number.isFinite(currentOccupancy)) {
    return Math.max(0, capacity - currentOccupancy);
  }
  if (Array.isArray(room?.beds)) {
    return room.beds.filter((bed) => toDisplayString(bed?.status).toLowerCase() === "available").length;
  }
  return null;
};

const getAvailabilityLabel = (room, selectedBed) => {
  const beds = Array.isArray(room?.beds) ? room.beds : [];
  const selectedBedId = toDisplayString(selectedBed?.id || selectedBed?._id || selectedBed?.code);
  const matchedBed = selectedBedId
    ? beds.find((bed) => {
        const id = toDisplayString(bed?.id || bed?._id || bed?.code);
        return id && id === selectedBedId;
      })
    : null;
  const bedStatus = toDisplayString(selectedBed?.status || matchedBed?.status).toLowerCase();

  if (bedStatus === "locked") return "Temporarily held";
  if (bedStatus === "reserved") return "Reserved";
  if (bedStatus === "occupied") return "Occupied";
  if (bedStatus === "maintenance") return "Under maintenance";
  if (room?.available === false || getAvailableSlots(room) === 0) return "Unavailable";
  return "Available";
};

const getSummaryRoomImages = (room) => {
  const images = Array.isArray(room?.images)
    ? room.images.filter((image) => typeof image === "string" && image.trim())
    : [];
  if (typeof room?.image === "string" && room.image.trim()) images.unshift(room.image);
  const fallbackImages = getRoomImages(room?.type, room?.branch) || [];
  return Array.from(new Set([...images, ...fallbackImages])).filter(Boolean);
};

const formatSelectedAppliance = (item) => {
  if (typeof item === "string") return item;
  const name = toDisplayString(item?.name, "Appliance");
  const quantity = toFiniteNumber(item?.quantity, 0);
  return `${name}${quantity > 0 ? ` x${quantity}` : ""}`;
};

const formatSelectedApplianceDetailed = (item) => {
  if (typeof item === "string") return item;
  const name = toDisplayString(item?.name, "Appliance");
  const quantity = toFiniteNumber(item?.quantity, 1);
  const price = toFiniteNumber(item?.price ?? item?.monthlyFee ?? item?.fee, 0);
  if (price > 0 && quantity > 0) {
    return `${name} (${quantity}x) (+${formatCurrency(price * quantity)}/mo)`;
  }
  return `${name}${quantity > 0 ? ` (${quantity}x)` : ""}`;
};


const getAmenityIcon = (name) => {
  const normalized = String(name).toLowerCase();
  if (normalized.includes("air") || normalized.includes("ac") || normalized.includes("cooling")) return Wind;
  if (normalized.includes("wifi") || normalized.includes("internet")) return Wifi;
  if (normalized.includes("bed") || normalized.includes("mattress") || normalized.includes("bunk")) return Bed;
  if (normalized.includes("table") || normalized.includes("desk") || normalized.includes("study")) return BookOpen;
  if (normalized.includes("chair") || normalized.includes("seat")) return UserCheck;
  if (normalized.includes("cabinet") || normalized.includes("closet") || normalized.includes("wardrobe") || normalized.includes("storage")) return Box;
  if (normalized.includes("shower") || normalized.includes("water heater") || normalized.includes("heater")) return ShowerHead;
  if (normalized.includes("bath") || normalized.includes("restroom") || normalized.includes("toilet")) return Bath;
  return CheckCircle2;
};

/**
 * Reservation Summary Step
 * 2-Column Responsive Layout adhering to Lilycrest DMS design system
 */
const ReservationSummaryStep = ({
  reservationData,
  onNext,
  onChangeRoom,
  onUpdateStayPackage,
  targetMoveInDate,
  setTargetMoveInDate,
  leaseDuration,
  setLeaseDuration,
  readOnly,
}) => {
  const [activePhotoIndex, setActivePhotoIndex] = React.useState(0);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [showRoomChangeConfirm, setShowRoomChangeConfirm] = React.useState(false);
  const [isModifyStayOpen, setIsModifyStayOpen] = React.useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = React.useState(true);
  const [tempLeaseDuration, setTempLeaseDuration] = React.useState(
    () => String(leaseDuration || reservationData?.leaseDuration || reservationData?.room?.leaseDuration || "6")
  );
  const [tempMoveInDate, setTempMoveInDate] = React.useState(
    () => targetMoveInDate || reservationData?.targetMoveInDate || reservationData?.intendedMoveInDate || ""
  );
  const [isSavingStay, setIsSavingStay] = React.useState(false);
  const dateInputRef = React.useRef(null);

  const { minMoveInDate, maxMoveInDate } = React.useMemo(() => {
    return getMoveInDateConstraints();
  }, []);

  const isTempMoveInDateValid = React.useMemo(() => {
    if (!tempMoveInDate) return true;
    return validateTargetMoveInDate(tempMoveInDate).valid;
  }, [tempMoveInDate]);

  const room = reservationData?.room || {};
  const minMonths = room?.longTermLeaseMinMonths ?? 6;
  const leaseOptions = React.useMemo(
    () => getAvailableLeaseOptions(minMonths),
    [minMonths]
  );

  const handleOpenModifyStay = () => {
    setTempLeaseDuration(String(leaseDuration || reservationData?.leaseDuration || room?.leaseDuration || "6"));
    setTempMoveInDate(targetMoveInDate || reservationData?.targetMoveInDate || reservationData?.intendedMoveInDate || "");
    setIsModifyStayOpen(true);
  };

  const handleSaveStay = async () => {
    if (tempMoveInDate) {
      const validation = validateTargetMoveInDate(tempMoveInDate);
      if (!validation.valid) {
        showNotification(
          validation.error || "Intended move-in date must be at least 3 days from today, up to 3 months.",
          "warning",
        );
        return;
      }
    }
    setIsSavingStay(true);
    try {
      if (onUpdateStayPackage) {
        await onUpdateStayPackage({
          leaseDuration: tempLeaseDuration,
          targetMoveInDate: tempMoveInDate || null,
          intendedMoveInDate: tempMoveInDate || null,
        });
      }
      showNotification("Stay preferences updated successfully.", "success");
      setIsModifyStayOpen(false);
    } catch (err) {
      console.error("Failed to update stay package:", err);
      showNotification("Failed to update stay preferences. Please try again.", "error");
    } finally {
      setIsSavingStay(false);
    }
  };

  const handleConfirmAndContinue = () => {
    const effectiveDate =
      targetMoveInDate ||
      reservationData?.targetMoveInDate ||
      reservationData?.intendedMoveInDate;
    if (effectiveDate) {
      const validation = validateTargetMoveInDate(effectiveDate);
      if (!validation.valid) {
        showNotification(
          validation.error || "Intended move-in date must be at least 3 days from today, up to 3 months.",
          "warning",
        );
        handleOpenModifyStay();
        return;
      }
    }
    if (onNext) onNext();
  };

  const selectedBed = reservationData?.selectedBed;
  const activeLease = leaseDuration || reservationData?.leaseDuration || room?.leaseDuration;
  const pricingInfo = getEffectiveMonthlyStayRate(
    reservationData,
    activeLease ? { leaseDuration: activeLease } : {},
  );
  const monthlyRent = pricingInfo.baseMonthlyRent;
  const applianceFees = pricingInfo.applianceFees;
  const hasResolvedMonthlyRate = pricingInfo.hasResolvedRate;
  const estimatedMonthlyTotal = pricingInfo.estimatedMonthlyTotal;
  const reservationFeeAmount = toFiniteNumber(reservationData?.reservationFeeAmount, 2000);

  const selectedAppliances = Array.isArray(reservationData?.selectedAppliances)
    ? reservationData.selectedAppliances
    : reservationData?.selectedAppliances && typeof reservationData.selectedAppliances === "object"
    ? reservationData.selectedAppliances
    : [];

  const paymentBreakdown = React.useMemo(() => {
    return calculatePaymentBreakdown({
      monthlyRent: monthlyRent || 0,
      applianceFees: applianceFees || 0,
      selectedAppliances,
      reservationFeeAmount: reservationFeeAmount || 2000,
      room,
    });
  }, [monthlyRent, applianceFees, selectedAppliances, reservationFeeAmount, room]);

  const availabilityLabel = getAvailabilityLabel(room, selectedBed);

  const amenities = Array.isArray(room.amenities)
    ? room.amenities.map((amenity) => toDisplayString(amenity)).filter(Boolean)
    : [];
  const roomImages = getSummaryRoomImages(room);
  const activePhoto = roomImages[activePhotoIndex] || roomImages[0];

  const floorLabel = toDisplayString(room.floor);
  const capacityLabel = Number.isFinite(Number(room.capacity))
    ? Number(room.capacity)
    : toDisplayString(room.capacity, "?");

  const showPreviousPhoto = React.useCallback(() => {
    setActivePhotoIndex((current) =>
      current === 0 ? roomImages.length - 1 : current - 1,
    );
  }, [roomImages.length]);

  const showNextPhoto = React.useCallback(() => {
    setActivePhotoIndex((current) =>
      current === roomImages.length - 1 ? 0 : current + 1,
    );
  }, [roomImages.length]);

  const closeViewer = React.useCallback(() => setViewerOpen(false), []);

  // Keyboard navigation for photo viewer
  React.useEffect(() => {
    if (!viewerOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") showPreviousPhoto();
      if (event.key === "ArrowRight") showNextPhoto();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerOpen, closeViewer, showPreviousPhoto, showNextPhoto]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header (Strictly Solid Colors, Standalone Icons, Room Designation Pill) */}
      <div className="space-y-2.5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center px-3 py-1 bg-transparent border border-slate-200 dark:border-slate-700 rounded-full">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Step 1 · Room Selection
            </span>
          </div>

          {/* Room Designation Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 self-start sm:self-auto flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {getRoomName(room)} · {formatBranch(room.branch)}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Home className="w-7 h-7 text-slate-800 dark:text-slate-200 flex-shrink-0" />
            <span>Room Selection</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1 max-w-2xl">
            Review room details, inclusions, and move-in pricing preview before choosing your viewing preference.
          </p>
        </div>
      </div>

      {/* Top Bento Hero Row: Photos Showcase (7 cols) + Room Specifications (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Room Photos Showcase */}
        <div className="lg:col-span-7 flex flex-col">
          {roomImages.length > 0 && (
            <section className="content-card rf-room-photos-card m-0 flex-1 flex flex-col justify-between border border-slate-200 dark:border-slate-700">
              <div>
                <div className="card-section-title">
                  <ImageIcon size={16} className="text-slate-700 dark:text-slate-300 flex-shrink-0" />
                  <span>Room Photos</span>
                  <span className="ml-auto text-xs font-normal text-slate-500 dark:text-slate-400">
                    {activePhotoIndex + 1} of {roomImages.length}
                  </span>
                </div>

                <div className="rf-room-photo-carousel">
                  <button
                    type="button"
                    className="rf-room-photo-open group relative block w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none"
                    onClick={() => setViewerOpen(true)}
                    aria-label="Open room photo viewer"
                  >
                    <img
                      src={activePhoto}
                      alt={`${getRoomName(room)} photo ${activePhotoIndex + 1}`}
                      loading="lazy"
                      className="w-full h-64 sm:h-72 lg:h-80 object-cover transition-transform duration-300 group-hover:scale-102"
                    />
                    <span className="rf-room-photo-open-hint absolute bottom-3 right-3 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 bg-slate-900/85 text-white text-xs font-medium rounded-md backdrop-blur-sm border border-white/15 shadow-md pointer-events-none">
                      <Maximize2 size={13} className="shrink-0" />
                      <span>View Fullscreen</span>
                    </span>
                  </button>

                  {roomImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="rf-room-photo-nav rf-room-photo-nav-prev"
                        onClick={showPreviousPhoto}
                        aria-label="Previous room photo"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        className="rf-room-photo-nav rf-room-photo-nav-next"
                        onClick={showNextPhoto}
                        aria-label="Next room photo"
                      >
                        <ChevronRight size={18} />
                      </button>

                      {/* Thumbnail Quick Picker */}
                      <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
                        {roomImages.map((image, index) => (
                          <button
                            type="button"
                            key={image}
                            onClick={() => setActivePhotoIndex(index)}
                            aria-label={`Show room photo ${index + 1}`}
                            className={`relative flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border transition-all ${
                              index === activePhotoIndex
                                ? "border-slate-900 dark:border-slate-100 ring-2 ring-slate-400/30 dark:ring-slate-600/30"
                                : "border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={image}
                              alt={`Thumbnail ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Fullscreen Photo Lightbox */}
        {viewerOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              onClick={closeViewer}
            >
              <div
                className="absolute top-4 right-4 z-10"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={closeViewer}
                  aria-label="Close photo viewer"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div
                className="relative max-w-5xl max-h-[85vh] flex items-center justify-center"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  src={activePhoto}
                  alt={`${getRoomName(room)} enlarged photo ${activePhotoIndex + 1}`}
                  className="max-h-[85vh] max-w-full rounded-lg object-contain"
                />

                {roomImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={showPreviousPhoto}
                      aria-label="Previous photo"
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      onClick={showNextPhoto}
                      aria-label="Next photo"
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )}

        {/* Right Column: Room Specifications Card */}
        <div className="lg:col-span-5 flex flex-col">
          <section className="content-card rf-summary-panel m-0 flex-1 flex flex-col justify-between border border-slate-200 dark:border-slate-700">
            <div>
              <div className="card-section-title w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home size={16} className="text-slate-700 dark:text-slate-300 flex-shrink-0" />
                  <span>Room Specifications</span>
                </div>
                {!readOnly && onUpdateStayPackage && (
                  <button
                    type="button"
                    onClick={handleOpenModifyStay}
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 rounded-lg shadow-xs transition-all active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 cursor-pointer"
                    title="Edit lease duration and intended move-in date"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors" />
                    <span>Edit Stay</span>
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:border-slate-800">
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Branch Location</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {formatBranch(room.branch)}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Room Type</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatRoomType(room.type)}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Room Designation</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {getRoomName(room)}
                  </span>
                </div>
                {floorLabel && (
                  <div className="py-2.5 flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Floor Location</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      Floor {floorLabel}
                    </span>
                  </div>
                )}
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Selected Bed</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Bed className="w-3.5 h-3.5 text-slate-500" />
                    {getSelectedBedLabel(selectedBed)}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Occupancy Capacity</span>
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {capacityLabel} Beds total
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Availability Status</span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {availabilityLabel}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Selected Lease Term</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {Number(reservationData?.leaseDuration || room?.leaseDuration || leaseDuration) === 12
                      ? "12 Months (1 Year)"
                      : `${reservationData?.leaseDuration || room?.leaseDuration || leaseDuration || "6"} ${
                          Number(reservationData?.leaseDuration || room?.leaseDuration || leaseDuration || "6") === 1 ? "Month" : "Months"
                        }`}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between items-center text-sm border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Intended Move-in Date</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-right">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {targetMoveInDate || reservationData?.targetMoveInDate || reservationData?.intendedMoveInDate ? (
                      formatDate(
                        targetMoveInDate || reservationData?.targetMoveInDate || reservationData?.intendedMoveInDate,
                        "MMM DD, YYYY",
                      )
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 font-normal text-xs whitespace-nowrap">
                        Optional (Set in Step 3)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Move-in date is optional on room selection. You will confirm your date in Step 3.</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom 1-Column Section: Collapsible Room Features & Full-Width Pricing Breakdown */}
      <div className="space-y-6">
        {/* Room Features & Inclusions Card (Full Width & Collapsible) */}
        <section className="content-card rf-summary-panel m-0 w-full border border-slate-200 dark:border-slate-700 transition-colors">
          <button
            type="button"
            onClick={() => setIsFeaturesOpen((prev) => !prev)}
            aria-expanded={isFeaturesOpen}
            aria-controls="room-features-collapse"
            className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg group"
          >
            <div className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
              <Layers size={16} className="text-slate-700 dark:text-slate-300 flex-shrink-0" />
              <span>Room Features & Inclusions</span>
              {amenities.length > 0 && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({amenities.length} {amenities.length === 1 ? "inclusion" : "inclusions"})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
              <span className="text-xs font-medium hidden sm:inline-block">
                {isFeaturesOpen ? "Hide features" : "Show features"}
              </span>
              <ChevronDown
                size={18}
                className={`transition-transform duration-200 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 ${
                  isFeaturesOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isFeaturesOpen && (
            <div id="room-features-collapse" className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-3">
              {amenities.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                  {amenities.map((amenity) => {
                    const IconComponent = getAmenityIcon(amenity);
                    return (
                      <div
                        key={amenity}
                        className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                      >
                        <IconComponent size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-semibold leading-tight">{amenity}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Standard room amenities and inclusions apply.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Payment Breakdown Section (3-Card Chronological Roadmap) */}
        <section className="content-card rf-summary-panel m-0 w-full border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="card-section-title">
            <Wallet size={16} className="text-slate-700 dark:text-slate-300 flex-shrink-0" />
            <span>Payment Breakdown</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 items-stretch">
            {/* Card 1: Initial Reservation Deposit */}
            <div className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Initial Reservation Deposit
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-transparent text-emerald-700 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    100% Credited
                  </span>
                </div>

                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 my-1">
                  {formatCurrency(paymentBreakdown.reservationDeposit)}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
                  Paid in Step 4 after application review to secure your room. This deposit holds your bed and is 100% deducted from your pre-move-in balance.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Locks your bed exclusively</span>
              </div>
            </div>

            {/* Card 2: Pre-Move-In Balance */}
            <div className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Pre-Move-In Balance
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-transparent text-slate-600 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Before Check-In
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 my-2">
                  <div>
                    <div className="flex justify-between font-medium text-slate-800 dark:text-slate-200">
                      <span>1 Month Advance Rent</span>
                      <span>{hasResolvedMonthlyRate ? formatCurrency(paymentBreakdown.advanceRent) : "TBD"}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Pre-pays your first 30 days of stay</span>
                  </div>

                  <div>
                    <div className="flex justify-between font-medium text-slate-800 dark:text-slate-200">
                      <span>1 Month Security Deposit</span>
                      <span>{hasResolvedMonthlyRate ? formatCurrency(paymentBreakdown.securityDeposit) : "TBD"}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">100% refundable upon checkout clearance</span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between text-slate-700 dark:text-slate-300 font-medium">
                      <span>Less: Credited Reservation Deposit</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        -{formatCurrency(paymentBreakdown.reservationDeposit)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Paid during Step 4 reservation</span>
                  </div>

                  {paymentBreakdown.applianceFees > 0 && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 leading-tight">
                      Appliance fees (+{formatCurrency(paymentBreakdown.applianceFees)}/mo) start on Month 2 regular billing.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-end">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    Net Pre-Move-In Cashout
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Settled before key turnover</span>
                </div>
                <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {hasResolvedMonthlyRate ? formatCurrency(paymentBreakdown.preMoveInNetCashout) : "To be confirmed"}
                </span>
              </div>
            </div>

            {/* Card 3: Monthly Stay Rate */}
            <div className="flex flex-col justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Monthly Stay Rate
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-transparent text-slate-600 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Starts Month 2
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 my-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Base Room Rent</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {hasResolvedMonthlyRate ? `${formatCurrency(paymentBreakdown.baseMonthlyRent)} / mo` : "Calculated upon review"}
                    </span>
                  </div>

                  {paymentBreakdown.applianceBreakdown?.items?.length > 0 ? (
                    <div className="pt-0.5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Add-On Appliances (Total)</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          +{formatCurrency(paymentBreakdown.applianceFees)} / mo
                        </span>
                      </div>
                      <div className="space-y-1 pl-2.5 border-l-2 border-slate-200 dark:border-slate-700 py-0.5">
                        {paymentBreakdown.applianceBreakdown.items.map((item) => (
                          <div
                            key={item.id}
                            className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between"
                          >
                            <span>
                              • {item.name} ({item.quantity}x) · {formatCurrency(item.unitPrice)}/mo each
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
                      <span>Add-On Appliances</span>
                      <span className="italic">None selected</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                    Regular monthly billing starts on your second month. Excludes shared water and electricity submeter readings.
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    Estimated Monthly Total
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Recurring stay rate</span>
                </div>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {hasResolvedMonthlyRate ? formatCurrency(paymentBreakdown.monthlyStayRate) : "To be confirmed"}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-normal">/ month</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Action Navigation Footer (Full width at bottom of cards) */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
        {readOnly ? (
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <Lock className="w-6 h-6 text-slate-700 dark:text-slate-300 shrink-0" />
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">This step is locked</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {ROOM_SELECTION_LOCKED_MESSAGE || "Room selection is locked while your reservation is under review."}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onNext}
              className="w-full sm:w-auto min-w-[180px] min-h-[48px] h-12 px-6 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 shrink-0"
            >
              <span>Continue</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            {onChangeRoom ? (
              <button
                type="button"
                onClick={() => {
                  if (reservationData?.visitDate || reservationData?.visitScheduledAt) {
                    setShowRoomChangeConfirm(true);
                  } else {
                    onChangeRoom();
                  }
                }}
                className="group w-full sm:w-auto min-h-[48px] h-12 px-5 rounded-xl font-semibold text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                title="Change your selected room"
              >
                <ArrowLeft size={15} className="text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors" />
                <span>Change Selected Room</span>
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={handleConfirmAndContinue}
              className="w-full sm:w-auto min-w-[200px] min-h-[48px] h-12 px-6 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              title="Confirm room selection and proceed to next step"
            >
              <span>Confirm & Continue</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Modify Stay Preferences Modal */}
      {isModifyStayOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => !isSavingStay && setIsModifyStayOpen(false)}
          >
            <div
              className="rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl space-y-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-slate-800 dark:text-slate-200 shrink-0" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Modify Stay Preferences
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Adjust your lease duration or intended move-in date
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSavingStay}
                  onClick={() => setIsModifyStayOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lease Duration Chips */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Duration of Lease
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
                  {leaseOptions.map((opt) => {
                    const isSelected = String(tempLeaseDuration) === String(opt.value);
                    const isLongTerm = opt.months >= minMonths;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTempLeaseDuration(String(opt.value))}
                        className={`p-2.5 rounded-xl text-xs flex flex-col items-center justify-center transition-all border ${
                          isSelected
                            ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-200 border-emerald-600 dark:border-emerald-500 font-bold shadow-xs ring-1 ring-emerald-600/30"
                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <span>{opt.shortLabel}</span>
                        {isLongTerm && (
                          <span
                            className={`text-[9px] mt-0.5 font-semibold ${
                              isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            Long-Term
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Intended Move-In Date */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="modalIntendedMoveInDate"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Intended Move-In Date
                    </label>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      Optional now
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">3 days up to 3 months</span>
                </div>
                <div className="relative flex items-center group">
                  <input
                    ref={dateInputRef}
                    id="modalIntendedMoveInDate"
                    type="date"
                    min={minMoveInDate}
                    max={maxMoveInDate}
                    value={tempMoveInDate ? String(tempMoveInDate).substring(0, 10) : ""}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch (_) {}
                    }}
                    onFocus={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch (_) {}
                    }}
                    onChange={(e) => setTempMoveInDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-16 text-sm rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 shadow-xs cursor-pointer hide-native-date-indicator"
                    style={{
                      colorScheme: "light",
                      border: tempMoveInDate && !isTempMoveInDateValid ? "1.5px solid var(--danger)" : "1px solid var(--border)",
                    }}
                  />
                  <div className="absolute right-2.5 flex items-center gap-1">
                    {tempMoveInDate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTempMoveInDate("");
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus:outline-none cursor-pointer"
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
                          dateInputRef.current?.showPicker?.();
                        } catch (_) {
                          dateInputRef.current?.focus();
                        }
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus:outline-none cursor-pointer"
                      title="Open calendar picker"
                      aria-label="Open calendar picker"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {tempMoveInDate && !isTempMoveInDateValid ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                    Must be at least 3 days from today, up to 3 months.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Optional now. If specified, must be at least 3 days from today, up to 3 months.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSavingStay}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all active:scale-[0.98] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setIsModifyStayOpen(false)}
                  title="Cancel and discard changes"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingStay}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  onClick={handleSaveStay}
                  title={isSavingStay ? "Saving stay preferences..." : "Save stay preferences"}
                >
                  {isSavingStay ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Stay Preferences</span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Room Change Confirmation Modal */}
      {showRoomChangeConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowRoomChangeConfirm(false)}
          >
            <div
              className="rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Change Selected Room?
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Changing your room will cancel your currently scheduled room visit and require selecting a new visit slot for the new room.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all active:scale-[0.98] shadow-xs"
                  onClick={() => setShowRoomChangeConfirm(false)}
                  title="Keep currently selected room"
                >
                  Keep Current Room
                </button>
                <button
                  type="button"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0A1628] hover:bg-[#13243D] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 rounded-xl transition-all shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A1628] dark:focus-visible:ring-slate-100"
                  onClick={() => {
                    setShowRoomChangeConfirm(false);
                    onChangeRoom();
                  }}
                  title="Confirm and change room selection"
                >
                  Confirm Change
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ReservationSummaryStep;
