import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * ProfilePageSkeleton — shimmer skeleton that mirrors the ProfilePage layout.
 * Shown while profile + reservations data loads for the first time.
 */
export default function ProfilePageSkeleton() {
 return (
 <div className="min-h-screen flex" style={{ backgroundColor: "#F7F8FA" }}>
 {/* ─── Sidebar Skeleton ─── */}
 <aside
 className="w-64 bg-card border-r flex flex-col"
 style={{ borderColor: "#E8EBF0", minHeight: "100vh" }}
 >
 {/* Logo */}
 <div className="p-5 border-b" style={{ borderColor: "#E8EBF0" }}>
 <div className="flex items-center gap-3">
 <SkeletonPulse width="36px" height="36px" borderRadius="8px" />
 <SkeletonPulse width="90px" height="18px" />
 </div>
 </div>

 {/* User Card */}
 <div className="px-5 py-4 border-b" style={{ borderColor: "#E8EBF0" }}>
 <div className="flex items-center gap-3">
 <SkeletonPulse variant="circle" width="40px" />
 <div style={{ flex: 1 }}>
 <SkeletonPulse width="100px" height="14px" style={{ marginBottom: 6 }} />
 <SkeletonPulse width="140px" height="11px" />
 </div>
 </div>
 </div>

 {/* Browse Rooms CTA */}
 <div className="px-4 pt-4 pb-2">
 <SkeletonPulse height="40px" borderRadius="8px" />
 </div>

 {/* Nav Sections */}
 <nav className="flex-1 px-4 py-3" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
 {/* Main */}
 <div>
 <SkeletonPulse width="40px" height="10px" style={{ marginBottom: 10, marginLeft: 12 }} />
 <SkeletonPulse height="36px" borderRadius="8px" />
 </div>

 {/* Account */}
 <div>
 <SkeletonPulse width="55px" height="10px" style={{ marginBottom: 10, marginLeft: 12 }} />
 {[1, 2, 3].map((i) => (
 <SkeletonPulse
 key={i}
 height="36px"
 borderRadius="8px"
 style={{ marginBottom: 4 }}
 />
 ))}
 </div>

 {/* Preferences */}
 <div>
 <SkeletonPulse width="78px" height="10px" style={{ marginBottom: 10, marginLeft: 12 }} />
 {[1, 2].map((i) => (
 <SkeletonPulse
 key={i}
 height="36px"
 borderRadius="8px"
 style={{ marginBottom: 4 }}
 />
 ))}
 </div>
 </nav>

 {/* Sign Out */}
 <div className="px-4 py-3 border-t" style={{ borderColor: "#E8EBF0" }}>
 <SkeletonPulse height="36px" borderRadius="8px" />
 </div>
 </aside>

 {/* ─── Main Content Skeleton ─── */}
 <div className="flex-1 flex flex-col">
 {/* Top Header */}
 <header
 className="bg-card border-b flex items-center px-8"
 style={{ borderColor: "#E8EBF0", height: 60, minHeight: 60 }}
 >
 <SkeletonPulse width="120px" height="16px" />
 </header>

 {/* Dashboard Tab Skeleton */}
 <main className="flex-1 overflow-auto">
 <div className="p-8" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
 {/* Welcome Banner */}
 <SkeletonPulse height="100px" borderRadius="16px" />

 {/* Profile Completion + Quick Actions Row */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
 <SkeletonPulse height="140px" borderRadius="12px" />
 <SkeletonPulse height="140px" borderRadius="12px" />
 </div>

 {/* Reservation Card */}
 <SkeletonPulse height="180px" borderRadius="12px" />

 {/* Activity Section */}
 <div>
 <SkeletonPulse width="160px" height="18px" style={{ marginBottom: 12 }} />
 {[1, 2, 3].map((i) => (
 <div
 key={i}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 12,
 marginBottom: 12,
 }}
 >
 <SkeletonPulse variant="circle" width="32px" />
 <div style={{ flex: 1 }}>
 <SkeletonPulse width="60%" height="13px" style={{ marginBottom: 6 }} />
 <SkeletonPulse width="40%" height="11px" />
 </div>
 <SkeletonPulse width="60px" height="11px" />
 </div>
 ))}
 </div>
 </div>
 </main>
 </div>
 </div>
 );
}
