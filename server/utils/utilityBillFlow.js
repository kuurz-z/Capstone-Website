import dayjs from "dayjs";
import mongoose from "mongoose";
import { upsertWaterAllocation, waterAllocationsForPeriod, waterPeriodSent } from '../services/billing/waterAllocations.js';
import { formatManilaDate, getManilaDayjs } from "./dateUtils.js";
import { Bill, Reservation, Room, User, UtilityFinalization, UtilityPeriod } from "../models/index.js";
import {
  sendBillGeneratedEmail,
  sendUtilityChargeAvailableEmail,
} from "../config/email.js";
import {
  getUtilityDispatchEntry,
  getReservationCreditAvailable,
  resolveCurrentBillingCycle,
  getUtilityCycleFromPeriod,
  getUtilityDueDate,
  getUtilityIssueDate,
  getVisibleBillCharges,
  roundMoney,
  syncBillAmounts,
} from "./billingPolicy.js";
import { notify } from "./notificationService.js";
import { generateBillPdf } from "./pdfGenerator.js";
import { recordBillPdfGeneration } from "../services/billPdfCache.js";
import {
  CURRENT_RESIDENT_STATUS_QUERY,
  readMoveInDate,
} from "./lifecycleNaming.js";

const UTILITY_BILL_SEND_CONCURRENCY = Math.max(
  1,
  Number(process.env.UTILITY_BILL_SEND_CONCURRENCY || 4),
);

function utilitySupplementIdentity(utilityType,periodId,reservationId,tenantId) {
  return {[`${utilityType}SupplementKey`]:`${utilityType}:${periodId}:${reservationId}:${tenantId}`};
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const normalizedConcurrency = Math.max(1, Number(concurrency) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(normalizedConcurrency, Math.max(items.length, 1)) },
      () => worker(),
    ),
  );

  return results;
}

function getUtilityChargeField(utilityType) {
  return utilityType === "water" ? "water" : "electricity";
}

function setUtilityDispatchEntry(bill, utilityType, updates = {}) {
  const current = getUtilityDispatchEntry(bill, utilityType);
  bill.utilityDispatch = bill.utilityDispatch || {};
  bill.utilityDispatch[utilityType] = {
    state: "draft",
    periodId: null,
    publishedAt: null,
    issuedAt: null,
    dueDate: null,
    amount: Number(current.amount || bill?.charges?.[utilityType] || 0),
    ...current,
    ...updates,
  };
}

async function countReservationRentCycles(reservationId, excludeBillId = null) {
  return Bill.countDocuments({
    reservationId,
    isArchived: false,
    "charges.rent": { $gt: 0 },
    ...(excludeBillId ? { _id: { $ne: excludeBillId } } : {}),
  });
}

export async function getReservationBillingContextForUser(
  userId,
  referenceDate = new Date(),
) {
  const reservation = await Reservation.findOne({
    userId,
    status: { $in: CURRENT_RESIDENT_STATUS_QUERY },
    isArchived: { $ne: true },
  }).sort({ moveInDate: 1 });

  if (!readMoveInDate(reservation)) return null;

  const existingCount = await countReservationRentCycles(reservation._id);

  return {
    reservation,
    existingCount,
    cycle: resolveCurrentBillingCycle(readMoveInDate(reservation), referenceDate),
    isFirstCycleBill: existingCount === 0,
    creditAvailable: getReservationCreditAvailable(reservation),
  };
}

export async function getReservationBillingContextForBill(
  bill,
  referenceDate = null,
) {
  if (!bill?.reservationId) return null;

  const reservation = await Reservation.findById(bill.reservationId);
  const moveInDate = readMoveInDate(reservation);
  if (!moveInDate) return null;

  const existingCount = await countReservationRentCycles(
    reservation._id,
    bill._id,
  );

  return {
    reservation,
    existingCount,
    cycle: resolveCurrentBillingCycle(
      moveInDate,
      referenceDate ||
        bill?.billingCycleStart ||
        bill?.billingMonth ||
        bill?.utilityCycleEnd ||
        bill?.utilityCycleStart ||
        bill?.createdAt ||
        new Date(),
    ),
    isFirstCycleBill: existingCount === 0,
    creditAvailable: getReservationCreditAvailable(reservation),
  };
}

