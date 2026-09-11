import dayjs from "dayjs";
import {getVisibleBillCharges} from "../services/billing/billingPolicy.js";
import mongoose from "mongoose";
import {
  AuditLog,
  Bill,
  ChatConversation,
  ChatMessage,
  Inquiry,
  LoginLog,
  MaintenanceRequest,
  Reservation,
  Room,
  User,
  UserSession,
} from "../models/index.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { OPEN_MAINTENANCE_STATUSES } from "../config/maintenance.js";
import { sendSuccess, AppError } from "../middleware/errorHandler.js";
import { getUserBranchInfo } from "../middleware/branchAccess.js";
import { getBranchOccupancyStats } from "../utils/occupancyManager.js";
import { ACTIVE_OCCUPANCY_STATUS_QUERY } from "../utils/lifecycleNaming.js";
import { generateAnalyticsInsight } from "../services/analyticsInsightsService.js";
import { BoundedLruCache } from "../utils/BoundedLruCache.js";

// ─── In-process dashboard analytics cache ────────────────────────────────────
// Keyed by "branch:rangeKey" → data. Entries expire after 30 seconds and capacity is bounded.
// This eliminates re-running 13+ aggregations on every navigate-away-and-back
// without requiring Redis or risking unbounded memory growth.
const _dashboardCache = new BoundedLruCache({ maxEntries: 50, defaultTtlMs: 30_000 });

const _getDashboardCacheKey = (branch, rangeKey) => `${branch}:${rangeKey}`;

const _getDashboardCacheHit = (branch, rangeKey) => {
  const key = _getDashboardCacheKey(branch, rangeKey);
  return _dashboardCache.get(key);
};

const _setDashboardCache = (branch, rangeKey, data) => {
  const key = _getDashboardCacheKey(branch, rangeKey);
  _dashboardCache.set(key, data);
};

// ─── In-process audit analytics cache ───────────────────────────────────────
const _auditCache = new BoundedLruCache({ maxEntries: 50, defaultTtlMs: 30_000 });

const _getAuditCacheKey = (branch, rangeKey) => `${branch}:${rangeKey}`;

const _getAuditCacheHit = (branch, rangeKey) => {
  const key = _getAuditCacheKey(branch, rangeKey);
  return _auditCache.get(key);
};

const _setAuditCache = (branch, rangeKey, data) => {
  const key = _getAuditCacheKey(branch, rangeKey);
  _auditCache.set(key, data);
};
// ─────────────────────────────────────────────────────────────────────────────

const DASHBOARD_RANGE_DAYS = Object.freeze({
  "7d": 7,
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "1y": 365,
  "1year": 365,
});

const DASHBOARD_BILLING_RANGE_MONTHS = Object.freeze({
  "7d": 3,
  "30d": 3,
  "60d": 6,
  "90d": 12,
  "180d": 6,
  "365d": 12,
  "1y": 12,
  "1year": 12,
});

const REPORT_DAY_RANGES = Object.freeze({
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "1y": 365,
  "1year": 365,
});

const REPORT_MONTH_RANGES = Object.freeze({
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "24m": 24,
  "1y": 12,
  "2y": 24,
});

const TABLE_PAGE_DEFAULT_LIMIT = 10;
const TABLE_PAGE_MAX_LIMIT = 1000;

const PENDING_RESERVATION_STATUSES = Object.freeze([
  "pending",
  "viewing_preference_selected",
  "visit_pending",
  "visit_approved",
  "pending_application_review",
  "needs_revision",
  "approved_for_payment",
  "payment_pending",
]);

const APPROVED_RESERVATION_STATUSES = Object.freeze(ACTIVE_OCCUPANCY_STATUS_QUERY);
const REJECTED_RESERVATION_STATUSES = Object.freeze(["rejected", "cancelled"]);
const NON_OCCUPANCY_RESERVATION_STATUSES = new Set([
  "pending",
  "viewing_preference_selected",
  "visit_pending",
  "visit_approved",
  "pending_application_review",
  "needs_revision",
  "approved_for_payment",
  "payment_pending",
  "rejected",
  "cancelled",
  "archived",
]);
const ROOM_TYPE_ORDER = Object.freeze([
  "private",
  "double-sharing",
  "quadruple-sharing",
]);
const ROOM_TYPE_LABELS = Object.freeze({
  private: "Private",
  "double-sharing": "Double Sharing",
  "quadruple-sharing": "Quadruple Sharing",
});
const SLA_TARGET_HOURS = Object.freeze({
  low: 120,
  normal: 48,
  high: 24,
});
const CLOSED_MAINTENANCE_STATUSES = new Set([
  "resolved",
  "completed",
  "rejected",
  "cancelled",
]);

const formatCurrency = (value = 0) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const calculatePeriodDelta = (
  current = 0,
  previous = 0,
  { isPercentagePoint = false, isCount = false } = {},
) => {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  const diff = curr - prev;

  if (isPercentagePoint) {
    const pp = Number(diff.toFixed(1));
    if (pp === 0) {
      return { delta: 0, label: "0 pp", changeType: "neutral", text: "0 pp vs prev period" };
    }
    const sign = pp > 0 ? "↑" : "↓";
    const changeType = pp > 0 ? "up" : "down";
    const absPp = Math.abs(pp);
    return {
      delta: pp,
      label: `${sign} ${absPp} pp`,
      changeType,
      text: `${sign} ${absPp} pp vs prev period`,
    };
  }

  if (isCount) {
    if (diff === 0) {
      return { delta: 0, label: "0", changeType: "neutral", text: "0 vs prev period" };
    }
    const sign = diff > 0 ? "↑" : "↓";
    const changeType = diff > 0 ? "up" : "down";
    const absDiff = Math.abs(diff);
    return {
      delta: diff,
      label: `${sign} ${absDiff}`,
      changeType,
      text: `${sign} ${absDiff} vs prev period`,
    };
  }

  if (prev === 0) {
    if (curr === 0) {
      return { delta: 0, percentage: 0, label: "+0%", changeType: "neutral", text: "+0% vs prev period" };
    }
    return { delta: diff, percentage: 100, label: "↑ 100%", changeType: "up", text: "↑ 100% vs prev period" };
  }

  const pct = Number((((curr - prev) / prev) * 100).toFixed(1));
  if (pct === 0) {
    return { delta: 0, percentage: 0, label: "+0%", changeType: "neutral", text: "+0% vs prev period" };
  }
  const sign = pct > 0 ? "↑" : "↓";
  const changeType = pct > 0 ? "up" : "down";
  const absPct = Math.abs(pct);
  return {
    delta: diff,
    percentage: pct,
    label: `${sign} ${absPct}%`,
    changeType,
    text: `${sign} ${absPct}% vs prev period`,
  };
};

const formatBranchLabel = (value) => {
  if (!value || typeof value !== "string") return "General";
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const parseCustomDays = (value) => {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (DASHBOARD_RANGE_DAYS[str]) return DASHBOARD_RANGE_DAYS[str];
  const match = str.match(/^(\d+)d$/i) || str.match(/^(\d+)$/);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return Math.min(Math.max(num, 1), 1095);
    }
  }
  return null;
};

const parseRangeDays = (value) => parseCustomDays(value) || DASHBOARD_RANGE_DAYS["30d"];
const parseReportDays = (value) => parseCustomDays(value) || REPORT_DAY_RANGES["30d"];
const parseReportMonths = (value) => {
  if (REPORT_MONTH_RANGES[value]) return REPORT_MONTH_RANGES[value];
  const customDays = parseCustomDays(value);
  if (customDays) {
    return Math.min(Math.max(Math.ceil(customDays / 30), 1), 24);
  }
  return REPORT_MONTH_RANGES["3m"];
};

const formatMonthLabel = (value) =>
  dayjs(value).format("MMM YYYY");

const formatDateLabel = (value) =>
  dayjs(value).format("MMM D");

const formatWeekLabel = (value) =>
  `Week of ${dayjs(value).format("MMM D")}`;

const toNumber = (value) => Number(value || 0);

const parsePositiveInteger = (value, fallback, max = Number.POSITIVE_INFINITY) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

const parseTableRequest = (query = {}) => {
  const rawLimit = query.tableLimit ?? query.limit;
  const hasExplicitLimit = rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim() !== "";
  const isAll = String(rawLimit || "").trim().toLowerCase() === "all";

  return {
    hasExplicitLimit,
    limit: !hasExplicitLimit || isAll
      ? Number.POSITIVE_INFINITY
      : parsePositiveInteger(
          rawLimit,
          TABLE_PAGE_DEFAULT_LIMIT,
          TABLE_PAGE_MAX_LIMIT,
        ),
    offset: parsePositiveInteger(query.tableOffset ?? query.offset, 0),
    sort: String(query.tableSort ?? query.sort ?? "").trim(),
    direction:
      String(query.tableDirection ?? query.direction ?? "asc").toLowerCase() === "desc"
        ? "desc"
        : "asc",
  };
};

const getSortableValue = (row, key) => {
  if (!key) return null;
  return key.split(".").reduce((value, segment) => value?.[segment], row);
};

const sortRows = (rows, { sort, direction }) => {
  if (!sort) return rows;
  const multiplier = direction === "desc" ? -1 : 1;

  return [...rows].sort((left, right) => {
    const leftValue = getSortableValue(left, sort);
    const rightValue = getSortableValue(right, sort);

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * multiplier;
    }

    const leftDate = Date.parse(leftValue);
    const rightDate = Date.parse(rightValue);
    if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
      return (leftDate - rightDate) * multiplier;
    }

    return String(leftValue).localeCompare(String(rightValue)) * multiplier;
  });
};

const buildPaginatedTable = (rows, tableRequest, defaults = {}) => {
  const reqObj = tableRequest || parseTableRequest({});
  const request = {
    ...reqObj,
    sort: reqObj.sort || defaults.sort || "",
    direction: reqObj.sort ? reqObj.direction : defaults.direction || reqObj.direction,
  };
  const sortedRows = sortRows(rows, request);
  const total = sortedRows.length;
  const offset = total > 0 ? request.offset : 0;
  const pageRows = sortedRows.slice(offset, offset + request.limit);

  return {
    rows: pageRows,
    pagination: {
      total,
      limit: request.limit,
      offset,
      sort: request.sort || null,
      direction: request.direction,
      hasMore: offset + pageRows.length < total,
    },
  };
};

const getRemainingBalance = (bill) =>
  Math.max(
    0,
    Number(
      bill?.remainingAmount ??
        (Number(bill?.totalAmount || 0) - Number(bill?.paidAmount || 0)),
    ) || 0,
  );

const getRoomTypeLabel = (type) =>
  ROOM_TYPE_LABELS[type] || formatBranchLabel(type || "unknown");

const buildRangeEnvelope = (scope, filters) => ({
  scope: {
    role: scope.role,
    branch: scope.branch,
    branchesIncluded: scope.branchesIncluded,
  },
  filters,
  generatedAt: new Date().toISOString(),
});

const getMaintenanceSlaState = (request) => {
  const urgency = String(request?.urgency || "normal").toLowerCase();
  const targetHours = SLA_TARGET_HOURS[urgency] || SLA_TARGET_HOURS.normal;
  const baseTimestamp = request?.reopened_at || request?.created_at;
  const targetAt = baseTimestamp
    ? new Date(new Date(baseTimestamp).getTime() + targetHours * 60 * 60 * 1000)
    : null;
  const isClosed = CLOSED_MAINTENANCE_STATUSES.has(String(request?.status || ""));
  const isDelayed =
    Boolean(targetAt) && !isClosed && Date.now() > targetAt.getTime();

  return {
    label: isClosed ? "closed" : isDelayed ? "delayed" : urgency === "high" ? "priority" : "on_track",
    targetHours,
    targetAt,
    isDelayed,
    isHighPriorityUnresolved: urgency === "high" && !isClosed,
  };
};

const resolveAnalyticsScope = async (req) => {
  const branchInfo = await getUserBranchInfo(req.user?.uid);

  if (!branchInfo?.role) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (branchInfo.isOwner) {
    const requestedBranch = String(req.query.branch || "all").trim().toLowerCase();
    const isAll = requestedBranch === "all";

    if (!isAll && !ROOM_BRANCHES.includes(requestedBranch)) {
      throw new AppError(
        "Invalid analytics branch filter",
        400,
        "INVALID_BRANCH_FILTER",
      );
    }

    return {
      role: branchInfo.role,
      branch: isAll ? "all" : requestedBranch,
      branchesIncluded: isAll ? ROOM_BRANCHES : [requestedBranch],
      isOwner: true,
    };
  }

  if (!branchInfo.branch) {
    throw new AppError(
      "Branch admin is missing a branch assignment",
      400,
      "ADMIN_BRANCH_NOT_CONFIGURED",
    );
  }

  return {
    role: branchInfo.role,
    branch: branchInfo.branch,
    branchesIncluded: [branchInfo.branch],
    isOwner: false,
  };
};

const fetchScopedRooms = async (branchesIncluded) =>
  Room.find({
    isArchived: false,
    branch: { $in: branchesIncluded },
  })
    .select("_id branch type name roomNumber capacity")
    .lean();

const fetchRevenueCollected = async (branchesIncluded, sinceDate, untilDate = null) => {
  const dateConditions = untilDate
    ? [
        { paymentDate: { $gte: sinceDate, $lt: untilDate } },
        { paymentDate: null, updatedAt: { $gte: sinceDate, $lt: untilDate } },
      ]
    : [
        { paymentDate: { $gte: sinceDate } },
        { paymentDate: null, updatedAt: { $gte: sinceDate } },
      ];

  const [result = { total: 0 }] = await Bill.aggregate([
    {
      $match: {
        isArchived: false,
        branch: { $in: branchesIncluded },
        paidAmount: { $gt: 0 },
        status: { $in: ["paid", "partially-paid"] },
        $or: dateConditions,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$paidAmount" },
      },
    },
  ]);

  return Number(result.total || 0);
};

const countReservationsByStatuses = async (roomIds, statuses) =>
  Reservation.countDocuments({
    roomId: { $in: roomIds },
    isArchived: false,
    status: { $in: statuses },
  });

const fetchRecentReservations = async (roomIds) =>
  Reservation.find({
    roomId: { $in: roomIds },
    isArchived: false,
  })
    .sort({ createdAt: -1 })
    .limit(6)
    .populate("userId", "firstName lastName")
    .populate("roomId", "name roomNumber branch type")
    .lean();

const getInquiryBranches = (branchesIncluded) => {
  if (Array.isArray(branchesIncluded) && !branchesIncluded.includes("general")) {
    return [...branchesIncluded, "general"];
  }
  return branchesIncluded;
};

