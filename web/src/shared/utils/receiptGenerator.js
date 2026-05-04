import jsPDF from "jspdf";

/**
 * Safe number formatter — avoids toLocaleString locale issues in jsPDF context.
 * Returns e.g. "2,000.00"
 */
const fmtAmt = (n) => {
  const fixed = Number(n || 0).toFixed(2);
  const [int, dec] = fixed.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + dec;
};

/**
 * Builds the PDF receipt, faithfully matching the server-side email template
 * (generatePaymentReceiptHtml in server/config/email.js).
 *
 * Color references from the email:
 *   Header/Footer bg : #183153  → [24, 49, 83]
 *   Gold label       : #D4982B  → [212, 152, 43]
 *   Dark text        : #111827  → [17, 24, 39]
 *   Body text        : #374151  → [55, 65, 81]
 *   Muted / labels   : #9CA3AF  → [156, 163, 175]
 *   Sub-muted        : #6B7280  → [107, 114, 128]
 *   Divider line     : #E5E7EB  → [229, 231, 235]
 *
 * NOTE: jsPDF's built-in Helvetica font does NOT support U+20B1 (₱).
 * Use "PHP" as the currency prefix in all doc.text() calls.
 */
function buildReceiptDoc(reservation, profile) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const margin     = 20;
  const W          = pageWidth - margin * 2;   // usable content width
  let y            = 0;

  // ── palette ────────────────────────────────────────────────────────────────
  const navy     = [24, 49, 83];      // #183153 — header / footer bg
  const gold     = [212, 152, 43];    // #D4982B — "Your receipt from" + footer brand
  const darkText = [17, 24, 39];      // #111827 — amount value
  const bodyText = [55, 65, 81];      // #374151 — greeting, values
  const muted    = [156, 163, 175];   // #9CA3AF — section labels
  const subMuted = [107, 114, 128];   // #6B7280 — subtitle, reference value
  const divider  = [229, 231, 235];   // #E5E7EB — horizontal rule
  const white    = [255, 255, 255];

  // ── helpers ─────────────────────────────────────────────────────────────────
  const fill = (x, yy, w, h, color) => {
    doc.setFillColor(...color);
    doc.rect(x, yy, w, h, "F");
  };
  const hRule = (yy, colorArr = divider) => {
    doc.setDrawColor(...colorArr);
    doc.setLineWidth(0.25);
    doc.line(margin, yy, pageWidth - margin, yy);
  };
  const fmt = (d) => {
    if (!d) return "\u2014";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric",
    });
  };
  const set = (font, style, size, color) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const room     = reservation.roomId || {};
  const fullName = profile
    ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
    : "\u2014";

  const roomName = room.name || "Room";
  const branch   =
    room.branch === "gil-puyat"   ? "Gil Puyat"
    : room.branch === "guadalupe" ? "Guadalupe"
    : room.branch || "Lilycrest";

  // ==========================================================================
  // HEADER  — dark navy, "Your receipt from" + "LILYCREST DORMITORY"
  // ==========================================================================
  const headerH = 36;
  fill(0, 0, pageWidth, headerH, navy);

  // "Your receipt from"  →  gold, 10pt, normal
  set("helvetica", "normal", 10, gold);
  doc.text("Your receipt from", margin, 14);

  // "LILYCREST DORMITORY"  →  white, 24pt, bold, letter-spacing via charSpace
  set("helvetica", "bold", 20, white);
  doc.text("LILYCREST DORMITORY", margin, 27);

  y = headerH + 14;

  // ==========================================================================
  // GREETING
  // ==========================================================================
  set("helvetica", "bold", 13, bodyText);
  doc.text(`Hi ${fullName},`, margin, y);
  y += 7;

  set("helvetica", "normal", 10, subMuted);
  doc.text("Thank you for your payment. Here\u2019s a copy of your receipt.", margin, y);
  y += 14;

  // ==========================================================================
  // SECTION LABEL — "Order details"  (sentence-case, matching email)
  // ==========================================================================
  set("helvetica", "normal", 8, muted);
  doc.text("Order details", margin, y);
  y += 3;
  hRule(y);
  y += 10;

  // ── Amount paid label ──
  set("helvetica", "normal", 8, muted);
  doc.text("Amount paid", margin, y);
  y += 7;

  // ── Amount value  (28pt bold — matches email's 28px weight) ──
  set("helvetica", "bold", 26, darkText);
  doc.text(`PHP 2,000.00`, margin, y);
  y += 13;

  // ── Description label ──
  set("helvetica", "normal", 8, muted);
  doc.text("Description", margin, y);
  y += 6;

  set("helvetica", "normal", 10, bodyText);
  doc.text(`Security Deposit \u2014 ${roomName} (${branch})`, margin, y);
  y += 12;

  hRule(y);
  y += 8;

  // ── Payment method | Date paid  (two columns, matching email layout) ──
  const col2 = margin + W / 2;

  set("helvetica", "normal", 8, muted);
  doc.text("Payment method", margin, y);
  doc.text("Date paid", col2, y);
  y += 6;

  const paymentMethod =
    reservation.paymentMethod === "paymongo"
      ? "Online Payment"
      : reservation.paymentMethod || "Online Payment";

  set("helvetica", "bold", 10, bodyText);
  doc.text(paymentMethod, margin, y);
  doc.text(fmt(reservation.paymentDate), col2, y);
  y += 10;

  hRule(y);
  y += 8;

  // ── Reference label + value  (monospace, matching email) ──
  set("helvetica", "normal", 8, muted);
  doc.text("Reference", margin, y);
  y += 6;

  const refId =
    reservation.paymongoPaymentId ||
    reservation.reservationCode ||
    reservation._id?.slice(-8)?.toUpperCase() ||
    "\u2014";

  set("courier", "normal", 9, subMuted);
  doc.text(refId, margin, y);
  y += 14;

  hRule(y);
  y += 10;

  // ==========================================================================
  // RESERVATION DETAILS  (extra section below the receipt block)
  // ==========================================================================
  set("helvetica", "normal", 8, muted);
  doc.text("Reservation details", margin, y);
  y += 3;
  hRule(y);
  y += 8;

  const addRow = (label, value) => {
    set("helvetica", "normal", 8, muted);
    doc.text(label, margin, y);
    set("helvetica", "bold", 10, bodyText);
    doc.text(String(value || "\u2014"), col2, y);
    y += 8;
  };

  addRow("Tenant",  fullName);
  addRow("Email",   profile?.email || "\u2014");
  addRow("Room",    roomName);
  addRow("Branch",  branch);
  addRow("Lease",   `${reservation.leaseDuration || 12} months`);
  addRow("Move-in", fmt(reservation.targetMoveInDate || reservation.finalMoveInDate));
  if (reservation.selectedBed?.position) {
    addRow("Bed", reservation.selectedBed.position);
  }

  y += 8;

  // ==========================================================================
  // FOOTER  — dark navy, matching email footer exactly
  // ==========================================================================
  const footerY = y + 4;
  const footerH = 34;
  fill(0, footerY, pageWidth, footerH, navy);

  // "You're receiving this e-mail because…"  →  white 70%, 9pt
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.7 }));
  doc.text(
    "You\u2019re receiving this because you made a payment at Lilycrest Dormitory.",
    pageWidth / 2,
    footerY + 9,
    { align: "center" },
  );

  // "Lilycrest Dormitory"  →  gold, 11pt, bold
  doc.setGState(new doc.GState({ opacity: 1 }));
  set("helvetica", "bold", 11, gold);
  doc.text("Lilycrest Dormitory", pageWidth / 2, footerY + 18, { align: "center" });

  // "Dormitory Management System"  →  white 50%, 8pt  (as in email)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.5 }));
  doc.text("Dormitory Management System", pageWidth / 2, footerY + 26, { align: "center" });

  // reset opacity so it doesn't bleed
  doc.setGState(new doc.GState({ opacity: 1 }));

  return doc;
}

