import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, XCircle, Eye, Clock, AlertTriangle } from "lucide-react";
import { fmtCurrency, fmtDate, fmtMonth } from "../../utils/formatters";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";
import DeadlineBadge from "../../../../shared/components/DeadlineBadge";

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

 if (!bill || typeof document === "undefined") return null;

 return createPortal(
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
        <div className="detail-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <span className="detail-label">Deadline & Due Date</span>
          {bill.dueDate && (
            <DeadlineBadge
              dueDate={bill.dueDate}
              status={bill.status}
              type="bill"
              showConsequenceNote={true}
              penaltyRate={bill.penaltyDetails?.ratePerDay || 50}
            />
          )}
        </div>
        <div className="detail-row">
          <span className="detail-label">Status</span>
          <span className={`badge status-${bill.status}`}>{bill.status}</span>
        </div>
 {bill.billingCycleStart && bill.billingCycleEnd && (
 <div className="detail-row">
 <span className="detail-label">Billing Cycle</span>
 <span className="detail-value">
 {fmtDate(bill.billingCycleStart)} - {fmtDate(bill.billingCycleEnd)}
 </span>
 </div>
 )}
 {bill.proRataDays && (
 <div className="detail-row">
 <span className="detail-label">Days in Room</span>
 <span className="detail-value">
 {bill.proRataDays} days (pro-rated)
 </span>
 </div>
 )}

  {bill.waterAllocations?.length > 0 && <div className="overflow-x-auto my-4"><table className="w-full text-xs text-foreground">
    <caption className="text-left font-semibold py-2">Water allocations</caption>
    <thead><tr>{['Cycle','Calculation','Consumption (m\u00b3)','Rate (PHP/m\u00b3)','Amount','Dispatch'].map(label=><th key={label} scope="col" className="text-left p-2 border-b border-border">{label}</th>)}</tr></thead>
    <tbody>{bill.waterAllocations.map(a=><tr key={a.allocationId}>
      <td className="p-2">{fmtDate(a.cycleStart)} - {fmtDate(a.cycleEnd)}</td>
      <td className="p-2">{a.calculationVersion === 'water-meter-v1' ? 'Measured water' : 'Historical allocation'}</td>
      <td className="p-2">{a.calculationVersion === 'water-meter-v1' ? a.usage : 'Unknown'}</td>
      <td className="p-2">{a.calculationVersion === 'water-meter-v1' ? fmtCurrency(a.pricingSnapshot?.ratePerUnit) : 'Unknown'}</td>
      <td className="p-2">{fmtCurrency(a.amount)}</td><td className="p-2">{a.state}</td>
    </tr>)}</tbody>
  </table></div>}
  {/* Charges breakdown */}
  {(() => {
    const rentAmt = Number(bill.charges?.rent || 0);
    const elecAmt = Number(bill.charges?.electricity || 0);
    const waterAmt = Number(bill.charges?.water || 0);
    const applianceAmt = Number(bill.charges?.applianceFees || 0);
    const corkageAmt = Number(bill.charges?.corkageFees || 0);
    const customChargesList = bill.additionalCharges || [];
    const customChargesAmt = customChargesList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const baseSubtotal = rentAmt + elecAmt + waterAmt + applianceAmt + corkageAmt + customChargesAmt;

    const daysLate = Number(bill.penaltyDetails?.daysLate || (bill.dueDate && new Date(bill.dueDate) < new Date() && !bill.paidAt ? Math.floor((new Date().setHours(0,0,0,0) - new Date(bill.dueDate).setHours(0,0,0,0))/86400000) : 0));
    const penaltyRate = Number(bill.penaltyDetails?.ratePerDay || 50);
    const persistedPenalty = Number(bill.charges?.penalty || 0);
    const livePenalty = persistedPenalty > 0 ? persistedPenalty : (daysLate > 0 && bill.status !== 'paid' ? daysLate * penaltyRate : 0);
    const discountAmt = Number(bill.charges?.discount || 0);
    const creditApplied = Number(bill.reservationCreditApplied || 0);
    const computedTotal = Math.max(0, baseSubtotal + livePenalty - discountAmt - creditApplied);
    const totalAmount = bill.totalAmount && persistedPenalty > 0 ? Number(bill.totalAmount) : computedTotal;
    const paidAmt = Number(bill.paidAmount || (bill.status === 'paid' ? totalAmount : 0));
    const remainingBal = Math.max(0, totalAmount - paidAmt);

    return (
      <div className="charges-breakdown">
        <h3>Charges Breakdown</h3>
        {rentAmt > 0 && (
          <div className="charge-row">
            <span>Monthly Rent</span>
            <span>{fmtCurrency(rentAmt)}</span>
          </div>
        )}
        {elecAmt > 0 && (
          <div className="charge-row">
            <span>Electricity</span>
            <span>{fmtCurrency(elecAmt)}</span>
          </div>
        )}
        {waterAmt > 0 && (
          <div className="charge-row">
            <span>Water</span>
            <span>{fmtCurrency(waterAmt)}</span>
          </div>
        )}
        {applianceAmt > 0 && (
          <div className="charge-row">
            <span>Appliance Fees</span>
            <span>{fmtCurrency(applianceAmt)}</span>
          </div>
        )}
        {corkageAmt > 0 && (
          <div className="charge-row">
            <span>Corkage Fees</span>
            <span>{fmtCurrency(corkageAmt)}</span>
          </div>
        )}
        {/* Dynamic custom charges */}
        {customChargesList.map((charge, idx) => (
          <div className="charge-row" key={idx}>
            <span>{charge.name}</span>
            <span>{fmtCurrency(charge.amount)}</span>
          </div>
        ))}

        {/* Subtotal row */}
        <div className="charge-row" style={{ fontWeight: "600", borderTop: "1px solid var(--border)", paddingTop: "6px" }}>
          <span>Subtotal (Base Charges)</span>
          <span>{fmtCurrency(baseSubtotal)}</span>
        </div>

        {livePenalty > 0 && (
          <div className="charge-row penalty">
            <span>
              Late Payment Penalty
              {daysLate > 0 ? ` (${daysLate}d × ₱${penaltyRate.toFixed(2)})` : ""}
            </span>
            <span>+{fmtCurrency(livePenalty)}</span>
          </div>
        )}
        {discountAmt > 0 && (
          <div className="charge-row discount">
            <span>Discount</span>
            <span>-{fmtCurrency(discountAmt)}</span>
          </div>
        )}
        {creditApplied > 0 && (
          <div className="charge-row discount">
            <span>Reservation Credit Applied</span>
            <span>-{fmtCurrency(creditApplied)}</span>
          </div>
        )}
        <div className="charge-row total">
          <span>Total Amount Due</span>
          <span>{fmtCurrency(totalAmount)}</span>
        </div>
        {paidAmt > 0 && (
          <div className="charge-row paid">
            <span>Amount Paid</span>
            <span>{fmtCurrency(paidAmt)}</span>
          </div>
        )}
        {remainingBal > 0 && (
          <div className="charge-row total">
            <span>Remaining Balance</span>
            <span>{fmtCurrency(remainingBal)}</span>
          </div>
        )}
      </div>
    );
  })()}
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
 !bill.structuredWorkflowVersion &&
 (!bill.paymentProof ||
 bill.paymentProof.verificationStatus === "none") && (
 <div className="mark-paid-section">
 <h3>Record Legacy Assisted Payment</h3>
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
 placeholder="Legacy reference or bank transfer note..."
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
 </div>,
 document.body
 );
}
