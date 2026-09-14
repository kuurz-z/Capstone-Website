import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { Contract, Reservation, Stay } from "../models/index.js";
import { transitionContract } from "./contractService.js";
import { notify, notifyBranchAdmins } from "./notifications/notificationService.js";
import { toManilaStartOfDay } from "../utils/dateUtils.js";

/**
 * ============================================================================
 * RENEWAL EFFECTIVE-DATE ACTIVATION
 * ============================================================================
 * A renewal successor Contract is created FINAL-but-not-yet-effective
 * (status "published" once wet-signed, isCurrent: false) by
 * createSuccessorContractForRenewal/autoGenerateRenewalContract, and stays
 * that way — visible as "upcoming" via
 * tenantContractSelectionService.resolveTenantUpcomingContract — until its
 * leaseStartDate actually arrives. This is the one function that flips both
 * sides of the transition at that moment:
 *
 *   successor:   published -> active,   isCurrent: false -> true
 *   predecessor: active    -> replaced, isCurrent: true  -> false
 *   reservation: monthlyRent -> successor.approvedMonthlyRate
 *
 * "replaced" (not "expired") is the deliberate predecessor terminal status
 * for this path: it specifically means "superseded by a successor Contract"
 * and is what HISTORY_VISIBLE_STATUSES / archival / admin display expect for
 * a renewal cutover. "expired" is reserved for a tenant who actually reached
 * the end of their term and moved out (moveOutStayWorkflow) — a different
 * scenario. Both are legal terminal edges from active now; the distinction
 * here is semantic, not a state-machine limitation.
 *
 * The main query only matches status: "published" AND finalDocument !=
 * null, so cancelled/voided/rejected/archived/generated-only successors are
 * never matched — legal finality (Phase 1's wet-signed-upload rule) is a
 * hard precondition for activation, never bypassed here.
 *
 * Idempotent: the query only matches contracts still at "published", so a
 * contract already activated by a previous run is never matched again, and
 * session.withTransaction's automatic retry-on-transient-error re-fetches
 * fresh state from inside the callback (see the comment further down) so a
 * retried attempt can never double-apply an in-memory mutation.
 *
 * Intended to be invoked by a scheduled job (server/utils/scheduler.js) and
 * is DB-connection-agnostic so it can also run from a test/manual trigger.
 * ============================================================================
 */
