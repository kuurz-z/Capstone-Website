/**
 * ProfileCompletionCard — Shows profile completion % with animated bar
 *
 * Calculates completion based on profile fields. Shows missing fields
 * and auto-hides when profile is 100% complete.
 *
 * Usage in DashboardTab:
 *   <ProfileCompletionCard
 *     profileData={profileData}
 *     onGoToPersonal={() => setActiveTab("personal")}
 *   />
 */

import React, { useMemo } from "react";
import { BarChart3, ArrowRight } from "lucide-react";

// Fields that count toward profile completion
const COMPLETION_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone Number", required: false },
  { key: "address", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "dateOfBirth", label: "Date of Birth", required: false },
  { key: "emergencyContact", label: "Emergency Contact", required: false },
  { key: "emergencyPhone", label: "Emergency Phone", required: false },

];

const ProfileCompletionCard = ({ profileData, onGoToPersonal }) => {
  const { pct, missing } = useMemo(() => {
    const filled = COMPLETION_FIELDS.filter((f) => {
      const val = profileData?.[f.key];
      if (val === null || val === undefined) return false;
      if (typeof val === "string") return val.trim() !== "";
      if (val instanceof Date) return true;
      return Boolean(val);
    });

    const missingFields = COMPLETION_FIELDS.filter(
      (f) => !filled.includes(f),
    );
    const percentage = Math.round(
      (filled.length / COMPLETION_FIELDS.length) * 100,
    );

    return { pct: percentage, missing: missingFields };
  }, [profileData]);

  // Don't show when complete
  if (pct >= 100) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--surface-card, #fff)",
        borderRadius: "12px",
        border: "1px solid var(--border-card, #E8EBF0)",
        padding: "20px 24px",
        marginBottom: "20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-heading, #1F2937)",
          }}
        >
          <BarChart3
            style={{ width: "18px", height: "18px", color: "#FF8C42" }}
          />
          Profile Completion
        </div>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#FF8C42",
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: "var(--surface-muted, #F1F5F9)",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #FF8C42, #F59E0B)",
            borderRadius: "999px",
            transition: "width 0.6s cubic-bezier(0.25,0.8,0.25,1)",
          }}
        />
      </div>

      {/* Missing fields tip + CTA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "10px",
        }}
      >
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted, #94A3B8)",
            margin: 0,
          }}
        >
          Missing: {missing.slice(0, 3).map((f) => f.label).join(", ")}
          {missing.length > 3 ? ` +${missing.length - 3} more` : ""}
        </p>
        {onGoToPersonal && (
          <button
            onClick={onGoToPersonal}
            style={{
              background: "none",
              border: "none",
              color: "#FF8C42",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: 0,
            }}
          >
            Complete Now
            <ArrowRight style={{ width: "12px", height: "12px" }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileCompletionCard;
