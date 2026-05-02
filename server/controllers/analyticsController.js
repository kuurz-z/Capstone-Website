import dayjs from "dayjs";
import mongoose from "mongoose";
import {
  AuditLog,
  Bill,
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

const DASHBOARD_RANGE_DAYS = Object.freeze({
  "7d": 7,
  "30d": 30,
  "90d": 90,
});

const REPORT_DAY_RANGES = Object.freeze({
  "30d": 30,
  "60d": 60,
  "90d": 90,
});

const REPORT_MONTH_RANGES = Object.freeze({
  "3m": 3,
  "6m": 6,
  "12m": 12,
});

const TABLE_PAGE_DEFAULT_LIMIT = 10;
const TABLE_PAGE_MAX_LIMIT = 100;

const PENDING_RESERVATION_STATUSES = Object.freeze([
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
]);

const APPROVED_RESERVATION_STATUSES = Object.freeze(ACTIVE_OCCUPANCY_STATUS_QUERY);
const REJECTED_RESERVATION_STATUSES = Object.freeze(["cancelled"]);
const NON_OCCUPANCY_RESERVATION_STATUSES = new Set([
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
  "cancelled",
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

const formatBranchLabel = (value) =>
  value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const parseRangeDays = (value) => DASHBOARD_RANGE_DAYS[value] || DASHBOARD_RANGE_DAYS["30d"];
const parseReportDays = (value) => REPORT_DAY_RANGES[value] || REPORT_DAY_RANGES["30d"];
const parseReportMonths = (value) =>
  REPORT_MONTH_RANGES[value] || REPORT_MONTH_RANGES["3m"];

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

const parseTableRequest = (query = {}) => ({
  limit: parsePositiveInteger(
    query.tableLimit ?? query.limit,
    TABLE_PAGE_DEFAULT_LIMIT,
    TABLE_PAGE_MAX_LIMIT,
  ),
  offset: parsePositiveInteger(query.tableOffset ?? query.offset, 0),
  sort: String(query.tableSort ?? query.sort ?? "").trim(),
  direction:
    String(query.tableDirection ?? query.direction ?? "asc").toLowerCase() === "desc"
      ? "desc"
      : "asc",
});

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
  const request = {
    ...tableRequest,
    sort: tableRequest.sort || defaults.sort || "",
    direction: tableRequest.sort ? tableRequest.direction : defaults.direction || tableRequest.direction,
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
    .select("_id branch type name roomNumber")
    .lean();

const fetchRevenueCollected = async (branchesIncluded, sinceDate) => {
  const [result = { total: 0 }] = await Bill.aggregate([
    {
      $match: {
        isArchived: false,
        branch: { $in: branchesIncluded },
        paymentDate: { $gte: sinceDate },
        paidAmount: { $gt: 0 },
        status: { $in: ["paid", "partially-paid"] },
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

const fetchRecentInquiries = async (branchesIncluded) =>
  Inquiry.find({
    branch: { $in: branchesIncluded },
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
    .populate("userId", "firstName lastName user_id")
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
    branch: { $in: branchesIncluded },
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
  const timeline = buildDailyTimeline(days);

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
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance)
    .slice(0, 15);
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
    .sort((left, right) => right.attempts - left.attempts)
    .slice(0, 10);
};

const buildBranchComparison = async (scope, sinceDate) => {
  const branches = scope.isOwner && scope.branch === "all"
    ? ROOM_BRANCHES
    : scope.branchesIncluded;
  const periodBills = await fetchScopedBills(branches, {
    billingMonth: { $gte: sinceDate },
  });
  const openBills = await fetchScopedBills(branches, {
    status: { $in: ["pending", "overdue", "partially-paid"] },
  });
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
    },
    series: {
      occupancyTrend: buildOccupancyTrend({
        rooms,
        reservations,
        days: rangeDays,
      }),
    },
    tables: {
      inventory: buildPaginatedTable(inventory, tableRequest, {
        sort: "roomNumber",
        direction: "asc",
      }),
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

  const overdueRows = overdueBills
    .map(buildBillingTableRow)
    .sort((left, right) => right.daysOverdue - left.daysOverdue)
    .slice(0, 15);
  const unpaidRows = openBills
    .map(buildBillingTableRow)
    .sort((left, right) => right.balance - left.balance)
    .slice(0, 15);

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
    },
    series: {
      revenueByMonth: buildBillingMonthSeries(periodBills, rangeMonths),
      statusDistribution: buildBillingStatusDistribution(periodBills),
      overdueAging: buildOverdueAging(openBills),
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

  const [reservations, inquiries, maintenanceRequests, resolvedRequests] =
    await Promise.all([
      roomIds.length
        ? fetchScopedReservations(roomIds, { createdAt: { $gte: sinceDate } })
        : [],
      fetchScopedInquiries(scope.branchesIncluded, { createdAt: { $gte: sinceDate } }),
      fetchScopedMaintenanceRequests(scope.branchesIncluded, { created_at: { $gte: sinceDate } }),
      fetchScopedMaintenanceRequests(scope.branchesIncluded, { resolved_at: { $gte: sinceDate } }),
    ]);

  const resolutionSummary = buildResolutionSummary(resolvedRequests);
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
    })
    .slice(0, 15);
  const reservationRows = reservations.slice(0, 15).map((reservation) => ({
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
    },
    series: {
      reservationsByPeriod: buildReservationSeries(reservations, rangeDays),
      inquiriesByWeekday: buildInquiryWeekdaySeries(inquiries),
      peakInquiryWindows: buildInquiryHourWindows(inquiries),
      maintenanceByType: buildMaintenanceTypeSeries(maintenanceRequests),
      maintenanceResolution: resolutionSummary.series,
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
      .sort({ timestamp: -1 })
      .lean(),
    LoginLog.find({
      success: false,
      createdAt: { $gte: sinceDate },
    })
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
  const recentSecurityEvents = logs
    .filter(
      (log) =>
        ["warning", "high", "critical"].includes(String(log.severity || "")) ||
        log.type === "login",
    )
    .slice(0, 20)
    .map((log) => ({
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

const REPORT_BUILDERS = Object.freeze({
  occupancy: { defaultRange: "30d", build: buildOccupancyReportData },
  billing: { defaultRange: "3m", build: buildBillingReportData },
  operations: { defaultRange: "30d", build: buildOperationsReportData },
  audit: { defaultRange: "30d", build: buildAuditSummaryData },
});

export const getDashboardAnalytics = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();
    const rangeDays = parseRangeDays(rangeKey);
    const sinceDate = dayjs().subtract(rangeDays, "day").startOf("day").toDate();

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
          branch: { $in: scope.branchesIncluded },
          isArchived: { $ne: true },
          createdAt: { $gte: sinceDate },
        }),
      ]);

    const roomIds = scopedRooms.map((room) => room._id);

    const [
      revenueCollected,
      approvedReservations,
      pendingReservations,
      rejectedReservations,
      recentReservations,
      recentInquiries,
      branchComparison,
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
      roomIds.length ? fetchRecentReservations(roomIds) : [],
      fetchRecentInquiries(scope.branchesIncluded),
      buildBranchComparison(scope, sinceDate),
    ]);

    const totalCapacity = occupancyStats?.totalCapacity || 0;
    const totalOccupancy = occupancyStats?.totalOccupancy || 0;
    const occupancyRate =
      totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;

    sendSuccess(res, {
      scope: {
        role: scope.role,
        branch: scope.branch,
        branchesIncluded: scope.branchesIncluded,
      },
      filters: {
        range: rangeKey,
        since: sinceDate.toISOString(),
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
      },
      occupancy: {
        branch: occupancyStats?.branch || scope.branch,
        totalRooms: occupancyStats?.totalRooms || 0,
        totalCapacity,
        totalOccupancy,
        availableBeds: Math.max(totalCapacity - totalOccupancy, 0),
        occupancyRate,
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
    });
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
    if (!scope.isOwner) {
      throw new AppError("Owner access required", 403, "OWNER_ACCESS_REQUIRED");
    }

    const rangeKey = String(req.query.range || "3m").trim().toLowerCase();
    const tableRequest = parseTableRequest(req.query);
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

    sendSuccess(res, {
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
          .sort((left, right) => right.balance - left.balance)
          .slice(0, 20),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditSummary = async (req, res, next) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const rangeKey = String(req.query.range || "30d").trim().toLowerCase();
    sendSuccess(res, await buildAuditSummaryData(scope, rangeKey, parseTableRequest(req.query)));
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
    const question = String(req.body?.question || "").trim();
    const reportData = await reportConfig.build(scope, rangeKey);
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
    const historyMonths = 12;

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

    sendSuccess(res, {
      ...buildRangeEnvelope(scope, {
        months: projectionMonths,
        historyMonths,
      }),
      forecast,
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
};
