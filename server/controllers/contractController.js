import mongoose from "mongoose";
import { Contract, Reservation, Stay, User } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import logger from "../middleware/logger.js";
import { notify } from "../utils/notificationService.js";
import { emitToUser, emitToAdmins } from "../utils/socket.js";
import {
  createDraftContract, findCurrentContract,
  transitionContract, validateContractForGeneration,
  validateContractRoomAssignment,
  approveContractPricing,
} from "../services/contractService.js";
import { buildContractGenerationData } from "../services/contractGenerationDataService.js";
import { generatePreparedContractPdf } from "../services/contractPdfService.js";
import {
  inspectPreparedContractDocument,
  inspectSignedContractDocument,
  inspectNotarizedContractDocument,
} from "../services/contractDocumentStorageService.js";
import { toTenantContractView } from "../services/tenantContractViewService.js";
import { resolveSignedScanForContract } from "../services/signedContractScanResolver.js";
import { getOpenScheduledRoomTransferForReservation } from "../services/scheduledRoomTransferView.js";
import {
  resolveCurrentPreparedDocument,
  selectCurrentPreparedDocument,
} from "../services/preparedContractDocumentService.js";
import { buildInitialPaymentSummary } from "../services/contractPricingService.js";
import { resolveReservationContractEligibility } from "../services/reservationContractEligibilityService.js";
import {
  deleteSignedContract,
  markContractPrinted,
  rejectSignedContract,
  updatePhysicalSignature,
  uploadSignedContract,
  verifySignedContract,
} from "../services/contractSigningService.js";
import {
  rejectNotarizedContract,
  uploadNotarizedContract,
  uploadAndFinalizeNotarizedContract,
  verifyNotarizedContract,
} from "../services/contractNotarizationService.js";
import { replaceFinalContractDocument } from "../services/contractFinalDocumentReplacementService.js";
import {
  cleanUpSupersededTestVersions,
  resetPreparedTestDocuments,
} from "../services/contractPreparedDocumentCleanupService.js";
import {
  markContractReadyForPublication,
  publishFinalContract,
  resolvePublishedFinalDocument,
} from "../services/contractPublicationService.js";
import {
  resolveTenantCanonicalContract,
  resolveTenantContractHistory,
  resolveTenantUpcomingContract,
} from "../services/tenantContractSelectionService.js";
import {
  acknowledgeContract,
  getAcknowledgementStatus,
  getAcknowledgementStatusForContract,
} from "../services/contractAcknowledgementService.js";
import {
  archiveContract as archiveContractRecord,
  archiveContractForCancelledReservation,
  buildContractDeletionEligibility,
  permanentlyDeleteTestContract,
  restoreArchivedContract,
} from "../services/contractArchiveService.js";
import {
  resolveDigitalStayProofData,
  renderDigitalStayProofPdf,
  buildDigitalStayProofHtml,
} from "../services/digitalStayProofService.js";

const fail = (res, error) => res.status(error.statusCode || 500).json({
  error: error.message || "Contract operation failed",
  code: error.code || "CONTRACT_OPERATION_FAILED",
  ...(error.details ? { details: error.details } : {}),
});

const sanitizeDownloadFilename = (val, fallback = "Contract") => {
  const clean = String(val || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return clean || fallback;
};

const buildContractPdfFilename = (contract, fallbackRef = "Official") => {
  const refCode = sanitizeDownloadFilename(contract?.contractNumber || fallbackRef, "Contract");
  const tenantName = sanitizeDownloadFilename(contract?.tenantLegalName || contract?.tenantName || "", "");
  return tenantName ? `Contract-of-Lease-${refCode}-${tenantName}.pdf` : `Contract-of-Lease-${refCode}.pdf`;
};

const actor = async (req) => {
  const user = await User.findOne({ firebaseUid: req.user.uid }).select("_id role branch email").lean();
  if (!user) throw Object.assign(new Error("Authenticated user not found."), { statusCode: 404, code: "USER_NOT_FOUND" });
  req.user.mongoId = user._id;
  req.user.role = user.role;
  req.user.branch = user.branch || "";
  return user;
};

export const assertContractBranchAccess = (req, contractBranch) => {
  if (req.branchFilter && req.branchFilter !== contractBranch) {
    throw Object.assign(new Error("You cannot access contracts from another branch."), {
      statusCode: 403, code: "CONTRACT_BRANCH_ACCESS_DENIED",
    });
  }
};

export const createContract = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await createDraftContract({
      reservationId: req.body?.reservationId,
      stayId: req.body?.stayId || null,
      actorId: admin._id,
      allowedBranch: req.branchFilter,
    });
    assertContractBranchAccess(req, contract.branch);
    await auditLogger.logModification(req, "contract", contract._id, null, contract.toObject(), "Created Contract draft");
    res.status(201).json({ contract });
  } catch (error) {
    if (error.code === "DUPLICATE_CONTRACT") {
      await auditLogger.logError(
        req,
        error,
        "Duplicate initial Contract creation prevented",
      );
    }
    fail(res, error);
  }
};

export const listContracts = async (req, res) => {
  try {
    const query = req.branchFilter ? { branch: req.branchFilter } : {};
    if (req.query.tenantId && mongoose.isValidObjectId(req.query.tenantId)) {
      query.tenantId = req.query.tenantId;
    }
    const archiveView = ["active", "archived", "all"].includes(req.query.archive)
      ? req.query.archive : "active";
    if (archiveView === "active") {
      query.archivedAt = null;
      query.status = { $nin: ["archived", "voided"] };
    } else if (archiveView === "archived") {
      query.archivedAt = { $ne: null };
    }
    const statusGroups = {
      needs_attention: ["draft", "incomplete", "transfer_review_required"],
      ready_to_generate: ["ready_for_generation"],
      prepared: ["generated"],
      pending_signing: ["awaiting_signatures", "partially_signed"],
      pending_notarization: ["signed", "awaiting_notarization"],
      ready_to_publish: ["notarized", "ready_for_publication"],
      published: ["published"],
      active: ["active"],
      expiring_soon: ["expiring_soon"],
      closed: ["expired", "terminated", "cancelled", "replaced", "archived", "renewed"],
    };
    if (req.query.status) {
      const selectedStatus = statusGroups[req.query.status]
        ? { $in: statusGroups[req.query.status] }
        : req.query.status;
      query.$and = [...(query.$and || []), { status: selectedStatus }];
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const records = await Contract.find(query)
      .populate("archivedBy", "firstName lastName email role")
      .populate("duplicateOfContractId", "contractNumber")
      .sort({ createdAt: -1 }).limit(limit).lean();
    const contracts = await Promise.all(records.map(async (contract) => {
      let preparedDocumentAvailable = false;
      if (selectCurrentPreparedDocument(contract)) {
        preparedDocumentAvailable = await resolveCurrentPreparedDocument(contract)
          .then(() => true)
          .catch(() => false);
      }
      return {
        ...contract,
        preparedDocuments: (contract.preparedDocuments || []).map(
          ({ storageKey: _storageKey, ...document }) => document,
        ),
        preparedDocumentAvailable,
      };
    }));
    res.json({ contracts });
  } catch (error) {
    fail(res, error);
  }
};

export const archiveContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    const admin = await actor(req);
    const before = await Contract.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, before.branch);
    const result = await archiveContractRecord({
      contractId: req.params.id,
      actorId: admin._id,
      reason: req.body?.reason,
      duplicateOfContractId: req.body?.duplicateOfContractId || null,
      allowedBranch: req.branchFilter,
    });
    await auditLogger.logModification(
      req, "contract", result.contract._id, before, result.contract.toObject(),
      "Archived Contract",
    );
    res.json({ success: true, contract: result.contract });
  } catch (error) {
    fail(res, error);
  }
};

export const restoreContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    const admin = await actor(req);
    const before = await Contract.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, before.branch);
    const restored = await restoreArchivedContract({
      contractId: req.params.id, actorId: admin._id, reason: req.body?.reason,
    });
    await auditLogger.logModification(
      req, "contract", restored._id, before, restored.toObject(), "Restored archived Contract",
    );
    res.json({ success: true, contract: restored });
  } catch (error) {
    fail(res, error);
  }
};

