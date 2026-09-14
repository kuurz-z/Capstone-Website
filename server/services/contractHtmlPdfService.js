import { resolveLegalLeaseType } from "../config/contractLegalTerm.js";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import {
  browserUnavailableError,
  resolveContractChromium,
} from "./contractChromiumService.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// This pipeline relies on the browser's own CSS layout to wrap text (see
// .contract-paragraph's white-space/word-break/overflow-wrap below) rather
// than measuring text width server-side, so it can't overlap other content
// the way a fixed-coordinate PDF overlay can. But a single, unbroken
// whitespace-free run far longer than any real name/address token can still
// render poorly (overflow past the page's printable width). No real legal
// name or address contains a single unbroken token this long, so this is a
// safety net for malformed/corrupted input, not a limit real applicants
// would ever hit — mirrors the pdf-lib pipeline's TENANT_*_TOO_LONG codes
// for a consistent, controlled failure instead of a malformed render.
const MAX_UNBROKEN_TOKEN_LENGTH = 60;
const assertNoOversizedToken = (value, fieldName, overflowCode) => {
  const longestToken = String(value ?? "").split(/\s+/).reduce(
    (max, token) => Math.max(max, token.length), 0,
  );
  if (longestToken > MAX_UNBROKEN_TOKEN_LENGTH) {
    const error = new Error(
      `The value for ${fieldName} cannot fit safely in the official template.`,
    );
    error.code = overflowCode;
    error.statusCode = 422;
    error.details = { field: fieldName, longestToken };
    throw error;
  }
};

const roomLabel = {
  private: "PRIVATE ROOM",
  "private-room": "PRIVATE ROOM",
  private_room: "PRIVATE ROOM",
  "double-sharing": "DOUBLE SHARING",
  double_sharing: "DOUBLE SHARING",
  "quadruple-sharing": "QUADRUPLE SHARING",
  quadruple_sharing: "QUADRUPLE SHARING",
};

