/**
 * =============================================================================
 * SIGN UP PAGE
 * =============================================================================
 *
 * User registration page with:
 * - Email/password registration with email verification
 * - Google and Facebook social authentication
 * - Terms and Conditions modal
 * - Show/Hide password toggle
 * - Duplicate account prevention
 * - Gmail registration doesn't require "Agree to Terms" checkbox
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordVisibilityButton from "../../../shared/components/PasswordVisibilityButton";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { authApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { recoverFromAuthFailure } from "../../../shared/utils/identitySafety";
import {
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  NEW_PASSWORD_MAX_LENGTH,
  sanitizeName,
  formatProperCase,
  generateUsername,
} from "../../../shared/utils/authValidation";
import { getRegistrationErrorMessage } from "../../../shared/utils/registrationErrors";
import {
  AUTH_TOAST_DURATION,
  buildAuthWelcomeMessage,
} from "../../../shared/utils/authToasts";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import SocialAuthButtons from "../../../shared/components/SocialAuthButtons";
import FloatingInput from "../../../shared/components/FloatingInput";
import PhoneInput, {
  isValidPhoneNumber,
} from "../../../shared/components/PhoneInput";
import TermsModal from "../../tenant/modals/TermsModal";
import PrivacyModal from "../../tenant/modals/PrivacyModal";
import "../../../shared/styles/auth-forms.css";
import "../styles/tenant-signup.css";
import "../../../shared/styles/notification.css";
import { AlertTriangle, Loader2 } from "lucide-react";
import hero1 from "../../../assets/images/hero1.jpg";
import { normalizeInternalContinuation } from "../../../shared/utils/emailVerificationFlow";
import {
  createSocialAuthSession,
  isPopupCancellationError,
} from "../../../shared/utils/socialAuthManager";

const SIGNUP_IMAGE = hero1;
const FIELD_LIMITS = {
  firstName: 50,
  lastName: 50,
  email: 254,
  password: NEW_PASSWORD_MAX_LENGTH,
  confirmPassword: NEW_PASSWORD_MAX_LENGTH,
};

function SignUp() {
  const navigate = useNavigate();
  const appNavigate = useAppNavigation();
  const {
    login: loginBackend,
    setGlobalLoading,
    isAuthenticated,
    user,
    loading: authLoading,
  } = useAuth();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsTouched, setTermsTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
  const [capsLockActive, setCapsLockActive] = useState(false);
  const debounceTimersRef = useRef({});
  const socialSessionRef = useRef(null);

  const handleCancelSocialAuth = () => {
    if (socialSessionRef.current) {
      socialSessionRef.current.cancel();
    }
    socialAuthRef.current = false;
    sessionStorage.removeItem("socialAuthInProgress");
    setSocialLoading(false);
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
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    level: "weak",
    requirements: {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false,
    },
  });
  // Guard: prevents session lock from auto-redirecting while social
  // auth duplicate check is in progress
  const socialAuthRef = useRef(false);

  // Session lock: Redirect if already logged in
  useEffect(() => {
    if (socialAuthRef.current) return; // skip while checking duplicate
    if (!authLoading && isAuthenticated && user) {
      if (user.role === "branch_admin" || user.role === "owner")
        navigate("/admin/dashboard", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  // Pure per-field validator shared by blur, real-time recovery, and submit
  const getFieldError = (fieldName, value, customPasswordValue = null) => {
    const activePassword =
      customPasswordValue !== null ? customPasswordValue : formData.password;
    switch (fieldName) {
      case "firstName":
        if (!value || !value.trim()) return "Please enter your first name.";
        if (value.length > FIELD_LIMITS.firstName)
          return `First name must be ${FIELD_LIMITS.firstName} characters or fewer.`;
        return null;
      case "lastName":
        if (!value || !value.trim()) return "Please enter your last name.";
        if (value.length > FIELD_LIMITS.lastName)
          return `Last name must be ${FIELD_LIMITS.lastName} characters or fewer.`;
        return null;
      case "email":
        if (!value || !value.trim()) return "Please enter your email address.";
        if (value.length > FIELD_LIMITS.email)
          return `Email address must be ${FIELD_LIMITS.email} characters or fewer.`;
        return validateEmail(value);
      case "phone":
        if (!value || !value.trim()) return "Please enter your phone number.";
        if (value.startsWith("+63") && !isValidPhoneNumber(value.trim()))
          return "Please enter a complete 10-digit mobile number (e.g., 917 123 4567).";
        if (!value.startsWith("+") || !isValidPhoneNumber(value.trim()))
          return "Enter a valid phone number, including the country code.";
        return null;
      case "password":
        if (!value) return "Please enter a password.";
        if (value.length > FIELD_LIMITS.password)
          return `Password must be ${FIELD_LIMITS.password} characters or fewer.`;
        if (/\s/.test(value)) return "Your password cannot contain spaces.";
        return validatePassword(value);
      case "confirmPassword":
        if (!value) return "Please confirm your password.";
        if (/\s/.test(value)) return "Your password cannot contain whitespace.";
        if (value.length > FIELD_LIMITS.confirmPassword)
          return `Confirm password must be ${FIELD_LIMITS.confirmPassword} characters or fewer.`;
        if (value !== activePassword)
          return "The passwords you entered do not match.";
        return null;
      default:
        return null;
    }
  };

  const validateField = (fieldName, value) => {
    const error = getFieldError(fieldName, value);
    setValidationErrors((prev) => ({ ...prev, [fieldName]: error }));
    setFieldValid((prev) => ({ ...prev, [fieldName]: !error }));
    if (fieldName === "password" && formData.confirmPassword) {
      const confirmErr = getFieldError(
        "confirmPassword",
        formData.confirmPassword,
        value,
      );
      setValidationErrors((prev) => ({
        ...prev,
        confirmPassword: confirmErr,
      }));
      setFieldValid((prev) => ({ ...prev, confirmPassword: !confirmErr }));
    }
  };

  // ── Form handling ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    const sanitizedValue =
      name === "firstName" || name === "lastName"
        ? sanitizeName(value)
        : name === "password" || name === "confirmPassword"
          ? value.replace(/\s/g, "")
          : value;
    const limit = FIELD_LIMITS[name];
    const nextValue = limit ? sanitizedValue.slice(0, limit) : sanitizedValue;
    
    // Immediate state update for responsive typing latency
    setFormData((prev) => ({ ...prev, [name]: nextValue }));

    // Debounce validation calculations so floating label animations remain at 60fps
    if (debounceTimersRef.current[name]) {
      clearTimeout(debounceTimersRef.current[name]);
    }

    debounceTimersRef.current[name] = setTimeout(() => {
      if (name === "password") {
        setPasswordStrength(calculatePasswordStrength(nextValue));
      }

      if (touched[name]) {
        const error = getFieldError(name, nextValue);
        setValidationErrors((prev) => ({ ...prev, [name]: error }));
        setFieldValid((prev) => ({ ...prev, [name]: !error }));
        if (name === "password" && formData.confirmPassword) {
          const confirmErr = getFieldError(
            "confirmPassword",
            formData.confirmPassword,
            nextValue,
          );
          setValidationErrors((prev) => ({
            ...prev,
            confirmPassword: confirmErr,
          }));
          setFieldValid((prev) => ({ ...prev, confirmPassword: !confirmErr }));
        }
      } else {
        const error = getFieldError(name, nextValue);
        setFieldValid((prev) => ({ ...prev, [name]: !error }));
      }
    }, 250);
  };

  const handleBlur = (fieldName) => {
    if (debounceTimersRef.current[fieldName]) {
      clearTimeout(debounceTimersRef.current[fieldName]);
    }
    const val = formData[fieldName];
    if ((fieldName === "firstName" || fieldName === "lastName") && val && typeof val === "string") {
      const proper = formatProperCase(val.trim());
      if (proper !== val) {
        setFormData((prev) => ({ ...prev, [fieldName]: proper }));
      }
    }
    // Only display format errors on blur if the user actually typed a value
    // Empty/required field errors are reserved for when the user clicks submit
    if (val && val.trim()) {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      const error = getFieldError(fieldName, val);
      setValidationErrors((prev) => ({ ...prev, [fieldName]: error }));
      setFieldValid((prev) => ({ ...prev, [fieldName]: !error }));
    }
    if (fieldName === "password" || fieldName === "confirmPassword") {
      setCapsLockActive(false);
    }
  };

  // Called directly by PhoneInput with the E.164 value
  const handlePhoneChange = (e164) => {
    setFormData((prev) => ({ ...prev, phone: e164 }));
    
    if (debounceTimersRef.current.phone) {
      clearTimeout(debounceTimersRef.current.phone);
    }

    debounceTimersRef.current.phone = setTimeout(() => {
      const isValid = e164 && e164.startsWith("+") && isValidPhoneNumber(e164);
      setFieldValid((prev) => ({ ...prev, phone: isValid }));

      if (touched.phone) {
        const error = getFieldError("phone", e164);
        setValidationErrors((prev) => ({ ...prev, phone: error }));
      }
    }, 250);
  };

  const handlePhoneBlur = () => {
    if (debounceTimersRef.current.phone) {
      clearTimeout(debounceTimersRef.current.phone);
    }
    const val = formData.phone;
    if (val && val.trim() && val !== "+63") {
      setTouched((prev) => ({ ...prev, phone: true }));
      const error = getFieldError("phone", val);
      setValidationErrors((prev) => ({ ...prev, phone: error }));
      setFieldValid((prev) => ({ ...prev, phone: !error }));
    }
  };

  const isFormValid = () =>
    [
      "firstName",
      "lastName",
      "email",
      "phone",
      "password",
      "confirmPassword",
    ].every((f) => fieldValid[f]) && agreedToTerms;

  const FORM_FIELD_ORDER = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "password",
    "confirmPassword",
  ];

  // Validates every field at once, shows each error next to its own field
  // (never as a duplicate toast), and focuses the first invalid field.
  const validateForm = () => {
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    });

    const errors = {};
    FORM_FIELD_ORDER.forEach((field) => {
      errors[field] = getFieldError(field, formData[field]);
    });
    setValidationErrors((prev) => ({ ...prev, ...errors }));
    setFieldValid((prev) => {
      const next = { ...prev };
      FORM_FIELD_ORDER.forEach((field) => {
        next[field] = !errors[field];
      });
      return next;
    });

    const firstInvalidField = FORM_FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalidField) {
      setTimeout(() => {
        const el = document.getElementById(firstInvalidField);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 100);
      return false;
    }

    if (!agreedToTerms) {
      setTermsTouched(true);
      setTimeout(() => {
        const el = document.getElementById("agreedToTerms");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 100);
      return false;
    }
    return true;
  };

  // ── Registration handlers ──────────────────────────────────
  const registerUserInBackend = async (
    firebaseUser,
    phone,
    firstName,
    lastName,
  ) => {
    let lastCollision = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await authApi.register({
          email: firebaseUser.email,
          username: generateUsername(firebaseUser.email, attempt),
          firstName: sanitizeName(firstName).trim(),
          lastName: sanitizeName(lastName).trim(),
          phone,
        });
      } catch (error) {
        const code = error?.code || error?.response?.data?.code;
        if (code !== "USERNAME_TAKEN") throw error;
        lastCollision = error;
      }
    }
    throw lastCollision || new Error("Unable to allocate a registration username.");
  };

  const completePasswordOnboarding = async (firebaseUser) => {
    const phoneToSave = (formData.phone || "").trim();
    const response = await registerUserInBackend(
      firebaseUser,
      phoneToSave,
      formData.firstName,
      formData.lastName,
    );

    sessionStorage.removeItem("lilycrest_pending_email");
    localStorage.removeItem("lilycrest_pending_email");
    sessionStorage.setItem("lilycrest_pending_verification_email", formData.email);

    if (firebaseUser.emailVerified || response?.user?.isEmailVerified) {
      await auth.signOut();
      sessionStorage.removeItem("lilycrest_pending_verification_email");
      appNavigate("/signin", {
        replace: true,
        state: { email: formData.email },
        flash: { type: "info", message: "Registration is already complete. Please sign in." },
      });
      return response;
    }

    const requestedContinuation = new URLSearchParams(window.location.search).get("continue");
    const continuePath = normalizeInternalContinuation(requestedContinuation);
    try {
      await authApi.sendEmailVerification(continuePath);
      navigate("/auth-action?state=sent", { replace: true, state: { email: formData.email } });
    } catch (deliveryError) {
      if (deliveryError.response?.data?.state === "VERIFICATION_EMAIL_SEND_FAILED") {
        showNotification(
          "Account created successfully. Our verification email service is temporarily unavailable; you can request a new link once ready.",
          "warning",
          7000,
        );
        navigate("/auth-action?state=send-failed", { replace: true });
      } else {
        await auth.signOut();
        appNavigate("/signin", {
          replace: true,
          state: { email: formData.email },
          flash: {
            type: "warning",
            message: "Account created successfully. Please sign in to request a new email verification link.",
          },
        });
      }
    }
    return response;
  };

  const redirectExistingAccountToSignIn = async (isGoogle = false) => {
    await authApi.logout().catch(() => auth.signOut().catch(() => {}));
    appNavigate("/signin", {
      replace: true,
      state: { email: formData.email },
      flash: {
        type: "info",
        message: isGoogle
          ? "An account with this email already exists via Google. Please sign in with Google."
          : "An account already exists with this email address. Please sign in instead.",
      },
    });
  };

  // Firebase already has an account for this email. Using only the password
  // the person just typed on this form (never stored, never a separate
  // step), work out whether it's theirs:
  //  - wrong password           -> someone else's account; go to sign in
  //  - right password + profile -> their account is complete; go to sign in
  //  - right password, no profile -> their own signup was interrupted
  //    before it finished (e.g. the tab closed after the Firebase account
  //    was created but before registration completed); finish it now,
  //    the same way a normal signup finishes. No dedicated recovery
  //    button or extra screen is ever shown — from the user's side this
  //    just looks like clicking "Create account" worked.
  const reconcileExistingFirebaseIdentity = async () => {
    let credential;
    try {
      credential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
    } catch (signInError) {
      if (
        signInError?.code === "auth/wrong-password" ||
        signInError?.code === "auth/invalid-credential"
      ) {
        let isGoogle = false;
        try {
          const methods = await fetchSignInMethodsForEmail(auth, formData.email);
          isGoogle = Array.isArray(methods) && methods.includes("google.com");
        } catch {
          // fallback
        }
        await redirectExistingAccountToSignIn(isGoogle);
        return;
      }
      showNotification(getRegistrationErrorMessage(signInError, "signup"), "error");
      return;
    }

    try {
      await authApi.checkUser();
      // A backend profile already exists for this identity — it's a
      // genuinely complete, existing account.
      let isGoogle = false;
      try {
        const methods = await fetchSignInMethodsForEmail(auth, formData.email);
        isGoogle = Array.isArray(methods) && methods.includes("google.com");
      } catch {
        // fallback
      }
      await redirectExistingAccountToSignIn(isGoogle);
    } catch (checkError) {
      const code = checkError.response?.data?.code;
      if (code === "USER_NOT_FOUND") {
        try {
          await completePasswordOnboarding(credential.user);
        } catch (backendError) {
          await recoverFromAuthFailure(auth, backendError);
          showNotification(getRegistrationErrorMessage(backendError, "signup"), "error");
        }
        return;
      }
      await recoverFromAuthFailure(auth, checkError);
      if (code === "IDENTITY_CONFLICT") {
        await redirectExistingAccountToSignIn(true);
        return;
      }
      showNotification(getRegistrationErrorMessage(checkError, "signup"), "error");
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    let firebaseUser = null;
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      firebaseUser = userCredential.user;
      try {
        await completePasswordOnboarding(firebaseUser);
      } catch (backendError) {
        await recoverFromAuthFailure(auth, backendError);
        throw backendError;
      }
    } catch (error) {
      if (error?.code === "auth/email-already-in-use") {
        await reconcileExistingFirebaseIdentity();
        return;
      }
      showNotification(getRegistrationErrorMessage(error, "signup"), "error");
    } finally {
      setLoading(false);
    }
  };

  const processSocialSignupUser = async (firebaseUser) => {
    if (!firebaseUser.email) {
      await recoverFromAuthFailure(auth);
      socialAuthRef.current = false;
      showNotification(
        "We could not get your email address from Google. Please try again or use a different sign-in method.",
        "error",
      );
      setSocialLoading(false);
      return;
    }
    try {
      await authApi.checkUser();
      // User already exists — perform full logout (both Firebase and backend session)
      // and redirect to sign-in with prefilled email
      await authApi.logout().catch(() => auth.signOut().catch(() => {}));
      socialAuthRef.current = false;
      sessionStorage.removeItem("socialAuthInProgress");
      appNavigate("/signin", {
        state: { email: firebaseUser.email },
        flash: {
          type: "info",
          message:
            "An account with this email already exists. Please sign in with Google or your password to continue.",
        },
        replace: true,
      });
      setSocialLoading(false);
      return;
    } catch (loginError) {
      if (loginError.response?.status === 404) {
        try {
          const rawName = (firebaseUser.displayName || "")
            .replace(/[^a-zA-Z\s'-]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const parts = rawName.split(" ");
          const firstName = formatProperCase(parts[0] || "User");
          const lastName = formatProperCase(parts.slice(1).join(" ") || "Guest");
          const registration = await registerUserInBackend(
            firebaseUser,
            "",
            firstName,
            lastName,
          );
          const username = registration?.user?.username;
          await loginBackend();
          showNotification(
            buildAuthWelcomeMessage(
              {
                displayName: firebaseUser.displayName,
                username,
                email: firebaseUser.email,
              },
              firstName,
            ),
            "success",
            AUTH_TOAST_DURATION,
          );
          appNavigate("/applicant/check-availability");
        } catch (regError) {
          const errMsg =
            regError.response?.data?.message || regError.message || "";
          const errCode = regError.response?.data?.code || regError.code || "";

          if (errCode === "IDENTITY_CONFLICT") {
            await recoverFromAuthFailure(auth, regError);
            showNotification(
              "This account requires identity verification before it can be linked. Please use your original sign-in method or contact support.",
              "warning",
              7000,
            );
            return;
          }

          // If the error is about duplicate email/username, redirect to sign-in
          if (
            errCode === "USERNAME_TAKEN" ||
            errCode === "EMAIL_TAKEN" ||
            errMsg.includes("already") ||
            errMsg.includes("duplicate")
          ) {
            await authApi.logout().catch(() => auth.signOut().catch(() => {}));
            socialAuthRef.current = false;
            sessionStorage.removeItem("socialAuthInProgress");
            appNavigate("/signin", {
              state: { email: firebaseUser.email },
              flash: {
                type: "info",
                message:
                  "An account with this email already exists. Please sign in with Google or your password to continue.",
              },
              replace: true,
            });
            setSocialLoading(false);
            return;
          }

          // Preserve the Firebase identity; onboarding can be retried safely.
          await recoverFromAuthFailure(auth, regError);
          showNotification(getRegistrationErrorMessage(regError, "signup"), "error");
          setSocialLoading(false);
        }
      } else {
        await recoverFromAuthFailure(auth, loginError);
        if (loginError.response?.data?.code === "IDENTITY_CONFLICT") {
          showNotification(
            "This account requires identity verification before it can be linked. Please use your original sign-in method or contact support.",
            "warning",
            7000,
          );
          return;
        }
        showNotification(
          "An error occurred while checking your account. Please try again.",
          "error",
        );
        setSocialLoading(false);
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
          socialAuthRef.current = true;
          sessionStorage.setItem("socialAuthInProgress", "1");
          await processSocialSignupUser(result.user);
        }
      } catch (error) {
        if (isMounted) {
          await recoverFromAuthFailure(auth, error);
          showNotification(getRegistrationErrorMessage(error, "signup"), "error");
        }
      } finally {
        if (isMounted) {
          socialAuthRef.current = false;
          sessionStorage.removeItem("socialAuthInProgress");
          setSocialLoading(false);
        }
      }
    };
    checkRedirect();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSocialSignup = async (provider, providerName = "Google") => {
    setSocialLoading(true);
    socialAuthRef.current = true;
    sessionStorage.setItem("socialAuthInProgress", "1"); // tell RequireNonAdmin to skip redirect

    if (!socialSessionRef.current) {
      socialSessionRef.current = createSocialAuthSession();
    }

    try {
      const result = await socialSessionRef.current.start({
        auth,
        provider,
        signInFn: (a, p) => signInWithPopup(a, p),
        onCancel: () => {
          socialAuthRef.current = false;
          sessionStorage.removeItem("socialAuthInProgress");
          setSocialLoading(false);
          showNotification("Sign-up was cancelled.", "info", 3000);
        },
      });

      if (result?.user) {
        await processSocialSignupUser(result.user);
      }
    } catch (error) {
      if (error.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          await recoverFromAuthFailure(auth, redirectError);
          showNotification(getRegistrationErrorMessage(redirectError, "signup"), "error");
        }
      }
      if (isPopupCancellationError(error)) {
        socialAuthRef.current = false;
        sessionStorage.removeItem("socialAuthInProgress");
        setSocialLoading(false);
        showNotification("Sign-up was cancelled.", "info", 3000);
        return;
      }
      await recoverFromAuthFailure(auth, error);
      showNotification(
        getRegistrationErrorMessage(error, "signup"),
        "error",
      );
    } finally {
      socialAuthRef.current = false;
      sessionStorage.removeItem("socialAuthInProgress");
      setSocialLoading(false);
    }
  };



  const handleGoogleSignup = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    handleSocialSignup(provider, "Google");
  };
  const handleFacebookSignup = () =>
    handleSocialSignup(new FacebookAuthProvider(), "Facebook");

  // ── Field renderer helper ──────────────────────────────────
  const inputClass = (name) =>
    `w-full px-4 py-4 rounded-xl bg-gray-50 border focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors ${touched[name] ? (fieldValid[name] ? "border-green-500" : "border-red-500") : "border-gray-200 focus:border-gray-300"}`;

  return (
    <>
      <div
        className="min-h-screen grid lg:grid-cols-2"
        style={{ backgroundColor: "#0A1628" }}
      >
        <AuthBrandingPanel
          imageUrl={SIGNUP_IMAGE}
          headline="Start Your Journey<br/>With Us"
          subtitle="Join a vibrant community and discover your perfect space today."
        />

        <div className="flex items-center justify-center p-8 lg:p-12 bg-white overflow-y-auto">
          <div className="w-full max-w-md my-auto">
            <Link
              to="/"
              className="lg:hidden inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
            >
              <span className="text-sm font-light">← Back to website</span>
            </Link>

            <div className="auth-header">
              <h1 className="auth-header__title">Create an account</h1>
              <p className="auth-header__subtitle">
                Already have an account? <Link to="/signin">Log in</Link>
              </p>
            </div>

            <form onSubmit={handleSignUp} className="auth-form">
              <div className="form-row">
                <FloatingInput
                  label="First name"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  onBlur={() => handleBlur("firstName")}
                  maxLength={FIELD_LIMITS.firstName}
                  disabled={loading}
                  error={touched.firstName ? validationErrors.firstName : null}
                  valid={touched.firstName && fieldValid.firstName}
                />
                <FloatingInput
                  label="Last name"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  onBlur={() => handleBlur("lastName")}
                  maxLength={FIELD_LIMITS.lastName}
                  disabled={loading}
                  error={touched.lastName ? validationErrors.lastName : null}
                  valid={touched.lastName && fieldValid.lastName}
                />
              </div>

              <FloatingInput
                label="Email address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={() => handleBlur("email")}
                maxLength={FIELD_LIMITS.email}
                disabled={loading}
                autoComplete="email"
                error={touched.email ? validationErrors.email : null}
                valid={touched.email && fieldValid.email}
              />

              <PhoneInput
                authStyle
                label="Phone number"
                value={formData.phone}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
                hasError={touched.phone && !fieldValid.phone}
                valid={touched.phone && fieldValid.phone}
                error={touched.phone ? validationErrors.phone : null}
                required
              />

              <div>
                <FloatingInput
                  label="Password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  onKeyDown={handlePasswordKey}
                  onKeyUp={handlePasswordKey}
                  onBlur={() => handleBlur("password")}
                  maxLength={FIELD_LIMITS.password}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text") || "";
                    if (/\s/.test(text)) {
                      e.preventDefault();
                      showNotification("Spaces are not permitted in passwords", "warning", 3000);
                    } else if (text.length > FIELD_LIMITS.password) {
                      e.preventDefault();
                      setFormData((prev) => ({ ...prev, password: text.slice(0, FIELD_LIMITS.password) }));
                      showNotification(`Password input was limited to ${FIELD_LIMITS.password} characters`, "warning", 3000);
                    }
                  }}
                  disabled={loading}
                  error={touched.password ? validationErrors.password : null}
                  valid={touched.password && fieldValid.password}
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
                      marginTop: "6px",
                      marginBottom: "4px",
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

                {/* Password strength indicator */}
                {formData.password.length > 0 && (
                  <div className="password-strength">
                    <div className="password-strength__bar-wrap">
                      <span className="password-strength__label">Strength</span>
                      <span
                        className="password-strength__level"
                        style={{
                          color:
                            passwordStrength.score >= 100
                              ? "#10B981"
                              : passwordStrength.score >= 60
                                ? "#F59E0B"
                                : "#EF4444",
                        }}
                      >
                        {passwordStrength.level}
                      </span>
                    </div>
                    <div className="password-strength__track">
                      <div
                        className="password-strength__fill"
                        style={{
                          width: `${passwordStrength.score}%`,
                          backgroundColor:
                            passwordStrength.score >= 100
                              ? "#10B981"
                              : passwordStrength.score >= 60
                                ? "#F59E0B"
                                : "#EF4444",
                        }}
                      />
                    </div>
                    <div className="password-strength__checks">
                      {[
                        { key: "length", label: "8+ characters" },
                        { key: "uppercase", label: "Uppercase" },
                        { key: "lowercase", label: "Lowercase" },
                        { key: "number", label: "Number" },
                        { key: "special", label: "Special char" },
                      ].map(({ key, label }) => (
                        <div
                          key={key}
                          className="password-strength__check"
                          style={{
                            color: passwordStrength.requirements[key]
                              ? "#10B981"
                              : "#9CA3AF",
                          }}
                        >
                          <span
                            className="password-strength__dot"
                            style={{
                              backgroundColor: passwordStrength.requirements[
                                key
                              ]
                                ? "#10B981"
                                : "transparent",
                              color: passwordStrength.requirements[key]
                                ? "white"
                                : "#D1D5DB",
                              border: passwordStrength.requirements[key]
                                ? "none"
                                : "1.5px solid #D1D5DB",
                            }}
                          >
                            {passwordStrength.requirements[key] ? "✓" : ""}
                          </span>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <FloatingInput
                label="Confirm password"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={handleChange}
                onKeyDown={handlePasswordKey}
                onKeyUp={handlePasswordKey}
                onBlur={() => handleBlur("confirmPassword")}
                maxLength={FIELD_LIMITS.confirmPassword}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text") || "";
                  if (/\s/.test(text)) {
                    e.preventDefault();
                    showNotification("Spaces are not permitted in passwords", "warning", 3000);
                  } else if (text.length > FIELD_LIMITS.confirmPassword) {
                    e.preventDefault();
                    setFormData((prev) => ({ ...prev, confirmPassword: text.slice(0, FIELD_LIMITS.confirmPassword) }));
                    showNotification(`Password input was limited to ${FIELD_LIMITS.confirmPassword} characters`, "warning", 3000);
                  }
                }}
                disabled={loading}
                error={
                  touched.confirmPassword
                    ? validationErrors.confirmPassword
                    : null
                }
                valid={touched.confirmPassword && fieldValid.confirmPassword}
                endAdornment={
                  <PasswordVisibilityButton
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((current) => !current)}
                  />
                }
              />

              <label className="auth-terms">
                <input
                  id="agreedToTerms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (e.target.checked) setTermsTouched(false);
                  }}
                  disabled={loading}
                  aria-invalid={termsTouched && !agreedToTerms}
                  aria-describedby={
                    termsTouched && !agreedToTerms ? "terms-error" : undefined
                  }
                />
                <span>
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTermsModal(true); // opens T&C modal
                    }}
                  >
                    Terms & Conditions
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPrivacy(true); // opens Privacy Policy modal
                    }}
                  >
                    Privacy Policy
                  </button>
                </span>
              </label>
              {termsTouched && !agreedToTerms && (
                <span
                  id="terms-error"
                  className="floating-field__error"
                  role="alert"
                >
                  Please agree to the Terms and Conditions and Privacy Policy to continue.
                </span>
              )}

              <button
                type="submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="auth-spinner" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <SocialAuthButtons
                onGoogle={handleGoogleSignup}
                loading={socialLoading}
                onCancel={handleCancelSocialAuth}
                cancelText="Cancel sign-up"
                dividerText="Or register with"
              />


            </form>
          </div>
        </div>
      </div>

      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />

      <PrivacyModal
        isOpen={showPrivacy}
        onClose={() => setShowPrivacy(false)}
      />

    </>
  );
}

export default SignUp;
