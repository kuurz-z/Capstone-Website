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

import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  validateEmail,
  getFirebaseErrorMessage,
} from "../../../shared/utils/authValidation";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import SocialAuthButtons from "../../../shared/components/SocialAuthButtons";
import FloatingInput from "../../../shared/components/FloatingInput";
import { Loader2 } from "lucide-react";
import "../../../shared/styles/auth-forms.css";
import "../../public/styles/tenant-signin.css";
import "../../../shared/styles/notification.css";
import hero3 from "../../../assets/images/hero3.jpg";

const SIGNIN_IMAGE = hero3;
  
function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setGlobalLoading } = useAuth();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
  const [debounceTimer, setDebounceTimer] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendCooldownEnd, setResendCooldownEnd] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem("lilycrest_remember_email");
    if (savedEmail) {
      setFormData((prev) => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
      setFieldValid((prev) => ({ ...prev, email: true }));
      setTouched((prev) => ({ ...prev, email: true }));
    }

    // Show notification passed from signup page (e.g. duplicate Google account)
    if (location.state?.notification) {
      showNotification(location.state.notification, "info", 5000);
      // Clear the state so it doesn't re-show on refresh
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Show success banner if redirected from email verification
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "true") {
      setUnverifiedEmail(null);
      setVerifiedSuccess(true);
      // Pre-fill email from registration
      const pendingEmail = localStorage.getItem("lilycrest_pending_email");
      if (pendingEmail) {
        setFormData((prev) => ({ ...prev, email: pendingEmail }));
        setFieldValid((prev) => ({ ...prev, email: true }));
        setTouched((prev) => ({ ...prev, email: true }));
        localStorage.removeItem("lilycrest_pending_email");
        // Auto-focus password field after render
        setTimeout(() => {
          const pw = document.getElementById("password");
          if (pw) pw.focus();
        }, 200);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Lockout countdown timer ────────────────────────────────
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutCountdown(0);
        setFailedAttempts(0);
      } else {
        setLockoutCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // ── Resend cooldown (precise timestamp-based) ─────────────
  useEffect(() => {
    if (!resendCooldownEnd) return;
    const tick = () => {
      const remaining = Math.ceil((resendCooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setResendCooldownEnd(null);
        setResendCooldown(0);
      } else {
        setResendCooldown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [resendCooldownEnd]);

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

  const recordFailedAttempt = () => {
    const next = failedAttempts + 1;
    setFailedAttempts(next);
    if (next >= 5) {
      setLockoutUntil(Date.now() + 60_000);
      showNotification(
        "Too many failed attempts. Please wait 60 seconds.",
        "error",
      );
    }
  };

  // ── Form handling ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setTouched({ ...touched, [name]: true });
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => validateField(name, value), 300));
  };

  const validateField = (fieldName, value) => {
    let error = null;
    if (fieldName === "email") error = validateEmail(value);
    else if (fieldName === "password" && (!value || !value.trim()))
      error = "Password is required";
    setValidationErrors((prev) => ({ ...prev, [fieldName]: error }));
    setFieldValid((prev) => ({ ...prev, [fieldName]: !error }));
  };

  const isFormValid = () => fieldValid.email && fieldValid.password;

  const hasAdminClaims = (tokenResult) =>
    Boolean(tokenResult?.claims?.branch_admin || tokenResult?.claims?.owner);

  const validateForm = () => {
    setTouched({ email: true, password: true });
    validateField("email", formData.email);
    validateField("password", formData.password);

    if (!formData.email.trim() || validateEmail(formData.email)) {
      showNotification(validateEmail(formData.email) || "Email is required", "error");
      setTimeout(() => {
        const el = document.getElementById("email");
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      }, 100);
      return false;
    }
    if (!formData.password.trim()) {
      showNotification("Password is required", "error");
      setTimeout(() => {
        const el = document.getElementById("password");
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      }, 100);
      return false;
    }
    return true;
  };

  // ── Auth handlers ──────────────────────────────────────────
  const handlePostAuthFlow = (loginResponse) => {
    showNotification(`Welcome back, ${loginResponse.user.firstName}!`, "success", 4000);
    if (
      loginResponse.user.role === "branch_admin" ||
      loginResponse.user.role === "owner"
    ) {
      setTimeout(() => navigate("/admin/dashboard"), 800);
    } else {
      setTimeout(() => navigate("/applicant/check-availability"), 800);
    }
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

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      const firebaseUser = userCredential.user;

      // Branch admins and owners bypass email verification checks.
      const tokenResult = await firebaseUser.getIdTokenResult();
      const isAdmin = hasAdminClaims(tokenResult);

      if (!firebaseUser.emailVerified && !isAdmin) {
        // Send a fresh verification email before signing out
        // Guard: prevent RequireNonAdmin from redirecting during brief sign-in
        sessionStorage.setItem("resendInProgress", "1");
        try {
          await sendEmailVerification(firebaseUser, {
            url: `${window.location.origin}/verify-email`,
          });
        } catch (e) {
          console.warn("Could not auto-send verification email:", e.message);
        }
        setUnverifiedEmail(formData.email);
        await auth.signOut();
        sessionStorage.removeItem("resendInProgress");
        showNotification(
          "Please verify your email before logging in. A verification email has been sent.",
          "warning",
          6000,
        );
        setGlobalLoading(false);
        return;
      }

      // Save or clear remembered email
      if (rememberMe) {
        localStorage.setItem("lilycrest_remember_email", formData.email);
      } else {
        localStorage.removeItem("lilycrest_remember_email");
      }

      try {
        const loginResponse = await login();
        const welcomeName = loginResponse.user.firstName || firebaseUser.displayName || "back";
        // Show notification directly — it appends to document.body and survives route transitions
        showNotification(`Welcome back, ${welcomeName}!`, "success", 4000);
        if (
          loginResponse.user.role === "branch_admin" ||
          loginResponse.user.role === "owner"
        ) {
          setTimeout(() => navigate("/admin/dashboard"), 800);
          setGlobalLoading(false);
          return;
        }
        if (!loginResponse.user.branch || loginResponse.user.branch === "") {
          setTimeout(
            () =>
              navigate("/applicant/check-availability", {
                state: { notice: "Please select your branch to continue" },
              }),
            500,
          );
          setGlobalLoading(false);
          return;
        }
        setTimeout(() => navigate("/applicant/check-availability"), 800);
      } catch (backendError) {
        await auth.signOut();
        const isNotRegistered =
          backendError.response?.status === 404 ||
          /not found|not registered|register first/i.test(backendError.message);
        if (isNotRegistered)
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
    } finally {
      setSubmitting(false);
      setGlobalLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setSocialLoading(true);
    setGlobalLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;

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
        handlePostAuthFlow(loginResponse);
      } catch (loginError) {
        // Delete the auto-created Firebase account to keep Firebase ↔ MongoDB in sync
        // signInWithPopup auto-creates a Firebase account; if backend rejects, we must remove it
        try {
          const u = auth.currentUser;
          if (u) await u.delete();
        } catch (delErr) {
          // delete() can fail if account existed before (e.g. email/password user)
          try { await auth.signOut(); } catch (_) { /* ignore */ }
        }

        const status = loginError.response?.status;
        const errMsg = loginError.message || "";

        if (status === 404 || /not found|not registered|register first/i.test(errMsg)) {
          showNotification(
            "This Google account isn't registered yet. Please sign up first.",
            "warning",
          );
        } else if (status === 403) {
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
    } catch (error) {
      if (error.code === "auth/popup-closed-by-user") {
        setGlobalLoading(false);
        showNotification("Sign-in cancelled", "info");
        return;
      }
      if (error.code === "auth/cancelled-popup-request") {
        setGlobalLoading(false);
        return;
      }
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (delErr) {
          try { await auth.signOut(); } catch (_) { /* ignore */ }
        }
      }
      showNotification(getFirebaseErrorMessage(error, "login"), "error");
    } finally {
      setSocialLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleGoogleLogin = () => handleSocialLogin(new GoogleAuthProvider());
  const handleFacebookLogin = () =>
    handleSocialLogin(new FacebookAuthProvider());

  const inputClass = (name) =>
    `w-full px-4 py-4 rounded-xl bg-gray-50 border focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors ${touched[name] ? (fieldValid[name] ? "border-green-500" : "border-red-500") : "border-gray-200 focus:border-gray-300"}`;

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

      <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="lg:hidden inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
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
              Don&apos;t have an account?{" "}
              <Link to="/signup">Sign up</Link>
            </p>
          </div>

          {/* Unverified email banner with resend button */}
          {unverifiedEmail && (
            <div className="verify-banner" role="alert">
              {/* Mail icon */}
              <svg className="verify-banner__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>

              {/* Text */}
              <div className="verify-banner__text">
                <span className="verify-banner__title">Email not verified</span>
                <span className="verify-banner__desc">A link was sent to your email.</span>
              </div>

              {/* Action */}
              <button
                type="button"
                disabled={resending || resendCooldown > 0}
                className="verify-banner__action"
                onClick={async () => {
                  if (!formData.password.trim()) {
                    showNotification(
                      "Please re-enter your password to resend the verification email.",
                      "warning",
                    );
                    setTimeout(() => {
                      const el = document.getElementById("password");
                      if (el) { el.focus(); }
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
                    await sendEmailVerification(cred.user, {
                      url: `${window.location.origin}/verify-email`,
                    });
                    setResendCooldownEnd(Date.now() + 60_000);
                    showNotification(
                      "Verification email sent! Check your inbox.",
                      "success",
                      5000,
                    );
                  } catch (err) {
                    showNotification(
                      err.code === "auth/too-many-requests"
                        ? "Too many requests. Please wait a few minutes."
                        : err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
                        ? "Incorrect password. Please re-enter your password."
                        : "Could not resend. Please try signing in again.",
                      "error",
                    );
                  } finally {
                    try { await auth.signOut(); } catch (_) { /* ignore */ }
                    sessionStorage.removeItem("resendInProgress");
                    setResending(false);
                  }
                }}
              >
                {resending ? (
                  <><Loader2 className="w-3 h-3 auth-spinner" />&nbsp;Sending…</>
                ) : resendCooldown > 0 ? (
                  <span className="verify-banner__timer">{resendCooldown}s</span>
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
              disabled={submitting}
              autoComplete="email"
              error={touched.email ? validationErrors.email : null}
              valid={touched.email && fieldValid.email}
            />

            <FloatingInput
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleChange}
              disabled={submitting}
              autoComplete="current-password"
              error={touched.password ? validationErrors.password : null}
              valid={touched.password && fieldValid.password}
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              }
            />

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
              dividerText="Or continue with"
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
