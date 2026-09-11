import GlobalLoading from "../../../shared/components/GlobalLoading";
import PaymentVerifyingModal from "../../../shared/components/PaymentVerifyingModal";
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
import { reservationApi } from "../../../shared/api/reservationApi";
import { queryKeys } from "../../../shared/lib/queryKeys";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// ReservationFlowPage ΓÇö thin JSX orchestrator
// All state/effects/handlers live in useReservationFlow hook.
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function ReservationFlowPage() {
  const flow = useReservationFlow();

  // ΓöÇΓöÇ Loading ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // payment=cancelled returns skip the spinner entirely — the user deliberately
  // pressed Back. Show Step 4 immediately with the inline recovery banner.
  const isPaymentCancellation = flow.paymentCancelled;

  const isPaymentVerifying =
    !isPaymentCancellation &&
    Boolean(flow.paymentReturnLoading || flow.paymentVerifyingRef.current);

  if (isPaymentVerifying) {
    return (
      <PaymentVerifyingModal
        show={true}
        step={2}
        title="Verifying Reservation Payment"
      />
    );
  }

  if (!flow.reservationData || flow.isLoading) {
    return <GlobalLoading />;
  }

  // ΓöÇΓöÇ Render ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  return (
    <div className="reservation-flow-container">
      {/* ΓöÇΓöÇ Success Overlay ΓöÇΓöÇ */}
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
        applicationSubmitted={flow.applicationSubmitted}
        loading={flow.isSubmittingApplication}
        onConfirm={flow.handleStageConfirm}
        onCancel={() => {
          flow.setShowStageConfirm(false);
          flow.setPendingStageAction(null);
        }}
      />

      <div className="reservation-layout">
        {/* Top Header & Exit to Dashboard Navigation */}
        <header className="rf-top-header" aria-label="Reservation navigation">
          <button
            type="button"
            className="rf-exit-button"
            onClick={flow.handleExitToDashboard}
            aria-label={flow.isReservationConfirmed ? "Back to dashboard" : "Exit to dashboard"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>{flow.isReservationConfirmed ? "Back to Dashboard" : "Exit to Dashboard"}</span>
          </button>

          <div className="rf-autosave-indicator" aria-live="polite">
            {flow.isReservationConfirmed ? (
              <span className="rf-autosave-status rf-autosave-saved">
                <span className="rf-autosave-dot success" aria-hidden="true" />
                Reservation confirmed
              </span>
            ) : flow.saveStatus === "saving" ? (
              <span className="rf-autosave-status rf-autosave-saving">
                <span className="rf-autosave-spinner" aria-hidden="true" />
                Saving draft...
              </span>
            ) : flow.saveStatus === "error" ? (
              <span className="rf-autosave-status rf-autosave-error">
                <span className="rf-autosave-dot error" aria-hidden="true" />
                Draft saved locally
              </span>
            ) : flow.hasUnsavedApplicationChanges ? (
              <span className="rf-autosave-status rf-autosave-pending">
                <span className="rf-autosave-dot warning" aria-hidden="true" />
                Unsaved changes
              </span>
            ) : flow.reservationData ? (
              <span className="rf-autosave-status rf-autosave-saved">
                <span className="rf-autosave-dot success" aria-hidden="true" />
                {flow.currentStage === 3 && flow.lastApplicationDraftSavedAt
                  ? "Draft auto-saved"
                  : "Progress auto-saved"}
              </span>
            ) : null}
          </div>
        </header>

        <ReservationStepper
          currentStage={flow.currentStage}
          reservation={flow.reservationData}
          applicationSubmitted={flow.applicationSubmitted}
          paymentSubmitted={flow.paymentSubmitted}
          paymentApproved={flow.paymentApproved}
          onStepClick={flow.handleStepperClick}
        />

        <main className="reservation-main">
          {flow.currentStage === 1 && (
            <ReservationSummaryStep
              reservationData={flow.reservationData}
              onNext={flow.handleNextStage}
              onUpdateStayPackage={flow.updateStayPackage}
              targetMoveInDate={flow.targetMoveInDate}
              setTargetMoveInDate={flow.setTargetMoveInDate}
              leaseDuration={flow.leaseDuration}
              setLeaseDuration={flow.setLeaseDuration}
              onChangeRoom={() => {
                if (flow.roomSelectionLocked) {
                  flow.notifyRoomSelectionLocked();
                  return;
                }
                const activeReservationId =
                  flow.reservationId ||
                  flow.reservationData?._id ||
                  flow.reservationData?.id;
                if (activeReservationId) {
                  flow.navigate(
                    `/applicant/check-availability?changeRoom=1&reservationId=${activeReservationId}`,
                  );
                  return;
                }
                flow.navigate("/applicant/check-availability");
              }}
              readOnly={flow.roomSelectionLocked || flow.isStageLocked(1)}
            />
          )}

          {flow.currentStage === 2 && (
            <ReservationVisitStep
              {...{
                targetMoveInDate: flow.targetMoveInDate,
                leaseDuration: flow.leaseDuration,
                viewingType: flow.viewingType,
                setViewingType: flow.setViewingType,
                remoteViewingAcknowledged: flow.remoteViewingAcknowledged,
                setRemoteViewingAcknowledged: flow.setRemoteViewingAcknowledged,
                remoteViewingQuestions: flow.remoteViewingQuestions,
                setRemoteViewingQuestions: flow.setRemoteViewingQuestions,
                isUrgentMoveIn: flow.isUrgentMoveIn,
                setIsUrgentMoveIn: flow.setIsUrgentMoveIn,
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
                visitCompleted: flow.visitCompleted,
                agreedToPrivacy: flow.agreedToPrivacy,
                scheduleRejected: flow.scheduleRejected,
                scheduleRejectionReason: flow.scheduleRejectionReason,
              }}
              onPrev={flow.handlePrevStage}
              onNext={flow.handleNextStage}
              readOnly={flow.isStageLocked(2)}
              viewingPreferenceAccess={flow.viewingPreferenceStepAccess}
              forceEditMode={flow.forceEditMode}
              onValidatePreferenceChange={flow.validateViewingPreferenceChange}
              onSaveVisit={async () => {
                if (!flow.viewingPreferenceStepAccess.canSubmit) {
                  flow.notifyViewingPreferenceLocked();
                  return null;
                }
                const viewingPreference = flow.viewingType;
                if (!viewingPreference) {
                  showNotification("Please choose a viewing preference before submitting.", "error", 3000);
                  return null;
                }
                const isPhysicalVisit = viewingPreference === "physical_visit";
                const result = await flow.updateReservationDraft({
                  agreedToPrivacy: true,
                  viewingPreference,
                  remoteViewingAcknowledged:
                    viewingPreference === "remote_2d_viewing"
                      ? flow.remoteViewingAcknowledged
                      : false,
                  remoteViewingQuestions:
                    viewingPreference === "remote_2d_viewing"
                      ? flow.remoteViewingQuestions
                      : "",
                  isUrgentMoveIn: viewingPreference === "urgent_move_in_review",
                  ...(isPhysicalVisit
                    ? {
                        visitDate: flow.visitDate,
                        visitTime: flow.visitTime,
                      }
                    : {}),
                });
                let resolvedCode = result?.visitCode || flow.visitCode || null;
                const reservationId = result?._id || flow.reservationId || null;

                if (viewingPreference === "physical_visit" && !resolvedCode && reservationId) {
                  for (let attempt = 0; attempt < 10; attempt += 1) {
                    await sleep(250);
                    const freshReservation = await reservationApi.getById(reservationId);
                    resolvedCode = freshReservation?.visitCode || null;
                    if (resolvedCode) break;
                  }
                }

                if (resolvedCode) {
                  flow.setVisitCode(resolvedCode);
                  return resolvedCode;
                }

                return null;
              }}

              onVisitSaved={async ({ visitCode, viewingPreference, visitDate, visitTime } = {}) => {
                // Optimistically patch the list cache so the side panel and
                // dashboard show the correct preference state the moment
                // ProfilePage mounts — no visible flicker of the old state.
                const listKey = queryKeys.reservations.all({});
                const cachedList = flow.queryClient.getQueryData(listKey);
                if (Array.isArray(cachedList) && flow.reservationId) {
                  flow.queryClient.setQueryData(
                    listKey,
                    cachedList.map((r) => {
                      if (r._id !== flow.reservationId) return r;
                      return {
                        ...r,
                        viewingPreference,
                        visitDate:
                          viewingPreference === "physical_visit"
                            ? visitDate || r.visitDate
                            : null,
                        visitTime:
                          viewingPreference === "physical_visit"
                            ? visitTime || r.visitTime
                            : null,
                        isUrgentMoveIn: viewingPreference === "urgent_move_in_review",
                        remoteViewingAcknowledged:
                          viewingPreference === "remote_2d_viewing"
                            ? (flow.remoteViewingAcknowledged ?? r.remoteViewingAcknowledged)
                            : false,
                        reservationStatus:
                          r.reservationStatus === "pending" ||
                          r.reservationStatus === "viewing_preference_selected"
                            ? "viewing_preference_selected"
                            : r.reservationStatus,
                      };
                    }),
                  );
                }

                if (viewingPreference === "physical_visit") {
                  flow.setVisitCompleted(false);
                  flow.setHighestStageReached((prev) => Math.max(prev, 2));
                  flow.queryClient.invalidateQueries({ queryKey: ["reservations"] });
                  flow.queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                  flow.returnToDashboardAfterViewingPreference({
                    viewingPreference,
                    visitCode,
                    visitDate,
                    visitTime,
                  });
                } else {
                  flow.setVisitCompleted(false);
                  flow.setHighestStageReached((prev) => Math.max(prev, 3));
                  flow.queryClient.invalidateQueries({ queryKey: ["reservations"] });
                  flow.queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                  showNotification(
                    "Viewing preference confirmed. You can now complete your tenant application.",
                    "success",
                    4000,
                  );
                  flow.handleNextStage();
                }
              }}
              onReturnToDashboard={flow.returnToDashboardAfterViewingPreference}
            />
          )}

          {flow.currentStage === 3 &&
            flow.applicationAccessAllowed && (
              <ReservationApplicationStep
                {...{
                  billingEmail: flow.billingEmail,
                  setBillingEmail: flow.setBillingEmail,
                  reservationData: flow.reservationData,
                  accountEmail: flow.userAccountEmail || flow.user?.email || "",
                  accountPhone: flow.userProfilePhone || flow.user?.phone || "",
                  accountFirstName: flow.user?.firstName || "",
                  accountLastName: flow.user?.lastName || "",
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
                  gender: flow.gender,
                  setGender: flow.setGender,
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
                  validIDType: flow.validIDType,
                  setValidIDType: flow.setValidIDType,
                  idValidationResult: flow.idValidationResult,
                  isValidatingId: flow.isValidatingId,
                  onValidateIdDocument: flow.validateApplicantIdDocument,
                  documentPrechecks: flow.documentPrechecks,
                  runningDocumentChecks: flow.runningDocumentChecks,
                  onRunDocumentPrecheck: flow.runDocumentPrecheck,
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
                  saveStatusMessage: flow.saveStatusMessage,
                  draftRecoveryMessage: flow.draftRecoveryMessage,
                  showValidationErrors: flow.showValidationErrors,
                  isSubmittingApplication: flow.isSubmittingApplication,
                  applicationSubmitted: flow.applicationSubmitted,
                  isApplicationApproved: flow.isApplicationApproved,
                  paymentApproved: flow.paymentApproved,
                  visitPending:
                    !flow.applicationAccessAllowed &&
                    !flow.applicationSubmitted,
                  scrollToSection: flow.scrollToSection,
                  onClearScrollToSection: () => flow.setScrollToSection(null),
                }}
                onPrev={flow.handlePrevStage}
                onNext={() => flow.handleNextStage()}
                readOnly={flow.isStageLocked(3)}
                onEditApplication={() => flow.setEditingApplication(true)}
              />
            )}

          {flow.currentStage === 4 && (
            <ReservationPaymentStep
              {...{
                reservationData: flow.reservationData,
                leaseDuration: flow.leaseDuration,
                targetMoveInDate: flow.targetMoveInDate,
                isLoading: flow.isLoading,
                payingOnline: flow.payingOnline,
                paymentAvailable: flow.paymentAvailable,
                applicationReviewReason: flow.applicationReviewReason,
                agreedToFeePolicy: flow.agreedToFeePolicy,
                setAgreedToFeePolicy: flow.setAgreedToFeePolicy,
                paymentCancelled: flow.paymentCancelled,
                paymentApproved: flow.paymentApproved,
                onUpdateStayPackage: flow.updateStayPackage,
                roomSelectionLocked: flow.roomSelectionLocked,
              }}
              onPrev={flow.handlePrevStage}
              onNext={flow.handleNextStage}
              onPayOnline={async () => {
                if (!flow.reservationId) {
                  showNotification("Reservation not found. Please try again.", "error", 3000);
                  return;
                }
                if (!flow.paymentAvailable) {
                  showNotification(
                    "Payment is still locked. It will only be available after your application and documents are approved.",
                    "info",
                    3500,
                  );
                  return;
                }
                // Clear the cancellation banner before redirecting to PayMongo.
                flow.setPaymentCancelled(false);
                try {
                  flow.setPayingOnline(true);
                  // Save move-in date before redirecting
                  if (flow.finalMoveInDate) {
                    await flow.updateReservationDraft({ finalMoveInDate: flow.finalMoveInDate });
                  }
                  const { checkoutUrl, sessionId } = await billingApi.createDepositCheckout(flow.reservationId);
                  flow.navigatingAwayRef.current = true;
                  // Persist reservation ID so we can reload on return from PayMongo.
                  // Key is scoped to the Firebase UID to prevent cross-user contamination
                  // on shared devices (e.g. User B signing in while User A is on PayMongo).
                  const uid = flow.user?.firebaseUid;
                  sessionStorage.setItem(
                    uid ? `activeReservationId_${uid}` : "activeReservationId",
                    flow.reservationId,
                  );
                  if (sessionId) {
                    sessionStorage.setItem("activeReservationPaymongoSessionId", sessionId);
                  }
                  sessionStorage.setItem("activeReservationPaymentReturnPending", "1");
                  window.location.href = checkoutUrl;
                } catch (error) {
                  console.error("Failed to create deposit checkout:", error);
                  showNotification(
                    error?.response?.data?.error ||
                      error?.message ||
                      "Failed to start online payment. Try again.",
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
                paymentApproved: flow.paymentApproved,
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
