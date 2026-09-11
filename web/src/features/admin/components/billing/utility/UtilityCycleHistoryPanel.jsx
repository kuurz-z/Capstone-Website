import React, { useState, useEffect } from "react";
import {
  History,
  Send,
  Pencil,
  Trash2,
  Eye,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardX,
  MoreVertical,
} from "lucide-react";
import {
  fmtCurrency,
  fmtNumber,
  getCycleLabel,
  getMeterRangeLabel,
  getDisplayStatus,
  getDisplayStatusLabel,
  getDisplayStatusIcon,
  getHistoryStatusClasses,
  canEditPeriod,
  canDeletePeriod,
} from "./utilityConstants";

export default function UtilityCycleHistoryPanel({
  periods = [],
  filteredPeriods = [],
  pagedPeriods = [],
  selectedPeriodId,
  onSelectPeriod,
  periodStatusFilter,
  onStatusFilterChange,
  periodStartDate,
  onStartDateChange,
  periodEndDate,
  onEndDateChange,
  periodSearch,
  onSearchChange,
  onClearFilters,
  periodsPage,
  totalPeriodPages,
  onPageChange,
  onSendPeriod,
  onEditPeriod,
  onDeletePeriod,
  onOpenHistoryModal,
  sendingByPeriodId = {},
  isSendingPeriod,
  isDeletingPeriod,
  utilityType,
  selectedRoom,
}) {
  const [activeMenuPeriodId, setActiveMenuPeriodId] = useState(null);

  const hasActiveFilters = Boolean(
    periodStatusFilter || periodStartDate || periodEndDate || periodSearch,
  );

  // Close active dropdown menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!activeMenuPeriodId) return;

    const handleClickOutside = (e) => {
      if (!e.target.closest("[data-period-menu]")) {
        setActiveMenuPeriodId(null);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setActiveMenuPeriodId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMenuPeriodId]);

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-card-foreground">
              <History size={13} className="shrink-0 text-slate-700 dark:text-slate-300" />
              Billing Cycle History
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage past and open billing cycles for this room. Select a cycle to monitor tenant payment breakdowns.
            </p>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-card-foreground">{filteredPeriods.length}</span> of{" "}
            <span className="font-semibold text-card-foreground">{periods.length}</span> cycle{periods.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
          {/* Status filter */}
          <select
            value={periodStatusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
            aria-label="Filter billing cycle status"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="ready_to_send">Ready to Send</option>
            <option value="sent">Sent / Finalized</option>
            <option value="paid">Paid</option>
          </select>

          {/* Start date */}
          <input
            type="date"
            min="2020-01-01"
            max="2099-12-31"
            value={periodStartDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
            title="Filter by cycle start date"
            aria-label="Filter by start date"
          />

          {/* End date */}
          <input
            type="date"
            min="2020-01-01"
            max="2099-12-31"
            value={periodEndDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
            title="Filter by cycle end date"
            aria-label="Filter by end date"
          />

          {/* Cycle search */}
          <div className="relative">
            <input
              type="text"
              maxLength={50}
              value={periodSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by cycle label..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-3 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
              aria-label="Search cycles"
            />
            {periodSearch && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Cycle List Container */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-2.5">
        {filteredPeriods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 min-h-[220px] text-center text-xs text-muted-foreground">
            <ClipboardX size={32} className="text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-card-foreground">
              {periods.length === 0 ? "No billing history found" : "No cycles match your filters"}
            </p>
            <p className="mt-0.5 text-xs">
              {periods.length === 0
                ? "Create a new billing period to start recording meter readings."
                : "Try resetting your filter parameters."}
            </p>
          </div>
        ) : (
          pagedPeriods.map((p) => {
            const status = getDisplayStatus(p);
            const isSelected = selectedPeriodId === p.id;
            const isSending = Boolean(sendingByPeriodId[p.id]);
            const isMenuOpen = activeMenuPeriodId === p.id;

            return (
              <div
                key={p.id}
                onClick={() => onSelectPeriod(p.id)}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 transition-all cursor-pointer ${
                  isSelected
                    ? "border-slate-900 bg-slate-100/90 shadow-xs dark:border-slate-100 dark:bg-slate-800"
                    : "border-border bg-card hover:bg-muted/30 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
                title="Click to monitor this billing cycle in the Tenant Payment panel below"
              >
                {/* Left info: Cycle name + Meter range + Delta */}
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${isSelected ? "text-slate-900 dark:text-white" : "text-card-foreground"}`}>
                      {getCycleLabel(p)}
                    </p>
                    {p.revised && (
                      <span className="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        Revised
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{getMeterRangeLabel(p, utilityType)}</span>
                    {(utilityType !== "water" || p.calculationVersion === "water-meter-v1") && (
                      <span>Consumption: {p.computedTotalUsage == null ? "—" : `${fmtNumber(p.computedTotalUsage, 2)} ${utilityType === "electricity" ? "kWh" : "m³"}`}</span>
                    )}
                  </div>
                </div>

                {/* Right info: Rate + Status badge + Action buttons (One-to-Many Layout) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {p.computedTotalCost != null && <span className="text-xs font-semibold">Room total: {fmtCurrency(p.computedTotalCost)}</span>}
                  {/* Structured Rate Tag */}
                  <div className="flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                    <span>{utilityType === "water" && p.calculationVersion !== "water-meter-v1" ? "Legacy room total:" : "Rate:"}</span>
                    <strong className="font-semibold text-foreground">{fmtCurrency(p.ratePerUnit)}</strong>
                    <span className="text-[10px] text-muted-foreground">{utilityType === "electricity" ? "/kWh" : p.calculationVersion === "water-meter-v1" ? "/m³" : ""}</span>
                  </div>

                  {/* Status badge with semantic icon and dot */}
                  <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${getHistoryStatusClasses(status)}`}>
                    {getDisplayStatusIcon(status)}
                    {getDisplayStatusLabel(p)}
                  </span>

                  {/* Actions Group (One-to-Many Pattern) */}
                  <div
                    className="relative flex items-center gap-1.5"
                    data-period-menu
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Prominent Send CTA if ready to release */}
                    {status === "ready_to_send" && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#0A1628] px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-[#13243D] active:scale-[0.98] transition-all disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                        onClick={() => onSendPeriod(p)}
                        disabled={isSending || isSendingPeriod}
                        title="Release this statement to tenants"
                      >
                        <Send size={12} />
                        <span>{isSending ? "Sending..." : "Send"}</span>
                      </button>
                    )}

                    {/* Primary Action: View calculation snapshot */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-2xs hover:bg-muted hover:text-foreground active:scale-[0.98] transition-all"
                      onClick={() => onOpenHistoryModal(p.id)}
                      title="View detailed calculation snapshot"
                    >
                      <Eye size={13} className="text-muted-foreground" />
                      <span>View</span>
                    </button>

                    {/* One-to-Many Dropdown Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
                          isMenuOpen
                            ? "border-slate-900 bg-muted text-foreground dark:border-slate-100"
                            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuPeriodId(isMenuOpen ? null : p.id);
                        }}
                        aria-label="More cycle actions"
                        aria-haspopup="true"
                        aria-expanded={isMenuOpen}
                        title="More actions"
                      >
                        <MoreVertical size={14} />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEditPeriod(p) && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted font-medium transition-colors text-left"
                              onClick={() => {
                                setActiveMenuPeriodId(null);
                                onEditPeriod(p);
                              }}
                              title="Edit period details"
                            >
                              <Pencil size={13} className="shrink-0 text-slate-500" />
                              <span>Edit Cycle Details</span>
                            </button>
                          )}

                          {canDeletePeriod(p) && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 font-medium transition-colors text-left"
                              onClick={() => {
                                setActiveMenuPeriodId(null);
                                onDeletePeriod(p.id);
                              }}
                              title="Delete cycle"
                              disabled={isDeletingPeriod}
                            >
                              <Trash2 size={13} className="shrink-0" />
                              <span>Delete Cycle</span>
                            </button>
                          )}

                          {!canEditPeriod(p) && !canDeletePeriod(p) && (
                            <div className="px-2.5 py-2 text-[11px] text-muted-foreground italic text-center">
                              No further actions
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Pagination Controls */}
        {totalPeriodPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <span>
              Page {periodsPage} of {totalPeriodPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={periodsPage <= 1}
                onClick={() => onPageChange(periodsPage - 1)}
                className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous period page"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                disabled={periodsPage >= totalPeriodPages}
                onClick={() => onPageChange(periodsPage + 1)}
                className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next period page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
