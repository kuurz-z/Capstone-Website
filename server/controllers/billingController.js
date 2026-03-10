/**
 * ============================================================================
 * TENANT BILLING CONTROLLER
 * ============================================================================
 *
 * Handles all billing-related operations for tenants.
 * Ensures data isolation by branch and provides forecasting data.
 * Refactored: shared helpers for bill formatting, overdue detection, pro-rata.
 *
 * ============================================================================
 */

import { Bill, RoomBill, Reservation, Room, User } from "../models/index.js";
import {
  sendBillGeneratedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
} from "../config/email.js";

/* ─── shared helpers ─────────────────────────────── */

/** Get admin's role and branch from MongoDB */
async function getAdminInfo(req) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
  return {
    role: dbUser?.role || "user",
    branch: dbUser?.branch || null,
    isSuperAdmin: dbUser?.role === "superAdmin",
    _id: dbUser?._id || null,
  };
}

/** Auto-mark overdue bills (shared by getBillsByBranch + getAllBills) */
async function markOverdueBills(bills) {
  const now = new Date();
  for (const bill of bills) {
    if (bill.status === "pending" && bill.dueDate < now) {
      bill.status = "overdue";
      await bill.save();
    }
  }
}

/** Map a Bill document to API response shape (shared by getBillsByBranch + getAllBills) */
const formatBill = (bill) => ({
  id: bill._id,
  tenant: bill.userId
    ? {
        id: bill.userId._id,
        name: `${bill.userId.firstName || ""} ${bill.userId.lastName || ""}`.trim(),
        email: bill.userId.email,
      }
    : null,
  room: bill.reservationId?.roomName || "N/A",
  branch: bill.branch,
  billingMonth: bill.billingMonth,
  dueDate: bill.dueDate,
  charges: bill.charges,
  totalAmount: bill.totalAmount,
  paidAmount: bill.paidAmount,
  status: bill.status,
  notes: bill.notes,
  createdAt: bill.createdAt,
});

