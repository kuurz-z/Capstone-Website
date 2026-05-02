import { extractTextFromImage } from "./googleVisionService.js";

export const ID_TYPES = Object.freeze([
  "national_id",
  "drivers_license",
  "passport",
  "sss_id",
  "umid",
  "school_id",
  "other",
]);

export const ID_TYPE_LABELS = Object.freeze({
  national_id: "National ID",
  drivers_license: "Driver's License",
  passport: "Passport",
  sss_id: "SSS ID",
  umid: "UMID",
  school_id: "School ID",
  other: "Other",
});

const VALIDATION_STATUS_MESSAGES = Object.freeze({
  passed: "ID verified successfully.",
  warning: "Name mismatch detected.",
  failed: "ID image is unclear. Please upload a clearer photo.",
  manual_review: "ID requires manual verification.",
});

const normalizeIdType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/driver'?s?_?license/, "drivers_license")
    .replace(/national_?id/, "national_id")
    .replace(/sss_?id/, "sss_id")
    .replace(/school_?id/, "school_id");

  return ID_TYPES.includes(normalized) ? normalized : "";
};

export const normalizeTextForComparison = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeName = (name = "") =>
  normalizeTextForComparison(name)
    .split(" ")
    .filter((token) => token.length > 1 && !["jr", "sr", "ii", "iii"].includes(token));

