import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Clock3,
  FileDown,
  LayoutGrid,
  Settings,
  Plus,
  Bed,
  Wrench,
  DoorOpen,
  Search,
  TrendingUp,
} from "lucide-react";

// Components
import { SummaryBar, ActionBar } from "../components/shared";
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
import { exportToCSV } from "../../../shared/utils/exportUtils";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import {
  normalizeBranchFilterValue,
  syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import { formatRoomType, formatBranch } from "../utils/formatters";
import OccupancyTrackingPage from "./OccupancyTrackingPage";

// Styles
import "../styles/admin-room-availability.css";
import "../styles/admin-room-configuration.css";

const TAB_KEYS = new Set(["rooms", "occupancy", "forecast"]);

const getDotColor = (status) => {
  switch (status) {
    case "occupied":
      return "var(--status-success)";
    case "reserved":
      return "var(--accent-blue)";
    case "locked":
      return "var(--accent-orange)";
    case "maintenance":
      return "var(--status-error)";
    default:
      return "var(--border-default)";
  }
};

const getDotLabel = (status) => {
  switch (status) {
    case "occupied":
      return "Moved In";
    case "reserved":
      return "Reserved";
    case "locked":
      return "Locked";
    case "maintenance":
      return "Maintenance";
    default:
      return "Available";
  }
};

const getSoonestVacancy = (forecastItem) => {
  if (!forecastItem?.beds?.length) return null;
  const datedBeds = forecastItem.beds.filter((bed) => bed.expectedVacancy);
  if (datedBeds.length === 0) return null;
  return datedBeds.sort(
    (a, b) => new Date(a.expectedVacancy) - new Date(b.expectedVacancy),
  )[0];
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

function RoomAvailabilityPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    normalizeBranchFilterValue({
      requestedBranch: user?.role === "owner" ? requestedBranch : null,
      fallbackBranch: user?.role === "owner" ? null : user?.branch,
      allValue: "all",
    }),
  );
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [roomStatusFilter, setRoomStatusFilter] = useState("all");
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
  // Always fetch the full scope allowed for the user (defaultBranch) to avoid API-level occupancy calculation bugs,
  // and rely entirely on client-side filtering for the branch selection.
  const defaultBranch =
    user?.branch && user.role !== "owner" ? user.branch : "all";
  const { data: snapshot, isLoading: loading } =
    useDigitalTwinSnapshot(defaultBranch);
  const rooms = snapshot?.rooms ?? [];
  const forecastBranch = defaultBranch === "all" ? null : defaultBranch;
  const { data: forecastResponse, isLoading: forecastLoading } =
    useVacancyForecast({
      branch: forecastBranch,
    });
  const forecastItems = forecastResponse?.forecast ?? [];

  // Processing
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch =
        branchFilter === "all" || room.branch === branchFilter;
      const matchesFloor =
        floorFilter === "all" || String(room.floor) === floorFilter;
      const matchesType =
        roomTypeFilter === "all" || room.type === roomTypeFilter;

      const matchesStatus =
        roomStatusFilter === "all" ||
        (() => {
          const bedsInMaintenance = (room.beds || []).filter(
            (b) => b.status === "maintenance",
          ).length;
          const roomLevelMaintenance =
            bedsInMaintenance === room.capacity && room.capacity > 0;
          const effectiveCapacity = roomLevelMaintenance
            ? 0
            : room.capacity - bedsInMaintenance;

          let displayStatus = "available";
          if (roomLevelMaintenance) displayStatus = "maintenance";
          else if (
            room.currentOccupancy >= effectiveCapacity &&
            effectiveCapacity > 0
          )
            displayStatus = "full";
          else if (room.currentOccupancy > 0) displayStatus = "partial";
          return displayStatus === roomStatusFilter;
        })();

      return (
        matchesSearch &&
        matchesBranch &&
        matchesFloor &&
        matchesType &&
        matchesStatus
      );
    });
  }, [
    rooms,
    searchTerm,
    branchFilter,
    floorFilter,
    roomTypeFilter,
    roomStatusFilter,
  ]);

  const filteredForecast = useMemo(() => {
    return forecastItems.filter((item) => {
      const daysUntil = getDaysUntilVacancy(item.nextExpectedVacancy);
      const tone = getForecastTone(daysUntil);
      const matchesSearch =
        !searchTerm ||
        item.roomName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch =
        branchFilter === "all" || item.branch === branchFilter;
      const matchesType =
        roomTypeFilter === "all" || item.type === roomTypeFilter;
      const matchesStatus =
        forecastStatusFilter === "all" ||
        (forecastStatusFilter === "overdue" && tone.label === "Overdue") ||
        (forecastStatusFilter === "this-week" && tone.label === "This week") ||
        (forecastStatusFilter === "this-month" &&
          tone.label === "This month") ||
        (forecastStatusFilter === "later" && tone.label === "Later") ||
        (forecastStatusFilter === "no-date" && tone.label === "No date");
      return matchesSearch && matchesBranch && matchesType && matchesStatus;
    });
  }, [
    forecastItems,
    searchTerm,
    branchFilter,
    roomTypeFilter,
    forecastStatusFilter,
  ]);

  const featuredForecast =
    filteredForecast
      .filter((item) => item.nextExpectedVacancy)
      .sort(
        (a, b) =>
          new Date(a.nextExpectedVacancy) - new Date(b.nextExpectedVacancy),
      )[0] || null;
  const forecastPageCount = Math.max(
    1,
    Math.ceil(filteredForecast.length / ROOMS_PER_PAGE),
  );
  const paginatedForecast = useMemo(() => {
    const start = (currentPage - 1) * ROOMS_PER_PAGE;
    return filteredForecast.slice(start, start + ROOMS_PER_PAGE);
  }, [filteredForecast, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    branchFilter,
    floorFilter,
    roomTypeFilter,
    roomStatusFilter,
    forecastStatusFilter,
    activeTab,
  ]);

  useEffect(() => {
    if (TAB_KEYS.has(requestedTab)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "rooms");
    setSearchParams(next, { replace: true });
  }, [requestedTab, searchParams, setSearchParams]);

  useEffect(() => {
    const nextBranch = normalizeBranchFilterValue({
      requestedBranch: user?.role === "owner" ? requestedBranch : null,
      fallbackBranch: user?.role === "owner" ? null : user?.branch,
      allValue: "all",
    });

    setBranchFilter((current) =>
      current === nextBranch ? current : nextBranch,
    );
  }, [requestedBranch, user?.branch, user?.role]);

  useEffect(() => {
    if (!user?.role) return;

    const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
      enabled: user?.role === "owner",
      allValue: "all",
    });

    if (nextParams.toString() === searchParams.toString()) return;
    setSearchParams(nextParams, { replace: true });
  }, [branchFilter, searchParams, setSearchParams, user?.role]);

  // Stats
  const stats = useMemo(() => {
    const total = rooms.length;
    const occupied = rooms.reduce(
      (sum, r) => sum + (r.currentOccupancy || 0),
      0,
    );
    const capacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
    const full = rooms.filter((r) => r.currentOccupancy >= r.capacity).length;
    const partial = rooms.filter(
      (r) => r.currentOccupancy > 0 && r.currentOccupancy < r.capacity,
    ).length;
    const available = rooms.filter((r) => r.currentOccupancy === 0).length;
    const maintenance = rooms.filter((r) => {
      const mBeds = (r.beds || []).filter(
        (b) => b.status === "maintenance",
      ).length;
      return mBeds > 0 && mBeds === r.capacity && r.capacity > 0;
    }).length;

    return {
      total,
      full,
      partial,
      available,
      maintenance,
      rate: capacity > 0 ? ((occupied / capacity) * 100).toFixed(1) : "0.0",
    };
  }, [rooms]);

  const forecastSummary = useMemo(() => {
    const withDate = filteredForecast.filter(
      (item) => item.nextExpectedVacancy,
    );
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
    setSelectedRoom({
      ...room,
      beds: (room.beds || []).map((bed) => ({
        ...bed,
        originalId: bed.originalId || bed.id,
      })),
    });
  };

  const handleSaveConfig = async (updatedRoom) => {
    try {
      const originalRoom = rooms.find((room) => room._id === updatedRoom._id);
      const originalBeds = originalRoom?.beds || [];
      const updatedBeds = updatedRoom.beds || [];
      const originalById = new Map(originalBeds.map((bed) => [bed.id, bed]));
      const keptOriginalIds = new Set(
        updatedBeds.map((bed) => bed.originalId).filter(Boolean),
      );
      const removedBeds = originalBeds.filter(
        (bed) => !keptOriginalIds.has(bed.id),
      );
      const newBeds = updatedBeds.filter((bed) => !bed.originalId);
      const existingBeds = updatedBeds.filter((bed) => bed.originalId);

      for (const bed of removedBeds) {
        await roomApi.deleteBed(updatedRoom._id, bed.id);
      }

      for (const bed of existingBeds) {
        const previousBed = originalById.get(bed.originalId);
        if (!previousBed) continue;

        if (
          previousBed.id !== bed.id ||
          previousBed.position !== bed.position
        ) {
          await roomApi.updateBed(updatedRoom._id, previousBed.id, {
            id: bed.id,
            position: bed.position,
          });
        }

        if (
          (previousBed.status || "available") !== (bed.status || "available")
        ) {
          await roomApi.updateBedStatus(updatedRoom._id, bed.id, bed.status);
        }
      }

      for (const bed of newBeds) {
        await roomApi.addBed(updatedRoom._id, {
          id: bed.id,
          position: bed.position,
        });
        if (bed.status === "maintenance") {
          await roomApi.updateBedStatus(updatedRoom._id, bed.id, bed.status);
        }
      }

      await roomApi.reorderBeds(
        updatedRoom._id,
        updatedBeds.map((bed) => bed.id),
      );

      showNotification("Room configuration updated", "success");
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
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

  const handleExportRooms = () => {
    exportToCSV(
      filteredRooms.map((room) => ({
        roomName: room.name,
        roomNumber: room.roomNumber,
        branch: formatBranch(room.branch),
        type: formatRoomType(room.type),
        floor: room.floor,
        capacity: room.capacity,
        currentOccupancy: room.currentOccupancy || 0,
        status: `${room.currentOccupancy || 0}/${room.capacity || 0}`,
      })),
      [
        { key: "roomName", label: "Room Name" },
        { key: "roomNumber", label: "Room Number" },
        { key: "branch", label: "Branch" },
        { key: "type", label: "Type" },
        { key: "floor", label: "Floor" },
        { key: "capacity", label: "Capacity" },
        { key: "currentOccupancy", label: "Occupied" },
        { key: "status", label: "Occupancy" },
      ],
      "room-inventory",
    );
  };

  // Config — 2 tabs: Rooms (merged with Bed Config) + Occupancy
  const tabs = [
    { key: "rooms", label: "Rooms", icon: LayoutGrid },
    { key: "occupancy", label: "Occupancy", icon: Activity },
    { key: "forecast", label: "Vacancy Forecast", icon: Clock3 },
  ];

  const forecastSummaryItems = [
    { label: "Forecast Rooms", value: forecastSummary.total, color: "blue" },
    { label: "With Dates", value: forecastSummary.withDate, color: "green" },
    {
      label: "Expiring Soon",
      value: forecastSummary.expiringSoon,
      color: "orange",
    },
    { label: "Overdue", value: forecastSummary.overdue, color: "red" },
  ];

  const roomFilters = [
    {
      key: "status",
      options: [
        { value: "all", label: "All Status" },
        { value: "available", label: "Available" },
        { value: "partial", label: "Partial" },
        { value: "full", label: "Full" },
        { value: "maintenance", label: "Maintenance" },
      ],
      value: roomStatusFilter,
      onChange: setRoomStatusFilter,
    },
    {
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        ...OWNER_BRANCH_FILTER_OPTIONS.filter((o) => o.value !== "all"),
      ],
      value: branchFilter,
      onChange: setBranchFilter,
    },
    {
      key: "floor",
      options: [
        { value: "all", label: "All Floors" },
        { value: "1", label: "Floor 1" },
        { value: "2", label: "Floor 2" },
        { value: "3", label: "Floor 3" },
        { value: "4", label: "Floor 4" },
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

  const roomStatusLegend = [
    { key: "available", label: "Available", dot: "bg-green-500" },
    { key: "partial", label: "Partially Occupied", dot: "bg-amber-500" },
    { key: "full", label: "Full", dot: "bg-red-500" },
    { key: "maintenance", label: "Maintenance", dot: "bg-neutral-500" },
  ];

  const getRoomStatusConfig = (status) => {
    switch (status) {
      case "available":
        return {
          dot: "bg-green-500",
          label: "Available",
          color: "text-green-600",
        };
      case "partial":
        return {
          dot: "bg-amber-500",
          label: "Partially Occupied",
          color: "text-warning-dark",
        };
      case "full":
        return { dot: "bg-red-500", label: "Full", color: "text-red-600" };
      case "maintenance":
        return {
          dot: "bg-neutral-500",
          label: "Maintenance",
          color: "text-neutral-600",
        };
      case "reserved":
        return {
          dot: "bg-blue-500",
          label: "Reserved",
          color: "text-blue-600",
        };
      default:
        return {
          dot: "bg-border",
          label: "Unknown",
          color: "text-muted-foreground",
        };
    }
  };

  const FLOORS_PER_PAGE = 6;

  const allGroupedByFloor = useMemo(() => {
    return filteredRooms.reduce((acc, room) => {
      const key = `Floor ${room.floor}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(room);
      return acc;
    }, {});
  }, [filteredRooms]);

  const floorKeys = useMemo(() => {
    return Object.keys(allGroupedByFloor).sort((a, b) => {
      const numA = parseInt(a.replace("Floor ", "")) || 0;
      const numB = parseInt(b.replace("Floor ", "")) || 0;
      return numA - numB;
    });
  }, [allGroupedByFloor]);

  const groupedByFloor = useMemo(() => {
    const start = (currentPage - 1) * FLOORS_PER_PAGE;
    const paginatedKeys = floorKeys.slice(start, start + FLOORS_PER_PAGE);

    const result = {};
    paginatedKeys.forEach((key) => {
      result[key] = allGroupedByFloor[key];
    });
    return result;
  }, [allGroupedByFloor, floorKeys, currentPage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          Room Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Track available capacity, assignments, and turnover across rooms
          without leaving operations.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
  borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
}}
      >
        <div className="flex gap-6">
          {[
            { id: "rooms", label: "Rooms" },
            { id: "occupancy", label: "Occupancy" },
            { id: "forecast", label: "Vacancy Forecast" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? ""
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={activeTab === tab.id ? { color: "var(--primary)" } : {}}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "var(--primary)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "rooms" && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <DoorOpen className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Total Rooms
                </span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.total}
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Available</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.available}
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-muted-foreground">Partial</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.partial}
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">Full</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.full}
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-neutral-500" />
                <span className="text-xs text-muted-foreground">
                  Maintenance
                </span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.maintenance}
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--card)",
                
                border: "1px solid var(--border)"
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Occupancy</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.rate}%
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-5"
            style={{
              backgroundColor: "var(--card)",
              
              border: "1px solid var(--border)"
            }}
          >
            <div className="flex flex-col lg:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by room number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/70"
                  style={{ border: "1px solid var(--border)" }}
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <select
                  value={roomStatusFilter}
                  onChange={(e) => setRoomStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_10px_center] bg-no-repeat"
                  style={{
                    backgroundColor: "var(--card)",
                    
                    border: "1px solid var(--border)"
                  }}
                >
                  {roomFilters[0].options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_10px_center] bg-no-repeat"
                  style={{
                    backgroundColor: "var(--card)",
                    
                    border: "1px solid var(--border)"
                  }}
                >
                  {roomFilters[1].options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[position:right_10px_center] bg-no-repeat"
                  style={{
                    backgroundColor: "var(--card)",
                    
                    border: "1px solid var(--border)"
                  }}
                >
                  {roomFilters[2].options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {can("manageRooms") && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 text-foreground rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                    style={{ backgroundColor: "var(--primary)" }}
                    onMouseEnter={(e) => (e.target.style.opacity = "0.9")}
                    onMouseLeave={(e) => (e.target.style.opacity = "1")}
                  >
                    <Plus className="w-4 h-4" />
                    Add Room
                  </button>
                )}
              </div>
            </div>

            <div
              className="mb-6 rounded-lg px-3 py-2.5"
              style={{
                border: "1px solid var(--border)",
                backgroundColor:
                  "color-mix(in srgb, var(--muted) 20%, transparent)",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Legend</span>
                {roomStatusLegend.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                    <span>{item.label}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Room has beds in maintenance</span>
                </span>
              </div>
            </div>

            <div className="space-y-8 mt-2">
              {Object.keys(groupedByFloor).length > 0 ? (
                Object.entries(groupedByFloor).map(([floor, floorRooms]) => (
                  <div key={floor}>
                    <div className="flex items-center gap-3 mb-4 px-1">
                      <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {floor}
                      </h3>
                      <div
                        className="flex-1 h-px"
                        style={{
                          backgroundColor: "var(--border)",
                          opacity: "0.6",
                        }}
                      />
                      <span className="text-[12px] text-muted-foreground/80">
                        {floorRooms.length} rooms
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {floorRooms.map((room) => {
                        const bedsInMaintenance = (room.beds || []).filter(
                          (b) => b.status === "maintenance",
                        ).length;
                        const roomLevelMaintenance =
                          bedsInMaintenance === room.capacity &&
                          room.capacity > 0;
                        const effectiveCapacity = roomLevelMaintenance
                          ? 0
                          : room.capacity - bedsInMaintenance;

                        let displayStatus = "available";
                        if (roomLevelMaintenance) displayStatus = "maintenance";
                        else if (
                          room.currentOccupancy >= effectiveCapacity &&
                          effectiveCapacity > 0
                        )
                          displayStatus = "full";
                        else if (room.currentOccupancy > 0)
                          displayStatus = "partial";

                        const config = getRoomStatusConfig(displayStatus);

                        return (
                          <button
                            key={room._id || room.id}
                            onClick={() => {
                              if (can("manageRooms")) handleConfigure(room);
                            }}
                            className={`group relative rounded-xl p-4 hover:shadow-md transition-all duration-200 text-center flex flex-col items-center justify-center w-[118px] h-[116px] ${!can("manageRooms") ? "cursor-default" : "cursor-pointer"}`}
                            style={{
                              backgroundColor: "var(--card)",
                              
                              border: "1px solid var(--border)"
                            }}
                            title={`${room.name || room.roomNumber} - ${config.label}${bedsInMaintenance > 0 ? ` (${bedsInMaintenance} bed${bedsInMaintenance > 1 ? "s" : ""} in maintenance)` : ""}`}
                          >
                            <div
                              className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${config.dot}`}
                            />

                            {bedsInMaintenance > 0 && !roomLevelMaintenance && (
                              <div className="absolute top-3 left-3 text-muted-foreground">
                                <Wrench className="w-4 h-4" />
                              </div>
                            )}

                            <Bed className="w-5 h-5 text-muted-foreground/80 mb-1 group-hover:text-primary transition-colors" />
                            <span className="text-[18px] font-bold text-foreground dark:text-foreground tracking-tight leading-none mb-1.5">
                              {room.roomNumber}
                            </span>

                            {roomLevelMaintenance ? (
                              <span className="text-xs text-muted-foreground font-medium">
                                Maintenance
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">
                                {room.currentOccupancy || 0}/{effectiveCapacity}
                                {bedsInMaintenance > 0 && (
                                  <span className="ml-[2px]">
                                    ({bedsInMaintenance}M)
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className="text-center py-16 rounded-lg border-dashed"
                  style={{
                    backgroundColor: "var(--card)",
                    
                    border: "1px dashed",
                  }}
                >
                  <DoorOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    No rooms found matching your filters
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your search or add a new room.
                  </p>
                </div>
              )}

              {floorKeys.length > FLOORS_PER_PAGE && (
                <div
                  className="flex items-center justify-between pt-4 mt-6 px-1"
                  style={{
                    borderTopColor: "var(--border)",
                    borderTop: "1px solid",
                  }}
                >
                  <span className="text-xs text-muted-foreground">
                    Showing floors {(currentPage - 1) * FLOORS_PER_PAGE + 1} to{" "}
                    {Math.min(currentPage * FLOORS_PER_PAGE, floorKeys.length)}{" "}
                    of {floorKeys.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="px-3 py-1 text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
                      style={{
                        
                        border: "1px solid var(--border)"
                      }}
                      onMouseEnter={(e) =>
                        (e.target.style.backgroundColor = "var(--muted)")
                      }
                      onMouseLeave={(e) =>
                        (e.target.style.backgroundColor = "transparent")
                      }
                    >
                      Previous
                    </button>
                    <button
                      disabled={
                        currentPage >=
                        Math.ceil(floorKeys.length / FLOORS_PER_PAGE)
                      }
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="px-3 py-1 text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
                      style={{
                        
                        border: "1px solid var(--border)"
                      }}
                      onMouseEnter={(e) =>
                        (e.target.style.backgroundColor = "var(--muted)")
                      }
                      onMouseLeave={(e) =>
                        (e.target.style.backgroundColor = "transparent")
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "occupancy" && <OccupancyTrackingPage isEmbedded={true} />}

      {activeTab === "forecast" && (
        <div className="space-y-6">
          <SummaryBar items={forecastSummaryItems} />
          <ActionBar
            search={{
              value: searchTerm,
              onChange: setSearchTerm,
              placeholder: "Search forecast rooms...",
            }}
            filters={forecastFilters}
          />
          {forecastLoading ? (
            <div
              className="forecast-empty-state rounded-lg p-8"
              style={{
                backgroundColor: "var(--card)",
                
                border: "1px solid var(--border)"
              }}
            >
              <Clock3 size={28} />
              <strong>Loading forecast data...</strong>
            </div>
          ) : filteredForecast.length === 0 ? (
            <div
              className="forecast-empty-state rounded-lg p-8"
              style={{
                backgroundColor: "var(--card)",
                
                border: "1px solid var(--border)"
              }}
            >
              <Clock3 size={28} />
              <strong>No forecast data found</strong>
              <span>
                Forecasts will appear here for rooms with active bed timelines.
              </span>
            </div>
          ) : (
            <div className="forecast-panel">
              {featuredForecast && (
                <div className="forecast-highlight">
                  <div>
                    <span className="forecast-highlight__eyebrow">
                      Soonest opening
                    </span>
                    <h3>
                      {featuredForecast.roomName || featuredForecast.roomNumber}
                    </h3>
                    <p>
                      {formatBranch(featuredForecast.branch)} ·{" "}
                      {formatRoomType(featuredForecast.type)}
                    </p>
                  </div>
                  <div className="forecast-highlight__meta">
                    <span className="forecast-highlight__date">
                      {formatForecastDate(featuredForecast.nextExpectedVacancy)}
                    </span>
                    <span className="forecast-highlight__count">
                      {getDaysUntilVacancy(
                        featuredForecast.nextExpectedVacancy,
                      )}{" "}
                      days away
                    </span>
                  </div>
                </div>
              )}

              <div className="forecast-grid">
                {paginatedForecast.map((item) => {
                  const daysUntil = getDaysUntilVacancy(
                    item.nextExpectedVacancy,
                  );
                  const tone = getForecastTone(daysUntil);
                  const occupancyPct = Math.round(
                    ((item.currentOccupancy || 0) / (item.capacity || 1)) * 100,
                  );

                  return (
                    <article
                      key={item.roomId || item.roomNumber}
                      className={`forecast-card ${tone.className}`}
                    >
                      <div className="forecast-card__header">
                        <div>
                          <span className="forecast-card__branch">
                            {formatBranch(item.branch)}
                          </span>
                          <h3>{item.roomName || item.roomNumber}</h3>
                        </div>
                        <span
                          className="forecast-card__status"
                          style={{ color: tone.accent }}
                        >
                          {tone.label}
                        </span>
                      </div>

                      <div className="forecast-card__metrics">
                        <div>
                          <span className="forecast-card__label">
                            Next vacancy
                          </span>
                          <strong>
                            {formatForecastDate(item.nextExpectedVacancy)}
                          </strong>
                        </div>
                        <div>
                          <span className="forecast-card__label">
                            Committed
                          </span>
                          <strong>
                            {item.currentOccupancy || 0}/{item.capacity || 0}
                          </strong>
                        </div>
                        <div>
                          <span className="forecast-card__label">
                            Room type
                          </span>
                          <strong>{formatRoomType(item.type)}</strong>
                        </div>
                      </div>

                      <div className="forecast-card__occupancy">
                        <div className="forecast-card__occupancy-bar">
                          <div
                            className="forecast-card__occupancy-fill"
                            style={{ width: `${occupancyPct}%` }}
                          />
                        </div>
                        <span>{occupancyPct}% occupied</span>
                      </div>

                      <div className="forecast-card__beds">
                        {(item.beds || []).map((bed) => {
                          const bedDays = getDaysUntilVacancy(
                            bed.expectedVacancy,
                          );
                          const bedTone = getForecastTone(bedDays);
                          return (
                            <div key={bed.bedId} className="forecast-bed-row">
                              <div>
                                <span className="forecast-bed-row__name">
                                  {bed.position}
                                </span>
                                <span className="forecast-bed-row__date">
                                  {formatForecastDate(bed.expectedVacancy)}
                                </span>
                              </div>
                              <span
                                className="forecast-bed-row__badge"
                                style={{
                                  color: bedTone.accent,
                                  borderColor: `${bedTone.accent}33`,
                                }}
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
                <div className="forecast-pagination">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {forecastPageCount}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(forecastPageCount, page + 1),
                      )
                    }
                    disabled={currentPage === forecastPageCount}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedRoom && (
        <RoomConfigModal
          room={selectedRoom}
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
    </div>
  );
}

export default RoomAvailabilityPage;
