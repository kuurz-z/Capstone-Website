import React from "react";
import { Check } from "lucide-react";

/**
 * Progress bar showing section completion count and auto-save status.
 */
const ApplicationProgressBar = ({
  completedCount,
  totalSections,
  saveStatus,
}) => (
  <div style={{ marginBottom: "24px" }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
      }}
    >
      <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>
        {completedCount} of {totalSections} sections complete
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {saveStatus && (
          <span
            style={{
              fontSize: "12px",
              fontWeight: "500",
              color:
                saveStatus === "saving"
                  ? "#6B7280"
                  : saveStatus === "saved"
                    ? "#059669"
                    : saveStatus === "error"
                      ? "#DC2626"
                      : "#9CA3AF",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Draft saved"}
            {saveStatus === "error" && "Save failed"}
          </span>
        )}
        <span
          style={{
            fontSize: "12px",
            color: completedCount === totalSections ? "#059669" : "#9CA3AF",
          }}
        >
          {completedCount === totalSections
            ? <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Check size={12} /> Ready to submit</span>
            : `${Math.round((completedCount / totalSections) * 100)}%`}
        </span>
      </div>
    </div>
    <div
      style={{
        width: "100%",
        height: "6px",
        backgroundColor: "#E5E7EB",
        borderRadius: "999px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${(completedCount / totalSections) * 100}%`,
          height: "100%",
          backgroundColor:
            completedCount === totalSections ? "#10B981" : "#FF8C42",
          borderRadius: "999px",
          transition: "width 0.3s ease",
        }}
      />
    </div>
  </div>
);

export default ApplicationProgressBar;
