import React from "react";
import "./GlobalLoading.css";

export default function GlobalLoading() {
 return (
 <div className="global-loading-overlay">
 <div className="global-loading-shell" aria-live="polite" aria-busy="true">
 <div className="global-spinner" />
 </div>
 </div>
 );
}
