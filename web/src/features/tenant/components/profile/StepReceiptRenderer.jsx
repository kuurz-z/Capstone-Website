import React from "react";
import { formatPaymentMethod } from "../../../../shared/utils/formatPaymentMethod";

/**
 * Renders inline receipt/summary content for each reservation step.
 * Extracted from ProfilePage renderStepReceipt() (originally ~750 lines).
 */

const ReceiptRow = ({ label, value, valueColor, valueStyle }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
    }}
  >
    <span style={{ color: "#6B7280" }}>{label}</span>
    <span
      style={{
        color: valueColor || "#1F2937",
        fontWeight: "500",
        ...valueStyle,
      }}
    >
      {value}
    </span>
  </div>
);

const ReceiptContainer = ({ bg, border, children }) => (
  <div
    style={{
      padding: "12px 16px",
      background: bg || "#F9FAFB",
      borderRadius: "8px",
      marginTop: "8px",
      fontSize: "14px",
      border: border || "none",
    }}
  >
    {children}
  </div>
);

const ActionNote = ({ bg, borderColor, color, children }) => (
  <ReceiptContainer
    bg={bg || "#FFFBEB"}
    border={`1px solid ${borderColor || "#FDE68A"}`}
  >
    <p style={{ color: color || "#92400E", margin: 0 }}>{children}</p>
  </ReceiptContainer>
);

// ─── Room Selected ───────────────────────────────────────────
const RoomSelectedReceipt = ({ reservation }) => (
  <ReceiptContainer>
    <ReceiptRow
      label="Room"
      value={
        reservation.roomId?.name || reservation.roomId?.roomNumber || "N/A"
      }
    />
    <ReceiptRow
      label="Branch"
      value={reservation.roomId?.branch || "N/A"}
      valueStyle={{ textTransform: "capitalize" }}
    />
    <ReceiptRow
      label="Type"
      value={reservation.roomId?.type || "N/A"}
      valueStyle={{ textTransform: "capitalize" }}
    />
    <ReceiptRow
      label="Monthly Rate"
      value={`₱${(reservation.roomId?.price || reservation.totalPrice || 0).toLocaleString()}`}
      valueColor="#FF8C42"
      valueStyle={{ fontWeight: "600" }}
    />
    {reservation.selectedBed && (
      <ReceiptRow
        label="Bed"
        value={`${reservation.selectedBed.position} (${reservation.selectedBed.id})`}
        valueStyle={{ textTransform: "capitalize" }}
      />
    )}
  </ReceiptContainer>
);

// ─── Visit Scheduled ─────────────────────────────────────────
const VisitScheduledReceipt = ({ reservation, step }) => {
  if (step.status !== "completed" && step.status !== "current") return null;

  const isCompleted = step.status === "completed";
  return (
    <ReceiptContainer
      bg={isCompleted ? "#F0FDF4" : "#F9FAFB"}
      border={isCompleted ? "1px solid #BBF7D0" : "none"}
    >
      <ReceiptRow
        label="Visit Type"
        value={
          reservation.viewingType === "inperson"
            ? "🏠 In-Person Visit"
            : reservation.viewingType === "virtual"
              ? "💻 Virtual Verification"
              : "Not selected"
        }
      />
      {reservation.isOutOfTown && (
        <ReceiptRow
          label="Location"
          value={`📍 ${reservation.currentLocation || "Out of town"}`}
        />
      )}
      <ReceiptRow
        label="Policies Accepted"
        value={reservation.agreedToPrivacy ? "✓ Yes" : "No"}
        valueColor={reservation.agreedToPrivacy ? "#10B981" : "#6B7280"}
        valueStyle={{ fontWeight: "500" }}
      />
      <ReceiptRow
        label="Schedule Status"
        value={
          reservation.scheduleApproved
            ? "✓ Approved"
            : "⏳ Awaiting Admin Approval"
        }
        valueColor={reservation.scheduleApproved ? "#10B981" : "#F59E0B"}
        valueStyle={{ fontWeight: "600" }}
      />
      {step.status === "current" && !reservation.scheduleApproved && (
        <p style={{ color: "#92400E", margin: "8px 0 0", fontSize: "13px" }}>
          <strong>Note:</strong> Please wait for admin to approve your visit
          schedule.
        </p>
      )}
    </ReceiptContainer>
  );
};

