import { useState } from "react";
import { X, Check, XCircle, Eye, Clock, AlertTriangle } from "lucide-react";
import { fmtCurrency, fmtDate, fmtMonth } from "../../utils/formatters";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function BillDetailModal({
 bill,
 payAmount,
 payNote,
 paying,
 onPayAmountChange,
 onPayNoteChange,
 onMarkPaid,
 onVerifyPayment,
 onClose,
}) {
 const [rejectionReason, setRejectionReason] = useState("");
 const [showRejectForm, setShowRejectForm] = useState(false);
 const [proofZoom, setProofZoom] = useState(false);
 useEscapeClose(true, onClose);

 const hasProof =
 bill.paymentProof?.verificationStatus === "pending-verification";
 const paymentFlow = bill.paymentFlow || null;
 const proofSectionTitle =
 paymentFlow?.legacyProofStatus ? "Legacy Offline Payment Proof" : "Payment Proof";
 const proofFlowNote =
 paymentFlow?.adminMessage ||
 "Manual settlement should only be used for branch-assisted offline payments.";

 return (
 <div className="modal-overlay" onClick={onClose}>
 <div
 className="modal-content modal-lg"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="modal-header">
 <h2>Bill Details</h2>
 <button className="modal-close" onClick={onClose}>
 <X size={18} />
 </button>
 </div>
 <div className="bill-detail">
 <div className="detail-row">
 <span className="detail-label">Tenant</span>
 <span className="detail-value">
 {bill.userId?.firstName} {bill.userId?.lastName}
 </span>
 </div>
 <div className="detail-row">
 <span className="detail-label">Email</span>
 <span className="detail-value">{bill.userId?.email}</span>
 </div>
 <div className="detail-row">
 <span className="detail-label">Billing Month</span>
 <span className="detail-value">{fmtMonth(bill.billingMonth)}</span>
 </div>
 <div className="detail-row">
 <span className="detail-label">Due Date</span>
 <span className="detail-value">{fmtDate(bill.dueDate)}</span>
 </div>
 {bill.billingCycleStart && bill.billingCycleEnd && (
 <div className="detail-row">
 <span className="detail-label">Billing Cycle</span>
 <span className="detail-value">
 {fmtDate(bill.billingCycleStart)} - {fmtDate(bill.billingCycleEnd)}
 </span>
 </div>
 )}
 <div className="detail-row">
 <span className="detail-label">Status</span>
 <span className={`badge status-${bill.status}`}>{bill.status}</span>
 </div>
 {bill.proRataDays && (
 <div className="detail-row">
 <span className="detail-label">Days in Room</span>
 <span className="detail-value">
 {bill.proRataDays} days (pro-rated)
 </span>
 </div>
 )}

 {/* Charges breakdown */}
 <div className="charges-breakdown">
 <h3>Charges Breakdown</h3>
 <div className="charge-row">
 <span>Monthly Rent</span>
 <span>{fmtCurrency(bill.charges?.rent)}</span>
 </div>
 {(bill.charges?.electricity || 0) > 0 && (
 <div className="charge-row">
 <span>Electricity</span>
 <span>{fmtCurrency(bill.charges.electricity)}</span>
 </div>
 )}
 {(bill.charges?.water || 0) > 0 && (
 <div className="charge-row">
 <span>Water (room reading)</span>
 <span>{fmtCurrency(bill.charges.water)}</span>
 </div>
 )}
 {/* Dynamic custom charges */}
 {(bill.additionalCharges || []).map((charge, idx) => (
 <div className="charge-row" key={idx}>
 <span>{charge.name}</span>
 <span>{fmtCurrency(charge.amount)}</span>
 </div>
 ))}
 {(bill.charges?.penalty || 0) > 0 && (
 <div className="charge-row penalty">
 <span>
 Penalty
 {bill.penaltyDetails?.daysLate
 ? ` (${bill.penaltyDetails.daysLate}d × ₱${bill.penaltyDetails.ratePerDay || 50})`
 : ""}
 </span>
 <span>+{fmtCurrency(bill.charges.penalty)}</span>
 </div>
 )}
 {(bill.charges?.discount || 0) > 0 && (
 <div className="charge-row discount">
 <span>Discount</span>
 <span>-{fmtCurrency(bill.charges.discount)}</span>
 </div>
 )}
 {(bill.grossAmount || 0) > 0 && bill.reservationCreditApplied > 0 && (
 <>
 <div className="charge-row total">
 <span>Gross Charges</span>
 <span>{fmtCurrency(bill.grossAmount)}</span>
 </div>
 <div className="charge-row discount">
 <span>Reservation Credit Applied</span>
 <span>-{fmtCurrency(bill.reservationCreditApplied)}</span>
 </div>
 </>
 )}
 <div className="charge-row total">
 <span>Total</span>
 <span>{fmtCurrency(bill.totalAmount)}</span>
 </div>
 {bill.paidAmount > 0 && (
 <div className="charge-row paid">
 <span>Amount Paid</span>
 <span>{fmtCurrency(bill.paidAmount)}</span>
 </div>
 )}
 {(bill.remainingAmount ?? 0) > 0 && (
 <div className="charge-row total">
 <span>Remaining Balance</span>
 <span>{fmtCurrency(bill.remainingAmount)}</span>
 </div>
 )}
 </div>

 {/* ─── Payment Proof Section ─── */}
 {bill.paymentProof &&
 bill.paymentProof.verificationStatus !== "none" && (
 <div
 className="payment-proof-section"
 style={{ marginTop: "1.5rem" }}
 >
 <h3
 style={{
 display: "flex",
 alignItems: "center",
 gap: "0.5rem",
 fontSize: "0.95rem",
 color: "#1a1a1a",
 }}
 >
 <Eye size={16} /> {proofSectionTitle}
 </h3>
 <div
 style={{
 background: "#FFF7ED",
 border: "1px solid #FED7AA",
 borderRadius: "8px",
 padding: "0.75rem",
 fontSize: "0.85rem",
 color: "#9A3412",
 marginBottom: "0.75rem",
 }}
 >
 {proofFlowNote}
 </div>

 {/* Proof image */}
 {bill.paymentProof.imageUrl && (
 <div
 style={{
 border: "1px solid #e2e8f0",
 borderRadius: "8px",
 padding: "0.5rem",
 marginBottom: "0.75rem",
 cursor: "pointer",
 textAlign: "center",
 }}
 onClick={() => setProofZoom(!proofZoom)}
 >
 <img
 src={bill.paymentProof.imageUrl}
 alt="Payment proof"
 style={{
 maxWidth: proofZoom ? "100%" : "200px",
 maxHeight: proofZoom ? "500px" : "150px",
 objectFit: "contain",
 borderRadius: "6px",
 transition: "all 0.3s",
 }}
 />
 <p
 style={{
 fontSize: "0.75rem",
 color: "#94a3b8",
 marginTop: "0.25rem",
 }}
 >
 Click to {proofZoom ? "minimize" : "enlarge"}
 </p>
 </div>
 )}

 <div className="detail-row">
 <span className="detail-label">Amount Submitted</span>
 <span className="detail-value">
 {fmtCurrency(bill.paymentProof.submittedAmount)}
 </span>
 </div>
 <div className="detail-row">
 <span className="detail-label">Submitted</span>
 <span className="detail-value">
 {bill.paymentProof.submittedAt
 ? fmtDate(bill.paymentProof.submittedAt)
 : "N/A"}
 </span>
 </div>
 <div className="detail-row">
 <span className="detail-label">Verification</span>
 <span
 className="detail-value"
 style={{
 color:
 bill.paymentProof.verificationStatus === "approved"
 ? "#16a34a"
 : bill.paymentProof.verificationStatus === "rejected"
 ? "#dc2626"
 : "#eab308",
 fontWeight: 600,
 }}
 >
 {bill.paymentProof.verificationStatus ===
 "pending-verification"
 ? "⏳ Pending"
 : bill.paymentProof.verificationStatus === "approved"
 ? "✅ Approved"
 : "❌ Rejected"}
 </span>
 </div>

 {bill.paymentProof.rejectionReason && (
 <div
 style={{
 background: "#fef2f2",
 border: "1px solid #fecaca",
 borderRadius: "8px",
 padding: "0.75rem",
 fontSize: "0.85rem",
 color: "#991b1b",
 marginTop: "0.5rem",
 }}
 >
 <strong>Rejection Reason:</strong>{" "}
 {bill.paymentProof.rejectionReason}
 </div>
 )}

 {/* Admin verification actions */}
 {hasProof && onVerifyPayment && (
 <div style={{ marginTop: "1rem" }}>
 {!showRejectForm ? (
 <div style={{ display: "flex", gap: "0.75rem" }}>
 <button
 className="btn btn-primary"
 style={{
 background: "#16a34a",
 flex: 1,
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 gap: "0.5rem",
 }}
 onClick={() =>
 onVerifyPayment(bill._id, { action: "approve" })
 }
 >
 <Check size={16} /> Approve Legacy Proof
 </button>
 <button
 className="btn"
 style={{
 background: "#dc2626",
 color: "#fff",
 flex: 1,
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 gap: "0.5rem",
 }}
 onClick={() => setShowRejectForm(true)}
 >
 <XCircle size={16} /> Reject
 </button>
 </div>
 ) : (
 <div>
 <div
 className="form-group"
 style={{ marginBottom: "0.75rem" }}
 >
 <label
 style={{
 fontSize: "0.85rem",
 fontWeight: 500,
 marginBottom: "0.25rem",
 display: "block",
 }}
 >
 Rejection Reason
 </label>
 <input
 type="text"
 value={rejectionReason}
 onChange={(e) => setRejectionReason(e.target.value)}
 placeholder="e.g., Blurry image, amount mismatch..."
 style={{
 width: "100%",
 padding: "0.5rem",
 border: "1px solid #e2e8f0",
 borderRadius: "6px",
 boxSizing: "border-box",
 }}
 />
 </div>
 <div style={{ display: "flex", gap: "0.5rem" }}>
 <button
 className="btn"
 style={{ background: "#dc2626", color: "#fff" }}
 onClick={() => {
 onVerifyPayment(bill._id, {
 action: "reject",
 rejectionReason:
 rejectionReason ||
 "Payment proof not acceptable",
 });
 }}
 >
 Confirm Rejection
 </button>
 <button
 className="btn"
 style={{ background: "#f1f5f9", color: "#64748b" }}
 onClick={() => setShowRejectForm(false)}
 >
 Cancel
 </button>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Mark as paid (manual — when no proof submitted) */}
 {bill.status !== "paid" &&
 (!bill.paymentProof ||
 bill.paymentProof.verificationStatus === "none") && (
 <div className="mark-paid-section">
 <h3>Record Assisted Offline Payment</h3>
 <p
 style={{
 margin: "0 0 0.75rem",
 fontSize: "0.85rem",
 lineHeight: 1.5,
 color: "#64748b",
 }}
 >
 {proofFlowNote}
 </p>
 <div className="form-group">
 <label>Amount</label>
 <input
 type="number"
 min="0"
 step="0.01"
 placeholder={bill.totalAmount}
 value={payAmount}
 onChange={(e) => onPayAmountChange(e.target.value)}
 />
 </div>
 <div className="form-group">
 <label>Note (optional)</label>
 <input
 type="text"
 placeholder="Cash, GCash, bank transfer..."
 value={payNote}
 onChange={(e) => onPayNoteChange(e.target.value)}
 />
 </div>
 <button
 className="btn btn-primary"
 onClick={onMarkPaid}
 disabled={paying}
 style={{ marginTop: "0.5rem" }}
 >
 {paying ? "Processing..." : "Confirm Payment"}
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
