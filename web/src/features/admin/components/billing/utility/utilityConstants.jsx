import {
  formatDate,
  fmtDate,
  formatDateTime as fmtFullDateTime,
} from "../../../../../shared/utils/formatDate";
import {
  Zap,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  CheckCheck,
  Info,
} from "lucide-react";
import {
  isUtilityEventType,
  normalizeUtilityEventType,
} from "../../../../../shared/utils/lifecycleNaming";
import {
  formatAdminPaymentMode,
  getNormalizedBillSnapshot as getSharedNormalizedBillSnapshot,
  getNormalizedPaidState as getSharedNormalizedPaidState,
  resolvePaymentDetails as resolveSharedPaymentDetails,
  buildPaymentLedgerByBillId,
} from "../paymentDisplay";

export {
  formatDate,
  fmtDate,
  fmtFullDateTime,
  buildPaymentLedgerByBillId,
};

export const EMPTY_VALUE = "—";
export const WATER_BILLABLE_ROOM_TYPES = new Set(["private", "double-sharing"]);
export const MAX_METER_READING = 999999.99;
export const MAX_ELECTRICITY_RATE = 100.0;
export const MAX_WATER_RATE = 100000.0;
export const MAX_CYCLE_USAGE = 50000.0;

export const sanitizeNumericInput = (val, maxDecimals = 2, maxWholeDigits = 6) => {
  if (!val) return "";
  let clean = String(val).replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  if (parts.length > 2) {
    clean = parts[0] + "." + parts.slice(1).join("");
  }
  const [whole, decimal] = clean.split(".");
  const limitedWhole = whole ? whole.slice(0, maxWholeDigits) : "";
  if (decimal !== undefined) {
    return `${limitedWhole}.${decimal.slice(0, maxDecimals)}`;
  }
  return limitedWhole;
};

export const getInitials = (name) => {
  if (!name) return "TN";
  const parts = String(name).trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
};

export const getRoomFloor = (r) => {
  if (!r) return "1";
  if (r.floor != null && r.floor !== "") return String(r.floor);
  const identifier = String(r.roomNumber || r.name || r.id || "");
  const match = identifier.match(/\b([1-9])\d{2}\b/) || identifier.match(/(\d{3,4})/);
  if (match) {
    const digits = match[1] || match[0];
    if (digits.length === 3) return digits[0];
    if (digits.length === 4) return digits.substring(0, 2);
  }
  const leadingDigit = identifier.match(/([1-9])/);
  if (leadingDigit) return leadingDigit[1];
  return "1";
};

