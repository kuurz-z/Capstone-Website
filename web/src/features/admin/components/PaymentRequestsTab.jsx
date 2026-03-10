import { useState, useEffect } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import PaymentTable from "./PaymentTable";

function PaymentRequestsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const transformed = data
        .filter((r) => Boolean(r.proofOfPaymentUrl))
        .map((res) => ({
          id: res._id,
          reservationCode: res.reservationCode || "N/A",
          customer:
            `${res.userId?.firstName || ""} ${res.userId?.lastName || ""}`.trim() ||
            "Unknown",
          email: res.userId?.email || res.billingEmail || "N/A",
          phone: res.mobileNumber || res.userId?.phone || "N/A",
          room: res.roomId?.name || res.roomId?.roomNumber || "Unknown",
          branch:
            res.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
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
        setConfirmModal((p) => ({ ...p, open: false }));
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
    if (url) window.open(url, "_blank");
  };

  const pendingPayments = payments.filter(
    (p) => p.paymentStatus === "pending" || p.paymentStatus === "partial",
  );
  const verifiedPayments = payments.filter((p) => p.paymentStatus === "paid");

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: "60px" }}>
        <p style={{ color: "#6B7280" }}>Loading payment requests...</p>
      </div>
    );

  return (
    <>
      <div>
        {/* Stats */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
          {[
            {
              label: "Pending Verification",
              value: pendingPayments.length,
              bg: "#FEF3C7",
              border: "#FDE68A",
              labelColor: "#92400E",
              valueColor: "#B45309",
            },
            {
              label: "Verified Payments",
              value: verifiedPayments.length,
              bg: "#D1FAE5",
              border: "#A7F3D0",
              labelColor: "#047857",
              valueColor: "#059669",
            },
            {
              label: "Total Revenue",
              value: `₱${verifiedPayments.reduce((s, p) => s + p.totalPrice, 0).toLocaleString()}`,
              bg: "#E0EBF5",
              border: "#BFDBFE",
              labelColor: "#0C375F",
              valueColor: "#0C375F",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                padding: "20px",
                backgroundColor: stat.bg,
                borderRadius: "12px",
                border: `1px solid ${stat.border}`,
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: stat.labelColor,
                  marginBottom: "4px",
                }}
              >
                {stat.label}
              </p>
              <p
                style={{
                  fontSize: "28px",
                  fontWeight: "700",
                  color: stat.valueColor,
                }}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <PaymentTable
          title={`💳 Pending Payment Verification (${pendingPayments.length})`}
          subtitle="Review payment proofs and verify to confirm reservations"
          headerBg="#FFFBEB"
          headerColor="#92400E"
          subColor="#B45309"
          emptyText="No pending payment verifications"
          payments={pendingPayments}
          showActions
          actionLoading={actionLoading}
          onVerify={handleVerifyPayment}
          onReject={handleRejectPayment}
          onViewProof={handleViewProof}
        />

        <PaymentTable
          title={`✓ Verified Payments (${verifiedPayments.length})`}
          subtitle="Successfully verified and confirmed reservations"
          headerBg="#F0FDF4"
          headerColor="#047857"
          subColor="#059669"
          emptyText="No verified payments yet"
          payments={verifiedPayments}
        />
      </div>

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

export default PaymentRequestsTab;
