import React from "react";
import FileUploadField from "./FileUploadField";

/**
 * Section 2: Personal Information — names, phone, birthday, marital status,
 * nationality, education, address fields, ID uploads, NBI, notes.
 *
 * ~600 lines → extracted as a focused section component.
 */
const PersonalInfoSection = ({
  lastName,
  setLastName,
  firstName,
  setFirstName,
  middleName,
  setMiddleName,
  nickname,
  setNickname,
  mobileNumber,
  setMobileNumber,
  birthday,
  setBirthday,
  maritalStatus,
  setMaritalStatus,
  nationality,
  setNationality,
  educationLevel,
  setEducationLevel,
  addressUnitHouseNo,
  setAddressUnitHouseNo,
  addressStreet,
  setAddressStreet,
  addressBarangay,
  setAddressBarangay,
  addressCity,
  setAddressCity,
  addressProvince,
  setAddressProvince,
  validIDFront,
  setValidIDFront,
  validIDBack,
  setValidIDBack,
  nbiClearance,
  setNbiClearance,
  nbiReason,
  setNbiReason,
  personalNotes,
  setPersonalNotes,
  // handlers
  handleNameInput,
  handlePhoneInput,
  handleGeneralInput,
  validateField,
  fieldErrors,
  birthdayMin,
  birthdayMax,
}) => (
  <>
    {/* Names */}
    <div className="form-row">
      <NameField
        label="Last Name"
        value={lastName}
        setter={setLastName}
        fieldKey="lastName"
        handler={handleNameInput}
        validate={validateField}
        errors={fieldErrors}
      />
      <NameField
        label="First Name"
        value={firstName}
        setter={setFirstName}
        fieldKey="firstName"
        handler={handleNameInput}
        validate={validateField}
        errors={fieldErrors}
      />
    </div>
    <div className="form-row">
      <NameField
        label="Middle Name"
        value={middleName}
        setter={setMiddleName}
        fieldKey="middleName"
        handler={handleNameInput}
        validate={validateField}
        errors={fieldErrors}
      />
      <NameField
        label="Nickname"
        value={nickname}
        setter={setNickname}
        fieldKey="nickname"
        handler={handleNameInput}
        validate={validateField}
        errors={fieldErrors}
      />
    </div>

    {/* Phone & Birthday */}
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Mobile Number</label>
        <input
          type="tel"
          className="form-input"
          placeholder="+63912345678"
          value={mobileNumber}
          onChange={(e) => handlePhoneInput(e.target.value, setMobileNumber)}
          onBlur={() =>
            validateField("mobileNumber", mobileNumber, (v) => {
              const valid = /^\+63\d{10}$/.test(v);
              return {
                valid,
                error: valid ? null : "Enter valid PH mobile (+63 + 10 digits)",
              };
            })
          }
        />
        <FieldError error={fieldErrors.mobileNumber} />
      </div>
      <div className="form-group">
        <label className="form-label">Birthday</label>
        <input
          type="date"
          className="form-input"
          value={birthday}
          min={birthdayMin}
          max={birthdayMax}
          onChange={(e) => {
            setBirthday(e.target.value);
            validateField("birthday", e.target.value, (v) => {
              const valid = Boolean(v);
              return { valid, error: valid ? null : "Birthday is required" };
            });
          }}
          style={{ colorScheme: "light", cursor: "pointer" }}
        />
        <FieldError error={fieldErrors.birthday} />
      </div>
    </div>

    {/* Marital / Nationality */}
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Marital Status</label>
        <select
          className="form-select"
          value={maritalStatus}
          onChange={(e) => setMaritalStatus(e.target.value)}
        >
          <option value="single">Single</option>
          <option value="married">Married</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Nationality</label>
        <input
          type="text"
          className="form-input"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
        />
      </div>
    </div>

    {/* Education */}
    <div className="form-group">
      <label className="form-label">Educational Attainment</label>
      <select
        className="form-select"
        value={educationLevel}
        onChange={(e) => setEducationLevel(e.target.value)}
      >
        <option value="highschool">High School</option>
        <option value="college">College</option>
        <option value="vocational">Vocational</option>
        <option value="graduate">Graduate</option>
      </select>
    </div>

    {/* Address fields */}
    <AddressField
      label="Permanent Address: Unit / House No. *"
      placeholder="e.g., 123-A"
      maxLength={64}
      value={addressUnitHouseNo}
      onChange={(v) => handleGeneralInput(v, setAddressUnitHouseNo, 64)}
      fieldKey="addressUnitHouseNo"
      validate={validateField}
      errors={fieldErrors}
    />
    <AddressField
      label="Permanent Address: Street"
      placeholder="e.g., Rizal Street"
      maxLength={64}
      value={addressStreet}
      onChange={(v) => handleGeneralInput(v, setAddressStreet, 64)}
      fieldKey="addressStreet"
      validate={validateField}
      errors={fieldErrors}
    />
    <AddressField
      label="Permanent Address: Barangay *"
      placeholder="e.g., Barangay 1"
      maxLength={32}
      value={addressBarangay}
      onChange={(v) => handleGeneralInput(v, setAddressBarangay, 32)}
      fieldKey="addressBarangay"
      validate={validateField}
      errors={fieldErrors}
    />

    <div className="form-row">
      <AddressFieldInline
        label="Permanent Address: City or Municipality *"
        placeholder="e.g., Manila"
        maxLength={32}
        value={addressCity}
        onChange={(v) => handleGeneralInput(v, setAddressCity, 32)}
        fieldKey="addressCity"
        validate={validateField}
        errors={fieldErrors}
      />
      <AddressFieldInline
        label="Permanent Address: Region / Province *"
        placeholder="e.g., NCR"
        maxLength={32}
        value={addressProvince}
        onChange={(v) => handleGeneralInput(v, setAddressProvince, 32)}
        fieldKey="addressProvince"
        validate={validateField}
        errors={fieldErrors}
      />
    </div>

    {/* ID & document uploads */}
    <FileUploadField
      label="Valid ID (Front)"
      value={validIDFront}
      onChange={setValidIDFront}
      hint="Government-issued ID (Front side)"
    />
    <FileUploadField
      label="Valid ID (Back)"
      value={validIDBack}
      onChange={setValidIDBack}
      hint="Government-issued ID (Back side)"
    />

    <div className="form-group">
      <label className="form-label">
        NBI Clearance (If unable, upload another valid ID) *
      </label>
      <FileUploadField
        label=""
        value={nbiClearance}
        onChange={setNbiClearance}
        hint="NBI Clearance or additional valid ID"
      />
      <div className="form-group" style={{ marginTop: "12px" }}>
        <label className="form-label">
          If not yet available, please indicate reason below
        </label>
        <textarea
          className="form-textarea"
          value={nbiReason}
          onChange={(e) => setNbiReason(e.target.value)}
          placeholder="You may also put 'N/A' if already submitted"
        />
      </div>
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
      />
    </div>
  </>
);

