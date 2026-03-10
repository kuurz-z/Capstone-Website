import { useState, useEffect } from "react";
import { roomApi } from "../../../shared/api/apiClient";
import { formatRoomType } from "../utils/formatters";

import OccupancyRoomTable from "../components/occupancy/OccupancyRoomTable";
import OccupancyRoomModal from "../components/occupancy/OccupancyRoomModal";
import "../styles/admin-occupancy-tracking.css";

function getOccupancyColor(occupied, capacity) {
  if (capacity === 0) return "#10b981";
  const rate = (occupied / capacity) * 100;
  if (rate === 0) return "#10b981";
  if (rate < 50) return "#0F4A7F";
  if (rate < 100) return "#f59e0b";
  return "#ef4444";
}

function OccupancyTrackingPage({ isEmbedded = false }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [occupancyStats, setOccupancyStats] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);

  // Fetch occupancy data
  useEffect(() => {
    let isMounted = true;
    const fetchOccupancyData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await roomApi.getBranchOccupancy(
          branchFilter === "all" ? null : branchFilter,
        );
        const stats = response?.statistics || response;
        if (isMounted) {
          setOccupancyStats(stats);
          setRooms(stats.rooms || []);
        }
      } catch (err) {
        console.error("Failed to fetch occupancy data:", err);
        try {
          const data = await roomApi.getAll();
          if (isMounted) setRooms(data);
        } catch (fallbackErr) {
          console.error("Fallback fetch failed:", fallbackErr);
          if (isMounted) setError("Failed to load occupancy data");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOccupancyData();
    const refreshInterval = setInterval(fetchOccupancyData, 30000);
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [branchFilter]);

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

  const displayRooms = rooms;
  const stats = occupancyStats || {
    branch: branchFilter,
    totalRooms: displayRooms.length,
    totalCapacity: displayRooms.reduce((sum, r) => sum + (r.capacity || 0), 0),
    totalOccupancy: displayRooms.reduce(
      (sum, r) => sum + (r.currentOccupancy || 0),
      0,
    ),
    overallOccupancyRate: displayRooms.length
      ? `${Math.round(
          (displayRooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0) /
            displayRooms.reduce((sum, r) => sum + (r.capacity || 0), 0)) *
            100,
        )}%`
      : "0%",
  };

  const roomsByType = {
    private: displayRooms.filter(
      (r) => r.type === "private" || r.roomType === "private",
    ),
    "double-sharing": displayRooms.filter(
      (r) => r.type === "double-sharing" || r.roomType === "double-sharing",
    ),
    "quadruple-sharing": displayRooms.filter(
      (r) =>
        r.type === "quadruple-sharing" || r.roomType === "quadruple-sharing",
    ),
  };

  if (loading) {
    return (
      <div className="admin-section">
        <div className="admin-loading">Loading occupancy data...</div>
      </div>
    );
  }

  const pageContent = (
    <section className="admin-section">
      {!isEmbedded && (
        <div className="admin-section-header">
          <h1>Occupancy Tracking</h1>
          <p className="admin-section-subtitle">
            Monitor real-time room occupancy across branches
          </p>
        </div>
      )}

      {error && <div className="admin-error-message">{error}</div>}

      {/* Branch Filter */}
      <div className="occupancy-filters">
        <div className="filter-group">
          <label>Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Branches</option>
            <option value="gil-puyat">Gil Puyat</option>
            <option value="guadalupe">Guadalupe</option>
          </select>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="occupancy-overview">
        <div className="stat-card">
          <h3>Total Rooms</h3>
          <p className="stat-value">{stats.totalRooms}</p>
        </div>
        <div className="stat-card">
          <h3>Total Capacity</h3>
          <p className="stat-value">
            {stats.totalCapacity} bed{stats.totalCapacity !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="stat-card">
          <h3>Occupied</h3>
          <p className="stat-value">
            {stats.totalOccupancy || stats.totalOccupied || 0} bed
            {(stats.totalOccupancy || stats.totalOccupied || 0) !== 1
              ? "s"
              : ""}
          </p>
        </div>
        <div className="stat-card">
          <h3>Available</h3>
          <p className="stat-value">
            {(stats.totalCapacity || 0) -
              (stats.totalOccupancy || stats.totalOccupied || 0)}{" "}
            bed
            {(stats.totalCapacity || 0) -
              (stats.totalOccupancy || stats.totalOccupied || 0) !==
            1
              ? "s"
              : ""}
          </p>
        </div>
        <div className="stat-card highlight">
          <h3>Occupancy Rate</h3>
          <p className="stat-value">{stats.overallOccupancyRate}</p>
        </div>
      </div>

      {/* Overall Occupancy Bar */}
      <div className="overall-occupancy">
        <h3>Overall Occupancy</h3>
        <div className="occupancy-bar">
          {(() => {
            const occupiedCount =
              stats.totalOccupancy || stats.totalOccupied || 0;
            const rate = stats.totalCapacity
              ? Math.round((occupiedCount / stats.totalCapacity) * 100)
              : 0;
            return (
              <div
                className="occupancy-fill"
                style={{
                  width: `${rate}%`,
                  background:
                    rate === 0
                      ? "#10b981"
                      : rate < 50
                        ? "#0F4A7F"
                        : rate < 100
                          ? "#f59e0b"
                          : "#ef4444",
                }}
              />
            );
          })()}
        </div>
      </div>

      {/* Room Type Breakdown */}
      <div className="room-type-breakdown">
        <h2>Room Type Analysis</h2>
        <div className="type-cards">
          {Object.entries(roomsByType).map(([type, typeRooms]) => {
            const typeCapacity = typeRooms.reduce(
              (sum, r) => sum + r.capacity,
              0,
            );
            const typeOccupied = typeRooms.reduce(
              (sum, r) => sum + r.currentOccupancy,
              0,
            );
            const typeRate = typeCapacity
              ? Math.round((typeOccupied / typeCapacity) * 100)
              : 0;
            return (
              <div key={type} className="type-card">
                <h3>{formatRoomType(type)}</h3>
                <p className="type-count">
                  {typeRooms.length} room{typeRooms.length !== 1 ? "s" : ""}
                </p>
                <div className="type-occupancy-bar">
                  <div
                    className="occupancy-fill"
                    style={{
                      width: `${typeRate}%`,
                      background: getOccupancyColor(typeOccupied, typeCapacity),
                    }}
                  />
                </div>
                <p className="occupancy-text">
                  {typeOccupied} / {typeCapacity} ({typeRate}%)
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Room Table */}
      <OccupancyRoomTable
        rooms={displayRooms}
        onViewDetails={handleViewRoomDetails}
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

  return pageContent;
}

export default OccupancyTrackingPage;