export const fmtCurrency = (val) =>
  val != null
    ? `PHP ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : EMPTY_VALUE;

export const fmtNumber = (val, digits = 2) =>
  val != null
    ? Number(val).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : EMPTY_VALUE;

export const fmtMonthYear = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "";

export const fmtShortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

export const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const getTodayInput = () => toInputDate(new Date());

export const getCycleLabel = (period) =>
  period
    ? `${fmtShortDate(period.startDate)} - ${fmtShortDate(period.endDate || period.targetCloseDate) || "Ongoing"}`
    : EMPTY_VALUE;

export const getPeriodLabel = (period) => {
  if (!period) return "Billing Cycle";
  if (period.status === "open") return "Current Cycle";
  if (period.revised) return "Revised Cycle";
  return `${fmtMonthYear(period.startDate)} Cycle`;
};

export const getDisplayStatus = (period) =>
  period?.billingState || period?.displayStatus || period?.status || "closed";

export const getDisplayStatusLabel = (period) => {
  const status = getDisplayStatus(period);
  if (status === "ready_to_send" || status === "ready") return "Ready to Send";
  if (status === "sent" || status === "finalized") return "Sent";
  if (status === "no_active_cycle") return "No Active Bill";
  if (status === "open") return "Active";
  return status ? String(status).replace(/-/g, " ") : "Closed";
};

export const getDisplayStatusIcon = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "sent" || s === "finalized") {
    return <CheckCheck size={12} className="shrink-0 text-slate-500" />;
  }
  if (s === "ready_to_send" || s === "ready") {
    return <Send size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (s === "paid") {
    return <CheckCircle2 size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (s === "overdue") {
    return <AlertTriangle size={12} className="shrink-0 text-rose-600 dark:text-rose-400" />;
  }
  if (s === "partially-paid" || s === "partially_paid") {
    return <Clock3 size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  if (s === "open") {
    return <Zap size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  return <Info size={12} className="shrink-0 text-slate-400" />;
};

/**
 * Transparent status badge style with semantic text and neutral solid 1px border.
 * Adheres to Lilycrest color objectives: no colorful background boxes, no colored glow borders.
 */
export const getHistoryStatusClasses = (status) => {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "sent":
    case "finalized":
      return "text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-transparent font-medium";
    case "ready_to_send":
    case "ready":
      return "text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 bg-transparent font-semibold";
    case "open":
    case "paid":
      return "text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 bg-transparent font-semibold";
    case "overdue":
      return "text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700 bg-transparent font-semibold";
    case "partially-paid":
    case "partially_paid":
    case "revised":
      return "text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700 bg-transparent font-semibold";
    case "no_active_cycle":
    default:
      return "text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-transparent font-normal";
  }
};

export const getRoomStatusInfo = (room) => {
  const status = String(room?.billingState || room?.displayStatus || "no_active_cycle").toLowerCase();
  switch (status) {
    case "ready_to_send":
    case "ready":
      return {
        label: "Ready to send",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "sent":
    case "finalized":
      return {
        label: "Sent",
        dotClass: "bg-slate-400",
        textClass: "text-slate-600 dark:text-slate-400",
      };
    case "open":
      return {
        label: "Active cycle",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "paid":
      return {
        label: "Paid",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "overdue":
      return {
        label: "Overdue",
        dotClass: "bg-rose-500",
        textClass: "text-rose-700 dark:text-rose-400",
      };
    case "partially-paid":
    case "partially_paid":
    case "revised":
      return {
        label: "Revised",
        dotClass: "bg-amber-500",
        textClass: "text-amber-700 dark:text-amber-400",
      };
    case "no_active_cycle":
    default:
      return {
        label: "No active bill",
        dotClass: "bg-slate-300 dark:bg-slate-600",
        textClass: "text-slate-500 dark:text-slate-400",
      };
  }
};

export const getRoomBadgeLabel = (room) => {
  if (!room) return "No active bill";
  return room.billingLabel || getRoomStatusInfo(room).label;
};

export const canEditPeriod = (period) =>
  Boolean(period) && period.calculationVersion !== "water-meter-v1" && (period.canEdit ?? getDisplayStatus(period) !== "sent");

export const canDeletePeriod = (period) => Boolean(period) && getDisplayStatus(period) !== "sent";

export const getMeterRangeLabel = (period, utilityType) =>
  period
    ? utilityType === "water" && period.calculationVersion !== "water-meter-v1"
      ? `${fmtCurrency(period.ratePerUnit)} total water charge`
      : `${fmtNumber(period.startReading, utilityType === "water" ? 4 : 2)} ${utilityType === "electricity" ? "kWh" : "m³"} to ${period.endReading != null ? `${fmtNumber(period.endReading, utilityType === "water" ? 4 : 2)} ${utilityType === "electricity" ? "kWh" : "m³"}` : EMPTY_VALUE}`
    : EMPTY_VALUE;

export const getExpectedPeriodEndDate = (period) =>
  period?.endDate || period?.targetCloseDate || null;

export const getPeriodRangeText = (period) => {
  if (!period) return EMPTY_VALUE;
  const endLabel = fmtShortDate(getExpectedPeriodEndDate(period));
  return `${fmtShortDate(period.startDate)} - ${endLabel || "Ongoing"}`;
};

export const getSegmentPeriodLabel = (segment) => {
  if (!segment) return EMPTY_VALUE;
  if (segment.startDate && segment.endDate) {
    return `${fmtShortDate(segment.startDate)} - ${fmtShortDate(segment.endDate)}`;
  }
  return segment.periodLabel || EMPTY_VALUE;
};

export const getEventDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const EVENT_TYPE_LABELS = {
  moveIn: "Tenant Move In",
  moveOut: "Tenant Move Out",
  regularBilling: "Mid-Cycle Reading",
  periodStart: "Opening Meter Reading",
  periodEnd: "Closing Meter Reading",
  manualAdjustment: "Meter Correction",
  roomTransfer: "Room Transfer",
};

export const EVENT_TYPE_ORDER = {
  moveOut: 0,
  roomTransfer: 0,
  regularBilling: 1,
  periodStart: 1,
  periodEnd: 1,
  manualAdjustment: 1,
  moveIn: 2,
};

export const getEventTypeLabel = (eventType) =>
  EVENT_TYPE_LABELS[normalizeUtilityEventType(eventType)] ||
  eventType ||
  EMPTY_VALUE;

export const getEventTypeOrder = (eventType) =>
  EVENT_TYPE_ORDER[normalizeUtilityEventType(eventType)] ?? 1;

export const isMoveLifecycleEvent = (eventType) =>
  isUtilityEventType(eventType, "moveIn") ||
  isUtilityEventType(eventType, "moveOut") ||
  eventType === "roomTransfer";

export const isSystemBoundaryEvent = (eventType) =>
  isUtilityEventType(eventType, "periodStart") ||
  isUtilityEventType(eventType, "periodEnd");

export const getReadingStatusLabel = (reading) => {
  if (!reading) return "Recorded";
  if (reading.readingStatus === "voided") return "Canceled";
  if (reading.readingStatus === "corrected") return "Revised";
  if (reading.readingStatus === "locked" || reading.isLocked) return "Finalized";
  return "Editable Draft";
};

export const getTimelineRecordLabel = (row) => {
  if (!row) return EMPTY_VALUE;
  if (row.source === "transfer") return "Room Change";
  if (row.source === "merged") return "System Linked";
  if (row.source === "occupancy") return "Tenant Activity";
  if (row.source === "meter") return "Submeter Log";
  return row.source || EMPTY_VALUE;
};

export const getTimelineStatusLabel = (row) => {
  if (!row) return EMPTY_VALUE;
  if (row.source === "transfer") {
    const m = row.transferMeta;
    return m?.billStatus ? m.billStatus.charAt(0).toUpperCase() + m.billStatus.slice(1) : "Settled";
  }
  if (row.source === "occupancy") {
    if (isUtilityEventType(row.eventType, "moveIn")) {
      return row.isActive ? "Active Tenant" : "Vacated";
    }
    if (isUtilityEventType(row.eventType, "moveOut")) return "Vacated";
  }
  if (row.rawReading) return getReadingStatusLabel(row.rawReading);
  return EMPTY_VALUE;
};

export const getTimelineDotClasses = (eventType) => {
  const normalized = normalizeUtilityEventType(eventType);
  if (normalized === "moveIn") return "bg-amber-500";
  if (normalized === "moveOut") return "bg-rose-500";
  if (normalized === "periodStart") return "bg-emerald-500";
  if (normalized === "periodEnd") return "bg-rose-500";
  if (eventType === "roomTransfer") return "bg-sky-500";
  return "bg-slate-400";
};

export const getBillDaysOverdue = (bill) => {
  if (!bill?.dueDate || bill?.status === "paid") return 0;
  const dueDate = new Date(bill.dueDate);
  if (Number.isNaN(dueDate.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
  return diffDays > 0 ? diffDays : 0;
};

export const canSendBillReminder = (bill) =>
  Boolean(
    bill &&
      !getSharedNormalizedPaidState(bill).isPaid &&
      ["pending", "partially-paid", "overdue"].includes(bill.status),
  );

export const getBillPenaltyAmount = (bill) => Number(bill?.charges?.penalty || 0);

export const canSendPenaltyNotice = (bill) =>
  Boolean(bill && !getSharedNormalizedPaidState(bill).isPaid && getBillPenaltyAmount(bill) > 0);

export const getPenaltyReason = (bill) => {
  if (!canSendPenaltyNotice(bill)) return "";
  const daysLate = Number(bill?.penaltyDetails?.daysLate || 0);
  const ratePerDay = Number(bill?.penaltyDetails?.ratePerDay || 0);
  if (daysLate > 0 && ratePerDay > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} at PHP ${ratePerDay.toFixed(2)}/day`;
  }
  if (daysLate > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} overdue`;
  }
  return "Late payment penalty applied";
};

export const resolvePaymentDetails = (bill, paymentRecord) => {
  const details = resolveSharedPaymentDetails(bill, paymentRecord);
  return {
    paymentMethod: details.paymentMethodLabel,
    paymentRecordedAt: details.paymentRecordedAt,
    paymentFallbackLabel: details.paymentFallbackLabel,
    paymentSource: null,
  };
};

export const formatPaymentMethodLabel = (value) => {
  if (!value) return EMPTY_VALUE;
  return formatAdminPaymentMode({ paymentMethod: value });
};

/**
 * DeltaChip — indicates the meter difference between start and end readings.
 */
export const DeltaChip = ({ start, end, unit }) => {
  if (start == null || end == null) return null;
  const delta = Number(end) - Number(start);
  if (Number.isNaN(delta)) return null;
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400" title="Meter rollback detected">
        ⚠ Rollback ({delta.toFixed(1)})
      </span>
    );
  if (delta === 0)
    return (
      <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
        No change
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
      +{delta.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
    </span>
  );
};
