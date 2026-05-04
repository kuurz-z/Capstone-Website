import React from "react";
import SkeletonPulse from "../../../../shared/components/SkeletonPulse";

/**
 * CheckAvailabilitySkeleton — shimmer skeleton room cards shown while rooms load.
 * Renders inside the existing grid container.
 */
export default function CheckAvailabilitySkeleton({ count = 8 }) {
 return (
 <>
 {Array.from({ length: count }).map((_, i) => (
 <article
 key={i}
 className="group rounded-2xl border border-border overflow-hidden"
 style={{ pointerEvents: "none" }}
 >
 {/* Image placeholder */}
 <div className="relative aspect-square">
 <SkeletonPulse width="100%" height="100%" borderRadius="0" />
 </div>
 {/* Text area */}
 <div className="p-4 space-y-2">
 <SkeletonPulse width="70%" height="16px" />
 <SkeletonPulse width="50%" height="13px" />
 <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
 <SkeletonPulse width="90px" height="13px" />
 <SkeletonPulse width="70px" height="16px" />
 </div>
 </div>
 </article>
 ))}
 </>
 );
}
