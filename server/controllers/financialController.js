/**
 * ============================================================================
 * FINANCIAL CONTROLLER
 * ============================================================================
 *
 * Owner-only financial overview. Aggregates billing data across all branches
 * to give a high-level picture of outstanding revenue.
 *
 * Endpoint:
 *   GET /api/financial/overview?branch=   — full financial snapshot
 *
 * Auth: verifyToken → verifyAdmin (Owner role enforced at route level)
 * ============================================================================
 */

import { Bill, Room, Reservation, User } from "../models/index.js";
import dayjs from "dayjs";
import { reservationStatusesForQuery } from "../utils/lifecycleNaming.js";

// ============================================================================
// GET /api/financial/overview
// ============================================================================

/**
 * Returns a financial snapshot:
 *  - Branch-level KPIs (totalOwed, overdueCount, pendingCount, totalPaid30d)
 *  - Per-room breakdown with per-tenant bill details
 */
export const getOverview = async (req, res, next) => {
  try {
    const { branch } = req.query;

    // ── 1. Fetch active reservations (scoped by branch if requested) ──
    const reservationFilter = {
      status: { $in: reservationStatusesForQuery("reserved", "moveIn") },
      isArchived: false,
    };
    if (branch && branch !== "all") reservationFilter.branch = branch;

    const activeReservations = await Reservation.find(reservationFilter)
      .populate("userId", "firstName lastName")
      .populate("roomId", "name roomNumber branch")
      .lean();

    const reservationIds = activeReservations.map((r) => r._id);

    if (reservationIds.length === 0) {
      return res.json({
        kpis: { totalOwed: 0, overdueCount: 0, pendingCount: 0, totalPaid30d: 0 },
        rooms: [],
      });
    }

    // ── 2. Fetch all non-draft bills for active reservations ──
    const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();

    const [unpaidBills, recentPaidBills] = await Promise.all([
      Bill.find({
        reservationId: { $in: reservationIds },
        status: { $in: ["pending", "partially-paid", "overdue"] },
        isArchived: false,
      }).lean(),
      Bill.find({
        reservationId: { $in: reservationIds },
        status: "paid",
        paymentDate: { $gte: thirtyDaysAgo },
        isArchived: false,
      }).lean(),
    ]);

    // ── 3. Branch-level KPIs ──
    const overdueBills = unpaidBills.filter((b) => b.status === "overdue");
    const pendingBills = unpaidBills.filter((b) =>
      ["pending", "partially-paid"].includes(b.status),
    );

    const totalOwed = unpaidBills.reduce(
      (sum, b) => sum + (b.totalAmount - (b.paidAmount || 0)),
      0,
    );
    const totalPaid30d = recentPaidBills.reduce(
      (sum, b) => sum + (b.paidAmount || b.totalAmount || 0),
      0,
    );

    const kpis = {
      totalOwed: Math.round(totalOwed * 100) / 100,
      overdueCount: overdueBills.length,
      pendingCount: pendingBills.length,
      totalPaid30d: Math.round(totalPaid30d * 100) / 100,
    };

    // ── 4. Per-room breakdown ──
    // Index reservations by ID
    const reservationMap = new Map(
      activeReservations.map((r) => [String(r._id), r]),
    );

    // Group unpaid bills by roomId
    const billsByRoom = {};
    for (const bill of unpaidBills) {
      const res = reservationMap.get(String(bill.reservationId));
      if (!res?.roomId) continue;
      const roomKey = String(res.roomId._id);
      if (!billsByRoom[roomKey]) {
        billsByRoom[roomKey] = {
          roomId: res.roomId._id,
          roomName: res.roomId.name || res.roomId.roomNumber || "Unknown",
          branch: res.roomId.branch,
          overdueCount: 0,
          pendingCount: 0,
          totalOwed: 0,
          tenants: [],
        };
      }
      const entry = billsByRoom[roomKey];
      if (bill.status === "overdue") entry.overdueCount += 1;
      else entry.pendingCount += 1;
      const owed = bill.totalAmount - (bill.paidAmount || 0);
      entry.totalOwed += owed;
      entry.tenants.push({
        name: res.userId
          ? `${res.userId.firstName || ""} ${res.userId.lastName || ""}`.trim()
          : "Unknown",
        billId: bill._id,
        amount: bill.totalAmount,
        paidAmount: bill.paidAmount || 0,
        owed: Math.round(owed * 100) / 100,
        status: bill.status,
        dueDate: bill.dueDate || null,
        billingMonth: bill.billingMonth,
      });
    }

    // Sort rooms: overdue first, then by totalOwed desc
    const rooms = Object.values(billsByRoom)
      .map((r) => ({ ...r, totalOwed: Math.round(r.totalOwed * 100) / 100 }))
      .sort((a, b) => {
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return b.totalOwed - a.totalOwed;
      });

    res.json({ kpis, rooms });
  } catch (error) {
    next(error);
  }
};
