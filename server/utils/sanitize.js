/**
 * =============================================================================
 * XSS SANITIZATION UTILITY
 * =============================================================================
 *
 * Strips dangerous HTML from user-supplied strings before they reach the DB.
 * Used as a Zod .transform(clean) on all free-text fields.
 *
 * Safe HTML tags (e.g. <b>, <i>, <br>) are preserved by default.
 * Script tags, event handlers (onclick, onerror, etc.) are always removed.
 *
 * =============================================================================
 */

import xss from "xss";

/**
 * Sanitize a string to prevent XSS attacks.
 * Non-string values are returned unchanged (safe for optional fields).
 *
 * @param {*} str - Value to sanitize
 * @returns {*} Sanitized string or original value if not a string
 *
 * @example
 * clean("<script>alert('xss')</script>Hello")
 * // → "&lt;script&gt;alert('xss')&lt;/script&gt;Hello"
 *
 * clean("Normal text")
 * // → "Normal text"
 *
 * clean(undefined)
 * // → undefined
 */
export const clean = (str) => (typeof str === "string" ? xss(str) : str);
