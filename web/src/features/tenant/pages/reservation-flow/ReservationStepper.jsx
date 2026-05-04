import React from "react";
import { RESERVATION_STAGES } from "./reservationFlowConstants";

/**
 * Horizontal step progress bar — display only, NOT clickable.
 * Navigation between steps only happens via the dashboard.
 *
 * Color rules:
 *   • Past locked steps  → green circle (lock icon, green label, "Read-only")
 *   • Current step       → orange circle (step number, orange label, pulse glow)
 *   • Confirmed step 5 (not viewing) → green circle (checkmark, green label)
 *   • Confirmed step 5 (viewing it)  → orange circle (checkmark, orange label)
 *   • Future steps       → grey circle (step number, muted label, 40% opacity)
 */
const ReservationStepper = ({
  currentStage,
  isStageLocked,
  paymentApproved,
}) => (
  <div className="rf-stepper">
    <div className="rf-stepper-track">
      {RESERVATION_STAGES.map((stage, index) => {
        const isActive = stage.id === currentStage;
        const locked = isStageLocked(stage.id);
        const isLast = index === RESERVATION_STAGES.length - 1;

        // Any locked step (before OR after current) = green with lock icon
        const isPastLocked = !isActive && locked;

        // Step 5 confirmed but NOT currently viewing = green checkmark
        const isConfirmedNotViewing =
          stage.id === 5 && paymentApproved && !isActive;

        // Step 5 confirmed AND currently viewing = orange checkmark
        const isConfirmedViewing =
          stage.id === 5 && paymentApproved && isActive;

        // Determine class
        let stepClass = "";
        if (isPastLocked || isConfirmedNotViewing) stepClass = "complete";
        else if (isActive) stepClass = "active";

        // Determine icon
        let icon;
        if (isPastLocked) {
          icon = <LockIcon />;
        } else if (isConfirmedNotViewing || isConfirmedViewing) {
          icon = <CheckIcon />;
        } else {
          icon = <span>{index + 1}</span>;
        }

        // Line coloring: green if left step is past/locked or confirmed
        const lineColored = isPastLocked || isConfirmedNotViewing;

        return (
          <div key={stage.id} style={{ display: "contents" }}>
            <div
              className={`rf-stepper-step ${stepClass}`}
              style={{
                cursor: "default",
                opacity:
                  isActive || isPastLocked || isConfirmedNotViewing || isConfirmedViewing
                    ? 1
                    : 0.4,
              }}
              title={
                isPastLocked
                  ? `${stage.label} (Read-only)`
                  : stage.label
              }
            >
              <div className="rf-stepper-dot">{icon}</div>
              <span className="rf-stepper-label">
                {stage.label}
                {isPastLocked && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#9CA3AF",
                      display: "block",
                    }}
                  >
                    Read-only
                  </span>
                )}
              </span>
            </div>
            {!isLast && (
              <div
                className={`rf-stepper-line ${lineColored ? "complete" : ""}`}
              />
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const LockIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

export default ReservationStepper;
