/**
 * =============================================================================
 * Friendly Error Utility
 * =============================================================================
 *
 * Maps raw API / network / Firebase errors to user-friendly messages.
 * Use this everywhere instead of showing err.message directly.
 */

// ── Known error patterns → user-friendly messages ──────────────
const ERROR_MAP = [
  // Network / connection
  [/network\s*error|failed\s*to\s*fetch|ERR_NETWORK|ECONNREFUSED/i, "Unable to connect to the server. Please check your internet connection and try again."],
  [/timeout|ETIMEDOUT|ECONNABORTED/i, "The request took too long. Please try again."],
  [/CORS|cross-origin/i, "Unable to connect to the server. Please try again later."],

  // Auth
  [/not\s*authenticated|no\s*auth|unauthorized|401/i, "Your session has expired. Please sign in again."],
  [/forbidden|403|not\s*allowed/i, "You don't have permission to perform this action."],
  [/token\s*expired|jwt\s*expired/i, "Your session has expired. Please sign in again."],

  // Upload / image
  [/failed\s*to\s*parse\s*imagekit/i, "Upload failed. Please try again with a different file."],
  [/upload\s*failed\s*\(\d+\)/i, "File upload failed. Please check your connection and try again."],
  [/failed\s*to\s*get\s*upload\s*auth/i, "Unable to prepare upload. Please try again."],
  [/file\s*too\s*large/i, "The file is too large. Maximum file size is 5MB."],

  // MongoDB / database
  [/E11000|duplicate\s*key/i, "This record already exists. Please use different details."],
  [/cast\s*to\s*objectid/i, "The requested item could not be found."],
  [/validation\s*failed/i, "Some required information is missing. Please check your input."],

  // Not found
  [/not\s*found|404/i, "The requested item could not be found. It may have been removed."],

  // Server
  [/500|internal\s*server/i, "Something went wrong on our end. Please try again later."],
  [/503|service\s*unavailable/i, "The service is temporarily unavailable. Please try again later."],

  // Firebase auth (these come through getFirebaseErrorMessage usually, but just in case)
  [/auth\/email-already-in-use/i, "This email is already registered. Please sign in instead."],
  [/auth\/user-not-found/i, "No account found with this email. Please sign up first."],
  [/auth\/wrong-password/i, "Incorrect password. Please try again."],
  [/auth\/too-many-requests/i, "Too many attempts. Please wait a moment and try again."],
  [/auth\/popup-closed/i, "Sign-in was cancelled."],
];

/**
 * Convert a raw error into a user-friendly message.
 *
 * Priority: server error string → pattern match → fallback message
 *
 * @param {Error|Object|string} error - The error to convert
 * @param {string} [fallback] - Custom fallback message if no pattern matches
 * @returns {string} User-friendly error message
 */
export function getFriendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;

  // Extract the raw message string
  const serverMsg = error?.response?.data?.error || error?.response?.data?.message;
  const rawMsg = typeof error === "string" ? error : (serverMsg || error?.message || "");

  // If the server sent a clean, short message (likely already user-friendly), use it
  if (serverMsg && serverMsg.length < 120 && !/error|exception|stack|at\s+\w/i.test(serverMsg)) {
    return serverMsg;
  }

  // Try pattern matching
  for (const [pattern, friendly] of ERROR_MAP) {
    if (pattern.test(rawMsg)) return friendly;
  }

  // If the raw message is short + clean (no stack trace / code-like content), use it
  if (rawMsg && rawMsg.length < 100 && !/\{|\}|TypeError|ReferenceError|SyntaxError|at\s+\w/i.test(rawMsg)) {
    return rawMsg;
  }

  return fallback;
}

/**
 * Shorthand for use in catch blocks.
 * @example catch (err) { showNotification(friendlyError(err, "Failed to save"), "error"); }
 */
export default getFriendlyError;
