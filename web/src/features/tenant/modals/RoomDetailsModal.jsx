import { useState } from "react";
import {
  AlertCircle,
  Bed,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  X,
} from "lucide-react";
import SpotlightCard from "../components/SpotlightCard";
import BedSelector from "../components/BedSelector";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";

function getAvailabilityLabel(room) {
  const beds = room.beds || [];
  const totalBeds = beds.length || 0;
  const availableBeds = beds.filter((bed) => bed.status === "available" || (bed.status === undefined && bed.available)).length;

  if (!totalBeds) return "Available";
  if (availableBeds === 0) return "Full";
  if (availableBeds <= Math.max(1, Math.ceil(totalBeds * 0.25))) {
    return "Limited";
  }
  return "Available";
}

function getAvailabilityColor(room) {
  const label = getAvailabilityLabel(room);
  if (label === "Full") return "#EF4444";
  if (label === "Limited") return "#D4AF37";
  return "#10B981";
}

function getImages(room) {
  if (room.images?.length) return room.images;
  if (room.image) return [room.image];
  return [];
}

export default function RoomDetailsModal({
  isOpen,
  room,
  onClose,
  onProceed,
  isOverbooked,
  selectedBed,
  onSelectBed,
  selectedAppliances,
  onApplianceQuantityChange,
  calculateApplianceFees,
  availableAppliances,
  proceedButtonText = "Proceed to Reservation",
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  useEscapeClose(isOpen && !!room, onClose);

  if (!isOpen || !room) return null;

  const images = getImages(room);
  const requiresBedSelection =
    room.beds && room.beds.length > 1 && room.type !== "Private";
  const proceedDisabled =
    isOverbooked || (requiresBedSelection && !selectedBed);
  const totalBeds = room.beds?.length || 0;
  const availableBeds = room.beds
    ? room.beds.filter((bed) => bed.status === "available" || (bed.status === undefined && bed.available)).length
    : 0;
  const occupancyPercentage = totalBeds
    ? ((totalBeds - availableBeds) / totalBeds) * 100
    : 0;
  const upperBeds = room.beds
    ? room.beds.filter(
        (bed) => bed.position === "upper" || bed.position === "top",
      )
    : [];
  const lowerBeds = room.beds
    ? room.beds.filter(
        (bed) => bed.position === "lower" || bed.position === "bottom",
      )
    : [];
  const hasBunkPreference = upperBeds.length > 0 || lowerBeds.length > 0;
  const hasAvailableUpper = upperBeds.some((bed) => bed.available);
  const hasAvailableLower = lowerBeds.some((bed) => bed.available);

  const handlePrevImage = () => {
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNextImage = () => {
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-20 flex items-start justify-between p-6 border-b border-gray-200 bg-white">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-light" style={{ color: "var(--text-heading, #0A1628)" }}>
                {room.title}
              </h2>
              <span
                className="px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: getAvailabilityColor(room) }}
              >
                {getAvailabilityLabel(room)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-gray-600 text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {room.branch}
              </span>
              <span>•</span>
              <span>{room.type}</span>
              <span>•</span>
              <span>{room.bedLayout}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <SpotlightCard
                spotlightColor="rgba(212, 175, 55, 0.26)"
                className="p-0"
              >
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
                  {images.length > 0 && (
                    <img
                      src={images[currentImageIndex]}
                      alt={`${room.title} - Photo ${currentImageIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevImage}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-lg transition-all"
                      >
                        <ChevronLeft className="w-6 h-6 text-gray-800" />
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white shadow-lg transition-all"
                      >
                        <ChevronRight className="w-6 h-6 text-gray-800" />
                      </button>
                    </>
                  )}

                  {images.length > 0 && (
                    <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-sm">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  )}
                </div>
              </SpotlightCard>

              {images.length > 1 && (
                <SpotlightCard
                  spotlightColor="rgba(212, 175, 55, 0.2)"
                  className="p-0"
                >
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className="aspect-square rounded-lg overflow-hidden border-2 transition-all hover:border-gray-300"
                        style={{
                          borderColor:
                            currentImageIndex === index
                              ? "var(--color-accent)"
                              : "transparent",
                          transform:
                            currentImageIndex === index
                              ? "scale(0.95)"
                              : "scale(1)",
                        }}
                      >
                        <img
                          src={image}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </SpotlightCard>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-semibold mb-4" style={{ color: "var(--text-heading, #0A1628)" }}>
                  Availability Status
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Capacity</p>
                    <p className="text-2xl font-semibold flex items-center gap-2">
                      <Users className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
                      {totalBeds} {totalBeds === 1 ? "Bed" : "Beds"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Beds Available</p>
                    <p className="text-2xl font-semibold flex items-center gap-2">
                      <Bed className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
                      {availableBeds} / {totalBeds}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Current Occupancy</span>
                    <span>
                      {totalBeds - availableBeds} / {totalBeds} Occupied
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${occupancyPercentage}%`,
                        backgroundColor:
                          occupancyPercentage >= 75 ? "var(--color-accent)" : "#10B981",
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3" style={{ color: "var(--text-heading, #0A1628)" }}>
                  Room Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Bed className="w-4 h-4" style={{ color: "var(--color-accent)" }} />
                    </div>
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p className="font-medium">{room.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <svg
                        className="w-4 h-4"
                        style={{ color: "var(--color-accent)" }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-gray-500">Bed Layout</p>
                      <p className="font-medium">{room.bedLayout}</p>
                    </div>
                  </div>
                </div>
                {room.intendedTenant && (
                  <p className="text-sm text-gray-600 mt-3">
                    <strong>Intended for:</strong> {room.intendedTenant}
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3" style={{ color: "var(--text-heading, #0A1628)" }}>
                  Amenities
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {room.amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Check
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "#10B981" }}
                      />
                      <span className="text-sm text-gray-700">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {requiresBedSelection && (
                <BedSelector
                  beds={room.beds}
                  selectedBed={selectedBed}
                  onSelect={onSelectBed}
                />
              )}

              {room.applianceFeeEnabled && (
              <div>
                <h3 className="font-semibold mb-3" style={{ color: "var(--text-heading, #0A1628)" }}>
                  Appliance Fees (Optional)
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Select only appliances you plan to bring. Appliance fees are
                  charged monthly per tenant and added to your billing summary.
                </p>
                {availableAppliances.map((appliance) => (
                  <div key={appliance.id} className="appliance-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                        {appliance.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        ₱{appliance.price}/month each
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onApplianceQuantityChange(
                            appliance.id,
                            Math.max(
                              0,
                              (selectedAppliances[appliance.id] || 0) - 1,
                            ),
                          )
                        }
                        style={{
                          width: "32px",
                          height: "32px",
                          border: "1px solid var(--border-card, #e5e7eb)",
                          borderRadius: "6px",
                          background: "var(--surface-card, white)",
                          cursor: "pointer",
                          fontSize: "16px",
                        }}
                      >
                        −
                      </button>
                      <span
                        style={{
                          minWidth: "30px",
                          textAlign: "center",
                          fontWeight: "600",
                        }}
                      >
                        {selectedAppliances[appliance.id] || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onApplianceQuantityChange(
                            appliance.id,
                            (selectedAppliances[appliance.id] || 0) + 1,
                          )
                        }
                        style={{
                          width: "32px",
                          height: "32px",
                          border: "1px solid var(--border-card, #e5e7eb)",
                          borderRadius: "6px",
                          background: "var(--surface-card, white)",
                          cursor: "pointer",
                          fontSize: "16px",
                        }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onApplianceQuantityChange(appliance.id, 0)
                        }
                        style={{
                          padding: "6px 12px",
                          border: "1px solid var(--border-card, #e5e7eb)",
                          borderRadius: "6px",
                          background: "var(--surface-card, white)",
                          cursor: "pointer",
                          fontSize: "13px",
                          color: "var(--text-muted, #6b7280)",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div className="mt-3 text-sm text-gray-600">
                  Total Appliance Fees:{" "}
                  <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
                    ₱{calculateApplianceFees().toLocaleString()}
                  </span>
                </div>
              </div>
              )}

              <div>
                <h3 className="font-semibold mb-3" style={{ color: "var(--text-heading, #0A1628)" }}>
                  Policies & Important Notes
                </h3>
                <div className="space-y-2">
                  {room.policies.map((policy, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--color-accent)" }} />
                      <span className="text-sm text-gray-700">{policy}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm text-gray-600">
                Ready to reserve? Continue to complete your reservation.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Bed selection may be required before proceeding.
              </p>
            </div>
            <button
              onClick={onProceed}
              className="px-8 py-4 rounded-xl font-medium hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-primary)",
              }}
              disabled={proceedDisabled}
            >
              {requiresBedSelection && !selectedBed
                ? "Please Select a Bed"
                : proceedButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
