import { CACHE } from "../config/constants.js";

const accountStatusCache = new Map();
const TTL = CACHE.ACCOUNT_STATUS_TTL_MS;

export function getCachedAccountStatus(uid) {
  const entry = accountStatusCache.get(uid);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL) {
    accountStatusCache.delete(uid);
    return undefined;
  }
  return entry.status;
}

export function setCachedAccountStatus(uid, status) {
  accountStatusCache.set(uid, { status, ts: Date.now() });
  if (accountStatusCache.size > CACHE.MAX_ACCOUNT_STATUS_ENTRIES) {
    const oldest = accountStatusCache.keys().next().value;
    accountStatusCache.delete(oldest);
  }
}

export function invalidateAccountStatusCache(uid) {
  accountStatusCache.delete(uid);
}
