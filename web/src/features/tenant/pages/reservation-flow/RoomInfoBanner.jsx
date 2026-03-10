import React from "react";

/**
 * Compact room info banner showing room name, branch, type, and price.
 */
const RoomInfoBanner = ({ room }) => {
  if (!room) return null;

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

  return (
    <div className="rf-room-banner">
      <div className="rf-room-banner-icon">🏠</div>
      <div className="rf-room-banner-info">
        <div className="rf-room-banner-name">
          {room.title || room.name || room.id || "Room"}
        </div>
        <div className="rf-room-banner-meta">
          <span>📍 {capitalize(room.branch) || "Branch"}</span>
          <span>🏷️ {capitalize(room.type) || "Type"}</span>
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
