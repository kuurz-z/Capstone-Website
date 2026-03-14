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
import { Home, CheckCircle, XCircle, Loader2 } from "lucide-react";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const verifyEmail = async () => {
      const oobCode = searchParams.get("oobCode");

      if (!oobCode) {
        setStatus("error");
        setErrorMessage(
          "Invalid verification link. No verification code found.",
        );
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
      window.location.href = "/signin";
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F9FAFB",
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
            gap: "10px",
            textDecoration: "none",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "#183153",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Home style={{ width: "20px", height: "20px", color: "white" }} />
          </div>
          <span
            style={{
              fontSize: "20px",
              fontWeight: "600",
              color: "#183153",
              letterSpacing: "0.3px",
            }}
          >
            Lilycrest
          </span>
        </Link>

        {/* Card */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "48px 36px",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)",
            border: "1px solid #F0F0F0",
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
                  backgroundColor: "#EFF6FF",
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
                    color: "#3B82F6",
                    animation: "spin 1s linear infinite",
                  }}
                />
              </div>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: "#111827",
                  margin: "0 0 8px",
                }}
              >
                Verifying your email
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
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
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: "#111827",
                  margin: "0 0 8px",
                }}
              >
                Email verified
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
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
                to="/signin"
                style={{
                  display: "inline-block",
                  padding: "12px 36px",
                  backgroundColor: "#D4982B",
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
                Sign in to your account
              </Link>
              <p
                style={{
                  fontSize: "12px",
                  color: "#9CA3AF",
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
                  backgroundColor: "#FEF2F2",
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
                  color: "#111827",
                  margin: "0 0 8px",
                }}
              >
                Verification failed
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
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
                    backgroundColor: "#F3F4F6",
                    color: "#374151",
                    borderRadius: "10px",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "background-color 0.2s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#E5E7EB")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "#F3F4F6")
                  }
                >
                  Sign up again
                </Link>
                <Link
                  to="/signin"
                  style={{
                    display: "inline-block",
                    padding: "12px 28px",
                    backgroundColor: "#183153",
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
            color: "#9CA3AF",
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
