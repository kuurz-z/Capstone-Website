import { useState, useEffect } from "react";
import { LayoutGrid, Settings, BarChart3 } from "lucide-react";

import RoomCard from "../components/RoomCard";
import RoomConfigurationPage from "./RoomConfigurationPage";
import OccupancyTrackingPage from "./OccupancyTrackingPage";
import { roomApi } from "../../../shared/api/apiClient";
import "../styles/admin-room-availability.css";

function RoomAvailabilityPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(null);
  const [activeTab, setActiveTab] = useState("availability");

  useEffect(() => {
    let isMounted = true;

    const normalizeType = (type) => {
      if (type === "private") return "Single";
      if (type === "double-sharing") return "Double";
      if (type === "quadruple-sharing") return "Quadruple";
      return "Unknown";
    };

    const fetchRooms = async () => {
      setRoomsLoading(true);
      setRoomsError(null);
      try {
        // Fetch rooms with real-time occupancy data
        const data = await roomApi.getAll();

        // Map rooms with currentOccupancy from confirmed reservations
        const mappedRooms = data.map((room) => ({
          id: room.roomNumber || room.name || "Unknown",
          floor: room.floor || 1,
          branch: room.branch || "unknown",
          type: normalizeType(room.type),
          beds: room.capacity || (room.beds ? room.beds.length : 0),
          // Use currentOccupancy which reflects confirmed/checked-in reservations
          occupied: room.currentOccupancy || 0,
          reserved: 0,
        }));

        if (isMounted) {
          setRooms(mappedRooms);
        }
      } catch (error) {
        console.error("Failed to fetch rooms:", error);
        if (isMounted) {
          setRoomsError("Failed to load rooms. Please try again.");
        }
      } finally {
        if (isMounted) {
          setRoomsLoading(false);
        }
      }
    };

    fetchRooms();

    // Set up auto-refresh every 30 seconds to get latest occupancy
    const refreshInterval = setInterval(fetchRooms, 30000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch = (room.id || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesBranch =
      branchFilter === "all" || room.branch === branchFilter;
    const matchesFloor =
      floorFilter === "all" || room.floor === Number(floorFilter);
    const matchesType =
      roomTypeFilter === "all" ||
      (room.type || "").toLowerCase() === roomTypeFilter;
    return matchesSearch && matchesBranch && matchesFloor && matchesType;
  });

  // Calculate stats
  const totalRooms = filteredRooms.length;
  const fullyOccupied = filteredRooms.filter(
    (r) => r.occupied === r.beds,
  ).length;
  const fullyAvailable = filteredRooms.filter(
    (r) => r.occupied === 0 && r.reserved === 0,
  ).length;
  const partial = totalRooms - fullyOccupied - fullyAvailable;
  const totalBeds = filteredRooms.reduce((sum, r) => sum + r.beds, 0);
  const occupiedBeds = filteredRooms.reduce((sum, r) => sum + r.occupied, 0);
  const reservedBeds = filteredRooms.reduce((sum, r) => sum + r.reserved, 0);
  const availableBeds = totalBeds - occupiedBeds - reservedBeds;
  const occupancyRate = totalBeds
    ? ((occupiedBeds / totalBeds) * 100).toFixed(1)
    : "0.0";

  // Group rooms by floor
  const floor1Rooms = filteredRooms.filter((r) => r.floor === 1);
  const floor2Rooms = filteredRooms.filter((r) => r.floor === 2);

  return (
    <div>
      <div className="room-availability-container">
        {/* Tab Navigation */}
        <div className="room-tabs">
          <button
            className={`room-tab ${activeTab === "availability" ? "active" : ""}`}
            onClick={() => setActiveTab("availability")}
          >
            <LayoutGrid size={15} /> Availability
          </button>
          <button
            className={`room-tab ${activeTab === "setup" ? "active" : ""}`}
            onClick={() => setActiveTab("setup")}
          >
            <Settings size={15} /> Setup
          </button>
          <button
            className={`room-tab ${activeTab === "occupancy" ? "active" : ""}`}
            onClick={() => setActiveTab("occupancy")}
          >
            <BarChart3 size={15} /> Occupancy
          </button>
        </div>

        {/* Availability Tab Content */}
        {activeTab === "availability" && (
          <>
            {/* Top Stats */}
            <div className="room-availability-top-stats">
              <div className="room-stat-card">
                <div className="room-stat-label">Total Rooms</div>
                <div className="room-stat-value">{totalRooms}</div>
              </div>
              <div className="room-stat-card room-stat-occupied">
                <div className="room-stat-label">Fully Occupied</div>
                <div className="room-stat-value">{fullyOccupied}</div>
              </div>
              <div className="room-stat-card room-stat-partial">
                <div className="room-stat-label">Partial</div>
                <div className="room-stat-value">{partial}</div>
              </div>
              <div className="room-stat-card room-stat-available">
                <div className="room-stat-label">Fully Available</div>
                <div className="room-stat-value">{fullyAvailable}</div>
              </div>
              <div className="room-stat-card room-stat-rate">
                <div className="room-stat-label">Occupancy Rate</div>
                <div className="room-stat-value">{occupancyRate}%</div>
              </div>
            </div>

            {/* Bed Stats */}
            <div className="room-availability-bed-stats">
              <div className="bed-stat-card">
                <div className="bed-stat-label">Total Beds</div>
                <div className="bed-stat-value">{totalBeds}</div>
              </div>
              <div className="bed-stat-card bed-stat-occupied">
                <div className="bed-stat-label">Occupied</div>
                <div className="bed-stat-value">{occupiedBeds}</div>
              </div>
              <div className="bed-stat-card bed-stat-reserved">
                <div className="bed-stat-label">Reserved</div>
                <div className="bed-stat-value">{reservedBeds}</div>
              </div>
              <div className="bed-stat-card bed-stat-available">
                <div className="bed-stat-label">Available</div>
                <div className="bed-stat-value">{availableBeds}</div>
              </div>
            </div>

            {/* Search */}
            <div className="room-availability-search-section">
              <div className="room-availability-search-wrapper">
                <svg
                  className="room-search-icon"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9.16667 15.8333C12.8486 15.8333 15.8333 12.8486 15.8333 9.16667C15.8333 5.48477 12.8486 2.5 9.16667 2.5C5.48477 2.5 2.5 5.48477 2.5 9.16667C2.5 12.8486 5.48477 15.8333 9.16667 15.8333Z"
                    stroke="#9CA3AF"
                    strokeWidth="1.66667"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17.5 17.5L13.875 13.875"
                    stroke="#9CA3AF"
                    strokeWidth="1.66667"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <input
                  type="text"
                  className="room-search-input"
                  placeholder="Search room or tenant..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="room-availability-filters">
                <select
                  className="room-availability-filter-select"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                >
                  <option value="all">All Branches</option>
                  <option value="gil-puyat">Gil Puyat</option>
                  <option value="guadalupe">Guadalupe</option>
                </select>
                <select
                  className="room-availability-filter-select"
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                >
                  <option value="all">All Floors</option>
                  <option value="1">Floor 1</option>
                  <option value="2">Floor 2</option>
                </select>
                <select
                  className="room-availability-filter-select"
                  value={roomTypeFilter}
                  onChange={(e) => setRoomTypeFilter(e.target.value)}
                >
                  <option value="all">All Room Types</option>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="quadruple">Quadruple</option>
                </select>
              </div>
            </div>

            {/* Legend */}
            <div className="room-legend">
              <div className="room-legend-title">Legend:</div>
              <div className="room-legend-items">
                <div className="room-legend-item">
                  <svg
                    className="room-legend-icon room-legend-available"
                    width="18"
                    height="18"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.66699 5.33331V26.6666"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 10.6667H26.667C27.3742 10.6667 28.0525 10.9476 28.5526 11.4477C29.0527 11.9478 29.3337 12.6261 29.3337 13.3334V26.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 22.6667H29.3337"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 10.6667V22.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Available</span>
                </div>
                <div className="room-legend-item">
                  <svg
                    className="room-legend-icon room-legend-reserved"
                    width="18"
                    height="18"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.66699 5.33331V26.6666"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 10.6667H26.667C27.3742 10.6667 28.0525 10.9476 28.5526 11.4477C29.0527 11.9478 29.3337 12.6261 29.3337 13.3334V26.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 22.6667H29.3337"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 10.6667V22.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Reserved</span>
                </div>
                <div className="room-legend-item">
                  <svg
                    className="room-legend-icon room-legend-occupied"
                    width="18"
                    height="18"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.66699 5.33331V26.6666"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 10.6667H26.667C27.3742 10.6667 28.0525 10.9476 28.5526 11.4477C29.0527 11.9478 29.3337 12.6261 29.3337 13.3334V26.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.66699 22.6667H29.3337"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 10.6667V22.6667"
                      stroke="currentColor"
                      strokeWidth="2.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Occupied</span>
                </div>
              </div>
            </div>

            {roomsLoading ? (
              <div className="room-availability-empty">Loading rooms...</div>
            ) : roomsError ? (
              <div className="room-availability-empty">{roomsError}</div>
            ) : (
              <>
                {/* Floor 1 */}
                <div className="room-floor-section">
                  <div className="room-floor-header">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2.25 6.75L9 2.25L15.75 6.75V15C15.75 15.3978 15.592 15.7794 15.3107 16.0607C15.0294 16.342 14.6478 16.5 14.25 16.5H3.75C3.35218 16.5 2.97064 16.342 2.68934 16.0607C2.40804 15.7794 2.25 15.3978 2.25 15V6.75Z"
                        stroke="#374151"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <h2 className="room-floor-title">Floor 1 - Gil Puyat</h2>
                  </div>
                  <div className="room-grid">
                    {floor1Rooms.length > 0 ? (
                      floor1Rooms.map((room) => (
                        <RoomCard key={room.id} room={room} />
                      ))
                    ) : (
                      <div className="room-availability-empty">
                        No rooms found.
                      </div>
                    )}
                  </div>
                </div>

                {/* Floor 2 */}
                <div className="room-floor-section">
                  <div className="room-floor-header">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2.25 6.75L9 2.25L15.75 6.75V15C15.75 15.3978 15.592 15.7794 15.3107 16.0607C15.0294 16.342 14.6478 16.5 14.25 16.5H3.75C3.35218 16.5 2.97064 16.342 2.68934 16.0607C2.40804 15.7794 2.25 15.3978 2.25 15V6.75Z"
                        stroke="#374151"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <h2 className="room-floor-title">Floor 2 - Gil Puyat</h2>
                  </div>
                  <div className="room-grid">
                    {floor2Rooms.length > 0 ? (
                      floor2Rooms.map((room) => (
                        <RoomCard key={room.id} room={room} />
                      ))
                    ) : (
                      <div className="room-availability-empty">
                        No rooms found.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Setup Tab */}
        {activeTab === "setup" && <RoomConfigurationPage isEmbedded={true} />}

        {/* Occupancy Tab */}
        {activeTab === "occupancy" && (
          <OccupancyTrackingPage isEmbedded={true} />
        )}
      </div>
    </div>
  );
}

export default RoomAvailabilityPage;