export const getContractDeletionEligibility = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    await actor(req);
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const eligibility = await buildContractDeletionEligibility(contract);
    await auditLogger.log({
      req,
      type: "data_modification",
      action: "Checked permanent Contract deletion eligibility",
      severity: "high",
      entityType: "contract",
      entityId: String(contract._id),
      details: eligibility.eligible ? "Eligible test Contract" : "Permanent deletion blocked",
      metadata: {
        contractNumber: contract.contractNumber,
        eligible: eligibility.eligible,
        dependencies: eligibility.dependencies,
        blockingDependencies: eligibility.blockingDependencies,
      },
    });
    res.json({
      ...eligibility,
      ...(!eligibility.eligible ? {
        code: "CONTRACT_DELETE_BLOCKED",
        message: "This Contract has related records and must be archived instead.",
      } : {}),
    });
  } catch (error) {
    fail(res, error);
  }
};

export const permanentlyDeleteContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    const admin = await actor(req);
    const before = await Contract.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, before.branch);
    const result = await permanentlyDeleteTestContract({
      contractId: req.params.id,
      actorId: admin._id,
      confirmationContractNumber: req.body?.confirmationContractNumber,
      reason: req.body?.reason,
    });
    await auditLogger.logDeletion(
      req,
      "test_contract",
      result.deletedContract._id,
      {
        contractNumber: result.deletedContract.contractNumber,
        isTestRecord: true,
        branch: result.deletedContract.branch,
        dependencySummary: result.dependencySummary,
        cleanupFailures: result.cleanupFailures,
      },
      result.deletionReason,
    );
    res.json({
      success: true,
      deleted: true,
      contractNumber: result.deletedContract.contractNumber,
      storageCleanupComplete: result.cleanupFailures.length === 0,
      orphanCleanupRequired: result.cleanupFailures.length > 0,
    });
  } catch (error) {
    fail(res, error);
  }
};

export const getContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    const contract = await Contract.findById(req.params.id).populate([
      { path: "printedBy", select: "firstName lastName email role" },
      { path: "tenantSignatureConfirmedBy", select: "firstName lastName email role" },
      { path: "lessorSignatureConfirmedBy", select: "firstName lastName email role" },
      { path: "witnessSignatureConfirmedBy", select: "firstName lastName email role" },
      { path: "signedUploadedBy", select: "firstName lastName email role" },
      { path: "signingVerifiedBy", select: "firstName lastName email role" },
      { path: "signedDocuments.uploadedBy", select: "firstName lastName email role" },
      { path: "signedDocuments.verifiedBy", select: "firstName lastName email role" },
      { path: "notarizedUploadedBy", select: "firstName lastName email role" },
      { path: "notarizationVerifiedBy", select: "firstName lastName email role" },
      { path: "notarizedDocuments.uploadedBy", select: "firstName lastName email role" },
      { path: "notarizedDocuments.verifiedBy", select: "firstName lastName email role" },
      { path: "notarizedDocuments.rejectedBy", select: "firstName lastName email role" },
      { path: "readyForPublicationBy", select: "firstName lastName email role" },
      { path: "publishedBy", select: "firstName lastName email role" },
      { path: "archivedBy", select: "firstName lastName email role" },
      { path: "restoredBy", select: "firstName lastName email role" },
      { path: "duplicateOfContractId", select: "contractNumber status isCanonical" },
    ]);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const reservation = await Reservation.findById(contract.reservationId)
      .select("reservationFeeAmount paymentStatus financialWorkflowVersion reservationFeePaymentStatus")
      .lean();
    const contractObject = contract.toObject();
    let preparedAvailability = {
      available: false,
      documentId: null,
      generatedAt: null,
      fileName: null,
      version: null,
      issue: "not_generated",
    };
    const selectedPrepared = selectCurrentPreparedDocument(contract);
    if (selectedPrepared) {
      try {
        const resolved = await resolveCurrentPreparedDocument(contract);
        preparedAvailability = {
          available: true,
          documentId: `${contract._id}:prepared:${resolved.document.version}`,
          generatedAt: resolved.document.generatedAt,
          fileName: resolved.document.fileName,
          version: resolved.document.version,
          fileSize: resolved.size,
          pageCount: resolved.document.pageCount,
          issue: null,
        };
      } catch (availabilityError) {
        preparedAvailability = {
          available: false,
          documentId: `${contract._id}:prepared:${selectedPrepared.version}`,
          generatedAt: selectedPrepared.generatedAt,
          fileName: selectedPrepared.fileName,
          version: selectedPrepared.version,
          issue: availabilityError.code || "PREPARED_DOCUMENT_UNAVAILABLE",
        };
      }
    }
    delete contractObject.signedStorageKey;
    delete contractObject.notarizedStorageKey;
    delete contractObject.finalStorageKey;
    if (contractObject.finalDocument) {
      delete contractObject.finalDocument.storageKey;
      delete contractObject.finalDocument.fileHash;
    }
    contractObject.signedDocuments = (contractObject.signedDocuments || []).map(
      ({ storageKey: _storageKey, ...document }) => document,
    );
    contractObject.notarizedDocuments = (contractObject.notarizedDocuments || []).map(
      ({ storageKey: _storageKey, ...document }) => document,
    );
    contractObject.preparedDocuments = (contractObject.preparedDocuments || []).map(
      ({ storageKey: _storageKey, ...document }) => document,
    );
    contractObject.documents = {
      prepared: preparedAvailability,
      signed: { available: Boolean(contractObject.signedDocuments?.length) },
      notarized: { available: Boolean(contractObject.notarizedDocuments?.length) },
      final: { available: Boolean(contractObject.finalDocument) },
    };
    contractObject.initialPaymentSummary = buildInitialPaymentSummary({
      advanceRentAmount: contract.advanceRentAmount,
      securityDepositAmount: contract.securityDepositAmount,
      reservationFeeAmount: reservation?.reservationFeeAmount ?? contract.reservationFeeAmount,
      approvedReservationFeeCreditAmount: contract.reservationFeeCreditAmount,
      reservationPaymentStatus: reservation?.paymentStatus,
      financialWorkflowVersion: reservation?.financialWorkflowVersion,
      reservationFeePaymentStatus: reservation?.reservationFeePaymentStatus,
    });
    res.json({ contract: contractObject });
  } catch (error) {
    fail(res, error);
  }
};

const loadSigningContract = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw Object.assign(new Error("Invalid contract id."), { code: "INVALID_CONTRACT_ID", statusCode: 400 });
  }
  const contract = await Contract.findById(req.params.id);
  if (!contract) throw Object.assign(new Error("Contract not found."), { code: "CONTRACT_NOT_FOUND", statusCode: 404 });
  assertContractBranchAccess(req, contract.branch);
  return contract;
};

const auditSigningChange = async (req, before, contract, action) => {
  const after = contract.toObject();
  await auditLogger.logModification(req, "contract", contract._id, before, after, action);
  if (
    before?.status !== after.status &&
    ["partially_signed", "signed"].includes(after.status)
  ) {
    await auditLogger.logModification(
      req,
      "contract",
      contract._id,
      before,
      after,
      `Contract changed to ${after.status}`,
    );
  }
};

export const markPrinted = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({ error: "Printing confirmation is required.", code: "CONTRACT_PRINT_CONFIRMATION_REQUIRED" });
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    await markContractPrinted({ contract, actorId: admin._id });
    await auditSigningChange(req, before, contract, "Contract marked printed");
    res.json({ success: true, status: contract.status, printedAt: contract.printedAt, printedBy: contract.printedBy });
  } catch (error) { fail(res, error); }
};

