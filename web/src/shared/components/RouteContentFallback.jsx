import React from "react";
import "./RouteContentFallback.css";

export default function RouteContentFallback() {
 return (
 <div className="route-content-fallback" aria-hidden="true">
 <div className="route-content-fallback-bar route-content-fallback-bar-lg" />
 <div className="route-content-fallback-bar route-content-fallback-bar-md" />
 <div className="route-content-fallback-card-grid">
 <div className="route-content-fallback-card" />
 <div className="route-content-fallback-card" />
 <div className="route-content-fallback-card" />
 </div>
 </div>
 );
}
