import { useState, useMemo, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { digitalTwinApi } from "../../../shared/api/digitalTwinApi";
import { formatRoomType, formatBranch } from "../utils/formatters";
import { useDigitalTwinSnapshot } from "../../../shared/hooks/queries/useDigitalTwin";

import OccupancyRoomModal from "../components/occupancy/OccupancyRoomModal";

/* ── Helpers ────────────────────────────────────── */
function getOccupancyColor(occupied, capacity) {
  if (capacity === 0) return "var(--status-success)";
  const rate = (occupied / capacity) * 100;
  if (rate === 0) return "var(--status-success)";
  if (rate < 50) return "var(--accent-blue)";
  if (rate < 100) return "var(--status-warning)";
  return "var(--status-error)";
}

function getReadinessState(room) {
  const status = String(room.readinessStatus || "").toLowerCase();

  if (status === "ready" || status === "pending" || status === "unknown") {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (status === "maintenance" || status === "reserved" || status === "mixed") {
    return "Pending";
  }

  if (status === "occupied") {
    return "Ready";
  }

  if (status === "available") {
    return "Unknown";
  }

  return room.available ? "Unknown" : "Ready";
}

function getReadinessConfig(readiness) {
  if (readiness === "Ready") {
    return {
      dot: "bg-green-500",
      text: "text-green-600",
    };
  }

  if (readiness === "Pending") {
    return {
      dot: "bg-amber-500",
      text: "text-warning-dark",
    };
  }

  return {
    dot: "bg-slate-400",
    text: "text-muted-foreground",
  };
}

function formatNextVacancy(forecast) {
  if (!forecast?.nextExpectedVacancy) return "No forecast";
  return new Date(forecast.nextExpectedVacancy).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/* ── Component ──────────────────────────────────── */
function OccupancyTrackingPage({ isEmbedded = false }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ROOMS_PER_PAGE = 10;

  const branch = branchFilter === "all" ? "all" : branchFilter;
  const { data: snapshot, isLoading: loading, error: queryError } = useDigitalTwinSnapshot(branch);
  const error = queryError ? "Failed to load occupancy data" : null;
  const rooms = snapshot?.rooms || [];

  useEffect(() => {
    setCurrentPage(1);
  }, [branchFilter]);

  const handleViewRoomDetails = async (room) => {
    setLoadingRoomDetails(true);
    setShowRoomDetails(true);
    setSelectedRoom({ room, beds: room.beds || [] });
    try {
      const detailedData = await digitalTwinApi.getRoomDetail(room._id);
      setSelectedRoom({
        ...detailedData,
        room: detailedData?.room || room,
        beds: detailedData?.beds || room.beds || [],
      });
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
    const totalOccupancy = rooms.reduce(
      (sum, r) => sum + (r.currentOccupancy || 0),
      0,
    );
    const availableBeds = rooms.reduce((sum, room) => {
      const available = Array.isArray(room.beds)
        ? room.beds.filter((bed) => bed.status === "available").length
        : Math.max((room.capacity || 0) - (room.currentOccupancy || 0), 0);
      return sum + available;
    }, 0);
    const rate =
      totalCapacity > 0
        ? Math.round((totalOccupancy / totalCapacity) * 100)
        : 0;
    return { totalRooms, totalCapacity, totalOccupancy, availableBeds, rate };
  }, [rooms]);

  // Room type breakdown
  const roomsByType = useMemo(() => {
    const types = ["private", "double-sharing", "quadruple-sharing"];
    return types.map((type) => {
      const typeRooms = rooms.filter((r) => r.type === type);
      const capacity = typeRooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
      const occupied = typeRooms.reduce(
        (sum, r) => sum + (r.currentOccupancy || 0),
        0,
      );
      const rate = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
      return { type, count: typeRooms.length, capacity, occupied, rate };
    });
  }, [rooms]);

  // Summary items
  const summaryItems = [
    { label: "Total Rooms", value: stats.totalRooms, color: "blue" },
    { label: "Total Beds", value: stats.totalCapacity, color: "purple" },
    { label: "Committed", value: stats.totalOccupancy, color: "orange" },
    { label: "Available Beds", value: stats.availableBeds, color: "green" },
    { label: "Occupancy Rate", value: `${stats.rate}%`, color: "red" },
  ];

    return {
      private: privateType,
      double: doubleType,
      quad: quadType,
    };
  }, [roomsByType]);

  const roomTypeChartData = useMemo(
    () => [
      {
        name: "Private",
        occupied: roomTypeStats.private.occupied,
        available: Math.max(
          roomTypeStats.private.capacity - roomTypeStats.private.occupied,
          0,
        ),
      },
      {
        name: "Double",
        occupied: roomTypeStats.double.occupied,
        available: Math.max(
          roomTypeStats.double.capacity - roomTypeStats.double.occupied,
          0,
        ),
      },
      {
        name: "Quad",
        occupied: roomTypeStats.quad.occupied,
        available: Math.max(
          roomTypeStats.quad.capacity - roomTypeStats.quad.occupied,
          0,
        ),
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
      <div className="rounded-lg border border-[var(--border-card)] bg-[var(--surface-card)] p-8 text-center text-sm text-muted-foreground">
        Loading occupancy data...
      </div>
    );
  }

  return (
    <section className="occupancy-tracking-section">
      {!isEmbedded && (
        <div className="admin-section-header">
          <h1>Occupancy Tracking</h1>
          <p className="admin-section-subtitle">
            Monitor committed occupancy, live bed status, and remaining capacity.
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
        exportable={true}
        exportFilename="Occupancy_Tracking"
        exportTitle="Occupancy Tracking Export"
        pagination={{
          page: currentPage,
          pageSize: ROOMS_PER_PAGE,
          total: rooms.length,
          onPageChange: setCurrentPage,
        }}
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
