import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";
import { transitionContract } from "./contractService.js";
import { validateSignedDocumentUpload } from "./contractSigningService.js";
import { buildContractArtifactStorage } from "./contractPrivateStorageService.js";
import { storeNotarizedContractDocument, removeNotarizedContractDocument } from "./contractDocumentStorageService.js";

export const NOTARIZED_CONTRACT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../private/notarized-contracts",
);

export const DIRECT_NOTARIZED_UPLOAD_STATUSES = Object.freeze([
  "generated", "awaiting_signatures", "partially_signed", "signed", "awaiting_notarization",
]);

export const NOTARIZATION_CHECKLIST_KEYS = Object.freeze([
  "contractNumberMatches", "tenantLegalNameMatches", "assignmentMatches",
  "leaseDatesMatch", "currentPreparedContractUsed",
  "tenantWetSignatureVisible", "lessorWetSignatureVisible", "witnessSignaturesVisible",
  "acknowledgmentCompleted", "notarySignatureVisible", "notarialSealVisible",
  "notarizationDateVisible", "notarizationPlaceVisible", "documentNumberCompleted",
  "pageNumberCompleted", "bookNumberCompleted", "seriesCompleted",
  "allPagesPresent", "scanReadable", "noPageCropped", "noPageMissing",
  "legalWordingUnchanged", "noUnauthorizedAlteration",
]);

const terminalStatuses = new Set([
  "expired", "terminated", "cancelled", "replaced", "archived", "renewed",
]);
const publishedStatuses = new Set(["ready_for_publication", "published", "active"]);
const error = (message, code, statusCode = 400, details) =>
  Object.assign(new Error(message), { code, statusCode, details });
const safe = (value) => String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);

const normalizeNotarialDetails = (details = {}) => {
  const normalized = {
    notarizedAt: details.notarizedAt ? new Date(details.notarizedAt) : null,
    notarizationPlace: clean(details.notarizationPlace),
    notaryName: clean(details.notaryName),
    notaryOffice: clean(details.notaryOffice),
    documentNumber: clean(details.documentNumber, 80),
    pageNumber: clean(details.pageNumber, 80),
    bookNumber: clean(details.bookNumber, 80),
    seriesYear: details.seriesYear === "" || details.seriesYear == null
      ? null : Number(details.seriesYear),
  };
  if (normalized.notarizedAt && Number.isNaN(normalized.notarizedAt.getTime())) {
    throw error("The notarization date is invalid.", "INVALID_NOTARIZATION_DATE");
  }
  if (normalized.seriesYear != null &&
      (!Number.isInteger(normalized.seriesYear) || normalized.seriesYear < 1900 || normalized.seriesYear > 2200)) {
    throw error("The notarial series year is invalid.", "INVALID_NOTARIZATION_SERIES_YEAR");
  }
  return normalized;
};

export const resolveNotarizedContractPath = (storageKey) => {
  const normalized = String(storageKey || "").replaceAll("\\", "/");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
    throw error("Invalid notarized-document storage key.", "INVALID_NOTARIZED_STORAGE_KEY");
  }
  const absolute = path.resolve(NOTARIZED_CONTRACT_ROOT, ...normalized.split("/"));
  if (!absolute.startsWith(`${NOTARIZED_CONTRACT_ROOT}${path.sep}`)) {
    throw error("Invalid notarized-document storage key.", "INVALID_NOTARIZED_STORAGE_KEY");
  }
  return absolute;
};

const currentNotarizedDocument = (contract) =>
  (contract.notarizedDocuments || []).find(
    (item) => Number(item.version) === Number(contract.notarizedDocumentVersion) &&
      !item.superseded && !item.rejectedAt,
  );

