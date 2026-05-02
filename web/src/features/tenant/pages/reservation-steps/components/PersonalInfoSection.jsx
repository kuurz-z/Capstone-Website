import React from "react";
import FileUploadField from "./FileUploadField";
import AddressCascadeFields from "./AddressCascadeFields";
import {
  validateBirthday,
  validatePHPhoneLocal,
} from "../../../utils/reservationValidation";

const errBorder = (show, value) =>
  show && !value ? "1.5px solid #dc2626" : undefined;

const ID_TYPE_OPTIONS = [
  { value: "national_id", label: "National ID" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "passport", label: "Passport" },
  { value: "sss_id", label: "SSS ID" },
  { value: "umid", label: "UMID" },
  { value: "school_id", label: "School ID" },
  { value: "other", label: "Other" },
];

const ID_VALIDATION_MESSAGES = {
  validating: "Validating ID...",
  passed: "ID verified successfully.",
  warning: "Name mismatch detected. Please review your information or upload a clearer ID.",
  failed: "ID image is unclear. Please upload a clearer photo.",
  manual_review: "ID uploaded. It will be manually reviewed by admin.",
};

/**
 * Section 2: Personal Information — names, phone, birthday, marital status,
 * nationality, education, address fields (PSGC cascading), ID uploads, NBI, notes.
 */
