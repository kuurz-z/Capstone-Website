import {
  Bill,
  Inquiry,
  MaintenanceRequest,
  Reservation,
  Room,
  User,
} from "../models/index.js";
import { sendSuccess } from "../middleware/errorHandler.js";
import { ROOM_BRANCHES, ROOM_BRANCH_LABELS } from "../config/branches.js";
import { OPEN_MAINTENANCE_STATUSES } from "../config/maintenance.js";
import {
  ACTIVE_STAY_STATUS_QUERY,
  reservationStatusesForQuery,
} from "../utils/lifecycleNaming.js";

const HIGH_OCCUPANCY_THRESHOLD = 85;
const LOW_AVAILABLE_BEDS_THRESHOLD = 2;
const ELEVATED_WORKLOAD_THRESHOLD = 8;
const PENDING_RESERVATION_STATUSES = reservationStatusesForQuery(
  "pending",
  "visit_pending",
  "visit_approved",
  "payment_pending",
);

const createBranchMap = (factory) =>
  new Map(ROOM_BRANCHES.map((branch) => [branch, factory(branch)]));

const createCountMap = () => createBranchMap(() => 0);

const incrementBranchCount = (countMap, branch) => {
  if (!countMap.has(branch)) return;
  countMap.set(branch, (countMap.get(branch) || 0) + 1);
};

export const getOwnerBranchSummaries = async (_req, res, next) => {
  try {
    const rooms = await Room.find({
      branch: { $in: ROOM_BRANCHES },
      isArchived: false,
    })
      .select("_id branch capacity currentOccupancy")
      .lean();

    const roomIds = rooms.map((room) => room._id);
    const roomBranchById = new Map(
      rooms.map((room) => [String(room._id), room.branch]),
    );
    const roomsByBranch = createBranchMap(() => []);
    rooms.forEach((room) => {
      roomsByBranch.get(room.branch)?.push(room);
    });

    const assignedAdmins = await User.find({
      role: "branch_admin",
      branch: { $in: ROOM_BRANCHES },
      isArchived: { $ne: true },
    })
      .select("_id firstName lastName email branch")
      .lean();

    const [
      activeStayReservations,
      pendingReservations,
      overdueBills,
      openMaintenanceRequests,
      pendingInquiries,
    ] = await Promise.all([
      Reservation.find({
        roomId: { $in: roomIds },
        status: { $in: ACTIVE_STAY_STATUS_QUERY },
        isArchived: { $ne: true },
      })
        .select("userId roomId")
        .lean(),
      Reservation.find({
        roomId: { $in: roomIds },
        status: { $in: PENDING_RESERVATION_STATUSES },
        isArchived: { $ne: true },
      })
        .select("roomId")
        .lean(),
      Bill.find({
        branch: { $in: ROOM_BRANCHES },
        status: "overdue",
        isArchived: false,
      })
        .select("branch")
        .lean(),
      MaintenanceRequest.find({
        branch: { $in: ROOM_BRANCHES },
        status: { $in: OPEN_MAINTENANCE_STATUSES },
        isArchived: false,
      })
        .select("branch")
        .lean(),
      Inquiry.find({
        branch: { $in: ROOM_BRANCHES },
        status: "pending",
        isArchived: false,
      })
        .select("branch")
        .lean(),
    ]);

    const adminsByBranch = createBranchMap(() => []);
    assignedAdmins.forEach((admin) => {
      adminsByBranch.get(admin.branch)?.push(admin);
    });

    const tenantSetsByBranch = createBranchMap(() => new Set());
    activeStayReservations.forEach((reservation) => {
      const branch = roomBranchById.get(String(reservation.roomId));
      if (!branch || !reservation.userId) return;
      tenantSetsByBranch.get(branch)?.add(String(reservation.userId));
    });

    const pendingReservationsByBranch = createCountMap();
    pendingReservations.forEach((reservation) => {
      const branch = roomBranchById.get(String(reservation.roomId));
      incrementBranchCount(pendingReservationsByBranch, branch);
    });

    const overdueBillingByBranch = createCountMap();
    overdueBills.forEach((bill) => {
      incrementBranchCount(overdueBillingByBranch, bill.branch);
    });

    const openMaintenanceByBranch = createCountMap();
    openMaintenanceRequests.forEach((request) => {
      incrementBranchCount(openMaintenanceByBranch, request.branch);
    });

    const pendingInquiriesByBranch = createCountMap();
    pendingInquiries.forEach((inquiry) => {
      incrementBranchCount(pendingInquiriesByBranch, inquiry.branch);
    });

    const summaries = ROOM_BRANCHES.map((branch) => {
      const branchRooms = roomsByBranch.get(branch) || [];
      const totalRooms = branchRooms.length;
      const totalBeds = branchRooms.reduce(
        (sum, room) => sum + Number(room.capacity || 0),
        0,
      );
      const occupiedBeds = branchRooms.reduce(
        (sum, room) => sum + Number(room.currentOccupancy || 0),
        0,
      );
      const availableBeds = Math.max(totalBeds - occupiedBeds, 0);
      const occupancyRate =
        totalBeds > 0
          ? Number(((occupiedBeds / totalBeds) * 100).toFixed(1))
          : 0;
      const assignedBranchAdmins = adminsByBranch.get(branch) || [];
      const pendingReservationsCount =
        pendingReservationsByBranch.get(branch) || 0;
      const openMaintenanceCount = openMaintenanceByBranch.get(branch) || 0;
      const pendingInquiriesCount = pendingInquiriesByBranch.get(branch) || 0;
      const overdueBillingCount = overdueBillingByBranch.get(branch) || 0;
      const unresolvedWorkloadCount =
        pendingReservationsCount +
        openMaintenanceCount +
        pendingInquiriesCount;

      return {
        branch,
        label: ROOM_BRANCH_LABELS[branch] || branch,
        totalRooms,
        occupancy: {
          occupiedBeds,
          totalBeds,
          availableBeds,
          rate: occupancyRate,
        },
        tenantCount: tenantSetsByBranch.get(branch)?.size || 0,
        assignedAdmins: assignedBranchAdmins.map((admin) => ({
          _id: admin._id,
          firstName: admin.firstName || "",
          lastName: admin.lastName || "",
          email: admin.email || "",
        })),
        assignedAdminCount: assignedBranchAdmins.length,
        overdueBillingCount,
        openMaintenanceCount,
        pendingReservationsCount,
        pendingInquiriesCount,
        unresolvedWorkloadCount,
        warningStates: {
          noAssignedAdmin: assignedBranchAdmins.length === 0,
          highOccupancyPressure:
            totalBeds > 0 &&
            (occupancyRate >= HIGH_OCCUPANCY_THRESHOLD ||
              availableBeds <= LOW_AVAILABLE_BEDS_THRESHOLD),
          elevatedUnresolvedWorkload:
            unresolvedWorkloadCount >= ELEVATED_WORKLOAD_THRESHOLD,
        },
      };
    });

    sendSuccess(res, { branches: summaries });
  } catch (error) {
    next(error);
  }
};
