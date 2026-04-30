import { X, Check, AlertTriangle, Download } from "lucide-react";

const BillingCycleDetailModal = ({
 isOpen,
 onClose,
 period,
 result,
 utilityType,
 statusLabel,
 isReadOnly,
 formatters,
 eventTypeLabels,
 onExport,
}) => {
 if (!isOpen || !period) return null;

 const {
 fmtCurrency,
 fmtNumber,
 fmtShortDate,
 getSegmentPeriodLabel,
 } = formatters;

 const unitLabel = utilityType === "electricity" ? "kWh" : "cu.m.";
 const periodEnd = period.endDate || period.targetCloseDate;
 const rangeLabel = `${fmtShortDate(period.startDate)} - ${
 fmtShortDate(periodEnd) || "Ongoing"
 }`;
 const summaryTotalLabel =
 utilityType === "electricity" ? "TOTAL KWH" : "TOTAL CU.M.";

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4"
 role="dialog"
 aria-modal="true"
 onClick={onClose}
 >
 <div
 className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
 onClick={(event) => event.stopPropagation()}
 >
 <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
 <div>
 <h2 className="text-base font-semibold text-foreground">
 Billing Cycle History
 </h2>
 <p className="mt-1 text-xs text-muted-foreground">
 {rangeLabel} {statusLabel ? `• ${statusLabel}` : ""}
 </p>
 <div className="mt-3 flex flex-wrap gap-2">
 {statusLabel ? (
 <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-info-dark">
 {statusLabel}
 </span>
 ) : null}
 {isReadOnly ? (
 <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
 Read-only
 </span>
 ) : null}
 </div>
 </div>
 <button
 type="button"
 className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-card-foreground"
 onClick={onClose}
 aria-label="Close billing cycle history"
 >
 <X size={16} />
 </button>
 </div>

 <div className="space-y-6 px-6 pb-6 pt-4">
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <div className="rounded-xl border border-border bg-card px-4 py-3">
 <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 {summaryTotalLabel}
 </p>
 <p className="mt-2 text-lg font-semibold text-foreground">
 {result ? fmtNumber(result.computedTotalUsage, 2) : "-"}
 </p>
 </div>
 <div className="rounded-xl border border-border bg-card px-4 py-3">
 <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 ROOM COST
 </p>
 <p className="mt-2 text-lg font-semibold text-foreground">
 {result
 ? fmtCurrency(result.totalRoomCost || result.computedTotalCost)
 : "-"}
 </p>
 </div>
 <div className="rounded-xl border border-border bg-card px-4 py-3">
 <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 CURRENT RATE
 </p>
 <p className="mt-2 text-lg font-semibold text-foreground">
 {result ? fmtCurrency(result.ratePerUnit) : "-"}
 </p>
 <p className="text-[11px] text-muted-foreground">/{unitLabel}</p>
 </div>
 <div className="rounded-xl border border-border bg-card px-4 py-3">
 <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 SEGMENTS
 </p>
 <p className="mt-2 text-lg font-semibold text-foreground">
 {result?.segments?.length || 0}
 </p>
 </div>
 </div>

 <div className="rounded-xl border border-border bg-card">
 <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
 <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
 Segment Breakdown
 {result?.verified ? (
 <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-success-dark">
 <Check size={12} /> Verified
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-warning-dark">
 <AlertTriangle size={12} /> Unverified
 </span>
 )}
 </div>
 </div>

 <div className="space-y-4 p-4">
 {(result?.segments || []).length === 0 ? (
 <div className="rounded-lg border border-dashed border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
 Segment details are not available for this billing cycle yet.
 </div>
 ) : (
 (result?.segments || []).map((seg, index) => (
 <div
 key={`${period.id}-segment-${index}`}
 className="rounded-lg border border-border"
 >
 <div className="rounded-t-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-dark">
 No. of occupants in the room: {seg.activeTenantCount ?? 0}
 </div>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
 <thead className="bg-muted text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
 <tr>
 <th className="px-4 py-2 text-left">Item</th>
 <th className="px-4 py-2 text-center">Date</th>
 <th className="px-4 py-2 text-right">{unitLabel}</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 text-sm text-card-foreground">
 <tr>
 <td className="px-4 py-2 text-muted-foreground">1st reading</td>
 <td className="px-4 py-2 text-center">
 {seg.startDate
 ? new Date(seg.startDate).toLocaleDateString()
 : (seg.periodLabel || "").split(/\s*[-–]\s*/)[0] ||
 "-"}
 </td>
 <td className="px-4 py-2 text-right">
 {fmtNumber(seg.readingFrom, 2)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground">2nd reading</td>
 <td className="px-4 py-2 text-center">
 {seg.endDate
 ? new Date(seg.endDate).toLocaleDateString()
 : (seg.periodLabel || "").split(/\s*[-–]\s*/)[1] ||
 "-"}
 </td>
 <td className="px-4 py-2 text-right">
 {fmtNumber(seg.readingTo, 2)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground">Segment period</td>
 <td className="px-4 py-2 text-center" colSpan={2}>
 {getSegmentPeriodLabel(seg)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground">Boundary events</td>
 <td className="px-4 py-2 text-center" colSpan={2}>
 {(eventTypeLabels?.[seg.startEventType] ||
 seg.startEventType ||
 "Regular") +
" to" +
 (eventTypeLabels?.[seg.endEventType] ||
 seg.endEventType ||
 "Regular")}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground">
 Total consumption
 </td>
 <td className="px-4 py-2 text-center"></td>
 <td className="px-4 py-2 text-right">
 {fmtNumber(seg.unitsConsumed, 2)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
 Segment total cost
 </td>
 <td className="px-4 py-2 text-right font-semibold">
 {fmtCurrency(seg.totalCost)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
 Amount due ({fmtCurrency(result?.ratePerUnit)} / {unitLabel})
 per person
 </td>
 <td className="px-4 py-2 text-right font-semibold">
 {fmtCurrency(seg.sharePerTenantCost)}
 </td>
 </tr>
 <tr>
 <td className="px-4 py-2 text-muted-foreground">Covered tenants</td>
 <td className="px-4 py-2 text-center" colSpan={2}>
 {seg.coveredTenantNames?.length
 ? seg.coveredTenantNames.join(", ")
 : "No active tenant"}
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 <div className="rounded-xl border border-border bg-card">
 <div className="border-b border-border px-4 py-3">
 <p className="text-sm font-semibold text-card-foreground">Covered Tenants</p>
 </div>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
 <thead className="bg-muted text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
 <tr>
 <th className="px-4 py-2 text-left">Tenant Name</th>
 <th className="px-4 py-2 text-left">Duration Range</th>
 <th className="px-4 py-2 text-right">Total {unitLabel}</th>
 <th className="px-4 py-2 text-right">Bill Amount</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 text-sm text-card-foreground">
 {(result?.tenantSummaries || []).length === 0 ? (
 <tr>
 <td
 className="px-4 py-6 text-center text-sm text-muted-foreground"
 colSpan={4}
 >
 No covered tenants for this billing cycle.
 </td>
 </tr>
 ) : (
 (result?.tenantSummaries || []).map((tenant, index) => (
 <tr key={`${period.id}-tenant-${index}`}>
 <td className="px-4 py-2">
 <div className="text-sm font-medium text-card-foreground">
 {tenant.tenantName || "-"}
 </div>
 <div className="text-xs text-muted-foreground">
 {tenant.tenantEmail || "-"}
 </div>
 </td>
 <td className="px-4 py-2">
 {tenant.durationRange || "Ongoing"}
 </td>
 <td className="px-4 py-2 text-right">
 {fmtNumber(tenant.totalUsage, 4)}
 </td>
 <td className="px-4 py-2 text-right font-semibold">
 {fmtCurrency(tenant.billAmount)}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
 <button
 type="button"
 className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
 onClick={onClose}
 >
 Close
 </button>
 <button
 type="button"
 className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted"
 onClick={onExport}
 disabled={!onExport}
 >
 <Download size={14} /> Export
 </button>
 </div>
 </div>
 </div>
 );
};

export default BillingCycleDetailModal;
