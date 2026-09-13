/**
 * Shared auth validation utilities used by both SignUp and SignIn pages.
 * Eliminates ~120 lines of duplication.
 */

/** Advanced email validation — checks format, domain structure, consecutive dots, valid characters */
const EMAIL_FORMAT_MESSAGE = "Enter a valid email address, such as name@example.com.";

export const COMMON_DOMAIN_TYPOS = {
  "gmaill.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaik.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.co": "gmail.com",
  "gmaiil.com": "gmail.com",
  "gmeil.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahu.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yaho.cm": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hotmali.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "oulook.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outlokk.com": "outlook.com",
  "outlook.con": "outlook.com",
  "iclud.com": "icloud.com",
  "icoud.com": "icloud.com",
  "icluod.com": "icloud.com",
};

/** Detect common domain typos and return suggested correction */
export const checkEmailDomainTypo = (email) => {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1];
  const suggestedDomain = COMMON_DOMAIN_TYPOS[domain];
  if (suggestedDomain) {
    return {
      invalidDomain: domain,
      suggestedDomain,
      suggestedEmail: `${parts[0]}@${suggestedDomain}`,
    };
  }
  return null;
};

export const validateEmail = (email) => {
  if (!email || !email.trim()) return "Email address is required";
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicRegex.test(email)) return EMAIL_FORMAT_MESSAGE;

  const parts = email.split("@");
  if (parts.length !== 2) return EMAIL_FORMAT_MESSAGE;
  const [localPart, domain] = parts;

  if (localPart.length === 0 || localPart.length > 64)
    return EMAIL_FORMAT_MESSAGE;
  if (domain.length === 0 || domain.length > 255) return EMAIL_FORMAT_MESSAGE;

  const typo = checkEmailDomainTypo(email);
  if (typo) {
    return `Did you mean ${typo.suggestedEmail}? Please check your email domain.`;
  }

  const domainParts = domain.split(".");
  if (domainParts.length < 2) return EMAIL_FORMAT_MESSAGE;

  for (let part of domainParts) {
    if (part.length === 0 || !/^[a-zA-Z0-9-]+$/.test(part))
      return EMAIL_FORMAT_MESSAGE;
    if (part.startsWith("-") || part.endsWith("-"))
      return EMAIL_FORMAT_MESSAGE;
  }

  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return EMAIL_FORMAT_MESSAGE;
  if (email.includes("..")) return EMAIL_FORMAT_MESSAGE;

  return null; // Valid
};

/** Canonical Lilycrest new-password contract (mirrored in server/security/passwordPolicy.cjs). */
export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_MAX_LENGTH = 128;
const SPECIAL_CHARS_REGEX = /[^A-Za-z0-9\s]/;

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (value) => typeof value === "string" && value.length >= NEW_PASSWORD_MIN_LENGTH },
  { id: "uppercase", label: "One uppercase letter", test: (value) => /[A-Z]/.test(value || "") },
  { id: "lowercase", label: "One lowercase letter", test: (value) => /[a-z]/.test(value || "") },
  { id: "number", label: "One number", test: (value) => /\d/.test(value || "") },
  { id: "special", label: "One special character", test: (value) => SPECIAL_CHARS_REGEX.test(value || "") },
];

export const evaluateNewPassword = (password = "") => {
  const value = typeof password === "string" ? password : "";
  const checks = {
    minLength: value.length >= NEW_PASSWORD_MIN_LENGTH,
    maxLength: value.length <= NEW_PASSWORD_MAX_LENGTH,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: SPECIAL_CHARS_REGEX.test(value),
    noWhitespace: !/\s/.test(value),
  };
  return { ...checks, valid: Boolean(value) && Object.values(checks).every(Boolean) };
};

export const evaluatePasswordRules = (password = "") => {
  const results = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
  const allPassed = evaluateNewPassword(password).valid;
  return { results, allPassed };
};

