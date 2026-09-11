import { useState, useEffect, useMemo, useCallback, Suspense, lazy } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { showNotification } from "../../../shared/utils/notification";
import getFriendlyError from "../../../shared/utils/friendlyError";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { useRouteFlash } from "../../../shared/hooks/useRouteFlash";
import { reservationApi } from "../../../shared/api/reservationApi";
import { Search, ChevronLeft, ChevronRight, X, ArrowLeft } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { buildSignOutSuccessFlash } from "../../../shared/utils/authToasts";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { useAppliances } from "../../../shared/hooks/queries/useAppliances";
import { queryClient } from "../../../shared/lib/queryClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import BaseModal from "../../../shared/components/BaseModal";
import "../../../shared/styles/notification.css";
import "../styles/check-availability.css";
import CheckAvailabilitySkeleton from "../components/check-availability/CheckAvailabilitySkeleton";
import { getThumbnailUrl } from "../../../shared/utils/imageOptimizer";
import {
 ROOM_SELECTION_LOCKED_MESSAGE,
 isApplicantRoomSelectionLocked,
} from "../utils/reservationRoomLock";
import { validateTargetMoveInDate } from "../utils/reservationValidation";

// Extracted sub-components
import {
 AvailabilityHeader,
 RoomCard,
 AVAILABLE_APPLIANCES,
 UPCOMING_ROOM,
 ROOM_IMAGES,
 validateRoomCapacity,
 checkRoomOverbooking,
 mapRoomType,
 mapBranchLabel,
 getPrimaryImage,
 getRoomImages,
 buildBedsFromCapacity,
} from "./check-availability";

// Lazy-loaded — excluded from the initial JS chunk (~29 KB saved on first navigation)
const RoomDetailsModal = lazy(() => import("../modals/RoomDetailsModal"));
const InquiryModal = lazy(() => import("../../public/modals/InquiryModal"));

// ─────────────────────────────────────────────────────────────
// LoginConfirmModal — hoisted OUTSIDE CheckAvailabilityPage so
// React never sees a new component type on parent re-renders.
// Defining it inside the parent caused full re-mount on every
// keystroke / filter change (silent performance bug).
// ─────────────────────────────────────────────────────────────
function LoginConfirmModal({ isOpen, onClose, onConfirm }) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Sign in to continue"
      subtitle="Account required for room reservation"
      variant="info"
      size="sm"
      cancelText="Maybe later"
      confirmText="Sign In"
      onConfirm={onConfirm}
    >
      <p style={{ margin: 0, color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
        You need an account to reserve a room. Sign in if you already have one, or create a new
        account — it only takes a minute.
      </p>
    </BaseModal>
  );
}