const signatureAction = (signer) => async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const result = await updatePhysicalSignature({
      contract, signer, value: req.body?.status, actorId: admin._id,
    });
    await auditSigningChange(req, before, contract, `${signer} signature changed from ${result.previousValue} to ${result.newValue}`);

    if (signer === "tenant" && (result.newValue === "completed" || result.newValue === "signed")) {
      try {
        const tenantName = contract.tenantName || "Tenant";
        const roomName = contract.roomName || "";
        const branchName = contract.branch || "";
        notify
          .contractSignedByTenant(branchName, tenantName, roomName, contract._id)
          .catch((e) => logger.warn({ err: e }, "Contract signed admin notification failed (non-fatal)"));
      } catch (notifErr) {
        // non-fatal
      }
    }

    res.json({ success: true, status: contract.status, previousValue: result.previousValue, newValue: result.newValue });
  } catch (error) { fail(res, error); }
};
export const updateTenantSignature = signatureAction("tenant");
export const updateLessorSignature = signatureAction("lessor");
export const updateWitnessSignatures = signatureAction("witnesses");

export const uploadSignedDocument = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const document = await uploadSignedContract({
      contract, file: req.file, actorId: admin._id,
      replacementReason: req.body?.replacementReason,
    });
    await auditSigningChange(req, before, contract, document.version === 1 ? "Signed Contract copy uploaded" : "Signed Contract copy replaced");

    if (document.version === 1) {
      try {
        const tenantName = contract.tenantName || "Tenant";
        const roomName = contract.roomName || "";
        const branchName = contract.branch || "";
        notify
          .contractSignedByTenant(branchName, tenantName, roomName, contract._id)
          .catch((e) => logger.warn({ err: e }, "Contract signed admin notification failed (non-fatal)"));
      } catch (notifErr) {
        // non-fatal
      }
    }

    // This upload just auto-finalized the Contract (contractSigningService's
    // canAutoFinalize/advanceStatusToPublished ran inline) — notify the
    // tenant their final contract is ready, matching the "prepared" tenant
    // notification already sent at generation time.
    const justFinalized = contract.finalDocument?.sourceType === "admin_scan" &&
      Number(contract.finalDocument?.sourceVersion) === Number(document.version);
    if (justFinalized && contract.tenantId) {
      notify
        .contractDocumentReady(contract.tenantId, "final", contract._id, document.version)
        .catch((e) => logger.warn({ err: e }, "Tenant final-contract-ready notification failed (non-fatal)"));
    }

    res.status(201).json({ success: true, document: {
      version: document.version, fileName: document.fileName, fileHash: document.fileHash,
      fileSize: document.fileSize, mimeType: document.mimeType, uploadedAt: document.uploadedAt,
      preparedDocumentVersion: document.preparedDocumentVersion,
    }, status: contract.status, finalDocument: contract.finalDocument ? {
      sourceType: contract.finalDocument.sourceType,
      publishedAt: contract.finalDocument.publishedAt,
      fileName: contract.finalDocument.fileName,
    } : null });
  } catch (error) { fail(res, error); }
};

export const streamSignedDocument = async (req, res) => {
  try {
    const contract = await loadSigningContract(req);
    const requested = req.params.version ? Number(req.params.version) : null;
    const document = requested
      ? contract.signedDocuments.find((item) => Number(item.version) === requested)
      : [...(contract.signedDocuments || [])].filter((item) => !item.superseded)
        .sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (!document) return res.status(404).json({ error: "Signed Contract file not found.", code: "SIGNED_DOCUMENT_NOT_FOUND" });
    const inspected = await inspectSignedContractDocument(document).catch(() => null);
    if (!inspected) return res.status(404).json({ error: "Signed Contract file not found.", code: "SIGNED_DOCUMENT_NOT_FOUND" });
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Length", inspected.size);
    res.setHeader("Content-Disposition", `${req.query?.download === "true" ? "attachment" : "inline"}; filename="${buildContractPdfFilename(contract)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    inspected.createReadStream().on("error", (streamError) => res.destroy(streamError)).pipe(res);
  } catch (error) { fail(res, error); }
};

export const verifySignedDocument = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({ error: "Verification confirmation is required.", code: "SIGNED_DOCUMENT_VERIFICATION_CONFIRMATION_REQUIRED" });
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    await verifySignedContract({ contract, actorId: admin._id, notes: req.body?.notes, checklist: req.body?.checklist });
    await auditSigningChange(req, before, contract, "Signed Contract copy verified; Contract marked signed");
    res.json({ success: true, status: contract.status, signingVerifiedAt: contract.signingVerifiedAt });
  } catch (error) { fail(res, error); }
};

export const rejectSignedDocument = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    await rejectSignedContract({ contract, actorId: admin._id, reason: req.body?.reason });
    await auditSigningChange(req, before, contract, "Signed Contract copy rejected");
    res.json({ success: true, status: contract.status, rejectionReason: contract.signingRejectionReason });
  } catch (error) { fail(res, error); }
};

export const deleteSignedDocument = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const result = await deleteSignedContract({
      contract,
      version: req.params.version,
      actorId: admin._id,
      reason: req.body?.reason,
    });
    await auditSigningChange(
      req,
      before,
      contract,
      `Signed Contract copy (v${result.deletedVersion}) deleted`,
    );
    res.json({
      success: true,
      status: contract.status,
      deletedVersion: result.deletedVersion,
      message: "Signed contract copy deleted successfully.",
    });
  } catch (error) {
    fail(res, error);
  }
};


export const uploadNotarizedDocument = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const document = await uploadNotarizedContract({
      contract, file: req.file, actorId: admin._id,
      replacementReason: req.body?.replacementReason,
      preparedDocumentVersion: req.body?.preparedDocumentVersion,
      notarialDetails: req.body?.notarialDetails
        ? JSON.parse(req.body.notarialDetails) : {},
    });
    await auditSigningChange(req, before, contract,
      document.version === 1 ? "Notarized Contract copy uploaded" : "Notarized Contract copy replaced");
    res.status(201).json({ success: true, status: contract.status, document: {
      version: document.version, fileName: document.fileName, fileHash: document.fileHash,
      fileSize: document.fileSize, mimeType: document.mimeType, uploadedAt: document.uploadedAt,
    } });
  } catch (error) { fail(res, error); }
};

export const uploadFinalNotarizedContract = async (req, res) => {
  try {
    // FormData sends "confirmed" as the string "true", not a JSON boolean —
    // this endpoint is multipart (file upload), unlike the JSON-bodied
    // publish/ready-for-publication endpoints this check mirrors.
    if (req.body?.confirmed !== true && req.body?.confirmed !== "true") {
      return res.status(400).json({
        error: "Final publication confirmation is required.",
        code: "PUBLICATION_CONFIRMATION_REQUIRED",
      });
    }
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const result = await uploadAndFinalizeNotarizedContract({
      contract,
      file: req.file,
      actorId: admin._id,
      replacementReason: req.body?.replacementReason,
      preparedDocumentVersion: req.body?.preparedDocumentVersion,
      notarialDetails: req.body?.notarialDetails
        ? (typeof req.body.notarialDetails === "string" ? JSON.parse(req.body.notarialDetails) : req.body.notarialDetails)
        : {},
      notes: req.body?.notes || "",
    });
    await auditSigningChange(
      req,
      before,
      contract,
      "Final signed-and-notarized Contract uploaded and activated for tenant access",
    );
    // The one-step finalize path did not fire the tenant "document ready"
    // notification that the older multi-step publishContract() path already
    // sends — a real gap, since this is now the primary/canonical finalize
    // path. Non-fatal: a failed notification must never unpublish or roll
    // back the already-committed contract state.
    notify
      .contractDocumentReady(
        contract.tenantId,
        "final",
        contract._id,
        result.finalDocument?.sourceVersion,
      )
      .catch((e) => logger.warn({ err: e }, "Contract-finalized tenant notification failed (non-fatal)"));
    res.status(201).json({
      success: true,
      status: contract.status,
      finalDocument: result.finalDocument,
      document: {
        version: result.document.version,
        fileName: result.document.fileName,
        fileHash: result.document.fileHash,
        fileSize: result.document.fileSize,
        mimeType: result.document.mimeType,
        uploadedAt: result.document.uploadedAt,
      },
    });
  } catch (error) {
    fail(res, error);
  }
};

// The formal replacement process the FINAL_DOCUMENT_REPLACEMENT_REQUIRES_FORMAL_PROCESS
// guard (contractSigningService.uploadSignedContract, contractNotarizationService
// .assertDirectUploadAllowed) refers to but otherwise blocks entirely — an admin who
// finalized the wrong scan had no way to correct it before this endpoint existed.
export const replaceFinalDocument = async (req, res) => {
  try {
    if (req.body?.confirmed !== true && req.body?.confirmed !== "true") {
      return res.status(400).json({
        error: "Replacement confirmation is required.",
        code: "FINAL_DOCUMENT_REPLACEMENT_CONFIRMATION_REQUIRED",
      });
    }
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    const result = await replaceFinalContractDocument({
      contract,
      file: req.file,
      actorId: admin._id,
      replacementReason: req.body?.replacementReason,
    });
    await auditSigningChange(
      req, before, contract,
      `Final Contract document replaced (v${result.previousVersion} -> v${result.nextVersion}): ${req.body?.replacementReason || ""}`,
    );
    notify
      .contractDocumentReady(contract.tenantId, "final", contract._id, result.finalDocument?.sourceVersion)
      .catch((e) => logger.warn({ err: e }, "Contract-replaced tenant notification failed (non-fatal)"));
    res.status(200).json({
      success: true,
      status: contract.status,
      finalDocument: result.finalDocument,
      previousVersion: result.previousVersion,
      nextVersion: result.nextVersion,
    });
  } catch (error) { fail(res, error); }
};

export const getFinalDocumentHistory = async (req, res) => {
  try {
    const contract = await loadSigningContract(req);
    const history = [...(contract.finalDocumentHistory || [])]
      .sort((a, b) => Number(b.version) - Number(a.version))
      .map((entry) => ({
        version: entry.version,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        mimeType: entry.mimeType,
        sourceType: entry.sourceType,
        publishedAt: entry.publishedAt,
        publishedBy: entry.publishedBy,
        replacementReason: entry.replacementReason,
        supersededAt: entry.supersededAt,
        supersededBy: entry.supersededBy,
        status: "SUPERSEDED",
      }));
    const current = contract.finalDocument ? {
      version: contract.finalDocument.version,
      fileName: contract.finalDocument.fileName,
      fileSize: contract.finalDocument.fileSize,
      mimeType: contract.finalDocument.mimeType,
      sourceType: contract.finalDocument.sourceType,
      publishedAt: contract.finalDocument.publishedAt,
      publishedBy: contract.finalDocument.publishedBy,
      replacementReason: contract.finalDocument.replacementReason,
      status: "ACTIVE",
    } : null;
    res.json({ success: true, current, history });
  } catch (error) { fail(res, error); }
};

export const streamNotarizedDocument = async (req, res) => {
  try {
    const contract = await loadSigningContract(req);
    const requested = req.params.version ? Number(req.params.version) : null;
    const document = requested
      ? contract.notarizedDocuments.find((item) => Number(item.version) === requested)
      : [...(contract.notarizedDocuments || [])].filter((item) => !item.superseded)
        .sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (!document) return res.status(404).json({ error: "Notarized Contract file not found.", code: "NOTARIZED_DOCUMENT_NOT_FOUND" });
    const inspected = await inspectNotarizedContractDocument(document).catch(() => null);
    if (!inspected) return res.status(404).json({ error: "Notarized Contract file not found.", code: "NOTARIZED_DOCUMENT_NOT_FOUND" });
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Length", inspected.size);
    res.setHeader("Content-Disposition", `${req.query?.download === "true" ? "attachment" : "inline"}; filename="${buildContractPdfFilename(contract)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    inspected.createReadStream().on("error", (streamError) => res.destroy(streamError)).pipe(res);
  } catch (error) { fail(res, error); }
};

export const verifyNotarizedDocument = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({
      error: "Notarized-copy verification confirmation is required.",
      code: "NOTARIZED_DOCUMENT_VERIFICATION_CONFIRMATION_REQUIRED",
    });
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    await verifyNotarizedContract({
      contract, actorId: admin._id, notes: req.body?.notes,
      documentVersion: req.body?.documentVersion,
      checklist: req.body?.checklist,
    });
    await auditSigningChange(req, before, contract,
      "Signed-and-notarized Contract copy verified; Contract moved to notarized");
    res.json({ success: true, status: contract.status, notarizationVerifiedAt: contract.notarizationVerifiedAt });
  } catch (error) { fail(res, error); }
};

