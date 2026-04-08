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
import { Eye, EyeOff } from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { authApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  sanitizeName,
  generateUsername,
  getFirebaseErrorMessage,
} from "../../../shared/utils/authValidation";
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
import hero1 from "../../../assets/images/hero1.jpg";

const SIGNUP_IMAGE = hero1;

function SignUp() {
  const navigate = useNavigate();
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
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
  const [debounceTimer, setDebounceTimer] = useState(null);
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

  // ── Form handling ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    // phone is now handled separately by PhoneInput — skip old guards
    const sanitizedValue =
      name === "firstName" || name === "lastName" ? sanitizeName(value) : value;
    setFormData({ ...formData, [name]: sanitizedValue });
    setTouched({ ...touched, [name]: true });
    if (debounceTimer) clearTimeout(debounceTimer);
    if (name === "password")
      setPasswordStrength(calculatePasswordStrength(value));
    const timer = setTimeout(() => validateField(name, value), 300);
    setDebounceTimer(timer);
  };

  // Called directly by PhoneInput with the E.164 value
  const handlePhoneChange = (e164) => {
    setFormData((prev) => ({ ...prev, phone: e164 }));
    setTouched((prev) => ({ ...prev, phone: true }));
    // Use libphonenumber-js for accurate per-country validation
    const isValid = e164 && e164.startsWith("+") && isValidPhoneNumber(e164);
    const error = isValid ? null : "Enter a valid phone number";
    setValidationErrors((prev) => ({ ...prev, phone: error }));
    setFieldValid((prev) => ({ ...prev, phone: isValid }));
  };

  const validateField = (fieldName, value) => {
    let error = null;
    switch (fieldName) {
      case "firstName":
        if (!value.trim()) error = "First name is required";
        break;
      case "lastName":
        if (!value.trim()) error = "Last name is required";
        break;
      case "email":
        error = validateEmail(value);
        break;
      case "phone":
        if (!value || !value.trim()) {
          error = "Phone number is required";
        } else if (
          !value.startsWith("+") ||
          !isValidPhoneNumber(value.trim())
        ) {
          error = "Enter a valid phone number";
        }
        break;
      case "password":
        error = validatePassword(value);
        if (formData.confirmPassword)
          validateField("confirmPassword", formData.confirmPassword);
        break;
      case "confirmPassword":
        if (!value) error = "Please confirm your password";
        else if (value !== formData.password) error = "Passwords do not match";
        break;
      default:
        break;
    }
    setValidationErrors((prev) => ({ ...prev, [fieldName]: error }));
    setFieldValid((prev) => ({ ...prev, [fieldName]: !error }));
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

  const validateForm = () => {
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    });
    [
      "firstName",
      "lastName",
      "email",
      "phone",
      "password",
      "confirmPassword",
    ].forEach((f) => validateField(f, formData[f]));

    // Find the first field with an error and scroll to it
    const scrollToField = (fieldName, message) => {
      showNotification(message, "error");
      setTimeout(() => {
        const el = document.getElementById(fieldName);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 100);
      return false;
    };

    if (!formData.firstName.trim()) {
      return scrollToField("firstName", "First name is required");
    }
    if (!formData.lastName.trim()) {
      return scrollToField("lastName", "Last name is required");
    }
    const emailError = validateEmail(formData.email);
    if (emailError) {
      return scrollToField("email", emailError);
    }
    if (!formData.phone || !formData.phone.trim()) {
      return scrollToField("phone", "Phone number is required");
    }
    if (!/^\+\d{7,15}$/.test(formData.phone.trim())) {
      return scrollToField(
        "phone",
        "Enter a valid phone number with country code",
      );
    }
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      return scrollToField("password", passwordError);
    }
    if (formData.password !== formData.confirmPassword) {
      return scrollToField("confirmPassword", "Passwords do not match");
    }
    if (!agreedToTerms) {
      showNotification("Please agree to Terms and Conditions", "error");
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
    try {
      const token = await firebaseUser.getIdToken();
      const username = generateUsername(firebaseUser.email);
      const response = await authApi.register(
        {
          email: firebaseUser.email,
          username,
          firstName: sanitizeName(firstName).trim(),
          lastName: sanitizeName(lastName).trim(),
          phone,
        },
        token,
      );
      localStorage.setItem("authToken", token);
      localStorage.setItem("user", JSON.stringify(response.user));
      return response.user;
    } catch (error) {
      console.error("❌ Backend registration error:", error);
      throw error;
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
        await registerUserInBackend(
          firebaseUser,
          formData.phone,
          formData.firstName,
          formData.lastName,
        );
        try {
          const actionCodeSettings = {
            url: `${window.location.origin}/verify-email`,
          };
          await sendEmailVerification(firebaseUser, actionCodeSettings);
        } catch (emailError) {
          console.error("⚠️ Failed to send verification email:", emailError);
          showNotification(
            "Account created, but we couldn't send the verification email. You can request a new one from the sign-in page.",
            "warning",
            6000,
          );
        }
        showNotification(
          "Account created! Please check your email and verify before logging in.",
          "success",
          6000,
        );
        // Save email so sign-in page can pre-fill it after verification
        localStorage.setItem("lilycrest_pending_email", formData.email);
        await auth.signOut();
        setTimeout(() => {
          setGlobalLoading(true);
          navigate("/signin");
        }, 2500);
      } catch (backendError) {
        if (firebaseUser) await firebaseUser.delete();
        throw backendError;
      }
    } catch (error) {
      showNotification(getFirebaseErrorMessage(error, "signup"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignup = async (provider, providerName = "Google") => {
    setLoading(true);
    socialAuthRef.current = true;
    sessionStorage.setItem("socialAuthInProgress", "1"); // tell RequireNonAdmin to skip redirect
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      if (!firebaseUser.email) {
        try {
          await firebaseUser.delete();
        } catch (_) {
          try {
            await auth.signOut();
          } catch (_2) {
            /* ignore */
          }
        }
        socialAuthRef.current = false;
        showNotification(
          "Unable to get email from your Google account.",
          "error",
        );
        setLoading(false);
        return;
      }
      const token = await firebaseUser.getIdToken();
      try {
        await authApi.checkUser(token);
        // User already exists — sign out and redirect to sign-in
        await auth.signOut();
        socialAuthRef.current = false;
        navigate("/signin", {
          state: {
            notification:
              "This email is already registered. Please sign in instead.",
          },
          replace: true,
        });
        setLoading(false);
        return;
      } catch (loginError) {
        if (loginError.response?.status === 404) {
          try {
            const rawName = (firebaseUser.displayName || "")
              .replace(/[^a-zA-Z\s'-]/g, "")
              .replace(/\s+/g, " ")
              .trim();
            const parts = rawName.split(" ");
            const firstName = parts[0] || "User";
            const lastName = parts.slice(1).join(" ") || "Guest";
            const username = generateUsername(firebaseUser.email);
            await authApi.register(
              {
                email: firebaseUser.email,
                username,
                firstName,
                lastName,
                phone: "",
              },
              token,
            );
            try {
              await loginBackend();
            } catch (e) {
              /* proceed anyway */
            }
            showNotification(`Welcome to Lilycrest, ${firstName}!`, "success");
            setTimeout(() => navigate("/applicant/check-availability"), 2000);
          } catch (regError) {
            const errMsg =
              regError.response?.data?.error || regError.message || "";
            const errCode = regError.response?.data?.code || "";

            // If the error is about duplicate email/username, redirect to sign-in
            if (
              errCode === "USERNAME_TAKEN" ||
              errCode === "EMAIL_TAKEN" ||
              errMsg.includes("already") ||
              errMsg.includes("duplicate")
            ) {
              await auth.signOut();
              socialAuthRef.current = false;
              navigate("/signin", {
                state: {
                  notification:
                    "This email is already registered. Please sign in instead.",
                },
                replace: true,
              });
              setLoading(false);
              return;
            }

            // Other registration errors — clean up and show message
            try {
              const u = auth.currentUser;
              if (u) await u.delete();
            } catch (e) {
              try {
                await auth.signOut();
              } catch (e2) {
                /* ignore */
              }
            }
            showNotification(
              errMsg || "An unexpected error occurred.",
              "error",
            );
            setLoading(false);
          }
        } else {
          // Non-404 error — delete the auto-created Firebase account to stay in sync
          try {
            const u = auth.currentUser;
            if (u) await u.delete();
          } catch (delErr) {
            try {
              await auth.signOut();
            } catch (_) {
              /* ignore */
            }
          }
          showNotification(
            "An error occurred while checking your account. Please try again.",
            "error",
          );
          setLoading(false);
        }
      }
    } catch (error) {
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (delErr) {
          try {
            await auth.signOut();
          } catch (_) {
            /* ignore */
          }
        }
      }
      if (error.code !== "auth/cancelled-popup-request")
        showNotification(
          getFirebaseErrorMessage(error, "signup"),
          error.code === "auth/popup-closed-by-user" ? "info" : "error",
        );
    } finally {
      socialAuthRef.current = false;
      sessionStorage.removeItem("socialAuthInProgress");
      setLoading(false);
    }
  };

  const handleGoogleSignup = () =>
    handleSocialSignup(new GoogleAuthProvider(), "Google");
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
          <div className="w-full max-w-md">
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
                  disabled={loading}
                  error={touched.firstName ? validationErrors.firstName : null}
                  valid={touched.firstName && fieldValid.firstName}
                />
                <FloatingInput
                  label="Last name"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
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
                  disabled={loading}
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
                disabled={loading}
                error={
                  touched.confirmPassword
                    ? validationErrors.confirmPassword
                    : null
                }
                valid={touched.confirmPassword && fieldValid.confirmPassword}
                endAdornment={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                }
              />

              <label className="auth-terms">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  disabled={loading}
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

              <button
                type="submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Create account"}
              </button>

              <SocialAuthButtons
                onGoogle={handleGoogleSignup}
                loading={loading}
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
