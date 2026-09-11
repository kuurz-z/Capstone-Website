import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X, Zap } from "lucide-react";
import { useOpenUtilityPeriod } from "../../../../shared/hooks/queries/useUtility";
import useBillingNotifier from "./shared/useBillingNotifier";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";
import { toInputDate } from "./utility/utilityConstants";

const isFiniteNonNegative = (value) =>
  value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

export default function OpenCurrentPeriodModal({
  isOpen,
  onClose,
  utilityType,
  selectedRoomId,
  roomName,
  lastClosedPeriod,
  latestReading,
  defaultRatePerUnit,
  onSuccess,
}) {
  const notify = useBillingNotifier();
  const openPeriod = useOpenUtilityPeriod(utilityType);
  const [form, setForm] = useState({ startDate: "", startReading: "", ratePerUnit: "" });
  const isElectricity = utilityType === "electricity";

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      startDate: toInputDate(lastClosedPeriod?.endDate || new Date()),
      startReading: utilityType === "water" ? "" : String(lastClosedPeriod?.endReading ?? latestReading?.reading ?? 0),
      ratePerUnit: String(defaultRatePerUnit ?? ""),
    });
  }, [isOpen, lastClosedPeriod, latestReading, defaultRatePerUnit]);

  useEscapeClose(isOpen, onClose);
  if (!isOpen || typeof document === "undefined") return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedRoomId || !form.startDate || !isFiniteNonNegative(form.ratePerUnit)) {
      notify.warn("Room, start date, and a valid non-negative rate are required.");
      return;
    }
    if (!isFiniteNonNegative(form.startReading)) {
      notify.warn("Opening meter reading must be a finite, non-negative number. Zero is allowed.");
      return;
    }
    try {
      const response = await openPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: form.startDate,
        startReading: Number(form.startReading),
        ratePerUnit: Number(form.ratePerUnit),
      });
      const id = response?.period?._id || response?.period?.id || response?.id || null;
      notify.success("Current billing period opened. It will remain active until explicitly closed.");
      onSuccess?.(id);
      onClose();
    } catch (error) {
      notify.error(error, "Unable to open the current billing period.");
    }
  };

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <form className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-card-foreground"><Zap size={17} /> Recovery / Manual Initialization</h3>
            <p className="mt-1 text-xs text-muted-foreground">{roomName || "Selected room"} · use only after reviewing this room&apos;s meter continuity.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-foreground">Start date
            <input className={`${inputClass} mt-1`} type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required />
          </label>
          {<label className="block text-xs font-semibold text-foreground">Opening meter reading ({isElectricity ? "kWh" : "m³"})
            <input className={`${inputClass} mt-1`} type="number" min="0" step="0.01" inputMode="decimal" value={form.startReading} onChange={(event) => setForm((current) => ({ ...current, startReading: event.target.value }))} required />
          </label>}
          <label className="block text-xs font-semibold text-foreground">Rate (PHP/{isElectricity ? "kWh" : "m³"})
            <input className={`${inputClass} mt-1`} type="number" min="0" step="0.01" inputMode="decimal" value={form.ratePerUnit} onChange={(event) => setForm((current) => ({ ...current, ratePerUnit: event.target.value }))} required />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={openPeriod.isPending} className="inline-flex items-center gap-2 rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {openPeriod.isPending ? <LoaderCircle size={15} className="animate-spin" /> : null} Initialize Manually
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