/** Build paginated bill response (shared by getBillsByBranch + getAllBills) */
async function fetchBills(filter, query) {
  const { status, month, page = 1, limit = 20, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  if (status && status !== "all") filter.status = status;
  if (month) {
    const d = new Date(month);
    filter.billingMonth = {
      $gte: new Date(d.getFullYear(), d.getMonth(), 1),
      $lt: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    };
  }

  let bills = await Bill.find(filter)
    .populate("userId", "firstName lastName email username")
    .populate("reservationId", "roomId roomName bedDetails")
    .sort({ billingMonth: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bill.countDocuments(filter);
  await markOverdueBills(bills);

  if (search) {
    const q = search.toLowerCase();
    bills = bills.filter(
      (b) =>
        b.userId?.firstName?.toLowerCase().includes(q) ||
        b.userId?.lastName?.toLowerCase().includes(q) ||
        b.userId?.email?.toLowerCase().includes(q),
    );
  }

  return {
    bills: bills.map(formatBill),
    pagination: {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

/** Round to 2 decimal places */
const r2 = (n) => Math.round(n * 100) / 100;

/* ─── controllers ────────────────────────────────── */

export const getCurrentBilling = async (req, res) => {
  try {
    const { uid, branch } = req.user;
    const activeStay = await Reservation.findOne({
      userId: uid,
      branch,
      status: "checked-in",
    });
    if (!activeStay)
      return res.status(404).json({ error: "No active stay found" });

    const now = new Date();
    const currentBill = await Bill.findOne({
      reservationId: activeStay._id,
      branch,
      billingMonth: {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
    });
    if (!currentBill)
      return res.status(404).json({ error: "No current bill found" });

    res.json({
      currentBalance: currentBill.totalAmount - currentBill.paidAmount,
      totalAmount: currentBill.totalAmount,
      paidAmount: currentBill.paidAmount,
      dueDate: currentBill.dueDate,
      status: currentBill.status,
      charges: currentBill.charges,
    });
  } catch (error) {
    console.error("❌ Get current billing error:", error);
    res.status(500).json({ error: "Failed to fetch billing information" });
  }
};

export const getBillingHistory = async (req, res) => {
  try {
    const { uid, branch } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const stayIds = (await Reservation.find({ userId: uid, branch })).map(
      (s) => s._id,
    );

    const bills = await Bill.find({
      reservationId: { $in: stayIds },
      branch,
      isArchived: false,
    })
      .sort({ billingMonth: -1 })
      .limit(limit);
    res.json({
      count: bills.length,
      bills: bills.map((b) => ({
        id: b._id,
        date: b.billingMonth,
        dueDate: b.dueDate,
        amount: b.totalAmount,
        paidAmount: b.paidAmount,
        status: b.status,
        charges: b.charges,
        paymentDate: b.paymentDate,
      })),
    });
  } catch (error) {
    console.error("❌ Get billing history error:", error);
    res.status(500).json({ error: "Failed to fetch billing history" });
  }
};

export const getBillingStats = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    if (
      !admin.isSuperAdmin &&
      (!admin.branch || !["gil-puyat", "guadalupe"].includes(admin.branch))
    )
      return res.status(403).json({ error: "Invalid branch" });
    const monthlyRevenue = await Bill.getMonthlyRevenueByBranch(
      admin.branch,
      12,
    );
    const paymentStats = await Bill.getPaymentStats(admin.branch);
    res.json({ branch: admin.branch, monthlyRevenue, paymentStats });
  } catch (error) {
    console.error("❌ Get billing stats error:", error);
    res.status(500).json({ error: "Failed to fetch billing statistics" });
  }
};

export const markBillAsPaid = async (req, res) => {
  try {
    const { billId } = req.params;
    const { amount, note } = req.body;
    const admin = await getAdminInfo(req);
    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Bill not found" });
    await bill.markAsPaid(amount || bill.totalAmount);
    if (note) {
      bill.notes = note;
      await bill.save();
    }
    res.json({ success: true, bill: bill.toObject() });
  } catch (error) {
    console.error("❌ Mark bill as paid error:", error);
    res.status(500).json({ error: "Failed to update bill" });
  }
};

export const getBillsByBranch = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isSuperAdmin && req.query.branch ? req.query.branch : admin.branch;

    if (!branch || !["gil-puyat", "guadalupe"].includes(branch)) {
      if (admin.isSuperAdmin && !req.query.branch) {
        // Super admin without branch filter — get all
        const result = await fetchBills({ isArchived: false }, req.query);
        return res.json(result);
      }
      return res.status(403).json({ error: "Invalid branch" });
    }

    const result = await fetchBills({ branch, isArchived: false }, req.query);
    res.json(result);
  } catch (error) {
    console.error("❌ Get bills by branch error:", error);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
};

export const generateRoomBill = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const { roomId, billingMonth, dueDate, charges = {} } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room is required" });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!admin.isSuperAdmin && room.branch !== admin.branch)
      return res
        .status(403)
        .json({ error: "Cannot create bills for another branch" });

    const monthDate = new Date(billingMonth || new Date());
    const monthStart = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1,
    );
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    );

    // Check duplicate room bill
    if (
      await RoomBill.findOne({
        roomId: room._id,
        billingMonth: monthStart,
        isArchived: false,
      })
    ) {
      return res
        .status(409)
        .json({ error: "A bill already exists for this room and month" });
    }

    // Find checked-in tenants via occupied beds
    const occupiedBeds = room.beds.filter(
      (b) => !b.available && b.occupiedBy?.userId,
    );

    const tenantInfos = [];
    const seenUserIds = new Set();

    // Source 1: Bed occupancy data
    for (const bed of occupiedBeds) {
      if (!bed.occupiedBy.reservationId) continue;
      const reservation = await Reservation.findById(
        bed.occupiedBy.reservationId,
      ).populate("userId", "firstName lastName email");
      if (!reservation?.userId || reservation.status !== "checked-in") continue;
      if (seenUserIds.has(String(reservation.userId._id))) continue;
      seenUserIds.add(String(reservation.userId._id));

      const rent =
        reservation.monthlyRent ||
        reservation.totalPrice ||
        room.monthlyPrice ||
        room.price ||
        0;
      const customCharges = reservation.customCharges || [];
      const moveInDate =
        bed.occupiedBy.occupiedSince || reservation.checkInDate || monthStart;
      const tenantStart = new Date(
        Math.max(new Date(moveInDate).getTime(), monthStart.getTime()),
      );
      const tenantEnd = new Date(
        Math.min(Date.now(), monthEnd.getTime() + 86400000),
      );
      const daysInRoom = Math.max(
        1,
        Math.ceil((tenantEnd - tenantStart) / 86400000),
      );

      tenantInfos.push({
        userId: reservation.userId._id,
        reservationId: reservation._id,
        userName:
          `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim() ||
          "Tenant",
        email: reservation.userId.email || "",
        rent,
        customCharges,
        daysInRoom,
        moveInDate,
      });
    }

    // Source 2: Direct reservation query fallback (if bed data is stale)
    if (tenantInfos.length === 0) {
      const checkedInReservations = await Reservation.find({
        roomId: room._id,
        status: "checked-in",
        isArchived: { $ne: true },
      }).populate("userId", "firstName lastName email");

      for (const reservation of checkedInReservations) {
        if (!reservation?.userId) continue;
        if (seenUserIds.has(String(reservation.userId._id))) continue;
        seenUserIds.add(String(reservation.userId._id));

        const rent =
          reservation.monthlyRent ||
          reservation.totalPrice ||
          room.monthlyPrice ||
          room.price ||
          0;
        const customCharges = reservation.customCharges || [];
        const moveInDate = reservation.checkInDate || monthStart;
        const tenantStart = new Date(
          Math.max(new Date(moveInDate).getTime(), monthStart.getTime()),
        );
        const tenantEnd = new Date(
          Math.min(Date.now(), monthEnd.getTime() + 86400000),
        );
        const daysInRoom = Math.max(
          1,
          Math.ceil((tenantEnd - tenantStart) / 86400000),
        );

        tenantInfos.push({
          userId: reservation.userId._id,
          reservationId: reservation._id,
          userName:
            `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim() ||
            "Tenant",
          email: reservation.userId.email || "",
          rent,
          customCharges,
          daysInRoom,
          moveInDate,
        });
      }
    }

    if (tenantInfos.length === 0)
      return res.status(400).json({
        error:
          "No checked-in tenants found in this room. Only tenants with 'checked-in' status can be billed.",
      });

    // Pro-rata calculation
    const totalOccupantDays = tenantInfos.reduce((s, t) => s + t.daysInRoom, 0);
    const roomCharges = {
      electricity: Number(charges.electricity) || 0,
      water: Number(charges.water) || 0,
    };
    const totalUtilities = roomCharges.electricity + roomCharges.water;
    const billDueDate = dueDate
      ? new Date(dueDate)
      : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 15);
    const adminUser = await User.findOne({ firebaseUid: req.user.uid });

    const generatedBills = [];
    const tenantBreakdown = [];

    for (const tenant of tenantInfos) {
      const share = tenant.daysInRoom / totalOccupantDays;
      const dupeFilter = {
        userId: tenant.userId,
        billingMonth: monthStart,
        isArchived: false,
      };
      if (tenant.reservationId) dupeFilter.reservationId = tenant.reservationId;
      if (await Bill.findOne(dupeFilter)) continue;

      const te = r2(roomCharges.electricity * share);
      const tw = r2(roomCharges.water * share);
      const utilityShare = te + tw;

      // Custom charges from reservation (appliance fees, etc.)
      const tenantCustomCharges = tenant.customCharges || [];
      const customChargesTotal = tenantCustomCharges.reduce(
        (sum, c) => sum + (Number(c.amount) || 0),
        0,
      );

      const totalAmount = tenant.rent + utilityShare + customChargesTotal;

      const bill = new Bill({
        reservationId: tenant.reservationId,
        userId: tenant.userId,
        branch: room.branch,
        roomId: room._id,
        billingMonth: monthStart,
        dueDate: billDueDate,
        proRataDays: tenant.daysInRoom,
        charges: {
          rent: tenant.rent,
          electricity: te,
          water: tw,
          applianceFees: customChargesTotal,
          corkageFees: 0,
          penalty: 0,
          discount: 0,
        },
        additionalCharges: tenantCustomCharges.map((c) => ({
          name: c.name,
          amount: c.amount,
        })),
        totalAmount,
        status: "pending",
      });
      await bill.save();
      generatedBills.push(bill._id);
      tenantBreakdown.push({
        userId: tenant.userId,
        reservationId: tenant.reservationId,
        daysInRoom: tenant.daysInRoom,
        proRataShare: Math.round(share * 10000) / 10000,
        rent: tenant.rent,
        customCharges: tenantCustomCharges,
        utilityShare,
        totalAmount,
        billId: bill._id,
      });
    }

    if (generatedBills.length === 0)
      return res.status(409).json({
        error:
          "Bills already exist for all tenants in this room for the selected month",
      });

    const roomBill = new RoomBill({
      roomId: room._id,
      branch: room.branch,
      billingMonth: monthStart,
      dueDate: billDueDate,
      charges: roomCharges,
      totalCharges: totalUtilities,
      generatedBills,
      status: "generated",
      generatedBy: adminUser?._id || null,
      tenantBreakdown,
    });
    await roomBill.save();
    await Bill.updateMany(
      { _id: { $in: generatedBills } },
      { $set: { roomBillId: roomBill._id } },
    );

    res.status(201).json({
      success: true,
      roomBill: {
        id: roomBill._id,
        room: room.name,
        billingMonth: monthStart,
        totalUtilities,
        tenantsCount: tenantBreakdown.length,
        tenantBreakdown: tenantBreakdown.map((t) => ({
          rent: t.rent,
          utilityShare: t.utilityShare,
          totalAmount: t.totalAmount,
          daysInRoom: t.daysInRoom,
          proRataPercent: Math.round(t.proRataShare * 100),
        })),
      },
    });

    // Send bill notification emails to all billed tenants
    const monthLabel = monthStart.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
    });
    const dueDateLabel = billDueDate.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    for (const tenant of tenantInfos) {
      if (!tenant.email) continue;
      try {
        await sendBillGeneratedEmail({
          to: tenant.email,
          tenantName: tenant.userName,
          billingMonth: monthLabel,
          totalAmount:
            tenant.rent +
            r2(
              (roomCharges.electricity +
                roomCharges.water +
                roomCharges.applianceFees +
                roomCharges.corkageFees) *
                (tenant.daysInRoom / totalOccupantDays),
            ),
          dueDate: dueDateLabel,
          branchName: room.branch || "Lilycrest",
        });
      } catch (emailErr) {
        console.error(
          `⚠️ Bill email to ${tenant.email} failed:`,
          emailErr.message,
        );
      }
    }
  } catch (error) {
    console.error("❌ Generate room bill error:", error);
    res.status(500).json({ error: "Failed to generate room bill" });
  }
};

