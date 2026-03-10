import { useState } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../styles/reservation-details-modal.css";

/* ─── constants ─────────────────────────────────── */
const STATUS_MAP = {
  pending: {
    label: "Pending Review",
    color: "#b45309",
    bg: "#fffbeb",
    dot: "#f59e0b",
  },
  confirmed: {
    label: "Confirmed",
    color: "#047857",
    bg: "#ecfdf5",
    dot: "#10b981",
  },
  "checked-in": {
    label: "Checked In",
    color: "#1d4ed8",
    bg: "#eff6ff",
    dot: "#3b82f6",
  },
  "checked-out": {
    label: "Checked Out",
    color: "#64748b",
    bg: "#f8fafc",
    dot: "#94a3b8",
  },
  cancelled: {
    label: "Cancelled",
    color: "#dc2626",
    bg: "#fef2f2",
    dot: "#ef4444",
  },
};

const ACTION_MSGS = {
  confirm: {
    title: "Confirm Reservation",
    message:
      "Confirm the payment and reserve the bed? Branch will be assigned automatically.",
    confirmText: "Yes, Confirm",
    variant: "info",
  },
  checkin: {
    title: "Check In Tenant",
    message:
      "Mark this tenant as moved in? They'll be promoted to Tenant role with full system access.",
    confirmText: "Yes, Check In",
    variant: "info",
  },
  cancel: {
    title: "Cancel Reservation",
    message:
      "The ₱2,000 reservation fee is non-refundable. The bed will be freed and user reset to applicant.",
    confirmText: "Yes, Cancel It",
    variant: "danger",
  },
};

/* ─── helpers ───────────────────────────────────── */
const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const fmtCurrency = (v) =>
  !v && v !== 0 ? "—" : `₱${Number(v).toLocaleString()}`;
const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

const openImage = (url, title) => {
  if (!url) return showNotification("No file available", "error");
  const w = window.open("", "_blank");
  w.document.write(
    `<html><head><title>${title}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#111;"><img src="${url}" style="max-width:100%;max-height:100vh;object-fit:contain;" alt="${title}"/></body></html>`,
  );
};

const buildDocs = (r) => [
  { label: "Selfie Photo", url: r.selfiePhotoUrl },
  {
    label: `Valid ID Front${r.validIDType ? ` (${r.validIDType})` : ""}`,
    url: r.validIDFrontUrl,
  },
  { label: "Valid ID Back", url: r.validIDBackUrl },
  { label: "NBI Clearance", url: r.nbiClearanceUrl, reason: r.nbiReason },
  {
    label: "Company/School ID",
    url: r.companyIDUrl,
    reason: r.companyIDReason,
  },
];

const PERSONAL_FIELDS = (r) => [
  ["First Name", fmt(r.firstName)],
  ["Last Name", fmt(r.lastName)],
  ["Middle Name", fmt(r.middleName)],
  ["Nickname", fmt(r.nickname)],
  ["Birthday", fmtDate(r.birthday)],
  ["Marital Status", fmt(r.maritalStatus)],
  ["Nationality", fmt(r.nationality)],
  ["Education", fmt(r.educationLevel)],
];

