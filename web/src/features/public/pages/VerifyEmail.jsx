/**
 * =============================================================================
 * VERIFY EMAIL PAGE
 * =============================================================================
 *
 * Custom email verification handler that:
 * - Reads the Firebase oobCode from the URL
 * - Applies the action code to verify the email
 * - Shows a premium, minimalist success/error UI
 * - Redirects to /signin after verification
 * - Works on both PC and mobile
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link, useLocation, useNavigate } from "react-router-dom";
import { applyActionCode } from "firebase/auth";
import { auth } from "../../../firebase/config";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { authApi } from "../../../shared/api/authApi";
import {
  clearOtpPending,
  getOtpPending,
} from "../../../shared/api/authSession";
import { useAuth } from "../../../shared/hooks/useAuth";
import logo from "../../../assets/images/LOGO.svg";

function VerifyEmail() {
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const isOtpMode = searchParams.get("mode") === "otp";
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [otpDigits, setOtpDigitsState] = useState(Array(6).fill(""));
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpNotice, setOtpNotice] = useState("Sending verification code...");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [activeOtpIndex, setActiveOtpIndex] = useState(0);
  const otpInputRefs = useRef([]);

  const pendingOtp = getOtpPending();
  const otpEmail = location.state?.email || pendingOtp?.email || auth.currentUser?.email || "";
  const otp = otpDigits.join("");

  useEffect(() => {
    if (isOtpMode) {
      setStatus(auth.currentUser ? "otp" : "error");
      if (!auth.currentUser) {
        setErrorMessage("Please sign in again to request a new OTP.");
      } else {
        setOtpNotice("Sending verification code...");
        const sentTimer = window.setTimeout(() => {
          setOtpNotice("Code sent. Please check your email.");
        }, 900);
        return () => window.clearTimeout(sentTimer);
      }
      return;
    }

    const verifyEmail = async () => {
      const oobCode = searchParams.get("oobCode");

      if (!oobCode) {
        // Firebase already verified on their hosted page — show success
        setStatus("success");
        return;
      }

      try {
        await applyActionCode(auth, oobCode);
        setStatus("success");
      } catch (error) {
        console.error("Email verification error:", error);
        setStatus("error");
        if (error.code === "auth/expired-action-code") {
          setErrorMessage(
            "This verification link has expired. Please request a new one.",
          );
        } else if (error.code === "auth/invalid-action-code") {
          setErrorMessage(
            "This verification link is invalid or has already been used.",
          );
        } else {
          setErrorMessage(
            "Verification failed. Please try again or contact support.",
          );
        }
      }
    };

    verifyEmail();
  }, [searchParams, isOtpMode]);

  useEffect(() => {
    if (!isOtpMode || resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [isOtpMode, resendCooldown]);

  // Countdown redirect after success
  useEffect(() => {
    if (status !== "success" || isOtpMode) return;
    if (countdown <= 0) {
      window.location.href = "/signin?verified=true";
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, isOtpMode]);

  const redirectAfterOtp = (user) => {
    clearOtpPending();
    updateUser(user);
    setOtpVerified(true);
    setOtpNotice("Verification successful. Logging you in...");
    window.setTimeout(() => {
      if (user.role === "branch_admin" || user.role === "owner") {
        navigate("/admin/dashboard", { replace: true });
        return;
      }
      navigate("/applicant/check-availability", { replace: true });
    }, 900);
  };

  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    if (otpLoading || otpVerified) return;
    if (!/^\d{6}$/.test(otp)) {
      setErrorMessage("Enter the 6-digit OTP code.");
      return;
    }

    setOtpLoading(true);
    setErrorMessage("");
    try {
      const response = await authApi.verifyOtp(otp);
      redirectAfterOtp(response.user);
    } catch (error) {
      const code = error.response?.data?.code;
      setOtpVerified(false);
      if (code === "OTP_INVALID") {
        setOtpDigits(Array(6).fill(""));
        setErrorMessage("Invalid OTP code.");
        window.setTimeout(() => focusOtpBox(0), 0);
      } else if (code === "OTP_EXPIRED") {
        setErrorMessage("OTP expired. Please request a new code.");
      } else {
        setErrorMessage(error.message || "Could not verify OTP. Please try again.");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const focusOtpBox = (index) => {
    const safeIndex = Math.max(0, Math.min(5, index));
    otpInputRefs.current[safeIndex]?.focus();
    otpInputRefs.current[safeIndex]?.select();
  };

  const setOtpDigits = (nextDigits) => {
    setOtpDigitsState(nextDigits.slice(0, 6));
  };

  const handleOtpDigitChange = (index, value) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      const next = [...otpDigits];
      next[index] = "";
      setOtpDigits(next);
      return;
    }

    const next = [...otpDigits];
    digits
      .slice(0, 6 - index)
      .split("")
      .forEach((digit, offset) => {
        next[index + offset] = digit;
      });
    setOtpDigits(next);
    focusOtpBox(Math.min(index + digits.length, 5));
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...otpDigits];
      if (next[index]) {
        next[index] = "";
        setOtpDigits(next);
        return;
      }
      if (index > 0) {
        next[index - 1] = "";
        setOtpDigits(next);
        focusOtpBox(index - 1);
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusOtpBox(index - 1);
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      focusOtpBox(index + 1);
    }
  };

  const handleOtpPaste = (index, event) => {
    event.preventDefault();
    handleOtpDigitChange(index, event.clipboardData.getData("text"));
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setErrorMessage("");
    setOtpNotice("Sending verification code...");
    try {
      await authApi.resendOtp();
      setResendCooldown(30);
      setOtpNotice("Code sent. Please check your email.");
    } catch (error) {
      const retryAfter = error.response?.data?.retryAfterSeconds;
      if (retryAfter) setResendCooldown(retryAfter);
      setErrorMessage(error.message || "Could not resend OTP. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const pageBackground = isDark ? "#0B1120" : "#F9FAFB";
  const brandTextColor = isDark ? "#FFFFFF" : "#0A1628";
  const cardBackground = isDark ? "#111827" : "#FFFFFF";
  const cardBorder = isDark ? "1px solid rgba(212, 175, 55, 0.24)" : "1px solid #F0F0F0";
  const cardShadow =
    isDark
      ? "0 1px 3px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.2)"
      : "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)";
  const headingColor = isDark ? "#F9FAFB" : "#111827";
  const bodyColor = isDark ? "#D1D5DB" : "#6B7280";
  const mutedColor = isDark ? "#9CA3AF" : "#9CA3AF";
  const primaryButtonBg = "#D4AF37";
  const primaryButtonText = isDark ? "#0A1628" : "#FFFFFF";
  const secondaryButtonBg = isDark ? "rgba(255,255,255,0.08)" : "#F3F4F6";
  const secondaryButtonHoverBg = isDark ? "rgba(255,255,255,0.14)" : "#E5E7EB";
  const secondaryButtonText = isDark ? "#E5E7EB" : "#374151";
  const darkActionButtonBg = isDark ? "#0A1628" : "#0A1628";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pageBackground,
        padding: "24px",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            textDecoration: "none",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={logo}
              alt="Lilycrest logo"
              style={{ width: "40px", height: "40px", objectFit: "contain" }}
            />
          </div>
          <span
            style={{
              fontSize: "32px",
              fontWeight: "600",
              color: brandTextColor,
              letterSpacing: "0.3px",
              lineHeight: 1,
            }}
          >
            Lilycrest
          </span>
        </Link>

        {/* Card */}
        <div
          style={{
            backgroundColor: cardBackground,
            borderRadius: "16px",
            padding: "48px 36px",
            boxShadow: cardShadow,
            border: cardBorder,
          }}
        >
          {status === "otp" && (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: isDark ? "rgba(212, 175, 55, 0.16)" : "#FEF6E0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                  color: "#D4AF37",
                  fontSize: "24px",
                  fontWeight: 700,
                }}
              >
                OTP
              </div>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: headingColor,
                  margin: "0 0 8px",
                }}
              >
                Verify your login
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: bodyColor,
                  margin: "0 0 24px",
                  fontWeight: "400",
                  lineHeight: "1.5",
                }}
              >
                Enter the 6-digit code sent to {otpEmail || "your email"}.
              </p>
              <p
                style={{
                  fontSize: "13px",
                  color: otpVerified ? "#10B981" : mutedColor,
                  margin: "-12px 0 22px",
                  fontWeight: 500,
                  lineHeight: "1.4",
                }}
              >
                {otpNotice}
              </p>

              <form onSubmit={handleOtpSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                    gap: "8px",
                    marginTop: "4px",
                  }}
                >
                  {Array.from({ length: 6 }, (_, index) => {
                    const isActive = activeOtpIndex === index;
                    return (
                      <input
                        key={index}
                        ref={(element) => {
                          otpInputRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        maxLength={1}
                        value={otpDigits[index] || ""}
                        disabled={otpLoading || otpVerified}
                        onChange={(event) =>
                          handleOtpDigitChange(index, event.target.value)
                        }
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        onPaste={(event) => handleOtpPaste(index, event)}
                        onFocus={() => setActiveOtpIndex(index)}
                        aria-label={`OTP digit ${index + 1}`}
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1.12",
                          boxSizing: "border-box",
                          border: isActive
                            ? "2px solid #D4AF37"
                            : isDark
                              ? "1px solid #374151"
                              : "1px solid #E5E7EB",
                          borderRadius: "10px",
                          backgroundColor: isDark ? "#0B1120" : "#F9FAFB",
                          color: headingColor,
                          fontSize: "24px",
                          fontWeight: 700,
                          textAlign: "center",
                          outline: "none",
                          boxShadow: isActive
                            ? "0 0 0 3px rgba(212, 175, 55, 0.18)"
                            : "none",
                          opacity: otpLoading || otpVerified ? 0.72 : 1,
                          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                        }}
                      />
                    );
                  })}
                </div>
                {errorMessage && (
                  <p
                    role="alert"
                    style={{
                      color: "#EF4444",
                      fontSize: "13px",
                      margin: "12px 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    {errorMessage}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={otpLoading || otpVerified || otp.length !== 6}
                  style={{
                    width: "100%",
                    marginTop: "20px",
                    padding: "13px 24px",
                    backgroundColor: primaryButtonBg,
                    color: primaryButtonText,
                    border: 0,
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: otpLoading || otpVerified || otp.length !== 6 ? "not-allowed" : "pointer",
                    opacity: otpLoading || otpVerified || otp.length !== 6 ? 0.65 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {otpLoading && (
                    <Loader2
                      style={{
                        width: "16px",
                        height: "16px",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                  )}
                  {otpVerified
                    ? "Verified"
                    : otpLoading
                      ? "Verifying..."
                      : "Verify and continue"}
                </button>
              </form>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={otpLoading || otpVerified || resending || resendCooldown > 0}
                style={{
                  marginTop: "14px",
                  background: "transparent",
                  border: 0,
                  color: resendCooldown > 0 || otpLoading || otpVerified ? mutedColor : "#D4AF37",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: otpLoading || otpVerified || resending || resendCooldown > 0 ? "not-allowed" : "pointer",
                }}
              >
                {resending
                  ? "Sending..."
                  : resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : "Resend OTP"}
              </button>
            </>
          )}

          {/* Verifying State */}
          {status === "verifying" && (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: isDark ? "rgba(212, 175, 55, 0.16)" : "#FEF6E0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                }}
              >
                <Loader2
                  style={{
                    width: "28px",
                    height: "28px",
                    color: "#D4AF37",
                    animation: "spin 1s linear infinite",
                  }}
                />
              </div>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: headingColor,
                  margin: "0 0 8px",
                }}
              >
                Verifying your email
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: bodyColor,
                  margin: 0,
                  fontWeight: "400",
                  lineHeight: "1.5",
                }}
              >
                Please wait while we confirm your email address...
              </p>
            </>
          )}

          {/* Success State */}
          {status === "success" && (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: isDark ? "rgba(16, 185, 129, 0.18)" : "#ECFDF5",
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
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: headingColor,
                  margin: "0 0 8px",
                }}
              >
                Email verified
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: bodyColor,
                  margin: "0 0 28px",
                  fontWeight: "400",
                  lineHeight: "1.5",
                }}
              >
                Your email has been successfully verified.
                <br />
                You can now sign in to your account.
              </p>
              <Link
                to="/signin?verified=true"
                style={{
                  display: "inline-block",
                  padding: "12px 36px",
                  backgroundColor: primaryButtonBg,
                  color: primaryButtonText,
                  borderRadius: "10px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "opacity 0.2s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Sign in to your account
              </Link>
              <p
                style={{
                  fontSize: "12px",
                  color: mutedColor,
                  marginTop: "16px",
                  fontWeight: "400",
                }}
              >
                Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
              </p>
            </>
          )}

          {/* Error State */}
          {status === "error" && (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#FEF2F2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                }}
              >
                <XCircle
                  style={{ width: "28px", height: "28px", color: "#EF4444" }}
                />
              </div>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: headingColor,
                  margin: "0 0 8px",
                }}
              >
                Verification failed
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: bodyColor,
                  margin: "0 0 28px",
                  fontWeight: "400",
                  lineHeight: "1.5",
                }}
              >
                {errorMessage}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "center",
                }}
              >
                <Link
                  to="/signup"
                  style={{
                    display: "inline-block",
                    padding: "12px 28px",
                    backgroundColor: secondaryButtonBg,
                    color: secondaryButtonText,
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "background-color 0.2s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = secondaryButtonHoverBg)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = secondaryButtonBg)
                  }
                >
                  Sign up again
                </Link>
                <Link
                  to="/signin"
                  style={{
                    display: "inline-block",
                    padding: "12px 28px",
                    backgroundColor: darkActionButtonBg,
                    color: "white",
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "opacity 0.2s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Go to sign in
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p
          style={{
            fontSize: "12px",
            color: mutedColor,
            marginTop: "32px",
            fontWeight: "400",
          }}
        >
          © {new Date().getFullYear()} Lilycrest Dormitory. All rights reserved.
        </p>
      </div>

      {/* Spin animation for the loader */}
      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}

export default VerifyEmail;
