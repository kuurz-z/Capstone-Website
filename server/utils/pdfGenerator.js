/**
 * ============================================================================
 * PDF GENERATOR — Billing Statement
 * ============================================================================
 *
 * Generates a formatted PDF bill for a single tenant after billing is finalized.
 *
 * Entry point: generateBillPdf({ bill, billingResult, period, room, tenant })
 *
 * Output: writes a .pdf file to server/uploads/bills/{billId}.pdf
 *         returns the relative file path as a string
 *
 * DOES NOT:
 * - Make any database calls
 * - Recompute any billing values
 * - Modify any existing data
 *
 * All values are read from documents passed in — no computation happens here.
 *
 * ============================================================================
 */

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// PATH SETUP
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the bills output directory */
const BILLS_DIR = path.join(__dirname, "..", "uploads", "bills");

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format a number as Philippine Peso: ₱ 1,234.56
 * @param {number} n
 * @returns {string}
 */
function formatPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0.00";
  return "₱" + Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a date as "March 15, 2026"
 * @param {Date|string|null} d
 * @returns {string}
 */
function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format branch slug to human-readable name
 * @param {string} branch
 * @returns {string}
 */
function formatBranch(branch) {
  if (!branch) return "Lilycrest Dormitory";
  if (branch === "gil-puyat") return "Lilycrest — Gil Puyat Branch";
  if (branch === "guadalupe") return "Lilycrest — Guadalupe Branch";
  return branch;
}

/**
 * Format a segment period label for the table
 * e.g. "Feb 15 – Mar 15"
 */
function formatSegmentPeriod(seg) {
  if (seg.periodLabel) return seg.periodLabel;
  const s = seg.startDate ? formatDate(seg.startDate) : "—";
  const e = seg.endDate   ? formatDate(seg.endDate)   : "—";
  return `${s} – ${e}`;
}

// ============================================================================
// TABLE DRAWING HELPER
// ============================================================================

/**
 * Draw a simple table using pdfkit's text positioning.
 *
 * @param {PDFDocument} doc
 * @param {object} opts
 * @param {string[]} opts.headers   - Column header labels
 * @param {number[]} opts.widths    - Column widths in points
 * @param {Array<string[]>} opts.rows  - Row data (string arrays)
 * @param {number} opts.x           - Starting x position
 * @param {number} opts.rowHeight   - Height per row (default 22)
 * @param {number} opts.fontSize    - Font size for body rows (default 9)
 */
function drawTable(doc, { headers, widths, rows, x, rowHeight = 22, fontSize = 9 }) {
  const startX = x || doc.page.margins.left;
  let currentY = doc.y;
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  // ── Header row ──────────────────────────────────────────────────────────
  doc.rect(startX, currentY, totalWidth, rowHeight).fill("#1a1a2e");
  doc.fillColor("#ffffff").fontSize(fontSize).font("Helvetica-Bold");

  let colX = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], colX + 4, currentY + 6, {
      width: widths[i] - 8,
      align: i === 0 ? "left" : "right",
      lineBreak: false,
    });
    colX += widths[i];
  }
  currentY += rowHeight;

  // ── Data rows ────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(fontSize).fillColor("#1a1a2e");

  rows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 0;
    const bgColor = isEven ? "#f8f9fa" : "#ffffff";
    doc.rect(startX, currentY, totalWidth, rowHeight).fill(bgColor);

    // Draw light border bottom
    doc.rect(startX, currentY + rowHeight - 1, totalWidth, 1).fill("#dee2e6");

    colX = startX;
    // Restore text colour (fillColor is shared with rect fill)
    const isGrayed = row._grayed === true;
    doc.fillColor(isGrayed ? "#adb5bd" : "#1a1a2e");

    for (let i = 0; i < row.length; i++) {
      if (row[i] === undefined || row[i] === "_grayed") {
        colX += widths[i] || 0;
        continue;
      }
      doc.text(String(row[i]), colX + 4, currentY + 6, {
        width: widths[i] - 8,
        align: i === 0 ? "left" : "right",
        lineBreak: false,
      });
      colX += widths[i];
    }
    currentY += rowHeight;
  });

  // Border around entire table
  doc.rect(startX, doc.y - (rows.length * rowHeight) - rowHeight, totalWidth, (rows.length + 1) * rowHeight)
     .stroke("#dee2e6");

  // Move cursor past the table
  doc.y = currentY + 6;
}

