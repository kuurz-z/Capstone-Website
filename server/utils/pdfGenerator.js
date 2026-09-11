import { formatManilaDate } from './dateUtils.js';
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
import {
  BILL_STATEMENT_TEMPLATE_MARKER,
  BILL_STATEMENT_TEMPLATE_VERSION,
} from "../services/billingStatementTemplate.js";
import {
  BILL_RECEIPT_TEMPLATE_MARKER,
  BILL_RECEIPT_TEMPLATE_VERSION,
} from "../services/billingReceiptTemplate.js";
import { formatDocumentBranch as formatCanonicalDocumentBranch } from "./branchPresentation.js";

// ============================================================================
// PATH SETUP
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the bills output directory */
const BILLS_DIR = path.join(__dirname, "..", "uploads", "bills");
const BRAND_LOGO_PATH = path.join(__dirname, "..", "..", "web", "public", "lilycrest-logo.png");

const PDF_THEME = Object.freeze({
  navy: "#0A1628",
  gold: "#D4AF37",
  goldSubtle: "#FBF7EA",
  goldBorder: "#F3E4B0",
  heading: "#0A1628",
  body: "#1E293B",
  secondary: "#4B5563",
  muted: "#6B7280",
  border: "#E5E7EB",
  surface: "#F8FAFC",
  success: "#059669",
  warningText: "#92400E",
  warningBg: "#FFFBEB",
  danger: "#DC2626",
});

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format a number as Philippine Peso: ₱ 1,234.56
 * @param {number} n
 * @returns {string}
 */
function formatPeso(n) {
  // PDFKit's built-in Helvetica does not contain the peso glyph; use the
  // unambiguous ISO label instead of rendering an incorrect plus/minus sign.
  if (n === null || n === undefined || isNaN(n)) return "PHP 0.00";
  return "PHP " + Number(n).toLocaleString("en-PH", {
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
  return formatCanonicalDocumentBranch(branch);
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
export function drawTable(doc, { headers, widths, rows, x, rowHeight = 22, fontSize = 9, wrapCells = false }) {
  const startX = x || doc.page.margins.left;
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  const drawHeaderRow = (y) => {
    doc.rect(startX, y, totalWidth, rowHeight).fill(PDF_THEME.navy);
    doc.fillColor("#FFFFFF").fontSize(fontSize).font("Helvetica-Bold");
    let headerX = startX;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], headerX + 4, y + 6, {
        width: widths[i] - 8,
        align: i === 0 ? "left" : "right",
        lineBreak: false,
      });
      headerX += widths[i];
    }
  };

  let currentY = doc.y;
  const firstSegmentHeight = rows.length > 0 ? rowHeight * 2 : rowHeight;
  if (currentY + firstSegmentHeight > pageBottom()) {
    doc.addPage();
    currentY = doc.page.margins.top;
  }
  let segmentStartY = currentY;
  let segmentRowCount = 0;

  // ── Header row ──────────────────────────────────────────────────────────
  drawHeaderRow(currentY);
  currentY += rowHeight;

  // ── Data rows ────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(fontSize).fillColor(PDF_THEME.body);

  rows.forEach((row, rowIdx) => {
    const bodyHeight = wrapCells ? Math.max(rowHeight,...row.map((value,i)=>doc.heightOfString(String(value ?? ''),{width:widths[i]-8})+12)) : rowHeight;
    if (currentY + bodyHeight > pageBottom()) {
      doc.rect(startX, segmentStartY, totalWidth, currentY - segmentStartY)
        .stroke(PDF_THEME.border);
      doc.addPage();
      currentY = doc.page.margins.top;
      segmentStartY = currentY;
      segmentRowCount = 0;
      drawHeaderRow(currentY);
      currentY += rowHeight;
      doc.font("Helvetica").fontSize(fontSize).fillColor(PDF_THEME.body);
    }

    const isEven = rowIdx % 2 === 0;
    const bgColor = isEven ? PDF_THEME.surface : "#FFFFFF";
    doc.rect(startX, currentY, totalWidth, bodyHeight).fill(bgColor);

    // Draw light border bottom
    doc.rect(startX, currentY + bodyHeight - 1, totalWidth, 1).fill(PDF_THEME.border);

    let colX = startX;
    // Restore text colour (fillColor is shared with rect fill)
    const isGrayed = row._grayed === true;
    doc.fillColor(isGrayed ? PDF_THEME.muted : PDF_THEME.body);

    for (let i = 0; i < row.length; i++) {
      if (row[i] === undefined || row[i] === "_grayed") {
        colX += widths[i] || 0;
        continue;
      }
      doc.text(String(row[i]), colX + 4, currentY + 6, {
        width: widths[i] - 8,
        align: i === 0 ? "left" : "right",
        lineBreak: wrapCells,
      });
      colX += widths[i];
    }
    currentY += bodyHeight;
    segmentRowCount += 1;
  });

  // Border around the final page segment (earlier segments were bordered before each page break).
  doc.rect(startX, segmentStartY, totalWidth, currentY - segmentStartY)
    .stroke(PDF_THEME.border);

  // Move cursor past the table
  doc.y = currentY + 6;
}

