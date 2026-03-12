import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * ContractsPageSkeleton — shimmer skeleton that mirrors the ContractsPage layout.
 */
export default function ContractsPageSkeleton() {
  return (
    <>
      {/* Section Title */}
      <SkeletonPulse width="140px" height="18px" style={{ marginBottom: 16 }} />

      {/* Contract Card */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E8EBF0",
          padding: "24px",
          marginBottom: 20,
        }}
      >
        {/* Card Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <SkeletonPulse width="180px" height="20px" />
          <SkeletonPulse width="70px" height="24px" borderRadius="12px" />
        </div>
        <SkeletonPulse width="100px" height="12px" style={{ marginBottom: 20 }} />

        {/* Progress Bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <SkeletonPulse width="100px" height="12px" />
            <SkeletonPulse width="30px" height="12px" />
          </div>
          <SkeletonPulse height="8px" borderRadius="4px" />
          <SkeletonPulse width="140px" height="11px" style={{ marginTop: 8 }} />
        </div>

        {/* Detail Items */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <SkeletonPulse width="32px" height="32px" borderRadius="8px" />
              <div style={{ flex: 1 }}>
                <SkeletonPulse width="70px" height="11px" style={{ marginBottom: 6 }} />
                <SkeletonPulse width="120px" height="14px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
