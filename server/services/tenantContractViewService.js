import { resolveContractDisplayLifecycle } from "./contractPublicationService.js";
import { selectCurrentPreparedDocument } from "./preparedContractDocumentService.js";
import { resolveTenantContractDocument } from "./tenantContractDocumentResolver.js";
import { getTenantContractLabel } from "../config/contractStatusLabels.js";

// Thin wrapper over the canonical status-label table (config/contractStatusLabels.js)
// — kept as its own export here since existing callers already import this
// name from this module; see that file's header for the full 22-status
// source of truth and its web/-side mirror.
export const getTenantContractDisplayStatus = getTenantContractLabel;

export const calculateContractDaysRemaining = (leaseEndDate, now = new Date()) => {
  if (!leaseEndDate) return null;
  const end = new Date(leaseEndDate);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
};

export const toTenantContractView = (source, now = new Date(), options = {}) => {
  if (!source) return null;
  const contract = source.toObject ? source.toObject() : source;
  const documentBasePath = options.documentBasePath || "/api/contracts/my";
  const currentDocument = Object.prototype.hasOwnProperty.call(options, "preparedDocument")
    ? options.preparedDocument
    : selectCurrentPreparedDocument(contract);
  // notarizationVerifiedAt only applies to the optional notarized pipeline —
  // an admin_scan (wet-signed upload) finalDocument is final on upload and
  // never sets it, so requiring it here left this field permanently
  // `available: false` for the now-standard finalization path. Status and
  // tenantVisible are kept as defense-in-depth against a finalDocument set
  // outside the publish-family status range.
  const finalPublished = ["published", "active", "expiring_soon", "expired"]
    .includes(contract.status)
    && contract.tenantVisible === true
    && Boolean(contract.finalDocument);
  const displayLifecycle = resolveContractDisplayLifecycle(contract, now);
  const resolvedTenantDoc = resolveTenantContractDocument(contract);

  const id = String(contract._id || contract.id);
  const preparedDocument = {
    available: Boolean(currentDocument),
    issue: currentDocument ? null : options.preparedDocumentIssue || "PREPARED_DOCUMENT_UNAVAILABLE",
    currentVersion: currentDocument?.version || null,
    generatedAt: currentDocument?.generatedAt || null,
    fileName: currentDocument?.fileName || null,
    fileSize: currentDocument?.fileSize ?? null,
    pageCount: currentDocument?.pageCount ?? null,
    viewUrl: currentDocument ? `${documentBasePath}/${id}/documents/prepared` : null,
    downloadUrl: currentDocument ? `${documentBasePath}/${id}/documents/prepared?download=1` : null,
  };

  const normType = String(contract.roomType || "").toLowerCase();
  const isPrivate = normType.includes("private");

  // The tenant-facing view must render the Contract's own authoritative
  // pricing snapshot verbatim — see the matching note in
  // contractGenerationDataService.js. This block previously recomputed
  // regularMonthlyRate/approvedMonthlyRate/advanceRentAmount/
  // securityDepositAmount against hardcoded room-type thresholds
  // (10000/15000/16000/13500) whenever a value "looked off", silently
  // diverging what the tenant sees here from what's on the actual generated
  // PDF. There is exactly one canonical pricing-resolution path
  // (contractPricingResolver.js, snapshotted onto the Contract at
  // creation/approval time) and this view must not maintain a second one.
  const approvedMonthlyRate = contract.approvedMonthlyRate ?? null;
  const regularMonthlyRate = contract.regularMonthlyRate ?? null;
  const discountPercentage = contract.discountPercentage ?? null;
  const discountAmount = contract.discountAmount ?? null;
  const advanceRentAmount = contract.advanceRentAmount ?? null;
  const securityDepositAmount = contract.securityDepositAmount ?? null;

  return {
    id,
    contractId: id,
    contractNumber: contract.contractNumber || "",
    // Authoritative identity snapshot taken at contract creation — consumed
    // by DigitalContractPaper.jsx (both Admin's and the tenant's own
    // "Digital Contract" view) via this exact field name. Without it, that
    // component silently falls back to a hardcoded sample address for every
    // tenant, since it never had a matching field to read.
    tenantLegalName: contract.tenantLegalName || "",
    tenantResidentialAddress: contract.tenantAddress || "",
    isCanonical: true,
    publicationStatus: contract.publicationStatus ||
      (contract.tenantVisible ? "published" : "ready_for_resident"),
    status: contract.status,
    displayStatus: getTenantContractDisplayStatus(contract.status),
    displayLifecycle,
    templateType: contract.templateType || "",
    roomType: contract.roomType || "",
    leaseType: contract.leaseType || "",
    version: contract.version || 1,
    branch: contract.branch || "",
    propertyName: contract.propertyName || "",
    roomNumber: contract.roomNumber || "",
    bedLabel: isPrivate ? "" : (contract.bedLabel || ""),
    // Contract type — so the UI can label a Room Transfer Addendum
    // ("amendment") vs. a legacy transfer replacement vs. the original lease
    // ("initial") vs. a renewal, and can explain that an addendum's lease
    // dates are the ORIGINAL lease's dates.
    contractPurpose: contract.contractPurpose || "initial",
    transferType: contract.transferType || null,
    amendmentEffectiveDate: contract.amendmentEffectiveDate || null,
    amendmentReason: contract.amendmentReason || "",
    amendmentFields: Array.isArray(contract.amendmentFields) ? contract.amendmentFields : [],
    parentContractId: contract.parentContractId ? String(contract.parentContractId) : null,
    replacesContractId: contract.replacesContractId ? String(contract.replacesContractId) : null,
    isCurrent: contract.isCurrent !== false,
    leaseStartDate: contract.leaseStartDate || null,
    leaseEndDate: contract.leaseEndDate || null,
    leaseDurationMonths: contract.leaseDurationMonths ?? options.leaseDurationMonths ?? null,
    daysRemaining: calculateContractDaysRemaining(contract.leaseEndDate, now),
    termNumber: options.termNumber ?? contract.termNumber ?? null,
    termLabel: options.termLabel ?? contract.termLabel ?? null,
    isShortTerm: options.isShortTerm ?? contract.isShortTerm ?? (
      (contract.leaseDurationMonths ?? options.leaseDurationMonths) != null
        ? Number(contract.leaseDurationMonths ?? options.leaseDurationMonths) < 6
        : false
    ),
    approvedMonthlyRate,
    regularMonthlyRate,
    discountPercentage,
    discountAmount,
    discountType: contract.discountType || (discountPercentage > 0 ? "percentage" : "none"),
    advanceRentAmount,
    securityDepositAmount,
    reservationFeeAmount: contract.reservationFeeAmount ?? null,
    preparedDocument,
    preparedDocumentAvailable: preparedDocument.available,
    preparedDocumentVersion: preparedDocument.currentVersion,
    preparedDocumentFileName: preparedDocument.fileName,
    preparedDocumentFileSize: preparedDocument.fileSize,
    preparedDocumentPageCount: preparedDocument.pageCount,
    tenantDocument: {
      available: resolvedTenantDoc.available,
      type: resolvedTenantDoc.type,
      label: resolvedTenantDoc.label,
      isFinal: resolvedTenantDoc.isFinal,
      version: resolvedTenantDoc.version,
      fileName: resolvedTenantDoc.fileName,
      fileSize: resolvedTenantDoc.fileSize,
      pageCount: resolvedTenantDoc.pageCount,
      generatedAt: resolvedTenantDoc.generatedAt,
      publishedAt: resolvedTenantDoc.publishedAt,
      viewUrl: resolvedTenantDoc.available
        ? (resolvedTenantDoc.type === "final_notarized"
            ? `${documentBasePath}/${id}/documents/final`
            : resolvedTenantDoc.type === "final_signed"
              ? `${documentBasePath}/${id}/documents/signed/${resolvedTenantDoc.version}`
              : `${documentBasePath}/${id}/documents/prepared`)
        : null,
      downloadUrl: resolvedTenantDoc.available
        ? (resolvedTenantDoc.type === "final_notarized"
            ? `${documentBasePath}/${id}/documents/final?download=1`
            : resolvedTenantDoc.type === "final_signed"
              ? `${documentBasePath}/${id}/documents/signed/${resolvedTenantDoc.version}?download=1`
              : `${documentBasePath}/${id}/documents/prepared?download=1`)
        : null,
    },
    finalDocument: {
      available: finalPublished,
      publishedAt: finalPublished ? contract.finalDocument.publishedAt || contract.publishedAt || null : null,
      fileName: finalPublished ? contract.finalDocument.fileName : null,
      fileSize: finalPublished ? contract.finalDocument.fileSize ?? null : null,
      pageCount: finalPublished ? contract.finalDocument.pageCount ?? null : null,
      viewUrl: finalPublished ? `${documentBasePath}/${id}/documents/final` : null,
      downloadUrl: finalPublished ? `${documentBasePath}/${id}/documents/final?download=1` : null,
    },
    signedDocuments: (contract.signedDocuments || [])
      .filter((doc) => !doc.superseded)
      .sort((a, b) => (b.version || 0) - (a.version || 0))
      .map((doc) => ({
        version: doc.version,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedAt: doc.uploadedAt,
        replacementReason: doc.replacementReason || "",
        viewUrl: `${documentBasePath}/${id}/documents/signed/${doc.version}`,
        downloadUrl: `${documentBasePath}/${id}/documents/signed/${doc.version}?download=1`,
      })),
    // Tenant/admin acknowledgement of the current acknowledgeable document
    // (draft or final) — the ONE canonical state from
    // contractAcknowledgementService.getAcknowledgementStatus, embedded here
    // so a plain page load returns it without a second round-trip. Standalone
    // GET .../acknowledgement endpoints remain for polling/live refetch.
    // null when the caller did not resolve it (keeps this view pure/sync).
    acknowledgement: Object.prototype.hasOwnProperty.call(options, "acknowledgement")
      ? options.acknowledgement
      : null,
    // Canonical signed-scan identity for THIS contract, resolved by the
    // controller via signedContractScanResolver.resolveSignedScanForContract
    // (walks the Contract lineage for a Room Transfer Addendum that has no
    // scan of its own). { contractId, version, fileName, mimeType, source,
    // inherited, inheritedFromContractId, inheritedFromContractNumber } or
    // null. The viewer uses this exact identity — same file for Preview /
    // Open-in-tab / Download — instead of guessing from signedDocuments[].
    signedScan: Object.prototype.hasOwnProperty.call(options, "signedScan")
      ? options.signedScan
      : null,
  };
};
