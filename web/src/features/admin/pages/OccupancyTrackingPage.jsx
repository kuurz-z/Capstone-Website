import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { digitalTwinApi } from "../../../shared/api/digitalTwinApi";
import { formatRoomType, formatBranch } from "../utils/formatters";
import { useVacancyForecast } from "../../../shared/hooks/queries/useRooms";
import { useDigitalTwinSnapshot } from "../../../shared/hooks/queries/useDigitalTwin";
import { SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";

import OccupancyRoomModal from "../components/occupancy/OccupancyRoomModal";
import "../styles/admin-occupancy-tracking.css";

/* ── Helpers ────────────────────────────────────── */
function getOccupancyColor(occupied, capacity) {
  if (capacity === 0) return "var(--status-success)";
  const rate = (occupied / capacity) * 100;
  if (rate === 0) return "var(--status-success)";
  if (rate < 50) return "var(--accent-blue)";
  if (rate < 100) return "var(--status-warning)";
  return "var(--status-error)";
}

function getStatusLabel(room) {
  const status = room.readinessStatus || (room.available ? "available" : "occupied");
  switch (status) {
    case "maintenance":
      return { label: "Maintenance", variant: "error" };
    case "reserved":
      return { label: "Reserved", variant: "info" };
    case "occupied":
      return { label: "Occupied", variant: "warning" };
    case "mixed":
      return { label: "Mixed", variant: "warning" };
    default:
      return { label: "Available", variant: "success" };
  }
}

/* ── Component ──────────────────────────────────── */
function OccupancyTrackingPage({ isEmbedded = false }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);

  const branch = branchFilter === "all" ? "all" : branchFilter;
  const { data: snapshot, isLoading: loading, error: queryError } = useDigitalTwinSnapshot(branch);
  const { data: vacancyResponse } = useVacancyForecast({
    branch: branchFilter === "all" ? null : branchFilter,
  });
  const error = queryError ? "Failed to load occupancy data" : null;
  const rooms = snapshot?.rooms || [];
  const vacancyForecast = vacancyResponse?.forecast || [];

  const handleViewRoomDetails = async (room) => {
    setLoadingRoomDetails(true);
    setShowRoomDetails(true);
    setSelectedRoom({ room, beds: room.beds || [] });
    try {
      const detailedData = await digitalTwinApi.getRoomDetail(room._id);
      setSelectedRoom(detailedData);
    } catch (err) {
      console.error("Failed to fetch room details:", err);
    } finally {
      setLoadingRoomDetails(false);
    }
  };

  // Compute stats
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
    const totalOccupancy = rooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
    const availableBeds = rooms.reduce((sum, room) => {
      const available = Array.isArray(room.beds)
        ? room.beds.filter((bed) => bed.status === "available").length
        : Math.max((room.capacity || 0) - (room.currentOccupancy || 0), 0);
      return sum + available;
    }, 0);
    const rate = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;
    return { totalRooms, totalCapacity, totalOccupancy, availableBeds, rate };
  }, [rooms]);

  // Room type breakdown
  const roomsByType = useMemo(() => {
    const types = ["private", "double-sharing", "quadruple-sharing"];
    return types.map((type) => {
      const typeRooms = rooms.filter((r) => r.type === type);
      const capacity = typeRooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
      const occupied = typeRooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
      const rate = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
      return { type, count: typeRooms.length, capacity, occupied, rate };
    });
  }, [rooms]);

  const forecastByRoomId = useMemo(
    () => new Map(vacancyForecast.map((item) => [String(item.roomId), item])),
    [vacancyForecast],
  );

  // Summary items
  const summaryItems = [
    { label: "Total Rooms", value: stats.totalRooms, color: "blue" },
    { label: "Total Beds", value: stats.totalCapacity, color: "purple" },
    { label: "Committed", value: stats.totalOccupancy, color: "orange" },
    { label: "Available Beds", value: stats.availableBeds, color: "green" },
    { label: "Occupancy Rate", value: `${stats.rate}%`, color: "red" },
  ];

  // Filters
  const filters = [
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
  ];

  // DataTable columns
  const columns = [
    {
      key: "room",
      label: "Room",
      render: (r) => (
        <div className="room-name-cell">
          <span className="room-name-primary">{r.name || r.roomName}</span>
          <span className="room-name-sub">{formatBranch(r.branch)}</span>
        </div>
      ),
    },
    { key: "type", label: "Type", render: (r) => formatRoomType(r.type || r.roomType) },
    { key: "capacity", label: "Capacity", render: (r) => r.capacity || 0 },
    {
      key: "occupied",
      label: "Committed",
      render: (r) => (
        <span className="occupancy-occupied-count">{r.currentOccupancy || r.occupancy || 0}</span>
      ),
    },
    {
      key: "available",
      label: "Available Beds",
      render: (r) => {
        const avail = Array.isArray(r.beds)
          ? r.beds.filter((bed) => bed.status === "available").length
          : (r.capacity || 0) - (r.currentOccupancy || r.occupancy || 0);
        return <span className="occupancy-available-count">{avail}</span>;
      },
    },
    {
      key: "occupancy",
      label: "Occupancy",
      render: (r) => {
        const capacity = r.capacity || 1;
        const occupied = r.currentOccupancy || r.occupancy || 0;
        const rate = Math.round((occupied / capacity) * 100);
        const color = getOccupancyColor(occupied, capacity);
        return (
          <div className="room-occupancy-cell">
            <div className="room-occupancy-bar">
              <div className="room-occupancy-fill" style={{ width: `${rate}%`, background: color }} />
            </div>
            <span>{rate}%</span>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Readiness",
      render: (r) => {
        const { label, variant } = getStatusLabel(r);
        return <StatusBadge variant={variant}>{label}</StatusBadge>;
      },
    },
    {
      key: "forecast",
      label: "Next Vacancy",
      render: (r) => {
        const forecast = forecastByRoomId.get(String(r._id));
        if (!forecast?.nextExpectedVacancy) return "No forecast";
        return new Date(forecast.nextExpectedVacancy).toLocaleDateString();
      },
    },
    {
      key: "action",
      label: "Action",
      align: "right",
      render: (r) => (
        <button
          className="btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            handleViewRoomDetails(r);
          }}
          style={{ padding: "4px 12px", fontSize: "12px" }}
        >
          View
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="admin-section">
        <div className="admin-loading">Loading occupancy data...</div>
      </div>
    );
  }

  return (
    <section className="occupancy-tracking-section">
      {!isEmbedded && (
        <div className="admin-section-header">
          <h1>Occupancy Tracking</h1>
          <p className="admin-section-subtitle">
            Monitor committed occupancy, bed status, and upcoming vacancies.
          </p>
        </div>
      )}

      {error && <div className="admin-error-message">{error}</div>}

      {/* Summary + Filters */}
      <SummaryBar items={summaryItems} />

      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <ActionBar filters={filters} />
      </div>

      {/* Overall Occupancy Bar */}
      <div className="occupancy-overall-bar-section">
        <h3 className="occupancy-section-heading">Overall Occupancy</h3>
        <div className="room-occupancy-bar" style={{ height: 12 }}>
          <div
            className="room-occupancy-fill"
            style={{
              width: `${stats.rate}%`,
              background: getOccupancyColor(stats.totalOccupancy, stats.totalCapacity),
            }}
          />
        </div>
        <span className="occupancy-overall-label">
          {stats.totalOccupancy} / {stats.totalCapacity} beds ({stats.rate}%)
        </span>
      </div>

      {/* Room Type Breakdown */}
      <div className="occupancy-type-breakdown">
        <h3 className="occupancy-section-heading">Room Type Analysis</h3>
        <div className="occupancy-type-cards">
          {roomsByType.map((t) => (
            <div key={t.type} className="occupancy-type-card">
              <div className="occupancy-type-card-header">
                <span className="occupancy-type-name">{formatRoomType(t.type)}</span>
                <span className="occupancy-type-count">{t.count} room{t.count !== 1 ? "s" : ""}</span>
              </div>
              <div className="room-occupancy-bar" style={{ height: 6 }}>
                <div
                  className="room-occupancy-fill"
                  style={{
                    width: `${t.rate}%`,
                    background: getOccupancyColor(t.occupied, t.capacity),
                  }}
                />
              </div>
              <span className="occupancy-type-stat">
                {t.occupied} / {t.capacity} ({t.rate}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {vacancyForecast.length > 0 && (
        <div className="occupancy-type-breakdown">
          <h3 className="occupancy-section-heading">Upcoming Vacancies</h3>
          <div className="occupancy-type-cards">
            {vacancyForecast
              .filter((item) => item.nextExpectedVacancy)
              .slice(0, 4)
              .map((item) => (
                <div key={item.roomId} className="occupancy-type-card">
                  <div className="occupancy-type-card-header">
                    <span className="occupancy-type-name">{item.roomName || item.roomNumber}</span>
                    <span className="occupancy-type-count">{formatBranch(item.branch)}</span>
                  </div>
                  <span className="occupancy-type-stat">
                    Next vacancy: {new Date(item.nextExpectedVacancy).toLocaleDateString()}
                  </span>
                  <span className="occupancy-type-stat">
                    {item.currentOccupancy} / {item.capacity} committed
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Room Table — using shared DataTable */}
      <DataTable
        columns={columns}
        data={rooms}
        loading={loading}
        onRowClick={handleViewRoomDetails}
        emptyState={{
          icon: BarChart3,
          title: "No rooms found",
          description: "Rooms will appear here once configured.",
        }}
      />

      {/* Room Details Modal */}
      {showRoomDetails && selectedRoom && (
        <OccupancyRoomModal
          room={selectedRoom}
          loadingDetails={loadingRoomDetails}
          onClose={() => {
            setShowRoomDetails(false);
            setSelectedRoom(null);
          }}
        />
      )}
    </section>
  );
}

export default OccupancyTrackingPage;
