import React from "react";
import FileUploadField from "./FileUploadField";
import { validatePHPhoneOrLandline } from "../../../utils/reservationValidation";

const errBorder = (show, value) =>
  show && !value ? "1.5px solid #dc2626" : undefined;

/**
 * Section 4: Employment / School — employer info, occupation, company ID.
 */
const EmploymentSection = ({
  employerSchool,
  setEmployerSchool,
  employerAddress,
  setEmployerAddress,
  employerContact,
  setEmployerContact,
  startDate,
  setStartDate,
  occupation,
  setOccupation,
  previousEmployment,
  setPreviousEmployment,
  companyID,
  setCompanyID,
  companyIDReason,
  setCompanyIDReason,
  handleGeneralInput,
  showValidationErrors,
}) => (
  <>
    <div className="section-helper">
      If not yet employed, please put N/A. For students, please put name of
      school instead of employer.
    </div>

    <div className="form-group" data-field="employerSchool">
      <label className="form-label">
        Current Employer <span className="rf-required">*</span>
      </label>
      <input
        type="text"
        className="form-input"
        placeholder="Company or School name"
        value={employerSchool}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerSchool, 100)
        }
        style={{ border: errBorder(showValidationErrors, employerSchool) }}
      />
      <FieldError
        error={
          showValidationErrors && !employerSchool
            ? "Employer / school name is required"
            : null
        }
      />
    </div>

    <div className="form-group" data-field="employerAddress">
      <label className="form-label">
        Employer's Address <span className="rf-required">*</span>
      </label>
      <textarea
        className="form-textarea"
        placeholder="Full address"
        value={employerAddress}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerAddress, 100)
        }
        style={{
          resize: "vertical",
          border: errBorder(showValidationErrors, employerAddress),
        }}
      />
      <FieldError
        error={
          showValidationErrors && !employerAddress
            ? "Employer address is required"
            : null
        }
      />
    </div>

    <div className="form-group" data-field="employerContact">
      <label className="form-label">
        Employer's Contact Number{" "}
        <span style={{ fontSize: "11px", color: "#6B7280", fontWeight: 400 }}>(optional)</span>
      </label>
      <input
        type="tel"
        className="form-input"
        placeholder="+63 or land line"
        value={employerContact}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerContact, 100)
        }
        style={{
          border:
            showValidationErrors && employerContact && !validatePHPhoneOrLandline(employerContact)
              ? "1.5px solid #dc2626"
              : undefined,
        }}
      />
      <FieldError
        error={
          showValidationErrors && employerContact && !validatePHPhoneOrLandline(employerContact)
            ? "Enter a valid phone number (e.g. 09123456789 or 02-1234567)"
            : null
        }
      />
    </div>

    <div className="form-group">
      <label className="form-label">Employed Since</label>
      <input
        type="date"
        className="form-input"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
      />
    </div>

    <div className="form-group" data-field="occupation">
      <label className="form-label">
        Occupation / Job Description <span className="rf-required">*</span>
      </label>
      <textarea
        className="form-textarea"
        placeholder="e.g., Software Engineer, Nurse, Currently Job Hunting"
        value={occupation}
        onChange={(e) => handleGeneralInput(e.target.value, setOccupation, 100)}
        style={{
          resize: "vertical",
          border: errBorder(showValidationErrors, occupation),
        }}
      />
      <FieldError
        error={
          showValidationErrors && !occupation ? "Occupation is required" : null
        }
      />
    </div>

    <div className="form-group">
      <label className="form-label">Previous Employment</label>
      <textarea
        className="form-textarea"
        placeholder="(Optional) Previous work experience"
        value={previousEmployment}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setPreviousEmployment, 100)
        }
        style={{ resize: "vertical" }}
      />
    </div>

    <div data-field="companyID">
      <FileUploadField
        label="Company ID"
        value={companyID}
        onChange={setCompanyID}
        hint="Company ID or employee badge"
        hasError={showValidationErrors && !companyID && !companyIDReason}
      />
    </div>

    <div className="form-group" data-field="companyIDReason">
      <label className="form-label">
        If not yet available, please indicate reason below{" "}
        <span className="rf-required">*</span>
      </label>
      <textarea
        className="form-textarea"
        value={companyIDReason}
        onChange={(e) => setCompanyIDReason(e.target.value)}
        placeholder="N/A if Company ID has been submitted"
        style={{
          border: !companyID
            ? errBorder(showValidationErrors, companyIDReason)
            : undefined,
        }}
      />
      {showValidationErrors && !companyID && !companyIDReason && (
        <FieldError error="Please upload Company ID or provide a reason" />
      )}
    </div>
  </>
);

const FieldError = ({ error }) => {
  if (!error) return null;
  return <div className="rf-field-error">{error}</div>;
};

export default EmploymentSection;
