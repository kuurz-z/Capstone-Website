import { useMemo } from "react";

export default function ReservationStatusChart({ reservationStatus }) {
  const total = useMemo(
    () =>
      reservationStatus.approved +
      reservationStatus.pending +
      reservationStatus.rejected,
    [reservationStatus],
  );

  const approvedPercent = total
    ? ((reservationStatus.approved / total) * 100).toFixed(0)
    : "0";
  const pendingPercent = total
    ? ((reservationStatus.pending / total) * 100).toFixed(0)
    : "0";
  const rejectedPercent = total
    ? ((reservationStatus.rejected / total) * 100).toFixed(0)
    : "0";

  const donutStyle = {
    background: `conic-gradient(
      #10b981 0% ${approvedPercent}%,
      #f59e0b ${approvedPercent}% ${Number(approvedPercent) + Number(pendingPercent)}%,
      #ef4444 ${Number(approvedPercent) + Number(pendingPercent)}% 100%
    )`,
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Reservation Status</h3>
        <p className="mt-1 text-sm text-slate-500">Overview of all reservations</p>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[180px_1fr]">
        <div className="mx-auto">
          <div
            className="relative h-40 w-40 rounded-full"
            style={donutStyle}
            role="img"
            aria-label={`Reservation status chart: ${approvedPercent}% approved, ${pendingPercent}% pending, ${rejectedPercent}% rejected`}
          >
            <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white">
              <div className="text-center">
                <p className="text-2xl font-semibold text-slate-900">{total}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-slate-700">Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">
                {reservationStatus.approved}
              </span>
              <span className="text-xs text-slate-500">{approvedPercent}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-slate-700">Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">
                {reservationStatus.pending}
              </span>
              <span className="text-xs text-slate-500">{pendingPercent}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-slate-700">Rejected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">
                {reservationStatus.rejected}
              </span>
              <span className="text-xs text-slate-500">{rejectedPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