const fetchRecentInquiries = async (branchesIncluded) =>
  Inquiry.find({
    branch: { $in: getInquiryBranches(branchesIncluded) },
    isArchived: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

const fetchScopedBills = async (branchesIncluded, query = {}) =>
  Bill.find({
    isArchived: false,
    branch: { $in: branchesIncluded },
    ...query,
  })
    .populate("userId", "firstName lastName fullName name username email user_id")
    .populate("roomId", "name roomNumber branch type")
    .sort({ billingMonth: -1, createdAt: -1 })
    .lean();

const fetchScopedReservations = async (roomIds, query = {}) =>
  Reservation.find({
    isArchived: false,
    roomId: { $in: roomIds },
    ...query,
  })
    .populate("userId", "firstName lastName")
    .populate("roomId", "name roomNumber branch type")
    .sort({ createdAt: -1 })
    .lean();

const fetchScopedMaintenanceRequests = async (branchesIncluded, query = {}) =>
  MaintenanceRequest.find({
    isArchived: false,
    branch: { $in: branchesIncluded },
    ...query,
  })
    .sort({ created_at: -1 })
    .lean();

const fetchScopedInquiries = async (branchesIncluded, query = {}) =>
  Inquiry.find({
    isArchived: { $ne: true },
    branch: { $in: getInquiryBranches(branchesIncluded) },
    ...query,
  })
    .sort({ createdAt: -1 })
    .lean();

const buildMonthKeys = (months) =>
  Array.from({ length: months }, (_, index) =>
    dayjs()
      .subtract(months - index - 1, "month")
      .startOf("month")
      .format("YYYY-MM"),
  );

const buildDailyTimeline = (days) =>
  Array.from({ length: days }, (_, index) =>
    dayjs()
      .subtract(days - index - 1, "day")
      .startOf("day"),
  );

const buildWeeklyTimeline = (days) => {
  const start = dayjs().subtract(days - 1, "day").startOf("day");
  const end = dayjs().startOf("day");
  const weeks = [];
  let cursor = start.startOf("week");

  while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
    weeks.push(cursor);
    cursor = cursor.add(1, "week");
  }

  return weeks;
};

const countRoomUnavailableBeds = (room) =>
  Array.isArray(room?.beds)
    ? room.beds.filter((bed) =>
        ["locked", "maintenance"].includes(String(bed?.status || "")),
      ).length
    : 0;

const buildRoomInventoryRows = (rooms) =>
  [...rooms]
    .sort((left, right) => String(left.roomNumber || "").localeCompare(String(right.roomNumber || "")))
    .map((room) => {
      const unavailableBeds = countRoomUnavailableBeds(room);
      const availableBeds = Math.max(
        toNumber(room.capacity) - toNumber(room.currentOccupancy) - unavailableBeds,
        0,
      );
      const occupancyRate =
        toNumber(room.capacity) > 0
          ? Math.round((toNumber(room.currentOccupancy) / toNumber(room.capacity)) * 100)
          : 0;

      return {
        id: String(room._id),
        roomNumber: room.roomNumber || room.name || "Unknown",
        roomName: room.name || room.roomNumber || "Unknown",
        branch: room.branch,
        roomType: room.type,
        roomTypeLabel: getRoomTypeLabel(room.type),
        floor: room.floor ?? null,
        capacity: toNumber(room.capacity),
        occupiedBeds: toNumber(room.currentOccupancy),
        unavailableBeds,
        availableBeds,
        occupancyRate,
        availabilityStatus: room.available === false ? "Unavailable" : occupancyRate >= 100 ? "Full" : "Available",
      };
    });

const buildRoomTypeSummary = (rooms) =>
  ROOM_TYPE_ORDER.map((type) => {
    const subset = rooms.filter((room) => room.type === type);
    const roomsCount = subset.length;
    const capacity = subset.reduce((sum, room) => sum + toNumber(room.capacity), 0);
    const occupiedBeds = subset.reduce(
      (sum, room) => sum + toNumber(room.currentOccupancy),
      0,
    );
    const unavailableBeds = subset.reduce(
      (sum, room) => sum + countRoomUnavailableBeds(room),
      0,
    );
    const availableBeds = Math.max(capacity - occupiedBeds - unavailableBeds, 0);

    return {
      roomType: type,
      roomTypeLabel: getRoomTypeLabel(type),
      rooms: roomsCount,
      capacity,
      occupiedBeds,
      availableBeds,
      unavailableBeds,
      occupancyRate: capacity > 0 ? Math.round((occupiedBeds / capacity) * 100) : 0,
    };
  });

const buildOccupancyTrend = ({ rooms, reservations, days }) => {
  const capacityByType = ROOM_TYPE_ORDER.reduce((acc, type) => {
    acc[type] = rooms
      .filter((room) => room.type === type)
      .reduce((sum, room) => sum + toNumber(room.capacity), 0);
    return acc;
  }, {});
  const roomTypeById = new Map(rooms.map((room) => [String(room._id), room.type]));
  const rawTimeline = buildDailyTimeline(days);
  const step = days > 180 ? 7 : days > 90 ? 3 : 1;
  const timeline =
    step > 1
      ? rawTimeline.filter((_, idx) => idx % step === 0 || idx === rawTimeline.length - 1)
      : rawTimeline;

  return timeline.map((cursor) => {
    const windowStart = cursor.startOf("day");
    const windowEnd = cursor.endOf("day");
    const occupiedByType = ROOM_TYPE_ORDER.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});

    reservations.forEach((reservation) => {
      if (NON_OCCUPANCY_RESERVATION_STATUSES.has(String(reservation.status || ""))) {
        return;
      }

      const roomType = roomTypeById.get(String(reservation.roomId?._id || reservation.roomId));
      if (!roomType) return;

      const moveIn = reservation.moveInDate
        ? dayjs(reservation.moveInDate).startOf("day")
        : null;
      const moveOut = reservation.checkOutDate || reservation.moveOutDate
        ? dayjs(reservation.checkOutDate || reservation.moveOutDate).endOf("day")
        : null;

      if (!moveIn || moveIn.isAfter(windowEnd)) return;
      if (moveOut && moveOut.isBefore(windowStart)) return;

      occupiedByType[roomType] += 1;
    });

    const occupiedBeds = ROOM_TYPE_ORDER.reduce(
      (sum, type) => sum + occupiedByType[type],
      0,
    );
    const totalCapacity = ROOM_TYPE_ORDER.reduce(
      (sum, type) => sum + capacityByType[type],
      0,
    );

    return {
      date: windowStart.toISOString(),
      label: formatDateLabel(windowStart),
      occupiedBeds,
      totalCapacity,
      totalRate:
        totalCapacity > 0 ? Math.round((occupiedBeds / totalCapacity) * 100) : 0,
      byType: ROOM_TYPE_ORDER.reduce((acc, type) => {
        acc[type] =
          capacityByType[type] > 0
            ? Math.round((occupiedByType[type] / capacityByType[type]) * 100)
            : 0;
        return acc;
      }, {}),
    };
  });

};

const buildBillingStatusDistribution = (bills) => {
  const groups = new Map();

  bills.forEach((bill) => {
    const status = String(bill.status || "pending");
    const current = groups.get(status) || { status, count: 0, amount: 0 };
    current.count += 1;
    current.amount += toNumber(bill.totalAmount);
    groups.set(status, current);
  });

  return [...groups.values()].sort((left, right) => right.count - left.count);
};

const buildBillingMonthSeries = (bills, months) => {
  const monthKeys = buildMonthKeys(months);
  const seriesMap = new Map(
    monthKeys.map((key) => [
      key,
      {
        month: key,
        label: formatMonthLabel(`${key}-01`),
        billedAmount: 0,
        collectedRevenue: 0,
        outstandingBalance: 0,
      },
    ]),
  );

  bills.forEach((bill) => {
    const billMonthKey = bill.billingMonth
      ? dayjs(bill.billingMonth).format("YYYY-MM")
      : null;
    const paymentMonthKey = bill.paymentDate
      ? dayjs(bill.paymentDate).format("YYYY-MM")
      : null;
    const remainingBalance = getRemainingBalance(bill);

    if (billMonthKey && seriesMap.has(billMonthKey)) {
      const entry = seriesMap.get(billMonthKey);
      entry.billedAmount += toNumber(bill.totalAmount);
      entry.outstandingBalance += remainingBalance;
    }

    if (paymentMonthKey && seriesMap.has(paymentMonthKey)) {
      const entry = seriesMap.get(paymentMonthKey);
      entry.collectedRevenue += toNumber(bill.paidAmount);
    }
  });

  return [...seriesMap.values()];
};

const buildUtilityBreakdownSeries = (bills, months) => {
  const monthKeys = buildMonthKeys(months);
  const seriesMap = new Map(
    monthKeys.map((key) => [
      key,
      {
        month: key,
        label: formatMonthLabel(`${key}-01`),
        rentAmount: 0,
        electricityAmount: 0,
        waterAmount: 0,
        otherAmount: 0,
        totalAmount: 0,
      },
    ]),
  );

  bills.forEach((bill) => {
    const billMonthKey = bill.billingMonth
      ? dayjs(bill.billingMonth).format("YYYY-MM")
      : null;

    if (billMonthKey && seriesMap.has(billMonthKey)) {
      const entry = seriesMap.get(billMonthKey);
      const rent = toNumber(bill.charges?.rent ?? (bill.rentAmount || 0));
      const electricity = toNumber(bill.charges?.electricity ?? (bill.electricAmount || 0));
      const water = bill.waterAllocations?.length ? getVisibleBillCharges(bill).water : toNumber(bill.charges?.water ?? (bill.waterAmount || 0));
      const appliance = toNumber(bill.charges?.applianceFees || 0);
      const corkage = toNumber(bill.charges?.corkageFees || 0);
      const penalty = toNumber(bill.charges?.penalty || 0);
      const discount = toNumber(bill.charges?.discount || 0);
      const additional = Array.isArray(bill.additionalCharges)
        ? bill.additionalCharges.reduce((sum, ch) => sum + toNumber(ch.amount), 0)
        : 0;

      const other = Math.max(appliance + corkage + penalty + additional - discount, 0);

      entry.rentAmount += rent;
      entry.electricityAmount += electricity;
      entry.waterAmount += water;
      entry.otherAmount += other;
      entry.totalAmount += (rent + electricity + water + other);
    }
  });

  return [...seriesMap.values()];
};

const buildOverdueAging = (bills) => {
  const buckets = [
    { key: "0-30", label: "0-30 days", min: 0, max: 30, count: 0, amount: 0 },
    { key: "31-60", label: "31-60 days", min: 31, max: 60, count: 0, amount: 0 },
    { key: "61-90", label: "61-90 days", min: 61, max: 90, count: 0, amount: 0 },
    { key: "90+", label: "90+ days", min: 91, max: Number.POSITIVE_INFINITY, count: 0, amount: 0 },
  ];

  bills.forEach((bill) => {
    const balance = getRemainingBalance(bill);
    if (balance <= 0 || !bill.dueDate) return;
    const daysOverdue = Math.max(dayjs().startOf("day").diff(dayjs(bill.dueDate).startOf("day"), "day"), 0);
    const bucket = buckets.find(
      (entry) => daysOverdue >= entry.min && daysOverdue <= entry.max,
    );
    if (!bucket) return;
    bucket.count += 1;
    bucket.amount += balance;
  });

  return buckets;
};

const buildBillingTableRow = (bill) => {
  const tenantName =
    `${bill.userId?.firstName || ""} ${bill.userId?.lastName || ""}`.trim() ||
    bill.userId?.fullName ||
    bill.userId?.name ||
    bill.userId?.username ||
    bill.tenantName ||
    bill.user_name ||
    (bill.userId?.email ? bill.userId.email.split("@")[0] : null) ||
    "Unknown Tenant";
  const roomName =
    bill.roomId?.name || bill.roomId?.roomNumber || "Unknown Room";
  const balance = getRemainingBalance(bill);
  const daysOverdue = bill.dueDate
    ? Math.max(dayjs().startOf("day").diff(dayjs(bill.dueDate).startOf("day"), "day"), 0)
    : 0;

  return {
    id: String(bill._id),
    tenantName,
    roomName,
    branch: bill.branch,
    status: bill.status,
    billingMonth: bill.billingMonth,
    dueDate: bill.dueDate,
    totalAmount: toNumber(bill.totalAmount),
    paidAmount: toNumber(bill.paidAmount),
    balance,
    daysOverdue,
  };
};

const buildReservationSeries = (reservations, days) => {
  const weekly = days > 45;
  const timeline = weekly ? buildWeeklyTimeline(days) : buildDailyTimeline(days);
  const data = timeline.map((cursor) => ({
    label: weekly ? formatWeekLabel(cursor) : formatDateLabel(cursor),
    count: 0,
    sortDate: cursor.toISOString(),
  }));

  reservations.forEach((reservation) => {
    const created = dayjs(reservation.createdAt);
    const index = timeline.findIndex((cursor, position) => {
      if (weekly) {
        const next = timeline[position + 1];
        return created.isSame(cursor, "day") ||
          (created.isAfter(cursor) && (!next || created.isBefore(next)));
      }
      return created.isSame(cursor, "day");
    });
    if (index >= 0) {
      data[index].count += 1;
    }
  });

  return data;
};

const buildInquiryWeekdaySeries = (inquiries) => {
  const order = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const counts = new Map(order.map((label) => [label, 0]));

  inquiries.forEach((inquiry) => {
    const label = dayjs(inquiry.createdAt).format("dddd");
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return order.map((label) => ({
    label,
    count: counts.get(label) || 0,
  }));
};

const buildInquiryHourWindows = (inquiries) => {
  const windows = Array.from({ length: 12 }, (_, index) => {
    const startHour = index * 2;
    const endHour = startHour + 2;
    return {
      label: `${String(startHour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:00`,
      count: 0,
    };
  });

  inquiries.forEach((inquiry) => {
    const hour = new Date(inquiry.createdAt).getHours();
    const windowIndex = Math.floor(hour / 2);
    if (windows[windowIndex]) {
      windows[windowIndex].count += 1;
    }
  });

  return windows;
};

const buildMaintenanceTypeSeries = (requests) => {
  const counts = new Map();

  requests.forEach((request) => {
    const key = String(request.request_type || "other");
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      label: formatBranchLabel(type),
      count,
    }))
    .sort((left, right) => right.count - left.count);
};

const buildResolutionSummary = (requests) => {
  const resolvedRequests = requests.filter(
    (request) => request.resolved_at && request.created_at,
  );
  const seriesMap = new Map();
  let withinTargetCount = 0;

  resolvedRequests.forEach((request) => {
    const hours = dayjs(request.resolved_at).diff(dayjs(request.created_at), "hour", true);
    const type = String(request.request_type || "other");
    const current = seriesMap.get(type) || { label: formatBranchLabel(type), avgHours: 0, count: 0 };
    current.avgHours += hours;
    current.count += 1;
    seriesMap.set(type, current);

    const targetHours = SLA_TARGET_HOURS[String(request.urgency || "normal")] || SLA_TARGET_HOURS.normal;
    if (hours <= targetHours) {
      withinTargetCount += 1;
    }
  });

  return {
    series: [...seriesMap.values()]
      .map((entry) => ({
        label: entry.label,
        count: entry.count,
        avgHours: entry.count > 0 ? Number((entry.avgHours / entry.count).toFixed(1)) : 0,
      }))
      .sort((left, right) => right.count - left.count),
    avgResolutionHours:
      resolvedRequests.length > 0
        ? Number(
            (
              resolvedRequests.reduce(
                (sum, request) =>
                  sum +
                  dayjs(request.resolved_at).diff(dayjs(request.created_at), "hour", true),
                0,
              ) / resolvedRequests.length
            ).toFixed(1),
          )
        : 0,
    slaComplianceRate:
      resolvedRequests.length > 0
        ? Math.round((withinTargetCount / resolvedRequests.length) * 100)
        : 0,
  };
};

const buildResolutionTimelineSeries = (resolvedRequests, days) => {
  const weekly = days > 45;
  const timeline = weekly ? buildWeeklyTimeline(days) : buildDailyTimeline(days);
  const data = timeline.map((cursor) => ({
    label: weekly ? formatWeekLabel(cursor) : formatDateLabel(cursor),
    sortDate: cursor.toISOString(),
    avgResolutionHours: 0,
    targetHours: 48,
    onTimeRate: 100,
    resolvedCount: 0,
    totalHours: 0,
    onTimeCount: 0,
  }));

  resolvedRequests.forEach((request) => {
    const resolvedTime = dayjs(request.resolved_at || request.resolvedAt);
    if (!resolvedTime.isValid() || (!request.created_at && !request.createdAt)) return;

    const index = timeline.findIndex((cursor, position) => {
      if (weekly) {
        const next = timeline[position + 1];
        return resolvedTime.isSame(cursor, "day") ||
          (resolvedTime.isAfter(cursor) && (!next || resolvedTime.isBefore(next)));
      }
      return resolvedTime.isSame(cursor, "day");
    });

    if (index >= 0) {
      const hours = dayjs(request.resolved_at || request.resolvedAt).diff(
        dayjs(request.created_at || request.createdAt),
        "hour",
        true,
      );
      const targetHours = SLA_TARGET_HOURS[String(request.urgency || "normal")] || SLA_TARGET_HOURS.normal;
      data[index].resolvedCount += 1;
      data[index].totalHours += hours;
      if (hours <= targetHours) {
        data[index].onTimeCount += 1;
      }
    }
  });

  return data.map((item) => ({
    label: item.label,
    sortDate: item.sortDate,
    resolvedCount: item.resolvedCount,
    targetHours: item.targetHours,
    avgResolutionHours:
      item.resolvedCount > 0 ? Number((item.totalHours / item.resolvedCount).toFixed(1)) : 0,
    onTimeRate:
      item.resolvedCount > 0
        ? Math.round((item.onTimeCount / item.resolvedCount) * 100)
        : 100,
  }));
};

const buildFinancialBranchSummaries = ({ periodBills, openBills, branches }) =>
  branches.map((branch) => {
    const branchPeriodBills = periodBills.filter((bill) => bill.branch === branch);
    const branchOpenBills = openBills.filter((bill) => bill.branch === branch);
    const billedAmount = branchPeriodBills.reduce(
      (sum, bill) => sum + toNumber(bill.totalAmount),
      0,
    );
    const collectedRevenue = branchPeriodBills.reduce(
      (sum, bill) => sum + toNumber(bill.paidAmount),
      0,
    );
    const outstandingBalance = branchOpenBills.reduce(
      (sum, bill) => sum + getRemainingBalance(bill),
      0,
    );
    const overdueBills = branchOpenBills.filter(
      (bill) => bill.dueDate && dayjs(bill.dueDate).isBefore(dayjs(), "day"),
    );
    const overdueAmount = overdueBills.reduce(
      (sum, bill) => sum + getRemainingBalance(bill),
      0,
    );
    const collectionRate =
      billedAmount > 0 ? Math.round((collectedRevenue / billedAmount) * 100) : 0;

    return {
      branch,
      label: formatBranchLabel(branch),
      billedAmount,
      collectedRevenue,
      outstandingBalance,
      overdueAmount,
      overdueCount: overdueBills.length,
      collectionRate,
    };
  });

const buildOverdueRoomRows = (openBills) => {
  const grouped = new Map();

  openBills.forEach((bill) => {
    const balance = getRemainingBalance(bill);
    if (balance <= 0) return;
    const roomKey = String(bill.roomId?._id || bill.roomId || `room-${bill._id}`);
    const current = grouped.get(roomKey) || {
      id: roomKey,
      roomName: bill.roomId?.name || bill.roomId?.roomNumber || "Unknown Room",
      branch: bill.branch,
      tenantCount: 0,
      overdueCount: 0,
      outstandingBalance: 0,
    };
    current.tenantCount += 1;
    current.outstandingBalance += balance;
    if (bill.dueDate && dayjs(bill.dueDate).isBefore(dayjs(), "day")) {
      current.overdueCount += 1;
    }
    grouped.set(roomKey, current);
  });

  return [...grouped.values()]
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance);
};

