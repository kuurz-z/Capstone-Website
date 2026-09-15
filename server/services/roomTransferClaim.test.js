import { test, expect } from "@jest/globals";
import { hasActiveTransferClaim, TRANSFER_CLAIM_TTL_MS } from "./roomTransferClaim.js";
import { buildPreparedContractStorage } from "./contractPrivateStorageService.js";
test.each(["completion", "cancellation", "reschedule"])("expired %s claims can recover, fresh claims cannot", executionKind => {
  const now = Date.now();
  const record = { executionToken: "claim", executionKind, executionStartedAt: new Date(now - TRANSFER_CLAIM_TTL_MS - 1) };
  expect(hasActiveTransferClaim(record, now)).toBe(false);
  expect(hasActiveTransferClaim({ ...record, executionStartedAt: new Date(now) }, now)).toBe(true);
});
test("legacy claims with unknown operation remain protected for review", () => {
  expect(hasActiveTransferClaim({ executionToken: "legacy", executionStartedAt: new Date(0) })).toBe(true);
});
test("recovered PDF attempts cannot overwrite another attempt's artifact", () => {
  const args = { contractId: "test-contract", contractNumber: "test", version: 2 };
  const first = buildPreparedContractStorage({ ...args, storageAttemptId: "first" });
  const second = buildPreparedContractStorage({ ...args, storageAttemptId: "second" });
  expect(first.storageKey).not.toBe(second.storageKey);
  expect(first.absolutePath).not.toBe(second.absolutePath);
  expect(first.fileName).toBe(second.fileName);
});
