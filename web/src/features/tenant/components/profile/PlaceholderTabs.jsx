import React from "react";
import { Bell, Settings } from "lucide-react";

/**
 * Placeholder tabs for Notifications and Settings.
 * These are stub/coming-soon views.
 */

const PlaceholderTab = ({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  description,
}) => (
  <div className="max-w-4xl" style={{ padding: "32px" }}>
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
        {title}
      </h1>
      <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
        {subtitle}
      </p>
    </div>
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        backgroundColor: "#fff",
        borderRadius: "12px",
        border: "1px solid #E8EBF0",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          backgroundColor: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <Icon style={{ width: "28px", height: "28px", color: iconColor }} />
      </div>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#1F2937",
          margin: "0 0 6px",
        }}
      >
        {description.heading}
      </h3>
      <p style={{ fontSize: "14px", color: "#94A3B8", margin: 0 }}>
        {description.body}
      </p>
    </div>
  </div>
);

export const NotificationsTab = () => (
  <PlaceholderTab
    icon={Bell}
    iconBg="#FFF7ED"
    iconColor="#E7710F"
    title="Notifications"
    subtitle="Stay updated on your reservation and account activity"
    description={{
      heading: "No Notifications",
      body: "You\u2019re all caught up! Notifications about your reservations will appear here.",
    }}
  />
);

export const SettingsTab = () => (
  <PlaceholderTab
    icon={Settings}
    iconBg="#F0F4FF"
    iconColor="#6366F1"
    title="Settings"
    subtitle="Manage your account preferences"
    description={{
      heading: "Coming Soon",
      body: "Account settings and preferences will be available here in a future update.",
    }}
  />
);
