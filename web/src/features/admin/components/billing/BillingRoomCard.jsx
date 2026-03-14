import { Home, Users, User } from "lucide-react";

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
        <span
          className="room-card-meta"
          style={{ textTransform: "capitalize" }}
        >
          {room.type} • {room.branch}
        </span>
        {/* Tenant names list */}
        {room.tenants && room.tenants.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              marginTop: "4px",
            }}
          >
            {room.tenants.slice(0, 4).map((tenant, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: "0.7rem",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  lineHeight: 1.3,
                }}
              >
                <User size={9} />
                {tenant.name}
                {tenant.bedPosition && (
                  <span style={{ color: "#94a3b8", fontSize: "0.65rem" }}>
                    ({tenant.bedPosition})
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="room-card-right">
        <div className={`room-card-occupancy ${isEmpty ? "empty" : ""}`}>
          <Users size={12} />
          <span>
            {room.tenantCount}/{room.capacity}
          </span>
        </div>
        {room.roomPrice > 0 && (
          <span
            style={{
              fontSize: "0.7rem",
              color: "#D4982B",
              fontWeight: 500,
            }}
          >
            ₱{room.roomPrice.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}
