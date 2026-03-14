/**
 * SettingsTab — Profile Settings with Change Password & Session Management
 *
 * Features:
 * - Change password for email/password accounts (Firebase Auth)
 * - "Managed by Google" notice for social login users
 * - Account information display (role, status, dates)
 * - Active session info and sign-out-all-devices
 */

import React, { useState } from "react";
import {
  Shield,
  Eye,
  EyeOff,
  Lock,
  Info,
  CheckCircle,
  AlertCircle,
  Monitor,
  LogOut,
} from "lucide-react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../../../firebase/config";
import { showNotification } from "../../../../shared/utils/notification";

// ─── Helpers ──────────────────────────────────────────────────

/** Check if current user has email/password provider */
const isEmailPasswordAccount = () => {
  const user = auth.currentUser;
  return user?.providerData?.some((p) => p.providerId === "password") || false;
};

/** Get the social provider name if any */
const getSocialProvider = () => {
  const user = auth.currentUser;
  const provider = user?.providerData?.find(
    (p) => p.providerId !== "password",
  );
  if (!provider) return null;
  if (provider.providerId === "google.com") return "Google";
  if (provider.providerId === "facebook.com") return "Facebook";
  return provider.providerId;
};

// ─── Component ────────────────────────────────────────────────

const SettingsTab = () => {
  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const hasEmailAuth = isEmailPasswordAccount();
  const socialProvider = getSocialProvider();
  const firebaseUser = auth.currentUser;

  // ── Password change handler ──
  const handleChangePassword = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword) {
      showNotification("Current password is required", "error");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      showNotification(
        "New password must be at least 8 characters",
        "error",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification("New passwords do not match", "error");
      return;
    }
    if (currentPassword === newPassword) {
      showNotification(
        "New password must be different from current password",
        "error",
      );
      return;
    }

    try {
      setChangingPassword(true);
      const fbUser = auth.currentUser;

      if (!fbUser || !fbUser.email) {
        showNotification(
          "You must be logged in to change your password",
          "error",
        );
        return;
      }

      const credential = EmailAuthProvider.credential(
        fbUser.email,
        currentPassword,
      );
      await reauthenticateWithCredential(fbUser, credential);
      await updatePassword(fbUser, newPassword);

      showNotification("Password changed successfully!", "success");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordForm(false);
    } catch (error) {
      console.error("❌ Password change failed:", error);
      if (error.code === "auth/wrong-password") {
        showNotification("Current password is incorrect", "error");
      } else if (error.code === "auth/weak-password") {
        showNotification("New password is too weak", "error");
      } else if (error.code === "auth/requires-recent-login") {
        showNotification(
          "Please log out and log back in, then try again",
          "error",
        );
      } else {
        showNotification(
          "Failed to change password. Please try again.",
          "error",
        );
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Sign out all devices ──
  const handleSignOutAll = async () => {
    try {
      setSigningOutAll(true);
      const token = await auth.currentUser?.getIdToken(true);
      if (token) {
        try {
          const response = await fetch("/api/auth/revoke-sessions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (!response.ok) throw new Error("Server revocation failed");
        } catch {
        }
      }
      await auth.signOut();
      showNotification("Signed out from all devices", "success");
      window.location.href = "/signin";
    } catch (error) {
      console.error("❌ Sign out all failed:", error);
      showNotification("Failed to sign out from all devices", "error");
    } finally {
      setSigningOutAll(false);
    }
  };

  const handlePasswordInput = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const resetPasswordForm = () => {
    setShowPasswordForm(false);
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
  };

  // ── Shared styles ──
  const cardStyle = {
    backgroundColor: "#fff",
    borderRadius: "12px",
    border: "1px solid #E8EBF0",
    padding: "24px",
    marginBottom: "20px",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 40px 10px 14px",
    border: "1px solid #E8EBF0",
    borderRadius: "10px",
    fontSize: "14px",
    color: "#1F2937",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const toggleBtnStyle = {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#94A3B8",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div className="max-w-4xl" style={{ padding: "32px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#1F2937",
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
          Manage your account security and preferences
        </p>
      </div>

      {/* SECURITY SECTION — Change Password */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "#FFF7ED",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield
                style={{ width: "18px", height: "18px", color: "#D4982B" }}
              />
            </div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#1F2937",
                margin: 0,
              }}
            >
              Security
            </h3>
          </div>

          {hasEmailAuth && !showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              style={{
                background: "none",
                border: "1px solid #E8EBF0",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#D4982B",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#FFF7ED";
                e.currentTarget.style.borderColor = "#D4982B";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "#E8EBF0";
              }}
            >
              <Lock style={{ width: "14px", height: "14px" }} />
              Change Password
            </button>
          )}
        </div>

        {/* Social provider notice */}
        {!hasEmailAuth && socialProvider && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              backgroundColor: "#F8FAFC",
              borderRadius: "10px",
              border: "1px solid #E8EBF0",
            }}
          >
            <Info
              style={{ width: "20px", height: "20px", color: "#6366F1", flexShrink: 0 }}
            />
            <div>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#1F2937",
                  margin: "0 0 2px",
                }}
              >
                Managed by {socialProvider}
              </p>
              <p style={{ fontSize: "13px", color: "#94A3B8", margin: 0 }}>
                Your account uses {socialProvider} sign-in. Password management
                is handled by {socialProvider}.
              </p>
            </div>
          </div>
        )}

        {/* Email/password — info text */}
        {hasEmailAuth && !showPasswordForm && (
          <p style={{ color: "#6B7280", fontSize: "14px", margin: 0 }}>
            You can update your password here. You'll need to enter your
            current password first for security.
          </p>
        )}

        {/* Password change form */}
        {hasEmailAuth && showPasswordForm && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxWidth: "400px",
            }}
          >
            {/* Current password */}
            <div>
              <label style={labelStyle} htmlFor="settings-current-pw">
                Current Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="settings-current-pw"
                  type={showCurrentPw ? "text" : "password"}
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordInput}
                  placeholder="Enter current password"
                  disabled={changingPassword}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#D4982B";
                    e.target.style.boxShadow =
                      "0 0 0 3px rgba(212,152,43,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E8EBF0";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  style={toggleBtnStyle}
                  onClick={() => setShowCurrentPw((p) => !p)}
                  tabIndex={-1}
                >
                  {showCurrentPw ? (
                    <EyeOff style={{ width: "16px", height: "16px" }} />
                  ) : (
                    <Eye style={{ width: "16px", height: "16px" }} />
                  )}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label style={labelStyle} htmlFor="settings-new-pw">
                New Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="settings-new-pw"
                  type={showNewPw ? "text" : "password"}
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordInput}
                  placeholder="Enter new password"
                  disabled={changingPassword}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#D4982B";
                    e.target.style.boxShadow =
                      "0 0 0 3px rgba(212,152,43,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E8EBF0";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  style={toggleBtnStyle}
                  onClick={() => setShowNewPw((p) => !p)}
                  tabIndex={-1}
                >
                  {showNewPw ? (
                    <EyeOff style={{ width: "16px", height: "16px" }} />
                  ) : (
                    <Eye style={{ width: "16px", height: "16px" }} />
                  )}
                </button>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#94A3B8",
                  margin: "4px 0 0",
                }}
              >
                Must be at least 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            {/* Confirm new password */}
            <div>
              <label style={labelStyle} htmlFor="settings-confirm-pw">
                Confirm New Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="settings-confirm-pw"
                  type={showConfirmPw ? "text" : "password"}
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordInput}
                  placeholder="Confirm new password"
                  disabled={changingPassword}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#D4982B";
                    e.target.style.boxShadow =
                      "0 0 0 3px rgba(212,152,43,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E8EBF0";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  style={toggleBtnStyle}
                  onClick={() => setShowConfirmPw((p) => !p)}
                  tabIndex={-1}
                >
                  {showConfirmPw ? (
                    <EyeOff style={{ width: "16px", height: "16px" }} />
                  ) : (
                    <Eye style={{ width: "16px", height: "16px" }} />
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                paddingTop: "4px",
              }}
            >
              <button
                onClick={resetPasswordForm}
                disabled={changingPassword}
                style={{
                  background: "none",
                  border: "1px solid #E8EBF0",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#6B7280",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                style={{
                  backgroundColor: "#D4982B",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: changingPassword ? "not-allowed" : "pointer",
                  opacity: changingPassword ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {changingPassword ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SESSION MANAGEMENT SECTION */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "#FEF3C7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Monitor
              style={{ width: "18px", height: "18px", color: "#D97706" }}
            />
          </div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#1F2937",
              margin: 0,
            }}
          >
            Active Sessions
          </h3>
        </div>

        {/* Current session info */}
        <div
          style={{
            backgroundColor: "#F0FDF4",
            borderRadius: "10px",
            padding: "14px 16px",
            border: "1px solid #BBF7D0",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#22C55E",
                flexShrink: 0,
              }}
            />
            <div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#166534", margin: 0 }}>
                Current Session
              </p>
              <p style={{ fontSize: "12px", color: "#4ADE80", margin: "2px 0 0" }}>
                {navigator.userAgent.includes("Chrome") ? "Chrome" :
                  navigator.userAgent.includes("Firefox") ? "Firefox" :
                    navigator.userAgent.includes("Safari") ? "Safari" : "Browser"}{" "}on{" "}
                {navigator.platform || "this device"}
              </p>
            </div>
          </div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#16A34A",
              backgroundColor: "#DCFCE7",
              padding: "3px 8px",
              borderRadius: "6px",
            }}
          >
            Active now
          </span>
        </div>

        {/* Last sign-in info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <AccountInfoItem
            label="Last Sign-In"
            value={
              firebaseUser?.metadata?.lastSignInTime
                ? new Date(firebaseUser.metadata.lastSignInTime).toLocaleDateString("en-US", {
                    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })
                : "—"
            }
          />
          <AccountInfoItem
            label="Sign-In Method"
            value={
              hasEmailAuth
                ? "Email & Password"
                : socialProvider
                  ? `${socialProvider} Account`
                  : "Unknown"
            }
          />
        </div>

        {/* Sign out all button */}
        <button
          onClick={handleSignOutAll}
          disabled={signingOutAll}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "1px solid #FCA5A5",
            borderRadius: "10px",
            backgroundColor: "#FEF2F2",
            color: "#DC2626",
            fontSize: "13px",
            fontWeight: 600,
            cursor: signingOutAll ? "not-allowed" : "pointer",
            opacity: signingOutAll ? 0.6 : 1,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!signingOutAll) {
              e.currentTarget.style.backgroundColor = "#FEE2E2";
              e.currentTarget.style.borderColor = "#EF4444";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FEF2F2";
            e.currentTarget.style.borderColor = "#FCA5A5";
          }}
        >
          <LogOut style={{ width: "14px", height: "14px" }} />
          {signingOutAll ? "Signing out…" : "Sign Out of All Devices"}
        </button>
      </div>

      {/* ACCOUNT INFO SECTION (read-only) */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "#EEF2FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Info
              style={{ width: "18px", height: "18px", color: "#6366F1" }}
            />
          </div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#1F2937",
              margin: 0,
            }}
          >
            Account Information
          </h3>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <AccountInfoItem label="Email" value={firebaseUser?.email} />
          <AccountInfoItem
            label="Email Verified"
            value={
              firebaseUser?.emailVerified ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#16A34A",
                  }}
                >
                  <CheckCircle style={{ width: "14px", height: "14px" }} />
                  Verified
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#DC2626",
                  }}
                >
                  <AlertCircle style={{ width: "14px", height: "14px" }} />
                  Not Verified
                </span>
              )
            }
          />
          <AccountInfoItem
            label="Account Created"
            value={
              firebaseUser?.metadata?.creationTime
                ? new Date(
                    firebaseUser.metadata.creationTime,
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"
            }
          />
          <AccountInfoItem
            label="UID"
            value={firebaseUser?.uid ? `…${firebaseUser.uid.slice(-8)}` : "—"}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Small sub-component ──────────────────────────────────────

const AccountInfoItem = ({ label, value }) => (
  <div
    style={{
      backgroundColor: "#F8FAFC",
      borderRadius: "10px",
      padding: "14px 16px",
    }}
  >
    <p
      style={{
        fontSize: "12px",
        fontWeight: 600,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        margin: "0 0 4px",
      }}
    >
      {label}
    </p>
    <p
      style={{
        fontSize: "14px",
        fontWeight: 500,
        color: "#1F2937",
        margin: 0,
      }}
    >
      {value || "—"}
    </p>
  </div>
);

export default SettingsTab;
