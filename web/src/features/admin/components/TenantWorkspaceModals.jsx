import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { useRoomTransferPreview } from "../../../shared/hooks/queries/useReservations";
import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock";
import { formatBranch } from "../utils/formatters";
import { resolveDepositFromPaymentInfo } from "../../../shared/utils/depositUtils";
import { formatBedPosition, getBedDisplayLabel, getBedShortCode } from "../../../shared/utils/bedIdentifier";
import { reservationApi } from "../../../shared/api/reservationApi";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import SearchableRoomSelect from "./SearchableRoomSelect.jsx";
import {
  toDateInputValue,
  minScheduleDateStr,
} from "../utils/transferScheduleDate";
import { destinationRoomNeedsBed } from "../utils/transferDestinationBed";
import { resolveTenantCurrentRent } from "../../tenant/utils/pricingDisplayHelpers";
import { Clock, History, ChevronLeft, ChevronRight, ChevronDown, Download, CheckCircle2, LogOut, LoaderCircle, AlertTriangle, ArrowRight, Calculator } from "lucide-react";

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const fmtMoney = (value) =>
  typeof value === "number"
    ? `PHP ${value.toLocaleString(undefined, {
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}`
    : "—";


const triggerPicker = (event) => {
  if (event?.currentTarget && typeof event.currentTarget.showPicker === "function") {
    try {
      event.currentTarget.showPicker();
    } catch (_) {}
  }
};