/* ─── component ─────────────────────────────────── */
export default function ReservationDetailsModal({
  reservation,
  onClose,
  onUpdate,
}) {
  const [adminNotes, setAdminNotes] = useState(reservation?.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [extendDays, setExtendDays] = useState(3);
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });

  if (!reservation) return null;

  const status = (reservation.status || "").toLowerCase();
  const sc = STATUS_MAP[status] || STATUS_MAP.pending;
  const moveIn = reservation.moveInDate ?? reservation.checkInDate ?? null;
  const isOverdue =
    status === "confirmed" && moveIn && new Date(moveIn) < new Date();
  const daysOverdue = isOverdue
    ? Math.floor((new Date() - new Date(moveIn)) / 86400000)
    : 0;
  const docs = buildDocs(reservation);

  const doAction = (key, apiCall, successMsg) => {
    const m =
      key === "extend"
        ? {
            title: `Extend Move-in by ${extendDays} Day${extendDays > 1 ? "s" : ""}`,
            message: `Push the move-in date forward by ${extendDays} day${extendDays > 1 ? "s" : ""}. Reservation stays confirmed.`,
            confirmText: "Extend",
            variant: "info",
          }
        : ACTION_MSGS[key];
    setConfirmModal({
      open: true,
      ...m,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        setIsSubmitting(true);
        try {
          await apiCall();
          showNotification(successMsg, "success");
          onUpdate?.();
          onClose();
        } catch (err) {
          console.error(err);
          showNotification(`Failed: ${err.message || key}`, "error");
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const saveNotes = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await reservationApi.update(reservation.id, { notes: adminNotes });
      showNotification("Notes saved", "success");
      onUpdate?.();
    } catch {
      showNotification("Failed to save notes", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="rdm-overlay" onClick={onClose}>
        <div className="rdm" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="rdm-header">
            <div>
              <h2 className="rdm-title">{reservation.customer ?? "Unknown"}</h2>
              <div className="rdm-header-meta">
                <span className="rdm-code">
                  {reservation.reservationCode || "—"}
                </span>
                <span className="rdm-header-sep">·</span>
                <span className="rdm-header-detail">
                  {reservation.email ?? "—"}
                </span>
              </div>
            </div>
            <button className="rdm-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="rdm-body">
            {/* Status */}
            <div className="rdm-status-row">
              <div
                className="rdm-status-chip"
                style={{ background: sc.bg, color: sc.color }}
              >
                <span
                  className="rdm-status-dot"
                  style={{ background: sc.dot }}
                />
                {sc.label}
              </div>
              {isOverdue && (
                <div className="rdm-overdue-chip">
                  {daysOverdue} day{daysOverdue > 1 ? "s" : ""} overdue
                </div>
              )}
            </div>

            {/* Quick Info */}
            <div className="rdm-info-grid">
              {[
                ["Room", reservation.room ?? "—"],
                ["Type", reservation.roomType ?? "—"],
                ["Branch", reservation.branch ?? "—"],
              ].map(([l, v]) => (
                <div className="rdm-info-item" key={l}>
                  <span className="rdm-info-label">{l}</span>
                  <span className="rdm-info-value">{v}</span>
                </div>
              ))}
              <div className="rdm-info-item">
                <span className="rdm-info-label">Move-in Date</span>
                <span
                  className={`rdm-info-value ${isOverdue ? "rdm-danger" : ""}`}
                >
                  {fmtDate(moveIn)}
                </span>
              </div>
              <div className="rdm-info-item">
                <span className="rdm-info-label">Phone</span>
                <span className="rdm-info-value">
                  {reservation.phone ?? reservation.mobileNumber ?? "—"}
                </span>
              </div>
              {reservation.leaseDuration && (
                <div className="rdm-info-item">
                  <span className="rdm-info-label">Lease</span>
                  <span className="rdm-info-value">
                    {reservation.leaseDuration} months
                  </span>
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="rdm-payment-bar">
              <div className="rdm-payment-amount">
                <span className="rdm-info-label">Fee</span>
                <span className="rdm-payment-price">
                  {fmtCurrency(reservation.totalPrice ?? null)}
                </span>
              </div>
              <div className="rdm-payment-status-wrap">
                <span
                  className={`rdm-chip rdm-chip-${(reservation.paymentStatus ?? "—").toLowerCase()}`}
                >
                  {reservation.paymentStatus ?? "—"}
                </span>
              </div>
              <div className="rdm-payment-method">
                <span className="rdm-info-label">Method</span>
                <span className="rdm-info-value">
                  {fmt(reservation.paymentMethod)}
                </span>
              </div>
              {reservation.proofOfPaymentUrl && (
                <button
                  type="button"
                  className="rdm-proof-btn"
                  onClick={() =>
                    openImage(reservation.proofOfPaymentUrl, "Proof of Payment")
                  }
                >
                  View Receipt
                </button>
              )}
            </div>

            {/* Actions */}
            {status !== "cancelled" && status !== "checked-out" && (
              <div className="rdm-actions-card">
                {status === "pending" && (
                  <button
                    className="rdm-action rdm-action-primary"
                    onClick={() =>
                      doAction(
                        "confirm",
                        () =>
                          reservationApi.update(reservation.id, {
                            status: "confirmed",
                          }),
                        "Reservation confirmed",
                      )
                    }
                    disabled={isSubmitting}
                  >
                    Confirm Payment & Reserve Bed
                  </button>
                )}
                {status === "confirmed" && (
                  <>
                    <button
                      className="rdm-action rdm-action-primary"
                      onClick={() =>
                        doAction(
                          "checkin",
                          () =>
                            reservationApi.update(reservation.id, {
                              status: "checked-in",
                            }),
                          "Tenant checked in successfully",
                        )
                      }
                      disabled={isSubmitting}
                    >
                      Check In — Tenant Has Moved In
                    </button>
                    <button
                      className="rdm-action rdm-action-extend"
                      onClick={() => setShowExtendPrompt(true)}
                      disabled={isSubmitting}
                    >
                      Extend Move-in
                    </button>
                  </>
                )}
                <div className="rdm-action-divider" />
                {status !== "checked-in" && (
                  <button
                    className="rdm-action rdm-action-cancel"
                    onClick={() =>
                      doAction(
                        "cancel",
                        () =>
                          reservationApi.update(reservation.id, {
                            status: "cancelled",
                          }),
                        "Reservation cancelled",
                      )
                    }
                    disabled={isSubmitting}
                  >
                    Cancel Reservation
                  </button>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="rdm-section">
              <h4 className="rdm-section-title">Admin Notes</h4>
              <form onSubmit={saveNotes} className="rdm-notes-form">
                <textarea
                  className="rdm-notes-input"
                  placeholder="Add internal notes..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows="2"
                />
                {adminNotes !== (reservation?.notes || "") && (
                  <button
                    type="submit"
                    className="rdm-action rdm-action-outline"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : "Save Notes"}
                  </button>
                )}
              </form>
            </div>

            {/* Personal Details (expandable) */}
            <button
              type="button"
              className="rdm-expand-btn"
              onClick={() => setShowPersonal(!showPersonal)}
            >
              Personal Details
              <svg
                className={`rdm-chevron ${showPersonal ? "open" : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {showPersonal && (
              <div className="rdm-expand-content">
                <div className="rdm-info-grid">
                  {PERSONAL_FIELDS(reservation).map(([l, v]) => (
                    <div className="rdm-info-item" key={l}>
                      <span className="rdm-info-label">{l}</span>
                      <span className="rdm-info-value">{v}</span>
                    </div>
                  ))}
                </div>
                {reservation.emergencyContact && (
                  <div className="rdm-info-grid" style={{ marginTop: 10 }}>
                    {[
                      [
                        "Emergency Contact",
                        fmt(reservation.emergencyContact.name),
                      ],
                      [
                        "Relationship",
                        fmt(reservation.emergencyContact.relationship),
                      ],
                      [
                        "Contact #",
                        fmt(reservation.emergencyContact.contactNumber),
                      ],
                    ].map(([l, v]) => (
                      <div className="rdm-info-item" key={l}>
                        <span className="rdm-info-label">{l}</span>
                        <span className="rdm-info-value">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents (expandable) */}
            <button
              type="button"
              className="rdm-expand-btn"
              onClick={() => setShowDocs(!showDocs)}
            >
              Submitted Documents
              <svg
                className={`rdm-chevron ${showDocs ? "open" : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {showDocs && (
              <div className="rdm-expand-content">
                {docs.map((doc, i) => (
                  <div key={i} className="rdm-doc-row">
                    <span className="rdm-doc-label">{doc.label}</span>
                    {doc.url ? (
                      <button
                        type="button"
                        className="rdm-doc-view"
                        onClick={() => openImage(doc.url, doc.label)}
                      >
                        View
                      </button>
                    ) : (
                      <span className="rdm-doc-na">
                        {doc.reason
                          ? `Skipped: ${doc.reason}`
                          : "Not submitted"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extend Dialog */}
      {showExtendPrompt && (
        <div
          className="rdm-extend-overlay"
          onClick={() => setShowExtendPrompt(false)}
        >
          <div
            className="rdm-extend-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rdm-extend-dialog-body">
              <h3 className="rdm-extend-dialog-title">Extend Move-in Date</h3>
              <div className="rdm-extend-dialog-input-row">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={extendDays}
                  onChange={(e) =>
                    setExtendDays(
                      Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                    )
                  }
                  className="rdm-extend-dialog-input"
                  autoFocus
                />
                <span className="rdm-extend-dialog-unit">
                  day{extendDays > 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="rdm-extend-dialog-actions">
              <button
                className="rdm-extend-dialog-cancel"
                onClick={() => setShowExtendPrompt(false)}
              >
                Cancel
              </button>
              <button
                className="rdm-extend-dialog-confirm"
                onClick={() => {
                  setShowExtendPrompt(false);
                  doAction(
                    "extend",
                    () =>
                      reservationApi.extend(reservation.id, {
                        extensionDays: extendDays,
                      }),
                    `Move-in extended by ${extendDays} day${extendDays > 1 ? "s" : ""}`,
                  );
                }}
                disabled={isSubmitting}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </>
  );
}
