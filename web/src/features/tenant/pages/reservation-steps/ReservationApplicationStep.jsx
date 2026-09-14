import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Loader2, User, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { formatBranch } from "../../../../shared/utils/formatDate";
import { sanitizeName, formatProperCase } from "../../../../shared/utils/authValidation";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import FormScrollArrows from "../../../../shared/components/FormScrollArrows";
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

const toDisplayString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    return toDisplayString(
      value.displayName ??
        value.name ??
        value.label ??
        value.title ??
        value.roomNumber ??
        value.slug ??
        value.key ??
        value.code ??
        value.value ??
        value.id,
      fallback,
    );
  }
  return fallback;
};

const getRoomName = (room) =>
  toDisplayString(room?.name || room?.roomNumber || room?.title || room?.id, "N/A");

import {
  PhotoEmailSection,
  PersonalInfoSection,
  EmergencyContactSection,
  EmploymentSection,
  DormPreferencesSection,
  AgreementsSection,
  ApplicationProgressBar,
} from "./components";

const APPLICATION_SECTIONS = [
  { key: "photo", number: 1, title: "Email & Photo" },
  { key: "personal", number: 2, title: "Personal Information" },
  { key: "emergency", number: 3, title: "Emergency Contact" },
  { key: "employment", number: 4, title: "Employment / School" },
  { key: "dorm", number: 5, title: "Dorm Preferences" },
  { key: "agreements", number: 6, title: "Agreements & Consent" },
];

const buildOpenSectionState = (isOpen) =>
  APPLICATION_SECTIONS.reduce((acc, section, index) => {
    acc[section.key] =
      typeof isOpen === "function" ? isOpen(section, index) : isOpen;
    return acc;
  }, {});

