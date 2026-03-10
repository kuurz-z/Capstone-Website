import React from "react";

/**
 * Full-page receipt modal showing detailed info per reservation step.
 * Extracted from ProfilePage (originally lines 2869-4237, ~1370 lines).
 *
 * Each step renders a dedicated section with styled receipt rows.
 */

const ReceiptRow = ({
  label,
  value,
  valueColor,
  valueWeight,
  valueSize,
  capitalize,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: "1px solid #E5E7EB",
    }}
  >
    <span style={{ color: "#6B7280" }}>{label}</span>
    <span
      style={{
        color: valueColor || "#1F2937",
        fontWeight: valueWeight || "600",
        fontSize: valueSize,
        textTransform: capitalize ? "capitalize" : undefined,
      }}
    >
      {value}
    </span>
  </div>
);

const SectionTitle = ({ children }) => (
  <p
    style={{
      fontSize: "12px",
      fontWeight: "600",
      color: "#E7710F",
      marginBottom: "8px",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }}
  >
    {children}
  </p>
);

const TimestampBadge = ({ label, date }) => (
  <div
    style={{
      marginTop: "12px",
      padding: "8px 12px",
      backgroundColor: "#ECFDF5",
      borderRadius: "8px",
      borderLeft: "3px solid #10B981",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ color: "#6B7280", fontSize: "12px" }}>{label}</span>
      <span style={{ color: "#166534", fontWeight: "600", fontSize: "13px" }}>
        {date
          ? new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A"}
      </span>
    </div>
  </div>
);

// ─── Room Selected Receipt ───────────────────────────────────
const RoomReceipt = ({ reservation }) => (
  <>
    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Room Details</SectionTitle>
      <ReceiptRow
        label="Room Name/Number"
        value={
          reservation?.roomId?.name || reservation?.roomId?.roomNumber || "N/A"
        }
      />
      <ReceiptRow
        label="Branch Location"
        value={reservation?.roomId?.branch || "N/A"}
        capitalize
      />
      <ReceiptRow
        label="Room Type"
        value={reservation?.roomId?.type || "N/A"}
        capitalize
      />
      <ReceiptRow
        label="Floor"
        value={
          reservation?.roomId?.floor
            ? `Floor ${reservation.roomId.floor}`
            : "Ground Floor"
        }
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Room Capacity</span>
        <span style={{ color: "#1F2937", fontWeight: "600" }}>
          {(() => {
            const capacity =
              reservation?.roomId?.capacity ||
              reservation?.roomId?.beds?.length;
            if (!capacity) return "N/A";
            return `${capacity} ${capacity === 1 ? "Person" : "Persons"}`;
          })()}
        </span>
      </div>
    </div>

    {reservation?.selectedBed && (
      <div style={{ marginBottom: "12px" }}>
        <SectionTitle>Selected Slot</SectionTitle>
        <ReceiptRow label="Bed/Slot ID" value={reservation.selectedBed.id} />
        <ReceiptRow
          label="Position"
          value={reservation.selectedBed.position || "Standard"}
        />
      </div>
    )}

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Room Amenities</SectionTitle>
      <div style={{ padding: "8px 0" }}>
        {reservation?.roomId?.amenities?.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {reservation.roomId.amenities.map((amenity, index) => (
              <span
                key={index}
                style={{
                  backgroundColor: "#FFF7ED",
                  color: "#E7710F",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "500",
                }}
              >
                {amenity}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: "#6B7280", fontSize: "13px" }}>
            Standard amenities included
          </span>
        )}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <SectionTitle>Pricing Details</SectionTitle>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <span style={{ color: "#6B7280" }}>Monthly Rate</span>
        <span style={{ color: "#E7710F", fontWeight: "700", fontSize: "18px" }}>
          ₱
          {(
            reservation?.roomId?.price ||
            reservation?.totalPrice ||
            0
          ).toLocaleString()}
        </span>
      </div>
      {reservation?.roomId?.deposit && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0",
          }}
        >
          <span style={{ color: "#6B7280" }}>Security Deposit</span>
          <span style={{ color: "#1F2937", fontWeight: "600" }}>
            ₱{reservation.roomId.deposit.toLocaleString()}
          </span>
        </div>
      )}
    </div>

    <TimestampBadge label="Room Selected On" date={reservation?.createdAt} />
  </>
);

