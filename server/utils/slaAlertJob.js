/**
 * ============================================================================
 * SLA ALERT JOB
 * ============================================================================
 *
 * Detects maintenance requests that have exceeded their SLA window and sends
 * one grouped notification per branch to avoid spamming admins.
 *
 * SLA windows (hours until breach):
 *   high urgency   →  24h
 *   normal urgency →  48h
 *   low urgency    → 120h
 *
 * Deduplication:
 *   Sets slaBreachNotified = true on each notified request.
 *   The maintenanceController resets this flag on any status update,
 *   so re-escalation fires again if the request later becomes delayed again.
 *
 * Grouping:
 *   One notification per admin per branch, not per request.
 *   The message includes an urgency breakdown and links to the delayed filter.
 *
 * ============================================================================
 */

import dayjs from "dayjs";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import User from "../models/User.js";
import { notify } from "./notificationService.js";
import logger from "../middleware/logger.js";

const SLA_HOURS = { high: 24, normal: 48, low: 120 };
const TERMINAL_STATUSES = ["resolved", "completed", "rejected", "cancelled", "closed"];

let running = false;

export async function detectSlaBreaches() {
  if (running) {
    logger.warn("SLA breach detection already running — skipping this cycle");
    return;
  }
  running = true;

  try {
    const now = dayjs();
    const breachedRequests = [];

    // Collect all unnotified requests that have exceeded their SLA for their urgency tier
    for (const [urgency, slaHours] of Object.entries(SLA_HOURS)) {
      const cutoff = now.subtract(slaHours, "hour").toDate();

      const requests = await MaintenanceRequest.find({
        urgency,
        status: { $nin: TERMINAL_STATUSES },
        created_at: { $lt: cutoff },
        slaBreachNotified: { $ne: true },
        isArchived: false,
      })
        .select("_id request_id branch urgency status")
        .lean();

      breachedRequests.push(...requests);
    }

    if (breachedRequests.length === 0) {
      return;
    }

    // Group breached requests by branch
    const byBranch = breachedRequests.reduce((acc, req) => {
      const key = req.branch || "unknown";
      (acc[key] = acc[key] || []).push(req);
      return acc;
    }, {});

    let totalAdminsNotified = 0;

    for (const [branch, requests] of Object.entries(byBranch)) {
      // Find all admins scoped to this branch (branch_admin + owner)
      const admins = await User.find({
        role: { $in: ["branch_admin", "owner"] },
        branch,
        isArchived: false,
      })
        .select("_id")
        .lean();

      if (admins.length === 0) {
        logger.warn({ branch }, "SLA breach: no admins found for branch, skipping");
        continue;
      }

      // Build urgency breakdown string: "3 High, 8 Normal, 2 Low"
      const urgencyBreakdown = Object.entries(
        requests.reduce((acc, r) => {
          const key = r.urgency.charAt(0).toUpperCase() + r.urgency.slice(1);
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      )
        .map(([label, count]) => `${count} ${label}`)
        .join(", ");

      // One notification per admin — grouped, not per-request
      for (const admin of admins) {
        await notify.slaBreachAlert(admin._id, branch, requests.length, urgencyBreakdown);
        totalAdminsNotified++;
      }
    }

    // Mark all breached requests as notified to prevent duplicate alerts
    const breachedIds = breachedRequests.map((r) => r._id);
    await MaintenanceRequest.updateMany(
      { _id: { $in: breachedIds } },
      { $set: { slaBreachNotified: true } },
    );

    logger.info(
      { breachedCount: breachedRequests.length, adminsNotified: totalAdminsNotified },
      "SLA breach alerts dispatched",
    );
  } catch (error) {
    logger.error({ err: error }, "SLA breach detection job failed");
  } finally {
    running = false;
  }
}

export default detectSlaBreaches;
