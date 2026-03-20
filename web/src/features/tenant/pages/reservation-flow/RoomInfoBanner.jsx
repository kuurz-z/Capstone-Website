import React from "react";
import { Home, MapPin, Tag } from "lucide-react";

/**
 * Compact room info banner showing room name, branch, type, and price.
 */
const RoomInfoBanner = ({ room }) => {
  if (!room) return null;

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

  return (
    <div className="rf-room-banner">
      <div className="rf-room-banner-icon"><Home size={18} color="#FF8C42" /></div>
      <div className="rf-room-banner-info">
        <div className="rf-room-banner-name">
          {room.title || room.name || room.id || "Room"}
        </div>
        <div className="rf-room-banner-meta">
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {capitalize(room.branch) || "Branch"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Tag size={12} /> {capitalize(room.type) || "Type"}</span>
        </div>
      </div>
      <div className="rf-room-banner-price">
        ₱{Number(room.price || 0).toLocaleString()}
        <small> /mo</small>
      </div>
    </div>
  );
};

export default RoomInfoBanner;