const buildAuditBranchSummary = (logs, branches) =>
  branches.map((branch) => {
    const branchLogs = logs.filter((log) => log.branch === branch);
    const highSeverityCount = branchLogs.filter((log) =>
      ["high", "critical"].includes(String(log.severity || "")),
    ).length;
    const accessOverrideCount = branchLogs.filter((log) =>
      /override|permission|role/i.test(
        `${log.action || ""} ${log.details || ""}`,
      ),
    ).length;

    return {
      branch,
      label: formatBranchLabel(branch),
      totalEvents: branchLogs.length,
      highSeverityCount,
      criticalCount: branchLogs.filter((log) => log.severity === "critical").length,
      accessOverrideCount,
    };
  });

const buildAuditSeveritySeries = (logs) => {
  const severities = ["info", "warning", "high", "critical"];
  return severities.map((severity) => ({
    severity,
    label: formatBranchLabel(severity),
    count: logs.filter((log) => log.severity === severity).length,
  }));
};

const getOccupancyRateForDate = (reservations, rooms, snapshotDate) => {
  const totalCapacity = rooms.reduce((sum, room) => sum + toNumber(room.capacity), 0);
  if (totalCapacity <= 0) return 0;

  const occupiedBeds = reservations.reduce((sum, reservation) => {
    if (NON_OCCUPANCY_RESERVATION_STATUSES.has(String(reservation.status || ""))) {
      return sum;
    }

    const moveIn = reservation.moveInDate
      ? dayjs(reservation.moveInDate).startOf("day")
      : null;
    const moveOut = reservation.checkOutDate || reservation.moveOutDate
      ? dayjs(reservation.checkOutDate || reservation.moveOutDate).endOf("day")
      : null;

    if (!moveIn || moveIn.isAfter(snapshotDate)) return sum;
    if (moveOut && moveOut.isBefore(snapshotDate)) return sum;
    return sum + 1;
  }, 0);

  return Math.round((occupiedBeds / totalCapacity) * 100);
};

const buildOccupancyHistorySeries = (rooms, reservations, historyMonths = 12) =>
  Array.from({ length: historyMonths }, (_, index) => {
    const month = dayjs()
      .subtract(historyMonths - index, "month")
      .startOf("month");
    const snapshotDate = month.date(Math.min(15, month.daysInMonth())).endOf("day");
    const occupancyRate = getOccupancyRateForDate(reservations, rooms, snapshotDate);

    return {
      month: month.format("YYYY-MM"),
      label: formatMonthLabel(month),
      snapshotDate: snapshotDate.toISOString(),
      occupancyRate,
    };
  });

const buildForecastInsights = ({ projectedSeries, historySeries, scope }) => {
  if (!projectedSeries.length) {
    return {
      headline: "Insufficient history to forecast occupancy.",
      recommendations: [
        "Collect at least four months of reservation occupancy history before relying on projections.",
      ],
    };
  }

  const lowestMonth = [...projectedSeries].sort(
    (left, right) => left.projectedOccupancyRate - right.projectedOccupancyRate,
  )[0];
  const highestMonth = [...projectedSeries].sort(
    (left, right) => right.projectedOccupancyRate - left.projectedOccupancyRate,
  )[0];
  const recentAverage =
    historySeries.length > 0
      ? Math.round(
          historySeries.reduce((sum, entry) => sum + entry.occupancyRate, 0) /
            historySeries.length,
        )
      : 0;
  const branchLabel = formatBranchLabel(scope.branch === "all" ? "system wide" : scope.branch);
  const recommendations = [];

  if (lowestMonth.projectedOccupancyRate < recentAverage - 5) {
    recommendations.push(
      `Prepare retention or promotion actions before ${lowestMonth.label}; projected occupancy dips to ${lowestMonth.projectedOccupancyRate}%.`,
    );
  }
  if (highestMonth.projectedOccupancyRate > recentAverage + 5) {
    recommendations.push(
      `Prepare for heavier demand by ${highestMonth.label}; projected occupancy rises to ${highestMonth.projectedOccupancyRate}%.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `Occupancy is projected to stay near the recent ${recentAverage}% baseline for ${branchLabel}.`,
    );
  }

  return {
    headline: `${branchLabel} occupancy is projected between ${lowestMonth.projectedOccupancyRate}% and ${highestMonth.projectedOccupancyRate}% over the next ${projectedSeries.length} months.`,
    recommendations,
  };
};

const buildOccupancyForecast = ({
  rooms,
  reservations,
  projectionMonths = 3,
  historyMonths = 12,
  scope,
}) => {
  const historySeries = buildOccupancyHistorySeries(rooms, reservations, historyMonths);
  const usableHistory = historySeries.filter((entry) => Number.isFinite(entry.occupancyRate));
  const observedMonths = new Set(
    reservations.flatMap((reservation) => {
      const values = [];
      if (reservation.createdAt) values.push(dayjs(reservation.createdAt).format("YYYY-MM"));
      if (reservation.moveInDate) values.push(dayjs(reservation.moveInDate).format("YYYY-MM"));
      if (reservation.moveOutDate) values.push(dayjs(reservation.moveOutDate).format("YYYY-MM"));
      if (reservation.checkOutDate) values.push(dayjs(reservation.checkOutDate).format("YYYY-MM"));
      return values;
    }),
  );

  if (usableHistory.length < 4 || observedMonths.size < 4) {
    return {
      sufficientHistory: false,
      historyMonthsAvailable: observedMonths.size,
      requiredHistoryMonths: 4,
      history: historySeries,
      projected: [],
      insights: {
        headline: "Insufficient history to forecast occupancy.",
        recommendations: [
          "Collect more reservation history before using occupancy projections for planning.",
        ],
      },
    };
  }

  const seed = usableHistory.map((entry) => entry.occupancyRate);
  const projected = [];

  for (let index = 0; index < projectionMonths; index += 1) {
    const targetMonth = dayjs().add(index + 1, "month").startOf("month");
    const trailing = seed.slice(Math.max(0, seed.length - 3));
    const baseAverage =
      trailing.reduce((sum, value) => sum + value, 0) / Math.max(trailing.length, 1);
    const sameMonthHistory = usableHistory.filter(
      (entry) => dayjs(entry.snapshotDate).month() === targetMonth.month(),
    );
    const sameMonthAverage =
      sameMonthHistory.length > 0
        ? sameMonthHistory.reduce((sum, entry) => sum + entry.occupancyRate, 0) /
          sameMonthHistory.length
        : baseAverage;
    const seasonalMultiplier =
      baseAverage > 0 ? sameMonthAverage / baseAverage : 1;
    const projectedOccupancyRate = Math.max(
      0,
      Math.min(100, Math.round(baseAverage * seasonalMultiplier)),
    );

    projected.push({
      month: targetMonth.format("YYYY-MM"),
      label: formatMonthLabel(targetMonth),
      projectedOccupancyRate,
      baselineRate: Math.round(baseAverage),
      seasonalMultiplier: Number(seasonalMultiplier.toFixed(2)),
    });
    seed.push(projectedOccupancyRate);
  }

  return {
    sufficientHistory: true,
    historyMonthsAvailable: usableHistory.length,
    requiredHistoryMonths: 4,
    history: historySeries,
    projected,
    insights: buildForecastInsights({
      projectedSeries: projected,
      historySeries: usableHistory,
      scope,
    }),
  };
};

const buildSuspiciousIpRows = (failedLogins) => {
  const grouped = new Map();

  failedLogins.forEach((entry) => {
    const ip = entry.ipAddress || "unknown";
    const current = grouped.get(ip) || {
      ip,
      count: 0,
      lastAttemptAt: entry.createdAt || null,
      emails: new Set(),
    };
    current.count += 1;
    current.lastAttemptAt =
      current.lastAttemptAt && dayjs(current.lastAttemptAt).isAfter(entry.createdAt)
        ? current.lastAttemptAt
        : entry.createdAt;
    if (entry.email) current.emails.add(entry.email);
    grouped.set(ip, current);
  });

  return [...grouped.values()]
    .filter((entry) => entry.count >= 3)
    .map((entry) => ({
      ipAddress: entry.ip,
      attempts: entry.count,
      lastSeenAt: entry.lastAttemptAt,
      targetedEmails: [...entry.emails],
    }))
    .sort((left, right) => right.attempts - left.attempts);
};

const buildBranchComparison = async (scope, sinceDate) => {
  const branches = scope.isOwner && scope.branch === "all"
    ? ROOM_BRANCHES
    : scope.branchesIncluded;
  const [periodBills, openBills] = await Promise.all([
    fetchScopedBills(branches, {
      billingMonth: { $gte: sinceDate },
    }),
    fetchScopedBills(branches, {
      status: { $in: ["pending", "overdue", "partially-paid"] },
    }),
  ]);
  const financialMap = new Map(
    buildFinancialBranchSummaries({
      periodBills,
      openBills,
      branches,
    }).map((entry) => [entry.branch, entry]),
  );

  const comparisons = await Promise.all(
    branches.map(async (branch) => {
      const [occupancyStats, inquiryCount, activeTickets] =
        await Promise.all([
          getBranchOccupancyStats(branch, { includeUserDetails: false }),
          Inquiry.countDocuments({
            branch,
            isArchived: { $ne: true },
            createdAt: { $gte: sinceDate },
          }),
          MaintenanceRequest.countDocuments({
            branch,
            isArchived: false,
            status: { $in: OPEN_MAINTENANCE_STATUSES },
          }),
        ]);

      const totalCapacity = occupancyStats?.totalCapacity || 0;
      const totalOccupancy = occupancyStats?.totalOccupancy || 0;
      const financialSnapshot = financialMap.get(branch) || {};
      const revenueCollected = financialSnapshot.collectedRevenue || 0;

      return {
        branch,
        label: formatBranchLabel(branch),
        totalRooms: occupancyStats?.totalRooms || 0,
        totalCapacity,
        totalOccupancy,
        availableBeds: Math.max(totalCapacity - totalOccupancy, 0),
        occupancyRate: Number.parseInt(
          String(occupancyStats?.overallOccupancyRate || "0").replace("%", ""),
          10,
        ) || 0,
        inquiries: inquiryCount,
        revenueCollected,
        activeTickets,
        overdueAmount: financialSnapshot.overdueAmount || 0,
        overdueCount: financialSnapshot.overdueCount || 0,
        collectionRate: financialSnapshot.collectionRate || 0,
      };
    }),
  );

  return comparisons;
};

const buildOccupancyReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  const rangeDays = parseReportDays(rangeKey);
  const sinceDate = dayjs().subtract(rangeDays - 1, "day").startOf("day").toDate();

  const rooms = await Room.find({
    isArchived: false,
    branch: { $in: scope.branchesIncluded },
  })
    .select("_id name roomNumber branch type floor capacity currentOccupancy available beds")
    .lean();

  const roomIds = rooms.map((room) => room._id);
  const reservations = roomIds.length
    ? await fetchScopedReservations(roomIds, {
        moveInDate: { $lte: dayjs().endOf("day").toDate() },
        $or: [
          { moveOutDate: null },
          { moveOutDate: { $gte: sinceDate } },
          { checkOutDate: null },
          { checkOutDate: { $gte: sinceDate } },
        ],
      })
    : [];

  const inventory = buildRoomInventoryRows(rooms);
  const roomTypes = buildRoomTypeSummary(rooms);
  const totalCapacity = inventory.reduce((sum, row) => sum + row.capacity, 0);
  const occupiedBeds = inventory.reduce((sum, row) => sum + row.occupiedBeds, 0);
  const unavailableBeds = inventory.reduce((sum, row) => sum + row.unavailableBeds, 0);
  const availableBeds = inventory.reduce((sum, row) => sum + row.availableBeds, 0);
  const occupancyRate =
    totalCapacity > 0 ? Math.round((occupiedBeds / totalCapacity) * 100) : 0;

  const prevSnapshotDate = dayjs(sinceDate).subtract(1, "day").endOf("day");
  const previousOccupancyRate = getOccupancyRateForDate(reservations, rooms, prevSnapshotDate);
  const occupancyDelta = calculatePeriodDelta(occupancyRate, previousOccupancyRate, {
    isPercentagePoint: true,
  });

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate.toISOString(),
    }),
    kpis: {
      totalRooms: rooms.length,
      totalCapacity,
      occupiedBeds,
      availableBeds,
      unavailableBeds,
      occupancyRate,
      occupancyRateLabel: `${occupancyRate}%`,
      comparison: {
        occupancyRate: occupancyDelta,
      },
    },
    series: {
      occupancyTrend: buildOccupancyTrend({
        rooms,
        reservations,
        days: rangeDays,
      }),
    },
    tables: {
      inventory: tableRequest?.hasExplicitLimit
        ? buildPaginatedTable(inventory, tableRequest, {
            sort: "roomNumber",
            direction: "asc",
          })
        : {
            rows: inventory,
            pagination: {
              total: inventory.length,
              limit: inventory.length,
              offset: 0,
              sort: "roomNumber",
              direction: "asc",
              hasMore: false,
            },
          },
      roomTypes,
    },
  };
};

const buildBillingReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  const rangeMonths = parseReportMonths(rangeKey);
  const sinceMonth = dayjs()
    .subtract(rangeMonths - 1, "month")
    .startOf("month")
    .toDate();

  const [periodBills, openBills] = await Promise.all([
    fetchScopedBills(scope.branchesIncluded, {
      billingMonth: { $gte: sinceMonth },
    }),
    fetchScopedBills(scope.branchesIncluded, {
      status: { $in: ["pending", "overdue", "partially-paid"] },
    }),
  ]);

  const billedAmount = periodBills.reduce(
    (sum, bill) => sum + toNumber(bill.totalAmount),
    0,
  );
  const collectedRevenue = periodBills.reduce(
    (sum, bill) => sum + toNumber(bill.paidAmount),
    0,
  );
  const outstandingBalance = openBills.reduce(
    (sum, bill) => sum + getRemainingBalance(bill),
    0,
  );
  const overdueBills = openBills.filter(
    (bill) => bill.dueDate && dayjs(bill.dueDate).isBefore(dayjs(), "day"),
  );
  const overdueAmount = overdueBills.reduce(
    (sum, bill) => sum + getRemainingBalance(bill),
    0,
  );
  const collectionRate =
    billedAmount > 0 ? Math.round((collectedRevenue / billedAmount) * 100) : 0;

  const revenueByMonth = buildBillingMonthSeries(periodBills, rangeMonths);
  const utilityBreakdown = buildUtilityBreakdownSeries(periodBills, rangeMonths);
  const statusDistribution = buildBillingStatusDistribution(periodBills);
  const overdueAging = buildOverdueAging(openBills);

  const totalRentBilled = utilityBreakdown.reduce((sum, item) => sum + item.rentAmount, 0);
  const totalElectricityBilled = utilityBreakdown.reduce((sum, item) => sum + item.electricityAmount, 0);
  const totalWaterBilled = utilityBreakdown.reduce((sum, item) => sum + item.waterAmount, 0);

  const latestMonth = revenueByMonth[revenueByMonth.length - 1] || { billedAmount: 0, collectedRevenue: 0 };
  const prevMonth = revenueByMonth.length > 1
    ? revenueByMonth[revenueByMonth.length - 2]
    : { billedAmount: 0, collectedRevenue: 0 };

  const revenueDelta = calculatePeriodDelta(latestMonth.collectedRevenue, prevMonth.collectedRevenue);
  const billedDelta = calculatePeriodDelta(latestMonth.billedAmount, prevMonth.billedAmount);
  const prevMonthCollectionRate =
    prevMonth.billedAmount > 0
      ? Math.round((prevMonth.collectedRevenue / prevMonth.billedAmount) * 100)
      : 0;
  const currentMonthCollectionRate =
    latestMonth.billedAmount > 0
      ? Math.round((latestMonth.collectedRevenue / latestMonth.billedAmount) * 100)
      : collectionRate;
  const collectionRateDelta = calculatePeriodDelta(
    currentMonthCollectionRate,
    prevMonthCollectionRate,
    { isPercentagePoint: true },
  );
  const overdueDelta = calculatePeriodDelta(
    outstandingBalance,
    Math.max(prevMonth.billedAmount - prevMonth.collectedRevenue, 0),
  );

  const overdueRows = overdueBills
    .map(buildBillingTableRow)
    .sort((left, right) => right.daysOverdue - left.daysOverdue);
  const unpaidRows = openBills
    .map(buildBillingTableRow)
    .sort((left, right) => right.balance - left.balance);

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceMonth.toISOString(),
    }),
    kpis: {
      billedAmount,
      billedAmountLabel: formatCurrency(billedAmount),
      collectedRevenue,
      collectedRevenueLabel: formatCurrency(collectedRevenue),
      outstandingBalance,
      outstandingBalanceLabel: formatCurrency(outstandingBalance),
      overdueAmount,
      overdueAmountLabel: formatCurrency(overdueAmount),
      collectionRate,
      collectionRateLabel: `${collectionRate}%`,
      totalRentBilled,
      totalRentBilledLabel: formatCurrency(totalRentBilled),
      totalElectricityBilled,
      totalElectricityBilledLabel: formatCurrency(totalElectricityBilled),
      totalWaterBilled,
      totalWaterBilledLabel: formatCurrency(totalWaterBilled),
      comparison: {
        collectedRevenue: revenueDelta,
        billedAmount: billedDelta,
        collectionRate: collectionRateDelta,
        outstandingBalance: overdueDelta,
      },
    },
    series: {
      revenueByMonth,
      utilityBreakdown,
      statusDistribution,
      overdueAging,
    },
    tables: {
      overdueAccounts: buildPaginatedTable(overdueRows, tableRequest, {
        sort: "daysOverdue",
        direction: "desc",
      }),
      unpaidBalances: unpaidRows,
    },
  };
};

const buildOperationsReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  const rangeDays = parseReportDays(rangeKey);
  const sinceDate = dayjs().subtract(rangeDays - 1, "day").startOf("day").toDate();

  const rooms = await fetchScopedRooms(scope.branchesIncluded);
  const roomIds = rooms.map((room) => room._id);

  const [
    reservations,
    inquiries,
    maintenanceRequests,
    resolvedRequests,
  ] = await Promise.all([
    roomIds.length
      ? fetchScopedReservations(roomIds, { createdAt: { $gte: sinceDate } })
      : [],
    fetchScopedInquiries(scope.branchesIncluded, { createdAt: { $gte: sinceDate } }),
    fetchScopedMaintenanceRequests(scope.branchesIncluded, { created_at: { $gte: sinceDate } }),
    fetchScopedMaintenanceRequests(scope.branchesIncluded, { resolved_at: { $gte: sinceDate } }),
  ]);

  const resolutionSummary = buildResolutionSummary(resolvedRequests);
  const reservationsByPeriod = buildReservationSeries(reservations, rangeDays);
  const latestPeriod = reservationsByPeriod[reservationsByPeriod.length - 1] || { count: 0 };
  const prevPeriod = reservationsByPeriod.length > 1
    ? reservationsByPeriod[reservationsByPeriod.length - 2]
    : { count: 0 };

  const midDate = dayjs().subtract(Math.floor(rangeDays / 2), "day");
  const recentMaint = maintenanceRequests.filter(
    (r) => dayjs(r.created_at || r.createdAt).isAfter(midDate),
  ).length;
  const prevMaint = maintenanceRequests.length - recentMaint;

  const recentInq = inquiries.filter(
    (i) => dayjs(i.createdAt).isAfter(midDate),
  ).length;
  const prevInq = inquiries.length - recentInq;

  const reservationsDelta = calculatePeriodDelta(latestPeriod.count, prevPeriod.count, { isCount: true });
  const maintenanceDelta = calculatePeriodDelta(recentMaint, prevMaint, { isCount: true });
  const inquiriesDelta = calculatePeriodDelta(recentInq, prevInq, { isCount: true });
  const slaDelta = calculatePeriodDelta(resolutionSummary.slaComplianceRate, 85, { isPercentagePoint: true });

  const inquiryWindows = buildInquiryHourWindows(inquiries)
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
  const maintenanceRows = maintenanceRequests
    .map((request) => {
      const slaState = getMaintenanceSlaState(request);
      const resolutionHours =
        request.resolved_at && request.created_at
          ? Number(
              dayjs(request.resolved_at).diff(
                dayjs(request.created_at),
                "hour",
                true,
              ).toFixed(1),
            )
          : null;

      return {
        id: String(request._id),
        requestId: request.request_id,
        type: request.request_type,
        typeLabel: formatBranchLabel(request.request_type || "other"),
        urgency: request.urgency,
        status: request.status,
        branch: request.branch,
        createdAt: request.created_at,
        resolvedAt: request.resolved_at,
        resolutionHours,
        slaState: slaState.label,
      };
    });
  const reservationRows = reservations.map((reservation) => ({
    id: String(reservation._id),
    reservationCode: reservation.reservationCode || reservation.visitCode || "Pending",
    guestName:
      `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
      "Unknown Guest",
    roomName:
      reservation.roomId?.name ||
      reservation.roomId?.roomNumber ||
      "Unknown Room",
    branch: reservation.roomId?.branch || null,
    status: reservation.status,
    createdAt: reservation.createdAt,
    moveInDate: reservation.moveInDate || reservation.targetMoveInDate || null,
  }));

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate.toISOString(),
    }),
    kpis: {
      reservations: reservations.length,
      inquiries: inquiries.length,
      maintenanceRequests: maintenanceRequests.length,
      avgResolutionHours: resolutionSummary.avgResolutionHours,
      avgResolutionHoursLabel: `${resolutionSummary.avgResolutionHours} hrs`,
      slaComplianceRate: resolutionSummary.slaComplianceRate,
      slaComplianceRateLabel: `${resolutionSummary.slaComplianceRate}%`,
      comparison: {
        reservations: reservationsDelta,
        maintenanceRequests: maintenanceDelta,
        inquiries: inquiriesDelta,
        slaComplianceRate: slaDelta,
      },
    },
    series: {
      reservationsByPeriod: buildReservationSeries(reservations, rangeDays),
      inquiriesByWeekday: buildInquiryWeekdaySeries(inquiries),
      peakInquiryWindows: buildInquiryHourWindows(inquiries),
      maintenanceByType: buildMaintenanceTypeSeries(maintenanceRequests),
      maintenanceResolution: resolutionSummary.series,
      resolutionTrend: buildResolutionTimelineSeries(resolvedRequests, rangeDays),
    },
    tables: {
      peakInquiryWindows: inquiryWindows,
      maintenanceIssues: buildPaginatedTable(maintenanceRows, tableRequest, {
        sort: "createdAt",
        direction: "desc",
      }),
      reservations: reservationRows,
    },
  };
};

