import React from "react";

/**
 * Section 6: Agreements & Consent — privacy consent + certification checkboxes
 * with links to policy modals.
 */
const AgreementsSection = ({
  agreedToPrivacy,
  setAgreedToPrivacy,
  agreedToCertification,
  setAgreedToCertification,
  showValidationErrors,
  onShowPolicies,
  onShowPrivacy,
}) => {
  const allAgreed = agreedToPrivacy && agreedToCertification;
  const hasError = showValidationErrors && !allAgreed;

  return (
    <div
      style={{
        border: `1.5px solid ${allAgreed ? "#10B981" : hasError ? "#EF4444" : "#e5e7eb"}`,
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "12px",
        background: allAgreed ? "#F0FDF4" : hasError ? "#FEF2F2" : "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <span style={{ fontSize: "20px" }}>6</span>
        <span style={{ fontSize: "15px", fontWeight: "600", color: "#1F2937" }}>
          Agreements & Consent
        </span>
        {allAgreed ? (
          <StatusBadge text="Agreed" color="#059669" bg="#D1FAE5" />
        ) : hasError ? (
          <StatusBadge text="Required" color="#DC2626" bg="#FEE2E2" />
        ) : null}
      </div>

      {/* Privacy Consent */}
      <ConsentCheckbox
        id="privacy-consent"
        checked={agreedToPrivacy}
        onChange={(e) => setAgreedToPrivacy(e.target.checked)}
        title="Privacy Policy & Data Protection Consent"
        description="I consent to the collection and use of my personal data for dormitory services."
      />

      {/* Certification */}
      <ConsentCheckbox
        id="certification"
        checked={agreedToCertification}
        onChange={(e) => setAgreedToCertification(e.target.checked)}
        title="Information Accuracy Certification"
        description="I certify all information is true and accurate. False information may result in rejection."
      />

      {/* Policy links */}
      <div style={{ fontSize: "12px", color: "#6b7280" }}>
        By proceeding, you agree to our{" "}
        <PolicyLink onClick={onShowPolicies}>
          Policies & Terms of Service
        </PolicyLink>{" "}
        and <PolicyLink onClick={onShowPrivacy}>Privacy Policy</PolicyLink>.
      </div>
    </div>
  );
};

const StatusBadge = ({ text, color, bg }) => (
  <span
    style={{
      fontSize: "12px",
      fontWeight: "600",
      color,
      backgroundColor: bg,
      padding: "3px 10px",
      borderRadius: "999px",
      marginLeft: "auto",
    }}
  >
    {text}
  </span>
);

const ConsentCheckbox = ({ id, checked, onChange, title, description }) => (
  <div
    style={{
      display: "flex",
      gap: "10px",
      marginBottom: "12px",
      alignItems: "flex-start",
    }}
  >
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
      style={{ marginTop: "3px", cursor: "pointer" }}
    />
    <label
      htmlFor={id}
      style={{
        margin: 0,
        fontSize: "13px",
        color: "#374151",
        cursor: "pointer",
      }}
    >
      <strong>{title}</strong> <span style={{ color: "#dc2626" }}>*</span>
      <span
        style={{
          display: "block",
          fontSize: "12px",
          color: "#6b7280",
          marginTop: "2px",
        }}
      >
        {description}
      </span>
    </label>
  </div>
);

const PolicyLink = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      color: "#1E40AF",
      fontWeight: "500",
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: 0,
      fontSize: "12px",
      textDecoration: "underline",
    }}
  >
    {children}
  </button>
);

export default AgreementsSection;
