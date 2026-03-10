import { BedDouble, Unlock, X } from "lucide-react";
import { formatRoomType } from "../../utils/formatters";

export default function OccupancyRoomModal({ room, loadingDetails, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{room.name || room.roomName} - Bed Assignment Details</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {loadingDetails ? (
            <div className="modal-loading">
              <p>Loading bed details...</p>
            </div>
          ) : (
            <>
              <div className="details-grid">
                <div className="detail-item">
                  <label>Room Type:</label>
                  <span>{formatRoomType(room.type || room.roomType)}</span>
                </div>
                <div className="detail-item">
                  <label>Capacity:</label>
                  <span>{room.capacity || 0} beds</span>
                </div>
                <div className="detail-item">
                  <label>Current Occupancy:</label>
                  <span>{room.currentOccupancy || room.occupancy || 0}</span>
                </div>
                <div className="detail-item">
                  <label>Occupancy Rate:</label>
                  <span>
                    {Math.round(
                      ((room.currentOccupancy || room.occupancy || 0) /
                        (room.capacity || 1)) *
                        100,
                    )}
                    %
                  </span>
                </div>
              </div>

              {room.occupiedBeds?.length > 0 && (
                <div className="occupied-beds-section">
                  <h3>Occupied Beds</h3>
                  <div className="beds-list">
                    {room.occupiedBeds.map((bed, idx) => (
                      <div key={idx} className="bed-item occupied">
                        <div className="bed-icon">
                          <BedDouble size={22} />
                        </div>
                        <div className="bed-info">
                          <h4>
                            {bed.position.charAt(0).toUpperCase() +
                              bed.position.slice(1)}{" "}
                            ({bed.bedId})
                          </h4>
                          <p>
                            Resident: {bed.occupiedBy?.userName || "Unknown"}
                          </p>
                          {bed.occupiedBy?.email && (
                            <p>Email: {bed.occupiedBy.email}</p>
                          )}
                          {bed.occupiedBy?.occupiedSince && (
                            <p className="small-text">
                              Since:{" "}
                              {new Date(
                                bed.occupiedBy.occupiedSince,
                              ).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {room.availableBeds?.length > 0 && (
                <div className="available-beds-section">
                  <h3>Available Beds ({room.availableBeds.length})</h3>
                  <div className="beds-list">
                    {room.availableBeds.map((bed, idx) => (
                      <div key={idx} className="bed-item available">
                        <div className="bed-icon">
                          <Unlock size={22} />
                        </div>
                        <div className="bed-info">
                          <h4>
                            {bed.position.charAt(0).toUpperCase() +
                              bed.position.slice(1)}{" "}
                            ({bed.bedId})
                          </h4>
                          <p className="available-text">
                            Available for booking
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!room.occupiedBeds && !room.availableBeds && (
                <p className="info-text">
                  No detailed bed information available for this room.
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