export const rejectNotarizedDocument = async (req, res) => {
  try {
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    const before = contract.toObject();
    await rejectNotarizedContract({
      contract, actorId: admin._id, reason: req.body?.reason,
      documentVersion: req.body?.documentVersion,
    });
    await auditSigningChange(req, before, contract, "Signed-and-notarized Contract copy rejected");
    res.json({
      success: true, status: contract.status,
      rejectionReason: contract.notarizationRejectionReason,
    });
  } catch (error) { fail(res, error); }
};

const publicationAudit = async (req, before, contract, action, channel = "admin_web") => {
  const sourceVersion = contract.finalDocument?.sourceVersion || contract.notarizedDocumentVersion;
  const hash = contract.finalDocument?.fileHash || contract.notarizedFileHash;
  await auditLogger.logModification(
    req, "contract", contract._id, before, contract.toObject(),
    `${action}; channel=${channel}; contract=${contract.contractNumber}; branch=${contract.branch}; ` +
    `tenant=${contract.tenantId}; sourceNotarizedVersion=${sourceVersion}; finalHash=${hash || "pending"}; ` +
    `previousStatus=${before?.status || contract.status}; newStatus=${contract.status}`,
  );
};
const assertPublicationTenant = async (contract) => {
  const exists = await User.exists({ _id: contract.tenantId, role: { $in: ["tenant", "applicant"] } });
  if (!exists) throw Object.assign(new Error("The Contract tenant owner could not be resolved."), {
    code: "CONTRACT_TENANT_NOT_FOUND", statusCode: 422,
  });
};

export const readyContractForPublication = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({
      error: "Publication-readiness confirmation is required.",
      code: "PUBLICATION_READINESS_CONFIRMATION_REQUIRED",
    });
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    await assertPublicationTenant(contract);
    const before = contract.toObject();
    await markContractReadyForPublication({ contract, actorId: admin._id });
    await publicationAudit(req, before, contract, "Contract marked ready for publication");
    res.json({
      success: true,
      status: contract.status,
      readyForPublicationAt: contract.readyForPublicationAt,
    });
  } catch (error) { fail(res, error); }
};

export const publishContract = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({
      error: "Final publication confirmation is required.",
      code: "PUBLICATION_CONFIRMATION_REQUIRED",
    });
    const admin = await actor(req);
    const contract = await loadSigningContract(req);
    await assertPublicationTenant(contract);
    const before = contract.toObject();
    await publishFinalContract({
      contract,
      actorId: admin._id,
      checklist: req.body?.checklist,
      notes: req.body?.notes,
    });
    await publicationAudit(req, before, contract, "Publication review completed");
    await publicationAudit(req, before, contract,
      `Final Contract published at ${contract.publishedAt?.toISOString()}`);
    notify
      .contractDocumentReady(contract.tenantId, "final", contract._id, contract.finalDocument?.sourceVersion)
      .catch((e) => logger.warn({ err: e }, "Contract-published tenant notification failed (non-fatal)"));
    if (contract.tenantId) {
      emitToUser(contract.tenantId, "contract:updated", {
        contractId: String(contract._id),
        contractNumber: contract.contractNumber,
        status: contract.status,
        isFinal: true,
      });
    }
    emitToAdmins("contract:updated", {
      contractId: String(contract._id),
      contractNumber: contract.contractNumber,
      status: contract.status,
      branch: contract.branch,
      isFinal: true,
    });
    res.json({
      success: true,
      status: contract.status,
      publishedAt: contract.publishedAt,
      finalDocument: {
        fileName: contract.finalDocument.fileName,
        fileSize: contract.finalDocument.fileSize,
        mimeType: contract.finalDocument.mimeType,
        pageCount: contract.finalDocument.pageCount,
        sourceVersion: contract.finalDocument.sourceVersion,
        publishedAt: contract.finalDocument.publishedAt,
      },
    });
  } catch (error) { fail(res, error); }
};

