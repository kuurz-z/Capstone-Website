import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Download,
  Eye,
  FileText,
  History,
  ShieldCheck,
} from "lucide-react";
import { showNotification } from "../../../shared/utils/notification";
import { tenantContractApi } from "../api/tenantContractApi";
import {
  getTenantContractError,
  getTenantContractMessage,
} from "../utils/tenantContractUi.mjs";
import ContractsPageSkeleton from "../components/contracts/ContractsPageSkeleton";
import DigitalContractPaper from "../components/contracts/DigitalContractPaper";
import "../styles/tenant-common.css";
import "../styles/contracts.css";

function ContractSummaryBanner({ contract, stayData }) {
  const branchName =
    stayData?.branch ||
    contract?.branch ||
    "Lilycrest Residence";
  const formattedBranch = String(branchName).toLowerCase().includes("guadalupe")
    ? "Lilycrest Guadalupe"
    : String(branchName).toLowerCase().includes("gil")
    ? "Lilycrest Gil Puyat"
    : branchName;

  const roomRaw = String(stayData?.roomNumber || contract?.roomNumber || "").trim();
  const room = roomRaw.startsWith("Room ") ? roomRaw.replace(/^Room\s+/i, "") : roomRaw;
  const bedRaw = stayData?.bedLabel || contract?.bedLabel;
  const isPrivate =
    String(stayData?.roomType || contract?.roomType || "").toLowerCase().includes("private") ||
    roomRaw.toLowerCase().includes("private") ||
    roomRaw.includes("803") ||
    !bedRaw;

  const durationMonths = Number(stayData?.leaseDurationMonths || contract?.leaseDurationMonths || 12);
  const isShortTerm = durationMonths < 6;
  const termLabel = isShortTerm ? "Short Term" : "Long Term";

  const rawMonthlyRate = Number(stayData?.approvedMonthlyRate ?? contract?.approvedMonthlyRate ?? 0);
  const monthlyRate = rawMonthlyRate > 0 ? rawMonthlyRate : (isPrivate ? 13500 : 5400);
  const discountPercent = Number(
    stayData?.discountPercentage ?? contract?.discountPercentage ?? 0
  );

  const rawAdvanceRent = Number(stayData?.advanceRentAmount ?? contract?.advanceRentAmount ?? 0);
  const advanceRent = rawAdvanceRent > 0 ? rawAdvanceRent : monthlyRate;

  const rawSecurityDeposit = Number(stayData?.securityDepositAmount ?? contract?.securityDepositAmount ?? 0);
  const securityDeposit = rawSecurityDeposit > 0 ? rawSecurityDeposit : monthlyRate;

  const startDate = stayData?.leaseStartDate || contract?.leaseStartDate;
  const endDate = stayData?.leaseEndDate || contract?.leaseEndDate;
  const dateRangeStr = startDate && endDate
    ? `${dayjs(startDate).format("MMM D, YYYY")} – ${dayjs(endDate).format("MMM D, YYYY")}`
    : `${durationMonths} Months`;

  return (
    <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1: Branch & Room */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-default">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Accommodation
          </span>
          <Building2 size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" strokeWidth={2} />
        </div>
        <div className="mt-2">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {formattedBranch}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isPrivate
              ? (room && room.toLowerCase().includes("room") ? room : `Room ${room || "GP-803"} • Private Room`)
              : (!room || room === "—"
                  ? "Room Assignment Pending"
                  : (room.toLowerCase().includes("room")
                      ? `${room} • Bed Slot ${bedRaw || "1"}`
                      : `Room ${room} • Bed Slot ${bedRaw || "1"}`))}
          </div>
        </div>
      </div>

      {/* 2: Duration */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-default">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Lease Period
          </span>
          <Calendar size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={2} />
        </div>
        <div className="mt-2">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {durationMonths} Months ({termLabel})
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={dateRangeStr}>
            {dateRangeStr}
          </div>
        </div>
      </div>

      {/* 3: Monthly Rent */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-default">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Monthly Rate
          </span>
          <Coins size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" strokeWidth={2} />
        </div>
        <div className="mt-2">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            ₱{monthlyRate.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {discountPercent > 0 ? `${discountPercent}% promo discount applied` : "Net of electricity consumption"}
          </div>
        </div>
      </div>

      {/* 4: Deposits */}
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-default">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Initial Deposits
          </span>
          <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={2} />
        </div>
        <div className="mt-2">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            ₱{(advanceRent + securityDeposit).toLocaleString("en-PH", { minimumFractionDigits: 2 })} Total
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            1 Mo. Advance + 1 Mo. Security Deposit
          </div>
        </div>
      </div>
    </div>
  );
}

function AcknowledgeConfirmModal({
  open,
  isDraft,
  isAddendum,
  isRenewal,
  busy,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const docName = isAddendum
    ? "Room Transfer Addendum"
    : isRenewal
    ? "Renewal Contract"
    : "Contract";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950/40 flex items-center justify-center text-sky-600 dark:text-sky-400 flex-shrink-0">
            <CheckCircle2 size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 id="ack-modal-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              {isDraft ? `Acknowledge ${docName}` : `Acknowledge Final ${docName}`}
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {isAddendum ? (
                isDraft ? (
                  <>
                    This confirms you have <strong>received and reviewed</strong> the Room Transfer Addendum
                    recording your room change. <strong>Your original lease remains in effect</strong> — this is
                    not a new lease and its start/end dates do not change.
                    <br />
                    <span className="mt-1.5 block">It is <strong>not</strong> a signature.</span>
                  </>
                ) : (
                  <>This confirms you have <strong>received and reviewed</strong> the final Room Transfer Addendum. Your original lease remains in effect.</>
                )
              ) : isRenewal ? (
                <>
                  This confirms you have <strong>received and reviewed</strong> the contract terms for your upcoming stay extension.
                  <br />
                  <span className="mt-1.5 block">
                    It is <strong>not</strong> a signature and does <strong>not</strong> make
                    the lease binding until its scheduled effective date.
                  </span>
                </>
              ) : isDraft ? (
                <>
                  This only confirms that you have <strong>received and reviewed</strong> the
                  generated draft of your lease contract.
                  <br />
                  <span className="mt-1.5 block">
                    It is <strong>not</strong> a signature and does <strong>not</strong> make
                    the lease binding. Physical signing and notarization still happen at move-in.
                  </span>
                </>
              ) : (
                <>This confirms that you have <strong>received and reviewed</strong> your final contract document.</>
              )}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 size={14} strokeWidth={2} />
            <span>{busy ? "Confirming…" : isDraft ? "Yes, I have reviewed the draft" : "Confirm"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Tenant — a compact "Upcoming Room Transfer" panel. The tenant's current
 * room/rent shown elsewhere in the app stay the SOURCE values until the
 * effective date; this only describes what is scheduled.
 */
function UpcomingRoomTransferPanel({ transfer }) {
  if (!transfer) return null;
  const {
    currentRoom, scheduledRoom, effectiveTransferDate, newMonthlyRent,
    status, statusLabel, transferBalance,
  } = transfer;
  const bal = transferBalance || {};
  const hasBalance = bal.hasBill && Number(bal.amountDue) > 0;
  const effLabel = effectiveTransferDate ? dayjs(effectiveTransferDate).format("MMM D, YYYY") : "—";

  return (
    <div className="mb-4 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-4 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
          <ArrowRight size={15} className="text-sky-500" />
          Upcoming Room Transfer
        </h3>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            status === "ready"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : status === "action_required"
              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          {statusLabel || status}
        </span>
      </div>
      <div className="text-xs text-sky-800 dark:text-sky-300 space-y-1">
        <p>
          <span className="font-medium">{currentRoom?.name || "your room"}</span>
          {"  →  "}
          <span className="font-medium">{scheduledRoom?.name || "new room"}</span>
          {"  ·  Effective "}
          {effLabel}
        </p>
        {newMonthlyRent != null ? (
          <p>New monthly rent: <span className="font-medium">{peso(newMonthlyRent)}</span></p>
        ) : null}
        {hasBalance ? (
          <p>
            Transfer balance: <span className="font-medium">{peso(bal.amountDue)}</span>
            {Number(bal.amountPaid) > 0 ? ` · Paid ${peso(bal.amountPaid)} · Remaining ${peso(bal.remaining)}` : ""}
            {"  ·  Due "}{effLabel}
          </p>
        ) : (
          <p>Transfer balance: <span className="font-medium">₱0 — no payment required</span></p>
        )}
        <p className="text-sky-600 dark:text-sky-400">
          Final electricity and water charges follow the normal billing process after the room-transfer cutoff.
        </p>
        {status === "ready" ? (
          <p className="text-emerald-700 dark:text-emerald-400">Ready — scheduled for {effLabel}.</p>
        ) : null}
      </div>
    </div>
  );
}

function UpcomingRenewalContractCard({
  contract,
  onPreview,
  onDownload,
  onAcknowledge,
  actionBusyId,
}) {
  if (!contract) return null;

  const contractId = contract.id || contract._id;
  const isBusy = actionBusyId === contractId;

  const durationMonths = Number(contract.leaseDurationMonths || 12);
  const isShortTerm = contract.isShortTerm !== undefined
    ? contract.isShortTerm
    : durationMonths < 6;
  const termDurationType = isShortTerm ? "Short Term" : "Long Term";
  const title = contract.termLabel || `${durationMonths} Months (${termDurationType}) Extension`;

  const startDate = contract.leaseStartDate ? dayjs(contract.leaseStartDate).format("MMM D, YYYY") : "—";
  const endDate = contract.leaseEndDate ? dayjs(contract.leaseEndDate).format("MMM D, YYYY") : "—";
  const dateRangeStr = `${startDate} – ${endDate}`;

  const rate = contract.approvedMonthlyRate ?? contract.regularMonthlyRate ?? 0;
  const branchName = contract.branch
    ? (String(contract.branch).toLowerCase().includes("gil") ? "Lilycrest Gil Puyat" : "Lilycrest Guadalupe")
    : "Lilycrest Residence";
  const roomRaw = String(contract.roomNumber || "").trim();
  const roomStr = roomRaw ? (roomRaw.toLowerCase().includes("room") ? roomRaw : `Room ${roomRaw}`) : "Room Assignment Confirmed";
  const bedSlot = contract.bedLabel ? ` • Bed Slot ${contract.bedLabel}` : "";

  const ack = contract.acknowledgement;
  const needsAck = Boolean(ack?.required && !ack?.acknowledged);
  const isAcknowledged = Boolean(ack?.acknowledged);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all duration-200">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Upcoming Renewal Contract
            </span>
            <span className="text-slate-300 dark:text-slate-700 font-normal">|</span>
            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
              {contract.contractNumber || `CON-${String(contractId).slice(-6).toUpperCase()}`}
            </span>
            {isAcknowledged ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} strokeWidth={2.5} />
                Acknowledged
              </span>
            ) : null}
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scheduled to take effect on {startDate}. Your current lease remains active until {startDate}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1.5">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Effective Lease Period</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {dateRangeStr} ({durationMonths} Mos)
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Accommodation</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {branchName} · {roomStr}{bedSlot}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Approved Monthly Rent</span>
              <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                ₱{Number(rate).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onPreview(contract)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Eye size={14} strokeWidth={2} />
            <span>{isBusy ? "Loading…" : "View PDF"}</span>
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDownload(contract)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Download size={14} strokeWidth={2} />
            <span>Download</span>
          </button>
          {needsAck ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onAcknowledge(contract)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <CheckCircle2 size={14} strokeWidth={2} />
              <span>Acknowledge Contract</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AcknowledgeContractBanner({ acknowledgement, onAcknowledge, busy, isAddendum = false }) {
  if (!acknowledgement || !acknowledgement.required) return null;

  const isDraft = acknowledgement.documentKind === "draft";
  const docName = isAddendum ? "Room Transfer Addendum" : "contract";
  const subject = isDraft ? `draft ${docName}` : `final ${docName}`;

  if (acknowledgement.acknowledged) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-2.5">
        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={2} />
        <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-medium">
          You acknowledged this {subject}
          {acknowledgement.documentVersion ? ` (v${acknowledgement.documentVersion})` : ""} on{" "}
          {acknowledgement.acknowledgedAt
            ? dayjs(acknowledgement.acknowledgedAt).format("MMM D, YYYY [at] h:mm A")
            : "record"}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-xs sm:text-sm text-sky-800 dark:text-sky-300 font-medium">
        {isAddendum
          ? "Please confirm you have received and reviewed the Room Transfer Addendum recording your room change. Your original lease stays in effect — this is not a new lease and not a signature."
          : isDraft
            ? "Please confirm that you have received and reviewed the generated draft of your contract. This is not a signature."
            : "Please confirm that you have received and reviewed your final contract."}
      </p>
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-2xs flex-shrink-0"
      >
        <CheckCircle2 size={14} strokeWidth={2} />
        <span>{busy ? "Confirming…" : `Acknowledge ${isAddendum ? "Addendum" : isDraft ? "Draft" : "Contract"}`}</span>
      </button>
    </div>
  );
}

function PreviousContractsSection({ history, onPreview, onDownload, actionBusyId }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!history || history.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
            <History size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Previous Agreements &amp; Renewals</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {history.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Access your previous lease agreements, renewal contracts, and room transfer documents.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <span>{isOpen ? "Hide" : "Show"}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 border-t border-slate-200/80 dark:border-slate-800 space-y-3.5 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="grid grid-cols-1 gap-3">
            {history.map((item, idx) => {
              const contractId = item.id || item._id;
              const isBusy = actionBusyId === contractId;
              const startDate = item.leaseStartDate ? dayjs(item.leaseStartDate).format("MMM D, YYYY") : "—";
              const endDate = item.leaseEndDate ? dayjs(item.leaseEndDate).format("MMM D, YYYY") : "—";
              const rate = item.approvedMonthlyRate || item.regularMonthlyRate;
              const durationMonths = Number(item.leaseDurationMonths || 12);
              const isShortTerm = item.isShortTerm !== undefined ? item.isShortTerm : durationMonths < 6;
              const termLabel = item.termLabel || `Term #${idx + 1}`;

              // A Room Transfer Addendum ("amendment") or a legacy transfer
              // "replacement" — both are transfer-side documents, not a
              // separate lease.
              const isTransferDoc = item.contractPurpose === "amendment" || item.contractPurpose === "replacement";
              const isReplacement = isTransferDoc || item.status === "replaced";
              const isExpired = item.status === "expired" || item.status === "completed";
              const isRenewed = item.status === "renewed";
              const isCancelled = item.status === "cancelled" || item.status === "voided";

              const statusBadgeLabel = item.contractPurpose === "amendment"
                ? (item.isCurrent ? "Room Transfer Addendum" : "Superseded Addendum")
                : isReplacement
                ? "Superseded (Transfer)"
                : isRenewed
                ? "Renewed"
                : isExpired
                ? "Term Expired"
                : isCancelled
                ? "Cancelled"
                : item.status?.replace(/_/g, " ") || "Archived";

              const statusDotColor = isReplacement
                ? "bg-amber-500"
                : isRenewed
                ? "bg-blue-500"
                : isCancelled
                ? "bg-rose-500"
                : "bg-slate-400";

              return (
                <div
                  key={contractId}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {termLabel}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700 font-normal">|</span>
                      <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {item.contractNumber || `CON-${String(contractId).slice(-6).toUpperCase()}`}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-transparent text-slate-700 dark:text-slate-300">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                        <span className="capitalize">{statusBadgeLabel}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Accommodation</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.branch ? (String(item.branch).includes("gil") ? "Gil Puyat" : "Guadalupe") : "Lilycrest"} · Room {item.roomNumber || "—"} {item.bedLabel ? `(${item.bedLabel})` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Lease Period</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {startDate} – {endDate}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Duration</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {durationMonths} Mos ({isShortTerm ? "Short Term" : "Long Term"})
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Approved Monthly Rent</span>
                        <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                          {rate ? `₱${Number(rate).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onPreview(item)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      <Eye size={13} strokeWidth={2} />
                      <span>{isBusy ? "Loading…" : "View PDF"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDownload(item)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      <Download size={13} strokeWidth={2} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ContractsPage() {
  const [contract, setContract] = useState(null);
  const [upcomingContract, setUpcomingContract] = useState(null);
  const [stayData, setStayData] = useState(null);
  const [contractHistory, setContractHistory] = useState([]);
  const [scheduledRoomTransfer, setScheduledRoomTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState(null);
  const [acknowledgement, setAcknowledgement] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [targetAckContract, setTargetAckContract] = useState(null);

  // A synthetic (Stay-derived) contract has a human reference string as `id`,
  // not a Mongo ObjectId — the document/acknowledgement endpoints 404 on it.
  const isRealContractId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

  const loadContracts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [contractRes, stayProofRes, historyRes] = await Promise.allSettled([
        tenantContractApi.getMyCurrentContract(),
        tenantContractApi.getMyStayProofData(),
        tenantContractApi.getMyContractHistory(),
      ]);
      let resolvedContract = null;
      let resolvedUpcoming = null;
      if (contractRes.status === "fulfilled") {
        resolvedContract = contractRes.value?.contract || null;
        resolvedUpcoming = contractRes.value?.upcoming || null;
        setContract(resolvedContract);
        setUpcomingContract(resolvedUpcoming);
        setScheduledRoomTransfer(contractRes.value?.scheduledRoomTransfer || null);
      }
      if (stayProofRes.status === "fulfilled") {
        setStayData(stayProofRes.value?.stayProof || null);
      }
      if (historyRes.status === "fulfilled") {
        setContractHistory(historyRes.value?.contracts || []);
      }
      // Prefer the acknowledgement embedded in the current-contract payload
      // (one round-trip, authoritative). Only fall back to the standalone
      // endpoint for a real ObjectId contract that didn't carry it.
      const contractId = resolvedContract?.id || resolvedContract?._id;
      if (resolvedContract?.acknowledgement) {
        setAcknowledgement(resolvedContract.acknowledgement);
      } else if (isRealContractId(contractId)) {
        try {
          const ackRes = await tenantContractApi.getMyContractAcknowledgement(contractId);
          setAcknowledgement(ackRes || null);
        } catch {
          setAcknowledgement(null);
        }
      } else {
        setAcknowledgement(null);
      }
    } catch (requestError) {
      setError(getTenantContractError(requestError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const performAcknowledge = async () => {
    const target = targetAckContract || contract;
    const contractId = target?.id || target?._id;
    if (!isRealContractId(contractId) || acknowledging) return;
    setAcknowledging(true);
    try {
      await tenantContractApi.acknowledgeMyContract(contractId);
      // Re-fetch authoritative state rather than trusting an optimistic
      // local write — guarantees reload-parity and idempotency.
      try {
        const fresh = await tenantContractApi.getMyContractAcknowledgement(contractId);
        if (target?.id === contract?.id || target?._id === contract?._id) {
          setAcknowledgement(fresh || null);
        }
      } catch {
        if (target?.id === contract?.id || target?._id === contract?._id) {
          setAcknowledgement((prev) => ({
            ...(prev || {}),
            required: true,
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
          }));
        }
      }
      await loadContracts({ silent: true });
      setAckModalOpen(false);
      setTargetAckContract(null);
      showNotification(
        (target?.acknowledgement || acknowledgement)?.documentKind === "draft"
          ? "Draft contract acknowledged."
          : "Contract acknowledged.",
        "success",
      );
    } catch (ackErr) {
      showNotification(ackErr?.message || "Failed to acknowledge contract.", "error");
    } finally {
      setAcknowledging(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    const handleUpdate = () => {
      loadContracts({ silent: true });
    };
    window.addEventListener("lilycrest:contract-updated", handleUpdate);
    window.addEventListener("lilycrest:payment-updated", handleUpdate);
    window.addEventListener("lilycrest:reservation-updated", handleUpdate);
    return () => {
      window.removeEventListener("lilycrest:contract-updated", handleUpdate);
      window.removeEventListener("lilycrest:payment-updated", handleUpdate);
      window.removeEventListener("lilycrest:reservation-updated", handleUpdate);
    };
  }, [loadContracts]);

  // Tenant-facing wording never mentions storage internals or asks the
  // tenant to "replace" anything (that's an admin action) — per the file's
  // 410 CONTRACT_ARTIFACT_STORAGE_MISSING case, where DB metadata exists
  // but the physical file does not.
  const friendlyTenantDocumentError = (err, fallback) => (
    err?.response?.status === 410
      ? "This document is temporarily unavailable. Please contact the branch office if this continues."
      : (err?.message || fallback)
  );

  const handleViewSignedCopy = async (version) => {
    if (!contract?.id) return;
    try {
      const blob = await tenantContractApi.getMySignedContractFile(contract.id, version, false);
      const url = URL.createObjectURL(blob);
      const title = `Signed Contract v${version} - ${contract.contractNumber || "Contract"}`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`<!doctype html><html><head><title>${title}</title><style>html,body{margin:0;height:100%;background:#525659;overflow:hidden;}iframe{width:100%;height:100%;border:none;}</style></head><body><iframe src="${url}" title="${title}"></iframe></body></html>`);
        win.document.close();
      } else {
        window.open(url, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      setError(friendlyTenantDocumentError(err, "Failed to preview signed contract copy."));
    }
  };

  const handleDownloadSignedCopy = async (version, fileName) => {
    if (!contract?.id) return;
    try {
      const blob = await tenantContractApi.getMySignedContractFile(contract.id, version, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `Signed-Contract-v${version}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(friendlyTenantDocumentError(err, "Failed to download signed contract copy."));
    }
  };

  const handlePreviewContract = async (targetContract) => {
    const contractId = targetContract?.id || targetContract?._id;
    if (!contractId) return;
    setActionBusyId(contractId);
    try {
      let blob;
      try {
        blob = await tenantContractApi.getMyFinalContractFile(contractId, false);
      } catch {
        try {
          blob = await tenantContractApi.getMySignedContractFile(contractId, undefined, false);
        } catch {
          blob = await tenantContractApi.getMyPreparedContractFile(contractId, false);
        }
      }
      const url = URL.createObjectURL(blob);
      const title = `Contract - ${targetContract.contractNumber || "Contract"}`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`<!doctype html><html><head><title>${title}</title><style>html,body{margin:0;height:100%;background:#525659;overflow:hidden;}iframe{width:100%;height:100%;border:none;}</style></head><body><iframe src="${url}" title="${title}"></iframe></body></html>`);
        win.document.close();
      } else {
        window.open(url, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      showNotification(err?.message || "Failed to preview contract copy.", "error");
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDownloadContract = async (targetContract) => {
    const contractId = targetContract?.id || targetContract?._id;
    if (!contractId) return;
    setActionBusyId(contractId);
    try {
      let blob;
      try {
        blob = await tenantContractApi.getMyFinalContractFile(contractId, true);
      } catch {
        try {
          blob = await tenantContractApi.getMySignedContractFile(contractId, undefined, true);
        } catch {
          blob = await tenantContractApi.getMyPreparedContractFile(contractId, true);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Lilycrest-Lease-Contract-${targetContract.contractNumber || contractId}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotification("Contract PDF download started.", "success");
    } catch (err) {
      showNotification(err?.message || "Failed to download contract copy.", "error");
    } finally {
      setActionBusyId(null);
    }
  };

  if (loading) return <ContractsPageSkeleton />;

  const isNotarized = Boolean(
    contract?.tenantDocument?.type === "final_notarized" &&
    (contract?.finalDocument?.available || contract?.tenantDocument?.isFinal)
  );

  const notice = getTenantContractMessage(
    contract || (stayData ? { status: isNotarized ? "active" : "generated", stayProofAvailable: true } : null),
  );

  const activeAckDoc = targetAckContract?.acknowledgement || acknowledgement;
  const isTargetAddendum = (targetAckContract || contract)?.contractPurpose === "amendment";
  const isTargetRenewal =
    (targetAckContract || contract)?.contractPurpose === "renewal" ||
    (upcomingContract && (
      (targetAckContract?.id && targetAckContract.id === upcomingContract.id) ||
      (targetAckContract?._id && targetAckContract._id === upcomingContract._id)
    ));

  return (
    <main className="contracts-page tenant-contract-page">
      {/* Header */}
      <header className="contracts-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Official Lease Contract</h1>
            {isNotarized ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-transparent text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Notarized Lease Contract
              </span>
            ) : contract ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-transparent text-sky-700 dark:text-sky-300">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                Lease Draft — Review Copy
              </span>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isNotarized
              ? "Your official notarized lease agreement and tenancy terms with First JRAC Partnership Co."
              : contract
              ? "Review your lease agreement terms, house rules, and accommodation details. Physical signing and notarization will occur upon move-in."
              : "View and manage your official lease agreement once generated."}
          </p>
        </div>
      </header>

      {error && (
        <div className="contracts-error mb-4" role="alert">
          {error}
        </div>
      )}

      {scheduledRoomTransfer ? (
        <UpcomingRoomTransferPanel transfer={scheduledRoomTransfer} />
      ) : null}

      {/* Upcoming Renewal Spotlight Card */}
      {upcomingContract ? (
        <UpcomingRenewalContractCard
          contract={upcomingContract}
          onPreview={handlePreviewContract}
          onDownload={handleDownloadContract}
          onAcknowledge={(c) => {
            setTargetAckContract(c || upcomingContract);
            setAckModalOpen(true);
          }}
          actionBusyId={actionBusyId}
        />
      ) : null}

      <AcknowledgeContractBanner
        acknowledgement={acknowledgement}
        onAcknowledge={() => {
          setTargetAckContract(contract);
          setAckModalOpen(true);
        }}
        busy={acknowledging}
        isAddendum={contract?.contractPurpose === "amendment"}
      />

      <AcknowledgeConfirmModal
        open={ackModalOpen}
        isDraft={activeAckDoc?.documentKind === "draft"}
        isAddendum={isTargetAddendum}
        isRenewal={isTargetRenewal}
        busy={acknowledging}
        onConfirm={performAcknowledge}
        onCancel={() => {
          setAckModalOpen(false);
          setTargetAckContract(null);
        }}
      />

      {!contract && !stayData ? (
        <div className="contracts-empty rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-4">
            <FileText size={28} strokeWidth={2} />
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 mb-2">
            {notice.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6 max-w-md">
            {notice.message}
          </p>
          <Link
            to="/applicant/reservation"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs"
          >
            <span>View My Reservation</span>
            <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </div>
      ) : (
        <>
          {/* Key Information Banner */}
          <ContractSummaryBanner contract={contract} stayData={stayData} />

          {/* Digital Contract Paper View */}
          <DigitalContractPaper
            stayData={stayData}
            contract={contract}
            onViewSigned={handleViewSignedCopy}
            onDownloadSigned={handleDownloadSignedCopy}
            fetchDocumentPdf={(c) => (c?.tenantDocument?.isFinal
              ? tenantContractApi.getMyFinalContractFile(c.id || c._id, false)
              : tenantContractApi.getMyPreparedContractFile(c.id || c._id, false))}
            // Signed scan resolves from the CANONICAL identity the backend
            // returned (signedScan.contractId — may be the ORIGINAL lease when
            // the current contract is a Room Transfer Addendum), via the
            // TENANT signed-file route.
            fetchSignedDoc={({ contractId, version, download }) =>
              tenantContractApi.getMySignedContractFile(contractId, version, Boolean(download))}
          />
        </>
      )}

      {/* Previous Agreements & Renewals Section */}
      <PreviousContractsSection
        history={contractHistory}
        onPreview={handlePreviewContract}
        onDownload={handleDownloadContract}
        actionBusyId={actionBusyId}
      />
    </main>
  );
}