// ============================================================================
// HORIZONTAL RULE HELPER
// ============================================================================

function drawHR(doc, color = "#dee2e6") {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke(color)
    .moveDown(0.5);
}

// ============================================================================
// SECTION HEADING HELPER
// ============================================================================

function sectionHeading(doc, title) {
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#1a1a2e")
    .text(title.toUpperCase());
  drawHR(doc, "#1a1a2e");
  doc.moveDown(0.2);
}

// ============================================================================
// MAIN EXPORT: generateBillPdf
// ============================================================================

/**
 * Generate a PDF billing statement for a single tenant.
 *
 * @param {object} params
 * @param {object} params.bill          - Bill mongoose document (or .toObject())
 * @param {object} params.billingResult - BillingResult lean object
 * @param {object} params.period        - BillingPeriod lean object
 * @param {object} params.room          - Room lean object
 * @param {object} params.tenant        - User lean object (the bill owner)
 *
 * @returns {Promise<string>} Relative path to the generated PDF file
 */
export async function generateBillPdf({ bill, billingResult, period, room, tenant }) {
  // 1. Ensure output directory exists
  fs.mkdirSync(BILLS_DIR, { recursive: true });

  const billId    = String(bill._id);
  const filePath  = path.join(BILLS_DIR, `${billId}.pdf`);

  // 2. Resolve tenant identity
  const tenantName =
    [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() ||
    "Tenant";

  // 3. Resolve room identity
  const roomLabel = room?.name || room?.roomNumber || "Unknown Room";
  const billReference =
    bill.billReference ||
    `LC-RB-${new Date(bill.billingMonth || Date.now()).toISOString().slice(0, 7).replace("-", "")}-${billId.slice(-6).toUpperCase()}`;

  // 4. Resolve bill charges (fall back to 0)
  const ch = bill.charges || {};
  const electricity  = Number(ch.electricity  || 0);
  const water        = Number(ch.water        || 0);
  const rent         = Number(ch.rent         || 0);
  const applianceFees= Number(ch.applianceFees|| 0);
  const corkageFees  = Number(ch.corkageFees  || 0);
  const penalty      = Number(ch.penalty      || 0);
  const discount     = Number(ch.discount     || 0);
  const reservationCreditApplied = Number(bill.reservationCreditApplied || 0);

  // 5. Identify this tenant's electricity summary from billingResult
  const tenantId = String(bill.userId);
  const mySummary = billingResult?.tenantSummaries?.find(
    (t) => String(t.tenantId) === tenantId,
  );

  // 6. Create PDF document (A4 page)
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title:   `Billing Statement — ${tenantName}`,
      Author:  "Lilycrest DMS",
      Subject: `Billing Period ${formatDate(period?.startDate)} – ${formatDate(period?.endDate)}`,
    },
  });

  // 7. Pipe to file — wrapped in a Promise so we can await completion
  const writePromise = new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // PAGE CONTENT
  // ────────────────────────────────────────────────────────────────────────────

  const L = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ── HEADER BANNER ─────────────────────────────────────────────────────────
  doc.rect(L, doc.y, contentWidth, 60).fill("#1a1a2e");

  doc
    .fillColor("#ffffff")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("LILYCREST DORMITORY", L + 12, doc.y - 52, { width: contentWidth - 24 });

  doc
    .fontSize(9)
    .font("Helvetica")
    .text(formatBranch(room?.branch || period?.branch), L + 12, doc.y, {
      width: contentWidth - 24,
    });

  // "BILLING STATEMENT" label on the right
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#f8c42b")
    .text("BILLING STATEMENT", L + 12, doc.y - 30, {
      width: contentWidth - 24,
      align: "right",
    });

  doc.fillColor("#1a1a2e").moveDown(0.8);

  // ── TENANT / PERIOD INFO ──────────────────────────────────────────────────
  sectionHeading(doc, "Billing Information");

  const infoY = doc.y;
  // Left column
  doc
    .font("Helvetica-Bold").fontSize(9)
    .text("Tenant:", L, infoY)
    .font("Helvetica")
    .text(tenantName, L + 75, infoY);

  doc
    .font("Helvetica-Bold")
    .text("Room:", L, doc.y)
    .font("Helvetica")
    .text(roomLabel, L + 75, doc.y);

  // Right column aligned
  const rightCol = doc.page.width / 2;
  doc
    .font("Helvetica-Bold").fontSize(9)
    .text("Bill Date:", rightCol, infoY)
    .font("Helvetica")
    .text(formatDate(bill.issuedAt || bill.sentAt), rightCol + 75, infoY);

  doc
    .font("Helvetica-Bold")
    .text("Due Date:", rightCol, doc.y)
    .font("Helvetica")
    .fillColor("#c0392b")  // red due date for urgency
    .text(formatDate(bill.dueDate), rightCol + 75, doc.y)
    .fillColor("#1a1a2e");

  doc
    .font("Helvetica-Bold")
    .text("Reference:", rightCol, doc.y)
    .font("Helvetica")
    .text(billReference, rightCol + 75, doc.y);

  doc.y = infoY;
  doc
    .font("Helvetica-Bold")
    .text("Billing Period:", L, doc.y + 34);
  doc
    .font("Helvetica")
    .text(
      `${formatDate(period?.startDate)} – ${formatDate(period?.endDate)}`,
      L + 90,
      doc.y,
    );

  doc.moveDown(1.2);

  // ── ELECTRICITY SECTION ───────────────────────────────────────────────────
  if (billingResult) {
    sectionHeading(doc, "Electricity Computation");

    // Meter reading summary
    doc.fontSize(9).font("Helvetica");
    const meterInfoX = L;
    const meterInfoLabelW = 140;

    const meterRows = [
      ["Previous Reading",  `${period?.startReading ?? "—"} kWh`],
      ["Current Reading",   `${period?.endReading   ?? "—"} kWh`],
      ["Total Room kWh",    `${billingResult.totalRoomKwh ?? "—"} kWh`],
      ["Rate per kWh",      formatPeso(billingResult.ratePerKwh)],
      ["Total Room Cost",   formatPeso(billingResult.totalRoomCost)],
    ];

    meterRows.forEach(([label, value]) => {
      doc
        .font("Helvetica-Bold").text(label + ":", meterInfoX, doc.y, { continued: false, width: meterInfoLabelW })
        .moveUp()
        .font("Helvetica").text(value, meterInfoX + meterInfoLabelW, doc.y, { width: contentWidth - meterInfoLabelW });
    });

    doc.moveDown(0.6);

    // Segment breakdown table
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Segment Breakdown:");
    doc.moveDown(0.2);

    // Determine which segments this tenant was in
    const segments = billingResult.segments || [];
    const tableRows = segments.map((seg) => {
      const tenantWasActive = (seg.activeTenantIds || []).some(
        (id) => String(id) === tenantId,
      );

      if (tenantWasActive) {
        return [
          formatSegmentPeriod(seg),
          `${seg.readingFrom}→${seg.readingTo}`,
          `${seg.kwhConsumed} kWh`,
          String(seg.activeTenantCount),
          formatPeso(seg.totalCost),
          formatPeso(seg.sharePerTenantCost),
        ];
      } else {
        // Tenant not in this segment — show row grayed
        const grayed = [
          formatSegmentPeriod(seg),
          `${seg.readingFrom}→${seg.readingTo}`,
          `${seg.kwhConsumed} kWh`,
          String(seg.activeTenantCount),
          "—",
          "Not applicable",
        ];
        grayed._grayed = true;
        return grayed;
      }
    });

    drawTable(doc, {
      headers: ["Period", "Reading", "kWh Used", "Tenants", "Seg. Cost", "Your Share"],
      widths:  [120,       100,        70,          55,         80,           80],
      rows:    tableRows,
      x:       L,
    });

    // Tenant total electricity
    if (mySummary) {
      doc.moveDown(0.3).fontSize(9);
      doc
        .font("Helvetica-Bold")
        .text(
          `Your Total kWh: ${mySummary.totalKwh} kWh   |   Your Electricity Charge: ${formatPeso(mySummary.billAmount)}`,
          { align: "right" },
        )
        .font("Helvetica");
    }

    doc.moveDown(0.8);
  }

  // ── CHARGES SUMMARY ───────────────────────────────────────────────────────
  sectionHeading(doc, "Charges Summary");

  const chargeRows = [];
  chargeRows.push(["Electricity", formatPeso(electricity)]);
  if (water > 0)         chargeRows.push(["Water",          formatPeso(water)]);
  if (rent > 0)          chargeRows.push(["Rent",           formatPeso(rent)]);
  if (applianceFees > 0) chargeRows.push(["Appliance Fees", formatPeso(applianceFees)]);
  if (corkageFees > 0)   chargeRows.push(["Corkage Fees",   formatPeso(corkageFees)]);
  if (penalty > 0)       chargeRows.push(["Penalty",        formatPeso(penalty)]);
  if (discount > 0)      chargeRows.push(["Discount",       `-${formatPeso(discount)}`]);
  if (reservationCreditApplied > 0) {
    chargeRows.push(["Reservation Credit Applied", `-${formatPeso(reservationCreditApplied)}`]);
  }

  drawTable(doc, {
    headers: ["Charge",  "Amount"],
    widths:  [360,        145],
    rows:    chargeRows,
    x:       L,
  });

  // Total due — large, bold
  doc.moveDown(0.3);
  const totalBoxY = doc.y;
  doc.rect(L, totalBoxY, contentWidth, 28).fill("#1a1a2e");
  doc
    .fillColor("#ffffff")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(
      `TOTAL DUE:  ${formatPeso(bill.totalAmount ?? 0)}`,
      L + 10,
      totalBoxY + 7,
      { width: contentWidth - 20, align: "right" },
    )
    .fillColor("#1a1a2e");

  doc.moveDown(2);

  // ── PAYMENT INSTRUCTIONS ──────────────────────────────────────────────────
  sectionHeading(doc, "Payment Instructions");

  doc.fontSize(9).font("Helvetica");
  [
    `• Please pay on or before ${formatDate(bill.dueDate)} to avoid penalties.`,
    "• Late payments incur a ₱50/day penalty after the due date.",
    "• Contact your branch administrator for accepted payment methods.",
    "• You may also pay via the Lilycrest tenant mobile app.",
    "• If you pay by bank transfer or another offline method, keep proof of payment for branch verification.",
    "• Keep this document for your records.",
  ].forEach((line) => {
    doc.text(line, { indent: 10 });
  });

  doc.moveDown(0.5);

  if (bill.isManuallyAdjusted) {
    doc
      .fontSize(8)
      .fillColor("#c0392b")
      .font("Helvetica-Bold")
      .text("* This bill has been manually adjusted by your branch administrator.", {
        indent: 10,
      })
      .fillColor("#1a1a2e")
      .font("Helvetica");
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - doc.page.margins.bottom - 24;
  doc
    .fontSize(7.5)
    .fillColor("#6c757d")
    .font("Helvetica")
    .text(
      `Generated by Lilycrest DMS  •  ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}  •  System-generated document — no signature required`,
      L,
      footerY,
      { width: contentWidth, align: "center" },
    );

  // ── FINALIZE ──────────────────────────────────────────────────────────────
  doc.end();
  await writePromise;

  // Return the relative path (relative to server root) for storage in DB
  return path.relative(path.join(__dirname, ".."), filePath);
}
