import { useState, useEffect, useRef } from "react";
import { showNotification } from "../../../shared/utils/notification";
import {
  Bed,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  X,
  Plus,
  Minus,
  LogOut,
  User,
  ChevronDown,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { roomApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import ElasticSlider from "../components/ElasticSlider";
import "../../../shared/styles/notification.css";
import "../styles/tenant-dashboard.css";
import standardRoom from "../../../assets/images/branches/gil-puyat/standard-room.jpg";
import deluxeRoom from "../../../assets/images/branches/gil-puyat/deluxe-room.jpg";
import premiumRoom from "../../../assets/images/branches/gil-puyat/premium-room.jpg";
import gallery1 from "../../../assets/images/branches/gil-puyat/gallery1.jpg";
import InquiryModal from "../../public/modals/InquiryModal";
import RoomDetailsModal from "../modals/RoomDetailsModal";

const AVAILABLE_APPLIANCES = [
  { id: "fan", name: "Electric Fan", price: 200 },
  { id: "ricecooker", name: "Rice Cooker", price: 200 },
  { id: "laptop", name: "Laptop", price: 200 },
];

const BRANCH_CAPACITY = {
  "Gil Puyat": {
    totalRooms: 20,
    totalBeds: 60,
    roomTypes: {
      Private: { maxRooms: 5, bedsPerRoom: 2 },
      Shared: { maxRooms: 8, bedsPerRoom: 2 },
      Quadruple: { maxRooms: 7, bedsPerRoom: 4 },
    },
  },
  Guadalupe: {
    totalRooms: 12,
    totalBeds: 48,
    roomTypes: {
      Quadruple: { maxRooms: 12, bedsPerRoom: 4 },
    },
  },
};

const validateRoomCapacity = (rooms) => {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  Object.keys(BRANCH_CAPACITY).forEach((branch) => {
    const branchRooms = rooms.filter((r) => r.branch === branch);
    const config = BRANCH_CAPACITY[branch];

    if (branchRooms.length > config.totalRooms) {
      validation.errors.push(
        `${branch}: Room count exceeds maximum of ${config.totalRooms}`,
      );
      validation.isValid = false;
    }

    const totalBeds = branchRooms.reduce(
      (sum, room) => sum + (room.beds ? room.beds.length : 0),
      0,
    );
    if (totalBeds > config.totalBeds) {
      validation.errors.push(
        `${branch}: Bed count ${totalBeds} exceeds maximum of ${config.totalBeds}`,
      );
      validation.isValid = false;
    }

    Object.keys(config.roomTypes).forEach((roomType) => {
      const typeRooms = branchRooms.filter((r) => r.type === roomType);
      const roomConfig = config.roomTypes[roomType];

      if (typeRooms.length > roomConfig.maxRooms) {
        validation.warnings.push(
          `${branch} - ${roomType}: Count ${typeRooms.length} exceeds recommended ${roomConfig.maxRooms}`,
        );
      }

      typeRooms.forEach((room) => {
        const bedCount = room.beds ? room.beds.length : 0;
        if (bedCount !== roomConfig.bedsPerRoom) {
          validation.warnings.push(
            `${room.title}: Has ${bedCount} beds, expected ${roomConfig.bedsPerRoom}`,
          );
        }
      });
    });
  });

  return validation;
};

const checkRoomOverbooking = (room) => {
  if (!room.beds) return false;
  const occupiedBeds = room.beds.filter((bed) => !bed.available).length;
  const totalBeds = room.beds.length;
  return occupiedBeds > totalBeds;
};

function CheckAvailabilityPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const isChangeRoomMode = searchParams.get("changeRoom") === "1";
  const changeRoomReservationId = searchParams.get("reservationId");

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // User initials and display name
  const userInitials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() ||
      (user.email || "?")[0].toUpperCase()
    : "?";
  const userDisplayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      "User"
    : "Guest";

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const mapRoomType = (type) => {
    const value = typeof type === "string" ? type.toLowerCase() : "";
    if (value === "private") return "Private";
    if (value === "double-sharing") return "Shared";
    if (value === "quadruple-sharing") return "Quadruple";
    return "Unknown";
  };

  const mapBranchLabel = (branch) => {
    if (branch === "gil-puyat") return "Gil Puyat";
    if (branch === "guadalupe") return "Guadalupe";
    return "Unknown";
  };

  const getPrimaryImage = (type) => {
    if (type === "private") return standardRoom;
    if (type === "double-sharing") return premiumRoom;
    return gallery1;
  };

  const buildBedsFromCapacity = (roomNumber, type, occupiedCount = 0) => {
    const positions =
      type === "private"
        ? ["single", "single"]
        : type === "double-sharing"
          ? ["upper", "lower"]
          : ["upper", "lower", "upper", "lower"];

    return positions.map((position, index) => ({
      id: `${roomNumber}-B${index + 1}`,
      position,
      available: index >= occupiedCount,
    }));
  };

  useEffect(() => {
    const branch = searchParams.get("branch");
    const roomType = searchParams.get("roomType");

    if (branch) {
      setSelectedBranch(branch);
    }

    if (roomType) {
      setSelectedRoomType(roomType);
    }
  }, [searchParams]);

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
          const bedsLeftText =
            availableBeds === 0
              ? "Full"
              : `${availableBeds} bed${availableBeds === 1 ? "" : "s"} available`;

          return {
            id: roomNumber,
            roomId: room._id,
            title: `Room ${displayName}`,
            branch: branchLabel,
            type: mappedType,
            occupancy: `${room.currentOccupancy || 0}/${room.capacity || totalBeds}`,
            bedsLeft: bedsLeftText,
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
            images: [primaryImage, deluxeRoom, gallery1],
            policies: room.policies || [],
          };
        });

        if (isMounted) {
          setRooms(mappedRooms);
        }
      } catch (error) {
        console.error("Failed to fetch rooms:", error);
        if (isMounted) {
          setRoomsError("Failed to load rooms. Please try again.");
        }
      } finally {
        if (isMounted) {
          setRoomsLoading(false);
        }
      }
    };

    fetchRooms();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!rooms.length) return;

    const validation = validateRoomCapacity(rooms);

    if (!validation.isValid) {
      console.error("Room capacity validation errors:", validation.errors);
    }

    if (validation.warnings.length > 0) {
      console.warn("Room capacity warnings:", validation.warnings);
    }
  }, [rooms]);

  const getAvailableRoomTypes = () => {
    if (selectedBranch === "All") {
      return ["All", "Private", "Shared", "Quadruple"];
    } else if (selectedBranch === "Gil Puyat") {
      return ["All", "Private", "Shared", "Quadruple"];
    } else if (selectedBranch === "Guadalupe") {
      return ["All", "Quadruple"];
    }
    return ["All"];
  };

  const availableRoomTypes = getAvailableRoomTypes();
  const availableRooms = rooms;

  const upcomingRoom = {
    id: "GD-Q-004",
    title: "Room GD-Q-004",
    branch: "Guadalupe",
    type: "Quadruple",
    price: 4200,
    availableFrom: "March 15, 2026",
  };

  const filteredRooms = availableRooms.filter((room) => {
    const matchesSearch =
      room.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.branch.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch =
      selectedBranch === "All" || room.branch === selectedBranch;
    const matchesType =
      selectedRoomType === "All" || room.type === selectedRoomType;
    const matchesPrice = room.price >= minPrice && room.price <= maxPrice;
    return matchesSearch && matchesBranch && matchesType && matchesPrice;
  });

  const handleBranchFilter = (branch) => {
    setSelectedBranch(branch);
    setSelectedRoomType("All");
  };

  const handleRoomTypeFilter = (type) => {
    setSelectedRoomType(type);
  };

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

  const handleApplianceQuantityChange = (applianceId, quantity) => {
    const qty = Math.max(0, parseInt(quantity, 10) || 0);
    setSelectedAppliances((prev) => ({
      ...prev,
      [applianceId]: qty,
    }));
  };

  const calculateApplianceFees = () => {
    return AVAILABLE_APPLIANCES.reduce((total, appliance) => {
      const quantity = selectedAppliances[appliance.id] || 0;
      return total + appliance.price * quantity;
    }, 0);
  };

  const handleProceedToReservation = () => {
    if (!user) {
      setShowLoginConfirmBeforeReserve(true);
      return;
    }

    proceedWithReservation();
  };

  const proceedWithReservation = async () => {
    // ── Change Room Mode: update existing reservation and go back to dashboard ──
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

    // ── Normal Mode: create reservation draft and go to dashboard ──
    try {
      const { reservationApi } =
        await import("../../../shared/api/reservationApi");

      // Build a reasonable check-in date (30 days from now)
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

      let reservationId = null;
      try {
        const resp = await reservationApi.create(payload);
        reservationId = resp?.reservationId || resp?.reservation?._id;
      } catch (createErr) {
        // If user already has a reservation, notify and redirect to profile
        if (createErr?.response?.data?.code === "RESERVATION_ALREADY_EXISTS") {
          closeRoomDetails();
          showNotification(
            "You already have an ongoing reservation.",
            "warning",
            4000,
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
      // Check if user already has an ongoing reservation
      const errorCode = err?.response?.data?.code;
      if (errorCode === "RESERVATION_ALREADY_EXISTS") {
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

  const handleLoginConfirmBeforeReserve = () => {
    setShowLoginConfirmBeforeReserve(false);
    navigate("/signin");
  };

  const handleLoginDismissBeforeReserve = () => {
    setShowLoginConfirmBeforeReserve(false);
  };

  const handleSendInquiry = () => {
    setIsInquiryModalOpen(true);
  };

  const handleGetNotified = () => {
    handleSendInquiry();
  };

  const LoginConfirmBeforeReserveModal = () => {
    if (!showLoginConfirmBeforeReserve) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: "white",
            padding: "24px",
            borderRadius: "12px",
            maxWidth: "420px",
            width: "90%",
            textAlign: "center",
          }}
        >
          <h3 style={{ marginBottom: "10px" }}>Login Required</h3>
          <p style={{ marginBottom: "20px", color: "#555" }}>
            You need to be logged in to reserve a room.
          </p>
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "center" }}
          >
            <button
              onClick={handleLoginDismissBeforeReserve}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleLoginConfirmBeforeReserve}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <LoginConfirmBeforeReserveModal />

      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#0C375F" }}
              >
                <Bed className="w-6 h-6 text-white" />
              </div>
              <span
                className="text-xl font-semibold"
                style={{ color: "#0C375F" }}
              >
                Lilycrest
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-4 flex-1 max-w-2xl mx-8">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search rooms, locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-5 py-3 rounded-full border border-gray-300 hover:border-gray-400 transition-colors"
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span className="text-sm font-medium">Filters</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              {/* User Profile Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full transition-all duration-200"
                  style={{
                    width: "260px",
                    border: showUserMenu
                      ? "1.5px solid #E7710F"
                      : "1.5px solid transparent",
                    backgroundColor: showUserMenu ? "#FFF7ED" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                      e.currentTarget.style.borderColor = "#E5E7EB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showUserMenu) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }
                  }}
                  aria-label="User menu"
                  aria-expanded={showUserMenu}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #E7710F 0%, #D35400 100%)",
                      boxShadow: "0 1px 3px rgba(231, 113, 15, 0.3)",
                    }}
                  >
                    {userInitials}
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate leading-tight text-left">
                    {userDisplayName}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${
                      showUserMenu ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div
                    className="absolute right-0 mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
                    style={{
                      animation: "fadeIn 0.18s ease-out",
                      boxShadow:
                        "0 10px 40px -8px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)",
                    }}
                  >
                    {/* ─── User Identity Header ─── */}
                    <div
                      className="px-3 pt-3 pb-2.5"
                      style={{
                        background:
                          "linear-gradient(180deg, #FAFBFC 0%, #FFFFFF 100%)",
                        borderBottom: "1px solid #F3F4F6",
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{
                            background:
                              "linear-gradient(135deg, #E7710F 0%, #D35400 100%)",
                            boxShadow: "0 2px 6px rgba(231, 113, 15, 0.25)",
                          }}
                        >
                          {userInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p
                              className="text-[13px] font-semibold truncate leading-none"
                              style={{ color: "#1A1A2E" }}
                            >
                              {userDisplayName}
                            </p>
                            <span
                              className="shrink-0 px-1.5 py-px text-[9px] font-semibold rounded uppercase tracking-wide"
                              style={{
                                backgroundColor:
                                  user?.role === "superAdmin"
                                    ? "#FEF3C7"
                                    : user?.role === "admin"
                                      ? "#DBEAFE"
                                      : user?.role === "tenant"
                                        ? "#E0E7FF"
                                        : "#ECFDF5",
                                color:
                                  user?.role === "superAdmin"
                                    ? "#92400E"
                                    : user?.role === "admin"
                                      ? "#1E40AF"
                                      : user?.role === "tenant"
                                        ? "#3730A3"
                                        : "#065F46",
                              }}
                            >
                              {user?.role === "superAdmin"
                                ? "Super Admin"
                                : user?.role === "admin"
                                  ? "Admin"
                                  : user?.role === "tenant"
                                    ? "Tenant"
                                    : "Applicant"}
                            </span>
                          </div>
                          <p
                            className="text-[11px] truncate mt-1 leading-none"
                            style={{ color: "#9CA3AF" }}
                          >
                            {user?.email || ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ─── Navigation Links ─── */}
                    <div className="py-1.5 px-2">
                      <Link
                        to="/applicant/profile"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
                        style={{ color: "#374151" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#F9FAFB";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => setShowUserMenu(false)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#F3F4F6" }}
                        >
                          <User
                            className="w-4 h-4"
                            style={{ color: "#6B7280" }}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">
                            My Profile
                          </p>
                          <p
                            className="text-[11px] leading-tight mt-0.5"
                            style={{ color: "#9CA3AF" }}
                          >
                            View your dashboard
                          </p>
                        </div>
                      </Link>
                    </div>

                    {/* ─── Sign Out ─── */}
                    <div
                      className="px-2 pb-2 pt-1"
                      style={{ borderTop: "1px solid #F3F4F6" }}
                    >
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowLogoutConfirm(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
                        style={{ color: "#EF4444" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#FEF2F2";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#FEF2F2" }}
                        >
                          <LogOut
                            className="w-4 h-4"
                            style={{ color: "#EF4444" }}
                          />
                        </div>
                        <p className="font-medium text-sm leading-tight">
                          Sign Out
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="md:hidden pb-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 focus:border-gray-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      {showFilters && (
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-start justify-between mb-4">
              <h3
                className="text-lg font-semibold"
                style={{ color: "#0C375F" }}
              >
                Filters
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Location
                </label>
                <div className="space-y-2">
                  {["All", "Gil Puyat", "Guadalupe"].map((location) => (
                    <label
                      key={location}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="location"
                        checked={selectedBranch === location}
                        onChange={() => handleBranchFilter(location)}
                        className="w-4 h-4"
                        style={{ accentColor: "#E7710F" }}
                      />
                      <span className="text-sm text-gray-700 capitalize">
                        {location === "All" ? "All Locations" : location}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Room Type
                </label>
                <div className="space-y-2">
                  {availableRoomTypes.map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="type"
                        checked={selectedRoomType === type}
                        onChange={() => handleRoomTypeFilter(type)}
                        className="w-4 h-4"
                        style={{ accentColor: "#E7710F" }}
                      />
                      <span className="text-sm text-gray-700 capitalize">
                        {type === "All" ? "All Types" : type}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center">
                <label className="block text-base font-semibold text-gray-900 mb-6">
                  Price Range
                </label>
                <ElasticSlider
                  defaultValue={maxPrice}
                  startingValue={0}
                  maxValue={15000}
                  isStepped={true}
                  stepSize={100}
                  leftIcon={<Minus className="w-5 h-5 text-gray-600" />}
                  rightIcon={<Plus className="w-5 h-5 text-gray-600" />}
                  onChange={(value) => setMaxPrice(value)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setSelectedBranch("All");
                  setSelectedRoomType("All");
                  setMinPrice(0);
                  setMaxPrice(15000);
                  setSearchQuery("");
                }}
                className="px-6 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="px-6 py-2 rounded-lg text-white"
                style={{ backgroundColor: "#E7710F" }}
              >
                Show {filteredRooms.length} Rooms
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              onClick={() => {
                setSelectedBranch("All");
                setSelectedRoomType("All");
                setMinPrice(0);
                setMaxPrice(15000);
                setSearchQuery("");
              }}
              className="px-6 py-3 rounded-lg text-white"
              style={{ backgroundColor: "#E7710F" }}
            >
              Clear Filters
            </button>
          </div>
        )}

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
              onClick={handleGetNotified}
              style={{ cursor: "pointer" }}
            >
              <div className="relative aspect-square bg-gray-100">
                <img
                  src={standardRoom}
                  alt={upcomingRoom.title}
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
                  {upcomingRoom.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {upcomingRoom.branch} · {upcomingRoom.type}
                </p>
                <p className="text-sm text-gray-600">
                  Available from {upcomingRoom.availableFrom}
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

      {/* Sign Out Confirmation */}
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

function RoomCard({ room, onClick }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const images = room.images?.length ? room.images : [room.image];

  const nextImage = (event) => {
    event.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (event) => {
    event.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-gray-100">
        <img
          src={images[currentImageIndex]}
          alt={room.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {isHovered && images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-md transition-all"
              type="button"
            >
              <ChevronLeft className="w-5 h-5 text-gray-800" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-md transition-all"
              type="button"
            >
              <ChevronRight className="w-5 h-5 text-gray-800" />
            </button>
          </>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  index === currentImageIndex ? "bg-white w-4" : "bg-white/60"
                }`}
              />
            ))}
          </div>
        )}

        <div className="absolute top-3 left-3"></div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg" style={{ color: "#0C375F" }}>
              {room.title}
            </span>
            <span
              className="px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: "#E7710F", color: "#FFFFFF" }}
            >
              {room.type}
            </span>
          </div>
        </div>

        <p className="text-sm font-medium text-gray-700">
          {room.type} · {room.title}
        </p>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>{room.branch}</span>
          <span>•</span>
          <Users className="w-4 h-4" />
          <span>{room.occupancy} occupied</span>
        </div>

        <div className="pt-2">
          <span className="text-lg font-semibold" style={{ color: "#0C375F" }}>
            ₱{room.price.toLocaleString()}
          </span>
          <span className="text-sm text-gray-600"> / month</span>
        </div>
      </div>
    </div>
  );
}

export default CheckAvailabilityPage;
