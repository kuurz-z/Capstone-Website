import React from "react";
import { Link } from "react-router-dom";
import { ReceiptText, ArrowRight, Zap, Droplet } from "lucide-react";

/**
 * Solid Snapshot Card: Displays resident's active or latest billing breakdown
 * including pro-rata rent, submetered electricity, water consumption (when billed),
 * appliance surcharges, penalties, and net amount.
 *
 * Strictly follows Lilycrest zero-gradient, solid HSL aesthetic.
 */
export default function TenantBillingBreakdownCard({ data, onCloseDrawer }) {
  const hasValidBillData = Boolean(
    data &&
    !Array.isArray(data) &&
    (data.billId || data._id || data.billing_id || data.billingPeriod || data.billingMonth || (data.totalAmount !== undefined && Number(data.totalAmount) > 0) || (data.rentAmount !== undefined && Number(data.rentAmount) > 0))
  );

  if (!data || !hasValidBillData) return null;

  const rent = Number(data.rentAmount || data.rent || 0);
  const electricity = Number(data.electricityAmount || data.electricity || 0);
  const water = Number(data.waterAmount || data.water || 0);
  const appliances = Number(data.applianceFees || data.applianceAmount || 0);
  const penalties = Number(data.penalties || data.penaltyAmount || 0);
  const discount = Number(data.discount || data.discountAmount || 0);
  const total = Number(data.totalAmount || data.total || rent + electricity + water + appliances + penalties - discount);
  const remaining = data.remainingAmount !== undefined ? Number(data.remainingAmount) : total;

  const status = (data.status || "pending").toLowerCase();
  const isPaid = status === "paid" || remaining <= 0;

  const formattedMonth = data.billingMonth || data.month
    ? new Date(data.billingMonth || data.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "Current Statement";

  const isPenaltyBill = data?.billType === "penalty" || (penalties > 0 && rent === 0 && electricity === 0);
  const formattedTitle = isPenaltyBill
    ? `${formattedMonth} Penalty Fee Statement`
    : formattedMonth;

  const formattedDueDate = data.dueDate
    ? (data.dueDate.includes("T") || !isNaN(Date.parse(data.dueDate))
        ? new Date(data.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : data.dueDate)
    : "Monthly lease cycle";

  const formatCurrency = (val) =>
    `₱${Number(val || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="tenant-snapshot-card" role="region" aria-label="Billing Statement Breakdown">
      <div className="tenant-snapshot-header">
        <div className="tenant-snapshot-title">
          <ReceiptText className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{formattedTitle}</span>
        </div>
        <span className={`tenant-snapshot-badge ${status}`} aria-label={`Status: ${status}`}>
          {status}
        </span>
      </div>

      <div className="tenant-snapshot-grid">
        <div className="tenant-snapshot-cell">
          <span className="tenant-snapshot-cell-label">Base Monthly Rent</span>
          <span className="tenant-snapshot-cell-val">
            {formatCurrency(rent)}
            {data.proRataDays ? ` (${data.proRataDays} days pro-rata)` : ""}
          </span>
        </div>

        <div className="tenant-snapshot-cell">
          <span className="tenant-snapshot-cell-label flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" aria-hidden="true" />
            <span>Electricity Share</span>
          </span>
          <span className="tenant-snapshot-cell-val">{formatCurrency(electricity)}</span>
        </div>

        {water > 0 && (
          <div className="tenant-snapshot-cell">
            <span className="tenant-snapshot-cell-label flex items-center gap-1">
              <Droplet className="w-3 h-3 text-blue-500" aria-hidden="true" />
              <span>Water Consumption</span>
            </span>
            <span className="tenant-snapshot-cell-val">{formatCurrency(water)}</span>
          </div>
        )}

        {appliances > 0 && (
          <div className="tenant-snapshot-cell">
            <span className="tenant-snapshot-cell-label">Appliance Fees</span>
            <span className="tenant-snapshot-cell-val">{formatCurrency(appliances)}</span>
          </div>
        )}

        {penalties > 0 && (
          <div className="tenant-snapshot-cell">
            <span className="tenant-snapshot-cell-label text-rose-600 dark:text-rose-400">Late Penalties</span>
            <span className="tenant-snapshot-cell-val text-rose-600 dark:text-rose-400">+{formatCurrency(penalties)}</span>
          </div>
        )}

        {discount > 0 && (
          <div className="tenant-snapshot-cell">
            <span className="tenant-snapshot-cell-label text-emerald-600 dark:text-emerald-400">Discount</span>
            <span className="tenant-snapshot-cell-val text-emerald-600 dark:text-emerald-400">-{formatCurrency(discount)}</span>
          </div>
        )}

        <div className="tenant-snapshot-cell col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="tenant-snapshot-cell-label">
                {isPaid ? "Total Balance" : "Total Amount Due"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {isPaid ? "Statement Settled" : `Due ${formattedDueDate}`}
              </span>
            </div>
            <span className="tenant-snapshot-cell-val highlight">{formatCurrency(remaining)}</span>
          </div>
        </div>
      </div>

      <Link
        to="/applicant/billing"
        onClick={() => onCloseDrawer?.()}
        className="tenant-snapshot-action-btn"
        aria-label="View full billing statement on billing page"
      >
        <span>View Full Statement & Pay</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
