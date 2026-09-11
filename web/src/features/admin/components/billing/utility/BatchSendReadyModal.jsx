import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  Search,
  CheckSquare,
  Square,
  MinusSquare,
  LoaderCircle,
  Zap,
  Droplets,
  Building,
  Users,
  CheckCircle2,
} from "lucide-react";
import useEscapeClose from "../../../../../shared/hooks/useEscapeClose";
import { getRoomLabel } from "../../../../../shared/utils/roomLabel";
import { fmtCurrency, fmtNumber, getCycleLabel } from "./utilityConstants";

export default function BatchSendReadyModal({
  isOpen,
  onClose,
  readyRooms = [],
  utilityType = "electricity",
  onConfirmSend,
  isSending = false,
}) {
  useEscapeClose(onClose, isOpen);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Initialize all ready rooms as selected when modal opens or readyRooms change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(readyRooms.map((r) => r.id || r._id)));
      setSearch("");
    }
  }, [isOpen, readyRooms]);

  const unit = utilityType === "electricity" ? "kWh" : "m³";
  const UtilityIcon = utilityType === "electricity" ? Zap : Droplets;
  const utilityTitle = utilityType === "water" ? "Water" : "Electricity";

  // Filtered ready rooms based on search query
  const filteredRooms = useMemo(() => {
    if (!search.trim()) return readyRooms;
    const q = search.trim().toLowerCase();
    return readyRooms.filter((r) => {
      const label = getRoomLabel(r).toLowerCase();
      const branch = String(r.branch || "").toLowerCase();
      return label.includes(q) || branch.includes(q);
    });
  }, [readyRooms, search]);

  const allFilteredSelected =
    filteredRooms.length > 0 &&
    filteredRooms.every((r) => selectedIds.has(r.id || r._id));

  const someFilteredSelected =
    filteredRooms.some((r) => selectedIds.has(r.id || r._id)) && !allFilteredSelected;

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered rooms
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredRooms.forEach((r) => next.delete(r.id || r._id));
        return next;
      });
    } else {
      // Select all filtered rooms
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredRooms.forEach((r) => next.add(r.id || r._id));
        return next;
      });
    }
  };

  const handleToggleRoom = (roomId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  const handleSend = () => {
    const idsToSend = Array.from(selectedIds);
    if (idsToSend.length === 0) return;
    onConfirmSend(idsToSend);
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-send-ready-title"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 ${
                utilityType === "electricity"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-sky-600 dark:text-sky-400"
              }`}
            >
              <UtilityIcon size={20} />
            </div>
            <div>
              <h2
                id="batch-send-ready-title"
                className="text-base font-bold text-card-foreground leading-tight"
              >
                Release Finalized {utilityTitle} Statements
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select and customize which ready rooms to dispatch to tenant portals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Master Toggle Toolbar */}
        <div className="border-b border-border bg-muted/15 px-6 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                maxLength={50}
                placeholder="Search room name or branch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isSending}
                className="h-9 w-full rounded-lg border border-border bg-card pl-10 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/50 dark:focus:ring-slate-800 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Selection Counter Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-2xs shrink-0">
              <span className="font-bold text-card-foreground">
                {selectedIds.size}
              </span>{" "}
              of {readyRooms.length} room{readyRooms.length !== 1 ? "s" : ""} selected
            </div>
          </div>

          {/* Select All Toggle Bar */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={isSending || filteredRooms.length === 0}
              className="inline-flex items-center gap-2 font-semibold text-card-foreground hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              {allFilteredSelected ? (
                <CheckSquare size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : someFilteredSelected ? (
                <MinusSquare size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Square size={16} className="text-muted-foreground" />
              )}
              <span>
                {allFilteredSelected
                  ? `Deselect All (${filteredRooms.length})`
                  : `Select All (${filteredRooms.length})`}
              </span>
            </button>

            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                disabled={isSending}
                className="text-xs font-medium text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {/* Room Selection List */}
        <div className="max-h-[340px] overflow-y-auto p-4 space-y-2.5">
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
              <p className="font-semibold text-card-foreground">No matching ready rooms</p>
              <p className="mt-0.5 text-[11px]">
                Try adjusting your search query.
              </p>
            </div>
          ) : (
            filteredRooms.map((room) => {
              const roomId = room.id || room._id;
              const isChecked = selectedIds.has(roomId);
              const roomLabel = getRoomLabel(room);
              const branch = room.branch ? String(room.branch).toUpperCase() : "";
              const period = room.activePeriod || room.latestPeriod;
              const cycleLabel = period ? getCycleLabel(period) : (room.billingLabel || "Finalized Statement");
              const usage = utilityType === "water" && period?.calculationVersion !== "water-meter-v1" ? null : period?.computedTotalUsage ?? period?.totalConsumption ?? period?.usage;
              const amount = period?.totalAmount ?? period?.computedTotalCost ?? room.latestPeriodAmount;
              const tenantCount = room.activeTenantCount || 0;

              return (
                <label
                  key={roomId}
                  className={`flex items-center justify-between gap-3.5 rounded-xl border p-3.5 cursor-pointer transition-all duration-150 ${
                    isChecked
                      ? "border-slate-300 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/60 shadow-2xs"
                      : "border-border bg-card hover:bg-muted/30 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleRoom(roomId)}
                      disabled={isSending}
                      className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-card-foreground truncate">
                          {roomLabel}
                        </span>
                        {branch && (
                          <span className="rounded border border-slate-200 dark:border-slate-700 bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {branch}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={12} className="text-slate-400" />
                          <span>{tenantCount} tenant{tenantCount !== 1 ? "s" : ""}</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Cycle: <span className="font-medium text-foreground">{cycleLabel}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {amount != null && (
                      <p className="text-xs font-bold text-card-foreground">
                        {fmtCurrency(amount)}
                      </p>
                    )}
                    {usage != null && (
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {fmtNumber(usage, 2)} {unit}
                      </p>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-muted/15 px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {selectedIds.size === 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Select at least 1 room to release
              </span>
            ) : (
              <span>
                Ready to release <strong className="text-foreground">{selectedIds.size}</strong> statement{selectedIds.size !== 1 ? "s" : ""}
              </span>
            )}
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-card-foreground shadow-2xs hover:bg-muted active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={selectedIds.size === 0 || isSending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title={
                selectedIds.size === 0
                  ? "Select at least one room to release statements"
                  : "Release selected statements to tenant portal"
              }
            >
              {isSending ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  <span>Releasing Statements...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Send Selected ({selectedIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
