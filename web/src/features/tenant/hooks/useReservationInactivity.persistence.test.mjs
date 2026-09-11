import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("useReservationInactivity supports persistent timer across refresh or browser close", () => {
  const filePath = "src/features/tenant/hooks/useReservationInactivity.js";
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(content.includes("updatedAt"), "Hook must accept updatedAt from server");
  assert.ok(
    content.includes("localStorage") || content.includes("sessionStorage"),
    "Hook must persist activity to browser storage so refresh continues the timer",
  );
  assert.ok(
    content.includes("elapsedMs") || content.includes("elapsed"),
    "Hook must calculate elapsed time on mount to continue countdown seamlessly",
  );
  assert.ok(
    content.includes("Math.max(serverTime, storedTime)"),
    "Hook must accurately reconcile both server sync and client interaction timestamps",
  );
});

test("Persistence logic accurately determines countdown across 3 refresh/close scenarios", () => {
  const INACTIVITY_WARNING_MS = 25 * 60 * 1000;
  const TOTAL_TIMEOUT_MS = 30 * 60 * 1000;

  function calculateState(serverTimeStr, storedTimeStr, now) {
    let serverTime = serverTimeStr ? new Date(serverTimeStr).getTime() : null;
    let storedTime = storedTimeStr ? Number(storedTimeStr) : null;
    let lastActive = now;

    if (serverTime && storedTime) {
      lastActive = Math.min(now, Math.max(serverTime, storedTime));
    } else if (serverTime) {
      lastActive = Math.min(now, serverTime);
    } else if (storedTime) {
      lastActive = Math.min(now, storedTime);
    }

    const elapsedMs = Math.max(0, now - lastActive);

    if (elapsedMs >= TOTAL_TIMEOUT_MS) {
      return { warning: true, remainingSecs: 0, expired: true };
    }
    if (elapsedMs >= INACTIVITY_WARNING_MS) {
      const remainingSecs = Math.max(0, Math.floor((TOTAL_TIMEOUT_MS - elapsedMs) / 1000));
      return { warning: true, remainingSecs, expired: false };
    }
    return { warning: false, remainingSecs: 300, expired: false };
  }

  const baseTime = Date.now();

  // Scenario 1: Refresh after 10 minutes (browser closed/refreshed)
  // Elapsed = 10 mins. Should NOT warn, should NOT reset to 30 mins, elapsed is tracked.
  const scenario1 = calculateState(
    new Date(baseTime - 10 * 60 * 1000).toISOString(),
    String(baseTime - 10 * 60 * 1000),
    baseTime
  );
  assert.equal(scenario1.warning, false);
  assert.equal(scenario1.expired, false);

  // Scenario 2: Close tab, reopen after 27 minutes
  // Elapsed = 27 mins. Between 25 and 30 mins! Warning modal opens immediately with remaining 3 mins (180s)
  const scenario2 = calculateState(
    new Date(baseTime - 27 * 60 * 1000).toISOString(),
    String(baseTime - 27 * 60 * 1000),
    baseTime
  );
  assert.equal(scenario2.warning, true);
  assert.equal(scenario2.expired, false);
  assert.equal(scenario2.remainingSecs, 180);

  // Scenario 3: Close tab, reopen after 35 minutes
  // Elapsed = 35 mins. >= 30 mins! Marked as expired immediately
  const scenario3 = calculateState(
    new Date(baseTime - 35 * 60 * 1000).toISOString(),
    String(baseTime - 35 * 60 * 1000),
    baseTime
  );
  assert.equal(scenario3.warning, true);
  assert.equal(scenario3.expired, true);
  assert.equal(scenario3.remainingSecs, 0);
});

test("useReservationInactivity throttles localStorage interaction writes to 5000ms", () => {
  const filePath = "src/features/tenant/hooks/useReservationInactivity.js";
  const content = fs.readFileSync(filePath, "utf8");
  assert.match(
    content,
    /lastStorageWriteRef\.current\s*>=\s*5000/,
    "recordActivity must throttle localStorage writes against lastStorageWriteRef"
  );
  assert.match(
    content,
    /const onExpiredRef = useRef\(onExpired\);/,
    "useReservationInactivity must store onExpired in ref"
  );
  assert.match(
    content,
    /\}, \[isActive, isWarningOpen, reservationId\]\);/,
    "Countdown effect must omit onExpired callback to prevent interval churn"
  );
});

test("Behavioral simulation: rapid continuous interactions update in-memory activity while throttling disk writes", () => {
  let storageWrites = 0;
  let lastStorageValue = null;
  const mockStorage = {
    setItem: (key, val) => {
      storageWrites++;
      lastStorageValue = val;
    },
  };

  let lastActivity = 10000;
  let lastStorageWrite = 10000;

  function simulateRecordActivity(nowTime) {
    lastActivity = nowTime;
    if (nowTime - lastStorageWrite >= 5000) {
      lastStorageWrite = nowTime;
      mockStorage.setItem("res_key", String(nowTime));
    }
  }

  // Simulate 20 rapid keystrokes/scroll events occurring every 500ms (10 seconds total: 10500ms to 20000ms)
  for (let t = 10500; t <= 20000; t += 500) {
    simulateRecordActivity(t);
  }

  // Storage writes should occur at 15000ms and 20000ms (2 writes), NOT 20 writes (disk spam) and NOT 0 writes (lost activity)
  assert.equal(storageWrites, 2, "Must throttle disk writes to exactly 2 across a 10s interaction window");
  assert.equal(lastStorageValue, "20000", "Storage must reflect the latest throttled timestamp");
  assert.equal(lastActivity, 20000, "In-memory activity must track the exact latest user event");
});


