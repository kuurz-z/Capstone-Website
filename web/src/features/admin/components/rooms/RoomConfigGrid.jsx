import { formatRoomType, formatBranch } from "../../utils/formatters";

export default function RoomConfigGrid({ rooms, onConfigureRoom }) {
  if (rooms.length === 0) {
    return (
      <div className="admin-empty-state">
        <p>No rooms found matching your filters</p>
      </div>
    );
  }

  return (
    <div className="room-config-grid">
      {rooms.map((room) => (
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
              <strong>Type:</strong> {formatRoomType(room.type)}
            </p>
            <p>
              <strong>Branch:</strong> {formatBranch(room.branch)}
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
          <button className="btn-config" onClick={() => onConfigureRoom(room)}>
            Configure Beds
          </button>
        </div>
      ))}
    </div>
  );
}
