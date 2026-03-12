import { useState } from "react";
import { formatRoomType, formatBranch } from "../../utils/formatters";

const BED_STATUS_STYLES = {
  available: { bg: "#D1FAE5", color: "#059669", label: "Available" },
  occupied: { bg: "#FEE2E2", color: "#DC2626", label: "Occupied" },
  maintenance: { bg: "#F3F4F6", color: "#6B7280", label: "🔧 Maintenance" },
};

export default function RoomConfigModal({ room, onToggleBed, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const getBedStatus = (bed) => bed.status || (bed.available === false ? "occupied" : "available");

  const handleSave = async () => {
    setSaving(true);
    try {
      if (onSave) await onSave(room);
      onClose();
    } catch (err) {
      console.error("Failed to save room config:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Configure Room: {room.name}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        <div className="admin-modal-body">
          <div className="room-info-section">
            <h3>Room Information</h3>
            <div className="info-grid">
              <div><strong>Type:</strong> {formatRoomType(room.type)}</div>
              <div><strong>Capacity:</strong> {room.capacity} pax</div>
              <div><strong>Floor:</strong> {room.floor}</div>
              <div><strong>Branch:</strong> {formatBranch(room.branch)}</div>
              <div><strong>Price:</strong> ₱{Number(room.price || 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="bed-config-section">
            <h3>Bed Configuration</h3>
            <div className="bed-list">
              {room.beds && room.beds.length > 0 ? (
                room.beds.map((bed, index) => {
                  const status = getBedStatus(bed);
                  const style = BED_STATUS_STYLES[status];
                  return (
                    <div key={bed.id || index} className="bed-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", marginBottom: "8px", border: "1px solid #E5E7EB" }}>
                      <div className="bed-info" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <strong>{bed.id}</strong>
                        <span style={{ color: "#6B7280", fontSize: "13px" }}>{bed.position}</span>
                        <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: style.bg, color: style.color }}>{style.label}</span>
                      </div>
                      <div>
                        {status === "occupied" ? (
                          <span style={{ fontSize: "12px", color: "#9CA3AF" }}>In use</span>
                        ) : (
                          <button
                            onClick={() => onToggleBed(bed.id)}
                            style={{ padding: "4px 14px", borderRadius: "6px", border: "1px solid #E5E7EB", background: status === "maintenance" ? "#10B981" : "#6B7280", color: "white", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
                          >
                            {status === "maintenance" ? "Unlock" : "Lock 🔧"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="no-beds">No beds configured</p>
              )}
            </div>
          </div>

          <div className="occupancy-info">
            <h3>Current Occupancy</h3>
            <div className="occupancy-bar">
              <div className="occupancy-fill" style={{ width: `${(room.currentOccupancy / room.capacity) * 100}%` }} />
            </div>
            <p>{room.currentOccupancy} of {room.capacity} beds occupied</p>
          </div>
        </div>

        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
