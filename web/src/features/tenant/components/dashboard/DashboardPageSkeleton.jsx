import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * DashboardPageSkeleton — shimmer skeleton that mirrors the DashboardPage layout.
 */
export default function DashboardPageSkeleton() {
  return (
      <div className="dashboard-page">
        {/* Welcome Header */}
        <div className="dashboard-header">
          <div>
            <SkeletonPulse width="260px" height="28px" style={{ marginBottom: 8 }} />
            <SkeletonPulse width="320px" height="16px" />
          </div>
          <div className="dashboard-status-badge">
            <SkeletonPulse width="90px" height="26px" borderRadius="20px" />
          </div>
        </div>

        {/* Cards */}
        <div className="dashboard-content">
          <div className="dashboard-cards">
            {[1, 2, 3].map((i) => (
              <div className="dashboard-card" key={i}>
                <div className="card-icon">
                  <SkeletonPulse width="40px" height="40px" borderRadius="10px" />
                </div>
                <div className="card-content">
                  <SkeletonPulse width="100px" height="18px" style={{ marginBottom: 8 }} />
                  <SkeletonPulse width="180px" height="14px" style={{ marginBottom: 12 }} />
                  <SkeletonPulse width="110px" height="32px" borderRadius="6px" />
                </div>
              </div>
            ))}
          </div>

          {/* Announcements Preview */}
          <div className="dashboard-section">
            <div className="section-header">
              <SkeletonPulse width="200px" height="20px" />
              <SkeletonPulse width="60px" height="14px" />
            </div>
            <div className="announcements-preview">
              {[1, 2].map((i) => (
                <div className="announcement-preview-item" key={i}>
                  <div className="announcement-preview-content">
                    <SkeletonPulse width="70%" height="16px" style={{ marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 12 }}>
                      <SkeletonPulse width="80px" height="12px" />
                      <SkeletonPulse width="90px" height="12px" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
  );
}
