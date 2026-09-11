import React from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Home,
  X,
  Zap,
  Droplets,
  RotateCcw,
} from "lucide-react";
import { getRoomLabel } from "../../../../../shared/utils/roomLabel";
import { getRoomStatusInfo } from "./utilityConstants";

export default function UtilityRoomSelector({
  rooms = [],
  filteredRooms = [],
  pagedRooms = [],
  selectedRoomId,
  onSelectRoom,
  sidebarSearch = "",
  onSearchChange,
  floorFilter = "all",
  onFloorFilterChange,
  availableFloors = [],
  roomStatusFilter = "all",
  onRoomStatusFilterChange,
  roomsPage = 1,
  totalRoomPages = 1,
  onPageChange,
  roomsLoading = false,
  utilityType = "electricity",
}) {
  const unit = utilityType === "electricity" ? "kWh" : "m³";
  const UtilityIcon = utilityType === "electricity" ? Zap : Droplets;

  const hasActiveFilters =
    Boolean(sidebarSearch.trim()) ||
    floorFilter !== "all" ||
    roomStatusFilter !== "all";

  const handleResetFilters = () => {
    if (onSearchChange) onSearchChange("");
    if (onFloorFilterChange) onFloorFilterChange("all");
    if (onRoomStatusFilterChange) onRoomStatusFilterChange("all");
  };

  const startItem = filteredRooms.length > 0 ? (roomsPage - 1) * 7 + 1 : 0;
  const endItem = Math.min(roomsPage * 7, filteredRooms.length);

  return (
    <aside
      className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs"
      aria-label="Room selection"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-card-foreground">
          <Home size={13} className="shrink-0 text-slate-700 dark:text-slate-300" />
          Room Selector
        </span>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
              title="Reset search and filters"
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          )}
          <span className="text-[11px] font-medium text-muted-foreground">
            {filteredRooms.length} of {rooms.length} room{rooms.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search Input with search icon and clear button */}
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          maxLength={50}
          className="w-full rounded-lg border border-border bg-card pl-8 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 transition-all"
          placeholder="Search room number or name..."
          value={sidebarSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search rooms"
        />
        {sidebarSearch && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Floor & Status Filter Dropdowns */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <select
            aria-label="Filter by floor level"
            className="h-8 w-full appearance-none rounded-lg border border-border bg-card pl-2.5 pr-6 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 transition-all cursor-pointer"
            value={floorFilter}
            onChange={(e) => onFloorFilterChange(e.target.value)}
          >
            <option value="all">All Floors</option>
            {availableFloors.map((fl) => (
              <option key={fl} value={fl}>
                Floor {fl}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        <div className="relative">
          <select
            aria-label="Filter by occupancy status"
            className="h-8 w-full appearance-none rounded-lg border border-border bg-card pl-2.5 pr-6 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 transition-all cursor-pointer"
            value={roomStatusFilter}
            onChange={(e) => onRoomStatusFilterChange(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      {/* Room Button List — Stable scroll container prevents layout shift */}
      <div className="space-y-1.5 pt-1 h-[430px] overflow-y-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
        {roomsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="h-[52px] w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-card-foreground">No rooms found</p>
            <p className="mt-1 text-[11px]">Try adjusting your search or filters.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-card-foreground hover:bg-muted transition-colors"
              >
                <RotateCcw size={11} />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        ) : (
          pagedRooms.map((room) => {
            const isSelected = selectedRoomId === room.id;
            const statusInfo = getRoomStatusInfo(room);
            const hasTenants = Boolean(
              room.hasActiveTenants ||
                (room.activeTenantCount && room.activeTenantCount > 0),
            );
            const tenantCount = room.activeTenantCount || (hasTenants ? 1 : 0);

            return (
              <button
                key={room.id}
                type="button"
                className={`group w-full rounded-lg border px-3 py-2 text-left transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                  isSelected
                    ? "border-slate-900 bg-slate-100/90 shadow-xs dark:border-slate-100 dark:bg-slate-800"
                    : "border-border bg-card hover:bg-muted/40 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
                aria-pressed={isSelected}
                aria-label={`Select room ${getRoomLabel(room)}`}
                onClick={() => onSelectRoom(room.id)}
              >
                {/* Row 1: Room Label (Left) and Occupancy Indicator (Right) */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold truncate ${
                      isSelected
                        ? "text-slate-900 dark:text-white"
                        : "text-card-foreground"
                    }`}
                  >
                    {getRoomLabel(room)}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        hasTenants ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                      title={
                        hasTenants
                          ? "Occupied with active tenants"
                          : "Vacant / No active tenants"
                      }
                    />
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {hasTenants
                        ? `${tenantCount} ${tenantCount === 1 ? "tenant" : "tenants"}`
                        : "Vacant"}
                    </span>
                  </div>
                </div>

                {/* Row 2: Status Dot & Label (Left) and Latest Meter Reading (Right) */}
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusInfo.dotClass}`}
                    />
                    <span
                      className={`text-[10px] font-medium truncate ${statusInfo.textClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  {room.latestReading != null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-600 dark:text-slate-400 shrink-0">
                      <UtilityIcon
                        size={10}
                        className={
                          utilityType === "electricity"
                            ? "text-amber-500"
                            : "text-sky-500"
                        }
                      />
                      <span>
                        {room.latestReading} {unit}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      —
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalRoomPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-muted-foreground">
          <span>
            {startItem}–{endItem} of {filteredRooms.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={roomsPage <= 1}
              onClick={() => onPageChange(roomsPage - 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous room page"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-medium px-1">
              {roomsPage} / {totalRoomPages}
            </span>
            <button
              type="button"
              disabled={roomsPage >= totalRoomPages}
              onClick={() => onPageChange(roomsPage + 1)}
              className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next room page"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
