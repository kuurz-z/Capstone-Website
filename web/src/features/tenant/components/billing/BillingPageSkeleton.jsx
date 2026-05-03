import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * BillingPageSkeleton — shimmer skeleton that mirrors the BillingPage layout.
 */
export default function BillingPageSkeleton() {
 return (
 <div className="tenant-billing">
 {/* Page Header */}
 <div className="billing-page-header">
 <SkeletonPulse width="200px" height="28px" style={{ marginBottom: 8 }} />
 <SkeletonPulse width="300px" height="16px" />
 </div>

 {/* Current Bill Hero Card */}
 <div
 style={{
 background: "linear-gradient(135deg, #0A1628 0%, #1a4a7a 100%)",
 borderRadius: 16,
 padding: "28px 32px",
 marginBottom: 24,
 }}
 >
 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
 <SkeletonPulse width="140px" height="16px" style={{ opacity: 0.3 }} />
 <SkeletonPulse width="80px" height="24px" borderRadius="12px" style={{ opacity: 0.3 }} />
 </div>
 <SkeletonPulse width="180px" height="40px" style={{ opacity: 0.3, marginBottom: 8 }} />
 <SkeletonPulse width="220px" height="14px" style={{ opacity: 0.3, marginBottom: 20 }} />
 <SkeletonPulse width="260px" height="40px" borderRadius="8px" style={{ opacity: 0.3 }} />
 </div>

 {/* Charge Breakdown */}
 <div
 style={{
 background: "#fff",
 borderRadius: 12,
 padding: "24px",
 border: "1px solid #E8EBF0",
 marginBottom: 24,
 }}
 >
 <SkeletonPulse width="170px" height="18px" style={{ marginBottom: 20 }} />
 {[1, 2, 3].map((i) => (
 <div
 key={i}
 style={{
 display: "flex",
 justifyContent: "space-between",
 marginBottom: 14,
 }}
 >
 <SkeletonPulse width="120px" height="14px" />
 <SkeletonPulse width="80px" height="14px" />
 </div>
 ))}
 <div
 style={{
 borderTop: "1px solid #E8EBF0",
 paddingTop: 14,
 display: "flex",
 justifyContent: "space-between",
 }}
 >
 <SkeletonPulse width="140px" height="16px" />
 <SkeletonPulse width="100px" height="16px" />
 </div>
 </div>

 {/* Bill History */}
 <div
 style={{
 background: "#fff",
 borderRadius: 12,
 padding: "24px",
 border: "1px solid #E8EBF0",
 }}
 >
 <SkeletonPulse width="120px" height="18px" style={{ marginBottom: 16 }} />
 {[1, 2].map((i) => (
 <div
 key={i}
 style={{
 display: "flex",
 justifyContent: "space-between",
 alignItems: "center",
 padding: "12px 0",
 borderBottom: "1px solid #F1F3F5",
 }}
 >
 <div>
 <SkeletonPulse width="130px" height="14px" style={{ marginBottom: 6 }} />
 <SkeletonPulse width="100px" height="12px" />
 </div>
 <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
 <SkeletonPulse width="80px" height="14px" />
 <SkeletonPulse width="60px" height="22px" borderRadius="10px" />
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}
