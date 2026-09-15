import { useState } from "react";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";

const formatDate = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No preferred date";

const safeText = (value, fallback = "") => typeof value === "string" && !/^[a-f0-9]{24}$/i.test(value) ? value : fallback;

const labelRoomType = (value) =>
  String(value || "Not specified")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function TenantTransferRequestCard({ request, onProceed, onDecline, loading = false }) {
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  if (!request || request.status !== "pending" || request.canReview === false) return null;

  const currentRoom = request.currentRoom || {};
  const currentBed = request.currentBed || {};

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/70 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            Room Transfer Request
          </div>
          <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">Pending Admin Review</p>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Submitted {formatDate(request.submittedAt)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-slate-500">Tenant</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{safeText(request.tenant?.name, "Tenant")}</dd></div>
        <div><dt className="text-slate-500">Current room / bed</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{safeText(currentRoom.name, safeText(currentRoom.roomNumber, "Room"))}{currentBed.bedId ? ` · ${safeText(currentBed.code, safeText(currentBed.position, "Assigned bed"))}` : ""}</dd></div>
        <div><dt className="text-slate-500">Preferred room type</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{labelRoomType(request.preferredRoomType)}</dd></div>
        <div><dt className="text-slate-500">Preferred room</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{safeText(request.preferredRoom?.name, "No individual room requested")}</dd></div>
        <div><dt className="text-slate-500">Preferred date</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(request.preferredTransferDate)}</dd></div>
        <div><dt className="text-slate-500">Reason</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{safeText(request.reason)}</dd></div>
        {request.note ? <div className="sm:col-span-2"><dt className="text-slate-500">Note</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{safeText(request.note)}</dd></div> : null}
      </dl>

      {declining ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="transfer-decline-reason">Decline reason *</label>
          <textarea
            id="transfer-decline-reason"
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value.slice(0, 1000))}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700" onClick={() => setDeclining(false)} disabled={loading}>Back</button>
            <button type="button" className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => onDecline?.(declineReason.trim())} disabled={loading || !declineReason.trim()}>Confirm decline</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300" onClick={() => setDeclining(true)} disabled={loading}>
            <XCircle className="h-4 w-4" /> Decline
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => onProceed?.(request)} disabled={loading}>
            Proceed to Schedule <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