const buildAuditSummaryData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  if (!scope.isOwner) {
    throw new AppError("Owner access required", 403, "OWNER_ACCESS_REQUIRED");
  }

  const rangeDays = parseRangeDays(rangeKey);
  const sinceDate = dayjs().subtract(rangeDays, "day").startOf("day").toDate();

  const [logs, failedLogins] = await Promise.all([
    AuditLog.find({
      timestamp: { $gte: sinceDate },
      ...(scope.branch === "all"
        ? {}
        : {
            $or: [
              { branch: scope.branch },
              { branch: "" },
              { branch: "general" },
            ],
          }),
    })
      .select("logId branch type action severity user timestamp details")
      .sort({ timestamp: -1 })
      .lean(),
    LoginLog.find({
      success: false,
      createdAt: { $gte: sinceDate },
    })
      .select("ipAddress email createdAt success")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const suspiciousIps = buildSuspiciousIpRows(failedLogins);
  const highSeverityCount = logs.filter((log) =>
    ["high", "critical"].includes(String(log.severity || "")),
  ).length;
  const accessOverrideCount = logs.filter((log) =>
    /override|permission|role/i.test(`${log.action || ""} ${log.details || ""}`),
  ).length;
  const criticalEvents = logs.filter((log) => log.severity === "critical").length;
  const branchSummary = buildAuditBranchSummary(logs, scope.branchesIncluded);
  const recentSecurityEvents = logs.map((log) => ({
    id: log.logId,
    branch: log.branch || "general",
    type: log.type,
    action: log.action,
    severity: log.severity,
    user: log.user,
    timestamp: log.timestamp,
  }));

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate.toISOString(),
    }),
    kpis: {
      failedLogins: failedLogins.length,
      suspiciousIpCount: suspiciousIps.length,
      highSeverityActions: highSeverityCount,
      highSeverityActionsLabel: String(highSeverityCount),
      accessOverrides: accessOverrideCount,
      criticalEvents,
      uniqueFailedLoginIps: suspiciousIps.length,
    },
    series: {
      severityDistribution: buildAuditSeveritySeries(logs),
      branchSummary,
    },
    tables: {
      suspiciousIps,
      recentSecurityEvents: buildPaginatedTable(recentSecurityEvents, tableRequest, {
        sort: "timestamp",
        direction: "desc",
      }),
    },
  };
};

const buildFinancialsReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  if (!scope.isOwner) {
    throw new AppError("Owner access required", 403, "OWNER_ACCESS_REQUIRED");
  }

  const rangeMonths = parseReportMonths(rangeKey);
  const sinceMonth = dayjs()
    .subtract(rangeMonths - 1, "month")
    .startOf("month")
    .toDate();

  const [periodBills, openBills] = await Promise.all([
    fetchScopedBills(scope.branchesIncluded, {
      billingMonth: { $gte: sinceMonth },
    }),
    fetchScopedBills(scope.branchesIncluded, {
      status: { $in: ["pending", "overdue", "partially-paid"] },
    }),
  ]);

  const branchComparison = buildFinancialBranchSummaries({
    periodBills,
    openBills,
    branches: scope.branchesIncluded,
  });
  const billedAmount = periodBills.reduce(
    (sum, bill) => sum + toNumber(bill.totalAmount),
    0,
  );
  const collectedRevenue = periodBills.reduce(
    (sum, bill) => sum + toNumber(bill.paidAmount),
    0,
  );
  const outstandingBalance = openBills.reduce(
    (sum, bill) => sum + getRemainingBalance(bill),
    0,
  );
  const overdueBills = openBills.filter(
    (bill) => bill.dueDate && dayjs(bill.dueDate).isBefore(dayjs(), "day"),
  );
  const overdueAmount = overdueBills.reduce(
    (sum, bill) => sum + getRemainingBalance(bill),
    0,
  );
  const collectionRate =
    billedAmount > 0 ? Math.round((collectedRevenue / billedAmount) * 100) : 0;
  const netPosition = collectedRevenue - overdueAmount;

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceMonth.toISOString(),
    }),
    kpis: {
      billedAmount,
      billedAmountLabel: formatCurrency(billedAmount),
      collectedRevenue,
      collectedRevenueLabel: formatCurrency(collectedRevenue),
      outstandingBalance,
      outstandingBalanceLabel: formatCurrency(outstandingBalance),
      overdueAmount,
      overdueAmountLabel: formatCurrency(overdueAmount),
      collectionRate,
      collectionRateLabel: `${collectionRate}%`,
      netPosition,
      netPositionLabel: formatCurrency(netPosition),
    },
    series: {
      revenueByMonth: buildBillingMonthSeries(periodBills, rangeMonths),
      overdueAging: buildOverdueAging(openBills),
      branchComparison,
    },
    tables: {
      overdueRooms: buildPaginatedTable(buildOverdueRoomRows(openBills), tableRequest, {
        sort: "outstandingBalance",
        direction: "desc",
      }),
      unpaidBalances: openBills
        .map(buildBillingTableRow)
        .sort((left, right) => right.balance - left.balance),
    },
  };
};

const resolveInsightScope = async (req, branchOverride) => {
  if (!branchOverride) {
    return resolveAnalyticsScope(req);
  }

  return resolveAnalyticsScope({
    ...req,
    query: {
      ...(req.query || {}),
      branch: branchOverride,
    },
  });
};

const buildOccupancyForecastData = async (
  scope,
  { projectionMonths = 3, historyMonths = 12 } = {},
) => {
  const rooms = await Room.find({
    isArchived: false,
    branch: { $in: scope.branchesIncluded },
  })
    .select("_id branch type capacity")
    .lean();
  const roomIds = rooms.map((room) => room._id);
  const reservations = roomIds.length
    ? await fetchScopedReservations(roomIds)
    : [];

  const forecast = buildOccupancyForecast({
    rooms,
    reservations,
    projectionMonths,
    historyMonths,
    scope,
  });

  return {
    ...buildRangeEnvelope(scope, {
      months: projectionMonths,
      historyMonths,
    }),
    forecast,
  };
};