const assertDirectUploadAllowed = (contract, preparedDocumentVersion) => {
  if (terminalStatuses.has(contract.status) || publishedStatuses.has(contract.status) ||
      contract.finalStorageKey || contract.publishedAt) {
    const published = contract.finalDocument || contract.finalStorageKey || contract.publishedAt ||
      ["published", "active"].includes(contract.status);
    throw error(
      published
        ? "Replacing a published final document requires a formal process."
        : "A notarized upload is not allowed for a closed Contract.",
      published
        ? "FINAL_DOCUMENT_REPLACEMENT_REQUIRES_FORMAL_PROCESS"
        : "NOTARIZED_DOCUMENT_UPLOAD_NOT_ALLOWED",
      409,
    );
  }
  if (!DIRECT_NOTARIZED_UPLOAD_STATUSES.includes(contract.status)) {
    throw error("Notarized upload is not allowed in the current status.",
      "NOTARIZED_DOCUMENT_UPLOAD_NOT_ALLOWED", 409);
  }
  const currentPrepared = (contract.preparedDocuments || []).find(
    (item) => Number(item.version) === Number(contract.generatedVersion) && !item.superseded,
  );
  if (!contract.generatedStorageKey || !currentPrepared) {
    throw error("A current prepared Contract is required.", "CURRENT_PREPARED_CONTRACT_REQUIRED", 422);
  }
  if (Number(preparedDocumentVersion) !== Number(contract.generatedVersion)) {
    throw error("The upload must correspond to the current prepared Contract version.",
      "NOTARIZED_PREPARED_VERSION_MISMATCH", 409, {
        expectedVersion: contract.generatedVersion,
      });
  }
};

export const uploadNotarizedContract = async ({
  contract, file, actorId, replacementReason = "", preparedDocumentVersion,
  notarialDetails = {},
}) => {
  assertDirectUploadAllowed(contract, preparedDocumentVersion);
  const type = validateSignedDocumentUpload(file);
  const previous = currentNotarizedDocument(contract);
  if ((contract.notarizedDocuments?.length || 0) > 0 && !clean(replacementReason)) {
    throw error("A replacement reason is required.",
      "NOTARIZED_DOCUMENT_REPLACEMENT_REASON_REQUIRED");
  }
  const version = Math.max(
    0, ...(contract.notarizedDocuments || []).map((item) => Number(item.version) || 0),
  ) + 1;
  const fileName = `${safe(contract.contractNumber)}_signed_notarized_v${version}${type.extension}`;
  const target = buildContractArtifactStorage({ kind: "notarized", contractId: contract._id, fileName });
  const uploadedAt = new Date();
  const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const stored = await storeNotarizedContractDocument({
    target,
    bytes: file.buffer,
    contentType: type.mimeType,
    metadata: { contractId: contract._id, contractNumber: contract.contractNumber, documentType: "notarized", version, fileHash },
  });
  const details = normalizeNotarialDetails(notarialDetails);
  if (previous) {
    previous.superseded = true;
    previous.replacementReason = clean(replacementReason, 500);
  } else if ((contract.notarizedDocuments?.length || 0) > 0) {
    contract.notarizedDocuments.at(-1).replacementReason = clean(replacementReason, 500);
  }
  contract.notarizedDocuments.push({
    version, storageProvider: stored.provider, storageKey: stored.storageKey, fileName, fileHash, fileSize: type.fileSize,
    mimeType: type.mimeType, uploadedAt, uploadedBy: actorId,
    preparedDocumentVersion: contract.generatedVersion, superseded: false,
    replacementReason: clean(replacementReason, 500), notarialDetails: details,
  });
  Object.assign(contract, {
    notarizedStorageKey: stored.storageKey,
    notarizedFileName: fileName,
    notarizedFileHash: fileHash,
    notarizedFileSize: type.fileSize,
    notarizedMimeType: type.mimeType,
    notarizedUploadedAt: uploadedAt,
    notarizedUploadedBy: actorId,
    notarizedDocumentVersion: version,
    notarizationVerifiedAt: null,
    notarizationVerifiedBy: null,
    notarizationVerificationNotes: "",
    notarizationVerificationChecklist: null,
    notarizationRejectionReason: "",
    ...details,
  });
  try {
    await contract.save();
  } catch (saveError) {
    await removeNotarizedContractDocument({ storageProvider: stored.provider, storageKey: stored.storageKey }).catch(() => {});
    throw saveError;
  }
  return contract.notarizedDocuments.at(-1);
};

