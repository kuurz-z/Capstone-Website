import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment } from "react";
import {
  Zap,
  Plus,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Pencil,
  Save,
  Download,
  Send,
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
  useSendUtilityPeriod,
  useReviseUtilityResult,
  useDeleteUtilityReading,
  useUpdateUtilityReading,
  useDeleteUtilityPeriod,
  useRoomHistory,
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
import BillingContentEmpty from "./shared/BillingContentEmpty";
import BillingRoomHeader from "./shared/BillingRoomHeader";
import BillingRoomList from "./shared/BillingRoomList";
import BillingStatusBadge from "./shared/BillingStatusBadge";
import InlineRateEditor from "./shared/InlineRateEditor";
import useBillingNotifier from "./shared/useBillingNotifier";
import "./UtilityBillingTab.css";

const EMPTY_VALUE = "-";
const WATER_BILLABLE_ROOM_TYPES = new Set([
  "private",
  "double-sharing",
  "quadruple-sharing",
]);
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
  period?.displayStatus || period?.status || "closed";
const getDisplayStatusLabel = (period) => {
  const status = getDisplayStatus(period);
  if (status === "ready") return "Ready";
  return status;
};
const getRoomBadgeLabel = (room) => {
  if (!room) return "Closed";
  if (room.latestPeriodDisplayStatus === "ready") return "Ready To Send";
  if (room.latestPeriodDisplayStatus === "finalized") return "Sent";
  if (room.hasOpenPeriod) return "Active";
  return "Closed";
};
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
  const [branchFilter, setBranchFilter] = useState(
    isOwner ? "" : user?.branch || "",
  );

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Panel / section state
  const [activePanel, setActivePanel] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [generationBlocker, setGenerationBlocker] = useState(null);
  const [editingRateId, setEditingRateId] = useState(null);
  const [editingRateValue, setEditingRateValue] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [detailVisibility, setDetailVisibility] = useState({
    segments: true,
    tenantSummary: true,
  });
  const [showSnapshotDetails, setShowSnapshotDetails] = useState(false);
  const [advancedPeriodActions, setAdvancedPeriodActions] = useState({});

  // Revision note modal
  const [reviseModal, setReviseModal] = useState({
    open: false,
    periodId: null,
  });
  const [revisionNote, setRevisionNote] = useState("");

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
  const ROOMS_PER_PAGE = 10;
  const [periodsPage, setPeriodsPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState(1);
  const [roomsPage, setRoomsPage] = useState(1);
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
    startDate: get15th(),
    startReading: "",
    ratePerUnit: "",
    endReading: "",
    endDate: getNext15th(),
  });

  // Queries
  const { data: businessSettings } = useBusinessSettings(Boolean(user));
  const { data: roomsData, isLoading: roomsLoading } = useUtilityRooms(
    utilityType,
    branchFilter,
  );
  const { data: readingsData } = useUtilityReadings(
    utilityType,
    selectedRoomId,
  );
  const { data: latestData } = useUtilityLatestReading(
    utilityType,
    selectedRoomId,
  );
  const { data: periodsData } = useUtilityPeriods(utilityType, selectedRoomId);
  const periodList = periodsData?.periods || [];
  const selectedPeriodFromList = periodList.find(
    (period) => period.id === selectedPeriodId,
  );
  const selectedResultPeriodId =
    selectedPeriodFromList && selectedPeriodFromList.status !== "open"
      ? selectedPeriodFromList.id
      : null;
  const { data: resultData } = useUtilityResult(
    utilityType,
    selectedResultPeriodId,
  );
  const { data: roomHistoryData } = useRoomHistory(utilityType, selectedRoomId);

  // Mutations
  const openPeriod = useOpenUtilityPeriod(utilityType);
  const updatePeriod = useUpdateUtilityPeriod(utilityType);
  const closePeriod = useCloseUtilityPeriod(utilityType);
  const sendPeriod = useSendUtilityPeriod(utilityType);
  const reviseResult = useReviseUtilityResult(utilityType);
  const deleteReading = useDeleteUtilityReading(utilityType);
  const updateReading = useUpdateUtilityReading(utilityType);
  const deletePeriod = useDeleteUtilityPeriod(utilityType);
  const [sendingByPeriodId, setSendingByPeriodId] = useState({});
  const [isSendingAllReady, setIsSendingAllReady] = useState(false);

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
      const meterKey =
        isMoveLifecycleEvent(eventType)
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
        (room) =>
          room.latestPeriodDisplayStatus === "ready" && room.latestPeriodId,
      ),
    [filteredRooms],
  );
  const selectedReadyPeriod =
    selectedPeriodFromList &&
    getDisplayStatus(selectedPeriodFromList) === "ready"
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

  // Paginated slices
  const totalRoomPages = Math.max(
    1,
    Math.ceil(filteredRooms.length / ROOMS_PER_PAGE),
  );
  const pagedRooms = filteredRooms.slice(
    (roomsPage - 1) * ROOMS_PER_PAGE,
    roomsPage * ROOMS_PER_PAGE,
  );
  const totalPeriodPages = Math.max(
    1,
    Math.ceil(periods.length / PERIODS_PER_PAGE),
  );
  const pagedPeriods = periods.slice(
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
      <div className="eb-pagination">
        <span className="eb-pagination__info">{countLabel}</span>
        <div className="eb-pagination__controls">
          <button
            className="eb-page-btn"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
          >
            &lt;
          </button>
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`eb-page-btn${page === n ? " eb-page-btn--active" : ""}`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
          <button
            className="eb-page-btn"
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
      setGenerationBlocker(null);
    }
    if (panel === "newPeriod") {
      // If a closed period exists, continue from where it left off
      // (replicates what auto-chain would have set)
      const continuationDate = lastClosedPeriod?.endDate
        ? toInputDate(lastClosedPeriod.endDate)
        : null;
      const continuationReading = lastClosedPeriod?.endReading ?? null;
      const startDate = continuationDate || get15th();
      setPeriodForm((f) => ({
        ...f,
        startReading: continuationReading ?? latestData?.reading?.reading ?? "",
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

  const toggleAdvancedPeriodActions = (periodId) => {
    setAdvancedPeriodActions((current) => ({
      ...current,
      [periodId]: !current[periodId],
    }));
  };

  const closePanel = () => setActivePanel(null);

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
                cycleText: room.latestPeriodDisplayStatus || "ready cycle",
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
            <span className="eb-minimal-header__date">
              {utilityType === "water" ? "Water Charge:" : "Meter Reading:"}{" "}
              {getMeterRangeLabel(period, utilityType)}
            </span>
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
                  <div className="eb-result-flow__actions">
                    <button
                      className="eb-btn-text eb-btn-text--subtle"
                      onClick={() =>
                        setDetailVisibility((current) => ({
                          ...current,
                          segments: !current.segments,
                        }))
                      }
                    >
                      {detailVisibility.segments
                        ? "Hide segments"
                        : "View segments"}
                    </button>
                    <button
                      className="eb-btn-text eb-btn-text--subtle"
                      onClick={() =>
                        setDetailVisibility((current) => ({
                          ...current,
                          tenantSummary: !current.tenantSummary,
                        }))
                      }
                    >
                      {detailVisibility.tenantSummary
                        ? "Hide tenants"
                        : "View tenants"}
                    </button>
                    <button
                      className="eb-btn-text eb-btn-text--primary"
                      onClick={() => handleRevise(selectedPeriodId)}
                      disabled={reviseResult.isPending}
                    >
                      <RefreshCw
                        size={13}
                        className={reviseResult.isPending ? "eb-spin" : ""}
                      />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                <div className="eb-result-flow__content">
                  {detailVisibility.segments && (
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
                                    ? new Date(
                                        seg.startDate,
                                      ).toLocaleDateString()
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
                                <td className="eb-text-muted">
                                  Segment period
                                </td>
                                <td className="eb-align-center" colSpan={2}>
                                  {getSegmentPeriodLabel(seg)}
                                </td>
                              </tr>
                              <tr>
                                <td className="eb-text-muted">
                                  Boundary events
                                </td>
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
                                <td className="eb-text-muted">
                                  Covered tenants
                                </td>
                                <td className="eb-align-center" colSpan={2}>
                                  {seg.coveredTenantNames?.length
                                    ? seg.coveredTenantNames.join(", ")
                                    : "No active tenant"}
                                </td>
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
                                {utilityType === "electricity"
                                  ? "kWh"
                                  : "cu.m."}
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
          <span className="bw-summary-bar__mode">
            <Zap size={13} />{" "}
            {utilityType === "electricity" ? "Electricity" : "Water"}
          </span>
          {branchFilter && (
            <span className="bw-summary-bar__branch">{branchFilter}</span>
          )}
        </div>
        <div className="bw-summary-bar__counts">
          <span className="bw-count bw-count--open">
            {filteredRooms.filter((r) => r.hasOpenPeriod).length} open
          </span>
          <span className="bw-count bw-count--ready">
            {
              filteredRooms.filter(
                (r) => r.latestPeriodDisplayStatus === "ready",
              ).length
            }{" "}
            ready
          </span>
          <span className="bw-count bw-count--neutral">
            {filteredRooms.length} rooms
          </span>
        </div>
        <div className="bw-summary-bar__actions">
          {readyRooms.length > 0 && (
            <button
              type="button"
              className="eb-btn eb-btn--primary"
              onClick={handleSendAllReady}
              disabled={isSendingAllReady || sendPeriod.isPending}
            >
              <Send size={13} />{" "}
              {isSendingAllReady
                ? "Sending..."
                : `Send All Ready (${readyRooms.length})`}
            </button>
          )}
          {selectedReadyPeriod && (
            <button
              type="button"
              className="eb-btn eb-btn--outline"
              onClick={() =>
                handleSendPeriod(
                  selectedReadyPeriod,
                  getRoomLabel(selectedRoom || {}, "Room"),
                )
              }
              disabled={
                Boolean(sendingByPeriodId[selectedReadyPeriod.id]) ||
                sendPeriod.isPending
              }
            >
              <Send size={13} />{" "}
              {sendingByPeriodId[selectedReadyPeriod.id]
                ? "Sending..."
                : "Send To Tenant"}
            </button>
          )}
          <button
            type="button"
            className="eb-btn eb-btn--ghost"
            onClick={handleExportRows}
            disabled={isExporting}
          >
            <Download size={13} /> {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>

      <div className="eb-layout">
        {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Sidebar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
        <aside className="eb-sidebar">
          <div className="eb-sidebar__header">
            <span className="eb-sidebar__title">
              <Zap size={13} /> Rooms
            </span>
            {isOwner && (
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setSelectedRoomId(null);
                  setSelectedPeriodId(null);
                  setRoomsPage(1);
                }}
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
              onChange={(e) => {
                setSidebarSearch(e.target.value);
                setRoomsPage(1);
              }}
              aria-label="Search rooms"
            />
          </div>

          <div className="eb-sidebar__list">
            {roomsLoading ? (
              <div className="eb-skeleton-list">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="eb-skeleton-card" />
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="eb-sidebar__empty">
                {sidebarSearch
                  ? "No rooms match your search"
                  : "No rooms found"}
              </div>
            ) : (
              pagedRooms.map((room) => {
                const isEmpty = !room.hasActiveTenants;
                return (
                  <button
                    key={room.id}
                    className={`eb-room${selectedRoomId === room.id ? " eb-room--active" : ""}`}
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setPeriodsPage(1);
                      setTimelinePage(1);
                      closePanel();
                    }}
                  >
                    <div className="eb-room__top-row">
                      <span className="eb-room__name">
                        {getRoomLabel(room)}
                      </span>
                      <span
                        className={`eb-room__dot${room.hasActiveTenants ? " eb-room__dot--active" : ""}`}
                        title={
                          room.hasActiveTenants
                            ? "Has active tenants"
                            : "No tenants"
                        }
                      />
                    </div>
                    <div className="eb-room__bottom-row">
                      <span
                        className={`eb-room__badge${room.hasOpenPeriod ? " eb-room__badge--open" : ""}${isEmpty ? " eb-room__badge--empty" : ""}`}
                      >
                        {getRoomBadgeLabel(room)}
                      </span>
                      {room.latestReading != null && (
                        <span className="eb-room__kwh">
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
          {filteredRooms.length > ROOMS_PER_PAGE && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                borderTop: "1px solid var(--border-subtle, #e2e8f0)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
              }}
            >
              <span>{filteredRooms.length} rooms</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="eb-icon-btn eb-icon-btn--muted"
                  disabled={roomsPage <= 1}
                  onClick={() => setRoomsPage((p) => p - 1)}
                  style={{ padding: 2 }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {roomsPage}/{totalRoomPages}
                </span>
                <button
                  className="eb-icon-btn eb-icon-btn--muted"
                  disabled={roomsPage >= totalRoomPages}
                  onClick={() => setRoomsPage((p) => p + 1)}
                  style={{ padding: 2 }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Main ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
        <main className="eb-main">
          {!selectedRoomId ? (
            <div className="eb-empty-state">
              <Zap size={40} strokeWidth={1.5} />
              <p>
                Select a room to manage{" "}
                {utilityType === "water" ? "water" : "electricity"} billing
              </p>
            </div>
          ) : (
            <div className="eb-content">
              {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Room Header ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
              <div className="eb-header" style={{ marginBottom: "1rem" }}>
                <div className="eb-header__left">
                  <h2 className="eb-header__title">
                    {getRoomLabel(selectedRoom)}
                  </h2>
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
                  <button
                    className="eb-btn eb-btn--primary"
                    onClick={() => openPanel("newPeriod")}
                  >
                    <Plus size={13} /> New Billing Period
                  </button>
                </div>
              </div>

              <div className="eb-snapshot-card">
                {currentPeriod ? (
                  <>
                    <div className="eb-snapshot-card__header">
                      <div>
                        <h3 className="eb-snapshot-card__title">
                          Current Cycle
                        </h3>
                        <p className="eb-snapshot-card__cycle">
                          {fmtDate(currentPeriod.startDate)} -{" "}
                          {fmtDate(
                            currentPeriod.endDate ||
                              currentPeriod.targetCloseDate,
                          ) || "Ongoing"}
                        </p>
                      </div>
                      <span
                        className={`eb-status-pill eb-status-pill--${getDisplayStatus(currentPeriod)}`}
                      >
                        {getDisplayStatusLabel(currentPeriod)}
                      </span>
                    </div>

                    <div className="eb-snapshot-card__metrics">
                      <div className="eb-snapshot-metric">
                        <span className="eb-snapshot-metric__label">
                          Total Cost
                        </span>
                        <span className="eb-snapshot-metric__value eb-snapshot-metric__value--strong">
                          {currentPeriodCost != null
                            ? fmtCurrency(currentPeriodCost)
                            : EMPTY_VALUE}
                        </span>
                      </div>
                      <div className="eb-snapshot-metric">
                        <span className="eb-snapshot-metric__label">
                          {utilityType === "water"
                            ? "Covered Usage"
                            : "Consumption"}
                        </span>
                        <span className="eb-snapshot-metric__value">
                          {currentPeriodUsage != null
                            ? fmtNumber(currentPeriodUsage, 2)
                            : EMPTY_VALUE}{" "}
                          {utilityType === "electricity" ? "kWh" : "cu.m."}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="eb-btn eb-btn--ghost eb-btn--xs"
                        onClick={() =>
                          setShowSnapshotDetails((current) => !current)
                        }
                      >
                        {showSnapshotDetails ? "Hide details" : "Show details"}
                      </button>
                    </div>

                    {showSnapshotDetails && (
                      <div className="eb-snapshot-card__details">
                        <span>
                          Rate: {fmtCurrency(currentPeriod.ratePerUnit)} /
                          {utilityType === "electricity" ? "kWh" : "cu.m."}
                        </span>
                        <span>
                          Start:{" "}
                          {currentPeriod.startReading != null
                            ? fmtNumber(currentPeriod.startReading, 2)
                            : EMPTY_VALUE}
                        </span>
                        <span>
                          End:{" "}
                          {currentPeriod.endReading != null
                            ? fmtNumber(currentPeriod.endReading, 2)
                            : EMPTY_VALUE}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="eb-snapshot-card__empty">
                    No billing cycle yet. Use New Billing Period to create your
                    first cycle.
                  </div>
                )}
              </div>

              {activePanel === "newPeriod" && (
                <div className="eb-panel">
                  <div className="eb-panel__header">
                    <span>New Billing Period</span>
                    <button className="eb-panel__close" onClick={closePanel}>
                      <X size={15} />
                    </button>
                  </div>
                  <div className="eb-panel__body">
                    {generationBlocker && (
                      <div
                        className="eb-panel eb-panel--warning"
                        style={{ marginBottom: "12px" }}
                      >
                        <div className="eb-panel__header">
                          Why It Didn't Finalize
                        </div>
                        <div className="eb-panel__body">
                          <div
                            style={{
                              marginBottom: generationBlocker.lines.length
                                ? 8
                                : 0,
                            }}
                          >
                            {generationBlocker.message}
                          </div>
                          {generationBlocker.lines.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                              {generationBlocker.lines.map((line, idx) => (
                                <li key={`${line}-${idx}`}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="eb-panel__hint">
                      Define the complete billing cycle (dates, readings, and
                      rate) to generate drafts immediately.
                    </p>
                    <div className="eb-form-row">
                      <div className="eb-field">
                        <label>Start Date</label>
                        <input
                          type="date"
                          value={periodForm.startDate}
                          onChange={(e) =>
                            setPeriodForm({
                              ...periodForm,
                              startDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="eb-field">
                        <label>End Date</label>
                        <input
                          type="date"
                          value={periodForm.endDate}
                          onChange={(e) =>
                            setPeriodForm({
                              ...periodForm,
                              endDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="eb-field">
                        <label>
                          {utilityType === "water"
                            ? "Total Water Charge (PHP)"
                            : `Rate (PHP/${utilityType === "electricity" ? "kWh" : "cu.m."})`}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={periodForm.ratePerUnit}
                          onChange={(e) =>
                            setPeriodForm({
                              ...periodForm,
                              ratePerUnit: e.target.value,
                            })
                          }
                          placeholder="e.g. 16.00"
                        />
                      </div>
                    </div>
                    {utilityType === "electricity" ? (
                      <div className="eb-form-row">
                        <div className="eb-field">
                          <label>Opening Meter Reading (kWh)</label>
                          <input
                            type="number"
                            value={periodForm.startReading}
                            onChange={(e) =>
                              setPeriodForm({
                                ...periodForm,
                                startReading: e.target.value,
                              })
                            }
                            placeholder={
                              latestData?.reading?.reading != null
                                ? `Last: ${latestData.reading.reading}`
                                : "e.g. 1200"
                            }
                          />
                        </div>
                        <div className="eb-field">
                          <label>Final Reading (Monthly Cutoff) (kWh)</label>
                          <input
                            type="number"
                            value={periodForm.endReading}
                            onChange={(e) =>
                              setPeriodForm({
                                ...periodForm,
                                endReading: e.target.value,
                              })
                            }
                            placeholder="e.g. 1350"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="eb-panel__hint">
                        Water billing uses room occupancy overlap. Enter the
                        total water charge above and the billing engine will
                        split it by covered days.
                      </div>
                    )}
                    <div className="eb-panel__footer">
                      <button
                        className="eb-btn eb-btn--primary"
                        onClick={handleGenerateCycle}
                        disabled={openPeriod.isPending || closePeriod.isPending}
                      >
                        {openPeriod.isPending || closePeriod.isPending
                          ? "Processing..."
                          : "Generate Billing Cycle"}
                      </button>
                      <button
                        className="eb-btn eb-btn--ghost"
                        onClick={closePanel}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <section className="eb-section">
                <div className="eb-section__header">
                  <h3 className="eb-section__title eb-section__title--primary">
                    Billing Timeline
                    <span
                      className="eb-section__count"
                      style={{
                        marginLeft: 6,
                        textTransform: "none",
                        letterSpacing: 0,
                        fontWeight: "normal",
                      }}
                    >
                      {billingTimelineRows.length}
                    </span>
                  </h3>
                </div>
                <div className="eb-section-body" style={{ marginTop: "12px" }}>
                  <>
                    <div className="eb-table-wrap">
                      <table className="eb-table">
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
                                className="eb-cell--muted"
                                style={{ textAlign: "center", padding: "1rem" }}
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
                                <td
                                  className="eb-cell--actions"
                                  style={{ whiteSpace: "nowrap" }}
                                >
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
                      style={{ color: "var(--color-info, #2563eb)" }}
                    />
                    Billing Cycle History
                  </h3>
                  <span className="eb-section__count">
                    {periods.length} period{periods.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {periods.length === 0 ? (
                  <p className="eb-empty-hint">
                    No billing history for this room yet.
                  </p>
                ) : (
                  <>
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
                                        ? "Check-in start to billing end"
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
                                  className="eb-cell--actions"
                                  style={{ whiteSpace: "nowrap" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {(p.status === "closed" ||
                                    p.status === "revised") && (
                                    <button
                                      className="eb-btn eb-btn--xs eb-btn--outline"
                                      onClick={() => selectAndFocusPeriod(p.id)}
                                    >
                                      {selectedPeriodId === p.id
                                        ? "Hide Details"
                                        : "View Details"}
                                    </button>
                                  )}
                                  {getDisplayStatus(p) === "ready" && (
                                    <button
                                      className="eb-btn eb-btn--xs eb-btn--primary"
                                      onClick={() =>
                                        handleSendPeriod(
                                          p,
                                          getRoomLabel(
                                            selectedRoom || {},
                                            "Room",
                                          ),
                                        )
                                      }
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
                                  <button
                                    className="eb-btn eb-btn--xs eb-btn--ghost"
                                    onClick={() =>
                                      toggleAdvancedPeriodActions(p.id)
                                    }
                                  >
                                    {advancedPeriodActions[p.id]
                                      ? "Hide Advanced"
                                      : "Advanced"}
                                  </button>

                                  {advancedPeriodActions[p.id] && (
                                    <>
                                      {p.status === "open" &&
                                        (editingRateId === p.id ? (
                                          <div
                                            className="eb-rate-editor"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="number"
                                              step="0.01"
                                              className="eb-inline-input eb-inline-input--rate"
                                              value={editingRateValue}
                                              onChange={(e) =>
                                                setEditingRateValue(
                                                  e.target.value,
                                                )
                                              }
                                            />
                                            <button
                                              className="eb-btn eb-btn--xs eb-btn--primary"
                                              onClick={() =>
                                                handleSaveRate(p.id)
                                              }
                                              disabled={updatePeriod.isPending}
                                            >
                                              <Save size={10} /> Save
                                            </button>
                                            <button
                                              className="eb-btn eb-btn--xs eb-btn--ghost"
                                              onClick={cancelRateEdit}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            className="eb-btn eb-btn--xs eb-btn--outline"
                                            onClick={() => beginRateEdit(p)}
                                          >
                                            <Pencil size={11} /> Edit Rate
                                          </button>
                                        ))}
                                      {(p.status === "closed" ||
                                        p.status === "revised") && (
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
                                        <Trash2 size={11} />{" "}
                                        {deletePeriod.isPending
                                          ? "Deleting..."
                                          : "Delete"}
                                      </button>
                                    </>
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
        </main>
      </div>
      {/* Edit Reading Modal */}
      {editReadingModal.open && (
        <div
          className="eb-modal-overlay"
          onClick={() => setEditReadingModal({ open: false, reading: null })}
        >
          <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eb-modal__header">
              <span>Manage Meter Reading</span>
              <button
                className="eb-panel__close"
                onClick={() =>
                  setEditReadingModal({ open: false, reading: null })
                }
              >
                <X size={15} />
              </button>
            </div>
            <div className="eb-modal__body">
              <div className="eb-form-row">
                <div className="eb-field">
                  <label>
                    Reading ({utilityType === "electricity" ? "kWh" : "cu.m."})
                  </label>
                  <input
                    type="number"
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
                <div className="eb-field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={editReadingForm.date}
                    onChange={(e) =>
                      setEditReadingForm({
                        ...editReadingForm,
                        date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="eb-field">
                  <label>Event</label>
                  <select
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
            <div className="eb-modal__footer">
              <button
                className="eb-btn eb-btn--primary"
                onClick={handleSaveEditReading}
                disabled={updateReading.isPending}
              >
                <Check size={13} />{" "}
                {updateReading.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="eb-btn eb-btn--danger"
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
                className="eb-btn eb-btn--ghost"
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

      {/* Revision note modal */}
      {reviseModal.open && (
        <div
          className="eb-modal-overlay"
          onClick={() => setReviseModal({ open: false, periodId: null })}
        >
          <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eb-modal__header">
              <span>Re-run Billing Computation</span>
              <button
                className="eb-panel__close"
                onClick={() => setReviseModal({ open: false, periodId: null })}
              >
                <X size={15} />
              </button>
            </div>
            <div className="eb-modal__body">
              <p
                style={{
                  marginBottom: "12px",
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                }}
              >
                This will re-compute billing for this closed period using the
                current meter readings. Add a note to explain why.
              </p>
              <div className="eb-field">
                <label>Revision Note (optional)</label>
                <input
                  type="text"
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="e.g. Corrected reading entered on Mar 15"
                  autoFocus
                />
              </div>
            </div>
            <div className="eb-modal__footer">
              <button
                className="eb-btn eb-btn--primary"
                onClick={handleReviseConfirm}
                disabled={reviseResult.isPending}
              >
                <RefreshCw size={13} />{" "}
                {reviseResult.isPending
                  ? "Re-running..."
                  : "Re-run Computation"}
              </button>
              <button
                className="eb-btn eb-btn--ghost"
                onClick={() => setReviseModal({ open: false, periodId: null })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UtilityBillingTab;
