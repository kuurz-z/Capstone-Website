import { X } from "lucide-react";
import { fmtCurrency, fmtDate, fmtMonth } from "../../utils/formatters";

export default function BillDetailModal({
  bill,
  payAmount,
  payNote,
  paying,
  onPayAmountChange,
  onPayNoteChange,
  onMarkPaid,
  onClose,
}) {
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
                <span>Water</span>
                <span>{fmtCurrency(bill.charges.water)}</span>
              </div>
            )}
            {(bill.charges?.applianceFees || 0) > 0 && (
              <div className="charge-row">
                <span>Appliance Fees</span>
                <span>{fmtCurrency(bill.charges.applianceFees)}</span>
              </div>
            )}
            {(bill.charges?.corkageFees || 0) > 0 && (
              <div className="charge-row">
                <span>Corkage Fees</span>
                <span>{fmtCurrency(bill.charges.corkageFees)}</span>
              </div>
            )}
            {(bill.charges?.penalty || 0) > 0 && (
              <div className="charge-row penalty">
                <span>Penalty</span>
                <span>+{fmtCurrency(bill.charges.penalty)}</span>
              </div>
            )}
            {(bill.charges?.discount || 0) > 0 && (
              <div className="charge-row discount">
                <span>Discount</span>
                <span>-{fmtCurrency(bill.charges.discount)}</span>
              </div>
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
          </div>

          {/* Mark as paid */}
          {bill.status !== "paid" && (
            <div className="mark-paid-section">
              <h3>Mark as Paid</h3>
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
