import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Clock3,
  LayoutGrid,
  Settings,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

// Components
import { PageShell, SummaryBar, ActionBar, DataTable } from "../components/shared";
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

function RoomAvailabilityPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
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

  // Use Digital Twin snapshot so bed dots and occupancy bar are reservation-aware
  // Admins are branch-scoped; super admins (owners) see all
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
      await roomApi.update(updatedRoom._id, { beds: updatedRoom.beds });
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
    { label: "Total Rooms", value: stats.total, color: "blue" },
    { label: "Full", value: stats.full, color: "red" },
    { label: "Partial", value: stats.partial, color: "orange" },
    { label: "Available", value: stats.available, color: "green" },
    { label: "Occupancy Rate", value: `${stats.rate}%`, color: "purple" },
  ];

  const forecastSummaryItems = [
    { label: "Forecast Rooms", value: forecastSummary.total, color: "blue" },
    { label: "With Dates", value: forecastSummary.withDate, color: "green" },
    { label: "Expiring Soon", value: forecastSummary.expiringSoon, color: "orange" },
    { label: "Overdue", value: forecastSummary.overdue, color: "red" },
  ];

  const roomFilters = [
    {
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        { value: "gil-puyat", label: "Gil Puyat" },
        { value: "guadalupe", label: "Guadalupe" },
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
        <div className="room-name-cell">
          <span className="room-name-primary">{r.name}</span>
          <span className="room-name-sub">Floor {r.floor}</span>
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
          <div className="room-occupancy-cell">
            <div className="room-occupancy-bar" style={{ display: "flex", gap: "1px", overflow: "hidden", borderRadius: 3 }}>
              {occupiedPct > 0 && (
                <div
                  className="room-occupancy-fill"
                  style={{ width: `${occupiedPct}%`, background: "var(--status-success)", flexShrink: 0 }}
                />
              )}
              {reservedPct > 0 && (
                <div
                  className="room-occupancy-fill"
                  style={{ width: `${reservedPct}%`, background: "var(--accent-blue)", opacity: 0.75, flexShrink: 0 }}
                />
              )}
            </div>
            <span>{totalPct}%</span>
          </div>
        );
      },
    },
    ...(can("manageRooms")
      ? [
          {
            key: "action",
            label: "Actions",
            align: "right",
            render: (r) => (
              <div className="room-action-buttons">
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfigure(r);
                  }}
                  title="Configure beds"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Settings size={12} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingRoom(r);
                  }}
                  title="Edit room"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="btn-secondary btn-icon-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingRoom(r);
                  }}
                  title="Delete room"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageShell tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange}>
      <PageShell.Summary>
        {activeTab === "rooms" && <SummaryBar items={roomSummaryItems} />}
        {activeTab === "forecast" && <SummaryBar items={forecastSummaryItems} />}
      </PageShell.Summary>

      <PageShell.Actions>
        {activeTab === "rooms" && (
          <ActionBar
            search={{
              value: searchTerm,
              onChange: setSearchTerm,
              placeholder: "Search rooms...",
            }}
            filters={roomFilters}
            actions={
              can("manageRooms")
                ? [
                    {
                      label: "Add Room",
                      icon: Plus,
                      variant: "primary",
                      onClick: () => setShowCreateModal(true),
                    },
                  ]
                : []
            }
          />
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
          {/* Color legend — matches Digital Twin bedStatusColor() exactly */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "8px 12px", marginBottom: 8,
            background: "var(--bg-inset, rgba(0,0,0,0.03))",
            borderRadius: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Bed Status:</span>
            {[
              { color: "var(--status-success)",   label: "Occupied" },
              { color: "var(--accent-blue)",      label: "Reserved" },
              { color: "var(--accent-orange)",    label: "Locked" },
              { color: "var(--border-default)",   label: "Available" },
              { color: "var(--status-error)",     label: "Maintenance" },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span style={{
                  width: 9, height: 9, borderRadius: "50%", background: color,
                  display: "inline-block", border: "1.5px solid rgba(0,0,0,0.08)",
                  flexShrink: 0,
                }} />
                {label}
              </span>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={filteredRooms}
            loading={loading}
            onRowClick={can("manageRooms") ? handleConfigure : null}
            pagination={{
              page: currentPage,
              pageSize: ROOMS_PER_PAGE,
              total: filteredRooms.length,
              onPageChange: setCurrentPage,
            }}
            emptyState={{
              icon: LayoutGrid,
              title: "No rooms found",
              description: "Try adjusting your filters or adding new rooms.",
            }}
          />
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
              <div className="forecast-panel">
                {featuredForecast && (
                  <div className="forecast-highlight">
                    <div>
                      <span className="forecast-highlight__eyebrow">Soonest opening</span>
                      <h3>{featuredForecast.roomName || featuredForecast.roomNumber}</h3>
                      <p>
                        {formatBranch(featuredForecast.branch)} · {formatRoomType(featuredForecast.type)}
                      </p>
                    </div>
                    <div className="forecast-highlight__meta">
                      <span className="forecast-highlight__date">
                        {formatForecastDate(featuredForecast.nextExpectedVacancy)}
                      </span>
                      <span className="forecast-highlight__count">
                        {getDaysUntilVacancy(featuredForecast.nextExpectedVacancy)} days away
                      </span>
                    </div>
                  </div>
                )}

                <div className="forecast-grid">
                  {paginatedForecast.map((item) => {
                    const daysUntil = getDaysUntilVacancy(item.nextExpectedVacancy);
                    const tone = getForecastTone(daysUntil);
                    const occupancyPct = Math.round(((item.currentOccupancy || 0) / (item.capacity || 1)) * 100);

                    return (
                      <article key={item.roomId || item.roomNumber} className={`forecast-card ${tone.className}`}>
                        <div className="forecast-card__header">
                          <div>
                            <span className="forecast-card__branch">{formatBranch(item.branch)}</span>
                            <h3>{item.roomName || item.roomNumber}</h3>
                          </div>
                          <span className="forecast-card__status" style={{ color: tone.accent }}>
                            {tone.label}
                          </span>
                        </div>

                        <div className="forecast-card__metrics">
                          <div>
                            <span className="forecast-card__label">Next vacancy</span>
                            <strong>{formatForecastDate(item.nextExpectedVacancy)}</strong>
                          </div>
                          <div>
                            <span className="forecast-card__label">Committed</span>
                            <strong>{item.currentOccupancy || 0}/{item.capacity || 0}</strong>
                          </div>
                          <div>
                            <span className="forecast-card__label">Room type</span>
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
                            const bedDays = getDaysUntilVacancy(bed.expectedVacancy);
                            const bedTone = getForecastTone(bedDays);
                            return (
                              <div key={bed.bedId} className="forecast-bed-row">
                                <div>
                                  <span className="forecast-bed-row__name">{bed.position}</span>
                                  <span className="forecast-bed-row__date">
                                    {formatForecastDate(bed.expectedVacancy)}
                                  </span>
                                </div>
                                <span
                                  className="forecast-bed-row__badge"
                                  style={{ color: bedTone.accent, borderColor: `${bedTone.accent}33` }}
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
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    <span>Page {currentPage} of {forecastPageCount}</span>
                    <button
                      type="button"
                      className="btn-secondary"
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
