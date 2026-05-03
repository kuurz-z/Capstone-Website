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

  const { fmtCurrency, fmtNumber, fmtShortDate, getSegmentPeriodLabel } =
    formatters;

  const unitLabel = utilityType === "electricity" ? "kWh" : "cu.m.";
  const periodEnd = period.endDate || period.targetCloseDate;
  const rangeLabel = `${fmtShortDate(period.startDate)} - ${
    fmtShortDate(periodEnd) || "Ongoing"
  }`;
  const summaryTotalLabel =
    utilityType === "electricity" ? "TOTAL KWH" : "TOTAL CU.M.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "color-mix(in srgb, var(--background) 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Billing Cycle History
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {rangeLabel} {statusLabel ? `• ${statusLabel}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusLabel && (
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-medium"
                  style={{
                    background: "color-mix(in srgb, var(--info) 12%, var(--card))",
                    color: "var(--info-dark)",
                  }}
                >
                  {statusLabel}
                </span>
              )}
              {isReadOnly && (
                <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  Read-only
                </span>
              )}
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
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: summaryTotalLabel,
                value: result ? fmtNumber(result.computedTotalUsage, 2) : "-",
                sub: null,
              },
              {
                label: "ROOM COST",
                value: result
                  ? fmtCurrency(result.totalRoomCost || result.computedTotalCost)
                  : "-",
                sub: null,
              },
              {
                label: "CURRENT RATE",
                value: result ? fmtCurrency(result.ratePerUnit) : "-",
                sub: `/${unitLabel}`,
              },
              {
                label: "SEGMENTS",
                value: result?.segments?.length ?? 0,
                sub: null,
              },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {value}
                </p>
                {sub && (
                  <p className="text-[11px] text-muted-foreground">{sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Segment Breakdown */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                Segment Breakdown
                {result?.verified ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: "color-mix(in srgb, var(--success) 12%, var(--card))",
                      color: "var(--success-dark)",
                    }}
                  >
                    <Check size={12} /> Verified
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: "color-mix(in srgb, var(--warning) 12%, var(--card))",
                      color: "var(--warning-dark)",
                    }}
                  >
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
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    {/* Segment header */}
                    <div
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
                      style={{
                        background: "color-mix(in srgb, var(--primary) 10%, var(--card))",
                        color: "var(--primary-foreground)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      No. of occupants in the room: {seg.activeTenantCount ?? 0}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-muted">
                            {["Item", "Date", unitLabel].map((h, i) => (
                              <th
                                key={h}
                                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
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
                        <tbody
                          className="text-sm text-card-foreground"
                          style={{
                            "--divide-color": "var(--border)",
                          }}
                        >
                          {[
                            {
                              label: "1st reading",
                              date: seg.startDate
                                ? new Date(seg.startDate).toLocaleDateString()
                                : (seg.periodLabel || "").split(/\s*[-–]\s*/)[0] || "-",
                              value: fmtNumber(seg.readingFrom, 2),
                              colSpanValue: false,
                            },
                            {
                              label: "2nd reading",
                              date: seg.endDate
                                ? new Date(seg.endDate).toLocaleDateString()
                                : (seg.periodLabel || "").split(/\s*[-–]\s*/)[1] || "-",
                              value: fmtNumber(seg.readingTo, 2),
                              colSpanValue: false,
                            },
                          ].map((row) => (
                            <tr
                              key={row.label}
                              style={{ borderTop: "1px solid var(--border)" }}
                            >
                              <td className="px-4 py-2 text-muted-foreground">
                                {row.label}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {row.date}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.value}
                              </td>
                            </tr>
                          ))}

                          {/* Segment period — spans cols 2+3 */}
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
                            <tr
                              key={row.label}
                              style={{ borderTop: "1px solid var(--border)" }}
                            >
                              <td className="px-4 py-2 text-muted-foreground">
                                {row.label}
                              </td>
                              <td
                                className="px-4 py-2 text-center"
                                colSpan={2}
                              >
                                {row.content}
                              </td>
                            </tr>
                          ))}

                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="px-4 py-2 text-muted-foreground">
                              Total consumption
                            </td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-right">
                              {fmtNumber(seg.unitsConsumed, 2)}
                            </td>
                          </tr>

                          {[
                            {
                              label: "Segment total cost",
                              value: fmtCurrency(seg.totalCost),
                            },
                            {
                              label: `Amount due (${fmtCurrency(result?.ratePerUnit)} / ${unitLabel}) per person`,
                              value: fmtCurrency(seg.sharePerTenantCost),
                            },
                          ].map((row) => (
                            <tr
                              key={row.label}
                              style={{ borderTop: "1px solid var(--border)" }}
                            >
                              <td
                                className="px-4 py-2 text-muted-foreground"
                                colSpan={2}
                              >
                                {row.label}
                              </td>
                              <td className="px-4 py-2 text-right font-semibold">
                                {row.value}
                              </td>
                            </tr>
                          ))}

                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="px-4 py-2 text-muted-foreground">
                              Covered tenants
                            </td>
                            <td
                              className="px-4 py-2 text-center"
                              colSpan={2}
                            >
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

          {/* Covered Tenants */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-card-foreground">
                Covered Tenants
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    {[
                      { label: "Tenant Name", align: "left" },
                      { label: "Duration Range", align: "left" },
                      { label: `Total ${unitLabel}`, align: "right" },
                      { label: "Bill Amount", align: "right" },
                    ].map(({ label, align }) => (
                      <th
                        key={label}
                        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                        style={{ textAlign: align }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-sm text-card-foreground">
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
                      <tr
                        key={`${period.id}-tenant-${index}`}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium text-card-foreground">
                            {tenant.tenantName || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tenant.tenantEmail || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {tenant.durationRange || "Ongoing"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {fmtNumber(tenant.totalUsage, 4)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-card-foreground">
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

        {/* Footer */}
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
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
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