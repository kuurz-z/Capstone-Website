import { useState, useEffect, useRef, useCallback } from "react";
import { reservationApi } from "../../../shared/api/reservationApi.js";

const INACTIVITY_WARNING_MS = 25 * 60 * 1000; // 25 minutes
const TOTAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const COUNTDOWN_SECONDS = 300; // 5 minutes (300 seconds)

/**
 * Calculates initial warning and countdown state on mount or refresh.
 * Guaranteed to return safe inactive defaults if isActive is false or reservationId is missing.
 */
export function calculateInitialInactivityState({
  reservationId,
  updatedAt,
  isActive = false,
  now = Date.now(),
}) {
  if (!isActive || !reservationId) {
    return {
      initialWarning: false,
      initialSeconds: COUNTDOWN_SECONDS,
      initialLastActive: now,
      isAlreadyExpired: false,
    };
  }

  let lastActive = now;
  let serverTime = null;
  let storedTime = null;

  if (updatedAt) {
    const parsed = new Date(updatedAt).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) {
      serverTime = parsed;
    }
  }

  const storageKey = reservationId ? `res_last_activity_${reservationId}` : null;
  if (storageKey && typeof window !== "undefined") {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed > 0) {
        storedTime = parsed;
      }
    }
  }

  if (serverTime && storedTime) {
    // Pick the most recent activity recorded (either server sync or client interaction)
    lastActive = Math.min(now, Math.max(serverTime, storedTime));
  } else if (serverTime) {
    lastActive = Math.min(now, serverTime);
  } else if (storedTime) {
    lastActive = Math.min(now, storedTime);
  }

  const elapsedMs = Math.max(0, now - lastActive);

  // If already >= 30 minutes, expired
  if (elapsedMs >= TOTAL_TIMEOUT_MS) {
    return {
      initialWarning: true,
      initialSeconds: 0,
      initialLastActive: lastActive,
      isAlreadyExpired: true,
    };
  }

  // If between 25 and 30 minutes, warning is active with remaining seconds
  if (elapsedMs >= INACTIVITY_WARNING_MS) {
    const remainingSecs = Math.max(0, Math.floor((TOTAL_TIMEOUT_MS - elapsedMs) / 1000));
    return {
      initialWarning: true,
      initialSeconds: remainingSecs,
      initialLastActive: lastActive,
      isAlreadyExpired: false,
    };
  }

  // Under 25 minutes, normal mode
  return {
    initialWarning: false,
    initialSeconds: COUNTDOWN_SECONDS,
    initialLastActive: lastActive,
    isAlreadyExpired: false,
  };
}

/**
 * useReservationInactivity Hook
 *
 * Tracks applicant idle time on reservation pages.
 * Supports persistence across page reloads and browser restarts using server updatedAt and localStorage.
 * Triggers an extensible warning modal at 25 minutes.
 * If no response within the 5-minute countdown (30 mins total), invokes onExpired.
 */