// ─── Visit Scheduled Receipt ─────────────────────────────────
const VisitReceipt = ({ reservation }) => (
  <>
    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Booking Details</SectionTitle>
      <ReceiptRow
        label="Visit Type"
        value={
          reservation?.viewingType === "inperson"
            ? "🏠 In-Person Visit"
            : "💻 Virtual Tour"
        }
      />
      <ReceiptRow
        label={
          reservation?.scheduleApproved
            ? "Confirmed Date"
            : "Preferred Move-in Date"
        }
        value={
          reservation?.targetMoveInDate
            ? new Date(reservation.targetMoveInDate).toLocaleDateString(
                "en-US",
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                },
              )
            : "To be confirmed"
        }
      />
      <ReceiptRow
        label="Schedule Status"
        value={
          reservation?.scheduleApproved
            ? "✓ Confirmed by Admin"
            : "⏳ Awaiting Admin Confirmation"
        }
        valueColor={reservation?.scheduleApproved ? "#10B981" : "#F59E0B"}
      />
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Contact Information</SectionTitle>
      <ReceiptRow
        label="Visitor Name"
        value={
          reservation?.userId?.fullName ||
          `${reservation?.firstName || ""} ${reservation?.lastName || ""}`.trim() ||
          "N/A"
        }
      />
      <ReceiptRow
        label="Contact Number"
        value={
          reservation?.mobileNumber ||
          reservation?.userId?.mobileNumber ||
          "N/A"
        }
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Email</span>
        <span style={{ color: "#1F2937", fontWeight: "600", fontSize: "13px" }}>
          {reservation?.userId?.email || "N/A"}
        </span>
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Terms & Policies</SectionTitle>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Policies Accepted</span>
        <span style={{ color: "#10B981", fontWeight: "600" }}>✓ Yes</span>
      </div>
    </div>

    <TimestampBadge
      label="Booking Submitted"
      date={reservation?.scheduleRequestedAt || reservation?.updatedAt}
    />
  </>
);

