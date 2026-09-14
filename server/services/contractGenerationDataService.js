import { resolveLegalLeaseType } from "../config/contractLegalTerm.js";
import dayjs from "dayjs";
import { Reservation, Room, Stay, User } from "../models/index.js";
import {
  normalizeContractRoomType,
  resolveContractBranch,
} from "../config/contractConfig.js";
import {
  assertOfficialTemplateAvailable,
  resolveContractTemplate,
  validateOfficialPricing,
} from "./contractTemplateService.js";
import { buildInitialPaymentSummary } from "./contractPricingService.js";
import { resolveReservationContractEligibility } from "./reservationContractEligibilityService.js";
import { joinAddressParts, normalizeAddress, stripRegionSuffix } from "../utils/addressUtils.js";

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

const legalAge = (birthDate, referenceDate) => {
  if (!birthDate || !referenceDate) return null;
  const birth = dayjs(birthDate);
  const reference = dayjs(referenceDate);
  return birth.isValid() && reference.isValid() ? reference.diff(birth, "year") : null;
};

const dateField = (value) => value ? dayjs(value).format("MMMM D, YYYY") : "";

const ordinalDay = (value) => {
  const day = Number(dayjs(value).format("D"));
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
  return `${day}${suffix}`;
};

export const resolveApplicantIdentity = ({ contract = {}, reservation = {} } = {}) => {
  const reservationAddress = reservation.address || {};
  const collapseWhitespace = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const hasValue = (value) =>
    value !== undefined &&
    value !== null &&
    (typeof value !== "string" || value.trim() !== "");

  const joinAddress = (address = {}) => {
    if (typeof address === "string") return normalizeAddress(stripRegionSuffix(collapseWhitespace(address))).value;
    return normalizeAddress(stripRegionSuffix(joinAddressParts(address))).value;
  };

  const firstName = collapseWhitespace(reservation.firstName) || null;
  const middleName = collapseWhitespace(reservation.middleName) || null;
  const lastName = collapseWhitespace(reservation.lastName) || null;
  const reservationFullName = [firstName, middleName, lastName].filter(hasValue).join(" ") || null;

  const legalName = collapseWhitespace(contract.tenantLegalName || reservationFullName || "");
  const formattedReservationAddress = joinAddress(reservationAddress);
  const currentAddress = collapseWhitespace(
    (contract.tenantAddress ? stripRegionSuffix(contract.tenantAddress) : "") ||
    formattedReservationAddress ||
    ""
  );
  const email = collapseWhitespace(contract.tenantEmail || reservation.email || reservation.billingEmail || "");
  const phone = collapseWhitespace(contract.tenantPhone || reservation.mobileNumber || "");
  const nationality = collapseWhitespace(contract.tenantNationality || reservation.nationality || "");
  const birthDate = contract.tenantBirthDate || reservation.birthday || null;

  return {
    fullName: legalName,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    birthDate,
    nationality,
    currentAddress,
  };
};

export const resolveContractExecutionDate = (
  contract,
  { generationDate = new Date() } = {},
) => {
  const source = contract.executionDate ? "admin_approved" : "initial_generation";
  const value = contract.executionDate || generationDate;
  if (!value) {
    const error = new Error("A Contract execution date is required.");
    error.code = "CONTRACT_EXECUTION_DATE_REQUIRED";
    error.statusCode = 422;
    throw error;
  }
  const resolved = new Date(value);
  if (Number.isNaN(resolved.getTime())) {
    const error = new Error("The Contract execution date is invalid.");
    error.code = "CONTRACT_EXECUTION_DATE_INVALID";
    error.statusCode = 422;
    throw error;
  }
  const leaseEnd = contract.leaseEndDate ? new Date(contract.leaseEndDate) : null;
  if (leaseEnd && !Number.isNaN(leaseEnd.getTime()) && resolved > leaseEnd) {
    const error = new Error("The Contract execution date cannot occur after the lease end date.");
    error.code = "CONTRACT_EXECUTION_DATE_CONFLICT";
    error.statusCode = 422;
    error.details = { executionDate: resolved, leaseEndDate: leaseEnd };
    throw error;
  }
  return { value: resolved, source };
};

