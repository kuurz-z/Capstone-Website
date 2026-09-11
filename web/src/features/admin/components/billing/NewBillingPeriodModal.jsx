import WaterBillingTables from '../../../../shared/components/WaterBillingTables';
import { utilityApi } from '../../../../shared/api/utilityApi';
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Info,
  Zap,
  Calendar,
  AlertCircle,
  Sparkles,
  LoaderCircle,
  ChevronDown,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import {
  useGenerateHistoricalUtilityPeriod,
  useCloseUtilityPeriod,
} from "../../../../shared/hooks/queries/useUtility";
import useBillingNotifier from "./shared/useBillingNotifier";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";
import {
  readMoveInDate,
  readMoveOutDate,
} from "../../../../shared/utils/lifecycleNaming";
import { fmtDate, fmtCurrency } from "../../utils/formatters";
import { nextMonthlyCutoff, utilityDateInput as toInputDate, openingOnDate, defaultUtilityOpening } from "./utility/monthlyUtilitySchedule";
import { completedUtilityPeriodId } from "./utility/monthlyBillingWorkflow";

const MAX_METER_READING = 999999.99;
const MAX_ELECTRICITY_RATE = 100.0;
const MAX_WATER_RATE = 100000.0;
const MAX_CYCLE_USAGE = 50000.0;
const isBlankValue = (value) => value === "" || value === null || value === undefined;

/** Sanitize numeric string to respect maximum decimal and whole digit lengths */
const sanitizeNumericInput = (val, maxDecimals = 2, maxWholeDigits = 6) => {
  if (!val) return "";
  const raw = String(val);
  const negative = raw.trim().startsWith("-");
  let clean = raw.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  if (parts.length > 2) {
    clean = parts[0] + "." + parts.slice(1).join("");
  }
  const [whole, decimal] = clean.split(".");
  const limitedWhole = whole ? whole.slice(0, maxWholeDigits) : "";
  if (decimal !== undefined) {
    const normalized = `${limitedWhole}.${decimal.slice(0, maxDecimals)}`;
    return negative ? `-${normalized}` : normalized;
  }
  return negative ? `-${limitedWhole}` : limitedWhole;
};