export async function upsertDraftBillsForUtility({
  period,
  room,
  tenantSummaries,
  utilityType,
  session = null,
}) {
  const chargeField = getUtilityChargeField(utilityType);
  const updatedSummaries = [];
  const utilityCycle = getUtilityCycleFromPeriod(period);

  // Reconciliation tolerance for the "already finalized on transfer day" check.
  const RECONCILIATION_TOLERANCE = 1; // ₱1 — Hamilton-cent rounding across paths.
  const periodId = period?._id || period?.id || null;

  // Any transfer-day finalizations for this period? (electricity only today.)
  // A tenant with a finalization row was ALREADY billed for their source-room
  // share on the transfer_settlement Bill — they still participated fully in
  // the canonical allocation above (their moveOut reading bounds their
  // segments), we just must NOT create a second draft Bill for them here.
  let finalizationQuery = periodId
    ? UtilityFinalization.find({
        utilityPeriodId: periodId,
        utilityType,
        isArchived: { $ne: true },
      })
    : null;
  if (finalizationQuery && session) finalizationQuery = finalizationQuery.session(session);
  const finalizations = finalizationQuery ? await finalizationQuery.lean() : [];
  const finalizationByReservation = new Map(
    finalizations.map((f) => [String(f.reservationId), f]),
  );

  for (const summary of tenantSummaries || []) {
    const billingContext = utilityType === 'water' && summary.reservationId
      ? await getReservationBillingContextForBill({reservationId:summary.reservationId},period.endDate || period.startDate)
      : await getReservationBillingContextForUser(
      summary.tenantId,
      period?.endDate || period?.startDate || new Date(),
    );
    const billingMonth =
      billingContext?.cycle?.billingMonth || period.startDate;
    const reservationId = utilityType === 'water' ? summary.reservationId || billingContext?.reservation?._id || null : billingContext?.reservation?._id || null;

    // ── Transfer-day finalization: suppress the duplicate draft Bill ────────
    const finalization =
      finalizationByReservation.get(String(summary.reservationId || "")) ||
      finalizationByReservation.get(String(reservationId || ""));
    if (finalization) {
      const canonical = roundMoney(summary.billAmount || 0);
      const settled = roundMoney(finalization.settledAmount || 0);
      const variance = roundMoney(canonical - settled);
      const flagged = Math.abs(variance) > RECONCILIATION_TOLERANCE;
      // Record the reconciliation outcome on the finalization row; if it is
      // out of tolerance, flag the period for manual review (the period still
      // closes for co-occupants).
      const finalizationUpdate = UtilityFinalization.updateOne(
        { _id: finalization._id },
        {
          $set: {
            "reconciliation.periodSummaryAmount": canonical,
            "reconciliation.variance": variance,
            "reconciliation.reconciledAt": new Date(),
            "reconciliation.flagged": flagged,
          },
        },
      );
      if (session) finalizationUpdate.session(session);
      await finalizationUpdate;
      updatedSummaries.push({
        ...summary,
        billId: finalization.settlementBillId || null,
        settledOnTransfer: true,
        finalizedAmount: settled,
        reconciliationVariance: variance,
        reconciliationFlagged: flagged,
      });
      // NO draft Bill created/updated for this tenant.
      continue;
    }

    let billQuery = Bill.findOne({
      userId: summary.tenantId,
      reservationId,
      billingMonth,
      isArchived: false,
    });
    if (session) billQuery = billQuery.session(session);
    let bill = await billQuery;

    let supplementIdentity = null;
    let paidInvoiceId = null;
    if (bill?.status === 'paid' && (utilityType === 'water' ? !waterPeriodSent(bill, periodId) : getUtilityDispatchEntry(bill, utilityType).state !== 'sent')) {
      supplementIdentity = utilitySupplementIdentity(utilityType,periodId,reservationId,summary.tenantId);
      paidInvoiceId = bill._id;
      let supplementQuery = Bill.findOne(supplementIdentity);
      if (session) supplementQuery = supplementQuery.session(session);
      bill = await supplementQuery;
    }

    if (bill && (bill.status === 'paid' || (utilityType === 'water' ? waterPeriodSent(bill, periodId) : getUtilityDispatchEntry(bill, utilityType).state === "sent"))) {
      const error = new Error(
        `Cannot sync ${utilityType} charges because one or more bills were already sent.`,
      );
      error.statusCode = 409;
      throw error;
    }

    if (!bill) {
      bill = new Bill({
        ...(supplementIdentity || {}),
        ...(utilityType === 'electricity' && paidInvoiceId ? {parentInvoiceId:paidInvoiceId} : {}),
        reservationId,
        userId: summary.tenantId,
        branch: room.branch,
        roomId: room._id,
        billingMonth,
        billingCycleStart:
          supplementIdentity ? null : billingContext?.cycle?.billingCycleStart || period.startDate,
        billingCycleEnd:
          billingContext?.cycle?.billingCycleEnd ||
          period.endDate ||
          period.startDate,
        utilityCycleStart: utilityCycle.utilityCycleStart,
        utilityCycleEnd: utilityCycle.utilityCycleEnd,
        utilityReadingDate: utilityCycle.utilityReadingDate,
        dueDate: null,
        isFirstCycleBill: !!billingContext?.isFirstCycleBill,
        charges: {
          electricity: 0,
          rent: 0,
          water: 0,
          applianceFees: 0,
          corkageFees: 0,
          penalty: 0,
          discount: 0,
        },
        grossAmount: 0,
        reservationCreditApplied: 0,
        totalAmount: 0,
        remainingAmount: 0,
        status: "draft",
      });
    }

    if (utilityType === 'water') {
      upsertWaterAllocation(bill, {period, room, summary, legacyDispatch:getUtilityDispatchEntry(bill, 'water')});
    } else bill.charges[chargeField] = roundMoney(summary.billAmount || 0);
    setUtilityDispatchEntry(bill, utilityType, {
      state: "draft",
      periodId: period?._id || period?.id || null,
      publishedAt: null,
      issuedAt: null,
      dueDate: null,
      amount: roundMoney(summary.billAmount || 0),
    });
    bill.utilityCycleStart = utilityCycle.utilityCycleStart;
    bill.utilityCycleEnd = utilityCycle.utilityCycleEnd;
    bill.utilityReadingDate = utilityCycle.utilityReadingDate;
    syncBillAmounts(bill, { preserveStatus: true });
    await bill.save(session ? { session } : undefined);

    updatedSummaries.push({
      ...summary,
      billId: bill._id,
    });
  }

  return updatedSummaries;
}

