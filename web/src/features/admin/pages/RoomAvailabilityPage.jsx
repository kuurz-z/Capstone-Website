import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Building2,
  BedSingle,
  CheckCircle,
  Clock3,
  LayoutGrid,
  MapPin,
  UserCheck,
  Settings,
  Layers,
  Search,
  Plus,
} from "lucide-react";

// Components
import { PageShell, SummaryBar, ActionBar } from "../components/shared";
import RoomConfigModal from "../components/rooms/RoomConfigModal";
import RoomFormModal from "../components/rooms/RoomFormModal";
import DeleteRoomModal from "../components/rooms/DeleteRoomModal";


// Hooks & API
import { useDigitalTwinSnapshot } from "../../../shared/hooks/queries/useDigitalTwin";
import { useVacancyForecast } from "../../../shared/hooks/queries/useRooms";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { roomApi } from "../../../shared/api/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import { formatRoomType, formatBranch } from "../utils/formatters";
import OccupancyTrackingPage from "./OccupancyTrackingPage";

// Styles
import "../styles/admin-room-availability.css";
import "../styles/admin-room-configuration.css";

const TAB_KEYS = new Set(["rooms", "occupancy", "forecast"]);

const getDotColor = (status) => {
  switch (status) {
    case "occupied": return "var(--status-success)";
    case "reserved": return "var(--accent-blue)";
    case "locked": return "var(--accent-orange)";
    case "maintenance": return "var(--status-error)";
    default: return "var(--border-default)";
  }
};

const getDotLabel = (status) => {
  switch (status) {
    case "occupied": return "Moved In";
    case "reserved": return "Reserved";
    case "locked": return "Locked";
    case "maintenance": return "Maintenance";
    default: return "Available";
  }
};

const getSoonestVacancy = (forecastItem) => {
  if (!forecastItem?.beds?.length) return null;
  const datedBeds = forecastItem.beds.filter((bed) => bed.expectedVacancy);
  if (datedBeds.length === 0) return null;
  return datedBeds.sort((a, b) => new Date(a.expectedVacancy) - new Date(b.expectedVacancy))[0];
};

