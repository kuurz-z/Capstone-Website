import React, { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

/**
 * Redesigned Room Card — soft shadows, bed availability dots, muted type badge.
 */
const RoomCard = React.memo(({ room, onClick }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = room.images?.length ? room.images : [room.image];

  const nextImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const totalBeds = room.capacity || room.beds?.length || parseInt(room.occupancy?.split("/")[1]) || 0;
  
  // Calculate available beds consistently with RoomDetailsModal
  const availableBeds = room.beds
    ? room.beds.filter((bed) => bed.status === "available" || (bed.status === undefined && bed.available)).length
    : Math.max(0, totalBeds - (room.currentOccupancy || parseInt(room.occupancy?.split("/")[0]) || 0));

  const lockedBeds = room.beds
    ? room.beds.filter((bed) => bed.status === "locked" || bed.status === "maintenance").length
    : 0;

  const takenBeds = Math.max(0, totalBeds - availableBeds - lockedBeds);

  return (
    <div className="ca-card" onClick={onClick}>
      {/* Image carousel */}
      <div className="ca-card-image-wrap">
        <img
          src={images[currentImageIndex]}
          alt={room.title}
          loading="lazy"
        />

        {/* Nav buttons (visible on hover via CSS) */}
        {images.length > 1 && (
          <>
            <button
              className="ca-card-nav-btn left"
              onClick={prevImage}
              type="button"
              aria-label="Previous image"
            >
              <ChevronLeft style={{ width: 16, height: 16, color: "#374151" }} />
            </button>
            <button
              className="ca-card-nav-btn right"
              onClick={nextImage}
              type="button"
              aria-label="Next image"
            >
              <ChevronRight style={{ width: 16, height: 16, color: "#374151" }} />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {images.length > 1 && (
          <div className="ca-card-dots">
            {images.map((_, index) => (
              <div
                key={index}
                className={`ca-card-dot ${index === currentImageIndex ? "active" : ""}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="ca-card-body">
        <div className="ca-card-title">
          {room.title}
          <span className="ca-type-badge">{room.type}</span>
        </div>

        {/* Bed availability dots — green=available, red=taken */}
        <div className="ca-bed-dots">
          <div className="dots">
            {/* Available beds first (green) */}
            {Array.from({ length: availableBeds }).map((_, i) => (
              <div key={`a-${i}`} className="ca-bed-dot available" />
            ))}
            {/* Taken beds (red) */}
            {Array.from({ length: takenBeds }).map((_, i) => (
              <div key={`t-${i}`} className="ca-bed-dot taken" />
            ))}
            {/* Locked beds (gray) */}
            {Array.from({ length: lockedBeds }).map((_, i) => (
              <div key={`l-${i}`} className="ca-bed-dot locked" />
            ))}
          </div>
          <span className="label">
            {availableBeds === 0
              ? lockedBeds === totalBeds && totalBeds > 0 ? "Maintenance" : "Full"
              : `${availableBeds} of ${totalBeds} open`}
          </span>
        </div>

        {/* Location */}
        <div className="ca-card-location">
          <MapPin />
          <span>{room.branch}</span>
        </div>

        {/* Price */}
        <div className="ca-card-price">
          ₱{room.price.toLocaleString()}
          <span> / mo</span>
        </div>
      </div>
    </div>
  );
});

export default RoomCard;