const PersonalInfoSection = ({
  lastName, setLastName, firstName, setFirstName,
  middleName, setMiddleName, nickname, setNickname,
  mobileNumber, setMobileNumber, birthday, setBirthday,
  maritalStatus, setMaritalStatus, nationality, setNationality,
  educationLevel, setEducationLevel,
  addressUnitHouseNo, setAddressUnitHouseNo,
  addressStreet, setAddressStreet,
  addressRegion, setAddressRegion,
  addressBarangay, setAddressBarangay,
  addressCity, setAddressCity,
  addressProvince, setAddressProvince,
  validIDFront, setValidIDFront,
  validIDBack, setValidIDBack,
  validIDType, setValidIDType,
  idValidationResult,
  isValidatingId,
  onValidateIdDocument,
  nbiClearance, setNbiClearance,
  nbiReason, setNbiReason,
  personalNotes, setPersonalNotes,
  handleNameInput, handlePhoneInput, handleGeneralInput,
  validateField, fieldErrors,
  birthdayMin, birthdayMax,
  showValidationErrors,
}) => (
  <>
    {/* Names */}
    <div className="form-row">
      <NameField
        label="Last Name" value={lastName} setter={setLastName}
        fieldKey="lastName" handler={handleNameInput}
        validate={validateField} errors={fieldErrors}
        required showValidationErrors={showValidationErrors}
      />
      <NameField
        label="First Name" value={firstName} setter={setFirstName}
        fieldKey="firstName" handler={handleNameInput}
        validate={validateField} errors={fieldErrors}
        required showValidationErrors={showValidationErrors}
      />
    </div>
    <div className="form-row">
      <NameField
        label="Middle Name" value={middleName} setter={setMiddleName}
        fieldKey="middleName" handler={handleNameInput}
        validate={validateField} errors={fieldErrors}
        showValidationErrors={showValidationErrors}
      />
      <NameField
        label="Nickname" value={nickname} setter={setNickname}
        fieldKey="nickname" handler={handleNameInput}
        validate={validateField} errors={fieldErrors}
      />
    </div>

    {/* Phone & Birthday */}
    <div className="form-row">
      <div className="form-group" data-field="mobileNumber">
        <label className="form-label">
          Mobile Number <span className="rf-required">*</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          className={`form-input${(showValidationErrors && !mobileNumber) || fieldErrors.mobileNumber ? " rf-input--error" : ""}`}
          placeholder="09123456789"
          value={mobileNumber}
          maxLength={11}
          onChange={(e) => handlePhoneInput(e.target.value, setMobileNumber, "mobileNumber")}
          onBlur={() => validateField("mobileNumber", mobileNumber, validatePHPhoneLocal)}
          style={{ border: (showValidationErrors && !mobileNumber) || fieldErrors.mobileNumber ? "1.5px solid #dc2626" : undefined }}
        />
        <FieldError
          error={
            fieldErrors.mobileNumber ||
            (showValidationErrors && !mobileNumber ? "Enter a valid mobile number (e.g. 09123456789)" : null)
          }
        />
      </div>
      <div className="form-group" data-field="birthday">
        <label className="form-label">
          Birthday <span className="rf-required">*</span>
        </label>
        <input
          type="date"
          className="form-input"
          value={birthday}
          min={birthdayMin}
          max={birthdayMax}
          onChange={(e) => {
            setBirthday(e.target.value);
            validateField("birthday", e.target.value, validateBirthday);
          }}
          style={{ cursor: "pointer", border: errBorder(showValidationErrors, birthday) }}
        />
        <FieldError error={showValidationErrors && !birthday ? "Birthday is required" : fieldErrors.birthday} />
      </div>
    </div>

    {/* Marital / Nationality */}
    <div className="form-row">
      <div className="form-group" data-field="maritalStatus">
        <label className="form-label">
          Marital Status <span className="rf-required">*</span>
        </label>
        <select
          className="form-select"
          value={maritalStatus}
          onChange={(e) => setMaritalStatus(e.target.value)}
          style={{ border: errBorder(showValidationErrors, maritalStatus) }}
        >
          <option value="">Select status...</option>
          <option value="single">Single</option>
          <option value="married">Married</option>
          <option value="other">Other</option>
        </select>
        <FieldError error={showValidationErrors && !maritalStatus ? "Marital status is required" : null} />
      </div>
      <div className="form-group" data-field="nationality">
        <label className="form-label">
          Nationality <span className="rf-required">*</span>
        </label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g., Filipino"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          onBlur={() =>
            validateField("nationality", nationality, (v) => ({
              valid: Boolean(v?.trim()),
              error: v?.trim() ? null : "Nationality is required",
            }))
          }
          style={{ border: errBorder(showValidationErrors, nationality) }}
        />
        <FieldError error={showValidationErrors && !nationality ? "Nationality is required" : fieldErrors.nationality} />
      </div>
    </div>

    {/* Education */}
    <div className="form-group" data-field="educationLevel">
      <label className="form-label">
        Educational Attainment <span className="rf-required">*</span>
      </label>
      <select
        className="form-select"
        value={educationLevel}
        onChange={(e) => setEducationLevel(e.target.value)}
        style={{ border: errBorder(showValidationErrors, educationLevel) }}
      >
        <option value="">Select level...</option>
        <option value="highschool">High School</option>
        <option value="college">College</option>
        <option value="vocational">Vocational</option>
        <option value="graduate">Graduate</option>
      </select>
      <FieldError error={showValidationErrors && !educationLevel ? "Education level is required" : null} />
    </div>

    {/* ── Permanent Address (PSGC Cascading Dropdowns) ──────── */}
    <div className="rf-address-heading-wrap">
      <h4 className="rf-address-heading">Permanent Address</h4>
      <p className="rf-address-hint">
        Select your region first — province, city, and barangay will load automatically.
      </p>
    </div>

    <AddressCascadeFields
      addressUnitHouseNo={addressUnitHouseNo}
      setAddressUnitHouseNo={setAddressUnitHouseNo}
      addressStreet={addressStreet}
      setAddressStreet={setAddressStreet}
      addressRegion={addressRegion}
      setAddressRegion={setAddressRegion}
      addressBarangay={addressBarangay}
      setAddressBarangay={setAddressBarangay}
      addressCity={addressCity}
      setAddressCity={setAddressCity}
      addressProvince={addressProvince}
      setAddressProvince={setAddressProvince}
      handleGeneralInput={handleGeneralInput}
      validateField={validateField}
      fieldErrors={fieldErrors}
      showValidationErrors={showValidationErrors}
    />

    {/* ID & document uploads */}
    <div className="form-group" data-field="validIDType">
      <label className="form-label">
        ID Type <span className="rf-required">*</span>
      </label>
      <select
        className="form-select"
        value={validIDType}
        onChange={(e) => {
          const nextType = e.target.value;
          setValidIDType(nextType);
          if (typeof validIDFront === "string" && validIDFront.startsWith("http") && nextType) {
            onValidateIdDocument?.({ documentUrl: validIDFront, idType: nextType });
          }
        }}
        style={{ border: errBorder(showValidationErrors, validIDType) }}
      >
        <option value="">Select ID type...</option>
        {ID_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError error={showValidationErrors && !validIDType ? "ID type is required" : null} />
    </div>

    <div data-field="validIDFront">
      <FileUploadField
        label="Valid ID (Front)"
        value={validIDFront}
        onChange={(url) => {
          setValidIDFront(url);
          if (typeof url === "string" && url.startsWith("http") && validIDType) {
            onValidateIdDocument?.({ documentUrl: url, idType: validIDType });
          }
        }}
        hint="Government-issued ID (Front side)"
        disabled={!validIDType || isValidatingId}
        disabledMessage={!validIDType ? "Select an ID type before uploading." : "Validating ID..."}
        hasError={
          (showValidationErrors && !validIDFront) ||
          idValidationResult?.validationStatus === "failed"
        }
        required
      />
      <IdValidationFeedback
        result={idValidationResult}
        isValidating={isValidatingId}
      />
    </div>
    <div data-field="validIDBack">
      <FileUploadField
        label="Valid ID (Back)"
        value={validIDBack}
        onChange={setValidIDBack}
        hint="Government-issued ID (Back side)"
        disabled={!validIDType}
        disabledMessage="Select an ID type before uploading."
        hasError={showValidationErrors && !validIDBack}
        required
      />
    </div>

    <div data-field="nbiClearance">
      <FileUploadField
        label="NBI Clearance (If unable, upload another valid ID)"
        value={nbiClearance}
        onChange={setNbiClearance}
        hint="NBI Clearance or additional valid ID"
        hasError={showValidationErrors && !nbiClearance && !nbiReason}
      />
    </div>

    <div className="form-group" data-field="nbiReason">
      <label className="form-label">
        If not yet available, please indicate reason below{" "}
        <span className="rf-required">*</span>
      </label>
      <textarea
        className="form-textarea"
        value={nbiReason}
        onChange={(e) => setNbiReason(e.target.value)}
        placeholder="N/A if NBI Clearance has been submitted"
        style={{
          border: !nbiClearance
            ? errBorder(showValidationErrors, nbiReason)
            : undefined,
        }}
      />
      {showValidationErrors && !nbiClearance && !nbiReason && (
        <FieldError error="Please upload NBI Clearance or provide a reason" />
      )}
    </div>

    {/* Notes */}
    <div className="form-group">
      <label className="form-label">
        Other Notes (Only for corporate accounts)
      </label>
      <textarea
        className="form-textarea"
        value={personalNotes}
        onChange={(e) => setPersonalNotes(e.target.value)}
        maxLength={500}
      />
    </div>
  </>
);

