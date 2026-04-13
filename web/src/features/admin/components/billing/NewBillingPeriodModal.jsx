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
          `Bed ${overlap.bedKey}: ${
            overlap.firstTenantName || "Tenant A"
          } overlaps ${overlap.secondTenantName || "Tenant B"}`,
        );
      }
    }

    const missingMoveIns = details?.missingMoveInReadings || [];
    const missingMoveOuts = details?.missingMoveOutReadings || [];
    if (Array.isArray(missingMoveIns) && missingMoveIns.length > 0) {
      for (const entry of missingMoveIns.slice(0, 5)) {
        lines.push(
          `Missing move-in reading: ${entry.tenantName || "Tenant"} (${
            fmtDate(readMoveInDate(entry)) || "date required"
          })`,
        );
      }
    }
    if (Array.isArray(missingMoveOuts) && missingMoveOuts.length > 0) {
      for (const entry of missingMoveOuts.slice(0, 5)) {
        lines.push(
          `Missing move-out reading: ${entry.tenantName || "Tenant"} (${
            fmtDate(readMoveOutDate(entry)) || "date required"
          })`,
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
      return notify.warn(
        "All fields (dates, readings, and rate) are required.",
      );
    }
    let newlyOpenedPeriodId = null;
    try {
      setGenerationBlocker(null);
      // Auto-clean any leftover open period before creating a new cycle
      if (openPeriodForRoom) {
        if (selectedPeriodId === openPeriodForRoom.id) {
          onSuccess(null); // deselect
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
        onSuccess(newPeriodId); // select the newly opened period
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
          // Keep primary context
        }
      }
      setGenerationBlocker(buildGenerationBlocker(err));
      notify.error(err, "Failed to generate billing cycle.");
    }
  };

  const isPending = openPeriod.isPending || closePeriod.isPending;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 1000,
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "600px",
          padding: "24px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        }}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "16px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.25rem",
              color: "#1e293b",
              fontWeight: "600",
            }}
          >
            New Billing Period
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={isPending}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-form">
          {generationBlocker && (
            <div
              className="eb-panel eb-panel--warning"
              style={{
                background: "#fef2f2",
                borderLeft: "4px solid #ef4444",
                padding: "12px",
                borderRadius: "4px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: "#991b1b",
                  marginBottom: "8px",
                }}
              >
                Why It Didn't Finalize
              </div>
              <div style={{ color: "#b91c1c", fontSize: "14px" }}>
                <div
                  style={{
                    marginBottom: generationBlocker.lines.length ? 8 : 0,
                  }}
                >
                  {generationBlocker.message}
                </div>
                {generationBlocker.lines.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "18px" }}>
                    {generationBlocker.lines.map((line, idx) => (
                      <li key={`${line}-${idx}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <p
            style={{
              color: "#64748b",
              fontSize: "0.9rem",
              marginBottom: "20px",
              marginTop: "0",
            }}
          >
            Define the complete billing cycle (dates, readings, and rate) to
            generate drafts immediately.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Cycle Start
              </label>
              <input
                type="date"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                }}
                value={periodForm.startDate}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, startDate: e.target.value })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Cycle End
              </label>
              <input
                type="date"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                }}
                value={periodForm.endDate}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, endDate: e.target.value })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#334155",
                  marginBottom: "6px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={
                  utilityType === "water"
                    ? "Total Water (PHP)"
                    : `Rate (PHP/${utilityType === "electricity" ? "kWh" : "cu.m."})`
                }
              >
                {utilityType === "water"
                  ? "Total Water (PHP)"
                  : `Rate (PHP/${utilityType === "electricity" ? "kWh" : "cu.m."})`}
              </label>
              <input
                type="number"
                step="0.01"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                }}
                value={periodForm.ratePerUnit}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, ratePerUnit: e.target.value })
                }
                placeholder="e.g. 16.00"
                disabled={isPending}
              />
            </div>
          </div>

          {utilityType === "electricity" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Opening Meter Reading (kWh)
                </label>
                <input
                  type="number"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "0.95rem",
                  }}
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
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Final Reading (kWh)
                </label>
                <input
                  type="number"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "0.95rem",
                  }}
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
              style={{
                padding: "12px",
                background: "#f8fafc",
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#475569",
                marginBottom: "20px",
              }}
            >
              Water billing uses room occupancy overlap. Enter the total water
              charge above and the billing engine will split it by covered days.
            </div>
          )}
        </div>

        <div
          className="modal-actions"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "20px",
          }}
        >
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: "8px 16px",
              background: "#fff",
              border: "1px solid #cbd5e1",
              color: "#475569",
              borderRadius: "6px",
              cursor: isPending ? "not-allowed" : "pointer",
              fontWeight: "500",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateCycle}
            disabled={isPending}
            style={{
              padding: "8px 16px",
              background: "#FF8C42",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: isPending ? "not-allowed" : "pointer",
              fontWeight: "500",
            }}
          >
            {isPending ? "Processing..." : "Generate Billing Cycle"}
          </button>
        </div>
      </div>
    </div>
  );
}
