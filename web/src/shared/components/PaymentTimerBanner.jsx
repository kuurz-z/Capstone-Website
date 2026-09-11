import React, { useState, useEffect, useMemo } from "react";
import { Clock, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * PaymentTimerBanner - Live, accessible 15-minute countdown banner.
 * Strict Lilycrest DMS standards: solid colors, neutral 1px borders, zero gradients.
 */
export default function PaymentTimerBanner({
  expiresAt,
  initialSeconds = 900,
  title = "Payment Session",
  subtitle = "Complete your payment before this session window expires.",
  onExpire,
  onRefresh,
  compact = false,
  className = "",
}) {
  const targetTime = useMemo(() => {
    if (expiresAt) {
      const parsed = new Date(expiresAt).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return Date.now() + initialSeconds * 1000;
  }, [expiresAt, initialSeconds]);

  const calculateSecondsLeft = () => {
    const diff = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
    return diff;
  };

  const [secondsLeft, setSecondsLeft] = useState(calculateSecondsLeft);
  const [hasExpired, setHasExpired] = useState(() => calculateSecondsLeft() <= 0);

  useEffect(() => {
    const initial = calculateSecondsLeft();
    setSecondsLeft(initial);
    if (initial <= 0) {
      setHasExpired(true);
      if (onExpire) onExpire();
      return;
    }

    setHasExpired(false);

    const timer = setInterval(() => {
      const remaining = calculateSecondsLeft();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        setHasExpired(true);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime, onExpire]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isWarning = secondsLeft > 0 && secondsLeft < 300; // Under 5 minutes

  if (compact) {
    return (
      <div
        role="timer"
        aria-live="polite"
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-800 dark:text-slate-200 ${className}`}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            hasExpired ? "bg-rose-500" : isWarning ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
          }`}
        />
        <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        <span className="font-mono">{hasExpired ? "00:00" : formattedTime}</span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={title}
      className={`w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100 transition-colors ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full mt-1 sm:mt-0 flex-shrink-0 ${
              hasExpired ? "bg-rose-500" : isWarning ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">{title}</span>
              {isWarning && !hasExpired && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Expiring Soon
                </span>
              )}
              {hasExpired && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  Hold Expired
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {hasExpired ? "This payment window has expired. Refresh to check room hold." : subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs">
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span
              className={`font-mono text-sm font-bold ${
                hasExpired ? "text-rose-600 dark:text-rose-400" : isWarning ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {hasExpired ? "00:00" : formattedTime}
            </span>
          </div>

          {hasExpired && onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Session</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