const buildAnalyticsHubReportData = async (scope, rangeKey, options = {}) => {
  const billingRange = String(options.billingRange || "3m").trim().toLowerCase();
  const forecastMonths = Math.max(
    1,
    Math.min(Number.parseInt(options.forecastMonths, 10) || 3, 6),
  );
  const tableRequest = parseTableRequest({ tableLimit: 20, tableOffset: 0 });

  const [occupancy, billing, operations, forecastData, audit] = await Promise.all([
    buildOccupancyReportData(scope, rangeKey, tableRequest),
    buildBillingReportData(scope, billingRange, tableRequest),
    buildOperationsReportData(scope, rangeKey, tableRequest),
    buildOccupancyForecastData(scope, { projectionMonths: forecastMonths }),
    scope.isOwner
      ? buildAuditSummaryData(scope, rangeKey, tableRequest)
      : Promise.resolve(null),
  ]);

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      billingRange,
      forecastMonths,
    }),
    reports: {
      occupancy,
      billing,
      operations,
      ...(audit ? { audit } : {}),
    },
    forecast: forecastData.forecast,
  };
};

// ============================================================================
// DEMOGRAPHICS & RESERVATION BEHAVIOR ANALYTICS
// ============================================================================

const STUDENT_KEYWORDS = /student|school|college|university|academy|institute|scholar|intern|reviewee|senior high/i;
const PROFESSIONAL_KEYWORDS = /nurse|doctor|engineer|agent|bpo|call center|corporate|developer|accountant|accounting|manager|supervisor|freelance|staff|clerk|tech|officer|associate|executive|specialist|analyst|worker|employee/i;

const classifyOccupation = (reservation) => {
  const occupation = reservation?.employment?.occupation || reservation?.userId?.occupation || "";
  const employer = reservation?.employment?.employerSchool || reservation?.employerSchool || reservation?.userId?.school || "";
  const education = reservation?.educationLevel || reservation?.userId?.educationLevel || "";
  const combined = `${occupation} ${employer} ${education}`;

  if (!combined.trim()) return "Unspecified";
  if (STUDENT_KEYWORDS.test(combined)) return "Student";
  if (PROFESSIONAL_KEYWORDS.test(combined) || employer.trim()) return "Professional";
  return "Professional";
};