function TenantModalShell({ open, title, children, footer, onClose, className = "" }) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="tenant-workspace-modal__overlay" onClick={onClose}>
      <div
        className={`tenant-workspace-modal ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tenant-workspace-modal__header">
          <h3>{title}</h3>
          <button
            type="button"
            className="tenant-workspace-modal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="tenant-workspace-modal__body">{children}</div>
        {footer ? <div className="tenant-workspace-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function RenewLeaseModal({
  open,
  tenant,
  detail,
  context,
  loading,
  onClose,
  onSubmit,
  onOfferSubmit,
}) {
  const [mode, setMode] = useState("direct"); // "direct" or "offer"
  const [selectedDuration, setSelectedDuration] = useState(6); // 1, 3, 6, 12, or "custom"
  const [newLeaseStartDate, setNewLeaseStartDate] = useState("");
  const [newLeaseEndDate, setNewLeaseEndDate] = useState("");
  const [offerMonths, setOfferMonths] = useState(6);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  // Canonical room-type + duration pricing, resolved server-side from the
  // SAME resolver createRenewalOffer itself uses — never computed here.
  // proposedRent is not user-editable: custom/negotiated renewal pricing is
  // not a supported workflow (see server tenancyActionsController.js).
  const [pricingPreview, setPricingPreview] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState(null);
  const [showOfferConfirm, setShowOfferConfirm] = useState(false);

  const currentEndRaw =
    context?.currentStay?.leaseEndDate ||
    detail?.leaseInfo?.leaseEndDate ||
    tenant?.leaseEndDate;

  const calculateTargetEnd = (months) => {
    const base = currentEndRaw ? new Date(currentEndRaw) : new Date();
    const validBase = isNaN(base.getTime()) ? new Date() : base;
    const target = new Date(validBase);
    target.setMonth(target.getMonth() + Number(months));
    return toDateInputValue(target);
  };

  useEffect(() => {
    if (!open) return;

    const base = currentEndRaw ? new Date(currentEndRaw) : new Date();
    const validBase = isNaN(base.getTime()) ? new Date() : base;
    const nextStart = new Date(validBase);
    nextStart.setDate(nextStart.getDate() + 1);

    const initialEnd = calculateTargetEnd(6);

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 14);

    setNewLeaseStartDate(toDateInputValue(nextStart));
    setNewLeaseEndDate(initialEnd);
    setSelectedDuration(6);
    setOfferMonths(6);
    setExpiresAt(toDateInputValue(expiry));
    setNotes("");
    setMode("direct");
    setPricingPreview(null);
    setPricingError(null);
  }, [open, detail, context, tenant, currentEndRaw]);

  // Fetch the canonical pricing preview whenever the offer duration changes
  // — the admin never types a rate; the backend resolves it from room type
  // + duration (resolveAuthoritativeLeasePricing), the same resolver that
  // creates the offer and later the successor Contract.
  useEffect(() => {
    if (!open || mode !== "offer" || !tenant?.reservationId) return;
    const months = Number(offerMonths);
    if (!Number.isFinite(months) || months < 1 || months > 12) {
      setPricingPreview(null);
      setPricingError(months > 12 ? "Renewal offers support 1–12 months." : null);
      return;
    }
    let cancelled = false;
    setPricingLoading(true);
    setPricingError(null);
    reservationApi
      .previewRenewalPricing(tenant.reservationId, months)
      .then((data) => {
        if (!cancelled) setPricingPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPricingPreview(null);
          setPricingError(err?.message || "Could not resolve pricing for this room/duration.");
        }
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, offerMonths, tenant?.reservationId]);

  const handleSelectDuration = (months) => {
    if (months === "custom") {
      setSelectedDuration("custom");
      return;
    }
    const durationNum = Number(months);
    setSelectedDuration(durationNum);
    const newEnd = calculateTargetEnd(durationNum);
    setNewLeaseEndDate(newEnd);
    setOfferMonths(durationNum);
  };

  const handleDateChange = (val) => {
    setNewLeaseEndDate(val);
    setSelectedDuration("custom");
  };

  const extensionHistory =
    context?.renewalHistory || detail?.leaseInfo?.extensionHistory || [];

  const submitOffer = () => {
    if (onOfferSubmit) {
      onOfferSubmit({
        months: Number(offerMonths) || 6,
        expiresAt,
        notes,
      });
    }
    setShowOfferConfirm(false);
  };

  const handleConfirm = () => {
    if (mode === "offer") {
      setShowOfferConfirm(true);
    } else {
      onSubmit({ newLeaseStartDate, newLeaseEndDate, notes });
    }
  };

  return (
    <TenantModalShell
      open={open}
      title={`Extend Reservation • ${tenant?.tenantName || detail?.basicInfo?.tenantName || "Tenant"}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--primary"
            disabled={
              loading ||
              (mode === "direct" && !newLeaseEndDate) ||
              (mode === "offer" && (pricingLoading || !pricingPreview))
            }
            onClick={handleConfirm}
          >
            {loading ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : mode === "offer" ? (
              "Send Extension Offer"
            ) : (
              "Extend Reservation"
            )}
          </button>
        </>
      }
    >
      <div className="flex gap-2.5 mb-5">
        <button
          type="button"
          className={`flex-1 py-2 px-3.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer text-center ${
            mode === "direct"
              ? "border-primary bg-primary text-primary-foreground shadow-xs"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          onClick={() => setMode("direct")}
        >
          Direct Extension
        </button>
        <button
          type="button"
          className={`flex-1 py-2 px-3.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer text-center ${
            mode === "offer"
              ? "border-primary bg-primary text-primary-foreground shadow-xs"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          onClick={() => setMode("offer")}
        >
          Send Extension Offer
        </button>
      </div>

      {/* Duration Preset Selector */}
      <div className="mb-5 space-y-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Extended Term Duration
        </span>
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "+1 Month", value: 1 },
            { label: "+3 Months", value: 3 },
            { label: "+6 Months", value: 6 },
            { label: "+1 Year", value: 12 },
            { label: "Custom", value: "custom" },
          ].map((opt) => {
            const isSelected = selectedDuration === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                className={`py-2 px-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer text-center ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                    : "border-border bg-card text-foreground hover:bg-muted hover:border-border-strong"
                }`}
                onClick={() => handleSelectDuration(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Extension Preview Card */}
      <div className="bg-muted/40 border border-border/80 rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="text-[11px] text-muted-foreground font-medium">Current End Date</div>
          <div className="text-sm text-foreground font-bold">{fmtDate(currentEndRaw)}</div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground font-medium">New Extended End Date</div>
          <div className="text-sm text-foreground font-bold">
            {mode === "offer" ? `+${offerMonths} Months from end` : fmtDate(newLeaseEndDate)}
          </div>
        </div>
      </div>

      {mode === "direct" ? (
        <div className="tenant-modal-grid">
          <label className="tenant-modal-field">
            <span>Current Reservation End</span>
            <input
              type="text"
              value={fmtDate(currentEndRaw)}
              readOnly
              className="bg-muted/50"
            />
          </label>
          <label className="tenant-modal-field">
            <span>New Extended End Date</span>
            <input
              type="date"
              value={newLeaseEndDate}
              onChange={(event) => handleDateChange(event.target.value)}
              onClick={triggerPicker}
            />
          </label>
        </div>
      ) : (
        <div className="tenant-modal-grid">
          <label className="tenant-modal-field">
            <span>Offer Extension (Months)</span>
            <select
              value={offerMonths}
              onChange={(e) => {
                const val = Number(e.target.value);
                setOfferMonths(val);
                handleSelectDuration(val);
              }}
            >
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months (1 Year)</option>
            </select>
          </label>
          <label className="tenant-modal-field">
            <span>Offer Expiry Date</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              onClick={triggerPicker}
            />
          </label>
        </div>
      )}

      {mode === "offer" && (
        <div className="bg-muted/40 border border-border/80 rounded-xl p-3.5 mb-5 space-y-1.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Standard Renewal Pricing
          </div>
          {pricingLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Resolving pricing…
            </div>
          ) : pricingError ? (
            <div className="text-xs text-destructive">{pricingError}</div>
          ) : pricingPreview ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Room Type</span>
                <span className="font-semibold text-foreground capitalize">
                  {String(pricingPreview.roomType || "").replace(/-/g, " ")}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pricing Tier</span>
                <span className="font-semibold text-foreground">
                  {pricingPreview.pricingTier === "long_term" ? "Long Term" : "Short Term"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Regular Monthly Rate</span>
                <span className="text-foreground">{fmtMoney(pricingPreview.regularMonthlyRate)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">{pricingPreview.discountPercentage || 0}%</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-border/60">
                <span className="font-semibold text-foreground">Final Monthly Rate</span>
                <span className="font-bold text-primary">{fmtMoney(pricingPreview.finalMonthlyRate)}</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Select a duration to resolve pricing.</div>
          )}
        </div>
      )}

      <label className="tenant-modal-field">
        <span>Notes / Message to Tenant</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={mode === "offer" ? "Message for tenant in extension offer notification..." : "Optional stay extension notes..."}
        />
      </label>

      <div className="mt-5 space-y-2.5">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Extension History
        </h4>
        {extensionHistory.length === 0 ? (
          <div className="bg-muted/20 border border-dashed border-border rounded-xl p-4 text-center text-muted-foreground text-xs space-y-1">
            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500 mx-auto mb-1 block" />
            No previous stay extensions recorded for this tenant.
          </div>
        ) : (
          <div className="space-y-2">
            {extensionHistory.map((entry, idx) => {
              const startDate = entry.leaseStartDate ? fmtDate(entry.leaseStartDate) : null;
              const endDate = entry.leaseEndDate ? fmtDate(entry.leaseEndDate) : null;
              
              let durationText = null;
              if (entry.addedMonths) {
                durationText = `+${entry.addedMonths} Month${entry.addedMonths === 1 ? "" : "s"}`;
              } else if (entry.leaseStartDate && entry.leaseEndDate) {
                const start = new Date(entry.leaseStartDate);
                const end = new Date(entry.leaseEndDate);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  const diffMonths = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.4375)));
                  durationText = `${diffMonths} Month${diffMonths === 1 ? "" : "s"} Stay`;
                }
              }

              const dateRangeText = startDate && endDate
                ? `${startDate} – ${endDate}`
                : entry.extendedAt
                ? fmtDate(entry.extendedAt)
                : `Stay Term #${idx + 1}`;

              const statusBadge = entry.status ? String(entry.status).toUpperCase() : "EXTENDED";

              return (
                <div
                  key={entry.id || idx}
                  className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex shrink-0 items-center justify-center text-slate-500 dark:text-slate-400">
                      <History className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {dateRangeText}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {entry.notes ? entry.notes : `Term #${idx + 1} • ${statusBadge}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {durationText && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-foreground border border-border/80">
                        {durationText}
                      </span>
                    )}
                    {entry.monthlyRent ? (
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        {fmtMoney(entry.monthlyRent)}/mo
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={showOfferConfirm}
        onClose={() => setShowOfferConfirm(false)}
        onConfirm={submitOffer}
        loading={loading}
        variant="info"
        title="Create Renewal Offer?"
        confirmText="Create Offer"
        message={
          pricingPreview
            ? `${String(pricingPreview.roomType || "").replace(/-/g, " ")} • ${offerMonths} month${offerMonths === 1 ? "" : "s"} (${pricingPreview.pricingTier === "long_term" ? "Long Term" : "Short Term"}) • Regular ${fmtMoney(pricingPreview.regularMonthlyRate)} → Final ${fmtMoney(pricingPreview.finalMonthlyRate)} (${pricingPreview.discountPercentage || 0}% off). The tenant will be offered this exact rate.`
            : "The tenant will be offered the standard approved rate shown above."
        }
      />
    </TenantModalShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared helper: Wizard Step Indicator
   ───────────────────────────────────────────────────────────────────────────── */
function WizardStepper({ steps, currentStep }) {
  return (
    <div className="twm-stepper">
      {steps.map((label, i) => {
        const num = i + 1;
        const state = num < currentStep ? "done" : num === currentStep ? "active" : "idle";
        const isLast = i === steps.length - 1;
        return (
          <div key={num} className={`twm-step twm-step--${state} ${isLast ? "twm-step--last" : ""}`.trim()}>
            <div className="twm-step__num">{state === "done" ? "✓" : num}</div>
            <span className="twm-step__label">{label}</span>
            {!isLast && <div className="twm-step__line" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Transfer Tenant Modal — SCHEDULE step (2-step wizard)
     Step 1: Target Room, Date & Time  →  Step 2: Review
   Scheduling only places a destination hold. Same-day and any future date are
   allowed (only a past date is rejected). The tenant stays in the current room
   — no bill, no meter readings, no occupancy change — until the admin runs the
   separate Complete Transfer step on the scheduled date, where boundary meter
   readings are entered and the settlement is paid.
   ───────────────────────────────────────────────────────────────────────────── */
export function TransferTenantModal({
  open,
  tenant,
  detail,
  loading,
  onClose,
  onSubmit,
  transferRequest = null,
  // sourceRoomLatestReading / electricityRatePerUnit are still passed by the
  // callers but no longer used: the SCHEDULE step captures no meter readings
  // (the admin enters boundary readings at the Complete Transfer step).
}) {
  const branch = detail?.basicInfo?.branch || tenant?.branch || "";
  const { data: roomsData = [], isLoading: roomsLoading } = useRooms(
    open && branch ? { branch } : {},
  );
  const rooms = Array.isArray(roomsData) ? roomsData : roomsData.rooms || [];

  // ── Wizard step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [attemptedStep1, setAttemptedStep1] = useState(false);
  const [showCalculationDetails, setShowCalculationDetails] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");
  const [reason, setReason] = useState("Room transfer");
  const [effectiveTransferDate, setEffectiveTransferDate] = useState("");
  // The admin also picks a TIME. Defaults to the current wall-clock time on open.
  const [effectiveTransferTime, setEffectiveTransferTime] = useState("");

  const outstandingBalance = Number(detail?.billingInfo?.currentBalance || 0);
  const hasOutstanding = outstandingBalance > 0;

  // ── Reset on open ─────────────────────────────────────────────────────────
  // Same-day and any future date are allowed; default the date to today and
  // the time to "now".
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAttemptedStep1(false);
    setShowCalculationDetails(false);
    setRoomId("");
    setBedId("");
    setReason(transferRequest?.reason || "Room transfer");
    setPreparedAddendum(null);
    setEffectiveTransferDate(
      transferRequest?.preferredTransferDate
        ? toDateInputValue(transferRequest.preferredTransferDate)
        : minScheduleDateStr(),
    );
    const now = new Date();
    setEffectiveTransferTime(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
  }, [open, transferRequest]);

  // ── Derived room / bed data ───────────────────────────────────────────────
  const currentRoomType =
    detail?.roomInfo?.type ||
    detail?.roomInfo?.roomType ||
    detail?.basicInfo?.roomType ||
    tenant?.roomType ||
    tenant?.roomId?.type ||
    "";
  // A room transfer MAY cross room types — the only destination filter is
  // "not the tenant's current room" and (implicitly, from the query) same
  // branch. Room-type differences are allowed; the backend and the bed
  // selector below adapt to the DESTINATION room type.
  const targetRooms = useMemo(
    () =>
      rooms.filter(
        (r) => String(r._id || r.id) !== String(tenant?.roomId),
      ),
    [rooms, tenant?.roomId],
  );
  const selectedRoom = targetRooms.find(
    (r) => String(r._id || r.id) === String(roomId),
  );
  const roomBeds = selectedRoom?.beds || [];
  // Bed selection is required for every NON-private destination room — a
  // private room has no bed to pick. This mirrors the backend canonical rule
  // (roomRequiresIndividualBed in reservationContractEligibilityService.js:
  // "private" is the only exemption, every other/unknown room type requires a
  // bed, fail-safe). Do NOT re-enumerate shared room types here — anything
  // that is not literally "private" needs a bed, and the backend Contract
  // validation will reject a non-private transfer that arrives without one.
  const selectedRoomType = selectedRoom?.type || selectedRoom?.roomType || "";
  const destinationNeedsBed = destinationRoomNeedsBed(selectedRoomType);
  const isCrossTypeTransfer =
    !!selectedRoomType && !!currentRoomType && selectedRoomType !== currentRoomType;
  const prettyRoomType = (t) => String(t || "").replace(/-/g, " ") || "—";
  const currentPrice = resolveTenantCurrentRent(tenant, detail, preview);
  const newPrice = Number(selectedRoom?.monthlyPrice || selectedRoom?.price || 0);
  const priceDiff = newPrice - currentPrice;

  // ── Fixed 2-step scheduled wizard ────────────────────────────────────────
  // Every new Admin Room Transfer is scheduled for a future date, so the
  // wizard is permanently: Target Room → Review. No Meter Readings step (the
  // effective-date executor finalizes the boundary readings).
  const wizardSteps = ["Target Room", "Review"];
  const reviewStep = 2;
  const isReviewStep = step === reviewStep;

  // ── Canonical transfer financial preview (server-computed) ────────────────
  // The same rent-settlement + deposit-settlement math the executed transfer
  // runs. Fetched only once a destination room + future effective date are set.
  const reservationId = tenant?.reservationId || detail?.reservationId || null;
  const { data: previewResp, isFetching: previewLoading } = useRoomTransferPreview(
    reservationId,
    {
      targetRoomId: roomId || null,
      effectiveTransferDate: effectiveTransferDate || null,
      includeCandidates: true,
    },
    { enabled: !!reservationId && !!effectiveTransferDate },
  );
  const preview = previewResp?.data?.transferPreview ?? previewResp?.transferPreview ?? null;
  const transferCandidates =
    previewResp?.data?.transferCandidates ?? previewResp?.transferCandidates ?? null;
  const candidateByRoomId = useMemo(() => {
    const map = new Map();
    (transferCandidates || []).forEach((c) => {
      map.set(String(c.roomId), c);
    });
    return map;
  }, [transferCandidates]);
  const selectedCandidate = candidateByRoomId.get(String(roomId)) || null;

  // ── Step gate validation ──────────────────────────────────────────────────
  const step1Valid =
    !!roomId &&
    (!destinationNeedsBed || !!bedId) &&
    !!effectiveTransferDate &&
    effectiveTransferDate >= minScheduleDateStr() &&
    !!effectiveTransferTime &&
    reason.trim().length > 0 &&
    (!selectedCandidate || selectedCandidate.selectable);

  // ── Step transition validation handlers with friendly toasts ────────────────
  const handleNextStep1 = () => {
    setAttemptedStep1(true);
    if (!roomId) {
      showNotification("Please select a target room for the transfer.", "warning");
      return;
    }
    if (destinationNeedsBed && !bedId) {
      showNotification("Please select an available bed in the target room.", "warning");
      return;
    }
    if (!effectiveTransferDate || effectiveTransferDate < minScheduleDateStr()) {
      showNotification(
        "Pick an effective date of today or later.",
        "warning",
      );
      return;
    }
    if (!effectiveTransferTime) {
      showNotification("Please pick a transfer time.", "warning");
      return;
    }
    if (selectedCandidate && !selectedCandidate.selectable) {
      showNotification(
        selectedCandidate.unavailableReason || "This room is not available for the selected transfer date. Please choose another room or adjust the transfer date.",
        "warning",
      );
      return;
    }
    if (!reason.trim()) {
      showNotification("Please enter a reason for the room transfer.", "warning");
      return;
    }
    setStep(2);
  };

  // ── Bed label helper ─────────────────────────────────────────────────────
  const selectedBed = roomBeds.find((b) => String(b.id || b._id) === String(bedId));
  const selectedBedLabel = selectedBed
    ? getBedDisplayLabel(selectedBed, roomBeds.indexOf(selectedBed), selectedRoom?.type || selectedRoom?.roomType)
    : bedId || "—";

  // -- PDF download handler (lazy-import -- jsPDF only loaded on demand) ------
  // The PDF MUST mirror the on-screen canonical server `preview` (transferPreview)
  // exactly — no separate frontend proration. If the server preview has not
  // resolved yet the button is disabled, so `preview` is always present here.
  const [pdfLoading, setPdfLoading] = useState(false);
  const handleDownloadTransferPDF = async () => {
    if (!preview) {
      showNotification("Settlement preview is still loading — please wait.", "warning");
      return;
    }
    setPdfLoading(true);
    try {
      const { generateSettlementReceiptPDF } = await import("../../../shared/utils/receiptGenerator.js");
      await generateSettlementReceiptPDF({
        type: "transfer",
        tenantName: tenant?.tenantName || "",
        branch: detail?.basicInfo?.branch || tenant?.branch || "",
        fromRoom: preview.fromRoom?.name || tenant?.room || "",
        fromBed: formatBedPosition(tenant?.bed) || "",
        toRoom: preview.toRoom?.name || selectedRoom?.name || selectedRoom?.roomNumber || "",
        toBed: selectedBedLabel,
        effectiveDate: preview.effectiveTransferDate || effectiveTransferDate,
        // ── Canonical server settlement preview (identical to what Admin sees) ──
        transferPreview: preview,
        currentRent: preview.rent?.sourceEffectiveRate ?? currentPrice,
        newRent: preview.rent?.destinationApprovedRate ?? newPrice,
        // Electricity/water are finalized on the effective date and are NOT
        // part of the Scheduled Room Transfer Balance — no scheduling-time
        // meter estimate.
        outstandingBalance,
      });
    } catch (err) {
      console.error("Settlement PDF generation failed:", err);
      showNotification("Failed to generate settlement receipt PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  // -- R2: Room Transfer Addendum preview (prepare Draft, no cutover) --------
  // Calls POST /transfer/prepare-addendum (idempotent, mutates nothing
  // physical), then opens the prepared Addendum PDF in a new tab. A later
  // "Confirm Schedule" reuses this same Draft.
  const [addendumLoading, setAddendumLoading] = useState(false);
  const [preparedAddendum, setPreparedAddendum] = useState(null);
  const handlePreviewAddendum = async () => {
    const resId = tenant?.reservationId || detail?.reservationId || null;
    if (!resId || !roomId) {
      showNotification("Choose a destination room first.", "warning");
      return;
    }
    setAddendumLoading(true);
    try {
      const resp = await reservationApi.prepareRoomTransferAddendum(resId, {
        targetRoomId: roomId,
        targetBedId: destinationNeedsBed ? bedId : undefined,
        effectiveTransferDate: effectiveTransferDate || undefined,
      });
      const addendum = resp?.addendum || resp?.data?.addendum || null;
      setPreparedAddendum(addendum);
      if (addendum?.contractId) {
        try {
          const { contractApi } = await import("../../../shared/api/contractApi");
          const blob = await contractApi.getPreparedContractPdfBlob(addendum.contractId, addendum.preparedDocument?.version || undefined);
          const url = URL.createObjectURL(blob);
          const win = window.open(url, "_blank");
          // Revoke after the new tab has had time to load the PDF; if the
          // popup was blocked, revoke immediately.
          if (win) {
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } else {
            URL.revokeObjectURL(url);
            showNotification("Addendum prepared. Allow pop-ups to preview the PDF, or download it from the tenant's Contracts tab.", "info");
          }
        } catch {
          showNotification("Room Transfer Addendum prepared. Open it from the tenant's Contracts tab to view/print.", "info");
        }
      }
      showNotification(
        resp?.reused ? "Existing Room Transfer Addendum draft reused." : "Room Transfer Addendum draft prepared.",
        "success",
      );
    } catch (err) {
      console.error("Prepare Room Transfer Addendum failed:", err);
      showNotification(err?.message || "Failed to prepare the Room Transfer Addendum.", "error");
    } finally {
      setAddendumLoading(false);
    }
  };

  // -- Footer renderer ------------------------------------------------------
  const renderFooter = () => (
    <div className="twm-footer">
      <button type="button" className="tenant-modal-btn tenant-modal-btn--ghost" onClick={onClose}>
        Cancel
      </button>
      <div className="twm-footer__spacer" />
      <div className="twm-footer__actions">
        {step > 1 && (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--back"
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>
        )}
        {!isReviewStep ? (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--primary"
            onClick={handleNextStep1}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--success"
            disabled={loading || !step1Valid}
            onClick={() => {
              if (!step1Valid) {
                showNotification("Please make sure all transfer details are valid.", "warning");
                return;
              }
              onSubmit({
                roomId,
                bedId,
                reason,
                effectiveTransferDate,
                effectiveTransferTime,
                // A scheduled transfer never carries scheduling-day meter
                // readings — the admin enters the boundary readings at the
                // real cutover on the Complete Transfer step.
                sourceRoomMeterReading: null,
                targetRoomMeterReading: null,
              });
            }}
          >
            {loading ? (
              <>
                <LoaderCircle size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Confirm Schedule</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <TenantModalShell
      open={open}
      title={`Transfer Tenant${tenant?.tenantName ? ` • ${tenant.tenantName}` : ""}`}
      onClose={onClose}
      footer={renderFooter()}
      className="tenant-workspace-modal--transfer"
    >
      <WizardStepper steps={wizardSteps} currentStep={step} />

      {transferRequest ? (
        <div className="twm-callout twm-callout--info" style={{ margin: "0 0 10px 0" }}>
          Tenant preference: {prettyRoomType(transferRequest.preferredRoomType)}
          {transferRequest.preferredRoom?.name ? ` · ${transferRequest.preferredRoom.name}` : ""}
          {transferRequest.preferredTransferDate
            ? ` · ${new Date(transferRequest.preferredTransferDate).toLocaleDateString("en-PH")}`
            : ""}. Confirm a valid destination below using the normal availability rules.
        </div>
      ) : null}

      {/* ── STEP 1: Target Room & Date ─────────────────────────────────── */}
      {step === 1 && (
        <>
          <div className="twm-callout twm-callout--info" style={{ margin: 0 }}>
            Transfer to any available room in the same branch{currentRoomType ? ` (currently ${prettyRoomType(currentRoomType)})` : ""}. The
            room type may change &mdash; a shared destination requires a bed, a private one does not, and the monthly rate follows the
            destination room type.
          </div>

          {hasOutstanding && (
            <div className="twm-callout twm-callout--info" style={{ margin: 0 }}>
              <strong>Note: Outstanding balance {fmtMoney(outstandingBalance)}</strong>
              <p style={{ margin: "3px 0 0", fontSize: 12.5 }}>
                Scheduling a transfer does not require the current balance to be
                cleared. The transfer&apos;s own settlement (rent, deposit, and
                finalized electricity) is calculated and must be paid at the
                Complete Transfer step, before the physical cutover.
              </p>
            </div>
          )}

          <div className="tenant-modal-grid">
            <label className="tenant-modal-field">
              <span>Current Assignment</span>
              <input
                type="text"
                value={`${tenant?.room || "Unknown room"} • ${formatBedPosition(tenant?.bed) || "No bed"}`}
                readOnly
              />
            </label>
            <label className="tenant-modal-field">
              <span>Branch</span>
              <input type="text" value={formatBranch(branch) || "—"} readOnly />
            </label>
          </div>

          <div className="tenant-modal-grid">
            <div className={`tenant-modal-field ${attemptedStep1 && !roomId ? "tenant-modal-field--invalid" : ""}`}>
              <span>New Room</span>
              <SearchableRoomSelect
                rooms={targetRooms}
                value={roomId}
                onChange={(newRoomId) => {
                  setRoomId(newRoomId);
                  // Any bed picked for a previous destination is stale once the
                  // room changes — a shared room reloads its own bed list, a
                  // private room needs none.
                  setBedId("");
                }}
                disabled={roomsLoading}
                placeholder="Search and select room..."
                fmtMoney={fmtMoney}
                isInvalid={attemptedStep1 && !roomId}
              />
              {selectedCandidate && (
                <div
                  className="twm-candidate-availability"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginTop: "5px",
                    fontSize: "12px",
                    lineHeight: "1.35",
                    textTransform: "none",
                    letterSpacing: "normal",
                    fontWeight: 500,
                    color: selectedCandidate.selectable ? "#15803d" : "#b91c1c",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      backgroundColor: selectedCandidate.selectable ? "#16a34a" : "#dc2626",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      textTransform: "none",
                      letterSpacing: "normal",
                      color: "inherit",
                      fontSize: "12px",
                    }}
                  >
                    {selectedCandidate.selectable
                      ? "Available for the selected date"
                      : selectedCandidate.unavailableReason ||
                        "This room is not available for the selected transfer date. Please choose another room or adjust the transfer date."}
                  </span>
                </div>
              )}
            </div>

            {destinationNeedsBed ? (
              <label className={`tenant-modal-field ${attemptedStep1 && !bedId ? "tenant-modal-field--invalid" : ""}`}>
                <span>New Bed</span>
                <select
                  value={bedId}
                  onChange={(event) => setBedId(event.target.value)}
                  disabled={!roomId}
                  className={attemptedStep1 && !bedId ? "tenant-modal-field--invalid" : ""}
                >
                  <option value="">Select a bed</option>
                  {roomBeds.map((bed, index) => {
                    const isAvailable = bed.status ? bed.status === "available" : bed.available !== false;
                    const bedCode = getBedShortCode(selectedRoom?.roomNumber || selectedRoom?.name, bed, index);
                    const displayLabel = getBedDisplayLabel(bed, index, selectedRoom?.type || selectedRoom?.roomType);
                    const statusTag = isAvailable ? "" : ` — (${(bed.status || "unavailable").replace("_", " ")})`;
                    return (
                      <option key={bed.id || bed._id || index} value={bed.id || bed._id} disabled={!isAvailable}>
                        {bedCode ? `${bedCode} (${displayLabel})` : displayLabel}{statusTag}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <label className="tenant-modal-field">
                <span>New Bed</span>
                <input
                  type="text"
                  value={roomId ? "Not applicable — private room" : "Select a room first"}
                  readOnly
                />
              </label>
            )}
          </div>

          {roomId && (
            <div className="twm-callout twm-callout--info" style={{ margin: 0, padding: "8px 12px", fontSize: 12.5 }}>
              Destination:{" "}
              <strong>{selectedRoom?.name || selectedRoom?.roomNumber || "—"}</strong>
              {" · "}
              <strong>{prettyRoomType(selectedRoomType)}</strong>
              {isCrossTypeTransfer && (
                <span> (was {prettyRoomType(currentRoomType)} — room type changes with this transfer)</span>
              )}
              {" · "}
              {destinationNeedsBed ? "bed required" : "no bed (private room)"}
            </div>
          )}

          {roomId && priceDiff !== 0 && (
            <div className="twm-callout twm-callout--price" style={{ margin: 0, padding: "8px 12px", fontSize: 12.5 }}>
              Estimated Monthly Rent Change:{" "}
              <strong>
                {priceDiff > 0 ? `+${fmtMoney(priceDiff)}/mo` : `-${fmtMoney(Math.abs(priceDiff))}/mo`}
              </strong>{" "}
              (Now: {fmtMoney(currentPrice)}/mo → New room: ~{fmtMoney(newPrice)}/mo)
            </div>
          )}

          <div className="tenant-modal-grid">
            <div className={`tenant-modal-field ${attemptedStep1 && (!effectiveTransferDate || effectiveTransferDate < minScheduleDateStr()) ? "tenant-modal-field--invalid" : ""}`}>
              <span>Effective Transfer Date</span>
              <input
                type="date"
                value={effectiveTransferDate}
                min={minScheduleDateStr()}
                onChange={(e) => setEffectiveTransferDate(e.target.value)}
                onClick={triggerPicker}
              />
            </div>
            <div className={`tenant-modal-field ${attemptedStep1 && !effectiveTransferTime ? "tenant-modal-field--invalid" : ""}`}>
              <span>Transfer Time</span>
              <input
                type="time"
                value={effectiveTransferTime}
                onChange={(e) => setEffectiveTransferTime(e.target.value)}
              />
            </div>
          </div>
          <span className="twm-meter-hint">
            <Clock size={14} style={{ flexShrink: 0, marginTop: 2, color: "#2563eb" }} />
            <span>
              <strong>Transfer timing.</strong> Same-day or any future date is
              allowed. The tenant stays in the current room until you complete
              the transfer on the scheduled date, when room, rent, and utility
              responsibility switch over.
            </span>
          </span>

          <label className={`tenant-modal-field ${attemptedStep1 && !reason.trim() ? "tenant-modal-field--invalid" : ""}`}>
            <span>Reason for Transfer</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required — describe the reason for this transfer"
            />
          </label>
        </>
      )}

      {/* ── STEP 2: Review & Scheduled Transfer Balance ─────────────────── */}
      {isReviewStep && (
        <div className="twm-review-flow">
          {/* ── 1. Unified Transfer Route & Specification Summary Card ── */}
          <div className="twm-review-summary-card">
            {/* Route Journey */}
            <div className="twm-transfer-journey">
              <div className="twm-transfer-journey__side">
                <span className="twm-transfer-journey__tag">Current Assignment</span>
                <span className="twm-transfer-journey__room">{tenant?.room || "—"}</span>
                <span className="twm-transfer-journey__bed">{formatBedPosition(tenant?.bed) || "No bed"}</span>
              </div>
              <div className="twm-transfer-journey__arrow-wrap">
                <div className="twm-transfer-journey__arrow-circle">
                  <ArrowRight size={15} />
                </div>
              </div>
              <div className="twm-transfer-journey__side twm-transfer-journey__side--target">
                <span className="twm-transfer-journey__tag">New Assignment</span>
                <span className="twm-transfer-journey__room">{selectedRoom?.name || selectedRoom?.roomNumber || "—"}</span>
                <span className="twm-transfer-journey__bed">
                  {destinationNeedsBed ? selectedBedLabel : "Private room (no bed)"}
                </span>
              </div>
            </div>

            {/* Specifications Details Grid */}
            <div className="twm-review-summary-specs">
              <div className="twm-review-spec-row">
                <div className="twm-review-spec-item">
                  <span className="twm-review-spec-label">Room Type</span>
                  <span className="twm-review-spec-value">
                    {prettyRoomType(selectedRoomType)}
                    {isCrossTypeTransfer && (
                      <span className="twm-review-card__subtext">
                        {" "}(Changed from {prettyRoomType(currentRoomType)})
                      </span>
                    )}
                  </span>
                </div>

                <div className="twm-review-spec-item" style={{ textAlign: "right" }}>
                  <span className="twm-review-spec-label">Effective Date &amp; Time</span>
                  <span className="twm-review-spec-value">
                    {fmtDate(effectiveTransferDate)}
                    {effectiveTransferTime ? ` · ${effectiveTransferTime}` : ""}
                  </span>
                </div>
              </div>

              <div className="twm-review-card twm-review-card--wide" style={{ margin: 0 }}>
                <span className="twm-review-card__label">New Monthly Rent</span>
                <div className="twm-review-card__rent-row">
                  <span className="twm-review-card__rent-main">
                    {fmtMoney(preview?.rent?.destinationApprovedRate ?? newPrice)}/mo
                  </span>
                  {(() => {
                    const shownSource = Number(preview?.rent?.sourceEffectiveRate || currentPrice);
                    const shownNew = Number(preview?.rent?.destinationApprovedRate || newPrice);
                    if (!shownSource || !shownNew || shownSource === shownNew) return null;
                    const diff = shownNew - shownSource;
                    return (
                      <span className="twm-review-card__rent-badge">
                        {diff > 0 ? `+${fmtMoney(diff)}` : `-${fmtMoney(Math.abs(diff))}`} from {fmtMoney(shownSource)}/mo
                      </span>
                    );
                  })()}
                </div>
                <span className="twm-review-card__subtext">
                  Applies to every future rent bill automatically. Original lease term is unchanged.
                </span>
              </div>
            </div>
          </div>

          {/* ── 2. Scheduled Room Transfer Balance Card ── */}
          <div className="twm-settlement-card">
            <div className="twm-settlement-card__header">
              <p className="twm-settlement-card__title">Scheduled Room Transfer Balance</p>
              <button
                type="button"
                className="twm-settlement-card__download-btn"
                disabled={pdfLoading || !preview || preview.deposit?.heldKnown === false}
                onClick={handleDownloadTransferPDF}
                title={
                  preview?.deposit?.heldKnown === false
                    ? "Deposit verification is required before a financial estimate can be generated"
                    : preview
                      ? "Download printable settlement estimate"
                      : "Preview still loading…"
                }
              >
                <Download size={13} />
                <span>{pdfLoading ? "Generating..." : "Download Estimate PDF"}</span>
              </button>
            </div>

            {previewLoading && !preview ? (
              <div className="twm-settlement-card__body">
                <div className="twm-settlement-row">
                  <span className="twm-settlement-row__label">Calculating settlement…</span>
                </div>
              </div>
            ) : preview ? (
              <>
                <div className="twm-settlement-card__body">
                  {/* ── Executive Summary Rows ── */}
                  <div className="twm-settlement-row">
                    <span className="twm-settlement-row__label">Prorated Rent Balance</span>
                    <span className="twm-settlement-row__value">{fmtMoney(preview.rent.adjustmentDue)}</span>
                  </div>

                  <div className="twm-settlement-row">
                    <span className="twm-settlement-row__label">Security Deposit Balance Due</span>
                    <span className="twm-settlement-row__value">{fmtMoney(preview.deposit.balanceDue)}</span>
                  </div>

                  <div className="twm-settlement-row twm-settlement-row--total">
                    <span className="twm-settlement-row__label">Scheduled Room Transfer Balance</span>
                    <span className="twm-settlement-row__value">
                      {preview.deposit.heldKnown
                        ? fmtMoney(preview.totalImmediateDue)
                        : "Calculated after deposit verification at Complete Transfer"}
                    </span>
                  </div>

                  {/* ── Collapsible Calculation Trigger ── */}
                  <button
                    type="button"
                    className={`twm-accordion-trigger ${showCalculationDetails ? "twm-accordion-trigger--open" : ""}`}
                    onClick={() => setShowCalculationDetails((v) => !v)}
                    aria-expanded={showCalculationDetails}
                    aria-label={showCalculationDetails ? "Hide Itemized Calculation & Policies" : "View Itemized Calculation & Policies"}
                  >
                    <div className="twm-accordion-trigger__left">
                      <Calculator size={13} className="twm-accordion-trigger__icon" />
                      <span>{showCalculationDetails ? "Hide Itemized Calculation & Policies" : "View Itemized Calculation & Policies"}</span>
                    </div>
                    <ChevronDown size={14} className="twm-accordion-trigger__chevron" />
                  </button>

                  {/* ── Collapsible Body (Recessed Inset Container) ── */}
                  {showCalculationDetails && (
                    <div className="twm-accordion-body">
                      {/* ── RENT ADJUSTMENT GROUP ── */}
                      <div className="twm-financial-group">
                        <div className="twm-financial-group__header">
                          <span>Rent Adjustment</span>
                        </div>
                        <div className="twm-settlement-row">
                          <span className="twm-settlement-row__label">
                            Prorated Rent Balance
                            <span className="twm-settlement-row__hint">
                              {preview.rent.destinationDays}d new-room prorated ({fmtMoney(preview.rent.destinationProratedValue)}) − unused prepaid ({fmtMoney(preview.rent.unusedPrepaidCredit)})
                            </span>
                          </span>
                          <span className="twm-settlement-row__value">{fmtMoney(preview.rent.adjustmentDue)}</span>
                        </div>
                        {preview.rent.excessCredit > 0 && (
                          <div className="twm-settlement-row twm-settlement-row--success">
                            <span className="twm-settlement-row__label">
                              Potential Prepaid-Rent Adjustment
                              <span className="twm-settlement-row__hint">
                                No automatic refund or rent credit. Coordinate with the Administration Office on the 2nd Floor.
                              </span>
                            </span>
                            <span className="twm-settlement-row__value">−{fmtMoney(preview.rent.excessCredit)}</span>
                          </div>
                        )}
                      </div>

                      {/* ── SECURITY DEPOSIT GROUP ── */}
                      <div className="twm-financial-group">
                        <div className="twm-financial-group__header">
                          <span>Security Deposit</span>
                        </div>
                        <div className="twm-settlement-row twm-settlement-row--muted">
                          <span className="twm-settlement-row__label">
                            Deposit Preservation Policy
                            <span className="twm-settlement-row__hint">
                              Security deposits are carried over intact and never deducted during a room transfer. Deductions only apply during final move-out clearance.
                            </span>
                          </span>
                          <span className="twm-settlement-row__value" style={{ color: "var(--text-muted)" }}>100% Preserved</span>
                        </div>
                        <div className="twm-settlement-row">
                          <span className="twm-settlement-row__label">Security Deposit — Required (new room)</span>
                          <span className="twm-settlement-row__value">{fmtMoney(preview.deposit.required)}</span>
                        </div>
                        <div className="twm-settlement-row">
                          <span className="twm-settlement-row__label">Security Deposit — Currently Held</span>
                          <span className="twm-settlement-row__value">
                            {preview.deposit.heldKnown ? fmtMoney(preview.deposit.held) : "Unavailable (legacy record)"}
                          </span>
                        </div>
                        {!preview.deposit.heldKnown && (
                          <div className="twm-callout twm-callout--info" style={{ margin: "4px 0", fontSize: 12 }}>
                            Security deposit held has not been verified. You may schedule this transfer, but deposit verification is required before Complete Transfer.
                          </div>
                        )}
                        {preview.deposit.balanceDue > 0 && (
                          <div className="twm-settlement-row">
                            <span className="twm-settlement-row__label">Additional Security Deposit Due</span>
                            <span className="twm-settlement-row__value">{fmtMoney(preview.deposit.balanceDue)}</span>
                          </div>
                        )}
                        {preview.deposit.excessHeld > 0 && (
                          <div className="twm-settlement-row twm-settlement-row--success">
                            <span className="twm-settlement-row__label">
                              Potential Excess Held Deposit
                              <span className="twm-settlement-row__hint">
                                Remains held. No automatic refund or rent conversion; coordinate with the Administration Office on the 2nd Floor.
                              </span>
                            </span>
                            <span className="twm-settlement-row__value">{fmtMoney(preview.deposit.excessHeld)}</span>
                          </div>
                        )}
                      </div>

                      {/* ── UTILITIES NOTICE (Informational only) ── */}
                      <div className="twm-settlement-row twm-settlement-row--muted">
                        <span className="twm-settlement-row__label">
                          Source-room electricity
                          <span className="twm-settlement-row__hint">
                            Entered by the admin at the Complete Transfer step; the final charge follows the normal utility period close.
                          </span>
                        </span>
                        <span className="twm-settlement-row__value" style={{ color: "var(--text-muted)" }}>
                          billed at period close
                        </span>
                      </div>
                      <div className="twm-settlement-row twm-settlement-row--muted">
                        <span className="twm-settlement-row__label">
                          Water
                          <span className="twm-settlement-row__hint">
                            Settled at its normal period close.
                          </span>
                        </span>
                        <span className="twm-settlement-row__value" style={{ color: "var(--text-muted)" }}>—</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="twm-settlement-card__note">
                  Meter readings are entered at the Complete Transfer step, on the real cutover. Electricity and water are finalized and billed at period close following normal utility period close. Neither is part of this scheduled balance.
                </div>
              </>
            ) : (
              <div className="twm-settlement-card__body">
                <p className="twm-settlement-card__note">
                  Settlement preview unavailable — figures will be computed server-side when the transfer is confirmed.
                </p>
              </div>
            )}
          </div>

          {/* ── 3. Room Transfer Addendum Action Box ── */}
          <div className="twm-addendum-action-card">
            <div className="twm-addendum-action-card__header">
              <div className="twm-addendum-action-card__info">
                <div className="twm-addendum-action-card__title-row">
                  <span className="twm-addendum-action-card__title">Room Transfer Addendum</span>
                  <span className={`twm-addendum-action-card__badge ${preparedAddendum ? "twm-addendum-action-card__badge--ready" : ""}`}>
                    <span className="twm-addendum-action-card__dot" />
                    {preparedAddendum ? `Draft #${preparedAddendum.contractNumber || "Ready"}` : "Draft Ready"}
                  </span>
                </div>
                <span className="twm-addendum-action-card__desc">
                  Amends room &amp; rent for the existing lease. Original lease dates ({(() => {
                    const origStart = preparedAddendum?.leaseStartDate || preview?.leaseStartDate || detail?.basicInfo?.leaseStartDate || tenant?.leaseStartDate;
                    const origEnd = preparedAddendum?.leaseEndDate || preview?.leaseEndDate || detail?.basicInfo?.leaseEndDate || tenant?.leaseEndDate;
                    return origStart || origEnd ? `${fmtDate(origStart)} → ${fmtDate(origEnd)}` : "active term";
                  })()}) remain unchanged &mdash; does not start a new lease or reset the term. Old room → New room ({tenant?.room || "—"} → {selectedRoom?.name || selectedRoom?.roomNumber || "—"}), Old rent → New rent ({fmtMoney(preview?.rent?.sourceEffectiveRate ?? currentPrice)}/mo → {fmtMoney(preview?.rent?.destinationApprovedRate ?? newPrice)}/mo).
                </span>
              </div>
              <button
                type="button"
                className="twm-addendum-action-card__btn"
                disabled={addendumLoading || !roomId || (destinationNeedsBed && !bedId)}
                onClick={handlePreviewAddendum}
                title="Prepare and open the Room Transfer Addendum draft (no changes are made to the tenant yet)"
              >
                <Download size={13} />
                <span>{addendumLoading ? "Preparing…" : "Preview / Download Addendum"}</span>
              </button>
            </div>
            <p className="twm-addendum-action-card__footnote">
              This is a Room Transfer Addendum, not a replacement lease. Nothing is changed for the tenant until you press <strong>Confirm Schedule</strong>.
            </p>
          </div>

          {/* ── 4. Remarks & Callouts ── */}
          {reason && (
            <div className="twm-remarks-card" style={{ margin: 0 }}>
              <span className="twm-remarks-card__label">Reason for Transfer</span>
              <p className="twm-remarks-card__text">{reason}</p>
            </div>
          )}

          {hasOutstanding && (
            <div className="twm-callout twm-callout--info" style={{ margin: 0, fontSize: 12.5 }}>
              The tenant&apos;s current balance of {fmtMoney(outstandingBalance)} is
              tracked separately and is not affected by scheduling this transfer.
            </div>
          )}
        </div>
      )}
    </TenantModalShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Move-Out Modal — 3-Step Wizard
   Step 1: Date & Time
   Step 2: Final Meter & Room Condition
   Step 3: Review & Deposit Clearance
   ───────────────────────────────────────────────────────────────────────────── */
export function MoveOutModal({ open, tenant, detail, loading, onClose, onSubmit, sourceRoomLatestReading, electricityRatePerUnit }) {
  // ── Wizard step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Form state ────────────────────────────────────────────────────────────
  const [moveOutDate, setMoveOutDate] = useState("");
  const [moveOutTime, setMoveOutTime] = useState("10:00");
  const [waterReading,setWaterReading] = useState("");
  const requiresWater = (detail?.basicInfo?.branch || tenant?.branch) === "gil-puyat" && ["private","double-sharing"].includes(detail?.basicInfo?.roomType || tenant?.roomType || detail?.roomInfo?.type);
  const [meterReading, setMeterReading] = useState("");
  const [keyReturned, setKeyReturned] = useState(true);
  const [damageDeductions, setDamageDeductions] = useState("");
  const [notes, setNotes] = useState("");

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMoveOutDate(toDateInputValue(new Date()));
    setMoveOutTime("10:00");
    setMeterReading("");
    setWaterReading("");
    setKeyReturned(true);
    setDamageDeductions("");
    setNotes("");
  }, [open]);

  // ── Derived values ────────────────────────────────────────────────────────
  const moveOutReason = tenant?.allowedActions?.moveOut?.reason || "";
  const leaseEndDate = detail?.leaseInfo?.leaseEndDate || tenant?.leaseEndDate;
  const isEarlyVacancy = Boolean(
    leaseEndDate && moveOutDate && new Date(moveOutDate) < new Date(leaseEndDate),
  );
  const securityDeposit = resolveDepositFromPaymentInfo(
    detail?.paymentInfo,
    detail?.basicInfo?.monthlyRent ?? tenant?.monthlyRent ?? 0,
  );
  const outstandingBal = Math.max(
    0,
    Number(detail?.paymentInfo?.currentBalance ?? tenant?.currentBalance ?? 0) || 0,
  );
  const damageFee = Number(damageDeductions || 0);
  const keyFee = keyReturned ? 0 : 500;
  // ── Baseline & electricity estimates ───────────────────────────────────────
  const moveOutBaseline = sourceRoomLatestReading?.reading != null
    ? Number(sourceRoomLatestReading.reading)
    : null;
  const meterEntered = meterReading !== "" ? Number(meterReading) : null;
  const moveOutDelta = moveOutBaseline !== null && meterEntered !== null
    ? meterEntered - moveOutBaseline
    : null;
  const moveOutBelowBaseline = moveOutDelta !== null && moveOutDelta < 0;
  const moveOutKwh = moveOutDelta !== null && moveOutDelta > 0
    ? Math.round(moveOutDelta * 100) / 100
    : null;
  const moveOutRate = electricityRatePerUnit != null ? Number(electricityRatePerUnit) : null;
  const estimatedElectricityCostMoveOut =
    moveOutKwh !== null && moveOutRate !== null && moveOutRate > 0
      ? Math.round(moveOutKwh * moveOutRate * 100) / 100
      : null;

  // ── Deposit clearance math ────────────────────────────────────────────────
  const electricityDeduction = estimatedElectricityCostMoveOut ?? 0;
  const totalDeductions = outstandingBal + damageFee + keyFee + electricityDeduction;
  const netSettlement = isEarlyVacancy
    ? 0
    : Math.max(0, securityDeposit - totalDeductions);
  const hasDebt = !isEarlyVacancy && netSettlement === 0 &&
    totalDeductions > securityDeposit;
  const remainingDebt = hasDebt
    ? Math.round((totalDeductions - securityDeposit) * 100) / 100
    : 0;

  // ── Step gate validation ──────────────────────────────────────────────────
  const step1Valid = !!moveOutDate && !!moveOutTime;
  const step2Valid = !!meterReading && !moveOutBelowBaseline && (!requiresWater || (waterReading !== "" && Number.isFinite(Number(waterReading)) && Number(waterReading)>=0));

  // -- MoveOut PDF download handler (lazy-import) -----------------------
  const [pdfLoading, setPdfLoading] = useState(false);
  const handleDownloadMoveOutPDF = async () => {
    setPdfLoading(true);
    try {
      const { generateSettlementReceiptPDF } = await import("../../../shared/utils/receiptGenerator.js");
      await generateSettlementReceiptPDF({
        type: "moveOut",
        tenantName: tenant?.tenantName || "",
        branch: detail?.basicInfo?.branch || tenant?.branch || "",
        fromRoom: tenant?.room || "",
        fromBed: formatBedPosition(tenant?.bed) || "",
        effectiveDate: moveOutDate,
        moveOutTime,
        finalMeterReading: meterReading,
        securityDeposit,
        outstandingBal,
        keyFee,
        damageFee,
        electricityDeduction,
        kwhPreview: moveOutKwh,
        electricityRate: moveOutRate,
        netSettlement,
        remainingDebt,
        isEarlyVacancy,
      });
    } catch (err) {
      console.error("Settlement PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  };


  // -- Footer renderer ------------------------------------------------------
  const renderFooter = () => (
    <div className="twm-footer">
      <button type="button" className="tenant-modal-btn tenant-modal-btn--ghost" onClick={onClose}>
        Cancel
      </button>
      <div className="twm-footer__spacer" />
      <div className="twm-footer__actions">
        {step > 1 && (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--back"
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--primary"
            disabled={step === 1 ? !step1Valid : !step2Valid}
            onClick={() => setStep((s) => s + 1)}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--danger"
            disabled={loading || !step1Valid || !step2Valid}
            onClick={() =>
              onSubmit({
                moveOutDate,
                moveOutTime,
                meterReading: Number(meterReading),
                ...(requiresWater ? {finalWaterReading:Number(waterReading)} : {}),
                keyReturned,
                damageDeductions: Number(damageDeductions || 0),
                notes,
              })
            }
          >
            {loading ? (
              <>
                <LoaderCircle size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <LogOut size={16} />
                <span>Confirm Move-Out</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <TenantModalShell
      open={open}
      title={`Process Move-Out${tenant?.tenantName ? ` • ${tenant.tenantName}` : ""}`}
      onClose={onClose}
      footer={renderFooter()}
    >
      <WizardStepper
        steps={["Date & Time", "Meter & Condition", "Review"]}
        currentStep={step}
      />

      {/* ── STEP 1: Date & Time ───────────────────────────────────────── */}
      {step === 1 && (
        <>
          <div className="tenant-modal-grid">
            <label className="tenant-modal-field">
              <span>Lease End Date</span>
              <input type="text" value={fmtDate(leaseEndDate)} readOnly />
            </label>
            <label className="tenant-modal-field">
              <span>Current Outstanding Balance</span>
              <input type="text" value={fmtMoney(outstandingBal)} readOnly />
            </label>
          </div>

          {moveOutReason && (
            <div className="twm-callout twm-callout--warning">{moveOutReason}</div>
          )}

          <div className="tenant-modal-grid">
            <label className="tenant-modal-field">
              <span>Move-Out Date</span>
              <input
                type="date"
                value={moveOutDate}
                onChange={(event) => setMoveOutDate(event.target.value)}
                onClick={triggerPicker}
              />
            </label>
            <label className="tenant-modal-field">
              <span>Move-Out Time</span>
              <input
                type="time"
                value={moveOutTime}
                onChange={(event) => setMoveOutTime(event.target.value)}
                onClick={triggerPicker}
              />
            </label>
          </div>

          {isEarlyVacancy && (
            <div className="twm-callout twm-callout--danger">
              ⚠ Early Vacancy Detected: Moving out before lease end ({fmtDate(leaseEndDate)}) will result in automatic deposit forfeiture per contract Section 4.
            </div>
          )}
        </>
      )}

      {/* ── STEP 2: Final Meter & Room Condition ──────────────────────── */}
      {step === 2 && (
        <>
          <div className="twm-callout twm-callout--info">
            Record the final meter reading and note any deductions before proceeding to the financial summary.
          </div>

          <div className="tenant-modal-grid">
            <label className="tenant-modal-field">
              <span>Final Meter Reading (kWh)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 1,450.50"
                value={meterReading}
                onChange={(event) => setMeterReading(event.target.value)}
              />
              {moveOutBaseline !== null ? (
                <span className={`twm-meter-hint ${
                  moveOutBelowBaseline ? "twm-meter-hint--warn" : moveOutDelta !== null ? "twm-meter-hint--delta" : "twm-meter-hint--none"
                }`}>
                  {moveOutBelowBaseline
                    ? `⚠ Reading cannot be below last recorded baseline of ${moveOutBaseline.toLocaleString()} kWh`
                    : moveOutDelta !== null
                      ? `Last recorded: ${moveOutBaseline.toLocaleString()} kWh on ${fmtDate(sourceRoomLatestReading.date)} (${sourceRoomLatestReading.eventType}) — +${moveOutDelta.toLocaleString()} kWh since last reading`
                      : `Last recorded: ${moveOutBaseline.toLocaleString()} kWh on ${fmtDate(sourceRoomLatestReading.date)}`}
                </span>
              ) : (
                <span className="twm-meter-hint">Enter the current kWh reading from the room meter.</span>
              )}
            </label>
            {requiresWater && <label className="tenant-modal-field">
              <span>Final Water Reading (m³)</span>
              <input type="number" min="0" step="0.01" value={waterReading} onChange={e=>setWaterReading(e.target.value)} required />
              <span className="twm-meter-hint">Physical meter observation. Water charges are calculated from the billing cycle.</span>
            </label>}
            <label className="tenant-modal-field">
              <span>Key / Access Card Returned</span>
              <select
                value={keyReturned ? "yes" : "no"}
                onChange={(e) => setKeyReturned(e.target.value === "yes")}
              >
                <option value="yes">Yes — Key Handed Over</option>
                <option value="no">No — ₱500 Replacement Deduction</option>
              </select>
            </label>
          </div>

          <label className="tenant-modal-field">
            <span>Damage / Cleaning Fee Deductions (₱)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={damageDeductions}
              onChange={(e) => setDamageDeductions(e.target.value)}
            />
            <span className="twm-meter-hint">Leave 0 if no damages. This amount will be deducted from the security deposit.</span>
          </label>

          <label className="tenant-modal-field">
            <span>Final Move-Out Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional — include inspection notes, condition remarks, or handover details"
            />
          </label>
        </>
      )}

      {/* ── STEP 3: Review & Deposit Clearance ────────────────────────── */}
      {step === 3 && (
        <>
          <div className="twm-review-summary">
            <div className="twm-review-field">
              <span className="twm-review-field__label">Move-Out Date</span>
              <span className="twm-review-field__value">{fmtDate(moveOutDate)}</span>
            </div>
            <div className="twm-review-field">
              <span className="twm-review-field__label">Move-Out Time</span>
              <span className="twm-review-field__value">{moveOutTime}</span>
            </div>
            <div className="twm-review-field">
              <span className="twm-review-field__label">Final Meter Reading</span>
              <span className="twm-review-field__value">{Number(meterReading).toLocaleString()} kWh</span>
            </div>
            <div className="twm-review-field">
              <span className="twm-review-field__label">Key Returned</span>
              <span className="twm-review-field__value">{keyReturned ? "Yes" : "No — ₱500 deducted"}</span>
            </div>
            {notes && (
              <div className="twm-review-field twm-review-field--wide">
                <span className="twm-review-field__label">Notes</span>
                <span className="twm-review-field__value">{notes}</span>
              </div>
            )}
          </div>

          {isEarlyVacancy && (
            <div className="twm-callout twm-callout--danger">
              ⚠ Early Vacancy — The security deposit will be forfeited per the lease contract.
            </div>
          )}

          <div className="twm-settlement-card">
            <div className="twm-settlement-card__header">
              <p className="twm-settlement-card__title">Deposit Clearance Summary</p>
              <button
                type="button"
                className="twm-settlement-card__download-btn"
                disabled={pdfLoading}
                onClick={handleDownloadMoveOutPDF}
                title="Download printable settlement estimate"
              >
                <Download size={13} />
                <span>{pdfLoading ? "Generating..." : "Download Estimate PDF"}</span>
              </button>
            </div>
            <div className="twm-settlement-card__body">
              <div className="twm-settlement-row">
                <span className="twm-settlement-row__label">Security Deposit Held</span>
                <span className="twm-settlement-row__value">{fmtMoney(securityDeposit)}</span>
              </div>
              {outstandingBal > 0 && (
                <div className="twm-settlement-row twm-settlement-row--danger">
                  <span className="twm-settlement-row__label">Less: Unpaid Balance</span>
                  <span className="twm-settlement-row__value">({fmtMoney(outstandingBal)})</span>
                </div>
              )}
              {keyFee > 0 && (
                <div className="twm-settlement-row twm-settlement-row--danger">
                  <span className="twm-settlement-row__label">Less: Key Replacement Fee</span>
                  <span className="twm-settlement-row__value">({fmtMoney(keyFee)})</span>
                </div>
              )}
              {damageFee > 0 && (
                <div className="twm-settlement-row twm-settlement-row--danger">
                  <span className="twm-settlement-row__label">Less: Damage / Cleaning Fee</span>
                  <span className="twm-settlement-row__value">({fmtMoney(damageFee)})</span>
                </div>
              )}
              {estimatedElectricityCostMoveOut !== null && estimatedElectricityCostMoveOut > 0 && (
                <div className="twm-settlement-row twm-settlement-row--danger">
                  <span className="twm-settlement-row__label">
                    Less: Est. Electricity Charge
                    <span style={{ fontSize: 11, fontWeight: 400, display: "block", color: "var(--text-muted)" }}>
                      {moveOutKwh?.toLocaleString()} kWh × ₱{moveOutRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh
                    </span>
                  </span>
                  <span className="twm-settlement-row__value">({fmtMoney(estimatedElectricityCostMoveOut)})</span>
                </div>
              )}
              {isEarlyVacancy ? (
                <div className="twm-settlement-row twm-settlement-row--total twm-settlement-row--forfeited">
                  <span className="twm-settlement-row__label">Deposit Status</span>
                  <span className="twm-settlement-row__value">Forfeited — Early Vacancy</span>
                </div>
              ) : hasDebt ? (
                <div className="twm-settlement-row twm-settlement-row--total twm-settlement-row--danger">
                  <span className="twm-settlement-row__label">Remaining Balance Due</span>
                  <span className="twm-settlement-row__value">{fmtMoney(remainingDebt)}</span>
                </div>
              ) : (
                <div className="twm-settlement-row twm-settlement-row--total twm-settlement-row--success">
                  <span className="twm-settlement-row__label">Estimated Refundable Deposit</span>
                  <span className="twm-settlement-row__value">{fmtMoney(netSettlement)}</span>
                </div>
              )}
            </div>
            <p className="twm-settlement-card__note">
              {estimatedElectricityCostMoveOut !== null
                ? `Electricity estimate uses rate ₱${moveOutRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh. Final charges confirmed at billing generation.`
                : "Final utility charges are applied separately at billing generation time."}
            </p>
          </div>
        </>
      )}
    </TenantModalShell>
  );
}
