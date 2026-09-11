import dayjs from "dayjs";
import { Bill, Reservation, Room } from "../../models/index.js";
import logger from "../../middleware/logger.js";
import {
  getAdminInfo,
  fetchBills,
  RoomBill,
  loadRentReservationForAdmin,
  buildRentBillDraft,
  formatRentBillPreview,
  finalizeRentBill,
  formatBill,
  summarizeRentTenantRows,
  formatActiveRentTenant,
  resolveRentCycleForBillingMonth,
  buildRentDuplicateFilter,
  parseRequiredDate,
  suggestRent,
  getReservationRecurringFees,
  readMoveInDate,
  CURRENT_RESIDENT_STATUS_QUERY,
  getReservationBillingContext,
  computeWaterShare,
  r2,
  roundMoney,
  syncBillAmounts,
  getRoomPublishState,
  buildPublishResultFromPeriod,
} from "./_helpers.js";
import { sendDraftUtilityBills } from "../../utils/utilityBillFlow.js";
import { queuePublishedBillUtilityNotifications, deliverUtilityNotification } from '../../services/notifications/utilityNotificationDelivery.js';
import { createMilestoneSubInvoices } from "../../services/milestoneInvoiceService.js";
import { executeLatePenaltyCron } from "../../services/penaltyEngineService.js";
import { getTenantBillsInPriorityOrder } from "../../services/billingPriorityService.js";
import { logBillingAudit } from "../../utils/billingAudit.js";

