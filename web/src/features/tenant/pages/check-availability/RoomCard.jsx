import React, { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Users } from "lucide-react";

/**
 * Room card with image carousel, type badge, location, occupancy, and price.
 */
const RoomCard = ({ room, onClick }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const images = room.images?.length ? room.images : [room.image];

  const nextImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-gray-100">
        <img
          src={images[currentImageIndex]}
          alt={room.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {isHovered && images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-md transition-all"
              type="button"
            >
              <ChevronLeft className="w-5 h-5 text-gray-800" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-md transition-all"
              type="button"
            >
              <ChevronRight className="w-5 h-5 text-gray-800" />
            </button>
          </>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-all ${index === currentImageIndex ? "bg-white w-4" : "bg-white/60"}`}
              />
            ))}
          </div>
        )}

        <div className="absolute top-3 left-3"></div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg" style={{ color: "#0C375F" }}>
              {room.title}
            </span>
            <span
              className="px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: "#E7710F", color: "#FFFFFF" }}
            >
              {room.type}
            </span>
          </div>
        </div>
        <p className="text-sm font-medium text-gray-700">
          {room.type} · {room.title}
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>{room.branch}</span>
          <span>•</span>
          <Users className="w-4 h-4" />
          <span>{room.occupancy} occupied</span>
        </div>
        <div className="pt-2">
          <span className="text-lg font-semibold" style={{ color: "#0C375F" }}>
            ₱{room.price.toLocaleString()}
          </span>
          <span className="text-sm text-gray-600"> / month</span>
        </div>
      </div>
    </div>
  );
};

export default RoomCard;