// ─── Visit Completed ─────────────────────────────────────────
const VisitCompletedReceipt = ({ reservation, step }) => {
  if (step.status === "completed") {
    return (
      <ReceiptContainer bg="#F0FDF4" border="1px solid #BBF7D0">
        <ReceiptRow
          label="Visit Type"
          value={
            reservation.viewingType === "inperson"
              ? "🏠 In-Person Visit"
              : "💻 Virtual Verification"
          }
        />
        <ReceiptRow
          label="Schedule Approval"
          value="✓ Approved"
          valueColor="#10B981"
          valueStyle={{ fontWeight: "600" }}
        />
        <ReceiptRow
          label="Visit Status"
          value="✓ Completed & Verified"
          valueColor="#10B981"
          valueStyle={{ fontWeight: "600" }}
        />
        <ReceiptRow label="Verified By" value="Admin" />
      </ReceiptContainer>
    );
  }
  if (step.status === "current") {
    return (
      <ReceiptContainer bg="#FFFBEB" border="1px solid #FDE68A">
        <ReceiptRow
          label="Visit Type"
          value={
            reservation.viewingType === "inperson"
              ? "🏠 In-Person Visit"
              : "💻 Virtual Verification"
          }
        />
        <ReceiptRow
          label="Schedule"
          value={
            reservation.scheduleApproved ? "✓ Approved" : "⏳ Awaiting Approval"
          }
          valueColor={reservation.scheduleApproved ? "#10B981" : "#F59E0B"}
          valueStyle={{ fontWeight: "600" }}
        />
        <ReceiptRow
          label="Visit Status"
          value="⏳ Awaiting Completion"
          valueColor="#F59E0B"
          valueStyle={{ fontWeight: "600" }}
        />
        <p style={{ color: "#92400E", margin: "8px 0 0", fontSize: "13px" }}>
          <strong>Note:</strong> Your visit is scheduled. The admin will verify
          and mark as complete once done.
        </p>
      </ReceiptContainer>
    );
  }
  return null;
};

// ─── Application Submitted ───────────────────────────────────
const ApplicationReceipt = ({ reservation, step }) => {
  if (step.status === "completed") {
    return (
      <ReceiptContainer bg="#F0FDF4" border="1px solid #BBF7D0">
        <ReceiptRow
          label="Applicant"
          value={`${reservation.firstName} ${reservation.middleName ? reservation.middleName + " " : ""}${reservation.lastName}`}
        />
        <ReceiptRow label="Mobile" value={reservation.mobileNumber || "N/A"} />
        <ReceiptRow
          label="Emergency Contact"
          value={reservation.emergencyContactName || "N/A"}
        />
        <ReceiptRow
          label="Employer/School"
          value={reservation.employerSchool || "N/A"}
        />
        <ReceiptRow
          label="Status"
          value="✓ Submitted"
          valueColor="#10B981"
          valueStyle={{ fontWeight: "600" }}
        />
      </ReceiptContainer>
    );
  }
  if (step.status === "current") {
    return (
      <ActionNote>
        <strong>📝 Action Required:</strong> Submit your personal details and
        documents for admin review.
      </ActionNote>
    );
  }
  return null;
};

