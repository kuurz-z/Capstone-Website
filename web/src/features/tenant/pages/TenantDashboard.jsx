import "../styles/tenant-dashboard.css";
import { useState } from "react";

function TenantDashboard() {
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [selectedRoomType, setSelectedRoomType] = useState("All");
  const availableRooms = [
    {
      id: "GP-100",
      title: "Room GP-100",
      branch: "Gil Puyat",
      type: "Single",
      occupancy: "1/1",
      bedsLeft: "1 bed left",
      price: 8000,
      image: require("../../../assets/images/gpuyat/standard-room.jpg"),
      amenities: ["Wi-Fi", "Air Conditioning", "Study Desk"],
    },
    {
      id: "GP-101",
      title: "Room GP-101",
      branch: "Gil Puyat",
      type: "Shared",
      occupancy: "1/2",
      bedsLeft: "1 bed left",
      price: 5500,
      image: require("../../../assets/images/gpuyat/premium-room.jpg"),
      amenities: ["Wi-Fi", "Air Conditioning", "Study Desk"],
    },
    {
      id: "GP-102",
      title: "Room GP-102",
      branch: "Gil Puyat",
      type: "Shared",
      occupancy: "2/4",
      bedsLeft: "2 beds left",
      price: 4500,
      image: require("../../../assets/images/gpuyat/gallery1.jpg"),
      amenities: ["Wi-Fi", "Air Conditioning", "Study Desk"],
    },
    {
      id: "MK-202",
      title: "Room MK-202",
      branch: "Makati",
      type: "Shared",
      occupancy: "0/2",
      bedsLeft: "2 beds left",
      price: 6000,
      image: require("../../../assets/images/gpuyat/deluxe-room.jpg"),
      amenities: ["Wi-Fi", "Air Conditioning", "Study Desk"],
    },
    {
      id: "MK-203",
      title: "Room MK-203",
      branch: "Makati",
      type: "Shared",
      occupancy: "1/3",
      bedsLeft: "2 beds left",
      price: 5000,
      image: require("../../../assets/images/gpuyat/standard-room.jpg"),
      amenities: ["Wi-Fi", "Air Conditioning", "Study Desk"],
    },
  ];

  const upcomingRoom = {
    id: "MK-201",
    title: "Room MK-201",
    branch: "Makati",
    type: "Single",
    price: 8500,
    availableFrom: "March 15, 2026",
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    filterRooms(value, selectedBranch, selectedRoomType);
  };

  const handleBranchFilter = (branch) => {
    setSelectedBranch(branch);
    filterRooms(searchTerm, branch, selectedRoomType);
  };

  const handleRoomTypeFilter = (type) => {
    setSelectedRoomType(type);
    filterRooms(searchTerm, selectedBranch, type);
  };

  const filterRooms = (search, branch, roomType) => {
    let filtered = availableRooms;

    // Filter by search term
    if (search.trim()) {
      filtered = filtered.filter(
        (room) =>
          room.title.toLowerCase().includes(search.toLowerCase()) ||
          room.branch.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter by branch
    if (branch !== "All") {
      filtered = filtered.filter((room) => room.branch === branch);
    }

    // Filter by room type
    if (roomType !== "All") {
      filtered = filtered.filter((room) => room.type === roomType);
    }

    setFilteredRooms(filtered);
  };

  const handleScheduleVisit = (roomId) => {
    // TODO: Implement the schedule visit functionality
  };

  // Initialize filtered rooms on component mount
  const displayRooms = searchTerm || selectedBranch !== "All" || selectedRoomType !== "All" 
    ? filteredRooms 
    : availableRooms;

  return (
    <div className="tenant-dashboard-page">
      <div className="tenant-dashboard-container">
        <h1 className="tenant-dashboard-title">Find Your Perfect Room</h1>
        <p className="tenant-dashboard-subtitle">
          Browse available rooms at Lilycrest dormitories
        </p>

        <div className="tenant-dashboard-search-row">
          <div className="tenant-dashboard-search">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.16667 16.6667C13.3088 16.6667 16.6667 13.3088 16.6667 9.16667C16.6667 5.02453 13.3088 1.66667 9.16667 1.66667C5.02453 1.66667 1.66667 5.02453 1.66667 9.16667C1.66667 13.3088 5.02453 16.6667 9.16667 16.6667Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M18.3333 18.3333L14.7083 14.7083" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input 
              type="text" 
              placeholder="Search by room number or branch..." 
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <button className="tenant-dashboard-filter-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 3.5H14M4.5 8H11.5M6.5 12.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Filters
          </button>
        </div>

        <div className="tenant-dashboard-filters">
          <div className="tenant-dashboard-filter-group">
            <span className="tenant-dashboard-filter-label">Branch</span>
            <button 
              className={`tenant-dashboard-pill ${selectedBranch === "All" ? "active" : ""}`} 
              type="button"
              onClick={() => handleBranchFilter("All")}
            >All</button>
            <button 
              className={`tenant-dashboard-pill ${selectedBranch === "Gil Puyat" ? "active" : ""}`} 
              type="button"
              onClick={() => handleBranchFilter("Gil Puyat")}
            >Gil Puyat</button>
            <button 
              className={`tenant-dashboard-pill ${selectedBranch === "Makati" ? "active" : ""}`} 
              type="button"
              onClick={() => handleBranchFilter("Makati")}
            >Makati</button>
          </div>
          <div className="tenant-dashboard-filter-group">
            <span className="tenant-dashboard-filter-label">Room Type</span>
            <button 
              className={`tenant-dashboard-pill ${selectedRoomType === "All" ? "active" : ""}`} 
              type="button"
              onClick={() => handleRoomTypeFilter("All")}
            >All</button>
            <button 
              className={`tenant-dashboard-pill ${selectedRoomType === "Single" ? "active" : ""}`} 
              type="button"
              onClick={() => handleRoomTypeFilter("Single")}
            >Single</button>
            <button 
              className={`tenant-dashboard-pill ${selectedRoomType === "Shared" ? "active" : ""}`} 
              type="button"
              onClick={() => handleRoomTypeFilter("Shared")}
            >Shared</button>
          </div>
        </div>

        <section className="tenant-dashboard-section">
          <h2>Available Now</h2>
          <p>{displayRooms.length} rooms ready for immediate move-in</p>
          <div className="tenant-dashboard-grid">
            {displayRooms.map((room) => (
              <article key={room.id} className="tenant-room-card">
                <div className="tenant-room-image">
                  <img src={room.image} alt={room.title} />
                  <span className="tenant-room-badge">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.5 6L5 7.5L8.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Available
                  </span>
                </div>
                <div className="tenant-room-content">
                  <div className="tenant-room-title">
                    <h3>{room.title}</h3>
                    <span className="tenant-room-type">{room.type}</span>
                  </div>
                  <div className="tenant-room-meta">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 1C3.791 1 2 2.791 2 5C2 7.209 6 11 6 11C6 11 10 7.209 10 5C10 2.791 8.209 1 6 1Z" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="6" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    {room.branch}
                  </div>
                  <div className="tenant-room-stats">
                    <span>{room.occupancy}</span>
                    <span>{room.bedsLeft}</span>
                  </div>
                  <div className="tenant-room-tags">
                    {room.amenities.map((amenity) => (
                      <span key={amenity} className="tenant-room-tag">{amenity}</span>
                    ))}
                  </div>
                  <div className="tenant-room-footer">
                    <div className="tenant-room-price">
                      ₱{room.price.toLocaleString()}
                      <span>/month</span>
                    </div>
                    <button 
                      className="tenant-room-cta" 
                      type="button"
                      onClick={() => handleScheduleVisit(room.id)}
                    >
                      Schedule a Visit
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 6H9" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M7 3L9 6L7 9" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="tenant-dashboard-section">
          <h2>Coming Soon</h2>
          <p>Rooms that will be available soon</p>
          <div className="tenant-dashboard-grid">
            <article className="tenant-room-upcoming">
              <div className="tenant-room-upcoming-header">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="4" width="14" height="13" rx="2" stroke="white" strokeWidth="1.4" />
                  <path d="M6 2V6" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M14 2V6" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <div>
                  <div>Available from</div>
                  <strong>{upcomingRoom.availableFrom}</strong>
                </div>
              </div>
              <div className="tenant-room-upcoming-body">
                <div className="tenant-room-title">
                  <h3>{upcomingRoom.title}</h3>
                  <span className="tenant-room-type">{upcomingRoom.type}</span>
                </div>
                <div className="tenant-room-meta">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 1C3.791 1 2 2.791 2 5C2 7.209 6 11 6 11C6 11 10 7.209 10 5C10 2.791 8.209 1 6 1Z" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="6" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  {upcomingRoom.branch}
                </div>
                <div className="tenant-room-footer">
                  <div className="tenant-room-price">
                    ₱{upcomingRoom.price.toLocaleString()}
                    <span>/month</span>
                  </div>
                  <button className="tenant-room-cta" type="button" disabled>
                    Get Notified
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

export default TenantDashboard;
