import { useState, useEffect } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";

function PaymentRequestsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const data = await reservationApi.getAll();

      // Filter reservations that have:
      // - proofOfPaymentUrl uploaded (payment submitted)
      // - paymentStatus is pending or partial (not yet verified)
      // OR show all payments for reference
      const paymentRequests = data.filter((res) => {
        const hasPaymentProof = Boolean(res.proofOfPaymentUrl);
        return hasPaymentProof;
      });

      // Transform for display
      const transformed = paymentRequests.map((res) => ({
        id: res._id,
        reservationCode: res.reservationCode || "N/A",
        customer:
          `${res.userId?.firstName || ""} ${res.userId?.lastName || ""}`.trim() ||
          "Unknown",
        email: res.userId?.email || res.billingEmail || "N/A",
        phone: res.mobileNumber || res.userId?.phone || "N/A",
        room: res.roomId?.name || res.roomId?.roomNumber || "Unknown",
        branch: res.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
        totalPrice: res.totalPrice || 0,
        paymentStatus: res.paymentStatus || "pending",
        proofOfPaymentUrl: res.proofOfPaymentUrl,
        status: res.status,
        submittedDate: res.updatedAt,
        checkInDate: res.checkInDate,
      }));

      setPayments(transformed);
    } catch (error) {
      console.error("Error fetching payment requests:", error);
      showNotification("Failed to load payment requests", "error", 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = (paymentId) => {
    setConfirmModal({
      open: true,
      title: "Verify Payment",
      message:
        "This will mark the payment as paid and confirm the reservation.",
      variant: "info",
      confirmText: "Verify Payment",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          setActionLoading(paymentId);
          await reservationApi.update(paymentId, {
            paymentStatus: "paid",
            status: "confirmed",
          });
          showNotification(
            "Payment verified! Reservation confirmed.",
            "success",
            3000,
          );
          fetchPayments();
        } catch (error) {
          console.error("Error verifying payment:", error);
          showNotification("Failed to verify payment", "error", 3000);
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRejectPayment = async (paymentId) => {
    const reason = window.prompt("Enter reason for rejection:");
    if (!reason) return;

    try {
      setActionLoading(paymentId);
      await reservationApi.update(paymentId, {
        paymentStatus: "pending",
        proofOfPaymentUrl: null,
        notes: `Payment rejected: ${reason}`,
      });
      showNotification(
        "Payment rejected. User will need to resubmit.",
        "warning",
        3000,
      );
      fetchPayments();
    } catch (error) {
      console.error("Error rejecting payment:", error);
      showNotification("Failed to reject payment", "error", 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewProof = (url) => {
    if (url) {
      window.open(url, "_blank");
    }
  };

  // Separate pending and verified payments
  const pendingPayments = payments.filter(
    (p) => p.paymentStatus === "pending" || p.paymentStatus === "partial",
  );
  const verifiedPayments = payments.filter((p) => p.paymentStatus === "paid");

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px" }}>
        <p style={{ color: "#6B7280" }}>Loading payment requests...</p>
      </div>
    );
  }

  return (
    <>
      <div>
        {/* Stats */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
          <div
            style={{
              flex: 1,
              padding: "20px",
              backgroundColor: "#FEF3C7",
              borderRadius: "12px",
              border: "1px solid #FDE68A",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "#92400E",
                marginBottom: "4px",
              }}
            >
              Pending Verification
            </p>
            <p
              style={{ fontSize: "28px", fontWeight: "700", color: "#B45309" }}
            >
              {pendingPayments.length}
            </p>
          </div>
          <div
            style={{
              flex: 1,
              padding: "20px",
              backgroundColor: "#D1FAE5",
              borderRadius: "12px",
              border: "1px solid #A7F3D0",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "#047857",
                marginBottom: "4px",
              }}
            >
              Verified Payments
            </p>
            <p
              style={{ fontSize: "28px", fontWeight: "700", color: "#059669" }}
            >
              {verifiedPayments.length}
            </p>
          </div>
          <div
            style={{
              flex: 1,
              padding: "20px",
              backgroundColor: "#E0EBF5",
              borderRadius: "12px",
              border: "1px solid #BFDBFE",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "#0C375F",
                marginBottom: "4px",
              }}
            >
              Total Revenue
            </p>
            <p
              style={{ fontSize: "28px", fontWeight: "700", color: "#0C375F" }}
            >
              ₱
              {verifiedPayments
                .reduce((sum, p) => sum + p.totalPrice, 0)
                .toLocaleString()}
            </p>
          </div>
        </div>

        {/* Pending Payments Section */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            marginBottom: "24px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              backgroundColor: "#FFFBEB",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#92400E",
                margin: 0,
              }}
            >
              💳 Pending Payment Verification ({pendingPayments.length})
            </h3>
            <p
              style={{ fontSize: "13px", color: "#B45309", margin: "4px 0 0" }}
            >
              Review payment proofs and verify to confirm reservations
            </p>
          </div>

          {pendingPayments.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <p style={{ color: "#6B7280" }}>
                No pending payment verifications
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#F9FAFB" }}>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Customer
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Room
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Amount
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Move-in Date
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Proof
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      style={{ borderBottom: "1px solid #E5E7EB" }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div>
                          <p
                            style={{
                              fontWeight: "500",
                              color: "#1F2937",
                              margin: 0,
                            }}
                          >
                            {payment.customer}
                          </p>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              margin: "2px 0 0",
                            }}
                          >
                            {payment.reservationCode}
                          </p>
                          <p
                            style={{
                              fontSize: "11px",
                              color: "#9CA3AF",
                              margin: "2px 0 0",
                            }}
                          >
                            {payment.email}
                          </p>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div>
                          <p
                            style={{
                              fontWeight: "500",
                              color: "#1F2937",
                              margin: 0,
                            }}
                          >
                            {payment.room}
                          </p>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              margin: "2px 0 0",
                            }}
                          >
                            {payment.branch}
                          </p>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <p
                          style={{
                            fontWeight: "600",
                            color: "#059669",
                            margin: 0,
                            fontSize: "15px",
                          }}
                        >
                          ₱{payment.totalPrice.toLocaleString()}
                        </p>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <p
                          style={{
                            fontSize: "13px",
                            color: "#1F2937",
                            margin: 0,
                          }}
                        >
                          {payment.checkInDate
                            ? new Date(payment.checkInDate).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : "N/A"}
                        </p>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {payment.proofOfPaymentUrl ? (
                          <button
                            onClick={() =>
                              handleViewProof(payment.proofOfPaymentUrl)
                            }
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#EFF6FF",
                              color: "#0C375F",
                              border: "1px solid #BFDBFE",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "500",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            📎 View Proof
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
                            No proof
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            justifyContent: "center",
                          }}
                        >
                          <button
                            onClick={() => handleVerifyPayment(payment.id)}
                            disabled={actionLoading === payment.id}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#10B981",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "500",
                              cursor:
                                actionLoading === payment.id
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: actionLoading === payment.id ? 0.6 : 1,
                            }}
                          >
                            ✓ Verify
                          </button>
                          <button
                            onClick={() => handleRejectPayment(payment.id)}
                            disabled={actionLoading === payment.id}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "white",
                              color: "#DC2626",
                              border: "1px solid #DC2626",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "500",
                              cursor:
                                actionLoading === payment.id
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: actionLoading === payment.id ? 0.6 : 1,
                            }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verified Payments Section */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              backgroundColor: "#F0FDF4",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#047857",
                margin: 0,
              }}
            >
              ✓ Verified Payments ({verifiedPayments.length})
            </h3>
            <p
              style={{ fontSize: "13px", color: "#059669", margin: "4px 0 0" }}
            >
              Successfully verified and confirmed reservations
            </p>
          </div>

          {verifiedPayments.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <p style={{ color: "#6B7280" }}>No verified payments yet</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#F9FAFB" }}>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Customer
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Room
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Amount
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedPayments.slice(0, 10).map((payment) => (
                    <tr
                      key={payment.id}
                      style={{ borderBottom: "1px solid #E5E7EB" }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div>
                          <p
                            style={{
                              fontWeight: "500",
                              color: "#1F2937",
                              margin: 0,
                            }}
                          >
                            {payment.customer}
                          </p>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              margin: "2px 0 0",
                            }}
                          >
                            {payment.reservationCode}
                          </p>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div>
                          <p
                            style={{
                              fontWeight: "500",
                              color: "#1F2937",
                              margin: 0,
                            }}
                          >
                            {payment.room}
                          </p>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              margin: "2px 0 0",
                            }}
                          >
                            {payment.branch}
                          </p>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <p
                          style={{
                            fontWeight: "600",
                            color: "#059669",
                            margin: 0,
                            fontSize: "15px",
                          }}
                        >
                          ₱{payment.totalPrice.toLocaleString()}
                        </p>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "500",
                            backgroundColor: "#D1FAE5",
                            color: "#059669",
                          }}
                        >
                          ✓ Paid & Confirmed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </>
  );
}

export default PaymentRequestsTab;
