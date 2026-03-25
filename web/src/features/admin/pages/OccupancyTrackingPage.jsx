import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { roomApi } from "../../../shared/api/apiClient";
import { formatRoomType, formatBranch } from "../utils/formatters";
import { useBranchOccupancy } from "../../../shared/hooks/queries/useRooms";
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

function getStatusLabel(rate) {
  if (rate === 0) return { label: "Empty", variant: "success" };
  if (rate < 50) return { label: "Low", variant: "info" };
  if (rate < 100) return { label: "High", variant: "warning" };
  return { label: "Full", variant: "error" };
}

/* ── Component ──────────────────────────────────── */
function OccupancyTrackingPage({ isEmbedded = false }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);

  const branch = branchFilter === "all" ? null : branchFilter;
  const { data: occupancyResponse, isLoading: loading, error: queryError } = useBranchOccupancy(branch);
  const error = queryError ? "Failed to load occupancy data" : null;

  const occupancyStats = occupancyResponse?.statistics || occupancyResponse;
  const rooms = occupancyStats?.rooms || [];

  const handleViewRoomDetails = async (room) => {
    setLoadingRoomDetails(true);
    setShowRoomDetails(true);
    setSelectedRoom(room);
    try {
      const detailedData = await roomApi.getOccupancy(room._id);
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
    const availableBeds = totalCapacity - totalOccupancy;
    const rate = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;
    return { totalRooms, totalCapacity, totalOccupancy, availableBeds, rate };
  }, [rooms]);

  // Room type breakdown
  const roomsByType = useMemo(() => {
    const types = ["private", "double-sharing", "quadruple-sharing"];
    return types.map((type) => {
      const typeRooms = rooms.filter((r) => (r.type || r.roomType) === type);
      const capacity = typeRooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
      const occupied = typeRooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
      const rate = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
      return { type, count: typeRooms.length, capacity, occupied, rate };
    });
  }, [rooms]);

  // Summary items
  const summaryItems = [
    { label: "Total Rooms", value: stats.totalRooms, color: "blue" },
    { label: "Total Beds", value: stats.totalCapacity, color: "purple" },
    { label: "Occupied", value: stats.totalOccupancy, color: "orange" },
    { label: "Available", value: stats.availableBeds, color: "green" },
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
      label: "Occupied",
      render: (r) => (
        <span className="occupancy-occupied-count">{r.currentOccupancy || r.occupancy || 0}</span>
      ),
    },
    {
      key: "available",
      label: "Available",
      render: (r) => {
        const avail = (r.capacity || 0) - (r.currentOccupancy || r.occupancy || 0);
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
      label: "Status",
      render: (r) => {
        const rate = Math.round(((r.currentOccupancy || 0) / (r.capacity || 1)) * 100);
        const { label, variant } = getStatusLabel(rate);
        return <StatusBadge variant={variant}>{label}</StatusBadge>;
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
            Monitor real-time room occupancy across branches
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
          onClose={() => setShowRoomDetails(false)}
        />
      )}
    </section>
  );
}

export default OccupancyTrackingPage;
