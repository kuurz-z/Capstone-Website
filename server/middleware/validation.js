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

  // Remove all non-digit characters except + and -
  const sanitized = phone.replace(/[^\d+\-]/g, "").trim();

  // Phone: at least 7 digits
  const digitsOnly = sanitized.replace(/[^\d]/g, "");
  if (digitsOnly.length < 7) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitize name input (firstName, lastName)
 * - Allows letters, spaces, hyphens, apostrophes
 * - 2-50 characters
 * - Removes HTML/script tags
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

  // Allow letters, spaces, hyphens, apostrophes only
  // Minimum 1 character to support short names from social providers (Google)
  if (!/^[a-zA-Z\s\-']{1,50}$/.test(sanitized)) {
    return null;
  }

  return sanitized;
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
  validRoles = ["user", "tenant", "admin", "superAdmin"],
) => {
  if (!role || typeof role !== "string") return null;

  const sanitized = role.trim().toLowerCase();

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
export const validateRegisterInput = (body) => {
  const errors = [];
  const data = {};

  // Validate email
  if (body.email) {
    const email = sanitizeEmail(body.email);
    if (!email) {
      errors.push("Invalid email format");
    } else {
      data.email = email;
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
      if (!firstName) {
        errors.push(
          "First name must be 2-50 characters, letters/spaces/hyphens/apostrophes only",
        );
      } else {
        data.firstName = firstName;
      }
    }
  }

  // Validate lastName (optional)
  if (body.lastName !== undefined) {
    if (body.lastName === null || body.lastName === "") {
      errors.push("Last name cannot be empty");
    } else {
      const lastName = sanitizeName(body.lastName);
      if (!lastName) {
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

  // Validate dateOfBirth (optional, must be valid date in the past)
  if (body.dateOfBirth !== undefined) {
    if (body.dateOfBirth === null || body.dateOfBirth === "") {
      data.dateOfBirth = null;
    } else {
      const dob = new Date(body.dateOfBirth);
      if (isNaN(dob.getTime())) {
        errors.push("Date of birth must be a valid date");
      } else if (dob > new Date()) {
        errors.push("Date of birth cannot be in the future");
      } else {
        data.dateOfBirth = dob;
      }
    }
  }

  // Validate emergencyContact (optional, max 100 chars)
  if (body.emergencyContact !== undefined) {
    if (body.emergencyContact.length > 100) {
      errors.push("Emergency contact name must be 100 characters or less");
    } else {
      data.emergencyContact = body.emergencyContact.trim();
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
  validateBranch,
  validateRole,
  isValidObjectId,
  isValidDate,
  validateRegisterInput,
  validateProfileUpdateInput,
  createValidationMiddleware,
};
