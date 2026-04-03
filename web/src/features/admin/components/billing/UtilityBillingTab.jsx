import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment } from "react";
import {
  Zap, Plus, Check, AlertTriangle, RefreshCw,
  ChevronDown, Trash2, X, Pencil, Save, Download,
  Activity, Wallet, TrendingUp, PieChart
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import {
  useUtilityRooms,
  useUtilityReadings,
  useUtilityLatestReading,
  useUtilityPeriods,
  useUtilityResult,
  useOpenUtilityPeriod,
  useUpdateUtilityPeriod,
  useCloseUtilityPeriod,
  useReviseUtilityResult,
  useDeleteUtilityReading,
  useUpdateUtilityReading,
  useDeleteUtilityPeriod,
} from "../../../../shared/hooks/queries/useUtility";
import { utilityApi } from "../../../../shared/api/utilityApi.js";
import { useBusinessSettings } from "../../../../shared/hooks/queries/useSettings";
import { exportToCSV } from "../../../../shared/utils/exportUtils.js";
import { getRoomLabel } from "../../../../shared/utils/roomLabel.js";
import { fmtDate } from "../../utils/formatters";
import BillingContentEmpty from "./shared/BillingContentEmpty";
import BillingRoomHeader from "./shared/BillingRoomHeader";
import BillingRoomList from "./shared/BillingRoomList";
import BillingStatusBadge from "./shared/BillingStatusBadge";
import InlineRateEditor from "./shared/InlineRateEditor";
import useBillingNotifier from "./shared/useBillingNotifier";
import "./UtilityBillingTab.css";

const EMPTY_VALUE = "-";
const WATER_BILLABLE_ROOM_TYPES = new Set(["private", "double-sharing"]);
const fmtCurrency = (val) =>
  val != null ? `PHP ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : EMPTY_VALUE;
const fmtNumber = (val, digits = 2) =>
  val != null
    ? Number(val).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : EMPTY_VALUE;
const fmtMonthYear = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "";
const fmtShortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
const getPeriodLabel = (period) => {
  if (!period) return "Billing Cycle";
  if (period.status === "open") return "Current Cycle";
  if (period.revised) return "Revised Cycle";
  return `${fmtMonthYear(period.startDate)} Cycle`;
};
const getDisplayStatus = (period) => period?.displayStatus || period?.status || "closed";
const getDisplayStatusLabel = (period) => {
  const status = getDisplayStatus(period);
  if (status === "ready") return "ready to send";
  return status;
};
const getRoomBadgeLabel = (room) => {
  if (!room) return "Closed";
  if (room.latestPeriodDisplayStatus === "ready") return "Ready To Send";
  if (room.hasOpenPeriod) return "Active";
  return "Closed";
};
const getCycleLabel = (period) =>
  period
    ? `${fmtShortDate(period.startDate)} - ${fmtShortDate(period.endDate || period.targetCloseDate) || "Ongoing"}`
    : EMPTY_VALUE;
const getMeterRangeLabel = (period, utilityType) =>
    period
      ? `${fmtNumber(period.startReading, 0)} ${utilityType === "electricity" ? "kWh" : "cu.m."} to ${period.endReading != null ? `${fmtNumber(period.endReading, 0)} ${utilityType === "electricity" ? "kWh" : "cu.m."}` : EMPTY_VALUE}`
      : EMPTY_VALUE;
const getExpectedPeriodEndDate = (period) => period?.endDate || period?.targetCloseDate || null;
const getPeriodRangeText = (period) => {
  if (!period) return EMPTY_VALUE;
  const endLabel = fmtShortDate(getExpectedPeriodEndDate(period));
  return `${fmtShortDate(period.startDate)} - ${endLabel || "Ongoing"}`;
};
const getSegmentPeriodLabel = (segment) => {
  if (!segment) return EMPTY_VALUE;
  if (segment.startDate && segment.endDate) {
    return `${fmtShortDate(segment.startDate)} - ${fmtShortDate(segment.endDate)}`;
  }
  return segment.periodLabel || EMPTY_VALUE;
};
const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getTodayInput = () => new Date().toISOString().slice(0, 10);

const ELECTRICITY_EXPORT_COLUMNS = [
  { key: "roomName", label: "Room" },
  { key: "branch", label: "Branch" },
  { key: "periodStart", label: "Period Start", formatter: (value) => (value ? fmtDate(value) : "") },
  { key: "periodEnd", label: "Period End", formatter: (value) => (value ? fmtDate(value) : "") },
  { key: "periodStatus", label: "Period Status" },
  { key: "ratePerUnit", label: "Rate / Unit", formatter: (value) => (value !== "" && value != null ? Number(value).toFixed(2) : "") },
  { key: "tenantName", label: "Tenant" },
  { key: "totalUsage", label: "Total Usage", formatter: (value) => (value !== "" && value != null ? Number(value).toFixed(2) : "") },
  { key: "billAmount", label: "Utility Charge", formatter: (value) => (value !== "" && value != null ? Number(value).toFixed(2) : "") },
  { key: "billStatus", label: "Bill Status" },
  { key: "dueDate", label: "Due Date", formatter: (value) => (value ? fmtDate(value) : "") },
  { key: "sentAt", label: "Sent At", formatter: (value) => (value ? fmtDate(value) : "") },
];

const UtilityBillingTab = ({ utilityType }) => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const dropdownRef = useRef(null);
  const notify = useBillingNotifier();

  /** Mask tenant name for privacy: "Leander Ponce" -> "Leander *****" */
  const maskName = (name) => {
    if (!name) return EMPTY_VALUE;
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0];
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    return `${first} ${"*".repeat(Math.max(last.length, 4))}`;
  };

  // Selection
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [branchFilter, setBranchFilter] = useState(isOwner ? "" : (user?.branch || ""));

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Panel / section state
  const [activePanel, setActivePanel] = useState(null);

  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null });
  const [editingRateId, setEditingRateId] = useState(null);
  const [editingRateValue, setEditingRateValue] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [detailVisibility, setDetailVisibility] = useState({
    segments: true,
    tenantSummary: true,
  });

  // Revision note modal
  const [reviseModal, setReviseModal] = useState({ open: false, periodId: null });
  const [revisionNote, setRevisionNote] = useState("");

  // Edit reading modal
  const [editReadingModal, setEditReadingModal] = useState({ open: false, reading: null });
  const [editReadingForm, setEditReadingForm] = useState({ reading: "", date: "", eventType: "move-in" });

  // Pagination
  const PERIODS_PER_PAGE = 5;
  const READINGS_PER_PAGE = 7;
  const [periodsPage, setPeriodsPage] = useState(1);
  const [readingsPage, setReadingsPage] = useState(1);
  const hasAutoSelectedPeriodRef = useRef(false);

  // Form state - billing periods default to 15th-to-15th cycle
  const get15th = () => {
    const d = new Date();
    d.setDate(15);
    return d.toISOString().slice(0, 10);
  };

  const getNext15th = (fromDateStr) => {
    const d = fromDateStr ? new Date(fromDateStr) : new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(15);
    return d.toISOString().slice(0, 10);
  };

  const [periodForm, setPeriodForm] = useState({
    startDate: get15th(), startReading: "", ratePerUnit: "",
    endReading: "", endDate: getNext15th(),
  });

  // Queries
  const { data: businessSettings } = useBusinessSettings(Boolean(user));
  const { data: roomsData, isLoading: roomsLoading } = useUtilityRooms(utilityType, branchFilter);
  const { data: readingsData } = useUtilityReadings(utilityType, selectedRoomId);
  const { data: latestData } = useUtilityLatestReading(utilityType, selectedRoomId);
  const { data: periodsData } = useUtilityPeriods(utilityType, selectedRoomId);
  const { data: resultData } = useUtilityResult(utilityType, selectedPeriodId);

  // Mutations
  const openPeriod = useOpenUtilityPeriod(utilityType);
  const updatePeriod = useUpdateUtilityPeriod(utilityType);
  const closePeriod = useCloseUtilityPeriod(utilityType);
  const reviseResult = useReviseUtilityResult(utilityType);
  const deleteReading = useDeleteUtilityReading(utilityType);
  const updateReading = useUpdateUtilityReading(utilityType);
  const deletePeriod = useDeleteUtilityPeriod(utilityType);

  const rooms = useMemo(() => {
    const list = roomsData?.rooms || [];
    if (utilityType !== "water") return list;
    return list.filter((room) => WATER_BILLABLE_ROOM_TYPES.has(room.type));
  }, [roomsData?.rooms, utilityType]);
  const readings = readingsData?.readings || [];
  const movementReadings = readings.filter((r) => r.eventType === "move-in" || r.eventType === "move-out");
  const periods = periodsData?.periods || [];
  const result = resultData?.result || null;
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const openPeriodForRoom = periods.find((p) => p.status === "open");
  const lastClosedPeriod = periods.find((p) => p.status === "closed" || p.status === "revised");
  const defaultRatePerUnit = utilityType === "electricity" ? (businessSettings?.defaultElectricityRatePerKwh ?? "") : (businessSettings?.defaultWaterRatePerUnit ?? "");

  const filteredRooms = useMemo(() => {
    let list = branchFilter ? rooms.filter((r) => r.branch === branchFilter) : rooms;
    if (sidebarSearch.trim()) {
      const q = sidebarSearch.trim().toLowerCase();
      list = list.filter((r) => getRoomLabel(r, "").toLowerCase().includes(q));
    }
    return list;
  }, [rooms, branchFilter, sidebarSearch]);

  // Paginated slices
  const totalPeriodPages = Math.max(1, Math.ceil(periods.length / PERIODS_PER_PAGE));
  const pagedPeriods = periods.slice((periodsPage - 1) * PERIODS_PER_PAGE, periodsPage * PERIODS_PER_PAGE);
  const totalReadingPages = Math.max(1, Math.ceil(movementReadings.length / READINGS_PER_PAGE));
  const pagedReadings = movementReadings.slice((readingsPage - 1) * READINGS_PER_PAGE, readingsPage * READINGS_PER_PAGE);

  useEffect(() => {
    if (filteredRooms.length === 0) { setSelectedRoomId(null); setSelectedPeriodId(null); return; }
    if (!selectedRoomId || !filteredRooms.some((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(filteredRooms[0].id);
    }
  }, [filteredRooms, selectedRoomId]);

  useEffect(() => {
    if (periods.length === 0) {
      setSelectedPeriodId(null);
      hasAutoSelectedPeriodRef.current = false;
      return;
    }

    const hasSelectedPeriod = periods.some((p) => p.id === selectedPeriodId);
    if (hasSelectedPeriod) {
      hasAutoSelectedPeriodRef.current = true;
      return;
    }

    if (!selectedPeriodId && hasAutoSelectedPeriodRef.current) {
      return;
    }

    const mostRecent = periods.find((p) => p.status === "closed" || p.status === "revised") || periods[0];
    if (mostRecent) {
      setSelectedPeriodId(mostRecent.id);
      hasAutoSelectedPeriodRef.current = true;
    }
  }, [periods, selectedPeriodId]);

  // Pagination component
  const Pagination = ({ page, total, onChange, countLabel }) => {
    if (total <= 1) return null;
    return (
      <div className="eb-pagination">
        <span className="eb-pagination__info">{countLabel}</span>
        <div className="eb-pagination__controls">
          <button className="eb-page-btn" onClick={() => onChange(page - 1)} disabled={page === 1}>&lt;</button>
          {Array.from({ length: total }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`eb-page-btn${page === n ? ' eb-page-btn--active' : ''}`}
              onClick={() => onChange(n)}
            >{n}</button>
          ))}
          <button className="eb-page-btn" onClick={() => onChange(page + 1)} disabled={page === total}>&gt;</button>
        </div>
      </div>
    );
  };

  // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Handlers ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬

  const selectAndFocusPeriod = (periodId) => {
    if (selectedPeriodId === periodId) {
      setSelectedPeriodId(null);
      return;
    }
    setSelectedPeriodId(periodId);
    setDetailVisibility({
      segments: true,
      tenantSummary: true,
    });
  };

  const beginRateEdit = (period) => {
    setEditingRateId(period.id);
    setEditingRateValue(String(period.ratePerUnit ?? ""));
  };

  const cancelRateEdit = () => {
    setEditingRateId(null);
    setEditingRateValue("");
  };

  const openPanel = (panel, extras = {}) => {
    setActivePanel(panel);
    if (panel === "newPeriod") {
      // If a closed period exists, continue from where it left off
      // (replicates what auto-chain would have set)
      const continuationDate = lastClosedPeriod?.endDate
        ? toInputDate(lastClosedPeriod.endDate)
        : null;
      const continuationReading = lastClosedPeriod?.endReading ?? null;
      const startDate = continuationDate || get15th();
      setPeriodForm(f => ({
        ...f,
        startReading: continuationReading ?? latestData?.reading ?? "",
        ratePerUnit:
          lastClosedPeriod?.ratePerUnit != null
            ? String(lastClosedPeriod.ratePerUnit)
            : defaultRatePerUnit !== undefined &&
              defaultRatePerUnit !== null &&
              defaultRatePerUnit !== ""
              ? String(defaultRatePerUnit)
              : "",
        startDate,
        endDate: getNext15th(startDate),
        endReading: "",
        ...extras,
      }));
    }
  };

  const closePanel = () => setActivePanel(null);

  useEffect(() => {
    if (activePanel === "closePeriod" && openPeriodForRoom) {
      setPeriodForm((f) => ({
        ...f,
        endDate: toInputDate(getExpectedPeriodEndDate(openPeriodForRoom)) || f.endDate,
      }));
    }
  }, [activePanel, openPeriodForRoom]);

  const handleSaveRate = async (periodId) => {
    try {
      await updatePeriod.mutateAsync({
        periodId,
        ratePerUnit: Number(editingRateValue),
      });
      notify.success("Billing period rate updated.");
      cancelRateEdit();
    } catch (err) {
      notify.error(err, "Failed to update billing period rate.");
    }
  };


  

  const handleEditReading = (r) => {
    setEditReadingForm({
      reading: String(r.reading),
      date: r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
      eventType: r.eventType || "move-in",
    });
    setEditReadingModal({ open: true, reading: r });
  };

  const handleSaveEditReading = async () => {
    const { reading } = editReadingModal;
    if (!editReadingForm.reading || !editReadingForm.date) {
      return notify.warn("Reading value and date are required.");
    }
    try {
      await updateReading.mutateAsync({
        readingId: reading.id,
        reading: Number(editReadingForm.reading),
        date: editReadingForm.date,
        eventType: editReadingForm.eventType,
      });
      notify.success("Reading updated.");
      setEditReadingModal({ open: false, reading: null });
    } catch (err) {
      notify.error(err, "Failed to update reading.");
    }
  };

  const handleDeleteReading = (readingId) => {
    setConfirmModal({
      open: true,
      title: "Delete Meter Reading",
      message: "This reading will be permanently removed. If it belongs to a closed period, click 'Re-run' afterward to update the billing result.",
      variant: "danger",
      confirmText: "Delete Reading",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await deleteReading.mutateAsync(readingId);
          notify.success("Reading permanently deleted.");
        } catch (err) {
          notify.error(err, "Failed to delete reading.");
        }
      },
    });
  };

  const handleDeletePeriod = (periodId) => {
    const targetPeriod = periods.find((p) => p.id === periodId);
    const isOpenPeriod = targetPeriod?.status === "open";
    const message = isOpenPeriod
      ? "This will delete the current open billing period (auto-created after the last close). You can re-create it with '+ New Billing Period' Ã¢â‚¬â€ the form will pre-fill from the last closed period."
      : "This will permanently delete the billing period AND all its meter readings and generated tenant bills. This cannot be undone.";
    setConfirmModal({
      open: true,
      title: "Delete Billing Period",
      message,
      variant: "danger",
      confirmText: "Delete Period",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await deletePeriod.mutateAsync(periodId);
          if (selectedPeriodId === periodId) {
            setSelectedPeriodId(null);
          }
          notify.success("Billing period permanently deleted.");
        } catch (err) {
          notify.error(err, "Failed to delete period.");
        }
      },
    });
  };

  const handleOpenPeriod = async () => {
    if (!periodForm.startReading || !periodForm.ratePerUnit) {
      return notify.warn("Start reading and rate are required.");
    }
    try {
      await openPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: periodForm.startDate,
        startReading: Number(periodForm.startReading),
        ratePerUnit: Number(periodForm.ratePerUnit),
      });
      notify.success("Billing period opened. Enter the final reading when the cycle ends.");
      closePanel();
    } catch (err) {
      notify.error(err, "Failed to create billing period.");
    }
  };

  const handleClosePeriod = async () => {
    if (!periodForm.endReading) {
      return notify.warn("End reading is required.");
    }
    if (!openPeriodForRoom) return;
    try {
      await closePeriod.mutateAsync({
        periodId: openPeriodForRoom.id,
        endReading: Number(periodForm.endReading),
        endDate: periodForm.endDate || new Date().toISOString().slice(0, 10),
      });
      notify.success("Period closed. Draft bills created.");
      closePanel();
      selectAndFocusPeriod(openPeriodForRoom.id);
    } catch (err) {
      notify.error(err, "Failed to close period.");
    }
  };

  const handleRevise = (periodId) => {
    setRevisionNote("");
    setReviseModal({ open: true, periodId });
  };

  const handleReviseConfirm = async () => {
    const { periodId } = reviseModal;
    setReviseModal({ open: false, periodId: null });
    try {
      await reviseResult.mutateAsync({ periodId, revisionNote });
      notify.success("Billing result revised.");
    } catch (err) {
      notify.error(err, "Failed to revise.");
    }
  };

  // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Draft bills handlers (expand-on-edit) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬

  const handleExportRows = async () => {
    try {
      setIsExporting(true);
      const response = await utilityApi.exportRows({
        branch: branchFilter || undefined,
      });
      const rows = response?.rows || [];
      if (!rows.length) {
        notify.warn("No electricity billing rows available for export.");
        return;
      }

      exportToCSV(
        rows,
        getExportColumns(utilityType),
        `${utilityType}_billing_${branchFilter || "all"}_${getTodayInput()}`,
      );
      notify.success(`Exported ${rows.length} electricity billing row${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      notify.error(error, "Failed to export electricity billing.");
    } finally {
      setIsExporting(false);
    }
  };

  const renderExpandedPeriodDetails = (period) => {
    if (!period || selectedPeriodId !== period.id) return null;
    const displayStatus = getDisplayStatus(period);

    return (
      <div className="eb-period-detail eb-period-detail--minimal">
        <div className="eb-minimal-header">
          <div className="eb-minimal-header__info">
             <span className={`eb-status-indicator eb-status-indicator--${displayStatus}`}>{getDisplayStatusLabel(period)}</span>
             <span className="eb-minimal-header__date">Meter Reading: {getMeterRangeLabel(period, utilityType)}</span>
          </div>
          <div className="eb-minimal-header__actions">
            <button
              className="eb-btn-text"
              onClick={() => setSelectedPeriodId(null)}
              title="Close Details"
            >
              Close
            </button>
          </div>
        </div>

        <div className="eb-period-detail__body eb-period-detail__body--minimal">
          {result ? (
            <>
              <div className="eb-minimal-stats">
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Total {utilityType === "electricity" ? "kWh" : "cu.m."}</span>
                  <span className="eb-minimal-stat__value">{fmtNumber(result.computedTotalUsage, 2)}</span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Room Cost</span>
                  <span className="eb-minimal-stat__value eb-minimal-stat__value--highlight">{fmtCurrency(result.totalRoomCost || result.computedTotalCost)}</span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Current Rate</span>
                  <span className="eb-minimal-stat__value">{fmtCurrency(result.ratePerUnit)} <small>/{utilityType === "electricity" ? "kWh" : "cu.m."}</small></span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Segments</span>
                  <span className="eb-minimal-stat__value">{result.segments?.length || 0}</span>
                </div>
              </div>

              <div className="eb-result-flow">
                <div className="eb-result-flow__header">
                  <div className="eb-result-flow__title">
                    <span className="eb-result-flow__text">Segment Breakdown</span>
                    {result.verified ? (
                      <span className="eb-verified-badge"><Check size={12} strokeWidth={2.5} /> Verified</span>
                    ) : (
                      <span className="eb-unverified-badge"><AlertTriangle size={12} strokeWidth={2.5} /> Unverified</span>
                    )}
                  </div>
                  <div className="eb-result-flow__actions">
                    <button
                      className="eb-btn-text eb-btn-text--subtle"
                      onClick={() => setDetailVisibility((current) => ({ ...current, segments: !current.segments }))}
                    >
                      {detailVisibility.segments ? "Hide segments" : "View segments"}
                    </button>
                    <button
                      className="eb-btn-text eb-btn-text--subtle"
                      onClick={() => setDetailVisibility((current) => ({ ...current, tenantSummary: !current.tenantSummary }))}
                    >
                      {detailVisibility.tenantSummary ? "Hide tenants" : "View tenants"}
                    </button>
                    <button
                      className="eb-btn-text eb-btn-text--primary"
                      onClick={() => handleRevise(selectedPeriodId)}
                      disabled={reviseResult.isPending}
                    >
                      <RefreshCw size={13} className={reviseResult.isPending ? "eb-spin" : ""} />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                <div className="eb-result-flow__content">
                  {detailVisibility.segments && (
                  <div className="eb-segment-grid">
                    {(result.segments || []).map((seg, index) => (
                      <div className="eb-table-fluid eb-segment-card" key={`${period.id}-segment-${index}`}>
                        <table className="eb-table-minimal eb-table-minimal--bordered">
                          <colgroup>
                            <col style={{ width: "45%" }} />
                            <col style={{ width: "25%" }} />
                            <col style={{ width: "30%" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ background: "#fdecda" }}>
                              <th colSpan="2" className="eb-text-strong" style={{ color: "#33261a", borderBottom: "1px solid #dcdcdc" }}>No. of occupants in the room:</th>
                              <th className="eb-align-center eb-text-strong" style={{ color: "#33261a", fontSize: "0.85rem", borderBottom: "1px solid #dcdcdc" }}>{seg.activeTenantCount}</th>
                            </tr>
                            <tr>
                              <th></th>
                              <th className="eb-align-center" style={{ fontWeight: 600, color: "#111" }}>Date</th>
                              <th className="eb-align-center" style={{ fontWeight: 600, color: "#111" }}>{utilityType === "electricity" ? "kwh" : "cu.m."}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ color: "#444" }}>1st reading</td>
                              <td className="eb-align-center">{seg.startDate ? new Date(seg.startDate).toLocaleDateString() : (seg.periodLabel || "").split(/\s*[-–]\s*/)[0] || "-"}</td>
                              <td className="eb-align-center">{fmtNumber(seg.readingFrom, 2)}</td>
                            </tr>
                            <tr>
                              <td style={{ color: "#444" }}>2nd reading</td>
                              <td className="eb-align-center">{seg.endDate ? new Date(seg.endDate).toLocaleDateString() : (seg.periodLabel || "").split(/\s*[-–]\s*/)[1] || "-"}</td>
                              <td className="eb-align-center">{fmtNumber(seg.readingTo, 2)}</td>
                            </tr>
                            <tr>
                              <td style={{ fontStyle: "italic", color: "#555" }}>Total consumption</td>
                              <td className="eb-align-center" style={{ borderBottom: "none" }}></td>
                              <td className="eb-align-center">{fmtNumber(seg.unitsConsumed, 2)}</td>
                            </tr>
                            <tr>
                              <td colSpan="2" style={{ color: "#444" }}>Amount due (Php {fmtNumber(result.ratePerUnit, 2)} / {utilityType === "electricity" ? "kwh" : "cu.m."}) per person</td>
                              <td className="eb-align-center eb-text-strong" style={{ fontSize: "0.85rem" }}>{fmtCurrency(seg.sharePerTenantCost)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                  )}

                  {detailVisibility.tenantSummary && (
                    <div className="eb-section-divider">
                      <div className="eb-table-fluid">
                        <table className="eb-table-minimal w-100">
                          <colgroup>
                            <col style={{ width: "46%" }} />
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "32%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Tenant Name</th>
                              <th className="eb-align-right">Total {utilityType === "electricity" ? "kWh" : "cu.m."}</th>
                              <th className="eb-align-right">Bill Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(result.tenantSummaries || []).map((tenant, index) => (
                              <tr key={`${period.id}-tenant-${index}`}>
                                <td>{tenant.tenantName}</td>
                                <td className="eb-align-right">{fmtNumber(tenant.totalUsage, 4)}</td>
                                <td className="eb-align-right eb-text-strong">{fmtCurrency(tenant.billAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="eb-cycle-panel__empty">
              Segment details are not available for this billing cycle yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="bw-summary-bar">
      <div className="bw-summary-bar__left">
        <span className="bw-summary-bar__mode"><Zap size={13} /> {utilityType === "electricity" ? "Electricity" : "Water"}</span>
        {branchFilter && <span className="bw-summary-bar__branch">{branchFilter}</span>}
      </div>
      <div className="bw-summary-bar__counts">
        <span className="bw-count bw-count--open">{filteredRooms.filter(r => r.hasOpenPeriod).length} open</span>
        <span className="bw-count bw-count--ready">{filteredRooms.filter(r => r.latestPeriodDisplayStatus === "ready").length} ready</span>
        <span className="bw-count bw-count--neutral">{filteredRooms.length} rooms</span>
      </div>
      <div className="bw-summary-bar__actions">
        <button type="button" className="eb-btn eb-btn--ghost" onClick={handleExportRows} disabled={isExporting}><Download size={13} /> {isExporting ? "Exporting..." : "Export"}</button>
      </div>
    </div>

    <div className="eb-layout">

      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Sidebar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
      <aside className="eb-sidebar">
        <div className="eb-sidebar__header">
          <span className="eb-sidebar__title"><Zap size={13} /> Rooms</span>
          {isOwner && (
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setSelectedRoomId(null); setSelectedPeriodId(null); }}
              className="eb-sidebar__filter"
            >
              <option value="">All</option>
              <option value="gil-puyat">Gil-Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>
          )}
        </div>

        {/* Search */}
        <div className="eb-sidebar__search-wrap">
          <input
            type="text"
            className="eb-sidebar__search"
            placeholder="Search rooms..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            aria-label="Search rooms"
          />
        </div>

        <div className="eb-sidebar__list">
          {roomsLoading ? (
            <div className="eb-skeleton-list">
              {[1,2,3,4,5].map(i => <div key={i} className="eb-skeleton-card" />)}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="eb-sidebar__empty">
              {sidebarSearch ? "No rooms match your search" : "No rooms found"}
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isEmpty = !room.hasActiveTenants;
              return (
                <button
                  key={room.id}
                  className={`eb-room${selectedRoomId === room.id ? " eb-room--active" : ""}`}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setPeriodsPage(1);
                    setReadingsPage(1);
                    closePanel();
                  }}
                >
                  <div className="eb-room__top-row">
                    <span className="eb-room__name">{getRoomLabel(room)}</span>
                    <span
                      className={`eb-room__dot${room.hasActiveTenants ? " eb-room__dot--active" : ""}`}
                      title={room.hasActiveTenants ? "Has active tenants" : "No tenants"}
                    />
                  </div>
                  <div className="eb-room__bottom-row">
                    <span className={`eb-room__badge${room.hasOpenPeriod ? " eb-room__badge--open" : ""}${isEmpty ? " eb-room__badge--empty" : ""}`}>
                      {getRoomBadgeLabel(room)}
                    </span>
                    {room.latestReading != null && (
                      <span className="eb-room__kwh">{room.latestReading} {utilityType === "electricity" ? "kWh" : "cu.m."}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Main ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
      <main className="eb-main">
        {!selectedRoomId ? (
          <div className="eb-empty-state">
            <Zap size={40} strokeWidth={1.5} />
            <p>Select a room to manage electricity billing</p>
          </div>
        ) : (
          <div className="eb-content">

            {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Room Header ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
            <div className="eb-header">
              <div className="eb-header__left">
                <h2 className="eb-header__title">{getRoomLabel(selectedRoom)}</h2>
                <span className="eb-header__branch">{selectedRoom?.branch}</span>
                {selectedRoom?.type && <span className="eb-header__room-type">{selectedRoom.type}</span>}
              </div>
            </div>
            <div className="bw-overview-card">
              <div className="bw-overview-metric">
                <span className="bw-overview-metric__label">Latest Reading</span>
                <span className="bw-overview-metric__value">
                  {latestData?.reading != null ? fmtNumber(latestData.reading, 0) : "â€”"}
                  <small> {utilityType === "electricity" ? "kWh" : "cu.m."}</small>
                </span>
              </div>
              <div className="bw-overview-metric">
                <span className="bw-overview-metric__label">Cycle Status</span>
                <span className="bw-overview-metric__value">
                  {openPeriodForRoom ? "Open" : lastClosedPeriod ? "Closed" : "No periods"}
                </span>
              </div>
              <div className="bw-overview-metric">
                <span className="bw-overview-metric__label">Total Periods</span>
                <span className="bw-overview-metric__value">{periods.length}</span>
              </div>
              <div className="bw-overview-metric">
                <span className="bw-overview-metric__label">Readings</span>
                <span className="bw-overview-metric__value">{movementReadings.length}</span>
              </div>
            </div>

            {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â
                SECTION 1 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Active Billing Cycle
            ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â */}

            {/* Status Banner */}
            <section className={`eb-status-banner ${openPeriodForRoom ? "eb-status-banner--open" : "eb-status-banner--empty"}`}>
              <div>
                <div className="eb-status-banner__eyebrow">{openPeriodForRoom ? "Active Billing Period" : "No Active Period"}</div>
                <div className="eb-status-banner__title">
                  {openPeriodForRoom
                    ? `Cycle ${getPeriodRangeText(openPeriodForRoom)} | Start: ${openPeriodForRoom.startReading} ${utilityType === "electricity" ? "kWh" : "cu.m."} | Rate: ${fmtCurrency(openPeriodForRoom.ratePerUnit)}/${utilityType === "electricity" ? "kWh" : "cu.m."}`
                    : lastClosedPeriod
                      ? `Last closed: ${fmtDate(lastClosedPeriod.endDate || lastClosedPeriod.startDate)}`
                      : "No billing period has been created for this room yet."}
                </div>
              </div>
              <div className="eb-status-banner__actions">
                {openPeriodForRoom ? (
                  <>
                    <button className="eb-btn eb-btn--primary" onClick={() => openPanel("closePeriod")}>
                      <Check size={13} /> Enter Final Reading
                    </button>
                  </>
                ) : (
                  <button className="eb-btn eb-btn--primary" onClick={() => openPanel("newPeriod")}>
                    <Plus size={13} /> New Billing Period
                  </button>
                )}
              </div>
            </section>

                        {activePanel === "newPeriod" && (
              <div className="eb-panel">
                <div className="eb-panel__header">
                  <span>New Billing Period</span>
                  <button className="eb-panel__close" onClick={closePanel}><X size={15} /></button>
                </div>
                <div className="eb-panel__body">
                  <p className="eb-panel__hint">Start a new billing cycle. You'll enter the final reading when the cycle ends.</p>
                  <div className="eb-form-row">
                    <div className="eb-field">
                      <label>Start Date</label>
                      <input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
                    </div>
                    <div className="eb-field">
                      <label>Start Reading ({utilityType === "electricity" ? "kWh" : "cu.m."})</label>
                      <input
                        type="number"
                        value={periodForm.startReading}
                        onChange={(e) => setPeriodForm({ ...periodForm, startReading: e.target.value })}
                        placeholder={latestData?.reading != null ? `Last: ${latestData.reading}` : "e.g. 1200"}
                        autoFocus
                      />
                    </div>
                    <div className="eb-field">
                      <label>Rate (PHP/{utilityType === "electricity" ? "kWh" : "cu.m."})</label>
                      <input type="number" step="0.01" value={periodForm.ratePerUnit} onChange={(e) => setPeriodForm({ ...periodForm, ratePerUnit: e.target.value })} placeholder="e.g. 16.00" />
                    </div>
                  </div>
                  <div className="eb-panel__footer">
                    <button
                      className="eb-btn eb-btn--primary"
                      onClick={handleOpenPeriod}
                      disabled={openPeriod.isPending}
                    >
                      {openPeriod.isPending ? "Processing..." : "Start Billing Period"}
                    </button>
                    <button className="eb-btn eb-btn--ghost" onClick={closePanel}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {activePanel === "closePeriod" && openPeriodForRoom && (
              <div className="eb-panel eb-panel--warning">
                <div className="eb-panel__header">
                  <span>Enter Final Reading</span>
                  <button className="eb-panel__close" onClick={closePanel}><X size={15} /></button>
                </div>
                <div className="eb-panel__body">
                  <p className="eb-panel__hint">
                    Cycle {getPeriodRangeText(openPeriodForRoom)} | {openPeriodForRoom.startReading} {utilityType === "electricity" ? "kWh" : "cu.m."} | {fmtCurrency(openPeriodForRoom.ratePerUnit)}/{utilityType === "electricity" ? "kWh" : "cu.m."}
                  </p>
                  <div className="eb-form-row">
                    <div className="eb-field">
                      <label>Final Meter Reading ({utilityType === "electricity" ? "kWh" : "cu.m."})</label>
                      <input
                        type="number"
                        value={periodForm.endReading}
                        onChange={(e) => setPeriodForm({ ...periodForm, endReading: e.target.value })}
                        placeholder={latestData?.reading != null ? `Last: ${latestData.reading}` : "Enter final reading"}
                        autoFocus
                      />
                    </div>
                    <div className="eb-field">
                      <label>End Date</label>
                      <input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="eb-panel__footer">
                    <button className="eb-btn eb-btn--primary" onClick={handleClosePeriod} disabled={closePeriod.isPending}>
                      {closePeriod.isPending ? "Computing..." : "Close & Create Drafts"}
                    </button>
                    <button className="eb-btn eb-btn--ghost" onClick={closePanel}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Move-In / Move-Out Readings */}
            <section className="eb-section">
              <div className="eb-section__header">
                <h3 className="eb-section__title eb-section__title--primary">
                  Move-In / Move-Out Readings
                  <span className="eb-section__count" style={{ marginLeft: 6, textTransform: "none", letterSpacing: 0, fontWeight: "normal" }}>
                    {movementReadings.length}
                  </span>
                </h3>
              </div>
              <div className="eb-section-body" style={{ marginTop: "12px" }}>
                {movementReadings.length === 0 ? (
                  <p className="eb-empty-hint">No move-in or move-out readings recorded yet.</p>
                ) : (
                  <>
                    <div className="eb-table-wrap">
                      <table className="eb-table">
                        <colgroup>
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "25%" }} />
                          <col />
                          <col style={{ width: "36px" }} />
                          <col style={{ width: "36px" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Reading</th>
                            <th>Event</th>
                            <th>Tenant</th>
                            <th>Recorded By</th>
                            <th></th>
                          <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedReadings.map((r) => (
                            <tr key={r.id}>
                              <td>{fmtDate(r.date)}</td>
                              <td>{r.reading} <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{utilityType === "electricity" ? "kWh" : "cu.m."}</span></td>
                              <td>
                                <span className={`eb-event-tag eb-event-tag--${r.eventType}`}>
                                  {r.eventType === "move-in" ? "Move-In" : r.eventType === "move-out" ? "Move-Out" : "Regular"}
                                </span>
                              </td>
                              <td className="eb-cell--muted">{maskName(r.tenant)}</td>
                              <td className="eb-cell--muted">{r.recordedBy}</td>
                              <td>
                                <button
                                  className="eb-icon-btn eb-icon-btn--muted"
                                  title="Edit reading"
                                  onClick={() => handleEditReading(r)}
                                >
                                  <Pencil size={13} />
                                </button>
                              </td>
                              <td>
                                <button
                                  className="eb-icon-btn eb-icon-btn--danger"
                                  title="Delete reading"
                                  onClick={() => handleDeleteReading(r.id)}
                                  disabled={deleteReading.isPending}
                                >
                                  {deleteReading.isPending ? "..." : <Trash2 size={13} />}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={readingsPage}
                      total={totalReadingPages}
                      onChange={setReadingsPage}
                      countLabel={`${movementReadings.length} reading${movementReadings.length !== 1 ? "s" : ""}`}
                    />
                  </>
                )}
              </div>
            </section>

            {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â
                SECTION 2 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Segment Breakdown & Draft Bills
                Driven by selectedPeriodId (auto = most recent closed/revised)
            ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â */}
            

            {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â
                SECTION 3 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Billing Cycle History
                Clicking a row updates Section 2 above
            ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢Ãƒâ€šÃ‚Â */}
            {periods.length > 0 && (
              <section className="eb-section eb-section--primary">
                <div className="eb-section__header">
                  <h3 className="eb-section__title eb-section__title--primary">
                    <Zap size={14} style={{ color: "var(--color-info, #2563eb)" }} />
                    Billing Cycle History
                  </h3>
                  <span className="eb-section__count">{periods.length} period{periods.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="eb-table-wrap">
                  <table className="eb-table">
                    <colgroup>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Cycle</th>
                        <th>Meter</th>
                        <th>Rate</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPeriods.map((p) => (
                        <Fragment key={p.id}>
                          <tr
                            className={[
                              selectedPeriodId === p.id ? "eb-row--selected" : "",
                              p.status === "open" ? "eb-row--open" : "",
                            ].join(" ").trim()}
                            onClick={() => (p.status === "closed" || p.status === "revised") && selectAndFocusPeriod(p.id)}
                            style={{ cursor: (p.status === "closed" || p.status === "revised") ? "pointer" : "default" }}
                            title={(p.status === "closed" || p.status === "revised") ? "Click to view this billing cycle" : undefined}
                          >
                            <td>
                              <div className="eb-period-summary">
                                <strong className="eb-period-label__title">{getCycleLabel(p)}</strong>
                                <span className="eb-period-summary__meta">
                                  {p.status === "closed" || p.status === "revised"
                                    ? "Check-in start to billing end"
                                    : "Current active cycle"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="eb-period-summary">
                                <span className="eb-period-summary__value">{getMeterRangeLabel(p, utilityType)}</span>
                              </div>
                            </td>
                            <td>
                              <span className="eb-rate-display">{fmtCurrency(p.ratePerUnit)}</span>
                            </td>
                            <td>
                              <span className={`eb-status-pill eb-status-pill--${getDisplayStatus(p)}`}>{getDisplayStatusLabel(p)}</span>
                              {p.revised ? <span className="eb-revised-tag">edited</span> : null}
                            </td>
                            <td className="eb-cell--actions" style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                              {(p.status === "closed" || p.status === "revised") && (
                                <button
                                  className="eb-btn eb-btn--xs eb-btn--outline"
                                  onClick={() => selectAndFocusPeriod(p.id)}
                                >
                                  {selectedPeriodId === p.id ? "Hide Details" : "View Details"}
                                </button>
                              )}
                              {p.status === "open" && (
                                editingRateId === p.id ? (
                                  <div className="eb-rate-editor" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="eb-inline-input eb-inline-input--rate"
                                      value={editingRateValue}
                                      onChange={(e) => setEditingRateValue(e.target.value)}
                                    />
                                    <button className="eb-btn eb-btn--xs eb-btn--primary" onClick={() => handleSaveRate(p.id)} disabled={updatePeriod.isPending}>
                                      <Save size={10} /> Save
                                    </button>
                                    <button className="eb-btn eb-btn--xs eb-btn--ghost" onClick={cancelRateEdit}>Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    className="eb-btn eb-btn--xs eb-btn--outline"
                                    onClick={() => beginRateEdit(p)}
                                  >
                                    <Pencil size={11} /> Edit Rate
                                  </button>
                                )
                              )}
                              {(p.status === "closed" || p.status === "revised") && (
                                <button
                                  className="eb-btn eb-btn--xs eb-btn--ghost"
                                  onClick={() => handleRevise(p.id)}
                                  disabled={reviseResult.isPending}
                                >
                                  <RefreshCw size={11} /> Re-run
                                </button>
                              )}
                              <button
                                className="eb-btn eb-btn--xs eb-btn--danger"
                                onClick={() => handleDeletePeriod(p.id)}
                                disabled={deletePeriod.isPending}
                              >
                                <Trash2 size={11} /> {deletePeriod.isPending ? "Deleting..." : "Delete"}
                              </button>
                            </td>
                          </tr>
                          {selectedPeriodId === p.id && (p.status === "closed" || p.status === "revised") && (
                            <tr className="eb-history-detail-row">
                              <td colSpan={5} className="eb-history-detail-cell">
                                {renderExpandedPeriodDetails(p)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={periodsPage}
                  total={totalPeriodPages}
                  onChange={setPeriodsPage}
                  countLabel={`${periods.length} total period${periods.length !== 1 ? "s" : ""}`}
                />
              </section>
            )}

          </div>
        )}
      </main>
    </div>
    {/* Edit Reading Modal */}
    {editReadingModal.open && (
      <div className="eb-modal-overlay" onClick={() => setEditReadingModal({ open: false, reading: null })}>
        <div className="eb-modal" onClick={e => e.stopPropagation()}>
          <div className="eb-modal__header">
            <span>Edit Meter Reading</span>
            <button className="eb-panel__close" onClick={() => setEditReadingModal({ open: false, reading: null })}><X size={15} /></button>
          </div>
          <div className="eb-modal__body">
            <div className="eb-form-row">
              <div className="eb-field">
                <label>Reading ({utilityType === "electricity" ? "kWh" : "cu.m."})</label>
                <input
                  type="number"
                  value={editReadingForm.reading}
                  onChange={(e) => setEditReadingForm({ ...editReadingForm, reading: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="eb-field">
                <label>Date</label>
                <input type="date" value={editReadingForm.date} onChange={(e) => setEditReadingForm({ ...editReadingForm, date: e.target.value })} />
              </div>
              <div className="eb-field">
                <label>Event</label>
                <select value={editReadingForm.eventType} onChange={(e) => setEditReadingForm({ ...editReadingForm, eventType: e.target.value })}>
                  <option value="move-in">Move-In</option>
                  <option value="move-out">Move-Out</option>
                  <option value="regular-billing">Regular</option>
                </select>
              </div>
            </div>
          </div>
          <div className="eb-modal__footer">
            <button className="eb-btn eb-btn--primary" onClick={handleSaveEditReading} disabled={updateReading.isPending}>
              <Check size={13} /> {updateReading.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button className="eb-btn eb-btn--ghost" onClick={() => setEditReadingModal({ open: false, reading: null })}>Cancel</button>
          </div>
        </div>
      </div>
    )}

    {/* Standard confirm modal */}
    <ConfirmModal
      isOpen={confirmModal.open}
      onClose={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      onConfirm={confirmModal.onConfirm}
      title={confirmModal.title}
      message={confirmModal.message}
      variant={confirmModal.variant || "danger"}
      confirmText={confirmModal.confirmText || "Confirm"}
    />

    {/* Revision note modal */}
    {reviseModal.open && (
      <div className="eb-modal-overlay" onClick={() => setReviseModal({ open: false, periodId: null })}>
        <div className="eb-modal" onClick={e => e.stopPropagation()}>
          <div className="eb-modal__header">
            <span>Re-run Billing Computation</span>
            <button className="eb-panel__close" onClick={() => setReviseModal({ open: false, periodId: null })}><X size={15} /></button>
          </div>
          <div className="eb-modal__body">
            <p style={{ marginBottom: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              This will re-compute billing for this closed period using the current meter readings. Add a note to explain why.
            </p>
            <div className="eb-field">
              <label>Revision Note (optional)</label>
              <input
                type="text"
                value={revisionNote}
                onChange={e => setRevisionNote(e.target.value)}
                placeholder="e.g. Corrected reading entered on Mar 15"
                autoFocus
              />
            </div>
          </div>
          <div className="eb-modal__footer">
            <button className="eb-btn eb-btn--primary" onClick={handleReviseConfirm} disabled={reviseResult.isPending}>
              <RefreshCw size={13} /> {reviseResult.isPending ? "Re-running..." : "Re-run Computation"}
            </button>
            <button className="eb-btn eb-btn--ghost" onClick={() => setReviseModal({ open: false, periodId: null })}>Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default UtilityBillingTab;
