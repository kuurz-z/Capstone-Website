import React from "react";
import { Bed, Wrench, Layers, User, Calendar, CheckCircle2, AlertCircle, History, Image as ImageIcon } from "lucide-react";
import { groupBedsByBunk, getBedShortCode, formatBedPosition } from "../../../../shared/utils/bedIdentifier";
import { prefetchOptimizedImage } from "../../../../shared/utils/imageOptimizer";

/**
 * DoubleDeckRoomCard — Visual Bunk Bed Matrix Card (Upper & Lower Deck)
 * Renders room occupancy as structured double-deck bunk frames with solid high-contrast status pills.
 */
export default function DoubleDeckRoomCard({ room, onConfigure, onViewHistory, onViewPhotos, canManageRooms = true }) {
  if (!room) return null;

  const roomNumber = room.roomNumber || room.name || "Room";
  const capacity = Number(room.capacity || 0);
  const isPrivate = String(room.type || "").toLowerCase().includes("private");

  const rawRoomName = typeof room.name === "string" ? room.name.trim() : "";
  const rawRoomNum = String(room.roomNumber || "").trim();
  const hasDistinctName =
    Boolean(rawRoomName) &&
    rawRoomName.toLowerCase() !== rawRoomNum.toLowerCase() &&
    rawRoomName.toLowerCase() !== `room ${rawRoomNum}`.toLowerCase();

  const formattedType = room.type ? room.type.replace("-", " ") : "Standard";
  const subtitleText = hasDistinctName ? `${rawRoomName} • ${formattedType}` : formattedType;

  // Extract photos for quick full view
  const roomImages = (() => {
    const fromImages = Array.isArray(room.images) ? room.images.filter(Boolean) : [];
    if (fromImages.length > 0) return fromImages;
    if (typeof room.image === "string" && room.image.trim()) return [room.image.trim()];
    return [];
  })();

  // Filter beds in maintenance
  const bedsInMaintenance = (room.beds || []).filter((b) => b.status === "maintenance").length;
  const roomLevelMaintenance = capacity > 0 && bedsInMaintenance === capacity;
  const effectiveCapacity = roomLevelMaintenance ? 0 : Math.max(0, capacity - bedsInMaintenance);

  // Compute total occupied/reserved count
  const occupiedCount = (room.beds || []).filter(
    (b) => b.status === "occupied" || b.status === "reserved" || Boolean(b.occupiedBy?.userId)
  ).length;

  const effectiveOccupancy = Math.max(Number(room.currentOccupancy || 0), occupiedCount);

  // Status configuration
  let statusKey = "available";
  if (roomLevelMaintenance) statusKey = "maintenance";
  else if (effectiveOccupancy >= effectiveCapacity && effectiveCapacity > 0) statusKey = "full";
  else if (effectiveOccupancy > 0) statusKey = "partial";

  const getStatusBadge = () => {
    switch (statusKey) {
      case "full":
        return { label: "Full", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" };
      case "partial":
        return { label: "Partial", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" };
      case "maintenance":
        return { label: "Maintenance", dot: "bg-slate-400", text: "text-slate-700 dark:text-slate-300" };
      default:
        return { label: "Available", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
    }
  };

  const statusStyle = getStatusBadge();

  // Normalize bed list into Bunks with Upper & Lower decks
  const getBunkStructures = () => {
    let bedList = room.beds || [];
    
    // Fallback: If room beds array is empty or short, build synthetic bunk bed objects
    if (bedList.length < capacity) {
      const synthetic = [];
      for (let i = 0; i < capacity; i++) {
        const isUpper = i % 2 === 0;
        const bunkIndex = Math.floor(i / 2);
        const bunkLetter = String.fromCharCode(65 + bunkIndex);
        synthetic.push({
          id: `${roomNumber}-${bunkLetter}-${isUpper ? "U" : "L"}`,
          code: `${roomNumber}-${bunkLetter}-${isUpper ? "U" : "L"}`,
          position: isUpper ? "upper" : "lower",
          bunkBlock: bunkLetter,
          status: i < effectiveOccupancy ? "occupied" : "available",
        });
      }
      bedList = synthetic;
    }

    return groupBedsByBunk(bedList);
  };

  const { bunks, singleBeds } = getBunkStructures();

  const getDeckPillStyle = (bed) => {
    if (!bed) {
      return {
        bg: "bg-slate-100 dark:bg-slate-800",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-slate-600 dark:text-slate-400",
        label: "Empty",
        dot: "bg-slate-400",
      };
    }

    const bedStatus = String(bed.status || "").toLowerCase().trim();
    const isLocked = bedStatus === "locked";
    const isRes = bedStatus === "reserved";
    const isMaint = bedStatus === "maintenance";
    const isOcc = bedStatus === "occupied" || (Boolean(bed.occupiedBy?.userId) && !isLocked && !isRes && !isMaint);

    if (isOcc) {
      return {
        bg: "bg-rose-50/80 dark:bg-rose-950/30",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-rose-700 dark:text-rose-400 font-semibold",
        label: bed.occupiedBy?.fullName ? bed.occupiedBy.fullName.split(" ")[0] : "Occupied",
        dot: "bg-rose-500",
      };
    }
    if (isRes) {
      return {
        bg: "bg-amber-50/80 dark:bg-amber-950/30",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-amber-700 dark:text-amber-400 font-medium",
        label: "Reserved",
        dot: "bg-amber-500",
      };
    }
    if (isLocked) {
      return {
        bg: "bg-amber-50/80 dark:bg-amber-950/30",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-amber-700 dark:text-amber-400 font-medium",
        label: bed.occupiedBy?.fullName ? `${bed.occupiedBy.fullName.split(" ")[0]} (Paying)` : "Payment Pending",
        dot: "bg-amber-500",
      };
    }
    if (isMaint) {
      return {
        bg: "bg-slate-100 dark:bg-slate-800",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-slate-700 dark:text-slate-300 font-medium",
        label: "Maint",
        dot: "bg-slate-400",
      };
    }

    // Default Vacant (Green)
    return {
      bg: "bg-emerald-50/80 dark:bg-emerald-950/30",
      border: "border-slate-200 dark:border-slate-700",
      text: "text-emerald-700 dark:text-emerald-400 font-medium",
      label: "Vacant",
      dot: "bg-emerald-500",
    };
  };

  return (
    <div
      onClick={() => canManageRooms && onConfigure && onConfigure(room)}
      className={`group relative rounded-xl p-3.5 transition-all duration-200 flex flex-col justify-between w-full bg-card border border-border hover:shadow-md hover:border-slate-400 dark:hover:border-slate-600 ${
        canManageRooms ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Card Top Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-border/60">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-foreground tracking-tight">
              Room {roomNumber}
            </span>
            {bedsInMaintenance > 0 && (
              <span
                title={`${bedsInMaintenance} of ${capacity} bed(s) in maintenance`}
                className="text-amber-500 inline-flex items-center shrink-0"
              >
                <Wrench className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
          <span
            className="text-xs text-muted-foreground font-medium capitalize block mt-0.5 truncate max-w-[200px]"
            title={subtitleText}
          >
            {subtitleText}
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-transparent flex items-center gap-1.5 ${statusStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle.dot}`} />
            {statusStyle.label}
          </span>
          <span
            className="text-[11px] font-semibold text-muted-foreground"
            title={
              bedsInMaintenance > 0
                ? `${effectiveOccupancy}/${effectiveCapacity} usable beds (${bedsInMaintenance} in maintenance)`
                : `${effectiveOccupancy}/${capacity} beds occupied`
            }
          >
            {isPrivate
              ? `${Math.min(1, effectiveOccupancy)}/1`
              : bedsInMaintenance > 0 && !roomLevelMaintenance
              ? `${effectiveOccupancy}/${capacity} Beds (${bedsInMaintenance} Maint)`
              : `${effectiveOccupancy}/${capacity} Beds`}
          </span>
        </div>
      </div>

      {/* Double Deck Bunk Bed Matrix Grid */}
      {!isPrivate && bunks.length > 0 ? (
        <div className="space-y-2 my-1">
          <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between px-0.5">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" /> Bunk Deck Layout
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">Upper / Lower</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {bunks.map((bunk, idx) => {
              const upperStyle = getDeckPillStyle(bunk.upper);
              const lowerStyle = getDeckPillStyle(bunk.lower);

              return (
                <div
                  key={bunk.bunkBlock || idx}
                  className="rounded-lg p-2 bg-muted/40 border border-border/80 flex flex-col gap-1.5"
                >
                  <div className="text-[11px] font-bold text-foreground flex items-center justify-between border-b border-border/40 pb-1">
                    <span>Bunk {bunk.bunkBlock}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">Double Deck</span>
                  </div>

                  {/* Top Deck (Upper Bunk) */}
                  <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 shrink-0 uppercase">
                        Top
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-foreground/90 shrink-0" title={getBedShortCode(roomNumber, bunk.upper, idx * 2)}>
                        {bunk.bunkBlock}-U
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0 ${upperStyle.bg} ${upperStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${upperStyle.dot}`} />
                      <span className="truncate max-w-[90px]">{upperStyle.label}</span>
                    </span>
                  </div>

                  {/* Structural Bunk Divider / Ladder Indicator */}
                  <div className="w-full h-px bg-border/40 my-0.5" />

                  {/* Bottom Deck (Lower Bunk) */}
                  <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 shrink-0 uppercase">
                        Bot
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-foreground/90 shrink-0" title={getBedShortCode(roomNumber, bunk.lower, idx * 2 + 1)}>
                        {bunk.bunkBlock}-L
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0 ${lowerStyle.bg} ${lowerStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${lowerStyle.dot}`} />
                      <span className="truncate max-w-[90px]">{lowerStyle.label}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Single Bed / Private Room Layout */
        <div className="py-2.5 px-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between text-xs my-1">
          <div className="flex items-center gap-2">
            <Bed className="w-4 h-4 text-slate-800 dark:text-slate-200" />
            <span className="font-semibold text-foreground">Single Bed Unit</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 ${effectiveOccupancy > 0 ? "bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400" : "bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${effectiveOccupancy > 0 ? "bg-rose-500" : "bg-emerald-500"}`} />
            {effectiveOccupancy > 0 ? "Occupied" : "Vacant"}
          </span>
        </div>
      )}

      {/* Room Inventory & Amenities Chip Strip */}
      <div className="my-2 flex flex-wrap gap-1">
        {(room.amenities && room.amenities.length > 0
          ? room.amenities.filter((a) => !a.toLowerCase().includes("double deck")).slice(0, 2)
          : ["Air Conditioning", "WiFi"]
        ).map((amenity, idx) => (
          <span
            key={idx}
            className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60"
          >
            {amenity}
          </span>
        ))}
        {room.amenities &&
          room.amenities.filter((a) => !a.toLowerCase().includes("double deck")).length > 2 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60">
              +{room.amenities.filter((a) => !a.toLowerCase().includes("double deck")).length - 2} more
            </span>
          )}
      </div>

      {/* Footer Details */}
      <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {onViewPhotos && roomImages.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewPhotos(room);
              }}
              onMouseEnter={() => {
                roomImages.forEach((img) => prefetchOptimizedImage(img));
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
              title={`View ${roomImages.length} full size room photo${roomImages.length > 1 ? "s" : ""}`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              <span>{roomImages.length} {roomImages.length === 1 ? "Photo" : "Photos"}</span>
            </button>
          )}
          {onViewHistory ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewHistory(room._id || room.id);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
              title="View room & bed history"
            >
              <History className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" /> History
            </button>
          ) : null}
        </div>
        {canManageRooms && (
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-slate-950 dark:group-hover:text-white group-hover:underline flex items-center gap-1">
            Manage Room &rarr;
          </span>
        )}
      </div>
    </div>
  );
}


