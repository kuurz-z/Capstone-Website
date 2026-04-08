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

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { applyActionCode } from "firebase/auth";
import { auth } from "../../../firebase/config";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import logo from "../../../assets/images/LOGO.svg";

function VerifyEmail() {
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
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
  }, [searchParams]);

  // Countdown redirect after success
  useEffect(() => {
    if (status !== "success") return;
    if (countdown <= 0) {
      window.location.href = "/signin?verified=true";
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

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
