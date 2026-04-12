import { useState } from "react";
import { formatRoomType, formatBranch } from "../../utils/formatters";
import { X, Lock, Pencil, Trash2 } from "lucide-react";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function RoomConfigModal({
  room,
  onToggleBed,
  onClose,
  onSave,
  onEdit,
  onDelete,
}) {
  const [saving, setSaving] = useState(false);
  useEscapeClose(true, onClose);

  const getBedStatus = (bed) => 
    bed.status || (bed.available === false ? "occupied" : "available");

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
          <div className="room-config-modal__header-actions">
            {onEdit && (
              <button
                type="button"
                className="room-config-modal__icon-btn"
                onClick={() => onEdit(room)}
                aria-label="Edit room"
                title="Edit room"
              >
                <Pencil size={16} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="room-config-modal__icon-btn room-config-modal__icon-btn--danger"
                onClick={() => onDelete(room)}
                aria-label="Archive room"
                title="Archive room"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="admin-modal-body">
          <div className="room-info-section">
            <h3>Room Information</h3>
            <div className="info-grid">
              <div>
                <strong>Type</strong>
                {formatRoomType(room.type)}
              </div>
              <div>
                <strong>Capacity</strong>
                {room.capacity} pax
              </div>
              <div>
                <strong>Floor</strong>
                Floor {room.floor}
              </div>
              <div>
                <strong>Branch</strong>
                {formatBranch(room.branch)}
              </div>
              <div>
                <strong>Base Price</strong>
                ₱{Number(room.price || 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="bed-config-section">
            <h3>Bed Configuration</h3>
            <div className="bed-list">
              {room.beds && room.beds.length > 0 ? (
                room.beds.map((bed, index) => {
                  const status = getBedStatus(bed);
                  return (
                    <div key={bed.id || index} className="bed-item">
                      <div className="bed-info">
                        <span className="bed-id">{bed.id}</span>
                        <span className="bed-position">{bed.position}</span>
                        <span className={`status-badge ${status}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>
                      <div className="bed-actions">
                        {status === "occupied" ? (
                          <span className="bed-locked-text">Occupied</span>
                        ) : (
                          <button
                            className={status === "maintenance" ? "btn-primary" : "btn-secondary"}
                            onClick={() => onToggleBed(bed.id)}
                            style={{ padding: "4px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                          >
                            {status === "maintenance" ? (
                              <>Unlock</>
                            ) : (
                              <>
                                <Lock size={12} />
                                Maintenance
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="no-beds">No beds have been configured for this room.</p>
              )}
            </div>
          </div>

          <div className="occupancy-info">
            <h3>Current Occupancy</h3>
            <div className="occupancy-bar">
              <div 
                className="occupancy-fill" 
                style={{ width: `${(room.currentOccupancy / room.capacity) * 100}%` }} 
              />
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
              {room.currentOccupancy} of {room.capacity} beds currently occupied
            </p>
          </div>
        </div>

        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
