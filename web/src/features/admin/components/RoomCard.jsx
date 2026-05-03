function RoomCard({ room }) {
  const getRoomStatus = () => {
    if (room.occupied === room.beds) return 'full';
    if (room.occupied === 0 && room.reserved === 0) return 'available';
    return 'partial';
  };

  const renderBedIcons = () => {
    const icons = [];
    for (let i = 0; i < room.beds; i += 1) {
      let status = 'available';
      if (i < room.occupied) status = 'occupied';
      else if (i < room.occupied + room.reserved) status = 'reserved';

      icons.push(
        <svg
          key={i}
          className={`room-bed-icon room-bed-${status}`}
          width="28"
          height="28"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2.66699 5.33331V26.6666" stroke="currentColor" strokeWidth="2.66667" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.66699 10.6667H26.667C27.3742 10.6667 28.0525 10.9476 28.5526 11.4477C29.0527 11.9478 29.3337 12.6261 29.3337 13.3334V26.6667" stroke="currentColor" strokeWidth="2.66667" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.66699 22.6667H29.3337" stroke="currentColor" strokeWidth="2.66667" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 10.6667V22.6667" stroke="currentColor" strokeWidth="2.66667" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    return icons;
  };

  return (
    <div className={`room-card room-card-${getRoomStatus()}`}>
      <div className="room-card-header">
        <div className="room-card-id">{room.id}</div>
        <button className="room-card-info-btn" aria-label="View room details">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.5C13.1421 16.5 16.5 13.1421 16.5 9C16.5 4.85786 13.1421 1.5 9 1.5C4.85786 1.5 1.5 4.85786 1.5 9C1.5 13.1421 4.85786 16.5 9 16.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 12V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 6H9.0075" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <div className="room-card-type">
        <svg className="room-type-icon" width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.66699 5.33331V26.6666" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.66699 10.6667H26.667C27.3742 10.6667 28.0525 10.9476 28.5526 11.4477C29.0527 11.9478 29.3337 12.6261 29.3337 13.3334V26.6667" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.66699 22.6667H29.3337" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 10.6667V22.6667" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>{room.type}</span>
      </div>
      <div className="room-card-beds">
        {renderBedIcons()}
      </div>
      <div className="room-card-footer">
        <div className="room-card-occupancy">{room.occupied + room.reserved}/{room.beds} occupied</div>
        <span className={`room-status-badge room-status-${getRoomStatus()}`}>
          {getRoomStatus() === 'full' ? 'Full' : getRoomStatus() === 'available' ? 'Available' : 'Partial'}
        </span>
      </div>
    </div>
  );
}

export default RoomCard;