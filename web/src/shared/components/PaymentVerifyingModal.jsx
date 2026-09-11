import React, { useState, useEffect } from "react";
import { Loader2, CheckCircle2, ShieldCheck, HelpCircle } from "lucide-react";

/**
 * PaymentVerifyingModal - Live transparent verification dialog displayed during
 * PayMongo checkout redirect return. Replaces blank spinners with clear status.
 */
export default function PaymentVerifyingModal({
  show = false,
  step = 1, // 1: Contacting PayMongo, 2: Confirming payment status, 3: Updating account records
  title = "Verifying Your Payment",
  onClose,
}) {
  const [showTimeoutNote, setShowTimeoutNote] = useState(false);

  useEffect(() => {
    if (!show) {
      setShowTimeoutNote(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowTimeoutNote(true);
    }, 10000); // 10s reassuring timeout

    return () => clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  const steps = [
    { id: 1, label: "Contacting PayMongo payment gateway" },
    { id: 2, label: "Confirming payment status with bank / e-wallet" },
    { id: 3, label: "Updating your account records & receipt" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verifying-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 id="verifying-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Please do not close or refresh this page.
            </p>
          </div>
        </div>

        <div className="space-y-3 py-2 border-y border-slate-100 dark:border-slate-800/80">
          {steps.map((s) => {
            const isDone = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3 text-xs">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-slate-700 dark:text-slate-300 animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 flex-shrink-0" />
                )}
                <span
                  className={
                    isDone
                      ? "text-slate-500 line-through dark:text-slate-400 font-medium"
                      : isCurrent
                      ? "text-slate-900 dark:text-slate-100 font-bold"
                      : "text-slate-400 dark:text-slate-500"
                  }
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {showTimeoutNote ? (
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              Taking longer than usual?
            </div>
            <p className="leading-relaxed">
              Your payment is processing safely. If your payment was deducted, your records will update automatically shortly.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
            Securing transaction with 256-bit encryption...
          </p>
        )}
      </div>
    </div>
  );
}
