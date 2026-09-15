/**
 * =============================================================================
 * INPUT VALIDATION AND SANITIZATION MIDDLEWARE
 * =============================================================================
 *
 * Provides comprehensive validation and sanitization to protect against:
 * - SQL Injection (though using Mongoose ODM provides built-in protection)
 * - XSS (Cross-Site Scripting) attacks
 * - CSRF (Cross-Site Request Forgery) attacks
 * - Invalid data formats
 * - Data type mismatches
 *
 * Usage:
 * Import validators and apply to specific routes:
 * router.post('/register', validateRegister(), controller)
 * router.post('/login', validateLogin(), controller)
 *
 * =============================================================================
 */

/**
 * Sanitize string input to prevent XSS
 * - Removes/escapes HTML and JavaScript
 * - Trims whitespace
 * - Validates against suspicious patterns
 *
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input) => {
  if (!input || typeof input !== "string") return "";

  // Trim whitespace
  let sanitized = input.trim();

  // Remove HTML/JavaScript tags and entities
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove <script> tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Remove <iframe> tags
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Remove event handlers (onclick, etc.)
    .replace(/on\w+\s*=\s*[^\s>]*/gi, ""); // Remove event handlers without quotes

  // Escape HTML special characters
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  return sanitized;
};

/**
 * Sanitize general text — strip dangerous characters while keeping readability.
 * For profile fields like address, city, emergency contact, etc.
 *
 * @param {string} s - Text to sanitize
 * @returns {string} Sanitized text
 */