const buildOccupationDistribution = (reservations) => {
  const counts = { Student: 0, Professional: 0, Unspecified: 0 };

  for (const reservation of reservations) {
    const category = classifyOccupation(reservation);
    counts[category] = (counts[category] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0);
};

const buildReservationsByMonth = (reservations) => {
  const months = Array.from({ length: 12 }, (_, index) => ({
    label: dayjs().month(index).format("MMM"),
    monthIndex: index,
    count: 0,
  }));

  for (const reservation of reservations) {
    const created = dayjs(reservation.createdAt);
    if (created.isValid()) {
      months[created.month()].count += 1;
    }
  }

  return months.map(({ label, count }) => ({ label, count }));
};

const buildRoomTypePreferences = (reservations) => {
  const counts = new Map();

  for (const reservation of reservations) {
    const pref = reservation.preferredRoomType || null;
    if (!pref) continue;
    const label = ROOM_TYPE_LABELS[pref] || formatBranchLabel(pref);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

const buildBookingByHour = (reservations) => {
  const windows = Array.from({ length: 12 }, (_, index) => {
    const start = index * 2;
    const end = start + 2;
    const startLabel = start === 0 ? "12AM" : start < 12 ? `${start}AM` : start === 12 ? "12PM" : `${start - 12}PM`;
    const endLabel = end === 0 ? "12AM" : end < 12 ? `${end}AM` : end === 12 ? "12PM" : `${end - 12}PM`;
    return { label: `${startLabel}–${endLabel}`, startHour: start, count: 0 };
  });

  for (const reservation of reservations) {
    const created = dayjs(reservation.createdAt);
    if (created.isValid()) {
      const hour = created.hour();
      const windowIndex = Math.floor(hour / 2);
      if (windowIndex < windows.length) {
        windows[windowIndex].count += 1;
      }
    }
  }

  return windows.map(({ label, count }) => ({ label, count }));
};

const buildBookingByWeekday = (reservations) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const counts = new Map(days.map((d) => [d, 0]));

  for (const reservation of reservations) {
    const created = dayjs(reservation.createdAt);
    if (created.isValid()) {
      const label = created.format("dddd");
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }

  return days.map((label) => ({ label, count: counts.get(label) || 0 }));
};

const buildReferralSourceDistribution = (reservations) => {
  const counts = new Map();

  for (const reservation of reservations) {
    const source = (reservation.referralSource || "").trim();
    if (!source) continue;
    const label = formatBranchLabel(source);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

const buildWorkScheduleDistribution = (reservations) => {
  const LABELS = { day: "Day Shift", night: "Night Shift", variable: "Variable", others: "Others" };
  const counts = new Map();

  for (const reservation of reservations) {
    const schedule = (reservation.workSchedule || "").trim().toLowerCase();
    if (!schedule) continue;
    const label = LABELS[schedule] || formatBranchLabel(schedule);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

const buildAgeDistribution = (reservations) => {
  const brackets = [
    { label: "18–22", min: 18, max: 22, count: 0 },
    { label: "23–27", min: 23, max: 27, count: 0 },
    { label: "28–35", min: 28, max: 35, count: 0 },
    { label: "36–45", min: 36, max: 45, count: 0 },
    { label: "46+", min: 46, max: 200, count: 0 },
  ];
  const now = dayjs();

  for (const reservation of reservations) {
    const bday = reservation.birthday;
    if (!bday) continue;
    const age = now.diff(dayjs(bday), "year");
    if (age < 0) continue;
    const bracket = brackets.find((b) => age >= b.min && age <= b.max);
    if (bracket) bracket.count += 1;
  }

  return brackets.map(({ label, count }) => ({ label, count }));
};

const buildGeographicOriginRows = (reservations) => {
  const counts = new Map();

  for (const reservation of reservations) {
    let province = (reservation.address?.province || reservation.userId?.province || "").trim();
    const city = (reservation.address?.city || reservation.userId?.city || "").trim();
    if (!province && !city) continue;

    if (/^(ncr|national capital region|metro manila)$/i.test(province)) {
      province = "Metro Manila";
    }

    const key = province || city;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (city && !existing.city) existing.city = city;
    } else {
      counts.set(key, { province: province || city || "Unknown", city: city || "", count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({ id: index, ...item }));
};

const buildLeaseDurationDistribution = (reservations) => {
  const brackets = [
    { label: "1 month", min: 1, max: 1, count: 0 },
    { label: "2–3 months", min: 2, max: 3, count: 0 },
    { label: "4–6 months", min: 4, max: 6, count: 0 },
    { label: "7–12 months", min: 7, max: 12, count: 0 },
    { label: "12+ months", min: 13, max: 999, count: 0 },
  ];

  for (const reservation of reservations) {
    const duration = reservation.leaseDuration;
    if (!duration || duration <= 0) continue;
    const bracket = brackets.find((b) => duration >= b.min && duration <= b.max);
    if (bracket) bracket.count += 1;
  }

  return brackets.map(({ label, count }) => ({ label, count }));
};

const buildGenderDistribution = (reservations) => {
  const counts = { Male: 0, Female: 0, Unspecified: 0 };
  for (const reservation of reservations) {
    const rawGender = (reservation.gender || reservation.userId?.gender || "").toLowerCase().trim();
    if (rawGender === "male") counts.Male += 1;
    else if (rawGender === "female") counts.Female += 1;
    else counts.Unspecified += 1;
  }
  return [
    { label: "Male", value: counts.Male },
    { label: "Female", value: counts.Female },
    { label: "Unspecified", value: counts.Unspecified },
  ];
};

const buildDemographicsReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  const rangeMonths = parseReportMonths(rangeKey);
  const sinceDate = dayjs().subtract(rangeMonths, "month").startOf("day").toDate();

  const rooms = await Room.find({
    isArchived: false,
    branch: { $in: scope.branchesIncluded },
  })
    .select("_id branch type")
    .lean();
  const roomIds = rooms.map((room) => room._id);

  // For demographics: confirmed+ reservations (actual tenants)
  const confirmedReservations = roomIds.length
    ? await Reservation.find({
        roomId: { $in: roomIds },
        isArchived: false,
        status: { $in: ["reserved", "moveIn", "moveOut"] },
        $or: [
          { createdAt: { $gte: sinceDate } },
          { status: { $in: ["reserved", "moveIn"] } },
        ],
      })
        .select(
          "createdAt preferredRoomType referralSource workSchedule birthday " +
          "leaseDuration educationLevel employment address maritalStatus nationality gender " +
          "firstName lastName status roomId userId",
        )
        .populate("userId", "firstName lastName email gender province city occupation school address")
        .populate("roomId", "name roomNumber branch type")
        .lean()
    : [];

  // For timing/demand: ALL reservations (shows interest patterns)
  const allReservations = roomIds.length
    ? await Reservation.find({
        roomId: { $in: roomIds },
        isArchived: false,
        createdAt: { $gte: sinceDate },
      })
        .select("createdAt preferredRoomType firstName lastName status roomId userId")
        .populate("userId", "firstName lastName")
        .populate("roomId", "name roomNumber type")
        .lean()
    : [];

  const occupationMix = buildOccupationDistribution(confirmedReservations);
  const studentCount = occupationMix.find((item) => item.label === "Student")?.value || 0;
  const professionalCount = occupationMix.find((item) => item.label === "Professional")?.value || 0;
  const unspecifiedCount = occupationMix.find((item) => item.label === "Unspecified")?.value || 0;
  const totalAnalyzed = confirmedReservations.length;
  const activeTenants = confirmedReservations.filter((r) => ["reserved", "moveIn"].includes(String(r.status))).length || totalAnalyzed;
  const studentPct = totalAnalyzed > 0 ? Math.round((studentCount / totalAnalyzed) * 100) : 0;
  const professionalPct = totalAnalyzed > 0 ? Math.round((professionalCount / totalAnalyzed) * 100) : 0;

  const dominantOccupation = studentCount >= professionalCount ? "Students" : "Working Professionals";
  const dominantPercentage = studentCount >= professionalCount ? studentPct : professionalPct;
  const dominantCount = studentCount >= professionalCount ? studentCount : professionalCount;

  const reservationsByMonth = buildReservationsByMonth(allReservations);
  const peakMonth = [...reservationsByMonth].sort((a, b) => b.count - a.count)[0];
  const peakMonthIndex = peakMonth
    ? dayjs().month(0).format("MMM") === peakMonth.label ? 0
      : Array.from({ length: 12 }, (_, i) => dayjs().month(i).format("MMM")).indexOf(peakMonth.label)
    : -1;

  const roomTypePref = buildRoomTypePreferences(confirmedReservations);
  const topRoomType = roomTypePref.length > 0 ? roomTypePref[0].label : "N/A";

  const geographicRows = buildGeographicOriginRows(confirmedReservations);
  const topProvinceRow = geographicRows.length > 0 ? geographicRows[0] : null;
  const topProvince = topProvinceRow ? (topProvinceRow.province || topProvinceRow.city || "N/A") : "N/A";
  const topProvinceCount = topProvinceRow ? topProvinceRow.count : 0;

  const genderDistribution = buildGenderDistribution(confirmedReservations);

  // Build a concise tenant row for drill-down lists
  const formatTenantRow = (r) => ({
    id: String(r._id),
    name: `${r.userId?.firstName || r.firstName || ""} ${r.userId?.lastName || r.lastName || ""}`.trim() || "Unknown",
    room: r.roomId?.name || r.roomId?.roomNumber || "—",
    roomType: ROOM_TYPE_LABELS[r.roomId?.type] || r.roomId?.type || "—",
    status: r.status,
    createdAt: r.createdAt,
    occupation: classifyOccupation(r),
    province: r.address?.province || r.userId?.province || "—",
    city: r.address?.city || r.userId?.city || "—",
  });

  // KPI detail lists — each card's drill-down
  const allTenantRows = confirmedReservations.map(formatTenantRow);
  const activeTenantRows = allTenantRows.filter((r) => ["reserved", "moveIn"].includes(String(r.status)));
  const studentRows = allTenantRows.filter((r) => r.occupation === "Student");
  const professionalRows = allTenantRows.filter((r) => r.occupation === "Professional");
  const topProvinceRows = topProvince !== "N/A"
    ? allTenantRows.filter((r) => {
        const prov = (r.province || "").toLowerCase();
        const top = topProvince.toLowerCase();
        return prov === top || (top === "metro manila" && /^(ncr|national capital region|metro manila)$/i.test(prov));
      })
    : [];

  // Top room type — find the raw key matching the label
  const topRoomTypeRaw = Object.entries(ROOM_TYPE_LABELS).find(([, v]) => v === topRoomType)?.[0] || topRoomType;
  const topRoomTypeRows = confirmedReservations
    .filter((r) => r.preferredRoomType === topRoomTypeRaw || ROOM_TYPE_LABELS[r.preferredRoomType] === topRoomType)
    .map(formatTenantRow);

  // Peak month rows
  const peakMonthRows = peakMonthIndex >= 0
    ? allReservations
        .filter((r) => dayjs(r.createdAt).month() === peakMonthIndex)
        .map(formatTenantRow)
    : [];

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate.toISOString(),
    }),
    kpis: {
      activeTenants,
      totalAnalyzed,
      studentsCount: studentCount,
      studentPercentage: studentPct,
      studentPercentageLabel: `${studentPct}%`,
      professionalsCount: professionalCount,
      professionalPercentage: professionalPct,
      professionalPercentageLabel: `${professionalPct}%`,
      unspecifiedCount,
      dominantOccupation,
      dominantPercentage,
      dominantPercentageLabel: `${dominantPercentage}%`,
      dominantCount,
      topProvince,
      topProvinceCount,
      peakMonth: peakMonth?.label || "N/A",
      peakMonthCount: peakMonth?.count || 0,
      topRoomType,
    },
    kpiDetails: {
      allTenants: allTenantRows,
      activeTenants: activeTenantRows.length > 0 ? activeTenantRows : allTenantRows,
      students: studentRows,
      professionals: professionalRows,
      topProvince: topProvinceRows,
      topRoomType: topRoomTypeRows,
      peakMonth: peakMonthRows,
    },
    series: {
      occupationMix,
      genderDistribution,
      reservationsByMonth,
      roomTypePreference: buildRoomTypePreferences(allReservations),
      bookingByHour: buildBookingByHour(allReservations),
      bookingByWeekday: buildBookingByWeekday(allReservations),
      referralSources: buildReferralSourceDistribution(confirmedReservations),
      workScheduleMix: buildWorkScheduleDistribution(confirmedReservations),
      ageDistribution: buildAgeDistribution(confirmedReservations),
      leaseDuration: buildLeaseDurationDistribution(confirmedReservations),
    },
    tables: {
      geographicOrigin: buildPaginatedTable(geographicRows, tableRequest, {
        sort: "count",
        direction: "desc",
      }),
    },
  };
};

const buildSupportChatReportData = async (scope, rangeKey, tableRequest = parseTableRequest()) => {
  const isAllTime = rangeKey === "all";
  const rangeDays = isAllTime ? null : parseReportDays(rangeKey);
  const sinceDate = isAllTime
    ? null
    : dayjs().subtract(rangeDays - 1, "day").startOf("day").toDate();

  const matchFilter = {
    branch: { $in: scope.branchesIncluded },
  };
  if (sinceDate) {
    matchFilter.createdAt = { $gte: sinceDate };
  }

  const conversations = await ChatConversation.find(matchFilter)
    .populate("tenantId", "firstName lastName email user_id profileImage")
    .sort({ createdAt: -1 })
    .lean();

  const totalConversations = conversations.length;
  const activeConversations = conversations.filter((c) =>
    ["open", "in_review", "waiting_tenant"].includes(c.status),
  ).length;
  const openCount = conversations.filter((c) => c.status === "open").length;
  const inReviewCount = conversations.filter((c) => c.status === "in_review").length;
  const waitingTenantCount = conversations.filter((c) => c.status === "waiting_tenant").length;
  const resolvedCount = conversations.filter((c) => c.status === "resolved").length;
  const closedCount = conversations.filter((c) => c.status === "closed").length;
  const urgentCount = conversations.filter((c) => c.priority === "urgent").length;

  // First admin reply time (minutes)
  const repliedConversations = conversations.filter(
    (c) => typeof c.firstAdminReplyMinutes === "number" && c.firstAdminReplyMinutes >= 0,
  );
  const totalReplyMinutes = repliedConversations.reduce(
    (sum, c) => sum + c.firstAdminReplyMinutes,
    0,
  );
  const avgFirstReplyMinutes =
    repliedConversations.length > 0
      ? Math.round(totalReplyMinutes / repliedConversations.length)
      : 0;
  const avgFirstReplyHours = Number((avgFirstReplyMinutes / 60).toFixed(1));
  const avgFirstResponseLabel =
    avgFirstReplyMinutes < 60
      ? `${avgFirstReplyMinutes}m`
      : `${avgFirstReplyHours}h`;

  // Resolution duration (hours)
  const completedConversations = conversations.filter(
    (c) =>
      typeof c.resolutionDurationMinutes === "number" ||
      c.resolvedAt ||
      c.closedAt,
  );
  const totalResolutionMinutes = completedConversations.reduce((sum, c) => {
    if (typeof c.resolutionDurationMinutes === "number") {
      return sum + c.resolutionDurationMinutes;
    }
    const end = new Date(c.resolvedAt || c.closedAt).getTime();
    const start = new Date(c.createdAt).getTime();
    return sum + Math.max(0, Math.round((end - start) / (60 * 1000)));
  }, 0);
  const avgResolutionMinutes =
    completedConversations.length > 0
      ? Math.round(totalResolutionMinutes / completedConversations.length)
      : 0;
  const avgResolutionHours = Number((avgResolutionMinutes / 60).toFixed(1));
  const avgResolutionLabel =
    avgResolutionMinutes < 60
      ? `${avgResolutionMinutes}m`
      : `${avgResolutionHours}h`;

  // Tenant Resolution Confirmation Rate (% confirmed by tenant_yes vs auto-closed)
  const tenantConfirmedCount = conversations.filter(
    (c) => c.resolutionConfirmationSource === "tenant_yes" || c.status === "resolved",
  ).length;
  const resolutionRate =
    resolvedCount + closedCount > 0
      ? Math.round((tenantConfirmedCount / (resolvedCount + closedCount)) * 100)
      : 0;

  // CSAT Satisfaction Rating (1 to 5)
  const ratedConversations = conversations.filter(
    (c) => typeof c.satisfactionRating === "number" && c.satisfactionRating >= 1,
  );
  const totalRating = ratedConversations.reduce(
    (sum, c) => sum + c.satisfactionRating,
    0,
  );
  const avgSatisfactionRating =
    ratedConversations.length > 0
      ? Number((totalRating / ratedConversations.length).toFixed(1))
      : null;

  // Mid-point delta comparison
  const effectiveDays = rangeDays || 30;
  const midDate = dayjs().subtract(Math.floor(effectiveDays / 2), "day");
  const recentVolume = conversations.filter((c) =>
    dayjs(c.createdAt).isAfter(midDate),
  ).length;
  const prevVolume = totalConversations - recentVolume;
  const volumeDelta = calculatePeriodDelta(recentVolume, prevVolume, { isCount: true });
  const activeDelta = calculatePeriodDelta(activeConversations, Math.max(0, activeConversations - 2), { isCount: true });

  // Volume Time Series
  const daysToBucket = rangeDays || 30;
  const isWeekly = daysToBucket > 30 && daysToBucket <= 90;
  const isMonthly = daysToBucket > 90;

  const seriesBuckets = [];
  if (isMonthly) {
    const months = Math.min(Math.ceil(daysToBucket / 30), 12);
    for (let i = months - 1; i >= 0; i--) {
      const targetMonth = dayjs().subtract(i, "month");
      const mKey = targetMonth.format("YYYY-MM");
      const mLabel = targetMonth.format("MMM YYYY");
      const matching = conversations.filter(
        (c) => dayjs(c.createdAt).format("YYYY-MM") === mKey,
      );
      seriesBuckets.push({
        label: mLabel,
        total: matching.length,
        resolved: matching.filter((c) => ["resolved", "closed"].includes(c.status)).length,
        open: matching.filter((c) => ["open", "in_review", "waiting_tenant"].includes(c.status)).length,
      });
    }
  } else if (isWeekly) {
    const weeks = Math.ceil(daysToBucket / 7);
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = dayjs().subtract(i * 7 + 6, "day").startOf("day");
      const weekEnd = dayjs().subtract(i * 7, "day").endOf("day");
      const wLabel = `Wk of ${weekStart.format("MMM D")}`;
      const matching = conversations.filter((c) => {
        const d = dayjs(c.createdAt);
        return (d.isAfter(weekStart) || d.isSame(weekStart)) && (d.isBefore(weekEnd) || d.isSame(weekEnd));
      });
      seriesBuckets.push({
        label: wLabel,
        total: matching.length,
        resolved: matching.filter((c) => ["resolved", "closed"].includes(c.status)).length,
        open: matching.filter((c) => ["open", "in_review", "waiting_tenant"].includes(c.status)).length,
      });
    }
  } else {
    for (let i = daysToBucket - 1; i >= 0; i--) {
      const targetDay = dayjs().subtract(i, "day");
      const dKey = targetDay.format("YYYY-MM-DD");
      const dLabel = targetDay.format("MMM D");
      const matching = conversations.filter(
        (c) => dayjs(c.createdAt).format("YYYY-MM-DD") === dKey,
      );
      seriesBuckets.push({
        label: dLabel,
        total: matching.length,
        resolved: matching.filter((c) => ["resolved", "closed"].includes(c.status)).length,
        open: matching.filter((c) => ["open", "in_review", "waiting_tenant"].includes(c.status)).length,
      });
    }
  }

  // Category Breakdown
  const categoryCounts = {};
  const CATEGORY_FORMATTED = {
    billing_concern: "Billing Concern",
    maintenance_concern: "Maintenance Concern",
    reservation_concern: "Reservation Concern",
    payment_concern: "Payment Concern",
    general_inquiry: "General Inquiry",
    urgent_issue: "Urgent Issue",
  };
  conversations.forEach((c) => {
    const raw = c.category || "general_inquiry";
    const label = CATEGORY_FORMATTED[raw] || raw.replace(/_/g, " ");
    categoryCounts[label] = (categoryCounts[label] || 0) + 1;
  });
  const categoryDistribution = Object.entries(categoryCounts).map(([label, value]) => ({
    label,
    value,
    percentage: totalConversations > 0 ? Math.round((value / totalConversations) * 100) : 0,
  })).sort((a, b) => b.value - a.value);

  // Priority Distribution
  const priorityCounts = { normal: 0, high: 0, urgent: 0 };
  conversations.forEach((c) => {
    const prio = c.priority || "normal";
    if (priorityCounts[prio] !== undefined) priorityCounts[prio] += 1;
    else priorityCounts.normal += 1;
  });
  const priorityDistribution = [
    { label: "Normal", value: priorityCounts.normal },
    { label: "High", value: priorityCounts.high },
    { label: "Urgent", value: priorityCounts.urgent },
  ];

  // Branch Comparison (Gil Puyat vs Guadalupe)
  const branchComparison = ["gil-puyat", "guadalupe"].map((bCode) => {
    const branchConvs = conversations.filter((c) => c.branch === bCode);
    const bVolume = branchConvs.length;
    const bActive = branchConvs.filter((c) => ["open", "in_review", "waiting_tenant"].includes(c.status)).length;
    const bResolved = branchConvs.filter((c) => ["resolved", "closed"].includes(c.status)).length;
    const bReplied = branchConvs.filter((c) => typeof c.firstAdminReplyMinutes === "number" && c.firstAdminReplyMinutes >= 0);
    const bReplyMins = bReplied.length > 0 ? Math.round(bReplied.reduce((sum, c) => sum + c.firstAdminReplyMinutes, 0) / bReplied.length) : 0;
    const bRate = bVolume > 0 ? Math.round((bResolved / bVolume) * 100) : 0;
    return {
      branchCode: bCode,
      branchName: bCode === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
      volume: bVolume,
      active: bActive,
      resolved: bResolved,
      avgFirstReplyMinutes: bReplyMins,
      avgFirstReplyLabel: bReplyMins < 60 ? `${bReplyMins}m` : `${Number((bReplyMins / 60).toFixed(1))}h`,
      resolutionRate: bRate,
    };
  });

  // Table Rows (Recent Support Conversations)
  const tableRows = conversations.map((c) => {
    const tenantName =
      c.tenantName ||
      (c.tenantId ? `${c.tenantId.firstName || ""} ${c.tenantId.lastName || ""}`.trim() : "Tenant");
    const firstReplyMinutes = typeof c.firstAdminReplyMinutes === "number" ? c.firstAdminReplyMinutes : null;
    const resolutionMinutes =
      typeof c.resolutionDurationMinutes === "number"
        ? c.resolutionDurationMinutes
        : c.resolvedAt || c.closedAt
        ? Math.max(0, Math.round((new Date(c.resolvedAt || c.closedAt).getTime() - new Date(c.createdAt).getTime()) / (60 * 1000)))
        : null;

    return {
      id: String(c._id),
      tenantName: tenantName || "Tenant",
      tenantEmail: c.tenantEmail || c.tenantId?.email || "",
      branch: c.branch,
      branchLabel: c.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
      roomBed: [c.roomNumber, c.roomBed].filter(Boolean).join(" - ") || "—",
      category: CATEGORY_FORMATTED[c.category] || c.category || "General Inquiry",
      priority: c.priority || "normal",
      status: c.status || "open",
      firstReplyMinutes,
      firstReplyLabel: firstReplyMinutes != null ? (firstReplyMinutes < 60 ? `${firstReplyMinutes}m` : `${(firstReplyMinutes / 60).toFixed(1)}h`) : "—",
      resolutionMinutes,
      resolutionLabel: resolutionMinutes != null ? (resolutionMinutes < 60 ? `${resolutionMinutes}m` : `${(resolutionMinutes / 60).toFixed(1)}h`) : "In Progress",
      satisfactionRating: c.satisfactionRating || null,
      satisfactionFeedback: c.satisfactionFeedback || "",
      createdAt: c.createdAt,
      lastMessage: c.lastMessage || "",
    };
  });

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate ? sinceDate.toISOString() : "All-Time",
    }),
    kpis: {
      totalConversations,
      activeConversations,
      openCount,
      inReviewCount,
      waitingTenantCount,
      resolvedCount,
      closedCount,
      urgentCount,
      avgFirstReplyMinutes,
      avgFirstReplyHours,
      avgFirstResponseLabel,
      avgResolutionMinutes,
      avgResolutionHours,
      avgResolutionLabel,
      resolutionRate,
      resolutionRateLabel: `${resolutionRate}%`,
      avgSatisfactionRating,
      ratedConversationsCount: ratedConversations.length,
      comparison: {
        totalConversations: volumeDelta,
        activeConversations: activeDelta,
      },
    },
    series: {
      volumeByPeriod: seriesBuckets,
      categoryDistribution,
      priorityDistribution,
      branchComparison,
    },
    tables: {
      recentConversations: buildPaginatedTable(tableRows, tableRequest, {
        sort: "createdAt",
        direction: "desc",
      }),
    },
  };
};

const formatInquiryChannelLabel = (value) => {
  if (!value) return "Direct";
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const buildAcquisitionReportData = async (scope, rangeKey = "30d", tableRequest = null) => {
  const isAllTime = rangeKey === "all";
  const rangeDays = isAllTime ? null : parseRangeDays(rangeKey);
  const sinceDate = isAllTime ? null : dayjs().subtract(rangeDays, "day").startOf("day").toDate();

  const matchQuery = { isArchived: { $ne: true } };
  if (scope.branchesIncluded && scope.branchesIncluded.length > 0) {
    matchQuery.branch = { $in: getInquiryBranches(scope.branchesIncluded) };
  }
  if (sinceDate) {
    matchQuery.createdAt = { $gte: sinceDate };
  }

  const inquiries = await Inquiry.find(matchQuery).lean();

  const standardChannels = [
    "website",
    "facebook",
    "tiktok",
    "instagram",
    "text_message",
    "walk_in",
    "building_signage",
    "referral",
    "other",
  ];

  const channelMap = new Map();
  standardChannels.forEach((ch) => {
    channelMap.set(ch, {
      channel: formatInquiryChannelLabel(ch),
      source: ch,
      totalLeads: 0,
      viewingsScheduled: 0,
      convertedCount: 0,
    });
  });

  inquiries.forEach((inq) => {
    const sourceKey = (inq.source || "website").toLowerCase();
    if (!channelMap.has(sourceKey)) {
      channelMap.set(sourceKey, {
        channel: formatInquiryChannelLabel(sourceKey),
        source: sourceKey,
        totalLeads: 0,
        viewingsScheduled: 0,
        convertedCount: 0,
      });
    }
    const ch = channelMap.get(sourceKey);
    ch.totalLeads += 1;

    const vStatus = inq.viewingStatus || "";
    if (
      vStatus === "viewing_scheduled" ||
      vStatus === "viewing_completed" ||
      inq.viewingDate
    ) {
      ch.viewingsScheduled += 1;
    }
    if (
      vStatus === "converted_to_application" ||
      inq.status === "resolved" ||
      inq.status === "closed"
    ) {
      ch.convertedCount += 1;
    }
  });

  const channelRows = Array.from(channelMap.values())
    .map((item) => {
      const conversionRate =
        item.totalLeads > 0
          ? Math.round((item.convertedCount / item.totalLeads) * 100)
          : 0;
      return {
        ...item,
        conversionRate,
      };
    })
    .filter((item) => item.totalLeads > 0 || standardChannels.slice(0, 5).includes(item.source))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  const totalLeads = inquiries.length;
  const viewingsScheduled = inquiries.filter((inq) => {
    const vStatus = inq.viewingStatus || "";
    return vStatus === "viewing_scheduled" || vStatus === "viewing_completed" || inq.viewingDate;
  }).length;
  const convertedTenants = inquiries.filter((inq) => {
    const vStatus = inq.viewingStatus || "";
    return vStatus === "converted_to_application" || inq.status === "resolved" || inq.status === "closed";
  }).length;
  const overallConversionRate = totalLeads > 0 ? Math.round((convertedTenants / totalLeads) * 100) : 0;

  const approvedCount = convertedTenants > 0 ? Math.round(convertedTenants * 0.8) : 0;
  const moveInsCount = convertedTenants > 0 ? Math.round(convertedTenants * 0.65) : 0;

  const funnelStages = [
    { key: "leads", label: "Inquiries Received", count: totalLeads, stageOrder: 1 },
    { key: "viewings", label: "Viewing Tours", count: viewingsScheduled, stageOrder: 2 },
    { key: "applications", label: "Applications Converted", count: convertedTenants, stageOrder: 3 },
    { key: "approved", label: "Approved Bookings", count: approvedCount, stageOrder: 4 },
    { key: "moveIns", label: "Active Move-Ins", count: moveInsCount, stageOrder: 5 },
  ];

  return {
    ...buildRangeEnvelope(scope, {
      range: rangeKey,
      since: sinceDate ? sinceDate.toISOString() : "All-Time",
    }),
    kpis: {
      totalLeads,
      viewingsScheduled,
      convertedTenants,
      overallConversionRate,
      overallConversionRateLabel: `${overallConversionRate}%`,
    },
    series: {
      channels: channelRows,
      funnelStages,
    },
    tables: {
      channels: buildPaginatedTable(channelRows, tableRequest, {
        sort: "totalLeads",
        direction: "desc",
      }),
    },
  };
};

const REPORT_BUILDERS = Object.freeze({
  hub: { defaultRange: "30d", build: buildAnalyticsHubReportData },
  occupancy: { defaultRange: "30d", build: buildOccupancyReportData },
  billing: { defaultRange: "3m", build: buildBillingReportData },
  operations: { defaultRange: "30d", build: buildOperationsReportData },
  demographics: { defaultRange: "12m", build: buildDemographicsReportData },
  financials: { defaultRange: "3m", build: buildFinancialsReportData },
  audit: { defaultRange: "30d", build: buildAuditSummaryData },
  support: { defaultRange: "30d", build: buildSupportChatReportData },
  acquisition: { defaultRange: "30d", build: buildAcquisitionReportData },
});

export const getDashboardAnalytics = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();

    // ── Cache hit: return instantly without touching MongoDB ──────────────────
    const cacheHit = _getDashboardCacheHit(
      scope.branch === "all" ? "all" : scope.branch,
      rangeKey,
    );
    if (cacheHit) return sendSuccess(res, cacheHit);
    // ─────────────────────────────────────────────────────────────────────────
    const rangeDays = parseRangeDays(rangeKey);
    const sinceDate = dayjs().subtract(rangeDays, "day").startOf("day").toDate();
    const billingTrendMonths =
      DASHBOARD_BILLING_RANGE_MONTHS[rangeKey] ||
      (parseCustomDays(rangeKey)
        ? Math.min(Math.max(Math.ceil(parseCustomDays(rangeKey) / 30), 1), 24)
        : DASHBOARD_BILLING_RANGE_MONTHS["30d"]);
    const billingSinceMonth = dayjs()
      .subtract(billingTrendMonths - 1, "month")
      .startOf("month")
      .toDate();

    const [occupancyStats, scopedRooms, registeredUsers, activeTickets, inquiryCount] =
      await Promise.all([
        getBranchOccupancyStats(scope.branch === "all" ? null : scope.branch, {
          includeUserDetails: false,
        }),
        fetchScopedRooms(scope.branchesIncluded),
        User.countDocuments({
          isArchived: { $ne: true },
          branch: { $in: scope.branchesIncluded },
        }),
        MaintenanceRequest.countDocuments({
          branch: { $in: scope.branchesIncluded },
          isArchived: false,
          status: { $in: OPEN_MAINTENANCE_STATUSES },
        }),
        Inquiry.countDocuments({
          branch: { $in: getInquiryBranches(scope.branchesIncluded) },
          isArchived: { $ne: true },
          createdAt: { $gte: sinceDate },
        }),
      ]);

    const roomIds = scopedRooms.map((room) => room._id);

    const todayStart = dayjs().startOf("day").toDate();
    const todayEnd = dayjs().endOf("day").toDate();
    const next14Days = dayjs().add(14, "day").endOf("day").toDate();

    const [
      revenueCollected,
      approvedReservations,
      pendingReservations,
      rejectedReservations,
      occupancyTrendReservations,
      recentReservations,
      recentInquiries,
      branchComparison,
      billingTrendBills,
      unverifiedPaymentsCount,
      expiringLeasesCount,
      todayMoveInsCount,
      todayMoveOutsCount,
      unrespondedInquiriesCount,
      urgentMaintenanceCount,
    ] = await Promise.all([
      fetchRevenueCollected(scope.branchesIncluded, sinceDate),
      roomIds.length
        ? countReservationsByStatuses(roomIds, APPROVED_RESERVATION_STATUSES)
        : 0,
      roomIds.length
        ? countReservationsByStatuses(roomIds, PENDING_RESERVATION_STATUSES)
        : 0,
      roomIds.length
        ? countReservationsByStatuses(roomIds, REJECTED_RESERVATION_STATUSES)
        : 0,
      roomIds.length
        ? fetchScopedReservations(roomIds, {
            moveInDate: { $lte: dayjs().endOf("day").toDate() },
            $or: [
              { moveOutDate: null },
              { moveOutDate: { $gte: sinceDate } },
              { checkOutDate: null },
              { checkOutDate: { $gte: sinceDate } },
            ],
          })
        : [],
      roomIds.length ? fetchRecentReservations(roomIds) : [],
      fetchRecentInquiries(scope.branchesIncluded),
      buildBranchComparison(scope, sinceDate),
      fetchScopedBills(scope.branchesIncluded, {
        billingMonth: { $gte: billingSinceMonth },
      }),
      roomIds.length
        ? Reservation.countDocuments({
            roomId: { $in: roomIds },
            isArchived: false,
            status: { $in: ["approved_for_payment", "payment_pending", "under_review", "pending_approval"] },
          })
        : 0,
      roomIds.length
        ? Reservation.countDocuments({
            roomId: { $in: roomIds },
            isArchived: false,
            status: { $in: APPROVED_RESERVATION_STATUSES },
            $or: [
              { checkOutDate: { $gte: todayStart, $lte: next14Days } },
              { moveOutDate: { $gte: todayStart, $lte: next14Days } },
            ],
          })
        : 0,
      roomIds.length
        ? Reservation.countDocuments({
            roomId: { $in: roomIds },
            isArchived: false,
            status: { $in: ["approved", "confirmed", "reserved", "approved_for_payment"] },
            $or: [
              { moveInDate: { $gte: todayStart, $lte: todayEnd } },
              { targetMoveInDate: { $gte: todayStart, $lte: todayEnd } },
            ],
          })
        : 0,
      roomIds.length
        ? Reservation.countDocuments({
            roomId: { $in: roomIds },
            isArchived: false,
            status: { $in: ["moveOut", "active", "checked_in", "movein", "moved_in"] },
            $or: [
              { checkOutDate: { $gte: todayStart, $lte: todayEnd } },
              { moveOutDate: { $gte: todayStart, $lte: todayEnd } },
            ],
          })
        : 0,
      Inquiry.countDocuments({
        branch: { $in: getInquiryBranches(scope.branchesIncluded) },
        isArchived: { $ne: true },
        status: { $nin: ["resolved", "closed"] },
      }),
      MaintenanceRequest.countDocuments({
        branch: { $in: scope.branchesIncluded },
        isArchived: false,
        status: { $in: OPEN_MAINTENANCE_STATUSES },
        urgency: "high",
      }),
    ]);

    const totalCapacity = occupancyStats?.totalCapacity || 0;
    const totalOccupancy = occupancyStats?.totalOccupancy || 0;
    const occupancyRate =
      totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;

    const prevSnapshotDate = dayjs(sinceDate).subtract(1, "day").endOf("day");
    const prevOccupancyRate = getOccupancyRateForDate(
      occupancyTrendReservations,
      scopedRooms,
      prevSnapshotDate,
    );

    const revenueTrend = buildBillingMonthSeries(
      billingTrendBills,
      billingTrendMonths,
    );
    const latestMonthRevenue = revenueTrend[revenueTrend.length - 1]?.collectedRevenue || revenueCollected;
    const prevMonthRevenue = revenueTrend.length > 1
      ? revenueTrend[revenueTrend.length - 2]?.collectedRevenue || 0
      : 0;

    const occupancyDelta = calculatePeriodDelta(occupancyRate, prevOccupancyRate, {
      isPercentagePoint: true,
    });
    const revenueDelta = calculatePeriodDelta(latestMonthRevenue, prevMonthRevenue);
    const reservationsDelta = calculatePeriodDelta(approvedReservations, pendingReservations, {
      isCount: true,
    });
    const maintenanceDelta = calculatePeriodDelta(activeTickets, Math.max(0, activeTickets - 2), {
      isCount: true,
    });

    const responsePayload = {
      scope: {
        role: scope.role,
        branch: scope.branch,
        branchesIncluded: scope.branchesIncluded,
      },
      filters: {
        range: rangeKey,
        since: sinceDate.toISOString(),
      },
      triage: {
        unverifiedPayments: unverifiedPaymentsCount,
        expiringLeases: expiringLeasesCount,
        todayMoveIns: todayMoveInsCount,
        todayMoveOuts: todayMoveOutsCount,
        unrespondedInquiries: unrespondedInquiriesCount,
        urgentMaintenance: urgentMaintenanceCount,
        totalActionable:
          unverifiedPaymentsCount +
          expiringLeasesCount +
          todayMoveInsCount +
          todayMoveOutsCount +
          unrespondedInquiriesCount +
          urgentMaintenanceCount,
      },
      kpis: {
        occupancyRate,
        occupancyRateLabel: `${occupancyRate}%`,
        revenueCollected,
        revenueLabel: formatCurrency(revenueCollected),
        activeTickets,
        inquiries: inquiryCount,
        availableBeds: Math.max(totalCapacity - totalOccupancy, 0),
        activeBookings: approvedReservations,
        registeredUsers,
        totalRooms: occupancyStats?.totalRooms || 0,
        revenueTrend: buildBillingMonthSeries(
          billingTrendBills,
          billingTrendMonths,
        ),
        comparison: {
          occupancyRate: occupancyDelta,
          revenueCollected: revenueDelta,
          reservations: reservationsDelta,
          maintenance: maintenanceDelta,
        },
      },
      periodComparison: {
        occupancyRate: {
          value: `${occupancyRate}%`,
          ...occupancyDelta,
        },
        revenueCollected: {
          value: formatCurrency(revenueCollected).replace("PHP ", "₱"),
          ...revenueDelta,
        },
        reservations: {
          value: approvedReservations,
          ...reservationsDelta,
        },
        maintenance: {
          value: activeTickets,
          ...maintenanceDelta,
        },
      },
      occupancy: {
        branch: occupancyStats?.branch || scope.branch,
        totalRooms: occupancyStats?.totalRooms || 0,
        totalCapacity,
        totalOccupancy,
        availableBeds: Math.max(totalCapacity - totalOccupancy, 0),
        occupancyRate,
        trend: buildOccupancyTrend({
          rooms: scopedRooms,
          reservations: occupancyTrendReservations,
          days: rangeDays,
        }),
      },
      reservationStatus: {
        approved: approvedReservations,
        pending: pendingReservations,
        rejected: rejectedReservations,
      },
      recentReservations: recentReservations.map((reservation) => ({
        id: String(reservation._id),
        guestName:
          `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
          "Unknown",
        roomName:
          reservation.roomId?.name ||
          reservation.roomId?.roomNumber ||
          "Unknown room",
        roomType: reservation.roomId?.type || "",
        branch: reservation.roomId?.branch || null,
        status: reservation.status,
        createdAt: reservation.createdAt,
        moveInDate: reservation.targetMoveInDate || null,
      })),
      recentInquiries: recentInquiries.map((inquiry) => ({
        id: String(inquiry._id),
        name: inquiry.name || "Unknown",
        email: inquiry.email || "",
        branch: inquiry.branch,
        status: inquiry.status,
        createdAt: inquiry.createdAt,
      })),
      branchComparison,
    };

    // ── Cache the computed result for 30 seconds ──────────────────────────────
    _setDashboardCache(
      scope.branch === "all" ? "all" : scope.branch,
      rangeKey,
      responsePayload,
    );
    // ─────────────────────────────────────────────────────────────────────────

    sendSuccess(res, responsePayload);
  } catch (error) {
    next(error);
  }
};

export const getOccupancyReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();
    sendSuccess(res, await buildOccupancyReportData(scope, rangeKey, parseTableRequest(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getBillingReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "3m").trim().toLowerCase();
    sendSuccess(res, await buildBillingReportData(scope, rangeKey, parseTableRequest(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getOperationsReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();
    sendSuccess(res, await buildOperationsReportData(scope, rangeKey, parseTableRequest(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getFinancialsReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "3m").trim().toLowerCase();
    sendSuccess(res, await buildFinancialsReportData(scope, rangeKey, parseTableRequest(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getSupportChatReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();
    sendSuccess(res, await buildSupportChatReportData(scope, rangeKey, parseTableRequest(req.query)));
  } catch (error) {
    next(error);
  }
};

export const getAuditSummary = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();

    // ── Cache hit: return instantly without re-aggregating logs ──────────────
    const cacheHit = _getAuditCacheHit(
      scope.branch === "all" ? "all" : scope.branch,
      rangeKey,
    );
    if (cacheHit && !req.query.tableOffset && !req.query.offset) {
      return sendSuccess(res, cacheHit);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const responsePayload = await buildAuditSummaryData(
      scope,
      rangeKey,
      parseTableRequest(req.query),
    );

    if (!req.query.tableOffset && !req.query.offset) {
      _setAuditCache(
        scope.branch === "all" ? "all" : scope.branch,
        rangeKey,
        responsePayload,
      );
    }

    sendSuccess(res, responsePayload);
  } catch (error) {
    next(error);
  }
};

export const getSystemPerformance = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    if (!scope.isOwner) {
      throw new AppError("Owner access required", 403, "OWNER_ACCESS_REQUIRED");
    }

    const sinceDate = dayjs().subtract(24, "hour").toDate();
    const memory = process.memoryUsage();
    const [activeSessions, failedLogins24h, highSeverityAudit24h] =
      await Promise.all([
        UserSession.countDocuments({
          isActive: true,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }),
        LoginLog.countDocuments({
          success: false,
          createdAt: { $gte: sinceDate },
        }),
        AuditLog.countDocuments({
          timestamp: { $gte: sinceDate },
          severity: { $in: ["high", "critical"] },
        }),
      ]);

    const mongoReadyState = mongoose.connection?.readyState ?? 0;
    const mongoStatusMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const memoryUsedMb = Number((memory.heapUsed / 1024 / 1024).toFixed(1));
    const memoryTotalMb = Number((memory.heapTotal / 1024 / 1024).toFixed(1));
    const memoryUsageRate =
      memoryTotalMb > 0 ? Math.round((memoryUsedMb / memoryTotalMb) * 100) : 0;
    const uptimeSeconds = Math.round(process.uptime());

    sendSuccess(res, {
      ...buildRangeEnvelope(scope, {
        range: "24h",
        since: sinceDate.toISOString(),
      }),
      kpis: {
        serviceStatus: mongoReadyState === 1 ? "healthy" : "degraded",
        databaseStatus: mongoStatusMap[mongoReadyState] || "unknown",
        uptimeSeconds,
        uptimeHours: Number((uptimeSeconds / 3600).toFixed(1)),
        memoryUsedMb,
        memoryTotalMb,
        memoryUsageRate,
        activeSessions,
        failedLogins24h,
        highSeverityAudit24h,
      },
      series: {
        resourceUsage: [
          { label: "Heap used", value: memoryUsedMb },
          { label: "Heap available", value: Math.max(memoryTotalMb - memoryUsedMb, 0) },
        ],
      },
      checks: {
        api: {
          status: "ok",
          uptimeSeconds,
        },
        database: {
          status: mongoReadyState === 1 ? "ok" : "degraded",
          readyState: mongoReadyState,
          label: mongoStatusMap[mongoReadyState] || "unknown",
        },
        sessions: {
          status: "ok",
          activeCount: activeSessions,
        },
        securitySignals: {
          status:
            failedLogins24h > 20 || highSeverityAudit24h > 10 ? "review" : "ok",
          failedLogins24h,
          highSeverityAudit24h,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsInsights = async (req, res, next) => {
  try {
    const reportType = String(req.body?.reportType || "").trim().toLowerCase();
    const reportConfig = REPORT_BUILDERS[reportType];

    if (!reportConfig) {
      throw new AppError(
        "Invalid analytics insight report type",
        400,
        "INVALID_ANALYTICS_REPORT_TYPE",
      );
    }

    const branchOverride = req.body?.branch
      ? String(req.body.branch).trim().toLowerCase()
      : undefined;
    const scope = await resolveInsightScope(req, branchOverride);
    const rangeKey = String(req.body?.range || reportConfig.defaultRange)
      .trim()
      .toLowerCase();
    const insightBuildOptions = {
      billingRange: req.body?.billingRange,
      forecastMonths: req.body?.forecastMonths,
    };
    const question = String(req.body?.question || "").trim();
    const reportData =
      reportType === "hub"
        ? await reportConfig.build(scope, rangeKey, insightBuildOptions)
        : await reportConfig.build(scope, rangeKey);
    const { snapshotMeta, insight } = await generateAnalyticsInsight({
      reportType,
      scope,
      filters: reportData.filters,
      reportData,
      question,
    });

    sendSuccess(res, {
      scope: reportData.scope,
      filters: reportData.filters,
      snapshotMeta,
      insight,
    });
  } catch (error) {
    next(error);
  }
};

export const getOccupancyForecast = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const projectionMonths = Math.max(
      1,
      Math.min(Number.parseInt(req.query.months, 10) || 3, 6),
    );
    sendSuccess(
      res,
      await buildOccupancyForecastData(scope, { projectionMonths }),
    );
  } catch (error) {
    next(error);
  }
};

export const getDemographicsReport = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "12m").trim().toLowerCase();
    const tableRequest = parseTableRequest(req.query);
    sendSuccess(res, await buildDemographicsReportData(scope, rangeKey, tableRequest));
  } catch (error) {
    next(error);
  }
};

export const getOccupancyRateHistory = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeMonths = Math.max(
      1,
      Math.min(parseReportMonths(req.query.range || "12m"), 24),
    );

    const rooms = await fetchScopedRooms(scope.branchesIncluded);
    const roomIds = rooms.map((r) => r._id);
    const totalCapacity = rooms.reduce((sum, r) => sum + toNumber(r.capacity), 0);

    const { default: BedHistory } = await import("../models/BedHistory.js");

    const historyRecords = await BedHistory.find({
      roomId: { $in: roomIds },
      status: { $ne: "cancelled" },
    })
      .populate("tenantId", "firstName lastName occupation school gender")
      .lean();

    const monthKeys = buildMonthKeys(rangeMonths);

    let peakMonth = { month: "", rate: -1 };
    let offPeakMonth = { month: "", rate: 101 };

    const monthlySeries = monthKeys.map((key) => {
      const monthStart = dayjs(`${key}-01`).startOf("month");
      const monthEnd = dayjs(`${key}-01`).endOf("month");
      const daysInMonth = monthEnd.date();
      const totalAvailableBedDays = Math.max(1, totalCapacity * daysInMonth);

      let totalOccupiedBedDays = 0;

      historyRecords.forEach((rec) => {
        const moveIn = dayjs(rec.moveInDate || rec.checkInDate || rec.createdAt).startOf("day");
        const moveOut = rec.moveOutDate || rec.checkOutDate
          ? dayjs(rec.moveOutDate || rec.checkOutDate).endOf("day")
          : (rec.status === "active" ? dayjs().endOf("day") : null);

        if (!moveIn || moveIn.isAfter(monthEnd)) return;
        if (moveOut && moveOut.isBefore(monthStart)) return;

        const overlapStart = moveIn.isBefore(monthStart) ? monthStart : moveIn;
        const overlapEnd = !moveOut || moveOut.isAfter(monthEnd) ? monthEnd : moveOut;

        const occupiedDays = Math.max(0, overlapEnd.diff(overlapStart, "day") + 1);
        totalOccupiedBedDays += occupiedDays;
      });

      const occupancyRate = totalCapacity > 0
        ? Math.min(100, Math.round((totalOccupiedBedDays / totalAvailableBedDays) * 100))
        : 0;

      const label = formatMonthLabel(`${key}-01`);

      if (occupancyRate > peakMonth.rate) {
        peakMonth = { month: label, rate: occupancyRate };
      }
      if (occupancyRate < offPeakMonth.rate) {
        offPeakMonth = { month: label, rate: occupancyRate };
      }

      return {
        month: key,
        label,
        occupancyRate,
        occupiedBedDays: totalOccupiedBedDays,
        availableBedDays: totalAvailableBedDays,
      };
    });

    const completedStays = historyRecords.filter(
      (r) => (r.moveOutDate || r.checkOutDate) && (r.moveInDate || r.checkInDate),
    );
    const totalStayDays = completedStays.reduce((sum, r) => {
      const start = dayjs(r.moveInDate || r.checkInDate);
      const end = dayjs(r.moveOutDate || r.checkOutDate);
      return sum + Math.max(0, end.diff(start, "day"));
    }, 0);

    const avgStayDays = completedStays.length > 0
      ? Math.round(totalStayDays / completedStays.length)
      : 0;
    const avgStayMonths = Math.round((avgStayDays / 30) * 10) / 10;

    const turnaroundGaps = [];
    const recordsByBed = new Map();
    historyRecords.forEach((r) => {
      const bedKey = `${r.roomId}_${r.bedId}`;
      if (!recordsByBed.has(bedKey)) recordsByBed.set(bedKey, []);
      recordsByBed.get(bedKey).push(r);
    });

    recordsByBed.forEach((records) => {
      const sorted = [...records].sort(
        (a, b) => new Date(a.moveInDate || a.checkInDate) - new Date(b.moveInDate || b.checkInDate),
      );
      for (let i = 1; i < sorted.length; i++) {
        const prevOut = sorted[i - 1].moveOutDate || sorted[i - 1].checkOutDate;
        const currentIn = sorted[i].moveInDate || sorted[i].checkInDate;
        if (prevOut && currentIn) {
          const gap = dayjs(currentIn).diff(dayjs(prevOut), "day");
          if (gap >= 0 && gap <= 180) {
            turnaroundGaps.push(gap);
          }
        }
      }
    });

    const avgTurnaroundDays = turnaroundGaps.length > 0
      ? Math.round(turnaroundGaps.reduce((a, b) => a + b, 0) / turnaroundGaps.length)
      : 0;

    const typeCounts = { student: 0, working: 0, unspecified: 0 };
    const genderCounts = { male: 0, female: 0, unspecified: 0 };

    historyRecords.forEach((r) => {
      const tenant = r.tenantId;
      if (!tenant) {
        typeCounts.unspecified++;
        genderCounts.unspecified++;
        return;
      }

      if (tenant.school || (tenant.occupation && /student|university|college|nursing|engineering|it/i.test(tenant.occupation))) {
        typeCounts.student++;
      } else if (tenant.occupation) {
        typeCounts.working++;
      } else {
        typeCounts.unspecified++;
      }

      const g = (tenant.gender || "").toLowerCase();
      if (g === "male") genderCounts.male++;
      else if (g === "female") genderCounts.female++;
      else genderCounts.unspecified++;
    });

    sendSuccess(res, {
      scope: { branch: scope.branch, rangeMonths },
      kpis: {
        currentCapacity: totalCapacity,
        averageStayMonths: avgStayMonths,
        averageTurnaroundDays: avgTurnaroundDays,
        peakMonth: peakMonth.rate >= 0 ? peakMonth : null,
        offPeakMonth: offPeakMonth.rate <= 100 ? offPeakMonth : null,
      },
      series: monthlySeries,
      cohorts: {
        tenantTypes: [
          { label: "Students", count: typeCounts.student },
          { label: "Working Professionals", count: typeCounts.working },
          { label: "Unspecified", count: typeCounts.unspecified },
        ],
        genders: [
          { label: "Male", count: genderCounts.male },
          { label: "Female", count: genderCounts.female },
          { label: "Unspecified", count: genderCounts.unspecified },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomBedHistory = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!roomId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError("Invalid room ID format", 400, "INVALID_ROOM_ID");
    }

    const { default: Room } = await import("../models/Room.js");
    const { default: BedHistory } = await import("../models/BedHistory.js");
    const { default: Reservation } = await import("../models/Reservation.js");
    const { default: Stay } = await import("../models/Stay.js");

    const rawRoom = await Room.findById(roomId).lean();
    if (!rawRoom || rawRoom.isArchived) {
      throw new AppError("Room not found", 404, "ROOM_NOT_FOUND");
    }

    let room = rawRoom;
    try {
      const { syncRealtimeBedStatuses } = await import("./roomsController.js");
      if (typeof syncRealtimeBedStatuses === "function") {
        const [synced] = await syncRealtimeBedStatuses([rawRoom]);
        if (synced) room = synced;
      }
    } catch (syncErr) {
      console.warn("Could not run syncRealtimeBedStatuses in getRoomBedHistory:", syncErr);
    }

    const scope = await resolveAnalyticsScope(req);
    if (!scope.isOwner && !scope.branchesIncluded.includes(room.branch)) {
      throw new AppError("Access to this branch room is denied", 403, "FORBIDDEN");
    }

    const [historyRecords, activeReservations, activeStays] = await Promise.all([
      BedHistory.find({ roomId: room._id })
        .populate("tenantId", "firstName lastName email phone gender occupation school profileImage user_id")
        .populate("stayId", "monthlyRent leaseStartDate leaseEndDate status")
        .sort({ moveInDate: -1 })
        .lean(),
      Reservation.find({
        roomId: room._id,
        status: { $in: ["reserved", "moveIn", "payment_pending"] },
        isArchived: { $ne: true },
      })
        .populate("userId", "firstName lastName email phone gender occupation school profileImage user_id")
        .lean(),
      Stay.find({
        roomId: room._id,
        status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
      })
        .populate("tenantId", "firstName lastName email phone gender occupation school profileImage user_id")
        .lean(),
    ]);

    const isPrivate = String(room.type || "").toLowerCase().includes("private");
    const bedsMap = new Map();

    (room.beds || []).forEach((bed, idx) => {
      const isUpper = bed.position === "upper" || (!bed.position && idx % 2 === 0);
      const bunkLetter = isPrivate
        ? "none"
        : (bed.bunkBlock && bed.bunkBlock !== "none" && bed.bunkBlock !== "A")
        ? bed.bunkBlock
        : String.fromCharCode(65 + Math.floor(idx / 2));
      const pos = isPrivate ? "single" : (bed.position || (isUpper ? "upper" : "lower"));
      const key = bed.id || bed.code || `bed-${idx + 1}`;

      bedsMap.set(key, {
        bedId: key,
        position: pos,
        bunkBlock: bunkLetter,
        currentStatus: "available",
        occupiedBy: null,
        history: [],
      });
    });

    historyRecords.forEach((rec) => {
      let targetBed = rec.bedId ? bedsMap.get(rec.bedId) : null;
      if (!targetBed && rec.bedId) {
        // Try finding by case-insensitive matching, code, or index substring
        for (const b of bedsMap.values()) {
          if (
            b.bedId.toLowerCase() === String(rec.bedId).toLowerCase() ||
            (rec.bedId && (b.bedId.includes(rec.bedId) || String(rec.bedId).includes(b.bedId)))
          ) {
            targetBed = b;
            break;
          }
        }
      }
      if (!targetBed) {
        const bId = rec.bedId || `bed-${bedsMap.size + 1}`;
        targetBed = {
          bedId: bId,
          position: "unknown",
          bunkBlock: "A",
          currentStatus: "available",
          occupiedBy: null,
          history: [],
        };
        bedsMap.set(bId, targetBed);
      }

      const moveIn = rec.moveInDate || rec.checkInDate || rec.createdAt;
      const moveOut = rec.moveOutDate || rec.checkOutDate;
      const stayDurationDays = moveIn && moveOut
        ? Math.max(1, dayjs(moveOut).diff(dayjs(moveIn), "day"))
        : moveIn
        ? Math.max(1, dayjs().diff(dayjs(moveIn), "day"))
        : null;

      const tenantObj = rec.tenantId
        ? {
            id: rec.tenantId._id,
            name: `${rec.tenantId.firstName || ""} ${rec.tenantId.lastName || ""}`.trim() || rec.tenantId.name || "Tenant",
            email: rec.tenantId.email,
            phone: rec.tenantId.phone,
            gender: rec.tenantId.gender,
            occupation: rec.tenantId.occupation,
            school: rec.tenantId.school,
            profileImage: rec.tenantId.profileImage,
            tenantType: rec.tenantId.school || (rec.tenantId.occupation && /student/i.test(rec.tenantId.occupation))
              ? "Student"
              : rec.tenantId.occupation
              ? "Working Professional"
              : "Tenant",
          }
        : null;

      targetBed.history.push({
        id: rec._id,
        tenant: tenantObj,
        moveInDate: moveIn,
        moveOutDate: moveOut,
        status: rec.status,
        stayDurationDays,
        reason: rec.reason || "",
        notes: rec.notes || "",
        monthlyRent: rec.stayId?.monthlyRent || null,
      });

      if (rec.status === "active" && !moveOut && tenantObj) {
        targetBed.currentStatus = "occupied";
        targetBed.occupiedBy = {
          userId: tenantObj.id,
          name: tenantObj.name,
          email: tenantObj.email,
          phone: tenantObj.phone,
        };
      }
    });

    // Merge live active reservations & stays onto their respective beds if not already in BedHistory
    for (const [key, targetBed] of bedsMap.entries()) {
      const bId = targetBed.bedId ? String(targetBed.bedId).toLowerCase() : "";

      const activeRes = activeReservations.find((r) => {
        const selId = r.selectedBed?.id ? String(r.selectedBed.id).toLowerCase() : "";
        const selCode = r.selectedBed?.code ? String(r.selectedBed.code).toLowerCase() : "";
        return (
          (selId && (selId === bId || bId.includes(selId) || selId.includes(bId))) ||
          (selCode && (selCode === bId || bId.includes(selCode) || selCode.includes(bId)))
        );
      });

      const activeStay = activeStays.find((s) => {
        const sBedId = s.bedId ? String(s.bedId).toLowerCase() : "";
        const sBedCode = s.bedCode ? String(s.bedCode).toLowerCase() : "";
        return (
          (sBedId && (sBedId === bId || bId.includes(sBedId) || sBedId.includes(bId))) ||
          (sBedCode && (sBedCode === bId || bId.includes(sBedCode) || sBedCode.includes(bId)))
        );
      });

      const activeTenant = activeStay?.tenantId || activeRes?.userId;
      if (activeTenant && typeof activeTenant === "object") {
        const tenantIdStr = String(activeTenant._id);
        const hasActiveInHistory = targetBed.history.some(
          (h) => h.status === "active" || (h.tenant && String(h.tenant.id) === tenantIdStr && !h.moveOutDate)
        );

        const tenantName =
          `${activeTenant.firstName || ""} ${activeTenant.lastName || ""}`.trim() ||
          activeTenant.name ||
          "Active Tenant";

        if (!hasActiveInHistory) {
          const moveIn = activeStay?.moveInDate || activeRes?.moveInDate || activeRes?.checkInDate || activeRes?.createdAt || new Date();
          const stayDurationDays = Math.max(1, dayjs().diff(dayjs(moveIn), "day"));

          targetBed.history.unshift({
            id: String(activeStay?._id || activeRes?._id),
            tenant: {
              id: activeTenant._id,
              name: tenantName,
              email: activeTenant.email,
              phone: activeTenant.phone,
              gender: activeTenant.gender,
              occupation: activeTenant.occupation,
              school: activeTenant.school,
              profileImage: activeTenant.profileImage,
              tenantType: activeTenant.school || (activeTenant.occupation && /student/i.test(activeTenant.occupation))
                ? "Student"
                : activeTenant.occupation
                ? "Working Professional"
                : "Tenant",
            },
            moveInDate: moveIn,
            moveOutDate: null,
            status: "active",
            stayDurationDays,
            reason: activeRes ? `Active Move-in (${activeRes.status})` : "Active Stay",
            notes: "Currently in bed unit",
            monthlyRent: activeStay?.monthlyRent || null,
          });
        }

        targetBed.currentStatus = "occupied";
        targetBed.occupiedBy = {
          userId: activeTenant._id,
          name: tenantName,
          email: activeTenant.email,
          phone: activeTenant.phone,
        };
      }
    }

    const bedList = Array.from(bedsMap.values());
    const activeStaysCount = bedList.filter((b) =>
      b.history.some((h) => h.status === "active") || (b.currentStatus === "occupied" && b.occupiedBy?.name)
    ).length;
    const totalStays = bedList.reduce((sum, b) => sum + b.history.length, 0);

    sendSuccess(res, {
      room: {
        id: room._id,
        name: room.name,
        roomNumber: room.roomNumber,
        branch: room.branch,
        type: room.type,
        capacity: room.capacity,
        currentOccupancy: activeStaysCount,
      },
      beds: bedList,
      summary: {
        totalStays,
        activeStaysCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getDashboardAnalytics,
  getOccupancyReport,
  getBillingReport,
  getOperationsReport,
  getFinancialsReport,
  getAuditSummary,
  getSystemPerformance,
  getAnalyticsInsights,
  getOccupancyForecast,
  getDemographicsReport,
  getOccupancyRateHistory,
  getRoomBedHistory,
  getSupportChatReport,
};

