import { Home, Users } from "lucide-react";

export default function BillingRoomCard({ room, onRoomClick }) {
  const isEmpty = room.tenantCount === 0;

  return (
    <button
      className={`room-card ${isEmpty ? "room-card-empty" : ""}`}
      onClick={() => onRoomClick(room)}
      title={
        isEmpty ? `${room.name} — no tenants` : `Generate bill for ${room.name}`
      }
      disabled={isEmpty}
    >
      <div className={`room-card-icon ${isEmpty ? "empty" : ""}`}>
        <Home size={20} />
      </div>
      <div className="room-card-info">
        <span className="room-card-name">{room.name}</span>
        <span className="room-card-meta">{room.type}</span>
      </div>
      <div className="room-card-right">
        <div className={`room-card-occupancy ${isEmpty ? "empty" : ""}`}>
          <Users size={12} />
          <span>
            {room.tenantCount}/{room.capacity}
          </span>
        </div>
        <span className="room-card-branch">{room.branch}</span>
      </div>
    </button>
  );
}
