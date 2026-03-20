import GlobalLoading from "../../../shared/components/GlobalLoading";
import { Clock } from "lucide-react";
import "../../../shared/styles/notification.css";
import "../styles/reservation-flow.css";

// Step components
import ReservationSummaryStep from "./reservation-steps/ReservationSummaryStep";
import ReservationVisitStep from "./reservation-steps/ReservationVisitStep";
import ReservationApplicationStep from "./reservation-steps/ReservationApplicationStep";
import ReservationPaymentStep from "./reservation-steps/ReservationPaymentStep";
import ReservationConfirmationStep from "./reservation-steps/ReservationConfirmationStep";

// Extracted sub-components
import {
  ReservationStepper,
  RoomInfoBanner,
  LoginConfirmModal,
  CancelConfirmModal,
  StageConfirmModal,
} from "./reservation-flow";

// All state + logic lives in this hook
import useReservationFlow from "../hooks/useReservationFlow";
import { showNotification } from "../../../shared/utils/notification";
import { billingApi } from "../../../shared/api/apiClient";

// ─────────────────────────────────────────────────────────
// ReservationFlowPage — thin JSX orchestrator
// All state/effects/handlers live in useReservationFlow hook.
// ─────────────────────────────────────────────────────────
function ReservationFlowPage() {
  const flow = useReservationFlow();

  // ── Loading ────────────────────────────────────────────
  if (!flow.reservationData || flow.paymentVerifyingRef.current) return <GlobalLoading />;

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="reservation-flow-container">
      {/* ── Success Overlay ── */}
      {flow.successOverlay.show && (
        <div className="rf-success-overlay">
          <div className="rf-success-overlay-content">
            <div className="rf-success-checkmark">
              <svg viewBox="0 0 52 52">
                <circle className="rf-checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                <path className="rf-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            <h2 className="rf-success-title">{flow.successOverlay.title}</h2>
            <p className="rf-success-subtitle">{flow.successOverlay.subtitle}</p>
            <div className="rf-success-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}
      <LoginConfirmModal
        show={flow.showLoginConfirm}
        onLogin={() => {
          flow.setShowLoginConfirm(false);
          flow.navigate("/signin");
        }}
        onDismiss={() => {
          flow.setShowLoginConfirm(false);
          flow.navigate("/applicant/check-availability");
        }}
      />
      <CancelConfirmModal
        show={flow.showCancelConfirm}
        onConfirm={() => {
          flow.setShowCancelConfirm(false);
          flow.navigate("/applicant/check-availability");
        }}
        onDismiss={() => flow.setShowCancelConfirm(false)}
      />
      <StageConfirmModal
        show={flow.showStageConfirm}
        pendingAction={flow.pendingStageAction}
        onConfirm={flow.handleStageConfirm}
        onCancel={() => {
          flow.setShowStageConfirm(false);
          flow.setPendingStageAction(null);
        }}
      />

      <div className="reservation-layout">
        {/* Breadcrumb */}
        <nav className="rf-breadcrumb">
          <button
            className="rf-breadcrumb-link"
            onClick={() => flow.navigate("/applicant/profile")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Dashboard
          </button>
          <span className="rf-breadcrumb-sep">/</span>
          <span className="rf-breadcrumb-current">Reservation Flow</span>
        </nav>

        <ReservationStepper
          currentStage={flow.currentStage}
          isStageLocked={flow.isStageLocked}
          paymentApproved={flow.paymentApproved}
        />
        <RoomInfoBanner room={flow.reservationData?.room} />

        <main className="reservation-main">
          {flow.currentStage === 1 && (
            <ReservationSummaryStep
              reservationData={flow.reservationData}
              onNext={flow.handleNextStage}
              readOnly={flow.isStageLocked(1)}
            />
          )}

          {flow.currentStage === 2 && (
            <ReservationVisitStep
              {...{
                targetMoveInDate: flow.targetMoveInDate,
                viewingType: flow.viewingType,
                setViewingType: flow.setViewingType,
                isOutOfTown: flow.isOutOfTown,
                setIsOutOfTown: flow.setIsOutOfTown,
                currentLocation: flow.currentLocation,
                setCurrentLocation: flow.setCurrentLocation,
                visitApproved: flow.visitApproved,
                visitorName: flow.visitorName,
                setVisitorName: flow.setVisitorName,
                visitorPhone: flow.visitorPhone,
                setVisitorPhone: flow.setVisitorPhone,
                visitorEmail: flow.visitorEmail,
                setVisitorEmail: flow.setVisitorEmail,
                visitDate: flow.visitDate,
                setVisitDate: flow.setVisitDate,
                visitTime: flow.visitTime,
                setVisitTime: flow.setVisitTime,
                reservationData: flow.reservationData,
                reservationCode: flow.reservationCode,
                visitCode: flow.visitCode,
                agreedToPrivacy: flow.agreedToPrivacy,
                scheduleRejected: flow.scheduleRejected,
                scheduleRejectionReason: flow.scheduleRejectionReason,
              }}
              onPrev={flow.handlePrevStage}
              onNext={flow.handleNextStage}
              readOnly={flow.isStageLocked(2)}
              onSaveVisit={async () => {
                const result = await flow.updateReservationDraft({
                  agreedToPrivacy: true,
                  viewingType: "inperson",
                  visitDate: flow.visitDate,
                  visitTime: flow.visitTime,
                });
                if (result?.visitCode) flow.setVisitCode(result.visitCode);
                return result?.visitCode || null;
              }}
              onAfterClose={() => {
                flow.setVisitCompleted(true);
                flow.setHighestStageReached((prev) => Math.max(prev, 3));
                flow.setSuccessOverlay({
                  show: true,
                  title: "Visit Booked!",
                  subtitle: "Your visit has been scheduled. We will notify you once the admin approves.",
                });
                setTimeout(() => flow.navigate("/applicant/profile"), 2200);
              }}
            />
          )}

          {flow.currentStage === 3 &&
            (flow.visitApproved ? (
              <ReservationApplicationStep
                {...{
                  billingEmail: flow.billingEmail,
                  selfiePhoto: flow.selfiePhoto,
                  setSelfiePhoto: flow.setSelfiePhoto,
                  lastName: flow.lastName,
                  setLastName: flow.setLastName,
                  firstName: flow.firstName,
                  setFirstName: flow.setFirstName,
                  middleName: flow.middleName,
                  setMiddleName: flow.setMiddleName,
                  nickname: flow.nickname,
                  setNickname: flow.setNickname,
                  mobileNumber: flow.mobileNumber,
                  setMobileNumber: flow.setMobileNumber,
                  birthday: flow.birthday,
                  setBirthday: flow.setBirthday,
                  maritalStatus: flow.maritalStatus,
                  setMaritalStatus: flow.setMaritalStatus,
                  nationality: flow.nationality,
                  setNationality: flow.setNationality,
                  educationLevel: flow.educationLevel,
                  setEducationLevel: flow.setEducationLevel,
                  addressUnitHouseNo: flow.addressUnitHouseNo,
                  setAddressUnitHouseNo: flow.setAddressUnitHouseNo,
                  addressStreet: flow.addressStreet,
                  setAddressStreet: flow.setAddressStreet,
                  addressRegion: flow.addressRegion,
                  setAddressRegion: flow.setAddressRegion,
                  addressBarangay: flow.addressBarangay,
                  setAddressBarangay: flow.setAddressBarangay,
                  addressCity: flow.addressCity,
                  setAddressCity: flow.setAddressCity,
                  addressProvince: flow.addressProvince,
                  setAddressProvince: flow.setAddressProvince,
                  validIDFront: flow.validIDFront,
                  setValidIDFront: flow.setValidIDFront,
                  validIDBack: flow.validIDBack,
                  setValidIDBack: flow.setValidIDBack,
                  nbiClearance: flow.nbiClearance,
                  setNbiClearance: flow.setNbiClearance,
                  nbiReason: flow.nbiReason,
                  setNbiReason: flow.setNbiReason,
                  companyID: flow.companyID,
                  setCompanyID: flow.setCompanyID,
                  companyIDReason: flow.companyIDReason,
                  setCompanyIDReason: flow.setCompanyIDReason,
                  emergencyContactName: flow.emergencyContactName,
                  setEmergencyContactName: flow.setEmergencyContactName,
                  emergencyRelationship: flow.emergencyRelationship,
                  setEmergencyRelationship: flow.setEmergencyRelationship,
                  emergencyContactNumber: flow.emergencyContactNumber,
                  setEmergencyContactNumber: flow.setEmergencyContactNumber,
                  healthConcerns: flow.healthConcerns,
                  setHealthConcerns: flow.setHealthConcerns,
                  employerSchool: flow.employerSchool,
                  setEmployerSchool: flow.setEmployerSchool,
                  employerAddress: flow.employerAddress,
                  setEmployerAddress: flow.setEmployerAddress,
                  employerContact: flow.employerContact,
                  setEmployerContact: flow.setEmployerContact,
                  startDate: flow.startDate,
                  setStartDate: flow.setStartDate,
                  occupation: flow.occupation,
                  setOccupation: flow.setOccupation,
                  previousEmployment: flow.previousEmployment,
                  setPreviousEmployment: flow.setPreviousEmployment,
                  preferredRoomNumber: flow.preferredRoomNumber,
                  setPreferredRoomNumber: flow.setPreferredRoomNumber,
                  referralSource: flow.referralSource,
                  setReferralSource: flow.setReferralSource,
                  referrerName: flow.referrerName,
                  setReferrerName: flow.setReferrerName,
                  targetMoveInDate: flow.targetMoveInDate,
                  setTargetMoveInDate: flow.setTargetMoveInDate,
                  leaseDuration: flow.leaseDuration,
                  setLeaseDuration: flow.setLeaseDuration,
                  estimatedMoveInTime: flow.estimatedMoveInTime,
                  setEstimatedMoveInTime: flow.setEstimatedMoveInTime,
                  workSchedule: flow.workSchedule,
                  setWorkSchedule: flow.setWorkSchedule,
                  workScheduleOther: flow.workScheduleOther,
                  setWorkScheduleOther: flow.setWorkScheduleOther,
                  agreedToPrivacy: flow.agreedToPrivacy,
                  setAgreedToPrivacy: flow.setAgreedToPrivacy,
                  agreedToCertification: flow.agreedToCertification,
                  setAgreedToCertification: flow.setAgreedToCertification,
                  personalNotes: flow.personalNotes,
                  setPersonalNotes: flow.setPersonalNotes,
                  devBypassValidation: flow.devBypassValidation,
                  setDevBypassValidation: flow.setDevBypassValidation,
                  saveStatus: flow.saveStatus,
                  showValidationErrors: flow.showValidationErrors,
                  applicationSubmitted: flow.applicationSubmitted,
                  paymentApproved: flow.paymentApproved,
                  scrollToSection: flow.scrollToSection,
                  onClearScrollToSection: () => flow.setScrollToSection(null),
                }}
                onPrev={() => flow.navigate("/applicant/profile")}
                onNext={() => flow.handleNextStage()}
                readOnly={flow.isStageLocked(3)}
                onEditApplication={() => flow.setEditingApplication(true)}
              />
            ) : (
              <div className="reservation-card">
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
                    <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Clock size={36} color="#2563EB" />
                    </div>
                  </div>
                  <h2 className="stage-title">Waiting for Visit Approval</h2>
                  <p
                    className="main-header-subtitle"
                    style={{ marginBottom: "24px" }}
                  >
                    Your visit has been scheduled but is not yet approved by
                    admin. Please check your profile for updates.
                  </p>
                  <button
                    onClick={() => flow.navigate("/applicant/profile")}
                    className="btn btn-primary"
                    style={{ maxWidth: "280px", margin: "0 auto" }}
                  >
                    Go to Profile
                  </button>
                </div>
              </div>
            ))}

          {flow.currentStage === 4 && (
            <ReservationPaymentStep
              {...{
                reservationData: flow.reservationData,
                leaseDuration: flow.leaseDuration,
                finalMoveInDate: flow.finalMoveInDate,
                setFinalMoveInDate: flow.setFinalMoveInDate,
                isLoading: flow.isLoading,
                payingOnline: flow.payingOnline,
              }}
              onMoveInDateUpdate={() =>
                showNotification(
                  "Move-in date updated. Availability will be checked.",
                  "info",
                  2000,
                )
              }
              onPrev={flow.handlePrevStage}
              onNext={flow.handleNextStage}
              onPayOnline={async () => {
                if (!flow.reservationId) {
                  showNotification("Reservation not found. Please try again.", "error", 3000);
                  return;
                }
                try {
                  flow.setPayingOnline(true);
                  // Save move-in date before redirecting
                  if (flow.finalMoveInDate) {
                    await flow.updateReservationDraft({ finalMoveInDate: flow.finalMoveInDate });
                  }
                  const { checkoutUrl } = await billingApi.createDepositCheckout(flow.reservationId);
                  flow.navigatingAwayRef.current = true;
                  // Persist reservation ID so we can reload on return from PayMongo
                  sessionStorage.setItem("activeReservationId", flow.reservationId);
                  window.location.href = checkoutUrl;
                } catch (error) {
                  console.error("Failed to create deposit checkout:", error);
                  showNotification(
                    error?.message || "Failed to start online payment. Try again.",
                    "error",
                    3000,
                  );
                  flow.setPayingOnline(false);
                }
              }}
              readOnly={flow.isStageLocked(4)}
            />
          )}

          {flow.currentStage === 5 && (
            <ReservationConfirmationStep
              {...{
                reservationCode: flow.reservationCode,
                reservationData: flow.reservationData,
                paymentMethod: flow.paymentMethod,
                visitDate: flow.visitDate,
                visitTime: flow.visitTime,
                leaseDuration: flow.leaseDuration,
              }}
              finalMoveInDate={flow.finalMoveInDate || flow.targetMoveInDate}
              applicantName={`${flow.firstName} ${flow.lastName}`.trim()}
              applicantEmail={flow.billingEmail}
              applicantPhone={flow.mobileNumber}
              onViewDetails={() => flow.navigate("/applicant/profile", { state: { tab: "reservation" } })}
              onReturnHome={() => flow.navigate("/applicant/profile", { state: { tab: "dashboard" } })}
              isPaymentReturn={flow.justPaidRef.current}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default ReservationFlowPage;
