export const AUTH_TOAST_DURATION = 5000;

export const buildAuthSuccessMessage = (user, fallbackName = "there") => {
  const firstName = user?.firstName?.trim();
  const displayName =
    firstName ||
    user?.displayName?.trim() ||
    user?.username?.trim() ||
    fallbackName;

  return `Welcome back, ${displayName}!`;
};

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
