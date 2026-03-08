/**
 * ============================================================================
 * REQUEST ID MIDDLEWARE
 * ============================================================================
 *
 * Assigns a unique UUID to every incoming request for end-to-end tracing.
 * The ID is available via req.id and returned in the X-Request-Id header.
 *
 * ============================================================================
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Attach a unique request ID to every request.
 * If the client already sent an X-Request-Id header, reuse it.
 */
const requestId = (req, res, next) => {
  const id = req.headers["x-request-id"] || uuidv4();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export default requestId;
