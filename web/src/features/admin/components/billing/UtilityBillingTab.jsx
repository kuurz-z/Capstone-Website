import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  Plus,
  Check,
  Search,
  Clock3,
  History,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Pencil,
  Save,
  Download,
  Send,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import NewBillingPeriodModal from "./NewBillingPeriodModal";
import {
  useUtilityRooms,
  useUtilityReadings,
  useUtilityLatestReading,
  useUtilityPeriods,
  useUtilityResult,
  useUpdateUtilityPeriod,
  useSendUtilityPeriod,
  useDeleteUtilityReading,
  useUpdateUtilityReading,
  useDeleteUtilityPeriod,
  useRoomHistory,
  useElectricityAiReview,
  utilityKeys,
} from "../../../../shared/hooks/queries/useUtility";
import { utilityApi } from "../../../../shared/api/utilityApi.js";
import { useBusinessSettings } from "../../../../shared/hooks/queries/useSettings";
import { exportToCSV } from "../../../../shared/utils/exportUtils.js";
import {
  isUtilityEventType,
  normalizeUtilityEventType,
  readMoveInDate,
  readMoveOutDate,
} from "../../../../shared/utils/lifecycleNaming";
import { getRoomLabel } from "../../../../shared/utils/roomLabel.js";
import { fmtDate } from "../../utils/formatters";
import useBillingNotifier from "./shared/useBillingNotifier";
import BillingCycleDetailModal from "./BillingCycleDetailModal";

