import React, { useState, useCallback } from "react";
import { Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
// Time slot options for estimated move-in time
const MOVE_IN_TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "18:00", label: "6:00 PM" },
];
import {
  PoliciesTermsModal,
  PrivacyConsentModal,
} from "../../modals/PoliciesAndConsent";
import {
  validateFullName,
  validatePhoneNumber,
  validateBirthday,
  validateAddress,
  validateUnitHouseNo,
  validateTargetMoveInDate,
  validateEstimatedTime,
  validateGeneralTextField,
  validateNameField,
  validateAddressField,
} from "../../utils/reservationValidation";

// Philippine locations data (simplified - can be expanded)
const REGIONS = [
  "Regionl Autonomous Region in Muslim Mindanao (ARMM)",
  "Bicol Region",
  "Calabarzon",
  "Cavite",
  "Laguna",
  "Quezon",
  "Rizal",
  "NCR - National Capital Region",
  "CAR - Cordillera Administrative Region",
  "Region I - Ilocos",
  "Region II - Cagayan Valley",
  "Region III - Central Luzon",
  "Region IV - Mimaropa",
  "Region V - Bicol",
  "Region VI - Western Visayas",
  "Region VII - Central Visayas",
  "Region VIII - Eastern Visayas",
  "Region IX - Zamboanga Peninsula",
  "Region X - Northern Mindanao",
  "Region XI - Davao",
  "Region XII - Soccsksargen",
];

const CITIES = [
  "Manila",
  "Quezon City",
  "Caloocan",
  "Las Piñas",
  "Makati",
  "Parañaque",
  "Pasay",
  "Pasig",
  "Taguig",
  "Valenzuela",
  "Cebu",
  "Davao",
  "Cagayan de Oro",
  "Bacolod",
  "Iloilo City",
];

/* ─── Accordion Section (MUST be outside the main component to avoid focus loss) ─── */
const AccordionSection = React.memo(
  ({
    id,
    title,
    icon,
    isComplete,
    isExpanded,
    onToggle,
    hasError,
    children,
  }) => {
    const borderColor = isComplete
      ? "#10B981"
      : hasError
        ? "#EF4444"
        : "#e5e7eb";
    return (
      <div
        style={{
          border: `1.5px solid ${borderColor}`,
          borderRadius: "12px",
          marginBottom: "12px",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            border: "none",
            background: isComplete
              ? "#F0FDF4"
              : hasError
                ? "#FEF2F2"
                : isExpanded
                  ? "#F8FAFC"
                  : "#fff",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span
              style={{
                fontSize: "15px",
                fontWeight: "600",
                color: "#0f172a",
              }}
            >
              {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isComplete ? (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#059669",
                  backgroundColor: "#D1FAE5",
                  padding: "3px 10px",
                  borderRadius: "999px",
                }}
              >
                Complete
              </span>
            ) : hasError ? (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#DC2626",
                  backgroundColor: "#FEE2E2",
                  padding: "3px 10px",
                  borderRadius: "999px",
                }}
              >
                Incomplete
              </span>
            ) : (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "#9CA3AF",
                  backgroundColor: "#F3F4F6",
                  padding: "3px 10px",
                  borderRadius: "999px",
                }}
              >
                Incomplete
              </span>
            )}
            <span
              style={{
                transition: "transform 0.2s ease",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                color: "#6B7280",
                fontSize: "18px",
              }}
            >
              ▾
            </span>
          </div>
        </button>
        {isExpanded && (
          <div style={{ padding: "4px 20px 20px" }}>{children}</div>
        )}
      </div>
    );
  },
);

