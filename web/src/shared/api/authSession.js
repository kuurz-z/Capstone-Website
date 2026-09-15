import { STORAGE_KEY_LAST_ACTIVITY } from "../utils/sessionInactivityCore.js";

const DEVICE_ID_KEY = "lilycrest_device_id";
const SESSION_ESTABLISHED_KEY = "lilycrest_session_established";
const SESSION_ID_KEY = "lilycrest_session_id";
const OTP_PENDING_KEY = "lilycrest_otp_pending";
const LOGIN_IN_PROGRESS_KEY = "lilycrest_login_in_progress";

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

export const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = createId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const getSessionId = () =>
  sessionStorage.getItem(SESSION_ID_KEY) ||
  localStorage.getItem(SESSION_ID_KEY) ||
  "";

export const hasApplicationSession = () =>
  sessionStorage.getItem(SESSION_ESTABLISHED_KEY) === "1" ||
  localStorage.getItem(SESSION_ESTABLISHED_KEY) === "1";

export const markApplicationSession = (sessionId = "") => {
  sessionStorage.setItem(SESSION_ESTABLISHED_KEY, "1");
  localStorage.setItem(SESSION_ESTABLISHED_KEY, "1");
  if (sessionId && typeof sessionId === "string") {
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  try {
    localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(Date.now()));
  } catch {
    // Ignore storage access errors
  }
};

export const clearApplicationSession = () => {
  sessionStorage.removeItem(SESSION_ESTABLISHED_KEY);
  sessionStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(SESSION_ESTABLISHED_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem("lilycrest_session_id");
  try {
    localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
  } catch {
    // Ignore storage access errors
  }
};

export const setOtpPending = (data = {}) => {
  sessionStorage.setItem(OTP_PENDING_KEY, JSON.stringify(data));
};

export const getOtpPending = () => {
  try {
    return JSON.parse(sessionStorage.getItem(OTP_PENDING_KEY) || "null");
  } catch {
    return null;
  }
};

export const clearOtpPending = () => {
  sessionStorage.removeItem(OTP_PENDING_KEY);
};

export const setLoginInProgress = () => {
  sessionStorage.setItem(LOGIN_IN_PROGRESS_KEY, "1");
};

export const clearLoginInProgress = () => {
  sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY);
};

export const isLoginInProgress = () =>
  sessionStorage.getItem(LOGIN_IN_PROGRESS_KEY) === "1";

export const getSessionHeaders = () => {
  const sessionId = getSessionId();
  return {
    "x-device-id": getDeviceId(),
    ...(sessionId ? { "x-session-id": sessionId } : {}),
  };
};