export const getRentBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const rawBranch = req.query.branch;
    const requestedBranch =
      rawBranch && rawBranch !== "all" && rawBranch !== "undefined" && rawBranch !== "null"
        ? rawBranch
        : null;
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : null);
    const filter = {
      isArchived: false,
      "charges.rent": { $gt: 0 },
    };

    if (branch) filter.branch = branch;
    if (!branch && !admin.isOwner) {
      return res.status(403).json({ error: "Invalid branch" });
    }
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.tenantId) filter.userId = req.query.tenantId;

    const result = await fetchBills(filter, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getRentBillableTenants = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const rawBranch = req.query.branch;
    const requestedBranch =
      rawBranch && rawBranch !== "all" && rawBranch !== "undefined" && rawBranch !== "null"
        ? rawBranch
        : null;
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : null);
    if (!branch && !admin.isOwner) {
      return res.status(403).json({ error: "Invalid branch" });
    }

    const monthParam = req.query.month;
    const isAllTime = monthParam === "all";
    const month = (!monthParam || isAllTime) ? dayjs() : dayjs(monthParam, "YYYY-MM", true);
    if (monthParam && !isAllTime && !month.isValid()) {
      return res.status(400).json({ error: "Invalid month format — use YYYY-MM", code: "INVALID_MONTH" });
    }
    const rooms = await Room.find({
      ...(branch ? { branch } : {}),
      isArchived: false,
    }).select("_id branch").lean();
    const roomIds = rooms.map((room) => room._id);

    const reservations = await Reservation.find({
      roomId: { $in: roomIds },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch type capacity currentOccupancy price monthlyPrice")
      .sort({ moveInDate: 1 });

    const reservationCycles = reservations.map((reservation) => {
      try {
        return {
          reservation,
          cycle: resolveRentCycleForBillingMonth(reservation, month.format("YYYY-MM")),
          validationError: "",
        };
      } catch (error) {
        return {
          reservation,
          cycle: null,
          validationError: error.message || "Missing billing data",
        };
      }
    });

    let existingBills = [];
    if (isAllTime) {
      const reservationIds = reservations.map((r) => r._id);
      existingBills = await Bill.find({
        reservationId: { $in: reservationIds },
        isArchived: false,
        "charges.rent": { $gt: 0 },
      })
        .sort({ billingMonth: -1, createdAt: -1 })
        .select("_id reservationId status dueDate totalAmount pdfPath billingMonth")
        .lean();
    } else {
      const billFilters = reservationCycles
        .filter((entry) => entry.cycle)
        .map((entry) =>
          buildRentDuplicateFilter(entry.reservation._id, entry.cycle, month.format("YYYY-MM")),
        );
      existingBills =
        billFilters.length > 0
          ? await Bill.find({ $or: billFilters })
              .select("_id reservationId status dueDate totalAmount pdfPath")
              .lean()
          : [];
    }

    const existingByReservation = new Map();
    for (const bill of existingBills) {
      const resId = String(bill.reservationId);
      if (!existingByReservation.has(resId)) {
        existingByReservation.set(resId, bill);
      }
    }
    const search = String(req.query.search || "").trim().toLowerCase();

    const tenants = reservationCycles
      .map(({ reservation, cycle, validationError }) =>
        formatActiveRentTenant(
          reservation,
          existingByReservation.get(String(reservation._id)),
          cycle,
          validationError,
        ),
      )
      .filter((tenant) => {
        if (!search) return true;
        return [tenant.tenantName, tenant.email, tenant.roomName, tenant.branch]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

    res.json({
      count: tenants.length,
      summary: summarizeRentTenantRows(tenants),
      tenants,
    });
  } catch (error) {
    next(error);
  }
};

export const getRentBillPreview = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      reservationId,
      billingMonth,
      dueDate,
      rentAmount,
      branch: requestedBranch,
    } = req.body || {};
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const reservation = await loadRentReservationForAdmin({ reservationId, branch });
    const draft = await buildRentBillDraft({
      reservation,
      branch,
      billingMonth,
      dueDate,
      rentAmount,
      allowDuplicate: true,
    });

    res.json({
      success: true,
      preview: formatRentBillPreview({
        reservation,
        bill: draft.bill,
        duplicate: draft.duplicate,
        cycle: draft.cycle,
      }),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateRentBill = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      reservationId,
      billingMonth,
      dueDate,
      rentAmount,
      branch: requestedBranch,
    } = req.body || {};

    if (!reservationId) {
      return res.status(400).json({ error: "No active tenant/contract found." });
    }

    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const reservation = await loadRentReservationForAdmin({ reservationId, branch });
    const draft = await buildRentBillDraft({
      reservation,
      branch,
      billingMonth,
      dueDate,
      rentAmount,
      notes: req.body.notes || "",
    });
    const { bill, delivery } = await finalizeRentBill({
      req,
      admin,
      reservation,
      draft,
    });

    const hasDeliveryFailure =
      delivery.email.status === "failed" || delivery.notification.status === "failed";
    const hasPdfFailure = delivery.pdf?.status === "failed";
    const warning = hasDeliveryFailure
      ? "Bill created, but email notification failed."
      : hasPdfFailure
        ? "Bill created, but PDF generation failed."
        : null;

    res.status(201).json({
      success: true,
      message: warning || "Rent bill generated successfully.",
      bill: formatBill(bill),
      delivery,
      warning,
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        error: "Duplicate bill exists",
        code: error.code,
        bill: error.bill ? formatBill(error.bill) : null,
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateAllRentBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      billingMonth,
      month,
      dueDate,
      branch: requestedBranch,
    } = req.body || {};
    const targetMonth = billingMonth || month;
    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    parseRequiredDate(targetMonth, "Billing month");

    const rooms = await Room.find({ branch, isArchived: false }).select("_id").lean();
    const reservations = await Reservation.find({
      roomId: { $in: rooms.map((room) => room._id) },
      status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .populate("userId", "firstName lastName email")
      .populate("roomId", "name roomNumber branch type price monthlyPrice")
      .sort({ moveInDate: 1 });

    const summary = {
      totalTenants: reservations.length,
      alreadyBilled: 0,
      missingData: 0,
      readyToGenerate: 0,
      generated: 0,
      failed: 0,
    };
    const bills = [];
    const warnings = [];
    const errors = [];

    for (const reservation of reservations) {
      const tenantName =
        [reservation.userId?.firstName, reservation.userId?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Tenant";

      try {
        const draft = await buildRentBillDraft({
          reservation,
          branch,
          billingMonth: targetMonth,
          dueDate,
          rentAmount: null,
          notes: "Generated through rent batch billing.",
        });
        summary.readyToGenerate += 1;

        const result = await finalizeRentBill({
          req,
          admin,
          reservation,
          draft,
        });
        summary.generated += 1;
        bills.push(formatBill(result.bill));

        if (result.delivery.email?.status === "failed") {
          warnings.push(`${tenantName}: email notification failed.`);
        }
        if (result.delivery.pdf?.status === "failed") {
          warnings.push(`${tenantName}: PDF generation failed.`);
        }
      } catch (error) {
        if (error.statusCode === 409) {
          summary.alreadyBilled += 1;
          continue;
        }
        if (["NO_ACTIVE_TENANT", "INVALID_RENT_AMOUNT", "INVALID_DUE_DATE"].includes(error.code)) {
          summary.missingData += 1;
          errors.push({ tenantName, error: error.message });
          continue;
        }

        summary.failed += 1;
        errors.push({ tenantName, error: error.message || "Failed to generate bill" });
      }
    }

    if (summary.generated > 0) {
      await logBillingAudit(req, {
        admin,
        action: "Generated Monthly Rent Bills",
        severity: "info",
        entityType: "billing",
        branch,
        details: `Generated ${summary.generated} rent bill(s) for branch ${branch} (Billing Month: ${targetMonth})`,
        metadata: {
          branch,
          targetMonth,
          summary,
          generatedCount: summary.generated,
        },
      });
    }

    const warning = warnings.length > 0
      ? "Bill created, but email notification failed."
      : null;

    res.status(summary.generated > 0 ? 201 : 200).json({
      success: true,
      message:
        summary.generated > 0
          ? warning || "Bills generated and sent successfully."
          : "No rent bills generated.",
      summary,
      bills,
      warnings,
      errors,
      warning,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateBatchRentBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      reservationIds = [],
      billingMonth,
      dueDate,
      branch: requestedBranch,
    } = req.body || {};

    if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
      return res.status(400).json({ error: "reservationIds array is required and cannot be empty." });
    }

    const branch =
      req.branchFilter || (admin.isOwner && requestedBranch ? requestedBranch : admin.branch);
    if (!branch) {
      return res.status(400).json({ error: "Branch is required." });
    }

    const summary = {
      total: reservationIds.length,
      generated: 0,
      failed: 0,
      errors: [],
    };
    const bills = [];
    const warnings = [];

    const CHUNK_SIZE = 10;
    for (let i = 0; i < reservationIds.length; i += CHUNK_SIZE) {
      const chunk = reservationIds.slice(i, i + CHUNK_SIZE);
      const settledResults = await Promise.allSettled(
        chunk.map(async (reservationId) => {
          const reservation = await loadRentReservationForAdmin({ reservationId, branch });
          const draft = await buildRentBillDraft({
            reservation,
            branch,
            billingMonth,
            dueDate,
            rentAmount: null,
            notes: "Generated through multi-select rent batch billing.",
          });

          const result = await finalizeRentBill({
            req,
            admin,
            reservation,
            draft,
          });

          const tenantName =
            [reservation.userId?.firstName, reservation.userId?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || "Tenant";

          const itemWarnings = [];
          if (result.delivery?.email?.status === "failed") {
            itemWarnings.push(`${tenantName}: email notification failed.`);
          }
          if (result.delivery?.pdf?.status === "failed") {
            itemWarnings.push(`${tenantName}: PDF generation failed.`);
          }

          return {
            bill: formatBill(result.bill),
            warnings: itemWarnings,
          };
        })
      );

      settledResults.forEach((resItem, idx) => {
        const reservationId = chunk[idx];
        if (resItem.status === "fulfilled") {
          summary.generated += 1;
          bills.push(resItem.value.bill);
          if (resItem.value.warnings?.length) {
            warnings.push(...resItem.value.warnings);
          }
        } else {
          summary.failed += 1;
          summary.errors.push({
            reservationId,
            error: resItem.reason?.message || "Failed to generate bill",
          });
        }
      });
    }

    if (summary.generated > 0) {
      await logBillingAudit(req, {
        admin,
        action: "Generated Batch Rent Bills",
        severity: "info",
        entityType: "billing",
        branch,
        details: `Generated ${summary.generated} rent bill(s) via batch selection for branch ${branch} (Billing Month: ${billingMonth})`,
        metadata: {
          branch,
          billingMonth,
          summary,
          generatedCount: summary.generated,
        },
      });
    }

    return res.json({
      success: true,
      summary,
      bills,
      warnings,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
};

export const generateBulkBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const {
      billingMonth,
      dueDate,
      defaultCharges = {},
    } = req.body;

    const branch =
      admin.isOwner && req.body.branch ? req.body.branch : admin.branch;
    if (!branch)
      return res.status(400).json({ error: "Branch is required" });

    const monthDate = dayjs(billingMonth || undefined);
    const monthStart = monthDate.startOf("month").toDate();
    const monthEnd = monthDate.endOf("month").toDate();

    const rooms = await Room.find({ branch, isArchived: false });

    const summary = {
      roomsProcessed: 0,
      roomsSkipped: 0,
      billsGenerated: 0,
      errors: [],
    };

    for (const room of rooms) {
      const existing = await RoomBill.findOne({
        roomId: room._id,
        billingMonth: monthStart,
        isArchived: false,
      });
      if (existing) {
        summary.roomsSkipped++;
        continue;
      }

      const checkedInReservations = await Reservation.find({
        roomId: room._id,
        status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
        isArchived: { $ne: true },
      }).populate("userId", "firstName lastName email");

      if (checkedInReservations.length === 0) {
        summary.roomsSkipped++;
        continue;
      }

      const tenantInfos = [];
      const seenUserIds = new Set();

      for (const reservation of checkedInReservations) {
        if (!reservation?.userId) continue;
        if (seenUserIds.has(String(reservation.userId._id))) continue;
        seenUserIds.add(String(reservation.userId._id));

        const moveInDate = readMoveInDate(reservation) || monthStart;
        const rent = suggestRent(reservation, room, moveInDate);
        const customCharges =
          getReservationRecurringFees(reservation).additionalCharges;
        const tenantStart = dayjs(
          Math.max(dayjs(moveInDate).valueOf(), dayjs(monthStart).valueOf()),
        );
        const tenantEnd = dayjs(
          Math.min(Date.now(), dayjs(monthEnd).add(1, "day").valueOf()),
        );
        const daysInRoom =
          Math.max(1, (tenantEnd.diff(tenantStart, "day", true) | 0) || 1);

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

      if (tenantInfos.length === 0) {
        summary.roomsSkipped++;
        continue;
      }

      try {
        const roomCharges = {
          electricity: Number(defaultCharges.electricity) || 0,
          water: Number(defaultCharges.water) || 0,
        };
        const totalUtilities = roomCharges.electricity + roomCharges.water;
        const totalOccupantDays = tenantInfos.reduce(
          (s, t) => s + t.daysInRoom,
          0,
        );

        const generatedBills = [];
        const tenantBreakdown = [];

        for (const tenant of tenantInfos) {
          const share = tenant.daysInRoom / totalOccupantDays;
          const billingContext = tenant.reservationId
            ? await getReservationBillingContext(
                tenant.reservationId,
                null,
                monthStart,
              )
            : null;
          const cycleBillingMonth =
            billingContext?.cycle?.billingMonth || monthStart;

          const dupeFilter = {
            userId: tenant.userId,
            billingMonth: cycleBillingMonth,
            isArchived: false,
          };
          if (tenant.reservationId)
            dupeFilter.reservationId = tenant.reservationId;
          if (await Bill.findOne(dupeFilter)) continue;

          const te = r2(roomCharges.electricity * share);
          const tw = computeWaterShare(
            room.type,
            roomCharges.water,
            tenantInfos.length,
          );
          const utilityShare = te + tw;

          const tenantCustomCharges = tenant.customCharges || [];
          const customChargesTotal = tenantCustomCharges.reduce(
            (sum, c) => sum + (Number(c.amount) || 0),
            0,
          );
          const grossAmount = roundMoney(tenant.rent + utilityShare + customChargesTotal);
          const reservationCreditApplied = 0;
          const cycleDueDate = dueDate
            ? dayjs(dueDate).toDate()
            : billingContext?.cycle?.dueDate || monthDate.add(1, "month").date(15).toDate();

          const bill = new Bill({
            reservationId: tenant.reservationId,
            userId: tenant.userId,
            branch: room.branch,
            roomId: room._id,
            billingMonth: billingContext?.cycle?.billingMonth || monthStart,
            billingCycleStart: billingContext?.cycle?.billingCycleStart || monthStart,
            billingCycleEnd: billingContext?.cycle?.billingCycleEnd || cycleDueDate,
            dueDate: cycleDueDate,
            isFirstCycleBill: !!billingContext?.isFirstCycleBill,
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
            grossAmount,
            reservationCreditApplied,
            totalAmount: grossAmount,
            remainingAmount: grossAmount,
            status: "pending",
          });
          syncBillAmounts(bill);
          await bill.save();
          if (billingContext?.reservation && reservationCreditApplied > 0) {
            billingContext.reservation.reservationCreditConsumedAt = new Date();
            billingContext.reservation.reservationCreditAppliedBillId = bill._id;
            await billingContext.reservation.save();
          }
          generatedBills.push(bill._id);
          tenantBreakdown.push({
            userId: tenant.userId,
            reservationId: tenant.reservationId,
            daysInRoom: tenant.daysInRoom,
            proRataShare: Math.round(share * 10000) / 10000,
            rent: tenant.rent,
            utilityShare,
            grossAmount,
            reservationCreditApplied,
            totalAmount: bill.totalAmount,
            billId: bill._id,
          });
        }

        if (generatedBills.length > 0) {
          const roomBill = new RoomBill({
            roomId: room._id,
            branch: room.branch,
            billingMonth: monthStart,
            dueDate: dueDate ? dayjs(dueDate).toDate() : null,
            charges: roomCharges,
            totalCharges: totalUtilities,
            generatedBills,
            status: "generated",
            generatedBy: req.user?._id || null,
            tenantBreakdown,
          });
          await roomBill.save();
          await Bill.updateMany(
            { _id: { $in: generatedBills } },
            { $set: { roomBillId: roomBill._id } },
          );
          summary.billsGenerated += generatedBills.length;
        }

        summary.roomsProcessed++;
      } catch (roomErr) {
        logger.error(
          { err: roomErr, roomId: String(room._id) },
          "Bulk bill generation failed for room",
        );
        summary.errors.push({
          room: room.name,
          error: roomErr.message,
        });
      }
    }

    const statusCode = summary.billsGenerated > 0 ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: `Bulk generation complete: ${summary.billsGenerated} bills created across ${summary.roomsProcessed} rooms (${summary.roomsSkipped} skipped)`,
      summary,
    });
  } catch (error) {
    next(error);
  }
};

export const publishRoomBills = async (req, res, next) => {
  try {
    const admin = await getAdminInfo(req);
    const room = await Room.findById(req.params.roomId).lean();
    if (!room || room.isArchived) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (!admin.isOwner && room.branch !== (req.branchFilter || admin.branch)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const readiness = await getRoomPublishState(room);
    if (readiness.draftBillCount === 0) {
      if (readiness.publishState === "issued" && readiness.issuedBillCount > 0) {
        const deliveries = [];
        for (const bill of readiness.cycleBills || []) {
          if (bill.status === 'draft') continue;
          const ids = await queuePublishedBillUtilityNotifications(bill);
          deliveries.push(...await Promise.all(ids.map(deliverUtilityNotification)));
        }
        return res.json({
          success: true,
          roomId: room._id,
          roomName: readiness.roomName,
          published: 0,
          deliveries,
          message: "Invoices for this cycle were already published.",
        });
      }
      return res.status(409).json({ error: "No draft bills found for this room." });
    }
    if (!readiness.isReadyToPublish) {
      return res.status(409).json({ error: readiness.blockingReason });
    }

    const referencePeriod = readiness.electricityPeriod || readiness.waterPeriod;
    const result = buildPublishResultFromPeriod(readiness.electricityPeriod || readiness.waterPeriod);
    const sendResult = await sendDraftUtilityBills({
      bills: readiness.draftBills,
      period: referencePeriod,
      result,
    });

    res.json({
      success: true,
      roomId: room._id,
      roomName: readiness.roomName,
      published: sendResult.sent,
      issuedAt: sendResult.issuedAt,
      dueDate: sendResult.dueDate,
      deliveries: sendResult.deliveries,
      partialFailures: sendResult.deliveries.filter(
        (entry) => entry.pdfError || entry.emailError || entry.notificationError,
      ),
    });
  } catch (error) {
    next(error);
  }
};

// SCENARIO 2 CONTROLLER ACTIONS

/**
 * POST /api/billing/milestone-arrangement
 */
export const createMilestoneArrangementAction = async (req, res, next) => {
  try {
    const { parentBillId, milestones } = req.body;
    const admin = await getAdminInfo(req);
    const parentBill = await Bill.findById(parentBillId).select("branch");
    if (!parentBill) return res.status(404).json({ error: "Bill not found" });
    if (!admin.isOwner && parentBill.branch !== admin.branch) {
      return res.status(403).json({ error: "Bill not found" });
    }
    const subInvoices = await createMilestoneSubInvoices(parentBillId, milestones, req.user.uid);
    res.json({
      success: true,
      message: `Created ${subInvoices.length} milestone sub-invoices. Master bill voided.`,
      subInvoices,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/late-penalties/run
 */
export const runLatePenaltyJobAction = async (req, res, next) => {
  try {
    const result = await executeLatePenaltyCron();
    res.json({
      success: true,
      message: `Processed late penalties for ${result.processedCount} overdue bills.`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/priority-queue
 */
export const getBillingPriorityQueueAction = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id || req.query.tenantId;
    const priorityBills = await getTenantBillsInPriorityOrder(userId);
    res.json({
      success: true,
      count: priorityBills.length,
      bills: priorityBills,
    });
  } catch (error) {
    next(error);
  }
};

