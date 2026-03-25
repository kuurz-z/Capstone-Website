import React from "react";
import { Ticket } from "lucide-react";
import "./VisitPassEmpty.css";

/**
 * VisitPassEmpty — placeholder shown when no visit is scheduled yet.
 * Rendered in the right column of the dashboard grid.
 */
export default function VisitPassEmpty() {
  return (
    <div className="visit-pass-empty__card">
      <div className="visit-pass-empty__icon-wrap">
        <Ticket size={32} strokeWidth={1.5} className="visit-pass-empty__icon" />
      </div>
      <p className="visit-pass-empty__text">
        Your visit pass will appear here once your visit is scheduled
      </p>
    </div>
  );
}