export const buildContractHtml = (data) => {
  if (!String(data.fields?.tenantLegalName || "").trim()) {
    const error = new Error("Tenant legal name is required to generate the Contract.");
    error.code = "CONTRACT_REQUIRED_FIELD_MISSING";
    error.statusCode = 422;
    error.details = { field: "tenantLegalName" };
    throw error;
  }
  if (!String(data.fields?.tenantResidentialAddress || "").trim()) {
    const error = new Error("Tenant residential address is required to generate the Contract.");
    error.code = "CONTRACT_REQUIRED_FIELD_MISSING";
    error.statusCode = 422;
    error.details = { field: "tenantResidentialAddress" };
    throw error;
  }
  assertNoOversizedToken(data.fields?.tenantLegalName, "tenantLegalName", "TENANT_NAME_TOO_LONG_FOR_TEMPLATE");
  assertNoOversizedToken(
    data.fields?.tenantResidentialAddress, "tenantResidentialAddress", "TENANT_ADDRESS_TOO_LONG_FOR_TEMPLATE",
  );
  const f = Object.fromEntries(Object.entries(data.fields)
    .map(([key, value]) => [key, escapeHtml(value)]));
  const propertyName = escapeHtml(data.property.propertyName);
  const propertyAddress = escapeHtml(data.property.propertyAddress);
  const templateId = String(data.template.templateId || "").trim().toLowerCase();
  const inferredRoomType = templateId.replace(/-(short|long)-term$/, "");
  const canonicalRoomType = String(data.template.roomType || inferredRoomType)
    .trim().toLowerCase();
  const room = roomLabel[canonicalRoomType];
  if (!room) {
    const error = new Error("The Contract room type is not supported by the selected template.");
    error.code = "CONTRACT_TEMPLATE_ROOM_TYPE_INVALID";
    throw error;
  }
  const leaseType = data.template.leaseType
    || (templateId.endsWith("-short-term") ? "short-term"
      : templateId.endsWith("-long-term") ? "long-term" : "");
  if (!["short-term", "long-term"].includes(leaseType)) {
    const error = new Error("The Contract lease type is not supported by the selected template.");
    error.code = "CONTRACT_TEMPLATE_LEASE_TYPE_INVALID";
    throw error;
  }
  const term = leaseType === "short-term" ? "SHORT TERM" : "LONG TERM";
  const durationMonths = Number(data.fields.leaseDurationNumber);
  let expectedLeaseType;
  try { expectedLeaseType = resolveLegalLeaseType(durationMonths); } catch { /* reported below */ }
  if (leaseType !== expectedLeaseType) {
    const error = new Error("The selected lease template does not match the lease duration.");
    error.code = "CONTRACT_TEMPLATE_DURATION_MISMATCH";
    throw error;
  }
  const isPrivate = canonicalRoomType === "private";
  const leaseSpaceSubject = isPrivate ? "private room" : "bed space";
  const durationClause = term === "SHORT TERM"
    ? "not less than one (1) month and less than six (6) months"
    : "not less than six (6) months";

  const amenitiesClause = isPrivate
    ? "The said rental fee is inclusive of the use of the leased premises and the room’s own private toilet and bath and kitchenette, as well as the common lounge area on the same floor, subject to the House Rules and Regulations (ANNEX “A”) provided by the LESSOR. The leased premises are fully furnished with a double-decked bed and mattress, an air conditioning unit, table, chair, cabinet, and shower water heater."
    : "The said rental fee is inclusive of the use of the leased premises and the common facilities provided on the same floor of the unit, such as the toilet and bath and the lounge area with kitchen appliances, subject to the House Rules and Regulations (ANNEX “A”) provided by the LESSOR. The leased premises are fully furnished with a double-decked bed and mattress, an air conditioning unit, table, chair, cabinet, and shower water heater.";

  const bedPhrase = isPrivate
    ? ""
    : `, Bed/Slot No. <strong>${f.bedOrSlotNumber || "1"}</strong>`;

  const discountClause = Number(data.fields.discountPercentage) > 0
    ? `The LESSOR, however, shall grant a promo rate or discount of <strong>${f.discountPercentage} (${Number(data.fields.discountPercentage)}%) percent</strong>, which brings the basic monthly rental fee to <strong>Php ${f.approvedMonthlyRate}</strong>, exclusive of any tax and net of discount.`
    : `The basic monthly rental fee is <strong>Php ${f.approvedMonthlyRate}</strong>, exclusive of any tax.`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Contract of Lease - ${f.tenantLegalName} (${propertyName})</title><style>
@page{size:8.5in 13in;margin:.26in .35in}
*{box-sizing:border-box}
html,body{width:100%;margin:0;padding:0;background:#fff;color:#000}
.contract-page{width:100%;max-width:none;margin:0;padding:0;box-sizing:border-box;font-family:"Times New Roman",serif;font-size:8.35pt;line-height:1.18}
.prepared{text-align:center;color:#000;font-size:7.5pt;margin:0 0 5pt;text-transform:uppercase;letter-spacing:.3pt}
h1{font-size:12.5pt;text-align:center;margin:0 0 2pt;letter-spacing:.3pt;font-weight:bold}
h2{font-size:9.5pt;text-align:center;margin:0 0 4pt;letter-spacing:.3pt;font-weight:bold}
.contract-paragraph{display:block;width:100%;margin:0 0 3.2pt;padding:0;white-space:normal;word-break:normal;overflow-wrap:normal;text-align:justify;text-indent:16pt}
.no-indent{text-indent:0}
.gap{margin-top:2.5pt}.center{text-align:center}.terms{font-weight:bold;font-size:8.75pt;margin:3.5pt 0 2.5pt;text-align:center}
strong{font-weight:700}
.signature-table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:6pt}
.signature-cell{width:50%;text-align:center;vertical-align:bottom;padding-left:14pt;padding-right:14pt}
.signature-header-row{height:26pt}.signature-header-spacer,.company-name,.by-label{line-height:1.18}
.company-name{font-weight:700;font-size:8.5pt}.by-label{font-style:italic;font-size:7.75pt;margin-top:1.5pt;margin-bottom:6pt}
.signature-line-row{height:1px}.signature-line{width:100%;border-top:.7pt solid #000;margin:0;padding:0}
.signature-label-row td{padding-top:2.5pt;vertical-align:top}.signatory-name{font-weight:700;font-size:8.5pt;line-height:1.18}.signatory-role{font-size:7.75pt;color:#000;line-height:1.18}
.witness-signatures{display:grid;grid-template-columns:1fr 1fr;gap:28pt;margin-top:16pt;text-align:center}
.witness-signature-line{border-bottom:.7pt solid #000;height:0}.witness{margin-top:6pt;font-size:8pt;font-weight:bold}.ack{margin-top:8pt}
.ack h3{text-align:center;font-size:8.75pt;margin:0 0 2.5pt}.notary-stack{font-size:8pt;margin-top:3pt;line-height:1.25}
</style></head><body><main class="contract-page">
<p class="prepared no-indent">PREPARED COPY — NOT YET SIGNED OR NOTARIZED</p>
<h1>CONTRACT OF LEASE</h1><h2>${room} — ${term} LEASE</h2>
<p class="contract-paragraph no-indent"><strong>KNOWN TO ALL MEN BY THESE PRESENTS:</strong></p>
<p class="contract-paragraph">This CONTRACT OF LEASE is made and executed in the City of Makati, this <strong>${f.contractExecutionDay || "______"}</strong> day of <strong>${f.contractExecutionMonth && f.contractExecutionYear ? `${f.contractExecutionMonth} ${f.contractExecutionYear}` : "____________________"}</strong>, by and between:</p>
<p class="contract-paragraph"><strong>FIRST JRAC PARTNERSHIP CO.</strong>, a general partnership duly organized and existing under and by virtue of the laws of the Republic of the Philippines, with principal office at 9431 Magallanes St., Guadalupe Nuevo, Makati City, represented herein by its General Partner, <strong>JOANNE ONG</strong>, hereinafter referred to as the <strong>LESSOR</strong>;</p>
<p class="contract-paragraph center no-indent gap">— and —</p>
<p class="contract-paragraph"><strong>${f.tenantLegalName}</strong>, of legal age, Filipino, with postal and residential address at ${f.tenantResidentialAddress.replace(/[,\s]+$/, "")}, hereinafter referred to as the <strong>LESSEE</strong>;</p>
<p class="contract-paragraph no-indent gap"><strong>WITNESSETH: That</strong></p>
<p class="contract-paragraph"><strong>WHEREAS</strong>, the LESSOR is the owner of a residential establishment known as <strong>${propertyName}</strong>, located at ${propertyAddress};</p>
<p class="contract-paragraph"><strong>WHEREAS</strong>, the LESSOR agrees to lease to the LESSEE a <strong>${room}</strong> accommodation known as Room <strong>${f.roomNumber}</strong>${bedPhrase} (the “LEASED PREMISES”) within the said establishment, and the LESSEE is willing to lease the same for a limited time or period;</p>
<p class="contract-paragraph"><strong>NOW THEREFORE</strong>, for and in consideration of the foregoing premises, the LESSOR leases unto the LESSEE and the LESSEE hereby accepts from the LESSOR the LEASED PREMISES, subject to the following:</p>
<p class="terms no-indent">TERMS AND CONDITIONS</p>
<p class="contract-paragraph"><strong>SECTION 1 – PURPOSE.</strong> The leased premises shall be used exclusively by the LESSEE for residential purposes only and shall not be diverted to other uses. It is hereby expressly agreed that if at any time the premises are used for other purposes, the LESSOR shall have the right to rescind this Contract, without prejudice to its other rights under the law.</p>
<p class="contract-paragraph"><strong>SECTION 2 – DURATION.</strong> The lease of the ${leaseSpaceSubject} shall run for a period of <strong>${f.leaseDurationNumber} ( ${f.leaseDurationWords} )</strong> months, from <strong>${f.leaseStartDate}</strong> to <strong>${f.leaseEndDate}</strong>. Being a ${term} LEASE, the period shall be ${durationClause}.</p>
<p class="contract-paragraph"><strong>SECTION 3 – RENTAL RATE.</strong> The regular and basic monthly rental fee is <strong>Php ${f.regularMonthlyRate}</strong> exclusive of any tax. ${discountClause}</p>
<p class="contract-paragraph">${amenitiesClause}</p>
<p class="contract-paragraph">The electricity consumption of the LESSEE, which is not part of the rental fee, shall be billed on a monthly basis.</p>
<p class="contract-paragraph">All payments shall be paid directly to the LESSOR through bank deposit or transfer, supported by an official acknowledgment receipt and/or service invoice.</p>
<p class="contract-paragraph">Delay in the payment of the rental fee or electricity consumption for three (3) consecutive months shall be ground for the LESSOR to terminate this Contract of Lease. In such case, the LESSEE shall voluntarily vacate the leased premises, surrender the key to the LESSOR, and shall no longer be allowed to access the leased premises except to retrieve his or her personal belongings.</p>
<p class="contract-paragraph"><strong>SECTION 4 – DEPOSITS AND ADVANCES.</strong> Upon moving in, the LESSEE shall pay one (1) month advance rent in the amount of <strong>Php ${f.advanceRentAmount}</strong>, covering the period of <strong>${f.advanceCoverageStart}</strong> to <strong>${f.advanceCoverageEnd}</strong>, and one (1) month security deposit in the amount of <strong>Php ${f.securityDepositAmount}</strong>.</p>
<p class="contract-paragraph">The reservation fee of <strong>Php 2,000.00</strong> paid by the LESSEE shall be credited as partial payment for the said amounts. The LESSOR agrees to refund the deposit not later than thirty (30) days after the termination of this Contract, less payment, if any, for unpaid bills of electricity or other utility charges, failure to return the key (<strong>Php 1,000.00</strong>), and the cost of damages to the leased premises occasioned by the LESSEE’s fault or negligence. This deposit, which shall be non-interest bearing, cannot be applied by the LESSEE to any unpaid rent or to the last month’s rental, and shall be kept intact throughout the life of this Contract.</p>
<p class="contract-paragraph">Furthermore, if the LESSEE vacates the premises before the expiration of the period of lease, the full amount of the security deposit shall be forfeited in favor of the LESSOR.</p>
<p class="contract-paragraph"><strong>SECTION 5 – FORCE MAJEURE.</strong> If the whole or any part of the leased premises shall be destroyed or damaged by fire, flood, lightning, typhoon, earthquake, storm, riot, or any other unforeseen disabling cause or act of God, as to render the leased premises during the term substantially unfit for the use and occupation of the LESSEE, then this Contract may be terminated without compensation by either the LESSOR or the LESSEE by notice in writing to the other party.</p>
<p class="contract-paragraph"><strong>SECTION 6 – LESSOR’S RIGHT OF ENTRY.</strong> The LESSOR or its authorized representative shall, after giving due notice to the LESSEE, have the right to enter the premises in the presence of the LESSEE or his or her representative at any reasonable hour to examine the same, make repairs therein, undertake the operation and maintenance of the building, exhibit the leased premises to prospective lessees, or for any other lawful purpose which it may deem necessary.</p>
<p class="contract-paragraph"><strong>SECTION 7 – EXPIRATION OF LEASE.</strong> At the expiration of the term of this lease or the cancellation thereof, as herein provided, the LESSEE shall promptly deliver to the LESSOR the leased premises with all corresponding keys, in as good and tenantable condition as the same is now, ordinary wear and tear excepted, devoid of all occupants, movable furniture, articles, and effects of any kind.</p>
<p class="contract-paragraph"><strong>IN WITNESS WHEREOF</strong>, both parties herein have affixed their signatures on the date and place first above written.</p>
<table class="signature-table">
<tr class="signature-header-row"><td class="signature-cell"><div class="signature-header-spacer">&nbsp;</div></td><td class="signature-cell"><div class="company-name">FIRST JRAC PARTNERSHIP CO.</div><div class="by-label">By:</div></td></tr>
<tr class="signature-line-row"><td class="signature-cell"><div class="signature-line"></div></td><td class="signature-cell"><div class="signature-line"></div></td></tr>
<tr class="signature-label-row"><td class="signature-cell"><div class="signatory-name" style="font-weight:700">LESSEE</div></td><td class="signature-cell"><div class="signatory-name">JOANNE ONG</div><div class="signatory-role">General Partner – LESSOR</div></td></tr>
</table>
<div class="witness">SIGNED IN THE PRESENCE OF:<div class="witness-signatures"><div class="witness-signature-line"></div><div class="witness-signature-line"></div></div></div>
<section class="ack"><h3>ACKNOWLEDGMENT</h3><p class="contract-paragraph no-indent">REPUBLIC OF THE PHILIPPINES&nbsp; )<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ) S.S.</p>
<p class="contract-paragraph">BEFORE ME, this _____ day of ____________________, personally appeared the above-named parties, all known to me and to known to be the same persons who executed the foregoing instrument, and who acknowledged to me that the same is their free and voluntary act and deed.</p>
<p class="contract-paragraph">This instrument, consisting of _____ ( ____ ) page/s, including the page on which this acknowledgment is written, has been signed on each and every page thereof by the concerned parties and their witnesses, and sealed with my notarial seal.</p>
<p class="contract-paragraph">WITNESS MY HAND AND SEAL, on the date and place first above written.</p>
<div class="notary-stack"><div>Doc. No. _______;</div><div>Page No. _______;</div><div>Book No. _______;</div><div>Series of _______.</div></div></section>
</main></body></html>`;
};

export const renderContractHtmlPdf = async (data) => {
  const runtime = await resolveContractChromium();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: runtime.executablePath,
      args: runtime.args,
      timeout: 30_000,
    });
  } catch (error) {
    throw browserUnavailableError(error);
  }

  try {
    const page = await browser.newPage();
    try {
      await page.setContent(buildContractHtml(data), { waitUntil: "load", timeout: 30_000 });
      const bytes = await page.pdf({
        width: "8.5in", height: "13in", printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });

      const doc = await PDFDocument.load(bytes);
      const tenantName = data.fields?.tenantLegalName || "Tenant";
      const contractNumber = data.contractNumber || data.fields?.contractNumber || "";
      const docTitle = contractNumber
        ? `Contract of Lease - ${tenantName} (${contractNumber})`
        : `Contract of Lease - ${tenantName}`;
      doc.setTitle(docTitle);
      doc.setSubject(`Contract of Lease - ${data.property?.propertyName || "Lilycrest Dormitory"}`);
      doc.setAuthor("Lilycrest Dormitory Management System");
      doc.setCreator("Lilycrest Dormitory");
      doc.setProducer("Lilycrest Dormitory");
      const stampedBytes = await doc.save();
      return Buffer.from(stampedBytes);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
};
