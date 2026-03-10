import React from "react";
import { RESERVATION_STAGES } from "./reservationFlowConstants";

/**
 * Horizontal step progress bar with clickable steps, lock/check icons.
 */
const ReservationStepper = ({
  currentStage,
  isStageClickable,
  isStageLocked,
  onStepperClick,
}) => (
  <div className="rf-stepper">
    <div className="rf-stepper-track">
      {RESERVATION_STAGES.map((stage, index) => {
        const isDone = stage.id < currentStage;
        const isActive = stage.id === currentStage;
        const clickable = isStageClickable(stage.id);
        const locked = isStageLocked(stage.id);
        const stepClass = isActive ? "active" : isDone ? "done" : "";
        const isLast = index === RESERVATION_STAGES.length - 1;

        return (
          <div key={stage.id} style={{ display: "contents" }}>
            <div
              className={`rf-stepper-step ${stepClass}`}
              onClick={() => clickable && onStepperClick(stage.id)}
              style={{
                cursor: clickable ? "pointer" : "default",
                opacity: isActive || isDone ? 1 : !clickable ? 0.4 : 1,
              }}
              title={
                locked
                  ? `${stage.label} (Read-only)`
                  : clickable
                    ? `Go to ${stage.label}`
                    : stage.label
              }
            >
              <div className="rf-stepper-dot">
                {isDone ? (
                  locked ? (
                    <LockIcon />
                  ) : (
                    <CheckIcon />
                  )
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span className="rf-stepper-label">
                {stage.label}
                {locked && isDone && (
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
              <div className={`rf-stepper-line ${isDone ? "done" : ""}`} />
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
