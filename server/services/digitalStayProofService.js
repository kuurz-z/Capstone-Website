import { resolveLegalLeaseType } from "../config/contractLegalTerm.js";
import mongoose from "mongoose";
import dayjs from "dayjs";
import { chromium } from "playwright-core";
import { Contract, Reservation, Room, Stay, User } from "../models/index.js";
import { resolveContractChromium, browserUnavailableError } from "./contractChromiumService.js";
import { selectCanonicalTenantContract } from "./tenantContractSelectionService.js";
import { renderContractHtmlPdf, buildContractHtml } from "./contractHtmlPdfService.js";
import { resolveRoomDiscountPricing } from "./contractPricingResolver.js";
import { resolveContractBranch } from "../config/contractConfig.js";
import { normalizeAddress, normalizeReservationAddress } from "../utils/addressUtils.js";
import { resolveSignedScanForContract } from "./signedContractScanResolver.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const formatMoney = (val) => val == null ? "—" : `₱${Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const formatDate = (val) => val ? dayjs(val).format("MMMM D, YYYY") : "—";

/**
 * Generates a clean, crisp, high-density SVG QR code representation for verification links
 */
function generateQrSvg(text, size = 110) {
  // Deterministic seed based on verification URL to render crisp realistic QR matrix
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="100" height="100" fill="#FFFFFF"/>
    <!-- Position Detection Patterns (Top Left, Top Right, Bottom Left) -->
    <rect x="6" y="6" width="28" height="28" fill="#0A1628"/>
    <rect x="10" y="10" width="20" height="20" fill="#FFFFFF"/>
    <rect x="14" y="14" width="12" height="12" fill="#0A1628"/>
    
    <rect x="66" y="6" width="28" height="28" fill="#0A1628"/>
    <rect x="70" y="10" width="20" height="20" fill="#FFFFFF"/>
    <rect x="74" y="14" width="12" height="12" fill="#0A1628"/>
    
    <rect x="6" y="66" width="28" height="28" fill="#0A1628"/>
    <rect x="10" y="70" width="20" height="20" fill="#FFFFFF"/>
    <rect x="14" y="74" width="12" height="12" fill="#0A1628"/>

    <!-- Timing Patterns -->
    <rect x="38" y="10" width="4" height="4" fill="#0A1628"/>
    <rect x="46" y="10" width="4" height="4" fill="#0A1628"/>
    <rect x="54" y="10" width="4" height="4" fill="#0A1628"/>
    <rect x="38" y="18" width="4" height="4" fill="#0A1628"/>
    <rect x="50" y="18" width="4" height="4" fill="#0A1628"/>
    <rect x="58" y="18" width="4" height="4" fill="#0A1628"/>
    
    <rect x="10" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="10" y="46" width="4" height="4" fill="#0A1628"/>
    <rect x="10" y="54" width="4" height="4" fill="#0A1628"/>
    <rect x="18" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="18" y="50" width="4" height="4" fill="#0A1628"/>

    <!-- Data Matrix Patterns -->
    <rect x="38" y="38" width="24" height="24" fill="#F1F5F9"/>
    <rect x="42" y="42" width="16" height="16" fill="#0A1628"/>
    <rect x="46" y="46" width="8" height="8" fill="#FFFFFF"/>
    <rect x="48" y="48" width="4" height="4" fill="#0A1628"/>

    <rect x="38" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="44" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="50" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="56" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="72" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="78" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="84" y="38" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="46" width="4" height="4" fill="#0A1628"/>
    <rect x="78" y="46" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="54" width="4" height="4" fill="#0A1628"/>
    <rect x="74" y="54" width="4" height="4" fill="#0A1628"/>
    <rect x="82" y="54" width="4" height="4" fill="#0A1628"/>
    <rect x="90" y="54" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="74" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="82" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="90" y="66" width="4" height="4" fill="#0A1628"/>
    <rect x="38" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="46" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="54" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="78" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="86" y="74" width="4" height="4" fill="#0A1628"/>
    <rect x="38" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="50" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="58" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="70" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="82" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="90" y="82" width="4" height="4" fill="#0A1628"/>
    <rect x="42" y="90" width="4" height="4" fill="#0A1628"/>
    <rect x="54" y="90" width="4" height="4" fill="#0A1628"/>
    <rect x="66" y="90" width="4" height="4" fill="#0A1628"/>
    <rect x="74" y="90" width="4" height="4" fill="#0A1628"/>
    <rect x="86" y="90" width="4" height="4" fill="#0A1628"/>
  </svg>`;
}

/**
 * Resolves full stay proof data from any valid stay, contract, reservation, or reference code
 */
export async function resolveDigitalStayProofData({ tenantId, reservationId, contractId, id, referenceCode }) {
  let contract = null;
  let reservation = null;
  let stay = null;
  let user = null;
  let room = null;

  const rawTarget = id || contractId || reservationId || tenantId || referenceCode;
  const isObjectId = rawTarget && mongoose.isValidObjectId(rawTarget);

  // 1. Search contract by ObjectId or contractNumber
  if (rawTarget) {
    if (isObjectId) {
      contract = await Contract.findById(rawTarget).lean();
    }
    if (!contract && typeof rawTarget === "string") {
      const cleanRef = rawTarget.trim();
      contract = await Contract.findOne({
        $or: [
          { contractNumber: cleanRef },
          { contractNumber: cleanRef.toUpperCase() },
          { contractNumber: cleanRef.replace(/^LIL-/i, "") },
          { contractNumber: `LIL-${cleanRef}` },
        ],
      }).lean();
    }
  }

  // 2. Search reservation by ObjectId or reservationCode
  if (!contract && rawTarget) {
    if (isObjectId) {
      reservation = await Reservation.findById(rawTarget).populate("roomId").lean();
    }
    if (!reservation && typeof rawTarget === "string") {
      const cleanRef = rawTarget.trim();
      reservation = await Reservation.findOne({
        $or: [
          { reservationCode: cleanRef },
          { reservationCode: cleanRef.toUpperCase() },
          { reservationCode: cleanRef.replace(/^LIL-/i, "") },
          { reservationCode: `LIL-${cleanRef}` },
        ],
      }).populate("roomId").lean();
    }
  }

  // 3. Search user by ObjectId
  if (!contract && !reservation && rawTarget && isObjectId) {
    user = await User.findById(rawTarget).lean();
  }

  // 4. Resolve linkages if contract is present
  if (contract) {
    tenantId = tenantId || contract.tenantId;
    reservationId = reservationId || contract.reservationId;
    if (contract.roomId && mongoose.isValidObjectId(contract.roomId)) {
      room = await Room.findById(contract.roomId).lean();
    }
  }

  // 5. If tenantId available and user not loaded yet
  if (tenantId && !user && mongoose.isValidObjectId(tenantId)) {
    user = await User.findById(tenantId).lean();
  }

  // 6. If reservationId available and reservation not loaded yet
  if (reservationId && !reservation && mongoose.isValidObjectId(reservationId)) {
    reservation = await Reservation.findById(reservationId).populate("roomId").lean();
  }

  // 7. If user is found, lookup active stay or confirmed paid reservation
  if (!reservation && user?._id) {
    reservation = await Reservation.findOne({
      userId: user._id,
      status: { $in: ["reserved", "moveIn", "checked_in", "active", "confirmed"] },
    }).sort({ createdAt: -1 }).populate("roomId").lean();
  }

  // 8. Extract room and stay from reservation
  if (reservation) {
    if (!room && reservation.roomId) {
      room = reservation.roomId;
    }
    if (!user && reservation.userId && mongoose.isValidObjectId(reservation.userId)) {
      user = await User.findById(reservation.userId).lean();
    }
    if (reservation.currentStayId && mongoose.isValidObjectId(reservation.currentStayId)) {
      stay = await Stay.findById(reservation.currentStayId).lean();
    }
  }

  // 9. If contract not loaded yet, select canonical contract for user
  if (!contract && user?._id) {
    const contracts = await Contract.find({ tenantId: user._id, archivedAt: null }).sort({ createdAt: -1 }).lean();
    contract = selectCanonicalTenantContract({ contracts, activeStay: stay, includeEarlyStages: true });
  }

  // 10. Fallback room extraction from contract
  if (!room && contract?.roomId && mongoose.isValidObjectId(contract.roomId)) {
    room = await Room.findById(contract.roomId).lean();
  }

  if (!user && !reservation && !contract) {
    const err = new Error("No active stay or confirmed paid reservation record found.");
    err.code = "STAY_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }

  if (!stay && !contract && (!reservation || !["reserved", "moveIn", "checked_in", "active", "confirmed"].includes(reservation.status))) {
    const err = new Error("No active stay or confirmed paid reservation record found.");
    err.code = "STAY_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }

  // Canonical signed-scan identity for the resolved Contract (lineage-aware
  // for a Room Transfer Addendum). The Digital Lease viewer (Admin + Tenant)
  // reads this instead of guessing from the `contract` prop's signedDocuments.
  const signedScan = contract
    ? await resolveSignedScanForContract(contract).catch(() => null)
    : null;

  const applicantName = [
    reservation?.firstName,
    reservation?.middleName,
    reservation?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const tenantName =
    contract?.tenantLegalName ||
    applicantName ||
    reservation?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    "Valued Tenant";

  const rawBranch = room?.branch || contract?.branch || reservation?.branch || "";
  // resolveContractBranch (contractConfig.js) is the same canonical
  // branch/property source contractGenerationDataService.js uses for the
  // official prepared Contract PDF — keyed by the stable branch id
  // ("gil-puyat" | "guadalupe" from ROOM_BRANCHES), not by matching
  // substrings of a display string. Previously this resolved branchAddress
  // by string-matching a title-cased display name, which only recognized
  // "guadalupe" (and a "poblacion" branch that has never existed in
  // ROOM_BRANCHES) and silently fell every other real branch — including
  // Gil Puyat — through to a fabricated generic "Lilycrest Dormitory
  // Residence, Metro Manila" address, in both this admin/tenant preview and
  // the stay-proof PDF rendered from it.
  let branchConfig = null;
  try {
    branchConfig = resolveContractBranch(rawBranch);
  } catch {
    branchConfig = null;
  }

  const branchName = branchConfig
    ? branchConfig.propertyName.replace(/^LILYCREST\s+/i, "")
    : (rawBranch || "Guadalupe Branch")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  const propertyName = branchConfig?.propertyName || `LILYCREST ${branchName.toUpperCase()}`;
  const branchAddress = branchConfig?.propertyAddress || "Address not available";

  const branchContact = "+63 (02) 8890-5459 &bull; info@lilycrest.ph";

  const rawRef = contract?.contractNumber || reservation?.reservationCode || `LIL-${(user?._id || "RES").toString().slice(-8).toUpperCase()}`;
  const referenceNumber = rawRef.startsWith("LIL-") ? rawRef : `LIL-${rawRef}`;

  const rawRoomType = String(
    room?.type ||
    contract?.roomType ||
    reservation?.pricingSnapshot?.roomType ||
    reservation?.preferredRoomType ||
    reservation?.roomType ||
    "double_sharing"
  ).toLowerCase();
  const isPrivate = rawRoomType.includes("private") || room?.capacity === 1;

  const roomNumber =
    room?.roomNumber ||
    room?.name ||
    contract?.roomNumber ||
    reservation?.preferredRoomNumber ||
    reservation?.room ||
    (isPrivate ? "Private Room" : "Dorm Room");
  const rawBed =
    contract?.bedLabel ||
    reservation?.selectedBed?.code ||
    reservation?.selectedBed?.position ||
    reservation?.bed ||
    reservation?.bedPosition ||
    (isPrivate ? "Entire Room" : "Bed 1");
  const formattedBed = isPrivate
    ? "Entire Room"
    : String(rawBed).replace(/^upper$/i, "Upper Bed").replace(/^lower$/i, "Lower Bed");

  const leaseStartDate = contract?.leaseStartDate || reservation?.intendedMoveInDate || stay?.leaseStartDate || reservation?.createdAt || new Date();
  const leaseEndDate = contract?.leaseEndDate || reservation?.moveOut || stay?.leaseEndDate || dayjs(leaseStartDate).add(6, "month").toDate();
  const leaseDurationMonths = contract?.leaseDurationMonths || Math.max(1, dayjs(leaseEndDate).diff(dayjs(leaseStartDate), "month")) || 6;

  let monthlyRent = Number(
    contract?.approvedMonthlyRate ??
    reservation?.pricingSnapshot?.finalMonthlyRate ??
    reservation?.pricingDisplay?.finalMonthlyRate ??
    reservation?.monthlyRent ??
    room?.rate ??
    room?.monthlyPrice ??
    room?.price ??
    0
  );

  if ((isPrivate && (monthlyRent <= 0 || monthlyRent < 10000)) || monthlyRent <= 0) {
    try {
      const roomPricing = resolveRoomDiscountPricing(rawRoomType || (isPrivate ? "private" : "double_sharing"), {}, room || {});
      monthlyRent = leaseDurationMonths >= (roomPricing.longTermLeaseMinMonths || 6)
        ? (roomPricing.monthlyPrice || (isPrivate ? 13500 : 5400))
        : (roomPricing.shortTermRate || (isPrivate ? 16000 : 6000));
    } catch {
      monthlyRent = isPrivate ? 13500 : 5400;
    }
  }

  let securityDeposit = Number(contract?.securityDepositAmount ?? reservation?.securityDeposit ?? monthlyRent);
  let advanceRent = Number(contract?.advanceRentAmount ?? reservation?.advanceRent ?? monthlyRent);

  if (isPrivate && (advanceRent < 10000 || advanceRent < monthlyRent)) {
    advanceRent = monthlyRent;
  }
  if (isPrivate && (securityDeposit < 10000 || securityDeposit < monthlyRent)) {
    securityDeposit = monthlyRent;
  }
  if (monthlyRent > 0 && advanceRent < monthlyRent) {
    advanceRent = monthlyRent;
  }
  if (monthlyRent > 0 && securityDeposit < monthlyRent) {
    securityDeposit = monthlyRent;
  }

  let regularMonthlyRate = contract?.regularMonthlyRate ?? reservation?.pricingSnapshot?.regularMonthlyRate ?? reservation?.pricingDisplay?.regularMonthlyRate ?? null;
  let discountPercentage = contract?.discountPercentage ?? reservation?.pricingSnapshot?.discountPercentage ?? reservation?.pricingDisplay?.discountPercentage ?? null;
  let discountAmount = contract?.discountAmount ?? reservation?.pricingSnapshot?.discountAmount ?? reservation?.pricingDisplay?.discountAmount ?? null;

  if (regularMonthlyRate == null && rawRoomType) {
    try {
      const roomPricing = resolveRoomDiscountPricing(rawRoomType, {}, room || {});
      regularMonthlyRate = leaseDurationMonths >= (roomPricing.longTermLeaseMinMonths || 6)
        ? roomPricing.regularLongRate
        : roomPricing.regularShortRate;
      if (discountPercentage == null) {
        discountPercentage = leaseDurationMonths >= (roomPricing.longTermLeaseMinMonths || 6)
          ? roomPricing.longTermDiscountPercent
          : 0;
      }
    } catch {
      // fallback to safe derivation below
    }
  }

  if (regularMonthlyRate == null && monthlyRent > 0) {
    if (discountPercentage != null && discountPercentage > 0 && discountPercentage < 100) {
      regularMonthlyRate = Math.round(monthlyRent / (1 - discountPercentage / 100));
    } else {
      regularMonthlyRate = monthlyRent;
    }
  }

  if (discountPercentage == null && regularMonthlyRate && regularMonthlyRate > monthlyRent) {
    discountPercentage = Math.round(((regularMonthlyRate - monthlyRent) / regularMonthlyRate) * 100);
  }
  if (discountAmount == null && regularMonthlyRate && monthlyRent) {
    discountAmount = Math.max(0, regularMonthlyRate - monthlyRent);
  }

  const discountType = (discountPercentage > 0) ? "percentage" : "none";

  const verificationUrl = `https://lilycrest.ph/verify-stay/${referenceNumber}`;
  const qrCodeSvg = generateQrSvg(verificationUrl, 110);

  // Contract.tenantAddress (when a Contract exists) is the same authoritative
  // creation-time snapshot the real lease PDF is generated from — prefer it
  // over reconstructing from Reservation/User so this preview can't diverge
  // from the actual contract. User.address is a plain string field (not an
  // object — there is no User.address.street), so it must be read directly;
  // reading `.street` off it was always undefined and this branch could
  // never actually resolve to it.
  const resolvedTenantAddress =
    contract?.tenantAddress ||
    (typeof reservation?.address === "string"
      ? normalizeAddress(reservation.address).value
      : normalizeReservationAddress(reservation?.address)) ||
    (typeof user?.address === "string" ? user.address.trim() : "") ||
    "—";

  return {
    referenceNumber,
    // Canonical Contract identity + signed-scan pointer so DigitalContractPaper
    // (Admin + Tenant) no longer depends on the `contract` prop being fully
    // populated to render the Signed Scan tab.
    contractId: contract ? String(contract._id || contract.id || "") : null,
    contractNumber: contract?.contractNumber || referenceNumber,
    contractPurpose: contract?.contractPurpose || null,
    signedScan,
    tenantId: String(user?._id || ""),
    tenantName,
    tenantEmail: user?.email || reservation?.email || "—",
    tenantPhone: user?.phone || user?.emergencyPhone || reservation?.emergencyPhone || "—",
    tenantAddress: resolvedTenantAddress,
    // DigitalContractPaper.jsx (both Admin's and the tenant's own "Digital
    // Contract" view) reads this exact field name — without it, that
    // component silently fell back to a hardcoded sample address.
    tenantResidentialAddress: resolvedTenantAddress,
    emergencyContact: user?.emergencyContactName || reservation?.emergencyContactName || "—",
    emergencyPhone: user?.emergencyContactPhone || reservation?.emergencyContactPhone || user?.emergencyPhone || "—",
    branchName,
    propertyName,
    branchAddress,
    propertyAddress: branchAddress,
    branchContact,
    roomNumber,
    bedLabel: isPrivate ? "Entire Room" : formattedBed,
    roomType: (room?.type || contract?.roomType || reservation?.roomType || "Standard Dormitory Accommodation").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    isPrivate,
    leaseStartDate,
    leaseEndDate,
    leaseDurationMonths,
    monthlyRent,
    // DigitalContractPaper.jsx (both Admin's and the tenant's own "Digital
    // Contract" preview) reads these canonical Contract-schema field names,
    // not monthlyRent/securityDeposit/advanceRent — without these aliases,
    // its `stayData?.approvedMonthlyRate ?? contract?.approvedMonthlyRate`
    // read always missed stayData (this object never had that key) and
    // depended entirely on the `contract` prop happening to be populated;
    // when it wasn't (e.g. a just-created Contract the admin's separate
    // /contracts list fetch hadn't caught up on yet), the component fell
    // through to its own hardcoded placeholder (₱13,500 for a private
    // room) instead of the real approved rate — even though the actual
    // generated PDF (a different code path, contractGenerationDataService.js)
    // rendered the correct amount the whole time.
    approvedMonthlyRate: monthlyRent,
    advanceRentAmount: advanceRent,
    securityDepositAmount: securityDeposit,
    regularMonthlyRate: regularMonthlyRate ?? monthlyRent,
    discountPercentage: discountPercentage ?? 0,
    discountAmount: discountAmount ?? 0,
    discountType,
    securityDeposit,
    advanceRent,
    status: "ACTIVE",
    verificationStatus: "VERIFIED ACTIVE STAY",
    verificationUrl,
    qrCodeSvg,
    issuedAt: new Date(),
  };
}