const ReservationApplicationStep = ({
  billingEmail,
  selfiePhoto,
  setSelfiePhoto,
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
  emergencyContactName,
  setEmergencyContactName,
  emergencyRelationship,
  setEmergencyRelationship,
  emergencyContactNumber,
  setEmergencyContactNumber,
  healthConcerns,
  setHealthConcerns,
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
  companyID,
  setCompanyID,
  companyIDReason,
  setCompanyIDReason,
  previousEmployment,
  setPreviousEmployment,
  preferredRoomNumber,
  setPreferredRoomNumber,
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
  agreedToPrivacy,
  setAgreedToPrivacy,
  agreedToCertification,
  setAgreedToCertification,
  devBypassValidation,
  setDevBypassValidation,
  onPrev,
  onNext,
  readOnly,
  saveStatus,
  showValidationErrors,
  applicationSubmitted,
  paymentApproved,
  onEditApplication,
}) => {
  // Modal states
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Accordion state — track which sections are expanded
  const [expandedSections, setExpandedSections] = useState(new Set(["photo"]));

  // Section completion tracking
  const sectionStatus = {
    photo: Boolean(selfiePhoto),
    personal: Boolean(
      firstName &&
      lastName &&
      middleName &&
      nickname &&
      mobileNumber &&
      birthday &&
      maritalStatus &&
      nationality &&
      educationLevel &&
      addressUnitHouseNo &&
      addressStreet &&
      addressBarangay &&
      addressCity &&
      addressProvince &&
      validIDFront &&
      validIDBack &&
      (nbiClearance || nbiReason),
    ),
    emergency: Boolean(
      emergencyContactName &&
      emergencyRelationship &&
      emergencyContactNumber &&
      healthConcerns,
    ),
    employment: Boolean(
      employerSchool &&
      employerAddress &&
      employerContact &&
      occupation &&
      (companyID || companyIDReason),
    ),
    dorm: Boolean(
      referralSource && targetMoveInDate && estimatedMoveInTime && workSchedule,
    ),
  };

  const completedCount = Object.values(sectionStatus).filter(Boolean).length;
  const totalSections = Object.keys(sectionStatus).length;

  const canProceed = agreedToPrivacy && agreedToCertification;

  // Read-only notice at top
  const ReadOnlyBanner = readOnly ? (
    <div
      className="info-box"
      style={{
        background: "#FEF3C7",
        borderColor: "#F59E0B",
        marginBottom: "16px",
      }}
    >
      <div className="info-box-title" style={{ color: "#92400E" }}>
        This section is locked
      </div>
      <div className="info-text" style={{ color: "#78350F" }}>
        Your application data is saved and cannot be edited at this time.
      </div>
    </div>
  ) : null;

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Input validation handlers
  const handleNameInput = (value, setter) => {
    // Remove numbers from input
    const cleanedValue = value.replace(/\d+/g, "");
    setter(cleanedValue);
  };

  const handlePhoneInput = (value, setter) => {
    // Strip non-digit characters except +
    let cleaned = value.replace(/[^0-9+]/g, "");
    // Always ensure +63 prefix
    if (!cleaned.startsWith("+63")) {
      cleaned = "+63" + cleaned.replace(/^\+?63?/, "");
    }
    // Limit to +63 + 10 digits = 13 chars
    if (cleaned.length <= 13) {
      setter(cleaned);
    }
  };

  // Text-only input handler — strips numbers and special chars
  const handleTextOnlyInput = (value, setter, maxLength = 100) => {
    const textOnly = value.replace(/[0-9]/g, "");
    if (textOnly.length <= maxLength) {
      setter(textOnly);
    }
  };

  const handleGeneralInput = (value, setter, maxLength = 100) => {
    if (value.length <= maxLength) {
      setter(value);
    }
  };

  const accentColor = "#0c375f"; // --rf-primary
  const cardBackground = "#f8fafc"; // --rf-surface-alt
  const cardBorder = "#e2e8f0"; // --rf-border

  // Date constraints
  const today = new Date();
  const birthdayMax = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate(),
  )
    .toISOString()
    .split("T")[0];
  const birthdayMin = new Date(
    today.getFullYear() - 80,
    today.getMonth(),
    today.getDate(),
  )
    .toISOString()
    .split("T")[0];
  const moveInMin = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const moveInMax = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const validateField = (fieldName, value, validator) => {
    const result = validator(value);
    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: result.error,
    }));
    return result.valid;
  };

  const handleTimeInput = (value) => {
    validateField("estimatedMoveInTime", value, validateEstimatedTime);
    setEstimatedMoveInTime(value);
  };

  const handleTargetDateInput = (value) => {
    validateField("targetMoveInDate", value, validateTargetMoveInDate);
    setTargetMoveInDate(value);
  };

  const handleResetAll = () => {
    setConfirmModal({
      open: true,
      title: "Reset All Fields",
      message:
        "This will clear all fields in the application form. This action cannot be undone.",
      variant: "danger",
      confirmText: "Reset All",
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        doResetAll();
      },
    });
  };

  const doResetAll = () => {
    setFirstName("");
    setLastName("");
    setMiddleName("");
    setNickname("");
    setMobileNumber("");
    setBirthday("");
    setMaritalStatus("single");
    setNationality("Filipino");
    setEducationLevel("college");
    setAddressUnitHouseNo("");
    setAddressStreet("");
    setAddressBarangay("");
    setAddressCity("");
    setAddressProvince("");
    setSelfiePhoto(null);
    setValidIDFront(null);
    setValidIDBack(null);
    setValidIDType("");
    setNbiClearance(null);
    setNbiReason("");
    setEmergencyContactName("");
    setEmergencyRelationship("");
    setEmergencyContactNumber("");
    setHealthConcerns("");
    setEmployerSchool("");
    setEmployerAddress("");
    setEmployerContact("");
    setStartDate("");
    setOccupation("");
    setPreviousEmployment("");
    setCompanyID(null);
    setCompanyIDReason("");
    setReferralSource("");
    setReferrerName("");
    setTargetMoveInDate("");
    setEstimatedMoveInTime("");
    setWorkSchedule("");
    setWorkScheduleOther("");
    setAgreedToPrivacy(false);
    setAgreedToCertification(false);
    setFieldErrors({});
  };

  return (
    <div className="reservation-card">
      {/* Step Header */}
      <div className="main-header">
        <div className="main-header-badge">
          <span>Step 3 · Verification</span>
        </div>
        <h2 className="main-header-title">Tenant Application</h2>
        <p className="main-header-subtitle">
          Fill out each section below to complete your application. Sections
          turn green when all required fields are filled.
        </p>
      </div>

      {/* Read-Only Banner */}
      {ReadOnlyBanner}

      {/* Reset All button — only when editable */}
      {!readOnly && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "12px",
          }}
        >
          <button
            type="button"
            onClick={handleResetAll}
            style={{
              background: "none",
              border: "1px solid #D1D5DB",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: "500",
              color: "#6B7280",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Reset All Fields
          </button>
        </div>
      )}

      {/* Form content wrapper — disable interaction when readOnly */}
      <div
        style={{
          pointerEvents: readOnly ? "none" : "auto",
          opacity: readOnly ? 0.7 : 1,
        }}
      >
        {/* Progress Bar */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <span
              style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}
            >
              {completedCount} of {totalSections} sections complete
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Auto-save indicator */}
              {saveStatus && (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "500",
                    color:
                      saveStatus === "saving"
                        ? "#6B7280"
                        : saveStatus === "saved"
                          ? "#059669"
                          : saveStatus === "error"
                            ? "#DC2626"
                            : "#9CA3AF",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {saveStatus === "saving" && "Saving..."}
                  {saveStatus === "saved" && "Draft saved"}
                  {saveStatus === "error" && "Save failed"}
                </span>
              )}
              <span
                style={{
                  fontSize: "12px",
                  color:
                    completedCount === totalSections ? "#059669" : "#9CA3AF",
                }}
              >
                {completedCount === totalSections
                  ? "✓ Ready to submit"
                  : `${Math.round((completedCount / totalSections) * 100)}%`}
              </span>
            </div>
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: "#E5E7EB",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(completedCount / totalSections) * 100}%`,
                height: "100%",
                backgroundColor:
                  completedCount === totalSections ? "#10B981" : "#E7710F",
                borderRadius: "999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Section 1: Email & Photo */}
        <AccordionSection
          id="photo"
          title="Email & Photo"
          icon="1"
          isComplete={sectionStatus.photo}
          isExpanded={expandedSections.has("photo")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.photo}
        >
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={billingEmail}
              disabled
            />
            <div className="form-helper">
              This is where we'll send your billing statements
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">2x2 Photo or Selfie Photo</label>
            <Upload
              accept="image/*"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                setSelfiePhoto(info.fileList[0]?.originFileObj || null);
              }}
              fileList={
                selfiePhoto
                  ? [
                      {
                        uid: "-1",
                        name:
                          selfiePhoto instanceof File
                            ? selfiePhoto.name
                            : "Uploaded Photo",
                        originFileObj:
                          selfiePhoto instanceof File ? selfiePhoto : undefined,
                        url:
                          typeof selfiePhoto === "string"
                            ? selfiePhoto
                            : undefined,
                        status: "done",
                      },
                    ]
                  : []
              }
              style={{ marginTop: "8px" }}
            >
              <div
                style={{
                  padding: "16px",
                  border: "2px dashed #d9d9d9",
                  borderRadius: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    marginBottom: "8px",
                    color: "#6B7280",
                  }}
                >
                  ↑
                </div>
                <div style={{ color: "#666" }}>
                  Click to upload or drag and drop
                </div>
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}
                >
                  Clear 2x2 or selfie photo
                </div>
              </div>
            </Upload>
          </div>
        </AccordionSection>

        {/* Section 2: Personal Information */}
        <AccordionSection
          id="personal"
          title="Personal Information"
          icon="2"
          isComplete={sectionStatus.personal}
          isExpanded={expandedSections.has("personal")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.personal}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Last name"
                maxLength="32"
                value={lastName}
                onChange={(e) => handleNameInput(e.target.value, setLastName)}
                onBlur={() =>
                  validateField("lastName", lastName, validateNameField)
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.lastName && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.lastName}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="First name"
                maxLength="32"
                value={firstName}
                onChange={(e) => handleNameInput(e.target.value, setFirstName)}
                onBlur={() =>
                  validateField("firstName", firstName, validateNameField)
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.firstName && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.firstName}
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Middle Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Middle name"
                maxLength="32"
                value={middleName}
                onChange={(e) => handleNameInput(e.target.value, setMiddleName)}
                onBlur={() =>
                  validateField("middleName", middleName, validateNameField)
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.middleName && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.middleName}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Nickname</label>
              <input
                type="text"
                className="form-input"
                placeholder="Nickname"
                maxLength="32"
                value={nickname}
                onChange={(e) => handleNameInput(e.target.value, setNickname)}
                onBlur={() =>
                  validateField("nickname", nickname, validateNameField)
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.nickname && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.nickname}
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+63912345678"
                value={mobileNumber}
                onChange={(e) =>
                  handlePhoneInput(e.target.value, setMobileNumber)
                }
                onBlur={() =>
                  validateField(
                    "mobileNumber",
                    mobileNumber,
                    validatePhoneNumber,
                  )
                }
              />
              {fieldErrors.mobileNumber && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.mobileNumber}
                </div>
              )}
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
                  validateField("birthday", e.target.value, validateBirthday);
                }}
                style={{
                  colorScheme: "light",
                  cursor: "pointer",
                }}
              />

              {fieldErrors.birthday && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.birthday}
                </div>
              )}
            </div>
          </div>

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

          <fieldset style={{ border: "none", padding: "0 0 20px 0" }}>
            <legend className="form-label">
              Permanent Address: Unit / House No. *
            </legend>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., 123-A"
              maxLength="64"
              value={addressUnitHouseNo}
              onChange={(e) =>
                handleGeneralInput(e.target.value, setAddressUnitHouseNo, 64)
              }
              onBlur={() =>
                validateField(
                  "addressUnitHouseNo",
                  addressUnitHouseNo,
                  validateUnitHouseNo,
                )
              }
              style={{ border: "1.5px solid #999" }}
            />
            {fieldErrors.addressUnitHouseNo && (
              <div
                style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}
              >
                {fieldErrors.addressUnitHouseNo}
              </div>
            )}
          </fieldset>

          <fieldset style={{ border: "none", padding: "0 0 20px 0" }}>
            <legend className="form-label">Permanent Address: Street</legend>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Rizal Street"
              maxLength="64"
              value={addressStreet}
              onChange={(e) =>
                handleGeneralInput(e.target.value, setAddressStreet, 64)
              }
              onBlur={() =>
                validateField("addressStreet", addressStreet, (v) =>
                  validateGeneralTextField(v, 64),
                )
              }
              style={{ border: "1.5px solid #999" }}
            />
            {fieldErrors.addressStreet && (
              <div
                style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}
              >
                {fieldErrors.addressStreet}
              </div>
            )}
          </fieldset>

          <fieldset style={{ border: "none", padding: "0 0 20px 0" }}>
            <legend className="form-label">
              Permanent Address: Barangay *
            </legend>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Barangay 1"
              maxLength="32"
              value={addressBarangay}
              onChange={(e) =>
                handleGeneralInput(e.target.value, setAddressBarangay, 32)
              }
              onBlur={() =>
                validateField(
                  "addressBarangay",
                  addressBarangay,
                  validateAddressField,
                )
              }
              style={{ border: "1.5px solid #999" }}
            />
            {fieldErrors.addressBarangay && (
              <div
                style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}
              >
                {fieldErrors.addressBarangay}
              </div>
            )}
          </fieldset>

          <div className="form-row">
            <fieldset style={{ border: "none", padding: "0" }}>
              <legend className="form-label">
                Permanent Address: City or Municipality *
              </legend>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Manila"
                maxLength="32"
                value={addressCity}
                onChange={(e) =>
                  handleGeneralInput(e.target.value, setAddressCity, 32)
                }
                onBlur={() =>
                  validateField(
                    "addressCity",
                    addressCity,
                    validateAddressField,
                  )
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.addressCity && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.addressCity}
                </div>
              )}
            </fieldset>
            <fieldset style={{ border: "none", padding: "0" }}>
              <legend className="form-label">
                Permanent Address: Region / Province *
              </legend>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., NCR"
                maxLength="32"
                value={addressProvince}
                onChange={(e) =>
                  handleGeneralInput(e.target.value, setAddressProvince, 32)
                }
                onBlur={() =>
                  validateField(
                    "addressProvince",
                    addressProvince,
                    validateAddressField,
                  )
                }
                style={{ border: "1.5px solid #999" }}
              />
              {fieldErrors.addressProvince && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
                  {fieldErrors.addressProvince}
                </div>
              )}
            </fieldset>
          </div>

          <div className="form-group">
            <label className="form-label">Valid ID (Front)</label>
            <Upload
              accept="image/*,.pdf"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                setValidIDFront(info.fileList[0]?.originFileObj || null);
              }}
              fileList={
                validIDFront
                  ? [
                      {
                        uid: "-1",
                        name:
                          validIDFront instanceof File
                            ? validIDFront.name
                            : "ID Front Uploaded",
                        originFileObj:
                          validIDFront instanceof File
                            ? validIDFront
                            : undefined,
                        url:
                          typeof validIDFront === "string"
                            ? validIDFront
                            : undefined,
                        status: "done",
                      },
                    ]
                  : []
              }
              style={{ marginTop: "8px" }}
            >
              <div
                style={{
                  padding: "16px",
                  border: "2px dashed #d9d9d9",
                  borderRadius: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    marginBottom: "8px",
                    color: "#6B7280",
                  }}
                >
                  ↑
                </div>
                <div style={{ color: "#666" }}>
                  Click to upload or drag and drop
                </div>
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}
                >
                  Government-issued ID (Front side)
                </div>
              </div>
            </Upload>
          </div>

          <div className="form-group">
            <label className="form-label">Valid ID (Back)</label>
            <Upload
              accept="image/*,.pdf"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                setValidIDBack(info.fileList[0]?.originFileObj || null);
              }}
              fileList={
                validIDBack
                  ? [
                      {
                        uid: "-1",
                        name:
                          validIDBack instanceof File
                            ? validIDBack.name
                            : "ID Back Uploaded",
                        originFileObj:
                          validIDBack instanceof File ? validIDBack : undefined,
                        url:
                          typeof validIDBack === "string"
                            ? validIDBack
                            : undefined,
                        status: "done",
                      },
                    ]
                  : []
              }
              style={{ marginTop: "8px" }}
            >
              <div
                style={{
                  padding: "16px",
                  border: "2px dashed #d9d9d9",
                  borderRadius: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    marginBottom: "8px",
                    color: "#6B7280",
                  }}
                >
                  ↑
                </div>
                <div style={{ color: "#666" }}>
                  Click to upload or drag and drop
                </div>
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}
                >
                  Government-issued ID (Back side)
                </div>
              </div>
            </Upload>
          </div>

          <div className="form-group">
            <label className="form-label">
              NBI Clearance (If unable, upload another valid ID) *
            </label>
            <Upload
              accept="image/*,.pdf"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                setNbiClearance(info.fileList[0]?.originFileObj || null);
              }}
              fileList={
                nbiClearance
                  ? [
                      {
                        uid: "-1",
                        name:
                          nbiClearance instanceof File
                            ? nbiClearance.name
                            : "NBI Clearance Uploaded",
                        originFileObj:
                          nbiClearance instanceof File
                            ? nbiClearance
                            : undefined,
                        url:
                          typeof nbiClearance === "string"
                            ? nbiClearance
                            : undefined,
                        status: "done",
                      },
                    ]
                  : []
              }
              style={{ marginTop: "8px" }}
            >
              <div
                style={{
                  padding: "16px",
                  border: "2px dashed #d9d9d9",
                  borderRadius: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    marginBottom: "8px",
                    color: "#6B7280",
                  }}
                >
                  ↑
                </div>
                <div style={{ color: "#666" }}>
                  Click to upload or drag and drop
                </div>
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}
                >
                  NBI Clearance or additional valid ID
                </div>
              </div>
            </Upload>
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
        </AccordionSection>

        {/* Section 3: Emergency Contact */}
        <AccordionSection
          id="emergency"
          title="Emergency Contact"
          icon="3"
          isComplete={sectionStatus.emergency}
          isExpanded={expandedSections.has("emergency")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.emergency}
        >
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
                <span style={{ fontSize: "11px", color: "#666" }}>
                  (+63...)
                </span>
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
                    validatePhoneNumber,
                  )
                }
              />
              {fieldErrors.emergencyContactNumber && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    marginTop: "4px",
                  }}
                >
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
        </AccordionSection>

        {/* Section 4: Employment */}
        <AccordionSection
          id="employment"
          title="Employment / School"
          icon="4"
          isComplete={sectionStatus.employment}
          isExpanded={expandedSections.has("employment")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.employment}
        >
          <div className="section-helper">
            If not yet employed, please put N/A. For students, please put name
            of school instead of employer.
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
              onChange={(e) =>
                handleGeneralInput(e.target.value, setOccupation, 100)
              }
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

          <div className="form-group">
            <label className="form-label">Company ID</label>
            <Upload
              accept="image/*,.pdf"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                setCompanyID(info.fileList[0]?.originFileObj || null);
              }}
              fileList={
                companyID
                  ? [
                      {
                        uid: "-1",
                        name:
                          companyID instanceof File
                            ? companyID.name
                            : "Company ID Uploaded",
                        originFileObj:
                          companyID instanceof File ? companyID : undefined,
                        url:
                          typeof companyID === "string" ? companyID : undefined,
                        status: "done",
                      },
                    ]
                  : []
              }
              style={{ marginTop: "8px" }}
            >
              <div
                style={{
                  padding: "16px",
                  border: "2px dashed #d9d9d9",
                  borderRadius: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    fontSize: "20px",
                    marginBottom: "8px",
                    color: "#6B7280",
                  }}
                >
                  ↑
                </div>
                <div style={{ color: "#666" }}>
                  Click to upload or drag and drop
                </div>
                <div
                  style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}
                >
                  Company ID or employee badge
                </div>
              </div>
            </Upload>
          </div>

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
        </AccordionSection>

        {/* Section 5: Dorm Preferences */}
        <AccordionSection
          id="dorm"
          title="Dorm Preferences"
          icon="5"
          isComplete={sectionStatus.dorm}
          isExpanded={expandedSections.has("dorm")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.dorm}
        >
          <div className="form-group">
            <label className="form-label">
              How Did You First Learn About Lilycrest Gil Puyat?
            </label>
            <div className="radio-group">
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="facebook"
                  value="facebook"
                  checked={referralSource === "facebook"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="facebook" className="radio-label">
                  Facebook Ad
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="instagram"
                  value="instagram"
                  checked={referralSource === "instagram"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="instagram" className="radio-label">
                  Instagram
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="tiktok"
                  value="tiktok"
                  checked={referralSource === "tiktok"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="tiktok" className="radio-label">
                  TikTok
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="walkin"
                  value="walkin"
                  checked={referralSource === "walkin"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="walkin" className="radio-label">
                  Walk-in
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="friend"
                  value="friend"
                  checked={referralSource === "friend"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="friend" className="radio-label">
                  Referred by a Friend
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="referral"
                  id="other"
                  value="other"
                  checked={referralSource === "other"}
                  onChange={(e) => setReferralSource(e.target.value)}
                />
                <label htmlFor="other" className="radio-label">
                  Other
                </label>
              </div>
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
            <div
              style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px" }}
            >
              Must be at least 3 days from today
            </div>
            {fieldErrors.targetMoveInDate && (
              <div
                style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}
              >
                {fieldErrors.targetMoveInDate}
              </div>
            )}
          </div>

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
              <div
                style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}
              >
                {fieldErrors.estimatedMoveInTime}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Duration of Lease</label>
            <select
              className="form-select"
              value={leaseDuration}
              onChange={(e) => setLeaseDuration(e.target.value)}
            >
              <option value="12">1 year</option>
              <option value="6">6 months</option>
              <option value="5">5 months</option>
              <option value="4">4 months</option>
              <option value="3">3 months</option>
              <option value="2">2 months</option>
              <option value="1">1 month</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Work Schedule</label>
            <div className="radio-group">
              <div className="radio-option">
                <input
                  type="radio"
                  name="schedule"
                  id="dayshift"
                  value="day"
                  checked={workSchedule === "day"}
                  onChange={(e) => setWorkSchedule(e.target.value)}
                />
                <label htmlFor="dayshift" className="radio-label">
                  Day Shift (around 9 am to 5 pm)
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="schedule"
                  id="nightshift"
                  value="night"
                  checked={workSchedule === "night"}
                  onChange={(e) => setWorkSchedule(e.target.value)}
                />
                <label htmlFor="nightshift" className="radio-label">
                  Night Shift (around 11 pm to 7 am)
                </label>
              </div>
              <div className="radio-option">
                <input
                  type="radio"
                  name="schedule"
                  id="others"
                  value="others"
                  checked={workSchedule === "others"}
                  onChange={(e) => setWorkSchedule(e.target.value)}
                />
                <label htmlFor="others" className="radio-label">
                  Others
                </label>
              </div>
            </div>
          </div>

          {workSchedule === "others" && (
            <div className="form-group">
              <label className="form-label">
                If You Answered "Others", Please Specify Your Work Schedule
                Below *
              </label>
              <textarea
                className="form-textarea"
                value={workScheduleOther}
                onChange={(e) => setWorkScheduleOther(e.target.value)}
                placeholder="Please describe your typical work schedule"
              />
            </div>
          )}
        </AccordionSection>

        {/* Agreements & Consent — inline (not in accordion) */}
        <div
          style={{
            border: `1.5px solid ${
              agreedToPrivacy && agreedToCertification
                ? "#10B981"
                : showValidationErrors &&
                    (!agreedToPrivacy || !agreedToCertification)
                  ? "#EF4444"
                  : "#e5e7eb"
            }`,
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "12px",
            background:
              agreedToPrivacy && agreedToCertification
                ? "#F0FDF4"
                : showValidationErrors &&
                    (!agreedToPrivacy || !agreedToCertification)
                  ? "#FEF2F2"
                  : "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "20px" }}>6</span>
            <span
              style={{ fontSize: "15px", fontWeight: "600", color: "#1F2937" }}
            >
              Agreements & Consent
            </span>
            {agreedToPrivacy && agreedToCertification ? (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#059669",
                  backgroundColor: "#D1FAE5",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  marginLeft: "auto",
                }}
              >
                Agreed
              </span>
            ) : showValidationErrors ? (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#DC2626",
                  backgroundColor: "#FEE2E2",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  marginLeft: "auto",
                }}
              >
                Required
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "12px",
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              id="privacy-consent"
              checked={agreedToPrivacy}
              onChange={(e) => setAgreedToPrivacy(e.target.checked)}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <label
              htmlFor="privacy-consent"
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              <strong>Privacy Policy & Data Protection Consent</strong>{" "}
              <span style={{ color: "#dc2626" }}>*</span>
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#6b7280",
                  marginTop: "2px",
                }}
              >
                I consent to the collection and use of my personal data for
                dormitory services.
              </span>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "12px",
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              id="certification"
              checked={agreedToCertification}
              onChange={(e) => setAgreedToCertification(e.target.checked)}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <label
              htmlFor="certification"
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              <strong>Information Accuracy Certification</strong>{" "}
              <span style={{ color: "#dc2626" }}>*</span>
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#6b7280",
                  marginTop: "2px",
                }}
              >
                I certify all information is true and accurate. False
                information may result in rejection.
              </span>
            </label>
          </div>

          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            By proceeding, you agree to our{" "}
            <button
              type="button"
              onClick={() => setShowPoliciesModal(true)}
              style={{
                color: "#1E40AF",
                fontWeight: "500",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontSize: "12px",
                textDecoration: "underline",
              }}
            >
              Policies & Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              style={{
                color: "#1E40AF",
                fontWeight: "500",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontSize: "12px",
                textDecoration: "underline",
              }}
            >
              Privacy Policy
            </button>
            .
          </div>
        </div>

        {/* Close pointer-events wrapper */}
      </div>

      {/* Modals */}
      <PoliciesTermsModal
        isOpen={showPoliciesModal}
        onClose={() => setShowPoliciesModal(false)}
      />
      <PrivacyConsentModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {readOnly && applicationSubmitted && !paymentApproved && (
        <div className="stage-buttons flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={() => {
              setConfirmModal({
                open: true,
                title: "Leave Application",
                message:
                  "Are you sure you want to go back? Your progress has been saved.",
                variant: "warning",
                confirmText: "Go Back",
                onConfirm: () => {
                  setConfirmModal((prev) => ({ ...prev, open: false }));
                  onPrev();
                },
              });
            }}
            className="btn btn-secondary"
          >
            Back to Dashboard
          </button>
          <button onClick={onEditApplication} className="btn btn-primary">
            Edit Application
          </button>
        </div>
      )}

      {!readOnly && (
        <div className="stage-buttons flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={() => {
              setConfirmModal({
                open: true,
                title: "Leave Application",
                message:
                  "Are you sure you want to go back? Your progress has been saved.",
                variant: "warning",
                confirmText: "Go Back",
                onConfirm: () => {
                  setConfirmModal((prev) => ({ ...prev, open: false }));
                  onPrev();
                },
              });
            }}
            className="btn btn-secondary"
          >
            Back to Dashboard
          </button>
          <button onClick={onNext} className="btn btn-primary">
            {applicationSubmitted ? "Save Changes" : "Continue to Payment"}
          </button>
        </div>
      )}
      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </div>
  );
};

export default ReservationApplicationStep;
