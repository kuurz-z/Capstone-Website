/**
 * =============================================================================
 * SIGN IN PAGE
 * =============================================================================
 *
 * User login page with the following features:
 * - Email/password login OR username/password login
 * - Email verification check
 * - Google and Facebook social authentication
 * - Redirects to check availability after login
 * - Show/Hide password toggle
 * - Comprehensive error handling
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, Home } from "lucide-react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
} from "firebase/auth";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { useAuth } from "../../../shared/hooks/useAuth";
import "../../public/styles/tenant-signin.css";
import "../../../shared/styles/notification.css";

function SignIn() {
  const navigate = useNavigate();
  const { login, setGlobalLoading } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldValid, setFieldValid] = useState({});
  const [debounceTimer, setDebounceTimer] = useState(null);

  /**
   * Advanced email validation
   * Checks for:
   * - Proper format
   * - Valid domain structure
   * - No consecutive dots
   * - Valid characters
   */
  const validateEmail = (email) => {
    if (!email || !email.trim()) return "Email is required";

    // Basic format check
    const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicRegex.test(email)) {
      return "Invalid email format";
    }

    // Advanced validation
    const parts = email.split("@");
    if (parts.length !== 2) return "Invalid email format";

    const [localPart, domain] = parts;

    // Check local part (before @)
    if (localPart.length === 0 || localPart.length > 64) {
      return "Invalid email format";
    }

    // Check domain part (after @)
    if (domain.length === 0 || domain.length > 255) {
      return "Invalid email domain";
    }

    // Check for valid domain structure
    const domainParts = domain.split(".");
    if (domainParts.length < 2) {
      return "Invalid email domain";
    }

    // Check each domain part
    for (let part of domainParts) {
      if (part.length === 0 || !/^[a-zA-Z0-9-]+$/.test(part)) {
        return "Invalid email domain";
      }
      if (part.startsWith("-") || part.endsWith("-")) {
        return "Invalid email domain";
      }
    }

    // Check TLD (top-level domain)
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
      return "Invalid email domain";
    }

    // Check for consecutive dots
    if (email.includes("..")) {
      return "Invalid email format";
    }

    return null; // Valid
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value,
    });

    // Mark field as touched
    setTouched({
      ...touched,
      [name]: true,
    });

    // Clear previous debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounced validation (300ms delay)
    const timer = setTimeout(() => {
      validateField(name, value);
    }, 300);

    setDebounceTimer(timer);
  };

  /**
   * Real-time field validation
   */
  const validateField = (fieldName, value) => {
    let error = null;

    switch (fieldName) {
      case "email":
        error = validateEmail(value);
        break;

      case "password":
        if (!value || !value.trim()) {
          error = "Password is required";
        }
        break;

      default:
        // No validation for other fields
        break;
    }

    setValidationErrors((prev) => ({
      ...prev,
      [fieldName]: error,
    }));

    setFieldValid((prev) => ({
      ...prev,
      [fieldName]: !error,
    }));
  };

  /**
   * Check if sign-in form is valid for submission
   */
  const isFormValid = () => {
    return fieldValid.email && fieldValid.password;
  };

  /**
   * Validate login form
   * - Email is required and must be valid
   * - Password is required
   */
  // validateForm was unused and removed to resolve ESLint warning

  /**
   * Handle email/password login
   *
   * REQUIREMENTS:
   * 1. Support login with email/password for Google-registered users
   * 2. Check email verification before allowing login
   * 3. Redirect appropriately based on user role
   * 5. Robust error handling
   */
  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setGlobalLoading(true);

    try {
      // STEP 1: Sign in with Firebase using email and password
      console.log("🔐 Authenticating with Firebase...");
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      const firebaseUser = userCredential.user;
      console.log("✅ Firebase authentication successful");

      // STEP 2: Check if email is verified (skip in development)
      console.log("📧 Email verified:", firebaseUser.emailVerified);
      if (!firebaseUser.emailVerified && import.meta.env.PROD) {
        console.log("⚠️ Email not verified, signing out...");
        await auth.signOut();
        showNotification(
          "Please verify your email before logging in. Check your inbox for the verification link.",
          "warning",
        );
        setGlobalLoading(false);
        return;
      }

      // STEP 3: Login to backend using useAuth hook
      try {
        console.log("🔍 Logging in to backend...");
        const loginResponse = await login();
        console.log("✅ Backend login successful");
        console.log("👤 User branch:", loginResponse.user.branch);

        // STEP 4: Check if user needs to select branch
        // This happens when user registered with Google but hasn't selected a branch yet
        if (!loginResponse.user.branch || loginResponse.user.branch === "") {
          console.log(
            "📍 Branch not selected, redirecting to branch selection...",
          );

          // Redirect to branch selection page (useAuth handles session)
          setTimeout(() => {
            navigate("/applicant/check-availability", {
              state: { notice: "Please select your branch to continue" },
            });
          }, 500);
          setGlobalLoading(false);
          return;
        }
        // STEP 5: Show success message
        showNotification(
          `Welcome, ${loginResponse.user.firstName}!`,
          "success",
        );

        // STEP 6: Redirect based on role
        // NOTE: RequireNonAdmin guard prevents admins from accessing this page,
        // but if somehow an admin reaches here, redirect to admin dashboard
        console.log("🔄 Redirecting to appropriate page...");
        setTimeout(() => {
          if (
            loginResponse.user.role === "admin" ||
            loginResponse.user.role === "superAdmin"
          ) {
            console.log("👨‍💼 Admin detected - redirecting to admin dashboard");
            navigate("/admin/dashboard");
          } else {
            console.log("🏠 Redirecting to applicant dashboard...");
            navigate("/applicant/profile");
          }
        }, 800);
      } catch (backendError) {
        console.error("❌ Backend login error:", backendError);
        await auth.signOut();

        const isNotRegistered =
          backendError.response?.status === 404 ||
          /not found|not registered|register first/i.test(backendError.message);

        if (isNotRegistered) {
          showNotification(
            "User is not registered. Please sign up first.",
            "warning",
          );
        } else if (backendError.response?.status === 403) {
          showNotification(
            "Your account is inactive. Please contact support.",
            "error",
          );
        } else {
          showNotification(
            "Login failed. Please try again or contact support.",
            "error",
          );
        }
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      let errorMessage = "Login failed. Please try again.";

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        errorMessage =
          "Invalid email or password. Please check your credentials.";
      } else if (error.code === "auth/user-not-found") {
        errorMessage =
          "No account found with this email. Please register first.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email format. Please check your email.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage =
          "Too many failed login attempts. Please try again later or reset your password.";
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (error.code === "auth/user-disabled") {
        errorMessage =
          "This account has been disabled. Please contact support.";
      }

      showNotification(errorMessage, "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  /**
   * Handle social provider login (Google/Facebook)
   *
   * GOOGLE LOGIN FLOW (STRICT REGISTRATION-FIRST):
   * - Google authentication ONLY works for pre-registered accounts
   * - Does NOT create accounts or Firebase users during login attempts
   * - Backend validation is the source of truth for account existence
   * - Prevents unauthorized access and unintended account creation
   *
   * WHY THIS BEHAVIOR:
   * - Login should only authenticate existing users
   * - Registration (via SignUp page) is the only place for account creation
   * - Maintains security by requiring explicit registration first
   *
   * FLOW ORDER:
   * 1. Firebase authentication (temporary, for verification only)
   * 2. Check if account exists in backend (MongoDB)
   * 3. If account exists → proceed with login flow
   * 4. If account doesn't exist → BLOCK ACCESS, terminate session
   * 5. Redirect after authentication
   */
  const handleSocialLogin = async (provider) => {
    setGlobalLoading(true);

    try {
      console.log("🔹 Starting Google login verification...");

      // STEP 1: Temporary Firebase authentication for account verification
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      console.log("✅ Firebase authentication successful:", firebaseUser.email);

      // STEP 2: Verify account exists in backend (source of truth)
      try {
        console.log("🔍 Checking account registration status...");
        const loginResponse = await login();
        console.log("✅ Account verified - user is registered");
        console.log("👤 User branch:", loginResponse.user.branch);

        // STEP 3: Account exists - proceed with normal login flow
        handlePostAuthFlow(loginResponse);
      } catch (loginError) {
        // STEP 4: Account not found - BLOCK ACCESS (registration required)
        console.error("❌ Backend login error:", loginError);

        const isNotRegistered =
          loginError.response?.status === 404 ||
          /not found|not registered|register first/i.test(loginError.message);

        if (isNotRegistered) {
          console.log(
            "🚫 Account not registered - blocking access per registration-first policy",
          );

          // Remove unintended Firebase user to avoid lingering auth account
          if (firebaseUser) {
            try {
              await firebaseUser.delete();
              console.log("🗑️ Removed unregistered Firebase user");
            } catch (deleteError) {
              console.warn("⚠️ Failed to delete Firebase user:", deleteError);
            }
          }

          // Terminate Firebase session
          await auth.signOut();

          showNotification(
            "This Google account isn’t registered yet. Please sign up first.",
            "warning",
          );

          // Stay on login screen
        } else {
          // Other login errors (403 inactive, etc.)
          await auth.signOut();
          if (loginError.response?.status === 403) {
            showNotification(
              "Your account is inactive. Please contact support.",
              "error",
            );
          } else {
            showNotification(
              "Login failed. Please try again or contact support.",
              "error",
            );
          }
        }
      }
    } catch (error) {
      console.error("❌ Google sign-in error:", error);

      // Exit loading quickly on user-cancelled popups
      if (error.code === "auth/popup-closed-by-user") {
        setGlobalLoading(false);
        showNotification("Sign-in cancelled", "info");
        return;
      }

      if (error.code === "auth/cancelled-popup-request") {
        setGlobalLoading(false);
        console.log("ℹ️ Sign-in cancelled by user");
        return;
      }

      // Clean up Firebase session if exists
      if (auth.currentUser) {
        try {
          await auth.signOut();
          console.log("✅ Cleaned up Firebase session");
        } catch (signOutError) {
          console.error("❌ Failed to sign out:", signOutError);
        }
      }

      // Handle specific error cases
      if (error.code === "auth/popup-blocked") {
        showNotification(
          "Popup blocked by browser. Please allow popups for this site.",
          "error",
        );
      } else if (error.code === "auth/network-request-failed") {
        showNotification(
          "Network error. Please check your internet connection and try again.",
          "error",
        );
      } else if (error.code === "auth/too-many-requests") {
        showNotification(
          "Too many attempts. Please wait a moment and try again.",
          "error",
        );
      } else if (
        error.code === "auth/account-exists-with-different-credential"
      ) {
        showNotification(
          "An account already exists with this email using a different sign-in method.",
          "error",
        );
      } else {
        showNotification(
          "Google sign-in failed. Please try again or use email/password login.",
          "error",
        );
      }
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const provider = new GoogleAuthProvider();
    handleSocialLogin(provider);
  };

  const handleFacebookLogin = () => {
    const provider = new FacebookAuthProvider();
    handleSocialLogin(provider);
  };

  /**
   * Handle post-authentication flow and redirects
   * @param {Object} loginResponse - Backend login response
   */
  const handlePostAuthFlow = (loginResponse) => {
    console.log("🔄 Starting post-auth flow...");

    // STEP: Redirect based on role
    console.log("✅ Redirecting based on role");

    showNotification(`Welcome, ${loginResponse.user.firstName}!`, "success");

    setTimeout(() => {
      if (
        loginResponse.user.role === "admin" ||
        loginResponse.user.role === "superAdmin"
      ) {
        console.log("👨‍💼 Admin user - redirecting to admin dashboard");
        navigate("/admin/dashboard");
      } else {
        console.log("🏠 Applicant/Tenant - redirecting to applicant dashboard");
        navigate("/applicant/profile");
      }
    }, 800);
  };

  return (
    <div
      className="min-h-screen grid lg:grid-cols-2"
      style={{ backgroundColor: "#0C375F" }}
    >
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-black/60 z-10"></div>
        <img
          src="https://images.unsplash.com/photo-1555854877-bab0e564b8d5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBkb3JtJTIwcm9vbXxlbnwwfHx8fDE3NzAyNjI4Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Lilycrest Dormitory"
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="relative z-20">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-light">Back to website</span>
          </Link>
        </div>

        <div className="relative z-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
              <Home className="w-6 h-6" style={{ color: "#0C375F" }} />
            </div>
            <span className="font-semibold text-2xl text-white tracking-wide">
              Lilycrest
            </span>
          </div>
          <h2 className="text-5xl font-light text-white mb-4 leading-tight">
            Your Home Away
            <br />
            From Home
          </h2>
          <p className="text-white/70 font-light text-lg">
            Premium student living in the heart of Manila
          </p>
        </div>

        <div className="relative z-20 flex gap-2"></div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="lg:hidden inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-light">Back to website</span>
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
                className={`w-full px-4 py-4 rounded-xl bg-gray-50 border focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors ${
                  touched.email
                    ? fieldValid.email
                      ? "border-green-500"
                      : "border-red-500"
                    : "border-gray-200 focus:border-gray-300"
                }`}
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
                  className={`w-full px-4 py-4 rounded-xl bg-gray-50 border focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors ${
                    touched.password
                      ? fieldValid.password
                        ? "border-green-500"
                        : "border-red-500"
                      : "border-gray-200 focus:border-gray-300"
                  }`}
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

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500 font-light">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"
                  />
                  <path
                    fill="#34A853"
                    d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"
                  />
                </svg>
                <span className="text-gray-700 font-light text-sm">Google</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={handleFacebookLogin}
                disabled={loading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M20 12.06C20 6.54 15.52 2.06 10 2.06S0 6.54 0 12.06C0 17.05 3.66 21.19 8.44 21.94V14.95H5.9V12.06H8.44V9.86C8.44 7.35 9.93 5.97 12.22 5.97C13.31 5.97 14.45 6.16 14.45 6.16V8.62H13.19C11.95 8.62 11.56 9.39 11.56 10.18V12.06H14.34L13.9 14.95H11.56V21.94C16.34 21.19 20 17.05 20 12.06Z" />
                </svg>
                <span className="text-gray-700 font-light text-sm">
                  Facebook
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
