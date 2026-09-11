import React, { useState, useEffect } from "react";
import { reservationApi } from "../../../shared/api/reservationApi.js";

/**
 * CheckoutLockBanner - Displays a live 30-minute lock countdown banner during bed reservation checkout.
 * Enforces solid flat colors (NO gradients) with 1px border.
 */
export default function CheckoutLockBanner({
  lockId,
  roomId,
  bedId,
  expiresAt,
  initialTimeRemainingSeconds = 900,
  onLockExpired,
}) {
  const calculateRemaining = () => {
    if (expiresAt) {
      const expMs = new Date(expiresAt).getTime();
      return Math.max(0, Math.floor((expMs - Date.now()) / 1000));
    }
    return initialTimeRemainingSeconds;
  };

  const [secondsLeft, setSecondsLeft] = useState(calculateRemaining);

  useEffect(() => {
    setSecondsLeft(calculateRemaining());
  }, [expiresAt, initialTimeRemainingSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (onLockExpired) onLockExpired();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (onLockExpired) onLockExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft <= 0, onLockExpired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isWarning = secondsLeft < 300;

  return (
    <div
      role="region"
      aria-label="Bed Reservation Lock Timer"
      className="w-full py-2.5 mb-2 bg-transparent text-slate-800 dark:text-slate-200 text-sm font-medium transition-colors"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isWarning ? "bg-amber-500" : "bg-emerald-500"}`} />
          <span>
            Bed checkout locked for Room <strong>{roomId}</strong> (Bed <strong>{bedId}</strong>)
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm font-bold">
          <span className="text-slate-600 dark:text-slate-400 font-sans font-medium text-xs">Time Remaining:</span>
          <span className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 shadow-xs">
            {secondsLeft > 0 ? formattedTime : "EXPIRED"}
          </span>
        </div>
      </div>
    </div>
  );
}