const streamFinal = async ({ req, res, contract, channel }) => {
  const resolved = await resolvePublishedFinalDocument(contract);
  const download = req.query?.download === "1" || req.query?.download === "true";
  res.setHeader("Content-Type", resolved.finalDocument.mimeType);
  res.setHeader("Content-Length", resolved.finalDocument.fileSize);
  res.setHeader("Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${buildContractPdfFilename(contract)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  resolved.createReadStream()
    .on("error", (streamError) => res.destroy(streamError)).pipe(res);
};

export const streamFinalContract = async (req, res) => {
  try {
    const contract = await loadSigningContract(req);
    await streamFinal({ req, res, contract, channel: "admin_web" });
  } catch (error) { fail(res, error); }
};

export const validateContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    const admin = await actor(req);
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    if (!["draft", "incomplete", "ready_for_generation"].includes(contract.status)) {
      return res.status(409).json({ error: "Only draft-stage contracts can be validated.", code: "CONTRACT_NOT_VALIDATABLE" });
    }
    const validation = await validateContractForGeneration(contract, {
      requestedTemplateId: req.body?.templateId || null,
    });
    try {
      await validateContractRoomAssignment(contract);
    } catch (compatibilityError) {
      if (
        ["ROOM_TYPE_NOT_ALLOWED_FOR_BRANCH", "CONTRACT_BRANCH_CONFLICT", "CONTRACT_ROOM_TYPE_CONFLICT"]
          .includes(compatibilityError.code)
      ) {
        const oldData = contract.toObject();
        if (contract.status !== "incomplete") {
          await transitionContract(
            contract,
            "incomplete",
            admin._id,
            compatibilityError.message,
          );
        }
        await auditLogger.logModification(
          req,
          "contract",
          contract._id,
          oldData,
          contract.toObject(),
          "Contract assignment compatibility validation failed",
        );
      }
      throw compatibilityError;
    }
    const nextStatus = validation.status;
    const oldData = contract.toObject();
    if (contract.status !== nextStatus) await transitionContract(contract, nextStatus, admin._id, "Contract data validated");
    if (validation.valid) {
      Object.assign(contract, validation.generationData.pricing);
      contract.templateType = validation.template.templateId;
      contract.templateVersion = validation.template.templateVersion;
      contract.legalContentVersion = validation.template.legalContentVersion;
      contract.validatedGenerationData = validation.generationData;
      contract.lastValidatedAt = new Date();
      contract.updatedBy = admin._id;
      await contract.save();
    }
    await auditLogger.logModification(req, "contract", contract._id, oldData, contract.toObject(), "Validated Contract data");
    const { generationData, ...publicValidation } = validation;
    res.json({ validation: publicValidation, contract });
  } catch (error) {
    fail(res, error);
  }
};

export const approveGenerationPricing = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        error: "Explicit pricing approval confirmation is required.",
        code: "CONTRACT_PRICING_APPROVAL_CONFIRMATION_REQUIRED",
      });
    }
    if (req.body?.decision !== "approve") {
      return res.status(400).json({
        error: "An explicit pricing approval decision is required.",
        code: "CONTRACT_PRICING_APPROVAL_DECISION_REQUIRED",
      });
    }
    const admin = await actor(req);
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const before = contract.toObject();
    await approveContractPricing({
      contract, actorId: admin._id,
      pricing: {
        regularMonthlyRate: contract.regularMonthlyRate,
        discountPercentage: contract.discountPercentage,
        discountAmount: contract.discountAmount,
        approvedMonthlyRate: contract.approvedMonthlyRate,
        advanceRentAmount: contract.advanceRentAmount,
        securityDepositAmount: contract.securityDepositAmount,
        reservationFeeAmount: contract.reservationFeeAmount,
      },
      notes: req.body?.notes,
    });
    await auditLogger.logModification(
      req, "contract", contract._id, before, contract.toObject(),
      `Contract legal pricing approved for ${contract.contractNumber}`,
    );
    res.json({
      success: true,
      pricing: {
        regularMonthlyRate: contract.regularMonthlyRate,
        discountPercentage: contract.discountPercentage,
        discountAmount: contract.discountAmount,
        approvedMonthlyRate: contract.approvedMonthlyRate,
        advanceRentAmount: contract.advanceRentAmount,
        securityDepositAmount: contract.securityDepositAmount,
        reservationFeeAmount: contract.reservationFeeAmount,
        pricingApprovedAt: contract.pricingApprovedAt,
        pricingApprovedBy: admin._id,
        approverRole: admin.role,
      },
    });
  } catch (error) { fail(res, error); }
};

export const confirmLegacyReservationApproval = async (req, res) => {
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ error: "Legacy approval confirmation is required.", code: "LEGACY_APPROVAL_CONFIRMATION_REQUIRED" });
    }
    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(422).json({ error: "A reason is required.", code: "LEGACY_APPROVAL_REASON_REQUIRED" });
    }
    const admin = await actor(req);
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const reservation = await Reservation.findById(contract.reservationId);
    if (!reservation) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const eligibility = resolveReservationContractEligibility(reservation.toObject(), {
      tenantExists: Boolean(contract.tenantId),
      roomExists: Boolean(contract.roomId),
      bedExists: Boolean(contract.bedId || contract.bedLabel),
      roomType: contract.roomType,
    });
    if (eligibility.approvalState !== "legacy_completed") {
      return res.status(422).json({
        error: "Only completed legacy Reservations with verified occupancy evidence can be confirmed.",
        code: "LEGACY_RESERVATION_NOT_CONFIRMABLE",
        details: eligibility,
      });
    }
    const before = reservation.toObject();
    const confirmedAt = new Date();
    reservation.applicationReviewedAt = confirmedAt;
    reservation.applicationReviewedBy = admin._id;
    reservation.approvedForPaymentAt ||= confirmedAt;
    reservation.legacyContractApprovalConfirmedAt = confirmedAt;
    reservation.legacyContractApprovalConfirmedBy = admin._id;
    reservation.legacyContractApprovalReason = reason;
    await reservation.save();
    await auditLogger.logModification(
      req, "reservation", reservation._id, before, reservation.toObject(),
      "Confirmed legacy Reservation approval for Contract generation",
    );
    const validation = await validateContractForGeneration(contract);
    res.json({
      success: true,
      approval: { approvedBy: admin._id, approverRole: admin.role, approvedAt: confirmedAt, reason },
      validation: { ...validation, generationData: undefined },
    });
  } catch (error) { fail(res, error); }
};

export const getGenerationPreview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const validation = await validateContractForGeneration(contract, {
      requestedTemplateId: req.query?.templateId || null,
    });
    let preview = validation.generationData;
    if (!preview && validation.missingFields.length === 0) {
      preview = await buildContractGenerationData(contract);
    }
    const { generationData, ...publicValidation } = validation;
    res.json({
      valid: validation.valid,
      status: contract.status,
      validation: publicValidation,
      preview,
    });
  } catch (error) {
    fail(res, error);
  }
};

export const generatePreparedContract = async (req, res) => {
  let contract = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    const admin = await actor(req);
    contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const oldData = contract.toObject();
    const result = await generatePreparedContractPdf({
      contractId: contract._id,
      actorId: admin._id,
      regenerationReason: req.body?.regenerationReason || "",
    });
    const document = result.document.toObject ? result.document.toObject() : result.document;
    await auditLogger.logModification(
      req,
      "contract",
      result.contract._id,
      oldData,
      result.contract.toObject(),
      result.isRegeneration ? "Prepared Contract PDF regenerated" : "Prepared Contract PDF generated",
    );
    if (result.isRegeneration) {
      await auditLogger.logModification(
        req,
        "contract",
        result.contract._id,
        oldData,
        result.contract.toObject(),
        "Earlier prepared Contract version superseded",
      );
    }
    notify
      .contractDocumentReady(result.contract.tenantId, "prepared", result.contract._id, document.version)
      .catch((e) => logger.warn({ err: e }, "Contract-prepared tenant notification failed (non-fatal)"));
    const preparedTenantId = result.contract?.tenantId;
    if (preparedTenantId) {
      emitToUser(preparedTenantId, "contract:updated", {
        contractId: String(result.contract._id),
        contractNumber: result.contract.contractNumber,
        status: result.contract.status,
        version: document.version,
      });
    }
    emitToAdmins("contract:updated", {
      contractId: String(result.contract._id),
      contractNumber: result.contract.contractNumber,
      status: result.contract.status,
      branch: result.contract.branch,
      version: document.version,
    });
    res.status(201).json({
      success: true,
      contract: {
        id: result.contract._id,
        contractNumber: result.contract.contractNumber,
        status: result.contract.status,
        templateId: document.templateId,
        templateVersion: document.templateVersion,
        coordinateVersion: document.coordinateVersion,
        generatedVersion: document.version,
        generatedAt: document.generatedAt,
        fileName: document.fileName,
        fileHash: document.fileHash,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
      },
    });
  } catch (error) {
    await auditLogger.logError(
      req,
      error,
      `Prepared Contract generation failed${contract?.contractNumber ? `: ${contract.contractNumber}` : ""}`,
    );
    fail(res, error);
  }
};

