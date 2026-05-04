/**
 * ImageKit Upload Routes
 *
 * Provides a server-side authentication endpoint that generates
 * upload tokens for ImageKit client-side uploads.
 *
 * ImageKit requires server-generated auth params (token, signature, expire).
 */

import express from "express";
import crypto from "crypto";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// ── ImageKit credentials ──────────────────────────────────────
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || "private_o9ryYhjsKuLWMHMOTFzTp5Oq6K8=";

/**
 * GET /api/upload/imagekit-auth
 *
 * Generates authentication parameters for client-side ImageKit uploads.
 * Requires authenticated user (prevents anonymous uploads eating storage).
 *
 * Returns: { token, expire, signature }
 */
router.get("/imagekit-auth", verifyToken, (req, res) => {
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 60 * 30; // 30 min validity
  const privateKey = IMAGEKIT_PRIVATE_KEY;

  // HMAC-SHA1 signature = hex(hmac(privateKey, token + expire))
  const signature = crypto
    .createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  res.json({
    success: true,
    data: { token, expire, signature },
  });
});

export default router;
