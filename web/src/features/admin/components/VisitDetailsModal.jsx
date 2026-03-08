import { useState } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";

export default function VisitDetailsModal({
  schedule,
  onClose,
  onUpdate,
  onReject,
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!schedule) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      showNotification("Please enter a rejection reason", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      await reservationApi.update(schedule.id, {
        scheduleRejected: true,
        scheduleRejectionReason: rejectReason.trim(),
        scheduleRejectedAt: new Date().toISOString(),
        viewingType: null,
        agreedToPrivacy: false,
        scheduleApproved: false,
      });
      showNotification("Visit schedule rejected successfully", "success");
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error("Error rejecting schedule:", error);
      showNotification("Failed to reject schedule", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid #E5E7EB",
            background: "#F9FAFB",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#1F2937",
                margin: 0,
              }}
            >
              Visit Schedule Details
            </h2>
            <p
              style={{ fontSize: "13px", color: "#6B7280", margin: "4px 0 0" }}
            >
              {schedule.reservationCode}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#6B7280",
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {/* Status Badge */}
          <div style={{ marginBottom: "24px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: "600",
                backgroundColor: schedule.visitApproved
                  ? "#D1FAE5"
                  : schedule.scheduleApproved
                    ? "#E0EBF5"
                    : schedule.scheduleRejected
                      ? "#FEE2E2"
                      : "#FEF3C7",
                color: schedule.visitApproved
                  ? "#047857"
                  : schedule.scheduleApproved
                    ? "#0C375F"
                    : schedule.scheduleRejected
                      ? "#DC2626"
                      : "#92400E",
              }}
            >
              {schedule.visitApproved
                ? "✓ Visit Completed"
                : schedule.scheduleApproved
                  ? "📅 Awaiting Visit"
                  : schedule.scheduleRejected
                    ? "✕ Schedule Rejected"
                    : "⏳ Pending Approval"}
            </span>
          </div>

          {/* Rejection Reason (if rejected) */}
          {schedule.scheduleRejected && schedule.scheduleRejectionReason && (
            <div
              style={{
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "24px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#DC2626",
                  margin: "0 0 8px",
                }}
              >
                Rejection Reason:
              </p>
              <p style={{ fontSize: "14px", color: "#7F1D1D", margin: 0 }}>
                {schedule.scheduleRejectionReason}
              </p>
            </div>
          )}

          {/* Customer Information */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#1F2937",
                marginBottom: "12px",
              }}
            >
              👤 Customer Information
            </h3>
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Full Name
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.customer}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Email
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.email}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Phone
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.phone || "N/A"}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Billing Email
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.billingEmail || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Room Information */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#1F2937",
                marginBottom: "12px",
              }}
            >
              🏠 Room Information
            </h3>
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Room
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.room}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Branch
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {schedule.branch}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Visit Details */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#1F2937",
                marginBottom: "12px",
              }}
            >
              📅 Visit Details
            </h3>
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Visit Type
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "500",
                      backgroundColor:
                        schedule.viewingType === "inperson"
                          ? "#E0EBF5"
                          : "#F3E8FF",
                      color:
                        schedule.viewingType === "inperson"
                          ? "#0C375F"
                          : "#0C375F",
                    }}
                  >
                    {schedule.viewingType === "inperson"
                      ? "🏠 In-Person"
                      : "💻 Virtual"}
                  </span>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6B7280",
                      margin: "0 0 4px",
                    }}
                  >
                    Request Date
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#1F2937",
                      margin: 0,
                    }}
                  >
                    {formatDate(schedule.scheduledDate)}
                  </p>
                </div>
                {schedule.isOutOfTown && (
                  <div style={{ gridColumn: "span 2" }}>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6B7280",
                        margin: "0 0 4px",
                      }}
                    >
                      Current Location (Out of Town)
                    </p>
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#1F2937",
                        margin: 0,
                      }}
                    >
                      📍 {schedule.currentLocation || "Not specified"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rejection Form */}
          {rejectMode &&
            !schedule.visitApproved &&
            !schedule.scheduleRejected && (
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  padding: "16px",
                  marginBottom: "24px",
                }}
              >
                <h4
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#DC2626",
                    margin: "0 0 12px",
                  }}
                >
                  Reject Visit Schedule
                </h4>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection (this will be shown to the user)..."
                  style={{
                    width: "100%",
                    minHeight: "100px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #FECACA",
                    fontSize: "14px",
                    resize: "vertical",
                    marginBottom: "12px",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => {
                      setRejectMode(false);
                      setRejectReason("");
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "white",
                      border: "1px solid #D1D5DB",
                      borderRadius: "6px",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectSubmit}
                    disabled={isSubmitting || !rejectReason.trim()}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#DC2626",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: "500",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting || !rejectReason.trim() ? 0.6 : 1,
                    }}
                  >
                    {isSubmitting ? "Rejecting..." : "Confirm Rejection"}
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            padding: "16px 24px",
            borderTop: "1px solid #E5E7EB",
            backgroundColor: "#F9FAFB",
          }}
        >
          {!schedule.visitApproved &&
            !schedule.scheduleRejected &&
            !rejectMode && (
              <button
                onClick={() => setRejectMode(true)}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "white",
                  color: "#DC2626",
                  border: "1px solid #DC2626",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                ✕ Reject Schedule
              </button>
            )}
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              backgroundColor: "#6B7280",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
