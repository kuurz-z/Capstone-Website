import crypto from "crypto";
import fs from "fs/promises";
import dayjs from "dayjs";
import {
  OFFICIAL_CONTRACT_TEMPLATE_REGISTRY,
  OFFICIAL_CONTRACT_TEMPLATES,
  createTemplateRegistry,
} from "../config/contractTemplateRegistry.js";
import {
  normalizeContractRoomType,
  validateBranchRoomType,
} from "../config/contractConfig.js";
import { resolveLegalLeaseType } from "../config/contractLegalTerm.js";
import { deriveContractLeaseDates } from "./contractLeaseDateService.js";

const templateError = (message, code, details = undefined, statusCode = 400) =>
  Object.assign(new Error(message), { code, details, statusCode });

const LEASE_TYPE_ALIASES = Object.freeze({
  "short-term": "short-term",
  short_term: "short-term",
  "short term": "short-term",
  short: "short-term",
  monthly: "short-term",
  "1-5 months": "short-term",
  "long-term": "long-term",
  long_term: "long-term",
  "long term": "long-term",
  long: "long-term",
  "6 months": "long-term",
  "6+ months": "long-term",
});

export const normalizeLeaseType = (leaseType) => {
  const normalized = LEASE_TYPE_ALIASES[String(leaseType || "").trim().toLowerCase()];
  if (!normalized) {
    throw templateError("Lease type is not recognized.", "LEASE_TYPE_INVALID", { leaseType });
  }
  return normalized;
};

export const validateLeaseDuration = ({
  leaseType,
  leaseStartDate,
  leaseEndDate,
  leaseDurationMonths,
}) => {
  if (!leaseStartDate || !leaseEndDate) {
    throw templateError("Approved lease start and end dates are required.", "LEASE_DATES_REQUIRED");
  }
  const start = dayjs(leaseStartDate);
  const end = dayjs(leaseEndDate);
  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
    throw templateError("Lease end date must be after its start date.", "LEASE_DATE_RANGE_INVALID");
  }
  const durationMonths = Number(leaseDurationMonths);
  const expectedLeaseType = resolveLegalLeaseType(durationMonths);
  const canonical = deriveContractLeaseDates({ leaseStartDate, leaseDurationMonths: durationMonths });
  // Exact canonical endpoint, or the historical inclusive final millisecond.
  // No tolerance/rounding that could silently accept a different term.
  if (![canonical.leaseEndDate.getTime(), canonical.leaseEndDate.getTime() - 1].includes(end.valueOf())) {
    throw templateError("Stored lease duration does not agree with the approved dates.",
      "LEASE_DURATION_CONFLICT", { storedMonths: durationMonths, expectedEndDate: canonical.leaseEndDate, leaseEndDate });
  }
  const canonicalLeaseType = normalizeLeaseType(leaseType);
  if (canonicalLeaseType !== expectedLeaseType) {
    throw templateError(
      "Lease type does not match the approved duration.",
      "LEASE_TYPE_DURATION_MISMATCH",
      { leaseType: canonicalLeaseType, durationMonths, expectedLeaseType },
    );
  }
  return { leaseType: canonicalLeaseType, durationMonths };
};

export const getOfficialTemplateConfig = (
  templateId,
  registry = OFFICIAL_CONTRACT_TEMPLATE_REGISTRY,
) => {
  const template = registry.get(templateId);
  if (!template) throw templateError("Official contract template is not registered.", "CONTRACT_TEMPLATE_NOT_FOUND", { templateId });
  if (!template.active) throw templateError("Official contract template is inactive.", "CONTRACT_TEMPLATE_INACTIVE", { templateId });
  return template;
};

export const resolveContractTemplate = ({
  branch,
  roomType,
  leaseType,
  leaseStartDate,
  leaseEndDate,
  leaseDurationMonths,
  requestedTemplateId = null,
  registry = OFFICIAL_CONTRACT_TEMPLATE_REGISTRY,
}) => {
  const canonicalRoomType = validateBranchRoomType(branch, roomType);
  const duration = validateLeaseDuration({
    leaseType, leaseStartDate, leaseEndDate, leaseDurationMonths,
  });
  const templateId = `${canonicalRoomType}-${duration.leaseType}`;
  if (requestedTemplateId && requestedTemplateId !== templateId) {
    throw templateError(
      "Requested template does not match verified Contract data.",
      "CONTRACT_TEMPLATE_MISMATCH",
      { requestedTemplateId, resolvedTemplateId: templateId },
      409,
    );
  }
  const template = getOfficialTemplateConfig(templateId, registry);
  return template;
};

