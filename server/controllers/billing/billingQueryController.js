import dayjs from "dayjs";
import { Bill, Room, User, Reservation } from "../../models/index.js";
import { getBusinessSettings } from "../../utils/businessSettings.js";
import {
  getVisibleBillSnapshot,
  getVisibleBillCharges,
  getReservationRecurringFees,
} from "../../utils/billingPolicy.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "../../utils/lifecycleNaming.js";
import {
  getAdminInfo,
  fetchBills,
  formatBillReference,
  ensureTenantCurrentRentBill,
  buildBillPaymentFlow,
  buildTenantUtilityBreakdown,
  getTenantBillForRequest,
  suggestRent,
  getRoomPublishState,
} from "./_helpers.js";
import { isUtilityChargeVisible } from "../../utils/billingPolicy.js";
import {
  NON_DRAFT_BILL_FILTER,
  CURRENT_BILL_SORT,
  selectCurrentBillFromList,
} from "../../services/billing/currentBillResolver.js";

export const getCurrentBilling = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    const activeStay = await ensureTenantCurrentRentBill(dbUser._id);
    if (!activeStay)
      return res.status(404).json({ error: "No active stay found" });

    // Selection rule (which of the tenant's non-draft bills is "current")
    // is the SAME canonical resolver the mobile Billing tab and mobile
    // Home/dashboard use — see services/billing/currentBillResolver.js for
    // why a later billingCycleStart alone can't decide this (pre-generated
    // next-cycle bills).
    const bills = await Bill.find({
      reservationId: activeStay._id,
      ...NON_DRAFT_BILL_FILTER,
    })
      .sort(CURRENT_BILL_SORT)
      .limit(5);
    const currentBill = selectCurrentBillFromList(bills);
    if (!currentBill)
      return res.status(404).json({ error: "No current bill found" });

    const visible = getVisibleBillSnapshot(currentBill);
    res.json({
      currentBalance: visible.remainingAmount,
      totalAmount: visible.totalAmount,
      grossAmount: visible.grossAmount,
      reservationCreditApplied: currentBill.reservationCreditApplied || 0,
      paidAmount: currentBill.paidAmount || 0,
      remainingAmount: visible.remainingAmount,
      dueDate: visible.dueDate,
      issuedAt: visible.issuedAt,
      billingCycleStart: currentBill.billingCycleStart,
      billingCycleEnd: currentBill.billingCycleEnd,
      utilityCycleStart: currentBill.utilityCycleStart || null,
      utilityCycleEnd: currentBill.utilityCycleEnd || null,
      utilityReadingDate: currentBill.utilityReadingDate || null,
      additionalCharges: currentBill.additionalCharges || [],
      status: visible.status,
      charges: visible.charges,
      paymentProof: currentBill.paymentProof || { verificationStatus: "none" },
      paymentFlow: buildBillPaymentFlow(currentBill, visible),
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingHistory = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const dbUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const bills = await Bill.find({
      userId: dbUser._id,
      status: { $ne: "draft" },
      isArchived: false,
    })
      .sort({ billingCycleStart: -1, billingMonth: -1, createdAt: -1 })
      .limit(limit);
    res.json({
      count: bills.length,
      bills: bills.map((b) => {
        const visible = getVisibleBillSnapshot(b);
        return {
          id: b._id,
          date: b.billingMonth,
          dueDate: visible.dueDate,
          issuedAt: visible.issuedAt,
          amount: visible.totalAmount,
          grossAmount: visible.grossAmount,
          billingCycleStart: b.billingCycleStart,
          billingCycleEnd: b.billingCycleEnd,
          reservationCreditApplied: b.reservationCreditApplied || 0,
          paidAmount: b.paidAmount || 0,
          remainingAmount: visible.remainingAmount,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          additionalCharges: b.additionalCharges || [],
          status: visible.status,
          charges: visible.charges,
          paymentDate: b.paymentDate,
          paymentProof: b.paymentProof || { verificationStatus: "none" },
          paymentFlow: buildBillPaymentFlow(b, visible),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingStats = async (req, res, next) => {
  try {
    const isOwner = req.isOwner;
    const branch = req.branchFilter;
    if (
      !isOwner &&
      (!branch || !["gil-puyat", "guadalupe"].includes(branch))
    )
      return res.status(403).json({ error: "Invalid branch" });
    const monthlyRevenue = await Bill.getMonthlyRevenueByBranch(branch, 12);
    const paymentStats = await Bill.getPaymentStats(branch);
    res.json({ branch, monthlyRevenue, paymentStats });
  } catch (error) {
    next(error);
  }
};

export const getBillsByBranch = async (req, res, next) => {
  try {
    const isOwner = req.isOwner;
    const branch = req.branchFilter ||
      (isOwner && req.query.branch ? req.query.branch : null);

    if (!branch) {
      if (isOwner) {
        const result = await fetchBills({ isArchived: false }, req.query);
        return res.json(result);
      }
      return res.status(403).json({ error: "Invalid branch" });
    }
    if (!["gil-puyat", "guadalupe"].includes(branch))
      return res.status(403).json({ error: "Invalid branch" });

    const result = await fetchBills({ branch, isArchived: false }, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getRoomsWithTenants = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isOwner && req.query.branch ? req.query.branch : admin.branch;
    const filter = { isArchived: false };
    if (branch) filter.branch = branch;

    const rooms = await Room.find(filter)
      .select(
        "name roomNumber branch type capacity currentOccupancy beds price monthlyPrice",
      )
      .sort({ name: 1 });

    const roomIds = rooms.map((r) => r._id);
    const allReservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .lean();
    const { longTermLeaseMinMonths } = await getBusinessSettings();

    const reservationsByRoom = new Map();
    for (const r of allReservations) {
      const key = String(r.roomId);
      if (!reservationsByRoom.has(key)) reservationsByRoom.set(key, []);
      reservationsByRoom.get(key).push(r);
    }

    res.json({
      rooms: rooms.map((room) => {
        const reservations = reservationsByRoom.get(String(room._id)) || [];

        const tenants = reservations
          .filter((r) => r.userId)
          .map((r) => {
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
              moveInDate: readMoveInDate(r),
              monthlyRent: suggestRent(r, room, readMoveInDate(r), longTermLeaseMinMonths),
              customCharges: getReservationRecurringFees(r).additionalCharges,
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
    });
  } catch (error) {
    next(error);
  }
};

export const getMyBills = async (req, res, next) => {
  try {
    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    await ensureTenantCurrentRentBill(dbUser._id);

    const bills = await Bill.find({
      $or: [{ userId: dbUser._id }, { tenantId: dbUser._id }],
      status: { $ne: "draft" },
      isArchived: { $ne: true },
    })
      .populate("roomId", "name branch type price monthlyPrice")
      .populate("reservationId", "pricingSnapshot reservationFeeAmount monthlyRent rentAmount advanceRent securityDeposit financialWorkflowVersion initialPaymentBreakdown")
      .sort({ billingCycleStart: -1, billingMonth: -1, createdAt: -1 })
      .lean();

    const billResponses = await Promise.all(
      bills.map(async (b) => {
        const utilityBreakdowns = {};
        const visibleCharges = getVisibleBillCharges(b);
        if (Number(visibleCharges.electricity || 0) > 0) {
          utilityBreakdowns.electricity =
            await buildTenantUtilityBreakdown({ dbUser, bill: b, utilityType: "electricity" });
        }
        if (Number(visibleCharges.water || 0) > 0) {
          utilityBreakdowns.water =
            await buildTenantUtilityBreakdown({ dbUser, bill: b, utilityType: "water" });
        }

        const isInitialPayment = b.billType === "initial_payment";
        let resolvedInitialBreakdown = null;

        if (isInitialPayment) {
          const embedded = b.initialPaymentBreakdown || {};
          const resObj = b.reservationId || {};
          const snapshot = resObj.pricingSnapshot || {};
          const roomPrice = Number(b.roomId?.monthlyPrice || b.roomId?.price || 0);

          const rawAdvance = Number(
            embedded.advanceRent ||
              snapshot.advanceRentAmount ||
              snapshot.finalMonthlyRate ||
              resObj.advanceRent ||
              resObj.monthlyRent ||
              roomPrice ||
              0,
          );

          const rawDeposit = Number(
            embedded.securityDeposit ||
              snapshot.securityDepositAmount ||
              snapshot.finalMonthlyRate ||
              resObj.securityDeposit ||
              resObj.monthlyRent ||
              roomPrice ||
              0,
          );

          const rawInitialCharges = Number(
            embedded.approvedInitialCharges ||
              snapshot.approvedInitialCharges ||
              0,
          );

          const rawCredit = Number(
            embedded.reservationFeeCredit ||
              b.reservationCreditApplied ||
              snapshot.reservationFeeAmount ||
              resObj.reservationFeeAmount ||
              0,
          );

          const grossInitial = Number(
            embedded.grossInitialAmount ||
              b.grossAmount ||
              (rawAdvance + rawDeposit + rawInitialCharges) ||
              0,
          );

          const initialTotal = Number(
            embedded.initialPaymentTotal ||
              b.totalAmount ||
              Math.max(grossInitial - rawCredit, 0) ||
              0,
          );

          resolvedInitialBreakdown = {
            advanceRent: rawAdvance,
            securityDeposit: rawDeposit,
            approvedInitialCharges: rawInitialCharges,
            reservationFeeCredit: rawCredit,
            grossInitialAmount: grossInitial,
            initialPaymentTotal: initialTotal,
          };
        }

        const visible = getVisibleBillSnapshot({
          ...b,
          initialPaymentBreakdown: resolvedInitialBreakdown || b.initialPaymentBreakdown,
        });

        const totalAmount = isInitialPayment
          ? Number(visible.totalAmount || resolvedInitialBreakdown?.initialPaymentTotal || b.totalAmount || 0)
          : visible.totalAmount;

        const grossAmount = isInitialPayment
          ? Number(visible.grossAmount || resolvedInitialBreakdown?.grossInitialAmount || b.grossAmount || 0)
          : visible.grossAmount;

        const paidAmount = isInitialPayment && b.status === "paid" && !b.paidAmount
          ? totalAmount
          : (b.paidAmount || 0);

        const reservationCreditApplied = isInitialPayment
          ? Number(b.reservationCreditApplied || resolvedInitialBreakdown?.reservationFeeCredit || 0)
          : (b.reservationCreditApplied || 0);

        return {
          id: b._id,
          billReference: formatBillReference(b),
          billingMonth: b.billingMonth,
          billingCycleStart: b.billingCycleStart,
          billingCycleEnd: b.billingCycleEnd,
          dueDate: visible.dueDate,
          issuedAt: visible.issuedAt,
          utilityCycleStart: b.utilityCycleStart || null,
          utilityCycleEnd: b.utilityCycleEnd || null,
          utilityReadingDate: b.utilityReadingDate || null,
          utilityPeriodId: null,
          additionalCharges: b.additionalCharges || [],
          charges: visible.charges,
          totalAmount,
          grossAmount,
          reservationCreditApplied,
          paidAmount,
          remainingAmount: visible.remainingAmount,
          status: visible.status,
          proRataDays: b.proRataDays,
          isFirstCycleBill: !!b.isFirstCycleBill,
          billType: b.billType || "monthly",
          structuredWorkflowVersion: b.structuredWorkflowVersion || null,
          pricingSnapshotVersion: b.pricingSnapshotVersion || null,
          initialPaymentBreakdown: resolvedInitialBreakdown || b.initialPaymentBreakdown || null,
          room: b.roomId?.name || "N/A",
          branch: b.branch,
          paymentProof: b.paymentProof || { verificationStatus: "none" },
          paymentFlow: buildBillPaymentFlow(b, visible),
          penaltyDetails: b.penaltyDetails || { daysLate: 0 },
          delivery: b.delivery || {},
          pdfPath: b.pdfPath || null,
          pdfAvailable: Boolean(b.pdfPath),
          pdfGeneratedAt: b.pdfGeneratedAt || null,
          createdAt: b.createdAt,
          utilityBreakdowns,
        };
      }),
    );

    res.json({
      bills: billResponses,
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomReadiness = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch =
      admin.isOwner && req.query.branch ? req.query.branch : (req.branchFilter || admin.branch);
    const roomFilter = { isArchived: false };
    if (branch) roomFilter.branch = branch;

    const rooms = await Room.find(roomFilter)
      .select("name roomNumber branch type")
      .sort({ name: 1 })
      .lean();

    const readiness = await Promise.all(rooms.map((room) => getRoomPublishState(room)));
    const cycleSource = readiness.find((entry) => entry.electricityPeriod || entry.waterPeriod);

    res.json({
      cycleStart:
        cycleSource?.electricityPeriod?.startDate ||
        cycleSource?.waterPeriod?.startDate ||
        null,
      cycleEnd:
        cycleSource?.electricityPeriod?.endDate ||
        cycleSource?.waterPeriod?.endDate ||
        null,
      rooms: readiness.map((entry) => ({
        roomId: entry.roomId,
        roomName: entry.roomName,
        branch: entry.branch,
        type: entry.type,
        waterApplicable: entry.waterApplicable,
        draftBillCount: entry.draftBillCount,
        issuedBillCount: entry.issuedBillCount,
        electricityStatus: entry.electricityStatus,
        waterStatus: entry.waterStatus,
        isReadyToPublish: entry.isReadyToPublish,
        publishState: entry.publishState,
        blockingReason: entry.blockingReason,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getMyUtilityBreakdownByBillId = async (req, res, next) => {
  try {
    const { billId, utilityType } = req.params;
    if (!["electricity", "water"].includes(utilityType)) {
      return res.status(400).json({ error: "Invalid utility type" });
    }

    const { dbUser, bill } = await getTenantBillForRequest(req, billId);
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (!isUtilityChargeVisible(bill, utilityType)) {
      return res.status(404).json({ error: `No ${utilityType} breakdown found for this bill` });
    }
    const breakdown = await buildTenantUtilityBreakdown({ dbUser, bill, utilityType });
    if (!breakdown) {
      return res.status(404).json({ error: `No ${utilityType} breakdown found for this bill` });
    }

    return res.json(breakdown);
  } catch (error) {
    next(error);
  }
};

export const getConsolidatedBillingMonitorAction = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const branch = admin.isOwner && req.query.branch ? req.query.branch : (req.branchFilter || admin.branch);
    const { month, status, search } = req.query;

    const queryFilter = { isArchived: false, status: { $ne: "draft" } };
    if (branch && ["gil-puyat", "guadalupe"].includes(branch)) {
      queryFilter.branch = branch;
    }

    if (month) {
      const parsedMonth = dayjs(month, ["YYYY-MM", "YYYY-MM-DD"]);
      if (parsedMonth.isValid()) {
        const startOfMonth = parsedMonth.startOf("month").toDate();
        const endOfMonth = parsedMonth.endOf("month").toDate();
        queryFilter.billingMonth = { $gte: startOfMonth, $lte: endOfMonth };
      }
    }

    if (status && status !== "all") {
      if (status === "overdue") {
        queryFilter.$or = [
          { status: "overdue" },
          { dueDate: { $lt: new Date() }, status: { $in: ["sent", "generated", "partially_paid"] } },
        ];
      } else {
        queryFilter.status = status;
      }
    }

    const bills = await Bill.find(queryFilter)
      .populate("userId", "firstName lastName email avatar profilePicture")
      .populate("roomId", "name roomNumber branch type")
      .populate("reservationId", "reservationCode")
      .sort({ billingMonth: -1, createdAt: -1 })
      .lean();

    let records = bills.map((b) => {
      const visible = getVisibleBillSnapshot(b);
      const tenantName = b.userId
        ? `${b.userId.firstName || ""} ${b.userId.lastName || ""}`.trim() || "Tenant"
        : "Tenant";
      const roomName = b.roomId
        ? b.roomId.name || b.roomId.roomNumber || "-"
        : "-";
      const rentCharge = Number(b.charges?.rent || b.rentAmount || 0);
      const electricityCharge = Number(b.charges?.electricity || b.electricityAmount || 0);
      const waterCharge = Number(b.charges?.water || b.waterAmount || 0);
      const penaltyCharge = Number(b.charges?.penalty || 0);
      const applianceFees = Number(b.charges?.applianceFees || 0);
      const corkageFees = Number(b.charges?.corkageFees || 0);
      const totalAmount = Number(visible.totalAmount || b.totalAmount || 0);
      const paidAmount = Number(b.paidAmount || 0);
      const remainingBalance = Math.max(0, totalAmount - paidAmount);

      let effectiveStatus = visible.status || b.status || "pending";
      if (remainingBalance === 0 && totalAmount > 0) {
        effectiveStatus = "paid";
      } else if (paidAmount > 0 && remainingBalance > 0) {
        effectiveStatus = "partially_paid";
      } else if (b.dueDate && new Date(b.dueDate) < new Date() && effectiveStatus !== "paid") {
        effectiveStatus = "overdue";
      }

      return {
        id: b._id,
        billReference: b.billReference || formatBillReference(b._id),
        tenantId: b.userId?._id || null,
        tenantName,
        tenantEmail: b.userId?.email || "",
        avatar: b.userId?.avatar || b.userId?.profilePicture || null,
        roomId: b.roomId?._id || null,
        roomName,
        branch: b.branch || b.roomId?.branch || "-",
        reservationCode: b.reservationId?.reservationCode || "-",
        billingMonth: b.billingMonth ? dayjs(b.billingMonth).format("MMM YYYY") : "-",
        rawMonth: b.billingMonth,
        dueDate: b.dueDate,
        billingCycleStart: b.billingCycleStart || null,
        billingCycleEnd: b.billingCycleEnd || null,
        rentCycleRange:
          b.billingCycleStart && b.billingCycleEnd
            ? `${dayjs(b.billingCycleStart).format("MMM DD")} – ${dayjs(b.billingCycleEnd).format("MMM DD, YYYY")}`
            : (b.billingMonth ? dayjs(b.billingMonth).format("MMM YYYY") : "-"),
        utilityCycleStart: b.utilityCycleStart || null,
        utilityCycleEnd: b.utilityCycleEnd || null,
        utilityCycleRange:
          b.utilityCycleStart && b.utilityCycleEnd
            ? `${dayjs(b.utilityCycleStart).format("MMM DD")} – ${dayjs(b.utilityCycleEnd).format("MMM DD")}`
            : "-",
        rent: rentCharge,
        electricity: electricityCharge,
        water: waterCharge,
        penalty: penaltyCharge,
        additionalCharges: applianceFees + corkageFees,
        totalAmount,
        paidAmount,
        remainingBalance,
        status: effectiveStatus,
        sentAt: b.sentAt || null,
        paymentDate: b.paymentDate || null,
      };

    });

    if (search) {
      const q = search.toLowerCase();
      records = records.filter(
        (r) =>
          r.tenantName.toLowerCase().includes(q) ||
          r.roomName.toLowerCase().includes(q) ||
          r.tenantEmail.toLowerCase().includes(q) ||
          r.billReference.toLowerCase().includes(q),
      );
    }

    const totalBilled = records.reduce((sum, r) => sum + r.totalAmount, 0);
    const totalCollected = records.reduce((sum, r) => sum + r.paidAmount, 0);
    const totalOutstanding = records.reduce((sum, r) => sum + r.remainingBalance, 0);
    const paidCount = records.filter((r) => r.status === "paid").length;
    const partialCount = records.filter((r) => r.status === "partially_paid").length;
    const overdueCount = records.filter((r) => r.status === "overdue").length;

    res.json({
      success: true,
      kpis: {
        totalRecords: records.length,
        totalBilled,
        totalCollected,
        totalOutstanding,
        paidCount,
        partialCount,
        overdueCount,
        collectionRate: records.length ? Math.round((paidCount / records.length) * 100) : 0,
      },
      records,
    });
  } catch (error) {
    next(error);
  }
};