export const buildContractGenerationData = async (
  contract,
  { requestedTemplateId = null, verifyTemplate = true } = {},
) => {
  const [user, reservation, room, stay] = await Promise.all([
    User.findById(contract.tenantId).lean(),
    Reservation.findById(contract.reservationId).lean(),
    Room.findById(contract.roomId).lean(),
    contract.stayId ? Stay.findById(contract.stayId).lean() : null,
  ]);
  if (!user || !reservation || !room) {
    const error = new Error("Contract source records are incomplete.");
    error.code = "CONTRACT_SOURCE_RECORD_MISSING";
    error.statusCode = 409;
    error.details = { user: Boolean(user), reservation: Boolean(reservation), room: Boolean(room) };
    throw error;
  }
  const isTransferSuccessor =
    ["amendment", "replacement"].includes(contract.contractPurpose) ||
    Boolean(contract.replacesContractId) ||
    Boolean(contract.parentContractId);

  const reservationRoomId = String(reservation.roomId?._id || reservation.roomId || "");
  const contractRoomId = String(contract.roomId?._id || contract.roomId || "");

  if (
    String(reservation.userId) !== String(contract.tenantId) ||
    String(reservation._id) !== String(contract.reservationId) ||
    (!isTransferSuccessor && reservationRoomId !== contractRoomId)
  ) {
    const error = new Error("Contract source records do not belong to one approved tenant reservation.");
    error.code = "CONTRACT_SOURCE_IDENTITY_CONFLICT";
    error.statusCode = 409;
    throw error;
  }
  const reservationEligibility = resolveReservationContractEligibility(reservation, {
    tenantExists: Boolean(user),
    roomExists: Boolean(room),
    bedExists: Boolean(stay?.bedId || stay?.bedCode || contract.bedId || contract.bedLabel),
    roomType: room.type,
  });
  if (!reservationEligibility.eligible) {
    const blocker = reservationEligibility.blockers[0];
    const error = new Error(blocker.message);
    error.code = blocker.code;
    error.statusCode = 422;
    error.details = {
      ...(blocker.details || {}),
      approvalState: reservationEligibility.approvalState,
      sourceEvidence: reservationEligibility.sourceEvidence,
    };
    throw error;
  }
  if (room.branch !== contract.branch) {
    const error = new Error("The assigned Room belongs to a different Contract branch.");
    error.code = "CONTRACT_BRANCH_CONFLICT";
    error.statusCode = 409;
    throw error;
  }
  if (normalizeContractRoomType(room.type) !== normalizeContractRoomType(contract.roomType)) {
    const error = new Error("The Contract room type does not match the actual assigned Room.");
    error.code = "CONTRACT_ROOM_TYPE_CONFLICT";
    error.statusCode = 409;
    error.details = { contractRoomType: contract.roomType, actualRoomType: room.type };
    throw error;
  }

  const template = resolveContractTemplate({
    branch: room.branch,
    roomType: room.type,
    leaseType: resolveLegalLeaseType(contract.leaseDurationMonths),
    leaseStartDate: contract.leaseStartDate,
    leaseEndDate: contract.leaseEndDate,
    leaseDurationMonths: contract.leaseDurationMonths,
    requestedTemplateId,
  });
  const integrity = verifyTemplate ? await assertOfficialTemplateAvailable(template) : null;
  const person = resolveApplicantIdentity({ contract, reservation });
  const property = resolveContractBranch(room.branch);
  const executionDateResolution = resolveContractExecutionDate(contract);
  const executionDate = executionDateResolution.value;
  const birthDate = person.birthDate || null;
  const age = legalAge(birthDate, executionDate || new Date());
  const pricing = {
    regularMonthlyRate: contract.regularMonthlyRate,
    discountPercentage: contract.discountPercentage,
    discountAmount: contract.discountAmount,
    approvedMonthlyRate: contract.approvedMonthlyRate,
    advanceRentAmount: contract.advanceRentAmount,
    securityDepositAmount: contract.securityDepositAmount,
    reservationFeeAmount: Number.isFinite(Number(reservation.reservationFeeAmount))
      ? Number(reservation.reservationFeeAmount)
      : contract.reservationFeeAmount,
    reservationFeeCreditAmount: contract.reservationFeeCreditAmount,
    pricingApprovalId: contract.pricingApprovalId,
    pricingApprovedBy: contract.pricingApprovedBy,
    pricingApprovedAt: contract.pricingApprovedAt,
  };
  const pricingValidation = validateOfficialPricing(template, pricing);
  const initialPaymentSummary = buildInitialPaymentSummary({
    advanceRentAmount: pricing.advanceRentAmount,
    securityDepositAmount: pricing.securityDepositAmount,
    reservationFeeAmount: reservation.reservationFeeAmount,
    approvedReservationFeeCreditAmount: pricing.reservationFeeCreditAmount,
    reservationPaymentStatus: reservation.paymentStatus,
    financialWorkflowVersion: reservation.financialWorkflowVersion,
    reservationFeePaymentStatus: reservation.reservationFeePaymentStatus,
  });
  pricingValidation.errors.push(...initialPaymentSummary.errors);
  pricingValidation.valid = pricingValidation.valid && initialPaymentSummary.valid;
  if (!initialPaymentSummary.valid) pricingValidation.code = initialPaymentSummary.code;

  return {
    template: {
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      sourceFilePath: template.sourceFilePath,
      sourceFileName: template.sourceFileName,
      legalContentVersion: template.legalContentVersion,
      checksum: template.checksum,
      checksumAlgorithm: template.checksumAlgorithm,
      integrity,
    },
    tenant: {
      tenantLegalName: person.fullName || "",
      tenantAddress: person.currentAddress || "",
      tenantEmail: person.email || "",
      tenantPhone: person.phone || "",
      tenantNationality: person.nationality || "",
      tenantBirthDate: birthDate,
      tenantAgeAtGeneration: age,
    },
    property: {
      branch: room.branch,
      propertyName: property.propertyName,
      propertyAddress: property.propertyAddress,
      lessorBusinessName: property.lessor.businessName,
      lessorRepresentative: property.lessor.representative,
      lessorPosition: property.lessor.position,
      lessorPrincipalOfficeAddress: property.lessor.principalOffice,
    },
    assignment: {
      roomId: String(room._id),
      roomNumber: room.roomNumber,
      roomType: room.type,
      bedId: stay?.bedId || contract.bedId,
      bedLabel: stay?.bedCode || contract.bedLabel,
    },
    lease: {
      leaseType: template.leaseType,
      leaseStartDate: contract.leaseStartDate,
      leaseEndDate: contract.leaseEndDate,
      leaseDurationMonths: contract.leaseDurationMonths,
      executionDate,
      executionDateSource: executionDateResolution.source,
      advanceCoverageStart: contract.advanceCoverageStart,
      advanceCoverageEnd: contract.advanceCoverageEnd,
    },
    pricing,
    reservationEligibility,
    pricingValidation,
    initialPaymentSummary,
    fields: {
      contractExecutionDay: ordinalDay(executionDate),
      contractExecutionMonth: executionDate ? dayjs(executionDate).format("MMMM") : "",
      contractExecutionYear: executionDate ? dayjs(executionDate).format("YYYY") : "",
      tenantLegalName: person.fullName || "",
      tenantResidentialAddress: person.currentAddress || "",
      propertyName: property.propertyName,
      propertyAddress: property.propertyAddress,
      roomNumber: room.roomNumber,
      bedOrSlotNumber: (String(room.type || contract.roomType || "").toLowerCase().includes("private") || room.capacity === 1)
        ? ""
        : (stay?.bedCode || contract.bedLabel || contract.bedId || ""),
      leaseDurationNumber: contract.leaseDurationMonths,
      leaseDurationWords: durationInWords(contract.leaseDurationMonths),
      leaseStartDate: dateField(contract.leaseStartDate),
      leaseEndDate: dateField(contract.leaseEndDate),
      advanceCoverageStart: dateField(contract.advanceCoverageStart),
      advanceCoverageEnd: dateField(contract.advanceCoverageEnd),
      // The generated PDF renders the Contract's already-approved legal
      // snapshot verbatim — it must never recompute or substitute a
      // room-type-conditioned value here. (This block previously injected
      // hardcoded numbers, e.g. 15000/16000/13500, and recomputed
      // regularMonthlyRate/discountPercentage from approvedMonthlyRate
      // whenever contract.regularMonthlyRate looked "off" — silently
      // diverging the rendered PDF from the Contract record it supposedly
      // represents. Contract.regularMonthlyRate/discountPercentage/
      // advanceRentAmount/securityDepositAmount are now reliably correct at
      // creation time for every contractPurpose — see contractService.js
      // resolveAuthoritativeLeasePricing usage.)
      regularMonthlyRate: Number(contract.regularMonthlyRate || 0)
        .toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      discountPercentage: Number(contract.discountPercentage || 0)
        .toLocaleString("en-PH", { maximumFractionDigits: 2 }),
      approvedMonthlyRate: Number(contract.approvedMonthlyRate).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      advanceRentAmount: Number(contract.advanceRentAmount || 0)
        .toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      securityDepositAmount: Number(contract.securityDepositAmount || 0)
        .toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      finalPageCount: null,
    },
    notarialFields: {
      shouldRemainBlank: true,
      notarizationPlace: "",
      notarizationDay: "",
      notarizationMonth: "",
      notarizationYear: "",
      documentNumber: "",
      pageNumber: "",
      bookNumber: "",
      seriesYear: "",
      notaryName: "",
      notarySeal: "",
      notarySignature: "",
    },
  };
};
