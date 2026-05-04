import React from "react";
import FileUploadField from "./FileUploadField";
import AddressCascadeFields from "./AddressCascadeFields";
import PhoneInput from "../../../../../shared/components/PhoneInput";
import {
 validateBirthday,
} from "../../../utils/reservationValidation";

const errBorder = (show, value) =>
 show && !value ? "1.5px solid #dc2626" : undefined;

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
 required showValidationErrors={showValidationErrors}
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
 <PhoneInput
 value={mobileNumber}
 onChange={(e164) => setMobileNumber(e164)}
 onBlur={() =>
 validateField("mobileNumber", mobileNumber, (value) => {
 const valid = /^\+\d{10,15}$/.test(value || "");
 return {
 valid,
 error: valid ? null : "Please enter a valid mobile number",
 };
 })
 }
 hasError={showValidationErrors && !mobileNumber}
 required
 />
 <FieldError
 error={
 showValidationErrors && !mobileNumber
 ? "Mobile number is required"
 : fieldErrors.mobileNumber
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
 onChange={(e) => setValidIDType(e.target.value)}
 style={{ border: errBorder(showValidationErrors, validIDType) }}
 >
 <option value="">Select ID type...</option>
 <option value="national_id">National ID</option>
 <option value="drivers_license">Driver's License</option>
 <option value="passport">Passport</option>
 <option value="sss_id">SSS ID</option>
 <option value="umid">UMID</option>
 <option value="school_id">School ID</option>
 <option value="other">Other Government-issued ID</option>
 </select>
 <FieldError error={showValidationErrors && !validIDType ? "ID type is required" : null} />
 </div>

 <div data-field="validIDFront">
 <FileUploadField
 label="Valid ID (Front)"
 value={validIDFront}
 onChange={setValidIDFront}
 hint="Government-issued ID (Front side)"
 hasError={showValidationErrors && !validIDFront}
 required
 />
 </div>
 <div data-field="validIDBack">
 <FileUploadField
 label="Valid ID (Back)"
 value={validIDBack}
 onChange={setValidIDBack}
 hint="Government-issued ID (Back side)"
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
