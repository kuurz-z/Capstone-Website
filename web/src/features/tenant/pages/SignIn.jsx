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

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
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
import "../../public/styles/tenant-signin.css";
import "../../../shared/styles/notification.css";

const SIGNIN_IMAGE =
  "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBkb3JtJTIwcm9vbXxlbnwwfHx8fDE3NzAyNjI4Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080";

function SignIn() {
  const navigate = useNavigate();
  const { login, setGlobalLoading } = useAuth();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
  const [debounceTimer, setDebounceTimer] = useState(null);

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

  // ── Auth handlers ──────────────────────────────────────────
  const handlePostAuthFlow = (loginResponse) => {
    showNotification(`Welcome, ${loginResponse.user.firstName}!`, "success");
    if (
      loginResponse.user.role === "admin" ||
      loginResponse.user.role === "superAdmin"
    ) {
      setTimeout(() => navigate("/admin/dashboard"), 800);
    } else {
      setTimeout(() => navigate("/applicant/check-availability"), 800);
    }
  };

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setGlobalLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      const firebaseUser = userCredential.user;

      if (!firebaseUser.emailVerified && import.meta.env.PROD) {
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
        if (
          loginResponse.user.role === "admin" ||
          loginResponse.user.role === "superAdmin"
        ) {
          showNotification(
            `Welcome, ${loginResponse.user.firstName}!`,
            "success",
          );
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
        showNotification(
          `Welcome, ${loginResponse.user.firstName}!`,
          "success",
        );
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
      showNotification(getFirebaseErrorMessage(error, "login"), "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setGlobalLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      try {
        const loginResponse = await login();
        handlePostAuthFlow(loginResponse);
      } catch (loginError) {
        const isNotRegistered =
          loginError.response?.status === 404 ||
          /not found|not registered|register first/i.test(loginError.message);
        if (isNotRegistered) {
          if (firebaseUser) {
            try {
              await firebaseUser.delete();
            } catch (e) {
              /* ignore */
            }
          }
          await auth.signOut();
          showNotification(
            "This Google account isn't registered yet. Please sign up first.",
            "warning",
          );
        } else {
          await auth.signOut();
          if (loginError.response?.status === 403)
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
          await auth.signOut();
        } catch (e) {
          /* ignore */
        }
      }
      showNotification(getFirebaseErrorMessage(error, "login"), "error");
    } finally {
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
      style={{ backgroundColor: "#0C375F" }}
    >
      <AuthBrandingPanel
        imageUrl={SIGNIN_IMAGE}
        headline="Your Home Away<br/>From Home"
        subtitle="Premium student living in the heart of Manila"
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
              Welcome back
            </h1>
            <p className="text-gray-600 font-light">
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="hover:underline"
                style={{ color: "#E7710F" }}
              >
                Sign up
              </Link>
            </p>
          </div>

          <form onSubmit={handleEmailPasswordLogin} className="space-y-6">
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
                autoComplete="email"
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
                  autoComplete="current-password"
                  className={inputClass("password")}
                  placeholder="Enter your password"
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300"
                  style={{ accentColor: "#E7710F" }}
                />
                <span className="text-sm text-gray-600 font-light">
                  Remember me
                </span>
              </label>
              <button
                type="button"
                onClick={() => navigate("/applicant/forgot-password")}
                className="text-sm font-light hover:underline"
                style={{ color: "#E7710F" }}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-6 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
              style={{ backgroundColor: "#E7710F" }}
              disabled={!isFormValid() || loading}
            >
              {loading ? "Signing In..." : "Sign in"}
            </button>

            <SocialAuthButtons
              onGoogle={handleGoogleLogin}
              onFacebook={handleFacebookLogin}
              loading={loading}
              dividerText="Or continue with"
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
