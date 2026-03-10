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

import { useState, useEffect } from "react";
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
  calculatePasswordStrength,
  sanitizeName,
  generateUsername,
  getFirebaseErrorMessage,
} from "../../../shared/utils/authValidation";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import SocialAuthButtons from "../../../shared/components/SocialAuthButtons";
import TermsModal from "../../tenant/modals/TermsModal";
import "../styles/tenant-signup.css";
import "../../../shared/styles/notification.css";

const SIGNUP_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBkb3JtJTIwcm9vbXxlbnwwfHx8fDE3NzAyNjI4Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080";

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

  // Session lock: Redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (user.role === "admin" || user.role === "superAdmin")
        navigate("/admin/dashboard", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  // ── Form handling ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone" && value && !/^[0-9]*$/.test(value)) return;
    if (name === "phone" && value.length > 11) return;
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
        if (!value.trim()) error = "Phone number is required";
        else if (!/^[0-9]{11}$/.test(value))
          error = "Phone must be exactly 11 digits";
        break;
      case "password":
        if (!value) error = "Password is required";
        else if (value.length < 6)
          error = "Password must be at least 6 characters";
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

    if (!formData.firstName.trim()) {
      showNotification("First name is required", "error");
      return false;
    }
    if (!formData.lastName.trim()) {
      showNotification("Last name is required", "error");
      return false;
    }
    const emailError = validateEmail(formData.email);
    if (emailError) {
      showNotification(emailError, "error");
      return false;
    }
    if (!formData.phone.trim()) {
      showNotification("Phone number is required", "error");
      return false;
    }
    if (!/^[0-9]{1,11}$/.test(formData.phone)) {
      showNotification("Phone number must be 1-11 digits only", "error");
      return false;
    }
    if (!formData.password) {
      showNotification("Password is required", "error");
      return false;
    }
    if (formData.password.length < 6) {
      showNotification("Password must be at least 6 characters", "error");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      showNotification("Passwords do not match", "error");
      return false;
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
          await sendEmailVerification(firebaseUser);
        } catch (emailError) {
          console.error("⚠️ Failed to send verification email:", emailError);
        }
        showNotification(
          "Account created successfully! Please check your email and verify before logging in.",
          "success",
        );
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
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      if (!firebaseUser.email) {
        await auth.signOut();
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
        await auth.signOut();
        showNotification(
          "This email is already registered. Please sign in instead.",
          "info",
        );
        setTimeout(() => navigate("/signin"), 1500);
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
            setTimeout(() => navigate("/check-availability"), 2000);
          } catch (regError) {
            const msg =
              regError.response?.data?.error ||
              regError.response?.data?.code === "USERNAME_TAKEN"
                ? "Username already taken. Please try again."
                : regError.message || "An unexpected error occurred.";
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
            showNotification(msg, "error");
            setLoading(false);
          }
        } else {
          try {
            await auth.signOut();
          } catch (e) {
            /* ignore */
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
          await auth.signOut();
        } catch (e) {
          /* ignore */
        }
      }
      if (error.code !== "auth/cancelled-popup-request")
        showNotification(
          getFirebaseErrorMessage(error, "signup"),
          error.code === "auth/popup-closed-by-user" ? "info" : "error",
        );
    } finally {
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
        style={{ backgroundColor: "#0C375F" }}
      >
        <AuthBrandingPanel
          imageUrl={SIGNUP_IMAGE}
          headline="Start Your Journey<br/>With Us"
          subtitle="Join hundreds of students living their best life"
        />

        <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
          <div className="w-full max-w-md">
            <Link
              to="/"
              className="lg:hidden inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
            >
              <span className="text-sm font-light">← Back to website</span>
            </Link>

            <div className="mb-10">
              <h1
                className="text-4xl font-light mb-3 tracking-tight"
                style={{ color: "#0C375F" }}
              >
                Create an account
              </h1>
              <p className="text-gray-600 font-light">
                Already have an account?{" "}
                <Link
                  to="/signin"
                  className="hover:underline"
                  style={{ color: "#E7710F" }}
                >
                  Log in
                </Link>
              </p>
            </div>

            <form onSubmit={handleSignUp} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="firstName"
                    className="block text-sm font-light text-gray-700 mb-2"
                  >
                    First name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    disabled={loading}
                    className={inputClass("firstName")}
                    placeholder="First name"
                  />
                  {touched.firstName && validationErrors.firstName && (
                    <span className="validation-msg error">
                      {validationErrors.firstName}
                    </span>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="block text-sm font-light text-gray-700 mb-2"
                  >
                    Last name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    disabled={loading}
                    className={inputClass("lastName")}
                    placeholder="Last name"
                  />
                  {touched.lastName && validationErrors.lastName && (
                    <span className="validation-msg error">
                      {validationErrors.lastName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-light text-gray-700 mb-2"
                >
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className={inputClass("email")}
                  placeholder="your.email@example.com"
                />
                {touched.email && validationErrors.email && (
                  <span className="validation-msg error">
                    {validationErrors.email}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-light text-gray-700 mb-2"
                >
                  Phone number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                  inputMode="numeric"
                  maxLength={11}
                  className={inputClass("phone")}
                  placeholder="123-456-7890"
                />
                {touched.phone && validationErrors.phone && (
                  <span className="validation-msg error">
                    {validationErrors.phone}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-light text-gray-700 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    disabled={loading}
                    className={inputClass("password")}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {touched.password && validationErrors.password && (
                  <span className="validation-msg error">
                    {validationErrors.password}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-light text-gray-700 mb-2"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading}
                    className={inputClass("confirmPassword")}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {touched.confirmPassword &&
                  validationErrors.confirmPassword && (
                    <span className="validation-msg error">
                      {validationErrors.confirmPassword}
                    </span>
                  )}
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    disabled={loading}
                    className="w-5 h-5 mt-0.5 rounded border-gray-300 flex-shrink-0"
                    style={{ accentColor: "#E7710F" }}
                  />
                  <span className="text-sm text-gray-600 font-light">
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTermsModal(true);
                      }}
                      className="hover:underline"
                      style={{ color: "#E7710F" }}
                    >
                      Terms & Conditions
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTermsModal(true);
                      }}
                      className="hover:underline"
                      style={{ color: "#E7710F" }}
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-6 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
                style={{ backgroundColor: "#E7710F" }}
                disabled={!isFormValid() || loading}
              >
                {loading ? "Creating Account..." : "Create account"}
              </button>

              <SocialAuthButtons
                onGoogle={handleGoogleSignup}
                onFacebook={handleFacebookSignup}
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
    </>
  );
}

export default SignUp;