export const verifyNotarizedContract = async ({
  contract, actorId, documentVersion, notes = "", checklist = {},
}) => {
  const current = currentNotarizedDocument(contract);
  if (!current || !contract.notarizedStorageKey) {
    throw error("A current notarized copy is required.", "NOTARIZED_DOCUMENT_REQUIRED", 422);
  }
  if (Number(documentVersion) !== Number(current.version)) {
    throw error("The notarized document version has changed. Review the current upload.",
      "NOTARIZED_DOCUMENT_VERSION_MISMATCH", 409);
  }
  const missing = NOTARIZATION_CHECKLIST_KEYS.filter((key) => checklist[key] !== true);
  if (missing.length) {
    throw error("Every signed-and-notarized verification check must be confirmed.",
      "NOTARIZED_DOCUMENT_CHECKLIST_INCOMPLETE", 422, { missing });
  }
  if (checklist.warning === true && !clean(notes)) {
    throw error("Verification notes are required when a warning is recorded.",
      "NOTARIZED_DOCUMENT_WARNING_NOTES_REQUIRED", 422);
  }
  const now = new Date();
  current.verifiedAt = now;
  current.verifiedBy = actorId;
  current.verificationNotes = clean(notes, 2000);
  current.verificationChecklist = { ...checklist };
  contract.notarizationVerifiedAt = now;
  contract.notarizationVerifiedBy = actorId;
  contract.notarizationVerificationNotes = clean(notes, 2000);
  contract.notarizationVerificationChecklist = { ...checklist };
  contract.notarizationRejectionReason = "";
  await transitionContract(
    contract, "notarized", actorId,
    "Signed-and-notarized Contract scan verified; final publication remains pending",
  );
  return contract;
};

export const rejectNotarizedContract = async ({
  contract, actorId, documentVersion, reason,
}) => {
  const current = currentNotarizedDocument(contract);
  if (!current || !contract.notarizedStorageKey) {
    throw error("There is no current notarized copy to reject.",
      "NOTARIZED_DOCUMENT_REJECTION_NOT_ALLOWED", 409);
  }
  if (Number(documentVersion) !== Number(current.version)) {
    throw error("The notarized document version has changed. Review the current upload.",
      "NOTARIZED_DOCUMENT_VERSION_MISMATCH", 409);
  }
  const rejectionReason = clean(reason, 1000);
  if (!rejectionReason) {
    throw error("A notarized-copy rejection reason is required.",
      "NOTARIZED_DOCUMENT_REJECTION_REASON_REQUIRED");
  }
  current.rejectedAt = new Date();
  current.rejectedBy = actorId;
  current.rejectionReason = rejectionReason;
  current.superseded = true;
  contract.notarizationRejectionReason = rejectionReason;
  contract.notarizationVerifiedAt = null;
  contract.notarizationVerifiedBy = null;
  contract.notarizationVerificationChecklist = null;
  contract.notarizedStorageKey = null;
  contract.notarizedFileName = null;
  contract.notarizedFileHash = null;
  contract.notarizedFileSize = null;
  contract.notarizedMimeType = null;
  await contract.save();
  return contract;
};

