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
        Person to Contact in Case of Emergency *
      </label>
      <input
        type="text"
        className="form-input"
        value={emergencyContactName}
        onChange={(e) => setEmergencyContactName(e.target.value)}
      />
    </div>

    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Relationship</label>
        <select
          className="form-select"
          value={emergencyRelationship}
          onChange={(e) => setEmergencyRelationship(e.target.value)}
        >
          <option value="">Select Relationship</option>
          <option value="parent">Parent</option>
          <option value="sibling">Sibling</option>
          <option value="relative">Relative</option>
          <option value="friend">Friend</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">
          Contact Number{" "}
          <span style={{ fontSize: "11px", color: "#666" }}>(+63...)</span>
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
        Any Health Related Concerns? (Please put N/A if not applicable) *
      </label>
      <textarea
        className="form-textarea"
        value={healthConcerns}
        onChange={(e) => setHealthConcerns(e.target.value)}
        placeholder="N/A or describe any health concerns"
      />
    </div>
  </>
);

export default EmergencyContactSection;
