/**
 * Shared auth validation utilities used by both SignUp and SignIn pages.
 * Eliminates ~120 lines of duplication.
 */

/** Advanced email validation — checks format, domain structure, consecutive dots, valid characters */
export const validateEmail = (email) => {
  if (!email || !email.trim()) return "Email is required";
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicRegex.test(email)) return "Invalid email format";

  const parts = email.split("@");
  if (parts.length !== 2) return "Invalid email format";
  const [localPart, domain] = parts;

  if (localPart.length === 0 || localPart.length > 64)
    return "Invalid email format";
  if (domain.length === 0 || domain.length > 255) return "Invalid email domain";

  const domainParts = domain.split(".");
  if (domainParts.length < 2) return "Invalid email domain";

  for (let part of domainParts) {
    if (part.length === 0 || !/^[a-zA-Z0-9-]+$/.test(part))
      return "Invalid email domain";
    if (part.startsWith("-") || part.endsWith("-"))
      return "Invalid email domain";
  }

  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return "Invalid email domain";
  if (email.includes("..")) return "Invalid email format";

  return null; // Valid
};

/** Password strength calculator */
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?/]/;

export const calculatePasswordStrength = (password) => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: SPECIAL_CHARS_REGEX.test(password),
  };

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  let score = 0;
  let level = "weak";

  if (metRequirements >= 5) {
    score = 100;
    level = "strong";
  } else if (metRequirements >= 3) {
    score = 60;
    level = "medium";
  } else if (metRequirements >= 1) {
    score = 30;
    level = "weak";
  }

  return { score, level, requirements };
};

/** Sanitize name fields — allow only letters, spaces, hyphens, apostrophes */
export const sanitizeName = (value) => value.replace(/[^a-zA-Z\s'-]/g, "");

/** Generate a safe username from email */
export const generateUsername = (email) => {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return `${base}${Math.floor(Math.random() * 10000)}`;
};

/** Map Firebase auth error codes to user-friendly messages */
export const getFirebaseErrorMessage = (error, context = "login") => {
  const code = error?.code;
  const map = {
    "auth/email-already-in-use":
      "This email is already registered. Please login instead.",
    "auth/invalid-email": "Invalid email address.",
    "auth/weak-password":
      "Password is too weak. Please use a stronger password.",
    "auth/invalid-credential":
      "Invalid email or password. Please check your credentials.",
    "auth/wrong-password":
      "Invalid email or password. Please check your credentials.",
    "auth/user-not-found":
      "No account found with this email. Please register first.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":
      "Network error. Please check your internet connection.",
    "auth/user-disabled":
      "This account has been disabled. Please contact support.",
    "auth/popup-closed-by-user":
      context === "signup" ? "Sign-up cancelled" : "Sign-in cancelled",
    "auth/popup-blocked":
      "Popup blocked by browser. Please allow popups for this site.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",
  };
  return (
    map[code] ||
    error?.response?.data?.error ||
    `${context === "signup" ? "Registration" : "Login"} failed. Please try again.`
  );
};