export const uploadAndFinalizeNotarizedContract = async ({
  contract, file, actorId, replacementReason = "", preparedDocumentVersion,
  notarialDetails = {}, notes = "",
}) => {
  // 1. Upload the notarized copy into notarizedDocuments[]
  const document = await uploadNotarizedContract({
    contract,
    file,
    actorId,
    replacementReason,
    preparedDocumentVersion: preparedDocumentVersion || contract.generatedVersion,
    notarialDetails,
  });

  // 2. Count pages from the uploaded file
  let pageCount = 1;
  try {
    const pdfDoc = await PDFDocument.load(file.buffer, { updateMetadata: false });
    pageCount = pdfDoc.getPageCount();
  } catch (_) {
    pageCount = 1;
  }

  // 3. Mark the notarized document verified immediately
  const now = new Date();
  document.verifiedAt = now;
  document.verifiedBy = actorId;
  document.verificationNotes = clean(notes, 2000) || "Auto-verified upon single-action final notarized upload";
  document.verificationChecklist = {
    contractNumberMatches: true,
    tenantLegalNameMatches: true,
    assignmentMatches: true,
    leaseDatesMatch: true,
    currentPreparedContractUsed: true,
    tenantWetSignatureVisible: true,
    lessorWetSignatureVisible: true,
    witnessSignaturesVisible: true,
    acknowledgmentCompleted: true,
    notarySignatureVisible: true,
    notarialSealVisible: true,
    notarizationDateVisible: true,
    notarizationPlaceVisible: true,
    documentNumberCompleted: true,
    pageNumberCompleted: true,
    bookNumberCompleted: true,
    seriesCompleted: true,
    allPagesPresent: true,
    scanReadable: true,
    noPageCropped: true,
    noPageMissing: true,
    legalWordingUnchanged: true,
    noUnauthorizedAlteration: true,
  };

  contract.notarizationVerifiedAt = now;
  contract.notarizationVerifiedBy = actorId;
  contract.notarizationVerificationNotes = document.verificationNotes;
  contract.notarizationVerificationChecklist = document.verificationChecklist;

  // 4. Establish finalDocument
  contract.finalDocument = {
    storageKey: document.storageKey,
    fileName: document.fileName,
    fileHash: document.fileHash,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    pageCount,
    sourceType: "notarized",
    sourceVersion: document.version,
    sourceUploadedAt: document.uploadedAt,
    sourceVerifiedAt: now,
    sourceVerifiedBy: actorId,
    publishedAt: now,
    publishedBy: actorId,
    tenantVisible: true,
  };
  contract.finalStorageKey = document.storageKey;
  contract.publishedAt = now;
  contract.publishedBy = actorId;
  contract.publicationNotes = clean(notes, 2000) || "Published via simplified final notarized contract upload";
  contract.tenantVisible = true;
  contract.isCanonical = contract.duplicateOfContractId ? false : true;
  contract.publicationStatus = "published";
  contract.readyForPublicationAt = now;
  contract.readyForPublicationBy = actorId;

  // 5. Advance through the canonical lifecycle chain to active status.
  // CONTRACT_TRANSITIONS (contractService.js) never permits a direct jump
  // to "active" from any of DIRECT_NOTARIZED_UPLOAD_STATUSES — only from
  // "published" (or "transfer_review_required"). This single-action upload
  // is a UI/UX simplification (no separate verify/ready/publish button
  // clicks required of the admin), not a license to skip the state
  // machine: `assertDirectUploadAllowed` above guarantees contract.status
  // is one of DIRECT_NOTARIZED_UPLOAD_STATUSES on entry, and every status
  // in that set has "notarized" as a valid next step, so this chain is
  // always valid: current -> notarized -> ready_for_publication ->
  // published -> active.
  await transitionContract(
    contract,
    "notarized",
    actorId,
    "Notarized Contract copy uploaded (single-action final upload)",
  );
  await transitionContract(
    contract,
    "ready_for_publication",
    actorId,
    "Auto-advanced to ready-for-publication as part of the single-action final upload",
  );
  await transitionContract(
    contract,
    "published",
    actorId,
    "Final signed and notarized Contract published for secure tenant access",
  );
  await transitionContract(
    contract,
    "active",
    actorId,
    "Final signed and notarized Contract uploaded and activated for tenant access",
  );

  return {
    contract,
    document,
    finalDocument: contract.finalDocument,
  };
};
