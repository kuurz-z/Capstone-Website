import React, { useEffect, useMemo, useRef, useState } from "react";
import FileUploadField from "./FileUploadField";
import AddressCascadeFields from "./AddressCascadeFields";
import PhoneInput from "../../../../../shared/components/PhoneInput";
import { formatProperCase, sanitizeName } from "../../../../../shared/utils/authValidation";
import { validateBirthday } from "../../../utils/reservationValidation";

const errBorder = (show, value) =>
  show && !value ? "1px solid var(--danger)" : undefined;

const ID_TYPE_LABELS = {
  national_id: "National ID",
  drivers_license: "Driver's License",
  passport: "Passport",
  sss_id: "SSS ID",
  umid: "UMID",
  school_id: "School ID",
  other: "Valid ID",
};


/**
 * Section 2: Personal Information — names, phone, birthday, marital status,
 * nationality, education, address fields (PSGC cascading), ID uploads, NBI, notes.
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
  accountFirstName = "",
  accountLastName = "",
  accountPhone = "",
  birthday,
  setBirthday,
  gender,
  setGender,
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
  addressRegion,
  setAddressRegion,
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
  validIDType,
  setValidIDType,
  nbiClearance,
  setNbiClearance,
  nbiReason,
  setNbiReason,
  documentPrechecks,
  runningDocumentChecks,
  onRunDocumentPrecheck,
  personalNotes,
  setPersonalNotes,
  handleNameInput,
  handleGeneralInput,
  validateField,
  fieldErrors,
  clearFieldError,
  birthdayMin,
  birthdayMax,
  showValidationErrors,
}) => {
  return (
    <>
      {/* Names — 3-column row */}
      <div className="form-row form-row--3col">
        <NameField
          label="Last Name"
          value={lastName}
          setter={setLastName}
          fieldKey="lastName"
          handler={handleNameInput}
          validate={validateField}
          errors={fieldErrors}
          autoComplete="family-name"
          suggestion={accountLastName}
          required
          showValidationErrors={showValidationErrors}
        />
        <NameField
          label="First Name"
          value={firstName}
          setter={setFirstName}
          fieldKey="firstName"
          handler={handleNameInput}
          validate={validateField}
          errors={fieldErrors}
          autoComplete="given-name"
          suggestion={accountFirstName}
          required
          showValidationErrors={showValidationErrors}
        />
        <NameField
          label="Middle Name"
          value={middleName}
          setter={setMiddleName}
          fieldKey="middleName"
          handler={handleNameInput}
          validate={validateField}
          errors={fieldErrors}
          autoComplete="additional-name"
          optional
          showValidationErrors={showValidationErrors}
        />
      </div>

      {/* Nickname, Gender, Nationality — 3-column row */}
      <div className="form-row form-row--3col">
        <div className="form-group" data-field="nickname">
          <label className="form-label" htmlFor="nicknameInput">
            Nickname <span className="rf-optional-label">(Optional)</span>
          </label>
          <input
            id="nicknameInput"
            type="text"
            className="form-input"
            placeholder="Nickname"
            maxLength={32}
            autoComplete="nickname"
            value={nickname}
            onChange={(e) => handleNameInput(e.target.value, setNickname)}
            onBlur={() => {
              if (nickname && typeof nickname === "string") {
                const proper = formatProperCase(nickname.trim());
                if (proper !== nickname) {
                  setNickname(proper);
                }
              }
            }}
          />
        </div>
        <div className="form-group" data-field="gender">
          <label className="form-label" htmlFor="genderSelect">
            Gender <span className="rf-required">*</span>
          </label>
          <select
            id="genderSelect"
            className="form-select"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            style={{ border: errBorder(showValidationErrors, gender) }}
            aria-invalid={showValidationErrors && !gender}
          >
            <option value="">Select gender...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
          <FieldError
            error={
              showValidationErrors && !gender ? "Gender is required" : null
            }
          />
        </div>
        <div className="form-group" data-field="nationality">
          <label className="form-label" htmlFor="nationalitySelect">
            Nationality <span className="rf-required">*</span>
          </label>
          <select
            id="nationalitySelect"
            className="form-select"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            style={{ border: errBorder(showValidationErrors, nationality) }}
            aria-invalid={showValidationErrors && !nationality}
          >
            <option value="">Select nationality...</option>
            <option value="Filipino">Filipino</option>
            <option value="American">American</option>
            <option value="Chinese">Chinese</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Indian">Indian</option>
            <option value="Other">Other</option>
          </select>
          <FieldError
            error={
              showValidationErrors && !nationality
                ? "Nationality is required"
                : null
            }
          />
        </div>
      </div>

      {/* Phone & Birthday — 2-column row */}
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
            autoComplete="tel"
            required
            list={accountPhone ? "mobileNumber-suggestions" : undefined}
          />
          {accountPhone && (
            <datalist id="mobileNumber-suggestions">
              <option value={accountPhone} />
            </datalist>
          )}
          <FieldError
            error={
              showValidationErrors && !mobileNumber
                ? "Mobile number is required"
                : fieldErrors.mobileNumber
            }
          />
        </div>
        <BirthdaySelectField
          birthday={birthday}
          setBirthday={setBirthday}
          birthdayMin={birthdayMin}
          birthdayMax={birthdayMax}
          validateField={validateField}
          fieldErrors={fieldErrors}
          showValidationErrors={showValidationErrors}
        />
      </div>

      {/* Marital Status & Education — 2-column row */}
      <div className="form-row">
        <div className="form-group" data-field="maritalStatus">
          <label className="form-label" htmlFor="maritalStatusSelect">
            Marital Status <span className="rf-required">*</span>
          </label>
          <select
            id="maritalStatusSelect"
            className="form-select"
            value={maritalStatus}
            onChange={(e) => setMaritalStatus(e.target.value)}
            style={{ border: errBorder(showValidationErrors, maritalStatus) }}
            aria-invalid={showValidationErrors && !maritalStatus}
          >
            <option value="">Select status...</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="widowed">Widowed</option>
            <option value="separated">Separated</option>
            <option value="divorced">Divorced</option>
          </select>
          <FieldError
            error={
              showValidationErrors && !maritalStatus
                ? "Marital status is required"
                : null
            }
          />
        </div>
        <div className="form-group" data-field="educationLevel">
          <label className="form-label" htmlFor="educationLevelSelect">
            Educational Attainment <span className="rf-required">*</span>
          </label>
          <select
            id="educationLevelSelect"
            className="form-select"
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            style={{ border: errBorder(showValidationErrors, educationLevel) }}
            aria-invalid={showValidationErrors && !educationLevel}
          >
            <option value="">Select level...</option>
            <option value="elementary">Elementary</option>
            <option value="highschool">High School</option>
            <option value="vocational">Vocational</option>
            <option value="college">College</option>
            <option value="graduate">Graduate / Post-Graduate</option>
          </select>
          <FieldError
            error={
              showValidationErrors && !educationLevel
                ? "Education level is required"
                : null
            }
          />
        </div>
      </div>

      {/* ── Permanent Address (PSGC Cascading Dropdowns) ──────── */}
      <div className="rf-address-heading-wrap">
        <h4 className="rf-address-heading">Permanent Address</h4>
        <p className="rf-address-hint">
          Select your region first — province, city, and barangay will load
          automatically. You may change any level at any time.
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
        <label className="form-label" htmlFor="validIDTypeSelect">
          ID Type <span className="rf-required">*</span>
        </label>
        <select
          id="validIDTypeSelect"
          className="form-select"
          value={validIDType}
          onChange={(e) => setValidIDType(e.target.value)}
          style={{ border: errBorder(showValidationErrors, validIDType) }}
          aria-invalid={showValidationErrors && !validIDType}
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
        <FieldError
          error={
            showValidationErrors && !validIDType ? "ID type is required" : null
          }
        />
      </div>

      {Boolean(validIDType) && (
        <>
          <div data-field="validIDFront">
            <FileUploadField
              label={`${ID_TYPE_LABELS[validIDType] || "Valid ID"} (Front)`}
              value={validIDFront}
              onChange={setValidIDFront}
              documentType="valid-id-front"
              hint={`${ID_TYPE_LABELS[validIDType] || "Valid ID"} (Front side)`}
              hasError={showValidationErrors && !validIDFront}
              required
            />
          </div>
          <div data-field="validIDBack">
            <FileUploadField
              label={`${ID_TYPE_LABELS[validIDType] || "Valid ID"} (Back)`}
              value={validIDBack}
              onChange={setValidIDBack}
              documentType="valid-id-back"
              hint={`${ID_TYPE_LABELS[validIDType] || "Valid ID"} (Back side)`}
              hasError={showValidationErrors && !validIDBack}
              required
            />
          </div>
        </>
      )}

      <div data-field="nbiClearance">
        <FileUploadField
          label="NBI Clearance (If unable, upload another valid ID)"
          value={nbiClearance}
          onChange={(file) => {
            setNbiClearance(file);
            if (file) {
              clearFieldError?.("nbiClearance");
              clearFieldError?.("nbiReason");
            }
          }}
          documentType="nbi-clearance"
          hint="NBI Clearance or additional valid ID"
          hasError={Boolean(showValidationErrors && !nbiClearance && !nbiReason?.trim())}
        />
      </div>

      <div className="form-group" data-field="nbiReason">
        <label className="form-label" htmlFor="nbiReasonInput">
          If not yet available, please indicate reason below{" "}
          {!nbiClearance && <span className="rf-required">*</span>}
        </label>
        <textarea
          id="nbiReasonInput"
          className="form-textarea"
          value={nbiReason}
          onChange={(e) => {
            const nextVal = e.target.value;
            setNbiReason(nextVal);
            if (nextVal?.trim()) {
              clearFieldError?.("nbiReason");
              clearFieldError?.("nbiClearance");
            }
          }}
          maxLength={300}
          placeholder={
            nbiClearance
              ? "Optional (NBI Clearance uploaded)"
              : "Reason why NBI Clearance is not yet available"
          }
          style={{
            border: !nbiClearance
              ? errBorder(showValidationErrors, nbiReason?.trim())
              : undefined,
          }}
          aria-invalid={Boolean(showValidationErrors && !nbiClearance && !nbiReason?.trim())}
        />
        <div className="rf-char-counter">
          {nbiReason?.length || 0}/300
        </div>
        {showValidationErrors && !nbiClearance && !nbiReason?.trim() && (
          <FieldError error="Please upload NBI Clearance or provide a reason why it is not yet available." />
        )}
      </div>

      {/* Notes */}
      <div className="form-group">
        <label className="form-label" htmlFor="personalNotesInput">
          Other Notes (Only for corporate accounts)
        </label>
        <textarea
          id="personalNotesInput"
          className="form-textarea"
          value={personalNotes}
          onChange={(e) => setPersonalNotes(e.target.value)}
          maxLength={500}
          placeholder="(Optional) Any additional notes or corporate sponsorship details"
        />
        <div className="rf-char-counter">
          {personalNotes?.length || 0}/500
        </div>
      </div>
    </>
  );
};

