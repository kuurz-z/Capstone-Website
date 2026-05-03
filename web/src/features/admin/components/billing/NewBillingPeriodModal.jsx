import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  useOpenUtilityPeriod,
  useCloseUtilityPeriod,
  useDeleteUtilityPeriod,
} from "../../../../shared/hooks/queries/useUtility";
import useBillingNotifier from "./shared/useBillingNotifier";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";
import {
  readMoveInDate,
  readMoveOutDate,
} from "../../../../shared/utils/lifecycleNaming";
import { fmtDate } from "../../utils/formatters";

const get15th = () => {
  const d = new Date();
  d.setDate(15);
  return d.toISOString().slice(0, 10);
};

const getNext15th = (fromDateStr) => {
  const d = fromDateStr ? new Date(fromDateStr) : new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
  return d.toISOString().slice(0, 10);
};

const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** Reusable token-aware focus handlers for inputs/selects */
const ringFocus = {
  style: { outlineColor: "var(--ring)" },
  onFocus: (e) => {
    e.currentTarget.style.borderColor = "var(--ring)";
    e.currentTarget.style.boxShadow =
      "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
  },
  onBlur: (e) => {
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.boxShadow = "";
  },
};

export default function NewBillingPeriodModal({
  isOpen,
  onClose,
  utilityType,
  selectedRoomId,
  selectedPeriodId,
  openPeriodForRoom,
  lastClosedPeriod,
  latestReading,
  defaultRatePerUnit,
  onSuccess,
}) {
  useEscapeClose(isOpen, onClose);
  const notify = useBillingNotifier();

  const openPeriod = useOpenUtilityPeriod(utilityType);
  const closePeriod = useCloseUtilityPeriod(utilityType);
  const deletePeriod = useDeleteUtilityPeriod(utilityType);

  const [generationBlocker, setGenerationBlocker] = useState(null);
  const [periodForm, setPeriodForm] = useState({
    startDate: get15th(),
    startReading: "",
    ratePerUnit: defaultRatePerUnit || "",
    endReading: "",
    endDate: getNext15th(),
  });

  useEffect(() => {
    if (isOpen) {
      const continuationDate = lastClosedPeriod?.endDate
        ? toInputDate(lastClosedPeriod.endDate)
        : null;
      const continuationReading = lastClosedPeriod?.endReading ?? null;
      const startDate = continuationDate || get15th();
      setPeriodForm({
        startDate,
        startReading: continuationReading ?? latestReading?.reading ?? "",
        ratePerUnit:
          lastClosedPeriod?.ratePerUnit != null
            ? String(lastClosedPeriod.ratePerUnit)
            : defaultRatePerUnit !== undefined &&
                defaultRatePerUnit !== null &&
                defaultRatePerUnit !== ""
              ? String(defaultRatePerUnit)
              : "",
        endReading: "",
        endDate: getNext15th(startDate),
      });
      setGenerationBlocker(null);
    }
  }, [isOpen, defaultRatePerUnit, lastClosedPeriod, latestReading]);

  if (!isOpen) return null;

  const buildGenerationBlocker = (error) => {
    const payload = error?.response?.data?.error || null;
    const message =
      payload?.message ||
      payload?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Unable to finalize billing cycle.";
    const details = payload?.details || null;
    const lines = [];

    const overlaps = details?.overlaps || [];
    if (Array.isArray(overlaps) && overlaps.length > 0) {
      for (const overlap of overlaps.slice(0, 5)) {
        lines.push(
          `Bed ${overlap.bedKey}: ${overlap.firstTenantName || "Tenant A"} overlaps ${overlap.secondTenantName || "Tenant B"}`,
        );
      }
    }

    const missingMoveIns = details?.missingMoveInReadings || [];
    const missingMoveOuts = details?.missingMoveOutReadings || [];
    if (Array.isArray(missingMoveIns) && missingMoveIns.length > 0) {
      for (const entry of missingMoveIns.slice(0, 5)) {
        lines.push(
          `Missing move-in reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveInDate(entry)) || "date required"})`,
        );
      }
    }
    if (Array.isArray(missingMoveOuts) && missingMoveOuts.length > 0) {
      for (const entry of missingMoveOuts.slice(0, 5)) {
        lines.push(
          `Missing move-out reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveOutDate(entry)) || "date required"})`,
        );
      }
    }

    return { message, lines };
  };

  const handleGenerateCycle = async () => {
    const requiresReadings = utilityType === "electricity";
    if (
      !periodForm.startDate ||
      !periodForm.endDate ||
      !periodForm.ratePerUnit ||
      (requiresReadings && (!periodForm.startReading || !periodForm.endReading))
    ) {
      return notify.warn("All fields (dates, readings, and rate) are required.");
    }

    let newlyOpenedPeriodId = null;
    try {
      setGenerationBlocker(null);

      if (openPeriodForRoom) {
        if (selectedPeriodId === openPeriodForRoom.id) {
          onSuccess(null);
        }
        await deletePeriod.mutateAsync(openPeriodForRoom.id);
      }

      const openedData = await openPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: periodForm.startDate,
        startReading:
          utilityType === "water" ? 0 : Number(periodForm.startReading),
        ratePerUnit: Number(periodForm.ratePerUnit),
      });

      const newPeriodId =
        openedData?.period?._id || openedData?.period?.id || openedData?.id;

      if (newPeriodId) {
        newlyOpenedPeriodId = newPeriodId;
        onSuccess(newPeriodId);
        await closePeriod.mutateAsync({
          periodId: newPeriodId,
          endReading:
            utilityType === "water" ? 0 : Number(periodForm.endReading),
          endDate: periodForm.endDate,
        });
        notify.success("Billing cycle generated successfully.");
        setGenerationBlocker(null);
        onClose();
      } else {
        notify.success(
          "Billing period opened, but could not finalize automatically.",
        );
        onClose();
      }
    } catch (err) {
      if (newlyOpenedPeriodId) {
        try {
          await deletePeriod.mutateAsync(newlyOpenedPeriodId);
          if (selectedPeriodId === newlyOpenedPeriodId) {
            onSuccess(null);
          }
          notify.warn(
            "Cycle finalize failed, so the temporary open period was rolled back.",
          );
        } catch {
          // Keep primary error context
        }
      }
      setGenerationBlocker(buildGenerationBlocker(err));
      notify.error(err, "Failed to generate billing cycle.");
    }
  };

  const isPending = openPeriod.isPending || closePeriod.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "color-mix(in srgb, var(--background) 60%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            New Billing Period
          </h2>
          <button
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:opacity-50"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Error blocker */}
          {generationBlocker && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--danger)",
                background: "var(--danger-light)",
                color: "var(--danger-dark)",
              }}
            >
              <div className="font-semibold">Why It Didn't Finalize</div>
              <div className="mt-1">
                <div className={generationBlocker.lines.length ? "mb-2" : ""}>
                  {generationBlocker.message}
                </div>
                {generationBlocker.lines.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {generationBlocker.lines.map((line, idx) => (
                      <li key={`${line}-${idx}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Define the complete billing cycle (dates, readings, and rate) to
            generate drafts immediately.
          </p>

          {/* Dates + Rate row */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Cycle Start
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none disabled:opacity-60"
                {...ringFocus}
                value={periodForm.startDate}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, startDate: e.target.value })
                }
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Cycle End
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none disabled:opacity-60"
                {...ringFocus}
                value={periodForm.endDate}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, endDate: e.target.value })
                }
                disabled={isPending}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {utilityType === "water"
                  ? "Total Water (PHP)"
                  : `Rate (PHP/${utilityType === "electricity" ? "kWh" : "cu.m."})`}
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none disabled:opacity-60"
                {...ringFocus}
                value={periodForm.ratePerUnit}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, ratePerUnit: e.target.value })
                }
                placeholder="e.g. 16.00"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Meter readings — electricity only */}
          {utilityType === "electricity" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Opening Meter Reading (kWh)
                </label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none disabled:opacity-60"
                  {...ringFocus}
                  value={periodForm.startReading}
                  onChange={(e) =>
                    setPeriodForm({
                      ...periodForm,
                      startReading: e.target.value,
                    })
                  }
                  placeholder={
                    latestReading?.reading != null
                      ? `Last: ${latestReading.reading}`
                      : "e.g. 1200"
                  }
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Final Reading (kWh)
                </label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none disabled:opacity-60"
                  {...ringFocus}
                  value={periodForm.endReading}
                  onChange={(e) =>
                    setPeriodForm({ ...periodForm, endReading: e.target.value })
                  }
                  placeholder="e.g. 1350"
                  disabled={isPending}
                />
              </div>
            </div>
          ) : (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: "var(--muted)",
                color: "var(--muted-foreground)",
              }}
            >
              Water billing uses room occupancy overlap. Enter the total water
              charge above and the billing engine will split it by covered days.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateCycle}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {isPending ? "Processing..." : "Generate Billing Cycle"}
          </button>
        </div>
      </div>
    </div>
  );
}