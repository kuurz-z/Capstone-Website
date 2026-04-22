import React from "react";
import {
  MOVE_IN_TIME_SLOTS,
  REFERRAL_OPTIONS,
  WORK_SCHEDULE_OPTIONS,
  LEASE_OPTIONS,
} from "../applicationFormConstants";

const errBorder = (show, value) =>
  show && !value ? "1.5px solid #dc2626" : undefined;

/**
 * Section 5: Dorm Preferences — referral, move-in date/time, lease, work schedule.
 */
const DormPreferencesSection = ({
  referralSource, setReferralSource,
  referrerName, setReferrerName,
  targetMoveInDate, setTargetMoveInDate,
  estimatedMoveInTime, setEstimatedMoveInTime,
  leaseDuration, setLeaseDuration,
  workSchedule, setWorkSchedule,
  workScheduleOther, setWorkScheduleOther,
  handleTargetDateInput, handleTimeInput,
  readOnly, moveInMin, moveInMax, fieldErrors,
  showValidationErrors,
}) => (
  <>
    {/* Referral Source */}
    <div className="form-group" data-field="referralSource">
      <label className="form-label">
        How Did You First Learn About Lilycrest Gil Puyat?{" "}
        <span className="rf-required">*</span>
      </label>
      <div
        className="radio-group"
        style={{
          border: errBorder(showValidationErrors, referralSource),
          borderRadius: "8px",
          padding: showValidationErrors && !referralSource ? "8px" : undefined,
        }}
      >
        {REFERRAL_OPTIONS.map((opt) => (
          <div className="radio-option" key={opt.id}>
            <input
              type="radio"
              name="referral"
              id={opt.id}
              value={opt.value}
              checked={referralSource === opt.value}
              onChange={(e) => setReferralSource(e.target.value)}
            />
            <label htmlFor={opt.id} className="radio-label">
              {opt.label}
            </label>
          </div>
        ))}
      </div>
      <FieldError error={showValidationErrors && !referralSource ? "Please select how you learned about us" : null} />
    </div>

    {referralSource === "friend" && (
      <div className="form-group">
        <label className="form-label">
          If Personally Referred, Please Indicate the Name
        </label>
        <input
          type="text"
          className="form-input"
          value={referrerName}
          onChange={(e) => setReferrerName(e.target.value)}
        />
      </div>
    )}

    {/* Move-in Date */}
    <div className="form-group" data-field="targetMoveInDate">
      <label className="form-label">
        Target Move In Date (within 3 months) <span className="rf-required">*</span>
      </label>
      <input
        type="date"
        className="form-input"
        value={targetMoveInDate}
        min={moveInMin}
        max={moveInMax}
        onChange={(e) => handleTargetDateInput(e.target.value)}
        disabled={readOnly}
        required
        style={{
          colorScheme: "light",
          cursor: readOnly ? "not-allowed" : "pointer",
          border: errBorder(showValidationErrors, targetMoveInDate),
        }}
      />
      <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>
        Must be at least 3 days from today
      </div>
      <FieldError error={showValidationErrors && !targetMoveInDate ? "Move-in date is required" : fieldErrors.targetMoveInDate} />
    </div>

    {/* Move-in Time */}
    <div className="form-group" data-field="estimatedMoveInTime">
      <label className="form-label">
        Estimated Time of Move In (8:00 AM to 6:00 PM) <span className="rf-required">*</span>
      </label>
      <select
        className="form-select"
        value={estimatedMoveInTime}
        onChange={(e) => handleTimeInput(e.target.value)}
        style={{
          cursor: "pointer",
          padding: "10px 12px",
          borderRadius: "8px",
          border: errBorder(showValidationErrors, estimatedMoveInTime) || "1.5px solid #d1d5db",
          fontSize: "14px",
          background: "white",
          width: "100%",
        }}
      >
        <option value="">Select time...</option>
        {MOVE_IN_TIME_SLOTS.map((slot) => (
          <option key={slot.value} value={slot.value}>
            {slot.label}
          </option>
        ))}
      </select>
      <FieldError error={showValidationErrors && !estimatedMoveInTime ? "Please select a move-in time" : fieldErrors.estimatedMoveInTime} />
    </div>

    {/* Lease Duration */}
    <div className="form-group">
      <label className="form-label">Duration of Lease <span style={{ fontSize: "11px", color: "#6B7280", fontWeight: 400 }}>(optional)</span></label>
      <select
        className="form-select"
        value={leaseDuration}
        onChange={(e) => setLeaseDuration(e.target.value)}
      >
        <option value="">Select duration...</option>
        {LEASE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>

    {/* Work Schedule */}
    <div className="form-group" data-field="workSchedule">
      <label className="form-label">
        Work Schedule <span className="rf-required">*</span>
      </label>
      <div
        className="radio-group"
        style={{
          border: errBorder(showValidationErrors, workSchedule),
          borderRadius: "8px",
          padding: showValidationErrors && !workSchedule ? "8px" : undefined,
        }}
      >
        {WORK_SCHEDULE_OPTIONS.map((opt) => (
          <div className="radio-option" key={opt.id}>
            <input
              type="radio"
              name="schedule"
              id={opt.id}
              value={opt.value}
              checked={workSchedule === opt.value}
              onChange={(e) => setWorkSchedule(e.target.value)}
            />
            <label htmlFor={opt.id} className="radio-label">
              {opt.label}
            </label>
          </div>
        ))}
      </div>
      <FieldError error={showValidationErrors && !workSchedule ? "Please select your work schedule" : null} />
    </div>

    {workSchedule === "others" && (
      <div className="form-group" data-field="workScheduleOther">
        <label className="form-label">
          If You Answered "Others", Please Specify Your Work Schedule Below *
        </label>
        <textarea
          className="form-textarea"
          value={workScheduleOther}
          onChange={(e) => setWorkScheduleOther(e.target.value)}
          placeholder="Please describe your typical work schedule"
        />
        <FieldError
          error={
            showValidationErrors && workSchedule === "others" && !workScheduleOther
              ? "Please describe your work schedule"
              : null
          }
        />
      </div>
    )}
  </>
);

const FieldError = ({ error }) => {
  if (!error) return null;
  return (
    <div className="rf-field-error">
      {error}
    </div>
  );
};

export default DormPreferencesSection;