const CollapsibleSection = React.memo(
  ({
    number,
    title,
    sectionKey,
    isOpen,
    isCompleted,
    onToggle,
    sectionRef,
    children,
    contentClassName = "",
  }) => (
    <section ref={sectionRef} id={`section-${sectionKey}`} className="rf-app-section">
      <div className="rf-app-section__header">
        <button
          type="button"
          className="rf-app-section__title-button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`section-${sectionKey}-panel`}
        >
          <span
            className={`rf-app-section__num${isCompleted ? " is-complete rf-app-section__num--completed" : ""}`}
          >
            {isCompleted ? <CheckCircle2 size={16} strokeWidth={2.5} aria-hidden="true" /> : number}
          </span>
          <span className="rf-app-section__title-wrap">
            <span className="rf-app-section__title">{title}</span>
            {isCompleted && (
              <span className="rf-section-badge rf-section-badge--done" title="Section complete">
                <CheckCircle2 size={13} aria-hidden="true" /> Complete
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          className="rf-app-section__toggle"
          onClick={onToggle}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={isOpen}
          aria-controls={`section-${sectionKey}-panel`}
        >
          <ChevronDown size={20} strokeWidth={2.2} className={`rf-app-section__chevron${isOpen ? " is-open" : ""}`} />
        </button>
      </div>

      <div id={`section-${sectionKey}-panel`} className={`rf-app-section__body${isOpen ? " is-open" : ""}`} aria-hidden={!isOpen}>
        <div className={contentClassName}>{children}</div>
      </div>
    </section>
  ),
);

const ReservationApplicationStep = ({
  billingEmail,
  setBillingEmail,
  reservationData,
  accountEmail,
  accountPhone,
  accountFirstName,
  accountLastName,
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
  documentPrechecks,
  runningDocumentChecks,
  onRunDocumentPrecheck,
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
  saveStatusMessage,
  draftRecoveryMessage,
  showValidationErrors,
  isSubmittingApplication,
  applicationSubmitted,
  isApplicationApproved,
  paymentApproved,
  visitPending,
  onEditApplication,
  scrollToSection,
  onClearScrollToSection,
}) => {
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
  const [openSections, setOpenSections] = useState(() => buildOpenSectionState((s, i) => i === 0));

  const sectionRefs = useRef({});
  const isCheckingDocuments = Object.values(runningDocumentChecks || {}).some(Boolean);
  const submitDisabled = saveStatus === "saving" || isCheckingDocuments || isSubmittingApplication;

  // Section completion checks
  const isEmailValid = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || "").trim());
  const effectiveBillingEmail = String(accountEmail || billingEmail || "").trim();
  const section1Complete = Boolean(
    effectiveBillingEmail && isEmailValid(effectiveBillingEmail) && selfiePhoto
  );
  const section2Complete = Boolean(
    lastName?.trim() &&
      firstName?.trim() &&
      mobileNumber &&
      birthday &&
      gender &&
      maritalStatus &&
      nationality &&
      educationLevel &&
      addressUnitHouseNo?.trim() &&
      addressStreet?.trim() &&
      addressRegion &&
      addressCity &&
      addressBarangay &&
      validIDType &&
      validIDFront &&
      validIDBack &&
      (nbiClearance || nbiReason?.trim())
  );
  const section3Complete = Boolean(
    emergencyContactName?.trim() &&
      emergencyRelationship &&
      emergencyContactNumber &&
      healthConcerns?.trim()
  );
  const section4Complete = Boolean(
    employerSchool?.trim() &&
      employerAddress?.trim() &&
      occupation?.trim() &&
      (companyID || companyIDReason?.trim())
  );
  const section5Complete = Boolean(
    referralSource &&
      targetMoveInDate &&
      estimatedMoveInTime &&
      leaseDuration &&
      workSchedule &&
      (workSchedule !== "others" || workScheduleOther?.trim())
  );
  const section6Complete = Boolean(agreedToPrivacy && agreedToCertification);

  const sectionCompletionMap = useMemo(
    () => ({
      photo: section1Complete,
      personal: section2Complete,
      emergency: section3Complete,
      employment: section4Complete,
      dorm: section5Complete,
      agreements: section6Complete,
    }),
    [
      section1Complete,
      section2Complete,
      section3Complete,
      section4Complete,
      section5Complete,
      section6Complete,
    ]
  );

  const completedSectionsCount = useMemo(
    () => Object.values(sectionCompletionMap).filter(Boolean).length,
    [sectionCompletionMap]
  );

  useEffect(() => {
    if (!showValidationErrors) return;
    setOpenSections(buildOpenSectionState(true));
  }, [showValidationErrors]);

  useEffect(() => {
    if (!scrollToSection) return undefined;

    setOpenSections((prev) => ({ ...prev, [scrollToSection]: true }));

    const timer = setTimeout(() => {
      const el = sectionRefs.current[scrollToSection];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.style.transition = "background-color 0.4s ease";
        el.style.backgroundColor = "color-mix(in srgb, var(--foreground) 6%, transparent)";
        setTimeout(() => {
          el.style.backgroundColor = "";
        }, 1800);
      }
      onClearScrollToSection?.();
    }, 180);

    return () => clearTimeout(timer);
  }, [scrollToSection, onClearScrollToSection]);

  const toggleSection = (sectionKey) => setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));

  const handleNameInput = (value, setter) => {
    if (!value) {
      setter("");
      return;
    }
    setter(sanitizeName(value));
  };
  const handleGeneralInput = (value, setter, maxLength = 100) => { if (value.length <= maxLength) setter(value); };
  const validateField = (fieldName, value, validator) => { const result = validator(value); setFieldErrors((p) => ({ ...p, [fieldName]: result.error })); return result.valid; };
  const clearFieldError = (fieldName) => setFieldErrors((p) => (p[fieldName] ? { ...p, [fieldName]: null } : p));
  const handleTimeInput = (value) => { validateField("estimatedMoveInTime", value, validateEstimatedTime); setEstimatedMoveInTime(value); };
  const handleTargetDateInput = (value) => { validateField("targetMoveInDate", value, validateTargetMoveInDate); setTargetMoveInDate(value); };

  const handleResetAll = () => {
    setConfirmModal({ open: true, title: "Reset Form Fields", message: "This will clear all filled fields in the application form. This action cannot be undone.", variant: "danger", confirmText: "Reset Form", onConfirm: () => { setConfirmModal((p) => ({ ...p, open: false })); doResetAll(); } });
  };

  const doResetAll = () => {
    [
      setFirstName, setLastName, setMiddleName, setMobileNumber,
      setBirthday, setAddressUnitHouseNo, setAddressStreet, setAddressBarangay,
      setAddressCity, setAddressProvince, setAddressRegion, setNbiReason,
      setEmergencyContactName, setEmergencyRelationship, setEmergencyContactNumber,
      setHealthConcerns, setEmployerSchool, setEmployerAddress, setEmployerContact,
      setStartDate, setOccupation, setPreviousEmployment, setCompanyIDReason,
      setReferralSource, setReferrerName, setTargetMoveInDate, setEstimatedMoveInTime,
      setWorkSchedule, setWorkScheduleOther, setPersonalNotes, setPreferredRoomNumber,
      setGender, setNickname,
    ].forEach((s) => s(""));

    setGender(""); setMaritalStatus(""); setNationality(""); setEducationLevel(""); setLeaseDuration(""); setValidIDType("");
    [setSelfiePhoto, setValidIDFront, setValidIDBack, setNbiClearance, setCompanyID].forEach((s) => s(null));
    setAgreedToPrivacy(false); setAgreedToCertification(false);
    setFieldErrors({});
    setOpenSections(buildOpenSectionState((s, i) => i === 0));
  };

  const devAutoFill = () => {
    setFirstName("Juan"); setLastName("Dela Cruz"); setMiddleName("Santos"); setNickname("JD");
    setMobileNumber("+639171234567"); setBirthday("2000-05-15"); setGender("male");
    setMaritalStatus("single"); setNationality("Filipino"); setEducationLevel("college");
    setValidIDType("national_id"); setAddressUnitHouseNo("Unit 12-B"); setAddressStreet("Rizal Avenue");
    setPersonalNotes("Test applicant - dev auto-fill"); setNbiReason(""); setCompanyIDReason("");
    setEmergencyContactName("Maria Dela Cruz"); setEmergencyRelationship("parent"); setEmergencyContactNumber("+639181234567");
    setHealthConcerns("None"); setEmployerSchool("University of the Philippines"); setEmployerAddress("Diliman, Quezon City"); setEmployerContact("+639191234567");
    setStartDate("2024-06-01"); setOccupation("Software Developer"); setPreviousEmployment("Accenture Philippines");
    setReferralSource("facebook"); setReferrerName("Google Search"); setTargetMoveInDate(moveInMin); setEstimatedMoveInTime("08:00");
    setWorkSchedule("day"); setWorkScheduleOther(""); setLeaseDuration("12"); setAgreedToPrivacy(true); setAgreedToCertification(true);
    setOpenSections(buildOpenSectionState(true));
  };

  const { birthdayMin, birthdayMax, moveInMin, moveInMax } = useMemo(() => getDateConstraints(), []);
  const readonlyContentClass = readOnly ? "rf-readonly-wrapper" : "";
  const room = reservationData?.room || {};

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Main Header (Solid Colors, Standalone Icons, Room Designation Pill) */}
      <div className="space-y-2.5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center px-3 py-1 bg-transparent border border-slate-200 dark:border-slate-700 rounded-full">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Step 3 · Tenant Application
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {room && (room.name || room.roomNumber || room.title || room.branch || reservationData?.branch) && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 self-start sm:self-auto flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {getRoomName(room)} · {formatBranch(room.branch || reservationData?.branch)}
                </span>
              </div>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Reset Form
                </button>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={devAutoFill}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <span>⚡</span>
                    <span>Dev Auto-Fill</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <User className="w-7 h-7 text-slate-800 dark:text-slate-200 flex-shrink-0" />
            <span>Tenant Application</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1 max-w-2xl">
            Complete all fields below. Required fields are marked with <span className="text-rose-500 font-bold">*</span>
          </p>
        </div>
      </div>

      <ApplicationProgressBar
        completedCount={completedSectionsCount}
        totalSections={APPLICATION_SECTIONS.length}
        saveStatus={saveStatus}
      />

      {showValidationErrors && !applicationSubmitted && <div className="rf-form-alert" role="alert">Please complete the highlighted required fields before submitting.</div>}

      {readOnly && isApplicationApproved && (
        <div className="rf-locked-banner">
          <div className="info-box-title">Application Approved</div>
          <div className="info-text">
            Your application has been approved by the admin. The form is locked and cannot be edited.
          </div>
        </div>
      )}

      {readOnly && !isApplicationApproved && (
        <div className="rf-locked-banner">
          <div className="info-box-title">This section is locked</div>
          <div className="info-text">
            Your application has been submitted and is currently under review. It cannot be edited at this time.
          </div>
        </div>
      )}

      {!readOnly && visitPending && (
        <div className="rf-draft-banner"><div className="info-box-title">You can continue completing your application</div><div className="info-text">Your physical visit is pending. You may fill in your details and save your draft now — submission will be available once your visit is completed or approved.</div></div>
      )}

      <div className="rf-app-sections">
        <CollapsibleSection
          number={1}
          title="Email & Photo"
          sectionKey="photo"
          isOpen={openSections.photo}
          isCompleted={sectionCompletionMap.photo}
          onToggle={() => toggleSection("photo")}
          sectionRef={(el) => { sectionRefs.current.photo = el; }}
          contentClassName={readonlyContentClass}
        >
          <PhotoEmailSection
            billingEmail={billingEmail}
            setBillingEmail={setBillingEmail}
            accountEmail={accountEmail}
            selfiePhoto={selfiePhoto}
            setSelfiePhoto={setSelfiePhoto}
            showValidationErrors={showValidationErrors}
            fieldErrors={fieldErrors}
            validateField={validateField}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={2}
          title="Personal Information"
          sectionKey="personal"
          isOpen={openSections.personal}
          isCompleted={sectionCompletionMap.personal}
          onToggle={() => toggleSection("personal")}
          sectionRef={(el) => { sectionRefs.current.personal = el; }}
          contentClassName={readonlyContentClass}
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
              accountFirstName,
              accountLastName,
              accountPhone,
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
              documentPrechecks,
              runningDocumentChecks,
              onRunDocumentPrecheck,
              nbiClearance,
              setNbiClearance,
              nbiReason,
              setNbiReason,
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
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={3}
          title="Emergency Contact"
          sectionKey="emergency"
          isOpen={openSections.emergency}
          isCompleted={sectionCompletionMap.emergency}
          onToggle={() => toggleSection("emergency")}
          sectionRef={(el) => { sectionRefs.current.emergency = el; }}
          contentClassName={readonlyContentClass}
        >
          <EmergencyContactSection
            {...{
              emergencyContactName,
              setEmergencyContactName,
              emergencyRelationship,
              setEmergencyRelationship,
              emergencyContactNumber,
              setEmergencyContactNumber,
              mobileNumber,
              healthConcerns,
              setHealthConcerns,
              validateField,
              fieldErrors,
              showValidationErrors,
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={4}
          title="Employment / School"
          sectionKey="employment"
          isOpen={openSections.employment}
          isCompleted={sectionCompletionMap.employment}
          onToggle={() => toggleSection("employment")}
          sectionRef={(el) => { sectionRefs.current.employment = el; }}
          contentClassName={readonlyContentClass}
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
              documentPrechecks,
              runningDocumentChecks,
              onRunDocumentPrecheck,
              handleGeneralInput,
              validateField,
              fieldErrors,
              clearFieldError,
              showValidationErrors,
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={5}
          title="Dorm Preferences"
          sectionKey="dorm"
          isOpen={openSections.dorm}
          isCompleted={sectionCompletionMap.dorm}
          onToggle={() => toggleSection("dorm")}
          sectionRef={(el) => { sectionRefs.current.dorm = el; }}
          contentClassName={readonlyContentClass}
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
              validateField,
              showValidationErrors,
              // Legal Short/Long-Term classification is a fixed 1-5 / 6+ month
              // boundary (independent of pricing). The eligible-discount
              // messaging below it must instead reflect the room's actual
              // configurable pricing threshold, not that legal boundary.
              longTermLeaseMinMonths: room?.longTermLeaseMinMonths,
            }}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={6}
          title="Agreements & Consent"
          sectionKey="agreements"
          isOpen={openSections.agreements}
          isCompleted={sectionCompletionMap.agreements}
          onToggle={() => toggleSection("agreements")}
          sectionRef={(el) => { sectionRefs.current.agreements = el; }}
          contentClassName={readonlyContentClass}
        >
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
        </CollapsibleSection>
      </div>

      <PoliciesTermsModal isOpen={showPoliciesModal} onClose={() => setShowPoliciesModal(false)} />
      <PrivacyConsentModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />

      {/* Bottom Action Footer */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200 dark:border-slate-800 mt-6">
        {onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="w-full sm:w-auto min-h-[48px] h-12 px-5 rounded-xl font-medium text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} />
            <span>Previous Step</span>
          </button>
        ) : (
          <div />
        )}

        {isApplicationApproved ? (
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto min-w-[200px] min-h-[48px] h-12 px-6 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>{paymentApproved ? "View Reservation" : "Proceed to Payment"}</span>
            <ArrowRight size={16} />
          </button>
        ) : readOnly && applicationSubmitted && !paymentApproved ? (
          <button
            type="button"
            onClick={onEditApplication}
            className="w-full sm:w-auto min-w-[180px] min-h-[48px] h-12 px-6 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>Edit Application</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={submitDisabled || isSubmittingApplication}
            className="w-full sm:w-auto min-w-[200px] min-h-[48px] h-12 px-6 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>{applicationSubmitted ? "Save Changes" : visitPending ? "Save Progress" : "Submit Application"}</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
        loadingText={confirmModal.loadingText}
        loading={confirmModal.loading}
      />

      <FormScrollArrows />
    </div>
  );
};

export default ReservationApplicationStep;
