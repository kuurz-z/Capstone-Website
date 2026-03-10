import React from "react";
import FileUploadField from "./FileUploadField";

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
}) => (
  <>
    <div className="section-helper">
      If not yet employed, please put N/A. For students, please put name of
      school instead of employer.
    </div>

    <div className="form-group">
      <label className="form-label">Current Employer</label>
      <input
        type="text"
        className="form-input"
        placeholder="Company or School name"
        value={employerSchool}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerSchool, 100)
        }
      />
    </div>

    <div className="form-group">
      <label className="form-label">Employer's Address</label>
      <textarea
        className="form-textarea"
        placeholder="Full address"
        value={employerAddress}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerAddress, 100)
        }
        style={{ resize: "vertical" }}
      />
    </div>

    <div className="form-group">
      <label className="form-label">Employer's Contact Number</label>
      <input
        type="tel"
        className="form-input"
        placeholder="+63 or land line"
        value={employerContact}
        onChange={(e) =>
          handleGeneralInput(e.target.value, setEmployerContact, 100)
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

    <div className="form-group">
      <label className="form-label">Occupation / Job Description</label>
      <textarea
        className="form-textarea"
        placeholder="e.g., Software Engineer, Nurse, Currently Job Hunting"
        value={occupation}
        onChange={(e) => handleGeneralInput(e.target.value, setOccupation, 100)}
        style={{ resize: "vertical" }}
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

    <FileUploadField
      label="Company ID"
      value={companyID}
      onChange={setCompanyID}
      hint="Company ID or employee badge"
    />

    <div className="form-group">
      <label className="form-label">
        If not yet available, please indicate reason below *
      </label>
      <textarea
        className="form-textarea"
        value={companyIDReason}
        onChange={(e) => setCompanyIDReason(e.target.value)}
        placeholder="N/A if Company ID has been submitted"
      />
    </div>
  </>
);

export default EmploymentSection;
