import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * MaintenancePageSkeleton — shimmer skeleton that mirrors the MaintenancePage layout.
 */
export default function MaintenancePageSkeleton() {
 return (
 <div className="tenant-page">
 {/* Page Header */}
 <div className="page-header">
 <div>
 <SkeletonPulse width="240px" height="26px" style={{ marginBottom: 8 }} />
 <SkeletonPulse width="280px" height="14px" />
 </div>
 <SkeletonPulse width="130px" height="38px" borderRadius="8px" />
 </div>

 {/* Request History Section */}
 <div className="section-card">
 <SkeletonPulse width="140px" height="20px" style={{ marginBottom: 16 }} />
 <div className="maintenance-list">
 {[1, 2, 3].map((i) => (
 <div className="maintenance-item" key={i}>
 <div className="maintenance-info">
 <SkeletonPulse width={`${50 + i * 10}%`} height="16px" style={{ marginBottom: 8 }} />
 <div style={{ display: "flex", gap: 8 }}>
 <SkeletonPulse width="70px" height="12px" />
 <SkeletonPulse width="90px" height="12px" />
 </div>
 </div>
 <SkeletonPulse width="80px" height="24px" borderRadius="12px" />
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
