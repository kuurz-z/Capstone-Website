import React from "react";
import { Check } from "lucide-react";
import { formatProperCase, sanitizeName } from "../../../../../shared/utils/authValidation";
import CustomDatePicker from "../../../../../shared/components/CustomDatePicker";
import {
 MOVE_IN_TIME_SLOTS,
 REFERRAL_OPTIONS,
 WORK_SCHEDULE_OPTIONS,
 LEASE_OPTIONS,
 getAvailableLeaseOptions,
} from "../applicationFormConstants";

const errBorder = (show, value) =>
 show && !value ? "1px solid var(--danger)" : undefined;

const openDatePicker = (event) => {
 event.currentTarget.showPicker?.();
};

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
 readOnly, moveInMin, moveInMax, fieldErrors, validateField,
 showValidationErrors,
}) => (
 <>
  {/* Referral Source */}
  <div className="form-group" data-field="referralSource">
    <label className="form-label">
      How Did You First Learn About Lilycrest?{" "}
      <span className="rf-required">*</span>
    </label>
    <div
      className="radio-group"
      style={{
        border: fieldErrors.referralSource
          ? "1px solid var(--danger)"
          : errBorder(showValidationErrors, referralSource),
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
            onChange={(e) => {
              setReferralSource(e.target.value);
              validateField("referralSource", e.target.value, (value) => ({
                valid: Boolean(value),
                error: value ? null : "Please select how you learned about us",
              }));
            }}
          />
          <label htmlFor={opt.id} className="radio-label">
            {opt.label}
          </label>
        </div>
      ))}
    </div>
    <FieldError
      error={
        showValidationErrors && !referralSource
          ? "Please select how you learned about us"
          : fieldErrors.referralSource
      }
    />
  </div>

  {referralSource === "friend" && (
    <div className="form-group" data-field="referrerName">
      <label className="form-label" htmlFor="referrerNameInput">
        If Personally Referred, Please Indicate the Name <span className="rf-required">*</span>
      </label>
      <input
        id="referrerNameInput"
        type="text"
        name="name"
        autoComplete="name"
        className="form-input"
        placeholder="Full name of referrer"
        value={referrerName}
        onChange={(e) => setReferrerName(sanitizeName(e.target.value))}
        onBlur={() => {
          if (referrerName && typeof referrerName === "string") {
            const proper = formatProperCase(referrerName.trim());
            if (proper !== referrerName) {
              setReferrerName(proper);
            }
          }
        }}
        style={{
          border:
            showValidationErrors && referralSource === "friend" && !referrerName?.trim()
              ? "1px solid var(--danger)"
              : undefined,
        }}
      />
      {showValidationErrors && referralSource === "friend" && !referrerName?.trim() && (
        <FieldError error="Please provide the name of the person who referred you" />
      )}
    </div>
  )}

  {/* Move-in Date */}
  <div className="form-group" data-field="targetMoveInDate">
    <div className="flex items-center justify-between gap-2 mb-1">
      <label className="form-label mb-0" htmlFor="intendedMoveInDateInput">
        Intended Move-in Date <span className="rf-required">*</span>
      </label>
      {targetMoveInDate && (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Pre-filled from your selection
        </span>
      )}
    </div>
    <CustomDatePicker
      id="intendedMoveInDateInput"
      value={targetMoveInDate}
      min={moveInMin}
      max={moveInMax}
      onChange={handleTargetDateInput}
      disabled={readOnly}
      readOnly={readOnly}
      required
      placeholder="Select intended move-in date..."
      error={Boolean(fieldErrors.targetMoveInDate || (showValidationErrors && !targetMoveInDate))}
      style={{
        border: fieldErrors.targetMoveInDate
          ? "1.5px solid var(--danger)"
          : errBorder(showValidationErrors, targetMoveInDate),
      }}
    />
    <div className="form-helper">
      {targetMoveInDate
        ? "You can adjust this date before submitting. Must be at least 3 days from today, up to 3 months."
        : "Required for room preparation schedule and lease contract generation (at least 3 days from today, up to 3 months)."}
    </div>
    <FieldError error={showValidationErrors && !targetMoveInDate ? "Intended move-in date is required" : fieldErrors.targetMoveInDate} />
  </div>

 {/* Move-in Time */}
 <div className="form-group" data-field="estimatedMoveInTime">
 <label className="form-label" htmlFor="estimatedMoveInTimeSelect">
 Estimated Time of Move In (8:00 AM to 6:00 PM) <span className="rf-required">*</span>
 </label>
 <select
 id="estimatedMoveInTimeSelect"
 className="form-select"
 value={estimatedMoveInTime}
 onChange={(e) => handleTimeInput(e.target.value)}
 style={{
 cursor: "pointer",
 border: fieldErrors.estimatedMoveInTime
 ? "1.5px solid var(--danger)"
 : errBorder(showValidationErrors, estimatedMoveInTime),
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
  <div className="form-group" data-field="leaseDuration">
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="form-label mb-0" htmlFor="leaseDurationSelect">
        Duration of Lease <span className="rf-required">*</span>
      </label>
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
        {leaseDuration
          ? Number(leaseDuration) === 12
            ? "1 Year (12 Months)"
            : `${leaseDuration} ${Number(leaseDuration) === 1 ? "Month" : "Months"}`
          : "Select duration"}
      </span>
    </div>

    {/* Modern Segmented Chips */}
    <div className="grid grid-cols-4 sm:grid-cols-4 gap-2 mb-2">
      {getAvailableLeaseOptions(6).map((opt) => {
        const isSelected = String(leaseDuration) === String(opt.value);
        const isLongTerm = opt.months >= 6;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={readOnly}
            onClick={() => {
              setLeaseDuration(opt.value);
              validateField("leaseDuration", opt.value, (value) => ({
                valid: Boolean(value),
                error: value ? null : "Please select a lease duration",
              }));
            }}
            className={`p-2.5 rounded-xl text-xs flex flex-col items-center justify-center transition-all border ${
              isSelected
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-bold shadow-sm"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <span className="font-semibold">{opt.shortLabel}</span>
            <span
              className={`text-[9px] mt-0.5 font-medium ${
                isSelected
                  ? isLongTerm
                    ? "text-emerald-300 dark:text-emerald-700"
                    : "text-sky-300 dark:text-sky-700"
                  : isLongTerm
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {isLongTerm ? "Long-Term" : "Short-Term"}
            </span>
          </button>
        );
      })}
    </div>

    {/* Live Feedback Banner */}
    {leaseDuration && (
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-700 dark:text-slate-300 space-y-1.5 mt-2">
        <div className="flex items-center gap-2 font-medium">
          {Number(leaseDuration) >= 6 ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-900 dark:text-slate-100 font-semibold">
                Long-Term Stay ({leaseDuration} Months) Selected
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              <span className="text-slate-900 dark:text-slate-100 font-semibold">
                Short-Term Stay ({leaseDuration} {Number(leaseDuration) === 1 ? "Month" : "Months"}) Selected
              </span>
            </>
          )}
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
          {Number(leaseDuration) >= 6
            ? "Eligible for standard discounted monthly rent rates and standard security deposit. All pricing previews stay synchronized."
            : "Flexible short-term rate applies. All previous stages and payment previews automatically synchronize with your selected duration."}
        </p>
      </div>
    )}

    <FieldError
      error={
        showValidationErrors && !leaseDuration
          ? "Please select a lease duration"
          : fieldErrors.leaseDuration
      }
    />
  </div>

 {/* Work Schedule */}
 <div className="form-group" data-field="workSchedule">
 <label className="form-label">
 Work Schedule <span className="rf-required">*</span>
 </label>
 <div
 className="radio-group"
 style={{
 border: fieldErrors.workSchedule
 ? "1px solid var(--danger)"
 : errBorder(showValidationErrors, workSchedule),
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
 onChange={(e) => {
 setWorkSchedule(e.target.value);
 validateField("workSchedule", e.target.value, (value) => ({
 valid: Boolean(value),
 error: value ? null : "Please select your work schedule",
 }));
 }}
 />
 <label htmlFor={opt.id} className="radio-label">
 {opt.label}
 </label>
 </div>
 ))}
 </div>
 <FieldError
 error={
 showValidationErrors && !workSchedule
 ? "Please select your work schedule"
 : fieldErrors.workSchedule
 }
 />
 </div>

 {workSchedule === "others" && (
    <div className="form-group" data-field="workScheduleOther">
      <label className="form-label" htmlFor="workScheduleOtherInput">
        Please Specify Your Work Schedule <span className="rf-required">*</span>
      </label>
      <textarea
        id="workScheduleOtherInput"
        className="form-textarea"
        value={workScheduleOther}
        maxLength={300}
        onChange={(e) => {
          setWorkScheduleOther(e.target.value);
          validateField("workScheduleOther", e.target.value, (value) => ({
            valid: Boolean(value?.trim()),
            error: value?.trim() ? null : "Please describe your work schedule",
          }));
        }}
        placeholder="Please describe your typical work schedule"
        style={{
          border: fieldErrors.workScheduleOther
            ? "1.5px solid var(--danger)"
            : workSchedule === "others"
            ? errBorder(showValidationErrors, workScheduleOther)
            : undefined,
        }}
        aria-invalid={Boolean(showValidationErrors && workSchedule === "others" && !workScheduleOther)}
      />
      <div className="rf-char-counter">
        {workScheduleOther?.length || 0}/300
      </div>
      <FieldError
        error={
          showValidationErrors && workSchedule === "others" && !workScheduleOther
            ? "Please describe your work schedule"
            : fieldErrors.workScheduleOther
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
