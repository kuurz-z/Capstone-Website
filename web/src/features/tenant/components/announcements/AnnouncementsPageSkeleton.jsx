import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * AnnouncementsPageSkeleton — shimmer skeleton that mirrors the AnnouncementsPage layout.
 */
export default function AnnouncementsPageSkeleton() {
 return (
 <div className="tenant-page">
 {/* Page Header */}
 <div className="page-header">
 <div>
 <SkeletonPulse width="220px" height="26px" style={{ marginBottom: 8 }} />
 <SkeletonPulse width="340px" height="14px" />
 </div>
 </div>

 {/* Filter Tabs */}
 <div className="filter-tabs">
 {["All", "Maintenance", "Utilities", "Policy", "Reminder"].map((label) => (
 <SkeletonPulse
 key={label}
 width={`${label.length * 10 + 20}px`}
 height="34px"
 borderRadius="8px"
 />
 ))}
 </div>

 {/* Announcement Cards */}
 <div className="announcements-list">
 {[1, 2, 3, 4].map((i) => (
 <div className="announcement-card" key={i}>
 <div className="announcement-header">
 <div className="announcement-title-row">
 <SkeletonPulse width={`${55 + i * 8}%`} height="18px" />
 </div>
 <div className="announcement-meta" style={{ display: "flex", gap: 10, marginTop: 8 }}>
 <SkeletonPulse width="80px" height="22px" borderRadius="10px" />
 <SkeletonPulse width="90px" height="14px" />
 </div>
 </div>
 <SkeletonPulse width="90%" height="14px" style={{ marginTop: 12, marginBottom: 4 }} />
 <SkeletonPulse width="70%" height="14px" />
 </div>
 ))}
 </div>
 </div>
 );
}