export async function activateDueRenewalContracts({ now = new Date() } = {}) {
  const report = {
    scanned: 0, activated: 0, blocked: 0, conflicts: 0, errors: 0, records: [],
  };

  // Manila-calendar-date cutoff, not raw UTC "now" — a leaseStartDate of
  // 2027-02-01 must mean the correct Lilycrest local business date, matching
  // the same convention billingPolicy.js/rentGenerator.js already use.
  const manilaCutoff = toManilaStartOfDay(now).add(1, "day").toDate();

  const dueCandidates = await Contract.find({
    contractPurpose: "renewal",
    status: "published",
    leaseStartDate: { $lt: manilaCutoff },
    finalDocument: { $ne: null },
  }).select("_id contractNumber replacesContractId").sort({ leaseStartDate: 1 }).lean();

  // Multiple-successor conflict guard: never guess which of two due
  // successors against the same predecessor should win. Detected up front
  // (deterministic regardless of iteration/race order) rather than relying
  // on the per-contract predecessor-status check below, which could let a
  // second successor "win" nondeterministically depending on execution
  // order if checked only inline.
  const byPredecessor = new Map();
  for (const candidate of dueCandidates) {
    const key = candidate.replacesContractId ? String(candidate.replacesContractId) : null;
    if (!key) continue;
    if (!byPredecessor.has(key)) byPredecessor.set(key, []);
    byPredecessor.get(key).push(candidate);
  }
  const conflictedContractIds = new Set();
  for (const [predecessorId, candidates] of byPredecessor) {
    if (candidates.length > 1) {
      for (const candidate of candidates) conflictedContractIds.add(String(candidate._id));
      logger.error(
        { predecessorId, candidateIds: candidates.map((c) => String(c._id)) },
        "[RenewalActivation] Multiple due renewal successors reference the same predecessor Contract — skipping all, admin repair required",
      );
    }
  }

  const due = dueCandidates.filter((c) => !conflictedContractIds.has(String(c._id)));
  report.scanned = due.length;
  report.conflicts = conflictedContractIds.size;
  for (const contractId of conflictedContractIds) {
    report.records.push({ contractId, outcome: "CONFLICT_MULTIPLE_SUCCESSORS" });
  }

  for (const { _id: contractId, contractNumber } of due) {
    const entry = { contractId: String(contractId), contractNumber };
    const session = await mongoose.startSession();
    // Re-fetch fresh inside the transaction (not reused from the `due` scan
    // above) — session.withTransaction() automatically retries this
    // callback on a transient transaction error, and Mongoose document
    // mutations (statusHistory.push, etc.) live in JS memory, not just the
    // DB: mutating a document fetched OUTSIDE the callback would double-
    // apply on retry even though the DB-side write of the aborted attempt
    // is rolled back. Fetching inside means every attempt starts clean.
    let outcome = null;
    let notifyTarget = null;
    try {
      await session.withTransaction(async () => {
        const successor = await Contract.findById(contractId).session(session);
        if (!successor || successor.status !== "published") {
          // Already handled by a concurrent/earlier retry attempt.
          outcome = { activated: false };
          return;
        }
        const predecessor = successor.replacesContractId
          ? await Contract.findById(successor.replacesContractId).session(session)
          : null;
        if (!predecessor || predecessor.status !== "active") {
          // The predecessor was already superseded/closed by something else
          // (another activation, manual admin action, data corruption) —
          // activating this successor too would leave two "current"
          // contracts for one reservation. Surface, don't guess.
          outcome = { conflict: true };
          return;
        }

        // Defense-in-depth, independent of whether the Contract-side
        // cancellation in moveOutStayWorkflow/transferStayWorkflow actually
        // ran: even when predecessor.status still reads "active", check for
        // positive evidence the tenant has already departed. A tenant whose
        // reservation is moveOut/cancelled, or who has a Stay explicitly
        // marked completed/terminated for this reservation, must never have
        // a renewal silently activated for them — that would resurrect a
        // tenancy that has already ended. This only blocks on clear evidence
        // of departure; it does not require a Stay to exist at all (many
        // legitimate Contracts have no Stay row — a separate, known gap
        // tracked by Job 19 — and must not be penalized here for that).
        const predecessorReservationId = predecessor.reservationId;
        if (predecessorReservationId) {
          const [reservationDeparted, hasDepartedStay] = await Promise.all([
            Reservation.exists({
              _id: predecessorReservationId,
              status: { $in: ["moveOut", "cancelled"] },
            }).session(session),
            Stay.exists({
              reservationId: predecessorReservationId,
              status: { $in: ["completed", "terminated"] },
            }).session(session),
          ]);
          if (reservationDeparted || hasDepartedStay) {
            outcome = { conflict: true };
            return;
          }
        }

        successor.isCurrent = true;
        await transitionContract(
          successor,
          "active",
          successor.updatedBy || successor.createdBy,
          "Renewal effective date reached; successor Contract activated",
          session,
        );

        predecessor.supersededByContractId = successor._id;
        await transitionContract(
          predecessor,
          "replaced",
          successor.updatedBy || successor.createdBy,
          `Superseded by renewal successor Contract ${successor.contractNumber}`,
          session,
        );

        // Reservation is the actual billing source of truth
        // (rentGenerator.resolveReservationRentAmount reads
        // reservation.monthlyRent, not Contract) — this is the other half
        // of the cutover renewStayWorkflow deliberately defers. Only
        // monthlyRent is updated here; pricingSnapshot (used by
        // structured-initial-payment reservations instead) is intentionally
        // left untouched — see this file's module header / the Phase 2B
        // report for why that's a documented, separate gap rather than a
        // silent omission.
        //
        // PHASE 10 — `recurringRentRate` is a ROOM-TRANSFER override that
        // wins over EVERYTHING in resolveReservationRentAmount (including
        // monthlyRent and the structured pricingSnapshot). A renewal is a
        // NEW lease term with its own canonically-approved rate, so the
        // transfer override must NOT survive renewal activation — otherwise
        // a transferred-then-renewed tenant keeps being billed the old
        // transfer rate forever. Clear it here so the renewal's
        // approvedMonthlyRate (written to monthlyRent just above) becomes
        // the one authoritative current rate. A tenant who transfers AGAIN
        // after renewing gets a fresh override from that transfer's cutover.
        if (successor.reservationId && Number.isFinite(Number(successor.approvedMonthlyRate))) {
          await Reservation.updateOne(
            { _id: successor.reservationId },
            {
              $set: {
                monthlyRent: Number(successor.approvedMonthlyRate),
                recurringRentRate: null, // clear the room-transfer override — see comment above
              },
            },
            { session },
          );
        }

        outcome = {
          activated: true,
          predecessorId: String(predecessor._id),
          tenantId: successor.tenantId,
          roomNumber: successor.roomNumber,
        };
      });

      if (outcome?.activated) {
        report.activated += 1;
        entry.outcome = "ACTIVATED";
        entry.predecessorId = outcome.predecessorId;
        notifyTarget = outcome;
      } else if (outcome?.conflict) {
        report.conflicts += 1;
        entry.outcome = "CONFLICT_PREDECESSOR_NOT_ACTIVE";
        logger.error(
          { contractId },
          "[RenewalActivation] Predecessor is not active/current — skipping, admin repair required",
        );
      } else {
        entry.outcome = "SKIPPED_ALREADY_ACTIVE";
      }
    } catch (activationError) {
      report.errors += 1;
      entry.outcome = "ERROR";
      entry.error = activationError.message;
      logger.error(
        { err: activationError, contractId },
        "[RenewalActivation] Failed to activate renewal successor Contract",
      );
    } finally {
      await session.endSession();
    }

    // Notification only fires after a successful commit — never on a
    // failed/rolled-back transaction, so "Renewal is now effective" always
    // reflects genuinely committed canonical state.
    if (notifyTarget) {
      try {
        await notify.renewalEffective(notifyTarget.tenantId, notifyTarget.roomNumber, contractId);
      } catch (notifyError) {
        entry.notifyError = notifyError.message;
        logger.warn(
          { err: notifyError, contractId },
          "[RenewalActivation] Tenant notification failed (non-fatal)",
        );
      }
    }

    report.records.push(entry);
  }

  const blockedRecords = await flagRenewalsBlockedOnFinality(manilaCutoff);
  report.blocked = blockedRecords.length;
  report.records.push(...blockedRecords);

  return report;
}

