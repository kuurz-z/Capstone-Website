/**
 * =============================================================================
 * useReservationFlow ΓÇö Custom Hook
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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { showNotification } from "../../../shared/utils/notification";
import getFriendlyError from "../../../shared/utils/friendlyError";
import { reservationApi, roomApi, billingApi, authApi } from "../../../shared/api/apiClient";
import {
  canReservationAccessPayment,
  hasReservationStatus,
  normalizeReservationStatus,
  isApplicationApprovedStatus,
} from "../../../shared/utils/lifecycleNaming";
import { usePaymentRedirect } from "./usePaymentRedirect";
import { classifyActiveReservations } from "../utils/reservationSelection";
import { uploadIfFile } from "../../../shared/utils/firebaseStorageUpload";
import {
  validateBirthday,
  validateEstimatedTime,
  validateTargetMoveInDate,
  validatePHPhoneLocal,
  validatePHPhoneOrLandline,
} from "../utils/reservationValidation";
import {
  PHYSICAL_VISIT_APPLICATION_LOCKED_MESSAGE,
  TENANT_APPLICATION_LOCKED_MESSAGE,
  canAccessTenantApplication,
  getReservationViewingPreference,
  isPhysicalVisitApplicationLocked,
  isTenantApplicationStageRequestBlocked,
} from "../utils/physicalVisitFlow";
import {
  ROOM_SELECTION_LOCKED_MESSAGE,
  isApplicantRoomSelectionLocked,
} from "../utils/reservationRoomLock";
import {
  VIEWING_PREFERENCE_LOCKED_MESSAGE,
  canChangeViewingPreference,
  getViewingPreferenceStepAccess,
} from "../utils/reservationViewingPreferenceLock";
import {
  DOCUMENT_PRECHECK_MESSAGES,
  getApplicantDocumentPrecheckMessage,
  getPrecheckStatus,
  hasBlockingPrecheck,
} from "../utils/documentPrecheckUtils";
import {
  APPLICATION_DRAFT_AUTOSAVE_DELAY_MS,
  canAutoSaveApplicationDraft,
  getApplicationDraftStorageKey,
  getApplicationSaveStatusText,
  getSerializableUploadUrl,
  hasRecoverableApplicationDraft,
  hasSubstantiveApplicationDraft,
} from "../utils/applicationDraftAutosave";
import { formatProperCase } from "../../../shared/utils/authValidation";

// Returns a sessionStorage key scoped to the Firebase UID when known,
// falling back to the legacy unscoped key for backward compatibility.
const getActiveResKey = (uid) =>
  uid ? `activeReservationId_${uid}` : "activeReservationId";
const PAYMENT_RETURN_PENDING_KEY = "activeReservationPaymentReturnPending";
const PAYMENT_SESSION_KEY = "activeReservationPaymongoSessionId";

const PAYMENT_RETURN_MIN_LOADING_MS = 150;
const PAYMENT_RETURN_POLL_INTERVAL_MS = 1000;
const PAYMENT_RETURN_MAX_WAIT_MS = 8000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getValidPaymentReturnSessionId = () => {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  if (!sessionId || sessionId === "{id}" || !sessionId.startsWith("cs_")) {
    return null;
  }
  return sessionId;
};

const isReservationPaymentConfirmed = (reservation) => {
  const status = normalizeReservationStatus(reservation?.status);
  return hasReservationStatus(status, "reserved", "moveIn", "moveOut");
};

const EMPTY_DOCUMENT_PRECHECK = Object.freeze({
  precheckProvider: "ocr",
  precheckStatus: "not_checked",
  readabilityStatus: "unknown",
  documentTypeStatus: "unknown",
  canSubmit: true,
  requiresManualReview: true,
  applicantMessage: "",
  adminNote: "",
  confidence: null,
  flags: [],
  aiCheckStatus: "not_checked",
  aiCheckWarnings: [],
  aiCheckedAt: null,
  requiresAdminAttention: false,
  summaryMessage: "",
  provider: "ocr",
});

const DOCUMENT_PRECHECK_LABELS = Object.freeze({
  validIDFront: "Valid ID (Front)",
  validIDBack: "Valid ID (Back)",
  nbiClearance: "NBI Clearance",
  companyID: "Company ID",
});

const createEmptyDocumentPrechecks = () => ({
  validIDFront: { ...EMPTY_DOCUMENT_PRECHECK },
  validIDBack: { ...EMPTY_DOCUMENT_PRECHECK },
  nbiClearance: { ...EMPTY_DOCUMENT_PRECHECK },
  companyID: { ...EMPTY_DOCUMENT_PRECHECK },
});

const resolveDocumentPrecheckStatus = (entry = {}) => {
  return getPrecheckStatus(entry);
};

const normalizeDocumentPrecheckEntry = (entry) => ({
  ...EMPTY_DOCUMENT_PRECHECK,
  ...(entry || {}),
  precheckStatus: resolveDocumentPrecheckStatus(entry),
  readabilityStatus: entry?.readabilityStatus || EMPTY_DOCUMENT_PRECHECK.readabilityStatus,
  documentTypeStatus:
    entry?.documentTypeStatus || EMPTY_DOCUMENT_PRECHECK.documentTypeStatus,
  canSubmit: entry?.canSubmit !== false,
  flags: Array.isArray(entry?.flags) ? entry.flags.filter(Boolean) : [],
  aiCheckWarnings: Array.isArray(entry?.aiCheckWarnings)
    ? entry.aiCheckWarnings.filter(Boolean)
    : [],
});

const normalizeDocumentPrechecks = (prechecks = {}) => ({
  validIDFront: normalizeDocumentPrecheckEntry(prechecks.validIDFront),
  validIDBack: normalizeDocumentPrecheckEntry(prechecks.validIDBack),
  nbiClearance: normalizeDocumentPrecheckEntry(prechecks.nbiClearance),
  companyID: normalizeDocumentPrecheckEntry(prechecks.companyID),
});

const isBlockingDocumentPrecheck = (precheck = {}) => {
  return hasBlockingPrecheck(precheck);
};


const getDocumentPrecheckBlockMessage = (_label, precheck = {}) =>
  getApplicantDocumentPrecheckMessage(
    precheck,
    resolveDocumentPrecheckStatus(precheck),
  ) || DOCUMENT_PRECHECK_MESSAGES.failed;

const resolveTargetStage = (status, viewingPreference, applicationUnlockedByVisit, reservation = null) => {
  const isPaid =
    reservation?.paymentStatus === "paid" ||
    Boolean(reservation?.paymentDate) ||
    hasReservationStatus(status, "reserved", "moveIn", "moveOut");
  if (isPaid) return 5;

  const map = {
    pending: 1,
    viewing_preference_selected:
      viewingPreference === "physical_visit" && !applicationUnlockedByVisit ? 2 : 3,
    visit_pending: applicationUnlockedByVisit ? 3 : 2,
    visit_approved: applicationUnlockedByVisit ? 3 : 2,
    pending_application_review: 3,
    needs_revision: 3,
    rejected: 3,
    approved_for_payment: 4,
    payment_pending: 4,
    payment_submitted: 4,
    reserved: 5,
    moveIn: 5,
  };
  return map[status] || 1;
};

const getProfileName = (profile) => {
  const displayParts = String(profile?.displayName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const rawFirst = profile?.firstName || displayParts[0] || "";
  const rawLast = profile?.lastName || displayParts.slice(1).join(" ") || "";

  return {
    firstName: formatProperCase(rawFirst),
    lastName: formatProperCase(rawLast),
  };
};

const mergeReservationIntoQueryData = (currentData, updatedReservation) => {
  if (!updatedReservation?._id) return currentData;

  const patchList = (items) => {
    if (!Array.isArray(items)) return items;

    let changed = false;
    const nextItems = items.map((item) => {
      if (item?._id !== updatedReservation._id) return item;
      changed = true;
      return { ...item, ...updatedReservation };
    });

    return changed ? nextItems : items;
  };

  if (Array.isArray(currentData)) {
    return patchList(currentData);
  }

  if (Array.isArray(currentData?.reservations)) {
    const nextReservations = patchList(currentData.reservations);
    return nextReservations === currentData.reservations
      ? currentData
      : { ...currentData, reservations: nextReservations };
  }

  if (Array.isArray(currentData?.data)) {
    const nextData = patchList(currentData.data);
    return nextData === currentData.data
      ? currentData
      : { ...currentData, data: nextData };
  }

  if (currentData?._id === updatedReservation._id) {
    return { ...currentData, ...updatedReservation };
  }

  return currentData;

};

export default function useReservationFlow() {
  const navigate = useNavigate();
  const appNavigate = useAppNavigation();
  const location = useLocation();
  const { user } = useAuth();
  const profileName = getProfileName(user);
  const queryClient = useQueryClient();
  const stepFromState = Number(location.state?.step);
  const stepFromQuery = Number(
    new URLSearchParams(location.search).get("step"),
  );
  const forceEditMode = new URLSearchParams(location.search).get("edit") === "1";
  const stepOverride =
    Number.isInteger(stepFromState) && stepFromState > 0
      ? stepFromState
      : Number.isInteger(stepFromQuery) && stepFromQuery > 0
        ? stepFromQuery
        : null;
  const isStepMode = Boolean(stepOverride);

  // ΓöÇΓöÇ Core state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const [reservationData, setReservationData] = useState(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [highestStageReached, setHighestStageReached] = useState(1);
  const [isLoading, setIsLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get("payment");
    const hasPending = sessionStorage.getItem(PAYMENT_RETURN_PENDING_KEY) === "1";
    // Abandoned payment returns (any non-success: cancel, browser back, tab close, etc.)
    // skip the payment confirmation spinner — they land directly on Step 4.
    if (hasPending && paymentParam !== "success") return false;
    return (
      paymentParam === "success" ||
      hasPending ||
      Boolean(sessionStorage.getItem("activeReservationId")) ||
      Object.keys(sessionStorage).some((k) => k.startsWith("activeReservationId_"))
    );
  });
  const [paymentReturnLoading, setPaymentReturnLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get("payment");
    const hasPending = sessionStorage.getItem(PAYMENT_RETURN_PENDING_KEY) === "1";
    // Only show the "Confirming your payment..." loader for explicit success returns.
    if (hasPending && paymentParam !== "success") return false;
    return paymentParam === "success" || hasPending;
  });
  const [visitApproved, setVisitApproved] = useState(false);
  const [visitCompleted, setVisitCompleted] = useState(false);
  const [scheduleRejected, setScheduleRejected] = useState(false);
  const [scheduleRejectionReason, setScheduleRejectionReason] = useState("");
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [editingApplication, setEditingApplication] = useState(false);
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [reservationId, setReservationId] = useState(null);
  const [_devBypassValidation, setDevBypassValidation] = useState(false);
  const devBypassValidation = import.meta.env.DEV ? _devBypassValidation : false;
  const [payingOnline, setPayingOnline] = useState(false);
  // True whenever the user left PayMongo without completing payment.
  // Covers ALL abandonment scenarios:
  //   - PayMongo cancel button  → ?payment=cancelled
  //   - Browser Back button     → no ?payment= param, pending key in sessionStorage
  //   - Tab closed & re-opened  → no ?payment= param, pending key in sessionStorage
  //   - Internet loss / timeout → no ?payment= param, pending key in sessionStorage
  // Only a ?payment=success return is NOT considered abandoned.
  const [paymentCancelled, setPaymentCancelled] = useState(() => {
    const paymentParam = new URLSearchParams(window.location.search).get("payment");
    const hasPending = sessionStorage.getItem(PAYMENT_RETURN_PENDING_KEY) === "1";
    return (paymentParam === "cancelled") || (hasPending && paymentParam !== "success");
  });
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
  const [viewingType, setViewingType] = useState("");
  const [remoteViewingAcknowledged, setRemoteViewingAcknowledged] = useState(false);
  const [remoteViewingQuestions, setRemoteViewingQuestions] = useState("");
  const [isUrgentMoveIn, setIsUrgentMoveIn] = useState(false);
  const [applicationReviewReason, setApplicationReviewReason] = useState("");
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
  const [firstName, setFirstName] = useState(profileName.firstName);
  const [lastName, setLastName] = useState(profileName.lastName);
  const [middleName, setMiddleName] = useState("");
  const [nickname, setNickname] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
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
  const [documentPrechecks, setDocumentPrechecks] = useState(
    createEmptyDocumentPrechecks,
  );
  const [runningDocumentChecks, setRunningDocumentChecks] = useState({});
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

  // Stage 4: Payment ΓÇö tenant must acknowledge the non-refundable fee policy
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

  // ΓöÇΓöÇ Capture payment redirect flag + status at render time (before effects clear URL) ΓöÇΓöÇ
  const paymentReturnStatusRef = useRef(
    new URLSearchParams(window.location.search).get("payment")
  );
  const paymentReturnSessionIdRef = useRef(getValidPaymentReturnSessionId());
  const isPaymentReturnRef = useRef(Boolean(paymentReturnStatusRef.current));

  // ΓöÇΓöÇ Payment redirect hook (must be after all useState) ΓöÇΓöÇΓöÇΓöÇ
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
  const [lastApplicationDraftSavedAt, setLastApplicationDraftSavedAt] = useState(null);
  const [hasUnsavedApplicationChanges, setHasUnsavedApplicationChanges] =
    useState(false);
  const [draftRecoveryMessage, setDraftRecoveryMessage] = useState("");
  const autoSaveTimerRef = useRef(null);
  const isFirstRenderRef = useRef(true);
  const navigatingAwayRef = useRef(false);
  const applicationDraftSaveClearTimerRef = useRef(null);
  const lastSavedApplicationDraftRef = useRef("");
  const draftRecoveryShownRef = useRef(false);
  const draftToastShownRef = useRef(false);

  // Trigger toast notification when user enters Stage 3 (Application Form) if a draft was restored
  useEffect(() => {
    if (Number(currentStage) === 3 && draftRecoveryMessage && !draftToastShownRef.current) {
      draftToastShownRef.current = true;
      showNotification("Your saved progress has been restored.", "success", 3000);
    }
  }, [currentStage, draftRecoveryMessage, showNotification]);

  const profileNameInitializedRef = useRef(false);
  useEffect(() => {
    if (profileNameInitializedRef.current) return;
    if (!profileName.firstName && !profileName.lastName && !user) return;
    if (!firstName && profileName.firstName) setFirstName(profileName.firstName);
    if (!lastName && profileName.lastName) setLastName(profileName.lastName);
    if (!middleName && user?.middleName) setMiddleName(user.middleName);
    if (!mobileNumber && (user?.phone || user?.mobileNumber)) setMobileNumber(user.phone || user.mobileNumber);
    if (!birthday && user?.dateOfBirth) {
      const d =
        typeof user.dateOfBirth === "string"
          ? user.dateOfBirth.slice(0, 10)
          : new Date(user.dateOfBirth).toISOString().slice(0, 10);
      setBirthday(d);
    }
    if (!gender && user?.gender) setGender(user.gender);
    if (!maritalStatus && (user?.civilStatus || user?.maritalStatus)) setMaritalStatus(user.civilStatus || user.maritalStatus);
    if (!nationality && user?.nationality) setNationality(user.nationality);
    if (!occupation && user?.occupation) setOccupation(user.occupation);
    if (!selfiePhoto && user?.profileImage) setSelfiePhoto(user.profileImage);
    profileNameInitializedRef.current = true;
  }, [
    user,
    profileName.firstName,
    profileName.lastName,
    firstName,
    lastName,
    middleName,
    mobileNumber,
    birthday,
    gender,
    maritalStatus,
    nationality,
    occupation,
    selfiePhoto,
  ]);

  const visitGateReservation = useMemo(() => {
    const merged = {
      ...(reservationData || {}),
      viewingPreference:
        reservationData?.viewingPreference ||
        viewingType,
      viewingType:
        reservationData?.viewingType ||
        viewingType,
      visitDate:
        reservationData?.visitDate ||
        visitDate,
      visitTime:
        reservationData?.visitTime ||
        visitTime,
      visitStatus: reservationData?.visitStatus || "",
      status: normalizeReservationStatus(reservationData?.status),
      scheduleRejected:
        reservationData?.scheduleRejected ?? scheduleRejected,
    };
    return {
      ...merged,
      viewingPreference:
        getReservationViewingPreference(merged) ||
        merged.viewingPreference ||
        merged.viewingType ||
        "",
    };
  }, [reservationData, viewingType, visitDate, visitTime, scheduleRejected]);

  const physicalVisitApplicationLocked = useMemo(
    () => isPhysicalVisitApplicationLocked(visitGateReservation),
    [visitGateReservation],
  );
  const applicationAccessAllowed = useMemo(
    () => canAccessTenantApplication(visitGateReservation),
    [visitGateReservation],
  );
  const roomSelectionLocked = useMemo(
    () => isApplicantRoomSelectionLocked(reservationData),
    [reservationData],
  );
  const viewingPreferenceStepAccess = useMemo(
    () => getViewingPreferenceStepAccess(reservationData, viewingType),
    [reservationData, viewingType],
  );
  const isApplicationApproved = useMemo(() => {
    const reservationStatus = normalizeReservationStatus(reservationData?.status);
    return Boolean(
      isApplicationApprovedStatus(reservationStatus, reservationData) ||
        paymentApproved,
    );
  }, [reservationData, paymentApproved]);

  const handleSetEditingApplication = useCallback(
    (value) => {
      if (isApplicationApproved) {
        setEditingApplication(false);
        return;
      }
      setEditingApplication(typeof value === "function" ? value : Boolean(value));
    },
    [isApplicationApproved],
  );

  const validateViewingPreferenceChange = useCallback(async () => {
    const targetReservationId =
      reservationId || reservationData?._id || reservationData?.id;
    if (!targetReservationId) return true;

    try {
      const latestResponse = await reservationApi.getById(targetReservationId);
      const latestReservation = latestResponse?.reservation || latestResponse;

      if (latestReservation?._id) {
        setReservationData((previous) => ({
          ...(previous || {}),
          ...latestReservation,
          room: latestReservation.roomId || latestReservation.room || previous?.room,
        }));
      }

      if (!canChangeViewingPreference(latestReservation || reservationData)) {
        showNotification(
          "Your viewing preference can no longer be changed because your reservation is already being processed.",
          "info",
          5000,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to verify viewing preference change access:", error);
      showNotification(
        "We could not verify whether your viewing preference can be changed. Please try again.",
        "error",
        5000,
      );
      return false;
    }
  }, [reservationData, reservationId]);

  const returnToDashboardForApplicationGate = useCallback(() => {
    const message = physicalVisitApplicationLocked
      ? PHYSICAL_VISIT_APPLICATION_LOCKED_MESSAGE
      : TENANT_APPLICATION_LOCKED_MESSAGE;
    showNotification(message, "info", 5000);
    appNavigate("/applicant/profile", {
      state: { tab: "dashboard" },
      flash: {
        type: "info",
        message,
      },
    });
  }, [appNavigate, physicalVisitApplicationLocked]);

  const notifyRoomSelectionLocked = useCallback(() => {
    showNotification(ROOM_SELECTION_LOCKED_MESSAGE, "info", 5000);
  }, []);
  const notifyViewingPreferenceLocked = useCallback(() => {
    showNotification(VIEWING_PREFERENCE_LOCKED_MESSAGE, "info", 5000);
  }, []);

  useEffect(() => {
    if (
      (reservationId || reservationData?._id) &&
      currentStage === 3 &&
      !applicationAccessAllowed
    ) {
      returnToDashboardForApplicationGate();
    }
  }, [
    applicationAccessAllowed,
    currentStage,
    reservationData?._id,
    reservationId,
    returnToDashboardForApplicationGate,
  ]);

  // ── Warn before leaving mid-flow (skip if intentional navigation) ──
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (navigatingAwayRef.current) return;
      if (
        isFormDirty ||
        hasUnsavedApplicationChanges ||
        saveStatus === "saving" ||
        saveStatus === "error" ||
        currentStage > 1
      ) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentStage, hasUnsavedApplicationChanges, isFormDirty, saveStatus]);

  // ── Stepper locking ────────────────────────────────────────────────────────
  const isStageLocked = (stageId) => {
    const reservationStatus = normalizeReservationStatus(reservationData?.status);
    const needsRevision = hasReservationStatus(reservationStatus, "needs_revision");
    const applicationAccess = canAccessTenantApplication({
      ...reservationData,
      viewingPreference:
        reservationData?.viewingPreference || getReservationViewingPreference({
          ...reservationData,
          viewingPreference: viewingType,
          viewingType,
          visitDate,
          visitTime,
        }),
      viewingType,
      visitDate,
      visitTime,
      visitStatus: reservationData?.visitStatus,
      status: reservationStatus,
    });
    if (paymentApproved) return stageId < 5;
    if (stageId === 1) return roomSelectionLocked || visitCompleted;
    if (stageId === 2)
      return (
        viewingPreferenceStepAccess.readOnly ||
        (applicationSubmitted && !needsRevision && !scheduleRejected)
      );
    if (stageId === 3) {
      if (isApplicationApproved) return true;
      return (
        !applicationAccess ||
        (applicationSubmitted && !editingApplication && !needsRevision)
      );
    }
    if (stageId === 4) return paymentSubmitted || paymentApproved;
    return false;
  };

  const isStageClickable = (stageId) => {
    const reservationStatus = normalizeReservationStatus(reservationData?.status);
    const paymentUnlocked = canReservationAccessPayment(reservationStatus);
    const isPaid =
      reservationData?.paymentStatus === "paid" ||
      Boolean(reservationData?.paymentDate) ||
      paymentApproved ||
      hasReservationStatus(reservationStatus, "reserved", "moveIn", "moveOut");
    if (stageId === 1) return highestStageReached >= 2;
    if (stageId <= highestStageReached) return true;
    if (stageId === 4 && (paymentUnlocked || paymentSubmitted || paymentApproved || isPaid)) return true;
    if (stageId === 5 && (paymentSubmitted || paymentApproved || isPaid)) return true;
    return false;
  };

  const handleStepperClick = (stageId) => {
    if (!isStageClickable(stageId)) return;
    if (stageId === 3 && !applicationAccessAllowed) {
      returnToDashboardForApplicationGate();
      return;
    }
    setCurrentStage(stageId);
  };

  // ΓöÇΓöÇ Helpers to populate state from a reservation object ΓöÇΓöÇΓöÇΓöÇ
  const populateFromReservation = (r) => {
    if (r.firstName) setFirstName(r.firstName);
    if (r.lastName) setLastName(r.lastName);
    if (r.middleName) setMiddleName(r.middleName);
    if (r.nickname) setNickname(r.nickname);
    if (r.mobileNumber) setMobileNumber(r.mobileNumber);
    if (r.billingEmail) setBillingEmail(r.billingEmail);
    if (r.birthday) {
      const b = new Date(r.birthday);
      if (!isNaN(b)) setBirthday(b.toISOString().split("T")[0]);
    }
    if (r.gender) setGender(r.gender);
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
    const savedMoveInDate = r.intendedMoveInDate || r.targetMoveInDate || r.moveInDate;
    if (savedMoveInDate) {
      setTargetMoveInDate(
        typeof savedMoveInDate === "string"
          ? savedMoveInDate.split("T")[0]
          : new Date(savedMoveInDate).toISOString().split("T")[0],
      );
    }
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
    setDocumentPrechecks(
      r.documentPrechecks
        ? normalizeDocumentPrechecks(r.documentPrechecks)
        : createEmptyDocumentPrechecks(),
    );
    // NOTE: agreedToPrivacy / agreedToCertification are NOT restored
    // from saved data ΓÇö consent must be re-affirmed each session.
  };

  // ΓöÇΓöÇ Pre-fill empty fields from user profile (for new reservations) ΓöÇΓöÇ
  const applyApplicationDraftPayload = (payload = {}, meta = {}) => {
    const hasPayloadField = (key) =>
      Object.prototype.hasOwnProperty.call(payload, key);
    const setStringField = (key, setter) => {
      if (hasPayloadField(key)) setter(payload[key] || "");
    };

    setStringField("firstName", setFirstName);
    setStringField("lastName", setLastName);
    setStringField("middleName", setMiddleName);
    setStringField("nickname", setNickname);
    setStringField("mobileNumber", setMobileNumber);
    setStringField("billingEmail", setBillingEmail);
    setStringField("birthday", setBirthday);
    setStringField("gender", setGender);
    setStringField("maritalStatus", setMaritalStatus);
    setStringField("nationality", setNationality);
    setStringField("educationLevel", setEducationLevel);
    setStringField("addressUnitHouseNo", setAddressUnitHouseNo);
    setStringField("addressStreet", setAddressStreet);
    setStringField("addressRegion", setAddressRegion);
    setStringField("addressBarangay", setAddressBarangay);
    setStringField("addressCity", setAddressCity);
    setStringField("addressProvince", setAddressProvince);
    setStringField("emergencyContactName", setEmergencyContactName);
    setStringField("emergencyRelationship", setEmergencyRelationship);
    setStringField("emergencyContactNumber", setEmergencyContactNumber);
    setStringField("healthConcerns", setHealthConcerns);
    setStringField("employerSchool", setEmployerSchool);
    setStringField("employerAddress", setEmployerAddress);
    setStringField("employerContact", setEmployerContact);
    setStringField("startDate", setStartDate);
    setStringField("occupation", setOccupation);
    setStringField("previousEmployment", setPreviousEmployment);
    setStringField("preferredRoomNumber", setPreferredRoomNumber);
    setStringField("referralSource", setReferralSource);
    setStringField("referrerName", setReferrerName);
    setStringField("estimatedMoveInTime", setEstimatedMoveInTime);
    setStringField("workSchedule", setWorkSchedule);
    setStringField("workScheduleOther", setWorkScheduleOther);
    setStringField("targetMoveInDate", setTargetMoveInDate);
    setStringField("finalMoveInDate", setFinalMoveInDate);
    setStringField("nbiReason", setNbiReason);
    setStringField("companyIDReason", setCompanyIDReason);
    setStringField("personalNotes", setPersonalNotes);

    if (hasPayloadField("leaseDuration")) {
      setLeaseDuration(payload.leaseDuration ? String(payload.leaseDuration) : "");
    }
    if (hasPayloadField("validIDType") || hasPayloadField("idType")) {
      setValidIDType(payload.validIDType || payload.idType || "");
    }
    if (hasPayloadField("selfiePhotoUrl")) setSelfiePhoto(payload.selfiePhotoUrl || null);
    if (hasPayloadField("validIDFrontUrl")) setValidIDFront(payload.validIDFrontUrl || null);
    if (hasPayloadField("validIDBackUrl")) setValidIDBack(payload.validIDBackUrl || null);
    if (hasPayloadField("nbiClearanceUrl")) setNbiClearance(payload.nbiClearanceUrl || null);
    if (hasPayloadField("companyIDUrl")) setCompanyID(payload.companyIDUrl || null);

    if (meta.documentPrechecks) {
      setDocumentPrechecks(normalizeDocumentPrechecks(meta.documentPrechecks));
    }
    if (meta.idValidationResult) {
      setIdValidationResult(meta.idValidationResult);
    }
  };

  const markApplicationDraftRestored = (savedAt = null) => {
    if (draftRecoveryShownRef.current) return;
    draftRecoveryShownRef.current = true;
    setDraftRecoveryMessage("Your saved progress has been restored.");
    setLastApplicationDraftSavedAt(savedAt || new Date().toISOString());
    if (Number(currentStage) === 3 && !draftToastShownRef.current) {
      draftToastShownRef.current = true;
      showNotification("Your saved progress has been restored.", "success", 3000);
    }
  };

  const restoreLocalApplicationDraftIfNeeded = (reservation = {}) => {
    if (typeof window === "undefined" || !window.localStorage) return false;

    const targetReservationId =
      reservation?._id || reservation?.id || reservationId || "";
    const key = getApplicationDraftStorageKey(user?.firebaseUid, targetReservationId);
    if (!key || hasSubstantiveApplicationDraft(reservation)) return false;
    if (reservation?.applicationSubmittedAt) return false;

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (!draft?.payload) return false;
      if (draft.userId && draft.userId !== user?.firebaseUid) return false;
      if (draft.reservationId && draft.reservationId !== targetReservationId) return false;
      if (!hasSubstantiveApplicationDraft(draft.payload)) return false;

      applyApplicationDraftPayload(draft.payload, draft);
      lastSavedApplicationDraftRef.current = JSON.stringify({
        payload: draft.payload,
        documentPrechecks: draft.documentPrechecks || null,
        idValidationResult: draft.idValidationResult || null,
      });
      setHasUnsavedApplicationChanges(false);
      markApplicationDraftRestored(draft.savedAt);
      return true;
    } catch (error) {
      console.warn("Could not restore local application draft:", error);
      return false;
    }
  };

  const markBackendApplicationDraftRestored = (reservation = {}) => {
    if (!hasSubstantiveApplicationDraft(reservation)) return;
    markApplicationDraftRestored(reservation.updatedAt || reservation.createdAt);
  };

  const prefillFromProfile = async () => {
    try {
      const profile = await authApi.getCurrentUser();
      if (!profile) return;
      const profileName = getProfileName(profile);
      // Only fill fields that are still empty
      if (!firstName && profileName.firstName) setFirstName(profileName.firstName);
      if (!lastName && profileName.lastName) setLastName(profileName.lastName);
      if (!mobileNumber && profile.phone) setMobileNumber(profile.phone);
      if (!billingEmail && profile.email) setBillingEmail(profile.email);
      if (!birthday && profile.dateOfBirth) {
        const b = new Date(profile.dateOfBirth);
        if (!isNaN(b)) setBirthday(b.toISOString().split("T")[0]);
      }
      if (!gender && profile.gender) setGender(profile.gender);
      if (!addressCity && profile.city) setAddressCity(profile.city);
      if (!addressStreet && profile.address) setAddressStreet(profile.address);
      if (!emergencyContactName && profile.emergencyContact)
        setEmergencyContactName(profile.emergencyContact);
      if (!emergencyContactNumber && profile.emergencyPhone)
        setEmergencyContactNumber(profile.emergencyPhone);
    } catch {
      // Non-critical ΓÇö silently skip if profile fetch fails
    }
  };

  const computeLockingFlags = (r) => {
    const status = normalizeReservationStatus(r.status);
    const viewingPreference = getReservationViewingPreference(r);
    const applicationAccess = canAccessTenantApplication({
      ...r,
      status,
      viewingPreference,
    });
    // Status-driven flags (primary) with data-presence fallback (backward compat)
    const VIEWING_SELECTED_STATUSES = [
      "viewing_preference_selected",
      "visit_pending",
      "visit_approved",
      "pending_application_review",
      "needs_revision",
      "approved_for_payment",
      "payment_pending",
      "reserved",
      "moveIn",
    ];
    const APPLICATION_STATUSES = [
      "pending_application_review",
      "needs_revision",
      "approved_for_payment",
      "payment_pending",
      "reserved",
      "moveIn",
    ];

    const hasViewingPreference =
      VIEWING_SELECTED_STATUSES.includes(status) ||
      Boolean(viewingPreference || r.visitDate);
    const isVisitApprovedFlag =
      Boolean(r.visitApproved === true) ||
      applicationAccess;
    const hasApplication =
      APPLICATION_STATUSES.includes(status) || Boolean(r.applicationSubmittedAt);
    const paymentUnlocked = canReservationAccessPayment(status);
    const isConfirmed =
      hasReservationStatus(status, "reserved", "moveIn", "moveOut") ||
      r.paymentStatus === "paid" ||
      Boolean(r.paymentDate);
    const hasPayment =
      status === "payment_submitted" ||
      status === "reserved" ||
      status === "moveIn" ||
      isConfirmed ||
      Boolean(r.proofOfPaymentUrl);

    if (hasViewingPreference) setVisitCompleted(applicationAccess);
    if (isVisitApprovedFlag) setVisitApproved(true);
    if (r.scheduleRejected) setScheduleRejected(true);
    if (r.scheduleRejectionReason) setScheduleRejectionReason(r.scheduleRejectionReason);
    if (hasApplication) setApplicationSubmitted(true);
    if (hasPayment) setPaymentSubmitted(true);
    if (isConfirmed) setPaymentApproved(true);
    if (r.applicationReviewReason) setApplicationReviewReason(r.applicationReviewReason);

    // Status-driven highest stage
    let highest = resolveTargetStage(status, viewingPreference, applicationAccess, r);
    if (isConfirmed) highest = 5;
    // Fallback: data-presence checks for legacy records still at "pending"
    if (highest === 1) {
      if (hasViewingPreference) highest = 2;
      if (hasViewingPreference && applicationAccess) highest = 3;
      if (isVisitApprovedFlag) highest = Math.max(highest, 3);
      if (hasApplication) highest = Math.max(highest, 3);
      if (paymentUnlocked) highest = Math.max(highest, 4);
      if (hasPayment) highest = Math.max(highest, 4);
      if (isConfirmed) highest = 5;
    }

    return {
      hasVisitScheduled: hasViewingPreference,
      isVisitApprovedFlag,
      hasApplication,
      hasPayment,
      isConfirmed,
      applicationUnlockedByVisit: applicationAccess,
      highest,
    };
  };

  // ΓöÇΓöÇ Data loading ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    // ΓöÇΓöÇ ALWAYS reset session-specific fields first ΓöÇΓöÇ
    // For new reservations, these stay blank.
    // For continuing, the async load functions below will repopulate from DB.
    setTargetMoveInDate("");
    setFinalMoveInDate("");
    setLeaseDuration("");
    setAgreedToPrivacy(false);
    setAgreedToCertification(false);

    // ── General payment return verification ──────────────────────────────────
    // ALWAYS verify the checkout session status with PayMongo's API on return
    // (whether ?payment=success, ?payment=cancelled, or pending key in sessionStorage).
    // This protects against PayMongo's header back arrow which sends ?payment=cancelled
    // even after a successful GCash/Maya payment.
    const hasPaymentReturnPending = sessionStorage.getItem(PAYMENT_RETURN_PENDING_KEY) === "1";
    const shouldVerifyPaymentReturn = Boolean(
      isPaymentReturnRef.current ||
      hasPaymentReturnPending ||
      paymentReturnStatusRef.current
    );

    if ((continueReservation || editMode) && resId) {
      if (shouldVerifyPaymentReturn) {
        paymentVerifyingRef.current = true;
        setPaymentReturnLoading(true);
        isPaymentReturnRef.current = false;
      }
      loadExistingReservation(resId, shouldVerifyPaymentReturn);
    } else {
      const state = location.state?.roomData;
      if (state) {
        setReservationData(state);
        prefillFromProfile();
      } else if (shouldVerifyPaymentReturn) {
        // ── Return from PayMongo: run verification loop with PayMongo API ────────
        paymentVerifyingRef.current = true;
        setPaymentReturnLoading(true);
        isPaymentReturnRef.current = false;
        const storedResId =
          sessionStorage.getItem(getActiveResKey(user?.firebaseUid)) ||
          sessionStorage.getItem("activeReservationId");
        if (storedResId) {
          loadExistingReservation(storedResId, true);
        } else {
          loadActiveReservation(true);
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
        } else if (isStepMode || user) {
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
    if (!continueReservation && stepOverride && stepOverride !== 3) {
      setCurrentStage(stepOverride);
    }

    // Payment redirect is handled by usePaymentRedirect hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.key]);

  // Real-time synchronization when admin updates visit/reservation status
  useEffect(() => {
    const handleRealtimeReservationUpdate = (event) => {
      const detail = event?.detail || {};
      const currentResId =
        reservationData?._id ||
        reservationId ||
        sessionStorage.getItem(getActiveResKey(user?.firebaseUid)) ||
        sessionStorage.getItem("activeReservationId");

      if (!currentResId) return;

      // If the event specifies a reservationId and it does not match, ignore
      if (detail.reservationId && String(detail.reservationId) !== String(currentResId)) {
        return;
      }

      // If visit is approved/completed, update live state and auto-advance if on Step 2
      const isVisitApproved =
        detail.visitApproved === true ||
        detail.action === "mark_visited" ||
        detail.action === "allow_without_visit" ||
        detail.visitStatus === "visit_completed" ||
        detail.status === "visit_approved";

      if (isVisitApproved) {
        setVisitApproved(true);
        setVisitCompleted(true);
        setReservationData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            visitApproved: true,
            visitStatus: detail.visitStatus || prev.visitStatus || "visit_completed",
            status: detail.status || prev.status,
          };
        });

        // If currently on Step 2 (Viewing Preference / Visit Step), auto-advance to Step 3 (Application Form)
        setCurrentStage((prevStage) => {
          if (prevStage === 2) {
            setHighestStageReached((prevHigh) => Math.max(prevHigh || 1, 3));
            showNotification(
              "Physical visit confirmed! You can now proceed with your tenant application.",
              "success",
              4000,
            );
            return 3;
          }
          return prevStage;
        });

        setHighestStageReached((prevHigh) => Math.max(prevHigh || 1, 3));
      } else if (detail.scheduleRejected || detail.action === "reject_schedule") {
        setScheduleRejected(true);
        setScheduleRejectionReason(detail.scheduleRejectionReason || "");
        setVisitApproved(false);
        setVisitCompleted(false);
        setReservationData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            scheduleRejected: true,
            scheduleRejectionReason: detail.scheduleRejectionReason || "",
            visitApproved: false,
          };
        });
      }

      // Also reload fresh reservation from server in background to sync any newly populated fields
      void reservationApi.getById(currentResId).then((freshRes) => {
        if (!freshRes) return;
        const fresh = freshRes?.reservation || freshRes;
        if (!fresh?._id) return;
        setReservationData((prev) => ({
          ...(prev || {}),
          ...fresh,
          room: fresh.roomId || prev?.room,
        }));
        if (fresh.visitApproved) {
          setVisitApproved(true);
          setVisitCompleted(true);
        }
      }).catch(() => {});
    };

    window.addEventListener("lilycrest:reservation-updated", handleRealtimeReservationUpdate);
    window.addEventListener("lilycrest:visit-updated", handleRealtimeReservationUpdate);

    return () => {
      window.removeEventListener("lilycrest:reservation-updated", handleRealtimeReservationUpdate);
      window.removeEventListener("lilycrest:visit-updated", handleRealtimeReservationUpdate);
    };
  }, [user, reservationData?._id, reservationId]);

  const loadActiveReservation = async (verifyPaymentReturn = false) => {
    // Keep the flow in a loading state until this decision resolves —
    // required lease/date fields were already cleared by the caller and must
    // not be read (or rendered) by step components until repopulated below.
    setIsLoading(true);
    try {
      const all = await reservationApi.getAll();
      const list = Array.isArray(all)
        ? all
        : all?.reservations || all?.data || [];
      const classification = classifyActiveReservations(list);
      if (classification.kind === "none") {
        appNavigate("/applicant/check-availability", {
          flash: { type: "warning", message: "No active reservation found." },
        });
        return;
      }
      if (classification.kind === "multiple") {
        // Do not silently resume an arbitrary one — this is a recovery
        // scenario, not a normal single-reservation resume.
        appNavigate("/applicant/profile", {
          flash: {
            type: "warning",
            message:
              "You have multiple active reservations. Please contact support to resolve this before continuing.",
          },
        });
        return;
      }
      const found = classification.reservation;
      if (verifyPaymentReturn) {
        await loadExistingReservation(found._id, true);
        return;
      }
      const active = await reservationApi.getById(found._id);
      if (active) {
        const room = active.roomId || {};
        setReservationId(active._id);
        if (user?.firebaseUid) {
          sessionStorage.setItem(getActiveResKey(user.firebaseUid), active._id);
        }
        if (active.reservationCode) setReservationCode(active.reservationCode);
        if (active.visitCode) setVisitCode(active.visitCode);
        setReservationData({
          _id: active._id,
          status: active.status,
          reservationCode: active.reservationCode || "",
          paymentStatus: active.paymentStatus || "",
          paymentMethod: active.paymentMethod || "",
          paymentDate: active.paymentDate || null,
          proofOfPaymentUrl: active.proofOfPaymentUrl || "",
          paymongoPaymentId: active.paymongoPaymentId || "",
          paymongoSessionId: active.paymongoSessionId || "",
          receiptSentAt: active.receiptSentAt || null,
          reservedAt: active.reservedAt || null,
          reservationFeeAmount: active.reservationFeeAmount || 2000,
          pricingDisplay: active.pricingDisplay,
          room: {
            id: room._id || room.id,
            roomId: room._id || room.id,
            name: room.name || "Room",
            title: room.name || "Room",
            branch: room.branch || "",
            type: room.type || "",
            price: room.monthlyRate || room.price || 0,
            roomNumber: room.name || "",
            floor: room.floor || "",
            images: room.images || [],
            capacity: room.capacity || 0,
            currentOccupancy: room.currentOccupancy || 0,
            description: room.description || "",
            beds: Array.isArray(room.beds) ? room.beds : [],
            longTermLeaseMinMonths: room.longTermLeaseMinMonths ?? 6,
          },
          viewingPreference: active.viewingPreference || active.viewingType || "",
          viewingType: active.viewingType || active.viewingPreference || "",
          visitDate: active.visitDate || "",
          visitTime: active.visitTime || "",
          visitStatus: active.visitStatus || "",
          visitApproved: Boolean(active.visitApproved),
          scheduleApproved: Boolean(active.scheduleApproved),
          scheduleRejected: Boolean(active.scheduleRejected),
          roomConfirmed: Boolean(active.roomConfirmed),
          visitCode: active.visitCode || "",
          remoteViewingAcknowledged: Boolean(active.remoteViewingAcknowledged),
          remoteViewingQuestions: active.remoteViewingQuestions || "",
          isUrgentMoveIn: Boolean(active.isUrgentMoveIn),
          selectedBed: active.selectedBed || null,
          selectedAppliances: active.selectedAppliances || [],
          applianceFees: active.applianceFees || 0,
          applicationReviewReason: active.applicationReviewReason || "",
        });
        if (active.visitDate) {
          const rawVisitDate = typeof active.visitDate === "string"
            ? active.visitDate
            : new Date(active.visitDate).toISOString();
          setVisitDate(rawVisitDate.split("T")[0]);
        }
        if (active.visitTime) setVisitTime(active.visitTime);
        if (active.viewingPreference || active.viewingType) {
          setViewingType(active.viewingPreference || active.viewingType);
        }
        setRemoteViewingAcknowledged(Boolean(active.remoteViewingAcknowledged));
        setRemoteViewingQuestions(active.remoteViewingQuestions || "");
        setIsUrgentMoveIn(Boolean(active.isUrgentMoveIn));
        if (active.visitApproved) setVisitApproved(true);
        populateFromReservation(active);
        if (!restoreLocalApplicationDraftIfNeeded(active)) {
          markBackendApplicationDraftRestored(active);
        }
        const isPaid =
          active.paymentStatus === "paid" ||
          Boolean(active.paymentDate) ||
          hasReservationStatus(normalizeReservationStatus(active.status), "reserved", "moveIn", "moveOut");

        if (active.paymentMethod) setPaymentMethod(active.paymentMethod);
        if (
          active.proofOfPaymentUrl ||
          active.paymentDate ||
          active.paymongoPaymentId ||
          active.paymentStatus === "paid" ||
          active.paymentStatus === "partial" ||
          isPaid
        )
          setPaymentSubmitted(true);
        if (isPaid) setPaymentApproved(true);
        const resolvedHighest = isPaid ? 5 : highest;
        setHighestStageReached(resolvedHighest);
        if (!stepOverride) {
          setCurrentStage(resolvedHighest);
        }
        const activeApplicationStageBlocked =
          isTenantApplicationStageRequestBlocked(stepOverride, {
            ...active,
            viewingPreference: getReservationViewingPreference(active),
          });
        if (activeApplicationStageBlocked) {
          setCurrentStage(2);
          showNotification(TENANT_APPLICATION_LOCKED_MESSAGE, "info", 5000);
        } else if (stepOverride && stepOverride <= highest) {
          setCurrentStage(stepOverride);
        }
      }
    } catch (err) {
      console.error("Failed to load reservation:", err);
      appNavigate("/applicant/check-availability", {
        flash: { type: "warning", message: "Failed to load active reservation. Please try again." },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const waitForDepositPaymentValidation = async (resId, sessionId) => {
    const startedAt = Date.now();
    let lastResult = null;

    if (!sessionId) {
      return { result: null, reservation: null };
    }

    // Single check for explicit cancelled returns — do not poll 20s when unpaid.
    const isCancelledReturn = paymentReturnStatusRef.current === "cancelled";
    const maxWaitMs = isCancelledReturn ? 0 : PAYMENT_RETURN_MAX_WAIT_MS;

    do {
      try {
        lastResult = await billingApi.checkPaymentStatus(sessionId);
        if (lastResult?.requiresReview) {
          return {
            result: {
              ...lastResult,
              status: lastResult.status || "requires_review",
              requiresReview: true,
            },
            reservation: lastResult.reservation || null,
          };
        }
        if (lastResult?.status === "paid") {
          let confirmedReservation = lastResult.reservation || null;
          try {
            confirmedReservation = await reservationApi.getById(resId);
          } catch {
            // The payment is confirmed; profile/dashboard refresh can catch up.
          }
          return {
            result: lastResult,
            reservation: confirmedReservation,
          };
        }
      } catch (error) {
        console.warn("[PAYMENT] Session validation attempt failed:", error);
      }

      if (isCancelledReturn || Date.now() - startedAt >= maxWaitMs) {
        break;
      }

      await wait(PAYMENT_RETURN_POLL_INTERVAL_MS);
    } while (Date.now() - startedAt < maxWaitMs);

    return { result: lastResult, reservation: null };
  };

  const loadExistingReservation = async (resId, skipStageSet = false) => {
    try {
      setIsLoading(true);
      const reservation = await reservationApi.getById(resId);
      const targetResId = reservation._id || resId;
      setReservationId(targetResId);
      if (user?.firebaseUid) {
        sessionStorage.setItem(getActiveResKey(user.firebaseUid), targetResId);
      }
      if (reservation.reservationCode)
        setReservationCode(reservation.reservationCode);
      if (reservation.visitCode)
        setVisitCode(reservation.visitCode);
      setReservationData({
        _id: reservation._id || resId,
        status: reservation.status,
        reservationCode: reservation.reservationCode || "",
        paymentStatus: reservation.paymentStatus || "",
        paymentMethod: reservation.paymentMethod || "",
        paymentDate: reservation.paymentDate || null,
        proofOfPaymentUrl: reservation.proofOfPaymentUrl || "",
        paymongoPaymentId: reservation.paymongoPaymentId || "",
        paymongoSessionId: reservation.paymongoSessionId || "",
        receiptSentAt: reservation.receiptSentAt || null,
        reservedAt: reservation.reservedAt || null,
        reservationFeeAmount: reservation.reservationFeeAmount || 2000,
        pricingDisplay: reservation.pricingDisplay,
        room: reservation.roomId,
        viewingPreference:
          reservation.viewingPreference || reservation.viewingType || "",
        viewingType:
          reservation.viewingType || reservation.viewingPreference || "",
        visitDate: reservation.visitDate || "",
        visitTime: reservation.visitTime || "",
        visitStatus: reservation.visitStatus || "",
        visitApproved: Boolean(reservation.visitApproved),
        scheduleApproved: Boolean(reservation.scheduleApproved),
        scheduleRejected: Boolean(reservation.scheduleRejected),
        roomConfirmed: Boolean(reservation.roomConfirmed),
        visitCode: reservation.visitCode || "",
        remoteViewingAcknowledged: Boolean(reservation.remoteViewingAcknowledged),
        remoteViewingQuestions: reservation.remoteViewingQuestions || "",
        isUrgentMoveIn: Boolean(reservation.isUrgentMoveIn),
        selectedBed: reservation.selectedBed,
        selectedAppliances: reservation.selectedAppliances || [],
        applianceFees: reservation.applianceFees || 0,
        applicationReviewReason: reservation.applicationReviewReason || "",
      });
      if (reservation.targetMoveInDate) {
        const d = new Date(reservation.targetMoveInDate);
        if (!isNaN(d)) setTargetMoveInDate(d.toISOString().split("T")[0]);
      }
      if (reservation.leaseDuration)
        setLeaseDuration(reservation.leaseDuration);
      if (reservation.billingEmail) setBillingEmail(reservation.billingEmail);
      if (reservation.viewingPreference || reservation.viewingType) {
        setViewingType(reservation.viewingPreference || reservation.viewingType);
      }
      setRemoteViewingAcknowledged(Boolean(reservation.remoteViewingAcknowledged));
      setRemoteViewingQuestions(reservation.remoteViewingQuestions || "");
      setIsUrgentMoveIn(Boolean(reservation.isUrgentMoveIn));
      if (reservation.isOutOfTown !== undefined)
        setIsOutOfTown(reservation.isOutOfTown);
      if (reservation.currentLocation)
        setCurrentLocation(reservation.currentLocation);
      if (reservation.visitApproved !== undefined)
        setVisitApproved(reservation.visitApproved);
      const reservationStatus = normalizeReservationStatus(reservation.status);
      const isPaid =
        reservation.paymentStatus === "paid" ||
        Boolean(reservation.paymentDate) ||
        hasReservationStatus(reservationStatus, "reserved", "moveIn", "moveOut");

      if (reservation.paymentMethod) setPaymentMethod(reservation.paymentMethod);
      if (
        reservation.proofOfPaymentUrl ||
        reservation.paymentDate ||
        reservation.paymongoPaymentId ||
        reservation.paymentStatus === "paid" ||
        reservation.paymentStatus === "partial" ||
        isPaid
      )
        setPaymentSubmitted(true);
      if (isPaid) setPaymentApproved(true);
      populateFromReservation(reservation);
      if (!restoreLocalApplicationDraftIfNeeded(reservation)) {
        markBackendApplicationDraftRestored(reservation);
      }
      const {
        hasVisitScheduled,
        isVisitApprovedFlag,
        hasApplication,
        hasPayment,
        isConfirmed,
        highest: computedHighest,
        applicationUnlockedByVisit,
      } = computeLockingFlags(reservation);

      const highest = isPaid ? 5 : computedHighest;

      // Status-driven stage calculation
      let targetStage = isPaid
        ? 5
        : resolveTargetStage(reservationStatus, getReservationViewingPreference(reservation), applicationUnlockedByVisit, reservation);
      const applicationStageBlocked =
        isTenantApplicationStageRequestBlocked(stepOverride, {
          ...reservation,
          status: reservationStatus,
          viewingPreference: getReservationViewingPreference(reservation),
        });
      if (applicationStageBlocked) {
        targetStage = Math.min(targetStage || 2, 2);
      }

      // visit_pending: tenant must wait ΓÇö redirect to profile (unless rejected)
      if (false && reservationStatus === "visit_pending" && !reservation.scheduleRejected) {
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
        else if (hasApplication) targetStage = 3;
        else if (isVisitApprovedFlag) targetStage = 3;
        else if (hasVisitScheduled) targetStage = 2;
      }

      if (reservation.roomConfirmed && targetStage === 1) {
        targetStage = 2;
      }
      if (skipStageSet) {
        // Payment redirect — verify using the reservation's stored paymongoSessionId
        // Only set highest to 5 immediately if returning from an explicit success redirect
        if (paymentReturnStatusRef.current === "success") {
          setHighestStageReached(5);
        }
        const verificationSessionId =
          paymentReturnSessionIdRef.current ||
          reservation.paymongoSessionId ||
          sessionStorage.getItem(PAYMENT_SESSION_KEY) ||
          null;
        // Verify payment status with PayMongo/webhook state before leaving the loader.
        if (
          verificationSessionId ||
          isReservationPaymentConfirmed(reservation) ||
          paymentReturnStatusRef.current === "success"
        ) {
          try {
            const { result, reservation: validatedReservation } =
              isReservationPaymentConfirmed(reservation)
                ? {
                    result: {
                      status: "paid",
                      paymentMethod: reservation.paymentMethod || "paymongo",
                    },
                    reservation,
                  }
                : await waitForDepositPaymentValidation(
                    resId,
                    verificationSessionId,
                  );
            if (result?.requiresReview) {
              sessionStorage.removeItem(PAYMENT_SESSION_KEY);
              sessionStorage.removeItem(PAYMENT_RETURN_PENDING_KEY);
              await queryClient.invalidateQueries({ queryKey: ["reservations"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              appNavigate("/applicant/profile", {
                flash: {
                  type: "warning",
                  message:
                    "Payment was received but needs admin review before your reservation can be secured.",
                },
              });
              return;
            }

            if (result?.status === "paid") {
              sessionStorage.removeItem(getActiveResKey(user?.firebaseUid));
              sessionStorage.removeItem("activeReservationId"); // legacy cleanup
              sessionStorage.removeItem(PAYMENT_SESSION_KEY);
              sessionStorage.removeItem(PAYMENT_RETURN_PENDING_KEY);
              let updatedReservation = validatedReservation || result.reservation || null;
              if (!updatedReservation?._id) {
                try {
                updatedReservation = await reservationApi.getById(resId);
                if (updatedReservation?.reservationCode) setReservationCode(updatedReservation.reservationCode);
                if (updatedReservation?.paymentMethod) setPaymentMethod(updatedReservation.paymentMethod);
              } catch { /* non-critical ΓÇö code just won't display */ }
              }
              if (updatedReservation?._id) {
                setReservationData((previous) => ({
                  ...(previous || {}),
                  ...updatedReservation,
                  room: updatedReservation.roomId || updatedReservation.room || previous?.room,
                }));
                if (updatedReservation.reservationCode) {
                  setReservationCode(updatedReservation.reservationCode);
                }
                if (updatedReservation.paymentMethod) {
                  setPaymentMethod(updatedReservation.paymentMethod);
                }
                queryClient.setQueryData(
                  ["reservations", "detail", updatedReservation._id],
                  (current) => ({ ...(current || {}), ...updatedReservation }),
                );
                queryClient.setQueriesData(
                  { queryKey: ["reservations", "list"] },
                  (current) => mergeReservationIntoQueryData(current, updatedReservation),
                );
              }
              await queryClient.invalidateQueries({ queryKey: ["reservations"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              await wait(PAYMENT_RETURN_MIN_LOADING_MS);
              setCurrentStage(5);
              setHighestStageReached(5);
              setPaymentSubmitted(true);
              setPaymentApproved(true);
              justPaidRef.current = true;
              setPaymentMethod(result.paymentMethod || "paymongo");
              const refNumber = result?.referenceNumber;
              const refText = refNumber ? ` Reference #${refNumber}.` : "";
              const userEmail = updatedReservation?.user?.email || updatedReservation?.applicantEmail;
              const receiptNotice = userEmail
                ? ` Your official receipt has been sent to ${userEmail}.`
                : " Your official receipt has been sent to your email.";
              showNotification(`Payment confirmed!${refText}${receiptNotice}`, "success", 6000);
              return;
            } else {
              console.warn("[PAYMENT] Session not yet paid:", verificationSessionId, "status:", result?.status);
              sessionStorage.removeItem(PAYMENT_RETURN_PENDING_KEY);
              setCurrentStage(4);
              // Show appropriate toast based on how the user returned
              if (paymentReturnStatusRef.current === "cancelled") {
                setPaymentCancelled(true);
                showNotification("Payment was not confirmed yet. You can try again from the payment step.", "info", 5000);
              } else {
                appNavigate("/applicant/profile", {
                  flash: {
                    type: "info",
                    message:
                      "Payment is still being validated. You can retry from the payment step if needed.",
                  },
                });
              }
              return;
            }
          } catch (err) {
            console.error("Γ¥î [VERIFY] Payment check failed ΓÇö sessionId:", verificationSessionId, err);
            sessionStorage.removeItem(PAYMENT_RETURN_PENDING_KEY);
            setCurrentStage(4);
            if (paymentReturnStatusRef.current !== "cancelled") {
              showNotification("Could not verify payment. Please check your profile.", "warning", 5000);
            }
            return;
          }
        } else {
          // No stored session ID ΓÇö skip generic toast, just navigate to correct stage
          console.warn("[PAYMENT] skipStageSet=true but paymongoSessionId is empty for reservation:", resId);
          setCurrentStage(targetStage);
          return; // ΓåÉ prevent double-toast: skip the generic notification below
        }
      } else if (applicationStageBlocked) {
        setCurrentStage(targetStage || 2);
      } else if (stepOverride && stepOverride <= highest) {
        setCurrentStage(stepOverride);
      } else {
        setCurrentStage(targetStage);
      }
      if (stepOverride === 3 && forceEditMode && !applicationSubmitted) {
        showNotification(
          "Editing your application draft. Make your changes and save.",
          "info",
          3000,
        );
      }
    } catch (err) {
      console.error("⚠ [LOAD_RESERVATION] Failed to load reservation id:", resId, "| status:", err?.response?.status, "| message:", err?.message, err);
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
        showNotification("Unable to load reservation data right now. Please refresh the page to try again.", "error", 5000);
      }
    } finally {
      paymentVerifyingRef.current = false;
      setPaymentReturnLoading(false);
      setIsLoading(false);
    }
  };

  // ─── Form change tracking (Stage 1) ──────────────────────
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

  // ─── API helpers ─────────────────────────────────────────
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
        "Room details are missing. Please select a room to continue.",
        "warning",
        4000,
      );
      return null;
    }
    const moveInDate = getMoveInDate() || null;
    const totalPrice = getTotalPrice();
    if (!totalPrice || totalPrice <= 0) {
      showNotification(
        "Room pricing is unavailable. Please go back and reselect a room.",
        "error",
        4000,
      );
      return null;
    }
    try {
      const response = await reservationApi.create({
        roomId,
        selectedBed: reservationData?.selectedBed
          ? {
              id: reservationData.selectedBed.id,
              position: reservationData.selectedBed.position,
            }
          : null,
        intendedMoveInDate: targetMoveInDate || moveInDate || null,
        targetMoveInDate: targetMoveInDate || moveInDate || null,
        leaseDuration: leaseDuration || "",
        billingEmail: getFieldValue(
          billingEmail,
          user?.email || "test@example.com",
        ),
        moveInDate: moveInDate || null,
        selectedAppliances: reservationData?.selectedAppliances || [],
        totalPrice,
        applianceFees: reservationData?.applianceFees || 0,
        viewingPreference: null,
        viewingType: null,
        agreedToPrivacy: false,
        roomConfirmed: true,
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
            selectedAppliances: reservationData?.selectedAppliances || [],
            totalPrice: totalPrice > 0 ? totalPrice : 5000,
            applianceFees: reservationData?.applianceFees || 0,
            agreedToPrivacy: false,
            agreedToCertification: false,
            roomConfirmed: true,
          });
          const existing = await reservationApi.getById(existingId);
          if (existing?.reservationCode)
            setReservationCode(existing.reservationCode);
          return existing;
        } catch (e) {
          const lockCode = e?.response?.data?.code;
          showNotification(
            lockCode === "RESERVATION_ROOM_SELECTION_LOCKED"
              ? ROOM_SELECTION_LOCKED_MESSAGE
              : getFriendlyError(e, "Unable to update your selected room."),
            lockCode === "RESERVATION_ROOM_SELECTION_LOCKED" ? "info" : "error",
            4000,
          );
          return null;
        }
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
    const updated = response?.reservation || response;
    if (updated?._id) setReservationId(updated._id);
    if (updated?.status || updated?.roomId) {
      setReservationData((previous) => ({
        ...(previous || {}),
        _id: updated._id || previous?._id,
        status: updated.status || previous?.status,
        reservationCode:
          updated.reservationCode ?? previous?.reservationCode ?? "",
        paymentStatus:
          updated.paymentStatus ?? previous?.paymentStatus ?? "",
        paymentMethod:
          updated.paymentMethod ?? previous?.paymentMethod ?? "",
        paymentDate:
          updated.paymentDate ?? previous?.paymentDate ?? null,
        proofOfPaymentUrl:
          updated.proofOfPaymentUrl ?? previous?.proofOfPaymentUrl ?? "",
        paymongoPaymentId:
          updated.paymongoPaymentId ?? previous?.paymongoPaymentId ?? "",
        paymongoSessionId:
          updated.paymongoSessionId ?? previous?.paymongoSessionId ?? "",
        receiptSentAt:
          updated.receiptSentAt ?? previous?.receiptSentAt ?? null,
        reservedAt:
          updated.reservedAt ?? previous?.reservedAt ?? null,
        reservationFeeAmount:
          updated.reservationFeeAmount ?? previous?.reservationFeeAmount ?? 2000,
        room: updated.roomId || previous?.room,
        viewingPreference:
          updated.viewingPreference ??
          updated.viewingType ??
          previous?.viewingPreference ??
          previous?.viewingType ??
          "",
        viewingType:
          updated.viewingType ??
          updated.viewingPreference ??
          previous?.viewingType ??
          previous?.viewingPreference ??
          "",
        visitDate:
          updated.visitDate ?? previous?.visitDate ?? "",
        visitTime:
          updated.visitTime ?? previous?.visitTime ?? "",
        visitStatus:
          updated.visitStatus ?? previous?.visitStatus ?? "",
        visitApproved:
          updated.visitApproved ?? previous?.visitApproved ?? false,
        scheduleApproved:
          updated.scheduleApproved ?? previous?.scheduleApproved ?? false,
        scheduleRejected:
          updated.scheduleRejected ?? previous?.scheduleRejected ?? false,
        roomConfirmed:
          updated.roomConfirmed ?? previous?.roomConfirmed ?? false,
        visitCode:
          updated.visitCode ?? previous?.visitCode ?? "",
        remoteViewingAcknowledged:
          updated.remoteViewingAcknowledged ??
          previous?.remoteViewingAcknowledged ??
          false,
        remoteViewingQuestions:
          updated.remoteViewingQuestions ??
          previous?.remoteViewingQuestions ??
          "",
        isUrgentMoveIn:
          updated.isUrgentMoveIn ?? previous?.isUrgentMoveIn ?? false,
        selectedBed: updated.selectedBed ?? previous?.selectedBed,
        selectedAppliances:
          updated.selectedAppliances ?? previous?.selectedAppliances ?? [],
        applianceFees: updated.applianceFees ?? previous?.applianceFees ?? 0,
        leaseDuration: updated.leaseDuration ?? previous?.leaseDuration,
        monthlyRent: updated.monthlyRent ?? previous?.monthlyRent,
        totalPrice: updated.totalPrice ?? previous?.totalPrice,
        pricingDisplay: updated.pricingDisplay ?? previous?.pricingDisplay,
        targetMoveInDate: updated.targetMoveInDate ?? previous?.targetMoveInDate,
        intendedMoveInDate: updated.intendedMoveInDate ?? previous?.intendedMoveInDate,
        applicationReviewReason:
          updated.applicationReviewReason ?? previous?.applicationReviewReason ?? "",
      }));
    }
    return updated;
  };

  const updateStayPackage = useCallback(
    async ({ leaseDuration: newLeaseDuration, targetMoveInDate: newMoveInDate, selectedBed: newBed } = {}) => {
      if (newLeaseDuration !== undefined && newLeaseDuration !== null) {
        setLeaseDuration(String(newLeaseDuration));
      }
      if (newMoveInDate !== undefined && newMoveInDate !== null) {
        setTargetMoveInDate(newMoveInDate);
      }

      const payload = {
        ...(newLeaseDuration !== undefined && newLeaseDuration !== null ? { leaseDuration: String(newLeaseDuration) } : {}),
        ...(newMoveInDate !== undefined && newMoveInDate !== null ? { targetMoveInDate: newMoveInDate, intendedMoveInDate: newMoveInDate } : {}),
        ...(newBed !== undefined
          ? {
              selectedBed: newBed
                ? {
                    id: newBed.id,
                    position: newBed.position,
                    code: newBed.code,
                    bunkBlock: newBed.bunkBlock,
                  }
                : null,
            }
          : {}),
      };

      try {
        const updated = await updateReservationDraft(payload);
        return updated;
      } catch (err) {
        console.error("Failed to update stay package:", err);
        throw err;
      }
    },
    [updateReservationDraft]
  );

  const returnToDashboardAfterViewingPreference = useCallback(
    ({
      viewingPreference,
      visitCode: savedVisitCode,
      visitDate: savedVisitDate,
      visitTime: savedVisitTime,
    } = {}) => {
      const feedbackByPreference = {
        physical_visit: {
          toastMessage:
            "Viewing preference submitted.",
        },
        remote_2d_viewing: {
          toastMessage:
            "Viewing preference submitted.",
        },
        urgent_move_in_review: {
          toastMessage:
            "Viewing preference submitted.",
        },
      };

      const selectedPreference = viewingPreference || viewingType;
      const feedback =
        feedbackByPreference[selectedPreference] ||
        feedbackByPreference.remote_2d_viewing;

      appNavigate("/applicant/profile", {
        state: {
          tab: "dashboard",
        },
        flash: {
          type: "success",
          message: feedback.toastMessage,
        },
      });
    },
    [appNavigate, viewingType, visitCode, visitDate, visitTime],
  );

  // ΓöÇΓöÇ Auto-save (stages 3-4) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const validateApplicantIdDocument = useCallback(
    async ({ documentUrl, idType } = {}) => {
      const targetReservationId = reservationId || reservationData?._id || reservationData?.id;
      const selectedIdType = idType || validIDType;

      if (!targetReservationId || !documentUrl || !selectedIdType) {
        const message = selectedIdType
          ? "Valid ID front image is required."
          : "ID type is required.";
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

  const runDocumentPrecheck = useCallback(
    async ({ documentType, documentUrl, idType } = {}) => {
      const targetReservationId =
        reservationId || reservationData?._id || reservationData?.id;

      if (!targetReservationId || !documentType || !documentUrl) {
        return null;
      }

      const stateKeyMap = {
        valid_id_front: "validIDFront",
        valid_id_back: "validIDBack",
        nbi_clearance: "nbiClearance",
        company_id: "companyID",
      };
      const stateKey = stateKeyMap[documentType];
      if (!stateKey) {
        return null;
      }

      setRunningDocumentChecks((previous) => ({
        ...previous,
        [stateKey]: true,
      }));
      setDocumentPrechecks((previous) => ({
        ...previous,
        [stateKey]: {
          ...normalizeDocumentPrecheckEntry(previous?.[stateKey]),
          precheckStatus: "checking",
          readabilityStatus: "unknown",
          documentTypeStatus: "unknown",
          canSubmit: false,
          aiCheckStatus: "checking",
          summaryMessage: DOCUMENT_PRECHECK_MESSAGES.checking,
          applicantMessage: DOCUMENT_PRECHECK_MESSAGES.checking,
        },
      }));

      try {
        const result = await reservationApi.precheckDocument(targetReservationId, {
          documentType,
          documentUrl,
          idType: idType || validIDType,
        });
        const normalized = normalizeDocumentPrecheckEntry(result);
        setDocumentPrechecks((previous) => ({
          ...previous,
          [stateKey]: normalized,
        }));
        return normalized;
        } catch (error) {
          const fallback = normalizeDocumentPrecheckEntry({
            precheckProvider: "ocr",
            precheckStatus: "manual_review_fallback",
            readabilityStatus: "ocr_unavailable",
            documentTypeStatus: "unknown",
            canSubmit: true,
            requiresManualReview: true,
            applicantMessage: DOCUMENT_PRECHECK_MESSAGES.manualReview,
            adminNote: "OCR could not complete. Manual review required.",
            flags: ["ocr_manual_fallback"],
            aiCheckStatus: "error",
            aiCheckWarnings: [
              "OCR could not complete. Manual review required.",
            ],
           summaryMessage: DOCUMENT_PRECHECK_MESSAGES.manualReview,
            requiresAdminAttention: true,
            aiCheckedAt: new Date().toISOString(),
            provider: "ocr",
          });
        setDocumentPrechecks((previous) => ({
          ...previous,
          [stateKey]: fallback,
        }));
        return fallback;
      } finally {
        setRunningDocumentChecks((previous) => ({
          ...previous,
          [stateKey]: false,
        }));
      }
    },
    [reservationData, reservationId, validIDType],
  );

  const buildDraftPayload = useCallback(
    () => {
      const includeViewingPreferenceDraft =
        Boolean(viewingType) &&
        !viewingPreferenceStepAccess.submitted &&
        !viewingPreferenceStepAccess.readOnly;
      const payload = {
        ...(includeViewingPreferenceDraft
          ? {
              visitDate,
              visitTime,
              viewingPreference: viewingType,
              viewingType:
                viewingType === "physical_visit"
                  ? "inperson"
                  : viewingType === "remote_2d_viewing"
                    ? "remote_2d"
                    : viewingType === "urgent_move_in_review"
                      ? "urgent_move_in"
                      : viewingType,
              remoteViewingAcknowledged,
              remoteViewingQuestions,
              isUrgentMoveIn,
              visitorName,
              visitorPhone,
              visitorEmail,
            }
          : {}),
        firstName,
        lastName,
        middleName,
        nickname,
        mobileNumber,
        billingEmail,
        birthday,
        gender,
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
        validIDType,
        idType: validIDType,
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
      };

      const uploadUrls = {
        selfiePhotoUrl: getSerializableUploadUrl(selfiePhoto),
        validIDFrontUrl: getSerializableUploadUrl(validIDFront),
        validIDBackUrl: getSerializableUploadUrl(validIDBack),
        nbiClearanceUrl: getSerializableUploadUrl(nbiClearance),
        companyIDUrl: getSerializableUploadUrl(companyID),
      };
      Object.entries(uploadUrls).forEach(([key, value]) => {
        if (value) payload[key] = value;
      });

      return payload;
    },
    [
      currentStage,
      visitDate,
      visitTime,
      viewingType,
      viewingPreferenceStepAccess.submitted,
      remoteViewingAcknowledged,
      remoteViewingQuestions,
      isUrgentMoveIn,
      visitorName,
      visitorPhone,
      visitorEmail,
      firstName,
      lastName,
      middleName,
      nickname,
      mobileNumber,
      billingEmail,
      birthday,
      gender,
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
      selfiePhoto,
      validIDFront,
      validIDBack,
      validIDType,
      nbiClearance,
      nbiReason,
      companyIDReason,
      personalNotes,
      referralSource,
      referrerName,
      estimatedMoveInTime,
      workSchedule,
      workScheduleOther,
      targetMoveInDate,
      companyID,
      leaseDuration,
      finalMoveInDate,
      agreedToPrivacy,
      agreedToCertification,
    ],
  );

  useEffect(() => {
    const payload = {
      ...buildDraftPayload(),
      applicationDraftAutosave: true,
    };
    const draftSignature = JSON.stringify({
      payload,
      documentPrechecks,
      idValidationResult,
    });

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      lastSavedApplicationDraftRef.current = draftSignature;
      return;
    }

    const canAutoSave = canAutoSaveApplicationDraft({
      currentStage,
      reservationId,
      applicationAccessAllowed,
      stageLocked: isStageLocked(3),
      applicationSubmitted,
      editingApplication,
      reservationStatus: reservationData?.status,
      paymentSubmitted,
      paymentApproved,
    });

    if (!canAutoSave) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setHasUnsavedApplicationChanges(false);
      return;
    }

    if (draftSignature === lastSavedApplicationDraftRef.current) return;

    setHasUnsavedApplicationChanges(true);
    setDraftRecoveryMessage("");

    if (typeof window !== "undefined" && window.localStorage) {
      const key = getApplicationDraftStorageKey(user?.firebaseUid, reservationId);
      if (key) {
        try {
          window.localStorage.setItem(
            key,
            JSON.stringify({
              userId: user?.firebaseUid || "",
              reservationId,
              savedAt: new Date().toISOString(),
              payload,
              documentPrechecks,
              idValidationResult,
            }),
          );
        } catch (error) {
          console.warn("Could not write local application draft backup:", error);
        }
      }
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (applicationDraftSaveClearTimerRef.current) {
      clearTimeout(applicationDraftSaveClearTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await updateReservationDraft(payload);
        const savedAt = new Date().toISOString();
        lastSavedApplicationDraftRef.current = draftSignature;
        setLastApplicationDraftSavedAt(savedAt);
        setHasUnsavedApplicationChanges(false);
        setSaveStatus("saved");
        applicationDraftSaveClearTimerRef.current = setTimeout(
          () => setSaveStatus(""),
          3000,
        );
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus("error");
        setHasUnsavedApplicationChanges(true);
        applicationDraftSaveClearTimerRef.current = setTimeout(
          () => setSaveStatus(""),
          6000,
        );
      }
    }, APPLICATION_DRAFT_AUTOSAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    applicationAccessAllowed,
    applicationSubmitted,
    buildDraftPayload,
    currentStage,
    documentPrechecks,
    editingApplication,
    idValidationResult,
    paymentApproved,
    paymentSubmitted,
    reservationData?.status,
    reservationId,
    user?.firebaseUid,
  ]);

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (applicationDraftSaveClearTimerRef.current) {
        clearTimeout(applicationDraftSaveClearTimerRef.current);
      }
    },
    [],
  );

  // ΓöÇΓöÇ Stage handler ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const focusFieldByDataKey = (fieldKey) => {
    if (!fieldKey || typeof document === "undefined") return false;

    const container = document.querySelector(`[data-field="${fieldKey}"]`);
    if (!container) return false;

    container.scrollIntoView({ behavior: "smooth", block: "center" });

    const focusTarget = container.matches(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    )
      ? container
      : container.querySelector(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus({ preventScroll: true });
    }

    return true;
  };

  const handleNextStage = async () => {
    clearTimeout(autoSaveTimerRef.current);
    try {
      if (currentStage === 1) {
        if (roomSelectionLocked) {
          setCurrentStage(2);
          return;
        }
        if (!reservationData?.room) {
          showNotification("Please select a room to continue.", "warning", 4000);
          return;
        }
        const effectiveDate =
          targetMoveInDate ||
          reservationData?.targetMoveInDate ||
          reservationData?.intendedMoveInDate;
        if (effectiveDate) {
          const dateValidation = validateTargetMoveInDate(effectiveDate);
          if (!dateValidation.valid) {
            showNotification(
              dateValidation.error ||
                "Intended move-in date must be at least 3 days from today (within 3 months).",
              "warning",
              4000,
            );
            return;
          }
        }
        setPendingStageAction("stage1");
        setShowStageConfirm(true);
        return;
      } else if (currentStage === 2) {
        if (viewingPreferenceStepAccess.readOnly) {
          if (applicationAccessAllowed) {
            setHighestStageReached((prev) => Math.max(prev, 3));
            setCurrentStage(3);
            return;
          }
          setHighestStageReached((prev) => Math.max(prev, 2));
          returnToDashboardForApplicationGate();
          return;
        }
        if (!applicationAccessAllowed) {
          setHighestStageReached((prev) => Math.max(prev, 2));
          returnToDashboardForApplicationGate();
          return;
        }

        setHighestStageReached((prev) => Math.max(prev, 3));
        setCurrentStage(3);
        return;
      } else if (currentStage === 3) {
        if (!applicationAccessAllowed) {
          returnToDashboardForApplicationGate();
          return;
        }

        if (isApplicationApproved) {
          const nextStage = paymentApproved ? 5 : 4;
          setHighestStageReached((prev) => Math.max(prev, nextStage));
          setCurrentStage(nextStage);
          return;
        }

        if (!devBypassValidation) {
          const hasText = (value) => Boolean(value?.trim?.() || value);
          // 09XXXXXXXXX format — matches backend normalization and new input constraint.
          const isValidPhone = (value) => validatePHPhoneLocal(value).valid;
          const cleanPhoneDigits = (num) => String(num || "").replace(/\D+/g, "");
          const isSamePhoneCheck = (a, b) => {
            const na = cleanPhoneDigits(a);
            const nb = cleanPhoneDigits(b);
            if (!na || !nb || na.length < 7 || nb.length < 7) return false;
            return na === nb || na.endsWith(nb) || nb.endsWith(na);
          };

          const isSelfEmergencyContact = isSamePhoneCheck(emergencyContactNumber, mobileNumber);

          const requiredFields = [
            { key: "billingEmail", label: "Billing Email", isMissing: !hasText(billingEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(billingEmail).trim()), message: "Please enter a valid billing email address to continue." },
            { key: "selfiePhoto", label: "Selfie Photo", isMissing: !selfiePhoto },
            { key: "lastName", label: "Last Name", isMissing: !hasText(lastName) || String(lastName).trim().length < 2, message: "Last name must be at least 2 characters." },
            { key: "firstName", label: "First Name", isMissing: !hasText(firstName) || String(firstName).trim().length < 2, message: "First name must be at least 2 characters." },
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
              message: "Please enter a valid birthday (at least 15 years old) to continue.",
            },
            { key: "gender", label: "Gender", isMissing: !hasText(gender) },
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
            { key: "validIDBack", label: "Valid ID (Back)", isMissing: !validIDBack },
            {
              key: "nbiClearance",
              label: "NBI Clearance",
              isMissing: !nbiClearance && !hasText(nbiReason),
              message: "Please upload NBI Clearance or provide a reason why it is not yet available.",
            },
            {
              key: "emergencyContactName",
              label: "Emergency Contact Name",
              isMissing: !hasText(emergencyContactName) || String(emergencyContactName).trim().length < 2,
              message: "Emergency contact name must be at least 2 characters.",
            },
            {
              key: "emergencyRelationship",
              label: "Emergency Relationship",
              isMissing: !hasText(emergencyRelationship),
            },
            {
              key: "emergencyContactNumber",
              label: "Emergency Contact Number",
              isMissing: !isValidPhone(emergencyContactNumber) || isSelfEmergencyContact,
              message: isSelfEmergencyContact
                ? "Emergency contact number cannot be the same as your personal mobile number."
                : "Please enter a valid emergency contact number to continue.",
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
              message: "Please upload Company ID or provide a reason why it is not yet available.",
            },
            { key: "referralSource", label: "Referral Source", isMissing: !hasText(referralSource) },
            {
              key: "referrerName",
              label: "Referrer Name",
              isMissing: referralSource === "friend" && !hasText(referrerName),
              message: "Please provide the name of the person who referred you.",
            },
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
            {
              key: "leaseDuration",
              label: "Duration of Lease",
              isMissing: !hasText(leaseDuration),
              message: "Please select a lease duration to continue.",
            },
            { key: "workSchedule", label: "Work Schedule", isMissing: !hasText(workSchedule) },
            {
              key: "workScheduleOther",
              label: "Work Schedule Details",
              isMissing:
                workSchedule === "others" && (!hasText(workScheduleOther) || String(workScheduleOther).trim().length < 5),
              message: "Please describe your work schedule (at least 5 characters) to continue.",
            },
          ];
          const firstInvalid = requiredFields.find((field) => field.isMissing);
          const missingAgreements = !agreedToPrivacy || !agreedToCertification;

          if (firstInvalid || missingAgreements) {
            setShowValidationErrors(true);

            if (firstInvalid) {
              setTimeout(() => {
                focusFieldByDataKey(firstInvalid.key);
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
                const checkbox = document.getElementById("privacy-consent");
                if (checkbox && typeof checkbox.focus === "function") {
                  checkbox.focus({ preventScroll: true });
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

        setPendingStageAction("submit_application");
        setShowStageConfirm(true);
        return;
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
      const documentIssues = error?.response?.data?.documentIssues;
      if (Array.isArray(documentIssues) && documentIssues.length > 0) {
        setShowValidationErrors(true);
        setDocumentPrechecks((previous) => {
          const next = { ...previous };
          documentIssues.forEach((issue) => {
            if (issue.key && next[issue.key]) {
              next[issue.key] = {
                ...normalizeDocumentPrecheckEntry(next[issue.key]),
                precheckStatus: issue.precheckStatus || "needs_reupload",
                readabilityStatus: issue.readabilityStatus || "unknown",
                documentTypeStatus: issue.documentTypeStatus || "unknown",
                canSubmit: false,
                applicantMessage: issue.message,
                summaryMessage: issue.message,
              };
            }
          });
          return next;
        });
      }
      showNotification(
        getFriendlyError(error, "Unable to process reservation. Please try again."),
        "error",
        5000,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevStage = async () => {
    if (currentStage === 1) {
      if (isFormDirty) setShowCancelConfirm(true);
      else navigate("/applicant/check-availability");
      return;
    }

    if (
      currentStage === 3 &&
      hasUnsavedApplicationChanges &&
      reservationId &&
      !isStageLocked(3)
    ) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      try {
        setSaveStatus("saving");
        const payload = {
          ...buildDraftPayload(),
          applicationDraftAutosave: true,
        };
        await updateReservationDraft(payload);
        lastSavedApplicationDraftRef.current = JSON.stringify({
          payload,
          documentPrechecks,
          idValidationResult,
        });
        setLastApplicationDraftSavedAt(new Date().toISOString());
        setHasUnsavedApplicationChanges(false);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 3000);
      } catch (err) {
        console.warn("Could not save application draft on navigating back:", err);
      }
    }

    setCurrentStage((prev) => Math.max(1, prev - 1));
  };

  const handleStageConfirm = async () => {
    setIsSubmittingApplication(true);
    try {
      if (pendingStageAction === "stage1") {
        if (!reservationId) {
          const draft = await createReservationDraft();
          if (!draft) {
            setIsSubmittingApplication(false);
            return;
          }
        } else {
          await updateReservationDraft({ roomConfirmed: true });
        }
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
        setShowStageConfirm(false);
        setPendingStageAction(null);
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
      } else if (pendingStageAction === "submit_application" || pendingStageAction === "stage3") {
        const selfiePhotoUrl = await uploadIfFile(selfiePhoto);
        const validIDFrontUrl = await uploadIfFile(validIDFront);
        const validIDBackUrl = await uploadIfFile(validIDBack);
        const nbiClearanceUrl = await uploadIfFile(nbiClearance);
        const companyIDUrl = await uploadIfFile(companyID);
        const applicationPayload = {
          firstName,
          lastName,
          middleName,
          nickname,
          mobileNumber,
          billingEmail,
          birthday,
          gender,
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
        };
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        if (applicationDraftSaveClearTimerRef.current) {
          clearTimeout(applicationDraftSaveClearTimerRef.current);
        }
        // First-time and re-submission both use the same dedicated endpoint
        await reservationApi.submitApplication(reservationId, applicationPayload);
        const draftKey = getApplicationDraftStorageKey(user?.firebaseUid, reservationId);
        if (draftKey && typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(draftKey);
        }
        lastSavedApplicationDraftRef.current = "";
        setHasUnsavedApplicationChanges(false);
        setSaveStatus("");
        setDraftRecoveryMessage("");
        setApplicationSubmitted(true);
        setEditingApplication(false);
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        await queryClient.invalidateQueries({ queryKey: ["users"] });
        setShowStageConfirm(false);
        setPendingStageAction(null);
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Application Submitted!",
            message: "Tenant application submitted successfully.",
          },
        });
      } else if (pendingStageAction === "stage4") {
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        setShowStageConfirm(false);
        setPendingStageAction(null);
        appNavigate("/applicant/profile", {
          flash: {
            type: "success",
            title: "Reservation Submitted!",
            message: "Reservation submitted successfully.",
          },
        });
      }
    } catch (error) {
      showNotification(
        error?.response?.data?.error ||
          error?.message ||
          "Unable to process reservation. Please try again.",
        "error",
        5000,
      );
    } finally {
      setIsSubmittingApplication(false);
    }
  };

  const isReservationConfirmed = useMemo(() => {
    const status = normalizeReservationStatus(
      reservationData?.reservationStatus || reservationData?.status || "",
    );
    return (
      Number(currentStage) === 5 ||
      hasReservationStatus(status, "reserved", "moveIn", "moveOut") ||
      Boolean(paymentApproved)
    );
  }, [currentStage, reservationData, paymentApproved]);

  const handleExitToDashboard = async () => {
    // If user is in Stage 3 and has unsaved application changes, flush immediately
    if (currentStage === 3 && hasUnsavedApplicationChanges && reservationId) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      try {
        setSaveStatus("saving");
        const payload = {
          ...buildDraftPayload(),
          applicationDraftAutosave: true,
        };
        await updateReservationDraft(payload);
        setLastApplicationDraftSavedAt(new Date().toISOString());
        setHasUnsavedApplicationChanges(false);
        setSaveStatus("saved");
      } catch (e) {
        console.warn("Could not flush draft on exit:", e);
      }
    }

    // If user is in Stage 2 with a viewing preference selected
    if (
      currentStage === 2 &&
      viewingType &&
      reservationId &&
      !viewingPreferenceStepAccess.readOnly
    ) {
      try {
        await updateReservationDraft({
          viewingPreference: viewingType,
          viewingType:
            viewingType === "physical_visit"
              ? "inperson"
              : viewingType === "remote_2d_viewing"
                ? "remote_2d"
                : viewingType === "urgent_move_in_review"
                  ? "urgent_move_in"
                  : viewingType,
          ...(viewingType === "physical_visit" ? { visitDate, visitTime } : {}),
        });
      } catch (e) {
        console.warn("Could not flush viewing preference draft on exit:", e);
      }
    }

    navigatingAwayRef.current = true;
    if (!isReservationConfirmed) {
      showNotification(
        "Your reservation progress has been saved. You can resume at any time from your Dashboard.",
        "success",
        3000,
      );
    }
    appNavigate("/applicant/profile", {
      state: { tab: "dashboard" },
    });
  };

  // ─── Return everything the page component needs ────────
  return {
    // Navigation
    navigate,
    user,

    // Core state
    reservationData,
    currentStage,
    setCurrentStage,
    highestStageReached, setHighestStageReached,
    isLoading,
    paymentReturnLoading,
    visitApproved,
    visitCompleted, setVisitCompleted,
    scheduleRejected,
    scheduleRejectionReason,
    applicationSubmitted,
    editingApplication,
    isApplicationApproved,
    paymentApproved,
    reservationId,
    devBypassValidation, setDevBypassValidation,
    payingOnline, setPayingOnline,
    successOverlay, setSuccessOverlay,

    // Stage 1
    targetMoveInDate, setTargetMoveInDate,
    leaseDuration, setLeaseDuration,
    billingEmail, setBillingEmail,
    userAccountEmail: user?.email || "",
    userProfilePhone: user?.phone || "",

    // Stage 2
    viewingType, setViewingType,
    remoteViewingAcknowledged, setRemoteViewingAcknowledged,
    remoteViewingQuestions, setRemoteViewingQuestions,
    isUrgentMoveIn, setIsUrgentMoveIn,
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
    gender, setGender,
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
    documentPrechecks,
    runningDocumentChecks,
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
    paymentAvailable: canReservationAccessPayment(
      normalizeReservationStatus(reservationData?.status),
    ),
    applicationReviewReason,
    agreedToFeePolicy, setAgreedToFeePolicy,

    // Stage 5
    reservationCode,
    visitCode, setVisitCode,
    isReservationConfirmed,

    // UI flags
    showLoginConfirm, setShowLoginConfirm,
    showCancelConfirm, setShowCancelConfirm,
    showStageConfirm,
    pendingStageAction,
    showValidationErrors,
    scrollToSection,
    saveStatus,
    saveStatusMessage: getApplicationSaveStatusText(
      saveStatus,
      lastApplicationDraftSavedAt,
    ),
    lastApplicationDraftSavedAt,
    hasUnsavedApplicationChanges,
    draftRecoveryMessage,
    isFormDirty,
    applicationAccessAllowed,
    physicalVisitApplicationLocked,
    roomSelectionLocked,
    viewingPreferenceStepAccess,

    // Stepper
    isStageLocked,
    isStageClickable,
    handleStepperClick,

    // Handlers
    handleNextStage,
    handlePrevStage,
    handleStageConfirm,
    validateApplicantIdDocument,
    runDocumentPrecheck,
    updateReservationDraft,
    updateStayPackage,
    returnToDashboardAfterViewingPreference,
    handleExitToDashboard,
    validateViewingPreferenceChange,
    forceEditMode,
    notifyRoomSelectionLocked,
    notifyViewingPreferenceLocked,
    setEditingApplication: handleSetEditingApplication,
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

    // Submit loading state (stage 3 upload + API)
    isSubmittingApplication,

    // Payment cancellation recovery
    paymentCancelled,
    setPaymentCancelled,
  };
}
