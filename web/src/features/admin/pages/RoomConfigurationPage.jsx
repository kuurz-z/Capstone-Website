import { useState, useEffect } from "react";

import { roomApi } from "../../../shared/api/apiClient";
import "../styles/admin-room-configuration.css";

function RoomConfigurationPage({ isEmbedded = false }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingBed, setEditingBed] = useState(null);

  // Fetch rooms on mount
  useEffect(() => {
    let isMounted = true;

    const fetchRooms = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await roomApi.getAll();
        if (isMounted) {
          setRooms(data);
        }
      } catch (err) {
        console.error("Failed to fetch rooms:", err);
        if (isMounted) {
          setError("Failed to load room configurations");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchRooms();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter rooms
  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch =
      branchFilter === "all" || room.branch === branchFilter;
    const matchesType =
      roomTypeFilter === "all" || room.type === roomTypeFilter;
    return matchesSearch && matchesBranch && matchesType;
  });

  const getRoomTypeLabel = (type) => {
    if (type === "private") return "Private";
    if (type === "double-sharing") return "Double Sharing";
    if (type === "quadruple-sharing") return "Quadruple Sharing";
    return type;
  };

  const getBranchLabel = (branch) => {
    if (branch === "gil-puyat") return "Gil Puyat";
    if (branch === "guadalupe") return "Guadalupe";
    return branch;
  };

  const openRoomDetails = (room) => {
    setSelectedRoom(room);
    setShowDetailsModal(true);
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setEditingBed(null);
    setSelectedRoom(null);
  };

  const toggleBedAvailability = (bedId) => {
    if (!selectedRoom) return;

    const updatedBeds = selectedRoom.beds.map((bed) =>
      bed.id === bedId ? { ...bed, available: !bed.available } : bed,
    );

    setSelectedRoom({
      ...selectedRoom,
      beds: updatedBeds,
    });
  };

  if (loading) {
    const loadingHtml = (
      <div className="admin-section">
        <div className="admin-loading">Loading room configurations...</div>
      </div>
    );
    if (isEmbedded) return loadingHtml;
    return loadingHtml;
  }

  const pageContent = (
    <section className="admin-section">
      {!isEmbedded && (
        <div className="admin-section-header">
          <h1>Room & Bed Configuration</h1>
          <p className="admin-section-subtitle">
            Manage room properties and bed configurations
          </p>
        </div>
      )}

      {error && <div className="admin-error-message">{error}</div>}

      {/* Filters */}
      <div className="admin-filters">
        <div className="admin-filter-group">
          <label>Search by Room Number</label>
          <input
            type="text"
            placeholder="e.g., GP-P-001..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="admin-filter-input"
          />
        </div>

        <div className="admin-filter-group">
          <label>Branch</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="admin-filter-select"
          >
            <option value="all">All Branches</option>
            <option value="gil-puyat">Gil Puyat</option>
            <option value="guadalupe">Guadalupe</option>
          </select>
        </div>

        <div className="admin-filter-group">
          <label>Room Type</label>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value)}
            className="admin-filter-select"
          >
            <option value="all">All Types</option>
            <option value="private">Private</option>
            <option value="double-sharing">Double Sharing</option>
            <option value="quadruple-sharing">Quadruple Sharing</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards">
        <div className="stat-card">
          <h3>Total Rooms</h3>
          <p className="stat-value">{rooms.length}</p>
        </div>
        <div className="stat-card">
          <h3>Total Beds</h3>
          <p className="stat-value">
            {rooms.reduce((sum, r) => sum + (r.beds?.length || 0), 0)}
          </p>
        </div>
        <div className="stat-card">
          <h3>Occupied Beds</h3>
          <p className="stat-value">
            {rooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0)}
          </p>
        </div>
        <div className="stat-card">
          <h3>Available Rooms</h3>
          <p className="stat-value">
            {rooms.filter((r) => r.available).length}
          </p>
        </div>
      </div>

      {/* Room Grid */}
      <div className="room-config-grid">
        {filteredRooms.length > 0 ? (
          filteredRooms.map((room) => (
            <div key={room._id} className="room-config-card">
              <div className="room-config-header">
                <h3>{room.name}</h3>
                <span
                  className={`room-status-badge ${room.available ? "available" : "unavailable"}`}
                >
                  {room.available ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="room-config-details">
                <p>
                  <strong>Type:</strong> {getRoomTypeLabel(room.type)}
                </p>
                <p>
                  <strong>Branch:</strong> {getBranchLabel(room.branch)}
                </p>
                <p>
                  <strong>Capacity:</strong> {room.capacity} pax
                </p>
                <p>
                  <strong>Floor:</strong> {room.floor}
                </p>
                <p>
                  <strong>Beds:</strong> {room.beds?.length || 0}
                </p>
                <p>
                  <strong>Occupied:</strong> {room.currentOccupancy || 0} /{" "}
                  {room.capacity}
                </p>
              </div>

              <button
                className="btn-config"
                onClick={() => openRoomDetails(room)}
              >
                Configure Beds
              </button>
            </div>
          ))
        ) : (
          <div className="admin-empty-state">
            <p>No rooms found matching your filters</p>
          </div>
        )}
      </div>

      {/* Room Configuration Modal */}
      {showDetailsModal && selectedRoom && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2>Configure Room: {selectedRoom.name}</h2>
              <button
                className="modal-close-btn"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="room-info-section">
                <h3>Room Information</h3>
                <div className="info-grid">
                  <div>
                    <strong>Type:</strong> {getRoomTypeLabel(selectedRoom.type)}
                  </div>
                  <div>
                    <strong>Capacity:</strong> {selectedRoom.capacity} pax
                  </div>
                  <div>
                    <strong>Floor:</strong> {selectedRoom.floor}
                  </div>
                  <div>
                    <strong>Branch:</strong>{" "}
                    {getBranchLabel(selectedRoom.branch)}
                  </div>
                </div>
              </div>

              <div className="bed-config-section">
                <h3>Bed Configuration</h3>
                <div className="bed-list">
                  {selectedRoom.beds && selectedRoom.beds.length > 0 ? (
                    selectedRoom.beds.map((bed, index) => (
                      <div key={bed.id || index} className="bed-item">
                        <div className="bed-info">
                          <strong>{bed.id}</strong>
                          <span className="bed-position">
                            Position: {bed.position}
                          </span>
                        </div>
                        <div className="bed-status">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={bed.available}
                              onChange={() => toggleBedAvailability(bed.id)}
                            />
                            <span>
                              {bed.available ? "Available" : "Occupied"}
                            </span>
                          </label>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-beds">No beds configured</p>
                  )}
                </div>
              </div>

              <div className="occupancy-info">
                <h3>Current Occupancy</h3>
                <div className="occupancy-bar">
                  <div
                    className="occupancy-fill"
                    style={{
                      width: `${(selectedRoom.currentOccupancy / selectedRoom.capacity) * 100}%`,
                    }}
                  />
                </div>
                <p>
                  {selectedRoom.currentOccupancy} of {selectedRoom.capacity}{" "}
                  beds occupied
                </p>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={closeModal}>
                Close
              </button>
              <button className="btn-primary" onClick={closeModal}>
                Save Changes
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
export default RoomConfigurationPage;
