/**
 * ============================================================================
 * PDF GENERATION UTILITY
 * ============================================================================
 *
 * Client-side PDF generation using jsPDF.
 * Generates contract/lease documents and billing statements.
 *
 * Usage:
 *   import { generateContractPDF, generateBillingPDF } from "shared/utils/pdfUtils";
 *   generateContractPDF(reservationData);
 *   generateBillingPDF(billData);
 *
 * ============================================================================
 */

import { jsPDF } from "jspdf";

// ─── Helpers ──────────────────────────────────────────────────

const BRAND_COLOR = [12, 55, 95]; // #183153
const ACCENT_COLOR = [231, 113, 15]; // #D4982B
const GRAY = [107, 114, 128];

function addHeader(doc, title) {
  // Brand bar
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, 210, 32, "F");

  // Logo text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("LILYCREST", 14, 15);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("DORMITORY MANAGEMENT", 14, 22);

  // Title
  doc.setFontSize(12);
  doc.text(title, 196, 18, { align: "right" });

  // Date
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, 196, 26, { align: "right" });

  return 42; // Starting Y position after header
}

function addFooter(doc, pageNum) {
  const y = 282;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Lilycrest Dormitory • This is a system-generated document", 14, y + 6);
  doc.text(`Page ${pageNum}`, 196, y + 6, { align: "right" });
}

function addSectionTitle(doc, y, title) {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT_COLOR);
  doc.text(title, 14, y);
  doc.setDrawColor(...ACCENT_COLOR);
  doc.line(14, y + 2, 196, y + 2);
  return y + 10;
}