/**
 * Builds standard 2-page print-ready HTML for the Digital Stay Proof & Agreement
 */
export function buildDigitalStayProofHtml(data) {
  const f = {
    ref: escapeHtml(data.referenceNumber),
    name: escapeHtml(data.tenantName),
    email: escapeHtml(data.tenantEmail),
    phone: escapeHtml(data.tenantPhone),
    address: escapeHtml(data.tenantAddress),
    emergencyContact: escapeHtml(data.emergencyContact || "—"),
    emergencyPhone: escapeHtml(data.emergencyPhone || "—"),
    branch: escapeHtml(data.branchName),
    branchAddress: escapeHtml(data.branchAddress),
    branchContact: data.branchContact || "+63 (02) 8890-5459 &bull; info@lilycrest.ph",
    room: escapeHtml(data.roomNumber),
    bed: escapeHtml(data.bedLabel),
    roomType: escapeHtml(data.roomType),
    startDate: formatDate(data.leaseStartDate),
    endDate: formatDate(data.leaseEndDate),
    duration: `${data.leaseDurationMonths} Months`,
    monthlyRent: formatMoney(data.monthlyRent),
    securityDeposit: formatMoney(data.securityDeposit),
    advanceRent: formatMoney(data.advanceRent),
    issuedDate: formatDate(data.issuedAt),
    verificationUrl: escapeHtml(data.verificationUrl),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Digital Proof of Stay - ${f.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      overflow: hidden;
      padding: 15mm 18mm;
      position: relative;
      background: #FFFFFF;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sheet:last-child {
      page-break-after: auto;
    }
    
    /* Top Letterhead */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0A1628;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-emblem {
      width: 38px;
      height: 38px;
      background: #0A1628;
      color: #FFFFFF;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 19px;
      font-weight: 900;
      letter-spacing: -0.05em;
    }
    .brand-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0A1628;
      margin: 0;
      text-transform: uppercase;
      line-height: 1.15;
    }
    .brand-subtitle {
      font-size: 10px;
      color: #475569;
      margin: 2px 0 0;
      font-weight: 500;
    }
    .meta-box {
      text-align: right;
    }
    .meta-ref {
      font-size: 11.5px;
      font-weight: 700;
      font-family: monospace;
      color: #0A1628;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      padding: 2.5px 7px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 2px;
    }
    .meta-date {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 500;
    }

    /* Document Banner */
    .banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-left: 4px solid #E8734A;
      border-radius: 6px;
      padding: 8px 14px;
      margin-bottom: 10px;
    }
    .banner-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0A1628;
      margin: 0;
    }
    .banner-desc {
      font-size: 9.5px;
      color: #64748B;
      margin: 1px 0 0;
    }
    .status-badge {
      background: #DCFCE7;
      border: 1px solid #86EFAC;
      color: #166534;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 16px;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    /* Certification Statement */
    .cert-preamble {
      font-size: 10px;
      line-height: 1.4;
      color: #334155;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 10px;
    }

    /* Grid Sections */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .panel {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px 12px;
      background: #FFFFFF;
    }
    .panel-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #E8734A;
      border-bottom: 1px solid #F1F5F9;
      padding-bottom: 4px;
      margin: 0 0 7px;
    }
    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      padding: 2.5px 0;
      border-bottom: 1px dotted #F1F5F9;
    }
    .data-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .data-label {
      color: #64748B;
      font-weight: 500;
    }
    .data-val {
      color: #0F172A;
      font-weight: 600;
      text-align: right;
      max-width: 60%;
      word-break: break-word;
    }

    /* QR Code Verification Box */
    .qr-card {
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: #F8FAFC;
    }
    .qr-svg {
      flex-shrink: 0;
      width: 90px;
      height: 90px;
      background: #FFFFFF;
      padding: 4px;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
    }
    .qr-info {
      flex: 1;
      font-size: 9.5px;
      line-height: 1.4;
      color: #475569;
    }
    .qr-info strong {
      color: #0A1628;
      font-size: 11px;
      display: block;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .qr-url {
      font-family: monospace;
      font-size: 9px;
      color: #1E40AF;
      margin-top: 4px;
      background: #EFF6FF;
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-block;
      border: 1px solid #DBEAFE;
    }

    /* Footer */
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 8.5px;
      color: #64748B;
      line-height: 1.35;
    }
    .stamp-box {
      text-align: right;
    }
    .stamp-badge {
      font-size: 9px;
      font-weight: 800;
      color: #0A1628;
      border: 1.5px solid #0A1628;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 2px;
      letter-spacing: 0.04em;
    }

    /* Page 2: Rules */
    .rules-container {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: 6px;
    }
    .rule-card {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 8px 11px;
      background: #FFFFFF;
    }
    .rule-title {
      font-size: 10px;
      font-weight: 800;
      color: #0A1628;
      margin: 0 0 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rule-title-pill {
      background: #F1F5F9;
      color: #0A1628;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .rule-body {
      font-size: 9px;
      line-height: 1.4;
      color: #334155;
      margin: 0;
    }
    .ack-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-left: 3px solid #0A1628;
      border-radius: 6px;
      padding: 9px 12px;
      margin-top: 8px;
    }
    .ack-title {
      font-size: 10px;
      font-weight: 800;
      color: #0A1628;
      margin: 0 0 3px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .ack-text {
      font-size: 9px;
      line-height: 1.35;
      color: #475569;
      margin: 0;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }
    .sig-box {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 7px 10px;
      background: #FFFFFF;
    }
    .sig-header {
      font-size: 8.5px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .sig-name {
      font-size: 10px;
      font-weight: 700;
      color: #0A1628;
    }
    .sig-meta {
      font-size: 8px;
      color: #059669;
      font-weight: 600;
      margin-top: 1px;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: OFFICIAL DIGITAL STAY CERTIFICATE -->
  <div class="sheet">
    <div>
      <!-- Letterhead -->
      <div class="header">
        <div class="brand-wrap">
          <div class="brand-emblem">L</div>
          <div>
            <h1 class="brand-title">Lilycrest Dormitory</h1>
            <p class="brand-subtitle">${f.branch} &bull; ${f.branchAddress}</p>
            <p class="brand-subtitle" style="color: #64748B;">Contact: ${f.branchContact}</p>
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-ref">${f.ref}</div>
          <div class="meta-date">Issued: ${f.issuedDate}</div>
        </div>
      </div>

      <!-- Banner -->
      <div class="banner">
        <div>
          <h2 class="banner-title">Official Certificate of Stay</h2>
          <p class="banner-desc">Digital Certificate of Bona Fide Tenancy &amp; Residence</p>
        </div>
        <div class="status-badge">
          <span>●</span> VERIFIED ACTIVE STAY
        </div>
      </div>

      <!-- Certification Preamble -->
      <div class="cert-preamble">
        <strong>TO WHOM IT MAY CONCERN:</strong> This is to officially certify that the resident identified below is a duly registered and active occupant in good standing at Lilycrest Dormitory under the authorized tenancy specifications detailed herein.
      </div>

      <!-- Identity & Room Grid -->
      <div class="grid-2">
        <div class="panel">
          <h3 class="panel-title">Resident Profile</h3>
          <div class="data-row">
            <span class="data-label">Full Legal Name:</span>
            <span class="data-val">${f.name}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Email Address:</span>
            <span class="data-val">${f.email}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Contact Phone:</span>
            <span class="data-val">${f.phone}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Permanent City:</span>
            <span class="data-val">${f.address}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Emergency Person:</span>
            <span class="data-val">${f.emergencyContact}</span>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">Room &amp; Bed Assignment</h3>
          <div class="data-row">
            <span class="data-label">Branch Location:</span>
            <span class="data-val">${f.branch}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Room Number:</span>
            <span class="data-val">Room ${f.room}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Bed Position:</span>
            <span class="data-val">${f.bed}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Accommodation:</span>
            <span class="data-val">${f.roomType}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Key Status:</span>
            <span class="data-val">Issued &amp; Checked-In</span>
          </div>
        </div>
      </div>

      <!-- Tenancy & Financial Grid -->
      <div class="grid-2">
        <div class="panel">
          <h3 class="panel-title">Tenancy Validity Period</h3>
          <div class="data-row">
            <span class="data-label">Lease Start Date:</span>
            <span class="data-val">${f.startDate}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Lease End Date:</span>
            <span class="data-val">${f.endDate}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Contract Duration:</span>
            <span class="data-val">${f.duration}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Billing Cycle:</span>
            <span class="data-val">Monthly Anniversary</span>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">Financial Record Summary</h3>
          <div class="data-row">
            <span class="data-label">Monthly Rental Rate:</span>
            <span class="data-val">${f.monthlyRent} / mo</span>
          </div>
          <div class="data-row">
            <span class="data-label">Security Deposit Held:</span>
            <span class="data-val">${f.securityDeposit}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Advance Rent Applied:</span>
            <span class="data-val">${f.advanceRent}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Utility Distribution:</span>
            <span class="data-val">Pro-rata Submetered</span>
          </div>
        </div>
      </div>

      <!-- QR Code Verification Card -->
      <div class="qr-card">
        <div class="qr-svg">${data.qrCodeSvg}</div>
        <div class="qr-info">
          <strong>Digital Authenticity &amp; Live Verification</strong>
          This document serves as authorized proof of residency at Lilycrest Dormitory. Employers, educational institutions, and building authorities can scan the QR code or visit the URL below to verify active credentials in real time.
          <div>
            <span class="qr-url">${f.verificationUrl}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Seal -->
    <div class="footer">
      <div>
        Lilycrest Dormitory Management System &bull; Official Digital Tenancy Record<br>
        Electronically generated and authenticated &bull; Valid without physical stamp
      </div>
      <div class="stamp-box">
        <div class="stamp-badge">VERIFIED RESIDENCE</div>
        <div>Lilycrest Administration</div>
      </div>
    </div>
  </div>

  <!-- PAGE 2: HOUSE RULES & RESIDENCY AGREEMENT -->
  <div class="sheet">
    <div>
      <!-- Letterhead -->
      <div class="header">
        <div class="brand-wrap">
          <div class="brand-emblem">L</div>
          <div>
            <h1 class="brand-title">Dormitory Rules &amp; Residency Agreement</h1>
            <p class="brand-subtitle">Lilycrest Dormitory &bull; Key Policies &amp; Community Standards</p>
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-ref">${f.ref}</div>
          <div class="meta-date">Page 2 of 2</div>
        </div>
      </div>

      <!-- 5 Essential Rules -->
      <div class="rules-container">
        <div class="rule-card">
          <div class="rule-title">
            <span class="rule-title-pill">01</span>
            1. Monthly Rental &amp; Billing Policy
          </div>
          <p class="rule-body">
            Monthly rent is due on the designated monthly anniversary date. Digital invoices and electricity submeter statements are issued directly to the Lilycrest Tenant Portal. Prompt settlement within the 5-day grace period is required to maintain room reservation standing.
          </p>
        </div>

        <div class="rule-card">
          <div class="rule-title">
            <span class="rule-title-pill">02</span>
            2. Electricity &amp; Submeter Utility Distribution
          </div>
          <p class="rule-body">
            Room electricity (air conditioning, personal sockets) is monitored via dedicated digital submeters and divided pro-rata among room occupants each billing cycle. Base lighting and common lounge utilities are included in standard accommodation fees.
          </p>
        </div>

        <div class="rule-card">
          <div class="rule-title">
            <span class="rule-title-pill">03</span>
            3. Building Security, Curfew &amp; Visitor Guidelines
          </div>
          <p class="rule-body">
            Main entrance security is active 24/7. External visitors must present valid government ID at reception and are permitted only in designated ground-floor visitor lounges between 8:00 AM and 8:00 PM. Overnight non-resident guests are strictly prohibited.
          </p>
        </div>

        <div class="rule-card">
          <div class="rule-title">
            <span class="rule-title-pill">04</span>
            4. Room Cleanliness, Upkeep &amp; Prohibited Items
          </div>
          <p class="rule-body">
            Residents must maintain hygienic bedroom conditions. For fire safety, open flames, cooking stoves, hot plates, and unapproved high-wattage heating coils are strictly prohibited inside bedrooms. Common kitchen facilities are provided on residential floors.
          </p>
        </div>

        <div class="rule-card">
          <div class="rule-title">
            <span class="rule-title-pill">05</span>
            5. Move-Out Notice &amp; Security Deposit Refund
          </div>
          <p class="rule-body">
            A written 30-day notice prior to checkout is required. Security deposits are processed and refunded within thirty (30) days following checkout inspection, room key turnover, and final settlement of all outstanding electric/utility charges.
          </p>
        </div>
      </div>

      <!-- Resident Digital Consent -->
      <div class="ack-card">
        <h4 class="ack-title">Resident Digital Acknowledgment &amp; Consent</h4>
        <p class="ack-text">
          By moving into Lilycrest Dormitory and maintaining active residency, the resident (<strong>${f.name}</strong>) confirms having read, understood, and agreed to adhere to all building policies, safety protocols, and dormitory standards throughout their stay.
        </p>
      </div>

      <!-- Dual Sign-off Blocks -->
      <div class="sig-grid">
        <div class="sig-box">
          <div class="sig-header">Resident Digital Consent</div>
          <div class="sig-name">${f.name}</div>
          <div class="sig-meta">&#10003; Digitally Accepted upon Check-In</div>
        </div>
        <div class="sig-box">
          <div class="sig-header">Lilycrest Dormitory Management</div>
          <div class="sig-name">Authorized Administration</div>
          <div class="sig-meta">&#10003; Verified &amp; Digitally Authenticated</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>
        Lilycrest Dormitory Management System &bull; Electronic Agreement Copy<br>
        Document Reference: ${f.ref} &bull; Generated: ${f.issuedDate}
      </div>
      <div class="stamp-box">
        <div class="stamp-badge">TERMS ACKNOWLEDGED</div>
        <div>System Verified</div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

const numberWords = Object.freeze([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
]);

const durationInWords = (value) => {
  const number = Number(value);
  if (numberWords[number]) return numberWords[number];
  if (number > 20 && number < 100) {
    const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    return number % 10 ? `${tens[Math.floor(number / 10)]}-${numberWords[number % 10]}` : tens[Math.floor(number / 10)];
  }
  return String(value);
};

const ordinalDay = (value) => {
  const day = Number(dayjs(value).format("D"));
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
  return `${day}${suffix}`;
};

export function mapStayDataToContractPayload(stayData) {
  const rawRoom = String(stayData.roomType || "").toLowerCase();
  let roomType = "double_sharing";
  if (rawRoom.includes("private")) {
    roomType = "private";
  } else if (rawRoom.includes("quad") || rawRoom.includes("4")) {
    roomType = "quadruple_sharing";
  } else {
    roomType = "double_sharing";
  }

  const durationMonths = Number(stayData.leaseDurationMonths) || 6;
  const leaseType = resolveLegalLeaseType(durationMonths);
  const templateId = `${roomType.replace(/_/g, "-")}-${leaseType}`;

  const executionDate = stayData.issuedAt || new Date();
  const startDate = dayjs(stayData.leaseStartDate || new Date());
  const endDate = dayjs(stayData.leaseEndDate || startDate.add(durationMonths, "month"));
  const advanceEnd = startDate.add(1, "month").subtract(1, "day");

  const monthlyRent = Number(stayData.monthlyRent) || 0;
  let regularRate = Number(stayData.regularMonthlyRate) || 0;
  let discountPercentage = Number(stayData.discountPercentage ?? 0);

  if (!regularRate || regularRate <= 0) {
    if (discountPercentage > 0 && discountPercentage < 100 && monthlyRent > 0) {
      regularRate = Math.round(monthlyRent / (1 - discountPercentage / 100));
    } else {
      regularRate = monthlyRent;
    }
  }

  const discountAmount = Math.max(0, regularRate - monthlyRent);
  if (discountPercentage === 0 && regularRate > monthlyRent) {
    discountPercentage = Math.round((discountAmount / regularRate) * 100);
  }

  const isPrivate = roomType === "private";

  return {
    template: {
      templateId,
      roomType,
      leaseType,
    },
    fields: {
      contractExecutionDay: ordinalDay(executionDate),
      contractExecutionMonth: dayjs(executionDate).format("MMMM"),
      contractExecutionYear: dayjs(executionDate).format("YYYY"),
      tenantLegalName: stayData.tenantName || "Valued Resident",
      tenantResidentialAddress: stayData.tenantAddress || "Makati City, Metro Manila",
      roomNumber: String(stayData.roomNumber || "305"),
      bedOrSlotNumber: isPrivate ? "" : String(stayData.bedLabel || "1"),
      leaseDurationNumber: durationMonths,
      leaseDurationWords: durationInWords(durationMonths),
      leaseStartDate: startDate.format("MMMM D, YYYY"),
      leaseEndDate: endDate.format("MMMM D, YYYY"),
      advanceCoverageStart: startDate.format("MMMM D, YYYY"),
      advanceCoverageEnd: advanceEnd.format("MMMM D, YYYY"),
      regularMonthlyRate: regularRate.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      discountPercentage: String(discountPercentage),
      approvedMonthlyRate: monthlyRent.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      advanceRentAmount: (Number(stayData.advanceRent) || monthlyRent).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      securityDepositAmount: (Number(stayData.securityDeposit) || monthlyRent).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    property: {
      // Prefer the canonical values resolveDigitalStayProofData already
      // resolved via resolveContractBranch (contractConfig.js). The
      // reconstruction below only runs for a caller that built its own
      // stayData-shaped object without going through
      // resolveDigitalStayProofData (none do today) — it is a defensive
      // fallback, not a second source of truth.
      propertyName: stayData.propertyName || (stayData.branchName?.toUpperCase()?.includes("LILYCREST")
        ? stayData.branchName.toUpperCase()
        : `LILYCREST ${stayData.branchName?.toUpperCase() || "GUADALUPE"}`),
      propertyAddress: stayData.propertyAddress || stayData.branchAddress || "Address not available",
    },
  };
}

/**
 * Renders the official First JRAC Partnership Contract of Lease PDF
 */
export async function renderDigitalStayProofPdf(stayData) {
  const contractPayload = mapStayDataToContractPayload(stayData);
  return renderContractHtmlPdf(contractPayload);
}
