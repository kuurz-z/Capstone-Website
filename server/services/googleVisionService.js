import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import vision from "@google-cloud/vision";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
// Shown to the applicant — must be user-friendly, no system jargon.
const MANUAL_REVIEW_NOTE =
  "Your ID has been uploaded and will be reviewed by our admin team.";

// Parse service account credentials from environment variable at module load.
// Set GOOGLE_VISION_CREDENTIALS to the full JSON content of the service account key.
const _visionCredentials = (() => {
  const raw = process.env.GOOGLE_VISION_CREDENTIALS;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(
      "[GoogleVision] GOOGLE_VISION_CREDENTIALS is set but contains invalid JSON — Vision disabled."
    );
    return null;
  }
})();

if (_visionCredentials) {
  console.info("[GoogleVision] Credentials loaded from GOOGLE_VISION_CREDENTIALS. AI validation enabled.");
} else {
  console.warn(
    "[GoogleVision] GOOGLE_VISION_CREDENTIALS not set. " +
    "ID validation will fall back to manual_review."
  );
}

let visionClient = null;

const isUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const getVisionClient = () => {
  if (visionClient) return visionClient;
  if (!_visionCredentials) {
    throw new Error("Google Vision credentials are not configured.");
  }
  visionClient = new vision.ImageAnnotatorClient({ credentials: _visionCredentials });
  return visionClient;
};

const getExtensionFromSource = (source, contentType = "") => {
  if (/pdf/i.test(contentType)) return ".pdf";
  if (/png/i.test(contentType)) return ".png";
  if (/jpe?g/i.test(contentType)) return ".jpg";

  try {
    const url = isUrl(source) ? new URL(source) : null;
    const pathname = url ? url.pathname : String(source || "");
    return path.extname(pathname).toLowerCase();
  } catch {
    return path.extname(String(source || "")).toLowerCase();
  }
};

const manualReviewResult = (message = "ID requires manual verification.", provider = "google_vision") => ({
  status: "manual_review",
  text: "",
  normalizedText: "",
  message,
  notes: [MANUAL_REVIEW_NOTE],
  _provider: provider,
});

const normalizeText = (text = "") =>
  String(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const downloadUrlToTempFile = async (source) => {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to download ID document (${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("ID document is too large for validation.");
  }

  const contentType = response.headers.get("content-type") || "";
  const extension = getExtensionFromSource(source, contentType);
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("ID document is empty.");
  }
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error("ID document is too large for validation.");
  }

  const tempPath = path.join(
    os.tmpdir(),
    `lilycrest-id-${Date.now()}-${Math.random().toString(36).slice(2)}${extension || ".jpg"}`,
  );
  await fs.promises.writeFile(tempPath, buffer);

  return {
    filePath: tempPath,
    cleanup: true,
    contentType,
    extension,
    size: buffer.length,
  };
};

const resolveLocalFile = async (source) => {
  const filePath = path.resolve(source);
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("ID document is empty or unreadable.");
  }

  return {
    filePath,
    cleanup: false,
    contentType: "",
    extension: getExtensionFromSource(filePath),
    size: stats.size,
  };
};

export const extractTextFromImage = async (source) => {
  let prepared = null;

  // Safe per-request log — no credentials, no PII, no image content.
  console.info(
    `[GoogleVision] OCR request — configured: ${Boolean(_visionCredentials)}, ` +
    `source: ${isUrl(source) ? "url" : source ? "file" : "missing"}`,
  );

  try {
    if (!source) {
      console.warn("[GoogleVision] OCR skipped — no source provided");
      return {
        status: "failed",
        text: "",
        normalizedText: "",
        message: "ID image is unclear. Please upload a clearer photo.",
        notes: ["No ID document was provided."],
      };
    }

    if (!_visionCredentials) {
      console.warn("[GoogleVision] OCR skipped — GOOGLE_VISION_CREDENTIALS not set");
      return manualReviewResult("ID requires manual verification.");
    }

    prepared = isUrl(source)
      ? await downloadUrlToTempFile(source)
      : await resolveLocalFile(source);

    console.info(
      `[GoogleVision] Image prepared — ext: ${prepared.extension}, size: ${prepared.size} bytes`,
    );

    if (prepared.extension === ".pdf") {
      console.info("[GoogleVision] OCR skipped — PDF, routing to manual review");
      return manualReviewResult("ID uploaded. It will be manually reviewed by admin.");
    }

    if (!IMAGE_EXTENSIONS.has(prepared.extension)) {
      console.warn(`[GoogleVision] OCR skipped — unsupported extension: ${prepared.extension}`);
      return {
        status: "failed",
        text: "",
        normalizedText: "",
        message: "Unsupported ID file type.",
        notes: ["Only JPEG, PNG, and PDF files are supported."],
      };
    }

    if (
      prepared.contentType &&
      !SUPPORTED_MIME_TYPES.has(prepared.contentType.split(";")[0].trim().toLowerCase())
    ) {
      console.warn(`[GoogleVision] OCR skipped — unsupported MIME: ${prepared.contentType}`);
      return {
        status: "failed",
        text: "",
        normalizedText: "",
        message: "Unsupported ID file type.",
        notes: ["Only JPEG, PNG, and PDF files are supported."],
      };
    }

    const client = getVisionClient();
    const [result] = await client.textDetection(prepared.filePath);
    const fullText = normalizeText(result?.textAnnotations?.[0]?.description || "");

    console.info(
      `[GoogleVision] OCR complete — text length: ${fullText.length} chars, ` +
      `empty: ${fullText.trim().length === 0}`,
    );

    return {
      status: "processed",
      text: fullText,
      normalizedText: fullText.toLowerCase(),
      message: "ID text extracted.",
      notes: [],
    };
  } catch (err) {
    const isCredentialError =
      !_visionCredentials ||
      String(err?.message || "").toLowerCase().includes("credentials") ||
      String(err?.message || "").toLowerCase().includes("not configured");
    const reason = isCredentialError ? "credentials_missing" : "ocr_runtime_error";
    // Log the technical reason server-side only — never expose to client.
    console.warn(
      `[GoogleVision] OCR failed — reason: ${reason}` +
      (isCredentialError ? "" : `, error: ${err?.message || err}`),
    );
    return manualReviewResult(
      "ID requires manual verification.",
      isCredentialError ? "not_configured" : "vision_error",
    );
  } finally {
    if (prepared?.cleanup && prepared.filePath) {
      fs.promises.unlink(prepared.filePath).catch(() => {});
    }
  }
};

export default {
  extractTextFromImage,
};
