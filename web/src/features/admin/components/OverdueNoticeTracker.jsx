import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  RefreshCw,
  Search,
  CheckCircle2,
  LoaderCircle,
  X,
  AlertCircle,
  Clock,
  DollarSign,
  Send,
  ShieldAlert,
  MoreVertical,
  ChevronDown,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { billingApi } from "../../../shared/api/billingApi.js";
import { showNotification } from "../../../shared/utils/notification.js";
import StatusBadge from "./shared/StatusBadge.jsx";
import DispatchNoticeModal from "./billing/DispatchNoticeModal.jsx";
import BatchDispatchNoticeModal from "./billing/BatchDispatchNoticeModal.jsx";

const getInitials = (name) => {
  if (!name) return "TN";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function OverdueNoticeTracker({
  branch,
  onEscalateToTermination,
  onNoticesUpdated,
  hideTopKpiCards = false,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const stageParam = searchParams.get("stage") || "all";
  const stageFilter = ["all", "eligible", "notice_1", "notice_2", "notice_3"].includes(stageParam)
    ? stageParam
    : "all";

  const handleStageFilterChange = (newStage) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newStage === "all") {
      nextParams.delete("stage");
    } else {
      nextParams.set("stage", newStage);
    }
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
  };

  const [notices, setNotices] = useState([]);
  const [stats, setStats] = useState({
    totalExposure: 0,
    overdueAccounts: 0,
    pendingNotice1Count: 0,
    notice1ActiveCount: 0,
    notice2ActiveCount: 0,
    notice3FinalCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"

  const filteredNotices = useMemo(() => {
    let list = notices;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = notices.filter((n) => {
        const name = String(n.tenantName || "").toLowerCase();
        const room = String(n.roomName || n.roomId || "").toLowerCase();
        const bill = String(n.billNumber || n.billId || "").toLowerCase();
        return name.includes(q) || room.includes(q) || bill.includes(q);
      });
    }

    return [...list].sort((a, b) => {
      const getNoticeDate = (n) => {
        const raw = n.dueDate || n.createdAt || n.dateOfNotice;
        if (!raw) return null;
        const time = new Date(raw).getTime();
        return Number.isFinite(time) ? time : null;
      };
      const dateA = getNoticeDate(a);
      const dateB = getNoticeDate(b);
      const hasA = dateA !== null;
      const hasB = dateB !== null;
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1; // missing dates always placed at the end
      if (!hasB) return -1;
      return sortOrder === "oldest" ? dateA - dateB : dateB - dateA;
    });
  }, [notices, searchQuery, sortOrder]);

  // Batch Selection State
  const [selectedBillIds, setSelectedBillIds] = useState(new Set());
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [quickSendingBillId, setQuickSendingBillId] = useState(null);

  // Modal State
  const [selectedItemForNotice, setSelectedItemForNotice] = useState(null);
  const [selectedTargetStage, setSelectedTargetStage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Stage Buckets for Notice Escalation Progression
  const eligibleForStage1 = useMemo(
    () => notices.filter((n) => Number(n.noticeCount || 0) === 0 || n.noticeStage === "eligible"),
    [notices]
  );
  const eligibleForStage2 = useMemo(
    () => notices.filter((n) => Number(n.noticeCount || 0) === 1 || n.noticeStage === "notice_1"),
    [notices]
  );
  const eligibleForStage3 = useMemo(
    () => notices.filter((n) => Number(n.noticeCount || 0) === 2 || n.noticeStage === "notice_2"),
    [notices]
  );

  // Dynamic Batch Target Stage & Label calculation
  const batchActionConfig = useMemo(() => {
    if (selectedBillIds.size > 0) {
      const selectedItems = notices.filter((n) => selectedBillIds.has(n.billId || n._id));
      const minCount = Math.min(...selectedItems.map((n) => Number(n.noticeCount || 0)), 0);
      const targetStage = Math.min(3, Math.max(1, minCount + 1));
      const stageLabel = targetStage === 3 ? "Final Demand" : targetStage === 2 ? "Notice 2" : "Notice 1";
      return {
        targetStage,
        label: `Send ${stageLabel} (${selectedBillIds.size})`,
        items: selectedItems,
        disabled: false,
      };
    }

    if (stageFilter === "eligible") {
      return {
        targetStage: 1,
        label: `Send All 1st Reminders (${eligibleForStage1.length})`,
        items: eligibleForStage1,
        disabled: eligibleForStage1.length === 0,
      };
    }
    if (stageFilter === "notice_1") {
      return {
        targetStage: 2,
        label: `Send All 2nd Notices (${eligibleForStage2.length})`,
        items: eligibleForStage2,
        disabled: eligibleForStage2.length === 0,
      };
    }
    if (stageFilter === "notice_2") {
      return {
        targetStage: 3,
        label: `Send All Final Notices (${eligibleForStage3.length})`,
        items: eligibleForStage3,
        disabled: eligibleForStage3.length === 0,
      };
    }

    // Default when viewing "all" overdue accounts
    if (eligibleForStage1.length > 0) {
      return {
        targetStage: 1,
        label: `Send All 1st Reminders (${eligibleForStage1.length})`,
        items: eligibleForStage1,
        disabled: false,
      };
    }
    if (eligibleForStage2.length > 0) {
      return {
        targetStage: 2,
        label: `Send All 2nd Notices (${eligibleForStage2.length})`,
        items: eligibleForStage2,
        disabled: false,
      };
    }
    if (eligibleForStage3.length > 0) {
      return {
        targetStage: 3,
        label: `Send All Final Notices (${eligibleForStage3.length})`,
        items: eligibleForStage3,
        disabled: false,
      };
    }

    return {
      targetStage: 1,
      label: "All Notices Dispatched",
      items: [],
      disabled: true,
    };
  }, [selectedBillIds, notices, stageFilter, eligibleForStage1, eligibleForStage2, eligibleForStage3]);

  // Portal-Backed Floating Action Menu State (Immune to table/card scroll clipping)
  const [activeMenu, setActiveMenu] = useState(null); // { item, coords: { top, bottom, right } }
  const menuRef = useRef(null);

  const handleToggleMenu = (e, item) => {
    e.stopPropagation();
    if (activeMenu?.item?._id === item._id) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const isAbove = spaceBelow < 250;

    setActiveMenu({
      item,
      coords: {
        top: isAbove ? "auto" : `${rect.bottom + 6}px`,
        bottom: isAbove ? `${window.innerHeight - rect.top + 6}px` : "auto",
        right: `${Math.max(16, window.innerWidth - rect.right)}px`,
      },
    });
  };

  // Close floating menu on click outside, window scroll, or escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };
    const handleScroll = () => {
      setActiveMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("scroll", handleScroll, true);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [activeMenu]);

  const fetchNotices = async () => {
    try {
      setLoading(true);
      const params = {};
      if (branch && branch !== "all") params.branch = branch;
      if (stageFilter !== "all") params.stage = stageFilter;

      const res = await billingApi.getOverdueNotices(params);
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setNotices(list);
      if (res?.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      console.error("[OverdueNoticeTracker] Notices fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [branch, stageFilter]);

  const handleOpenNoticeModal = (item, stage) => {
    setActiveMenu(null);
    setSelectedItemForNotice(item);
    setSelectedTargetStage(stage);
    setIsModalOpen(true);
  };

  const handleRefresh = () => {
    fetchNotices();
    onNoticesUpdated?.();
  };

  const handleSelectAll = () => {
    if (selectedBillIds.size === filteredNotices.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(filteredNotices.map((n) => n.billId || n._id)));
    }
  };

  const handleToggleSelectBill = (billId) => {
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const handleBatchSendNotices = () => {
    if (batchActionConfig.disabled || batchActionConfig.items.length === 0) {
      showNotification("No overdue accounts are currently eligible for this notice stage.", "warning");
      return;
    }
    setIsBatchModalOpen(true);
  };

  const handleQuickSend = async (item, stage) => {
    const billId = item.billId || item._id;
    try {
      setQuickSendingBillId(billId);
      await billingApi.sendOverdueNotice(billId, {
        noticeNumber: stage,
        noticeType: `notice_${stage}`,
      });
      showNotification(`Notice ${stage} sent to ${item.tenantName || "tenant"}.`, "success");
      fetchNotices();
      onNoticesUpdated?.();
    } catch (err) {
      console.error("Quick send error:", err);
      showNotification(err.message || "Unable to send notice.", "error");
    } finally {
      setQuickSendingBillId(null);
    }
  };

  return (
    <div className="space-y-3 text-card-foreground">
      {/* Notices Data Card Container */}
      <div className="rounded-xl border border-border bg-card shadow-xs">
        {/* Streamlined Integrated Toolbar: Search on Left, Batch Actions & Filters on Right */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-3.5 py-2.5 rounded-t-xl">
          {/* Left: Search Input */}
          <div className="relative flex items-center w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tenant, room, bill..."
              className="w-full h-8 rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 p-0.5 rounded-full text-muted-foreground hover:text-card-foreground transition cursor-pointer"
                aria-label="Clear search query"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Right: Batch Button + Stage Filter Dropdown + Refresh Button */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            {/* Dynamic Batch Send Button */}
            <button
              type="button"
              onClick={handleBatchSendNotices}
              disabled={loading || batchActionConfig.disabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0A1628] dark:bg-slate-100 text-white dark:text-slate-900 px-3 text-xs font-bold shadow-xs hover:bg-[#13243D] dark:hover:bg-white active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              title={batchActionConfig.label}
            >
              <Send size={12} className="text-amber-400 dark:text-amber-600" />
              <span>{batchActionConfig.label}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Stage Filter:</span>
              <select
                value={stageFilter}
                onChange={(e) => handleStageFilterChange(e.target.value)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
                aria-label="Filter overdue accounts by escalation stage"
                title="Filter overdue accounts by escalation stage"
              >
                <option value="all">All Overdue</option>
                <option value="eligible">Needs 1st Reminder</option>
                <option value="notice_1">1st Reminder Sent</option>
                <option value="notice_2">2nd Notice Sent</option>
                <option value="notice_3">Final Notice / Escalated</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Sort:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
                aria-label="Sort overdue accounts by date"
                title="Sort overdue accounts by date"
              >
                <option value="newest">Newest to Oldest</option>
                <option value="oldest">Oldest to Newest</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs transition hover:bg-muted active:scale-[0.98] disabled:opacity-50 cursor-pointer shrink-0"
              title="Refresh notice records"
            >
              <RefreshCw size={13} className={loading ? "animate-spin text-muted-foreground" : "text-muted-foreground"} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Notices Table */}
        <div className="overflow-x-auto min-h-[320px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-background">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-muted-foreground hover:text-card-foreground transition cursor-pointer"
                    title={selectedBillIds.size === filteredNotices.length ? "Deselect all" : "Select all"}
                  >
                    {filteredNotices.length > 0 && selectedBillIds.size === filteredNotices.length ? (
                      <CheckSquare size={16} className="text-[#0A1628] dark:text-[#D4AF37]" />
                    ) : (
                      <Square size={16} className="text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Tenant</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Bill #</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Current Stage</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Overdue Balance</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Delivery Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    <LoaderCircle size={20} className="animate-spin text-muted-foreground inline mb-1" /> Loading overdue escalation records...
                  </td>
                </tr>
              ) : filteredNotices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-muted-foreground">
                      <CheckCircle2 size={26} className="text-emerald-600 mb-2" />
                      <p className="font-bold text-card-foreground">No overdue accounts found</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {searchQuery
                          ? `No records match "${searchQuery}"`
                          : stageFilter !== "all"
                          ? "No records found for the selected stage filter."
                          : "All tenant accounts are in good standing."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredNotices.map((n, idx) => {
                  const billId = n.billId || n._id;
                  const noticeCount = Number(n.noticeCount || 0);
                  const daysOverdue = Number(n.daysOverdue || 0);
                  const isSelected = selectedBillIds.has(billId);

                  return (
                    <tr key={n._id} className={`group transition-colors ${isSelected ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                      <td className="w-10 px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectBill(billId)}
                          className="text-muted-foreground hover:text-card-foreground transition cursor-pointer"
                          aria-label={`Select ${n.tenantName}`}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-[#0A1628] dark:text-[#D4AF37]" />
                          ) : (
                            <Square size={16} className="text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-white dark:bg-[#D4AF37] dark:text-[#0A1628] border border-[#0A1628]/20 dark:border-[#D4AF37]/40 text-[11px] font-bold shadow-xs">
                            {getInitials(n.tenantName)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-card-foreground">{n.tenantName || "Tenant"}</p>
                              {daysOverdue >= 60 ? (
                                <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-transparent">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  60d+ Severe Overdue
                                </span>
                              ) : daysOverdue >= 30 ? (
                                <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-transparent">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  30d+ Late
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Room: <strong className="text-card-foreground font-semibold">{n.roomName || n.roomId || "N/A"}</strong> · {daysOverdue}d late
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-card-foreground">
                        #{n.billNumber || String(n.billId || "").slice(-6)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={n.noticeStage || `notice_${n.noticeCount || 1}`} />
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">
                        ₱{Number(n.remainingAmount || n.frozenAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-medium">
                        {n.deliveredAt ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Delivered: {new Date(n.deliveredAt).toLocaleDateString("en-PH")}
                          </span>
                        ) : noticeCount === 0 ? (
                          <span className="text-sky-700 dark:text-sky-400 font-medium">Eligible for 1st Reminder</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">Pending Delivery</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-flex items-center justify-end">
                          {/* Single Clean Actions Trigger Button */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleMenu(e, n)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition active:scale-[0.98] cursor-pointer ${
                              activeMenu?.item?._id === n._id
                                ? "bg-muted text-card-foreground shadow-inner"
                                : "bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground shadow-xs"
                            }`}
                            title="Open notice and review actions"
                            aria-haspopup="true"
                            aria-expanded={activeMenu?.item?._id === n._id}
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portal-Backed Floating Dropdown Menu (100% immune to table/card scroll clipping) */}
      {activeMenu && createPortal(
        (() => {
          const item = activeMenu.item;
          const noticeCount = Number(item.noticeCount || 0);
          const daysOverdue = Number(item.daysOverdue || 0);

          return (
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: activeMenu.coords.top,
                bottom: activeMenu.coords.bottom,
                right: activeMenu.coords.right,
                zIndex: 9999,
              }}
              className="w-64 rounded-xl border border-border bg-card p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95"
            >
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/50 mb-1 gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                  Notice Actions
                </span>
                <span className="text-[10px] font-medium text-muted-foreground truncate">
                  {noticeCount === 0 ? "No notices sent" : `Notice ${noticeCount} active`}
                </span>
              </div>

              {/* Option 1: Send Notice 1 */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  handleOpenNoticeModal(item, 1);
                }}
                className="w-full flex items-center justify-between gap-2.5 rounded-lg p-2 text-left transition hover:bg-muted cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-sky-600 dark:text-sky-400">
                    <Clock size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-card-foreground truncate">Send Notice 1</p>
                    <p className="text-[10px] text-muted-foreground truncate">Friendly payment reminder</p>
                  </div>
                </div>
                {noticeCount >= 1 ? (
                  <span className="shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Sent</span>
                ) : noticeCount === 0 && daysOverdue < 30 ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold bg-card text-sky-600 dark:text-sky-400 border border-border">
                    Recommended
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">Ready</span>
                )}
              </button>

              {/* Option 2: Send Notice 2 */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  handleOpenNoticeModal(item, 2);
                }}
                className="w-full flex items-center justify-between gap-2.5 rounded-lg p-2 text-left transition hover:bg-muted cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-amber-600 dark:text-amber-400">
                    <AlertCircle size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-card-foreground truncate">Send Notice 2</p>
                    <p className="text-[10px] text-muted-foreground truncate">Urgent demand & penalty</p>
                  </div>
                </div>
                {noticeCount >= 2 ? (
                  <span className="shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Sent</span>
                ) : noticeCount === 1 ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold bg-card text-amber-600 dark:text-amber-400 border border-border">
                    Recommended
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">Ready</span>
                )}
              </button>

              {onEscalateToTermination && (
                <>
                  <div className="my-1 border-t border-border/50" />
                  {/* Option 3: Escalate to Termination Board */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenu(null);
                      onEscalateToTermination(item);
                    }}
                    className="w-full flex items-center justify-between gap-2.5 rounded-lg p-2 text-left transition hover:bg-muted cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-rose-600 dark:text-rose-400">
                        <ShieldAlert size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 truncate">
                          Escalate to Review Board
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Refer for lease termination
                        </p>
                      </div>
                    </div>
                    {(noticeCount >= 2 || daysOverdue >= 60) && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold bg-card text-rose-600 dark:text-rose-400 border border-border">
                        Recommended
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {/* Individual Dispatch Notice Modal */}
      {isModalOpen && selectedItemForNotice && (
        <DispatchNoticeModal
          isOpen={isModalOpen}
          item={selectedItemForNotice}
          targetStage={selectedTargetStage}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedItemForNotice(null);
          }}
          onDispatched={handleRefresh}
        />
      )}

      {/* Batch Dispatch Notice Modal */}
      {isBatchModalOpen && (
        <BatchDispatchNoticeModal
          isOpen={isBatchModalOpen}
          eligibleNotices={batchActionConfig.items.length > 0 ? batchActionConfig.items : filteredNotices}
          preselectedBillIds={selectedBillIds}
          targetStage={batchActionConfig.targetStage}
          onClose={() => {
            setIsBatchModalOpen(false);
          }}
          onDispatched={() => {
            setSelectedBillIds(new Set());
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}