export const streamPreparedContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    const newestDocument = [...(contract.preparedDocuments || [])]
      .filter((entry) => entry.superseded !== true)
      .sort((a, b) => Number(b.version) - Number(a.version))[0];
    const requestedVersion = req.params.version
      ? Number(req.params.version)
      : Number(newestDocument?.version);
    if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
      return res.status(400).json({ error: "Invalid prepared document version.", code: "INVALID_DOCUMENT_VERSION" });
    }
    const document = contract.preparedDocuments.find(
      (entry) => entry.version === requestedVersion,
    );
    if (!document) return res.status(404).json({ error: "Prepared Contract file not found.", code: "PREPARED_CONTRACT_NOT_FOUND" });
    const resolved = await inspectPreparedContractDocument(document);
    await auditLogger.logModification(
      req,
      "contract",
      contract._id,
      contract.toObject(),
      contract.toObject(),
      `Prepared Contract PDF downloaded by admin (version ${requestedVersion})`,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", resolved.size);
    res.setHeader("Content-Disposition", `inline; filename="${buildContractPdfFilename(contract)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    resolved.createReadStream().on("error", (error) => {
      if (!res.headersSent) fail(res, error);
      else res.destroy(error);
    }).pipe(res);
  } catch (error) {
    fail(res, error);
  }
};

export const getTenantCurrentContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tenantId)) return res.status(400).json({ error: "Invalid tenant id.", code: "INVALID_TENANT_ID" });
    const contract = await findCurrentContract({ tenantId: req.params.tenantId });
    if (!contract) return res.status(404).json({ error: "No current Contract found.", code: "CONTRACT_NOT_FOUND" });
    assertContractBranchAccess(req, contract.branch);
    // Embed the canonical acknowledgement state (draft or final) so Admin
    // Contract Management / Tenant Details render Pending/Acknowledged from
    // the same source the tenant + mobile use, in one call. The standalone
    // GET /contracts/:id/acknowledgement endpoint stays for live refetch.
    let acknowledgement = null;
    try {
      acknowledgement = await getAcknowledgementStatusForContract(contract, contract.tenantId);
    } catch (ackErr) {
      logger.warn({ err: ackErr, contractId: String(contract._id) }, "[getTenantCurrentContract] acknowledgement resolve failed (non-fatal)");
    }
    // Canonical signed-scan identity for THIS contract (walks the lineage for
    // a Room Transfer Addendum that has no scan of its own) — the Admin
    // "Official Digital Lease Contract -> Signed Scan" viewer consumes this
    // instead of guessing from `contract.signedDocuments`.
    let signedScan = null;
    try {
      signedScan = await resolveSignedScanForContract(contract);
    } catch (scanErr) {
      logger.warn({ err: scanErr, contractId: String(contract._id) }, "[getTenantCurrentContract] signed-scan resolve failed (non-fatal)");
    }
    const contractPayload = contract.toObject ? contract.toObject() : contract;
    res.json({ contract: { ...contractPayload, id: String(contract._id), acknowledgement, signedScan } });
  } catch (error) {
    if (error.code === "MULTIPLE_CANONICAL_CONTRACTS") {
      logger.error(
        { requestId: req.id, tenantId: req.params.tenantId, candidateCount: error.candidateCount },
        "Multiple resident-visible canonical Contracts detected (admin lookup)",
      );
    }
    fail(res, error);
  }
};

const tenantActor = async (req) => {
  const user = await User.findOne({ firebaseUid: req.user.uid }).select("_id role").lean();
  if (!user) throw Object.assign(new Error("Authenticated user not found."), {
    statusCode: 404, code: "USER_NOT_FOUND",
  });
  if (!["tenant", "applicant"].includes(user.role)) {
    throw Object.assign(new Error("Access denied."), {
      statusCode: 403, code: "TENANT_CONTRACT_ACCESS_DENIED",
    });
  }
  req.user.mongoId = user._id;
  req.user.role = user.role;
  return user;
};

const findOwnedContract = async (req) => {
  const user = await tenantActor(req);
  if (!mongoose.isValidObjectId(req.params.contractId)) {
    throw Object.assign(new Error("Contract not found."), {
      statusCode: 404, code: "CONTRACT_NOT_FOUND",
    });
  }
  let contract = await Contract.findOne({ _id: req.params.contractId, tenantId: user._id });
  if (!contract) {
    contract = await resolveTenantCanonicalContract(user._id);
    if (!contract || String(contract._id) !== String(req.params.contractId)) {
      throw Object.assign(new Error("Contract not found."), {
        statusCode: 404, code: "CONTRACT_NOT_FOUND",
      });
    }
  }
  return { user, contract };
};

export const getMyCurrentContract = async (req, res) => {
  try {
    const user = await tenantActor(req);
    let contract = await resolveTenantCanonicalContract(user._id);

    // If the resolved contract belongs to a reservation that has been cancelled or rejected,
    // auto-reconcile it immediately by cascading archive/void and excluding it.
    if (contract && contract.reservationId) {
      const parentReservation = await Reservation.findById(contract.reservationId).select("status").lean();
      if (parentReservation && ["cancelled", "rejected", "archived"].includes(parentReservation.status)) {
        await archiveContractForCancelledReservation({
          reservationId: contract.reservationId,
          actorId: user._id,
        }).catch((err) => logger.warn({ err }, "[getMyCurrentContract] On-the-fly cancellation archive failed"));
        try {
          emitToUser(user._id, "contract:updated", { status: "cancelled", reservationId: contract.reservationId });
        } catch (_) {
          // Socket dispatch failure is non-fatal
        }
        contract = null;
      }
    }

    if (!contract) {
      try {
        const settledReservation = await Reservation.findOne({
          userId: user._id,
          status: { $nin: ["cancelled", "rejected", "archived", "completed"] },
          $or: [
            { initialPaymentStatus: "paid" },
            { advanceRentPaid: true },
            { status: "moveIn" },
          ],
        }).sort({ createdAt: -1 });

        if (settledReservation) {
          const { autoGenerateDepositSettledContract } = await import(
            "../services/autoContractOrchestratorService.js"
          );
          await autoGenerateDepositSettledContract({
            reservationId: settledReservation._id,
            actorId: user._id,
          });
          contract = await resolveTenantCanonicalContract(user._id);
        }
      } catch (autoErr) {
        logger.warn({ err: autoErr }, "[getMyCurrentContract] Auto-generation recovery failed (non-fatal)");
      }
    }
    if (!contract) {
      try {
        const activeStay = await Stay.findOne({
          tenantId: user._id,
          status: { $in: ["active", "ending_soon"] },
        }).lean();
        if (activeStay) {
          const stayData = await resolveDigitalStayProofData({ tenantId: user._id });
          if (stayData) {
            return res.json({
              contractAvailable: true,
              state: "STAY_PROOF_AVAILABLE",
              contract: {
                // No canonical Contract row exists for this tenant yet — this
                // object is derived from the active Stay only. `id` is a
                // human reference string, NOT a Mongo ObjectId, so it must
                // never be used to hit /contracts/my/:id/documents/*.
                // `isSynthetic` tells the client to render the DOM preview
                // only (no canonical-PDF Print/Download, no acknowledgement).
                id: stayData.referenceNumber,
                contractId: stayData.referenceNumber,
                contractNumber: stayData.referenceNumber,
                isSynthetic: true,
                isCanonical: true,
                status: "generated",
                displayStatus: "Lease Draft — Review Copy",
                branch: stayData.branchName,
                propertyName: "Lilycrest Dormitory",
                roomNumber: stayData.roomNumber,
                bedLabel: stayData.bedLabel,
                roomType: stayData.roomType,
                leaseStartDate: stayData.leaseStartDate,
                leaseEndDate: stayData.leaseEndDate,
                leaseDurationMonths: stayData.leaseDurationMonths,
                approvedMonthlyRate: stayData.monthlyRent,
                advanceRentAmount: stayData.advanceRent,
                securityDepositAmount: stayData.securityDeposit,
                stayProofAvailable: true,
                preparedDocument: { available: false },
                finalDocument: { available: false },
                tenantDocument: {
                  // No real prepared PDF is resolvable without a Contract
                  // row — the tenant sees the live DOM preview instead.
                  available: false,
                  type: "generated_draft",
                  label: "Lease Draft — For Review",
                  isFinal: false,
                },
                acknowledgement: {
                  required: false,
                  acknowledged: false,
                  acknowledgedAt: null,
                  documentVersion: null,
                  documentKind: null,
                  documentLabel: null,
                },
              },
              documents: { prepared: { available: false } },
            });
          }
        }
      } catch {
        // Fall through to standard empty response
      }
      return res.json({
        contractAvailable: false,
        state: "NO_PUBLISHED_CONTRACT",
        contract: null,
        documents: { prepared: { available: false, issue: "NO_PUBLISHED_CONTRACT" } },
      });
    }
    let preparedDocument = null;
    let preparedDocumentIssue = null;
    if (selectCurrentPreparedDocument(contract)) {
      try {
        preparedDocument = (await resolveCurrentPreparedDocument(contract)).document;
      } catch (error) {
        preparedDocumentIssue = error.code || "PREPARED_DOCUMENT_UNAVAILABLE";
      }
    }
    // Canonical acknowledgement state (draft or final) embedded in the same
    // payload so a plain page load / refresh returns it with no second
    // round-trip. Same service the standalone GET .../acknowledgement
    // endpoint and Mobile use — one source of truth. Non-fatal on error.
    let acknowledgement = null;
    try {
      acknowledgement = await getAcknowledgementStatusForContract(contract, user._id);
    } catch (ackErr) {
      logger.warn({ err: ackErr, contractId: String(contract._id) }, "[getMyCurrentContract] acknowledgement resolve failed (non-fatal)");
    }
    // Canonical signed-scan identity (lineage-aware for a Room Transfer
    // Addendum) so Tenant Web's Signed Scan tab works in the Addendum-current
    // case, labelled as inherited from the original lease.
    let signedScan = null;
    try {
      signedScan = await resolveSignedScanForContract(contract);
    } catch (scanErr) {
      logger.warn({ err: scanErr, contractId: String(contract._id) }, "[getMyCurrentContract] signed-scan resolve failed (non-fatal)");
    }
    const view = toTenantContractView(contract, new Date(), {
      preparedDocument,
      preparedDocumentIssue,
      acknowledgement,
      signedScan,
    });

    // "Upcoming" leg of the current/upcoming/history triad — a renewal or
    // room-transfer successor to this contract that hasn't taken effect yet
    // (FINAL + SCHEDULED, or still generated/awaiting signature). Web and
    // mobile share this one resolver; neither gets its own logic.
    let upcomingView = null;
    try {
      const upcomingContract = await resolveTenantUpcomingContract(user._id);
      if (upcomingContract) {
        let upcomingPrepared = null;
        if (selectCurrentPreparedDocument(upcomingContract)) {
          try {
            upcomingPrepared = (await resolveCurrentPreparedDocument(upcomingContract)).document;
          } catch {
            // Non-fatal — upcoming view still returns without a prepared document
          }
        }
        const upcomingSignedScan = await resolveSignedScanForContract(upcomingContract).catch(() => null);
        upcomingView = toTenantContractView(upcomingContract, new Date(), {
          preparedDocument: upcomingPrepared,
          signedScan: upcomingSignedScan,
        });
      }
    } catch {
      upcomingView = null;
    }

    // Upcoming Room Transfer (tenant-facing): an open ScheduledRoomTransfer,
    // if the tenant has one. Display-only — the tenant's current room / rent
    // (contract `view` above) stay the SOURCE values until its effectiveDate.
    let scheduledRoomTransfer = null;
    try {
      if (contract.reservationId) {
        scheduledRoomTransfer = await getOpenScheduledRoomTransferForReservation(contract.reservationId);
      }
    } catch (schedErr) {
      logger.warn({ err: schedErr }, "[getMyCurrentContract] scheduled room transfer resolve failed (non-fatal)");
    }

    res.json({
      contractAvailable: true,
      state: preparedDocument
        ? "CONTRACT_AVAILABLE"
        : contract.status === "generated"
          ? "PREPARED_DOCUMENT_UNAVAILABLE"
          : "CONTRACT_BEING_PREPARED",
      contract: view,
      documents: { prepared: view.preparedDocument },
      upcoming: upcomingView,
      scheduledRoomTransfer,
    });
  } catch (error) {
    if (error.code === "MULTIPLE_CANONICAL_CONTRACTS") {
      logger.error(
        { requestId: req.id, tenantUid: req.user?.uid, candidateCount: error.candidateCount },
        "Multiple resident-visible canonical Contracts detected",
      );
    }
    fail(res, error);
  }
};

export const downloadMyStayProof = async (req, res) => {
  try {
    const user = await tenantActor(req);
    const stayData = await resolveDigitalStayProofData({ tenantId: user._id });
    const pdfBuffer = await renderDigitalStayProofPdf(stayData);
    const isDownload = req.query?.download !== "0" && req.query?.download !== "false";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    const tenantName = sanitizeDownloadFilename(stayData.tenantName || "", "");
    const filename = tenantName
      ? `Proof-of-Residency-${stayData.referenceNumber}-${tenantName}.pdf`
      : `Proof-of-Residency-${stayData.referenceNumber}.pdf`;
    res.setHeader("Content-Disposition", `${isDownload ? "attachment" : "inline"}; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdfBuffer);
  } catch (error) {
    fail(res, error);
  }
};

