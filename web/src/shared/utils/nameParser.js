import { formatProperCase, sanitizeName } from "./authValidation.js";

const GENERATIONAL_SUFFIXES = new Set([
  "jr", "jr.", "sr", "sr.",
  "ii", "iii", "iv", "v", "vi",
  "md", "esq", "cpa", "rn"
]);

const COMPOUND_SURNAME_PREFIXES_SINGLE = new Set([
  "dela", "delos", "del", "de", "san", "santa", "van", "von", "da", "di"
]);

const ROMAN_NUMERALS = new Set(["ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

function formatSuffix(suffix) {
  if (!suffix) return "";
  const lower = suffix.toLowerCase();
  if (ROMAN_NUMERALS.has(lower)) {
    return lower.toUpperCase();
  }
  if (lower === "jr" || lower === "jr.") return lower === "jr." ? "Jr." : "Jr";
  if (lower === "sr" || lower === "sr.") return lower === "sr." ? "Sr." : "Sr";
  return formatProperCase(suffix);
}

/**
 * Parses full name or Google OAuth profile into accurately split First Name and Last Name.
 *
 * @param {string} rawName - Raw full name string
 * @param {object} [googleProfile] - Google OAuth profile containing given_name / family_name
 * @returns {{ firstName: string, lastName: string }}
 */
export function parseSmartFullName(rawName, googleProfile = null) {
  // 1. If Google profile provides structured given_name and family_name, prioritize it
  if (googleProfile?.given_name && googleProfile?.family_name) {
    const firstName = sanitizeName(googleProfile.given_name).trim();
    const lastName = sanitizeName(googleProfile.family_name).trim();
    if (firstName && lastName) {
      return { firstName, lastName };
    }
  }

  // 2. Fallback to parsing rawName
  if (!rawName || typeof rawName !== "string") {
    return { firstName: "User", lastName: "Guest" };
  }

  const cleaned = rawName
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-zA-Z\s'.-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return { firstName: "User", lastName: "Guest" };
  }

  let tokens = cleaned.split(" ").filter(Boolean);

  if (tokens.length === 1) {
    return {
      firstName: formatProperCase(tokens[0]),
      lastName: "User",
    };
  }

  let suffix = "";
  if (tokens.length >= 3) {
    const lastTokenLower = tokens[tokens.length - 1].toLowerCase();
    if (GENERATIONAL_SUFFIXES.has(lastTokenLower)) {
      suffix = formatSuffix(tokens.pop());
    }
  }

  let firstNameTokens = [];
  let lastNameTokens = [];

  // Check two-word prefixes like "de los", "de la"
  if (tokens.length >= 4) {
    const secondPrev = tokens[tokens.length - 3].toLowerCase();
    const firstPrev = tokens[tokens.length - 2].toLowerCase();
    if (secondPrev === "de" && (firstPrev === "los" || firstPrev === "la")) {
      lastNameTokens = tokens.slice(-3);
      firstNameTokens = tokens.slice(0, -3);
    }
  }

  // Check single-word compound prefixes like "dela", "del", "de", "delos", "san", "santa"
  if (lastNameTokens.length === 0 && tokens.length >= 3) {
    const prevLower = tokens[tokens.length - 2].toLowerCase();
    if (COMPOUND_SURNAME_PREFIXES_SINGLE.has(prevLower)) {
      lastNameTokens = tokens.slice(-2);
      firstNameTokens = tokens.slice(0, -2);
    }
  }

  // Standard split: last token is surname, all previous tokens are given names
  if (lastNameTokens.length === 0) {
    lastNameTokens = [tokens[tokens.length - 1]];
    firstNameTokens = tokens.slice(0, -1);
  }

  let firstName = firstNameTokens.map(formatProperCase).join(" ");
  let lastName = lastNameTokens.map(formatProperCase).join(" ");

  if (suffix) {
    lastName = `${lastName} ${suffix}`.trim();
  }

  return {
    firstName: firstName || "User",
    lastName: lastName || "Guest",
  };
}
