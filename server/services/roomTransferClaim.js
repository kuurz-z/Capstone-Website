export const TRANSFER_CLAIM_TTL_MS = 15 * 60 * 1000;
const RECOVERABLE_KINDS = ["completion", "cancellation", "reschedule"];
export function hasActiveTransferClaim(record, now = Date.now()) {
  if (!record?.executionToken) return false;
  const started = new Date(record.executionStartedAt || NaN).getTime();
  return !RECOVERABLE_KINDS.includes(record.executionKind) || !Number.isFinite(started) || started >= now - TRANSFER_CLAIM_TTL_MS;
}
export function availableTransferClaimFilter(now = Date.now()) {
  return { $or: [
    { executionToken: null },
    { executionKind: { $in: RECOVERABLE_KINDS }, executionStartedAt: { $lt: new Date(now - TRANSFER_CLAIM_TTL_MS) } },
  ] };
}