export const getMyStayProofData = async (req, res) => {
  try {
    const user = await tenantActor(req);
    const stayData = await resolveDigitalStayProofData({ tenantId: user._id });
    res.json({ success: true, stayProof: stayData });
  } catch (error) {
    fail(res, error);
  }
};

export const getPublicStayVerification = async (req, res) => {
  try {
    const { referenceId } = req.params;
    if (!referenceId) return res.status(400).json({ verified: false, message: "Reference ID is required" });
    
    const cleanRef = referenceId.trim();
    let contract = await Contract.findOne({
      $or: [
        { contractNumber: cleanRef },
        { contractNumber: cleanRef.toUpperCase() },
      ],
    }).lean();

    let reservation = null;
    if (!contract) {
      reservation = await Reservation.findOne({
        $or: [
          { reservationCode: cleanRef },
          { reservationCode: cleanRef.toUpperCase() },
        ],
      }).lean();
    }

    if (!contract && !reservation) {
      return res.status(404).json({
        verified: false,
        message: "No active residency record matching this reference number was found.",
      });
    }

    const stayData = await resolveDigitalStayProofData({
      contractId: contract?._id,
      reservationId: reservation?._id,
      tenantId: contract?.tenantId || reservation?.userId,
    });

    res.json({
      verified: true,
      verification: {
        referenceNumber: stayData.referenceNumber,
        tenantName: stayData.tenantName,
        branchName: stayData.branchName,
        branchAddress: stayData.branchAddress,
        roomNumber: stayData.roomNumber,
        bedLabel: stayData.bedLabel,
        roomType: stayData.roomType,
        leaseStartDate: stayData.leaseStartDate,
        leaseEndDate: stayData.leaseEndDate,
        leaseDurationMonths: stayData.leaseDurationMonths,
        status: stayData.status,
        verificationStatus: stayData.verificationStatus,
        issuedAt: stayData.issuedAt,
      },
    });
  } catch (error) {
    res.status(404).json({
      verified: false,
      message: error.message || "Unable to verify residency record.",
    });
  }
};

