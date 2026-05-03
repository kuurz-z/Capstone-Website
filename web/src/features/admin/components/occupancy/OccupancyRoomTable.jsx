import { formatRoomType } from "../../utils/formatters";

function getOccupancyColor(occupied, capacity) {
  if (capacity === 0) return "#10b981";
  const rate = (occupied / capacity) * 100;
  if (rate === 0) return "#10b981";
  if (rate < 50) return "#0F4A7F";
  if (rate < 100) return "#f59e0b";
  return "#ef4444";
}

export default function OccupancyRoomTable({ rooms, onViewDetails }) {
  return (
    <div className="rooms-table-section">
      <h2>Room Details</h2>
      <div className="table-wrapper">
        <table className="occupancy-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Occupied</th>
              <th>Available</th>
              <th>Occupancy Rate</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length > 0 ? (
              rooms.map((room) => {
                const capacity = room.capacity || 1;
                const occupied = room.currentOccupancy || room.occupancy || 0;
                const rate = Math.round((occupied / capacity) * 100);
                const color = getOccupancyColor(occupied, capacity);

                return (
                  <tr key={room._id || room.roomName}>
                    <td className="room-name">{room.name || room.roomName}</td>
                    <td>{formatRoomType(room.type || room.roomType)}</td>
                    <td>{capacity}</td>
                    <td>
                      <span className="occupied-badge">{occupied}</span>
                    </td>
                    <td>
                      <span className="available-badge">
                        {capacity - occupied}
                      </span>
                    </td>
                    <td>
                      <div className="occupancy-cell">
                        <div className="mini-bar">
                          <div
                            className="mini-fill"
                            style={{ width: `${rate}%`, background: color }}
                          />
                        </div>
                        <span>{rate}%</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ background: color, color: "white" }}
                      >
                        {rate === 0
                          ? "Empty"
                          : rate < 50
                            ? "Low"
                            : rate < 100
                              ? "High"
                              : "Full"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="detail-btn"
                        onClick={() => onViewDetails(room)}
                        title="View room details and occupied beds"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" style={{ padding: "60px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>🏢</div>
                  <div style={{ fontSize: "15px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>No rooms found</div>
                  <div style={{ fontSize: "13px", color: "#9CA3AF" }}>Rooms will appear here once configured in Room Configuration.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