const getDaysUntilVacancy = (value) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const formatForecastDate = (value) => {
  if (!value) return "No forecast";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getForecastTone = (daysUntil) => {
  if (daysUntil == null) {
    return {
      label: "No date",
      className: "forecast-card--neutral",
      accent: "var(--text-muted)",
    };
  }
  if (daysUntil < 0) {
    return {
      label: "Overdue",
      className: "forecast-card--overdue",
      accent: "var(--status-error)",
    };
  }
  if (daysUntil <= 7) {
    return {
      label: "This week",
      className: "forecast-card--soon",
      accent: "var(--accent-orange)",
    };
  }
  if (daysUntil <= 30) {
    return {
      label: "This month",
      className: "forecast-card--upcoming",
      accent: "var(--status-success)",
    };
  }
  return {
    label: "Later",
    className: "forecast-card--neutral",
    accent: "var(--accent-blue)",
  };
};

const getRoomVisualStatus = (room) => {
  const capacity = room.capacity || 0;
  const beds = room.beds || [];
  const occupiedBeds = beds.filter((bed) => bed.status === "occupied").length;
  const reservedBeds = beds.filter((bed) => bed.status === "reserved").length;
  const maintenanceBeds = beds.filter((bed) => bed.status === "maintenance").length;
  const occupied = beds.length ? occupiedBeds : room.currentOccupancy || 0;
  const reserved = beds.length ? reservedBeds : room.reservedCount || 0;
  const maintenance = beds.length ? maintenanceBeds : 0;
  const available = Math.max(capacity - occupied - reserved, 0);

  if (reserved > 0) return "reserved";
  if (maintenance > 0) return "maintenance";
  if (capacity > 0 && occupied >= capacity) return "full";
  if (occupied > 0 && available > 0) return "partial";
  return "available";
};

const getRoomStatusMeta = (room) => {
  const tone = getRoomVisualStatus(room);
  if (tone === "full") {
    return {
      tone,
      label: "Full",
      borderColor: "#EF4444",
      backgroundColor: "#FEE2E244",
      labelBg: "#FEE2E2",
      labelText: "#DC2626",
    };
  }
  if (tone === "partial") {
    return {
      tone,
      label: "Partial",
      borderColor: "#3B82F6",
      backgroundColor: "#DBEAFE66",
      labelBg: "#DBEAFE",
      labelText: "#1D4ED8",
    };
  }
  if (tone === "reserved") {
    return {
      tone,
      label: "Reserved",
      borderColor: "#F59E0B",
      backgroundColor: "#FEF3C766",
      labelBg: "#FEF3C7",
      labelText: "#D97706",
    };
  }
  if (tone === "maintenance") {
    return {
      tone,
      label: "Maintenance",
      borderColor: "#F97316",
      backgroundColor: "#FFF7ED66",
      labelBg: "#FFEDD5",
      labelText: "#C2410C",
    };
  }

  return {
    tone,
    label: "Available",
    borderColor: "#10B981",
    backgroundColor: "#D1FAE566",
    labelBg: "#D1FAE5",
    labelText: "#059669",
  };
};

const getBedStyle = (status) => {
  if (status === "occupied") {
    return { borderColor: "#EF4444", backgroundColor: "#FEE2E2", color: "#DC2626" };
  }
  if (status === "reserved") {
    return { borderColor: "#F59E0B", backgroundColor: "#FEF3C7", color: "#D97706" };
  }
  if (status === "maintenance" || status === "locked") {
    return { borderColor: "#E7710F", backgroundColor: "#FFF7ED", color: "#C2410C" };
  }
  return { borderColor: "#10B981", backgroundColor: "#D1FAE5", color: "#059669" };
};

function RoomAvailabilityPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBranch = user?.role === "owner" ? "gil-puyat" : (user?.branch || "gil-puyat");

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState(initialBranch);
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [forecastStatusFilter, setForecastStatusFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [deletingRoom, setDeletingRoom] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROOMS_PER_PAGE = 10;

  const requestedTab = searchParams.get("tab") || "rooms";
  const activeTab = TAB_KEYS.has(requestedTab) ? requestedTab : "rooms";

  // Use the Digital Twin snapshot as a read model so bed dots and occupancy stay reservation-aware.
  // Branch admins are branch-scoped; owners can view all branches.
  const defaultBranch = user?.branch && user.role !== "owner" ? user.branch : "all";
  const snapshotBranch = user?.role === "owner" ? branchFilter : defaultBranch;
  const dtBranch = snapshotBranch === "all" ? "all" : snapshotBranch;
  const { data: snapshot, isLoading: loading } = useDigitalTwinSnapshot(dtBranch);
  const rooms = snapshot?.rooms ?? [];
  const forecastBranch = user?.role === "owner"
    ? (branchFilter === "all" ? null : branchFilter)
    : defaultBranch;
  const { data: forecastResponse, isLoading: forecastLoading } = useVacancyForecast({
    branch: forecastBranch,
  });
  const forecastItems = forecastResponse?.forecast ?? [];

  // Processing
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch = branchFilter === "all" || room.branch === branchFilter;
      const matchesFloor = floorFilter === "all" || String(room.floor) === floorFilter;
      const matchesType = roomTypeFilter === "all" || room.type === roomTypeFilter;

      return matchesSearch && matchesBranch && matchesFloor && matchesType;
    });
  }, [rooms, searchTerm, branchFilter, floorFilter, roomTypeFilter]);

  const filteredForecast = useMemo(() => {
    return forecastItems.filter((item) => {
      const daysUntil = getDaysUntilVacancy(item.nextExpectedVacancy);
      const tone = getForecastTone(daysUntil);
      const matchesSearch =
        !searchTerm ||
        item.roomName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch = branchFilter === "all" || item.branch === branchFilter;
      const matchesType = roomTypeFilter === "all" || item.type === roomTypeFilter;
      const matchesStatus =
        forecastStatusFilter === "all" ||
        (forecastStatusFilter === "overdue" && tone.label === "Overdue") ||
        (forecastStatusFilter === "this-week" && tone.label === "This week") ||
        (forecastStatusFilter === "this-month" && tone.label === "This month") ||
        (forecastStatusFilter === "later" && tone.label === "Later") ||
        (forecastStatusFilter === "no-date" && tone.label === "No date");
      return matchesSearch && matchesBranch && matchesType && matchesStatus;
    });
  }, [forecastItems, searchTerm, branchFilter, roomTypeFilter, forecastStatusFilter]);

  const featuredForecast = filteredForecast
    .filter((item) => item.nextExpectedVacancy)
    .sort((a, b) => new Date(a.nextExpectedVacancy) - new Date(b.nextExpectedVacancy))[0] || null;
  const forecastPageCount = Math.max(1, Math.ceil(filteredForecast.length / ROOMS_PER_PAGE));
  const paginatedForecast = useMemo(() => {
    const start = (currentPage - 1) * ROOMS_PER_PAGE;
    return filteredForecast.slice(start, start + ROOMS_PER_PAGE);
  }, [filteredForecast, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, branchFilter, floorFilter, roomTypeFilter, forecastStatusFilter, activeTab]);

  useEffect(() => {
    if (TAB_KEYS.has(requestedTab)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "rooms");
    setSearchParams(next, { replace: true });
  }, [requestedTab, searchParams, setSearchParams]);

  // Stats
  const stats = useMemo(() => {
    const total = rooms.length;
    const occupied = rooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
    const capacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
    const full = rooms.filter((r) => r.currentOccupancy >= r.capacity).length;
    const partial = rooms.filter((r) => r.currentOccupancy > 0 && r.currentOccupancy < r.capacity).length;
    const available = rooms.filter((r) => r.currentOccupancy === 0).length;

    return {
      total,
      full,
      partial,
      available,
      rate: capacity > 0 ? ((occupied / capacity) * 100).toFixed(1) : "0.0",
    };
  }, [rooms]);

  const bedStats = useMemo(() => {
    const allBeds = rooms.flatMap((room) => room.beds || []);
    const totalBeds = allBeds.length || rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
    const reserved = allBeds.filter((bed) => bed.status === "reserved").length;
    const occupied = allBeds.filter((bed) => bed.status === "occupied").length;
    const available = allBeds.filter((bed) => !bed.status || bed.status === "available").length;

    // Fallback for rooms without expanded bed arrays.
    if (allBeds.length === 0) {
      const occupiedFallback = rooms.reduce((sum, room) => sum + (room.currentOccupancy || 0), 0);
      return {
        totalBeds,
        available: Math.max(totalBeds - occupiedFallback, 0),
        reserved: 0,
        occupied: occupiedFallback,
      };
    }

    return { totalBeds, available, reserved, occupied };
  }, [rooms]);

  const floorOptions = useMemo(() => {
    if (branchFilter === "guadalupe") {
      return [
        { value: "all", label: "All Floors" },
        { value: "1", label: "Floor 1" },
        { value: "2", label: "Floor 2" },
      ];
    }

    const gilPuyatFloors = Array.from({ length: 10 }, (_, idx) => idx + 1)
      .map((floor) => ({ value: String(floor), label: `Floor ${floor}` }));

    return [{ value: "all", label: "All Floors" }, ...gilPuyatFloors];
  }, [branchFilter]);

  useEffect(() => {
    if (floorOptions.some((option) => option.value === floorFilter)) return;
    setFloorFilter("all");
  }, [floorOptions, floorFilter]);

  const roomStatusCounts = useMemo(() => {
    return rooms.reduce(
      (acc, room) => {
        const tone = getRoomVisualStatus(room);
        acc[tone] += 1;
        return acc;
      },
      { available: 0, reserved: 0, maintenance: 0, partial: 0, full: 0 },
    );
  }, [filteredRooms]);

  const forecastSummary = useMemo(() => {
    const withDate = filteredForecast.filter((item) => item.nextExpectedVacancy);
    const expiringSoon = withDate.filter((item) => {
      const soonest = getSoonestVacancy(item);
      return soonest?.daysRemaining > 0 && soonest.daysRemaining <= 30;
    }).length;
    const overdue = withDate.filter((item) => {
      const soonest = getSoonestVacancy(item);
      return soonest?.isOverdue;
    }).length;

    return {
      total: filteredForecast.length,
      withDate: withDate.length,
      expiringSoon,
      overdue,
    };
  }, [filteredForecast]);

  // Handlers
  const handleConfigure = (room) => {
    setSelectedRoom(room);
  };

  const handleToggleBed = (bedId) => {
    if (!selectedRoom) return;
    const updatedBeds = selectedRoom.beds.map((bed) => {
      if (bed.id !== bedId) return bed;
      const currentStatus = bed.status || (bed.available === false ? "occupied" : "available");
      if (currentStatus === "occupied") return bed;
      const newStatus = currentStatus === "available" ? "maintenance" : "available";
      return { ...bed, status: newStatus };
    });
    setSelectedRoom({ ...selectedRoom, beds: updatedBeds });
  };

  const handleSaveConfig = async (updatedRoom) => {
    try {
      const originalRoom = rooms.find((room) => room._id === updatedRoom._id);
      const changedBeds = (updatedRoom.beds || []).filter((bed) => {
        const previousBed = originalRoom?.beds?.find((entry) => entry.id === bed.id);
        return previousBed && previousBed.status !== bed.status;
      });

      await Promise.all(
        changedBeds.map((bed) =>
          roomApi.updateBedStatus(updatedRoom._id, bed.id, bed.status),
        ),
      );
      showNotification("Room configuration updated", "success");
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setSelectedRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to update", "error");
    }
  };

  // CRUD handlers
  const handleSaveRoom = async (payload, roomId) => {
    try {
      if (roomId) {
        await roomApi.update(roomId, payload);
        showNotification("Room updated successfully", "success");
      } else {
        await roomApi.create(payload);
        showNotification("Room created successfully", "success");
      }
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setShowCreateModal(false);
      setEditingRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to save room", "error");
      throw err;
    }
  };

  const handleDeleteRoom = async (roomId) => {
    try {
      await roomApi.delete(roomId);
      showNotification("Room archived successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setDeletingRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to archive room", "error");
    }
  };

  const handleTabChange = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next);
  };

  // Config — 2 tabs: Rooms (merged with Bed Config) + Occupancy
  const tabs = [
    { key: "rooms", label: "Rooms", icon: LayoutGrid },
    { key: "occupancy", label: "Occupancy", icon: Activity },
    { key: "forecast", label: "Vacancy Forecast", icon: Clock3 },
  ];

  const roomSummaryItems = [
    { label: "Rooms", value: rooms.length, icon: Building2, color: "blue" },
    { label: "Available Beds", value: bedStats.available, icon: BedSingle, color: "green" },
    { label: "Reserved", value: bedStats.reserved, icon: CheckCircle, color: "orange" },
    { label: "Occupied", value: bedStats.occupied, icon: UserCheck, color: "red" },
  ];

  const summaryColorClasses = {
    blue: {
      base: "border-blue-100 bg-blue-50/60",
      icon: "text-blue-600",
      label: "text-blue-700",
      value: "text-blue-900",
    },
    orange: {
      base: "border-amber-100 bg-amber-50/60",
      icon: "text-amber-600",
      label: "text-amber-700",
      value: "text-amber-900",
    },
    green: {
      base: "border-emerald-100 bg-emerald-50/60",
      icon: "text-emerald-600",
      label: "text-emerald-700",
      value: "text-emerald-900",
    },
    red: {
      base: "border-red-100 bg-red-50/60",
      icon: "text-red-600",
      label: "text-red-700",
      value: "text-red-900",
    },
  };

  const forecastSummaryItems = [
    { label: "Forecast Rooms", value: forecastSummary.total, color: "blue" },
    { label: "With Dates", value: forecastSummary.withDate, color: "green" },
    { label: "Expiring Soon", value: forecastSummary.expiringSoon, color: "orange" },
    { label: "Overdue", value: forecastSummary.overdue, color: "red" },
  ];

  const roomFilters = [
    {
      key: "branch",
      options: OWNER_BRANCH_FILTER_OPTIONS.filter((option) => option.value !== "all"),
      value: branchFilter,
      onChange: setBranchFilter,
    },
    {
      key: "floor",
      options: [
        { value: "all", label: "All Floors" },
        { value: "1", label: "Floor 1" },
        { value: "2", label: "Floor 2" },
      ],
      value: floorFilter,
      onChange: setFloorFilter,
    },
    {
      key: "type",
      options: [
        { value: "all", label: "All Types" },
        { value: "private", label: "Private" },
        { value: "double-sharing", label: "Double" },
        { value: "quadruple-sharing", label: "Quadruple" },
      ],
      value: roomTypeFilter,
      onChange: setRoomTypeFilter,
    },
  ];

  const forecastFilters = [
    roomFilters[0],
    roomFilters[2],
    {
      key: "forecast-status",
      options: [
        { value: "all", label: "All Timelines" },
        { value: "overdue", label: "Overdue" },
        { value: "this-week", label: "This Week" },
        { value: "this-month", label: "This Month" },
        { value: "later", label: "Later" },
        { value: "no-date", label: "No Date" },
      ],
      value: forecastStatusFilter,
      onChange: setForecastStatusFilter,
    },
  ];

  const columns = [
    {
      key: "room",
      label: "Room",
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-800">{r.name}</span>
          <span className="text-xs text-slate-500">Floor {r.floor}</span>
        </div>
      ),
    },
    { key: "branch", label: "Branch", render: (r) => formatBranch(r.branch) },
    { key: "type", label: "Type", render: (r) => formatRoomType(r.type) },
    {
      key: "beds",
      label: "Beds",
      render: (r) => {
        const beds = r.beds || [];
        const count = r.currentOccupancy || 0;
        // Exact same mapping as Digital Twin bedStatusColor()
        const dotColor = (status) => {
          switch (status) {
            case "occupied":    return "var(--status-success)";
            case "reserved":    return "var(--accent-blue)";
            case "locked":      return "var(--accent-orange)";
            case "maintenance": return "var(--status-error)";
            default:            return "var(--border-default)";
          }
        };
        const dotLabel = (status) => {
          switch (status) {
            case "occupied":    return "Moved In";
            case "reserved":    return "Reserved";
            case "locked":      return "Locked";
            case "maintenance": return "Maintenance";
            default:            return "Available";
          }
        };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {beds.length > 0 ? beds.map((bed) => (
                <span
                  key={bed.id || bed._id}
                  title={`${bed.position || "Bed"} — ${dotLabel(bed.status)}`}
                  style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: dotColor(bed.status),
                    display: "inline-block",
                    border: "1.5px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08)",
                    flexShrink: 0,
                  }}
                />
              )) : (
                Array.from({ length: r.capacity || 0 }).map((_, i) => (
                  <span key={i} style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: i < count ? "var(--status-success)" : "var(--border-default)",
                    display: "inline-block",
                    border: "1.5px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08)",
                  }} />
                ))
              )}
            </div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 550 }}>
              {count}/{r.capacity}
            </span>
          </div>
        );
      },
    },
    {
      key: "occupancyRate",
      label: "Occupancy Rate",
      render: (r) => {
        const occupied = r.physicalOccupancy ?? 0;
        const reserved = r.reservedCount ?? 0;
        const capacity = r.capacity || 1;
        const occupiedPct = Math.round((occupied / capacity) * 100);
        const reservedPct = Math.round((reserved / capacity) * 100);
        const totalPct = Math.round(((occupied + reserved) / capacity) * 100);
        return (
          <div className="flex min-w-[120px] items-center gap-2">
            <div className="flex h-2 flex-1 gap-px overflow-hidden rounded">
              {occupiedPct > 0 && (
                <div
                  className="h-full"
                  style={{ width: `${occupiedPct}%`, background: "var(--status-success)", flexShrink: 0 }}
                />
              )}
              {reservedPct > 0 && (
                <div
                  className="h-full"
                  style={{ width: `${reservedPct}%`, background: "var(--accent-blue)", opacity: 0.75, flexShrink: 0 }}
                />
              )}
            </div>
            <span className="text-xs font-semibold text-slate-600">{totalPct}%</span>
          </div>
        );
      },
    },
    ...(can("manageRooms")
      ? [
          {
            key: "action",
            label: "Action",
            align: "right",
            render: (r) => (
              <div className="flex justify-end">
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfigure(r);
                  }}
                  title="Manage room"
                  type="button"
                >
                  <Settings size={12} />
                  <span>Manage</span>
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageShell activeTab={activeTab} onTabChange={handleTabChange}>
      <PageShell.Summary>
        <div className="w-full">
          <div className="mb-5 flex items-center">
            <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-base font-semibold tracking-[0.01em] transition-all duration-200 ${
                      activeTab === tab.key
                        ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                        : "text-gray-500 hover:bg-white/70 hover:text-gray-700"
                    }`}
                    id={`page-shell-tab-${tab.key}`}
                    type="button"
                  >
                    {TabIcon ? <TabIcon size={15} /> : null}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === "rooms" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {roomSummaryItems.map((item) => {
                const Icon = item.icon;
                const palette = summaryColorClasses[item.color] || summaryColorClasses.blue;

                return (
                  <div
                    key={item.label}
                    className={`min-h-[120px] rounded-xl border p-5 text-left transition-all hover:shadow-sm ${palette.base}`}
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <Icon className={`h-5 w-5 ${palette.icon}`} />
                      <span className={`text-base font-medium ${palette.label}`}>
                        {item.label}
                      </span>
                    </div>
                    <div className={`text-3xl font-semibold leading-none ${palette.value}`}>
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "forecast" && <SummaryBar items={forecastSummaryItems} />}
        </div>
      </PageShell.Summary>

      <PageShell.Actions>
        {activeTab === "rooms" && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="space-y-3 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-gray-100 p-1">
                    {OWNER_BRANCH_FILTER_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBranchFilter(option.value)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2.5 text-sm font-semibold ${
                        branchFilter === option.value
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500"
                      }`}
                    >
                      <MapPin size={12} />
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="inline-flex rounded-lg bg-gray-100 p-1">
                  <label className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm">
                    <Layers size={12} />
                    <select
                      value={floorFilter}
                      onChange={(event) => setFloorFilter(event.target.value)}
                      className="bg-transparent text-sm font-medium text-gray-700 outline-none"
                    >
                      {floorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <select
                  value={roomTypeFilter}
                  onChange={(event) => setRoomTypeFilter(event.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700"
                >
                  <option value="all">All Types</option>
                  <option value="private">Private</option>
                  <option value="double-sharing">Double</option>
                  <option value="quadruple-sharing">Quadruple</option>
                </select>

                <div className="relative min-w-[190px] flex-1 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search rooms..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-base text-gray-700 outline-none focus:border-blue-400"
                  />
                </div>

                {can("manageRooms") && (
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#0C375F] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a2f50]"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus size={14} />
                    Add Room
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "forecast" && (
          <>
            <ActionBar
              search={{
                value: searchTerm,
                onChange: setSearchTerm,
                placeholder: "Search forecast rooms...",
              }}
              filters={forecastFilters}
            />
          </>
        )}
      </PageShell.Actions>

      <PageShell.Content>
        {activeTab === "rooms" && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#0C375F]">Rooms Overview</h3>
                  <p className="text-sm text-gray-500">
                    Unified room data with visual bed availability and room status clarity.
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-500">
                  {filteredRooms.length} rooms shown
                </span>
              </div>

              <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-600">
                {[
                  {
                    key: "available",
                    label: `Available (${roomStatusCounts.available})`,
                    border: "#10B981",
                    bg: "#D1FAE5",
                  },
                  {
                    key: "reserved",
                    label: `Reserved (${roomStatusCounts.reserved})`,
                    border: "#F59E0B",
                    bg: "#FEF3C7",
                  },
                  {
                    key: "maintenance",
                    label: `Maintenance (${roomStatusCounts.maintenance})`,
                    border: "#F97316",
                    bg: "#FFEDD5",
                  },
                  {
                    key: "partial",
                    label: `Partial (${roomStatusCounts.partial})`,
                    border: "#3B82F6",
                    bg: "#DBEAFE",
                  },
                  {
                    key: "full",
                    label: `Full (${roomStatusCounts.full})`,
                    border: "#EF4444",
                    bg: "#FEE2E2",
                  },
                ].map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <span
                      className="h-4 w-4 rounded border"
                      style={{ borderColor: item.border, backgroundColor: item.bg }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredRooms.map((room) => {
                  const roomStatusStyle = getRoomStatusMeta(room);
                  const beds = room.beds?.length
                    ? room.beds
                    : Array.from({ length: room.capacity || 0 }).map((_, i) => ({
                        id: i,
                        status: i < (room.currentOccupancy || 0) ? "occupied" : "available",
                      }));

                  return (
                    <button
                      type="button"
                      key={room._id || room.id || room.roomNumber}
                      className="w-full rounded-xl border-2 p-4 text-left transition-all hover:shadow-lg"
                      style={{
                        borderColor: roomStatusStyle.borderColor,
                        backgroundColor: roomStatusStyle.backgroundColor,
                      }}
                      onClick={() => handleConfigure(room)}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <strong className="block text-lg font-bold text-[#0C375F]">
                            {room.name || room.roomNumber}
                          </strong>
                          <span className="text-base text-gray-500">{formatRoomType(room.type)} · Floor {room.floor}</span>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-base font-semibold"
                          style={{
                            backgroundColor: roomStatusStyle.labelBg,
                            color: roomStatusStyle.labelText,
                          }}
                        >
                          {roomStatusStyle.label}
                        </span>
                      </div>

                      <div className={`${room.type === "quadruple-sharing" ? "mx-auto grid w-fit grid-cols-2 gap-1.5" : "flex flex-wrap items-center justify-center gap-1.5"}`}>
                        {beds.map((bed) => {
                          const bedStatus = bed.status || "available";
                          const bedStyle = getBedStyle(bedStatus);

                          return (
                            <span
                              key={bed.id || bed._id || `${room._id}-${bed.position}`}
                              className="flex h-11 w-11 items-center justify-center rounded border-2"
                              style={bedStyle}
                            >
                              <BedSingle size={18} />
                            </span>
                          );
                        })}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-base text-gray-600">
                        <span>{room.currentOccupancy || 0}/{room.capacity || 0} occupied</span>
                        {can("manageRooms") && (
                          <span className="inline-flex items-center gap-1.5 text-base font-semibold text-[#0C375F]">
                            <Settings size={14} /> Manage
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        {room.beds?.some((bed) => bed.status === "reserved") && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">
                            Reserved bed present
                          </span>
                        )}
                        {room.beds?.some((bed) => bed.status === "maintenance") && (
                          <span className="rounded-full bg-orange-100 px-2 py-1 font-semibold text-orange-700">
                            Maintenance bed present
                          </span>
                        )}
                        {room.beds?.some((bed) => bed.status === "occupied") && room.beds?.some((bed) => bed.status !== "occupied") && (
                          <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                            Mixed occupancy
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === "occupancy" && <OccupancyTrackingPage isEmbedded={true} />}

        {activeTab === "forecast" && (
          <>
            {forecastLoading ? (
              <div className="forecast-empty-state">
                <Clock3 size={28} />
                <strong>Loading forecast data...</strong>
              </div>
            ) : filteredForecast.length === 0 ? (
              <div className="forecast-empty-state">
                <Clock3 size={28} />
                <strong>No forecast data found</strong>
                <span>Forecasts will appear here for rooms with active bed timelines.</span>
              </div>
            ) : (
              <div className="space-y-5">
                {featuredForecast && (
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div>
                      <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Soonest opening</span>
                      <h3 className="mt-1 text-lg font-bold text-[#0C375F]">{featuredForecast.roomName || featuredForecast.roomNumber}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {formatBranch(featuredForecast.branch)} · {formatRoomType(featuredForecast.type)}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-1 rounded-xl bg-slate-50 px-4 py-3 sm:items-end">
                      <span className="text-sm font-semibold text-slate-800">
                        {formatForecastDate(featuredForecast.nextExpectedVacancy)}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {getDaysUntilVacancy(featuredForecast.nextExpectedVacancy)} days away
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {paginatedForecast.map((item) => {
                    const daysUntil = getDaysUntilVacancy(item.nextExpectedVacancy);
                    const tone = getForecastTone(daysUntil);
                    const occupancyPct = Math.round(((item.currentOccupancy || 0) / (item.capacity || 1)) * 100);
                    const toneClass =
                      tone.label === "Overdue"
                        ? "border-rose-200 bg-rose-50"
                        : tone.label === "This week"
                          ? "border-amber-200 bg-amber-50"
                          : tone.label === "This month"
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white";

                    return (
                      <article key={item.roomId || item.roomNumber} className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">{formatBranch(item.branch)}</span>
                            <h3 className="text-lg font-bold text-[#0C375F]">{item.roomName || item.roomNumber}</h3>
                          </div>
                          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold" style={{ color: tone.accent }}>
                            {tone.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/70 p-3">
                          <div>
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Next vacancy</span>
                            <strong className="text-sm text-slate-800">{formatForecastDate(item.nextExpectedVacancy)}</strong>
                          </div>
                          <div>
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Committed</span>
                            <strong className="text-sm text-slate-800">{item.currentOccupancy || 0}/{item.capacity || 0}</strong>
                          </div>
                          <div>
                            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Room type</span>
                            <strong className="text-sm text-slate-800">{formatRoomType(item.type)}</strong>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full rounded bg-[#0C375F]"
                              style={{ width: `${occupancyPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">{occupancyPct}% occupied</span>
                        </div>

                        <div className="mt-4 space-y-2">
                          {(item.beds || []).map((bed) => {
                            const bedDays = getDaysUntilVacancy(bed.expectedVacancy);
                            const bedTone = getForecastTone(bedDays);
                            return (
                              <div key={bed.bedId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div>
                                  <span className="block text-sm font-semibold text-slate-700">{bed.position}</span>
                                  <span className="block text-xs text-slate-500">
                                    {formatForecastDate(bed.expectedVacancy)}
                                  </span>
                                </div>
                                <span
                                  className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                                  style={{ color: bedTone.accent, borderColor: `${bedTone.accent}55` }}
                                >
                                  {bedDays == null ? "Held" : `${bedDays}d`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {forecastPageCount > 1 && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    <span className="text-sm font-medium text-slate-500">Page {currentPage} of {forecastPageCount}</span>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setCurrentPage((page) => Math.min(forecastPageCount, page + 1))}
                      disabled={currentPage === forecastPageCount}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {selectedRoom && (
          <RoomConfigModal
            room={selectedRoom}
            onToggleBed={handleToggleBed}
            onClose={() => setSelectedRoom(null)}
            onSave={handleSaveConfig}
            onEdit={(room) => {
              setSelectedRoom(null);
              setEditingRoom(room);
            }}
            onDelete={(room) => {
              setSelectedRoom(null);
              setDeletingRoom(room);
            }}
          />
        )}

        {(showCreateModal || editingRoom) && (
          <RoomFormModal
            room={editingRoom}
            onClose={() => {
              setShowCreateModal(false);
              setEditingRoom(null);
            }}
            onSave={handleSaveRoom}
          />
        )}

        {deletingRoom && (
          <DeleteRoomModal
            room={deletingRoom}
            onClose={() => setDeletingRoom(null)}
            onDelete={handleDeleteRoom}
          />
        )}
      </PageShell.Content>
    </PageShell>
  );
}

export default RoomAvailabilityPage;
