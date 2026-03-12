/**
 * ============================================================================
 * ZOD VALIDATE MIDDLEWARE
 * ============================================================================
 *
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 *
 * Usage in route files:
 *   import { validate } from "../validation/validate.js";
 *   import { createInquirySchema } from "../validation/schemas.js";
 *   router.post("/", validate(createInquirySchema), createInquiry);
 *
 * ============================================================================
 */

import { ZodError } from "zod";

/**
 * Returns an Express middleware that validates req.body against the given schema.
 * On success, replaces req.body with the parsed (coerced/defaulted) data.
 * On failure, responds with 400 and a structured error.
 *
 * @param {import("zod").ZodSchema} schema - The Zod schema to validate against
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      // Parse validates AND transforms (trim, default, coerce)
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        return res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: fieldErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join("; "),
          fieldErrors,
        });
      }

      // Non-Zod error — pass through
      next(error);
    }
  };
}
