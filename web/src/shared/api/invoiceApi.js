/**
 * Invoice Publishing API
 *
 * Handles the consolidated "Issue Invoices" workflow.
 * This is the ONLY place where bill dispatch is initiated —
 * the Electricity and Water tabs do NOT have send/publish buttons.
 */

import { authFetch } from "./httpClient.js";

export const invoiceApi = {
  /**
   * GET /api/billing/readiness
   * Returns per-room utility finalization status for the active billing cycle.
   * Used by InvoicePublishTab to build the readiness table.
   */
  getRoomReadiness: (branch) =>
    authFetch(`/billing/readiness${branch ? `?branch=${branch}` : ""}`),

  /**
   * POST /api/billing/publish/:roomId
   * Atomically publishes all draft bills for a room:
   * - Flips status: draft → pending
   * - Generates PDF billing statements
   * - Sends email notifications to tenants
   *
   * Guards enforced server-side:
   * - Electricity period must be closed
   * - Water record must be finalized (where applicable)
   */
  publishRoom: (roomId) =>
    authFetch(`/billing/publish/${roomId}`, { method: "POST" }),
};
