import React, { useState, useEffect, useMemo, useRef } from "react";
import { Clock, AlertTriangle } from "lucide-react";

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
  compact = false,
  card = false,
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

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const initial = calculateSecondsLeft();
    setSecondsLeft(initial);
    if (initial <= 0) {
      setHasExpired(true);
      if (onExpireRef.current) onExpireRef.current();
      return;
    }

    setHasExpired(false);

    const timer = setInterval(() => {
      const remaining = calculateSecondsLeft();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        setHasExpired(true);
        if (onExpireRef.current) onExpireRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isWarning = secondsLeft > 0 && secondsLeft < 300; // Under 5 minutes

  if (compact) {
    return (
      <div
        role="timer"
        aria-live="polite"
        className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 ${className}`}
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

  const containerClasses = card
    ? "w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100 transition-colors"
    : "w-full py-2 bg-transparent text-slate-900 dark:text-slate-100 transition-colors";

  return (
    <div
      role="region"
      aria-label={title}
      className={`${containerClasses} ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full mt-1 sm:mt-0 flex-shrink-0 ${
              hasExpired ? "bg-rose-500" : isWarning ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</span>
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
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {hasExpired ? "This payment window has expired." : subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span
              className={
                hasExpired ? "text-rose-600 dark:text-rose-400" : isWarning ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"
              }
            >
              {hasExpired ? "00:00" : formattedTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
