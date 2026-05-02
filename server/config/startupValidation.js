import logger from "../middleware/logger.js";

const ENV_GROUPS = Object.freeze({
  mongodb: ["MONGODB_URI"],
  firebase: [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_PRIVATE_KEY_ID",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_CLIENT_ID",
    "FIREBASE_CLIENT_CERT_URL",
  ],
  paymongo: ["PAYMONGO_SECRET_KEY", "PAYMONGO_WEBHOOK_SECRET"],
});

const getMissingEnv = (keys = []) =>
  keys.filter((key) => !String(process.env[key] || "").trim());

export function validateStartupConfig() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const missingByGroup = Object.fromEntries(
    Object.entries(ENV_GROUPS).map(([group, keys]) => [group, getMissingEnv(keys)]),
  );

  const hasCorsConfig = Boolean(
    String(process.env.CORS_ORIGINS || "").trim() ||
    String(process.env.FRONTEND_URL || "").trim(),
  );

  const failures = Object.entries(missingByGroup)
    .filter(([, missing]) => missing.length > 0)
    .map(([group, missing]) => `${group}: ${missing.join(", ")}`);

  const hasEmailCredentials = Boolean(
    (String(process.env.EMAIL_USER || "").trim() &&
      String(process.env.EMAIL_PASSWORD || "").trim()) ||
      (String(process.env.SMTP_USER || "").trim() &&
        String(process.env.SMTP_PASS || "").trim()),
  );

  if (!hasEmailCredentials) {
    failures.push("email: EMAIL_USER/EMAIL_PASSWORD or SMTP_USER/SMTP_PASS");
  }

  const hasResendCredentials = Boolean(
    String(process.env.RESEND_API_KEY || "").trim() &&
    String(process.env.RESEND_FROM_EMAIL || "").trim(),
  );

  if (!hasResendCredentials) {
    failures.push("resend: RESEND_API_KEY and RESEND_FROM_EMAIL required for OTP emails");
  }

  if (!hasCorsConfig) {
    failures.push("cors: CORS_ORIGINS or FRONTEND_URL");
  }

  if (failures.length === 0) {
    return;
  }

  if (isProduction) {
    throw new Error(
      `Startup validation failed. Missing required configuration -> ${failures.join(" | ")}`,
    );
  }

  logger.warn(
    { missingConfiguration: failures },
    "Startup validation warnings detected",
  );
}

export default validateStartupConfig;