function addField(doc, y, label, value) {
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text(label, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(31, 41, 55);
  doc.text(String(value || "—"), 70, y);
  return y + 7;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

// ============================================================================
// CONTRACT / LEASE PDF
// ============================================================================

/**
 * Generate a lease/contract PDF from reservation data.
 * @param {Object} reservation - Full reservation object with populated roomId/userId
 */
export function generateContractPDF(reservation) {
  const doc = new jsPDF();
  let y = addHeader(doc, "LEASE AGREEMENT");

  // Tenant Details
  y = addSectionTitle(doc, y, "Tenant Information");
  const tenant = reservation.userId || {};
  y = addField(doc, y, "Name:", `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "—");
  y = addField(doc, y, "Email:", tenant.email || "—");
  y = addField(doc, y, "Reservation Code:", reservation.reservationCode || "—");
  y += 4;

  // Room Details
  y = addSectionTitle(doc, y, "Room Details");
  const room = reservation.roomId || {};
  y = addField(doc, y, "Room:", room.name || "—");
  y = addField(doc, y, "Branch:", room.branch || "—");
  y = addField(doc, y, "Room Type:", room.type || "—");
  y = addField(doc, y, "Bed Assignment:", reservation.selectedBed?.position || "—");
  y += 4;

  // Lease Terms
  y = addSectionTitle(doc, y, "Lease Terms");
  y = addField(doc, y, "Check-In Date:", formatDate(reservation.checkInDate));
  y = addField(doc, y, "Lease Duration:", `${reservation.leaseDuration || 12} months`);

  const endDate = reservation.checkInDate
    ? new Date(new Date(reservation.checkInDate).setMonth(new Date(reservation.checkInDate).getMonth() + (reservation.leaseDuration || 12)))
    : null;
  y = addField(doc, y, "Contract End:", formatDate(endDate));
  y = addField(doc, y, "Monthly Rent:", formatCurrency(reservation.totalPrice));
  y += 4;

  // Terms & Conditions
  y = addSectionTitle(doc, y, "Terms & Conditions");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(75, 85, 99);
  const terms = [
    "1. Tenant agrees to pay rent on or before the 5th day of each month.",
    "2. A late payment penalty of ₱50/day will be applied after the due date.",
    "3. Tenant must maintain cleanliness and follow house rules.",
    "4. Subletting or unauthorized occupants are strictly prohibited.",
    "5. A 30-day written notice is required for early termination.",
    "6. Security deposit is refundable upon move-out inspection.",
    "7. Management reserves the right to enter for maintenance with notice.",
    "8. Violation of terms may result in contract termination.",
  ];
  for (const term of terms) {
    doc.text(term, 14, y);
    y += 5;
  }

  y += 10;

  // Signature lines
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(31, 41, 55);
  doc.text("_________________________________", 14, y);
  doc.text("_________________________________", 110, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Tenant Signature / Date", 14, y);
  doc.text("Property Manager / Date", 110, y);

  addFooter(doc, 1);

  const filename = `Lilycrest_Lease_${reservation.reservationCode || "Contract"}.pdf`;
  doc.save(filename);
}

// ============================================================================
// BILLING STATEMENT PDF
// ============================================================================

/**
 * Generate a billing statement PDF from bill data.
 * @param {Object} bill - Full bill object with populated userId/roomId
 */
export function generateBillingPDF(bill) {
  const doc = new jsPDF();
  let y = addHeader(doc, "BILLING STATEMENT");

  // Tenant Details
  y = addSectionTitle(doc, y, "Tenant Information");
  const tenant = bill.userId || {};
  y = addField(doc, y, "Name:", `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || "—");
  y = addField(doc, y, "Email:", tenant.email || "—");
  y = addField(doc, y, "Room:", bill.roomId?.name || "—");
  y += 4;

  // Billing Period
  y = addSectionTitle(doc, y, "Billing Period");
  y = addField(doc, y, "Month:", bill.billingMonth ? new Date(bill.billingMonth).toLocaleDateString("en-PH", { year: "numeric", month: "long" }) : "—");
  y = addField(doc, y, "Due Date:", formatDate(bill.dueDate));
  y = addField(doc, y, "Status:", (bill.status || "pending").toUpperCase());
  y += 4;

  // Charges Breakdown
  y = addSectionTitle(doc, y, "Charges Breakdown");
  const charges = bill.charges || {};

  // Table header
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y - 4, 182, 8, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(75, 85, 99);
  doc.text("Item", 16, y);
  doc.text("Amount", 180, y, { align: "right" });
  y += 8;

  // Charge rows
  const chargeItems = [
    { label: "Monthly Rent", amount: charges.rent },
    { label: "Electricity", amount: charges.electricity },
    { label: "Water", amount: charges.water },
    { label: "Appliance Fees", amount: charges.applianceFees },
    { label: "Corkage Fees", amount: charges.corkageFees },
  ];

  // Add additional charges
  if (bill.additionalCharges?.length) {
    for (const ac of bill.additionalCharges) {
      chargeItems.push({ label: ac.label || "Additional", amount: ac.amount });
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(31, 41, 55);
  for (const item of chargeItems) {
    if (item.amount && item.amount > 0) {
      doc.text(item.label, 16, y);
      doc.text(formatCurrency(item.amount), 180, y, { align: "right" });
      y += 6;
    }
  }

  // Penalty
  if (charges.penalty > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text(`Late Payment Penalty (${bill.penaltyDetails?.daysLate || 0} days)`, 16, y);
    doc.text(formatCurrency(charges.penalty), 180, y, { align: "right" });
    y += 6;
  }

  // Discount
  if (charges.discount > 0) {
    doc.setTextColor(22, 163, 74);
    doc.text("Discount", 16, y);
    doc.text(`-${formatCurrency(charges.discount)}`, 180, y, { align: "right" });
    y += 6;
  }

  // Total line
  y += 2;
  doc.setDrawColor(...BRAND_COLOR);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text("TOTAL", 16, y);
  doc.text(formatCurrency(bill.totalAmount), 180, y, { align: "right" });
  y += 8;

  // Payment info
  if (bill.paidAmount > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(22, 163, 74);
    doc.text(`Paid: ${formatCurrency(bill.paidAmount)}`, 16, y);
    const balance = (bill.totalAmount || 0) - (bill.paidAmount || 0);
    if (balance > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`Balance: ${formatCurrency(balance)}`, 100, y);
    }
  }

  addFooter(doc, 1);

  const month = bill.billingMonth ? new Date(bill.billingMonth).toISOString().slice(0, 7) : "Statement";
  const filename = `Lilycrest_Bill_${month}.pdf`;
  doc.save(filename);
}