// ─── Shared sub-components ───────────────────────────────────

const IdValidationFeedback = ({ result, isValidating }) => {
  const status = isValidating ? "validating" : result?.validationStatus;
  if (!status) return null;

  const message =
    result?.message ||
    ID_VALIDATION_MESSAGES[status] ||
    "ID uploaded. It will be manually reviewed by admin.";
  const notes = Array.isArray(result?.notes) ? result.notes.filter(Boolean) : [];

  return (
    <div className={`rf-id-validation rf-id-validation--${status}`}>
      <div className="rf-id-validation__title">{message}</div>
      {result?.extractedName && (
        <div className="rf-id-validation__meta">
          Extracted name: {result.extractedName}
        </div>
      )}
      {typeof result?.matchScore === "number" &&
        status !== "validating" &&
        status !== "manual_review" && (
        <div className="rf-id-validation__meta">
          Name match score: {Math.round(result.matchScore * 100)}%
        </div>
      )}
      {notes.length > 0 && (
        <ul className="rf-id-validation__notes">
          {notes.slice(0, 3).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const FieldError = ({ error }) => {
  if (!error) return null;
  return (
    <div className="rf-field-error">{error}</div>
  );
};

const NameField = ({
  label, value, setter, fieldKey, handler,
  validate, errors, required, showValidationErrors,
}) => (
  <div className="form-group" data-field={required ? fieldKey : undefined}>
    <label className="form-label">
      {label} {required && <span className="rf-required">*</span>}
    </label>
    <input
      type="text"
      className="form-input"
      placeholder={label}
      maxLength={32}
      value={value}
      onChange={(e) => handler(e.target.value, setter)}
      onBlur={() =>
        validate(fieldKey, value, (v) => {
          const valid = v && v.length >= 2;
          return {
            valid,
            error: valid ? null : `${label} must be at least 2 characters`,
          };
        })
      }
      style={{ border: required ? errBorder(showValidationErrors, value) : "1.5px solid var(--rf-text-muted)" }}
    />
    <FieldError error={showValidationErrors && required && !value ? `${label} is required` : errors[fieldKey]} />
  </div>
);

export default PersonalInfoSection;