const buildApplicantName = (reservation, payload = {}) => {
  const parts = [
    payload.firstName ?? reservation?.firstName,
    payload.middleName ?? reservation?.middleName,
    payload.lastName ?? reservation?.lastName,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (parts.length > 0) return parts.join(" ");

  const user = reservation?.userId;
  return [user?.firstName, user?.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
};

const scoreNameMatch = (applicantName, extractedText) => {
  const tokens = tokenizeName(applicantName);
  const normalizedText = normalizeTextForComparison(extractedText);

  if (!tokens.length || !normalizedText) return 0;

  const matched = tokens.filter((token) => normalizedText.includes(token));
  const uniqueTokenCount = new Set(tokens).size || 1;
  const score = matched.length / uniqueTokenCount;

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
};

const extractLikelyName = (applicantName, extractedText) => {
  const tokens = tokenizeName(applicantName);
  const lines = String(extractedText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && /[a-z]/i.test(line));

  if (!lines.length) return "";

  let bestLine = "";
  let bestScore = 0;

  for (const line of lines) {
    const normalizedLine = normalizeTextForComparison(line);
    const matches = tokens.filter((token) => normalizedLine.includes(token)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestLine = line;
    }
  }

  if (bestLine) return bestLine.slice(0, 160);

  const genericLine = lines.find(
    (line) =>
      !/\d/.test(line) &&
      !/republic|license|passport|identification|school|sss|umid/i.test(line),
  );

  return (genericLine || lines[0] || "").slice(0, 160);
};

const extractIdNumber = (idType, extractedText) => {
  const text = String(extractedText || "").toUpperCase();
  const compact = text.replace(/\s+/g, " ");

  const patterns = {
    national_id: /\b(?:\d{4}[-\s]?){3}\d{4}\b/,
    drivers_license: /\b[A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{6}\b|\b[A-Z0-9]{3,5}[-\s]?[A-Z0-9]{5,9}\b/,
    passport: /\b[A-Z][0-9]{7,8}\b|\b[A-Z]{1,2}[0-9]{6,8}\b/,
    sss_id: /\b\d{2}-\d{7}-\d\b/,
    umid: /\b\d{4}[-\s]?\d{7}[-\s]?\d\b|\b\d{12,16}\b/,
    school_id: /\b[A-Z0-9]{4,}[-\s]?[A-Z0-9]{2,}\b/,
    other: /\b[A-Z0-9][A-Z0-9-]{5,}\b/,
  };

  return compact.match(patterns[idType] || patterns.other)?.[0]?.trim() || "";
};

const applyTypeRules = ({ idType, extractedText, extractedName, extractedIdNumber }) => {
  const notes = [];
  let severity = "passed";

  const readable = String(extractedText || "").trim().length >= 20;
  if (!readable) {
    return {
      severity: "failed",
      notes: ["OCR text is too short to verify the ID document."],
    };
  }

  const requireName = [
    "national_id",
    "drivers_license",
    "passport",
    "umid",
    "school_id",
  ].includes(idType);

  if (requireName && !extractedName) {
    severity = "warning";
    notes.push(`${ID_TYPE_LABELS[idType]} has readable text, but no clear name was detected.`);
  }

  if (idType === "sss_id" && !/^\d{2}-\d{7}-\d$/.test(extractedIdNumber || "")) {
    severity = "warning";
    notes.push("SSS number pattern was not confidently detected.");
  }

  if (idType === "passport" && !extractedIdNumber) {
    severity = "warning";
    notes.push("Passport number was not confidently detected.");
  }

  if (idType === "drivers_license" && !extractedIdNumber) {
    severity = "warning";
    notes.push("Driver's license number was not confidently detected.");
  }

  if (idType === "national_id" && !extractedIdNumber) {
    severity = "warning";
    notes.push("National ID number was not confidently detected.");
  }

  if (idType === "umid" && !extractedIdNumber) {
    severity = "warning";
    notes.push("UMID number was not confidently detected.");
  }

  if (idType === "other" && !extractedName) {
    severity = "manual_review";
    notes.push("ID type varies by issuer. Admin manual review is required.");
  }

  return { severity, notes };
};

const mergeStatus = (...statuses) => {
  const rank = {
    passed: 0,
    warning: 1,
    manual_review: 2,
    failed: 3,
  };

  return statuses.reduce(
    (current, next) => (rank[next] > rank[current] ? next : current),
    "passed",
  );
};

export const validateReservationIdDocument = async ({
  reservation,
  idType,
  documentUrl,
  applicantPayload = {},
}) => {
  const normalizedIdType = normalizeIdType(idType);
  if (!normalizedIdType) {
    return {
      status: "failed",
      idType: "",
      extractedText: "",
      extractedName: "",
      extractedIdNumber: "",
      matchScore: 0,
      validationNotes: ["ID type is required."],
      message: "ID type is required.",
      provider: "google_vision",
    };
  }

  if (!documentUrl) {
    return {
      status: "failed",
      idType: normalizedIdType,
      extractedText: "",
      extractedName: "",
      extractedIdNumber: "",
      matchScore: 0,
      validationNotes: ["Valid ID front image is required."],
      message: "ID image is unclear. Please upload a clearer photo.",
      provider: "google_vision",
    };
  }

  const ocr = await extractTextFromImage(documentUrl);
  if (ocr.status === "manual_review") {
    return {
      status: "manual_review",
      idType: normalizedIdType,
      extractedText: "",
      extractedName: "",
      extractedIdNumber: "",
      matchScore: 0,
      validationNotes: ocr.notes || ["ID requires manual verification."],
      message: ocr.message || VALIDATION_STATUS_MESSAGES.manual_review,
      provider: ocr._provider || "google_vision",
    };
  }

  if (ocr.status === "failed") {
    return {
      status: "failed",
      idType: normalizedIdType,
      extractedText: ocr.text || "",
      extractedName: "",
      extractedIdNumber: "",
      matchScore: 0,
      validationNotes: ocr.notes || ["ID image is unclear."],
      message: ocr.message || VALIDATION_STATUS_MESSAGES.failed,
      provider: "google_vision",
    };
  }

  const extractedText = ocr.text || "";
  if (extractedText.trim().length < 20) {
    return {
      status: "failed",
      idType: normalizedIdType,
      extractedText,
      extractedName: "",
      extractedIdNumber: "",
      matchScore: 0,
      validationNotes: ["OCR text is too short to verify the ID document."],
      message: VALIDATION_STATUS_MESSAGES.failed,
      provider: "google_vision",
    };
  }

  const applicantName = buildApplicantName(reservation, applicantPayload);
  const extractedName = extractLikelyName(applicantName, extractedText);
  const extractedIdNumber = extractIdNumber(normalizedIdType, extractedText);
  const matchScore = scoreNameMatch(applicantName, extractedText);
  const typeResult = applyTypeRules({
    idType: normalizedIdType,
    extractedText,
    extractedName,
    extractedIdNumber,
  });

  const nameStatus = matchScore >= 0.67 ? "passed" : "warning";
  const status = mergeStatus(typeResult.severity, nameStatus);
  const validationNotes = [...typeResult.notes];

  if (matchScore < 0.67) {
    validationNotes.unshift("Applicant name was not confidently matched against the ID text.");
  }

  if (status === "passed") {
    validationNotes.push("Applicant name matched readable ID text.");
  }

  return {
    status,
    idType: normalizedIdType,
    extractedText,
    extractedName,
    extractedIdNumber,
    matchScore,
    validationNotes,
    message:
      status === "passed"
        ? VALIDATION_STATUS_MESSAGES.passed
        : status === "manual_review"
          ? VALIDATION_STATUS_MESSAGES.manual_review
          : status === "failed"
            ? VALIDATION_STATUS_MESSAGES.failed
            : VALIDATION_STATUS_MESSAGES.warning,
    provider: ocr._provider || "google_vision",
  };
};

export default {
  ID_TYPES,
  ID_TYPE_LABELS,
  validateReservationIdDocument,
};