// A renewal successor whose leaseStartDate has arrived but which never
// received (or never completed) a wet-signed final upload must NOT
// silently extend the predecessor's legal term or fabricate finality —
// this is a business-risk condition that needs an admin, not a scheduler,
// to resolve. Detected and reported/notified every run, but the
// notification itself dedupes on the contract ID (via notifyBranchAdmins'
// createNotification dedupe-key support) so it alerts once, not daily.
const CLOSED_RENEWAL_STATUSES = new Set([
  "cancelled", "terminated", "archived", "voided", "rejected", "active", "replaced",
]);

async function flagRenewalsBlockedOnFinality(manilaCutoff) {
  const blocked = await Contract.find({
    contractPurpose: "renewal",
    leaseStartDate: { $lt: manilaCutoff },
    finalDocument: null,
    status: { $nin: [...CLOSED_RENEWAL_STATUSES] },
  }).select("_id contractNumber branch roomNumber tenantLegalName leaseStartDate status").lean();

  const records = [];
  for (const contract of blocked) {
    const entry = {
      contractId: String(contract._id),
      contractNumber: contract.contractNumber,
      outcome: "BLOCKED_NOT_FINAL",
    };
    try {
      await notifyBranchAdmins(
        contract.branch,
        "contract_error",
        "Renewal Effective Date Reached Without a Final Signed Contract",
        `${contract.tenantLegalName || "A tenant"}'s renewal (Room ${contract.roomNumber || "—"}, ` +
        `${contract.contractNumber}) was due to take effect on ` +
        `${contract.leaseStartDate ? new Date(contract.leaseStartDate).toDateString() : "an unknown date"} ` +
        "but has no final wet-signed contract yet. The prior contract has NOT been superseded. Manual review required.",
        {
          entityType: "contract",
          entityId: String(contract._id),
          actionUrl: "/admin/contracts",
          dedupeKey: `renewal_activation_blocked:${String(contract._id)}`,
        },
      );
    } catch (notifyError) {
      entry.notifyError = notifyError.message;
      logger.warn(
        { err: notifyError, contractId: contract._id },
        "[RenewalActivation] Admin blocked-renewal notification failed (non-fatal)",
      );
    }
    records.push(entry);
  }
  return records;
}
