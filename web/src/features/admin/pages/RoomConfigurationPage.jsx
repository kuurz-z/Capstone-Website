import { useState, useEffect } from "react";
import { roomApi } from "../../../shared/api/apiClient";
import { formatRoomType, formatBranch } from "../utils/formatters";

import RoomConfigGrid from "../components/rooms/RoomConfigGrid";
import RoomConfigModal from "../components/rooms/RoomConfigModal";
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

  useEffect(() => {
    let isMounted = true;
    const fetchRooms = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await roomApi.getAll();
        if (isMounted) setRooms(data);
      } catch (err) {
        console.error("Failed to fetch rooms:", err);
        if (isMounted) setError("Failed to load room configurations");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchRooms();
    return () => {
      isMounted = false;
    };
  }, []);

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

  const openRoomDetails = (room) => {
    setSelectedRoom(room);
    setShowDetailsModal(true);
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedRoom(null);
  };

  const toggleBedAvailability = (bedId) => {
    if (!selectedRoom) return;
    const updatedBeds = selectedRoom.beds.map((bed) =>
      bed.id === bedId ? { ...bed, available: !bed.available } : bed,
    );
    setSelectedRoom({ ...selectedRoom, beds: updatedBeds });
  };

  if (loading) {
    return (
      <div className="admin-section">
        <div className="admin-loading">Loading room configurations...</div>
      </div>
    );
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

      <RoomConfigGrid rooms={filteredRooms} onConfigureRoom={openRoomDetails} />

      {showDetailsModal && selectedRoom && (
        <RoomConfigModal
          room={selectedRoom}
          onToggleBed={toggleBedAvailability}
          onClose={closeModal}
        />
      )}
    </section>
  );

  return pageContent;
}

export default RoomConfigurationPage;
