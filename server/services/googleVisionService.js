import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import vision from "@google-cloud/vision";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MANUAL_REVIEW_NOTE =
  "Google Vision validation unavailable. Manual review required.";

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

  try {
    if (!source) {
      return {
        status: "failed",
        text: "",
        normalizedText: "",
        message: "ID image is unclear. Please upload a clearer photo.",
        notes: ["No ID document was provided."],
      };
    }

    prepared = isUrl(source)
      ? await downloadUrlToTempFile(source)
      : await resolveLocalFile(source);

    if (prepared.extension === ".pdf") {
      return manualReviewResult("ID uploaded. It will be manually reviewed by admin.");
    }

    if (!IMAGE_EXTENSIONS.has(prepared.extension)) {
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
    console.warn(
      `[GoogleVision] extractTextFromImage failed (reason: ${reason})` +
      (isCredentialError ? "" : ` — ${err?.message || err}`)
    );
    return manualReviewResult("ID requires manual verification.", isCredentialError ? "not_configured" : "vision_error");
  } finally {
    if (prepared?.cleanup && prepared.filePath) {
      fs.promises.unlink(prepared.filePath).catch(() => {});
    }
  }
};

export default {
  extractTextFromImage,
};