// ─── Shared sub-components ───────────────────────────────────

const FieldError = ({ error }) => {
  if (!error) return null;
  return <div className="rf-field-error">{error}</div>;
};

const calculateAge = (bdayStr) => {
  if (!bdayStr || !/^\d{4}-\d{2}-\d{2}$/.test(bdayStr)) return null;
  const [y, m, d] = bdayStr.split("-").map(Number);
  const birthDate = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const mDiff = today.getMonth() - birthDate.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 && age <= 120 ? age : null;
};

const BirthdaySelectField = ({
  birthday,
  setBirthday,
  birthdayMin,
  birthdayMax,
  validateField,
  fieldErrors,
  showValidationErrors,
}) => {
  const [parts, setParts] = useState(() => parseDateParts(birthday));
  const lastEmittedValue = useRef(birthday || "");
  const yearOptions = useMemo(
    () => buildYearOptions(birthdayMin, birthdayMax),
    [birthdayMin, birthdayMax],
  );
  const maxDay = getDaysInMonth(parts.year, parts.month);
  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, index) => pad2(index + 1)),
    [maxDay],
  );
  const hasError = (showValidationErrors && !birthday) || fieldErrors.birthday;
  const calculatedAge = useMemo(() => calculateAge(birthday), [birthday]);

  useEffect(() => {
    if ((birthday || "") === lastEmittedValue.current) return;
    setParts(parseDateParts(birthday));
  }, [birthday]);

  const handlePartChange = (field, value) => {
    const next = { ...parts, [field]: value };
    const nextMaxDay = getDaysInMonth(next.year, next.month);

    if (Number(next.day) > nextMaxDay) {
      next.day = "";
    }

    setParts(next);

    const nextBirthday = composeDate(next);
    lastEmittedValue.current = nextBirthday;
    setBirthday(nextBirthday);

    if (nextBirthday) {
      validateField("birthday", nextBirthday, validateBirthday);
    } else {
      validateField("birthday", "", () => ({ valid: false, error: null }));
    }
  };

  return (
    <div className="form-group" data-field="birthday">
      <label className="form-label">
        Birthday <span className="rf-required">*</span>
        {calculatedAge !== null && (
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-2">
            ({calculatedAge} years old)
          </span>
        )}
      </label>
      <div
        className={`rf-date-part-row${hasError ? " rf-date-part-row--error" : ""}`}
      >
        <select
          className="form-select rf-date-part-select rf-date-part-select--month"
          value={parts.month}
          onChange={(e) => handlePartChange("month", e.target.value)}
          aria-label="Birth month"
          autoComplete="bday-month"
        >
          <option value="">Month</option>
          {MONTH_OPTIONS.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
        <select
          className="form-select rf-date-part-select"
          value={parts.day}
          onChange={(e) => handlePartChange("day", e.target.value)}
          aria-label="Birth day"
          autoComplete="bday-day"
        >
          <option value="">Day</option>
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {Number(day)}
            </option>
          ))}
        </select>
        <select
          className="form-select rf-date-part-select"
          value={parts.year}
          onChange={(e) => handlePartChange("year", e.target.value)}
          aria-label="Birth year"
          autoComplete="bday-year"
        >
          <option value="">Year</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="form-helper">Applicant must be at least 15 years old</div>
      <FieldError
        error={
          showValidationErrors && !birthday
            ? "Birthday is required"
            : fieldErrors.birthday
        }
      />
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
  autoComplete,
  suggestion = "",
  required,
  optional,
  showValidationErrors,
}) => {
  const normalizedSuggestion = String(suggestion || "").trim();
  const datalistId = normalizedSuggestion ? `${fieldKey}-suggestions` : undefined;

  const handleBlur = () => {
    if (value && typeof value === "string") {
      const proper = formatProperCase(value.trim());
      if (proper !== value) {
        setter(proper);
      }
    }
    if (validate) {
      validate(fieldKey, value, (v) => {
        const trimmed = String(v || "").trim();
        if (!required && !trimmed) {
          return { valid: true, error: null };
        }
        const valid = trimmed.length >= 2;
        return {
          valid,
          error: valid ? null : `${label} must be at least 2 characters`,
        };
      });
    }
  };

  return (
    <div className="form-group" data-field={fieldKey}>
      <label className="form-label" htmlFor={`${fieldKey}Input`}>
        {label} {required && <span className="rf-required">*</span>}
        {optional && <span className="rf-optional-label">(Optional)</span>}
      </label>
      <input
        id={`${fieldKey}Input`}
        type="text"
        className="form-input"
        placeholder={label}
        maxLength={32}
        autoComplete={autoComplete}
        list={datalistId}
        value={value}
        onChange={(e) => handler(e.target.value, setter)}
        onBlur={handleBlur}
        style={{
          border:
            (showValidationErrors && required && !value) || errors[fieldKey]
              ? "1px solid var(--danger)"
              : undefined,
        }}
        aria-invalid={Boolean((showValidationErrors && required && !value) || errors[fieldKey])}
      />

      {normalizedSuggestion && (
        <datalist id={datalistId}>
          <option value={normalizedSuggestion} />
        </datalist>
      )}

      <FieldError
        error={
          showValidationErrors && required && !value
            ? `${label} is required`
            : errors[fieldKey]
        }
      />
    </div>
  );
};

export default PersonalInfoSection;