// ─────────────────────────────────────────────────────────────
// CheckAvailabilityPage — orchestrator
// ─────────────────────────────────────────────────────────────
function CheckAvailabilityPage() {
 const navigate = useNavigate();
 const appNavigate = useAppNavigation();
 const { user, logout } = useAuth();
 useRouteFlash();
 const [searchParams] = useSearchParams();
 const isChangeRoomMode = searchParams.get("changeRoom") === "1";
 const changeRoomReservationId = searchParams.get("reservationId");

 // ── State ──────────────────────────────────────────────────
 const [searchQuery, setSearchQuery] = useState("");
 const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

 // Debounce search query to keep typing at 60 FPS without filter churn
 useEffect(() => {
   const timer = setTimeout(() => {
     setDebouncedSearchQuery(searchQuery);
   }, 200);
   return () => clearTimeout(timer);
 }, [searchQuery]);

 const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
 const [selectedBranch, setSelectedBranch] = useState("All");
 const [selectedRoomType, setSelectedRoomType] = useState("All");
 const [selectedLeaseTermFilter, setSelectedLeaseTermFilter] = useState("All");
 const [minPrice, setMinPrice] = useState(0);
 const [maxPrice, setMaxPrice] = useState(15000);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiryRoomContext, setInquiryRoomContext] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
 const [selectedRoom, setSelectedRoom] = useState(null);
 const [selectedAppliances, setSelectedAppliances] = useState({});
  const [selectedBed, setSelectedBed] = useState(null);
  const [selectedLeaseDuration, setSelectedLeaseDuration] = useState("");
  const [selectedIntendedMoveInDate, setSelectedIntendedMoveInDate] = useState("");
  const [showLoginConfirmBeforeReserve, setShowLoginConfirmBeforeReserve] =
  useState(false);
 const [changeRoomLocked, setChangeRoomLocked] = useState(false);
 const [currentPage, setCurrentPage] = useState(1);
 const ROOMS_PER_PAGE = 15;

 // ── TanStack Query ─────────────────────────────────────────
 const { data: rawRooms = [], isLoading: roomsLoading, error: roomsQueryError } = useRooms(
   undefined,
   {
     pollInterval: user ? false : 30_000,
     staleTime: 60_000,
     gcTime: 300_000,
   }
 );
 const { data: dbAppliances = [] } = useAppliances();
 const roomsError = roomsQueryError ? "Failed to load rooms. Please try again." : null;

  // Prefetch modal JS chunks in background during browser idle time (0ms cold click latency)
  useEffect(() => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => {
        import("../modals/RoomDetailsModal").catch(() => {});
        import("../../public/modals/InquiryModal").catch(() => {});
      });
    } else {
      const timer = setTimeout(() => {
        import("../modals/RoomDetailsModal").catch(() => {});
        import("../../public/modals/InquiryModal").catch(() => {});
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

 useEffect(() => {
 if (!isChangeRoomMode || !changeRoomReservationId || !user) return undefined;

 let cancelled = false;

 const validateChangeRoomAccess = async () => {
 try {
 const reservation = await reservationApi.getById(changeRoomReservationId);
 if (cancelled) return;

 const locked = isApplicantRoomSelectionLocked(reservation);
 setChangeRoomLocked(locked);

 if (locked) {
 showNotification(ROOM_SELECTION_LOCKED_MESSAGE, "info", 5000);
 appNavigate("/applicant/profile", {
 state: { tab: "dashboard" },
 flash: {
 type: "info",
 message: ROOM_SELECTION_LOCKED_MESSAGE,
 },
 });
 }
 } catch (error) {
 if (cancelled) return;
 console.error("Failed to verify room change access:", error);
 showNotification(
 getFriendlyError(error, "Unable to verify room change access."),
 "warning",
 4000,
 );
 appNavigate("/applicant/profile", {
 state: { tab: "dashboard" },
 });
 }
 };

 validateChangeRoomAccess();

 return () => {
 cancelled = true;
 };
 }, [appNavigate, changeRoomReservationId, isChangeRoomMode, user]);



 const rooms = useMemo(
 () =>
 rawRooms.map((room) => {
 const displayName =
 room.name ||
 room.roomNumber ||
 room.room_number ||
 room.room_id ||
 "Unknown";
 const normalizedType = room.type || room.room_type;
 const mappedType = mapRoomType(normalizedType);
 const branchLabel = mapBranchLabel(room.branch);
 const storedImages = Array.isArray(room.images)
 ? room.images.filter(Boolean)
 : [];
 const images =
 storedImages.length > 0
 ? storedImages
 : getRoomImages(normalizedType, room.branch);
 const primaryImage = images[0] || getPrimaryImage(normalizedType);
 const roomNumber = room.roomNumber || room.room_number || displayName;
  const beds = room.beds?.length
  ? room.beds.map((bed) => {
      const normalizedStatus = bed.status ? String(bed.status).toLowerCase().trim() : undefined;
      return {
        ...bed,
        status: normalizedStatus || (bed.available === false ? "occupied" : "available"),
        available:
          normalizedStatus !== undefined
            ? normalizedStatus === "available"
            : bed.available !== false,
      };
    })
  : buildBedsFromCapacity(
  roomNumber,
  normalizedType,
  room.currentOccupancy || 0,
  );
  const reservedBeds = beds.filter(
  (bed) => String(bed.status || "").toLowerCase().trim() === "reserved",
  ).length;
  const unavailableBeds = beds.filter((bed) =>
  ["locked", "maintenance"].includes(String(bed.status || "").toLowerCase().trim()),
  ).length;
  const occupiedFromBeds = beds.filter((bed) =>
  String(bed.status || "").toLowerCase().trim() === "occupied" ||
  (bed.status === undefined && bed.available === false),
  ).length;
 // Prefer bed-level count as ground truth when bed data is present.
 // Falling back to currentOccupancy for legacy rooms with no beds array prevents
 // stale counter drift from making a room appear "Full" when beds are free.
 const totalBeds = room.capacity || beds.length || 0;
 const occupied = beds.length > 0 ? occupiedFromBeds : (room.currentOccupancy || 0);
 const availableBeds = Math.max(0, totalBeds - occupied - reservedBeds - unavailableBeds);
 return {
 id: roomNumber,
 roomId: room._id,
 title: `Room ${displayName}`,
 branch: branchLabel,
 branchKey: room.branch,
 type: mappedType,
 capacity: totalBeds,
 currentOccupancy: occupied,
 reservedBeds,
 unavailableBeds,
 availableBeds,
 occupancy: `${occupied}/${totalBeds}`,
 bedsLeft:
 availableBeds === 0
 ? unavailableBeds > 0
 ? "Unavailable"
 : "Full"
 : `${availableBeds} bed${availableBeds === 1 ? "" : "s"} available`,
 price: typeof room.price === "number" ? room.price : 0,
 monthlyPrice: typeof room.monthlyPrice === "number" ? room.monthlyPrice : null,
 shortTermRate: typeof room.shortTermRate === "number" ? room.shortTermRate : null,
 regularLongRate: typeof room.regularLongRate === "number" ? room.regularLongRate : null,
 regularShortRate: typeof room.regularShortRate === "number" ? room.regularShortRate : null,
 longTermDiscountPercent: typeof room.longTermDiscountPercent === "number" ? room.longTermDiscountPercent : null,
 image: primaryImage,
 description: room.description || "",
 bedLayout:
 mappedType === "Private"
 ? "Private Room"
 : mappedType === "Shared"
 ? "2 Single Beds"
 : "4 Single Beds",
 intendedTenant: room.intendedTenant || "",
 beds,
 amenities: room.amenities || [],
 images,
 policies: room.policies || [],
 applianceFeeEnabled: !!room.applianceFeeEnabled,
 applianceFeeAmountPerUnit: Number(room.applianceFeeAmountPerUnit || 0),
 isDiscountEnabled: room.isDiscountEnabled !== undefined ? Boolean(room.isDiscountEnabled) : true,
 quadrupleDiscountPercent: typeof room.quadrupleDiscountPercent === "number" ? room.quadrupleDiscountPercent : 10,
 doubleDiscountPercent: typeof room.doubleDiscountPercent === "number" ? room.doubleDiscountPercent : 20,
 privateDiscountPercent: typeof room.privateDiscountPercent === "number" ? room.privateDiscountPercent : 10,
 longTermLeaseMinMonths: typeof room.longTermLeaseMinMonths === "number" ? room.longTermLeaseMinMonths : 6,
 };
 }),
  [rawRooms],
  );

  // ── Query param filters (robust normalizer) ───────────────────
  useEffect(() => {
    const rawBranch = searchParams.get("branch");
    const rawRoomType = searchParams.get("roomType") || searchParams.get("type");
    const rawLease = searchParams.get("leaseTerm") || searchParams.get("stayType") || searchParams.get("leaseType");
    const rawQuery = searchParams.get("q") || searchParams.get("search");

    if (rawBranch) {
      const cleanBranch = String(rawBranch).toLowerCase().replace(/[-_]/g, " ").trim();
      if (cleanBranch.includes("guadalupe")) setSelectedBranch("Guadalupe");
      else if (cleanBranch.includes("gil") || cleanBranch.includes("puyat")) setSelectedBranch("Gil Puyat");
      else if (cleanBranch === "all") setSelectedBranch("All");
    }

    if (rawRoomType) {
      const cleanType = String(rawRoomType).toLowerCase().replace(/[-_]/g, " ").trim();
      if (cleanType.includes("quad")) setSelectedRoomType("Quadruple");
      else if (cleanType.includes("double") || cleanType.includes("share")) setSelectedRoomType("Shared");
      else if (cleanType.includes("priv")) setSelectedRoomType("Private");
      else if (cleanType === "all") setSelectedRoomType("All");
    }

    if (rawLease) {
      const cleanLease = String(rawLease).toLowerCase().replace(/[-_]/g, "").trim();
      if (cleanLease.includes("long")) setSelectedLeaseTermFilter("longTerm");
      else if (cleanLease.includes("short")) setSelectedLeaseTermFilter("shortTerm");
      else if (cleanLease === "all") setSelectedLeaseTermFilter("All");
    }

    if (rawQuery) {
      setSearchQuery(rawQuery);
      setDebouncedSearchQuery(rawQuery);
    }
  }, [searchParams]);

  // Ensure selected room type is valid for selected branch (Guadalupe only has Quadruple)
  useEffect(() => {
    if (selectedBranch === "Guadalupe" && selectedRoomType !== "All" && selectedRoomType !== "Quadruple") {
      setSelectedRoomType("All");
    }
  }, [selectedBranch, selectedRoomType]);

  // ── Capacity validation (dev-only debug removed) ─────────

  // ── Filtering ──────────────────────────────────────────────
  const availableRoomTypes = useMemo(() => {
    if (selectedBranch === "Guadalupe") return ["All", "Quadruple"];
    return ["All", "Private", "Shared", "Quadruple"];
  }, [selectedBranch]);

  const filteredRooms = useMemo(() => {
    const rawQuery = debouncedSearchQuery.trim().toLowerCase();
    const queryTokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

    return rooms.filter((room) => {
      const hasAvailableBeds = room.availableBeds > 0;

      let effectivePrice = room.price;
      if (selectedLeaseTermFilter === "shortTerm") {
        effectivePrice = room.shortTermRate || room.regularShortRate || room.price;
      } else if (selectedLeaseTermFilter === "longTerm") {
        effectivePrice = room.monthlyPrice || room.regularLongRate || room.price;
      }

      const matchesSearch =
        queryTokens.length === 0 ||
        queryTokens.every((token) => {
          // Check title, room number & identifier
          if (room.title && room.title.toLowerCase().includes(token)) return true;
          if (room.roomNumber && String(room.roomNumber).toLowerCase().includes(token)) return true;
          if (room.id && String(room.id).toLowerCase().includes(token)) return true;

          // Check branch location
          if (room.branch && room.branch.toLowerCase().includes(token)) return true;

          // Check room type
          if (room.type && room.type.toLowerCase().includes(token)) return true;

          // Check room description
          if (room.description && room.description.toLowerCase().includes(token)) return true;

          // Check amenities list (e.g. WiFi, Aircon, Hot Shower)
          if (
            Array.isArray(room.amenities) &&
            room.amenities.some((a) => String(a).toLowerCase().includes(token))
          ) {
            return true;
          }

          // Check policies and intended tenant restrictions
          if (room.intendedTenant && room.intendedTenant.toLowerCase().includes(token)) return true;
          if (
            Array.isArray(room.policies) &&
            room.policies.some((p) => String(p).toLowerCase().includes(token))
          ) {
            return true;
          }

          // Check price number search (e.g. searching '5000' matches within ±500 price range)
          const numToken = Number(token);
          if (!Number.isNaN(numToken) && numToken > 1000) {
            if (Math.abs(effectivePrice - numToken) <= 500) return true;
          }

          return false;
        });

      return (
        hasAvailableBeds &&
        matchesSearch &&
        (selectedBranch === "All" || room.branch === selectedBranch) &&
        (selectedRoomType === "All" || room.type === selectedRoomType) &&
        effectivePrice >= minPrice &&
        effectivePrice <= maxPrice
      );
    });
  }, [rooms, debouncedSearchQuery, selectedLeaseTermFilter, selectedBranch, selectedRoomType, minPrice, maxPrice]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, selectedBranch, selectedRoomType, selectedLeaseTermFilter, minPrice, maxPrice]);

  // Paginated rooms
  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  const paginatedRooms = useMemo(
    () => filteredRooms.slice((currentPage - 1) * ROOMS_PER_PAGE, currentPage * ROOMS_PER_PAGE),
    [filteredRooms, currentPage],
  );

  // Pre-warm next page primary thumbnails during browser idle time (0ms next-page display delay)
  useEffect(() => {
    if (typeof window === "undefined" || !Array.isArray(filteredRooms) || filteredRooms.length === 0) return;
    const nextPageStart = currentPage * ROOMS_PER_PAGE;
    const nextPageRooms = filteredRooms.slice(nextPageStart, nextPageStart + 4);
    if (nextPageRooms.length === 0) return;

    const prewarm = () => {
      nextPageRooms.forEach((room) => {
        const primarySrc = room.images?.[0] || room.image;
        if (primarySrc && typeof Image !== "undefined") {
          const preloader = new Image();
          preloader.src = getThumbnailUrl(primarySrc);
        }
      });
    };

    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prewarm, { timeout: 2500 });
      return () => {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(handle);
      };
    } else {
      const timer = setTimeout(prewarm, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentPage, filteredRooms]);

  const handleBranchFilter = useCallback((branch) => {
    setSelectedBranch(branch);
    setSelectedRoomType("All");
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedBranch("All");
    setSelectedRoomType("All");
    setSelectedLeaseTermFilter("All");
    setMinPrice(0);
    setMaxPrice(15000);
    setSearchQuery("");
    setDebouncedSearchQuery("");
  }, []);

  // Stable callbacks for LoginConfirmModal and logout — prevents inline-arrow
  // prop churn that would break React.memo on AvailabilityHeader.
  const handleLoginConfirmClose = useCallback(
    () => setShowLoginConfirmBeforeReserve(false),
    [],
  );
  const handleLoginConfirm = useCallback(() => {
    setShowLoginConfirmBeforeReserve(false);
    appNavigate("/signin", {
      flash: { type: "info", message: "Please sign in to reserve a room" },
    });
  }, [appNavigate]);
  const handleLogout = useCallback(() => setShowLogoutConfirm(true), []);

  // ── Room details / appliances ──────────────────────────────
  const openRoomDetails = useCallback((room) => {
    setSelectedRoom(room);
    setSelectedAppliances({});
    setSelectedBed(null);
    setSelectedLeaseDuration("");
    setSelectedIntendedMoveInDate("");
    setIsDetailsModalOpen(true);
  }, []);

  const closeRoomDetails = useCallback(() => {
    setIsDetailsModalOpen(false);
    setSelectedRoom(null);
    setSelectedAppliances({});
    setSelectedBed(null);
    setSelectedLeaseDuration("");
    setSelectedIntendedMoveInDate("");
  }, []);

  const handleOpenRoomInquiry = useCallback((room) => {
    setInquiryRoomContext(room || null);
    setIsInquiryModalOpen(true);
  }, []);

  const handleCloseInquiry = useCallback(() => {
    setIsInquiryModalOpen(false);
    setInquiryRoomContext(null);
  }, []);

  const activeAppliances = useMemo(() => {
    if (Array.isArray(dbAppliances) && dbAppliances.length > 0) {
      return dbAppliances.map((a) => ({
        id: a.code || a._id,
        name: a.name,
        price: Number(a.monthlyFee ?? 200),
        monthlyFee: Number(a.monthlyFee ?? 200),
        maxQuantity: a.maxQuantity || 5,
        category: a.category || "general",
        description: a.description || "",
      }));
    }
    return AVAILABLE_APPLIANCES.map((a) => ({
      ...a,
      monthlyFee: a.price,
      maxQuantity: 5,
      description: "",
    }));
  }, [dbAppliances]);

  const handleApplianceQuantityChange = useCallback((id, qty) => {
    setSelectedAppliances((prev) => ({
      ...prev,
      [id]: Math.max(0, parseInt(qty, 10) || 0),
    }));
  }, []);

  const buildSelectedAppliancesPayload = useCallback(
    () =>
      Object.fromEntries(
        Object.entries(selectedAppliances).filter(
          ([, quantity]) => Number.isInteger(quantity) && quantity > 0,
        ),
      ),
    [selectedAppliances],
  );

  const calculateApplianceFees = useCallback(
    () =>
      activeAppliances.reduce(
        (total, a) =>
          total +
          (selectedRoom?.applianceFeeAmountPerUnit || a.monthlyFee || a.price || 200) *
            (selectedAppliances[a.id] || 0),
        0,
      ),
    [selectedRoom, selectedAppliances, activeAppliances],
  );

  // ── Reservation logic ──────────────────────────────────────
  const handleProceedToReservation = () => {
    const isPrivate = selectedRoom?.type && String(selectedRoom.type).toLowerCase().includes("private");
    const requiresBed = selectedRoom?.beds && selectedRoom.beds.length > 1 && !isPrivate;
    const hasLease = Boolean(selectedLeaseDuration && String(selectedLeaseDuration).trim() !== "");
    const hasMoveInDate = Boolean(selectedIntendedMoveInDate && String(selectedIntendedMoveInDate).trim() !== "");

    if (!hasLease && requiresBed && !selectedBed) {
      showNotification("Please select a preferred lease term and a bed before proceeding.", "warning");
      return;
    }
    if (!hasLease) {
      showNotification("Please select a preferred lease term before proceeding.", "warning");
      return;
    }
    if (requiresBed && !selectedBed) {
      showNotification("Please select a bed location before proceeding.", "warning");
      return;
    }
    if (hasMoveInDate) {
      const dateVal = validateTargetMoveInDate(selectedIntendedMoveInDate);
      if (!dateVal.valid) {
        showNotification(
          dateVal.error || "Intended move-in date must be at least 3 days from today, up to 3 months.",
          "warning",
        );
        return;
      }
    }

    if (!user) {
      setShowLoginConfirmBeforeReserve(true);
      return;
    }
    proceedWithReservation();
  };

 const proceedWithReservation = async () => {
 if (changeRoomLocked) {
 showNotification(ROOM_SELECTION_LOCKED_MESSAGE, "info", 5000);
 return;
 }

 if (isChangeRoomMode && changeRoomReservationId && selectedRoom) {
 try {
 await reservationApi.updateByUser(changeRoomReservationId, {
 roomId: selectedRoom.roomId,
 selectedBed: selectedBed
 ? { id: selectedBed.id, position: selectedBed.position }
 : null,
 selectedAppliances: buildSelectedAppliancesPayload(),
 ...(selectedIntendedMoveInDate
   ? {
       intendedMoveInDate: selectedIntendedMoveInDate,
       targetMoveInDate: selectedIntendedMoveInDate,
     }
   : {}),
 totalPrice: selectedRoom.price || 5000,
 applianceFees: calculateApplianceFees(),
 });
 closeRoomDetails();
 await queryClient.invalidateQueries({ queryKey: ["reservations"] });
 appNavigate("/applicant/profile", {
 flash: {
 type: "success",
 message: `Room changed to ${selectedRoom.title}`,
 },
 });
  } catch (err) {
  console.error("Failed to change room:", err);
  const isLocked =
  err?.response?.data?.code === "RESERVATION_ROOM_SELECTION_LOCKED";
  const isBedUnavailable =
  err?.response?.data?.code === "BED_UNAVAILABLE" ||
  err?.response?.data?.error === "BED_UNAVAILABLE" ||
  /bed.*unavailable/i.test(err?.response?.data?.message || "");

  if (isBedUnavailable) {
    showNotification(
      "This bed is currently unavailable. Please select another available bed or room.",
      "warning",
      5000,
    );
    return;
  }
  showNotification(
  isLocked
  ? ROOM_SELECTION_LOCKED_MESSAGE
  : getFriendlyError(err, "Failed to change room. Please try again."),
  isLocked ? "info" : "error",
  4000,
  );
  if (isLocked) {
  appNavigate("/applicant/profile", {
  state: { tab: "dashboard" },
  flash: { type: "info", message: ROOM_SELECTION_LOCKED_MESSAGE },
  });
  }
  }
 return;
 }

    try {
      const payload = {
        roomId: selectedRoom.roomId,
        selectedBed: selectedBed
          ? { id: selectedBed.id, position: selectedBed.position }
          : null,
        selectedAppliances: buildSelectedAppliancesPayload(),
        leaseDuration: selectedLeaseDuration ? String(selectedLeaseDuration) : null,
        intendedMoveInDate: selectedIntendedMoveInDate,
        targetMoveInDate: selectedIntendedMoveInDate,
        moveInDate: selectedIntendedMoveInDate,
        totalPrice: selectedRoom.price || 5000,
        applianceFees: calculateApplianceFees(),
        viewingType: null,
        agreedToPrivacy: false,
      };
  try {
    const createdRes = await reservationApi.create(payload);
    if (createdRes?._id && user?.firebaseUid) {
      sessionStorage.setItem(`activeReservationId_${user.firebaseUid}`, createdRes._id);
    }
  } catch (createErr) {
  if (createErr?.response?.data?.code === "RESERVATION_ALREADY_EXISTS") {
  if (createErr?.response?.data?.existingReservationId && user?.firebaseUid) {
    sessionStorage.setItem(
      `activeReservationId_${user.firebaseUid}`,
      createErr.response.data.existingReservationId
    );
  }
  // Block ALL room changes when an active reservation exists.
  // Users must cancel their current reservation first.
  closeRoomDetails();
  showNotification(
  "You already have an active reservation. Cancel it first if you'd like a different room.",
  "warning",
  5000,
  );
  appNavigate("/applicant/profile", {
  flash: {
  type: "warning",
  message:
  "You already have an active reservation. Cancel it first if you'd like a different room.",
   },
   });
   return;
  } else {
   throw createErr;
  }
  }
 closeRoomDetails();
 await queryClient.invalidateQueries({ queryKey: ["reservations"] });
 appNavigate("/applicant/profile", {
  flash: {
  type: "success",
  message: `Room ${selectedRoom.title} reserved! Continue from your dashboard.`,
  },
  });
  } catch (err) {
   console.error("Failed to reserve room:", err);
   const isBedUnavailable =
     err?.response?.data?.code === "BED_UNAVAILABLE" ||
     err?.response?.data?.error === "BED_UNAVAILABLE" ||
     /bed.*unavailable/i.test(err?.response?.data?.message || "");

   if (isBedUnavailable) {
     showNotification(
       "This bed is currently unavailable. Please select another available bed or room.",
       "warning",
       5000,
     );
   } else if (err?.response?.data?.code === "RESERVATION_ALREADY_EXISTS") {
   showNotification(
   "You already have an ongoing reservation. Go to your profile to continue.",
   "warning",
   4000,
   );
   } else {
   showNotification(
   getFriendlyError(err, "Failed to reserve room. Please try again."),
   "error",
   4000,
   );
   }
   }
 };

  // ── Render ─────────────────────────────────────────────────
  return (
  <div className="ca-page-container min-h-screen" style={{ backgroundColor: "var(--surface-page)" }}>
      <LoginConfirmModal
        isOpen={showLoginConfirmBeforeReserve}
        onClose={handleLoginConfirmClose}
        onConfirm={handleLoginConfirm}
      />

      <AvailabilityHeader
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedBranch={selectedBranch}
        onBranchFilter={handleBranchFilter}
        selectedRoomType={selectedRoomType}
        onRoomTypeFilter={setSelectedRoomType}
        availableRoomTypes={availableRoomTypes}
        selectedLeaseTermFilter={selectedLeaseTermFilter}
        onLeaseTermFilterChange={setSelectedLeaseTermFilter}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        onClearAll={clearAllFilters}
        onLogout={handleLogout}
      />

  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

    <div className="ca-page-head">
      <div className="ca-page-head__content">
        <div className="ca-page-head__title-row">
          <h1 className="ca-section-title">
            {isChangeRoomMode ? "Change Selected Room" : "Available Rooms"}
          </h1>
          {isChangeRoomMode && (
            <span className="ca-mode-tag">
              <span className="ca-mode-tag__dot" />
              Reservation Replacement
            </span>
          )}
        </div>

        <div className="ca-page-head__meta">
          {!roomsLoading && (
            <span className="ca-room-count">
              {`${filteredRooms.length} available room${filteredRooms.length !== 1 ? "s" : ""} found`}
            </span>
          )}
          {isChangeRoomMode && (
            <>
              <span className="ca-meta-divider">•</span>
              <span className="ca-change-room-hint">
                Confirming a room here updates your existing reservation instead of creating a new one.
              </span>
            </>
          )}
          {!user && !isChangeRoomMode && (
            <>
              {!roomsLoading && <span className="ca-meta-divider">•</span>}
              <span className="ca-signin-prompt">
                <button type="button" onClick={() => navigate("/signin")}>Sign in</button>{" "}
                or{" "}
                <button type="button" onClick={() => navigate("/signup?continue=%2Fapplicant%2Fcheck-availability")}>
                  create an account
                </button>{" "}
                to reserve a room
              </span>
            </>
          )}
        </div>
      </div>

      {isChangeRoomMode && (
        <button
          type="button"
          className="ca-change-room-back"
          onClick={() => navigate("/applicant/profile")}
          title="Back to profile"
        >
          <ArrowLeft size={14} />
          <span>Back to profile</span>
        </button>
      )}
    </div>

  {/* Active Filters Bar */}
  {(debouncedSearchQuery.trim() !== "" ||
    selectedBranch !== "All" ||
    selectedRoomType !== "All" ||
    selectedLeaseTermFilter !== "All" ||
    maxPrice < 15000) && !roomsLoading && (
    <div className="ca-active-filters-bar">
      <div className="ca-active-filters-group">
        <span className="ca-active-filters-label">Active:</span>
        {debouncedSearchQuery.trim() && (
          <span className="ca-filter-chip ca-filter-chip--search">
            Search: "{debouncedSearchQuery.trim()}"
            <button
              type="button"
              className="ca-filter-chip__remove"
              onClick={() => {
                setSearchQuery("");
                setDebouncedSearchQuery("");
              }}
              aria-label="Remove search filter"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {selectedBranch !== "All" && (
          <span className="ca-filter-chip">
            Branch: {selectedBranch}
            <button
              type="button"
              className="ca-filter-chip__remove"
              onClick={() => setSelectedBranch("All")}
              aria-label="Remove branch filter"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {selectedRoomType !== "All" && (
          <span className="ca-filter-chip">
            Type: {selectedRoomType}
            <button
              type="button"
              className="ca-filter-chip__remove"
              onClick={() => setSelectedRoomType("All")}
              aria-label="Remove room type filter"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {selectedLeaseTermFilter !== "All" && (
          <span className="ca-filter-chip">
            Stay: {selectedLeaseTermFilter === "longTerm" ? "Long-Term" : "Short-Term"}
            <button
              type="button"
              className="ca-filter-chip__remove"
              onClick={() => setSelectedLeaseTermFilter("All")}
              aria-label="Remove stay type filter"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {maxPrice < 15000 && (
          <span className="ca-filter-chip">
            Price: ≤ ₱{maxPrice.toLocaleString()}
            <button
              type="button"
              className="ca-filter-chip__remove"
              onClick={() => {
                setMaxPrice(15000);
              }}
              aria-label="Remove price filter"
            >
              <X size={12} />
            </button>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="ca-active-filters-count">
          Showing {filteredRooms.length} room{filteredRooms.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          className="ca-active-filters-clear-btn"
          onClick={clearAllFilters}
        >
          Clear All
        </button>
      </div>
    </div>
  )}

  {/* Room Grid or Loading / Error / Empty State */}
  {roomsLoading ? (
    <div className="ca-grid">
      <CheckAvailabilitySkeleton />
    </div>
  ) : roomsError ? (
    <div className="p-8 text-center bg-card border border-border rounded-xl">
      <p className="text-sm font-semibold text-red-600 mb-2">{roomsError}</p>
      <button
        type="button"
        onClick={() => queryClient.invalidateQueries({ queryKey: ["rooms"] })}
        className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground"
      >
        Retry
      </button>
    </div>
  ) : filteredRooms.length === 0 ? (
    <div className="ca-empty">
      <div className="ca-empty-icon">
        <Search style={{ width: 28, height: 28, color: "var(--text-muted, #94a3b8)" }} />
      </div>
      <h3>No rooms match your search criteria</h3>
      <p>
        {debouncedSearchQuery.trim()
          ? `No rooms matched "${debouncedSearchQuery.trim()}". Try adjusting your keywords or clearing filters.`
          : "Try selecting a different branch, room type, or price range to find open beds."}
      </p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={clearAllFilters}
          style={{
            padding: "9px 18px",
            borderRadius: "8px",
            backgroundColor: "var(--text-heading, #0a1628)",
            color: "#ffffff",
            fontWeight: "600",
            fontSize: "13px",
            cursor: "pointer",
            border: "none",
          }}
        >
          Clear All Filters
        </button>
        <button
          type="button"
          onClick={() => handleOpenRoomInquiry(null)}
          style={{
            padding: "9px 18px",
            borderRadius: "8px",
            border: "1px solid var(--border-card, #e2e8f0)",
            backgroundColor: "var(--surface-card, #ffffff)",
            color: "var(--text-heading, #0f172a)",
            fontWeight: "600",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Send an Inquiry
        </button>
      </div>
    </div>
  ) : (
    <div
      className="ca-grid"
      key={`ca-grid-${currentPage}-${selectedBranch}-${selectedRoomType}-${selectedLeaseTermFilter}-${minPrice}-${maxPrice}-${debouncedSearchQuery}`}
    >
      {paginatedRooms.map((room, index) => (
        <RoomCard
          key={room.id}
          room={room}
          cardIndex={index}
          isPriority={index < 3}
          selectedLeaseTermFilter={selectedLeaseTermFilter}
          searchQuery={debouncedSearchQuery}
          onSelect={openRoomDetails}
        />
      ))}
    </div>
  )}

  {/* Pagination */}
  {!roomsLoading && filteredRooms.length > ROOMS_PER_PAGE && (
  <div className="ca-pagination">
  <span className="ca-pagination__info">
  Showing {(currentPage - 1) * ROOMS_PER_PAGE + 1}–{Math.min(currentPage * ROOMS_PER_PAGE, filteredRooms.length)} of {filteredRooms.length} rooms
  </span>
  <div className="ca-pagination__controls">
  <button
  className="ca-pagination__btn"
  disabled={currentPage <= 1}
  onClick={() => {
    setCurrentPage((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }}
  aria-label="Previous page"
  >
  <ChevronLeft size={16} />
  </button>
  <span className="ca-pagination__label">
  {currentPage} / {totalPages}
  </span>
  <button
  className="ca-pagination__btn"
  disabled={currentPage >= totalPages}
  onClick={() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }}
  aria-label="Next page"
  >
  <ChevronRight size={16} />
  </button>
  </div>
  </div>
  )}

  </main>

  {isDetailsModalOpen && selectedRoom && (
    <Suspense fallback={null}>
      <RoomDetailsModal
        isOpen={isDetailsModalOpen}
        room={selectedRoom}
        onClose={closeRoomDetails}
        onProceed={handleProceedToReservation}
        proceedButtonText={
          isChangeRoomMode ? "Confirm Room Change" : "Proceed to Reservation"
        }
        isOverbooked={checkRoomOverbooking(selectedRoom)}
        selectedBed={selectedBed}
        onSelectBed={setSelectedBed}
        selectedAppliances={selectedAppliances}
        onApplianceQuantityChange={handleApplianceQuantityChange}
        calculateApplianceFees={calculateApplianceFees}
        selectedLeaseDuration={selectedLeaseDuration}
        onSelectLeaseDuration={setSelectedLeaseDuration}
        selectedIntendedMoveInDate={selectedIntendedMoveInDate}
        onSelectIntendedMoveInDate={setSelectedIntendedMoveInDate}
        availableAppliances={activeAppliances}
      />
    </Suspense>
  )}

  <Suspense fallback={null}>
    <InquiryModal
      isOpen={isInquiryModalOpen}
      onClose={handleCloseInquiry}
      defaultBranch={
        inquiryRoomContext?.branchKey === "guadalupe" || inquiryRoomContext?.branch === "Guadalupe"
          ? "guadalupe"
          : inquiryRoomContext?.branchKey === "gil-puyat" || inquiryRoomContext?.branch === "Gil Puyat"
          ? "gil-puyat"
          : selectedBranch === "Guadalupe"
          ? "guadalupe"
          : selectedBranch === "Gil Puyat"
          ? "gil-puyat"
          : "general"
      }
      roomData={inquiryRoomContext}
    />
  </Suspense>

 <ConfirmModal
 isOpen={showLogoutConfirm}
 onClose={() => setShowLogoutConfirm(false)}
 onConfirm={async () => {
 setShowLogoutConfirm(false);
 try {
 await logout();
 appNavigate("/signin", buildSignOutSuccessFlash());
 } catch (err) {
 console.error("Logout error:", err);
 }
 }}
 title="Sign Out"
 message="Are you sure you want to sign out of your account?"
 variant="danger"
 confirmText="Sign Out"
 cancelText="Cancel"
 />
 </div>
 );
}

export default CheckAvailabilityPage;
