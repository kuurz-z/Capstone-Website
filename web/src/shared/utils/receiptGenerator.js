import jsPDF from "jspdf";

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
  doc.text("\u20B1 2,000.00", margin, y);
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
      ? "Online (PayMongo)"
      : reservation.paymentMethod || "Online";

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
