const DEVICE_ID_KEY = "lilycrest_device_id";
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

export const getSessionId = () => localStorage.getItem(SESSION_ID_KEY);

export const setSessionId = (sessionId) => {
  if (sessionId) {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
};

export const clearSessionId = () => {
  localStorage.removeItem(SESSION_ID_KEY);
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

export const getSessionHeaders = ({ includeSession = true } = {}) => {
  const headers = {
    "x-device-id": getDeviceId(),
  };
  const sessionId = getSessionId();
  if (includeSession && sessionId) {
    headers["x-session-id"] = sessionId;
  }
  return headers;
};
