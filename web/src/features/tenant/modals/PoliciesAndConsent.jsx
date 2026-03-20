import React from "react";
import { X } from "lucide-react";

/* ─── Shared modal wrapper ─── */
const ModalOverlay = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-card, #fff)",
          borderRadius: "12px",
          maxWidth: "640px",
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const SectionTitle = ({ children }) => (
  <h3
    style={{
      fontSize: "14px",
      fontWeight: "700",
      color: "var(--text-heading, #111827)",
      margin: "20px 0 10px",
      paddingBottom: "6px",
      borderBottom: "1px solid var(--border-card, #F3F4F6)",
    }}
  >
    {children}
  </h3>
);

const PolicyList = ({ items }) => (
  <ul
    style={{
      margin: "0 0 16px 0",
      paddingLeft: "20px",
      listStyleType: "disc",
    }}
  >
    {items.map((item, i) => (
      <li key={i} style={{ marginBottom: "6px", color: "var(--text-body, #374151)" }}>
        {item}
      </li>
    ))}
  </ul>
);

/* ─── Policies & Terms Modal ─── */
export function PoliciesTermsModal({ isOpen, onClose }) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: "1px solid var(--border-card, #E5E7EB)",
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: "700",
            margin: 0,
            color: "var(--text-heading, #111827)",
          }}
        >
          Policies & Terms of Service
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            color: "var(--text-muted, #6B7280)",
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          padding: "20px 24px",
          overflowY: "auto",
          fontSize: "13px",
          lineHeight: "1.7",
          color: "var(--text-body, #374151)",
          flex: 1,
        }}
      >
        <SectionTitle>Dormitory Policies</SectionTitle>
        <PolicyList
          items={[
            "Curfew time is strictly observed.",
            "No smoking or illegal substances allowed within the premises.",
            "Guests must be approved by management in advance.",
            "All facilities must be used responsibly.",
            "Quiet hours are enforced from 10:00 PM to 8:00 AM.",
            "Monthly dues must be paid on or before the due date.",
            "Room inspections may be conducted on a monthly basis.",
          ]}
        />

        <SectionTitle>House Rules</SectionTitle>
        <PolicyList
          items={[
            "Keep common areas clean and organized at all times.",
            "Respect the privacy and personal space of other residents.",
            "No loud music or disruptive activities after quiet hours.",
            "Lock your room when leaving the premises.",
            "Report maintenance issues to the management immediately.",
          ]}
        />

        <SectionTitle>Lease Agreement</SectionTitle>
        <p style={{ marginBottom: "12px" }}>
          By applying, you agree to abide by all policies and rules set forth by
          Lilycrest / First JRAC Partnership Co. The lease agreement is binding
          for the specified duration. Violations may result in lease termination
          without prior notice.
        </p>
        <p style={{ marginBottom: "0" }}>
          The security deposit is non-refundable in the event of early
          termination. Any property damage charges will be deducted from the
          deposit accordingly.
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border-card, #E5E7EB)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "11px",
            background: "#1F2937",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          I Understand
        </button>
      </div>
    </ModalOverlay>
  );
}

/* ─── Privacy Consent & Certification Modal ─── */
export function PrivacyConsentModal({ isOpen, onClose }) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: "1px solid var(--border-card, #E5E7EB)",
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: "700",
            margin: 0,
            color: "var(--text-heading, #111827)",
          }}
        >
          Privacy Consent & Certification
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            color: "var(--text-muted, #6B7280)",
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          padding: "20px 24px",
          overflowY: "auto",
          fontSize: "13px",
          lineHeight: "1.7",
          color: "var(--text-body, #374151)",
          flex: 1,
        }}
      >
        <SectionTitle>Privacy Policy</SectionTitle>
        <p style={{ marginBottom: "12px" }}>
          By submitting this application, you grant Lilycrest / First JRAC
          Partnership Co. permission to collect and process your personal
          information for dormitory operations and services, including:
        </p>
        <PolicyList
          items={[
            "Contact and residence information",
            "Identification documents for verification",
            "Emergency contact details",
            "Employment and education records",
            "Payment and billing information",
          ]}
        />
        <p style={{ marginBottom: "0" }}>
          All information is kept confidential and will not be shared with third
          parties without explicit consent, except as required by law or for
          dormitory operations.
        </p>

        <SectionTitle>Data Protection</SectionTitle>
        <p style={{ marginBottom: "0" }}>
          Your data is securely stored with access restricted to authorized
          personnel only. You have the right to request access to your
          information or request its deletion, subject to applicable legal
          obligations.
        </p>

        <SectionTitle>Certification Statement</SectionTitle>
        <p style={{ marginBottom: "12px" }}>
          I hereby certify that the information provided in this application is
          true, accurate, and complete to the best of my knowledge and belief. I
          understand that any false information, misrepresentation, or omission
          of facts may be grounds for:
        </p>
        <PolicyList
          items={[
            "Rejection of this application",
            "Termination of lease agreement",
            "Legal action as deemed appropriate",
          ]}
        />
        <p
          style={{
            marginBottom: "0",
            fontStyle: "italic",
            color: "var(--text-muted, #6B7280)",
            fontSize: "12px",
          }}
        >
          I have read and understand the contents of this agreement and consent
          to the collection and use of my personal information as outlined
          above.
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border-card, #E5E7EB)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "11px",
            background: "#1F2937",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          I Acknowledge
        </button>
      </div>
    </ModalOverlay>
  );
}