export const sanitizeText = (s) => s?.trim().replace(/[<>"'&]/g, "") || "";

/**
 * Sanitize email input
 * - Validates email format
 * - Converts to lowercase
 * - Removes whitespace
 *
 * @param {string} email - Email to sanitize
 * @returns {string|null} Sanitized email or null if invalid
 */
export const sanitizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;

  const sanitized = email.trim().toLowerCase();

  // RFC 5322 simplified email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitize username input
 * - Allows alphanumeric, underscore, hyphen
 * - 3-30 characters
 * - Converts to lowercase for consistency
 *
 * @param {string} username - Username to sanitize
 * @returns {string|null} Sanitized username or null if invalid
 */
export const sanitizeUsername = (username) => {
  if (!username || typeof username !== "string") return null;

  const sanitized = username.trim().toLowerCase();

  // Username: 3-30 chars, alphanumeric, underscore, hyphen only
  if (!/^[a-z0-9_-]{3,30}$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitize phone number
 * - Removes non-digit characters except + and -
 * - Validates basic phone format
 *
 * @param {string} phone - Phone number to sanitize
 * @returns {string|null} Sanitized phone or null if invalid
 */
export const sanitizePhone = (phone) => {
  if (!phone || typeof phone !== "string") return null;

  // Strip spaces and common formatting chars, keep + and digits
  const cleaned = phone.replace(/[\s\-().]/g, "").trim();

  // Must be E.164: + followed by 7–15 digits
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;

  // Legacy fallback: plain digits only (7–15), no country code
  const digitsOnly = cleaned.replace(/[^\d]/g, "");
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15) return digitsOnly;

  return null;
};

/**
 * Capitalize the first letter of each word (after start, whitespace, hyphens, apostrophes)
 *
 * @param {string} str - String to format
 * @returns {string} Proper-cased string
 */
export const formatProperCase = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.replace(/(?:^|[\s'.-])([a-zA-Z])/g, (char) => char.toUpperCase());
};

/**
 * Sanitize name input (firstName, lastName)
 * - Allows letters, spaces, hyphens, apostrophes, periods
 * - 1-50 characters
 * - Removes HTML/script tags
 * - Converts the first letter of each word to uppercase
 *
 * @param {string} name - Name to sanitize
 * @returns {string|null} Sanitized name or null if invalid
 */
export const sanitizeName = (name) => {
  if (!name || typeof name !== "string") return null;

  let sanitized = name.trim();

  // Remove script tags and HTML
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "");

  // Allow letters, spaces, hyphens, apostrophes, and periods (.)
  // Minimum 1 character to support short names from social providers (Google)
  if (!/^[a-zA-Z\s\-'.]{1,50}$/.test(sanitized)) {
    return null;
  }

  return formatProperCase(sanitized);
};

/**
 * Validate and sanitize branch input
 * - Only allows predefined branches
 *
 * @param {string} branch - Branch to validate
 * @param {Array} validBranches - Array of valid branch values
 * @returns {string|null} Valid branch or null
 */
export const validateBranch = (
  branch,
  validBranches = ["gil-puyat", "guadalupe"],
) => {
  if (!branch || typeof branch !== "string") return null;

  const sanitized = branch.trim().toLowerCase();

  if (!validBranches.includes(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Validate and sanitize role input
 * - Only allows predefined roles
 *
 * @param {string} role - Role to validate
 * @param {Array} validRoles - Array of valid role values
 * @returns {string|null} Valid role or null
 */
export const validateRole = (
  role,
  validRoles = ["applicant", "tenant", "branch_admin", "owner"],
) => {
  if (!role || typeof role !== "string") return null;

  const sanitized = role.trim();

  if (!validRoles.includes(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Validate object ID format (MongoDB ObjectId)
 * - Checks if valid 24-character hex string
 *
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId format
 */
export const isValidObjectId = (id) => {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{24}$/i.test(id);
};

/**
 * Validate date string
 * - Checks if valid ISO date format
 *
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid date
 */
export const isValidDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
};

/**
 * Sanitize and validate entire request body for registration
 *
 * @param {Object} body - Request body
 * @returns {Object} { valid: boolean, data: Object, errors: Array }
 */
const COMMON_DOMAIN_TYPOS = {
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

export const validateRegisterInput = (body) => {
  const errors = [];
  const data = {};

  // Validate email
  if (body.email) {
    const email = sanitizeEmail(body.email);
    if (!email) {
      errors.push("Invalid email format");
    } else {
      const domain = email.split("@")[1];
      if (COMMON_DOMAIN_TYPOS[domain]) {
        errors.push(`Invalid email domain "${domain}". Did you mean "${COMMON_DOMAIN_TYPOS[domain]}"?`);
      } else {
        data.email = email;
      }
    }
  }

  // Validate username (required)
  if (!body.username) {
    errors.push("Username is required");
  } else {
    const username = sanitizeUsername(body.username);
    if (!username) {
      errors.push(
        "Username must be 3-30 characters, alphanumeric with underscores/hyphens only",
      );
    } else {
      data.username = username;
    }
  }

  // Validate firstName (required)
  if (!body.firstName) {
    errors.push("First name is required");
  } else {
    const firstName = sanitizeName(body.firstName);
    if (!firstName) {
      errors.push(
        "First name must be 1-50 characters, letters/spaces/hyphens/apostrophes only",
      );
    } else {
      data.firstName = firstName;
    }
  }

  // Validate lastName (required)
  if (!body.lastName) {
    errors.push("Last name is required");
  } else {
    const lastName = sanitizeName(body.lastName);
    if (!lastName) {
      errors.push(
        "Last name must be 1-50 characters, letters/spaces/hyphens/apostrophes only",
      );
    } else {
      data.lastName = lastName;
    }
  }

  // Validate phone (optional)
  if (body.phone) {
    const phone = sanitizePhone(body.phone);
    if (!phone) {
      errors.push("Invalid phone number format");
    } else {
      data.phone = phone;
    }
  }

  // Validate branch (optional)
  if (body.branch) {
    const branch = validateBranch(body.branch);
    if (!branch) {
      errors.push("Invalid branch");
    } else {
      data.branch = branch;
    }
  }

  return {
    valid: errors.length === 0,
    data,
    errors,
  };
};

/**
 * Sanitize and validate entire request body for profile update
 *
 * @param {Object} body - Request body
 * @returns {Object} { valid: boolean, data: Object, errors: Array }
 */
export const validateProfileUpdateInput = (body) => {
  const errors = [];
  const data = {};

  // Validate firstName (optional)
  if (body.firstName !== undefined) {
    if (body.firstName === null || body.firstName === "") {
      errors.push("First name cannot be empty");
    } else {
      const firstName = sanitizeName(body.firstName);
      if (!firstName || firstName.length < 2) {
        errors.push(
          "First name must be 2-50 characters, letters/spaces/hyphens/apostrophes only",
        );
      } else {
        data.firstName = firstName;
      }
    }
  }

  // Validate middleName (optional)
  if (body.middleName !== undefined) {
    if (body.middleName === null || body.middleName === "") {
      data.middleName = "";
    } else {
      const middleName = sanitizeName(body.middleName);
      if (!middleName) {
        errors.push(
          "Middle name must be letters/spaces/hyphens/apostrophes only",
        );
      } else {
        data.middleName = middleName;
      }
    }
  }

  // Validate lastName (optional)
  if (body.lastName !== undefined) {
    if (body.lastName === null || body.lastName === "") {
      errors.push("Last name cannot be empty");
    } else {
      const lastName = sanitizeName(body.lastName);
      if (!lastName || lastName.length < 2) {
        errors.push(
          "Last name must be 2-50 characters, letters/spaces/hyphens/apostrophes only",
        );
      } else {
        data.lastName = lastName;
      }
    }
  }

  // Validate phone (optional)
  if (body.phone !== undefined) {
    if (body.phone === null || body.phone === "") {
      data.phone = null; // Allow clearing phone
    } else {
      const phone = sanitizePhone(body.phone);
      if (!phone) {
        errors.push("Invalid phone number format");
      } else {
        data.phone = phone;
      }
    }
  }

  // --- Extended profile field validations ---

  // Validate gender (optional)
  if (body.gender !== undefined) {
    const validGenders = ["male", "female", "other", "prefer-not-to-say", ""];
    if (!validGenders.includes(body.gender)) {
      errors.push("Gender must be one of: male, female, other, prefer-not-to-say");
    } else {
      data.gender = body.gender;
    }
  }

  // Validate civilStatus (optional)
  if (body.civilStatus !== undefined) {
    const validCivilStatuses = ["single", "married", "widowed", "separated", "divorced", ""];
    if (!validCivilStatuses.includes(body.civilStatus)) {
      errors.push("Civil status must be one of: single, married, widowed, separated, divorced");
    } else {
      data.civilStatus = body.civilStatus;
    }
  }

  // Validate nationality (optional, max 50 chars, letters/hyphens/spaces/apostrophes only)
  if (body.nationality !== undefined) {
    if (body.nationality === null || body.nationality === "") {
      data.nationality = "";
    } else if (typeof body.nationality !== "string") {
      errors.push("Nationality must be text");
    } else {
      const trimmed = body.nationality.trim();
      if (trimmed.length > 50) {
        errors.push("Nationality must be 50 characters or less");
      } else if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
        errors.push("Nationality can only contain letters, spaces, hyphens, and apostrophes");
      } else {
        data.nationality = trimmed;
      }
    }
  }

  // Validate occupation (optional, max 60 chars)
  if (body.occupation !== undefined) {
    if (body.occupation === null || body.occupation === "") {
      data.occupation = "";
    } else if (typeof body.occupation !== "string") {
      errors.push("Occupation must be text");
    } else {
      const sanitized = sanitizeText(body.occupation);
      if (sanitized.length > 60) {
        errors.push("Occupation must be 60 characters or less");
      } else {
        data.occupation = sanitized;
      }
    }
  }

  // Validate profileImage (optional)
  if (body.profileImage !== undefined) {
    data.profileImage = body.profileImage;
  }

  // Validate educationLevel (optional, max 50 chars)
  if (body.educationLevel !== undefined) {
    if (body.educationLevel === null || body.educationLevel === "") {
      data.educationLevel = "";
    } else if (body.educationLevel.length > 50) {
      errors.push("Education level must be 50 characters or less");
    } else {
      data.educationLevel = sanitizeText(body.educationLevel);
    }
  }

  // Validate address (optional, max 200 chars)
  if (body.address !== undefined) {
    if (body.address.length > 200) {
      errors.push("Address must be 200 characters or less");
    } else {
      data.address = body.address.trim();
    }
  }

  // Validate city (optional, max 100 chars)
  if (body.city !== undefined) {
    if (body.city.length > 100) {
      errors.push("City must be 100 characters or less");
    } else {
      data.city = body.city.trim();
    }
  }

  // Validate province (optional, max 100 chars)
  if (body.province !== undefined) {
    if (body.province === null || body.province === "") {
      data.province = "";
    } else if (body.province.length > 100) {
      errors.push("Province must be 100 characters or less");
    } else {
      data.province = body.province.trim();
    }
  }

  // Validate dateOfBirth (optional, must be valid date, at least 18 years old, max 100 years)
  if (body.dateOfBirth !== undefined) {
    if (body.dateOfBirth === null || body.dateOfBirth === "") {
      data.dateOfBirth = null;
    } else {
      const dob = new Date(body.dateOfBirth);
      if (isNaN(dob.getTime())) {
        errors.push("Date of birth must be a valid date");
      } else {
        const today = new Date();
        const currentYear = today.getFullYear();
        const birthYear = dob.getFullYear();

        let age = currentYear - birthYear;
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }

        if (dob > today) {
          errors.push("Date of birth cannot be in the future");
        } else if (age < 18) {
          errors.push("Must be at least 18 years old");
        } else if (age > 100) {
          errors.push("Date of birth must be within the last 100 years");
        } else {
          data.dateOfBirth = dob;
        }
      }
    }
  }

  // Validate emergencyContact (optional, max 100 chars)
  if (body.emergencyContact !== undefined) {
    if (body.emergencyContact.length > 100) {
      errors.push("Emergency contact name must be 100 characters or less");
    } else {
      data.emergencyContact = formatProperCase(body.emergencyContact.trim());
    }
  }

  // Validate emergencyRelationship (optional, max 50 chars)
  if (body.emergencyRelationship !== undefined) {
    if (body.emergencyRelationship === null || body.emergencyRelationship === "") {
      data.emergencyRelationship = "";
    } else if (body.emergencyRelationship.length > 50) {
      errors.push("Emergency relationship must be 50 characters or less");
    } else {
      data.emergencyRelationship = sanitizeText(body.emergencyRelationship);
    }
  }

  // Validate emergencyPhone (optional)
  if (body.emergencyPhone !== undefined) {
    if (body.emergencyPhone === null || body.emergencyPhone === "") {
      data.emergencyPhone = "";
    } else {
      const ePhone = sanitizePhone(body.emergencyPhone);
      if (!ePhone) {
        errors.push("Invalid emergency phone number format");
      } else {
        data.emergencyPhone = ePhone;
      }
    }
  }

  // Validate studentId (optional, max 50 chars)
  if (body.studentId !== undefined) {
    if (body.studentId.length > 50) {
      errors.push("Student ID must be 50 characters or less");
    } else {
      data.studentId = body.studentId.trim();
    }
  }

  // Validate school (optional, max 100 chars)
  if (body.school !== undefined) {
    if (body.school.length > 100) {
      errors.push("School name must be 100 characters or less");
    } else {
      data.school = body.school.trim();
    }
  }

  // Validate yearLevel (optional, max 20 chars)
  if (body.yearLevel !== undefined) {
    if (body.yearLevel.length > 20) {
      errors.push("Year level must be 20 characters or less");
    } else {
      data.yearLevel = body.yearLevel.trim();
    }
  }

  return {
    valid: errors.length === 0,
    data,
    errors,
  };
};

/**
 * Create validation middleware for specific route
 *
 * @param {Function} validationFn - Validation function to use
 * @returns {Function} Express middleware
 */
export const createValidationMiddleware = (validationFn) => {
  return (req, res, next) => {
    const validation = validationFn(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: validation.errors,
      });
    }

    // Attach sanitized data to request
    req.sanitizedData = validation.data;
    next();
  };
};

export default {
  sanitizeString,
  sanitizeEmail,
  sanitizeUsername,
  sanitizePhone,
  sanitizeName,
  formatProperCase,
  validateBranch,
  validateRole,
  isValidObjectId,
  isValidDate,
  validateRegisterInput,
  validateProfileUpdateInput,
  createValidationMiddleware,
};
