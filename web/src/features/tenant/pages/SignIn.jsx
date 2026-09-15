/**
 * =============================================================================
 * SIGN IN PAGE
 * =============================================================================
 *
 * User login page with:
 * - Email/password login OR username/password login
 * - Email verification check
 * - Google and Facebook social authentication
 * - Redirects to check availability after login
 * - Show/Hide password toggle
 * - Comprehensive error handling
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import PasswordVisibilityButton from "../../../shared/components/PasswordVisibilityButton";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { recoverFromAuthFailure } from "../../../shared/utils/identitySafety";
import {
  validateEmail,
  getFirebaseErrorMessage,
  formatProperCase,
  NEW_PASSWORD_MAX_LENGTH,
} from "../../../shared/utils/authValidation";
import { authApi } from "../../../shared/api/apiClient";
import {
  AUTH_TOAST_DURATION,
  buildAuthSuccessMessage,
} from "../../../shared/utils/authToasts";
import {
  clearLoginInProgress,
  clearOtpPending,
  setLoginInProgress,
  setOtpPending,
} from "../../../shared/api/authSession";
import {
  getAuthErrorCode,
  isOtpDeliveryAccepted,
} from "../../../shared/api/authFlowState";
import { getAuthenticatedUserDestination } from "../../../shared/api/loginRouting";
import { resolveResendVerificationMessage } from "../../../shared/api/apiError";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import SocialAuthButtons from "../../../shared/components/SocialAuthButtons";
import FloatingInput from "../../../shared/components/FloatingInput";
import { AlertTriangle, Loader2 } from "lucide-react";
import "../../../shared/styles/auth-forms.css";
import "../../public/styles/tenant-signin.css";
import "../../../shared/styles/notification.css";
import hero3 from "../../../assets/images/hero3.jpg";
import {
  getLockoutState,
  recordFailedLoginAttempt,
  resetLockoutState,
  setResendCooldown as setPersistentResendCooldown,
  getResendCooldown,
  subscribeToAuthStorage,
} from "../../../shared/utils/authLockout";
import { normalizeInternalContinuation } from "../../../shared/utils/emailVerificationFlow";
import {
  createSocialAuthSession,
  isPopupCancellationError,
} from "../../../shared/utils/socialAuthManager";

const SIGNIN_IMAGE = hero3;
const RESEND_COOLDOWN_KEY = "unverified_email_resend";


function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const appNavigate = useAppNavigation();
  const { login, setGlobalLoading } = useAuth();
  const [postAuthContinuation] = useState(() =>
    normalizeInternalContinuation(new URLSearchParams(window.location.search).get("continue")),
  );

  const initialLockout = getLockoutState();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
  const [credentialError, setCredentialError] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(initialLockout.attempts);
  const [lockoutUntil, setLockoutUntil] = useState(initialLockout.lockoutUntil);
  const [lockoutCountdown, setLockoutCountdown] = useState(initialLockout.remainingSeconds);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(() => getResendCooldown(RESEND_COOLDOWN_KEY));
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const debounceTimersRef = useRef({});
  const socialSessionRef = useRef(null);

  const handleCancelSocialAuth = () => {
    if (socialSessionRef.current) {
      socialSessionRef.current.cancel();
    }
    setSocialLoading(false);
    setGlobalLoading(false);
    sessionStorage.removeItem("socialAuthInProgress");
  };


  // Cleanup pending debounce timers and active social session on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach((timer) => clearTimeout(timer));
      if (socialSessionRef.current) {
        socialSessionRef.current.cancel();
      }
    };
  }, []);


  const handlePasswordKey = (e) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
    if (e.key === " ") {
      e.preventDefault();
    }
  };

  // Show notification when redirected here due to session expiry
  useEffect(() => {
    if (sessionStorage.getItem("lc_session_expired")) {
      sessionStorage.removeItem("lc_session_expired");
      showNotification("Your session has expired. Please sign in again.", "info", 5000);
    }
  }, []);

  // Load remembered or pending registration / verified email on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isVerifiedRedirect = params.get("verified") === "true";
    const queryEmail = params.get("email");
    const locationStateEmail = location.state?.email;
    const verifiedSessionEmail =
      sessionStorage.getItem("lilycrest_verified_email") ||
      sessionStorage.getItem("lilycrest_pending_verification_email");
    const pendingEmail =
      sessionStorage.getItem("lilycrest_pending_email") ||
      localStorage.getItem("lilycrest_pending_email");
    const savedEmail = localStorage.getItem("lilycrest_remember_email");

    const activePrefill = (
      locationStateEmail ||
      verifiedSessionEmail ||
      pendingEmail ||
      queryEmail ||
      ""
    ).trim();

    if (activePrefill) {
      setFormData((prev) => ({ ...prev, email: activePrefill }));
      setRememberMe(false);
      setFieldValid((prev) => ({ ...prev, email: true }));
      setTouched((prev) => ({ ...prev, email: true }));

      // Clean up temporary storage and history state immediately so refresh (F5) leaves form blank
      sessionStorage.removeItem("lilycrest_pending_email");
      sessionStorage.removeItem("lilycrest_verified_email");
      sessionStorage.removeItem("lilycrest_pending_verification_email");
      localStorage.removeItem("lilycrest_pending_email");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (savedEmail) {
      setFormData((prev) => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
      setFieldValid((prev) => ({ ...prev, email: true }));
      setTouched((prev) => ({ ...prev, email: true }));
    }

    // Show success banner if redirected from email verification
    if (isVerifiedRedirect) {
      setUnverifiedEmail(null);
      setVerifiedSuccess(true);
      sessionStorage.removeItem("lilycrest_pending_email");
      sessionStorage.removeItem("lilycrest_verified_email");
      sessionStorage.removeItem("lilycrest_pending_verification_email");
      localStorage.removeItem("lilycrest_pending_email");
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        const pw = document.getElementById("password");
        if (pw) pw.focus();
      }, 200);
    }
  }, [location.state]);

  // ── Lockout countdown timer (persistent timestamp-based) ──
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutCountdown(0);
        getLockoutState(); // Clean up expired storage
        setTimeout(() => {
          const pw = document.getElementById("password");
          if (pw) pw.focus();
        }, 100);
      } else {
        setLockoutCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // ── Resend cooldown (persistent timestamp-based) ─────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const tick = () => {
      const remaining = getResendCooldown(RESEND_COOLDOWN_KEY);
      setResendCooldown(remaining);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // ── Multi-tab sync via storage listener ────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToAuthStorage(() => {
      const latest = getLockoutState(formData.email);
      setFailedAttempts(latest.attempts);
      setLockoutUntil(latest.lockoutUntil);
      setLockoutCountdown(latest.remainingSeconds);
      setResendCooldown(getResendCooldown(RESEND_COOLDOWN_KEY));
    });
    return unsubscribe;
  }, [formData.email]);

  const isLockedOut = Boolean(lockoutUntil && Date.now() < lockoutUntil);

  const recordFailedAttempt = () => {
    const result = recordFailedLoginAttempt(formData.email);
    setFailedAttempts(result.attempts);
    setLockoutUntil(result.lockoutUntil);
    setLockoutCountdown(result.remainingSeconds);
    if (result.isLockedOut) {
      showNotification(
        `Too many failed sign-in attempts. For your security, sign-in is paused for ${result.remainingSeconds} seconds.`,
        "error",
        7000,
      );
    }
  };

  // ── Form handling ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    const sanitizedValue =
      name === "password"
        ? value.replace(/\s/g, "").slice(0, NEW_PASSWORD_MAX_LENGTH)
        : value;
    setFormData((prev) => ({ ...prev, [name]: sanitizedValue }));
    if (credentialError) {
      setCredentialError(false);
    }
    
    if (debounceTimersRef.current[name]) {
      clearTimeout(debounceTimersRef.current[name]);
    }

    debounceTimersRef.current[name] = setTimeout(() => {
      if (touched[name]) {
        validateField(name, sanitizedValue);
      } else {
        const error = name === "email" ? validateEmail(sanitizedValue) : !sanitizedValue ? "Password is required" : null;
        setFieldValid((prev) => ({ ...prev, [name]: !error }));
      }
    }, 250);
  };

  const handleBlur = (fieldName) => {
    if (debounceTimersRef.current[fieldName]) {
      clearTimeout(debounceTimersRef.current[fieldName]);
    }
    const val = formData[fieldName];
    if (val && val.trim()) {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      validateField(fieldName, val);
    }
    if (fieldName === "password") {
      setCapsLockActive(false);
    }
  };

  const validateField = (fieldName, value) => {
    let error = null;
    if (fieldName === "email") error = validateEmail(value);
    else if (fieldName === "password") {
      if (!value) error = "Password is required";
    }
    setValidationErrors((prev) => ({ ...prev, [fieldName]: error }));
    setFieldValid((prev) => ({ ...prev, [fieldName]: !error }));
  };

  const isFormValid = () => fieldValid.email && fieldValid.password;

 const hasAdminClaims = (tokenResult) =>
 Boolean(tokenResult?.claims?.branch_admin || tokenResult?.claims?.owner);

  const navigateAfterAuth = (user, fallbackName = "there", options = {}) => {
    const { suppressSuccessToast = false } = options;
    const successMessage = buildAuthSuccessMessage(user, fallbackName);

    if (!suppressSuccessToast) {
      showNotification(successMessage, "success", AUTH_TOAST_DURATION);
    }

    const isStaffOrOwner =
      user?.role === "branch_admin" ||
      user?.role === "owner" ||
      user?.role === "super_admin";

    appNavigate(
      isStaffOrOwner
        ? "/admin/dashboard"
        : postAuthContinuation !== "/signin"
          ? postAuthContinuation
          : getAuthenticatedUserDestination(user),
    );
  };

 const validateForm = () => {
 setTouched({ email: true, password: true });
 validateField("email", formData.email);
 validateField("password", formData.password);

 if (!formData.email.trim() || validateEmail(formData.email)) {
 showNotification(
 validateEmail(formData.email) || "Email is required",
 "error",
 );
 setTimeout(() => {
 const el = document.getElementById("email");
 if (el) {
 el.scrollIntoView({ behavior: "smooth", block: "center" });
 el.focus();
 }
 }, 100);
 return false;
 }
 if (!formData.password) {
 showNotification("Password is required", "error");
 setTimeout(() => {
 const el = document.getElementById("password");
 if (el) {
 el.scrollIntoView({ behavior: "smooth", block: "center" });
 el.focus();
 }
 }, 100);
 return false;
 }
 return true;
 };

 // ── Auth handlers ──────────────────────────────────────────
  const handlePostAuthFlow = (
    loginResponse,
    fallbackName = "there",
    options = {},
  ) => {
    resetLockoutState(formData.email);
    clearOtpPending();
    navigateAfterAuth(loginResponse.user, fallbackName, options);
  };

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (isLockedOut) {
      showNotification(
        `Too many attempts. Try again in ${lockoutCountdown}s.`,
        "error",
      );
      return;
    }
    setSubmitting(true);
    setGlobalLoading(true);
    setLoginInProgress();

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      let firebaseUser = userCredential.user;

      // Reload user profile from Firebase to refresh emailVerified status
      try {
        await firebaseUser.reload();
        firebaseUser = auth.currentUser || firebaseUser;
      } catch (_) {}

      // Branch admins and owners bypass email verification checks.
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      const isAdmin = hasAdminClaims(tokenResult);

 if (!firebaseUser.emailVerified && !isAdmin) {
 // Request a server-generated verification email before signing out.
 sessionStorage.setItem("resendInProgress", "1");
 let delivery = null;
 try {
 delivery = await authApi.sendEmailVerification(postAuthContinuation);
 } catch (_) {
 delivery = null;
 }
 setUnverifiedEmail(formData.email);
 await auth.signOut();
 sessionStorage.removeItem("resendInProgress");
  if (delivery) {
  navigate("/auth-action?state=sent", { replace: true });
  } else {
  showNotification(
  "Your email address is not verified yet. Please check your inbox, or use the option below to resend your verification link.",
  "warning",
  7000,
  );
  }
 setGlobalLoading(false);
 return;
 }

 // Save or clear remembered email
 if (rememberMe) {
 localStorage.setItem("lilycrest_remember_email", formData.email);
 } else {
 localStorage.removeItem("lilycrest_remember_email");
 }
 localStorage.removeItem("lilycrest_pending_email");

 try {
 const loginResponse = await login();
 resetLockoutState(formData.email);
 if (isOtpDeliveryAccepted(loginResponse)) {
  setOtpPending();
  navigate("/verify-otp");
  return;
 }
 clearOtpPending();
 navigateAfterAuth(loginResponse.user, firebaseUser.displayName || "there");
 } catch (backendError) {
 clearOtpPending();
 await auth.signOut();
 const backendErrorCode = getAuthErrorCode(backendError);
 const isNotRegistered =
 backendError.response?.status === 404 ||
 /not found|not registered|register first/i.test(backendError.message);
 if (backendErrorCode === "OTP_EMAIL_SEND_FAILED")
 showNotification(
 "We could not send the verification code. Please try again later.",
 "error",
 6000,
 );
 else if (isNotRegistered)
 showNotification(
 "User is not registered. Please sign up first.",
 "warning",
 );
 else if (backendError.response?.status === 403)
 showNotification(
 "Your account is inactive. Please contact support.",
 "error",
 );
 else
 showNotification(
 "Login failed. Please try again or contact support.",
 "error",
 );
 }
 } catch (error) {
      recordFailedAttempt();
      showNotification(getFirebaseErrorMessage(error, "login"), "error");
      setFormData((prev) => ({ ...prev, password: "" }));
      setCredentialError(true);
      setTimeout(() => {
        document.getElementById("password")?.focus();
      }, 100);
    } finally {
      clearLoginInProgress();
      setGlobalLoading(false);
      setSubmitting(false);
    }
  };

  const processSocialUser = async (firebaseUser) => {
    if (!firebaseUser.email) {
      await recoverFromAuthFailure(auth);
      showNotification(
        "We could not get your email address from Google. Please try again or use a different sign-in method.",
        "error",
      );
      setGlobalLoading(false);
      return;
    }

    // Branch admins and owners bypass email verification checks.
    const tokenResult = await firebaseUser.getIdTokenResult();
    const isAdmin = hasAdminClaims(tokenResult);
    if (!firebaseUser.emailVerified && !isAdmin) {
      await auth.signOut();
      showNotification(
        "Please verify your email before logging in. Check your inbox for the verification link.",
        "warning",
      );
      setGlobalLoading(false);
      return;
    }

    try {
      const loginResponse = await login();
      resetLockoutState();
      handlePostAuthFlow(loginResponse, firebaseUser.displayName || firebaseUser.email || "there");
    } catch (loginError) {
      const status = loginError.response?.status;
      const errMsg = loginError.message || "";
      const errCode = loginError.response?.data?.code || loginError.code || "";

      if (
        status === 404 ||
        /not found|not registered|register first/i.test(errMsg)
      ) {
        // Account does not exist in the database.
        // Sign In must not auto-register unregistered accounts.
        await authApi.logout().catch(() => auth.signOut().catch(() => {}));
        sessionStorage.removeItem("socialAuthInProgress");
        setSocialLoading(false);
        setGlobalLoading(false);
        appNavigate("/signup", {
          state: { email: firebaseUser.email, isGoogleAuth: true },
          flash: {
            type: "warning",
            message:
              "No registered account found with this Google account. Please sign up first.",
          },
          replace: true,
        });
        return;
      }

      // Handle identity conflict (email already registered with password)
      if (status === 409 || errCode === "IDENTITY_CONFLICT") {
        await recoverFromAuthFailure(auth, loginError);
        showNotification(
          "This email is already registered using a password. Please sign in with your email and password instead.",
          "warning",
          7000,
        );
        return;
      }

      // Preserve the Firebase identity for non-404 backend failures.
      await recoverFromAuthFailure(auth, loginError);

      if (status === 403) {
        const code = loginError.response?.data?.code;
        if (code === "EMAIL_NOT_VERIFIED") {
          showNotification(
            "Please verify your email before logging in.",
            "warning",
          );
        } else {
          showNotification(
            "Your account is inactive. Please contact support.",
            "error",
          );
        }
      } else {
        showNotification(
          "Login failed. Please try again or contact support.",
          "error",
        );
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user && isMounted) {
          setSocialLoading(true);
          setGlobalLoading(true);
          sessionStorage.setItem("socialAuthInProgress", "1");
          await processSocialUser(result.user, result);
        }
      } catch (error) {
        if (isMounted) {
          if (
            error.code === "auth/account-exists-with-different-credential" ||
            error.code === "auth/email-already-in-use"
          ) {
            try { await auth.signOut(); } catch (_) { /* ignore */ }
            showNotification(
              "This email is already registered with a password. Please sign in with your email and password instead.",
              "warning",
              7000,
            );
          } else {
            await recoverFromAuthFailure(auth, error);
            showNotification(getFirebaseErrorMessage(error, "login"), "error");
          }
        }
      } finally {
        if (isMounted) {
          sessionStorage.removeItem("socialAuthInProgress");
          setSocialLoading(false);
          setGlobalLoading(false);
        }
      }
    };
    checkRedirect();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSocialLogin = async (provider) => {
    setSocialLoading(true);
    sessionStorage.setItem("socialAuthInProgress", "1");

    if (!socialSessionRef.current) {
      socialSessionRef.current = createSocialAuthSession();
    }

    try {
      const result = await socialSessionRef.current.start({
        auth,
        provider,
        signInFn: (a, p) => signInWithPopup(a, p),
        onCancel: () => {
          setSocialLoading(false);
          showNotification("Sign-in was cancelled.", "info", 3000);
        },
      });

      if (result?.user) {
        await processSocialUser(result.user, result);
      }
    } catch (error) {
      if (error.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          await recoverFromAuthFailure(auth, redirectError);
          showNotification(getFirebaseErrorMessage(redirectError, "login"), "error");
        }
      }
      if (isPopupCancellationError(error)) {
        setSocialLoading(false);
        showNotification("Sign-in was cancelled.", "info", 3000);
        return;
      }
      if (
        error.code === "auth/account-exists-with-different-credential" ||
        error.code === "auth/email-already-in-use"
      ) {
        try { await auth.signOut(); } catch (_) { /* ignore */ }
        showNotification(
          "This email is already registered with a password. Please sign in with your email and password instead.",
          "warning",
          7000,
        );
        return;
      }
      await recoverFromAuthFailure(auth, error);
      showNotification(getFirebaseErrorMessage(error, "login"), "error");
    } finally {
      sessionStorage.removeItem("socialAuthInProgress");
      setSocialLoading(false);
      setGlobalLoading(false);
    }
  };


  const handleGoogleLogin = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    handleSocialLogin(provider);
  };
 const handleFacebookLogin = () =>
 handleSocialLogin(new FacebookAuthProvider());

 const inputClass = (name) =>
 `w-full px-4 py-4 rounded-xl bg-muted border focus:outline-none text-foreground font-light placeholder:text-muted-foreground transition-colors ${touched[name] ? (fieldValid[name] ? "border-green-500" : "border-red-500") : "border-border focus:border-border"}`;

 return (
 <div
 className="min-h-screen grid lg:grid-cols-2"
 style={{ backgroundColor: "#FFFFFF" }}
 >
 <AuthBrandingPanel
 imageUrl={SIGNIN_IMAGE}
 headline="Your Home Away<br/>From Home"
 subtitle="Premium living in the heart of Manila"
 />

      <div className="flex items-center justify-center p-8 lg:p-12 bg-card overflow-y-auto">
        <div className="w-full max-w-md my-auto">
 <Link
 to="/"
 className="lg:hidden inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
 >
 <span className="text-sm font-light">← Back to website</span>
 </Link>

 <div className="auth-header">
 {verifiedSuccess && (
 <p
 style={{
 display: "flex",
 alignItems: "center",
 gap: "6px",
 margin: "0 0 6px",
 fontSize: "13px",
 fontWeight: 500,
 color: "#10B981",
 letterSpacing: "0.2px",
 }}
 >
 <span style={{ fontSize: "14px" }}>✓</span> Email verified
 </p>
 )}
 <h1 className="auth-header__title">Welcome back</h1>
 <p className="auth-header__subtitle">
 Don&apos;t have an account? <Link to="/signup">Sign up</Link>
 </p>
 </div>


 {/* Unverified email banner with resend button */}
 {unverifiedEmail && (
 <div className="verify-banner" role="alert">
 {/* Mail icon */}
 <svg
 className="verify-banner__icon"
 xmlns="http://www.w3.org/2000/svg"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 aria-hidden="true"
 >
 <rect x="2" y="4" width="20" height="16" rx="2" />
 <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
 </svg>

 {/* Text */}
 <div className="verify-banner__text">
 <span className="verify-banner__title">Email not verified</span>
 <span className="verify-banner__desc">
 A link was sent to your email.
 </span>
 </div>

 {/* Action */}
 <button
 type="button"
 disabled={resending || resendCooldown > 0}
 className="verify-banner__action"
 onClick={async () => {
 if (!formData.password) {
 showNotification(
 "Please re-enter your password to resend the verification email.",
 "warning",
 );
 setTimeout(() => {
 const el = document.getElementById("password");
 if (el) {
 el.focus();
 }
 }, 100);
 return;
 }
 setResending(true);
 sessionStorage.setItem("resendInProgress", "1");
 try {
 const cred = await signInWithEmailAndPassword(
 auth,
 unverifiedEmail,
 formData.password,
 );
 const delivery = await authApi.sendEmailVerification(postAuthContinuation);
 await auth.signOut();
 sessionStorage.removeItem("resendInProgress");
 navigate("/auth-action?state=sent", { replace: true });
 return;
 } catch (err) {
 const retryAfter = err.response?.data?.retryAfterSeconds || 60;
 setPersistentResendCooldown(RESEND_COOLDOWN_KEY, retryAfter);
 setResendCooldown(retryAfter);
 showNotification(resolveResendVerificationMessage(err), "error");
 } finally {
 try {
 await auth.signOut();
 } catch (_) {
 /* ignore */
 }
 sessionStorage.removeItem("resendInProgress");
 setResending(false);
 }
 }}
 >
 {resending ? (
 <>
 <Loader2 className="w-3 h-3 auth-spinner" />
 &nbsp;Sending…
 </>
 ) : resendCooldown > 0 ? (
 <span className="verify-banner__timer">
 {resendCooldown}s
 </span>
 ) : (
 "Resend"
 )}
 </button>
 </div>
 )}

 <form onSubmit={handleEmailPasswordLogin} className="auth-form">
      <FloatingInput
        label="Email address"
        name="email"
        type="email"
        value={formData.email}
        onChange={handleChange}
        onBlur={() => handleBlur("email")}
        disabled={submitting || isLockedOut}
        autoComplete="email"
        hasError={credentialError}
        error={touched.email ? validationErrors.email : null}
        valid={touched.email && fieldValid.email && !credentialError}
      />

      <FloatingInput
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        value={formData.password}
        onChange={handleChange}
        onKeyDown={handlePasswordKey}
        onKeyUp={handlePasswordKey}
        onBlur={() => handleBlur("password")}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text") || "";
          if (/\s/.test(text)) {
            e.preventDefault();
            showNotification("Spaces are not permitted in passwords", "warning", 3000);
          } else if (text.length > NEW_PASSWORD_MAX_LENGTH) {
            e.preventDefault();
            setFormData((prev) => ({ ...prev, password: text.slice(0, NEW_PASSWORD_MAX_LENGTH) }));
            showNotification(`Password input was limited to ${NEW_PASSWORD_MAX_LENGTH} characters`, "warning", 3000);
          }
        }}
        disabled={submitting || isLockedOut}
        autoComplete="current-password"
        maxLength={NEW_PASSWORD_MAX_LENGTH}
        hasError={credentialError}
        error={touched.password ? validationErrors.password : null}
        valid={touched.password && fieldValid.password && !credentialError}
        endAdornment={
          <PasswordVisibilityButton
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
          />
        }
      />

 {capsLockActive && (
 <div
 style={{
 display: "flex",
 alignItems: "center",
 gap: "6px",
 marginTop: "-12px",
 marginBottom: "16px",
 padding: "6px 12px",
 borderRadius: "8px",
 fontSize: "12px",
 color: "#B45309",
 backgroundColor: "#FEF3C7",
 border: "1px solid #FDE68A",
 fontWeight: 500,
 }}
 role="status"
 >
 <AlertTriangle size={13} style={{ color: "#D97706", flexShrink: 0 }} />
 <span>Caps Lock is ON</span>
 </div>
 )}

 <div className="auth-options-row">
 <label className="auth-remember">
 <input
 type="checkbox"
 checked={rememberMe}
 onChange={(e) => setRememberMe(e.target.checked)}
 />
 <span>Remember me</span>
 </label>
 <button
 type="button"
 onClick={() => navigate("/forgot-password")}
 className="auth-forgot-link"
 >
 Forgot password?
 </button>
 </div>

 <button
 type="submit"
 className="auth-btn-primary"
 disabled={submitting || socialLoading || isLockedOut}
 >
 {isLockedOut ? (
 `Locked out (${lockoutCountdown}s)`
 ) : submitting ? (
 <>
 <Loader2 className="w-4 h-4 auth-spinner" />
 Signing in...
 </>
 ) : (
 "Sign in"
 )}
 </button>

     <SocialAuthButtons
       onGoogle={handleGoogleLogin}
       loading={socialLoading}
       onCancel={handleCancelSocialAuth}
       dividerText="Or continue with"
     />
 </form>
 </div>
 </div>
 </div>
 );
}

export default SignIn;