// ─── Visit Completed Receipt ─────────────────────────────────
const VisitCompletedReceipt = ({ reservation }) => (
  <>
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div
        style={{
          width: "60px",
          height: "60px",
          backgroundColor: "#ECFDF5",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 12px",
        }}
      >
        <span style={{ fontSize: "28px" }}>✓</span>
      </div>
      <p
        style={{
          color: "#166534",
          fontWeight: "700",
          fontSize: "16px",
          margin: "0 0 4px",
        }}
      >
        Visit Completed Successfully
      </p>
      <p style={{ color: "#6B7280", fontSize: "13px", margin: 0 }}>
        Your{" "}
        {reservation?.viewingType === "inperson"
          ? "in-person visit"
          : "virtual tour"}{" "}
        has been verified
      </p>
    </div>
    <div
      style={{
        marginTop: "16px",
        padding: "16px",
        backgroundColor: "#ECFDF5",
        borderRadius: "8px",
        border: "1px solid #A7F3D0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <p
            style={{
              color: "#6B7280",
              fontSize: "12px",
              margin: "0 0 4px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Completion Date
          </p>
          <p
            style={{
              color: "#166534",
              fontWeight: "700",
              fontSize: "18px",
              margin: 0,
            }}
          >
            {reservation?.visitCompletedAt || reservation?.updatedAt
              ? new Date(
                  reservation?.visitCompletedAt || reservation?.updatedAt,
                ).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "N/A"}
          </p>
        </div>
        <span style={{ fontSize: "24px" }}>📅</span>
      </div>
    </div>
  </>
);

// ─── Application Receipt ─────────────────────────────────────
const ApplicationReceipt = ({ reservation }) => (
  <>
    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Personal Information</SectionTitle>
      <ReceiptRow
        label="Full Name"
        value={`${reservation?.firstName} ${reservation?.middleName ? `${reservation.middleName} ` : ""}${reservation?.lastName}`}
      />
      <ReceiptRow
        label="Date of Birth"
        value={
          reservation?.dateOfBirth
            ? new Date(reservation.dateOfBirth).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "N/A"
        }
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Gender</span>
        <span
          style={{
            color: "#1F2937",
            fontWeight: "600",
            textTransform: "capitalize",
          }}
        >
          {reservation?.gender || "N/A"}
        </span>
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Contact Information</SectionTitle>
      <ReceiptRow
        label="Mobile Number"
        value={reservation?.mobileNumber || "N/A"}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Email</span>
        <span style={{ color: "#1F2937", fontWeight: "600", fontSize: "13px" }}>
          {reservation?.userId?.email || "N/A"}
        </span>
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Address</SectionTitle>
      <div style={{ padding: "8px 0" }}>
        <span
          style={{ color: "#1F2937", fontWeight: "500", lineHeight: "1.5" }}
        >
          {reservation?.address
            ? `${reservation.address}${reservation.city ? `, ${reservation.city}` : ""}${reservation.province ? `, ${reservation.province}` : ""}${reservation.zipCode ? ` ${reservation.zipCode}` : ""}`
            : reservation?.permanentAddress || "N/A"}
        </span>
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Emergency Contact</SectionTitle>
      <ReceiptRow
        label="Name"
        value={reservation?.emergencyContactName || "N/A"}
      />
      <ReceiptRow
        label="Relationship"
        value={reservation?.emergencyContactRelation || "N/A"}
        capitalize
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Contact Number</span>
        <span style={{ color: "#1F2937", fontWeight: "600" }}>
          {reservation?.emergencyContactNumber || "N/A"}
        </span>
      </div>
    </div>

    <TimestampBadge
      label="Application Submitted"
      date={reservation?.applicationSubmittedAt || reservation?.updatedAt}
    />
  </>
);

// ─── Payment Receipt ─────────────────────────────────────────
const PaymentReceiptContent = ({ reservation }) => (
  <>
    <div style={{ marginBottom: "16px" }}>
      <SectionTitle>Proof of Payment</SectionTitle>
      {reservation?.proofOfPayment || reservation?.paymentProofUrl ? (
        <div
          style={{
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid #E5E7EB",
          }}
        >
          <img
            src={reservation?.proofOfPayment || reservation?.paymentProofUrl}
            alt="Proof of Payment"
            style={{
              width: "100%",
              maxHeight: "250px",
              objectFit: "contain",
              backgroundColor: "#F9FAFB",
            }}
            onClick={() =>
              window.open(
                reservation?.proofOfPayment || reservation?.paymentProofUrl,
                "_blank",
              )
            }
          />
          <p
            style={{
              fontSize: "11px",
              color: "#6B7280",
              textAlign: "center",
              margin: "8px 0",
              cursor: "pointer",
            }}
          >
            Click image to view full size
          </p>
        </div>
      ) : (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#F9FAFB",
            borderRadius: "8px",
            textAlign: "center",
            border: "1px dashed #D1D5DB",
          }}
        >
          <span style={{ fontSize: "24px" }}>📄</span>
          <p style={{ color: "#6B7280", fontSize: "13px", margin: "8px 0 0" }}>
            Payment proof not available
          </p>
        </div>
      )}
    </div>

    <div style={{ marginBottom: "12px" }}>
      <SectionTitle>Payment Details</SectionTitle>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <span style={{ color: "#6B7280" }}>Amount Paid</span>
        <span style={{ color: "#E7710F", fontWeight: "700", fontSize: "18px" }}>
          ₱{(reservation?.totalPrice || 0).toLocaleString()}
        </span>
      </div>
      <ReceiptRow
        label="Payment Method"
        value={reservation?.paymentMethod || "N/A"}
        capitalize
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ color: "#6B7280" }}>Verification Status</span>
        <span
          style={{
            color: reservation?.status === "confirmed" ? "#10B981" : "#F59E0B",
            fontWeight: "600",
          }}
        >
          {reservation?.status === "confirmed"
            ? "✓ Verified"
            : "⏳ Pending Verification"}
        </span>
      </div>
    </div>

    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        backgroundColor: "#ECFDF5",
        borderRadius: "8px",
        border: "1px solid #A7F3D0",
      }}
    >
      <p
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: "#166534",
          marginBottom: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Submission Date & Time
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <p
            style={{
              color: "#166534",
              fontWeight: "700",
              fontSize: "16px",
              margin: 0,
            }}
          >
            {reservation?.paymentSubmittedAt || reservation?.updatedAt
              ? new Date(
                  reservation?.paymentSubmittedAt || reservation?.updatedAt,
                ).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "N/A"}
          </p>
          <p style={{ color: "#6B7280", fontSize: "13px", margin: "4px 0 0" }}>
            {reservation?.paymentSubmittedAt || reservation?.updatedAt
              ? new Date(
                  reservation?.paymentSubmittedAt || reservation?.updatedAt,
                ).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : ""}
          </p>
        </div>
        <span style={{ fontSize: "24px" }}>⏰</span>
      </div>
    </div>
  </>
);

