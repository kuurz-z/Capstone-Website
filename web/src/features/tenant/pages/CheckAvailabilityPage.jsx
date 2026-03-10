import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { showNotification } from "../../../shared/utils/notification";
import { Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { roomApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../../../shared/styles/notification.css";
import "../styles/tenant-dashboard.css";
import InquiryModal from "../../public/modals/InquiryModal";
import RoomDetailsModal from "../modals/RoomDetailsModal";

// Extracted sub-components
import {
  AvailabilityHeader,
  FilterPanel,
  RoomCard,
  AVAILABLE_APPLIANCES,
  UPCOMING_ROOM,
  ROOM_IMAGES,
  validateRoomCapacity,
  checkRoomOverbooking,
  mapRoomType,
  mapBranchLabel,
  getPrimaryImage,
  buildBedsFromCapacity,
} from "./check-availability";

// ─────────────────────────────────────────────────────────────
// CheckAvailabilityPage — orchestrator
// 1,260 lines → ~400 lines (state, data-loading, handlers, routing)
// Extracted: header, filter panel, room card, constants
// ─────────────────────────────────────────────────────────────
function CheckAvailabilityPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const isChangeRoomMode = searchParams.get("changeRoom") === "1";
  const changeRoomReservationId = searchParams.get("reservationId");

  // ── State ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [selectedRoomType, setSelectedRoomType] = useState("All");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(15000);
  const [showFilters, setShowFilters] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedAppliances, setSelectedAppliances] = useState({});
  const [selectedBed, setSelectedBed] = useState(null);
  const [showLoginConfirmBeforeReserve, setShowLoginConfirmBeforeReserve] =
    useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(null);

  // ── Query param filters ────────────────────────────────────
  useEffect(() => {
    const branch = searchParams.get("branch");
    const roomType = searchParams.get("roomType");
    if (branch) setSelectedBranch(branch);
    if (roomType) setSelectedRoomType(roomType);
  }, [searchParams]);

  // ── Fetch rooms ────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const fetchRooms = async () => {
      setRoomsLoading(true);
      setRoomsError(null);
      try {
        const data = await roomApi.getAll();
        const mappedRooms = data.map((room) => {
          const displayName =
            room.name ||
            room.roomNumber ||
            room.room_number ||
            room.room_id ||
            "Unknown";
          const normalizedType = room.type || room.room_type;
          const mappedType = mapRoomType(normalizedType);
          const branchLabel = mapBranchLabel(room.branch);
          const primaryImage = getPrimaryImage(normalizedType);
          const roomNumber = room.roomNumber || room.room_number || displayName;
          const beds = room.beds?.length
            ? room.beds
            : buildBedsFromCapacity(
                roomNumber,
                normalizedType,
                room.currentOccupancy || 0,
              );
          const availableBeds = beds.filter((bed) => bed.available).length;
          const totalBeds = beds.length || room.capacity || 0;
          return {
            id: roomNumber,
            roomId: room._id,
            title: `Room ${displayName}`,
            branch: branchLabel,
            type: mappedType,
            occupancy: `${room.currentOccupancy || 0}/${room.capacity || totalBeds}`,
            bedsLeft:
              availableBeds === 0
                ? "Full"
                : `${availableBeds} bed${availableBeds === 1 ? "" : "s"} available`,
            price: typeof room.price === "number" ? room.price : 0,
            image: primaryImage,
            description: room.description || "",
            bedLayout:
              mappedType === "Private"
                ? "2 Single Beds"
                : mappedType === "Shared"
                  ? "2 Single Beds"
                  : "4 Single Beds",
            intendedTenant: room.intendedTenant || "",
            beds,
            amenities: room.amenities || [],
            images: [
              primaryImage,
              ROOM_IMAGES.deluxeRoom,
              ROOM_IMAGES.gallery1,
            ],
            policies: room.policies || [],
          };
        });
        if (isMounted) setRooms(mappedRooms);
      } catch (error) {
        console.error("Failed to fetch rooms:", error);
        if (isMounted) setRoomsError("Failed to load rooms. Please try again.");
      } finally {
        if (isMounted) setRoomsLoading(false);
      }
    };
    fetchRooms();
    return () => {
      isMounted = false;
    };
  }, []);

  // ── Capacity validation ────────────────────────────────────
  useEffect(() => {
    if (!rooms.length) return;
    const validation = validateRoomCapacity(rooms);
    if (!validation.isValid)
      console.error("Room capacity validation errors:", validation.errors);
    if (validation.warnings.length > 0)
      console.warn("Room capacity warnings:", validation.warnings);
  }, [rooms]);

  // ── Filtering ──────────────────────────────────────────────
  const getAvailableRoomTypes = () => {
    if (selectedBranch === "Guadalupe") return ["All", "Quadruple"];
    return ["All", "Private", "Shared", "Quadruple"];
  };
  const availableRoomTypes = getAvailableRoomTypes();

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      room.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.branch.toLowerCase().includes(searchQuery.toLowerCase());
    return (
      matchesSearch &&
      (selectedBranch === "All" || room.branch === selectedBranch) &&
      (selectedRoomType === "All" || room.type === selectedRoomType) &&
      room.price >= minPrice &&
      room.price <= maxPrice
    );
  });

  const handleBranchFilter = (branch) => {
    setSelectedBranch(branch);
    setSelectedRoomType("All");
  };
  const clearAllFilters = () => {
    setSelectedBranch("All");
    setSelectedRoomType("All");
    setMinPrice(0);
    setMaxPrice(15000);
    setSearchQuery("");
  };

  // ── Room details / appliances ──────────────────────────────
  const openRoomDetails = (room) => {
    setSelectedRoom(room);
    setSelectedAppliances({});
    setSelectedBed(null);
    setIsDetailsModalOpen(true);
  };
  const closeRoomDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedRoom(null);
    setSelectedAppliances({});
    setSelectedBed(null);
  };
  const handleApplianceQuantityChange = (id, qty) => {
    setSelectedAppliances((prev) => ({
      ...prev,
      [id]: Math.max(0, parseInt(qty, 10) || 0),
    }));
  };
  const calculateApplianceFees = () =>
    AVAILABLE_APPLIANCES.reduce(
      (total, a) => total + a.price * (selectedAppliances[a.id] || 0),
      0,
    );

  // ── Reservation logic ──────────────────────────────────────
  const handleProceedToReservation = () => {
    if (!user) {
      setShowLoginConfirmBeforeReserve(true);
      return;
    }
    proceedWithReservation();
  };

  const proceedWithReservation = async () => {
    if (isChangeRoomMode && changeRoomReservationId && selectedRoom) {
      try {
        const { reservationApi } =
          await import("../../../shared/api/reservationApi");
        await reservationApi.updateByUser(changeRoomReservationId, {
          roomId: selectedRoom.roomId,
          selectedBed: selectedBed
            ? { id: selectedBed.id, position: selectedBed.position }
            : null,
          totalPrice: selectedRoom.price || 5000,
          applianceFees: calculateApplianceFees(),
        });
        closeRoomDetails();
        navigate("/applicant/profile", {
          state: { notification: `Room changed to ${selectedRoom.title}` },
        });
      } catch (err) {
        console.error("Failed to change room:", err);
        showNotification(
          "Failed to change room. " +
            (err?.response?.data?.error || err.message),
          "error",
          4000,
        );
      }
      return;
    }

    try {
      const { reservationApi } =
        await import("../../../shared/api/reservationApi");
      const checkInDate = new Date();
      checkInDate.setDate(checkInDate.getDate() + 30);
      const payload = {
        roomId: selectedRoom.roomId,
        selectedBed: selectedBed
          ? { id: selectedBed.id, position: selectedBed.position }
          : null,
        targetMoveInDate: checkInDate.toISOString(),
        checkInDate: checkInDate.toISOString(),
        totalPrice: selectedRoom.price || 5000,
        applianceFees: calculateApplianceFees(),
        viewingType: null,
        agreedToPrivacy: false,
        visitApproved: false,
      };
      try {
        await reservationApi.create(payload);
      } catch (createErr) {
        if (createErr?.response?.data?.code === "RESERVATION_ALREADY_EXISTS") {
          closeRoomDetails();
          showNotification(
            "You already have an ongoing reservation. Please complete or cancel it before reserving another room.",
            "warning",
            5000,
          );
          navigate("/applicant/profile");
          return;
        } else {
          throw createErr;
        }
      }
      closeRoomDetails();
      navigate("/applicant/profile", {
        state: {
          notification: `Room ${selectedRoom.title} reserved! Continue from your dashboard.`,
        },
      });
    } catch (err) {
      console.error("Failed to reserve room:", err);
      if (err?.response?.data?.code === "RESERVATION_ALREADY_EXISTS") {
        showNotification(
          "You already have an ongoing reservation. Go to your profile to continue.",
          "warning",
          4000,
        );
      } else {
        showNotification(
          "Failed to reserve room. " +
            (err?.response?.data?.error || err.message),
          "error",
          4000,
        );
      }
    }
  };

  // ── Login confirm modal (inline, small) ────────────────────
  const LoginConfirmBeforeReserveModal = () => {
    if (!showLoginConfirmBeforeReserve) return null;
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={() => setShowLoginConfirmBeforeReserve(false)}
      >
        <div
          className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: "#FFF4E6" }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#E7710F"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
            <h3
              className="text-xl font-semibold mb-2"
              style={{ color: "#0C375F" }}
            >
              Sign in to continue
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              You need an account to reserve a room. Sign in if you already have
              one, or create a new account — it only takes a minute.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginConfirmBeforeReserve(false)}
                className="flex-1 py-3 px-4 rounded-full border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Maybe later
              </button>
              <button
                onClick={() => {
                  setShowLoginConfirmBeforeReserve(false);
                  navigate("/signin");
                }}
                className="flex-1 py-3 px-4 rounded-full text-white text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: "#E7710F" }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <LoginConfirmBeforeReserveModal />

      <AvailabilityHeader
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      <FilterPanel
        show={showFilters}
        onClose={() => setShowFilters(false)}
        selectedBranch={selectedBranch}
        onBranchFilter={handleBranchFilter}
        selectedRoomType={selectedRoomType}
        onRoomTypeFilter={setSelectedRoomType}
        availableRoomTypes={availableRoomTypes}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        filteredCount={filteredRooms.length}
        onClearAll={clearAllFilters}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile filter chips */}
        <div className="md:hidden mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex-shrink-0 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium whitespace-nowrap"
          >
            <SlidersHorizontal className="w-4 h-4 inline mr-2" />
            Filters
          </button>
          <button
            className="flex-shrink-0 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium whitespace-nowrap"
            onClick={() => handleBranchFilter("Gil Puyat")}
          >
            Gil Puyat
          </button>
          <button
            className="flex-shrink-0 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium whitespace-nowrap"
            onClick={() => handleBranchFilter("Guadalupe")}
          >
            Guadalupe
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-light mb-2" style={{ color: "#0C375F" }}>
            Available Rooms
          </h1>
          <p className="text-gray-600">
            {roomsLoading
              ? "Loading rooms..."
              : `${filteredRooms.length} rooms available`}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {roomsLoading ? (
            <div className="text-gray-600">Loading rooms...</div>
          ) : roomsError ? (
            <div className="text-red-600">{roomsError}</div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-gray-600">No rooms found.</div>
          ) : (
            filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onClick={() => openRoomDetails(room)}
              />
            ))
          )}
        </div>

        {filteredRooms.length === 0 && !roomsLoading && !roomsError && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No rooms found
            </h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your filters or search criteria
            </p>
            <button
              onClick={clearAllFilters}
              className="px-6 py-3 rounded-lg text-white"
              style={{ backgroundColor: "#E7710F" }}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Coming Soon */}
        <section className="mt-16">
          <h2 className="text-2xl font-light mb-2" style={{ color: "#0C375F" }}>
            Coming Soon
          </h2>
          <p className="text-gray-600 mb-6">
            Rooms that will be available soon
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <article
              className="group rounded-2xl border border-gray-200 overflow-hidden"
              onClick={() => setIsInquiryModalOpen(true)}
              style={{ cursor: "pointer" }}
            >
              <div className="relative aspect-square bg-gray-100">
                <img
                  src={ROOM_IMAGES.standardRoom}
                  alt={UPCOMING_ROOM.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3">
                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/95 shadow-sm">
                    Coming Soon
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-1">
                <h3 className="text-base font-semibold text-gray-900">
                  {UPCOMING_ROOM.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {UPCOMING_ROOM.branch} · {UPCOMING_ROOM.type}
                </p>
                <p className="text-sm text-gray-600">
                  Available from {UPCOMING_ROOM.availableFrom}
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>

      <RoomDetailsModal
        isOpen={isDetailsModalOpen}
        room={selectedRoom}
        onClose={closeRoomDetails}
        onProceed={handleProceedToReservation}
        proceedButtonText={
          isChangeRoomMode ? "Confirm Room Change" : "Proceed to Reservation"
        }
        isOverbooked={selectedRoom ? checkRoomOverbooking(selectedRoom) : false}
        selectedBed={selectedBed}
        onSelectBed={setSelectedBed}
        selectedAppliances={selectedAppliances}
        onApplianceQuantityChange={handleApplianceQuantityChange}
        calculateApplianceFees={calculateApplianceFees}
        availableAppliances={AVAILABLE_APPLIANCES}
      />

      <InquiryModal
        isOpen={isInquiryModalOpen}
        onClose={() => setIsInquiryModalOpen(false)}
      />

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={async () => {
          setShowLogoutConfirm(false);
          try {
            await logout();
            navigate("/signin");
          } catch (err) {
            console.error("Logout error:", err);
          }
        }}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        variant="warning"
        confirmText="Sign Out"
        cancelText="Cancel"
      />
    </div>
  );
}

export default CheckAvailabilityPage;
