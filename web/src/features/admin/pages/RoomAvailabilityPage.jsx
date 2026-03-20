import { useState, useMemo } from "react";
import { LayoutGrid, Settings, BarChart3, BedDouble } from "lucide-react";

import RoomCard from "../components/RoomCard";
import RoomConfigurationPage from "./RoomConfigurationPage";
import OccupancyTrackingPage from "./OccupancyTrackingPage";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { PageShell, SummaryBar, ActionBar, EmptyState } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-room-availability.css";

function RoomAvailabilityPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const { can } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState(
    isSuperAdmin ? "all" : (user?.branch || "all")
  );
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("availability");

  const { data: rawRooms = [], isLoading: roomsLoading, error: roomsQueryError } = useRooms();
  const roomsError = roomsQueryError ? "Failed to load rooms. Please try again." : null;

  const normalizeType = (type) => {
    if (type === "private") return "Single";
    if (type === "double-sharing") return "Double";
    if (type === "quadruple-sharing") return "Quadruple";
    return "Unknown";
  };

  const rooms = useMemo(
    () =>
      rawRooms.map((room) => ({
        id: room.roomNumber || room.name || "Unknown",
        floor: room.floor || 1,
        branch: room.branch || "unknown",
        type: normalizeType(room.type),
        beds: room.capacity || (room.beds ? room.beds.length : 0),
        occupied: room.currentOccupancy || 0,
        reserved: 0,
      })),
    [rawRooms],
  );

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

  // Stats
  const totalRooms = filteredRooms.length;
  const fullyOccupied = filteredRooms.filter((r) => r.occupied === r.beds).length;
  const fullyAvailable = filteredRooms.filter((r) => r.occupied === 0 && r.reserved === 0).length;
  const partial = totalRooms - fullyOccupied - fullyAvailable;
  const totalBeds = filteredRooms.reduce((sum, r) => sum + r.beds, 0);
  const occupiedBeds = filteredRooms.reduce((sum, r) => sum + r.occupied, 0);
  const availableBeds = totalBeds - occupiedBeds;
  const occupancyRate = totalBeds ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : "0.0";

  // Group by floor
  const roomsByFloor = useMemo(() => {
    const floors = {};
    filteredRooms.forEach((r) => {
      if (!floors[r.floor]) floors[r.floor] = [];
      floors[r.floor].push(r);
    });
    return Object.entries(floors).sort(([a], [b]) => Number(a) - Number(b));
  }, [filteredRooms]);

  // Tabs
  const tabs = [
    { key: "availability", label: "Availability", icon: LayoutGrid },
    ...(can("manageRooms") ? [{ key: "setup", label: "Setup", icon: Settings }] : []),
    { key: "occupancy", label: "Occupancy", icon: BarChart3 },
  ];

  const summaryItems = [
    { label: "Total Rooms", value: totalRooms, color: "blue" },
    { label: "Occupied", value: fullyOccupied, color: "red" },
    { label: "Partial", value: partial, color: "orange" },
    { label: "Available", value: fullyAvailable, color: "green" },
    { label: "Occupancy Rate", value: `${occupancyRate}%`, color: "purple" },
  ];

  const filters = [
    ...(isSuperAdmin
      ? [{
          key: "branch",
          options: [
            { value: "all", label: "All Branches" },
            { value: "gil-puyat", label: "Gil Puyat" },
            { value: "guadalupe", label: "Guadalupe" },
          ],
          value: branchFilter,
          onChange: setBranchFilter,
        }]
      : []),
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
        { value: "single", label: "Single" },
        { value: "double", label: "Double" },
        { value: "quadruple", label: "Quadruple" },
      ],
      value: roomTypeFilter,
      onChange: setRoomTypeFilter,
    },
  ];

  return (
    <PageShell tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      <PageShell.Summary>
        {activeTab === "availability" && <SummaryBar items={summaryItems} />}
      </PageShell.Summary>

      <PageShell.Actions>
        {activeTab === "availability" && (
          <ActionBar
            search={{ value: searchTerm, onChange: setSearchTerm, placeholder: "Search rooms..." }}
            filters={filters}
          />
        )}
      </PageShell.Actions>

      <PageShell.Content>
        {activeTab === "availability" && (
          <>
            {/* Legend */}
            <div className="rooms-legend">
              <div className="rooms-legend__item">
                <span className="rooms-legend__dot rooms-legend__dot--available" />
                <span>Available</span>
              </div>
              <div className="rooms-legend__item">
                <span className="rooms-legend__dot rooms-legend__dot--partial" />
                <span>Partial</span>
              </div>
              <div className="rooms-legend__item">
                <span className="rooms-legend__dot rooms-legend__dot--occupied" />
                <span>Occupied</span>
              </div>
            </div>

            {roomsLoading ? (
              <div className="rooms-status">Loading rooms...</div>
            ) : roomsError ? (
              <div className="rooms-status rooms-status--error">{roomsError}</div>
            ) : roomsByFloor.length === 0 ? (
              <EmptyState icon={BedDouble} title="No rooms found" description="Try adjusting your filters." />
            ) : (
              roomsByFloor.map(([floor, floorRooms]) => (
                <div key={floor} className="rooms-floor">
                  <h3 className="rooms-floor__label">Floor {floor}</h3>
                  <div className="rooms-floor__grid">
                    {floorRooms.map((room) => (
                      <RoomCard key={room.id} room={room} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "setup" && <RoomConfigurationPage isEmbedded={true} />}
        {activeTab === "occupancy" && <OccupancyTrackingPage isEmbedded={true} />}
      </PageShell.Content>
    </PageShell>
  );
}

export default RoomAvailabilityPage;
