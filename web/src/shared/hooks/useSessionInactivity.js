import { useEffect, useRef, useCallback } from "react";
import {
  STORAGE_KEY_LAST_ACTIVITY,
  STORAGE_KEY_LOGOUT_BROADCAST,
  SESSION_BROADCAST_CHANNEL,
  clampTimestamp,
  calculateInactivityState,
  shouldThrottleWrite,
} from "../utils/sessionInactivityCore.js";

/**
 * useSessionInactivity Hook
 *
 * Tracks user activity across the entire authenticated browser session.
 * Features:
 * - Listens for DOM events: mousedown, keydown, touchstart, scroll, and throttled mousemove.
 * - Rejects sub-5px optical mouse jitter.
 * - Synchronizes activity timestamp in localStorage across all open browser tabs.
 * - Broadcasts and listens for cross-tab resets and logout events via BroadcastChannel & storage events.
 * - Protects against session resurrection upon waking/focusing an expired tab or device.
 * - Invokes onTimeout callback when inactivity reaches exactly 15 minutes.
 *
 * @param {Object} options
 * @param {boolean} options.isActive - Whether session tracking is active (user is authenticated)
 * @param {Function} options.onTimeout - Callback executed when inactivity expires (15m)
 */
export function useSessionInactivity({
  isActive = false,
  onTimeout,
}) {
  const lastActiveRef = useRef(Date.now());
  const lastWriteRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  const broadcastChannelRef = useRef(null);
  const isExpiredRef = useRef(false);
  const lastMousePosRef = useRef({ x: null, y: null });

  // Sync ref with latest onTimeout callback
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Read latest timestamp from localStorage (returns null if uninitialized/missing)
  const getStoredActivityTime = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      if (stored) {
        return clampTimestamp(stored, Date.now());
      }
    } catch {
      // Ignore storage access errors
    }
    return null;
  }, []);

  // Write timestamp to storage and broadcast to other tabs
  const persistActivityTime = useCallback((timestamp) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(timestamp));
    } catch {
      // Ignore quota or private-browsing errors
    }

    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "ACTIVITY", timestamp });
      } catch {
        // Non-fatal if broadcast fails
      }
    }
  }, []);

  // Broadcast logout event to all other tabs and clean storage
  const broadcastLogout = useCallback(() => {
    if (typeof window === "undefined") return;
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "LOGOUT" });
      } catch {
        // Ignore broadcast failure
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY_LOGOUT_BROADCAST, String(Date.now()));
      localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
    } catch {
      // Ignore storage failure
    }
  }, []);

  // Check inactivity state and handle expiration
  const checkInactivity = useCallback(() => {
    if (isExpiredRef.current) return;

    const now = Date.now();
    const storedTime = getStoredActivityTime();
    const effectiveLastActive = Math.max(lastActiveRef.current || 0, storedTime || 0);
    lastActiveRef.current = effectiveLastActive;

    const state = calculateInactivityState({
      lastActiveTime: effectiveLastActive,
      now,
    });

    if (state.isExpired) {
      isExpiredRef.current = true;
      broadcastLogout();
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      }
    }
  }, [getStoredActivityTime, broadcastLogout]);

  // Record active user interaction (throttled write)
  const recordActivity = useCallback(() => {
    if (!isActive || isExpiredRef.current) return;

    const now = Date.now();
    const storedTime = getStoredActivityTime();
    const effectiveLastActive = Math.max(lastActiveRef.current || 0, storedTime || 0);

    // Session resurrection guard: if already expired (e.g. computer woke up from sleep),
    // do not refresh activity timestamp. Expire immediately.
    const state = calculateInactivityState({
      lastActiveTime: effectiveLastActive,
      now,
    });

    if (state.isExpired) {
      isExpiredRef.current = true;
      broadcastLogout();
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      }
      return;
    }

    lastActiveRef.current = now;

    if (!shouldThrottleWrite({ lastWriteTime: lastWriteRef.current, now, throttleMs: 5000 })) {
      lastWriteRef.current = now;
      persistActivityTime(now);
    }
  }, [isActive, getStoredActivityTime, persistActivityTime, broadcastLogout]);

  // Initialize BroadcastChannel and multi-tab listeners
  useEffect(() => {
    if (!isActive) {
      isExpiredRef.current = false;
      return undefined;
    }

    isExpiredRef.current = false;
    const now = Date.now();
    const storedTime = getStoredActivityTime();

    if (storedTime === null) {
      // Fresh authentication session
      lastActiveRef.current = now;
      lastWriteRef.current = now;
      persistActivityTime(now);
    } else {
      const state = calculateInactivityState({ lastActiveTime: storedTime, now });
      if (state.isExpired) {
        // Stored session has timed out due to inactivity -> expire immediately
        isExpiredRef.current = true;
        broadcastLogout();
        if (onTimeoutRef.current) {
          onTimeoutRef.current();
        }
        return undefined;
      }

      lastActiveRef.current = storedTime;
      lastWriteRef.current = storedTime;
    }

    // Set up BroadcastChannel if supported
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
        broadcastChannelRef.current = channel;

        channel.onmessage = (event) => {
          if (!event?.data) return;
          if (event.data.type === "ACTIVITY" && event.data.timestamp) {
            const clamped = clampTimestamp(event.data.timestamp, Date.now());
            if (clamped) {
              lastActiveRef.current = Math.max(lastActiveRef.current, clamped);
            }
          } else if (event.data.type === "LOGOUT") {
            if (!isExpiredRef.current) {
              isExpiredRef.current = true;
              if (onTimeoutRef.current) onTimeoutRef.current();
            }
          }
        };
      } catch {
        // Fallback to storage event
      }
    }

    // Storage event listener for cross-tab sync
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY_LAST_ACTIVITY && event.newValue) {
        const clamped = clampTimestamp(event.newValue, Date.now());
        if (clamped) {
          lastActiveRef.current = Math.max(lastActiveRef.current, clamped);
        }
      } else if (event.key === STORAGE_KEY_LOGOUT_BROADCAST) {
        if (!isExpiredRef.current) {
          isExpiredRef.current = true;
          if (onTimeoutRef.current) onTimeoutRef.current();
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, [isActive, getStoredActivityTime, persistActivityTime, broadcastLogout]);

  // Event listeners for user interaction
  useEffect(() => {
    if (!isActive) return undefined;

    const handleExplicitInteraction = () => {
      recordActivity();
    };

    // Passive DOM listeners for explicit interactions
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, handleExplicitInteraction, { passive: true }));

    // Throttled mouse movement with optical jitter rejection (< 5px delta)
    let mouseThrottleTimeout = null;
    const handleMouseMove = (e) => {
      if (e.clientX === undefined || e.clientY === undefined) return;
      const lastPos = lastMousePosRef.current;
      if (lastPos.x !== null && lastPos.y !== null) {
        const dx = Math.abs(e.clientX - lastPos.x);
        const dy = Math.abs(e.clientY - lastPos.y);
        if (dx < 5 && dy < 5) return;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (!mouseThrottleTimeout) {
        mouseThrottleTimeout = setTimeout(() => {
          mouseThrottleTimeout = null;
          recordActivity();
        }, 1000);
      }
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleExplicitInteraction));
      window.removeEventListener("mousemove", handleMouseMove);
      if (mouseThrottleTimeout) clearTimeout(mouseThrottleTimeout);
    };
  }, [isActive, recordActivity]);

  // Periodic heartbeat timer to check elapsed idle time
  // Also binds visibilitychange, focus, and pageshow to immediately check upon wake/tab switch
  useEffect(() => {
    if (!isActive) return undefined;

    // Run check on interval (1000ms)
    const intervalId = setInterval(checkInactivity, 1000);

    const handleWakeOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      checkInactivity();
    };

    window.addEventListener("focus", handleWakeOrFocus);
    window.addEventListener("pageshow", handleWakeOrFocus);
    document.addEventListener("visibilitychange", handleWakeOrFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleWakeOrFocus);
      window.removeEventListener("pageshow", handleWakeOrFocus);
      document.removeEventListener("visibilitychange", handleWakeOrFocus);
    };
  }, [isActive, checkInactivity]);

  return {
    isExpired: isExpiredRef.current,
  };
}