// ─── Shared sub-components ───────────────────────────────────

const FieldError = ({ error }) => {
  if (!error) return null;
  return (
    <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
      {error}
    </div>
  );
};

const NameField = ({
  label,
  value,
  setter,
  fieldKey,
  handler,
  validate,
  errors,
}) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
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
      style={{ border: "1.5px solid #999" }}
    />
    <FieldError error={errors[fieldKey]} />
  </div>
);

const AddressField = ({
  label,
  placeholder,
  maxLength,
  value,
  onChange,
  fieldKey,
  validate,
  errors,
}) => (
  <fieldset style={{ border: "none", padding: "0 0 20px 0" }}>
    <legend className="form-label">{label}</legend>
    <input
      type="text"
      className="form-input"
      placeholder={placeholder}
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() =>
        validate(fieldKey, value, (v) => {
          const valid = Boolean(v && v.trim());
          return { valid, error: valid ? null : "This field is required" };
        })
      }
      style={{ border: "1.5px solid #999" }}
    />
    <FieldError error={errors[fieldKey]} />
  </fieldset>
);

const AddressFieldInline = ({
  label,
  placeholder,
  maxLength,
  value,
  onChange,
  fieldKey,
  validate,
  errors,
}) => (
  <fieldset style={{ border: "none", padding: "0" }}>
    <legend className="form-label">{label}</legend>
    <input
      type="text"
      className="form-input"
      placeholder={placeholder}
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() =>
        validate(fieldKey, value, (v) => {
          const valid = Boolean(v && v.trim());
          return { valid, error: valid ? null : "This field is required" };
        })
      }
      style={{ border: "1.5px solid #999" }}
    />
    <FieldError error={errors[fieldKey]} />
  </fieldset>
);

export default PersonalInfoSection;
