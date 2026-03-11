import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import { reservationApi, roomApi, billingApi } from "../../../shared/api/apiClient";
import GlobalLoading from "../../../shared/components/GlobalLoading";
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
  RESERVATION_STAGES,
  fileToBase64,
  ReservationStepper,
  RoomInfoBanner,
  LoginConfirmModal,
  CancelConfirmModal,
  StageConfirmModal,
} from "./reservation-flow";

// ─────────────────────────────────────────────────────────────
// ReservationFlowPage — orchestrator
// 1,956 lines → ~850 lines (state, data-loading, handlers, routing)
// Extracted: stepper, room banner, 3 modals, constants
// ─────────────────────────────────────────────────────────────
function ReservationFlowPage() {
  const navigate = useNavigate();
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

  // ── Core state ─────────────────────────────────────────────
  const [reservationData, setReservationData] = useState(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [highestStageReached, setHighestStageReached] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [visitApproved, setVisitApproved] = useState(false);
  const [visitCompleted, setVisitCompleted] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [editingApplication, setEditingApplication] = useState(false);
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [reservationId, setReservationId] = useState(null);
  const [devBypassValidation, setDevBypassValidation] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Stage 1
  const [targetMoveInDate, setTargetMoveInDate] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("12");
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
  const [maritalStatus, setMaritalStatus] = useState("single");
  const [nationality, setNationality] = useState("Filipino");
  const [educationLevel, setEducationLevel] = useState("college");
  const [addressUnitHouseNo, setAddressUnitHouseNo] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressBarangay, setAddressBarangay] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressProvince, setAddressProvince] = useState("");
  const [validIDFront, setValidIDFront] = useState(null);
  const [validIDBack, setValidIDBack] = useState(null);
  const [validIDType, setValidIDType] = useState("");
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

  // Stage 4
  const [finalMoveInDate, setFinalMoveInDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [proofOfPayment, setProofOfPayment] = useState(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  // Stage 5
  const [reservationCode, setReservationCode] = useState("");

  // UI state
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [pendingStageAction, setPendingStageAction] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState({
    targetMoveInDate: "",
    leaseDuration: "12",
    billingEmail: "",
  });
  const [saveStatus, setSaveStatus] = useState("");
  const autoSaveTimerRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  // ── Warn before leaving mid-flow ────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isFormDirty || currentStage > 1) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFormDirty, currentStage]);

  // ── Stepper locking ────────────────────────────────────────
  const isStageLocked = (stageId) => {
    if (paymentApproved) return stageId < 5;
    if (stageId === 1) return visitCompleted;
    if (stageId === 2) return visitApproved;
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
    // File URLs
    if (r.selfiePhotoUrl) setSelfiePhoto(r.selfiePhotoUrl);
    if (r.validIDFrontUrl) setValidIDFront(r.validIDFrontUrl);
    if (r.validIDBackUrl) setValidIDBack(r.validIDBackUrl);
    if (r.nbiClearanceUrl) setNbiClearance(r.nbiClearanceUrl);
    if (r.nbiReason) setNbiReason(r.nbiReason);
    if (r.companyIDUrl) setCompanyID(r.companyIDUrl);
    if (r.companyIDReason) setCompanyIDReason(r.companyIDReason);
    if (r.validIDType) setValidIDType(r.validIDType);
    if (r.agreedToPrivacy) setAgreedToPrivacy(r.agreedToPrivacy);
    if (r.agreedToCertification)
      setAgreedToCertification(r.agreedToCertification);
  };

  const computeLockingFlags = (r) => {
    const hasVisitScheduled = Boolean(r.viewingType && r.agreedToPrivacy);
    const isVisitApprovedFlag = Boolean(r.visitApproved === true);
    const hasApplication = Boolean(r.firstName && r.lastName && r.mobileNumber);
    const hasPayment = Boolean(r.proofOfPaymentUrl);
    const isConfirmed =
      r.reservationStatus === "confirmed" || r.paymentStatus === "paid";

    if (hasVisitScheduled) setVisitCompleted(true);
    if (isVisitApprovedFlag) setVisitApproved(true);
    if (hasApplication) setApplicationSubmitted(true);
    if (hasPayment) setPaymentSubmitted(true);
    if (isConfirmed) setPaymentApproved(true);

    let highest = 1;
    if (hasVisitScheduled) highest = 2;
    if (isVisitApprovedFlag) highest = 3;
    if (hasApplication) highest = Math.max(highest, 4);
    if (hasPayment) highest = Math.max(highest, 4);
    if (isConfirmed) highest = 5;

    return {
      hasVisitScheduled,
      isVisitApprovedFlag,
      hasApplication,
      hasPayment,
      isConfirmed,
      highest,
    };
  };

  // ── Data loading ───────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setShowLoginConfirm(true);
      return;
    }

    const continueReservation = location.state?.continueFlow;
    const editMode = location.state?.editMode;
    const resId = location.state?.reservationId;

    if ((continueReservation || editMode) && resId) {
      loadExistingReservation(resId);
    } else {
      const state = location.state?.roomData;
      if (state) {
        setReservationData(state);
      } else {
        const stored = sessionStorage.getItem("pendingReservation");
        if (stored) {
          setReservationData(JSON.parse(stored));
        } else if (isStepMode) {
          loadActiveReservation();
        } else {
          showNotification("No room selected. Redirecting...", "warning", 2000);
          setTimeout(() => navigate("/applicant/check-availability"), 2000);
        }
      }
    }

    if (!isStepMode && !continueReservation) {
      setTargetMoveInDate("");
      setFinalMoveInDate("");
    }
    setInitialFormState({
      targetMoveInDate: "",
      leaseDuration: "12",
      billingEmail: user?.email || "",
    });
    if (!continueReservation && stepOverride) setCurrentStage(stepOverride);

    // Handle PayMongo return for deposit payments
    const paymentStatus = new URLSearchParams(location.search).get("payment");
    const sessionId = new URLSearchParams(location.search).get("session_id");
    if (paymentStatus === "success" && sessionId) {
      billingApi.checkPaymentStatus(sessionId).then((result) => {
        if (result.status === "paid") {
          setPaymentSubmitted(true);
          setPaymentApproved(true);
          showNotification("Payment successful! Your reservation is confirmed.", "success", 5000);
          setCurrentStage(5);
          setHighestStageReached(5);
        } else {
          showNotification("Payment is being processed. Check your profile for updates.", "info", 5000);
        }
      }).catch(() => {
        showNotification("Could not verify payment. Please check your profile.", "warning", 5000);
      });
      // Clean URL params without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    } else if (paymentStatus === "cancelled") {
      showNotification("Payment was cancelled. You can try again.", "info", 3000);
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [user, navigate, location]);

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
        showNotification("No active reservation found.", "warning", 2000);
        setTimeout(() => navigate("/applicant/check-availability"), 2000);
        return;
      }
      const active = await reservationApi.getById(found._id);
      if (active) {
        const room = active.roomId || {};
        setReservationId(active._id);
        if (active.reservationCode) setReservationCode(active.reservationCode);
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
      showNotification("No room selected. Redirecting...", "warning", 2000);
      setTimeout(() => navigate("/applicant/check-availability"), 2000);
    }
  };

  const loadExistingReservation = async (resId) => {
    try {
      setIsLoading(true);
      const reservation = await reservationApi.getById(resId);
      setReservationId(reservation._id || resId);
      if (reservation.reservationCode)
        setReservationCode(reservation.reservationCode);
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

      let targetStage = 1;
      if (isConfirmed) targetStage = 5;
      else if (hasPayment) targetStage = 5;
      else if (hasApplication) targetStage = 4;
      else if (isVisitApprovedFlag) targetStage = 3;
      else if (hasVisitScheduled) {
        showNotification(
          "Waiting for admin to approve your visit. Track progress on your profile.",
          "info",
          3000,
        );
        navigate("/applicant/profile");
        return;
      }
      if (reservation.roomConfirmed && targetStage === 1) {
        targetStage = 2;
      }
      setHighestStageReached(
        Math.max(highest, targetStage === 2 ? 2 : highest),
      );
      if (stepOverride && stepOverride <= highest)
        setCurrentStage(stepOverride);
      else setCurrentStage(targetStage);
      showNotification(
        stepOverride
          ? "Editing your application. Make your changes and save."
          : "Reservation data loaded. Continue where you left off!",
        "success",
        3000,
      );
    } catch (err) {
      console.error("Error loading reservation:", err);
      const status = err?.response?.status;
      if (status === 404) {
        showNotification(
          "Reservation not found. It may have been removed or expired.",
          "error",
          3000,
        );
        navigate("/applicant/profile");
      } else if (status === 401 || status === 403) {
        showNotification(
          "Please sign in to continue your reservation.",
          "error",
          3000,
        );
        navigate("/signin");
      } else {
        showNotification("Failed to load reservation data", "error", 3000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Form change tracking (Stage 1) ─────────────────────────
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

  // ── API helpers ────────────────────────────────────────────
  const advanceStage = (nextStage, message) => {
    setHighestStageReached((prev) => Math.max(prev, nextStage));
    showNotification(
      message || "Step completed! Track your progress here.",
      "success",
      3000,
    );
    navigate("/applicant/profile");
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

  const getCheckInDate = () => targetMoveInDate || finalMoveInDate;
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
    const checkInDate = getCheckInDate();
    if (!checkInDate) {
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
        targetMoveInDate: getFieldValue(targetMoveInDate, checkInDate),
        leaseDuration: getFieldValue(leaseDuration, "12"),
        billingEmail: getFieldValue(
          billingEmail,
          user?.email || "test@example.com",
        ),
        checkInDate,
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
        try {
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

  // ── Auto-save (stages 3-4) ─────────────────────────────────
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
      address: {
        unitHouseNo: addressUnitHouseNo,
        street: addressStreet,
        barangay: addressBarangay,
        city: addressCity,
        province: addressProvince,
      },
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
      paymentMethod,
      finalMoveInDate,
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
      paymentMethod,
      finalMoveInDate,
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

  // ── Stage handler ──────────────────────────────────────────
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
        if (!devBypassValidation && (!visitDate || !visitTime)) {
          showNotification(
            "Please select a visit date and time",
            "error",
            3000,
          );
          return;
        }
        await updateReservationDraft({
          agreedToPrivacy: true,
          viewingType: "inperson",
          visitDate,
          visitTime,
        });
        setVisitCompleted(true);
        setHighestStageReached((prev) => Math.max(prev, 3));
        showNotification(
          "Visit booked! Track progress on your dashboard.",
          "success",
          4000,
        );
        navigate("/applicant/profile");
      } else if (currentStage === 3) {
        if (!devBypassValidation) {
          const inc = [];
          if (!selfiePhoto) inc.push("Email & Photo");
          if (
            !firstName ||
            !lastName ||
            !mobileNumber ||
            !birthday ||
            !addressCity ||
            !addressProvince ||
            !validIDFront ||
            !validIDBack ||
            (!nbiClearance && !nbiReason)
          )
            inc.push("Personal Information");
          if (
            !emergencyContactName ||
            !emergencyRelationship ||
            !emergencyContactNumber
          )
            inc.push("Emergency Contact");
          if (!occupation || (!companyID && !companyIDReason))
            inc.push("Employment / School");
          if (!targetMoveInDate || !estimatedMoveInTime || !workSchedule)
            inc.push("Dorm Preferences");
          if (!agreedToPrivacy || !agreedToCertification)
            inc.push("Agreements & Consent");
          if (inc.length > 0) {
            setShowValidationErrors(true);
            showNotification(
              `Please complete the ${inc[0]} section`,
              "error",
              3000,
            );
            return;
          }
        }
        const selfiePhotoUrl =
          selfiePhoto instanceof File
            ? await fileToBase64(selfiePhoto)
            : selfiePhoto;
        const validIDFrontUrl =
          validIDFront instanceof File
            ? await fileToBase64(validIDFront)
            : validIDFront;
        const validIDBackUrl =
          validIDBack instanceof File
            ? await fileToBase64(validIDBack)
            : validIDBack;
        const nbiClearanceUrl =
          nbiClearance instanceof File
            ? await fileToBase64(nbiClearance)
            : nbiClearance;
        const companyIDUrl =
          companyID instanceof File ? await fileToBase64(companyID) : companyID;
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
          agreedToPrivacy,
          agreedToCertification,
          selfiePhotoUrl,
          validIDFrontUrl,
          validIDBackUrl,
          nbiClearanceUrl,
          nbiReason,
          companyIDUrl,
          companyIDReason,
          validIDType,
        });
        setApplicationSubmitted(true);
        setEditingApplication(false);
        advanceStage(4, "Application submitted! Payment step is now unlocked.");
      } else if (currentStage === 4) {
        if (!proofOfPayment) {
          showNotification("Please upload proof of payment", "error", 3000);
          return;
        }
        const proofOfPaymentUrl = await fileToBase64(proofOfPayment);
        await updateReservationDraft({
          finalMoveInDate,
          paymentMethod,
          proofOfPaymentUrl,
        });
        setPaymentSubmitted(true);
        advanceStage(5, "Payment uploaded! Awaiting admin confirmation.");
      } else if (currentStage === 5) {
        navigate("/applicant/profile");
      }
    } catch (error) {
      showNotification(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to process reservation. Please try again.",
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
        showNotification(
          "Room confirmed! Continue from your dashboard to schedule a visit.",
          "success",
          3000,
        );
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        await queryClient.invalidateQueries({ queryKey: ["rooms"] });
        navigate("/applicant/profile");
      } else if (pendingStageAction === "stage4") {
        showNotification(
          "Reservation submitted successfully!",
          "success",
          3000,
        );
        await queryClient.invalidateQueries({ queryKey: ["reservations"] });
        navigate("/applicant/profile");
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

  // ── Loading ────────────────────────────────────────────────
  if (!reservationData) return <GlobalLoading />;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="reservation-flow-container">
      <LoginConfirmModal
        show={showLoginConfirm}
        onLogin={() => {
          setShowLoginConfirm(false);
          navigate("/signin");
        }}
        onDismiss={() => {
          setShowLoginConfirm(false);
          navigate("/applicant/check-availability");
        }}
      />
      <CancelConfirmModal
        show={showCancelConfirm}
        onConfirm={() => {
          setShowCancelConfirm(false);
          navigate("/applicant/check-availability");
        }}
        onDismiss={() => setShowCancelConfirm(false)}
      />
      <StageConfirmModal
        show={showStageConfirm}
        pendingAction={pendingStageAction}
        onConfirm={handleStageConfirm}
        onCancel={() => {
          setShowStageConfirm(false);
          setPendingStageAction(null);
        }}
      />

      <div className="reservation-layout">
        {/* Breadcrumb */}
        <nav className="rf-breadcrumb">
          <button
            className="rf-breadcrumb-link"
            onClick={() => navigate("/applicant/profile")}
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
          currentStage={currentStage}
          isStageClickable={isStageClickable}
          isStageLocked={isStageLocked}
          onStepperClick={handleStepperClick}
        />
        <RoomInfoBanner room={reservationData?.room} />

        <main className="reservation-main">
          {currentStage === 1 && (
            <ReservationSummaryStep
              reservationData={reservationData}
              onNext={handleNextStage}
              readOnly={isStageLocked(1)}
            />
          )}

          {currentStage === 2 && (
            <ReservationVisitStep
              {...{
                targetMoveInDate,
                viewingType,
                setViewingType,
                isOutOfTown,
                setIsOutOfTown,
                currentLocation,
                setCurrentLocation,
                visitApproved,
                visitorName,
                setVisitorName,
                visitorPhone,
                setVisitorPhone,
                visitorEmail,
                setVisitorEmail,
                visitDate,
                setVisitDate,
                visitTime,
                setVisitTime,
                reservationData,
                reservationCode,
              }}
              onPrev={handlePrevStage}
              onNext={handleNextStage}
              readOnly={isStageLocked(2)}
            />
          )}

          {currentStage === 3 &&
            (visitApproved ? (
              <ReservationApplicationStep
                {...{
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
                  companyID,
                  setCompanyID,
                  companyIDReason,
                  setCompanyIDReason,
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
                  leaseDuration,
                  setLeaseDuration,
                  estimatedMoveInTime,
                  setEstimatedMoveInTime,
                  workSchedule,
                  setWorkSchedule,
                  workScheduleOther,
                  setWorkScheduleOther,
                  agreedToPrivacy,
                  setAgreedToPrivacy,
                  agreedToCertification,
                  setAgreedToCertification,
                  personalNotes,
                  setPersonalNotes,
                  devBypassValidation,
                  setDevBypassValidation,
                  saveStatus,
                  showValidationErrors,
                  applicationSubmitted,
                  paymentApproved,
                }}
                onPrev={() => navigate("/applicant/profile")}
                onNext={() => handleNextStage()}
                readOnly={isStageLocked(3)}
                onEditApplication={() => setEditingApplication(true)}
              />
            ) : (
              <div className="reservation-card">
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: "56px", marginBottom: "16px" }}>
                    ⏳
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
                    onClick={() => navigate("/applicant/profile")}
                    className="btn btn-primary"
                    style={{ maxWidth: "280px", margin: "0 auto" }}
                  >
                    Go to Profile
                  </button>
                </div>
              </div>
            ))}

          {currentStage === 4 && (
            <ReservationPaymentStep
              {...{
                reservationData,
                leaseDuration,
                finalMoveInDate,
                setFinalMoveInDate,
                paymentMethod,
                setPaymentMethod,
                proofOfPayment,
                setProofOfPayment,
                isLoading,
                payingOnline,
              }}
              onMoveInDateUpdate={() =>
                showNotification(
                  "Move-in date updated. Availability will be checked.",
                  "info",
                  2000,
                )
              }
              onPrev={handlePrevStage}
              onNext={handleNextStage}
              onPayOnline={async () => {
                if (!reservationId) {
                  showNotification("Reservation not found. Please try again.", "error", 3000);
                  return;
                }
                try {
                  setPayingOnline(true);
                  // Save move-in date before redirecting
                  if (finalMoveInDate) {
                    await updateReservationDraft({ finalMoveInDate });
                  }
                  const { checkoutUrl } = await billingApi.createDepositCheckout(reservationId);
                  window.location.href = checkoutUrl;
                } catch (error) {
                  console.error("Failed to create deposit checkout:", error);
                  showNotification(
                    error?.message || "Failed to start online payment. Try again.",
                    "error",
                    3000,
                  );
                  setPayingOnline(false);
                }
              }}
              readOnly={isStageLocked(4)}
            />
          )}

          {currentStage === 5 && (
            <ReservationConfirmationStep
              {...{
                reservationCode,
                reservationData,
                paymentMethod,
                visitDate,
                visitTime,
                leaseDuration,
              }}
              finalMoveInDate={finalMoveInDate || targetMoveInDate}
              applicantName={`${firstName} ${lastName}`.trim()}
              applicantEmail={billingEmail}
              applicantPhone={mobileNumber}
              onViewDetails={() => navigate("/applicant/profile")}
              onReturnHome={() => navigate("/")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default ReservationFlowPage;
