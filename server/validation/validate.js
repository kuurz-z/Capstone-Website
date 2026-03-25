/**
 * Simple schema-based validation middleware factory.
 *
 * Usage:
 *   router.patch("/update-branch", verifyToken, validate(updateBranchSchema), handler);
 *
 * Schema shape:
 *   { fieldName: { type: "string", required: true, enum: [...] } }
 */

/**
 * @param {Object} schema - Field descriptor object
 * @returns Express middleware that validates req.body against the schema
 */
export const validate = (schema) => (req, res, next) => {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = req.body[field];

    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push(`"${field}" is required`);
      continue;
    }

    if (value === undefined || value === null) continue; // optional, not provided

    if (rules.type === "string" && typeof value !== "string") {
      errors.push(`"${field}" must be a string`);
      continue;
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`"${field}" must be one of: ${rules.enum.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: errors,
    });
  }

  next();
};
