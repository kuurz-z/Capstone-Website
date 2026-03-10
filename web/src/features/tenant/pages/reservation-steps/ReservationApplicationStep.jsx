import React, { useState, useCallback } from "react";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
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
import { getDateConstraints } from "./applicationFormConstants";

// Sub-components
import {
  ApplicationProgressBar,
  PhotoEmailSection,
  PersonalInfoSection,
  EmergencyContactSection,
  EmploymentSection,
  DormPreferencesSection,
  AgreementsSection,
} from "./components";

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
              style={{ fontSize: "15px", fontWeight: "600", color: "#0f172a" }}
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
            ) : (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: hasError ? "600" : "500",
                  color: hasError ? "#DC2626" : "#9CA3AF",
                  backgroundColor: hasError ? "#FEE2E2" : "#F3F4F6",
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

// ─────────────────────────────────────────────────────────────
// ReservationApplicationStep — thin orchestrator
// 2,072 lines → ~250 lines (state, handlers, section routing)
// ─────────────────────────────────────────────────────────────
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
  // ── Modal state ────────────────────────────────────────────
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

  // ── Accordion state ────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState(new Set(["photo"]));

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  }, []);

  // ── Section completion ─────────────────────────────────────
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

  // ── Input handlers ─────────────────────────────────────────
  const handleNameInput = (value, setter) => setter(value.replace(/\d+/g, ""));
  const handlePhoneInput = (value, setter) => {
    let cleaned = value.replace(/[^0-9+]/g, "");
    if (!cleaned.startsWith("+63"))
      cleaned = "+63" + cleaned.replace(/^\+?63?/, "");
    if (cleaned.length <= 13) setter(cleaned);
  };
  const handleGeneralInput = (value, setter, maxLength = 100) => {
    if (value.length <= maxLength) setter(value);
  };
  const validateField = (fieldName, value, validator) => {
    const result = validator(value);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: result.error }));
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

  // ── Reset all ──────────────────────────────────────────────
  const handleResetAll = () => {
    setConfirmModal({
      open: true,
      title: "Reset All Fields",
      message:
        "This will clear all fields in the application form. This action cannot be undone.",
      variant: "danger",
      confirmText: "Reset All",
      onConfirm: () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        doResetAll();
      },
    });
  };
  const doResetAll = () => {
    [
      setFirstName,
      setLastName,
      setMiddleName,
      setNickname,
      setMobileNumber,
      setBirthday,
      setAddressUnitHouseNo,
      setAddressStreet,
      setAddressBarangay,
      setAddressCity,
      setAddressProvince,
      setNbiReason,
      setEmergencyContactName,
      setEmergencyRelationship,
      setEmergencyContactNumber,
      setHealthConcerns,
      setEmployerSchool,
      setEmployerAddress,
      setEmployerContact,
      setStartDate,
      setOccupation,
      setPreviousEmployment,
      setCompanyIDReason,
      setReferralSource,
      setReferrerName,
      setTargetMoveInDate,
      setEstimatedMoveInTime,
      setWorkSchedule,
      setWorkScheduleOther,
    ].forEach((s) => s(""));
    setMaritalStatus("single");
    setNationality("Filipino");
    setEducationLevel("college");
    [
      setSelfiePhoto,
      setValidIDFront,
      setValidIDBack,
      setNbiClearance,
      setCompanyID,
    ].forEach((s) => s(null));
    setAgreedToPrivacy(false);
    setAgreedToCertification(false);
    setFieldErrors({});
  };

  // ── Date constraints ───────────────────────────────────────
  const { birthdayMin, birthdayMax, moveInMin, moveInMax } =
    getDateConstraints();

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="reservation-card">
      {/* Header */}
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
      {readOnly && (
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
      )}

      {/* Reset button */}
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
            }}
          >
            Reset All Fields
          </button>
        </div>
      )}

      {/* Form wrapper */}
      <div
        style={{
          pointerEvents: readOnly ? "none" : "auto",
          opacity: readOnly ? 0.7 : 1,
        }}
      >
        <ApplicationProgressBar
          completedCount={completedCount}
          totalSections={totalSections}
          saveStatus={saveStatus}
        />

        {/* Section 1: Photo & Email */}
        <AccordionSection
          id="photo"
          title="Email & Photo"
          icon="1"
          isComplete={sectionStatus.photo}
          isExpanded={expandedSections.has("photo")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.photo}
        >
          <PhotoEmailSection
            billingEmail={billingEmail}
            selfiePhoto={selfiePhoto}
            setSelfiePhoto={setSelfiePhoto}
          />
        </AccordionSection>

        {/* Section 2: Personal Info */}
        <AccordionSection
          id="personal"
          title="Personal Information"
          icon="2"
          isComplete={sectionStatus.personal}
          isExpanded={expandedSections.has("personal")}
          onToggle={toggleSection}
          hasError={showValidationErrors && !sectionStatus.personal}
        >
          <PersonalInfoSection
            {...{
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
              handleNameInput,
              handlePhoneInput,
              handleGeneralInput,
              validateField,
              fieldErrors,
              birthdayMin,
              birthdayMax,
            }}
          />
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
          <EmergencyContactSection
            {...{
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
            }}
          />
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
          <EmploymentSection
            {...{
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
            }}
          />
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
          <DormPreferencesSection
            {...{
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
              handleTargetDateInput,
              handleTimeInput,
              readOnly,
              moveInMin,
              moveInMax,
              fieldErrors,
            }}
          />
        </AccordionSection>

        {/* Section 6: Agreements */}
        <AgreementsSection
          {...{
            agreedToPrivacy,
            setAgreedToPrivacy,
            agreedToCertification,
            setAgreedToCertification,
            showValidationErrors,
          }}
          onShowPolicies={() => setShowPoliciesModal(true)}
          onShowPrivacy={() => setShowPrivacyModal(true)}
        />
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

      {/* Footer buttons */}
      {readOnly && applicationSubmitted && !paymentApproved && (
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button onClick={onEditApplication} className="btn btn-primary">
            Edit Application
          </button>
        </div>
      )}
      {!readOnly && (
        <div className="stage-buttons" style={{ justifyContent: "flex-end" }}>
          <button onClick={onNext} className="btn btn-primary">
            {applicationSubmitted ? "Save Changes" : "Continue to Payment"}
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
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