export function useReservationInactivity({
  reservationId,
  updatedAt,
  isActive = false,
  onExpired,
}) {
  const getStorageKey = () => (reservationId ? `res_last_activity_${reservationId}` : null);

  const initialState = calculateInitialInactivityState({
    reservationId,
    updatedAt,
    isActive,
  });

  const [isWarningOpen, setIsWarningOpen] = useState(initialState.initialWarning);
  const [secondsRemaining, setSecondsRemaining] = useState(initialState.initialSeconds);
  const [isExtending, setIsExtending] = useState(false);
  const lastActivityRef = useRef(initialState.initialLastActive);
  const lastStorageWriteRef = useRef(initialState.initialLastActive);
  const countdownIntervalRef = useRef(null);
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  // Clean up timer and stale storage when hold is not active or reservation is confirmed/secured
  useEffect(() => {
    if (!isActive || !reservationId) {
      setIsWarningOpen(false);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      const storageKey = getStorageKey();
      if (storageKey && typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    }
  }, [isActive, reservationId]);

  // If already expired on mount, trigger immediately ONLY when hold is actively monitored
  useEffect(() => {
    if (isActive && reservationId && initialState.isAlreadyExpired) {
      if (onExpiredRef.current) onExpiredRef.current();
    }
  }, [isActive, reservationId, initialState.isAlreadyExpired]);

  // Sync server updatedAt when it changes (e.g. after draft autosave)
  useEffect(() => {
    if (!isActive || !reservationId) return;
    if (updatedAt) {
      const serverTime = new Date(updatedAt).getTime();
      if (!Number.isNaN(serverTime)) {
        lastActivityRef.current = Math.max(lastActivityRef.current, serverTime);
        lastStorageWriteRef.current = Math.max(lastStorageWriteRef.current, serverTime);
        const storageKey = getStorageKey();
        if (storageKey && typeof window !== "undefined") {
          localStorage.setItem(storageKey, String(lastActivityRef.current));
        }
      }
    }
  }, [isActive, updatedAt, reservationId]);

  const recordActivity = useCallback(() => {
    if (!isActive || !reservationId) return;
    if (!isWarningOpen) {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastStorageWriteRef.current >= 5000) {
        lastStorageWriteRef.current = now;
        const storageKey = getStorageKey();
        if (storageKey && typeof window !== "undefined") {
          localStorage.setItem(storageKey, String(now));
        }
      }
    }
  }, [isActive, isWarningOpen, reservationId]);

  const resetActivity = useCallback(() => {
    if (!isActive || !reservationId) return;
    const now = Date.now();
    lastActivityRef.current = now;
    lastStorageWriteRef.current = now;
    const storageKey = getStorageKey();
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(storageKey, String(now));
    }
    if (!isWarningOpen) {
      setSecondsRemaining(COUNTDOWN_SECONDS);
    }
  }, [isActive, isWarningOpen, reservationId]);

  // Activity listeners to track real interaction
  useEffect(() => {
    if (!isActive || !reservationId) return;

    const handleUserInteraction = () => {
      recordActivity();
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, handleUserInteraction, { passive: true }));

    const checkInterval = setInterval(() => {
      const elapsedMs = Date.now() - lastActivityRef.current;
      if (elapsedMs >= INACTIVITY_WARNING_MS && !isWarningOpen) {
        setIsWarningOpen(true);
        const remainingSecs = Math.max(0, Math.floor((TOTAL_TIMEOUT_MS - elapsedMs) / 1000));
        setSecondsRemaining(remainingSecs || COUNTDOWN_SECONDS);
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserInteraction));
      clearInterval(checkInterval);
    };
  }, [isActive, reservationId, isWarningOpen, recordActivity]);

  // Warning modal countdown
  useEffect(() => {
    if (!isActive || !reservationId || !isWarningOpen) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          setIsWarningOpen(false);
          const storageKey = getStorageKey();
          if (storageKey && typeof window !== "undefined") {
            localStorage.removeItem(storageKey);
          }
          if (isActive && onExpiredRef.current) onExpiredRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isActive, isWarningOpen, reservationId]);

  const extendHold = async () => {
    setIsExtending(true);
    try {
      if (reservationApi.sendHeartbeat) {
        await reservationApi.sendHeartbeat(reservationId);
      }
    } catch {
      // Non-fatal, local timer still resets
    } finally {
      setIsExtending(false);
      setIsWarningOpen(false);
      const now = Date.now();
      lastActivityRef.current = now;
      const storageKey = getStorageKey();
      if (storageKey && typeof window !== "undefined") {
        localStorage.setItem(storageKey, String(now));
      }
      setSecondsRemaining(COUNTDOWN_SECONDS);
    }
  };

  const releaseNow = () => {
    setIsWarningOpen(false);
    const storageKey = getStorageKey();
    if (storageKey && typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
    if (onExpired) onExpired();
  };

  return {
    isWarningOpen,
    secondsRemaining,
    isExtending,
    extendHold,
    releaseNow,
    resetActivity,
  };
}
