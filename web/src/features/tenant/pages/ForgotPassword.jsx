/**
 * =============================================================================
 * FORGOT PASSWORD PAGE
 * =============================================================================
 *
 * Professional minimalist password reset page matching the SignIn/SignUp design.
 * Features AuthBrandingPanel on the left, clean form on the right.
 * Two states: email form → success confirmation.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { Mail, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { auth } from "../../../firebase/config";
import { showNotification } from "../../../shared/utils/notification";
import { validateEmail } from "../../../shared/utils/authValidation";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import "../../../shared/styles/notification.css";
import Lounge from "../../../assets/images/facilities/RD Lounge Area.jpg"; 

const RESET_IMAGE = Lounge; 
function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [fieldValid, setFieldValid] = useState(false);

  const handleChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    setTouched(true);
    const error = validateEmail(value);
    setValidationError(error);
    setFieldValid(!error);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      showNotification("Please enter your email address", "error");
      return;
    }
    if (validationError) {
      showNotification("Please enter a valid email address", "error");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setEmailSent(true);
      showNotification("Password reset email sent!", "success");
      // Log successful password reset attempt for security auditing
      try {
        await fetch("/api/auth/log-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, success: true }),
        });
      } catch (_) {
        /* non-critical */
      }
    } catch (error) {
      let msg = "Failed to send reset email. ";
      if (error.code === "auth/user-not-found")
        msg = "No account found with this email address.";
      else if (error.code === "auth/invalid-email")
        msg = "Invalid email address format.";
      else if (error.code === "auth/too-many-requests")
        msg = "Too many requests. Please try again later.";
      else if (error.code === "auth/network-request-failed")
        msg = "Network error. Please check your connection.";
      else msg += error.message || "Please try again.";
      showNotification(msg, "error");
      // Log failed password reset attempt
      try {
        await fetch("/api/auth/log-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, success: false }),
        });
      } catch (_) {
        /* non-critical */
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-4 py-4 rounded-xl bg-gray-50 border focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors ${touched ? (fieldValid ? "border-green-500" : "border-red-500") : "border-gray-200 focus:border-gray-300"}`;

  return (
    <div
      className="min-h-screen grid lg:grid-cols-2"
      style={{ backgroundColor: "#0A1628" }}
    >
      <AuthBrandingPanel
        imageUrl={RESET_IMAGE}
        headline="Forgot Your<br/>Password?"
        subtitle="No worries — we'll help you get back in"
      />

      <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="lg:hidden inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <span className="text-sm font-light">← Back to website</span>
          </Link>

          {!emailSent ? (
            <>
              {/* Header */}
              <div className="mb-10">
                <h1
                  className="text-4xl font-light mb-3 tracking-tight"
                  style={{ color: "#0A1628" }}
                >
                  Reset password
                </h1>
                <p className="text-gray-600 font-light">
                  Enter the email associated with your account and we'll send a
                  link to reset your password.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-light text-gray-700 mb-2"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={handleChange}
                      placeholder="your.email@example.com"
                      disabled={loading}
                      autoComplete="email"
                      autoFocus
                      className={inputClass}
                    />
                    <Mail
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                      style={{ width: "18px", height: "18px" }}
                    />
                  </div>
                  {touched && validationError && (
                    <span
                      style={{
                        display: "block",
                        marginTop: "6px",
                        fontSize: "12px",
                        color: "#EF4444",
                        fontWeight: "400",
                      }}
                    >
                      {validationError}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#D4AF37" }}
                  disabled={!fieldValid || loading}
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="w-4 h-4 animate-spin"
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/signin")}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-light text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft style={{ width: "16px", height: "16px" }} />
                  Back to sign in
                </button>
              </form>
            </>
          ) : (
            /* Success State */
            <div className="text-center">
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "#ECFDF5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                }}
              >
                <CheckCircle
                  style={{ width: "28px", height: "28px", color: "#10B981" }}
                />
              </div>

              <h1
                className="text-3xl font-light mb-3 tracking-tight"
                style={{ color: "#0A1628" }}
              >
                Check your email
              </h1>
              <p
                className="text-gray-600 font-light mb-2"
                style={{ lineHeight: "1.6" }}
              >
                We've sent a password reset link to
              </p>
              <p
                className="mb-8"
                style={{
                  fontWeight: "500",
                  color: "#0A1628",
                  fontSize: "15px",
                }}
              >
                {email}
              </p>

              <p
                className="text-gray-500 font-light mb-8"
                style={{ fontSize: "13px", lineHeight: "1.6" }}
              >
                Click the link in the email to create a new password.
                <br />
                Don't forget to check your spam folder.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => navigate("/signin")}
                  className="w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
                  style={{ backgroundColor: "#FF8C42" }}
                >
                  Back to sign in
                </button>

                <button
                  onClick={() => {
                    setEmailSent(false);
                    setEmail("");
                    setTouched(false);
                    setFieldValid(false);
                  }}
                  className="w-full py-3 rounded-xl text-sm font-light text-gray-600 hover:text-gray-900 transition-colors"
                  style={{ backgroundColor: "#F3F4F6" }}
                >
                  Didn't receive it? Resend email
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}

export default ForgotPassword;