const addDays = (dateStr, days = 1) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getMonthEnd = (startDateStr) => {
  if (!startDateStr) return "";
  const d = new Date(startDateStr);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

/** Reusable token-aware focus handlers for inputs/selects */
const ringFocus = {
  onFocus: (e) => {
    e.currentTarget.style.borderColor = "var(--ring)";
    e.currentTarget.style.boxShadow = "none";
    e.currentTarget.style.outline = "none";
  },
  onBlur: (e) => {
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.boxShadow = "";
    e.currentTarget.style.outline = "";
  },
};

export default function NewBillingPeriodModal({
  isOpen,
  onClose,
  utilityType,
  historical = false,
  manualReviewPeriod = null,
  selectedRoomId,
  openPeriodForRoom,
  lastClosedPeriod,
  latestReading,
  defaultRatePerUnit,
  roomBranch,
  roomName,
  activeTenantCount = 0,
  periods = [],
  readings = [],
  onSuccess,
}) {
  const notify = useBillingNotifier();
  const finalReadingInputRef = useRef(null);

  const generateHistoricalPeriod = useGenerateHistoricalUtilityPeriod(utilityType);
  const closePeriod = useCloseUtilityPeriod(utilityType);
  const activePeriod = historical ? null : openPeriodForRoom;
  const legacyWater = utilityType === "water" && activePeriod && activePeriod.calculationVersion !== "water-meter-v1";
  const unit = utilityType === "electricity" ? "kWh" : "m³";
  const initializedFor = useRef(null);

  const [closingPending,setClosingPending] = useState(false);
  const [generationBlocker, setGenerationBlocker] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [durationPreset, setDurationPreset] = useState("1mo");

  const [periodForm, setPeriodForm] = useState({
    startDate: "",
    startReading: "",
    ratePerUnit: defaultRatePerUnit || "",
    endReading: "",
    endDate: "",
  });

  const [initialFormState, setInitialFormState] = useState(null);
  const [waterPreviewResponse,setWaterPreview] = useState(null);
  const waterRequestKey = JSON.stringify([selectedRoomId, activePeriod?.id || activePeriod?._id, periodForm]);
  const waterPreview = waterPreviewResponse?.key === waterRequestKey ? waterPreviewResponse.result : null;
  const [waterPreviewError,setWaterPreviewError] = useState('');
  const [waterPreviewPending,setWaterPreviewPending] = useState(false);
  useEffect(()=>{
    if (!isOpen || utilityType !== 'water' || legacyWater || manualReviewPeriod) return;
    let cancelled=false;
    setWaterPreview(null); setWaterPreviewError(''); setWaterPreviewPending(false);
    if (!periodForm.startDate || !periodForm.endDate || periodForm.endReading === '' || periodForm.ratePerUnit === '') return;
    setWaterPreviewPending(true);
    const timer=setTimeout(()=>utilityApi.previewWater({...periodForm,roomId:selectedRoomId,periodId:activePeriod?.id || activePeriod?._id})
      .then(response=>{if(!cancelled) setWaterPreview({key:waterRequestKey,result:response.result || response.data || response});})
      .catch(error=>{if(!cancelled) setWaterPreviewError(error.message || 'Unable to preview water billing.');})
      .finally(()=>{if(!cancelled) setWaterPreviewPending(false);}),350);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[isOpen,utilityType,selectedRoomId,periodForm,activePeriod,legacyWater,manualReviewPeriod,waterRequestKey]);


  const handlePresetChange = (presetKey) => {
    setDurationPreset(presetKey);
    if (!periodForm.startDate) return;

    let computedEnd = periodForm.endDate;
    if (presetKey === "1mo") {
      computedEnd = nextMonthlyCutoff(periodForm.startDate);
    } else if (presetKey === "30d") {
      computedEnd = addDays(periodForm.startDate, 30);
    } else if (presetKey === "monthEnd") {
      computedEnd = getMonthEnd(periodForm.startDate);
    } else if (presetKey === "15d") {
      computedEnd = addDays(periodForm.startDate, 15);
    }

    if (presetKey !== "custom" && computedEnd) {
      setPeriodForm((prev) => ({
        ...prev,
        endDate: computedEnd,
        endReading: computedEnd === prev.endDate ? prev.endReading : "",
      }));
    }
  };

  const handleStartDateChange = (e) => {
    const newStart = e.target.value;
    let newEnd = periodForm.endDate;

    if (newStart) {
      if (durationPreset === "1mo") {
        newEnd = nextMonthlyCutoff(newStart);
      } else if (durationPreset === "30d") {
        newEnd = addDays(newStart, 30);
      } else if (durationPreset === "monthEnd") {
        newEnd = getMonthEnd(newStart);
      } else if (durationPreset === "15d") {
        newEnd = addDays(newStart, 15);
      }
    }

    setPeriodForm((prev) => ({
      ...prev,
      startDate: newStart,
      startReading: String(openingOnDate({date:newStart,activePeriod,readings})?.reading ?? ""),
      endDate: newEnd || prev.endDate,
      endReading: !newEnd || newEnd === prev.endDate ? prev.endReading : "",
    }));
  };

  const handleEndDateChange = (e) => {
    const newEnd = e.target.value;
    if (periodForm.startDate && newEnd) {
      if (newEnd === nextMonthlyCutoff(periodForm.startDate)) {
        setDurationPreset("1mo");
      } else if (newEnd === addDays(periodForm.startDate, 30)) {
        setDurationPreset("30d");
      } else if (newEnd === getMonthEnd(periodForm.startDate)) {
        setDurationPreset("monthEnd");
      } else if (newEnd === addDays(periodForm.startDate, 15)) {
        setDurationPreset("15d");
      } else {
        setDurationPreset("custom");
      }
    }
    setPeriodForm((prev) => ({
      ...prev,
      endDate: newEnd,
      endReading: newEnd === prev.endDate ? prev.endReading : "",
    }));
  };

  useEffect(() => {
    if (!isOpen) { initializedFor.current = null; return; }
    const formKey = `${utilityType}:${selectedRoomId}:${historical}:${activePeriod?.id || activePeriod?._id || "new"}`;
    if (initializedFor.current === formKey) return;
    initializedFor.current = formKey;
    if (isOpen) {
      const opening = defaultUtilityOpening({activePeriod,lastClosedPeriod,latestReading});
      const startDate = toInputDate(opening?.date) || toInputDate(new Date());
      const initialStartReading = opening?.reading ?? "";
      const initialRate = activePeriod ? String(activePeriod.pricingSnapshot?.ratePerUnit ?? activePeriod.ratePerUnit ?? "") : utilityType === "water" ? String(defaultRatePerUnit ?? "") :
        lastClosedPeriod?.ratePerUnit != null
          ? String(lastClosedPeriod.ratePerUnit)
          : defaultRatePerUnit !== undefined &&
              defaultRatePerUnit !== null &&
              defaultRatePerUnit !== ""
            ? String(defaultRatePerUnit)
            : "";

      const initialValues = {
        startDate,
        startReading:
          initialStartReading !== undefined && initialStartReading !== null
            ? String(initialStartReading)
            : "",
        ratePerUnit: initialRate,
        endReading: "",
        endDate: nextMonthlyCutoff(startDate),
      };

      setPeriodForm(initialValues);
      setInitialFormState(initialValues);
      setDurationPreset("1mo");
      setGenerationBlocker(null);
      setShowCloseConfirm(false);

      // Auto-focus the final reading input for quick typing
      setTimeout(() => {
        if (finalReadingInputRef.current) {
          finalReadingInputRef.current.focus();
        }
      }, 80);
    }
  }, [isOpen, defaultRatePerUnit, lastClosedPeriod, latestReading, activePeriod, utilityType, selectedRoomId, historical]);

  // Dirty state checking
  const isDirty = Boolean(
    initialFormState &&
      (periodForm.endReading !== initialFormState.endReading ||
        periodForm.startDate !== initialFormState.startDate ||
        periodForm.endDate !== initialFormState.endDate ||
        periodForm.ratePerUnit !== initialFormState.ratePerUnit ||
        periodForm.startReading !== initialFormState.startReading)
  );

  const handleRequestClose = () => {
    if (closingPending || closePeriod.isPending || generateHistoricalPeriod.isPending) return;
    if (isDirty && !generateHistoricalPeriod.isPending && !closingPending) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  useEscapeClose(isOpen, handleRequestClose);

  if (!isOpen) return null;

  const isFixedRateBranch = roomBranch === "guadalupe";
  const isElectricity = utilityType === "electricity";

  // Calculations for live calculation preview
  const startNum = parseFloat(periodForm.startReading);
  const endNum = parseFloat(periodForm.endReading);
  const rateNum = parseFloat(periodForm.ratePerUnit);

  const maxRate = isElectricity ? MAX_ELECTRICITY_RATE : MAX_WATER_RATE;
  const isRateInvalid = !isNaN(rateNum) && (rateNum < 0 || rateNum > maxRate);
  const hasValidRate = !isNaN(rateNum) && rateNum >= 0 && rateNum <= maxRate;

  const isStartReadingExceedsMax =
    !isNaN(startNum) && startNum > MAX_METER_READING;
  const isEndReadingExceedsMax = !isNaN(endNum) && endNum > MAX_METER_READING;
  const isReadingLower =
    !isNaN(startNum) && !isNaN(endNum) && endNum < startNum;

  const hasValidReadings =
    !isNaN(startNum) &&
    !isNaN(endNum) &&
    startNum >= 0 &&
    endNum >= 0 &&
    endNum >= startNum &&
    !isStartReadingExceedsMax &&
    !isEndReadingExceedsMax;

  const isDateInvalid =
    periodForm.startDate &&
    periodForm.endDate &&
    new Date(periodForm.endDate) <= new Date(periodForm.startDate);

  // Date Overlap validation against existing periods in this room (strict interior overlap)
  const isDateOverlapping = (periods || []).some((p) => {
    if (String(p.id || p._id) === String(activePeriod?.id || activePeriod?._id) || p.status === "archived") return false;
    const pStart = toInputDate(p.startDate);
    const pEnd = toInputDate(p.endDate);
    if (!pStart || !pEnd) return false;
    return periodForm.startDate < pEnd && periodForm.endDate > pStart;
  });

  // Cycle duration in days
  const cycleDays =
    periodForm.startDate && periodForm.endDate && !isDateInvalid
      ? Math.max(
          1,
          Math.round(
            (new Date(periodForm.endDate) - new Date(periodForm.startDate)) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  const calculatedUsage =
    isElectricity && hasValidReadings ? endNum - startNum : 0;
  const isUsageExceedsMax = calculatedUsage > MAX_CYCLE_USAGE;

  const estimatedTotalCost =
    isElectricity && hasValidReadings && hasValidRate
      ? calculatedUsage * rateNum
      : !isElectricity && hasValidRate
        ? rateNum
        : 0;

  const dailyBurnRate =
    isElectricity && hasValidReadings && cycleDays > 0
      ? calculatedUsage / cycleDays
      : 0;

  const tenantCount = Math.max(0, Number(activeTenantCount) || 0);

  // Unbilled gap check: expected start is previous cycle end date
  const continuationDate = lastClosedPeriod?.endDate
    ? toInputDate(lastClosedPeriod.endDate)
    : null;
  const hasUnbilledGap =
    continuationDate &&
    periodForm.startDate &&
    periodForm.startDate > continuationDate;
  const unbilledGapDays = hasUnbilledGap
    ? Math.round(
        (new Date(periodForm.startDate) - new Date(continuationDate)) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  // Real-life time (today) vs last closed bill
  const todayDateStr = toInputDate(new Date());
  const lastEndDateStr = lastClosedPeriod?.endDate
    ? toInputDate(lastClosedPeriod.endDate)
    : null;

  const daysAheadOrBehind = lastEndDateStr
    ? Math.round(
        (new Date(lastEndDateStr) - new Date(todayDateStr)) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  // Status A: Ahead of schedule (Advance Bill)
  const isAdvanceBill = Boolean(lastEndDateStr && daysAheadOrBehind > 0);

  // Status C: Behind schedule by > 35 days (Catch-up required)
  const isCatchUpRequired = Boolean(lastEndDateStr && daysAheadOrBehind < -35);
  const daysBehind = Math.abs(daysAheadOrBehind);

  // Anomaly checks
  const previousUsage = Number(lastClosedPeriod?.computedTotalUsage || 0);
  const isUsageSpike =
    isElectricity &&
    hasValidReadings &&
    !isUsageExceedsMax &&
    ((previousUsage > 0 && calculatedUsage > previousUsage * 2) ||
      dailyBurnRate > 35);

  const isFutureDate =
    Boolean(periodForm.endDate) && new Date(periodForm.endDate) > new Date();

  const isAbnormalCycleLength =
    cycleDays > 0 && (cycleDays < 7 || cycleDays > 45);

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
          `Bed ${overlap.bedKey}: ${overlap.firstTenantName || "Tenant A"} overlaps ${overlap.secondTenantName || "Tenant B"}`
        );
      }
    }

    const missingMoveIns = details?.missingMoveInReadings || [];
    const missingMoveOuts = details?.missingMoveOutReadings || [];
    if (Array.isArray(missingMoveIns) && missingMoveIns.length > 0) {
      for (const entry of missingMoveIns.slice(0, 5)) {
        lines.push(
          `Missing move-in reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveInDate(entry)) || "date required"})`
        );
      }
    }
    if (Array.isArray(missingMoveOuts) && missingMoveOuts.length > 0) {
      for (const entry of missingMoveOuts.slice(0, 5)) {
        lines.push(
          `Missing move-out reading: ${entry.tenantName || "Tenant"} (${fmtDate(readMoveOutDate(entry)) || "date required"})`
        );
      }
    }

    return { message, lines };
  };

  const handleGenerateCycle = async () => {
    if (closingPending || closePeriod.isPending || generateHistoricalPeriod.isPending) return;
    if (legacyWater || manualReviewPeriod) return notify.warn("Review the existing cycle before generating a new monthly bill.");
    if (utilityType === "water" && (!waterPreview || waterPreviewPending)) return;
    if (isFixedRateBranch) {
      return notify.warn(
        "Guadalupe uses fixed-rate billing. Separate utility cycles cannot be generated for this branch."
      );
    }

    if (isDateOverlapping) {
      return notify.warn(
        "Dates overlap with an existing billing cycle in this room."
      );
    }

    if (
      !periodForm.startDate ||
      !periodForm.endDate ||
      isBlankValue(periodForm.ratePerUnit) ||
      (isBlankValue(periodForm.startReading) || isBlankValue(periodForm.endReading))
    ) {
      return notify.warn("All fields (dates, readings, and rate) are required.");
    }

    if (!hasValidReadings) return notify.warn("Enter finite, non-negative opening and closing readings in order.");
    if (!hasValidRate) {
      return notify.warn(
        `Rate cannot be negative or exceed ₱${maxRate.toLocaleString()}.`
      );
    }

    if (isStartReadingExceedsMax || isEndReadingExceedsMax) {
      return notify.warn(
        `Meter readings cannot exceed ${MAX_METER_READING.toLocaleString()} ${unit}.`
      );
    }

    if (isUsageExceedsMax) {
      return notify.warn(
        `Calculated usage cannot exceed ${MAX_CYCLE_USAGE.toLocaleString()} kWh per cycle.`
      );
    }

    if (isReadingLower) {
      return notify.warn(
        "Final reading cannot be lower than opening meter reading."
      );
    }

    if (isDateInvalid) {
      return notify.warn("Cycle end date must be after cycle start date.");
    }

    try {
      setClosingPending(true);
      setGenerationBlocker(null);
      if (historical && openPeriodForRoom) {
        return notify.warn("An active period already exists. Historical generation cannot replace or delete it.");
      }
      const generatedData = activePeriod
        ? await closePeriod.mutateAsync({periodId:activePeriod.id || activePeriod._id,startDate:periodForm.startDate,startReading:Number(periodForm.startReading),endDate:periodForm.endDate,endReading:Number(periodForm.endReading)})
        : await generateHistoricalPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: periodForm.startDate,
        startReading:
          Number(periodForm.startReading),
        ratePerUnit: Number(periodForm.ratePerUnit),
        endReading:
          Number(periodForm.endReading),
        endDate: periodForm.endDate,
      });
      const newPeriodId = completedUtilityPeriodId(generatedData);
      onSuccess(newPeriodId || null);
      notify.success("Draft bills generated. Review the completed cycle before sending.");
      setGenerationBlocker(null);
      onClose();
    } catch (err) {
      setGenerationBlocker(buildGenerationBlocker(err));
      notify.error(err, "Unable to generate billing period. Please check the entered readings and try again.");
    } finally { setClosingPending(false); }
  };

  const isPending = generateHistoricalPeriod.isPending || closePeriod.isPending || closingPending;
  const isActionDisabled =
    Boolean(legacyWater || manualReviewPeriod) ||
    (utilityType === "water" && (!waterPreview || waterPreviewPending)) ||
    isPending ||
    !hasValidReadings ||
    !hasValidRate ||
    isReadingLower ||
    isDateInvalid ||
    isRateInvalid ||
    isStartReadingExceedsMax ||
    isEndReadingExceedsMax ||
    isUsageExceedsMax ||
    isFixedRateBranch ||
    isDateOverlapping ||
    !periodForm.startDate ||
    !periodForm.endDate ||
    isBlankValue(periodForm.ratePerUnit) ||
    (isBlankValue(periodForm.startReading) || isBlankValue(periodForm.endReading));

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !isActionDisabled) {
      e.preventDefault();
      handleGenerateCycle();
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{
        background: "color-mix(in srgb, var(--background) 60%, transparent)",
      }}
      onClick={handleRequestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={historical ? "Generate Historical Cycle" : "New Billing Period"}
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with standalone semantic icon */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            {isElectricity ? (
              <Zap size={22} className="text-amber-500 shrink-0" />
            ) : (
              <Sparkles size={22} className="text-sky-500 shrink-0" />
            )}
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {historical ? "Generate Historical Cycle" : "New Billing Period"} · {isElectricity ? "Electricity" : "Water"}
              </h2>
              {roomName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Room: <span className="font-medium text-foreground">{roomName}</span>
                  {tenantCount > 0 ? (
                    ` • ${tenantCount} active tenant${tenantCount > 1 ? "s" : ""}`
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {" "}• Vacant (0 active tenants)
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            onClick={handleRequestClose}
            disabled={isPending}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-4 px-6 py-4 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Fixed rate branch warning */}
          {isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">
                  Fixed-Rate Branch (Guadalupe):
                </span>{" "}
                Separate sub-metered utility billing cycles are not used for rooms in this branch.
              </div>
            </div>
          )}

          {/* Error blocker */}
          {generationBlocker && !isFixedRateBranch && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
                <AlertCircle size={15} className="shrink-0" />
                <span>{generationBlocker.message}</span>
              </div>
              {generationBlocker.lines.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 mt-1.5 text-muted-foreground">
                  {generationBlocker.lines.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Date Overlap Error Notice */}
          {isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-medium">Date Overlap:</span> The selected date range overlaps with an existing cycle in this room. Please adjust dates.
              </div>
            </div>
          )}

          {/* Advance Bill Notice (when last bill ends after today) */}
          {isAdvanceBill && !isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <Info size={15} className="shrink-0 mt-0.5 text-sky-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">Advance Bill:</span> Room is already billed through <span className="font-medium text-foreground">{fmtDate(lastClosedPeriod.endDate)}</span>. This creates an advance bill for <span className="font-medium text-foreground">{fmtDate(periodForm.startDate)} – {fmtDate(periodForm.endDate)}</span>.
              </div>
            </div>
          )}

          {/* Catch-Up Cycle Notice (when last bill was > 35 days ago) */}
          {isCatchUpRequired && !isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">Catch-Up Cycle:</span> Room was last billed through <span className="font-medium text-foreground">{fmtDate(lastClosedPeriod.endDate)}</span> ({daysBehind} days ago). Generating this cycle will cover <span className="font-medium text-foreground">{fmtDate(periodForm.startDate)} – {fmtDate(periodForm.endDate)}</span> to help bring the room up to date.
              </div>
            </div>
          )}

          {/* Unbilled Gap Warning */}
          {hasUnbilledGap && !isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">Unbilled Gap:</span> Previous cycle ended on <span className="font-medium text-foreground">{fmtDate(lastClosedPeriod.endDate)}</span>. Starting on <span className="font-medium text-foreground">{fmtDate(periodForm.startDate)}</span> leaves a {unbilledGapDays}-day gap.
              </div>
            </div>
          )}

          {/* Usage Anomaly Notice */}
          {isUsageSpike && !isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">Usage Anomaly:</span> {calculatedUsage.toLocaleString()} kWh is higher than usual
                {previousUsage > 0 ? ` (previous cycle: ${previousUsage.toLocaleString()} kWh)` : ""}.
                {dailyBurnRate > 35 ? ` Burn rate is ~${dailyBurnRate.toFixed(1)} kWh/day.` : ""}
                {" "}Please verify final meter digits before generating draft bills.
              </div>
            </div>
          )}

          {/* Future Date Informative Notice */}
          {isFutureDate && !isAdvanceBill && !isDateOverlapping && !isFixedRateBranch && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <Info size={15} className="shrink-0 mt-0.5 text-sky-500" />
              <div className="leading-relaxed">
                <span className="font-medium text-foreground">Future Date:</span> Cycle end date is set in the future. Ensure meter readings reflect scheduled readings.
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Define the billing cycle duration, meter readings, and rate to compute draft utility charges for all active room tenants.
          </p>

          {activePeriod && !legacyWater && <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs">Cycle starts must match verified meter evidence. The saved rate is retained. Sending later will not extend this cycle.</p>}
          {legacyWater && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">This active cycle uses legacy Water billing. Close it with Close Legacy Cycle before starting measured Water billing from a verified physical baseline. Its recorded amounts and allocation basis will be preserved.</p>}
          {manualReviewPeriod && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">This room has a cycle requiring review: {manualReviewPeriod.manualReviewReason || 'Review its meter continuity before generating drafts.'}</p>}
          {/* Dates & Rate Configuration Grid */}
          {!legacyWater && <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2">
            {/* Cycle Start */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar size={13} className="text-muted-foreground" /> Cycle Start
              </label>
              <input
                aria-label="Cycle Start"
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-60 transition-colors cursor-pointer"
                {...ringFocus}
                value={periodForm.startDate}
                onChange={handleStartDateChange}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                onKeyDown={handleKeyDown}
                disabled={isPending || isFixedRateBranch}
              />
              <p className="text-[11px] text-muted-foreground">
                Choose a verified opening boundary. Normal monthly cutoff is the 15th.
              </p>
            </div>

            {/* Duration Preset Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock3 size={13} className="text-muted-foreground" /> Duration Preset
              </label>
              <div className="relative">
                <select
                  value={durationPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  disabled={isPending || isFixedRateBranch}
                  className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none disabled:opacity-60 transition-colors cursor-pointer pr-8 hover:border-slate-300 dark:hover:border-slate-600"
                  {...ringFocus}
                  aria-label="Select billing cycle duration preset"
                >
                  <option value="1mo">1 Month</option>
                  <option value="30d">30 Days</option>
                  <option value="monthEnd">End of Month</option>
                  <option value="15d">15 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {durationPreset === "custom"
                  ? `${cycleDays > 0 ? `${cycleDays} days duration` : "Custom dates"}`
                  : cycleDays > 0
                    ? `${cycleDays} days duration`
                    : "Select cycle duration"}
              </p>
            </div>

            {/* Cycle End */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar size={13} className="text-muted-foreground" /> Cycle End
              </label>
              <input
                aria-label="Cycle End"
                type="date"
                min="2020-01-01"
                max="2099-12-31"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-60 transition-colors cursor-pointer"
                {...ringFocus}
                value={periodForm.endDate}
                onChange={handleEndDateChange}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                onKeyDown={handleKeyDown}
                disabled={isPending || isFixedRateBranch}
              />
              {isDateInvalid && !isFixedRateBranch ? (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  Must be after cycle start
                </p>
              ) : isAbnormalCycleLength && !isFixedRateBranch ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Unusual duration ({cycleDays} days)
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  End of billing period
                </p>
              )}
            </div>

            {/* Rate Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  {utilityType === "water"
                    ? "Rate (PHP/m³)"
                    : `Rate (PHP/${isElectricity ? "kWh" : "m³"})`}
                </label>
              </div>
              <input
                aria-label={`Rate (PHP/${unit})`}
                type="text"
                inputMode="decimal"
                maxLength={10}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-60 transition-colors ${
                  isRateInvalid && !isFixedRateBranch
                    ? "border-rose-500"
                    : "border-border bg-card"
                }`}
                {...ringFocus}
                value={periodForm.ratePerUnit}
                onChange={(e) =>
                  setPeriodForm({
                    ...periodForm,
                    ratePerUnit: sanitizeNumericInput(
                      e.target.value,
                      2,
                      isElectricity ? 3 : 6
                    ),
                  })
                }
                onKeyDown={handleKeyDown}
                placeholder="e.g. 16.00"
                disabled={isPending || isFixedRateBranch || Boolean(activePeriod)}
              />
              {isRateInvalid && !isFixedRateBranch ? (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  Rate cannot exceed ₱{maxRate.toLocaleString()}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {utilityType === "water"
                    ? (activePeriod ? "Saved price for this cycle; rate changes apply to new cycles" : "Price per cubic metre")
                    : activePeriod ? "Saved rate for this cycle" : "Applicable unit rate"}
                </p>
              )}
            </div>
          </div>}

          {/* Shared monthly meter inputs and preview */}
          {!legacyWater && <div className="space-y-3 pt-1">
            <div className="grid gap-3.5 sm:grid-cols-2">
              {['startReading', 'endReading'].map((field) => (
                <label key={field} className="space-y-1.5 text-xs font-semibold text-foreground">
                  <span>{field === 'startReading' ? 'Opening' : 'Closing'} Reading ({unit})</span>
                  <input
                    aria-label={`${field === 'startReading' ? 'Opening' : 'Closing'} Reading (${unit})`}
                    ref={field === 'endReading' ? finalReadingInputRef : undefined}
                    type="number" min="0" step="0.01" inputMode="decimal"
                    disabled={isPending || isFixedRateBranch || (field === 'startReading' && Boolean(activePeriod))}
                    value={periodForm[field]}
                    onChange={(event) => setPeriodForm((current) => ({ ...current, [field]: event.target.value }))}
                    onKeyDown={handleKeyDown}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
                    required
                  />
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {field === 'startReading' ? (periodForm.startReading === '' ? 'No verified opening found on this date. Record or correct the meter boundary before generating.' : 'Opening reading must match verified evidence for the selected start') : 'Physical meter reading at cycle end'}
                  </span>
                </label>
              ))}
            </div>
            {isReadingLower && <p role="alert" className="text-xs text-rose-600">Closing reading cannot be lower than the opening reading.</p>}
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-sm" aria-label="Live Cycle Calculation Preview">
              <p className="mb-2.5 text-xs font-semibold text-foreground">Live Cycle Calculation Preview</p>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Consumption</p>
                  <p className="mt-1 text-sm font-bold">{isElectricity ? (hasValidReadings ? `${calculatedUsage.toLocaleString()} kWh` : '—') : waterPreview ? `${waterPreview.computedTotalUsage} m³` : '—'}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Rate</p>
                  <p className="mt-1 text-sm font-bold">{hasValidRate ? `${fmtCurrency(rateNum)} / ${unit}` : '—'}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Estimated Room Total</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">{isElectricity ? (hasValidReadings && hasValidRate ? fmtCurrency(estimatedTotalCost) : '—') : waterPreview ? fmtCurrency(waterPreview.computedTotalCost) : '—'}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{isElectricity ? 'Meter-difference estimate. Saved drafts use the existing occupancy, vacancy and meter-boundary calculations.' : 'Calculated from verified meter events and the saved price for this cycle.'}</p>
            </div>
            {!isElectricity && <>
              {waterPreviewPending && <p role="status" className="animate-pulse text-xs">Calculating measured segments...</p>}
              {waterPreviewError && <p role="alert" className="text-xs text-rose-600">{waterPreviewError}</p>}
              {waterPreview && <WaterBillingTables data={waterPreview} />}
            </>}
          </div>}
        </div>

        {/* Unsaved Changes Confirmation Banner */}
        {showCloseConfirm && (
          <div className="flex items-center justify-between border-t border-border bg-background px-6 py-2.5 text-xs text-foreground">
            <span className="font-medium">
              You have unsaved changes. Discard and close?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onClose();
                }}
                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Footer with Primary Navy CTA & Explanatory Disabled Guidance */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/20">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Creates draft records for admin review before dispatch.
          </p>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              onClick={handleRequestClose}
              disabled={isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <div className="relative inline-block group">
              <button
                onClick={handleGenerateCycle}
                disabled={isActionDisabled}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {isPending ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" />
                    <span>Generating Draft Bills...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Generate Draft Bills</span>
                  </>
                )}
              </button>
              {isActionDisabled && !isPending && (
                <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 w-72 rounded-lg bg-slate-900 p-2.5 text-xs text-white shadow-xl dark:bg-slate-800 dark:text-slate-100 border border-slate-700">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <AlertCircle size={13} /> Action Disabled
                  </div>
                  <div>
                    {isFixedRateBranch
                      ? "Guadalupe uses fixed-rate billing. Separate utility cycles cannot be generated for this branch."
                      : isDateOverlapping
                        ? "The selected date range overlaps with an existing cycle in this room."
                        : isStartReadingExceedsMax || isEndReadingExceedsMax
                          ? `Meter readings cannot exceed ${MAX_METER_READING.toLocaleString()} ${unit}.`
                          : isUsageExceedsMax
                            ? `Usage exceeds maximum single-cycle limit of ${MAX_CYCLE_USAGE.toLocaleString()} kWh.`
                            : isReadingLower
                              ? "Final meter reading cannot be lower than opening reading."
                              : isDateInvalid
                                ? "Cycle end date must be after cycle start date."
                                : isRateInvalid
                                  ? `Rate cannot exceed ₱${maxRate.toLocaleString()}.`
                                  : "Please fill in all required fields."}
                  </div>
                  <div className="absolute top-full right-6 -mt-1 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
