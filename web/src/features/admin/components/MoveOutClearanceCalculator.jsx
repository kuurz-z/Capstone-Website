import React, { useState, useMemo } from "react";
import dayjs from "dayjs";
import {
  KeyRound,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  CreditCard,
  Banknote,
} from "lucide-react";
import { moveOutApi } from "../../../shared/api/moveOutApi.js";
import BaseModal from "../../../shared/components/BaseModal.jsx";
import { fmtCurrency, fmtDate } from "../../../shared/utils/formatDate.js";

/**
 * MoveOutClearanceCalculator - Admin Move-Out Clearance & Final Settlement Modal (P6-01).
 *
 * Implements:
 * 1. Itemized Final Bill to Collect: Unpaid Rent, Pro-Rata Electricity, Water Share, Room Damage, RFID Keycard Fee.
 * 2. Security Deposit Return (Isolated): Full deposit held returned independently via Cash/Check or Bank Transfer.
 * 3. Payment Verification Gate: Requires confirming final payment received or Admin Override with justification.
 * 4. Strictly solid HSL tokens, 1px neutral borders, no gradients, transparent badges with colored status dots.
 */
export default function MoveOutClearanceCalculator({
  isOpen,
  onClose,
  reservation,
  onClearanceCompleted,
}) {
  // ── Tenancy context ────────────────────────────────────────────────────────
  const rawLeaseEnd = reservation?.leaseEndDate || reservation?.endDate;
  const leaseEnd = useMemo(() => (rawLeaseEnd ? dayjs(rawLeaseEnd) : null), [rawLeaseEnd]);
  const isEarlyPreTermination = useMemo(
    () => (leaseEnd ? dayjs().startOf("day").isBefore(leaseEnd.startOf("day")) : false),
    [leaseEnd]
  );

  // ── Deposit & Forfeiture State ─────────────────────────────────────────────
  const initialDepositHeld = Number(
    reservation?.securityDepositHeld ?? reservation?.securityDeposit ?? 5000
  );
  const [initialDeposit, setInitialDeposit] = useState(initialDepositHeld);
  const [waiveEarlyForfeiture, setWaiveEarlyForfeiture] = useState(false);
  const [depositPayoutMethod, setDepositPayoutMethod] = useState("cash_check"); // "cash_check" | "bank_transfer"
  const [depositPayoutReference, setDepositPayoutReference] = useState("");

  // ── Itemized Final Bill State (To Collect) ──────────────────────────────────
  const initialRentOwed = Number(
    reservation?.outstandingBalance ?? reservation?.currentBalance ?? 0
  );
  const [unpaidRent, setUnpaidRent] = useState(initialRentOwed);
  const [electricityKwh, setElectricityKwh] = useState(0);
  const [electricityRate, setElectricityRate] = useState(
    Number(reservation?.electricityRatePerUnit ?? reservation?.electricityRate ?? 14)
  );
  const [customElectricityAmount, setCustomElectricityAmount] = useState("");
  const [waterAmount, setWaterAmount] = useState(0);
  const [damageAmount, setDamageAmount] = useState(0);
  const [rfidReturned, setRfidReturned] = useState(true);

  // ── Sign-off, Notes & Verification Gate ────────────────────────────────────
  const [adminRemarks, setAdminRemarks] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Derived Financial Computations ─────────────────────────────────────────
  const effectiveEarlyTermination = isEarlyPreTermination && !waiveEarlyForfeiture;
  const rfidFee = rfidReturned ? 0 : 300;

  const calculatedElectricityCharge = useMemo(() => {
    if (customElectricityAmount !== "") {
      return Math.max(0, Number(customElectricityAmount) || 0);
    }
    return Math.max(0, Number(electricityKwh || 0) * Number(electricityRate || 0));
  }, [customElectricityAmount, electricityKwh, electricityRate]);

  const totalFinalBill = useMemo(() => {
    return (
      Math.max(0, Number(unpaidRent) || 0) +
      calculatedElectricityCharge +
      Math.max(0, Number(waterAmount) || 0) +
      Math.max(0, Number(damageAmount) || 0) +
      rfidFee
    );
  }, [unpaidRent, calculatedElectricityCharge, waterAmount, damageAmount, rfidFee]);

  const netDepositRefund = useMemo(() => {
    if (effectiveEarlyTermination) return 0;
    return Math.max(0, Number(initialDeposit) || 0);
  }, [effectiveEarlyTermination, initialDeposit]);

  const isBillCleared = totalFinalBill <= 0;

  // Verification Gate: Can submit if bill is 0, OR payment is confirmed, OR admin override with reason
  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (isBillCleared) return true;
    if (paymentConfirmed) return true;
    if (adminOverride && overrideReason.trim().length > 0) return true;
    return false;
  }, [loading, isBillCleared, paymentConfirmed, adminOverride, overrideReason]);

  // ── Form Submission ────────────────────────────────────────────────────────
  const handleSubmitSignOff = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);
      setError(null);

      const reservationId = reservation?._id || reservation?.id;
      if (!reservationId) {
        throw new Error("Missing reservation identifier.");
      }

      const formattedRemarks = [
        effectiveEarlyTermination
          ? "[Early Pre-Termination - Deposit Forfeited]"
          : waiveEarlyForfeiture && isEarlyPreTermination
          ? "[Early Move-Out - Deposit Forfeiture Waived by Admin]"
          : "",
        adminOverride
          ? `[Admin Override Allowed Move-Out with Balance ₱${totalFinalBill.toLocaleString()} - Reason: ${overrideReason.trim()}]`
          : paymentConfirmed
          ? `[Final Payment Verified Received: ₱${totalFinalBill.toLocaleString()}]`
          : "",
        depositPayoutMethod === "cash_check"
          ? "[Security Deposit Payout: Handed over via Cash/Check on spot]"
          : `[Security Deposit Payout: Bank Transfer Ref: ${depositPayoutReference.trim() || "N/A"}]`,
        adminRemarks.trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      await moveOutApi.submitClearanceSignOff(reservationId, {
        initialDeposit: Number(initialDeposit),
        depositRefundAmount: netDepositRefund,
        depositPayoutMethod,
        depositPayoutReference: depositPayoutReference.trim(),
        itemizedBill: {
          unpaidRent: Number(unpaidRent) || 0,
          electricityKwh: Number(electricityKwh) || 0,
          electricityRate: Number(electricityRate) || 0,
          electricityAmount: calculatedElectricityCharge,
          waterAmount: Number(waterAmount) || 0,
          damageAmount: Number(damageAmount) || 0,
          rfidFee,
          totalBillAmount: totalFinalBill,
        },
        rentDeduction: Number(unpaidRent) || 0,
        utilityDeduction: calculatedElectricityCharge + (Number(waterAmount) || 0),
        damageDeduction: Number(damageAmount) || 0,
        rfidReturned,
        finalBillPaid: paymentConfirmed || isBillCleared,
        adminOverride,
        overrideReason: adminOverride ? overrideReason.trim() : "",
        adminRemarks: formattedRemarks,
        netRefundAmount: netDepositRefund,
        isEarlyPreTermination: effectiveEarlyTermination,
      });

      if (onClearanceCompleted) onClearanceCompleted();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to finalize move-out clearance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Move-Out Clearance & Final Settlement — ${reservation?.tenantName || "Tenant"}`}
      subtitle="Review itemized final charges to collect, verify independent security deposit return, and sign off clearance."
      size="lg"
      showCloseButton={!loading}
    >
      <form onSubmit={handleSubmitSignOff} className="space-y-5">
        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-card border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tenancy Context Card */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground">Tenant:</span>
              <span className="font-semibold text-foreground">{reservation?.tenantName || "Tenant"}</span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground">Room & Bed:</span>
              <span className="font-semibold text-foreground">
                Room {reservation?.roomId || "Unassigned"} • Bed {reservation?.bedId || "N/A"}
              </span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground">Move-In Date:</span>
              <span className="font-medium text-foreground">{fmtDate(reservation?.startDate)}</span>
            </div>
            {leaseEnd && (
              <div className="flex justify-between sm:justify-start sm:gap-2">
                <span className="text-muted-foreground">Contract End Date:</span>
                <span className="font-medium text-foreground">{leaseEnd.format("MMM DD, YYYY")}</span>
              </div>
            )}
          </div>

          {/* Early Pre-Termination Notice & Waiver */}
          {isEarlyPreTermination && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-semibold text-foreground">Early Move-Out Detected</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={waiveEarlyForfeiture}
                    onChange={(e) => setWaiveEarlyForfeiture(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-[11px] font-medium text-foreground">Waive Deposit Forfeiture (Admin Mutual Agreement)</span>
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {waiveEarlyForfeiture
                  ? "Deposit forfeiture has been waived by administrator. The full security deposit will be refunded directly to the tenant."
                  : "Departing before the scheduled contract end date forfeits 100% of the security deposit as an early termination penalty (₱0.00 refund)."}
              </p>
            </div>
          )}
        </div>

        {/* ── SECTION 1: Itemized Final Bill Breakdown (To Collect) ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                1. Itemized Final Bill (To Collect from Tenant)
              </h4>
            </div>
            <span className="text-[11px] text-muted-foreground">Collected independently from deposit</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Unpaid Rent */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                Remaining Unpaid Rent (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unpaidRent}
                onChange={(e) => setUnpaidRent(e.target.value)}
                placeholder="0.00"
                className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground font-medium focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* Final Water Share */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                Final Water Share (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={waterAmount}
                onChange={(e) => setWaterAmount(e.target.value)}
                placeholder="0.00"
                className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground font-medium focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* Pro-Rata Electricity Calculation Box */}
          <div className="p-3 bg-card border border-slate-200 dark:border-slate-700 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Final Pro-Rata Electricity Usage</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Subtotal: {fmtCurrency(calculatedElectricityCharge)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Usage (kWh)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={electricityKwh}
                  onChange={(e) => {
                    setElectricityKwh(e.target.value);
                    setCustomElectricityAmount("");
                  }}
                  placeholder="0.0"
                  className="w-full p-1.5 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground text-xs focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Rate (₱ / kWh)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={electricityRate}
                  onChange={(e) => {
                    setElectricityRate(e.target.value);
                    setCustomElectricityAmount("");
                  }}
                  placeholder="14.00"
                  className="w-full p-1.5 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground text-xs focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Charge Override (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customElectricityAmount !== "" ? customElectricityAmount : (electricityKwh * electricityRate || "")}
                  onChange={(e) => setCustomElectricityAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-1.5 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground text-xs focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Room Damage Deductions */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                Room Damage / Repairs (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={damageAmount}
                onChange={(e) => setDamageAmount(e.target.value)}
                placeholder="0.00"
                className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground font-medium focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* RFID Keycard Return Toggle */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                RFID Keycard Handover
              </label>
              <div className="flex items-center justify-between p-2 bg-background border border-slate-200 dark:border-slate-700 rounded">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  {rfidReturned ? "Card Returned" : "Card Missing (+₱300)"}
                </span>
                <button
                  type="button"
                  onClick={() => setRfidReturned(!rfidReturned)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 transition-colors ${
                    rfidReturned
                      ? "text-emerald-600 dark:text-emerald-400 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                      : "text-rose-600 dark:text-rose-400 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {rfidReturned ? "Returned (₱0)" : "Missing (+₱300)"}
                </button>
              </div>
            </div>
          </div>

          {/* Total Final Bill Highlight */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-foreground">Total Final Bill Amount to Collect:</span>
              <p className="text-[11px] text-muted-foreground">
                Rent ({fmtCurrency(unpaidRent)}) + Electricity ({fmtCurrency(calculatedElectricityCharge)}) + Water ({fmtCurrency(waterAmount)}) + Damage ({fmtCurrency(damageAmount)}) + Key ({fmtCurrency(rfidFee)})
              </p>
            </div>
            <div className="text-right font-mono text-base font-bold text-foreground shrink-0">
              {fmtCurrency(totalFinalBill)}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Security Deposit to Return (Isolated Handover) ── */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                2. Security Deposit Return (Isolated Handover)
              </h4>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  effectiveEarlyTermination ? "bg-rose-500" : "bg-emerald-500"
                }`}
              />
              <span className="font-medium text-foreground">
                {effectiveEarlyTermination ? "Forfeited" : "Full Refund"}
              </span>
            </div>
          </div>

          {/* Informational Isolated Deposit Note */}
          <div className="p-3 bg-card border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-1">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-muted-foreground leading-relaxed">
                The Security Deposit is held isolated and is <strong className="text-foreground">NOT deducted against the final bill</strong>. The full security deposit must be returned directly to the tenant upon move-out clearance.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Security Deposit Held */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                Security Deposit Held (₱)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={initialDeposit}
                onChange={(e) => setInitialDeposit(e.target.value)}
                className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground font-semibold focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* Net Deposit Refund Display */}
            <div>
              <label className="block font-medium text-foreground mb-1">
                Deposit Refund Amount to Hand Over
              </label>
              <div className="p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded font-mono font-bold text-sm text-foreground flex items-center justify-between">
                <span>{fmtCurrency(netDepositRefund)}</span>
                {effectiveEarlyTermination && (
                  <span className="text-[11px] font-sans font-medium text-rose-600 dark:text-rose-400">
                    Forfeited
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Deposit Payout Method */}
          {!effectiveEarlyTermination && (
            <div className="p-3 bg-card border border-slate-200 dark:border-slate-700 rounded-lg space-y-2 text-xs">
              <label className="block font-semibold text-foreground">Deposit Payout Method</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    depositPayoutMethod === "cash_check"
                      ? "border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/40"
                      : "border-slate-200 dark:border-slate-700 bg-background hover:bg-slate-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payoutMethod"
                    value="cash_check"
                    checked={depositPayoutMethod === "cash_check"}
                    onChange={(e) => setDepositPayoutMethod(e.target.value)}
                    className="text-emerald-600 focus:ring-0"
                  />
                  <Banknote className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">Handed over via Cash / Check</span>
                </label>

                <label
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    depositPayoutMethod === "bank_transfer"
                      ? "border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/40"
                      : "border-slate-200 dark:border-slate-700 bg-background hover:bg-slate-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payoutMethod"
                    value="bank_transfer"
                    checked={depositPayoutMethod === "bank_transfer"}
                    onChange={(e) => setDepositPayoutMethod(e.target.value)}
                    className="text-emerald-600 focus:ring-0"
                  />
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">Recorded as Bank Transfer</span>
                </label>
              </div>

              {depositPayoutMethod === "bank_transfer" && (
                <div className="pt-2">
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    Bank Reference / Transaction ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={depositPayoutReference}
                    onChange={(e) => setDepositPayoutReference(e.target.value)}
                    placeholder="e.g. BDO Ref #987654321 or Check #1042"
                    className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground text-xs focus:outline-none focus:border-slate-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 3: Inspection Remarks & Sign-off Notes ── */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <label className="block font-bold uppercase tracking-wider text-foreground">
            3. Inspection Remarks & Sign-Off Notes
          </label>
          <textarea
            rows={2}
            value={adminRemarks}
            onChange={(e) => setAdminRemarks(e.target.value)}
            placeholder="Record room condition, wall paint condition, key return notes, or final meter handover details..."
            className="w-full p-2.5 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-slate-400"
          />
        </div>

        {/* ── SECTION 4: Move-Out Confirmation & Payment Verification Gate ── */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <h4 className="font-bold uppercase tracking-wider text-foreground">
              4. Move-Out Confirmation & Payment Verification Gate
            </h4>
          </div>

          {isBillCleared ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Final bill is cleared (₱0.00). Tenant has zero outstanding balance due.</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                The tenant has an itemized final bill balance of <strong className="text-foreground">{fmtCurrency(totalFinalBill)}</strong>. Choose one of the verification options below to enable clearance sign-off:
              </p>

              {/* Option A: Confirm Payment Received */}
              <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-background hover:bg-slate-50/50">
                <input
                  type="checkbox"
                  checked={paymentConfirmed}
                  onChange={(e) => {
                    setPaymentConfirmed(e.target.checked);
                    if (e.target.checked) setAdminOverride(false);
                  }}
                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-0 mt-0.5"
                />
                <div>
                  <span className="font-semibold text-foreground block">
                    Confirm Final Payment Received ({fmtCurrency(totalFinalBill)})
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    I verify that the tenant has paid the total final bill amount in full (via cash, card, or e-wallet).
                  </span>
                </div>
              </label>

              {/* Option B: Admin Override */}
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-background hover:bg-slate-50/50">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => {
                      setAdminOverride(e.target.checked);
                      if (e.target.checked) setPaymentConfirmed(false);
                    }}
                    className="rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-0 mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-foreground block">
                      Admin Override (Allow Move-Out with Balance Due)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Allow the tenant to complete move-out clearance with an outstanding balance owed. Requires an explicit justification note.
                    </span>
                  </div>
                </label>

                {adminOverride && (
                  <div className="pl-6 space-y-1">
                    <label className="block text-[11px] font-semibold text-foreground">
                      Override Reason & Payment Agreement Details <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Specify reason (e.g. promissory note signed, post-dated check provided, or corporate invoice agreement)..."
                      className="w-full p-2 bg-background border border-slate-200 dark:border-slate-700 rounded text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:border-slate-400"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-muted-foreground">
            {!canSubmit && !isBillCleared && (
              <span className="text-amber-600 dark:text-amber-400">
                Please confirm payment receipt or provide an override reason to sign off.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-foreground bg-background border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? "Finalizing Clearance..." : "Complete Move-Out & Sign Off"}
            </button>
          </div>
        </div>
      </form>
    </BaseModal>
  );
}

