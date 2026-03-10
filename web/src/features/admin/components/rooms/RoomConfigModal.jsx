import { formatRoomType, formatBranch } from "../../utils/formatters";

export default function RoomConfigModal({ room, onToggleBed, onClose }) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Configure Room: {room.name}</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="room-info-section">
            <h3>Room Information</h3>
            <div className="info-grid">
              <div>
                <strong>Type:</strong> {formatRoomType(room.type)}
              </div>
              <div>
                <strong>Capacity:</strong> {room.capacity} pax
              </div>
              <div>
                <strong>Floor:</strong> {room.floor}
              </div>
              <div>
                <strong>Branch:</strong> {formatBranch(room.branch)}
              </div>
            </div>
          </div>

          <div className="bed-config-section">
            <h3>Bed Configuration</h3>
            <div className="bed-list">
              {room.beds && room.beds.length > 0 ? (
                room.beds.map((bed, index) => (
                  <div key={bed.id || index} className="bed-item">
                    <div className="bed-info">
                      <strong>{bed.id}</strong>
                      <span className="bed-position">
                        Position: {bed.position}
                      </span>
                    </div>
                    <div className="bed-status">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={bed.available}
                          onChange={() => onToggleBed(bed.id)}
                        />
                        <span>{bed.available ? "Available" : "Occupied"}</span>
                      </label>
                    </div>
                  </div>
                ))
              ) : (
                <p className="no-beds">No beds configured</p>
              )}
            </div>
          </div>

          <div className="occupancy-info">
            <h3>Current Occupancy</h3>
            <div className="occupancy-bar">
              <div
                className="occupancy-fill"
                style={{
                  width: `${(room.currentOccupancy / room.capacity) * 100}%`,
                }}
              />
            </div>
            <p>
              {room.currentOccupancy} of {room.capacity} beds occupied
            </p>
          </div>
        </div>

        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={onClose}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
