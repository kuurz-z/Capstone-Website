import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { showNotification } from "../../../shared/utils/notification";
import getFriendlyError from "../../../shared/utils/friendlyError";
import { Search } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { queryClient } from "../../../shared/lib/queryClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../../../shared/styles/notification.css";
import "../styles/check-availability.css";
import InquiryModal from "../../public/modals/InquiryModal";
import RoomDetailsModal from "../modals/RoomDetailsModal";
import CheckAvailabilitySkeleton from "../components/check-availability/CheckAvailabilitySkeleton";

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
  buildBedsFromCapacity,
} from "./check-availability";

// ─────────────────────────────────────────────────────────────
// CheckAvailabilityPage — orchestrator
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
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedAppliances, setSelectedAppliances] = useState({});
  const [selectedBed, setSelectedBed] = useState(null);
  const [showLoginConfirmBeforeReserve, setShowLoginConfirmBeforeReserve] =
    useState(false);

  // ── TanStack Query ─────────────────────────────────────────
  const { data: rawRooms = [], isLoading: roomsLoading, error: roomsQueryError } = useRooms();
  const roomsError = roomsQueryError ? "Failed to load rooms. Please try again." : null;



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
        const primaryImage = getPrimaryImage(normalizedType);
        const roomNumber = room.roomNumber || room.room_number || displayName;
        const beds = room.beds?.length
          ? room.beds
          : buildBedsFromCapacity(
              roomNumber,
              normalizedType,
              room.currentOccupancy || 0,
            );
        // Use server-tracked occupancy (kept in sync by auto-heal) instead of
        // the unreliable beds[].status which drifts when reservations change
        const totalBeds = room.capacity || beds.length || 0;
        const occupied = room.currentOccupancy || 0;
        const availableBeds = Math.max(0, totalBeds - occupied);
        return {
          id: roomNumber,
          roomId: room._id,
          title: `Room ${displayName}`,
          branch: branchLabel,
          type: mappedType,
          capacity: totalBeds,
          currentOccupancy: occupied,
          occupancy: `${occupied}/${totalBeds}`,
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
      }),
    [rawRooms],
  );

  // ── Query param filters ────────────────────────────────────
  useEffect(() => {
    const branch = searchParams.get("branch");
    const roomType = searchParams.get("roomType");
    if (branch) setSelectedBranch(branch);
    if (roomType) setSelectedRoomType(roomType);
  }, [searchParams]);

  // ── Capacity validation (dev-only debug removed) ─────────

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
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        navigate("/applicant/profile", {
          state: { notification: `Room changed to ${selectedRoom.title}` },
        });
      } catch (err) {
        console.error("Failed to change room:", err);
        showNotification(
          getFriendlyError(err, "Failed to change room. Please try again."),
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
          // Block ALL room changes when an active reservation exists.
          // Users must cancel their current reservation first.
          closeRoomDetails();
          showNotification(
            "You already have an active reservation. Cancel it first if you'd like a different room.",
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
      await queryClient.invalidateQueries({ queryKey: ["reservations"] });
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
          getFriendlyError(err, "Failed to reserve room. Please try again."),
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
                stroke="#FF8C42"
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
              style={{ color: "#0A1628" }}
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
                  showNotification("Please sign in to reserve a room", "info", 4000);
                  setTimeout(() => navigate("/signin"), 300);
                }}
                className="flex-1 py-3 px-4 rounded-full text-white text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: "#FF8C42" }}
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
    <div className="min-h-screen" style={{ backgroundColor: "var(--surface-page)" }}>
      <LoginConfirmBeforeReserveModal />

      <AvailabilityHeader
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedBranch={selectedBranch}
        onBranchFilter={handleBranchFilter}
        selectedRoomType={selectedRoomType}
        onRoomTypeFilter={setSelectedRoomType}
        availableRoomTypes={availableRoomTypes}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        onClearAll={clearAllFilters}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div style={{ marginBottom: "8px" }}>
          <h1 className="ca-section-title">Available Rooms</h1>
          <p className="ca-room-count">
            {roomsLoading
              ? "Loading rooms..."
              : `${filteredRooms.length} room${filteredRooms.length !== 1 ? "s" : ""} found`}
          </p>
          {!user && (
            <p className="ca-signin-prompt">
              <button onClick={() => navigate("/signin")}>Sign in</button>{" "}
              or{" "}
              <button onClick={() => navigate("/signup")}>create an account</button>{" "}
              to reserve a room
            </p>
          )}
        </div>

        <div className="ca-grid">
          {roomsLoading ? (
            <CheckAvailabilitySkeleton />
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
          <div className="ca-empty">
            <div className="ca-empty-icon">
              <Search style={{ width: 28, height: 28, color: "#9CA3AF" }} />
            </div>
            <h3>No rooms match your filters</h3>
            <p>Try changing the branch, room type, or price range</p>
            <button onClick={clearAllFilters}>Clear All Filters</button>
          </div>
        )}

        {/* Coming Soon */}
        <section style={{ marginTop: "56px" }}>
          <h2 className="ca-section-title">Coming Soon</h2>
          <p className="ca-section-subtitle">Rooms that will be available soon</p>
          <div className="ca-grid">
            <div
              className="ca-coming-soon-card"
              onClick={() => setIsInquiryModalOpen(true)}
            >
              <div className="ca-card-image-wrap">
                <img
                  src={ROOM_IMAGES.standardRoom}
                  alt={UPCOMING_ROOM.title}
                  loading="lazy"
                />
                <span className="ca-coming-soon-badge">Coming Soon</span>
              </div>
              <div className="ca-card-body">
                <div className="ca-card-title">{UPCOMING_ROOM.title}</div>
                <div className="ca-card-location">
                  <span>{UPCOMING_ROOM.branch} · {UPCOMING_ROOM.type}</span>
                </div>
                <p style={{ fontSize: "13px", color: "#9CA3AF" }}>
                  Available from {UPCOMING_ROOM.availableFrom}
                </p>
              </div>
            </div>
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
            showNotification("Signed out successfully", "success", 3000);
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
