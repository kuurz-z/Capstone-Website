import React from "react";

/**
 * Section 3: Emergency Contact — name, relationship, phone, health concerns.
 */
const EmergencyContactSection = ({
  emergencyContactName,
  setEmergencyContactName,
  emergencyRelationship,
  setEmergencyRelationship,
  emergencyContactNumber,
  setEmergencyContactNumber,
  healthConcerns,
  setHealthConcerns,
  handlePhoneInput,
  validateField,
  fieldErrors,
}) => (
  <>
    <div className="form-group">
      <label className="form-label">
        Person to Contact in Case of Emergency{" "}
        <span style={{ color: "#dc2626" }}>*</span>
      </label>
      <input
        type="text"
        className="form-input"
        placeholder="Full name of emergency contact"
        value={emergencyContactName}
        onChange={(e) => setEmergencyContactName(e.target.value)}
        onBlur={() =>
          validateField("emergencyContactName", emergencyContactName, (v) => {
            const valid = v && v.trim().length >= 2;
            return {
              valid,
              error: valid ? null : "Please enter the contact person's full name",
            };
          })
        }
      />
      {fieldErrors.emergencyContactName && (
        <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
          {fieldErrors.emergencyContactName}
        </div>
      )}
    </div>

    <div className="form-row">
      <div className="form-group">
        <label className="form-label">
          Relationship <span style={{ color: "#dc2626" }}>*</span>
        </label>
        <select
          className="form-select"
          value={emergencyRelationship}
          onChange={(e) => setEmergencyRelationship(e.target.value)}
        >
          <option value="">Select relationship...</option>
          <option value="parent">Parent</option>
          <option value="sibling">Sibling</option>
          <option value="spouse">Spouse</option>
          <option value="relative">Relative</option>
          <option value="friend">Friend</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">
          Contact Number{" "}
          <span style={{ fontSize: "11px", color: "#666" }}>(+63...)</span>{" "}
          <span style={{ color: "#dc2626" }}>*</span>
        </label>
        <input
          type="tel"
          className="form-input"
          placeholder="+63912345678"
          value={emergencyContactNumber}
          onChange={(e) =>
            handlePhoneInput(e.target.value, setEmergencyContactNumber)
          }
          onBlur={() =>
            validateField(
              "emergencyContactNumber",
              emergencyContactNumber,
              (v) => {
                const valid = /^\+63\d{10}$/.test(v);
                return {
                  valid,
                  error: valid
                    ? null
                    : "Enter valid PH mobile (+63 + 10 digits)",
                };
              },
            )
          }
        />
        {fieldErrors.emergencyContactNumber && (
          <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
            {fieldErrors.emergencyContactNumber}
          </div>
        )}
      </div>
    </div>

    <div className="form-group">
      <label className="form-label">
        Any Health Related Concerns? (Please put N/A if not applicable){" "}
        <span style={{ color: "#dc2626" }}>*</span>
      </label>
      <textarea
        className="form-textarea"
        value={healthConcerns}
        onChange={(e) => setHealthConcerns(e.target.value)}
        placeholder="N/A or describe any health concerns"
        maxLength={500}
      />
      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px", textAlign: "right" }}>
        {healthConcerns.length}/500
      </div>
    </div>
  </>
);

export default EmergencyContactSection;
