import "../styles/admin-login.css";
import logoImage from "../../../assets/images/branding/logo.png";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../../firebase/config";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useFirebaseAuth } from "../../../shared/hooks/FirebaseAuthContext";
import { showNotification } from "../../../shared/utils/notification";

/**
 * =============================================================================
 * ADMIN LOGIN PAGE
 * =============================================================================
 *
 * Dedicated login page for administrators and super administrators.
 * This is separate from the tenant login (/tenant/signin).
 *
 * Features:
 * - Email/password authentication via Firebase
 * - Role verification (only admin/superAdmin allowed)
 * - Email verification check
 * - Redirects to dashboard if already logged in as admin
 * =============================================================================
 */
function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, isAuthenticated, loading: authLoading } = useAuth();
  const { signOut } = useFirebaseAuth();

  // Session lock: Redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (user.role === "admin" || user.role === "superAdmin") {
        // Admin already logged in, redirect to dashboard
        navigate("/admin/dashboard", { replace: true });
      } else {
        // Regular user trying to access admin login, redirect to home
        navigate("/", { replace: true });
      }
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Sign out any existing session first to ensure clean state
      try {
        await signOut();
      } catch (e) {
        // Ignore sign out errors
      }

      // Step 2: Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const firebaseUser = userCredential.user;
      // Step 3: Check email verification (skip in development)
      if (!firebaseUser.emailVerified && import.meta.env.PROD) {
        await signOut();
        setError(
          "Please verify your email before logging in. Check your inbox for the verification link.",
        );
        setLoading(false);
        return;
      }

      // Step 4: Login to backend API
      const userData = await login();
      // Step 5: Check if user has admin or superAdmin role
      if (
        userData.user.role === "admin" ||
        userData.user.role === "superAdmin"
      ) {
        // Show welcome notification
        showNotification(
          `Welcome, ${userData.user.firstName || "Admin"}!`,
          "success",
        );
        // Small delay to show the notification before redirect
        setTimeout(() => {
          navigate("/admin/dashboard");
        }, 500);
      } else {
        setError("Access denied. Admin privileges required.");
        // Sign out since they don't have admin access
        await signOut();
      }
    } catch (err) {
      console.error("Login error:", err);
      // Sign out on any error
      try {
        await signOut();
      } catch (signOutError) {
        console.error("Error signing out:", signOutError);
      }

      // Handle specific Firebase error codes
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password"
      ) {
        setError("Invalid email or password.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(
          err.response?.data?.error || "Login failed. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <img src={logoImage} alt="Lilycrest Logo" />
        </div>

        <h1 className="admin-login-title">Admin Portal</h1>
        <p className="admin-login-subtitle">Sign in to manage Lilycrest</p>

        {error && <div className="admin-login-error">{error}</div>}

        <form className="admin-login-form" onSubmit={handleLogin}>
          <label className="admin-login-label" htmlFor="admin-email">
            Email Address
          </label>
          <div className="admin-login-input-group">
            <span className="admin-login-input-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M18.3332 5.83331L10.8407 10.6058C10.5864 10.7535 10.2976 10.8313 10.0036 10.8313C9.70956 10.8313 9.42076 10.7535 9.1665 10.6058L1.6665 5.83331"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16.6665 3.33331H3.33317C2.4127 3.33331 1.6665 4.07951 1.6665 4.99998V15C1.6665 15.9205 2.4127 16.6666 3.33317 16.6666H16.6665C17.587 16.6666 18.3332 15.9205 18.3332 15V4.99998C18.3332 4.07951 17.587 3.33331 16.6665 3.33331Z"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <input
              id="admin-email"
              type="email"
              placeholder="admin@lilycrest.com"
              className="admin-login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <label className="admin-login-label" htmlFor="admin-password">
            Password
          </label>
          <div className="admin-login-input-group">
            <span className="admin-login-input-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M15.8333 9.16666H4.16667C3.24619 9.16666 2.5 9.91285 2.5 10.8333V16.6667C2.5 17.5871 3.24619 18.3333 4.16667 18.3333H15.8333C16.7538 18.3333 17.5 17.5871 17.5 16.6667V10.8333C17.5 9.91285 16.7538 9.16666 15.8333 9.16666Z"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.8335 9.16666V5.83332C5.8335 4.72825 6.27248 3.66845 7.05388 2.88704C7.83529 2.10564 8.89509 1.66666 10.0002 1.66666C11.1052 1.66666 12.165 2.10564 12.9464 2.88704C13.7278 3.66845 14.1668 4.72825 14.1668 5.83332V9.16666"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              className="admin-login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="admin-login-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M1.7181 10.29C1.64865 10.1029 1.64865 9.89709 1.7181 9.71C2.39452 8.06987 3.5427 6.66753 5.01708 5.68074C6.49146 4.69396 8.22564 4.16718 9.99977 4.16718C11.7739 4.16718 13.5081 4.69396 14.9825 5.68074C16.4568 6.66753 17.605 8.06987 18.2814 9.71C18.3509 9.89709 18.3509 10.1029 18.2814 10.29C17.605 11.9301 16.4568 13.3325 14.9825 14.3192C13.5081 15.306 11.7739 15.8328 9.99977 15.8328C8.22564 15.8328 6.49146 15.306 5.01708 14.3192C3.5427 13.3325 2.39452 11.9301 1.7181 10.29Z"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z"
                  stroke="#99A1AF"
                  strokeWidth="1.66667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <button
            type="submit"
            className="admin-login-submit"
            disabled={loading}
          >
            {loading ? "Signing In..." : "Sign In to Admin Panel"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLoginPage;