export const validateTemplateCompatibility = (template, { branch, roomType, leaseType }) => {
  const canonicalRoomType = validateBranchRoomType(branch, roomType);
  const canonicalLeaseType = normalizeLeaseType(leaseType);
  if (template.roomType !== canonicalRoomType || template.leaseType !== canonicalLeaseType) {
    throw templateError("Official template is incompatible with Contract data.", "CONTRACT_TEMPLATE_MISMATCH");
  }
  return true;
};

export const validateOfficialPricing = (template, pricing = {}) => {
  const errors = [];
  const warnings = [];
  for (const field of [
    "regularMonthlyRate", "discountPercentage", "discountAmount",
    "approvedMonthlyRate", "advanceRentAmount", "securityDepositAmount",
    "reservationFeeAmount",
  ]) {
    if (
      pricing[field] === null ||
      pricing[field] === undefined ||
      pricing[field] === "" ||
      !Number.isFinite(Number(pricing[field])) ||
      Number(pricing[field]) < 0
    ) {
      errors.push({ code: "APPROVED_PRICING_MISSING", field, actual: pricing[field] ?? null });
    }
  }
  if (!pricing.pricingApprovedBy || !pricing.pricingApprovedAt) {
    errors.push({ code: "PRICING_APPROVAL_MISSING", field: "pricingApproval" });
  }
  if (!errors.length) {
    const regular = Number(pricing.regularMonthlyRate);
    const percentage = Number(pricing.discountPercentage);
    const discount = Number(pricing.discountAmount);
    const finalRate = Number(pricing.approvedMonthlyRate);
    const expectedDiscount = Math.round(regular * percentage) / 100;
    if (Math.abs(expectedDiscount - discount) > 0.01 ||
        Math.abs(regular - discount - finalRate) > 0.01) {
      errors.push({ code: "APPROVED_PRICING_CONFLICT", field: "approvedMonthlyRate" });
    }
  }
  return {
    valid: errors.length === 0 && warnings.length === 0,
    code: errors.length
      ? errors[0].code
      : warnings.length
        ? "APPROVED_SPECIAL_RATE_REVIEW_REQUIRED"
        : "PRICING_VALID",
    errors,
    warnings,
  };
};

export const checkOfficialTemplateIntegrity = async (
  templates = OFFICIAL_CONTRACT_TEMPLATES,
  { verifyChecksum = true } = {},
) => {
  createTemplateRegistry(templates);
  const results = [];
  for (const template of templates) {
    const missingMetadata = [
      "templateId", "roomType", "leaseType", "sourceFilePath", "templateVersion",
    ].filter((field) => template[field] === null || template[field] === undefined || template[field] === "");
    if (missingMetadata.length) {
      results.push({ templateId: template.templateId, valid: false, code: "CONTRACT_TEMPLATE_METADATA_MISSING", missingMetadata });
      continue;
    }
    try {
      const file = await fs.readFile(template.sourceFilePath);
      if (file.subarray(0, 5).toString("ascii") !== "%PDF-") {
        results.push({ templateId: template.templateId, valid: false, code: "CONTRACT_TEMPLATE_NOT_PDF" });
        continue;
      }
      const hash = crypto.createHash("sha256").update(file).digest("hex");
      if (verifyChecksum && template.checksum && hash !== template.checksum) {
        results.push({ templateId: template.templateId, valid: false, code: "CONTRACT_TEMPLATE_CHECKSUM_MISMATCH", hash });
        continue;
      }
      results.push({ templateId: template.templateId, valid: true, hash, size: file.length });
    } catch (error) {
      results.push({ templateId: template.templateId, valid: false, code: "CONTRACT_TEMPLATE_FILE_MISSING", error: error.message });
    }
  }
  return { valid: results.every((result) => result.valid), results };
};

export const assertOfficialTemplateAvailable = async (template) => {
  const integrity = await checkOfficialTemplateIntegrity([template]);
  const result = integrity.results[0];
  if (!result?.valid) {
    throw templateError("Official master template is unavailable or invalid.", result?.code || "CONTRACT_TEMPLATE_INVALID", result, 503);
  }
  return result;
};

export { normalizeContractRoomType };