export const getStayProofDataForAdmin = async (req, res) => {
  try {
    await actor(req);
    const { id } = req.params;
    const stayData = await resolveDigitalStayProofData({ id });
    res.json({ success: true, stayProof: stayData });
  } catch (error) {
    fail(res, error);
  }
};

export const downloadStayProofForAdmin = async (req, res) => {
  try {
    await actor(req);
    const { id } = req.params;
    const stayData = await resolveDigitalStayProofData({ id });
    const pdfBuffer = await renderDigitalStayProofPdf(stayData);
    const isDownload = req.query?.download === "1" || req.query?.download === "true";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    const tenantName = sanitizeDownloadFilename(stayData.tenantName || "", "");
    const filename = tenantName
      ? `Proof-of-Residency-${stayData.referenceNumber}-${tenantName}.pdf`
      : `Proof-of-Residency-${stayData.referenceNumber}.pdf`;
    res.setHeader("Content-Disposition", `${isDownload ? "attachment" : "inline"}; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdfBuffer);
  } catch (error) {
    fail(res, error);
  }
};

export const getMyContractHistory = async (req, res) => {
  try {
    const user = await tenantActor(req);
    const contracts = await resolveTenantContractHistory(user._id);
    // Each historical Contract resolves ITS OWN signed scan (an older
    // historical Contract must never show the current Contract's scan). An
    // amendment/replacement in history still inherits from its lineage.
    const views = await Promise.all(
      contracts.map(async (contract) => {
        const signedScan = await resolveSignedScanForContract(contract).catch(() => null);
        return toTenantContractView(contract, new Date(), { signedScan });
      }),
    );
    res.json({ contracts: views });
  } catch (error) {
    fail(res, error);
  }
};

export const getMyContractDetails = async (req, res) => {
  try {
    const { contract } = await findOwnedContract(req);
    let preparedDocument = null;
    if (selectCurrentPreparedDocument(contract)) {
      preparedDocument = await resolveCurrentPreparedDocument(contract)
        .then((resolved) => resolved.document)
        .catch(() => null);
    }
    const signedScan = await resolveSignedScanForContract(contract).catch(() => null);
    res.json({ contract: toTenantContractView(contract, new Date(), { preparedDocument, signedScan }) });
  } catch (error) {
    fail(res, error);
  }
};

// Tenant flow: "I confirm that I have viewed this contract." Not a
// signature, not legal acceptance — see ContractAcknowledgement.js header.
export const acknowledgeMyContract = async (req, res) => {
  try {
    const { user, contract } = await findOwnedContract(req);
    const record = await acknowledgeContract({ contractId: contract._id, tenantId: user._id, req });
    res.json({
      acknowledged: true,
      acknowledgedAt: record.acknowledgedAt,
      documentVersion: record.documentVersion,
    });
  } catch (error) {
    fail(res, error);
  }
};

export const getMyContractAcknowledgement = async (req, res) => {
  try {
    const { user, contract } = await findOwnedContract(req);
    const status = await getAcknowledgementStatus({ contractId: contract._id, tenantId: user._id });
    res.json(status);
  } catch (error) {
    fail(res, error);
  }
};

// Admin-facing, read-only — deliberately no admin action to acknowledge on
// the tenant's behalf.
export const getContractAcknowledgementForAdmin = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).select("tenantId").lean();
    if (!contract) {
      return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    }
    const status = await getAcknowledgementStatus({ contractId: contract._id, tenantId: contract.tenantId });
    res.json(status);
  } catch (error) {
    fail(res, error);
  }
};

export const streamMyPreparedContract = async (req, res) => {
  try {
    const { contract } = await findOwnedContract(req);
    const newestDocument = selectCurrentPreparedDocument(contract);
    const requestedVersion = req.params.version
      ? Number(req.params.version)
      : Number(newestDocument?.version);
    if (!Number.isInteger(requestedVersion) || requestedVersion !== Number(newestDocument?.version)) {
      return res.status(404).json({
        error: "The prepared document is temporarily unavailable.",
        code: "PREPARED_DOCUMENT_UNAVAILABLE",
      });
    }
    const { document, size: fileSize, createReadStream } =
      await resolveCurrentPreparedDocument(contract);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", fileSize);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${buildContractPdfFilename(contract)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    createReadStream().on("error", (error) => {
      if (!res.headersSent) fail(res, error);
      else res.destroy(error);
    }).pipe(res);
  } catch (error) {
    fail(res, error);
  }
};

export const streamMyFinalContract = async (req, res) => {
  try {
    const { contract } = await findOwnedContract(req);
    await streamFinal({ req, res, contract, channel: "tenant_web" });
  } catch (error) { fail(res, error); }
};

export const streamMySignedContract = async (req, res) => {
  try {
    const user = await tenantActor(req);
    let contract = null;
    if (req.params.contractId && mongoose.isValidObjectId(req.params.contractId)) {
      contract = await Contract.findOne({ _id: req.params.contractId, tenantId: user._id });
    }
    if (!contract) {
      contract = await resolveTenantCanonicalContract(user._id);
    }
    if (!contract) {
      return res.status(404).json({ error: "Contract not found.", code: "CONTRACT_NOT_FOUND" });
    }
    const requested = req.params.version ? Number(req.params.version) : null;
    const document = requested
      ? contract.signedDocuments.find((item) => Number(item.version) === requested)
      : [...(contract.signedDocuments || [])].filter((item) => !item.superseded)
        .sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (!document) {
      return res.status(404).json({ error: "Signed Contract file not found.", code: "SIGNED_DOCUMENT_NOT_FOUND" });
    }
    const inspected = await inspectSignedContractDocument(document).catch(() => null);
    if (!inspected) {
      return res.status(404).json({ error: "Signed Contract file not found.", code: "SIGNED_DOCUMENT_NOT_FOUND" });
    }
    res.setHeader("Content-Type", document.mimeType || "application/pdf");
    res.setHeader("Content-Length", inspected.size);
    const isDownload = req.query?.download === "true" || req.query?.download === "1";
    res.setHeader("Content-Disposition", `${isDownload ? "attachment" : "inline"}; filename="${buildContractPdfFilename(contract)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    inspected.createReadStream().on("error", (streamError) => res.destroy(streamError)).pipe(res);
  } catch (error) { fail(res, error); }
};

export const cleanupSupersededTestVersions = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        error: "Explicit cleanup confirmation is required.",
        code: "CONTRACT_CLEANUP_CONFIRMATION_REQUIRED",
      });
    }
    const owner = await actor(req);
    const before = await Contract.findById(req.params.id);
    const result = await cleanUpSupersededTestVersions({
      contractId: req.params.id,
      actorRole: owner.role,
      reason: req.body?.reason,
    });
    await auditLogger.logModification(
      req,
      "contract",
      result.contract._id,
      before?.toObject() || null,
      result.contract.toObject(),
      `Cleaned up superseded test prepared versions: ${result.report.reason}`,
    );
    res.json({ success: true, cleanup: result.report });
  } catch (error) {
    fail(res, error);
  }
};

export const resetPreparedTestContract = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid contract id.", code: "INVALID_CONTRACT_ID" });
    }
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        error: "Explicit reset confirmation is required.",
        code: "CONTRACT_RESET_CONFIRMATION_REQUIRED",
      });
    }
    const owner = await actor(req);
    const before = await Contract.findById(req.params.id);
    const result = await resetPreparedTestDocuments({
      contractId: req.params.id,
      actorRole: owner.role,
      actorId: owner._id,
      reason: req.body?.reason,
    });
    await auditLogger.logModification(
      req,
      "contract",
      result.contract._id,
      before?.toObject() || null,
      result.contract.toObject(),
      `Reset prepared test documents: ${result.report.reason}`,
    );
    res.json({ success: true, reset: result.report });
  } catch (error) {
    fail(res, error);
  }
};
