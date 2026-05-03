import { Eye, FileText } from "lucide-react";
import { fmtCurrency, fmtDate, fmtMonth } from "../../utils/formatters";

export default function BillsTable({ bills, loading, onViewBill }) {
  if (loading) {
    return (
      <div className="table-container">
        <div className="empty-state">Loading bills...</div>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="table-container">
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={32} />
          </div>
          <p>No bills found</p>
          <p className="empty-state-hint">
            Click a room above to generate bills
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Month</th>
            <th>Cycle</th>
            <th>Rent</th>
            <th>Utilities</th>
            <th>Credit</th>
            <th>Total</th>
            <th>Status</th>
            <th>Due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => {
            const utilities =
              (bill.charges?.electricity || 0) +
              (bill.charges?.water || 0) +
              (bill.charges?.applianceFees || 0) +
              (bill.charges?.corkageFees || 0);
            return (
              <tr key={bill._id}>
                <td>
                  <div className="tenant-cell">
                    <span className="tenant-name">
                      {bill.userId?.firstName} {bill.userId?.lastName}
                    </span>
                    <span className="tenant-email">{bill.userId?.email}</span>
                  </div>
                </td>
                <td>{fmtMonth(bill.billingMonth)}</td>
                <td>
                  {bill.billingCycleStart && bill.billingCycleEnd
                    ? `${fmtDate(bill.billingCycleStart)} - ${fmtDate(bill.billingCycleEnd)}`
                    : "—"}
                </td>
                <td className="amount-cell">
                  {fmtCurrency(bill.charges?.rent)}
                </td>
                <td className="amount-cell">{fmtCurrency(utilities)}</td>
                <td className="amount-cell">
                  {bill.reservationCreditApplied
                    ? `-${fmtCurrency(bill.reservationCreditApplied)}`
                    : "—"}
                </td>
                <td className="amount-cell">{fmtCurrency(bill.totalAmount)}</td>
                <td>
                  <span className={`badge status-${bill.status}`}>
                    {bill.status}
                  </span>
                </td>
                <td>{fmtDate(bill.dueDate)}</td>
                <td>
                  <button
                    className="action-btn"
                    title="View details"
                    onClick={() => onViewBill(bill)}
                  >
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
