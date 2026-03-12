import React from "react";

/**
 * AccountBlockedBanner — Shown at the top of the layout when a user's
 * account is suspended or banned. The backend already blocks API calls
 * (returns 403), this banner provides a clear visual message.
 */

const STATUS_CONFIG = {
  suspended: {
    icon: "⚠️",
    title: "Account Suspended",
    message: "Your account has been temporarily suspended. You won't be able to access most features until your account is reactivated. Please contact support for assistance.",
    bgColor: "#fffbeb",
    borderColor: "#fbbf24",
    textColor: "#92400e",
  },
  banned: {
    icon: "🚫",
    title: "Account Banned",
    message: "Your account has been permanently disabled due to policy violations. If you believe this is a mistake, please contact administration.",
    bgColor: "#fef2f2",
    borderColor: "#f87171",
    textColor: "#991b1b",
  },
};

export default function AccountBlockedBanner({ accountStatus }) {
  const config = STATUS_CONFIG[accountStatus];
  if (!config) return null;

  return (
    <div
      className="account-blocked-banner"
      style={{
        background: config.bgColor,
        borderBottom: `2px solid ${config.borderColor}`,
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        fontSize: "0.875rem",
        color: config.textColor,
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontSize: "20px", flexShrink: 0 }}>{config.icon}</span>
      <div>
        <strong style={{ fontWeight: 700 }}>{config.title}</strong>
        <span style={{ marginLeft: "8px" }}>{config.message}</span>
      </div>
    </div>
  );
}