export async function getDraftBillsForSummaryBillIds(tenantSummaries = []) {
  const billIds = tenantSummaries
    .map((summary) => summary.billId)
    .filter(Boolean);
  if (billIds.length === 0) return [];

  return Bill.find({
    _id: { $in: billIds },
    status: "draft",
    isArchived: false,
  }).populate("userId", "firstName lastName email");
}

function buildPdfBillingResult(result = {}) {
  return {
    totalRoomKwh: result.computedTotalUsage ?? 0,
    totalRoomCost: result.computedTotalCost ?? 0,
    ratePerKwh: result.ratePerUnit ?? 0,
    segments: (result.segments || []).map((segment) => ({
      ...segment,
      kwhConsumed: segment.unitsConsumed,
    })),
    tenantSummaries: (result.tenantSummaries || []).map((summary) => ({
      ...summary,
      totalKwh: summary.totalUsage,
    })),
  };
}

export async function sendDraftUtilityBills({ bills, period, result }) {
  const sentAt = new Date();
  const utilityCycle = getUtilityCycleFromPeriod(period);
  const issuedAt = getUtilityIssueDate({
    readingDate: utilityCycle.utilityReadingDate,
    finalizedAt: sentAt,
  });
  const dueDate = getUtilityDueDate(issuedAt);
  let sent = 0;
  const deliveries = [];
  const populatedBills = await Bill.populate(bills, [
    { path: "userId", select: "firstName lastName email" },
    { path: "roomId", select: "name roomNumber branch" },
  ]);
  const room = populatedBills[0]?.roomId
    ? await Room.findById(
        populatedBills[0].roomId._id || populatedBills[0].roomId,
      ).lean()
    : null;
  const billingResult = buildPdfBillingResult({
    ...result,
    ratePerUnit: period?.ratePerUnit,
  });

  for (let bill of populatedBills) {
    const billingContext = bill.reservationId
      ? await getReservationBillingContextForBill(
          bill,
          utilityCycle.utilityCycleEnd || issuedAt,
        )
      : null;
    const reservationCreditApplied = 0;

    const dispatchSession=bill.waterAllocations?.length || Number(bill.charges?.electricity)>0 ? await mongoose.startSession() : null;
    const persistDispatch=async()=>{
      if (dispatchSession) {
        bill=await Bill.findById(bill._id).session(dispatchSession).populate([{path:'userId',select:'firstName lastName email'},{path:'roomId',select:'name roomNumber branch'}]);
        if (!bill || bill.status!=='draft') throw Object.assign(new Error('This invoice changed while publishing. Refresh and use the period dispatch for remaining utility charges.'),{statusCode:409});
      }
    bill.reservationCreditApplied = 0;
    bill.billingMonth =
      billingContext?.cycle?.billingMonth ||
      bill.billingMonth ||
      period.startDate;
    bill.billingCycleStart =
      bill.electricitySupplementKey ? null : billingContext?.cycle?.billingCycleStart ||
      bill.billingCycleStart ||
      period.startDate;
    bill.billingCycleEnd =
      billingContext?.cycle?.billingCycleEnd ||
      bill.billingCycleEnd ||
      period.endDate ||
      period.startDate;
    bill.utilityCycleStart = utilityCycle.utilityCycleStart;
    bill.utilityCycleEnd = utilityCycle.utilityCycleEnd;
    bill.utilityReadingDate = utilityCycle.utilityReadingDate;
    bill.issuedAt = issuedAt;
    bill.dueDate = dueDate;
    bill.sentAt = sentAt;
    bill.status = "pending";
    bill.publicationState = "published"; // Phase 3: mark as published (tenant-visible)
    for (const type of ['electricity', 'water']) {
      if (Number(bill.charges?.[type] || 0) <= 0) continue;
      if (type === 'water' && bill.waterAllocations?.length) {
        for (const allocation of bill.waterAllocations) {
          if (allocation.state === 'draft') Object.assign(allocation, {state:'sent', publishedAt:sentAt, issuedAt, dueDate});
        }
      }
      setUtilityDispatchEntry(bill, type, {state:'sent', publishedAt:sentAt, issuedAt, dueDate});
    }
    // releasing: true — this is the actual draft->published transition for
    // this bill (see the releasedAt guard in services/billing/billingPolicy.js).
    syncBillAmounts(bill, { releasing: true });
    await bill.save(dispatchSession ? {session:dispatchSession} : undefined);
    };
    try {if(dispatchSession) await dispatchSession.withTransaction(persistDispatch);else await persistDispatch();}
    finally {if(dispatchSession) await dispatchSession.endSession();}

    if (billingContext?.reservation && reservationCreditApplied > 0) {
      billingContext.reservation.reservationCreditConsumedAt = sentAt;
      billingContext.reservation.reservationCreditAppliedBillId = bill._id;
      await billingContext.reservation.save();
    }

    const summary = (result?.tenantSummaries || []).find(
      (entry) => String(entry.billId) === String(bill._id),
    );
    if (summary) {
      summary.billId = bill._id;
    }

    const tenant = bill.userId
      ? await User.findById(bill.userId._id || bill.userId).lean()
      : null;
    let pdfPath = bill.pdfPath || null;
    let pdfError = null;
    let emailError = null;
    let notificationError = null;

    try {
      const {buildTenantUtilityBreakdown} = await import('../controllers/billing/_helpers.js');
      pdfPath = await generateBillPdf({
        waterBreakdown: Number(bill.charges?.water || 0) > 0
          ? await buildTenantUtilityBreakdown({dbUser:{_id:bill.userId?._id || bill.userId},bill,utilityType:'water'}) : null,
        bill: {
          ...(bill.toObject ? bill.toObject() : bill),
          userId: bill.userId?._id || bill.userId,
        },
        billingResult,
        period,
        room: room || bill.roomId,
        tenant: tenant || bill.userId,
      });
      await recordBillPdfGeneration(bill, pdfPath);
    } catch (error) {
      pdfError = error.message;
    }

    const tenantName =
      [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() ||
      "Tenant";
    const billingMonthLabel = bill.utilityCycleEnd
      ? formatManilaDate(bill.utilityCycleEnd, "MMMM YYYY")
      : formatManilaDate(bill.billingMonth || issuedAt, "MMMM YYYY");
    const dueDateLabel = formatManilaDate(dueDate, "MMMM D, YYYY");

    if (tenant?.email) {
      const emailResult = await sendBillGeneratedEmail({
        to: tenant.email,
        tenantName,
        billingMonth: billingMonthLabel,
        totalAmount: bill.totalAmount,
        dueDate: dueDateLabel,
        branchName: room?.branch || bill.branch || "Lilycrest",
      });
      if (!emailResult?.success) {
        emailError =
          emailResult?.error || emailResult?.message || "Email delivery failed";
      }
    }

    try {
      await notify.billGenerated(
        bill.userId?._id || bill.userId,
        billingMonthLabel,
        bill.totalAmount,
        dueDateLabel,
        {
          billId: bill._id,
          billType: "utilities",
          actionUrl: `/bill-details?billId=${String(bill._id)}`,
          eventId: `invoice:${Number(bill.invoiceVersion || 1)}`,
        },
      );
    } catch (error) {
      notificationError = error.message;
    }

    bill.delivery = {
      ...(bill.delivery || {}),
      email: {
        status: emailError ? "failed" : tenant?.email ? "sent" : "not_attempted",
        sentAt: emailError || !tenant?.email ? null : new Date(),
        error: emailError || "",
      },
      notification: {
        status: notificationError ? "failed" : "sent",
        sentAt: notificationError ? null : new Date(),
        error: notificationError || "",
      },
    };
    await bill.save();

    deliveries.push({
      billId: bill._id,
      tenantId: bill.userId?._id || bill.userId,
      pdfPath,
      pdfError,
      emailError,
      notificationError,
    });

    sent += 1;
  }

  return { sent, issuedAt, dueDate, sentAt, deliveries };
}

// Re-read and publish inside one transaction so payment or another period's
// dispatch cannot overwrite this allocation. A paid invoice stays immutable.
export async function publishWaterAllocationBill({billId,period,publishedAt,issuedAt,dueDate}) {
  const session=await mongoose.startSession();let published=null;
  try {
    await session.withTransaction(async()=>{
      published=null;
      let bill=await Bill.findById(billId).session(session);
      let allocations=waterAllocationsForPeriod(bill,period._id).filter(a=>a.state==='draft');
      if (!allocations.length) return;
      if (bill.status==='paid') {
        const original=bill;
        const waterSupplementKey=`water:${period._id}:${bill.reservationId}:${bill.userId}`;
        bill=await Bill.findOne({waterSupplementKey}).session(session);
        if (!bill) bill=new Bill({waterSupplementKey,reservationId:original.reservationId,userId:original.userId,
          branch:original.branch,roomId:period.roomId,billingMonth:original.billingMonth,billingCycleStart:null,
          billingCycleEnd:original.billingCycleEnd,status:'draft',charges:{water:0},paidAmount:0,
          waterAllocations:allocations.map(a=>a.toObject?.() || {...a})});
        if (waterPeriodSent(bill,period._id)) return;
        allocations=waterAllocationsForPeriod(bill,period._id).filter(a=>a.state==='draft');
        bill.charges.water=roundMoney(bill.waterAllocations.reduce((sum,a)=>sum+a.amount,0));
        await UtilityPeriod.updateOne({_id:period._id},{$set:{'tenantSummaries.$[summary].billId':bill._id}},
          {session,arrayFilters:[{'summary.billId':original._id,'summary.tenantId':original.userId}]});
      }
      const utilityAmount=roundMoney(allocations.reduce((sum,a)=>sum+Number(a.amount),0));
      if (utilityAmount<=0) return;
      for(const allocation of allocations) Object.assign(allocation,{state:'sent',publishedAt,issuedAt,dueDate});
      setUtilityDispatchEntry(bill,'water',{state:'sent',periodId:period._id,publishedAt,issuedAt,dueDate,amount:utilityAmount});
      Object.assign(bill,getUtilityCycleFromPeriod(period),{sentAt:publishedAt,issuedAt,dueDate,paymongoSessionId:null});
      syncBillAmounts(bill,{releasing:true});await bill.save({session});
      published={bill,utilityAmount,targetAllocations:allocations};
    });
    if (published) await published.bill.populate([{path:'userId',select:'firstName lastName email'},{path:'roomId',select:'name roomNumber branch'}]);
    return published;
  } finally {await session.endSession();}
}

// Like measured Water, re-read at publication so a payment made after draft
// generation cannot cause Send to reopen a paid invoice.
export async function publishElectricityBill({billId,period,publishedAt,issuedAt,dueDate}) {
  const session=await mongoose.startSession();let published=null;
  try {
    await session.withTransaction(async()=>{
      published=null;
      let bill=await Bill.findById(billId).session(session);
      if (!bill || bill.isArchived) return;
      const dispatch=getUtilityDispatchEntry(bill,'electricity');
      if (dispatch.state==='sent' || (dispatch.periodId && String(dispatch.periodId)!==String(period._id))) return;
      const utilityAmount=roundMoney(bill.charges.electricity || 0);
      if (utilityAmount<=0) return;
      if (bill.status==='paid') {
        const original=bill;
        const identity=utilitySupplementIdentity('electricity',period._id,bill.reservationId,bill.userId);
        bill=await Bill.findOne(identity).session(session);
        if (!bill) bill=new Bill({...identity,parentInvoiceId:original._id,reservationId:original.reservationId,userId:original.userId,
          branch:original.branch,roomId:period.roomId,billingMonth:original.billingMonth,billingCycleStart:null,
          billingCycleEnd:original.billingCycleEnd,status:'draft',charges:{electricity:utilityAmount},paidAmount:0});
        if (getUtilityDispatchEntry(bill,'electricity').state==='sent') return;
        if (bill.status==='paid') throw Object.assign(new Error('A paid electricity supplement cannot be changed.'),{statusCode:409});
        await UtilityPeriod.updateOne({_id:period._id},{$set:{'tenantSummaries.$[summary].billId':bill._id}},
          {session,arrayFilters:[{'summary.billId':original._id,'summary.tenantId':original.userId}]});
      }
      setUtilityDispatchEntry(bill,'electricity',{state:'sent',periodId:period._id,publishedAt,issuedAt,dueDate,amount:utilityAmount});
      Object.assign(bill,getUtilityCycleFromPeriod(period),{sentAt:publishedAt,issuedAt,dueDate,paymongoSessionId:null});
      syncBillAmounts(bill,{releasing:true});await bill.save({session});
      published={bill,utilityAmount};
    });
    if (published) await published.bill.populate([{path:'userId',select:'firstName lastName email'},{path:'roomId',select:'name roomNumber branch'}]);
    return published;
  } finally {await session.endSession();}
}

export async function sendUtilityPeriodBills({
  bills,
  period,
  result,
  utilityType,
}) {
  const chargeField = getUtilityChargeField(utilityType);
  const publishedAt = new Date();
  const utilityCycle = getUtilityCycleFromPeriod(period);
  const issuedAt = getUtilityIssueDate({
    readingDate: utilityCycle.utilityReadingDate,
    finalizedAt: publishedAt,
  });
  const dueDate = getUtilityDueDate(issuedAt);
  let sent = 0;
  const deliveries = [];

  const populatedBills = await Bill.populate(bills, [
    { path: "userId", select: "firstName lastName email" },
    { path: "roomId", select: "name roomNumber branch" },
  ]);

  const settledDeliveries = await mapWithConcurrency(
    populatedBills,
    UTILITY_BILL_SEND_CONCURRENCY,
    async (bill) => {
      let targetAllocations=null;
      let utilityAmount=roundMoney(bill?.charges?.[chargeField] || 0);
      const currentDispatch=getUtilityDispatchEntry(bill,utilityType);
      if (utilityType==='electricity') {
        const published=await publishElectricityBill({billId:bill._id,period,publishedAt,issuedAt,dueDate});
        if (!published) return null;
        ({bill,utilityAmount}=published);
      } else if (utilityType==='water' && bill.waterAllocations?.length) {
        const published=await publishWaterAllocationBill({billId:bill._id,period,publishedAt,issuedAt,dueDate});
        if (!published) return null;
        ({bill,targetAllocations,utilityAmount}=published);
      } else {
        if (utilityAmount<=0 || currentDispatch.state==='sent') return null;
        if (utilityType==='water' && bill.status==='paid') throw Object.assign(new Error('A paid water invoice cannot be changed.'),{statusCode:409});
      setUtilityDispatchEntry(bill, utilityType, {
        state: "sent",
        periodId: period?._id || period?.id || currentDispatch.periodId || null,
        publishedAt,
        issuedAt,
        dueDate,
        amount: utilityAmount,
      });

      bill.utilityCycleStart = utilityCycle.utilityCycleStart;
      bill.utilityCycleEnd = utilityCycle.utilityCycleEnd;
      bill.utilityReadingDate = utilityCycle.utilityReadingDate;
      bill.sentAt = publishedAt;
      bill.issuedAt = issuedAt;
      bill.dueDate = dueDate;
      bill.paymongoSessionId = null;
      // releasing: true — this per-utility-type send is what actually makes
      // this bill's charge tenant-visible; see the releasedAt guard in
      // services/billing/billingPolicy.js. A no-op if the bill already has
      // releasedAt (e.g. a rent+utility bill first released at creation).
      syncBillAmounts(bill, { releasing: true });
      await bill.save();

      }

      const tenant =
        bill.userId && typeof bill.userId === "object" ? bill.userId : null;
      const targetUserId = bill.userId?._id
        ? String(bill.userId._id)
        : bill.userId
          ? String(bill.userId)
          : null;
      const tenantName =
        [tenant?.firstName, tenant?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Tenant";
      const billingMonthLabel = bill.utilityCycleEnd
        ? formatManilaDate(bill.utilityCycleEnd, "MMMM YYYY")
        : formatManilaDate(bill.billingMonth || issuedAt, "MMMM YYYY");
      const dueDateLabel = formatManilaDate(dueDate, "MMMM D, YYYY");
      const visibleCharges = getVisibleBillCharges(bill);
      const visibleTotalAmount = bill.totalAmount;
      let emailError = null;
      let notificationError = null;

      const [emailResult, notificationResult] = await Promise.allSettled([
        tenant?.email
          ? sendUtilityChargeAvailableEmail({
              to: tenant.email,
              tenantName,
              utilityType,
              billingMonth: billingMonthLabel,
              utilityAmount,
              totalAmount: visibleTotalAmount,
              dueDate: dueDateLabel,
              branchName: bill.roomId?.branch || bill.branch || "Lilycrest",
            })
          : Promise.resolve(null),
        targetUserId
          ? notify.utilityChargeAvailable(
              targetUserId,
              utilityType,
              billingMonthLabel,
              utilityAmount,
              visibleTotalAmount,
              dueDateLabel,
              {
                billId: bill._id,
                utilityPeriodId: period._id,
                allocationIds: (targetAllocations || []).map(a=>a.allocationId),
                eventId: `${utilityType}:${String(period?._id || period?.id || Number(bill.invoiceVersion || 1))}`,
              },
            )
          : Promise.reject(new Error("No tenant user assigned to bill")),
      ]);

      if (emailResult.status === "fulfilled" && emailResult.value) {
        if (!emailResult.value?.success) {
          emailError =
            emailResult.value?.error ||
            emailResult.value?.message ||
            "Email delivery failed";
        }
      } else if (emailResult.status === "rejected") {
        emailError = emailResult.reason?.message || "Email delivery failed";
      }

      if (notificationResult.status === "rejected") {
        notificationError =
          notificationResult.reason?.message || "Notification delivery failed";
      }

      const emailSent = Boolean(tenant?.email && !emailError);
      const notificationSent = Boolean(targetUserId && !notificationError);

      bill.delivery = {
        ...(bill.delivery || {}),
        email: {
          status: emailError ? "failed" : emailSent ? "sent" : "not_attempted",
          sentAt: emailSent ? new Date() : null,
          error: emailError || "",
        },
        notification: {
          status: notificationError ? "failed" : notificationSent ? "sent" : "not_attempted",
          sentAt: notificationSent ? new Date() : null,
          error: notificationError || "",
        },
      };
      await bill.save();

      return {
        billId: bill._id,
        tenantId: targetUserId,
        utilityType,
        utilityAmount,
        totalAmount: visibleTotalAmount,
        visibleCharges,
        emailSent,
        emailError,
        notificationSent,
        notificationError,
      };
    },
  );

  let emailSuccessCount = 0;
  let emailFailedCount = 0;
  let notificationSuccessCount = 0;
  let notificationFailedCount = 0;

  for (const delivery of settledDeliveries) {
    if (!delivery) continue;
    deliveries.push(delivery);
    sent += 1;
    if (delivery.emailError) {
      emailFailedCount += 1;
    } else if (delivery.emailSent) {
      emailSuccessCount += 1;
    }
    if (delivery.notificationError) {
      notificationFailedCount += 1;
    } else if (delivery.notificationSent) {
      notificationSuccessCount += 1;
    }
  }

  return {
    sent,
    issuedAt,
    dueDate,
    publishedAt,
    deliveries,
    emailSuccessCount,
    emailFailedCount,
    notificationSuccessCount,
    notificationFailedCount,
  };
}
