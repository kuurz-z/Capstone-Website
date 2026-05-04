import React from "react";
import "./GlobalLoading.css";

export default function GlobalLoading({ message = "" }) {
  return (
    <div className="global-loading-overlay">
      <div className="global-loading-shell" aria-live="polite" aria-busy="true">
        <div className="global-spinner" />
        {message ? <p className="global-loading-message">{message}</p> : null}
      </div>
    </div>
  );
}
