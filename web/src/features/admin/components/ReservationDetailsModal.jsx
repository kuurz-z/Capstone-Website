import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Calendar, ClipboardList, CreditCard, Eye } from "lucide-react";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { reservationApi } from "../../../shared/api/apiClient";
import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";
import getFriendlyError from "../../../shared/utils/friendlyError";
import {
  getAllowedReservationActions,
  getReservationStatusAppearance,
  readMoveInDate,
} from "../../../shared/utils/lifecycleNaming";
import { showNotification } from "../../../shared/utils/notification";
import "../styles/reservation-details-modal.css";

const ACTION_MSGS = {
  moveIn: {
    title: "Move In Tenant",
    message:
      "Mark this tenant as moved in? They'll be promoted to Tenant role with full system access.",
    confirmText: "Yes, Move In",
    variant: "info",
  },
  cancel: {
    title: "Cancel reservation",
    message:
      "This will permanently remove the reservation. The reservation fee is non-refundable, and the bed will be released.",
    confirmText: "Cancel reservation",
    variant: "danger",
  },
};

const fmt = (value) =>
  value === null || value === undefined || value === "" ? "\u2014" : value;

const fmtDate = (value) => {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
};

const fmtDateTime = (value) => {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
};

const openImage = (url, title) => {
  if (!url) {
    showNotification("No file available", "error");
    return;
  }

  if (/\.pdf($|\?)/i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const preview = window.open("", "_blank");
  preview?.document.write(
    `<html><head><title>${title}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#111;"><img src="${url}" style="max-width:100%;max-height:100vh;object-fit:contain;" alt="${title}"/></body></html>`,
  );
};

const buildDocs = (reservation) => [
  { label: "Selfie Photo", url: reservation.selfiePhotoUrl },
  {
    label: `Valid ID Front${
      reservation.idType || reservation.validIDType
        ? ` (${ID_TYPE_LABELS[reservation.idType || reservation.validIDType] || reservation.idType || reservation.validIDType})`
        : ""
    }`,
    url: reservation.validIDFrontUrl,
  },
  { label: "Valid ID Back", url: reservation.validIDBackUrl },
  {
    label: "NBI Clearance",
    url: reservation.nbiClearanceUrl,
    reason: reservation.nbiReason,
  },
  {
    label: "Company/School ID",
    url: reservation.companyIDUrl,
    reason: reservation.companyIDReason,
  },
];

const PERSONAL_FIELDS = (reservation) => [
  ["First Name", fmt(reservation.firstName || reservation.userId?.firstName)],
  ["Last Name", fmt(reservation.lastName || reservation.userId?.lastName)],
  ["Middle Name", fmt(reservation.middleName)],
  ["Nickname", fmt(reservation.nickname)],
  ["Birthday", fmtDate(reservation.birthday)],
  ["Marital Status", fmt(reservation.maritalStatus)],
  ["Nationality", fmt(reservation.nationality)],
  ["Education", fmt(reservation.educationLevel)],
  ["Phone", fmt(reservation.phone || reservation.mobileNumber)],
];

const getInitials = (name) => {
  const initials = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "GU";
};

const STAGE_GUIDANCE = {
  pending: {
    Icon: Calendar,
    message: "Waiting for the tenant to schedule a site visit.",
  },
  visit_pending: {
    Icon: Eye,
    message:
      "Tenant has scheduled a visit. Approve or reject it in the Visit Schedules tab.",
  },
  visit_approved: {
    Icon: ClipboardList,
    message:
      "Visit approved. Waiting for the tenant to complete their application and pay the reservation fee.",
  },
  payment_pending: {
    Icon: CreditCard,
    message:
      "Payment submitted and awaiting automatic verification from the payment gateway.",
  },
};

const ID_TYPE_LABELS = {
  national_id: "National ID",
  drivers_license: "Driver's License",
  passport: "Passport",
  sss_id: "SSS ID",
  umid: "UMID",
  school_id: "School ID",
  other: "Other",
};

export default function ReservationDetailsModal({
  reservation,
  onClose,
  onUpdate,
}) {
  const reservationFeeAmount = reservation?.reservationFeeAmount || 2000;
  const reservationFeeLabel = `PHP ${reservationFeeAmount.toLocaleString("en-PH")}`;
  const [adminNotes, setAdminNotes] = useState(reservation?.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [extendDays, setExtendDays] = useState(3);
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const [meterReadingVal, setMeterReadingVal] = useState("");
  const [showMeterPrompt, setShowMeterPrompt] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });

  useBodyScrollLock(Boolean(reservation));
  useEscapeClose(Boolean(reservation), onClose);

  if (!reservation) return null;

  const status = reservation.status || "pending";
  const appearance = getReservationStatusAppearance(status);
  const allowedActions = getAllowedReservationActions(status);
  const moveInDate = readMoveInDate(reservation);
  const isMovedOut = status === "moveOut";
  const isOverdue =
    status === "reserved" && moveInDate && new Date(moveInDate) < new Date();
  const daysOverdue = isOverdue
    ? Math.floor((new Date() - new Date(moveInDate)) / 86400000)
    : 0;
  const docs = buildDocs(reservation);
  const guestName = reservation.customer ?? "Unknown";
  const guestInitials = getInitials(guestName);
  const stageGuide = STAGE_GUIDANCE[status];
  const bookingDetails = [
    ["Room", reservation.room ?? "\u2014"],
    ["Room type", reservation.roomType ?? "\u2014"],
    ["Branch", reservation.branch ?? "\u2014"],
    ["Move-in", fmtDate(moveInDate)],
    ["Contact", reservation.phone ?? reservation.mobileNumber ?? "\u2014"],
    [
      "Lease term",
      reservation.leaseDuration ? `${reservation.leaseDuration} months` : "\u2014",
    ],
  ];

  const doAction = (key, apiCall, successMsg) => {
    const modalConfig =
      key === "extend"
        ? {
            title: `Extend Move-in by ${extendDays} Day${extendDays > 1 ? "s" : ""}`,
            message: `Push the move-in date forward by ${extendDays} day${extendDays > 1 ? "s" : ""}. Reservation stays reserved.`,
            confirmText: "Extend",
            variant: "info",
          }
        : key === "cancel"
          ? {
              ...ACTION_MSGS.cancel,
              message: `The ${reservationFeeLabel} reservation fee is non-refundable. The bed will be freed and user reset to applicant.`,
            }
          : ACTION_MSGS[key];

    setConfirmModal({
      open: true,
      ...modalConfig,
      onConfirm: async () => {
        setConfirmModal((previous) => ({ ...previous, open: false }));
        setIsSubmitting(true);

        try {
          await apiCall();
          showNotification(successMsg, "success");
          onUpdate?.();
          onClose();
        } catch (error) {
          console.error(error);
          showNotification(
            getFriendlyError(error, "Action failed. Please try again."),
            "error",
          );
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const saveNotes = async (event) => {
    event.preventDefault();
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

  return createPortal(
    <>
      <div className="rdm-overlay" onClick={onClose}>
        <div className="rdm" onClick={(event) => event.stopPropagation()}>
          <div className="rdm-top-card">
            <div className="rdm-top-header">
              <div className="rdm-guest-block">
                <div className="rdm-avatar" aria-hidden="true">
                  {guestInitials}
                </div>
                <div className="rdm-guest-copy">
                  <h2 className="rdm-title">{guestName}</h2>
                  <div className="rdm-header-meta">
                    <span className="rdm-code">
                      {reservation.reservationCode || "\u2014"}
                    </span>
                    <span className="rdm-header-sep">&bull;</span>
                    <span className="rdm-header-detail">
                      {reservation.email ?? "\u2014"}
                    </span>
                    <div
                      className="rdm-status-chip rdm-status-chip-dark"
                      style={{
                        "--rdm-status-bg": appearance.bg,
                        "--rdm-status-color": appearance.color,
                        "--rdm-status-dot": appearance.dot,
                      }}
                    >
                      <span className="rdm-status-dot" />
                      {appearance.label}
                    </div>
                    {isOverdue && (
                      <div className="rdm-overdue-chip">
                        {daysOverdue} day{daysOverdue > 1 ? "s" : ""} overdue
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="rdm-close rdm-close-dark"
                onClick={onClose}
                aria-label="Close"
              >
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

            <div className="rdm-top-section">
              <h3 className="rdm-top-section-label">Booking Details</h3>
              <div className="rdm-info-grid rdm-info-grid-dark">
                {bookingDetails.map(([label, value]) => (
                  <div className="rdm-info-item" key={label}>
                    <span className="rdm-info-label">{label}</span>
                    <span
                      className={`rdm-info-value ${label === "Move-in" && isOverdue ? "rdm-danger" : ""}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Cancellation detail banner — visible to admins when applicant self-cancelled ── */}
            {status === "cancelled" && reservation.cancellationSource === "applicant" && (
              <div style={{
                margin: "12px 0 0",
                padding: "14px 16px",
                borderRadius: "10px",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={16} style={{ color: "#ea580c", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#9a3412" }}>
                    Cancelled by Applicant
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px" }}>
                  <div>
                    <span style={{ color: "#c2410c", fontWeight: 600 }}>Cancelled on</span>
                    <div style={{ color: "#9a3412" }}>{fmtDateTime(reservation.cancelledAt)}</div>
                  </div>
                  <div>
                    <span style={{ color: "#c2410c", fontWeight: 600 }}>Reason</span>
                    <div style={{ color: "#9a3412" }}>{reservation.cancellationReason || "Not provided"}</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#c2410c", fontWeight: 600 }}>Reservation fee</span>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      marginLeft: "8px",
                      background: reservation.reservationFeeForfeited ? "#fee2e2" : "#dcfce7",
                      color: reservation.reservationFeeForfeited ? "#991b1b" : "#166534",
                      borderRadius: "999px",
                      padding: "2px 9px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}>
                      {reservation.reservationFeeForfeited ? "Forfeited (non-refundable)" : "Refundable"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status !== "cancelled" && !isMovedOut && (
              <div className="rdm-actions-card rdm-actions-card-dark">
                {stageGuide && (
                  <div className="rdm-stage-guide rdm-stage-guide-dark">
                    <div className="rdm-stage-guide-icon-wrap">
                      <stageGuide.Icon size={16} strokeWidth={1.75} />
                    </div>
                    <p className="rdm-stage-guide-msg">{stageGuide.message}</p>
                  </div>
                )}

                {allowedActions.includes("moveIn") && (
                  <button
                    className="rdm-action rdm-action-dark"
                    onClick={() => {
                      setMeterReadingVal("");
                      setShowMeterPrompt(true);
                    }}
                    disabled={isSubmitting}
                    title="Mark tenant as moved in and record the initial meter reading"
                  >
                    Mark as moved in
                  </button>
                )}

                {allowedActions.includes("extend") && (
                  <button
                    className="rdm-action rdm-action-dark"
                    onClick={() => setShowExtendPrompt(true)}
                    disabled={isSubmitting}
                  >
                    Reschedule move-in
                  </button>
                )}

                {allowedActions.includes("cancelled") && (
                  <button
                    className="rdm-action rdm-action-dark rdm-action-dark-cancel"
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
                    Cancel reservation
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rdm-body">
            <div className="rdm-section">
              <h4 className="rdm-section-title">Admin Notes</h4>
              <form onSubmit={saveNotes} className="rdm-notes-form">
                <textarea
                  className="rdm-notes-input"
                  placeholder="Add internal notes..."
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
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

            <button
              type="button"
              className="rdm-expand-btn"
              onClick={() => setShowPersonal((previous) => !previous)}
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
                  {PERSONAL_FIELDS(reservation).map(([label, value]) => (
                    <div className="rdm-info-item" key={label}>
                      <span className="rdm-info-label">{label}</span>
                      <span className="rdm-info-value">{value}</span>
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
                    ].map(([label, value]) => (
                      <div className="rdm-info-item" key={label}>
                        <span className="rdm-info-label">{label}</span>
                        <span className="rdm-info-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="rdm-expand-btn"
              onClick={() => setShowDocs((previous) => !previous)}
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
                {docs.map((doc, index) => (
                  <div key={`${doc.label}-${index}`} className="rdm-doc-row">
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
                        {doc.reason ? `Skipped: ${doc.reason}` : "Not submitted"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMeterPrompt && (
        <div
          className="rdm-extend-overlay"
          onClick={() => setShowMeterPrompt(false)}
        >
          <div
            className="rdm-extend-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rdm-extend-dialog-body">
              <h3 className="rdm-extend-dialog-title">Move-In Meter Reading</h3>
              <p className="rdm-extend-dialog-copy">
                Enter the starting kWh reading to record this tenant&apos;s
                move-in electricity baseline.
              </p>
              <div
                className="rdm-extend-dialog-input-row"
                style={{ width: "100%" }}
              >
                <input
                  type="number"
                  min="0"
                  max="99999"
                  step="0.01"
                  value={meterReadingVal}
                  onChange={(event) => setMeterReadingVal(event.target.value)}
                  className="rdm-extend-dialog-input rdm-extend-dialog-input--wide"
                  placeholder="e.g. 1250"
                  autoFocus
                />
                <span className="rdm-extend-dialog-unit">kWh</span>
              </div>
            </div>
            <div className="rdm-extend-dialog-actions">
              <button
                className="rdm-extend-dialog-cancel"
                onClick={() => setShowMeterPrompt(false)}
              >
                Cancel
              </button>
              <button
                className="rdm-extend-dialog-confirm"
                onClick={() => {
                  const reading = Number(meterReadingVal);
                  if (!meterReadingVal.trim() || Number.isNaN(reading) || reading < 0) {
                    showNotification(
                      "A valid meter reading (kWh) is required.",
                      "error",
                      4000,
                    );
                    return;
                  }

                  setShowMeterPrompt(false);
                  doAction(
                    "moveIn",
                    () =>
                      reservationApi.update(reservation.id, {
                        status: "moveIn",
                        meterReading: reading,
                      }),
                    "Tenant moved in successfully",
                  );
                }}
                disabled={isSubmitting}
              >
                Move In
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtendPrompt && (
        <div
          className="rdm-extend-overlay"
          onClick={() => setShowExtendPrompt(false)}
        >
          <div
            className="rdm-extend-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rdm-extend-dialog-body">
              <h3 className="rdm-extend-dialog-title">Extend Move-in Date</h3>
              <div className="rdm-extend-dialog-input-row">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={extendDays}
                  onChange={(event) =>
                    setExtendDays(
                      Math.max(1, Math.min(30, Number(event.target.value) || 1)),
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
        onClose={() => setConfirmModal((previous) => ({ ...previous, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </>,
    document.body,
  );
}
