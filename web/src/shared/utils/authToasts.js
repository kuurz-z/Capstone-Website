import { formatDisplayName } from "./formatDate.js";

export const AUTH_TOAST_DURATION = 5000;

const emailPrefix = (email) => {
  if (!email || typeof email !== "string" || !email.includes("@")) return "";
  return email.split("@")[0]?.trim();
};

export const resolveAuthDisplayName = (user, fallbackName = "there") => {
  const firstName = user?.firstName?.trim();
  const lastName = user?.lastName?.trim();
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName;
  const displayName = user?.displayName?.trim();
  const username = user?.username?.trim();
  const emailName = emailPrefix(user?.email) || emailPrefix(fallbackName);
  const fallback = fallbackName?.trim?.() || "there";

  const resolved = fullName || displayName || username || emailName || fallback;
  return formatDisplayName(resolved);
};

export const buildAuthSuccessMessage = (user, fallbackName = "there") => {
  const displayName = resolveAuthDisplayName(user, fallbackName);

  // A user is considered "new" if explicitly flagged or created within the last 5 minutes
  const isNew =
    user?.isNewAccount === true ||
    (user?.createdAt && Date.now() - new Date(user.createdAt).getTime() < 5 * 60 * 1000);

  if (isNew) {
    return `Welcome, ${displayName}!`;
  }

  return `Welcome back, ${displayName}!`;
};

export const buildAuthWelcomeMessage = (user, fallbackName = "there") =>
  `Welcome to Lilycrest, ${resolveAuthDisplayName(user, fallbackName)}!`;

export const buildAuthSuccessFlash = (message) => ({
  flash: {
    type: "success",
    message,
    duration: AUTH_TOAST_DURATION,
  },
});

export const SIGN_OUT_SUCCESS_MESSAGE = "You have been signed out successfully.";

export const buildSignOutSuccessFlash = () =>
  buildAuthSuccessFlash(SIGN_OUT_SUCCESS_MESSAGE);
