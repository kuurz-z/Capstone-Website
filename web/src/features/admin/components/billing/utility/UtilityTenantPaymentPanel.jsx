import React from "react";
import {
  Users,
  Calendar,
  Send,
  LoaderCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CheckCheck,
  Info,
  DollarSign,
} from "lucide-react";
import {
  fmtCurrency,
  fmtNumber,
  fmtShortDate,
  getInitials,
  getCycleLabel,
  getDisplayStatus,
  getDisplayStatusLabel,
  getDisplayStatusIcon,
  getHistoryStatusClasses,
  formatPaymentMethodLabel,
  resolvePaymentDetails,
  EMPTY_VALUE,
} from "./utilityConstants";
import { ExportButtons } from "../../../pages/analyticsTabShared";

export default function UtilityTenantPaymentPanel({
  selectedPeriod,
  monitoringResult,
  utilityType,
  onSendReminder,
  onBatchSendReminder,
  activeNoticeKey,
  onExportCsv,
  onExportPdf,
  isExporting,
  isBatchReminding = false,
  lastRemindedByBillId = {},
}) {
  const unit = utilityType === "electricity" ? "kWh" : (monitoringResult?.calculationVersion === "water-meter-v1" ? "m³" : "legacy basis");
  const tenantSummaries = monitoringResult?.tenantSummaries || [];

  const pendingReminderTenants = tenantSummaries.filter(
    (t) =>
      t.billId &&
      (t.canSendReminder ||
        t.canSendPenaltyNotice ||
        (t.billStatus &&
          ["pending", "partially-paid", "overdue"].includes(t.billStatus))),
  );

  const formatReminderTimestamp = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    const isToday = new Date().toDateString() === date.toDateString();
    if (isToday) {
      const timeStr = date.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `Reminded today (${timeStr})`;
    }
    return `Reminded on ${date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-card-foreground flex items-center gap-1.5">
              <Users size={14} className="shrink-0 text-sky-600 dark:text-sky-400" />
              Tenant Utility Allocation & Payments
            </h3>
            {selectedPeriod && (
              <span className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {getCycleLabel(selectedPeriod)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Review individual tenant consumption shares, pro-rata split calculations, payment receipts, and send automated reminders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingReminderTenants.length > 0 && onBatchSendReminder && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0A1628] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#13243D] active:scale-[0.98] transition-all disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              onClick={() => onBatchSendReminder(pendingReminderTenants)}
              disabled={isBatchReminding}
              title={`Send payment reminders to ${pendingReminderTenants.length} unpaid tenant${pendingReminderTenants.length === 1 ? "" : "s"}`}
            >
              {isBatchReminding ? (
                <LoaderCircle size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              <span>Remind All Pending ({pendingReminderTenants.length})</span>
            </button>
          )}

          {selectedPeriod && (
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${getHistoryStatusClasses(getDisplayStatus(selectedPeriod))}`}
            >
              {getDisplayStatusIcon(getDisplayStatus(selectedPeriod))}
              {getDisplayStatusLabel(selectedPeriod)}
            </span>
          )}

          <ExportButtons
            onCsv={onExportCsv}
            onPdf={onExportPdf}
            loading={isExporting}
            disabled={tenantSummaries.length === 0}
          />
        </div>
      </div>

      {/* Table Content */}
      {!selectedPeriod ? (
        <div className="flex flex-col items-center justify-center py-14 min-h-[280px] text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
          <Calendar size={28} className="text-sky-500 dark:text-sky-400" />
          <p className="mt-2 text-sm font-semibold text-card-foreground">No Billing Cycle Selected</p>
          <p className="mt-0.5 text-xs">Select a billing cycle from the Cycle History tab to monitor tenant breakdown.</p>
        </div>
      ) : !monitoringResult ? (
        <div className="flex flex-col items-center justify-center py-14 min-h-[280px] text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
          <Info size={28} className="text-amber-500 dark:text-amber-400" />
          <p className="mt-2 text-sm font-semibold text-card-foreground">Awaiting Cycle Calculation</p>
          <p className="mt-0.5 text-xs">Tenant bill and payment details appear after this cycle is closed or revised.</p>
        </div>
      ) : tenantSummaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 min-h-[280px] text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
          <Users size={28} className="text-slate-400 dark:text-slate-500" />
          <p className="mt-2 text-sm font-semibold text-card-foreground">No Covered Tenants</p>
          <p className="mt-0.5 text-xs">No active tenants were assigned to this room during the selected billing cycle.</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] font-bold uppercase tracking-[0.10em] text-muted-foreground">
                <th className="py-2.5 px-3">Tenant Profile</th>
                <th className="py-2.5 px-3 text-right">Usage Share</th>
                <th className="py-2.5 px-3 text-right">Statement & Balance</th>
                <th className="py-2.5 px-3">Status & Due Date</th>
                <th className="py-2.5 px-3">Payment Details</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {tenantSummaries.map((tenant, idx) => {
                const isPaid = tenant.billStatus === "paid";
                const isOverdue = tenant.daysOverdue > 0 || tenant.billStatus === "overdue";
                const isPartial = tenant.billStatus === "partially-paid" || tenant.billStatus === "partially_paid";
                const noticeLoading = activeNoticeKey?.startsWith(`${tenant.billId}:`);
                const paymentInfo = resolvePaymentDetails(tenant.bill, tenant.latestPayment);
                const lastRemindedTime = tenant.billId && lastRemindedByBillId[tenant.billId];
                const reminderTimeText = formatReminderTimestamp(lastRemindedTime);

                return (
                  <tr
                    key={`${selectedPeriod.id}-tenant-${idx}`}
                    className="transition-colors hover:bg-muted/30"
                  >
                    {/* Tenant Profile */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-white dark:bg-[#D4AF37] dark:text-[#0A1628] border border-[#0A1628]/20 dark:border-[#D4AF37]/40 text-[10px] font-bold shadow-xs">
                          {getInitials(tenant.tenantName)}
                        </div>
                        <div>
                          <p className="font-bold text-card-foreground text-xs">
                            {tenant.tenantName || EMPTY_VALUE}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tenant.tenantEmail || EMPTY_VALUE}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Usage Share */}
                    <td className="py-3 px-3 text-right font-medium text-card-foreground whitespace-nowrap">
                      <div>
                        <span>{fmtNumber(tenant.totalUsage, 2)}</span>{" "}
                        <span className="text-[10px] text-muted-foreground uppercase">{unit}</span>
                      </div>
                      {(tenant.isProRata || tenant.daysInCycle != null) && (
                        <div className="mt-0.5">
                          <span
                            className="rounded border border-slate-200 dark:border-slate-700 px-1 py-0.2 text-[9px] font-semibold text-slate-600 dark:text-slate-300"
                            title={`Pro-rata share: ${tenant.daysInCycle ?? "—"} active days in cycle`}
                          >
                            {tenant.daysInCycle ? `${tenant.daysInCycle}d pro-rata` : "pro-rata"}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Statement & Remaining Balance */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <p className="font-bold text-card-foreground">
                        {fmtCurrency(tenant.billAmount)}
                      </p>
                      <p
                        className={`text-[11px] font-semibold ${
                          Number(tenant.remainingAmount || 0) > 0
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        Bal: {fmtCurrency(tenant.remainingAmount)}
                      </p>
                    </td>

                    {/* Status Badge & Due Date */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${getHistoryStatusClasses(tenant.billStatus)}`}
                        >
                          {getDisplayStatusIcon(tenant.billStatus)}
                          {tenant.billStatus ? String(tenant.billStatus).replace(/-/g, " ") : "Draft"}
                        </span>
                        {tenant.dueDate && (
                          <p className="text-[11px] text-muted-foreground">
                            Due: {fmtShortDate(tenant.dueDate)}
                          </p>
                        )}
                        {tenant.daysOverdue > 0 && (
                          <p className="text-[10px] font-bold text-red-600 dark:text-red-400">
                            {tenant.daysOverdue}d overdue
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Payment Details */}
                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      {paymentInfo.paymentRecordedAt ? (
                        <div>
                          <p className="font-medium text-card-foreground text-xs">
                            {paymentInfo.paymentFallbackLabel || formatPaymentMethodLabel(tenant.paymentMethod)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Settled: {fmtShortDate(paymentInfo.paymentRecordedAt)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-1">
                        {tenant.billId &&
                        (tenant.canSendPenaltyNotice ||
                          tenant.canSendReminder ||
                          (!isPaid && tenant.billStatus)) ? (
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-card px-3 py-1 text-xs font-semibold text-card-foreground hover:bg-muted active:scale-[0.98] transition-all disabled:opacity-40 ${
                              tenant.canSendPenaltyNotice
                                ? "text-rose-700 dark:text-rose-400"
                                : "font-bold text-slate-900 dark:text-slate-100"
                            }`}
                            onClick={() =>
                              onSendReminder(
                                tenant.billId,
                                tenant.canSendPenaltyNotice
                                  ? "penalty"
                                  : tenant.daysOverdue > 0
                                    ? "overdue"
                                    : "reminder",
                              )
                            }
                            disabled={noticeLoading}
                            title={
                              tenant.canSendPenaltyNotice
                                ? "Send late penalty notice"
                                : "Send payment reminder to tenant"
                            }
                          >
                            {noticeLoading ? (
                              <LoaderCircle size={12} className="animate-spin" />
                            ) : (
                              <Send size={11} className="text-slate-600 dark:text-slate-400" />
                            )}
                            <span>
                              {tenant.canSendPenaltyNotice
                                ? "Penalty Notice"
                                : tenant.daysOverdue > 0
                                  ? "Overdue Notice"
                                  : "Remind"}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {isPaid ? "Settled" : "Statement Ready"}
                          </span>
                        )}

                        {reminderTimeText && (
                          <span className="text-[10px] text-muted-foreground/80 font-medium">
                            {reminderTimeText}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
