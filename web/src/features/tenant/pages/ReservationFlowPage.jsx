import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import { reservationApi, roomApi } from "../../../shared/api/apiClient";
import GlobalLoading from "../../../shared/components/GlobalLoading";
import "../../../shared/styles/notification.css";
import "../styles/reservation-flow.css";
import ReservationSummaryStep from "./reservation-steps/ReservationSummaryStep";
import ReservationVisitStep from "./reservation-steps/ReservationVisitStep";
import ReservationApplicationStep from "./reservation-steps/ReservationApplicationStep";
import ReservationPaymentStep from "./reservation-steps/ReservationPaymentStep";
import ReservationConfirmationStep from "./reservation-steps/ReservationConfirmationStep";

// Helper function to convert File to base64 data URL
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

const RESERVATION_STAGES = [
  {
    id: 1,
    label: "Room Selection",
    desc: "Review and confirm your chosen room",
    category: "Getting Started",
  },
  {
    id: 2,
    label: "Visit & Policies",
    desc: "Schedule a visit and review dormitory policies",
    category: "Verification",
  },
  {
    id: 3,
    label: "Tenant Application",
    desc: "Submit personal details and required documents",
    category: "Verification",
  },
  {
    id: 4,
    label: "Payment",
    desc: "Upload proof of reservation fee payment",
    category: "Finalization",
  },
  {
    id: 5,
    label: "Confirmation",
    desc: "Reservation confirmed and ready for move-in",
    category: "Finalization",
  },
];

function ReservationFlowPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
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

  // Room data
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

  // DEV MODE: Bypass validation
  const [devBypassValidation, setDevBypassValidation] = useState(false);

  /**
   * Stepper locking logic:
   * - Room Selection: locked (read-only) after visit is scheduled
   * - Visit & Policies: locked after visit is completed/approved
   * - Tenant Application: locked only after payment is approved
   * - Payment: locked after payment approved
   * - Confirmation: never locked
   */
  const isStageLocked = (stageId) => {
    if (paymentApproved) return stageId < 5; // All locked after payment approved
    if (stageId === 1) return visitCompleted; // Room locked after visit is completed/scheduled
    if (stageId === 2) return visitApproved; // Visit locked after admin approves it
    if (stageId === 3) return applicationSubmitted && !editingApplication;
    if (stageId === 4) return paymentSubmitted || paymentApproved; // Payment locked after submitted or approved
    return false;
  };

  const isStageClickable = (stageId) => {
    // Allow navigating to any stage up to highest reached
    if (stageId <= highestStageReached) return true;
    // Allow payment step if application was submitted
    if (stageId === 4 && applicationSubmitted) return true;
    // Allow confirmation step if payment was submitted
    if (stageId === 5 && paymentSubmitted) return true;
    return false;
  };

  const handleStepperClick = (stageId) => {
    if (!isStageClickable(stageId)) return;
    setCurrentStage(stageId);
  };

  // Stage 1: Summary
  const [targetMoveInDate, setTargetMoveInDate] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("12"); // months
  const [billingEmail, setBillingEmail] = useState(user?.email || "");

  // Stage 2: Visit
  const [viewingType, setViewingType] = useState("inperson");
  const [isOutOfTown, setIsOutOfTown] = useState(false);
  const [currentLocation, setCurrentLocation] = useState("");
  // Stage 2: Visit Booking Form
  const [visitorName, setVisitorName] = useState(user?.displayName || "");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState(user?.email || "");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");

  // Stage 3: Details - Photo Upload
  const [selfiePhoto, setSelfiePhoto] = useState(null);

  // Stage 3: Details - Personal Information
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

  // Stage 3: Details - Emergency Information
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [healthConcerns, setHealthConcerns] = useState("");

  // Stage 3: Details - Employment Information
  const [employerSchool, setEmployerSchool] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [employerContact, setEmployerContact] = useState("");
  const [startDate, setStartDate] = useState("");
  const [occupation, setOccupation] = useState("");
  const [companyID, setCompanyID] = useState(null);
  const [companyIDReason, setCompanyIDReason] = useState("");
  const [previousEmployment, setPreviousEmployment] = useState("");

  // Stage 3: Details - Dorm Related Questions
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

  // Stage 4: Payment
  const [finalMoveInDate, setFinalMoveInDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [proofOfPayment, setProofOfPayment] = useState(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  // Stage 5: Success
  const [reservationCode, setReservationCode] = useState("");

  // Confirmation Modals
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Form change tracking
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [initialFormState, setInitialFormState] = useState({
    targetMoveInDate: "",
    leaseDuration: "12",
    billingEmail: "",
  });

  useEffect(() => {
    if (!user) {
      setShowLoginConfirm(true);
      return;
    }

    // Check if continuing existing reservation from ProfilePage
    const continueReservation = location.state?.continueFlow;
    const editMode = location.state?.editMode;
    const reservationId = location.state?.reservationId;

    if ((continueReservation || editMode) && reservationId) {
      loadExistingReservation(reservationId);
    } else {
      // Get reservation data from navigation state or session storage
      const state = location.state?.roomData;
      if (state) {
        setReservationData(state);
      } else {
        const stored = sessionStorage.getItem("pendingReservation");
        if (stored) {
          setReservationData(JSON.parse(stored));
        } else if (isStepMode) {
          // Coming from dashboard with ?step= — try loading active reservation
          (async () => {
            try {
              // Step 1: Lightweight getAll to find active reservation ID
              const all = await reservationApi.getAll();
              const list = Array.isArray(all)
                ? all
                : all?.reservations || all?.data || [];
              const found = list.find(
                (r) =>
                  r.status !== "cancelled" &&
                  r.status !== "archived" &&
                  !r.isArchived,
              );
              if (!found) {
                showNotification(
                  "No active reservation found.",
                  "warning",
                  2000,
                );
                setTimeout(
                  () => navigate("/applicant/check-availability"),
                  2000,
                );
                return;
              }
              // Step 2: Fetch full data (including images) via getById
              const active = await reservationApi.getById(found._id);
              if (active) {
                const room = active.roomId || {};
                setReservationId(active._id);
                if (active.reservationCode)
                  setReservationCode(active.reservationCode);
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
                if (active.visitDate)
                  setVisitDate(active.visitDate.split("T")[0]);
                if (active.visitTime) setVisitTime(active.visitTime);
                if (active.viewingType) setViewingType(active.viewingType);
                if (active.visitApproved) setVisitApproved(true);

                // Set ALL locking flags from loaded reservation
                const hasVisitScheduled = Boolean(
                  active.viewingType && active.agreedToPrivacy,
                );
                const isVisitApproved = Boolean(active.visitApproved === true);
                const hasApplication = Boolean(
                  active.firstName && active.lastName && active.mobileNumber,
                );
                const hasPayment = Boolean(active.proofOfPaymentUrl);
                const isConfirmed =
                  active.reservationStatus === "confirmed" ||
                  active.paymentStatus === "paid";

                if (hasVisitScheduled) setVisitCompleted(true);
                if (isVisitApproved) setVisitApproved(true);
                if (hasApplication) setApplicationSubmitted(true);
                if (isConfirmed) setPaymentApproved(true);

                // Set highest stage reached
                let highest = 1;
                if (hasVisitScheduled) highest = 2;
                if (isVisitApproved) highest = 3;
                if (hasApplication) highest = Math.max(highest, 4);
                if (hasPayment) highest = Math.max(highest, 4);
                if (isConfirmed) highest = 5;
                setHighestStageReached(highest);

                // Restore application data
                if (active.firstName) setFirstName(active.firstName);
                if (active.lastName) setLastName(active.lastName);
                if (active.middleName) setMiddleName(active.middleName);
                if (active.nickname) setNickname(active.nickname);
                if (active.mobileNumber) setMobileNumber(active.mobileNumber);
                // Birthday: DB stores as ISO Date, input needs YYYY-MM-DD
                if (active.birthday) {
                  const bday = new Date(active.birthday);
                  if (!isNaN(bday.getTime()))
                    setBirthday(bday.toISOString().split("T")[0]);
                }
                if (active.maritalStatus)
                  setMaritalStatus(active.maritalStatus);
                if (active.nationality) setNationality(active.nationality);
                if (active.educationLevel)
                  setEducationLevel(active.educationLevel);
                // Address — nested object in DB
                if (active.address) {
                  setAddressUnitHouseNo(active.address.unitHouseNo || "");
                  setAddressStreet(active.address.street || "");
                  setAddressBarangay(active.address.barangay || "");
                  setAddressCity(active.address.city || "");
                  setAddressProvince(active.address.province || "");
                }
                // Emergency Contact — nested object in DB
                if (active.emergencyContact?.name)
                  setEmergencyContactName(active.emergencyContact.name);
                if (active.emergencyContact?.relationship)
                  setEmergencyRelationship(
                    active.emergencyContact.relationship,
                  );
                if (active.emergencyContact?.contactNumber)
                  setEmergencyContactNumber(
                    active.emergencyContact.contactNumber,
                  );
                if (active.healthConcerns)
                  setHealthConcerns(active.healthConcerns);
                // Employment — nested object in DB
                if (active.employment?.employerSchool)
                  setEmployerSchool(active.employment.employerSchool);
                if (active.employment?.employerAddress)
                  setEmployerAddress(active.employment.employerAddress);
                if (active.employment?.employerContact)
                  setEmployerContact(active.employment.employerContact);
                // startDate: DB stores as ISO Date, input needs YYYY-MM-DD
                if (active.employment?.startDate) {
                  const sd = new Date(active.employment.startDate);
                  if (!isNaN(sd.getTime()))
                    setStartDate(sd.toISOString().split("T")[0]);
                }
                if (active.employment?.occupation)
                  setOccupation(active.employment.occupation);
                if (active.employment?.previousEmployment)
                  setPreviousEmployment(active.employment.previousEmployment);
                if (active.referralSource)
                  setReferralSource(active.referralSource);
                if (active.referrerName) setReferrerName(active.referrerName);
                if (active.estimatedMoveInTime)
                  setEstimatedMoveInTime(active.estimatedMoveInTime);
                if (active.workSchedule) setWorkSchedule(active.workSchedule);
                if (active.workScheduleOther)
                  setWorkScheduleOther(active.workScheduleOther);
                if (active.targetMoveInDate)
                  setTargetMoveInDate(
                    active.targetMoveInDate.split?.("T")?.[0] ||
                      active.targetMoveInDate,
                  );
                if (active.leaseDuration)
                  setLeaseDuration(String(active.leaseDuration));
                // roomType: DB stores as preferredRoomType
                if (active.preferredRoomType)
                  setRoomType(active.preferredRoomType);

                // Payment locking
                if (hasPayment) setPaymentSubmitted(true);

                // Restore file URLs
                if (active.selfiePhotoUrl)
                  setSelfiePhoto(active.selfiePhotoUrl);
                if (active.validIDFrontUrl)
                  setValidIDFront(active.validIDFrontUrl);
                if (active.validIDBackUrl)
                  setValidIDBack(active.validIDBackUrl);
                if (active.nbiClearanceUrl)
                  setNbiClearance(active.nbiClearanceUrl);
                if (active.nbiReason) setNbiReason(active.nbiReason);
                if (active.companyIDUrl) setCompanyID(active.companyIDUrl);
                if (active.companyIDReason)
                  setCompanyIDReason(active.companyIDReason);
                if (active.validIDType) setValidIDType(active.validIDType);
                if (active.agreedToPrivacy)
                  setAgreedToPrivacy(active.agreedToPrivacy);
                if (active.agreedToCertification)
                  setAgreedToCertification(active.agreedToCertification);
              }
            } catch (err) {
              console.error("Failed to load reservation:", err);
              showNotification(
                "No room selected. Redirecting...",
                "warning",
                2000,
              );
              setTimeout(() => navigate("/applicant/check-availability"), 2000);
            }
          })();
        } else {
          showNotification("No room selected. Redirecting...", "warning", 2000);
          setTimeout(() => navigate("/applicant/check-availability"), 2000);
        }
      }
    }

    // Only reset dates if NOT loading from an existing reservation
    if (!isStepMode && !continueReservation) {
      setTargetMoveInDate("");
      setFinalMoveInDate("");
    }

    // Set initial form state for change tracking
    setInitialFormState({
      targetMoveInDate: "",
      leaseDuration: "12",
      billingEmail: user?.email || "",
    });

    if (!continueReservation && stepOverride) {
      setCurrentStage(stepOverride);
    }
  }, [user, navigate, location]);

  // Load existing reservation data to continue flow
  const loadExistingReservation = async (reservationId) => {
    try {
      setIsLoading(true);
      const reservation = await reservationApi.getById(reservationId);
      setReservationId(reservation._id || reservationId);
      if (reservation.reservationCode) {
        setReservationCode(reservation.reservationCode);
      }

      // Set reservation data from existing reservation
      setReservationData({
        room: reservation.roomId,
        selectedBed: reservation.selectedBed,
        appliances: reservation.selectedAppliances || [],
      });

      // Populate all form fields from existing reservation
      // Dates: DB stores as ISO Date strings, inputs need YYYY-MM-DD
      if (reservation.targetMoveInDate) {
        const d = new Date(reservation.targetMoveInDate);
        if (!isNaN(d.getTime()))
          setTargetMoveInDate(d.toISOString().split("T")[0]);
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

      if (reservation.firstName) setFirstName(reservation.firstName);
      if (reservation.lastName) setLastName(reservation.lastName);
      if (reservation.middleName) setMiddleName(reservation.middleName);
      if (reservation.nickname) setNickname(reservation.nickname);
      if (reservation.mobileNumber) setMobileNumber(reservation.mobileNumber);
      // Birthday: DB stores as Date ISO string, input needs YYYY-MM-DD
      if (reservation.birthday) {
        const bday = new Date(reservation.birthday);
        if (!isNaN(bday.getTime())) {
          setBirthday(bday.toISOString().split("T")[0]);
        }
      }
      if (reservation.maritalStatus)
        setMaritalStatus(reservation.maritalStatus);
      if (reservation.nationality) setNationality(reservation.nationality);
      if (reservation.educationLevel)
        setEducationLevel(reservation.educationLevel);

      // Address — stored as nested object in DB
      if (reservation.address?.unitHouseNo)
        setAddressUnitHouseNo(reservation.address.unitHouseNo);
      if (reservation.address?.street)
        setAddressStreet(reservation.address.street);
      if (reservation.address?.barangay)
        setAddressBarangay(reservation.address.barangay);
      if (reservation.address?.city) setAddressCity(reservation.address.city);
      if (reservation.address?.province)
        setAddressProvince(reservation.address.province);

      // Emergency Contact — stored as nested object in DB
      if (reservation.emergencyContact?.name)
        setEmergencyContactName(reservation.emergencyContact.name);
      if (reservation.emergencyContact?.relationship)
        setEmergencyRelationship(reservation.emergencyContact.relationship);
      if (reservation.emergencyContact?.contactNumber)
        setEmergencyContactNumber(reservation.emergencyContact.contactNumber);
      if (reservation.healthConcerns)
        setHealthConcerns(reservation.healthConcerns);

      // Employment — stored as nested object in DB
      if (reservation.employment?.employerSchool)
        setEmployerSchool(reservation.employment.employerSchool);
      if (reservation.employment?.employerAddress)
        setEmployerAddress(reservation.employment.employerAddress);
      if (reservation.employment?.employerContact)
        setEmployerContact(reservation.employment.employerContact);
      if (reservation.employment?.startDate) {
        const sd = new Date(reservation.employment.startDate);
        if (!isNaN(sd.getTime())) {
          setStartDate(sd.toISOString().split("T")[0]);
        }
      }
      if (reservation.employment?.occupation)
        setOccupation(reservation.employment.occupation);
      if (reservation.employment?.previousEmployment)
        setPreviousEmployment(reservation.employment.previousEmployment);

      // roomType: DB stores as 'preferredRoomType'
      if (reservation.preferredRoomType)
        setRoomType(reservation.preferredRoomType);
      if (reservation.preferredRoomNumber)
        setPreferredRoomNumber(reservation.preferredRoomNumber);
      if (reservation.referralSource)
        setReferralSource(reservation.referralSource);
      if (reservation.referrerName) setReferrerName(reservation.referrerName);
      if (reservation.estimatedMoveInTime)
        setEstimatedMoveInTime(reservation.estimatedMoveInTime);
      if (reservation.workSchedule) setWorkSchedule(reservation.workSchedule);
      if (reservation.workScheduleOther)
        setWorkScheduleOther(reservation.workScheduleOther);

      // Restore file URLs
      if (reservation.selfiePhotoUrl)
        setSelfiePhoto(reservation.selfiePhotoUrl);
      if (reservation.validIDFrontUrl)
        setValidIDFront(reservation.validIDFrontUrl);
      if (reservation.validIDBackUrl)
        setValidIDBack(reservation.validIDBackUrl);
      if (reservation.nbiClearanceUrl)
        setNbiClearance(reservation.nbiClearanceUrl);
      if (reservation.nbiReason) setNbiReason(reservation.nbiReason);
      if (reservation.companyIDUrl) setCompanyID(reservation.companyIDUrl);
      if (reservation.companyIDReason)
        setCompanyIDReason(reservation.companyIDReason);
      if (reservation.validIDType) setValidIDType(reservation.validIDType);
      if (reservation.agreedToPrivacy)
        setAgreedToPrivacy(reservation.agreedToPrivacy);
      if (reservation.agreedToCertification)
        setAgreedToCertification(reservation.agreedToCertification);

      // Determine which stage to start at based on reservation status
      const hasVisitScheduled = Boolean(
        reservation.viewingType && reservation.agreedToPrivacy,
      );
      const isVisitApproved = Boolean(reservation.visitApproved === true);
      const hasApplication = Boolean(
        reservation.firstName &&
        reservation.lastName &&
        reservation.mobileNumber,
      );
      const hasPayment = Boolean(reservation.proofOfPaymentUrl);
      const isConfirmed =
        reservation.reservationStatus === "confirmed" ||
        reservation.paymentStatus === "paid";

      // Set locking flags based on loaded data
      if (hasVisitScheduled) setVisitCompleted(true);
      if (isVisitApproved) setVisitApproved(true);
      if (hasApplication) setApplicationSubmitted(true);
      if (hasPayment) setPaymentSubmitted(true);
      if (isConfirmed) setPaymentApproved(true);

      if (isConfirmed) {
        setCurrentStage(5);
        setHighestStageReached(5);
      } else if (hasPayment) {
        setCurrentStage(5);
        setHighestStageReached(5);
      } else if (hasApplication) {
        setCurrentStage(4);
        setHighestStageReached(4);
      } else if (isVisitApproved) {
        setCurrentStage(3);
        setHighestStageReached(3);
      } else if (hasVisitScheduled) {
        // Visit scheduled but not approved — redirect to profile
        showNotification(
          "Waiting for admin to approve your visit. Track progress on your profile.",
          "info",
          3000,
        );
        navigate("/applicant/profile");
        return;
      } else {
        setCurrentStage(2);
        setHighestStageReached(2);
      }

      if (stepOverride) {
        setCurrentStage(stepOverride);
      }

      const message = stepOverride
        ? "Editing your application. Make your changes and save."
        : "Reservation data loaded. Continue where you left off!";
      showNotification(message, "success", 3000);
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

  // Track form changes (only for Stage 1)
  useEffect(() => {
    if (currentStage === 1) {
      const hasChanges =
        targetMoveInDate !== initialFormState.targetMoveInDate ||
        leaseDuration !== initialFormState.leaseDuration ||
        billingEmail !== initialFormState.billingEmail;
      setIsFormDirty(hasChanges);
    }
  }, [
    targetMoveInDate,
    leaseDuration,
    billingEmail,
    initialFormState,
    currentStage,
  ]);

  const advanceStage = (nextStage, message) => {
    const msg = message || "Step completed! Track your progress here.";
    setHighestStageReached((prev) => Math.max(prev, nextStage));
    showNotification(msg, "success", 3000);
    navigate("/applicant/profile");
  };

  const getFieldValue = (value, defaultValue = "") => {
    return devBypassValidation && !value ? defaultValue : value;
  };

  const normalizeRoomName = (room) => {
    const raw = room?.id || room?.name || room?.roomNumber || room?.title;
    if (!raw) return "";
    return String(raw)
      .replace(/^Room\s+/i, "")
      .trim();
  };

  const resolveRoomId = async () => {
    const room = reservationData?.room;
    console.log("[ReservationFlow] Resolving room ID, room data:", room);

    // Try direct MongoDB _id or roomId
    const directId = room?._id || room?.roomId;
    if (directId) {
      console.log("[ReservationFlow] Found direct room ID:", directId);
      return directId;
    }

    // Fallback: match by name/roomNumber against all rooms
    const roomName = normalizeRoomName(room);
    if (!roomName) {
      console.error("[ReservationFlow] No room name to match");
      return null;
    }

    console.log("[ReservationFlow] Looking up room by name:", roomName);
    const rooms = await roomApi.getAll();
    const matchedRoom = rooms.find(
      (r) =>
        r.name === roomName ||
        r.roomNumber === roomName ||
        r.name?.toLowerCase() === roomName.toLowerCase() ||
        r.roomNumber?.toLowerCase() === roomName.toLowerCase(),
    );

    console.log(
      "[ReservationFlow] Matched room:",
      matchedRoom?._id || "NOT FOUND",
    );
    return matchedRoom?._id || null;
  };

  const getCheckInDate = () => {
    return targetMoveInDate || finalMoveInDate;
  };

  const getTotalPrice = () => {
    return (
      Number(reservationData?.room?.price || 0) +
      Number(reservationData?.applianceFees || 0)
    );
  };

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
        visitApproved: false,
        ...payloadOverrides,
      });

      const createdReservation = response?.reservation || response;
      const createdId = response?.reservationId || createdReservation?._id;
      if (createdId) {
        setReservationId(createdId);
      }
      if (createdReservation?.reservationCode) {
        setReservationCode(createdReservation.reservationCode);
      }

      return createdReservation;
    } catch (error) {
      // If user already has an active reservation, reuse its ID instead of failing
      const existingId = error?.response?.data?.existingReservationId;
      if (
        error?.response?.data?.code === "RESERVATION_ALREADY_EXISTS" &&
        existingId
      ) {
        console.log(
          "[ReservationFlow] Reusing existing reservation:",
          existingId,
        );
        setReservationId(existingId);
        // Load the existing reservation data
        try {
          const existing = await reservationApi.getById(existingId);
          if (existing?.reservationCode) {
            setReservationCode(existing.reservationCode);
          }
          return existing;
        } catch (loadErr) {
          console.error("Failed to load existing reservation:", loadErr);
        }
        return { _id: existingId };
      }
      // Re-throw other errors
      throw error;
    }
  };

  const updateReservationDraft = async (payloadOverrides = {}) => {
    if (!reservationId) {
      return createReservationDraft(payloadOverrides);
    }

    const response = await reservationApi.updateByUser(
      reservationId,
      payloadOverrides,
    );
    return response?.reservation || response;
  };

  // ── Auto-save for all reservation sections ──────────────────────
  const [saveStatus, setSaveStatus] = useState(""); // "", "saving", "saved", "error"
  const autoSaveTimerRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  // Build full draft payload (all text/select fields, NO file attachments)
  const buildDraftPayload = useCallback(
    () => ({
      // Visit (Stage 2)
      visitDate,
      visitTime,
      viewingType,
      visitorName,
      visitorPhone,
      visitorEmail,
      // Application (Stage 3)
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
      // Payment (Stage 4)
      paymentMethod,
      finalMoveInDate,
    }),
    [
      // Visit
      visitDate,
      visitTime,
      viewingType,
      visitorName,
      visitorPhone,
      visitorEmail,
      // Application
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
      // Payment
      paymentMethod,
      finalMoveInDate,
    ],
  );

  // Debounced auto-save effect — runs on stages 2, 3, 4
  useEffect(() => {
    // Skip first render (initial load)
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    // Only auto-save on stages 2-4 with an active reservation that isn't locked
    if (currentStage < 2 || currentStage > 4) return;
    if (!reservationId || isStageLocked(currentStage)) return;

    // Clear previous timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer — save after 3 seconds of inactivity
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
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [buildDraftPayload, currentStage, reservationId]);

  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [pendingStageAction, setPendingStageAction] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const handleNextStage = async () => {
    try {
      // Stage 1: Room Selection - show confirmation
      if (currentStage === 1) {
        if (!reservationData?.room) {
          showNotification("Please select a room to continue", "error", 3000);
          return;
        }
        setPendingStageAction("stage1");
        setShowStageConfirm(true);
        return;
      }
      // Stage 2: Visit Scheduling & Policies
      else if (currentStage === 2) {
        if (!devBypassValidation && (!visitDate || !visitTime)) {
          showNotification(
            "Please select a visit date and time",
            "error",
            3000,
          );
          return;
        }
        // Save visit data
        const visitPayload = {
          agreedToPrivacy: true,
          viewingType: "inperson",
          visitDate,
          visitTime,
        };
        await updateReservationDraft(visitPayload);
        setVisitCompleted(true);
        setHighestStageReached((prev) => Math.max(prev, 3));
        // Redirect to profile — visit is booked, admin verifies on-site
        showNotification(
          "Visit booked! Track progress on your dashboard.",
          "success",
          4000,
        );
        navigate("/applicant/profile");
      }
      // Stage 3: Application
      else if (currentStage === 3) {
        if (!devBypassValidation) {
          // Validate by section
          const incompleteSections = [];

          if (!selfiePhoto) incompleteSections.push("Email & Photo");

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
            incompleteSections.push("Personal Information");

          if (
            !emergencyContactName ||
            !emergencyRelationship ||
            !emergencyContactNumber
          )
            incompleteSections.push("Emergency Contact");

          if (!occupation || (!companyID && !companyIDReason))
            incompleteSections.push("Employment / School");

          if (!targetMoveInDate || !estimatedMoveInTime || !workSchedule)
            incompleteSections.push("Dorm Preferences");

          if (!agreedToPrivacy || !agreedToCertification)
            incompleteSections.push("Agreements & Consent");

          if (incompleteSections.length > 0) {
            setShowValidationErrors(true);
            showNotification(
              `Please complete the ${incompleteSections[0]} section`,
              "error",
              3000,
            );
            return;
          }
        }
        // Convert file uploads to base64 for persistence
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

        // Save application data — flatten address for backend controller
        const applicationPayload = {
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
        };
        await updateReservationDraft(applicationPayload);
        setApplicationSubmitted(true);
        setEditingApplication(false);
        advanceStage(4, "Application submitted! Payment step is now unlocked.");
      }
      // Stage 4: Payment
      else if (currentStage === 4) {
        if (!proofOfPayment) {
          showNotification("Please upload proof of payment", "error", 3000);
          return;
        }
        // Convert file to base64 data URL
        const proofOfPaymentUrl = await fileToBase64(proofOfPayment);
        // Save payment data
        const paymentPayload = {
          finalMoveInDate,
          paymentMethod,
          proofOfPaymentUrl,
        };
        await updateReservationDraft(paymentPayload);
        setPaymentSubmitted(true);
        advanceStage(5, "Payment uploaded! Awaiting admin confirmation.");
      }
      // Stage 5: Confirmation - done
      else if (currentStage === 5) {
        navigate("/applicant/profile");
      }
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to process reservation. Please try again.";
      showNotification(message, "error", 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevStage = async () => {
    if (currentStage === 1) {
      // At stage 1, go back to room selection
      if (isFormDirty) {
        setShowCancelConfirm(true);
      } else {
        navigate("/applicant/check-availability");
      }
    } else {
      // Save draft before going back
      if (reservationId && !isStageLocked(currentStage)) {
        try {
          setSaveStatus("saving");
          await updateReservationDraft(buildDraftPayload());
          setSaveStatus("saved");
          showNotification("Progress saved", "success", 2000);
          setTimeout(() => setSaveStatus(""), 3000);
        } catch (err) {
          console.error("Save on back failed:", err);
          showNotification("Could not save progress", "warning", 2000);
        }
      }
      // Go to the previous step
      setCurrentStage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleCancelConfirmed = () => {
    setShowCancelConfirm(false);
    navigate("/applicant/check-availability");
  };

  const handleCancelDismissed = () => {
    setShowCancelConfirm(false);
  };

  const handleLoginConfirmed = () => {
    setShowLoginConfirm(false);
    navigate("/signin");
  };

  const handleLoginDismissed = () => {
    setShowLoginConfirm(false);
    navigate("/applicant/check-availability");
  };

  // Login Confirmation Modal Component
  const LoginConfirmModal = () => {
    if (!showLoginConfirm) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "400px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔐</div>
          <h2
            style={{
              marginBottom: "12px",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            Login Required
          </h2>
          <p style={{ marginBottom: "24px", color: "#666", lineHeight: "1.6" }}>
            You need to be logged in to complete your reservation. Your
            reservation data will be saved.
          </p>
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "center" }}
          >
            <button
              onClick={handleLoginDismissed}
              style={{
                padding: "10px 24px",
                border: "2px solid #ddd",
                background: "white",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
                color: "#333",
              }}
            >
              Go Back
            </button>
            <button
              onClick={handleLoginConfirmed}
              style={{
                padding: "10px 24px",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Cancel Confirmation Modal Component
  const CancelConfirmModal = () => {
    if (!showCancelConfirm) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "400px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <h2
            style={{
              marginBottom: "12px",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            Discard Changes?
          </h2>
          <p style={{ marginBottom: "24px", color: "#666", lineHeight: "1.6" }}>
            Are you sure you want to go back? Your current progress will be lost
            and you'll need to start over.
          </p>
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "center" }}
          >
            <button
              onClick={handleCancelDismissed}
              style={{
                padding: "10px 24px",
                border: "2px solid #ddd",
                background: "white",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
                color: "#333",
              }}
            >
              Continue
            </button>
            <button
              onClick={handleCancelConfirmed}
              style={{
                padding: "10px 24px",
                background: "#FF6B6B",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Stage Confirmation Handler
  const handleStageConfirm = async () => {
    setShowStageConfirm(false);
    try {
      if (pendingStageAction === "stage1") {
        // Create reservation draft in DB (only if not already created)
        if (!reservationId) {
          const draft = await createReservationDraft();
          if (!draft) return;
        }
        // Advance to Step 2 inline (no redirect)
        setCurrentStage(2);
        showNotification(
          "Room confirmed! Now schedule your visit.",
          "success",
          3000,
        );
      } else if (pendingStageAction === "stage4") {
        // Reservation stays as "pending" until admin confirms
        showNotification(
          "Reservation submitted successfully!",
          "success",
          3000,
        );
        navigate("/applicant/profile");
      }
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to process reservation. Please try again.";
      showNotification(message, "error", 3000);
    }
    setPendingStageAction(null);
  };

  // Stage Confirmation Modal Component
  const StageConfirmModal = () => {
    if (!showStageConfirm) return null;

    const isStage1 = pendingStageAction === "stage1";
    const title = isStage1
      ? "Confirm Room Selection"
      : "Confirm Reservation Submission";
    const message = isStage1
      ? "Are you sure you want to proceed with this room selection? A reservation draft will be created."
      : "Are you sure you want to submit your reservation? Once submitted, you will need to wait for admin confirmation.";
    const icon = isStage1 ? "🏠" : "✅";

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            padding: "32px",
            maxWidth: "400px",
            width: "90%",
            boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#FEF3C7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "24px",
            }}
          >
            {icon}
          </div>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#1F2937",
              margin: "0 0 8px",
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "#6B7280",
              margin: "0 0 24px",
              lineHeight: "1.5",
            }}
          >
            {message}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => {
                setShowStageConfirm(false);
                setPendingStageAction(null);
              }}
              style={{
                flex: 1,
                padding: "12px",
                background: "#F3F4F6",
                color: "#374151",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "500",
                fontSize: "14px",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleStageConfirm}
              style={{
                flex: 1,
                padding: "12px",
                background: "#E7710F",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
              }}
            >
              Yes, Proceed
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleMoveInDateUpdate = () => {
    const tomorrow = new Date(finalMoveInDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFinalMoveInDate(tomorrow.toISOString().slice(0, 16));
  };

  if (!reservationData) {
    return <GlobalLoading />;
  }

  const currentStageIndex = RESERVATION_STAGES.findIndex(
    (s) => s.id === currentStage,
  );
  const progressPercent =
    (Math.max(currentStageIndex, 0) / (RESERVATION_STAGES.length - 1)) * 100;

  // Group stages by category for the progress tracker
  const categories = [];
  let lastCategory = null;
  RESERVATION_STAGES.forEach((stage) => {
    if (stage.category !== lastCategory) {
      categories.push({ label: stage.category, stages: [stage] });
      lastCategory = stage.category;
    } else {
      categories[categories.length - 1].stages.push(stage);
    }
  });

  return (
    <div className="reservation-flow-container">
      {/* Login Confirmation Modal */}
      <LoginConfirmModal />

      {/* Cancel Confirmation Modal */}
      <CancelConfirmModal />

      {/* Stage Confirmation Modal */}
      <StageConfirmModal />

      <div className="reservation-layout">
        {/* ======= MINIMAL PROGRESS STEPPER ======= */}
        <div className="rf-stepper">
          <div className="rf-stepper-track">
            {RESERVATION_STAGES.map((stage, index) => {
              const isDone =
                stage.id < highestStageReached || stage.id < currentStage;
              const isActive = stage.id === currentStage;
              const clickable = isStageClickable(stage.id);
              const locked = isStageLocked(stage.id);
              const stepClass = isActive ? "active" : isDone ? "done" : "";
              const isLast = index === RESERVATION_STAGES.length - 1;
              return (
                <div key={stage.id} style={{ display: "contents" }}>
                  <div
                    className={`rf-stepper-step ${stepClass}`}
                    onClick={() => clickable && handleStepperClick(stage.id)}
                    style={{
                      cursor: clickable ? "pointer" : "default",
                      opacity: !clickable && !isDone ? 0.5 : 1,
                    }}
                    title={
                      locked
                        ? `${stage.label} (Read-only)`
                        : clickable
                          ? `Go to ${stage.label}`
                          : stage.label
                    }
                  >
                    <div className="rf-stepper-dot">
                      {isDone ? (
                        locked ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <span className="rf-stepper-label">
                      {stage.label}
                      {locked && isDone && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#9CA3AF",
                            display: "block",
                          }}
                        >
                          Read-only
                        </span>
                      )}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`rf-stepper-line ${isDone ? "done" : ""}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ======= ROOM INFO BANNER ======= */}
        {reservationData?.room && (
          <div className="rf-room-banner">
            <div className="rf-room-banner-icon">🏠</div>
            <div className="rf-room-banner-info">
              <div className="rf-room-banner-name">
                {reservationData.room.title ||
                  reservationData.room.name ||
                  reservationData.room.id ||
                  "Room"}
              </div>
              <div className="rf-room-banner-meta">
                <span>
                  📍{" "}
                  {reservationData.room.branch
                    ? reservationData.room.branch.charAt(0).toUpperCase() +
                      reservationData.room.branch.slice(1)
                    : "Branch"}
                </span>
                <span>
                  🏷️{" "}
                  {reservationData.room.type
                    ? reservationData.room.type.charAt(0).toUpperCase() +
                      reservationData.room.type.slice(1)
                    : "Type"}
                </span>
              </div>
            </div>
            <div className="rf-room-banner-price">
              ₱{Number(reservationData.room.price || 0).toLocaleString()}
              <small> /mo</small>
            </div>
          </div>
        )}

        {/* ======= MAIN CONTENT ======= */}
        <main className="reservation-main">
          {/* Stage 1: Room Selection & Summary */}
          {currentStage === 1 && (
            <ReservationSummaryStep
              reservationData={reservationData}
              onNext={handleNextStage}
              readOnly={isStageLocked(1)}
            />
          )}

          {/* Stage 2: Visit Scheduling & Policies */}
          {currentStage === 2 && (
            <ReservationVisitStep
              targetMoveInDate={targetMoveInDate}
              viewingType={viewingType}
              setViewingType={setViewingType}
              isOutOfTown={isOutOfTown}
              setIsOutOfTown={setIsOutOfTown}
              currentLocation={currentLocation}
              setCurrentLocation={setCurrentLocation}
              visitApproved={visitApproved}
              onPrev={handlePrevStage}
              onNext={handleNextStage}
              visitorName={visitorName}
              setVisitorName={setVisitorName}
              visitorPhone={visitorPhone}
              setVisitorPhone={setVisitorPhone}
              visitorEmail={visitorEmail}
              setVisitorEmail={setVisitorEmail}
              visitDate={visitDate}
              setVisitDate={setVisitDate}
              visitTime={visitTime}
              setVisitTime={setVisitTime}
              reservationData={reservationData}
              reservationCode={reservationCode}
              readOnly={isStageLocked(2)}
            />
          )}

          {/* Stage 3: Tenant Application */}
          {currentStage === 3 &&
            (visitApproved ? (
              <ReservationApplicationStep
                billingEmail={billingEmail}
                selfiePhoto={selfiePhoto}
                setSelfiePhoto={setSelfiePhoto}
                lastName={lastName}
                setLastName={setLastName}
                firstName={firstName}
                setFirstName={setFirstName}
                middleName={middleName}
                setMiddleName={setMiddleName}
                nickname={nickname}
                setNickname={setNickname}
                mobileNumber={mobileNumber}
                setMobileNumber={setMobileNumber}
                birthday={birthday}
                setBirthday={setBirthday}
                maritalStatus={maritalStatus}
                setMaritalStatus={setMaritalStatus}
                nationality={nationality}
                setNationality={setNationality}
                educationLevel={educationLevel}
                setEducationLevel={setEducationLevel}
                addressUnitHouseNo={addressUnitHouseNo}
                setAddressUnitHouseNo={setAddressUnitHouseNo}
                addressStreet={addressStreet}
                setAddressStreet={setAddressStreet}
                addressBarangay={addressBarangay}
                setAddressBarangay={setAddressBarangay}
                addressCity={addressCity}
                setAddressCity={setAddressCity}
                addressProvince={addressProvince}
                setAddressProvince={setAddressProvince}
                validIDFront={validIDFront}
                setValidIDFront={setValidIDFront}
                validIDBack={validIDBack}
                setValidIDBack={setValidIDBack}
                nbiClearance={nbiClearance}
                setNbiClearance={setNbiClearance}
                nbiReason={nbiReason}
                setNbiReason={setNbiReason}
                companyID={companyID}
                setCompanyID={setCompanyID}
                companyIDReason={companyIDReason}
                setCompanyIDReason={setCompanyIDReason}
                emergencyContactName={emergencyContactName}
                setEmergencyContactName={setEmergencyContactName}
                emergencyRelationship={emergencyRelationship}
                setEmergencyRelationship={setEmergencyRelationship}
                emergencyContactNumber={emergencyContactNumber}
                setEmergencyContactNumber={setEmergencyContactNumber}
                healthConcerns={healthConcerns}
                setHealthConcerns={setHealthConcerns}
                employerSchool={employerSchool}
                setEmployerSchool={setEmployerSchool}
                employerAddress={employerAddress}
                setEmployerAddress={setEmployerAddress}
                employerContact={employerContact}
                setEmployerContact={setEmployerContact}
                startDate={startDate}
                setStartDate={setStartDate}
                occupation={occupation}
                setOccupation={setOccupation}
                previousEmployment={previousEmployment}
                setPreviousEmployment={setPreviousEmployment}
                preferredRoomNumber={preferredRoomNumber}
                setPreferredRoomNumber={setPreferredRoomNumber}
                referralSource={referralSource}
                setReferralSource={setReferralSource}
                referrerName={referrerName}
                setReferrerName={setReferrerName}
                targetMoveInDate={targetMoveInDate}
                setTargetMoveInDate={setTargetMoveInDate}
                leaseDuration={leaseDuration}
                setLeaseDuration={setLeaseDuration}
                estimatedMoveInTime={estimatedMoveInTime}
                setEstimatedMoveInTime={setEstimatedMoveInTime}
                workSchedule={workSchedule}
                setWorkSchedule={setWorkSchedule}
                workScheduleOther={workScheduleOther}
                setWorkScheduleOther={setWorkScheduleOther}
                agreedToPrivacy={agreedToPrivacy}
                setAgreedToPrivacy={setAgreedToPrivacy}
                agreedToCertification={agreedToCertification}
                setAgreedToCertification={setAgreedToCertification}
                personalNotes={personalNotes}
                setPersonalNotes={setPersonalNotes}
                devBypassValidation={devBypassValidation}
                setDevBypassValidation={setDevBypassValidation}
                onPrev={() => navigate("/applicant/profile")}
                onNext={() => handleNextStage()}
                readOnly={isStageLocked(3)}
                saveStatus={saveStatus}
                showValidationErrors={showValidationErrors}
                applicationSubmitted={applicationSubmitted}
                paymentApproved={paymentApproved}
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

          {/* Stage 4: Payment */}
          {currentStage === 4 && (
            <ReservationPaymentStep
              reservationData={reservationData}
              leaseDuration={leaseDuration}
              finalMoveInDate={finalMoveInDate}
              setFinalMoveInDate={setFinalMoveInDate}
              onMoveInDateUpdate={() => {
                showNotification(
                  "Move-in date updated. Availability will be checked.",
                  "info",
                  2000,
                );
              }}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              proofOfPayment={proofOfPayment}
              setProofOfPayment={setProofOfPayment}
              isLoading={isLoading}
              onPrev={handlePrevStage}
              onNext={handleNextStage}
              readOnly={isStageLocked(4)}
            />
          )}

          {/* Stage 5: Confirmation */}
          {currentStage === 5 && (
            <ReservationConfirmationStep
              reservationCode={reservationCode}
              reservationData={reservationData}
              finalMoveInDate={finalMoveInDate || targetMoveInDate}
              leaseDuration={leaseDuration}
              paymentMethod={paymentMethod}
              applicantName={`${firstName} ${lastName}`.trim()}
              applicantEmail={billingEmail}
              applicantPhone={mobileNumber}
              visitDate={visitDate}
              visitTime={visitTime}
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