// ============================================================================
// HORIZONTAL RULE HELPER
// ============================================================================

function drawHR(doc, color = PDF_THEME.border) {
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
    .fillColor(PDF_THEME.heading)
    .text(title.toUpperCase(),doc.page.margins.left,doc.y,{width:doc.page.width-doc.page.margins.left-doc.page.margins.right,align:"left"});
  drawHR(doc, PDF_THEME.heading);
  doc.moveDown(0.2);
}

function drawBrandHeader(doc, { x, y, width, documentTitle, branch }) {
  doc.rect(x, y, width, 60).fill(PDF_THEME.navy);
  const hasLogo = fs.existsSync(BRAND_LOGO_PATH);
  const textX = hasLogo ? x + 58 : x + 12;
  if (hasLogo) {
    doc.image(BRAND_LOGO_PATH, x + 12, y + 10, { fit: [40, 40] });
  }
  doc
    .fillColor("#FFFFFF")
    .fontSize(15)
    .font("Helvetica-Bold")
    .text("LILYCREST DORMITORY", textX, y + 11, { width: width - (textX - x) - 12 });
  doc
    .fontSize(8.5)
    .font("Helvetica")
    .fillColor("#FFFFFF")
    .text(formatBranch(branch), textX, y + 33, { width: width - (textX - x) - 12 });
  doc
    .fontSize(10.5)
    .font("Helvetica-Bold")
    .fillColor(PDF_THEME.gold)
    .text(documentTitle, x + 12, y + 21, { width: width - 24, align: "right" });
  doc.y = y + 70;
  doc.fillColor(PDF_THEME.body);
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
export async function generateBillPdf({ bill, billingResult, electricityBreakdown = null, waterBreakdown = null, period, room, tenant }) {
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

  // 5. Normalize the persisted utility projection. Stale regeneration paths
  // receive buildTenantUtilityBreakdown(), while the initial utility flow may
  // still pass its canonical BillingResult snapshot.
  const tenantId = String(bill.userId?._id || bill.userId);
  const normalizedBillingResult = electricityBreakdown ? {
    totalRoomKwh: electricityBreakdown.totalRoomKwh,
    totalRoomCost: electricityBreakdown.totalRoomCost,
    ratePerKwh: electricityBreakdown.ratePerKwh,
    segments: (electricityBreakdown.segments || []).map((item) => ({
      ...item,
      kwhConsumed: item.segmentTotalKwh,
      totalCost: item.segmentTotalCost,
      activeTenantIds: [tenantId],
    })),
    tenantSummaries: [{
      tenantId,
      totalKwh: electricityBreakdown.myTotalKwh,
      billAmount: electricityBreakdown.myBillAmount,
    }],
  } : billingResult;
  const mySummary = normalizedBillingResult?.tenantSummaries?.find(
    (t) => String(t.tenantId) === tenantId,
  );
  const normalizedSegments = normalizedBillingResult?.segments || [];
  const firstElectricitySegment = normalizedSegments[0] || null;
  const lastElectricitySegment = normalizedSegments[normalizedSegments.length - 1] || null;

  // 6. Create PDF document (A4 page)
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title:   `Billing Statement — ${tenantName}`,
      Author:  "Lilycrest DMS",
      Producer: `Lilycrest DMS (${BILL_STATEMENT_TEMPLATE_MARKER})`,
      Keywords: BILL_STATEMENT_TEMPLATE_MARKER,
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
  const statementHeaderY = doc.y;
  drawBrandHeader(doc, {
    x: L,
    y: statementHeaderY,
    width: contentWidth,
    documentTitle: "BILLING STATEMENT",
    branch: room?.branch || period?.branch,
  });

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
    .fillColor(PDF_THEME.danger)
    .text(formatDate(bill.dueDate), rightCol + 75, doc.y)
    .fillColor(PDF_THEME.body);

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
  if (normalizedBillingResult && electricity > 0) {
    sectionHeading(doc, "Electricity Computation");

    // Meter reading summary
    doc.fontSize(9).font("Helvetica");
    const meterInfoX = L;
    const meterInfoLabelW = 140;

    const meterRows = [
      ["Previous Reading",  `${period?.startReading ?? firstElectricitySegment?.readingFrom ?? "—"} kWh`],
      ["Current Reading",   `${period?.endReading ?? lastElectricitySegment?.readingTo ?? "—"} kWh`],
      ["Total Room kWh",    `${normalizedBillingResult.totalRoomKwh ?? "—"} kWh`],
      ["Rate per kWh",      formatPeso(normalizedBillingResult.ratePerKwh)],
      ["Total Room Cost",   formatPeso(normalizedBillingResult.totalRoomCost)],
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
    const segments = normalizedBillingResult.segments || [];
    const tableRows = segments.map((seg) => {
      const tenantWasActive = (seg.activeTenantIds || []).some(
        (id) => String(id) === tenantId,
      );

      if (tenantWasActive) {
        return [
          formatSegmentPeriod(seg),
          `${seg.readingFrom} - ${seg.readingTo}`,
          `${seg.kwhConsumed} kWh`,
          String(seg.activeTenantCount),
          formatPeso(seg.totalCost),
          formatPeso(seg.sharePerTenantCost),
        ];
      } else {
        // Tenant not in this segment — show row grayed
        const grayed = [
          formatSegmentPeriod(seg),
          `${seg.readingFrom} - ${seg.readingTo}`,
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
      const shareY = doc.y + 2;
      doc.rect(L, shareY, contentWidth, 28).fill(PDF_THEME.goldSubtle);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(PDF_THEME.heading)
        .text("YOUR ELECTRICITY SHARE", L + 10, shareY + 8, { width: 190 });
      doc.text(
        `${Number(mySummary.totalKwh || 0).toLocaleString()} kWh  |  ${formatPeso(mySummary.billAmount)}`,
        L + 210,
        shareY + 8,
        { width: contentWidth - 220, align: "right" },
      );
      doc.y = shareY + 34;
      doc.fillColor(PDF_THEME.body).font("Helvetica");
    }

    doc.moveDown(0.8);
  }

  // ── CHARGES SUMMARY ───────────────────────────────────────────────────────
  const isInitialPayment = bill.billType === "initial_payment";
  const initial = bill.initialPaymentBreakdown || {};

  if (water > 0 && waterBreakdown) {
    for (const allocation of waterBreakdown.allocations || [waterBreakdown]) {
      sectionHeading(doc, 'Water Billing Details');
      if (allocation.calculationVersion !== 'water-meter-v1') {
        doc.font('Helvetica').fontSize(9).text('Historical water allocation. Physical readings, consumption and price per m³ are unknown.');
        drawTable(doc,{headers:['Recorded water allocation','Amount'],widths:[360,145],rows:[['Historical charge',formatPeso(allocation.tenantAmount ?? allocation.record?.myShare ?? water)]]});
        continue;
      }
      drawTable(doc,{headers:['Meter event','Observed date','Reading (m³)'],widths:[140,215,150],fontSize:8,
        rows:(allocation.meterEvents || []).map(e=>[({moveIn:'Move-In',moveOut:'Move-Out',periodStart:'Opening Baseline',periodEnd:'Billing Closing'})[e.eventType] || e.eventType,formatManilaDate(e.date || e.observedAt,'MMM D, YYYY HH:mm'),String(e.reading)])});
      drawTable(doc,{headers:['Consumption segment','Opening','Closing','m³','Occupants'],widths:[165,60,60,65,155],fontSize:7,wrapCells:true,
        rows:(allocation.consumptionSegments || []).map(s=>[
          `${formatManilaDate(s.startDate,'MMM D HH:mm')} - ${formatManilaDate(s.endDate,'MMM D HH:mm')}`,
          String(s.readingFrom),String(s.readingTo),String(s.unitsConsumed),
          (s.coveredTenantNames || []).join(', ') || 'Vacant',
        ])});
      drawTable(doc,{headers:['Tenant allocation','Share (m³)','PHP/m³','Final charge'],widths:[190,100,95,120],fontSize:8,wrapCells:true,
        rows:(allocation.tenantAllocations || []).map(a=>[a.tenantName,Number(a.consumptionShare).toFixed(4),formatPeso(a.rate),formatPeso(a.amount)])});
    }
  }
  sectionHeading(doc, isInitialPayment ? "Initial Move-In Settlement Breakdown" : "Charges Summary");

  const chargeRows = [];
  if (isInitialPayment) {
    const adv = Number(initial.advanceRent || 0);
    const dep = Number(initial.securityDeposit || 0);
    const app = Number(initial.approvedInitialCharges || 0);
    const gross = Number(initial.grossInitialAmount || (adv + dep + app));
    const cred = Number(initial.reservationFeeCredit || reservationCreditApplied || 0);

    chargeRows.push(["Advance Rent", formatPeso(adv)]);
    chargeRows.push(["Security Deposit", formatPeso(dep)]);
    if (app > 0) {
      chargeRows.push(["Approved Initial Charges", formatPeso(app)]);
    }
    chargeRows.push(["Subtotal (Gross Initial Amount)", formatPeso(gross)]);
    if (cred > 0) {
      chargeRows.push(["Less: Reservation Fee Credit", `-${formatPeso(cred)}`]);
    }
  } else {
    const baseSubtotal = (rent || 0) + (electricity || 0) + (water || 0) + (applianceFees || 0) + (corkageFees || 0);
    if (rent > 0)          chargeRows.push(["Monthly Rent",           formatPeso(rent)]);
    if (electricity > 0)   chargeRows.push(["Electricity",            formatPeso(electricity)]);
    if (water > 0)         chargeRows.push(["Water",                  formatPeso(water)]);
    if (applianceFees > 0) chargeRows.push(["Appliance Fees",         formatPeso(applianceFees)]);
    if (corkageFees > 0)   chargeRows.push(["Corkage Fees",           formatPeso(corkageFees)]);
    chargeRows.push(["Subtotal (Base Charges)", formatPeso(baseSubtotal)]);
    if (penalty > 0)       chargeRows.push(["Late Payment Penalty",   formatPeso(penalty)]);
    if (discount > 0)      chargeRows.push(["Discount",               `-${formatPeso(discount)}`]);
    if (reservationCreditApplied > 0) {
      chargeRows.push(["Reservation Credit Applied", `-${formatPeso(reservationCreditApplied)}`]);
    }
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
  doc.rect(L, totalBoxY, contentWidth, 28).fill(PDF_THEME.navy);
  doc
    .fillColor("#FFFFFF")
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(
      `${isInitialPayment ? "TOTAL SETTLEMENT:" : "TOTAL DUE:"}  ${formatPeso(bill.totalAmount ?? 0)}`,
      L + 10,
      totalBoxY + 7,
      { width: contentWidth - 20, align: "right" },
    )
    .fillColor(PDF_THEME.body);

  doc.moveDown(2);

  // ── PAYMENT INSTRUCTIONS ──────────────────────────────────────────────────
  sectionHeading(doc, "Payment Instructions");

  doc.fontSize(9).font("Helvetica");
  [
    `• Please pay on or before ${formatDate(bill.dueDate)} to avoid penalties.`,
    "• Use the authenticated Lilycrest tenant app or portal for available payment methods.",
    "• Contact your branch administrator if your account details appear incorrect.",
    "• Keep this document for your records.",
  ].forEach((line) => {
    doc.text(line, { indent: 10 });
  });

  doc.moveDown(0.5);

  if (bill.isManuallyAdjusted) {
    doc
      .fontSize(8)
      .fillColor(PDF_THEME.danger)
      .font("Helvetica-Bold")
      .text("* This bill has been manually adjusted by your branch administrator.", {
        indent: 10,
      })
      .fillColor(PDF_THEME.body)
      .font("Helvetica");
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - doc.page.margins.bottom - 24;
  doc
    .fontSize(7.5)
    .fillColor(PDF_THEME.muted)
    .font("Helvetica")
    .text(
      `Generated by Lilycrest DMS  •  ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}  •  Template v${BILL_STATEMENT_TEMPLATE_VERSION}  •  System-generated document — no signature required`,
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

// ============================================================================
// TRANSFER SETTLEMENT PDF EXPORT
// ============================================================================

/**
 * Generate a PDF Transfer Room Settlement Receipt for a transfer_settlement bill.
 *
 * @param {object} params
 * @param {object} params.bill    - Bill document (billType must be "transfer_settlement")
 * @param {object} params.tenant  - User lean object (the bill owner)
 *
 * @returns {Promise<string>} Relative path to the generated PDF file
 */
export async function generateTransferSettlementPdf({ bill, tenant }) {
  fs.mkdirSync(BILLS_DIR, { recursive: true });

  const billId   = String(bill._id);
  const filePath = path.join(BILLS_DIR, `transfer-${billId}.pdf`);

  const snap = bill.transferSnapshot || {};
  const ch   = bill.charges || {};

  const tenantName = [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() || "Tenant";
  const fromRoom   = snap.fromRoomName || "Previous Room";
  const toRoom     = snap.toRoomName   || "New Room";
  const transferDate = snap.effectiveTransferDate
    ? new Date(snap.effectiveTransferDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : formatDate(bill.billingMonth);

  const proRataRent       = Number(snap.proRataRent || ch.rent || 0);
  const electricityCharge = Number(snap.estimatedElectricityCharge || ch.electricity || 0);
  const totalAmount       = Number(bill.totalAmount || 0);
  const outstandingBal    = Number(snap.outstandingBalanceAtTransfer || 0);
  const proRataDays       = Number(snap.proRataDays || bill.proRataDays || 0);
  const kwhDelta          = snap.estimatedElectricityKwh != null ? Number(snap.estimatedElectricityKwh) : null;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title:   `Transfer Settlement — ${tenantName}`,
      Author:  "Lilycrest DMS",
      Subject: `Room Transfer: ${fromRoom} → ${toRoom} on ${transferDate}`,
    },
  });

  const writePromise = new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const contentWidth = R - L;
  const fmtMoney = (v) => `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── HEADER ────────────────────────────────────────────────────────────────
  const transferHeaderY = doc.y;
  drawBrandHeader(doc, {
    x: L,
    y: transferHeaderY,
    width: contentWidth,
    documentTitle: "TRANSFER SETTLEMENT",
    branch: bill.branch,
  });

  doc.moveDown(0.5);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(1).stroke();
  doc.moveDown(0.5);

  // ── DOCUMENT TITLE ────────────────────────────────────────────────────────
  doc.fontSize(14).font("Helvetica-Bold").fillColor(PDF_THEME.heading).text("TRANSFER ROOM SETTLEMENT RECEIPT", L, doc.y, { align: "center", width: contentWidth });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor(PDF_THEME.secondary)
    .text(`${fromRoom}  →  ${toRoom}`, L, doc.y, { align: "center", width: contentWidth });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor(PDF_THEME.muted).text(`Effective Transfer Date: ${transferDate}`, L, doc.y, { align: "center", width: contentWidth });

  doc.moveDown(0.8);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  // ── TENANT INFO ───────────────────────────────────────────────────────────
  doc.fontSize(9).font("Helvetica-Bold").fillColor(PDF_THEME.heading).text("TENANT INFORMATION", L, doc.y);
  doc.moveDown(0.25);
  doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.body)
    .text(`Name: ${tenantName}`, L, doc.y)
    .text(`Previous Room: ${fromRoom}  (${snap.fromRoomType || ""}  •  ${fmtMoney(snap.fromRoomPrice)}/mo)`, L, doc.y)
    .text(`New Room: ${toRoom}  (${snap.toRoomType || ""}  •  ${fmtMoney(snap.toRoomPrice)}/mo)`, L, doc.y);

  doc.moveDown(0.8);

  // ── CHARGES TABLE ─────────────────────────────────────────────────────────
  doc.fontSize(9).font("Helvetica-Bold").fillColor(PDF_THEME.heading).text("SETTLEMENT CHARGES", L, doc.y);
  doc.moveDown(0.3);

  const drawRow = (label, amount, note = "") => {
    const y = doc.y;
    doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.body).text(label, L + 10, y, { width: contentWidth * 0.6 });
    if (note) {
      doc.fontSize(8).fillColor(PDF_THEME.muted).text(note, L + 10, doc.y - 2, { width: contentWidth * 0.6 });
    }
    doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.body)
      .text(fmtMoney(amount), L + contentWidth * 0.6, y, { width: contentWidth * 0.4, align: "right" });
    doc.moveDown(0.5);
  };

  drawRow(
    "Pro-rata Rent",
    proRataRent,
    proRataDays > 0 ? `${proRataDays} day(s) at ${fmtMoney(snap.fromRoomPrice || 0)}/mo` : "",
  );

  if (electricityCharge > 0) {
    drawRow(
      "Estimated Electricity",
      electricityCharge,
      kwhDelta != null ? `${kwhDelta.toLocaleString()} kWh consumed since last reading` : "Based on meter delta",
    );
  }

  doc.moveDown(0.2);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(0.5).stroke();
  doc.moveDown(0.3);

  // Total
  const yTotal = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(PDF_THEME.heading)
    .text("Settlement Total", L + 10, yTotal, { width: contentWidth * 0.6 })
    .text(fmtMoney(totalAmount), L + contentWidth * 0.6, yTotal, { width: contentWidth * 0.4, align: "right" });
  doc.moveDown(0.8);

  // ── METER READINGS ────────────────────────────────────────────────────────
  if (snap.fromRoomName) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor(PDF_THEME.heading).text("METER READINGS AT TRANSFER", L, doc.y);
    doc.moveDown(0.25);
    if (bill.charges?.electricity != null || kwhDelta != null) {
      doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.body)
        .text(`Previous Room Final Meter (${fromRoom}): ${
          bill.transferSnapshot?.estimatedElectricityKwh != null
            ? `Δ ${kwhDelta?.toLocaleString()} kWh`
            : "Not recorded"
        }`, L + 10, doc.y)
        .text(`New Room Opening Meter (${toRoom}): Recorded at transfer`, L + 10, doc.y);
    } else {
      doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.muted).text("No meter readings were recorded for this transfer.", L + 10, doc.y);
    }
    doc.moveDown(0.8);
  }

  // ── OUTSTANDING BALANCE ───────────────────────────────────────────────────
  if (outstandingBal > 0) {
    doc.rect(L, doc.y, contentWidth, 30).fillColor(PDF_THEME.warningBg).fill();
    const warnY = doc.y + 8;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(PDF_THEME.warningText)
      .text(`Outstanding Balance at Transfer: ${fmtMoney(outstandingBal)}`, L + 10, warnY, { width: contentWidth - 20 });
    doc.moveDown(1.2);
    doc.fontSize(8).font("Helvetica").fillColor(PDF_THEME.warningText)
      .text("This balance was outstanding at the time of room transfer. Please settle at the branch.", L + 10, doc.y, { width: contentWidth - 20 });
    doc.moveDown(0.8);
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerYTs = doc.page.height - doc.page.margins.bottom - 24;
  doc.fontSize(7.5).font("Helvetica").fillColor(PDF_THEME.muted)
    .text(
      `Generated by Lilycrest DMS  •  ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}  •  System-generated document`,
      L, footerYTs, { width: contentWidth, align: "center" },
    );

  doc.end();
  await writePromise;

  return path.relative(path.join(__dirname, ".."), filePath);
}

/**
 * Generate a Payment Receipt PDF for a settled Bill — a distinct document
 * from the Billing Statement (generateBillPdf), containing payment evidence
 * only. Callers must verify the bill is actually settled before calling
 * this (see mobileBillingRoutes.js /:billingId/receipt) — this function
 * does not itself check payment status, matching the "no DB calls, no
 * recomputation, only render what's passed in" contract the rest of this
 * file follows.
 *
 * Deliberately does NOT include: a charges table, TOTAL DUE, or payment
 * instructions — those belong on the statement, not the receipt (a settled
 * tenant must never be told to pay again).
 */
export async function generateBillReceiptPdf({
  bill,
  tenant,
  room = null,
  billReference,
  payments = [],
  legacyPayment = null,
  remainingAmount = 0,
}) {
  fs.mkdirSync(BILLS_DIR, { recursive: true });

  const billId = String(bill._id);
  const filePath = path.join(BILLS_DIR, `receipt-${billId}.pdf`);

  const tenantName = [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() || "Tenant";
  const billingPeriod = bill.billingMonth
    ? new Date(bill.billingMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";
  const paymentRows = payments.length > 0
    ? payments.map((payment) => ({
        reference: payment.paymentId || payment.providerPaymentId || payment.referenceNumber || payment.paymentReference || null,
        amount: Number(payment.amount || 0),
        method: payment.method || payment.paymentMethod || null,
        settledAt: payment.settlementTimestamp || payment.processedAt || payment.verifiedAt || payment.createdAt || null,
      }))
    : legacyPayment ? [{
        reference: legacyPayment.reference || null,
        amount: Number(legacyPayment.amount || 0),
        method: legacyPayment.method || null,
        settledAt: legacyPayment.settledAt || null,
      }] : [];
  const amountPaid = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
  const methodLabel = (value) => value
    ? String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "—";

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title: `Payment Receipt — ${tenantName}`,
      Author: "Lilycrest DMS",
      Producer: `Lilycrest DMS (${BILL_RECEIPT_TEMPLATE_MARKER})`,
      Keywords: BILL_RECEIPT_TEMPLATE_MARKER,
      Subject: billingPeriod ? `Payment Receipt for ${billingPeriod}` : "Payment Receipt",
    },
  });

  const writePromise = new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const contentWidth = R - L;

  // ── HEADER ────────────────────────────────────────────────────────────────
  const receiptHeaderY = doc.y;
  drawBrandHeader(doc, {
    x: L,
    y: receiptHeaderY,
    width: contentWidth,
    documentTitle: "PAYMENT RECEIPT",
    branch: room?.branch || bill.branch,
  });

  doc.moveDown(0.5);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(1).stroke();
  doc.moveDown(0.5);

  // ── DOCUMENT TITLE ────────────────────────────────────────────────────────
  sectionHeading(doc, "Payment Confirmation");
  if (billingPeriod) {
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor(PDF_THEME.secondary).text(billingPeriod, L, doc.y, { align: "center", width: contentWidth });
  }

  doc.moveDown(0.8);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  // ── RECEIPT DETAILS ───────────────────────────────────────────────────────
  const row = (label, value) => {
    const y = doc.y;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(PDF_THEME.secondary).text(label, L, y, { width: contentWidth * 0.35 });
    doc.fontSize(9).font("Helvetica").fillColor(PDF_THEME.body).text(String(value ?? "—"), L + contentWidth * 0.35, y, { width: contentWidth * 0.65 });
    doc.moveDown(0.5);
  };

  row("Bill Reference", billReference);
  row("Bill ID", billId);
  row("Tenant", tenantName);
  if (room?.name || room?.roomNumber) row("Room", room.name || room.roomNumber);
  if (billingPeriod) row("Billing Period", billingPeriod);

  const isInitialPayment = bill.billType === "initial_payment";
  const initial = bill.initialPaymentBreakdown || {};

  if (isInitialPayment) {
    const adv = Number(initial.advanceRent || 0);
    const dep = Number(initial.securityDeposit || 0);
    const app = Number(initial.approvedInitialCharges || 0);
    const gross = Number(initial.grossInitialAmount || (adv + dep + app));
    const cred = Number(initial.reservationFeeCredit || bill.reservationCreditApplied || 0);

    row("Advance Rent", formatPeso(adv));
    row("Security Deposit", formatPeso(dep));
    if (app > 0) row("Approved Initial Charges", formatPeso(app));
    row("Gross Initial Settlement", formatPeso(gross));
    if (cred > 0) row("Less: Reservation Fee Credit", `-${formatPeso(cred)}`);
  } else {
    const ch = bill.charges || {};
    const rentAmt = Number(ch.rent || 0);
    const elecAmt = Number(ch.electricity || 0);
    const waterAmt = Number(ch.water || 0);
    const applianceAmt = Number(ch.applianceFees || 0);
    const corkageAmt = Number(ch.corkageFees || 0);
    const baseSubtotal = rentAmt + elecAmt + waterAmt + applianceAmt + corkageAmt;
    const penaltyAmt = Number(ch.penalty || 0);

    if (baseSubtotal > 0 || penaltyAmt > 0) {
      row("Base Subtotal Charges", formatPeso(baseSubtotal));
      if (penaltyAmt > 0) {
        row("Late Payment Penalty", formatPeso(penaltyAmt));
      }
    }
  }

  doc.moveDown(0.3);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(PDF_THEME.border).lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  if (paymentRows.length > 0) {
    drawTable(doc, {
      headers: ["Payment Date", "Method", "Reference", "Amount"],
      widths: [120, 110, 165, 110],
      rows: paymentRows.map((payment) => [
        formatDate(payment.settledAt),
        methodLabel(payment.method),
        payment.reference || "Not recorded",
        formatPeso(payment.amount),
      ]),
      x: L,
      fontSize: 8,
    });
  }
  row("Total Payments Applied", formatPeso(amountPaid));
  row("Remaining Balance", formatPeso(remainingAmount));

  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(PDF_THEME.success).text("STATUS: PAID", L, doc.y);

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - doc.page.margins.bottom - 24;
  doc.fontSize(7.5).font("Helvetica").fillColor(PDF_THEME.muted)
    .text(
      `Generated by Lilycrest DMS  •  ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}  •  Template v${BILL_RECEIPT_TEMPLATE_VERSION}  •  System-generated document`,
      L, footerY, { width: contentWidth, align: "center" },
    );

  doc.end();
  await writePromise;

  return path.relative(path.join(__dirname, ".."), filePath);
}
