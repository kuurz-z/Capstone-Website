import React from "react";
import {
  MOVE_IN_TIME_SLOTS,
  REFERRAL_OPTIONS,
  WORK_SCHEDULE_OPTIONS,
  LEASE_OPTIONS,
} from "../applicationFormConstants";

/**
 * Section 5: Dorm Preferences — referral, move-in date/time, lease, work schedule.
 */
const DormPreferencesSection = ({
  referralSource,
  setReferralSource,
  referrerName,
  setReferrerName,
  targetMoveInDate,
  setTargetMoveInDate,
  estimatedMoveInTime,
  setEstimatedMoveInTime,
  leaseDuration,
  setLeaseDuration,
  workSchedule,
  setWorkSchedule,
  workScheduleOther,
  setWorkScheduleOther,
  handleTargetDateInput,
  handleTimeInput,
  readOnly,
  moveInMin,
  moveInMax,
  fieldErrors,
}) => (
  <>
    {/* Referral Source */}
    <div className="form-group">
      <label className="form-label">
        How Did You First Learn About Lilycrest Gil Puyat?
      </label>
      <div className="radio-group">
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
    <div className="form-group">
      <label className="form-label">
        Target Move In Date (within 3 months) *
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
        }}
      />
      <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}>
        Must be at least 3 days from today
      </div>
      {fieldErrors.targetMoveInDate && (
        <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
          {fieldErrors.targetMoveInDate}
        </div>
      )}
    </div>

    {/* Move-in Time */}
    <div className="form-group">
      <label className="form-label">
        Estimated Time of Move In (8:00 AM to 6:00 PM) *
      </label>
      <select
        className="form-select"
        value={estimatedMoveInTime}
        onChange={(e) => handleTimeInput(e.target.value)}
        style={{
          cursor: "pointer",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1.5px solid #d1d5db",
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
      {fieldErrors.estimatedMoveInTime && (
        <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
          {fieldErrors.estimatedMoveInTime}
        </div>
      )}
    </div>

    {/* Lease Duration */}
    <div className="form-group">
      <label className="form-label">Duration of Lease</label>
      <select
        className="form-select"
        value={leaseDuration}
        onChange={(e) => setLeaseDuration(e.target.value)}
      >
        {LEASE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>

    {/* Work Schedule */}
    <div className="form-group">
      <label className="form-label">Work Schedule</label>
      <div className="radio-group">
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
    </div>

    {workSchedule === "others" && (
      <div className="form-group">
        <label className="form-label">
          If You Answered "Others", Please Specify Your Work Schedule Below *
        </label>
        <textarea
          className="form-textarea"
          value={workScheduleOther}
          onChange={(e) => setWorkScheduleOther(e.target.value)}
          placeholder="Please describe your typical work schedule"
        />
      </div>
    )}
  </>
);

export default DormPreferencesSection;