const EMPTY_VALUE = "-";
const WATER_BILLABLE_ROOM_TYPES = new Set(["private", "double-sharing"]);
const fmtCurrency = (val) =>
  val != null
    ? `PHP ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : EMPTY_VALUE;
const fmtNumber = (val, digits = 2) =>
  val != null
    ? Number(val).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : EMPTY_VALUE;
const fmtMonthYear = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "";
const fmtShortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";
const getPeriodLabel = (period) => {
  if (!period) return "Billing Cycle";
  if (period.status === "open") return "Current Cycle";
  if (period.revised) return "Revised Cycle";
  return `${fmtMonthYear(period.startDate)} Cycle`;
};
const getDisplayStatus = (period) =>
  period?.billingState || period?.displayStatus || period?.status || "closed";
const getDisplayStatusLabel = (period) => {
  const status = getDisplayStatus(period);
  if (status === "ready_to_send" || status === "ready") return "Ready to Send";
  if (status === "sent" || status === "finalized") return "Sent";
  if (status === "no_active_cycle") return "No Active Bill";
  if (status === "open") return "Active";
  return status;
};
const getRoomBadgeLabel = (room) => {
  if (!room) return "No Active Bill";
  return room.billingLabel || "No Active Bill";
};
const canEditPeriod = (period) =>
  Boolean(period) && (period.canEdit ?? getDisplayStatus(period) !== "sent");
const canDeletePeriod = (period) => Boolean(period);
const getCycleLabel = (period) =>
  period
    ? `${fmtShortDate(period.startDate)} - ${fmtShortDate(period.endDate || period.targetCloseDate) || "Ongoing"}`
    : EMPTY_VALUE;
const getMeterRangeLabel = (period, utilityType) =>
  period
    ? utilityType === "water"
      ? `${fmtCurrency(period.ratePerUnit)} total water charge`
      : `${fmtNumber(period.startReading, 0)} ${utilityType === "electricity" ? "kWh" : "cu.m."} to ${period.endReading != null ? `${fmtNumber(period.endReading, 0)} ${utilityType === "electricity" ? "kWh" : "cu.m."}` : EMPTY_VALUE}`
    : EMPTY_VALUE;
const getExportColumns = (utilityType) => {
  const unitLabel = utilityType === "water" ? "Water Charge" : "Usage";
  return [
    { key: "branch", label: "Branch" },
    { key: "roomName", label: "Room" },
    { key: "periodStatus", label: "Period Status" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "startReading", label: "Start Reading" },
    { key: "endReading", label: "End Reading" },
    { key: "totalUsage", label: "Room Usage" },
    { key: "ratePerUnit", label: utilityType === "water" ? "Room Water Charge" : "Rate" },
    { key: "tenantName", label: "Tenant" },
    { key: "tenantEmail", label: "Tenant Email" },
    { key: "bedName", label: "Bed" },
    { key: "durationRange", label: "Coverage" },
    { key: "usage", label: unitLabel },
    { key: "amount", label: "Amount" },
    { key: "billId", label: "Bill ID" },
  ];
};
const getExpectedPeriodEndDate = (period) =>
  period?.endDate || period?.targetCloseDate || null;
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
const getEventDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const EVENT_TYPE_LABELS = {
  moveIn: "Move In",
  moveOut: "Move Out",
  regularBilling: "Regular Reading",
  periodStart: "Start Reading",
  periodEnd: "End Reading",
  manualAdjustment: "Adjustment",
};
const EVENT_TYPE_ORDER = {
  moveOut: 0,
  regularBilling: 1,
  periodStart: 1,
  periodEnd: 1,
  manualAdjustment: 1,
  moveIn: 2,
};
const getEventTypeLabel = (eventType) =>
  EVENT_TYPE_LABELS[normalizeUtilityEventType(eventType)] ||
  eventType ||
  EMPTY_VALUE;
const getEventTypeOrder = (eventType) =>
  EVENT_TYPE_ORDER[normalizeUtilityEventType(eventType)] ?? 1;
const isMoveLifecycleEvent = (eventType) =>
  isUtilityEventType(eventType, "moveIn") ||
  isUtilityEventType(eventType, "moveOut");
const isSystemBoundaryEvent = (eventType) =>
  isUtilityEventType(eventType, "periodStart") ||
  isUtilityEventType(eventType, "periodEnd");
const getReadingStatusLabel = (reading) => {
  if (!reading) return "Recorded";
  if (reading.readingStatus === "voided") return "Canceled";
  if (reading.readingStatus === "corrected") return "Corrected";
  if (reading.readingStatus === "locked" || reading.isLocked) return "Locked";
  return "Saved";
};
const getTimelineRecordLabel = (row) => {
  if (!row) return EMPTY_VALUE;
  if (row.source === "merged") return "Verified Event";
  if (row.source === "occupancy") return "Occupancy Event";
  if (row.source === "meter") return "Meter Reading";
  return row.source || EMPTY_VALUE;
};
const getTimelineStatusLabel = (row) => {
  if (!row) return EMPTY_VALUE;
  if (row.source === "occupancy") {
    if (isUtilityEventType(row.eventType, "moveIn")) {
      return row.isActive ? "Current" : "Past";
    }
    if (isUtilityEventType(row.eventType, "moveOut")) return "Moved Out";
  }
  if (row.rawReading) return getReadingStatusLabel(row.rawReading);
  return EMPTY_VALUE;
};
const getHistoryStatusClasses = (status) => {
  switch (status) {
    case "sent":
    case "finalized":
      return "bg-info-light text-info-dark";
    case "ready_to_send":
    case "ready":
      return "bg-warning-light text-warning-dark";
    case "open":
      return "bg-success-light text-success-dark";
    case "revised":
      return ""; // handled via inline style
    case "no_active_cycle":
    default:
      return "bg-muted text-muted-foreground";
  }
};
const getTimelineDotClasses = (eventType) => {
  const normalized = normalizeUtilityEventType(eventType);
  if (normalized === "moveIn") return "bg-amber-500";
  if (normalized === "moveOut") return "bg-rose-500";
  if (normalized === "periodStart") return "bg-emerald-500";
  if (normalized === "periodEnd") return "bg-red-600";
  return "bg-slate-300";
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
  {
    key: "periodStart",
    label: "Period Start",
    formatter: (value) => (value ? fmtDate(value) : ""),
  },
  {
    key: "periodEnd",
    label: "Period End",
    formatter: (value) => (value ? fmtDate(value) : ""),
  },
  { key: "periodStatus", label: "Period Status" },
  {
    key: "ratePerUnit",
    label: "Rate / Unit",
    formatter: (value) =>
      value !== "" && value != null ? Number(value).toFixed(2) : "",
  },
  { key: "tenantName", label: "Tenant" },
  {
    key: "totalUsage",
    label: "Total Usage",
    formatter: (value) =>
      value !== "" && value != null ? Number(value).toFixed(2) : "",
  },
  {
    key: "billAmount",
    label: "Utility Charge",
    formatter: (value) =>
      value !== "" && value != null ? Number(value).toFixed(2) : "",
  },
  { key: "billStatus", label: "Bill Status" },
  {
    key: "dueDate",
    label: "Due Date",
    formatter: (value) => (value ? fmtDate(value) : ""),
  },
  {
    key: "sentAt",
    label: "Sent At",
    formatter: (value) => (value ? fmtDate(value) : ""),
  },
];

const TIMELINE_EXPORT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "event", label: "Event" },
  { key: "recordType", label: "Record Type" },
  { key: "status", label: "Status" },
  { key: "tenant", label: "Tenant" },
  { key: "tenantEmail", label: "Tenant Email" },
  { key: "bed", label: "Bed" },
  { key: "reading", label: "Reading" },
];

const PERIOD_HISTORY_EXPORT_COLUMNS = [
  { key: "cycle", label: "Cycle" },
  { key: "basis", label: "Basis" },
  { key: "rate", label: "Rate" },
  { key: "status", label: "Status" },
];

const TENANT_SUMMARY_EXPORT_COLUMNS = [
  { key: "tenantName", label: "Tenant Name" },
  { key: "tenantEmail", label: "Tenant Email" },
  { key: "durationRange", label: "Duration Range" },
  { key: "totalUsage", label: "Total Usage" },
  { key: "billAmount", label: "Bill Amount" },
];

const UtilityBillingTab = ({ utilityType, isActive = true }) => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const dropdownRef = useRef(null);
  const aiReviewPanelRef = useRef(null);
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
  const [branchFilter, setBranchFilter] = useState(
    isOwner ? "" : user?.branch || "",
  );

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Panel / section state
  const [activePanel, setActivePanel] = useState(null);
  const [isNewPeriodModalOpen, setIsNewPeriodModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyModalPeriodId, setHistoryModalPeriodId] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [editingRateValue, setEditingRateValue] = useState("");

  const [editPeriodModal, setEditPeriodModal] = useState({
    open: false,
    periodId: null,
  });
  const [editPeriodForm, setEditPeriodForm] = useState({
    startDate: "",
    endDate: "",
    startReading: "",
    endReading: "",
    ratePerUnit: "",
  });

  // Edit reading modal
  const [editReadingModal, setEditReadingModal] = useState({
    open: false,
    reading: null,
  });
  const [editReadingForm, setEditReadingForm] = useState({
    reading: "",
    date: "",
    eventType: "moveIn",
  });

  // Pagination
  const PERIODS_PER_PAGE = 5;
  const TIMELINE_PER_PAGE = 8;
  const ROOMS_PER_PAGE = 3;
  const [periodsPage, setPeriodsPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState(1);
  const [roomsPage, setRoomsPage] = useState(1);
  const hasAutoSelectedPeriodRef = useRef(false);
  const queryClient = useQueryClient();

  // Form state - billing periods default to 15th-to-15th cycle

  const utilityQueryOptions = useMemo(
    () => ({
      enabled: isActive,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Number.POSITIVE_INFINITY,
    }),
    [isActive],
  );

  // Queries
  const { data: businessSettings } = useBusinessSettings(Boolean(user));
  const { data: roomsData, isLoading: roomsLoading } = useUtilityRooms(
    utilityType,
    branchFilter,
    utilityQueryOptions,
  );
  const { data: readingsData } = useUtilityReadings(
    utilityType,
    selectedRoomId,
    utilityQueryOptions,
  );
  const { data: latestData } = useUtilityLatestReading(
    utilityType,
    selectedRoomId,
    utilityQueryOptions,
  );
  const { data: periodsData } = useUtilityPeriods(
    utilityType,
    selectedRoomId,
    utilityQueryOptions,
  );
  const periodList = periodsData?.periods || [];
  const selectedPeriodFromList = periodList.find(
    (period) => period.id === selectedPeriodId,
  );
  const historyModalPeriod = periodList.find(
    (period) => period.id === historyModalPeriodId,
  );
  const selectedResultPeriodId =
    selectedPeriodFromList && selectedPeriodFromList.status !== "open"
      ? selectedPeriodFromList.id
      : null;
  const { data: resultData } = useUtilityResult(
    utilityType,
    selectedResultPeriodId,
    utilityQueryOptions,
  );
  const { data: roomHistoryData } = useRoomHistory(
    utilityType,
    selectedRoomId,
    utilityQueryOptions,
  );
  const aiReviewPeriodId =
    utilityType === "electricity" && selectedPeriodId ? selectedPeriodId : null;
  const canRequestAiReview =
    utilityType === "electricity" && Boolean(aiReviewPeriodId);
  const {
    data: aiReviewData,
    isFetching: aiReviewFetching,
    isError: aiReviewIsError,
    error: aiReviewError,
    refetch: refetchAiReview,
  } = useElectricityAiReview(aiReviewPeriodId, {
    ...utilityQueryOptions,
    enabled:
      utilityQueryOptions.enabled &&
      canRequestAiReview &&
      activePanel === "aiReview",
    staleTime: 5 * 60 * 1000,
  });

  // Mutations
  const updatePeriod = useUpdateUtilityPeriod(utilityType);
  const sendPeriod = useSendUtilityPeriod(utilityType);
  const deleteReading = useDeleteUtilityReading(utilityType);
  const updateReading = useUpdateUtilityReading(utilityType);
  const deletePeriod = useDeleteUtilityPeriod(utilityType);
  const [sendingByPeriodId, setSendingByPeriodId] = useState({});
  const [isSendingAllReady, setIsSendingAllReady] = useState(false);
  const [periodStatusFilter, setPeriodStatusFilter] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [periodSearch, setPeriodSearch] = useState("");

  const rooms = useMemo(() => {
    const list = roomsData?.rooms || [];
    if (utilityType !== "water") return list;
    return list.filter((room) => WATER_BILLABLE_ROOM_TYPES.has(room.type));
  }, [roomsData?.rooms, utilityType]);
  const readings = readingsData?.readings || [];
  const meterTimelineEvents = useMemo(
    () =>
      [...readings].sort((left, right) => {
        const leftDate = new Date(left.date).getTime();
        const rightDate = new Date(right.date).getTime();
        if (leftDate !== rightDate) return leftDate - rightDate;
        const leftPriority = getEventTypeOrder(left.eventType);
        const rightPriority = getEventTypeOrder(right.eventType);
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return (
          new Date(left.createdAt || 0).getTime() -
          new Date(right.createdAt || 0).getTime()
        );
      }),
    [readings],
  );
  const periods = periodList;
  const result = resultData?.result || null;
  const roomHistory = roomHistoryData?.history || [];
  const billingTimelineRows = useMemo(() => {
    const mergeRow = (current, next) => {
      const merged = { ...current, ...next };
      const hasOccupancySource =
        current.source === "occupancy" || next.source === "occupancy";
      const hasMeterSource =
        current.source === "meter" || next.source === "meter";

      merged.source =
        hasOccupancySource && hasMeterSource ? "merged" : next.source;
      merged.hasMeterRecord = Boolean(
        current.hasMeterRecord || next.hasMeterRecord,
      );
      merged.rawReading = next.rawReading || current.rawReading || null;

      if (
        (merged.bedName === EMPTY_VALUE || merged.bedName == null) &&
        current.bedName &&
        current.bedName !== EMPTY_VALUE
      ) {
        merged.bedName = current.bedName;
      }

      if (
        (merged.tenantName === EMPTY_VALUE || merged.tenantName == null) &&
        current.tenantName &&
        current.tenantName !== EMPTY_VALUE
      ) {
        merged.tenantName = current.tenantName;
      }

      if (
        (merged.tenantEmail === EMPTY_VALUE || merged.tenantEmail == null) &&
        current.tenantEmail &&
        current.tenantEmail !== EMPTY_VALUE
      ) {
        merged.tenantEmail = current.tenantEmail;
      }

      if (merged.reading == null && current.reading != null) {
        merged.reading = current.reading;
      }

      return merged;
    };

    const timelineByKey = new Map();
    const upsertRow = (row) => {
      const existing = timelineByKey.get(row.mergeKey);
      if (!existing) {
        timelineByKey.set(row.mergeKey, row);
        return;
      }
      timelineByKey.set(row.mergeKey, mergeRow(existing, row));
    };

    for (const entry of roomHistory) {
      if (entry.moveInDate) {
        const moveInKey = `${entry.tenantId || entry.id || entry.tenantName}-moveIn-${getEventDayKey(entry.moveInDate)}`;
        upsertRow({
          id: `occ-in-${entry.id || entry.tenantId}-${entry.moveInDate}`,
          mergeKey: moveInKey,
          source: "occupancy",
          date: entry.moveInDate,
          eventType: "moveIn",
          tenantName: entry.tenantName || EMPTY_VALUE,
          tenantEmail: entry.tenantEmail || null,
          bedName: entry.bedName || EMPTY_VALUE,
          reading: entry.moveInReading?.reading ?? null,
          isActive: entry.isActive,
          hasMeterRecord: Boolean(entry.moveInReading),
          rawReading: entry.moveInReading || null,
        });
      }

      if (entry.moveOutDate) {
        const moveOutKey = `${entry.tenantId || entry.id || entry.tenantName}-moveOut-${getEventDayKey(entry.moveOutDate)}`;
        upsertRow({
          id: `occ-out-${entry.id || entry.tenantId}-${entry.moveOutDate}`,
          mergeKey: moveOutKey,
          source: "occupancy",
          date: entry.moveOutDate,
          eventType: "moveOut",
          tenantName: entry.tenantName || EMPTY_VALUE,
          tenantEmail: entry.tenantEmail || null,
          bedName: entry.bedName || EMPTY_VALUE,
          reading: entry.moveOutReading?.reading ?? null,
          hasMeterRecord: Boolean(entry.moveOutReading),
          rawReading: entry.moveOutReading || null,
        });
      }
    }

    for (const reading of meterTimelineEvents) {
      const eventType = normalizeUtilityEventType(reading.eventType);
      if (eventType === "regularBilling") {
        // User-facing timeline keeps lifecycle and boundary events only.
        continue;
      }

      const eventDayKey = getEventDayKey(reading.date);
      const meterKey = isMoveLifecycleEvent(eventType)
        ? `${reading.tenantId || reading.tenant || "unassigned"}-${eventType}-${eventDayKey}`
        : `${eventType}-${eventDayKey}-${reading.reading}`;

      upsertRow({
        id: `meter-${reading.id}`,
        mergeKey: meterKey,
        source: "meter",
        date: reading.date,
        eventType,
        tenantName: reading.tenant || EMPTY_VALUE,
        tenantEmail: reading.tenantEmail || null,
        bedName: EMPTY_VALUE,
        reading: reading.reading,
        hasMeterRecord: true,
        rawReading: reading,
      });
    }

    const combined = [...timelineByKey.values()];
    combined.sort((left, right) => {
      const leftDate = new Date(left.date).getTime();
      const rightDate = new Date(right.date).getTime();
      if (leftDate !== rightDate) return rightDate - leftDate;

      const leftPriority = getEventTypeOrder(left.eventType);
      const rightPriority = getEventTypeOrder(right.eventType);
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;

      return String(right.id).localeCompare(String(left.id));
    });

    return combined;
  }, [roomHistory, meterTimelineEvents]);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const currentPeriod = periods[0] || null;
  const openPeriodForRoom = periods.find((p) => p.status === "open");
  const lastClosedPeriod = periods.find(
    (p) => p.status === "closed" || p.status === "revised",
  );
  const defaultRatePerUnit =
    utilityType === "electricity"
      ? (businessSettings?.defaultElectricityRatePerKwh ?? "")
      : (businessSettings?.defaultWaterRatePerUnit ?? "");

  const filteredRooms = useMemo(() => {
    let list = branchFilter
      ? rooms.filter((r) => r.branch === branchFilter)
      : rooms;
    if (sidebarSearch.trim()) {
      const q = sidebarSearch.trim().toLowerCase();
      list = list.filter((r) => getRoomLabel(r, "").toLowerCase().includes(q));
    }
    return list;
  }, [rooms, branchFilter, sidebarSearch]);
  const readyRooms = useMemo(
    () =>
      filteredRooms.filter(
        (room) => room.billingState === "ready_to_send" && room.latestPeriodId,
      ),
    [filteredRooms],
  );
  const selectedReadyPeriod =
    selectedPeriodFromList &&
    getDisplayStatus(selectedPeriodFromList) === "ready_to_send"
      ? selectedPeriodFromList
      : null;
  const currentPeriodUsage =
    currentPeriod &&
    currentPeriod.endReading != null &&
    currentPeriod.startReading != null
      ? currentPeriod.endReading - currentPeriod.startReading
      : null;
  const currentPeriodCost =
    currentPeriod?.computedTotalCost != null
      ? currentPeriod.computedTotalCost
      : currentPeriodUsage != null && currentPeriod?.ratePerUnit != null
        ? currentPeriodUsage * currentPeriod.ratePerUnit
        : null;
  const isCurrentCycleLocked = Boolean(
    currentPeriod?.status === "locked" ||
    currentPeriod?.isLocked ||
    currentPeriod?.locked,
  );

  // Paginated slices
  const totalRoomPages = Math.max(
    1,
    Math.ceil(filteredRooms.length / ROOMS_PER_PAGE),
  );
  const pagedRooms = filteredRooms.slice(
    (roomsPage - 1) * ROOMS_PER_PAGE,
    roomsPage * ROOMS_PER_PAGE,
  );

  const filteredPeriods = useMemo(() => {
    let list = [...periods];

    if (periodStatusFilter) {
      list = list.filter((p) => {
        const s = getDisplayStatus(p);
        if (periodStatusFilter === "sent")
          return s === "sent" || s === "finalized";
        if (periodStatusFilter === "pending")
          return s === "ready_to_send" || s === "ready";
        if (periodStatusFilter === "draft") return s === "open";
        if (periodStatusFilter === "paid") return s === "paid";
        return true;
      });
    }

    if (periodStartDate) {
      list = list.filter((p) => p.startDate && p.startDate >= periodStartDate);
    }

    if (periodEndDate) {
      list = list.filter((p) => {
        const end = p.endDate || p.targetCloseDate;
        return end && end <= periodEndDate;
      });
    }

    if (periodSearch.trim()) {
      const q = periodSearch.trim().toLowerCase();
      list = list.filter((p) => getCycleLabel(p).toLowerCase().includes(q));
    }

    return list;
  }, [
    periods,
    periodStatusFilter,
    periodStartDate,
    periodEndDate,
    periodSearch,
  ]);

  const totalPeriodPages = Math.max(
    1,
    Math.ceil(filteredPeriods.length / PERIODS_PER_PAGE),
  );
  const pagedPeriods = filteredPeriods.slice(
    (periodsPage - 1) * PERIODS_PER_PAGE,
    periodsPage * PERIODS_PER_PAGE,
  );

  const totalTimelinePages = Math.max(
    1,
    Math.ceil(billingTimelineRows.length / TIMELINE_PER_PAGE),
  );
  const pagedTimelineRows = billingTimelineRows.slice(
    (timelinePage - 1) * TIMELINE_PER_PAGE,
    timelinePage * TIMELINE_PER_PAGE,
  );

  useEffect(() => {
    if (filteredRooms.length === 0) {
      setSelectedRoomId(null);
      setSelectedPeriodId(null);
      return;
    }
    if (
      !selectedRoomId ||
      !filteredRooms.some((r) => r.id === selectedRoomId)
    ) {
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

    const mostRecent =
      periods.find((p) => p.status === "closed" || p.status === "revised") ||
      periods[0];
    if (mostRecent) {
      setSelectedPeriodId(mostRecent.id);
      hasAutoSelectedPeriodRef.current = true;
    }
  }, [periods, selectedPeriodId]);

  // Pagination component
  const Pagination = ({ page, total, onChange, countLabel }) => {
    if (total <= 1) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{countLabel}</span>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
          >
            &lt;
          </button>
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`rounded-md border px-2 py-1 text-xs ${
                page === n
                  ? "border-amber-400 bg-amber-400/20 text-warning-dark"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
          <button
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onChange(page + 1)}
            disabled={page === total}
          >
            &gt;
          </button>
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
  };

  const openHistoryModal = (periodId) => {
    setSelectedPeriodId(periodId);
    setHistoryModalPeriodId(periodId);
    setIsHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    setIsHistoryModalOpen(false);
    setHistoryModalPeriodId(null);
    setSelectedPeriodId(null);
  };

  const openPanel = (panel) => {
    setActivePanel(panel);
  };
  const closePanel = () => setActivePanel(null);
  const openAiReview = (periodId) => {
    if (utilityType !== "electricity" || !periodId) return;
    setSelectedPeriodId(periodId);
    setActivePanel("aiReview");
    window.requestAnimationFrame(() => {
      aiReviewPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const buildGenerationBlocker = (error) => {
    const payload = error?.response?.data?.error || null;
    const message =
      payload?.message ||
      payload?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Unable to finalize billing cycle.";
    const details = payload?.details || null;
    const lines = [];

    const overlaps = details?.overlaps || [];
    if (Array.isArray(overlaps) && overlaps.length > 0) {
      for (const overlap of overlaps.slice(0, 5)) {
        lines.push(
          `Bed ${overlap.bedKey}: ${overlap.firstTenantName || "Tenant A"} overlaps ${overlap.secondTenantName || "Tenant B"}`,
        );
      }
    }

    const missingMoveIns = details?.missingMoveInReadings || [];
    const missingMoveOuts = details?.missingMoveOutReadings || [];
    if (Array.isArray(missingMoveIns) && missingMoveIns.length > 0) {
      for (const entry of missingMoveIns.slice(0, 5)) {
        lines.push(
          `Missing move-in reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveInDate(entry)) || "date required"})`,
        );
      }
    }
    if (Array.isArray(missingMoveOuts) && missingMoveOuts.length > 0) {
      for (const entry of missingMoveOuts.slice(0, 5)) {
        lines.push(
          `Missing move-out reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveOutDate(entry)) || "date required"})`,
        );
      }
    }

    return {
      message,
      lines,
    };
  };

  useEffect(() => {
    if (activePanel === "closePeriod" && openPeriodForRoom) {
      setPeriodForm((f) => ({
        ...f,
        endDate:
          toInputDate(getExpectedPeriodEndDate(openPeriodForRoom)) || f.endDate,
      }));
    }
  }, [activePanel, openPeriodForRoom]);

  const handleEditReading = (r) => {
    setEditReadingForm({
      reading: String(r.reading),
      date: r.date ? new Date(r.date).toISOString().slice(0, 10) : "",
      eventType: normalizeUtilityEventType(r.eventType) || "moveIn",
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

  const handleSaveRate = async () => {
    if (!editingRateValue || Number(editingRateValue) <= 0) {
      return notify.warn("Rate must be a positive number.");
    }
    try {
      await updatePeriod.mutateAsync({
        periodId: currentPeriod?.id,
        ratePerUnit: Number(editingRateValue),
      });
      notify.success("Rate updated successfully.");
      setEditingRate(false);
      setEditingRateValue("");
    } catch (err) {
      notify.error(err, "Failed to update rate.");
    }
  };

  const handleDeleteReading = (readingId) => {
    setConfirmModal({
      open: true,
      title: "Delete Meter Reading",
      message:
        "This reading will be permanently removed. If it belongs to a closed period, click 'Re-run' afterward to update the billing result.",
      variant: "danger",
      confirmText: "Delete Reading",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
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
        setConfirmModal((prev) => ({ ...prev, open: false }));
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

  const handleGenerateCycle = async () => {
    const requiresReadings = utilityType === "electricity";
    if (
      !periodForm.startDate ||
      !periodForm.endDate ||
      !periodForm.ratePerUnit ||
      (requiresReadings && (!periodForm.startReading || !periodForm.endReading))
    ) {
      return notify.warn(
        "All fields (dates, readings, and rate) are required.",
      );
    }
    let newlyOpenedPeriodId = null;
    try {
      setGenerationBlocker(null);
      // Auto-clean any leftover open period before creating a new cycle
      if (openPeriodForRoom) {
        if (selectedPeriodId === openPeriodForRoom.id) {
          setSelectedPeriodId(null);
        }
        await deletePeriod.mutateAsync(openPeriodForRoom.id);
      }

      const openedData = await openPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: periodForm.startDate,
        startReading:
          utilityType === "water" ? 0 : Number(periodForm.startReading),
        ratePerUnit: Number(periodForm.ratePerUnit),
      });

      const newPeriodId =
        openedData?.period?._id || openedData?.period?.id || openedData?.id;

      if (newPeriodId) {
        newlyOpenedPeriodId = newPeriodId;
        setSelectedPeriodId(newPeriodId);
        await closePeriod.mutateAsync({
          periodId: newPeriodId,
          endReading:
            utilityType === "water" ? 0 : Number(periodForm.endReading),
          endDate: periodForm.endDate,
        });
        notify.success("Billing cycle generated successfully.");
        setGenerationBlocker(null);
        closePanel();
        selectAndFocusPeriod(newPeriodId);
      } else {
        notify.success(
          "Billing period opened, but could not finalize automatically.",
        );
        closePanel();
      }
    } catch (err) {
      if (newlyOpenedPeriodId) {
        try {
          await deletePeriod.mutateAsync(newlyOpenedPeriodId);
          if (selectedPeriodId === newlyOpenedPeriodId) {
            setSelectedPeriodId(null);
          }
          notify.warn(
            "Cycle finalize failed, so the temporary open period was rolled back.",
          );
        } catch {
          // Keep the original finalize error as primary context for the user.
        }
      }
      setGenerationBlocker(buildGenerationBlocker(err));
      notify.error(err, "Failed to generate billing cycle.");
    }
  };

  // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Draft bills handlers (expand-on-edit) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬

  const handleOpenEditPeriod = (period) => {
    if (!period?.id) return;
    setEditPeriodForm({
      startDate: toInputDate(period.startDate) || "",
      endDate: toInputDate(period.endDate) || "",
      startReading:
        period.startReading !== undefined && period.startReading !== null
          ? String(period.startReading)
          : "",
      endReading:
        period.endReading !== undefined && period.endReading !== null
          ? String(period.endReading)
          : "",
      ratePerUnit:
        period.ratePerUnit !== undefined && period.ratePerUnit !== null
          ? String(period.ratePerUnit)
          : "",
    });
    setEditPeriodModal({ open: true, periodId: period.id });
  };

  const handleSaveEditPeriod = async () => {
    const { periodId } = editPeriodModal;
    if (!periodId) return;
    if (!editPeriodForm.startDate || !editPeriodForm.ratePerUnit) {
      return notify.warn("Start date and rate are required.");
    }
    if (
      editPeriodForm.endDate &&
      editPeriodForm.endDate < editPeriodForm.startDate
    ) {
      return notify.warn("End date must be on or after the start date.");
    }
    if (utilityType === "electricity") {
      if (!editPeriodForm.endDate) {
        return notify.warn("End date is required.");
      }
      if (
        editPeriodForm.startReading === "" ||
        editPeriodForm.endReading === ""
      ) {
        return notify.warn("Start and end meter readings are required.");
      }
      if (
        Number(editPeriodForm.endReading) < Number(editPeriodForm.startReading)
      ) {
        return notify.warn(
          "End meter reading must be greater than or equal to start meter reading.",
        );
      }
    }

    try {
      const response = await updatePeriod.mutateAsync({
        periodId,
        startDate: editPeriodForm.startDate,
        endDate: editPeriodForm.endDate || null,
        ratePerUnit: Number(editPeriodForm.ratePerUnit),
        ...(utilityType === "electricity"
          ? {
              startReading: Number(editPeriodForm.startReading),
              endReading: Number(editPeriodForm.endReading),
            }
          : {}),
      });

      const updatedPeriodId = response?.period?.id || periodId;
      setSelectedPeriodId(updatedPeriodId);

      if (response?.result) {
        queryClient.setQueryData(
          utilityKeys.result(utilityType, updatedPeriodId),
          { result: response.result },
        );
      }

      const refreshTasks = [];
      if (selectedRoomId) {
        refreshTasks.push(
          queryClient.refetchQueries({
            queryKey: utilityKeys.periods(utilityType, selectedRoomId),
            exact: true,
          }),
        );
        refreshTasks.push(
          queryClient.refetchQueries({
            queryKey: utilityKeys.readings(utilityType, selectedRoomId),
            exact: true,
          }),
        );
      }
      refreshTasks.push(
        queryClient.refetchQueries({
          queryKey: utilityKeys.rooms(utilityType, branchFilter),
          exact: true,
        }),
      );

      if (refreshTasks.length > 0) {
        await Promise.all(refreshTasks);
      }

      notify.success("Billing period updated.");
      setEditPeriodModal({ open: false, periodId: null });
    } catch (err) {
      notify.error(err, "Failed to update billing period.");
    }
  };

  const sendSinglePeriod = async ({ periodId, roomName, cycleText }) => {
    setSendingByPeriodId((prev) => ({ ...prev, [periodId]: true }));
    try {
      const response = await sendPeriod.mutateAsync({ periodId });
      if (response?.published > 0) {
        notify.success(
          `${utilityType === "water" ? "Water" : "Electricity"} sent to ${response.published} tenant${response.published === 1 ? "" : "s"} for ${roomName}.`,
        );
      } else {
        notify.warn(`No tenant charges were sent for ${roomName}.`);
      }
      if (response?.partialFailures?.length > 0) {
        notify.warn(
          `${response.partialFailures.length} delivery issue${response.partialFailures.length === 1 ? "" : "s"} occurred while sending ${cycleText}.`,
        );
      }
      return response;
    } catch (err) {
      notify.error(
        err,
        `Failed to send ${utilityType === "water" ? "water" : "electricity"} for ${roomName}.`,
      );
      throw err;
    } finally {
      setSendingByPeriodId((prev) => ({ ...prev, [periodId]: false }));
    }
  };

  const handleSendPeriod = (
    period,
    roomName = getRoomLabel(selectedRoom || {}, "Room"),
  ) => {
    if (!period) return;
    const cycleText = getCycleLabel(period);
    setConfirmModal({
      open: true,
      title: `Send ${utilityType === "water" ? "Water" : "Electricity"} To Tenant`,
      message: `Send the ${utilityType} charge for ${roomName} (${cycleText}) to the tenant side now? This will make the charge visible in the tenant billing view and payment total.`,
      variant: "primary",
      confirmText: "Send Now",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        await sendSinglePeriod({
          periodId: period.id,
          roomName,
          cycleText,
        });
      },
    });
  };

  const handleSendAllReady = () => {
    if (readyRooms.length === 0) return;
    setConfirmModal({
      open: true,
      title: `Send All Ready ${utilityType === "water" ? "Water" : "Electricity"} Charges`,
      message: `Send ${utilityType} charges for ${readyRooms.length} ready room${readyRooms.length === 1 ? "" : "s"} to the tenant side? Each room will be processed one at a time.`,
      variant: "primary",
      confirmText: `Send ${readyRooms.length} Room${readyRooms.length === 1 ? "" : "s"}`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        setIsSendingAllReady(true);
        let successCount = 0;
        try {
          for (const room of readyRooms) {
            try {
              await sendSinglePeriod({
                periodId: room.latestPeriodId,
                roomName: getRoomLabel(room),
                cycleText: room.billingLabel || "ready cycle",
              });
              successCount += 1;
            } catch {
              // Per-room errors are already surfaced.
            }
          }
          if (successCount > 0) {
            notify.success(
              `Sent ${utilityType} charges for ${successCount} room${successCount === 1 ? "" : "s"}.`,
            );
          }
        } finally {
          setIsSendingAllReady(false);
        }
      },
    });
  };

  const handleExportRows = async () => {
    try {
      setIsExporting(true);
      const response = await utilityApi.exportRows(utilityType, {
        branch: branchFilter || undefined,
      });
      const rows = response?.rows || [];
      if (!rows.length) {
        notify.warn(`No ${utilityType} billing rows available for export.`);
        return;
      }

      exportToCSV(
        rows,
        getExportColumns(utilityType),
        `${utilityType}_billing_${branchFilter || "all"}_${getTodayInput()}`,
      );
      notify.success(
        `Exported ${rows.length} ${utilityType} billing row${rows.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      notify.error(error, `Failed to export ${utilityType} billing.`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportLocalRows = ({ rows, columns, filename, emptyMessage }) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      notify.warn(emptyMessage);
      return;
    }

    exportToCSV(filename, rows, columns);
  };

  const handleExportTimeline = () => {
    const rows = billingTimelineRows.map((row) => ({
      date: fmtDate(row.date),
      event: getEventTypeLabel(row.eventType),
      recordType: getTimelineRecordLabel(row),
      status: getTimelineStatusLabel(row),
      tenant: isMoveLifecycleEvent(row.eventType)
        ? row.tenantName || EMPTY_VALUE
        : "Room Level",
      tenantEmail: isMoveLifecycleEvent(row.eventType)
        ? row.tenantEmail || EMPTY_VALUE
        : EMPTY_VALUE,
      bed: isMoveLifecycleEvent(row.eventType)
        ? row.bedName || EMPTY_VALUE
        : "Room Level",
      reading:
        row.reading != null
          ? `${fmtNumber(row.reading, 2)} ${utilityType === "electricity" ? "kWh" : "cu.m."}`
          : EMPTY_VALUE,
    }));

    exportLocalRows({
      rows,
      columns: TIMELINE_EXPORT_COLUMNS,
      filename: `${utilityType}-billing-timeline-${selectedRoom ? getRoomLabel(selectedRoom).replace(/\s+/g, "-").toLowerCase() : "room"}`,
      emptyMessage: `No ${utilityType} timeline rows available for export.`,
    });
  };

  const handleExportPeriodHistory = () => {
    const rows = periods.map((period) => ({
      cycle: getCycleLabel(period),
      basis: getMeterRangeLabel(period, utilityType),
      rate: fmtCurrency(period.ratePerUnit),
      status: getDisplayStatusLabel(period),
    }));

    exportLocalRows({
      rows,
      columns: PERIOD_HISTORY_EXPORT_COLUMNS,
      filename: `${utilityType}-billing-history-${selectedRoom ? getRoomLabel(selectedRoom).replace(/\s+/g, "-").toLowerCase() : "room"}`,
      emptyMessage: `No ${utilityType} billing history rows available for export.`,
    });
  };

  const handleExportTenantSummary = (period, currentResult) => {
    const rows = (currentResult?.tenantSummaries || []).map((tenant) => ({
      tenantName: tenant.tenantName || EMPTY_VALUE,
      tenantEmail: tenant.tenantEmail || EMPTY_VALUE,
      durationRange: tenant.durationRange || "Ongoing",
      totalUsage: fmtNumber(tenant.totalUsage, 4),
      billAmount: fmtCurrency(tenant.billAmount),
    }));

    exportLocalRows({
      rows,
      columns: TENANT_SUMMARY_EXPORT_COLUMNS,
      filename: `${utilityType}-tenant-summary-${period?.id || "period"}`,
      emptyMessage: `No ${utilityType} tenant summary rows available for export.`,
    });
  };

  const handleExportSegment = (period, segment, index, ratePerUnit) => {
    const rows = [
      {
        occupants: segment.activeTenantCount ?? 0,
        firstReadingDate: segment.startDate
          ? new Date(segment.startDate).toLocaleDateString()
          : (segment.periodLabel || "").split(/\s*[-â€“]\s*/)[0] || EMPTY_VALUE,
        firstReading: fmtNumber(segment.readingFrom, 2),
        secondReadingDate: segment.endDate
          ? new Date(segment.endDate).toLocaleDateString()
          : (segment.periodLabel || "").split(/\s*[-â€“]\s*/)[1] || EMPTY_VALUE,
        secondReading: fmtNumber(segment.readingTo, 2),
        segmentPeriod: getSegmentPeriodLabel(segment),
        boundaryEvents: `${EVENT_TYPE_LABELS[segment.startEventType] || segment.startEventType || "Regular"} to ${EVENT_TYPE_LABELS[segment.endEventType] || segment.endEventType || "Regular"}`,
        totalConsumption: fmtNumber(segment.unitsConsumed, 2),
        segmentTotalCost: fmtCurrency(segment.totalCost),
        amountDuePerPerson: `${fmtCurrency(segment.sharePerTenantCost)} @ ${fmtNumber(ratePerUnit, 2)} / ${utilityType === "electricity" ? "kWh" : "cu.m."}`,
        coveredTenants: segment.coveredTenantNames?.length
          ? segment.coveredTenantNames.join(", ")
          : "No active tenant",
      },
    ];

    exportLocalRows({
      rows,
      columns: SEGMENT_EXPORT_COLUMNS,
      filename: `${utilityType}-segment-${period?.id || "period"}-${index + 1}`,
      emptyMessage: `No ${utilityType} segment rows available for export.`,
    });
  };

  const renderAiReviewPanel = () => {
    if (activePanel !== "aiReview" || utilityType !== "electricity") return null;
    const insight = aiReviewData?.insight;
    const snapshotMeta = aiReviewData?.snapshotMeta || {};
    const providerLabel =
      snapshotMeta.provider === "gemini" && !snapshotMeta.usedFallback
        ? `Powered by Gemini${snapshotMeta.model ? ` (${snapshotMeta.model})` : ""}`
        : "Fallback summary";
    const errorMessage =
      aiReviewError?.response?.data?.error ||
      aiReviewError?.message ||
      "AI billing review is unavailable right now.";
    const renderInsightList = (title, items, keyPrefix, limit = 3) => {
      const cleanItems = Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : [];
      if (!cleanItems.length) return null;

      return (
        <div>
          <h5>{title}</h5>
          <ul>
            {cleanItems.map((item, index) => (
              <li key={`${keyPrefix}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      );
    };
    const priorityFindings = [
      ...(Array.isArray(insight?.riskDrivers) ? insight.riskDrivers : []),
      ...(Array.isArray(insight?.keyFindings) ? insight.keyFindings : []),
    ];
    const ownerActions = [
      ...(Array.isArray(insight?.reviewChecklist) ? insight.reviewChecklist : []),
      ...(Array.isArray(insight?.recommendedActions) ? insight.recommendedActions : []),
    ];

    return (
      <section className="eb-panel eb-ai-review" ref={aiReviewPanelRef}>
        <div className="eb-panel__header">
          <span className="eb-ai-review__title">
            <Sparkles size={14} /> AI Billing Review
          </span>
          <div className="eb-ai-review__actions">
            <span className="eb-ai-review__provider">{providerLabel}</span>
            <button
              type="button"
              className="eb-panel__close"
              onClick={closePanel}
              aria-label="Close AI billing review"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="eb-panel__body">
          {aiReviewFetching && !insight ? (
            <p className="eb-panel__hint">Generating billing review...</p>
          ) : aiReviewIsError ? (
            <div className="eb-ai-review__empty">
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          ) : insight ? (
            <>
              <div className="eb-ai-review__headline-row">
                <h4 className="eb-ai-review__headline">{insight.headline}</h4>
                <span
                  className={`eb-ai-review__risk eb-ai-review__risk--${insight.riskLevel || "low"}`}
                >
                  {insight.riskLevel || "low"} risk
                </span>
              </div>
              <p className="eb-ai-review__summary">{insight.summary}</p>
              <div className="eb-ai-review__grid">
                {renderInsightList("What stands out", priorityFindings, "finding", 3)}
                {renderInsightList("What to check", ownerActions, "action", 3)}
              </div>
              {insight.disputePreventionNote && (
                <div className="eb-ai-review__note">
                  <h5>Owner note</h5>
                  <p>{insight.disputePreventionNote}</p>
                </div>
              )}
              <div className="eb-ai-review__meta">
                <span>Confidence: {insight.confidence || "low"}</span>
                <span>{insight.disclaimer}</span>
              </div>
              <div className="eb-panel__footer">
                <button
                  type="button"
                  className="eb-btn eb-btn--ghost eb-btn--xs"
                  onClick={() => refetchAiReview()}
                  disabled={aiReviewFetching}
                >
                  <RefreshCw size={12} />{" "}
                  {aiReviewFetching ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </>
          ) : (
            <p className="eb-panel__hint">
              Select an electricity billing period to generate a review.
            </p>
          )}
        </div>
      </section>
    );
  };

  const renderExpandedPeriodDetails = (period) => {
    if (!period || selectedPeriodId !== period.id) return null;
    const displayStatus = getDisplayStatus(period);

    return (
      <div className="eb-period-detail eb-period-detail--minimal">
        <div className="eb-minimal-header">
          <div className="eb-minimal-header__info">
            <span
              className={`eb-status-indicator eb-status-indicator--${displayStatus}`}
            >
              {getDisplayStatusLabel(period)}
            </span>
            <button
              type="button"
              className="eb-btn-text eb-btn-text--subtle"
              onClick={() => setSelectedPeriodId(null)}
            >
              Close
            </button>
          </div>
        </div>

        <div className="eb-period-detail__body eb-period-detail__body--minimal">
          {activePanel === "aiReview" && selectedPeriodId === period.id
            ? renderAiReviewPanel()
            : null}
          {result ? (
            <>
              <div className="eb-minimal-stats">
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">
                    {utilityType === "water"
                      ? "Total covered days"
                      : `Total ${utilityType === "electricity" ? "kWh" : "cu.m."}`}
                  </span>
                  <span className="eb-minimal-stat__value">
                    {fmtNumber(result.computedTotalUsage, 2)}
                  </span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Room Cost</span>
                  <span className="eb-minimal-stat__value eb-minimal-stat__value--highlight">
                    {fmtCurrency(
                      result.totalRoomCost || result.computedTotalCost,
                    )}
                  </span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">
                    {utilityType === "water" ? "Water charge" : "Current Rate"}
                  </span>
                  <span className="eb-minimal-stat__value">
                    {fmtCurrency(result.ratePerUnit)}{" "}
                    <small>
                      /{utilityType === "electricity" ? "kWh" : "cu.m."}
                    </small>
                  </span>
                </div>
                <div className="eb-minimal-stat">
                  <span className="eb-minimal-stat__label">Segments</span>
                  <span className="eb-minimal-stat__value">
                    {result.segments?.length || 0}
                  </span>
                </div>
              </div>

              <div className="eb-result-flow">
                <div className="eb-result-flow__header">
                  <div className="eb-result-flow__title">
                    <span className="eb-result-flow__text">
                      Segment Breakdown
                    </span>
                    {result.verified ? (
                      <span className="eb-verified-badge">
                        <Check size={12} strokeWidth={2.5} /> Verified
                      </span>
                    ) : (
                      <span className="eb-unverified-badge">
                        <AlertTriangle size={12} strokeWidth={2.5} /> Unverified
                      </span>
                    )}
                  </div>
                </div>

                <div className="eb-result-flow__content">
                  <div className="eb-segment-grid">
                    {(result.segments || []).map((seg, index) => (
                      <div
                        className="eb-table-fluid eb-segment-card"
                        key={`${period.id}-segment-${index}`}
                      >
                        <table className="eb-table-minimal eb-table-minimal--bordered">
                          <colgroup>
                            <col style={{ width: "45%" }} />
                            <col style={{ width: "25%" }} />
                            <col style={{ width: "30%" }} />
                          </colgroup>
                          <thead>
                            <tr className="eb-segment-table__head-row">
                              <th
                                colSpan="2"
                                className="eb-segment-table__head-label"
                              >
                                No. of occupants in the room:
                              </th>
                              <th className="eb-align-center eb-segment-table__head-count">
                                {seg.activeTenantCount}
                              </th>
                            </tr>
                            <tr>
                              <th></th>
                              <th className="eb-align-center eb-segment-table__subhead">
                                Date
                              </th>
                              <th className="eb-align-center eb-segment-table__subhead">
                                {utilityType === "electricity"
                                  ? "kwh"
                                  : "cu.m."}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="eb-text-muted">1st reading</td>
                              <td className="eb-align-center">
                                {seg.startDate
                                  ? new Date(seg.startDate).toLocaleDateString()
                                  : (seg.periodLabel || "").split(
                                      /\s*[-–]\s*/,
                                    )[0] || "-"}
                              </td>
                              <td className="eb-align-center">
                                {fmtNumber(seg.readingFrom, 2)}
                              </td>
                            </tr>
                            <tr>
                              <td className="eb-text-muted">2nd reading</td>
                              <td className="eb-align-center">
                                {seg.endDate
                                  ? new Date(seg.endDate).toLocaleDateString()
                                  : (seg.periodLabel || "").split(
                                      /\s*[-–]\s*/,
                                    )[1] || "-"}
                              </td>
                              <td className="eb-align-center">
                                {fmtNumber(seg.readingTo, 2)}
                              </td>
                            </tr>
                            <tr>
                              <td className="eb-text-muted">Segment period</td>
                              <td className="eb-align-center" colSpan={2}>
                                {getSegmentPeriodLabel(seg)}
                              </td>
                            </tr>
                            <tr>
                              <td className="eb-text-muted">Boundary events</td>
                              <td className="eb-align-center" colSpan={2}>
                                {EVENT_TYPE_LABELS[seg.startEventType] ||
                                  seg.startEventType ||
                                  "Regular"}{" "}
                                to{" "}
                                {EVENT_TYPE_LABELS[seg.endEventType] ||
                                  seg.endEventType ||
                                  "Regular"}
                              </td>
                            </tr>
                            <tr>
                              <td className="eb-text-muted eb-text-italic">
                                Total consumption
                              </td>
                              <td
                                className="eb-align-center"
                                style={{ borderBottom: "none" }}
                              ></td>
                              <td className="eb-align-center">
                                {fmtNumber(seg.unitsConsumed, 2)}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan="2" className="eb-text-muted">
                                Segment total cost
                              </td>
                              <td className="eb-align-center eb-text-strong">
                                {fmtCurrency(seg.totalCost)}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan="2" className="eb-text-muted">
                                Amount due (Php{" "}
                                {fmtNumber(result.ratePerUnit, 2)} /{" "}
                                {utilityType === "electricity"
                                  ? "kwh"
                                  : "cu.m."}
                                ) per person
                              </td>
                              <td className="eb-align-center eb-text-strong eb-segment-table__amount">
                                {fmtCurrency(seg.sharePerTenantCost)}
                              </td>
                            </tr>
                            <tr>
                              <td className="eb-text-muted">Covered tenants</td>
                              <td className="eb-align-center" colSpan={2}>
                                {seg.coveredTenantNames?.length
                                  ? seg.coveredTenantNames.join(", ")
                                  : "No active tenant"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div className="eb-section__footer eb-section__footer--export">
                          <button
                            type="button"
                            className="eb-btn eb-btn--ghost"
                            onClick={() =>
                              handleExportSegment(
                                period,
                                seg,
                                index,
                                result.ratePerUnit,
                              )
                            }
                          >
                            <Download size={13} /> Export
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="eb-section-divider">
                    <div className="eb-table-fluid">
                      <table className="eb-table-minimal w-100">
                        <colgroup>
                          <col style={{ width: "32%" }} />
                          <col style={{ width: "24%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "22%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Tenant Name</th>
                            <th>Duration Range</th>
                            <th className="eb-align-right">
                              Total{" "}
                              {utilityType === "electricity" ? "kWh" : "cu.m."}
                            </th>
                            <th className="eb-align-right">Bill Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result.tenantSummaries || []).map(
                            (tenant, index) => (
                              <tr key={`${period.id}-tenant-${index}`}>
                                <td>
                                  <div className="eb-tenant-identity">
                                    <div className="eb-tenant-identity__name">
                                      {tenant.tenantName}
                                    </div>
                                    <div className="eb-tenant-identity__email">
                                      {tenant.tenantEmail || EMPTY_VALUE}
                                    </div>
                                  </div>
                                </td>
                                <td>{tenant.durationRange || "Ongoing"}</td>
                                <td className="eb-align-right">
                                  {fmtNumber(tenant.totalUsage, 4)}
                                </td>
                                <td className="eb-align-right eb-text-strong">
                                  {fmtCurrency(tenant.billAmount)}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                      <div className="eb-section__footer eb-section__footer--export">
                        <button
                          type="button"
                          className="eb-btn eb-btn--ghost"
                          onClick={() =>
                            handleExportTenantSummary(period, result)
                          }
                        >
                          <Download size={13} /> Export
                        </button>
                      </div>
                    </div>
                  </div>
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
    <section
      className="space-y-4"
      aria-label={`${utilityType} billing workspace`}
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:auto-rows-auto">
        <aside className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent,#D4AF37)]">
              <Search size={12} className="shrink-0" />
              Room Selection
            </span>
            <span className="text-xs text-muted-foreground">
              {filteredRooms.length} rooms
            </span>
          </div>

          <div className="mt-3">
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
              style={{ outlineColor: "var(--ring)" }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--ring)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.boxShadow = "";
              }}
              // // style={{ "--tw-ring-color": "var(--primary)" }}
              // // onFocus={(e) => {
              // //   e.currentTarget.style.borderColor = "var(--primary)";
              // //   e.currentTarget.style.boxShadow =
              // //     "0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)";
              // // }}
              // onBlur={(e) => {
              //   e.currentTarget.style.borderColor = "";
              //   e.currentTarget.style.boxShadow = "";
              // }}
              placeholder="Search by room name or number..."
              value={sidebarSearch}
              onChange={(e) => {
                setSidebarSearch(e.target.value);
                setRoomsPage(1);
              }}
              aria-label="Search rooms"
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={branchFilter}
              onChange={(e) => {
                if (!isOwner) return;
                setBranchFilter(e.target.value);
                setSelectedRoomId(null);
                setSelectedPeriodId(null);
                setRoomsPage(1);
              }}
              disabled={!isOwner}
              className="rounded-lg border border-border bg-card px-2 py-2 text-xs text-muted-foreground disabled:bg-muted focus:outline-none"
              style={{ outlineColor: "var(--ring)" }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--ring)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.boxShadow = "";
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <option value="">All branches</option>
              <option value="gil-puyat">Gil-Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>
            <select
              defaultValue="all"
              disabled
              className="rounded-lg border border-border bg-muted px-2 py-2 text-xs text-muted-foreground"
            >
              <option value="all">All status</option>
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {roomsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 w-full animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {sidebarSearch
                  ? "No rooms match your search"
                  : "No rooms found"}
              </div>
            ) : (
              pagedRooms.map((room) => {
                const statusTone = getHistoryStatusClasses(
                  room.billingState || "no_active_cycle",
                );
                const isSelected = selectedRoomId === room.id;
                return (
                  <button
                    key={room.id}
                    className="w-full rounded-lg border px-3 py-2 text-left transition"
                    style={
                      isSelected
                        ? {
                            borderColor: "var(--primary)",
                            background:
                              "color-mix(in srgb, var(--primary) 12%, var(--card))",
                          }
                        : {}
                    }
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--muted)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "";
                        e.currentTarget.style.borderColor = "";
                      }
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Select ${getRoomLabel(room)} room`}
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setPeriodsPage(1);
                      setTimelinePage(1);
                      closePanel();
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-card-foreground">
                        {getRoomLabel(room)}
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: room.hasActiveTenants
                            ? "var(--success)"
                            : "var(--neutral)",
                        }}
                        title={
                          room.hasActiveTenants
                            ? "Has active tenants"
                            : "No tenants"
                        }
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone}`}
                      >
                        {getRoomBadgeLabel(room)}
                      </span>
                      {room.latestReading != null && (
                        <span className="text-[11px] text-muted-foreground">
                          {room.latestReading}{" "}
                          {utilityType === "electricity" ? "kWh" : "cu.m."}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Use filters to quickly find and select rooms. Manage meter readings
            and billing for the selected room.
          </div>

          {filteredRooms.length > ROOMS_PER_PAGE && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{filteredRooms.length} rooms</span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
                  disabled={roomsPage <= 1}
                  onClick={() => setRoomsPage((p) => p - 1)}
                  aria-label="Previous room page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {roomsPage}/{totalRoomPages}
                </span>
                <button
                  className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
                  disabled={roomsPage >= totalRoomPages}
                  onClick={() => setRoomsPage((p) => p + 1)}
                  aria-label="Next room page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </aside>

        <div className="space-y-4">
          {!selectedRoomId ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <Zap size={36} strokeWidth={1.5} className="text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-card-foreground">
                Select a room to continue
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a room on the left to manage{" "}
                {utilityType === "water" ? "water" : "electricity"} cycles,
                readings, and sending.
              </p>
            </div>
          ) : (
            <div className="eb-content">
              <div className="eb-header">
                <div className="eb-header__left">
                  <div className="eb-header__meta">
                    <h2 className="eb-header__title">
                      {getRoomLabel(selectedRoom)}
                    </h2>
                    <p className="eb-header__subtitle">
                      Manage cycle setup, readings, and publishing for this
                      room.
                    </p>
                  </div>
                  <span className="eb-header__branch">
                    {selectedRoom?.branch}
                  </span>
                  {selectedRoom?.type && (
                    <span className="eb-header__room-type">
                      {selectedRoom.type}
                    </span>
                  )}
                </div>
                <div className="eb-header__actions">
                  {canRequestAiReview && (
                    <button
                      className="eb-btn eb-btn--outline"
                      onClick={() => openAiReview(selectedPeriodFromList.id)}
                    >
                      <Sparkles size={13} /> AI Review
                    </button>
                  )}
                  <button
                    className="eb-btn eb-btn--primary"
                    onClick={() => setIsNewPeriodModalOpen(true)}
                  >
                    <Calendar size={16} strokeWidth={2} />
                  </span>
                  <h3
                    className="text-[15px] font-semibold leading-none text-card-foreground
"
                  >
                    {getRoomLabel(selectedRoom)}
                  </h3>
                </div>

                {currentPeriod ? (
                  <>
                    <div className="mt-7 grid gap-10 md:grid-cols-2">
                      <div>
                        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Current Cycle
                        </p>
                        <p
                          className="mt-2 text-[28px] font-medium leading-none tracking-[-0.04em] text-card-foreground
"
                        >
                          {getCycleLabel(currentPeriod)}
                        </p>
                        <p className="mt-2 text-[14px] font-normal text-muted-foreground">
                          {fmtDate(currentPeriod.startDate)} -{" "}
                          {fmtDate(
                            currentPeriod.endDate ||
                              currentPeriod.targetCloseDate,
                          ) || "Ongoing"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Rate
                        </p>
                        <p
                          className="mt-2 text-[28px] font-medium leading-none tracking-[-0.04em] text-card-foreground
"
                        >
                          {currentPeriodCost != null
                            ? fmtCurrency(currentPeriodCost)
                            : EMPTY_VALUE}
                        </p>
                        <p className="mt-2 text-[14px] font-normal text-muted-foreground">
                          Rate: {fmtCurrency(currentPeriod.ratePerUnit)} /
                          {utilityType === "electricity" ? "kWh" : "cu.m."} |{" "}
                          {currentPeriodUsage != null
                            ? `${fmtNumber(currentPeriodUsage, 2)} ${utilityType === "electricity" ? "kWh" : "cu.m."}`
                            : EMPTY_VALUE}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-border pt-6">
                      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Consumption
                      </p>
                      <p
                        className="mt-3 text-[30px] font-medium leading-none tracking-[-0.04em] text-primary
"
                      >
                        {currentPeriodUsage != null
                          ? fmtNumber(currentPeriodUsage, 2)
                          : EMPTY_VALUE}{" "}
                        {utilityType === "electricity" ? "kWh" : "cu.m."}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center gap-2 px-4 py-24 text-center">
                    <FileX size={28} style={{ color: "var(--neutral)" }} />
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--neutral)" }}
                    >
                      No billing cycle yet.
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--neutral-dark)" }}
                    >
                      Use New Billing Period to create your first cycle.
                    </p>
                  </div>
                )}
              </div>

              <section className="eb-section">
                <div className="eb-section__header">
                  <h3 className="eb-section__title eb-section__title--primary">
                    Billing Timeline
                    <span className="eb-section__count eb-section__count--inline">
                      {billingTimelineRows.length}
                    </span>
                  </h3>
                  <div className="eb-section__header-actions">
                    <button
                      type="button"
                      className="eb-btn eb-btn--ghost eb-btn--xs"
                      onClick={handleExportTimeline}
                      disabled={billingTimelineRows.length === 0}
                    >
                      <Download size={12} /> Export
                    </button>
                  </div>
                </div>
                <p className="eb-section__hint">
                  Latest meter and occupancy events for the selected billing
                  period.
                </p>
                <div className="eb-section-body eb-section-body--spaced">
                  <>
                    <div className="eb-table-wrap eb-table-wrap--timeline">
                      <table className="eb-table eb-table--timeline">
                        <colgroup>
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "14%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Event</th>
                            <th>Tenant</th>
                            <th>Bed</th>
                            <th>Reading</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedTimelineRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="eb-cell--muted eb-cell--empty"
                              >
                                No timeline events found for this billing
                                period.
                              </td>
                            </tr>
                          ) : (
                            pagedTimelineRows.map((row) => (
                              <tr key={row.id}>
                                <td>{fmtDate(row.date)}</td>
                                <td>
                                  <div className="eb-timeline-event">
                                    <div className="eb-timeline-event__title">
                                      {getEventTypeLabel(row.eventType)}
                                    </div>
                                    <div className="eb-timeline-event__meta">
                                      <span className="eb-timeline-badge">
                                        {getTimelineRecordLabel(row)}
                                      </span>
                                      <span className="eb-timeline-badge eb-timeline-badge--status">
                                        {getTimelineStatusLabel(row)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  {!isMoveLifecycleEvent(row.eventType) ? (
                                    "Room Level"
                                  ) : (
                                    <div className="eb-tenant-identity">
                                      <div className="eb-tenant-identity__name">
                                        {maskName(row.tenantName)}
                                      </div>
                                      <div className="eb-tenant-identity__email">
                                        {row.tenantEmail || EMPTY_VALUE}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {!isMoveLifecycleEvent(row.eventType)
                                    ? "Room Level"
                                    : row.bedName || EMPTY_VALUE}
                                </td>
                                <td>
                                  {row.reading != null
                                    ? `${fmtNumber(row.reading, 2)} ${
                                        utilityType === "electricity"
                                          ? "kWh"
                                          : "cu.m."
                                      }`
                                    : EMPTY_VALUE}
                                </td>
                                <td className="eb-cell--actions eb-cell--actions-nowrap">
                                  {row.hasMeterRecord && row.rawReading ? (
                                    <>
                                      <button
                                        className="eb-btn eb-btn--xs eb-btn--outline"
                                        onClick={() =>
                                          handleEditReading(row.rawReading)
                                        }
                                        disabled={isSystemBoundaryEvent(
                                          row.eventType,
                                        )}
                                        title={
                                          isSystemBoundaryEvent(row.eventType)
                                            ? "Boundary events are locked to preserve billing integrity."
                                            : "Manage reading"
                                        }
                                      >
                                        <Pencil size={11} /> Manage
                                      </button>
                                    </>
                                  ) : (
                                    <span className="eb-cell--muted">—</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={timelinePage}
                      total={totalTimelinePages}
                      onChange={setTimelinePage}
                      countLabel={`${billingTimelineRows.length} timeline entr${billingTimelineRows.length === 1 ? "y" : "ies"}`}
                    />
                  </>
                </div>
              </section>

              <section className="eb-section eb-section--primary">
                <div className="eb-section__header">
                  <h3 className="eb-section__title eb-section__title--primary">
                    <Zap
                      size={14}
                      style={{ color: "var(--color-accent-hover, #E0752E)" }}
                    />
                    Billing Cycle History
                  </h3>
                  <div className="eb-section__header-actions">
                    <span className="eb-section__count">
                      {periods.length} period{periods.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      className="eb-btn eb-btn--ghost eb-btn--xs"
                      onClick={handleExportPeriodHistory}
                      disabled={periods.length === 0 || isExporting}
                    >
                      <Download size={12} />{" "}
                      {isExporting ? "Exporting..." : "Export"}
                    </button>
                  </div>
                </div>
                <p className="eb-section__hint">
                  Closed and revised periods remain available for review,
                  sending, and revision actions.
                </p>
                {periods.length === 0 ? (
                  <p className="eb-empty-hint">
                    No billing history for this room yet.
                  </p>
                ) : (
                  <>
                    <div className="eb-table-wrap eb-table-wrap--history">
                      <table className="eb-table eb-table--history">
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
                            <th>
                              {utilityType === "water" ? "Basis" : "Meter"}
                            </th>
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
                                  selectedPeriodId === p.id
                                    ? "eb-row--selected"
                                    : "",
                                  p.status === "open" ? "eb-row--open" : "",
                                ]
                                  .join(" ")
                                  .trim()}
                                onClick={() =>
                                  (p.status === "closed" ||
                                    p.status === "revised") &&
                                  selectAndFocusPeriod(p.id)
                                }
                                style={{
                                  cursor:
                                    p.status === "closed" ||
                                    p.status === "revised"
                                      ? "pointer"
                                      : "default",
                                }}
                                title={
                                  p.status === "closed" ||
                                  p.status === "revised"
                                    ? "Click to view this billing cycle"
                                    : undefined
                                }
                              >
                                <td>
                                  <div className="eb-period-summary">
                                    <strong className="eb-period-label__title">
                                      {getCycleLabel(p)}
                                    </strong>
                                    <span className="eb-period-summary__meta">
                                      {p.status === "closed" ||
                                      p.status === "revised"
                                        ? "Move-in start to billing end"
                                        : "Current active cycle"}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="eb-period-summary">
                                    <span className="eb-period-summary__value">
                                      {getMeterRangeLabel(p, utilityType)}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className="eb-rate-display">
                                    {fmtCurrency(p.ratePerUnit)}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`eb-status-pill eb-status-pill--${getDisplayStatus(p)}`}
                                  >
                                    {getDisplayStatusLabel(p)}
                                  </span>
                                  {p.revised ? (
                                    <span className="eb-revised-tag">
                                      edited
                                    </span>
                                  ) : null}
                                </td>
                                <td
                                  className="eb-cell--actions eb-cell--actions-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {getDisplayStatus(p) === "ready_to_send" && (
                                    <button
                                      type="button"
                                      className="eb-btn eb-btn--xs eb-btn--primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSendPeriod(
                                          p,
                                          getRoomLabel(
                                            selectedRoom || {},
                                            "Room",
                                          ),
                                        );
                                      }}
                                      disabled={
                                        Boolean(sendingByPeriodId[p.id]) ||
                                        sendPeriod.isPending
                                      }
                                    >
                                      <Send size={11} />{" "}
                                      {sendingByPeriodId[p.id]
                                        ? "Sending..."
                                        : "Send"}
                                    </button>
                                  )}
                                  {utilityType === "electricity" && (
                                    <button
                                      type="button"
                                      className="eb-btn eb-btn--xs eb-btn--outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAiReview(p.id);
                                      }}
                                    >
                                      <Sparkles size={11} /> AI Review
                                    </button>
                                  )}
                                  {canEditPeriod(p) && (
                                    <button
                                      type="button"
                                      className="eb-btn eb-btn--xs eb-btn--outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditPeriod(p);
                                      }}
                                    >
                                      <Pencil size={11} /> Edit
                                    </button>
                                  )}
                                  {canDeletePeriod(p) && (
                                    <button
                                      type="button"
                                      className="eb-btn eb-btn--xs eb-btn--danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePeriod(p.id);
                                      }}
                                      disabled={deletePeriod.isPending}
                                    >
                                      <Trash2 size={11} />{" "}
                                      {deletePeriod.isPending
                                        ? "Deleting..."
                                        : "Delete"}
                                    </button>
                                  )}
                                  {(p.status === "closed" ||
                                    p.status === "revised") && (
                                    <button
                                      type="button"
                                      className="eb-btn eb-btn--xs eb-btn--ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectAndFocusPeriod(p.id);
                                      }}
                                      aria-label={
                                        selectedPeriodId === p.id
                                          ? "Collapse billing cycle details"
                                          : "Expand billing cycle details"
                                      }
                                      title={
                                        selectedPeriodId === p.id
                                          ? "Hide details"
                                          : "Show details"
                                      }
                                    >
                                      {selectedPeriodId === p.id ? (
                                        <ChevronUp size={14} />
                                      ) : (
                                        <ChevronDown size={14} />
                                      )}
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {selectedPeriodId === p.id &&
                                (p.status === "closed" ||
                                  p.status === "revised") && (
                                  <tr className="eb-history-detail-row">
                                    <td
                                      colSpan={5}
                                      className="eb-history-detail-cell"
                                    >
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
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent,#D4AF37)]">
              <History size={12} className="shrink-0" />
              Billing Cycle History
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Closed and revised periods remain available for review, sending,
              and revision actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
              onClick={() => setIsNewPeriodModalOpen(true)}
            >
              <Plus size={12} /> New Billing Period
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={handleExportRows}
              disabled={isExporting}
            >
              <Download size={12} />
              {isExporting ? "Exporting..." : "Upload & Export"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {/* Status filter */}
          <select
            value={periodStatusFilter}
            onChange={(e) => {
              setPeriodStatusFilter(e.target.value);
              setPeriodsPage(1);
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground focus:outline-none appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg' width%3D'16' height%3D'16' viewBox%3D'0 0 24 24' fill%3D'none' stroke%3D'%231e293b' stroke-width%3D'2' stroke-linecap%3D'round' stroke-linejoin%3D'round'%3E%3Cpolyline points%3D'6 9 12 15 18 9'%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
              backgroundSize: "14px 14px",
              paddingRight: "32px",
            }}
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </select>

          {/* Start date */}
          <input
            type="date"
            value={periodStartDate}
            onChange={(e) => {
              setPeriodStartDate(e.target.value);
              setPeriodsPage(1);
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground focus:outline-none"
            style={{ outlineColor: "var(--ring)" }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--ring)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "";
            }}
          />

          {/* End date */}
          <input
            type="date"
            value={periodEndDate}
            onChange={(e) => {
              setPeriodEndDate(e.target.value);
              setPeriodsPage(1);
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground focus:outline-none"
            style={{ outlineColor: "var(--ring)" }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--ring)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "";
            }}
          />

          {/* Cycle search */}
          <input
            type="text"
            value={periodSearch}
            onChange={(e) => {
              setPeriodSearch(e.target.value);
              setPeriodsPage(1);
            }}
            placeholder="Search by cycle..."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
            style={{ outlineColor: "var(--ring)" }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--ring)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.boxShadow = "";
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {filteredPeriods.length} of {periods.length} billing cycles
          </p>
          {(periodStatusFilter ||
            periodStartDate ||
            periodEndDate ||
            periodSearch) && (
            <button
              type="button"
              className="text-xs font-medium transition-colors"
              style={{ color: "var(--neutral)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--foreground)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--neutral)")
              }
              onClick={() => {
                setPeriodStatusFilter("");
                setPeriodStartDate("");
                setPeriodEndDate("");
                setPeriodSearch("");
                setPeriodsPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-3 min-h-[420px] space-y-2">
          {filteredPeriods.length === 0 ? (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
              <ClipboardX size={28} style={{ color: "var(--neutral)" }} />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--neutral)" }}
              >
                {periods.length === 0
                  ? "No billing history yet."
                  : "No cycles match your filters."}
              </p>
              <p className="text-xs" style={{ color: "var(--neutral-dark)" }}>
                {periods.length === 0
                  ? "Closed and revised periods will appear here once created."
                  : "Try adjusting your filters or clearing them."}
              </p>
            </div>
          ) : (
            pagedPeriods.map((p) => {
              const status = getDisplayStatus(p);
              const isClickable =
                p.status === "closed" || p.status === "revised";
              return (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 ${
                    isClickable ? "cursor-pointer" : "cursor-default"
                  }`}
                  onClick={() => isClickable && openHistoryModal(p.id)}
                  title={
                    isClickable ? "Click to view this billing cycle" : undefined
                  }
                >
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      {getCycleLabel(p)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {getMeterRangeLabel(p, utilityType)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {fmtCurrency(p.ratePerUnit)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getHistoryStatusClasses(status)}`}
                    >
                      {getDisplayStatusLabel(p)}
                    </span>
                    {p.revised ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background:
                            "color-mix(in srgb, var(--warning) 12%, var(--card))",
                          color: "var(--warning-dark)",
                        }}
                      >
                        Edited
                      </span>
                    ) : null}
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {getDisplayStatus(p) === "ready_to_send" && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                          style={{
                            background: "var(--primary)",
                            color: "var(--primary-foreground)",
                          }}
                          onClick={() =>
                            handleSendPeriod(
                              p,
                              getRoomLabel(selectedRoom || {}, "Room"),
                            )
                          }
                          disabled={
                            Boolean(sendingByPeriodId[p.id]) ||
                            sendPeriod.isPending
                          }
                        >
                          <Send size={11} />
                          {sendingByPeriodId[p.id] ? "Sending..." : "Send"}
                        </button>
                      )}
                      {canEditPeriod(p) && (
                        <button
                          type="button"
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => handleOpenEditPeriod(p)}
                          aria-label="Edit period"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {canDeletePeriod(p) && (
                        <button
                          type="button"
                          className="rounded-md border border-border p-1 hover:bg-muted"
                          style={{ color: "var(--danger)" }}
                          onClick={() => handleDeletePeriod(p.id)}
                          aria-label="Delete period"
                          disabled={deletePeriod.isPending}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      {(p.status === "closed" || p.status === "revised") && (
                        <button
                          type="button"
                          className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                          onClick={() => openHistoryModal(p.id)}
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Pagination
          page={periodsPage}
          total={totalPeriodPages}
          onChange={setPeriodsPage}
          countLabel={`${filteredPeriods.length} of ${periods.length} period${periods.length !== 1 ? "s" : ""}`}
        />
      </section>
      {/* Edit Reading Modal */}
      {editReadingModal.open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{
            background:
              "color-mix(in srgb, var(--background) 60%, transparent)",
          }}
          onClick={() => setEditReadingModal({ open: false, reading: null })}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="text-sm font-semibold text-foreground">
                Manage Meter Reading
              </span>
              <button
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-card-foreground"
                onClick={() =>
                  setEditReadingModal({ open: false, reading: null })
                }
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Reading ({utilityType === "electricity" ? "kWh" : "cu.m."})
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                    style={{ outlineColor: "var(--ring)" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--ring)";
                      e.currentTarget.style.boxShadow =
                        "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                    value={editReadingForm.reading}
                    onChange={(e) =>
                      setEditReadingForm({
                        ...editReadingForm,
                        reading: e.target.value,
                      })
                    }
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                    style={{ outlineColor: "var(--ring)" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--ring)";
                      e.currentTarget.style.boxShadow =
                        "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                    value={editReadingForm.date}
                    onChange={(e) =>
                      setEditReadingForm({
                        ...editReadingForm,
                        date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Event
                  </label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                    style={{ outlineColor: "var(--ring)" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--ring)";
                      e.currentTarget.style.boxShadow =
                        "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "";
                    }}
                    value={editReadingForm.eventType}
                    onChange={(e) =>
                      setEditReadingForm({
                        ...editReadingForm,
                        eventType: e.target.value,
                      })
                    }
                  >
                    <option value="moveIn">Move-In</option>
                    <option value="moveOut">Move-Out</option>
                    <option value="manualAdjustment">Manual Adjustment</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
                onClick={handleSaveEditReading}
                disabled={updateReading.isPending}
              >
                <Check size={13} />{" "}
                {updateReading.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{
                  borderColor: "var(--danger)",
                  color: "var(--danger-dark)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--danger-light)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                onClick={() => {
                  if (!editReadingModal.reading?.id) return;
                  setEditReadingModal({ open: false, reading: null });
                  handleDeleteReading(editReadingModal.reading.id);
                }}
                disabled={updateReading.isPending}
              >
                <Trash2 size={13} /> Delete Reading
              </button>
              <button
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                onClick={() =>
                  setEditReadingModal({ open: false, reading: null })
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editPeriodModal.open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{
            background:
              "color-mix(in srgb, var(--background) 60%, transparent)",
          }}
          onClick={() => setEditPeriodModal({ open: false, periodId: null })}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="text-sm font-semibold text-foreground">
                Edit Billing Period
              </span>
              <button
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-card-foreground"
                onClick={() =>
                  setEditPeriodModal({ open: false, periodId: null })
                }
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Cycle Start
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                  style={{ outlineColor: "var(--ring)" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--ring)";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.boxShadow = "";
                  }}
                  value={editPeriodForm.startDate}
                  onChange={(e) =>
                    setEditPeriodForm((current) => ({
                      ...current,
                      startDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Cycle End
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                  style={{ outlineColor: "var(--ring)" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--ring)";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.boxShadow = "";
                  }}
                  value={editPeriodForm.endDate}
                  onChange={(e) =>
                    setEditPeriodForm((current) => ({
                      ...current,
                      endDate: e.target.value,
                    }))
                  }
                />
              </div>
              {utilityType === "electricity" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Start Meter Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                      style={{ outlineColor: "var(--ring)" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--ring)";
                        e.currentTarget.style.boxShadow =
                          "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.boxShadow = "";
                      }}
                      value={editPeriodForm.startReading}
                      onChange={(e) =>
                        setEditPeriodForm((current) => ({
                          ...current,
                          startReading: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      End Meter Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                      style={{ outlineColor: "var(--ring)" }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--ring)";
                        e.currentTarget.style.boxShadow =
                          "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.boxShadow = "";
                      }}
                      value={editPeriodForm.endReading}
                      onChange={(e) =>
                        setEditPeriodForm((current) => ({
                          ...current,
                          endReading: e.target.value,
                        }))
                      }
                    />
                  </div>
                </>
              )}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-card-foreground focus:outline-none"
                  style={{ outlineColor: "var(--ring)" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--ring)";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.boxShadow = "";
                  }}
                  value={editPeriodForm.ratePerUnit}
                  onChange={(e) =>
                    setEditPeriodForm((current) => ({
                      ...current,
                      ratePerUnit: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
                onClick={handleSaveEditPeriod}
                disabled={updatePeriod.isPending}
              >
                <Save size={13} />{" "}
                {updatePeriod.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                onClick={() =>
                  setEditPeriodModal({ open: false, periodId: null })
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="lg:col-span-2 flex max-h-[600px] flex-col rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent,#D4AF37)]">
              <Clock3 size={12} className="shrink-0" />
              Billing Timeline
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Latest meter and occupancy events for the active/latest billing
              period.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {billingTimelineRows.length} events
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={handleExportTimeline}
              disabled={billingTimelineRows.length === 0}
            >
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {pagedTimelineRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              No timeline events found for this billing period.
            </div>
          ) : (
            pagedTimelineRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border/60 px-3 py-3"
              >
                <div className="flex min-w-[220px] flex-1 gap-3">
                  <span
                    className={`mt-1 h-2.5 w-2.5 rounded-full ${getTimelineDotClasses(
                      row.eventType,
                    )}`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      {getEventTypeLabel(row.eventType)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {getTimelineRecordLabel(row)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {getTimelineStatusLabel(row)}
                      </span>
                      <span className="text-muted-foreground">
                        {!isMoveLifecycleEvent(row.eventType)
                          ? "Room Level"
                          : maskName(row.tenantName)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.reading != null
                        ? `${fmtNumber(row.reading, 2)} ${
                            utilityType === "electricity" ? "kWh" : "cu.m."
                          }`
                        : EMPTY_VALUE}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(row.date)}
                  </span>
                  {row.hasMeterRecord && row.rawReading ? (
                    <button
                      className={`inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${
                        isCurrentCycleLocked
                          ? "cursor-not-allowed opacity-40"
                          : ""
                      }`}
                      onClick={() => handleEditReading(row.rawReading)}
                      disabled={
                        isSystemBoundaryEvent(row.eventType) ||
                        isCurrentCycleLocked
                      }
                      title={
                        isCurrentCycleLocked
                          ? "This billing cycle is locked."
                          : isSystemBoundaryEvent(row.eventType)
                            ? "Boundary events are locked to preserve billing integrity."
                            : "Manage reading"
                      }
                    >
                      <Pencil size={12} /> Manage
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <Pagination
          page={timelinePage}
          total={totalTimelinePages}
          onChange={setTimelinePage}
          countLabel={`${billingTimelineRows.length} timeline entr${
            billingTimelineRows.length === 1 ? "y" : "ies"
          }`}
        />
      </section>

      <BillingCycleDetailModal
        isOpen={isHistoryModalOpen}
        onClose={closeHistoryModal}
        period={historyModalPeriod}
        result={result}
        utilityType={utilityType}
        statusLabel={
          historyModalPeriod ? getDisplayStatusLabel(historyModalPeriod) : ""
        }
        isReadOnly={
          historyModalPeriod ? !canEditPeriod(historyModalPeriod) : true
        }
        formatters={{
          fmtCurrency,
          fmtNumber,
          fmtShortDate,
          getSegmentPeriodLabel,
        }}
        eventTypeLabels={EVENT_TYPE_LABELS}
        onExport={
          historyModalPeriod && result
            ? () => handleExportTenantSummary(historyModalPeriod, result)
            : null
        }
      />

      {/* New Billing Period Modal */}
      <NewBillingPeriodModal
        isOpen={isNewPeriodModalOpen}
        onClose={() => setIsNewPeriodModalOpen(false)}
        utilityType={utilityType}
        selectedRoomId={selectedRoomId}
        selectedPeriodId={selectedPeriodId}
        openPeriodForRoom={openPeriodForRoom}
        lastClosedPeriod={lastClosedPeriod}
        latestReading={latestData?.reading}
        defaultRatePerUnit={defaultRatePerUnit}
        onSuccess={(newPeriodId) => {
          if (newPeriodId) {
            selectAndFocusPeriod(newPeriodId);
          } else {
            setSelectedPeriodId(null);
          }
        }}
      />

      {/* Standard confirm modal */}

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant || "danger"}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </section>
  );
};

export default UtilityBillingTab;
