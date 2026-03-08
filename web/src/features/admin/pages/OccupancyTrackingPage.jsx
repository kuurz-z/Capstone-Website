import { useState, useEffect } from "react";
import { BedDouble, Unlock, X } from "lucide-react";

import { roomApi } from "../../../shared/api/apiClient";
import "../styles/admin-occupancy-tracking.css";

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
        // Fetch detailed occupancy statistics from new API
        const response = await roomApi.getBranchOccupancy(
          branchFilter === "all" ? null : branchFilter,
        );

        // Handle API response structure
        const stats = response?.statistics || response;

        if (isMounted) {
          setOccupancyStats(stats);
          setRooms(stats.rooms || []);
        }
      } catch (err) {
        console.error("Failed to fetch occupancy data:", err);

        // Fallback: Fetch all rooms if API fails
        try {
          const data = await roomApi.getAll();
          if (isMounted) {
            setRooms(data);
          }
        } catch (fallbackErr) {
          console.error("Fallback fetch failed:", fallbackErr);
          if (isMounted) {
            setError("Failed to load occupancy data");
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOccupancyData();

    // Auto-refresh every 30 seconds to get latest occupancy
    const refreshInterval = setInterval(fetchOccupancyData, 30000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [branchFilter]);

  // Handle viewing room details
  const handleViewRoomDetails = async (room) => {
    setLoadingRoomDetails(true);
    setShowRoomDetails(true);
    setSelectedRoom(room);

    try {
      // Fetch detailed occupancy data for this specific room
      const detailedData = await roomApi.getOccupancy(room._id);
      setSelectedRoom(detailedData);
    } catch (err) {
      console.error("Failed to fetch room details:", err);
      // Keep basic room data if detailed fetch fails
    } finally {
      setLoadingRoomDetails(false);
    }
  };

  // Use either occupancy stats or fallback calculations
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

  // Group rooms by type
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

  const getRoomTypeLabel = (type) => {
    if (type === "private") return "Private";
    if (type === "double-sharing") return "Double Sharing";
    if (type === "quadruple-sharing") return "Quadruple Sharing";
    return type;
  };

  const getOccupancyColor = (occupied, capacity) => {
    if (capacity === 0) return "#10b981";
    const rate = (occupied / capacity) * 100;
    if (rate === 0) return "#10b981"; // green - empty
    if (rate < 50) return "#0F4A7F"; // blue - low
    if (rate < 100) return "#f59e0b"; // amber - high
    return "#ef4444"; // red - full
  };

  const getRoomOccupancyRate = (room) => {
    const capacity = room.capacity || 1;
    const occupied = room.currentOccupancy || room.occupancy || 0;
    return Math.round((occupied / capacity) * 100);
  };

  if (loading) {
    const loadingHtml = (
      <div className="admin-section">
        <div className="admin-loading">Loading occupancy data...</div>
      </div>
    );
    if (isEmbedded) return loadingHtml;
    return loadingHtml;
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
                <h3>{getRoomTypeLabel(type)}</h3>
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

      {/* Rooms Table */}
      <div className="rooms-table-section">
        <h2>Room Details</h2>
        <div className="table-wrapper">
          <table className="occupancy-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Occupied</th>
                <th>Available</th>
                <th>Occupancy Rate</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRooms.length > 0 ? (
                displayRooms.map((room) => {
                  const capacity = room.capacity || 1;
                  const occupied = room.currentOccupancy || room.occupancy || 0;
                  const occupancyRate = Math.round((occupied / capacity) * 100);
                  const statusColor = getOccupancyColor(occupied, capacity);

                  return (
                    <tr key={room._id || room.roomName}>
                      <td className="room-name">
                        {room.name || room.roomName}
                      </td>
                      <td>{getRoomTypeLabel(room.type || room.roomType)}</td>
                      <td>{capacity}</td>
                      <td>
                        <span className="occupied-badge">{occupied}</span>
                      </td>
                      <td>
                        <span className="available-badge">
                          {capacity - occupied}
                        </span>
                      </td>
                      <td>
                        <div className="occupancy-cell">
                          <div className="mini-bar">
                            <div
                              className="mini-fill"
                              style={{
                                width: `${occupancyRate}%`,
                                background: statusColor,
                              }}
                            />
                          </div>
                          <span>{occupancyRate}%</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: statusColor,
                            color: "white",
                          }}
                        >
                          {occupancyRate === 0
                            ? "Empty"
                            : occupancyRate < 50
                              ? "Low"
                              : occupancyRate < 100
                                ? "High"
                                : "Full"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="detail-btn"
                          onClick={() => handleViewRoomDetails(room)}
                          title="View room details and occupied beds"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="table-empty">
                    No rooms found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Room Details Modal */}
      {showRoomDetails && selectedRoom && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>
                {selectedRoom.name || selectedRoom.roomName} - Bed Assignment
                Details
              </h2>
              <button
                className="close-btn"
                onClick={() => setShowRoomDetails(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {loadingRoomDetails ? (
                <div className="modal-loading">
                  <p>Loading bed details...</p>
                </div>
              ) : (
                <>
                  <div className="details-grid">
                    <div className="detail-item">
                      <label>Room Type:</label>
                      <span>
                        {getRoomTypeLabel(
                          selectedRoom.type || selectedRoom.roomType,
                        )}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>Capacity:</label>
                      <span>{selectedRoom.capacity || 0} beds</span>
                    </div>
                    <div className="detail-item">
                      <label>Current Occupancy:</label>
                      <span>
                        {selectedRoom.currentOccupancy ||
                          selectedRoom.occupancy ||
                          0}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>Occupancy Rate:</label>
                      <span>
                        {Math.round(
                          ((selectedRoom.currentOccupancy ||
                            selectedRoom.occupancy ||
                            0) /
                            (selectedRoom.capacity || 1)) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                  </div>

                  {/* Occupied Beds */}
                  {selectedRoom.occupiedBeds &&
                  selectedRoom.occupiedBeds.length > 0 ? (
                    <div className="occupied-beds-section">
                      <h3>Occupied Beds</h3>
                      <div className="beds-list">
                        {selectedRoom.occupiedBeds.map((bed, idx) => (
                          <div key={idx} className="bed-item occupied">
                            <div className="bed-icon">
                              <BedDouble size={22} />
                            </div>
                            <div className="bed-info">
                              <h4>
                                {bed.position.charAt(0).toUpperCase() +
                                  bed.position.slice(1)}{" "}
                                ({bed.bedId})
                              </h4>
                              <p>
                                Resident:{" "}
                                {bed.occupiedBy?.userName || "Unknown"}
                              </p>
                              {bed.occupiedBy?.email && (
                                <p>Email: {bed.occupiedBy.email}</p>
                              )}
                              {bed.occupiedBy?.occupiedSince && (
                                <p className="small-text">
                                  Since:{" "}
                                  {new Date(
                                    bed.occupiedBy.occupiedSince,
                                  ).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Available Beds */}
                  {selectedRoom.availableBeds &&
                  selectedRoom.availableBeds.length > 0 ? (
                    <div className="available-beds-section">
                      <h3>
                        Available Beds ({selectedRoom.availableBeds.length})
                      </h3>
                      <div className="beds-list">
                        {selectedRoom.availableBeds.map((bed, idx) => (
                          <div key={idx} className="bed-item available">
                            <div className="bed-icon">
                              <Unlock size={22} />
                            </div>
                            <div className="bed-info">
                              <h4>
                                {bed.position.charAt(0).toUpperCase() +
                                  bed.position.slice(1)}{" "}
                                ({bed.bedId})
                              </h4>
                              <p className="available-text">
                                Available for booking
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!selectedRoom.occupiedBeds && !selectedRoom.availableBeds ? (
                    <p className="info-text">
                      No detailed bed information available for this room.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowRoomDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (isEmbedded) {
    return pageContent;
  }

  return pageContent;
}

export default OccupancyTrackingPage;
