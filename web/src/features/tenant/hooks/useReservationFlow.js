/**
 * =============================================================================
 * useReservationFlow — Custom Hook
 * =============================================================================
 *
 * Extracted from ReservationFlowPage.jsx.
 * Contains ALL state declarations, refs, effects, data loading, and
 * stage handlers for the 5-step reservation flow.
 *
 * The page component (ReservationFlowPage) calls this hook and renders
 * the JSX using the returned state and handlers.
 *
 * =============================================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { showNotification } from "../../../shared/utils/notification";
import getFriendlyError from "../../../shared/utils/friendlyError";
import { reservationApi, roomApi, billingApi, authApi } from "../../../shared/api/apiClient";
import { normalizeReservationStatus } from "../../../shared/utils/lifecycleNaming";
import { usePaymentRedirect } from "./usePaymentRedirect";
import { uploadIfFile } from "../../../shared/utils/imageUpload";
import {
  validateBirthday,
  validateEstimatedTime,
  validateTargetMoveInDate,
  validatePHPhoneLocal,
  validatePHPhoneOrLandline,
} from "../utils/reservationValidation";

// Returns a sessionStorage key scoped to the Firebase UID when known,
// falling back to the legacy unscoped key for backward compatibility.
const getActiveResKey = (uid) =>
  uid ? `activeReservationId_${uid}` : "activeReservationId";

export default function useReservationFlow() {
  const navigate = useNavigate();
  const appNavigate = useAppNavigation();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stepFromState = Number(location.state?.step);
  const stepFromQuery = Number(
    new URLSearchParams(location.search).get("step"),
  );
  const stepOverride =
    Number.isInteger(stepFromState) && stepFromState > 0
      ? stepFromState
      : Number.isInteger(stepFromQuery) && stepFromQuery > 0
        ? stepFromQuery
        : null;
  const isStepMode = Boolean(stepOverride);

  // ── Core state ─────────────────────────────────────────
  const [reservationData, setReservationData] = useState(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [highestStageReached, setHighestStageReached] = useState(1);
  const [isLoading, setIsLoading] = useState(
    () =>
      new URLSearchParams(window.location.search).has("payment") ||
      Boolean(sessionStorage.getItem("activeReservationId")) ||
      // Also check user-scoped keys (set after login is known)
      Object.keys(sessionStorage).some((k) => k.startsWith("activeReservationId_"))
  );
  const [visitApproved, setVisitApproved] = useState(false);
  const [visitCompleted, setVisitCompleted] = useState(false);
  const [scheduleRejected, setScheduleRejected] = useState(false);
  const [scheduleRejectionReason, setScheduleRejectionReason] = useState("");
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [editingApplication, setEditingApplication] = useState(false);
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [reservationId, setReservationId] = useState(null);
  const [devBypassValidation, setDevBypassValidation] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState({
    show: false,
    title: "",
    subtitle: "",
  });

  // Stage 1
  const [targetMoveInDate, setTargetMoveInDate] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("");
  const [billingEmail, setBillingEmail] = useState(user?.email || "");

  // Stage 2
  const [viewingType, setViewingType] = useState("inperson");
  const [isOutOfTown, setIsOutOfTown] = useState(false);
  const [currentLocation, setCurrentLocation] = useState("");
  const [visitorName, setVisitorName] = useState(user?.displayName || "");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState(user?.email || "");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");

  // Stage 3: Photo
  const [selfiePhoto, setSelfiePhoto] = useState(null);

  // Stage 3: Personal
  const [firstName, setFirstName] = useState(
    user?.displayName?.split(" ")[0] || "",
  );
  const [lastName, setLastName] = useState(
    user?.displayName?.split(" ")[1] || "",
  );
  const [middleName, setMiddleName] = useState("");
  const [nickname, setNickname] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [nationality, setNationality] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [addressUnitHouseNo, setAddressUnitHouseNo] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressBarangay, setAddressBarangay] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressProvince, setAddressProvince] = useState("");
  const [validIDFront, setValidIDFront] = useState(null);
  const [validIDBack, setValidIDBack] = useState(null);
  const [validIDType, setValidIDType] = useState("");
  const [idValidationResult, setIdValidationResult] = useState(null);
  const [isValidatingId, setIsValidatingId] = useState(false);
  const [nbiClearance, setNbiClearance] = useState(null);
  const [nbiReason, setNbiReason] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");

  // Stage 3: Emergency
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [healthConcerns, setHealthConcerns] = useState("");

  // Stage 3: Employment
  const [employerSchool, setEmployerSchool] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [employerContact, setEmployerContact] = useState("");
  const [startDate, setStartDate] = useState("");
  const [occupation, setOccupation] = useState("");
  const [companyID, setCompanyID] = useState(null);
  const [companyIDReason, setCompanyIDReason] = useState("");
  const [previousEmployment, setPreviousEmployment] = useState("");

  // Stage 3: Dorm
  const [roomType, setRoomType] = useState("quadruple");
  const [preferredRoomNumber, setPreferredRoomNumber] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [estimatedMoveInTime, setEstimatedMoveInTime] = useState("");
  const [workSchedule, setWorkSchedule] = useState("");
  const [workScheduleOther, setWorkScheduleOther] = useState("");

  // Stage 3: Agreements
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToCertification, setAgreedToCertification] = useState(false);

  // Stage 4: Payment — tenant must acknowledge the non-refundable fee policy
  const [agreedToFeePolicy, setAgreedToFeePolicy] = useState(false);
  const [finalMoveInDate, setFinalMoveInDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  // Stage 5
  const [reservationCode, setReservationCode] = useState("");
  const [visitCode, setVisitCode] = useState("");

  // UI state
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [pendingStageAction, setPendingStageAction] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [scrollToSection, setScrollToSection] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState({
    targetMoveInDate: "",
    leaseDuration: "",
    billingEmail: "",
  });

  // ── Capture payment redirect flag + status at render time (before effects clear URL) ──
  const paymentReturnStatusRef = useRef(
    new URLSearchParams(window.location.search).get("payment")
  );
  const isPaymentReturnRef = useRef(Boolean(paymentReturnStatusRef.current));

  // ── Payment redirect hook (must be after all useState) ────
  const { searchParams, setSearchParams } = usePaymentRedirect({
    user,
    showNotification,
    navigate,
    setPaymentSubmitted,
    setPaymentApproved,
    setPaymentMethod,
    setCurrentStage,
    setHighestStageReached,
  });
  const [saveStatus, setSaveStatus] = useState("");
  const autoSaveTimerRef = useRef(null);
  const isFirstRenderRef = useRef(true);
  const navigatingAwayRef = useRef(false);

  // ── Warn before leaving mid-flow (skip if intentional navigation) ──
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (navigatingAwayRef.current) return;
      if (isFormDirty || currentStage > 1) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFormDirty, currentStage]);

  // ── Stepper locking ────────────────────────────────────
  const isStageLocked = (stageId) => {
    if (paymentApproved) return stageId < 5;
    if (stageId === 1) return visitCompleted;
    if (stageId === 2) return visitCompleted && !scheduleRejected; // unlock when admin rejects visit
    if (stageId === 3) return applicationSubmitted && !editingApplication;
    if (stageId === 4) return paymentSubmitted || paymentApproved;
    return false;
  };

  const isStageClickable = (stageId) => {
    if (stageId === 1) return highestStageReached >= 2;
    if (stageId <= highestStageReached) return true;
    if (stageId === 4 && applicationSubmitted) return true;
    if (stageId === 5 && paymentSubmitted) return true;
    return false;
  };

  const handleStepperClick = (stageId) => {
    if (!isStageClickable(stageId)) return;
    if (isStageLocked(stageId)) return;
    if (stageId === 1 && reservationId) {
      navigate(
        `/applicant/check-availability?changeRoom=1&reservationId=${reservationId}`,
      );
      return;
    }
    setCurrentStage(stageId);
  };

  // ── Helpers to populate state from a reservation object ────
  const populateFromReservation = (r) => {
    if (r.firstName) setFirstName(r.firstName);
    if (r.lastName) setLastName(r.lastName);
    if (r.middleName) setMiddleName(r.middleName);
    if (r.nickname) setNickname(r.nickname);
    if (r.mobileNumber) setMobileNumber(r.mobileNumber);
    if (r.birthday) {
      const b = new Date(r.birthday);
      if (!isNaN(b)) setBirthday(b.toISOString().split("T")[0]);
    }
    if (r.maritalStatus) setMaritalStatus(r.maritalStatus);
    if (r.nationality) setNationality(r.nationality);
    if (r.educationLevel) setEducationLevel(r.educationLevel);
    if (r.address) {
      setAddressUnitHouseNo(r.address.unitHouseNo || "");
      setAddressStreet(r.address.street || "");
      setAddressRegion(r.address.region || "");
      setAddressBarangay(r.address.barangay || "");
      setAddressCity(r.address.city || "");
      setAddressProvince(r.address.province || "");
    }
    if (r.emergencyContact?.name)
      setEmergencyContactName(r.emergencyContact.name);
    if (r.emergencyContact?.relationship)
      setEmergencyRelationship(r.emergencyContact.relationship);
    if (r.emergencyContact?.contactNumber)
      setEmergencyContactNumber(r.emergencyContact.contactNumber);
    if (r.healthConcerns) setHealthConcerns(r.healthConcerns);
    if (r.employment?.employerSchool)
      setEmployerSchool(r.employment.employerSchool);
    if (r.employment?.employerAddress)
      setEmployerAddress(r.employment.employerAddress);
    if (r.employment?.employerContact)
      setEmployerContact(r.employment.employerContact);
    if (r.employment?.startDate) {
      const sd = new Date(r.employment.startDate);
      if (!isNaN(sd)) setStartDate(sd.toISOString().split("T")[0]);
    }
    if (r.employment?.occupation) setOccupation(r.employment.occupation);
    if (r.employment?.previousEmployment)
      setPreviousEmployment(r.employment.previousEmployment);
    if (r.preferredRoomType) setRoomType(r.preferredRoomType);
    if (r.preferredRoomNumber) setPreferredRoomNumber(r.preferredRoomNumber);
    if (r.referralSource) setReferralSource(r.referralSource);
    if (r.referrerName) setReferrerName(r.referrerName);
    if (r.estimatedMoveInTime) setEstimatedMoveInTime(r.estimatedMoveInTime);
    if (r.workSchedule) setWorkSchedule(r.workSchedule);
    if (r.workScheduleOther) setWorkScheduleOther(r.workScheduleOther);
    if (r.targetMoveInDate)
      setTargetMoveInDate(
        r.targetMoveInDate.split?.("T")?.[0] || r.targetMoveInDate,
      );
    if (r.leaseDuration) setLeaseDuration(String(r.leaseDuration));
    // Restore agreements ONLY if the application was previously submitted
    // (prevents step 2's agreedToPrivacy from pre-checking step 3's consent)
    const hasApplication = Boolean(r.firstName && r.lastName && r.mobileNumber);
    if (hasApplication && r.agreedToPrivacy) setAgreedToPrivacy(true);
    if (hasApplication && r.agreedToCertification) setAgreedToCertification(true);
    // File URLs
    if (r.selfiePhotoUrl) setSelfiePhoto(r.selfiePhotoUrl);
    if (r.validIDFrontUrl) setValidIDFront(r.validIDFrontUrl);
    if (r.validIDBackUrl) setValidIDBack(r.validIDBackUrl);
    if (r.nbiClearanceUrl) setNbiClearance(r.nbiClearanceUrl);
    if (r.nbiReason) setNbiReason(r.nbiReason);
    if (r.companyIDUrl) setCompanyID(r.companyIDUrl);
    if (r.companyIDReason) setCompanyIDReason(r.companyIDReason);
    if (r.personalNotes) setPersonalNotes(r.personalNotes);
    if (r.idType || r.validIDType) setValidIDType(r.idType || r.validIDType);
    if (r.idValidationStatus && r.idValidationStatus !== "not_validated") {
      setIdValidationResult({
        validationStatus: r.idValidationStatus,
        message:
          r.idValidationStatus === "passed"
            ? "ID verified successfully."
            : r.idValidationStatus === "failed"
              ? "ID image is unclear. Please upload a clearer photo."
              : r.idValidationStatus === "manual_review"
                ? "ID uploaded. It will be manually reviewed by admin."
                : "Name mismatch detected. Please review your information or upload a clearer ID.",
        extractedName: r.idExtractedName || "",
        extractedIdNumber: r.idExtractedNumber || "",
        // Force null for manual_review so historical DB rows with stored 0 don't
        // display a misleading "0%" score in the UI.
        matchScore: r.idValidationStatus === "manual_review" ? null : (r.idNameMatchScore ?? null),
        notes: r.idValidationNotes || [],
      });
    }
    // NOTE: agreedToPrivacy / agreedToCertification are NOT restored
    // from saved data — consent must be re-affirmed each session.
  };

  // ── Pre-fill empty fields from user profile (for new reservations) ──
  const prefillFromProfile = async () => {
    try {
      const profile = await authApi.getCurrentUser();
      if (!profile) return;
      // Only fill fields that are still empty
      if (!firstName && profile.firstName) setFirstName(profile.firstName);
      if (!lastName && profile.lastName) setLastName(profile.lastName);
      if (!mobileNumber && profile.phone) setMobileNumber(profile.phone);
      if (!birthday && profile.dateOfBirth) {
        const b = new Date(profile.dateOfBirth);
        if (!isNaN(b)) setBirthday(b.toISOString().split("T")[0]);
      }
      if (!addressCity && profile.city) setAddressCity(profile.city);
      if (!addressStreet && profile.address) setAddressStreet(profile.address);
      if (!emergencyContactName && profile.emergencyContact)
        setEmergencyContactName(profile.emergencyContact);
      if (!emergencyContactNumber && profile.emergencyPhone)
        setEmergencyContactNumber(profile.emergencyPhone);
    } catch {
      // Non-critical — silently skip if profile fetch fails
    }
  };

  const computeLockingFlags = (r) => {
    const status = normalizeReservationStatus(r.status);
    // Status-driven flags (primary) with data-presence fallback (backward compat)
    const VISIT_SCHEDULED_STATUSES = ["visit_pending","visit_approved","payment_pending","reserved","moveIn"];
    const VISIT_APPROVED_STATUSES = ["visit_approved","payment_pending","reserved","moveIn"];
    const APPLICATION_STATUSES = ["payment_pending","reserved","moveIn"];

    const hasVisitScheduled = VISIT_SCHEDULED_STATUSES.includes(status) || Boolean(r.viewingType && r.agreedToPrivacy);
    const isVisitApprovedFlag = VISIT_APPROVED_STATUSES.includes(status) || Boolean(r.visitApproved === true);
    const hasApplication =
      APPLICATION_STATUSES.includes(status) || Boolean(r.applicationSubmittedAt);
    const hasPayment = Boolean(r.proofOfPaymentUrl);
    const isConfirmed = status === "reserved" || r.paymentStatus === "paid";

    if (hasVisitScheduled) setVisitCompleted(true);
    if (isVisitApprovedFlag) setVisitApproved(true);
    if (r.scheduleRejected) setScheduleRejected(true);
    if (r.scheduleRejectionReason) setScheduleRejectionReason(r.scheduleRejectionReason);
    if (hasApplication) setApplicationSubmitted(true);
    if (hasPayment) setPaymentSubmitted(true);
    if (isConfirmed) setPaymentApproved(true);

    // Status-driven highest stage
    const STAGE_BY_STATUS = {
      pending: 1,
      visit_pending: 2,
      visit_approved: 3,
      payment_pending: 4,
      reserved: 5,
      moveIn: 5,
    };
    let highest = STAGE_BY_STATUS[status] || 1;
    // Fallback: data-presence checks for legacy records still at "pending"
    if (highest === 1) {
      if (hasVisitScheduled) highest = 2;
      if (isVisitApprovedFlag) highest = 3;
      if (hasApplication) highest = Math.max(highest, 4);
      if (hasPayment) highest = Math.max(highest, 4);
      if (isConfirmed) highest = 5;
    }

    return {
      hasVisitScheduled,
      isVisitApprovedFlag,
      hasApplication,
      hasPayment,
      isConfirmed,
      highest,
    };
  };

  // ── Data loading ───────────────────────────────────────
  const processedKeyRef = useRef(null);
  const paymentVerifyingRef = useRef(false);
  const justPaidRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setShowLoginConfirm(true);
      return;
    }

    // Skip re-initialization if payment verification is in progress
    // (the hook's setSearchParams changes location.key, re-triggering this effect)
    if (paymentVerifyingRef.current) {
      return;
    }

    // Guard: only process each navigation once (prevents re-render loop
    // from setState calls below re-triggering this effect).
    // Uses location.key so re-navigation to the same route still re-initializes.
    if (processedKeyRef.current === location.key) return;
    processedKeyRef.current = location.key;

    const continueReservation = location.state?.continueFlow;
    const editMode = location.state?.editMode;
    const resId = location.state?.reservationId;

    // ── ALWAYS reset session-specific fields first ──
    // For new reservations, these stay blank.
    // For continuing, the async load functions below will repopulate from DB.
    setTargetMoveInDate("");
    setFinalMoveInDate("");
    setLeaseDuration("");
    setAgreedToPrivacy(false);
    setAgreedToCertification(false);

    if ((continueReservation || editMode) && resId) {
      loadExistingReservation(resId);
    } else {
      const state = location.state?.roomData;
      // Check if this is a PayMongo return — defer stage logic to usePaymentRedirect
      const paymentParam = new URLSearchParams(window.location.search).get("payment");
      if (state) {
        setReservationData(state);
        prefillFromProfile(); // Pre-fill Step 3 from profile for new reservations
      } else if (isPaymentReturnRef.current) {
        // Returning from PayMongo — load reservation data for display,
        // and verify payment using the reservation's stored session ID.
        paymentVerifyingRef.current = true; // block re-init from hook's setSearchParams
        isPaymentReturnRef.current = false; // consume the flag
        const storedResId =
          sessionStorage.getItem(getActiveResKey(user?.firebaseUid)) ||
          sessionStorage.getItem("activeReservationId"); // legacy fallback
        if (storedResId) {
          loadExistingReservation(storedResId, true);
        } else {
          loadActiveReservation();
        }
      } else {
        const stored = sessionStorage.getItem("pendingReservation");
        const storedResId =
          sessionStorage.getItem(getActiveResKey(user?.firebaseUid)) ||
          sessionStorage.getItem("activeReservationId"); // legacy fallback
        if (stored) {
          setReservationData(JSON.parse(stored));
        } else if (storedResId) {
          loadExistingReservation(storedResId);
        } else if (isStepMode) {
          loadActiveReservation();
        } else {
          appNavigate("/applicant/check-availability", {
            flash: { type: "warning", message: "No room selected. Redirecting..." },
          });
        }
      }
    }
    setInitialFormState({
      targetMoveInDate: "",
      leaseDuration: "",
      billingEmail: user?.email || "",
    });
    if (!continueReservation && stepOverride) setCurrentStage(stepOverride);

    // Payment redirect is handled by usePaymentRedirect hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.key]);

  const loadActiveReservation = async () => {
    try {
      const all = await reservationApi.getAll();
      const list = Array.isArray(all)
        ? all
        : all?.reservations || all?.data || [];
      const found = list.find(
        (r) =>
          r.status !== "cancelled" && r.status !== "archived" && !r.isArchived,
      );
      if (!found) {
        appNavigate("/applicant/check-availability", {
          flash: { type: "warning", message: "No active reservation found." },
        });
        return;
      }
      const active = await reservationApi.getById(found._id);
      if (active) {
        const room = active.roomId || {};
        setReservationId(active._id);
        if (active.reservationCode) setReservationCode(active.reservationCode);
        if (active.visitCode) setVisitCode(active.visitCode);
        setReservationData({
          room: {
            id: room._id || room.id,
            roomId: room._id || room.id,
            name: room.name || "Room",
            title: room.name || "Room",
            branch: room.branch || "",
            type: room.type || "",
            price: room.monthlyRate || room.price || 0,
            roomNumber: room.name || "",
          },
          selectedBed: active.selectedBed || null,
          applianceFees: active.applianceFees || 0,
        });
        if (active.visitDate) setVisitDate(active.visitDate.split("T")[0]);
        if (active.visitTime) setVisitTime(active.visitTime);
        if (active.viewingType) setViewingType(active.viewingType);
        if (active.visitApproved) setVisitApproved(true);
        populateFromReservation(active);
        const { highest } = computeLockingFlags(active);
        if (active.proofOfPaymentUrl) setPaymentSubmitted(true);
        setHighestStageReached(highest);
      }
    } catch (err) {
      console.error("Failed to load reservation:", err);
      appNavigate("/applicant/check-availability", {
        flash: { type: "warning", message: "No room selected. Redirecting..." },
      });
    }
  };

  const loadExistingReservation = async (resId, skipStageSet = false) => {
    try {
      setIsLoading(true);
      const reservation = await reservationApi.getById(resId);
      setReservationId(reservation._id || resId);
      if (reservation.reservationCode)
        setReservationCode(reservation.reservationCode);
      if (reservation.visitCode)
        setVisitCode(reservation.visitCode);
      setReservationData({
        room: reservation.roomId,
        selectedBed: reservation.selectedBed,
        appliances: reservation.selectedAppliances || [],
      });
      if (reservation.targetMoveInDate) {
        const d = new Date(reservation.targetMoveInDate);
        if (!isNaN(d)) setTargetMoveInDate(d.toISOString().split("T")[0]);
      }
      if (reservation.leaseDuration)
        setLeaseDuration(reservation.leaseDuration);
      if (reservation.billingEmail) setBillingEmail(reservation.billingEmail);
      if (reservation.viewingType) setViewingType(reservation.viewingType);
      if (reservation.isOutOfTown !== undefined)
        setIsOutOfTown(reservation.isOutOfTown);
      if (reservation.currentLocation)
        setCurrentLocation(reservation.currentLocation);
      if (reservation.visitApproved !== undefined)
        setVisitApproved(reservation.visitApproved);
      populateFromReservation(reservation);
      const {
        hasVisitScheduled,
        isVisitApprovedFlag,
        hasApplication,
        hasPayment,
        isConfirmed,
        highest,
      } = computeLockingFlags(reservation);

      // Status-driven stage calculation
      const reservationStatus = normalizeReservationStatus(reservation.status);
      const STAGE_BY_STATUS = {
        pending: 1,
        visit_pending: 2,
        visit_approved: 3,
        payment_pending: 4,
        reserved: 5,
        moveIn: 5,
      };
      let targetStage = STAGE_BY_STATUS[reservationStatus] || 1;

      // visit_pending: tenant must wait — redirect to profile (unless rejected)
      if (reservationStatus === "visit_pending" && !reservation.scheduleRejected) {
        appNavigate("/applicant/profile", {
          flash: {
            type: "info",
            message:
              "Waiting for admin to approve your visit. Track progress on your profile.",
          },
        });
        return;
      }

      // If visit was rejected, allow user to stay on step 2 to reschedule
      if (reservation.scheduleRejected) {
        setVisitDate("");
        setVisitTime("");
        setScheduleRejected(true);
        setScheduleRejectionReason(reservation.scheduleRejectionReason || "");
        setVisitCompleted(false);
      }

      // Fallback for legacy records still at "pending" with data beyond step 1
      if (targetStage === 1) {
        if (isConfirmed) targetStage = 5;
        else if (hasPayment) targetStage = 5;
        else if (hasApplication) targetStage = 4;
        else if (isVisitApprovedFlag) targetStage = 3;
        else if (hasVisitScheduled) {
          appNavigate("/applicant/profile", {
            flash: {
              type: "info",
              message:
                "Waiting for admin to approve your visit. Track progress on your profile.",
            },
          });
          return;
        }
      }

      if (reservation.roomConfirmed && targetStage === 1) {
        targetStage = 2;
      }
      if (skipStageSet) {
        // Payment redirect — verify using the reservation's stored paymongoSessionId
        // Set highest to 5 immediately so the stepper renders all stages green from the start
        setHighestStageReached(5);
        // Verify payment status with PayMongo
        if (reservation.paymongoSessionId) {
          try {
            const result = await billingApi.checkPaymentStatus(reservation.paymongoSessionId);
            if (result.status === "paid") {
              sessionStorage.removeItem(getActiveResKey(user?.firebaseUid));
              sessionStorage.removeItem("activeReservationId"); // legacy cleanup
              // Back button → redirect to dashboard; Return to merchant → show step 5
              if (paymentReturnStatusRef.current === "cancelled") {
                appNavigate("/applicant/profile", {
                  flash: {
                    type: "success",
                    message: "Payment successful! Your reservation is secured.",
                  },
                });
                return;
              }
              // Re-fetch reservation to get the newly generated reservationCode
              // (the pre-save hook creates it when status transitions to "reserved")
              try {
                const updated = await reservationApi.getById(resId);
                if (updated?.reservationCode) setReservationCode(updated.reservationCode);
              } catch { /* non-critical — code just won't display */ }
              setCurrentStage(5);
              setHighestStageReached(5);
              setPaymentSubmitted(true);
              setPaymentApproved(true);
              justPaidRef.current = true;
              setPaymentMethod(result.paymentMethod || "paymongo");
              showNotification("Payment successful! Your reservation is secured.", "success", 5000);
              return;
            } else {
              console.warn("[PAYMENT] Session not yet paid:", reservation.paymongoSessionId, "status:", result.status);
              setCurrentStage(4);
              // Show appropriate toast based on how the user returned
              if (paymentReturnStatusRef.current === "cancelled") {
                showNotification("Payment cancelled. You can try again anytime.", "info", 5000);
              } else {
                showNotification("Payment is being processed. Please wait or try again.", "info", 5000);
              }
              return;
            }
          } catch (err) {
            console.error("❌ [VERIFY] Payment check failed — sessionId:", reservation.paymongoSessionId, err);
            setCurrentStage(4);
            if (paymentReturnStatusRef.current !== "cancelled") {
              showNotification("Could not verify payment. Please check your profile.", "warning", 5000);
            }
            return;
          }
        } else {
          // No stored session ID — skip generic toast, just navigate to correct stage
          console.warn("[PAYMENT] skipStageSet=true but paymongoSessionId is empty for reservation:", resId);
          setCurrentStage(targetStage);
          return; // ← prevent double-toast: skip the generic notification below
        }
      } else {
        if (stepOverride && stepOverride <= highest)
          setCurrentStage(stepOverride);
        else setCurrentStage(targetStage);
      }
      showNotification(
        stepOverride
          ? "Editing your application. Make your changes and save."
          : "Reservation data loaded. Continue where you left off!",
        "success",
        3000,
      );
    } catch (err) {
      console.error("❌ [LOAD_RESERVATION] Failed to load reservation id:", resId, "| status:", err?.response?.status, "| message:", err?.message, err);
      const status = err?.response?.status;
      if (status === 404) {
        sessionStorage.removeItem(getActiveResKey(user?.firebaseUid));
        sessionStorage.removeItem("activeReservationId"); // legacy cleanup
        appNavigate("/applicant/check-availability", {
          flash: {
            type: "error",
            message: "Reservation not found. It may have been removed or expired.",
          },
        });
      } else if (status === 401 || status === 403) {
        appNavigate("/signin", {
          flash: {
            type: "warning",
            message: "Please sign in to continue your reservation.",
          },
        });
      } else {
        showNotification("Failed to load reservation data", "error", 3000);
      }
    } finally {
      paymentVerifyingRef.current = false;
      setIsLoading(false);
    }
  };

  // ── Form change tracking (Stage 1) ─────────────────────
  useEffect(() => {
    if (currentStage === 1) {
      setIsFormDirty(
        targetMoveInDate !== initialFormState.targetMoveInDate ||
          leaseDuration !== initialFormState.leaseDuration ||
          billingEmail !== initialFormState.billingEmail,
      );
    }
  }, [
    targetMoveInDate,
    leaseDuration,
    billingEmail,
    initialFormState,
    currentStage,
  ]);

  // ── API helpers ────────────────────────────────────────
  const advanceStage = async (nextStage, message) => {
    setHighestStageReached((prev) => Math.max(prev, nextStage));
    await queryClient.invalidateQueries({ queryKey: ["reservations"] });
    appNavigate("/applicant/profile", {
      flash: {
        type: "success",
        message: message || "Step completed! Track your progress here.",
      },
    });
  };

  const getFieldValue = (value, defaultValue = "") =>
    devBypassValidation && !value ? defaultValue : value;

  const normalizeRoomName = (room) => {
    const raw = room?.id || room?.name || room?.roomNumber || room?.title;
    return raw
      ? String(raw)
          .replace(/^Room\s+/i, "")
          .trim()
      : "";
  };

  const resolveRoomId = async () => {
    const room = reservationData?.room;
    const directId = room?._id || room?.roomId;
    if (directId) return directId;
    const roomName = normalizeRoomName(room);
    if (!roomName) return null;
    const rooms = await roomApi.getAll();
    const matched = rooms.find(
      (r) =>
        r.name === roomName ||
        r.roomNumber === roomName ||
        r.name?.toLowerCase() === roomName.toLowerCase(),
    );
    return matched?._id || null;
  };

  const getMoveInDate = () => targetMoveInDate || finalMoveInDate;
  const getTotalPrice = () =>
    Number(reservationData?.room?.price || 0) +
    Number(reservationData?.applianceFees || 0);

  const createReservationDraft = async (payloadOverrides = {}) => {
    const roomId = await resolveRoomId();
    if (!roomId) {
      showNotification(
        "Room details are missing. Please reselect a room.",
        "error",
        3000,
      );
      return null;
    }
    const moveInDate = getMoveInDate();
    if (!moveInDate) {
      showNotification("Please set a move-in date.", "error", 3000);
      return null;
    }
    const totalPrice = getTotalPrice();
    try {
      const response = await reservationApi.create({
        roomId,
        selectedBed: reservationData?.selectedBed
          ? {
              id: reservationData.selectedBed.id,
              position: reservationData.selectedBed.position,
            }
          : null,
        targetMoveInDate: getFieldValue(targetMoveInDate, moveInDate),
        leaseDuration: leaseDuration || "",
        billingEmail: getFieldValue(
          billingEmail,
          user?.email || "test@example.com",
        ),
        moveInDate,
        totalPrice: totalPrice > 0 ? totalPrice : 5000,
        applianceFees: reservationData?.applianceFees || 0,
        viewingType: null,
        agreedToPrivacy: false,
        roomConfirmed: true,
        visitApproved: false,
        ...payloadOverrides,
      });
      const created = response?.reservation || response;
      const createdId = response?.reservationId || created?._id;
      if (createdId) setReservationId(createdId);
      if (created?.reservationCode) setReservationCode(created.reservationCode);
      return created;
    } catch (error) {
      const existingId = error?.response?.data?.existingReservationId;
      if (
        error?.response?.data?.code === "RESERVATION_ALREADY_EXISTS" &&
        existingId
      ) {
        setReservationId(existingId);
        // Update the existing reservation with new step 1 values
        try {
          await reservationApi.updateByUser(existingId, {
            roomId,
            selectedBed: reservationData?.selectedBed
              ? {
                  id: reservationData.selectedBed.id,
                  position: reservationData.selectedBed.position,
                }
              : null,
            targetMoveInDate: getFieldValue(targetMoveInDate, moveInDate),
            leaseDuration: null,
            billingEmail: getFieldValue(
              billingEmail,
              user?.email || "test@example.com",
            ),
            moveInDate,
            totalPrice: totalPrice > 0 ? totalPrice : 5000,
            applianceFees: reservationData?.applianceFees || 0,
            agreedToPrivacy: false,
            agreedToCertification: false,
          });
          const existing = await reservationApi.getById(existingId);
          if (existing?.reservationCode)
            setReservationCode(existing.reservationCode);
          return existing;
        } catch (e) {
          /* ignore */
        }
        return { _id: existingId };
      }
      throw error;
    }
  };

  const updateReservationDraft = async (payloadOverrides = {}) => {
    if (!reservationId) return createReservationDraft(payloadOverrides);
    const response = await reservationApi.updateByUser(
      reservationId,
      payloadOverrides,
    );
    return response?.reservation || response;
  };

  // ── Auto-save (stages 3-4) ─────────────────────────────
  const validateApplicantIdDocument = useCallback(
    async ({ documentUrl, idType } = {}) => {
      const targetReservationId = reservationId || reservationData?._id || reservationData?.id;
      const selectedIdType = idType || validIDType;

      if (!targetReservationId || !documentUrl || !selectedIdType) {
        const message = !selectedIdType
          ? "ID type is required."
          : "Valid ID front image is required.";
        setIdValidationResult({
          validationStatus: "failed",
          message,
          notes: [],
        });
        return null;
      }

      setIsValidatingId(true);
      setIdValidationResult({
        validationStatus: "validating",
        message: "Validating ID...",
        notes: [],
      });

      try {
        const result = await reservationApi.validateIdDocument(targetReservationId, {
          documentUrl,
          idType: selectedIdType,
          firstName,
          middleName,
          lastName,
        });
        const normalizedResult = {
          validationStatus: result.validationStatus || "manual_review",
          message:
            result.message ||
            "ID uploaded. It will be manually reviewed by admin.",
          extractedName: result.extractedName || "",
          extractedIdNumber: result.extractedIdNumber || "",
          matchScore: result.matchScore ?? null,
          notes: result.notes || [],
        };

        setIdValidationResult(normalizedResult);

        if (normalizedResult.validationStatus === "passed") {
          showNotification("ID verified successfully.", "success", 3000);
        } else if (normalizedResult.validationStatus === "failed") {
          showNotification("ID image is unclear. Please upload a clearer photo.", "error", 4000);
        } else if (normalizedResult.validationStatus === "manual_review") {
          showNotification("ID uploaded. It will be manually reviewed by admin.", "info", 4000);
        } else {
          showNotification("Name mismatch detected. Please review your information or upload a clearer ID.", "warning", 5000);
        }

        return normalizedResult;
      } catch (error) {
        const message = getFriendlyError(
          error,
          "ID requires manual verification.",
        );
        const fallback = {
          validationStatus: "manual_review",
          message,
          notes: ["ID validation could not be completed. Admin manual review is required."],
        };
        setIdValidationResult(fallback);
        showNotification(message, "warning", 4000);
        return fallback;
      } finally {
        setIsValidatingId(false);
      }
    },
    [
      firstName,
      lastName,
      middleName,
      reservationData,
      reservationId,
      validIDType,
    ],
  );

  const buildDraftPayload = useCallback(
    () => ({
      visitDate,
      visitTime,
      viewingType,
      visitorName,
      visitorPhone,
      visitorEmail,
      firstName,
      lastName,
      middleName,
      nickname,
      mobileNumber,
      birthday,
      maritalStatus,
      nationality,
      educationLevel,
      addressUnitHouseNo,
      addressStreet,
      addressRegion,
      addressBarangay,
      addressCity,
      addressProvince,
      emergencyContactName,
      emergencyRelationship,
      emergencyContactNumber,
      healthConcerns,
      employerSchool,
      employerAddress,
      employerContact,
      startDate,
      occupation,
      previousEmployment,
      nbiReason,
      companyIDReason,
      personalNotes,
      referralSource,
      referrerName,
      estimatedMoveInTime,
      workSchedule,
      workScheduleOther,
      targetMoveInDate,
      ...(leaseDuration ? { leaseDuration } : {}),
      finalMoveInDate,
      agreedToPrivacy,
      agreedToCertification,
    }),
    [
      visitDate,
      visitTime,
      viewingType,
      visitorName,
      visitorPhone,
      visitorEmail,
      firstName,
      lastName,
      middleName,
      nickname,
      mobileNumber,
      birthday,
      maritalStatus,
      nationality,
      educationLevel,
      addressUnitHouseNo,
      addressStreet,
      addressRegion,
      addressBarangay,
      addressCity,
      addressProvince,
      emergencyContactName,
      emergencyRelationship,
      emergencyContactNumber,
      healthConcerns,
      employerSchool,
      employerAddress,
      employerContact,
      startDate,
      occupation,
      previousEmployment,
      referralSource,
      referrerName,
      estimatedMoveInTime,
      workSchedule,
      workScheduleOther,
      targetMoveInDate,
      leaseDuration,
      finalMoveInDate,
      agreedToPrivacy,
      agreedToCertification,
    ],
  );

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (currentStage < 3 || currentStage > 4) return;
    if (!reservationId || isStageLocked(currentStage)) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await updateReservationDraft(buildDraftPayload());
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 3000);
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus(""), 4000);
      }
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [buildDraftPayload, currentStage, reservationId]);

  // ── Stage handler ──────────────────────────────────────
  const handleNextStage = async () => {
    try {
      if (currentStage === 1) {
        if (!reservationData?.room) {
          showNotification("Please select a room to continue", "error", 3000);
          return;
        }
        setPendingStageAction("stage1");
        setShowStageConfirm(true);
        return;
      } else if (currentStage === 2) {
        if (!devBypassValidation && !visitDate) {
          showNotification("Please select a visit date", "error", 3000);
          setTimeout(() => {
            const el = document.getElementById("visit-date-section");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
          return;
        }
        if (!devBypassValidation && !visitTime) {
          showNotification("Please select a time slot", "error", 3000);
          setTimeout(() => {
            const el = document.getElementById("visit-time-section");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
          return;
        }
        await updateReservationDraft({
          agreedToPrivacy: true,
          viewingType: "inperson",
          visitDate,
          visitTime,
          // Reset rejection state when rescheduling
          ...(scheduleRejected ? {
            scheduleRejected: false,
            scheduleRejectionReason: null,
          } : {}),
        });
        setVisitCompleted(true);
        setScheduleRejected(false);
        setScheduleRejectionReason("");
        setHighestStageReached((prev) => Math.max(prev, 3));
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        setSuccessOverlay({
          show: true,
          title: "Visit Scheduled!",
          subtitle: "Your visit request has been submitted. Track progress on your dashboard.",
        });
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Visit Scheduled!",
            message: "Your visit request has been submitted. Track progress on your dashboard.",
          },
        });
      } else if (currentStage === 3) {
        if (!devBypassValidation) {
          const hasText = (value) => Boolean(value?.trim?.() || value);
          // 09XXXXXXXXX format — matches backend normalization and new input constraint.
          const isValidPhone = (value) => validatePHPhoneLocal(value).valid;
          const requiredFields = [
            { key: "selfiePhoto", label: "Selfie Photo", isMissing: !selfiePhoto },
            { key: "lastName", label: "Last Name", isMissing: !hasText(lastName) },
            { key: "firstName", label: "First Name", isMissing: !hasText(firstName) },
            {
              key: "mobileNumber",
              label: "Mobile Number",
              isMissing: !isValidPhone(mobileNumber),
              message: "Enter a valid mobile number (e.g. 09123456789).",
            },
            {
              key: "birthday",
              label: "Birthday",
              isMissing: !validateBirthday(birthday).valid,
              message: "Please enter a valid birthday to continue.",
            },
            { key: "maritalStatus", label: "Marital Status", isMissing: !hasText(maritalStatus) },
            { key: "nationality", label: "Nationality", isMissing: !hasText(nationality) },
            { key: "educationLevel", label: "Educational Attainment", isMissing: !hasText(educationLevel) },
            { key: "addressUnitHouseNo", label: "Unit / House No.", isMissing: !hasText(addressUnitHouseNo) },
            { key: "addressStreet", label: "Street", isMissing: !hasText(addressStreet) },
            { key: "addressRegion", label: "Region", isMissing: !hasText(addressRegion) },
            { key: "addressProvince", label: "Province", isMissing: !hasText(addressProvince) },
            { key: "addressCity", label: "City / Municipality", isMissing: !hasText(addressCity) },
            { key: "addressBarangay", label: "Barangay", isMissing: !hasText(addressBarangay) },
            { key: "validIDType", label: "ID Type", isMissing: !hasText(validIDType) },
            { key: "validIDFront", label: "Valid ID (Front)", isMissing: !validIDFront },
            {
              key: "validIDFront",
              label: "Valid ID validation",
              isMissing: idValidationResult?.validationStatus === "failed",
              message: "ID image is unclear. Please upload a clearer photo.",
            },
            {
              key: "validIDFront",
              label: "Valid ID validation",
              isMissing: isValidatingId,
              message: "Please wait until ID validation finishes.",
            },
            { key: "validIDBack", label: "Valid ID (Back)", isMissing: !validIDBack },
            {
              key: "nbiClearance",
              label: "NBI Clearance",
              isMissing: !nbiClearance && !hasText(nbiReason),
              message: "Please upload NBI Clearance or provide a reason to continue.",
            },
            {
              key: "emergencyContactName",
              label: "Emergency Contact Name",
              isMissing: !hasText(emergencyContactName),
            },
            {
              key: "emergencyRelationship",
              label: "Emergency Relationship",
              isMissing: !hasText(emergencyRelationship),
            },
            {
              key: "emergencyContactNumber",
              label: "Emergency Contact Number",
              isMissing: !isValidPhone(emergencyContactNumber),
              message: "Please enter a valid emergency contact number to continue.",
            },
            { key: "healthConcerns", label: "Health Concerns", isMissing: !hasText(healthConcerns) },
            { key: "employerSchool", label: "Current Employer", isMissing: !hasText(employerSchool) },
            { key: "employerAddress", label: "Employer Address", isMissing: !hasText(employerAddress) },
            {
              key: "employerContact",
              label: "Employer Contact Number",
              isMissing: hasText(employerContact) && !validatePHPhoneOrLandline(employerContact),
              message: "Enter a valid phone number (e.g. 09123456789 or 02-1234567).",
            },
            { key: "occupation", label: "Occupation", isMissing: !hasText(occupation) },
            {
              key: "companyID",
              label: "Company ID",
              isMissing: !companyID && !hasText(companyIDReason),
              message: "Please upload Company ID or provide a reason to continue.",
            },
            { key: "referralSource", label: "Referral Source", isMissing: !hasText(referralSource) },
            {
              key: "targetMoveInDate",
              label: "Move-in Date",
              isMissing: !validateTargetMoveInDate(targetMoveInDate).valid,
              message: "Please choose a valid target move-in date to continue.",
            },
            {
              key: "estimatedMoveInTime",
              label: "Move-in Time",
              isMissing: !validateEstimatedTime(estimatedMoveInTime).valid,
              message: "Please select a valid move-in time to continue.",
            },
            { key: "workSchedule", label: "Work Schedule", isMissing: !hasText(workSchedule) },
            {
              key: "workScheduleOther",
              label: "Work Schedule Details",
              isMissing:
                workSchedule === "others" && !hasText(workScheduleOther),
              message: "Please describe your work schedule to continue.",
            },
          ];
          const firstInvalid = requiredFields.find((field) => field.isMissing);
          const missingAgreements = !agreedToPrivacy || !agreedToCertification;

          if (firstInvalid || missingAgreements) {
            setShowValidationErrors(true);

            if (firstInvalid) {
              setTimeout(() => {
                const el = document.querySelector(
                  `[data-field="${firstInvalid.key}"]`,
                );
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }, 100);
              showNotification(
                firstInvalid.message ||
                  `"${firstInvalid.label}" is required. Please fill it in to continue.`,
                "error",
                4000,
              );
            } else {
              setTimeout(() => {
                const el = document.getElementById("section-agreements");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }, 100);
              showNotification(
                "Please agree to both consent items to continue.",
                "error",
                4000,
              );
            }
            return;
          }
        }
        const selfiePhotoUrl = await uploadIfFile(selfiePhoto);
        const validIDFrontUrl = await uploadIfFile(validIDFront);
        const validIDBackUrl = await uploadIfFile(validIDBack);
        const nbiClearanceUrl = await uploadIfFile(nbiClearance);
        const companyIDUrl = await uploadIfFile(companyID);
        await updateReservationDraft({
          firstName,
          lastName,
          middleName,
          nickname,
          mobileNumber,
          birthday,
          maritalStatus,
          nationality,
          educationLevel,
          addressUnitHouseNo,
          addressStreet,
          addressRegion,
          addressBarangay,
          addressCity,
          addressProvince,
          emergencyContactName,
          emergencyRelationship,
          emergencyContactNumber,
          healthConcerns,
          employerSchool,
          employerAddress,
          employerContact,
          startDate,
          occupation,
          previousEmployment,
          roomType,
          preferredRoomNumber,
          referralSource,
          referrerName,
          estimatedMoveInTime,
          workSchedule,
          workScheduleOther,
          targetMoveInDate,
          leaseDuration,
          agreedToPrivacy,
          agreedToCertification,
          selfiePhotoUrl,
          validIDFrontUrl,
          validIDBackUrl,
          nbiClearanceUrl,
          nbiReason,
          personalNotes,
          companyIDUrl,
          companyIDReason,
          validIDType,
          idType: validIDType,
          submitApplication: true,
        });
        setApplicationSubmitted(true);
        setEditingApplication(false);
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        setSuccessOverlay({
          show: true,
          title: "Application Submitted!",
          subtitle: "Payment step is now unlocked. Continue from your dashboard.",
        });
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Application Submitted!",
            message: "Payment step is now unlocked. Continue from your dashboard.",
          },
        });
      } else if (currentStage === 4) {
        // Stage 4 only uses PayMongo online checkout.
        // If user got here via the "Confirm" button, show overlay and go to profile.
        if (finalMoveInDate) {
          await updateReservationDraft({ finalMoveInDate });
        }
        setPaymentSubmitted(true);
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        setSuccessOverlay({
          show: true,
          title: "Payment Step Ready!",
          subtitle: "Use the Pay Online button to complete your reservation.",
        });
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Payment Step Ready!",
            message: "Use the Pay Online button to complete your reservation.",
          },
        });
      } else if (currentStage === 5) {
        navigate("/applicant/profile");
      }
    } catch (error) {
      showNotification(
        getFriendlyError(error, "Failed to process reservation. Please try again."),
        "error",
        3000,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevStage = async () => {
    if (currentStage === 1) {
      if (isFormDirty) setShowCancelConfirm(true);
      else navigate("/applicant/check-availability");
    } else {
      if (reservationId && !isStageLocked(currentStage)) {
        try {
          setSaveStatus("saving");
          await updateReservationDraft(buildDraftPayload());
          setSaveStatus("saved");
          showNotification("Progress saved", "success", 2000);
          setTimeout(() => setSaveStatus(""), 3000);
        } catch (err) {
          showNotification("Could not save progress", "warning", 2000);
        }
      }
      setCurrentStage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleStageConfirm = async () => {
    setShowStageConfirm(false);
    try {
      if (pendingStageAction === "stage1") {
        if (!reservationId) {
          const draft = await createReservationDraft();
          if (!draft) return;
        } else {
          await updateReservationDraft({ roomConfirmed: true });
        }
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
        setSuccessOverlay({
          show: true,
          title: "Room Confirmed!",
          subtitle: "Continue from your dashboard to schedule a visit.",
        });
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Room Confirmed!",
            message: "Continue from your dashboard to schedule a visit.",
          },
        });
      } else if (pendingStageAction === "stage4") {
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        setSuccessOverlay({
          show: true,
          title: "Reservation Submitted!",
          subtitle: "Your reservation is being processed by admin.",
        });
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Reservation Submitted!",
            message: "Your reservation is being processed by admin.",
          },
        });
      }
    } catch (error) {
      showNotification(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to process reservation. Please try again.",
        "error",
        3000,
      );
    }
    setPendingStageAction(null);
  };

  // ─── Return everything the page component needs ────────
  return {
    // Navigation
    navigate,
    user,

    // Core state
    reservationData,
    currentStage,
    highestStageReached, setHighestStageReached,
    isLoading,
    visitApproved,
    visitCompleted, setVisitCompleted,
    scheduleRejected,
    scheduleRejectionReason,
    applicationSubmitted,
    editingApplication,
    paymentApproved,
    reservationId,
    devBypassValidation, setDevBypassValidation,
    payingOnline, setPayingOnline,
    successOverlay, setSuccessOverlay,

    // Stage 1
    targetMoveInDate, setTargetMoveInDate,
    leaseDuration, setLeaseDuration,
    billingEmail, setBillingEmail,

    // Stage 2
    viewingType, setViewingType,
    isOutOfTown, setIsOutOfTown,
    currentLocation, setCurrentLocation,
    visitorName, setVisitorName,
    visitorPhone, setVisitorPhone,
    visitorEmail, setVisitorEmail,
    visitDate, setVisitDate,
    visitTime, setVisitTime,

    // Stage 3
    selfiePhoto, setSelfiePhoto,
    firstName, setFirstName,
    lastName, setLastName,
    middleName, setMiddleName,
    nickname, setNickname,
    mobileNumber, setMobileNumber,
    birthday, setBirthday,
    maritalStatus, setMaritalStatus,
    nationality, setNationality,
    educationLevel, setEducationLevel,
    addressUnitHouseNo, setAddressUnitHouseNo,
    addressStreet, setAddressStreet,
    addressRegion, setAddressRegion,
    addressBarangay, setAddressBarangay,
    addressCity, setAddressCity,
    addressProvince, setAddressProvince,
    validIDFront, setValidIDFront,
    validIDBack, setValidIDBack,
    validIDType, setValidIDType,
    idValidationResult,
    isValidatingId,
    nbiClearance, setNbiClearance,
    nbiReason, setNbiReason,
    personalNotes, setPersonalNotes,
    emergencyContactName, setEmergencyContactName,
    emergencyRelationship, setEmergencyRelationship,
    emergencyContactNumber, setEmergencyContactNumber,
    healthConcerns, setHealthConcerns,
    employerSchool, setEmployerSchool,
    employerAddress, setEmployerAddress,
    employerContact, setEmployerContact,
    startDate, setStartDate,
    occupation, setOccupation,
    companyID, setCompanyID,
    companyIDReason, setCompanyIDReason,
    previousEmployment, setPreviousEmployment,
    roomType,
    preferredRoomNumber, setPreferredRoomNumber,
    referralSource, setReferralSource,
    referrerName, setReferrerName,
    estimatedMoveInTime, setEstimatedMoveInTime,
    workSchedule, setWorkSchedule,
    workScheduleOther, setWorkScheduleOther,
    agreedToPrivacy, setAgreedToPrivacy,
    agreedToCertification, setAgreedToCertification,

    // Stage 4
    finalMoveInDate, setFinalMoveInDate,
    paymentMethod,
    paymentSubmitted,
    agreedToFeePolicy, setAgreedToFeePolicy,

    // Stage 5
    reservationCode,
    visitCode, setVisitCode,

    // UI flags
    showLoginConfirm, setShowLoginConfirm,
    showCancelConfirm, setShowCancelConfirm,
    showStageConfirm,
    pendingStageAction,
    showValidationErrors,
    scrollToSection,
    saveStatus,
    isFormDirty,

    // Stepper
    isStageLocked,
    isStageClickable,
    handleStepperClick,

    // Handlers
    handleNextStage,
    handlePrevStage,
    handleStageConfirm,
    validateApplicantIdDocument,
    updateReservationDraft,
    setEditingApplication,
    setScrollToSection,
    setShowStageConfirm,
    setPendingStageAction,
    setShowValidationErrors,

    // Refs
    paymentVerifyingRef,
    justPaidRef,
    navigatingAwayRef,

    // Query client (for external cache invalidation)
    queryClient,
  };
}
