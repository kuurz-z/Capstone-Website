import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_IDLE_TIMEOUT_MS,
  STORAGE_KEY_LAST_ACTIVITY,
  STORAGE_KEY_LOGOUT_BROADCAST,
  SESSION_BROADCAST_CHANNEL,
  clampTimestamp,
  calculateInactivityState,
  shouldThrottleWrite,
} from "./sessionInactivityCore.js";

test("constants have expected values", () => {
  assert.equal(SESSION_IDLE_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(STORAGE_KEY_LAST_ACTIVITY, "lilycrest_session_last_activity");
  assert.equal(STORAGE_KEY_LOGOUT_BROADCAST, "lilycrest_session_logout_broadcast");
  assert.equal(SESSION_BROADCAST_CHANNEL, "lilycrest_session_sync");
});

test("clampTimestamp: handles valid, invalid, and future timestamps", () => {
  const now = 1700000000000;
  assert.equal(clampTimestamp(now - 5000, now), now - 5000);
  assert.equal(clampTimestamp(String(now - 5000), now), now - 5000);
  // Future timestamp clamped to now
  assert.equal(clampTimestamp(now + 60000, now), now);
  // Invalid / non-numeric timestamps return null
  assert.equal(clampTimestamp(null, now), null);
  assert.equal(clampTimestamp(undefined, now), null);
  assert.equal(clampTimestamp("invalid", now), null);
  assert.equal(clampTimestamp(NaN, now), null);
  assert.equal(clampTimestamp(0, now), null);
  assert.equal(clampTimestamp(-100, now), null);
});

test("calculateInactivityState: returns normal state when under 15 minutes", () => {
  const now = 1700000000000;
  const lastActiveTime5 = now - 5 * 60 * 1000; // 5 mins ago
  const state5 = calculateInactivityState({ lastActiveTime: lastActiveTime5, now });
  assert.equal(state5.isExpired, false);

  const lastActiveTime14 = now - 14 * 60 * 1000; // 14 mins ago (no warning before 15m)
  const state14 = calculateInactivityState({ lastActiveTime: lastActiveTime14, now });
  assert.equal(state14.isExpired, false);
});

test("calculateInactivityState: handles missing or invalid lastActiveTime safely", () => {
  const now = 1700000000000;
  assert.deepEqual(calculateInactivityState({ lastActiveTime: null, now }), {
    isExpired: false,
  });
  assert.deepEqual(calculateInactivityState({ lastActiveTime: undefined, now }), {
    isExpired: false,
  });
  assert.deepEqual(calculateInactivityState({ lastActiveTime: "invalid", now }), {
    isExpired: false,
  });
  assert.deepEqual(calculateInactivityState({ lastActiveTime: NaN, now }), {
    isExpired: false,
  });
});

test("calculateInactivityState: triggers expired state at 15 minutes and beyond", () => {
  const now = 1700000000000;
  const lastActiveTime15 = now - 15 * 60 * 1000; // exactly 15 mins ago
  const state15 = calculateInactivityState({ lastActiveTime: lastActiveTime15, now });
  assert.equal(state15.isExpired, true);

  const lastActiveTime20 = now - 20 * 60 * 1000; // 20 mins ago
  const state20 = calculateInactivityState({ lastActiveTime: lastActiveTime20, now });
  assert.equal(state20.isExpired, true);
});

test("shouldThrottleWrite: throttles writes under throttleMs", () => {
  const lastWriteTime = 10000;
  assert.equal(shouldThrottleWrite({ lastWriteTime, now: 12000, throttleMs: 5000 }), true);
  assert.equal(shouldThrottleWrite({ lastWriteTime, now: 15000, throttleMs: 5000 }), false);
  assert.equal(shouldThrottleWrite({ lastWriteTime, now: 16000, throttleMs: 5000 }), false);
  assert.equal(shouldThrottleWrite({ lastWriteTime: 0, now: 16000, throttleMs: 5000 }), false);
  assert.equal(shouldThrottleWrite({ lastWriteTime: null, now: 16000, throttleMs: 5000 }), false);
  assert.equal(shouldThrottleWrite({ lastWriteTime: NaN, now: 16000, throttleMs: 5000 }), false);
  // System clock adjusted backward (now < lastWriteTime) -> must not throttle
  assert.equal(shouldThrottleWrite({ lastWriteTime: 20000, now: 10000, throttleMs: 5000 }), false);
});

test("calculateInactivityState: handles future timestamps safely without negative elapsed", () => {
  const now = 1700000000000;
  const futureTime = now + 60 * 1000; // 1 minute in the future
  const state = calculateInactivityState({ lastActiveTime: futureTime, now });
  assert.equal(state.isExpired, false);
});