/** Download the receipt PDF directly to the user's device. */
export function generateDepositReceipt(reservation, profile) {
  const doc = buildReceiptDoc(reservation, profile);
  const filename = `Lilycrest_Receipt_${reservation.reservationCode || "deposit"}.pdf`;
  doc.save(filename);
}

/** Open the receipt PDF in a new browser tab without downloading. */
export function viewDepositReceipt(reservation, profile) {
  const doc = buildReceiptDoc(reservation, profile);
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
}

// ==========================================================================
// BILLING RECEIPT PDF — matches email receipt template (generatePaymentReceiptHtml)
// Called from pdfReceipt.js via BillingPage "Download Receipt"
// ==========================================================================

/**
 * Builds a billing payment receipt PDF matching the email receipt template.
 * @param {Object} bill - Bill object with paymentDate, totalAmount, etc.
 */
function buildBillingReceiptDoc(bill) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const margin     = 20;
  const W          = pageWidth - margin * 2;
  let y            = 0;

  const navy     = [24, 49, 83];
  const gold     = [212, 152, 43];
  const darkText = [17, 24, 39];
  const bodyText = [55, 65, 81];
  const muted    = [156, 163, 175];
  const subMuted = [107, 114, 128];
  const divider  = [229, 231, 235];
  const white    = [255, 255, 255];

  const fill = (x, yy, w, h, color) => {
    doc.setFillColor(...color);
    doc.rect(x, yy, w, h, "F");
  };
  const hRule = (yy, colorArr = divider) => {
    doc.setDrawColor(...colorArr);
    doc.setLineWidth(0.25);
    doc.line(margin, yy, pageWidth - margin, yy);
  };
  const fmt = (d) => {
    if (!d) return "\u2014";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric",
    });
  };
  const set = (font, style, size, color) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const col2 = margin + W / 2;

  // ── HEADER ──
  const headerH = 36;
  fill(0, 0, pageWidth, headerH, navy);
  set("helvetica", "normal", 10, gold);
  doc.text("Your receipt from", margin, 14);
  set("helvetica", "bold", 20, white);
  doc.text("LILYCREST DORMITORY", margin, 27);
  y = headerH + 14;

  // ── GREETING ──
  set("helvetica", "bold", 13, bodyText);
  doc.text("Payment Receipt", margin, y);
  y += 7;
  set("helvetica", "normal", 10, subMuted);
  doc.text("Thank you for your payment. Here\u2019s a copy of your receipt.", margin, y);
  y += 14;

  // ── ORDER DETAILS ──
  set("helvetica", "normal", 8, muted);
  doc.text("Order details", margin, y);
  y += 3;
  hRule(y);
  y += 10;

  set("helvetica", "normal", 8, muted);
  doc.text("Amount paid", margin, y);
  y += 7;

  const amount = bill.paidAmount || bill.totalAmount || 0;
  set("helvetica", "bold", 26, darkText);
  doc.text(`PHP ${fmtAmt(amount)}`, margin, y);
  y += 13;

  set("helvetica", "normal", 8, muted);
  doc.text("Description", margin, y);
  y += 6;

  const monthLabel = bill.billingMonth
    ? new Date(bill.billingMonth).toLocaleDateString("en-PH", { year: "numeric", month: "long" })
    : "Monthly Bill";
  set("helvetica", "normal", 10, bodyText);
  doc.text(`Monthly Bill \u2014 ${monthLabel}`, margin, y);
  y += 12;

  hRule(y);
  y += 8;

  // ── Payment method | Date paid ──
  set("helvetica", "normal", 8, muted);
  doc.text("Payment method", margin, y);
  doc.text("Date paid", col2, y);
  y += 6;

  const METHOD_LABELS = {
    gcash: "GCash", paymaya: "Maya", maya: "Maya",
    card: "Credit/Debit Card", grabpay: "GrabPay",
    grab_pay: "GrabPay", paymongo: "Online Payment",
    cash: "Cash", bank: "Bank Transfer",
  };
  const rawMethod = (bill.paymentMethod || "").toLowerCase().replace(/[_\s-]/g, "");
  const paymentMethodLabel = METHOD_LABELS[rawMethod] || bill.paymentMethod || "Online Payment";

  set("helvetica", "bold", 10, bodyText);
  doc.text(paymentMethodLabel, margin, y);
  doc.text(fmt(bill.paymentDate || bill.updatedAt), col2, y);
  y += 10;

  hRule(y);
  y += 8;

  // ── Reference ──
  set("helvetica", "normal", 8, muted);
  doc.text("Reference", margin, y);
  y += 6;

  const refId =
    bill.paymongoPaymentId ||
    bill.id?.slice(-8)?.toUpperCase() ||
    bill._id?.slice(-8)?.toUpperCase() ||
    "\u2014";

  set("courier", "normal", 9, subMuted);
  doc.text(refId, margin, y);
  y += 14;

  hRule(y);
  y += 10;

  // ── Billing details ──
  set("helvetica", "normal", 8, muted);
  doc.text("Billing details", margin, y);
  y += 3;
  hRule(y);
  y += 8;

  const addRow = (label, value) => {
    set("helvetica", "normal", 8, muted);
    doc.text(label, margin, y);
    set("helvetica", "bold", 10, bodyText);
    doc.text(String(value || "\u2014"), col2, y);
    y += 8;
  };

  addRow("Billing Period", monthLabel);
  addRow("Room", bill.room || "\u2014");
  addRow("Branch", bill.branch || "\u2014");
  if (bill.charges?.rent)        addRow("Rent",        `PHP ${fmtAmt(bill.charges.rent)}`);
  if (bill.charges?.electricity)  addRow("Electricity",  `PHP ${fmtAmt(bill.charges.electricity)}`);
  if (bill.charges?.water)        addRow("Water",        `PHP ${fmtAmt(bill.charges.water)}`);
  if (bill.charges?.penalty)      addRow("Penalty",      `PHP ${fmtAmt(bill.charges.penalty)}`);

  y += 8;

  // ── FOOTER ──
  const footerY = y + 4;
  const footerH = 34;
  fill(0, footerY, pageWidth, footerH, navy);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.7 }));
  doc.text(
    "You\u2019re receiving this because you made a payment at Lilycrest Dormitory.",
    pageWidth / 2, footerY + 9, { align: "center" },
  );

  doc.setGState(new doc.GState({ opacity: 1 }));
  set("helvetica", "bold", 11, gold);
  doc.text("Lilycrest Dormitory", pageWidth / 2, footerY + 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.5 }));
  doc.text("Dormitory Management System", pageWidth / 2, footerY + 26, { align: "center" });
  doc.setGState(new doc.GState({ opacity: 1 }));

  return doc;
}

/**
 * Download a billing payment receipt as PDF.
 * Called from pdfReceipt.js → BillingPage "Download Receipt" button.
 */
export function generateReceiptPDF(bill) {
  const doc = buildBillingReceiptDoc(bill);
  const receiptNo = bill.paymongoPaymentId
    ? bill.paymongoPaymentId.slice(-12).toUpperCase()
    : (bill.id || bill._id || "receipt").slice(-8).toUpperCase();
  doc.save(`Lilycrest_Receipt_${receiptNo}.pdf`);
}

/**
 * Download a billing statement as PDF (charge breakdown).
 * Called from pdfUtils.js → BillingPage "Download Statement" button.
 */
export function generateBillingReceiptPDF(bill) {
  const doc = buildBillingReceiptDoc(bill);
  const monthSlug = bill.billingMonth
    ? new Date(bill.billingMonth).toLocaleDateString("en-PH", { year: "numeric", month: "short" }).replace(/\s/g, "-")
    : "statement";
  doc.save(`Lilycrest_Statement_${monthSlug}.pdf`);
}