// ─── Payment Submitted ───────────────────────────────────────
const PaymentReceipt = ({ reservation, step }) => {
  const reservationFeeAmount = reservation.reservationFeeAmount || 2000;
  if (step.status === "completed") {
    return (
      <ReceiptContainer bg="#F0FDF4" border="1px solid #BBF7D0">
        <ReceiptRow
          label="Amount"
          value={`PHP ${reservationFeeAmount.toLocaleString("en-PH")}`}
          valueColor="#FF8C42"
          valueStyle={{ fontWeight: "600" }}
        />
        <ReceiptRow
          label="Payment Method"
          value={formatPaymentMethod(reservation.paymentMethod)}
        />
        <ReceiptRow
          label="Move-in Date"
          value={
            reservation.finalMoveInDate
              ? new Date(reservation.finalMoveInDate).toLocaleDateString()
              : "TBD"
          }
        />
        <ReceiptRow
          label="Status"
          value="✓ Verified"
          valueColor="#10B981"
          valueStyle={{ fontWeight: "600" }}
        />
        {reservation.paymentReference && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 0",
              borderTop: "1px solid #BBF7D0",
              marginTop: "8px",
              paddingTop: "8px",
            }}
          >
            <span style={{ color: "#6B7280", fontWeight: "500" }}>
              Payment Reference
            </span>
            <span style={{ color: "#059669", fontWeight: "600" }}>
              {reservation.paymentReference}
            </span>
          </div>
        )}
      </ReceiptContainer>
    );
  }
  if (step.status === "pending_approval") {
    return (
      <ReceiptContainer bg="#FEF3C7" border="1px solid #FCD34D">
        <p style={{ color: "#78350F", marginBottom: "8px", margin: 0 }}>
          <strong>⏳ Pending Review:</strong> Your payment has been
          submitted and is being confirmed. This usually takes a few minutes.
        </p>
        {reservation.paymentReference && (
          <p style={{ color: "#78350F", fontSize: "12px", margin: "8px 0 0" }}>
            <strong>Payment Reference:</strong> {reservation.paymentReference}
          </p>
        )}
      </ReceiptContainer>
    );
  }
  if (step.status === "current") {
    return (
      <ActionNote>
        <strong>💳 Action Required:</strong> Pay {`PHP ${reservationFeeAmount.toLocaleString("en-PH")}`} online to secure your
        reservation.
      </ActionNote>
    );
  }
  return null;
};

// ─── Confirmed ───────────────────────────────────────────────
const ConfirmedReceipt = ({ reservation, step }) => {
  if (step.status === "completed") {
    return (
      <ReceiptContainer bg="#F0FDF4" border="1px solid #BBF7D0">
        <div
          style={{
            textAlign: "center",
            padding: "8px 0",
            borderBottom: "1px solid #BBF7D0",
            marginBottom: "8px",
          }}
        >
          <p
            style={{
              color: "#166534",
              fontWeight: "700",
              fontSize: "16px",
              margin: "0 0 8px",
            }}
          >
            🎉 Reservation Confirmed!
          </p>
          {reservation.reservationCode && (
            <p style={{ color: "#6B7280", fontSize: "12px", margin: "4px 0" }}>
              Reservation Code:{" "}
              <strong style={{ color: "#166534" }}>
                {reservation.reservationCode}
              </strong>
            </p>
          )}
          {reservation.paymentReference && (
            <p style={{ color: "#6B7280", fontSize: "12px", margin: "4px 0" }}>
              Payment Reference:{" "}
              <strong style={{ color: "#059669" }}>
                {reservation.paymentReference}
              </strong>
            </p>
          )}
        </div>
        <ReceiptRow
          label="Room"
          value={
            reservation.roomId?.name || reservation.roomId?.roomNumber || "N/A"
          }
        />
        <ReceiptRow
          label="Branch"
          value={reservation.roomId?.branch || "N/A"}
          valueStyle={{ textTransform: "capitalize" }}
        />
        <ReceiptRow
          label="Monthly Rate"
          value={`₱${(reservation.roomId?.price || reservation.totalPrice || 0).toLocaleString()}`}
          valueColor="#FF8C42"
          valueStyle={{ fontWeight: "600" }}
        />
        <ReceiptRow
          label="Move-in Date"
          value={
            reservation.finalMoveInDate
              ? new Date(reservation.finalMoveInDate).toLocaleDateString()
              : "TBD"
          }
        />
      </ReceiptContainer>
    );
  }
  if (step.status === "pending_approval") {
    return (
      <ReceiptContainer bg="#FEF3C7" border="1px solid #FCD34D">
        <p style={{ color: "#78350F", margin: 0 }}>
          <strong>⏳ Under Review:</strong> Your payment is being verified by
          our admin team. Once approved, your reservation will be confirmed.
        </p>
      </ReceiptContainer>
    );
  }
  return null;
};

// ─── Main Export ─────────────────────────────────────────────
const STEP_RENDERERS = {
  room_selected: RoomSelectedReceipt,
  visit_scheduled: VisitScheduledReceipt,
  visit_completed: VisitCompletedReceipt,
  application_submitted: ApplicationReceipt,
  payment_submitted: PaymentReceipt,
  reserved: ConfirmedReceipt,
};

const StepReceiptRenderer = ({ step, reservation }) => {
  if (!reservation) return null;
  const Renderer = STEP_RENDERERS[step.step];
  if (!Renderer) return null;
  return <Renderer reservation={reservation} step={step} />;
};

export default StepReceiptRenderer;
