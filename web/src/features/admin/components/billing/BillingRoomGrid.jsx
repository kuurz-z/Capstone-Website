import BillingRoomCard from "./BillingRoomCard";

export default function BillingRoomGrid({
  filteredRooms,
  roomsLoading,
  roomBranchFilter,
  roomTypeFilter,
  onBranchChange,
  onTypeChange,
  onRoomClick,
}) {
  return (
    <div className="room-cards-section">
      <div className="room-cards-header">
        <h2 className="section-label">Rooms ({filteredRooms.length})</h2>
        <div className="room-filters">
          <select
            value={roomBranchFilter}
            onChange={(e) => onBranchChange(e.target.value)}
          >
            <option value="">All Branches</option>
            <option value="gil-puyat">Gil-Puyat</option>
            <option value="guadalupe">Guadalupe</option>
          </select>
          <select
            value={roomTypeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="private">Private</option>
            <option value="double-sharing">Double Sharing</option>
            <option value="quadruple-sharing">Quadruple Sharing</option>
          </select>
        </div>
      </div>

      {roomsLoading ? (
        <div className="room-cards-loading">Loading rooms...</div>
      ) : filteredRooms.length === 0 ? (
        <div className="room-cards-empty">
          No rooms found matching the selected filters.
        </div>
      ) : (
        <div className="room-cards-grid">
          {filteredRooms.map((room) => (
            <BillingRoomCard
              key={room.id}
              room={room}
              onRoomClick={onRoomClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