// ─── Confirmed Receipt ───────────────────────────────────────
const ConfirmedReceipt = ({ reservation }) => (
  <>
    <div
      style={{
        textAlign: "center",
        padding: "16px 0",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      <span style={{ fontSize: "32px" }}>🎉</span>
      <p
        style={{
          color: "#166534",
          fontWeight: "700",
          fontSize: "18px",
          margin: "8px 0 0",
        }}
      >
        Reservation Confirmed!
      </p>
    </div>
    <ReceiptRow
      label="Room"
      value={
        reservation?.roomId?.name || reservation?.roomId?.roomNumber || "N/A"
      }
    />
    <ReceiptRow
      label="Branch"
      value={reservation?.roomId?.branch || "N/A"}
      capitalize
    />
    <ReceiptRow
      label="Monthly Rate"
      value={`₱${(reservation?.roomId?.price || reservation?.totalPrice || 0).toLocaleString()}`}
      valueColor="#E7710F"
      valueWeight="700"
    />
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
      }}
    >
      <span style={{ color: "#6B7280" }}>Move-in Date</span>
      <span style={{ color: "#1F2937", fontWeight: "600" }}>
        {reservation?.finalMoveInDate
          ? new Date(reservation.finalMoveInDate).toLocaleDateString()
          : "TBD"}
      </span>
    </div>
  </>
);

// ─── Step Content Map ────────────────────────────────────────
const STEP_CONTENT = {
  room_selected: RoomReceipt,
  visit_scheduled: VisitReceipt,
  visit_completed: VisitCompletedReceipt,
  application_submitted: ApplicationReceipt,
  payment_submitted: PaymentReceiptContent,
  confirmed: ConfirmedReceipt,
};

// ─── Main Modal Component ────────────────────────────────────
const ReceiptModal = ({ isOpen, step, reservation, onClose }) => {
  if (!isOpen || !step) return null;

  const StepContent = STEP_CONTENT[step.step];

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
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "450px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#FFF7ED",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <span style={{ fontSize: "28px" }}>🧾</span>
          </div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "#1F2937",
              margin: "0 0 4px",
            }}
          >
            {step.title || "Receipt"}
          </h2>
          <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
            {reservation?.reservationCode && (
              <>
                Reservation Code: <strong>{reservation.reservationCode}</strong>
                <br />
              </>
            )}
            {reservation?.paymentReference && (
              <>
                Payment Reference:{" "}
                <strong>{reservation.paymentReference}</strong>
              </>
            )}
            {!reservation?.reservationCode &&
              !reservation?.paymentReference && <>No tracking codes yet</>}
          </p>
        </div>

        {/* Content */}
        <div
          style={{
            backgroundColor: "#F9FAFB",
            borderRadius: "12px",
            padding: "16px",
            border: "1px dashed #D1D5DB",
          }}
        >
          {StepContent && <StepContent reservation={reservation} />}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "0 0 16px" }}>
            Generated on{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              backgroundColor: "#E5E7EB",
              color: "#374151",
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
};

export default ReceiptModal;