export const getRoomsWithTenants = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isSuperAdmin && req.query.branch ? req.query.branch : admin.branch;
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter)
      .select(
        "name roomNumber branch type capacity currentOccupancy beds price monthlyPrice",
      )
      .sort({ name: 1 });

    res.json({
      rooms: await Promise.all(
        rooms.map(async (room) => {
          // Get checked-in reservations with tenant details
          const reservations = await Reservation.find({
            roomId: room._id,
            status: "checked-in",
            isArchived: { $ne: true },
          })
            .populate("userId", "firstName lastName email")
            .lean();

          const tenants = reservations
            .filter((r) => r.userId)
            .map((r) => {
              // Find which bed this tenant is on
              const bed = room.beds.find(
                (b) =>
                  b.occupiedBy?.reservationId?.toString() === r._id.toString(),
              );
              return {
                userId: r.userId._id,
                reservationId: r._id,
                name:
                  `${r.userId.firstName || ""} ${r.userId.lastName || ""}`.trim() ||
                  "Tenant",
                email: r.userId.email || "",
                checkInDate: r.checkInDate,
                monthlyRent:
                  r.monthlyRent ||
                  r.totalPrice ||
                  room.monthlyPrice ||
                  room.price ||
                  0,
                customCharges: r.customCharges || [],
                bedPosition: bed?.position || null,
              };
            });

          return {
            id: room._id,
            name: room.name,
            roomNumber: room.roomNumber,
            branch: room.branch,
            type: room.type,
            capacity: room.capacity,
            currentOccupancy: tenants.length,
            tenantCount: tenants.length,
            roomPrice: room.monthlyPrice || room.price || 0,
            tenants,
          };
        }),
      ),
    });
  } catch (error) {
    console.error("❌ Get rooms with tenants error:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

// ============================================================================
// TENANT: Get my bills
// ============================================================================

export const getMyBills = async (req, res) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bills = await Bill.find({
      userId: dbUser._id,
      isArchived: false,
    })
      .populate("roomId", "name branch type")
      .sort({ billingMonth: -1 })
      .lean();

    res.json({
      bills: bills.map((b) => ({
        id: b._id,
        billingMonth: b.billingMonth,
        dueDate: b.dueDate,
        charges: b.charges,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        status: b.status,
        proRataDays: b.proRataDays,
        room: b.roomId?.name || "N/A",
        branch: b.branch,
        paymentProof: b.paymentProof || { verificationStatus: "none" },
        penaltyDetails: b.penaltyDetails || { daysLate: 0 },
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    console.error("❌ Get my bills error:", error);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
};

// ============================================================================
// TENANT: Submit payment proof
// ============================================================================

export const submitPaymentProof = async (req, res) => {
  try {
    const { billId } = req.params;
    const { imageUrl, amount } = req.body;

    if (!imageUrl)
      return res.status(400).json({ error: "Proof image is required" });
    if (!amount || amount <= 0)
      return res
        .status(400)
        .json({ error: "Valid payment amount is required" });

    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (String(bill.userId) !== String(dbUser._id))
      return res
        .status(403)
        .json({ error: "You can only submit proof for your own bills" });
    if (bill.status === "paid")
      return res.status(400).json({ error: "Bill is already paid" });
    if (bill.paymentProof?.verificationStatus === "pending-verification")
      return res.status(400).json({
        error: "Payment proof already submitted and pending verification",
      });

    bill.paymentProof = {
      imageUrl,
      submittedAmount: amount,
      submittedAt: new Date(),
      verificationStatus: "pending-verification",
      rejectionReason: null,
      verifiedBy: null,
      verifiedAt: null,
    };
    await bill.save();

    console.log(
      `✅ Payment proof submitted for bill ${billId} by ${dbUser.email}`,
    );
    res.json({
      message: "Payment proof submitted successfully",
      bill: { id: bill._id, paymentProof: bill.paymentProof },
    });
  } catch (error) {
    console.error("❌ Submit payment proof error:", error);
    res.status(500).json({ error: "Failed to submit payment proof" });
  }
};

// ============================================================================
// ADMIN: Verify payment proof
// ============================================================================

export const verifyPayment = async (req, res) => {
  try {
    const { billId } = req.params;
    const { action, rejectionReason } = req.body; // action: "approve" | "reject"

    if (!["approve", "reject"].includes(action))
      return res
        .status(400)
        .json({ error: "Action must be 'approve' or 'reject'" });

    const admin = await getAdminInfo(req);
    const bill = await Bill.findById(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isSuperAdmin && bill.branch !== admin.branch)
      return res.status(403).json({ error: "Access denied" });
    if (bill.paymentProof?.verificationStatus !== "pending-verification")
      return res
        .status(400)
        .json({ error: "No pending payment proof to verify" });

    if (action === "approve") {
      bill.paymentProof.verificationStatus = "approved";
      bill.paymentProof.verifiedBy = admin._id;
      bill.paymentProof.verifiedAt = new Date();
      bill.paidAmount = bill.paymentProof.submittedAmount || bill.totalAmount;
      bill.status =
        bill.paidAmount >= bill.totalAmount ? "paid" : "partially-paid";
      bill.paymentDate = new Date();
    } else {
      bill.paymentProof.verificationStatus = "rejected";
      bill.paymentProof.rejectionReason =
        rejectionReason || "Payment proof not acceptable";
      bill.paymentProof.verifiedBy = admin._id;
      bill.paymentProof.verifiedAt = new Date();
    }
    await bill.save();

    // Send email notification to tenant (non-blocking)
    try {
      const tenant = await User.findById(bill.userId).lean();
      if (tenant?.email) {
        const monthStr = new Date(bill.billingMonth).toLocaleDateString(
          "en-PH",
          { year: "numeric", month: "long" },
        );
        if (action === "approve") {
          sendPaymentApprovedEmail({
            to: tenant.email,
            tenantName:
              `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
            billingMonth: monthStr,
            paidAmount: bill.paidAmount,
            branchName: bill.branch,
          }).catch((e) => console.error("Email error:", e.message));
        } else {
          sendPaymentRejectedEmail({
            to: tenant.email,
            tenantName:
              `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
            billingMonth: monthStr,
            rejectionReason: bill.paymentProof.rejectionReason,
            branchName: bill.branch,
          }).catch((e) => console.error("Email error:", e.message));
        }
      }
    } catch (emailErr) {
      console.error("Email notification failed:", emailErr.message);
    }

    console.log(`✅ Payment ${action}d for bill ${billId} by admin`);
    res.json({
      message: `Payment ${action}d successfully`,
      bill: {
        id: bill._id,
        status: bill.status,
        paymentProof: bill.paymentProof,
      },
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
};

// ============================================================================
// ADMIN: Get pending verifications
// ============================================================================

export const getPendingVerifications = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const filter = {
      "paymentProof.verificationStatus": "pending-verification",
      isArchived: false,
    };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const bills = await Bill.find(filter)
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name branch")
      .sort({ "paymentProof.submittedAt": -1 })
      .lean();

    res.json({
      count: bills.length,
      bills: bills.map((b) => ({
        id: b._id,
        tenant: b.userId
          ? {
              name: `${b.userId.firstName || ""} ${b.userId.lastName || ""}`.trim(),
              email: b.userId.email,
            }
          : null,
        room: b.roomId?.name || "N/A",
        branch: b.branch,
        billingMonth: b.billingMonth,
        totalAmount: b.totalAmount,
        paymentProof: b.paymentProof,
      })),
    });
  } catch (error) {
    console.error("❌ Get pending verifications error:", error);
    res.status(500).json({ error: "Failed to fetch pending verifications" });
  }
};

// ============================================================================
// PENALTY: Auto-apply penalties for overdue bills
// ============================================================================

const PENALTY_RATE_PER_DAY = 50; // ₱50/day per PRD

export const applyPenalties = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const now = new Date();
    const filter = {
      status: { $in: ["pending", "overdue"] },
      dueDate: { $lt: now },
      isArchived: false,
    };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const overdueBills = await Bill.find(filter);
    let updated = 0;

    for (const bill of overdueBills) {
      const daysLate = Math.max(
        1,
        Math.floor((now - new Date(bill.dueDate)) / 86400000),
      );
      const penalty = daysLate * PENALTY_RATE_PER_DAY;

      // Recalculate total: base charges + penalty - discount
      const baseCharges =
        (bill.charges.rent || 0) +
        (bill.charges.electricity || 0) +
        (bill.charges.water || 0) +
        (bill.charges.applianceFees || 0) +
        (bill.charges.corkageFees || 0);

      bill.charges.penalty = penalty;
      bill.totalAmount = baseCharges + penalty - (bill.charges.discount || 0);
      bill.penaltyDetails = {
        daysLate,
        ratePerDay: PENALTY_RATE_PER_DAY,
        appliedAt: now,
      };
      bill.status = "overdue";
      await bill.save();
      updated++;
    }

    console.log(`✅ Applied penalties to ${updated} overdue bills`);
    res.json({ message: `Penalties applied to ${updated} bills`, updated });
  } catch (error) {
    console.error("❌ Apply penalties error:", error);
    res.status(500).json({ error: "Failed to apply penalties" });
  }
};

// ============================================================================
// ADMIN: Billing report
// ============================================================================

export const getBillingReport = async (req, res) => {
  try {
    const admin = await getAdminInfo(req);
    const filter = { isArchived: false };
    if (!admin.isSuperAdmin && admin.branch) filter.branch = admin.branch;

    const [totalBills, paidBills, overdueBills, pendingVerifications] =
      await Promise.all([
        Bill.countDocuments(filter),
        Bill.aggregate([
          { $match: { ...filter, status: "paid" } },
          {
            $group: {
              _id: null,
              total: { $sum: "$paidAmount" },
              count: { $sum: 1 },
            },
          },
        ]),
        Bill.aggregate([
          { $match: { ...filter, status: "overdue" } },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
              count: { $sum: 1 },
              penalties: { $sum: "$charges.penalty" },
            },
          },
        ]),
        Bill.countDocuments({
          ...filter,
          "paymentProof.verificationStatus": "pending-verification",
        }),
      ]);

    res.json({
      totalBills,
      collected: {
        amount: paidBills[0]?.total || 0,
        count: paidBills[0]?.count || 0,
      },
      overdue: {
        amount: overdueBills[0]?.total || 0,
        count: overdueBills[0]?.count || 0,
        penalties: overdueBills[0]?.penalties || 0,
      },
      pendingVerifications,
    });
  } catch (error) {
    console.error("❌ Get billing report error:", error);
    res.status(500).json({ error: "Failed to fetch billing report" });
  }
};

export default {
  getCurrentBilling,
  getBillingHistory,
  getBillingStats,
  markBillAsPaid,
  getBillsByBranch,
  generateRoomBill,
  getRoomsWithTenants,
  getMyBills,
  submitPaymentProof,
  verifyPayment,
  getPendingVerifications,
  applyPenalties,
  getBillingReport,
};
