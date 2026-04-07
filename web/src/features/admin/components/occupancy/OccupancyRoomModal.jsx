import { BedDouble, Lock, Settings, Unlock, X } from "lucide-react";
import { formatRoomType } from "../../utils/formatters";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function OccupancyRoomModal({ room, loadingDetails, onClose }) {
  useEscapeClose(true, onClose);
  const roomInfo = room.room || room;
  const beds = room.beds || [];
  const occupiedBeds = room.occupiedBeds || [];
  const reservedBeds = room.reservedBeds || beds.filter((bed) => bed.status === "reserved");
  const availableBeds = room.availableBeds || beds.filter((bed) => bed.status === "available");
  const lockedBeds = room.lockedBeds || beds.filter((bed) => bed.status === "locked");
  const maintenanceBeds = room.maintenanceBeds || beds.filter((bed) => bed.status === "maintenance");

  const title = roomInfo.name || roomInfo.roomName || "Room";
  const formatBedLabel = (bed) => {
    const position = bed.position || "bed";
    return `${position.charAt(0).toUpperCase()}${position.slice(1)} (${bed.bedId || bed.id})`;
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title} - Bed Assignment Details</h2>
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
                  <span>{formatRoomType(roomInfo.type || roomInfo.roomType)}</span>
                </div>
                <div className="detail-item">
                  <label>Capacity:</label>
                  <span>{roomInfo.capacity || 0} beds</span>
                </div>
                <div className="detail-item">
                  <label>Committed Occupancy:</label>
                  <span>{roomInfo.currentOccupancy || roomInfo.occupancy || 0}</span>
                </div>
                <div className="detail-item">
                  <label>Occupancy Rate:</label>
                  <span>
                    {Math.round(
                      ((roomInfo.currentOccupancy || roomInfo.occupancy || 0) /
                        (roomInfo.capacity || 1)) *
                        100,
                    )}
                    %
                  </span>
                </div>
              </div>

              {occupiedBeds?.length > 0 && (
                <div className="occupied-beds-section">
                  <h3>Occupied Beds</h3>
                  <div className="beds-list">
                    {occupiedBeds.map((bed, idx) => (
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

              {reservedBeds?.length > 0 && (
                <div className="occupied-beds-section">
                  <h3>Reserved Beds</h3>
                  <div className="beds-list">
                    {reservedBeds.map((bed, idx) => (
                      <div key={idx} className="bed-item occupied">
                        <div className="bed-icon">
                          <Lock size={22} />
                        </div>
                        <div className="bed-info">
                          <h4>{formatBedLabel(bed)}</h4>
                          <p>
                            Reserved by: {bed.reservedBy?.userName || bed.occupant?.name || "Unknown"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lockedBeds?.length > 0 && (
                <div className="occupied-beds-section">
                  <h3>Locked Beds</h3>
                  <div className="beds-list">
                    {lockedBeds.map((bed, idx) => (
                      <div key={idx} className="bed-item occupied">
                        <div className="bed-icon">
                          <Lock size={22} />
                        </div>
                        <div className="bed-info">
                          <h4>{formatBedLabel(bed)}</h4>
                          <p>Temporarily held</p>
                          {bed.lockExpiresAt && (
                            <p className="small-text">
                              Expires: {new Date(bed.lockExpiresAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {maintenanceBeds?.length > 0 && (
                <div className="occupied-beds-section">
                  <h3>Maintenance Beds</h3>
                  <div className="beds-list">
                    {maintenanceBeds.map((bed, idx) => (
                      <div key={idx} className="bed-item occupied">
                        <div className="bed-icon">
                          <Settings size={22} />
                        </div>
                        <div className="bed-info">
                          <h4>{formatBedLabel(bed)}</h4>
                          <p>Unavailable due to maintenance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {availableBeds?.length > 0 && (
                <div className="available-beds-section">
                  <h3>Available Beds ({availableBeds.length})</h3>
                  <div className="beds-list">
                    {availableBeds.map((bed, idx) => (
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

              {!occupiedBeds.length && !reservedBeds.length && !availableBeds.length && !lockedBeds.length && !maintenanceBeds.length && (
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
