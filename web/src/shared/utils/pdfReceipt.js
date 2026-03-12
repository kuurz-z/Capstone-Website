/**
 * ============================================================================
 * PDF RECEIPT GENERATOR
 * ============================================================================
 *
 * Generates professional PDF receipts for billing payments using jsPDF.
 * Used by BillingPage.jsx for the "Download" button on paid bills.
 *
 * ============================================================================
 */

import { jsPDF } from "jspdf";

/**
 * Format currency for PDF display
 */
const fmtCurrency = (amount) =>
  `₱${(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Format date for PDF display
 */
const fmtDate = (date) =>
  new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const fmtMonth = (date) =>
  new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });

/**
 * Generate and download a PDF receipt for a paid bill
 *
 * @param {Object} bill - The bill object from the API
 */
export function generateBillingReceipt(bill) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // ─── Colors ───
  const orange = [231, 113, 15]; // #E7710F
  const dark = [31, 41, 55]; // #1F2937
  const gray = [107, 114, 128]; // #6B7280
  const lightGray = [229, 231, 235]; // #E5E7EB

  // ─── Header ───
  doc.setFillColor(...orange);
  doc.rect(0, 0, pageWidth, 45, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("LILYCREST DORMITORY", pageWidth / 2, 18, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Payment Receipt", pageWidth / 2, 27, { align: "center" });

  doc.setFontSize(9);
  doc.text(
    `Generated: ${fmtDate(new Date())}`,
    pageWidth / 2,
    35,
    { align: "center" },
  );

  y = 55;

  // ─── Receipt Number Box ───
  doc.setDrawColor(...lightGray);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, contentWidth, 18, 3, 3, "FD");

  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.text("RECEIPT NO.", margin + 6, y + 7);

  const receiptNo = bill.paymongoPaymentId
    ? bill.paymongoPaymentId.slice(-12).toUpperCase()
    : bill.id?.slice(-8).toUpperCase() || "N/A";

  doc.setTextColor(...dark);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(receiptNo, margin + 6, y + 14);

  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Date Paid: ${fmtDate(bill.paymentDate || bill.updatedAt || new Date())}`,
    pageWidth - margin - 6,
    y + 11,
    { align: "right" },
  );

  y += 28;

  // ─── Bill Details ───
  doc.setTextColor(...dark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Bill Details", margin, y);
  y += 2;

  doc.setDrawColor(...orange);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 30, y);
  y += 6;

  const details = [
    ["Billing Period", fmtMonth(bill.billingMonth)],
    ["Room", bill.room || "N/A"],
    ["Branch", bill.branch ? bill.branch.charAt(0).toUpperCase() + bill.branch.slice(1) : "N/A"],
    [
      "Payment Method",
      (bill.paymentMethod || "online").charAt(0).toUpperCase() +
        (bill.paymentMethod || "online").slice(1),
    ],
  ];

  doc.setFontSize(10);
  for (const [label, value] of details) {
    doc.setTextColor(...gray);
    doc.setFont("helvetica", "normal");
    doc.text(label, margin + 4, y);

    doc.setTextColor(...dark);
    doc.setFont("helvetica", "normal");
    doc.text(value, pageWidth - margin - 4, y, { align: "right" });
    y += 7;
  }

  y += 6;

  // ─── Charges Breakdown ───
  doc.setTextColor(...dark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Charges Breakdown", margin, y);
  y += 2;

  doc.setDrawColor(...orange);
  doc.line(margin, y, margin + 42, y);
  y += 6;

  const charges = bill.charges || {};
  const chargeLines = [];

  if (charges.rent) chargeLines.push(["Monthly Rent", charges.rent]);
  if (charges.electricity > 0) chargeLines.push(["Electricity", charges.electricity]);
  if (charges.water > 0) chargeLines.push(["Water", charges.water]);
  if (charges.applianceFees > 0) chargeLines.push(["Appliance Fees", charges.applianceFees]);
  if (charges.corkageFees > 0) chargeLines.push(["Corkage Fees", charges.corkageFees]);
  if (charges.penalty > 0) chargeLines.push(["Late Penalty", charges.penalty]);
  if (charges.discount > 0) chargeLines.push(["Discount", -charges.discount]);

  doc.setFontSize(10);
  for (const [label, amount] of chargeLines) {
    doc.setTextColor(...gray);
    doc.setFont("helvetica", "normal");
    doc.text(`  ${label}`, margin + 4, y);

    const isNegative = amount < 0;
    doc.setTextColor(isNegative ? [22, 163, 74] : dark); // green for discounts
    doc.text(
      `${isNegative ? "-" : ""}${fmtCurrency(Math.abs(amount))}`,
      pageWidth - margin - 4,
      y,
      { align: "right" },
    );
    y += 7;
  }

  // Pro-rata info
  if (bill.proRataDays) {
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    y += 2;
    doc.text(
      `* Utilities pro-rated for ${bill.proRataDays} days of occupancy`,
      margin + 4,
      y,
    );
    y += 6;
  }

  y += 4;

  // ─── Total ───
  doc.setDrawColor(...dark);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setTextColor(...dark);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL PAID", margin + 4, y);
  doc.text(fmtCurrency(bill.paidAmount || bill.totalAmount), pageWidth - margin - 4, y, {
    align: "right",
  });

  y += 4;
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);

  y += 12;

  // ─── Status Badge ───
  doc.setFillColor(22, 163, 74); // green
  doc.roundedRect(pageWidth / 2 - 20, y - 2, 40, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PAID ✓", pageWidth / 2, y + 5, { align: "center" });

  y += 18;

  // ─── Footer ───
  doc.setTextColor(...gray);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Thank you for your prompt payment!",
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 5;
  doc.text(
    "Lilycrest Dormitory Management System",
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 4;
  doc.text(
    "This is a computer-generated receipt and does not require a signature.",
    pageWidth / 2,
    y,
    { align: "center" },
  );

  // ─── Save ───
  const filename = `Lilycrest-Receipt-${fmtMonth(bill.billingMonth).replace(/\s/g, "-")}.pdf`;
  doc.save(filename);
}