export const calculatePasswordStrength = (password = "") => {
  const checks = evaluateNewPassword(password);
  const requirements = {
    length: checks.minLength,
    uppercase: checks.uppercase,
    lowercase: checks.lowercase,
    number: checks.number,
    special: checks.special,
    noSpaces: checks.noWhitespace,
  };

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  let score = 0;
  let level = "weak";
  let label = "Weak";

  if (!password) {
    score = 0;
    level = "none";
    label = "Empty";
  } else if (!requirements.length) {
    score = Math.min(25, metRequirements * 8);
    level = "weak";
    label = "Weak";
  } else if (metRequirements >= 6 && password.length >= 12) {
    score = 100;
    level = "strong";
    label = "Very Strong";
  } else if (metRequirements >= 6) {
    score = 85;
    level = "strong";
    label = "Strong";
  } else if (metRequirements >= 5) {
    score = 65;
    level = "medium";
    label = "Good";
  } else if (metRequirements >= 3) {
    score = 40;
    level = "fair";
    label = "Fair";
  } else {
    score = 20;
    level = "weak";
    label = "Weak";
  }

  return { score, level, label, metRequirements, requirements };
};

/**
 * Enforce password strength — returns error message or null if valid.
 * Requires minimum "medium" strength (3+ of 5 requirements met).
 */
export const validatePassword = (password) => {
  if (!password) return "Password is required";
  const checks = evaluateNewPassword(password);
  if (!checks.noWhitespace) return "Your password cannot contain whitespace.";
  if (!checks.minLength) return `Your password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters long.`;
  if (!checks.maxLength) return `Your password must be ${NEW_PASSWORD_MAX_LENGTH} characters or fewer.`;
  if (!checks.uppercase) return "Your password needs an uppercase letter.";
  if (!checks.lowercase) return "Your password needs a lowercase letter.";
  if (!checks.number) return "Your password needs a number.";
  if (!checks.special) return "Your password needs a special character.";
  return null; // Valid
};

/** Capitalize the first letter of each word (after start, whitespace, hyphens, apostrophes, periods) */
export const formatProperCase = (str) => {
  if (!str || typeof str !== "string") return "";
  return String(str).replace(/(?:^|[\s'.-])([a-zA-Z])/g, (char) => char.toUpperCase());
};

/** Sanitize name fields — allow letters, spaces, hyphens, apostrophes, periods, and auto-capitalize first letter of each word */
export const sanitizeName = (value) => {
  if (!value || typeof value !== "string") return "";
  let cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-zA-Z\s'.-]/g, "");
  return formatProperCase(cleaned);
};

/** Generate a backend-compatible 3-30 character username from an email. */
export const generateUsername = (email, attempt = 0) => {
  const normalizedBase = String(email || "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const base = (normalizedBase || "user").slice(0, 21).padEnd(3, "0");
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 6)
      : Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  const suffix = `${Number(attempt).toString(36)}${randomPart}`.slice(0, 7);
  return `${base}-${suffix}`.slice(0, 30);
};

/** Map Firebase auth error codes to user-friendly messages */
export const getFirebaseErrorMessage = (error, context = "login") => {
  const code = error?.code;
  const map = {
    "auth/email-already-in-use":
      "An account already exists with this email address. Please sign in instead.",
    "auth/invalid-email": "Enter a valid email address, such as name@example.com.",
    "auth/weak-password":
      "Your password must contain at least 8 characters, including a number and a letter.",
    "auth/invalid-credential":
      "Your email or password is incorrect. Please check your details and try again.",
    "auth/wrong-password":
      "Your email or password is incorrect. Please check your details and try again.",
    "auth/user-not-found":
      "We could not find an account with this email. Please sign up first.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":
      "We could not connect to the server. Check your internet connection and try again.",
    "auth/user-disabled":
      "This account has been disabled. Please contact support.",
    "auth/popup-closed-by-user":
      context === "signup" ? "Sign-up was cancelled." : "Sign-in was cancelled.",
    "auth/cancelled-popup-request":
      "The sign-in popup was closed before completing. Please try again.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Please allow popups for this site and try again.",
    "auth/unauthorized-domain":
      "This domain is not authorized for sign-in. Please contact support or try another method.",
    "auth/operation-not-allowed":
      "Social sign-in is temporarily disabled. Please sign in with your email and password.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",
    "auth/internal-error":
      "We could not connect to the sign-in service. Please check your connection or try again.",
  };
  if (map[code]) return map[code];
  // Never surface raw Firebase codes or backend text to the user — log for debugging instead.
  if (code && typeof console !== "undefined" && console.warn) {
    console.warn("[auth] Unmapped Firebase error code:", code);
  }
  return context === "signup"
    ? "We could not complete your registration. Please check your information and try again."
    : "We could not sign you in. Please check your details and try again.";
};
