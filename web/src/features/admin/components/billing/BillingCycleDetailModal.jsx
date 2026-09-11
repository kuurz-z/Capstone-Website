import WaterBillingTables from '../../../../shared/components/WaterBillingTables';
import { createPortal } from "react-dom";
import {
  X,
  Check,
  AlertTriangle,
  Droplets,
  Zap,
  Home,
  Tag,
  Layers,
  User,
  Calendar,
} from "lucide-react";

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
}) => {
  if (!isOpen || !period) return null;

  const fmtCurrency =
    formatters?.fmtCurrency ||
    ((v) =>
      v != null && !Number.isNaN(Number(v))
        ? `₱${Number(v).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : "-");
  const fmtNumber =
    formatters?.fmtNumber ||
    ((v, d = 2) =>
      v != null && !Number.isNaN(Number(v)) ? Number(v).toFixed(d) : "-");
  const fmtShortDate =
    formatters?.fmtShortDate ||
    ((d) => {
      if (!d) return "-";
      const date = new Date(d);
      return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    });
  const getSegmentPeriodLabel =
    formatters?.getSegmentPeriodLabel ||
    ((seg) =>
      seg?.periodLabel ||
      (seg?.startDate && seg?.endDate
        ? `${new Date(seg.startDate).toLocaleDateString()} - ${new Date(
            seg.endDate,
          ).toLocaleDateString()}`
        : "-"));

  const meterWater = (result?.calculationVersion || period?.calculationVersion) === "water-meter-v1";
  const unitLabel = utilityType === "electricity" ? "kWh" : meterWater ? "m³" : "legacy basis";
  const UtilityIcon = utilityType === "electricity" ? Zap : Droplets;
  const periodEnd = period.endDate || period.targetCloseDate;
  const rangeLabel = `${fmtShortDate(period.startDate)} - ${
    fmtShortDate(periodEnd) || "Ongoing"
  }`;
  const summaryTotalLabel =
    utilityType === "electricity" ? "TOTAL KWH" : meterWater ? "TOTAL m³" : "LEGACY BASIS";

  const computedTotalUsage =
    result?.computedTotalUsage ??
    period?.computedTotalUsage ??
    (period?.endReading != null && period?.startReading != null
      ? Math.max(0, Number(period.endReading) - Number(period.startReading))
      : null);

  const totalRoomCost =
    result?.totalRoomCost ??
    result?.computedTotalCost ??
    period?.computedTotalCost ??
    period?.totalAmount ??
    (utilityType === "electricity" && computedTotalUsage != null &&
    (result?.ratePerUnit ?? period?.ratePerUnit) != null
      ? computedTotalUsage * Number(result?.ratePerUnit ?? period?.ratePerUnit)
      : null);

  const ratePerUnit = result?.ratePerUnit ?? period?.ratePerUnit;
  const segments =
    result?.segments && result.segments.length > 0
      ? result.segments
      : period?.segments || [];
  const isVerified = result?.verified ?? period?.verified ?? false;

  if (!isOpen || !period || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity"
      style={{
        background: "color-mix(in srgb, var(--background) 70%, transparent)",
      }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl transition-all"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Billing Cycle History
              </h2>
              {statusLabel && (
                <span className="inline-flex items-center gap-1.5 rounded border border-border bg-transparent px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  {statusLabel}
                </span>
              )}
              {isReadOnly && (
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Read-only
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar size={13} className="text-muted-foreground" />
              Period Range:{" "}
              <span className="font-semibold text-foreground">{rangeLabel}</span>
            </p>
          </div>

          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close billing cycle history"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 pb-6 pt-5">
          {/* Summary KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: summaryTotalLabel,
                value:
                  computedTotalUsage != null
                    ? fmtNumber(computedTotalUsage, 2)
                    : "-",
                sub: unitLabel,
                icon: UtilityIcon,
                colorClass: "text-sky-600 dark:text-sky-400",
              },
              {
                label: "ROOM COST",
                value:
                  totalRoomCost != null ? fmtCurrency(totalRoomCost) : "-",
                sub: "total for cycle",
                icon: Home,
                colorClass: "text-sky-600 dark:text-sky-400",
              },
              {
                label: utilityType === "water" && !meterWater ? "ORIGINAL ROOM TOTAL" : "SAVED RATE",
                value: ratePerUnit != null ? fmtCurrency(ratePerUnit) : "-",
                sub: utilityType === "water" && !meterWater ? "legacy allocation basis" : `per ${unitLabel}`,
                icon: Tag,
                colorClass: "text-amber-600 dark:text-amber-400",
              },
              {
                label: "SEGMENTS",
                value: segments.length,
                sub: "active segments",
                icon: Layers,
                colorClass: "text-emerald-600 dark:text-emerald-400",
              },
            ].map(({ label, value, sub, icon: Icon, colorClass }) => (
              <div
                key={label}
                className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                    {label}
                  </span>
                  <div
                    className={`flex shrink-0 items-center justify-center ${colorClass}`}
                  >
                    <Icon size={18} />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    {value}
                  </p>
                  {sub && (
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      {sub}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {utilityType === "water" && <WaterBillingTables data={{...period,...result}}/>}
          {/* Segment Breakdown */}
          {utilityType === "electricity" && <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Layers size={15} className="text-muted-foreground" />
                <span>Segment Breakdown</span>
                {isVerified ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check size={12} className="text-emerald-500" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={12} className="text-amber-500" />
                    Unverified
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4 p-4">
              {segments.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <Layers size={18} className="text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Segment details are not available for this billing cycle yet.
                  </p>
                </div>
              ) : (
                segments.map((seg, index) => (
                  <div
                    key={`${period.id || period._id}-segment-${index}`}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    {/* Segment header */}
                    <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
                      <div className="flex items-center gap-2">
                        <User size={13} className="text-muted-foreground" />
                        <span>Room Occupants:</span>
                      </div>
                      <span className="rounded-full bg-card px-2.5 py-0.5 font-bold text-foreground border border-border">
                        {seg.activeTenantCount ?? 0}{" "}
                        {seg.activeTenantCount === 1 ? "occupant" : "occupants"}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {["Item", "Date", unitLabel].map((h, i) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                                style={{
                                  textAlign:
                                    i === 0
                                      ? "left"
                                      : i === 1
                                        ? "center"
                                        : "right",
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm text-foreground">
                          {[
                            {
                              label: "1st reading",
                              date: seg.startDate
                                ? new Date(seg.startDate).toLocaleDateString()
                                : (seg.periodLabel || "").split(/\s*[-–]\s*/)[0] ||
                                  "-",
                              value: fmtNumber(seg.readingFrom, 2),
                            },
                            {
                              label: "2nd reading",
                              date: seg.endDate
                                ? new Date(seg.endDate).toLocaleDateString()
                                : (seg.periodLabel || "").split(/\s*[-–]\s*/)[1] ||
                                  "-",
                              value: fmtNumber(seg.readingTo, 2),
                            },
                          ].map((row) => (
                            <tr key={row.label} className="hover:bg-muted/30">
                              <td className="px-4 py-2.5 font-medium text-muted-foreground">
                                {row.label}
                              </td>
                              <td className="px-4 py-2.5 text-center font-medium">
                                {row.date}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium">
                                {row.value}
                              </td>
                            </tr>
                          ))}

                          {[
                            {
                              label: "Segment period",
                              content: getSegmentPeriodLabel(seg),
                            },
                            {
                              label: "Boundary events",
                              content:
                                (eventTypeLabels?.[seg.startEventType] ||
                                  seg.startEventType ||
                                  "Regular") +
                                " to " +
                                (eventTypeLabels?.[seg.endEventType] ||
                                  seg.endEventType ||
                                  "Regular"),
                            },
                          ].map((row) => (
                            <tr key={row.label} className="hover:bg-muted/30">
                              <td className="px-4 py-2.5 font-medium text-muted-foreground">
                                {row.label}
                              </td>
                              <td
                                className="px-4 py-2.5 text-center font-medium"
                                colSpan={2}
                              >
                                {row.content}
                              </td>
                            </tr>
                          ))}

                          <tr className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium text-muted-foreground">
                              Total consumption
                            </td>
                            <td className="px-4 py-2.5" />
                            <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                              {fmtNumber(seg.unitsConsumed, 2)} {unitLabel}
                            </td>
                          </tr>

                          {[
                            {
                              label: "Segment total cost",
                              value: fmtCurrency(seg.totalCost),
                            },
                            {
                              label: `Amount due per person (${fmtCurrency(ratePerUnit)} per ${unitLabel})`,
                              value: fmtCurrency(seg.sharePerTenantCost),
                            },
                          ].map((row) => (
                            <tr key={row.label} className="hover:bg-muted/30">
                              <td
                                className="px-4 py-2.5 font-medium text-muted-foreground"
                                colSpan={2}
                              >
                                {row.label}
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-foreground">
                                {row.value}
                              </td>
                            </tr>
                          ))}

                          <tr className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium text-muted-foreground">
                              Covered occupants
                            </td>
                            <td
                              className="px-4 py-2.5 text-center font-medium text-foreground"
                              colSpan={2}
                            >
                              {seg.coveredTenantNames?.length
                                ? seg.coveredTenantNames.join(", ")
                                : "No active occupant"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>}
        </div>

        {/* Footer - Single clean close action */}
        <div className="flex items-center justify-end border-t border-border bg-card px-6 py-3.5 sticky bottom-0 z-10">
          <button
            type="button"
            className="rounded-lg border border-border bg-card px-5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BillingCycleDetailModal;
