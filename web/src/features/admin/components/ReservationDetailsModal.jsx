import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Calendar, Camera, CheckCircle, ClipboardList, CreditCard, Eye, FileText, Image as ImageIcon, Info, Loader2, Maximize2, Receipt, User, XCircle, Zap } from "lucide-react";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { reservationApi } from "../../../shared/api/apiClient";
import { SUBMETER_BRANCHES } from "../../../shared/utils/constants";
import { useUtilityLatestReading } from "../../../shared/hooks/queries/useUtility";
import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";
import getFriendlyError from "../../../shared/utils/friendlyError";
import {
  getAllowedReservationActions,
  getReservationStatusAppearance,
  isReservationMoveInReady,
  normalizeReservationStatus,
  readMoveInDate,
} from "../../../shared/utils/lifecycleNaming";
import {
  fmtDate as sharedFmtDate,
  fmtDateTime as sharedFmtDateTime,
  fmtTime as sharedFmtTime,
} from "../../../shared/utils/dateFormat";
import { showNotification } from "../../../shared/utils/notification";
import { resolveReservationApprovalPricingGate } from "../utils/reservationPricingGate";
import { resolveApplicantPhotoUrl } from "../utils/applicantPhotoResolution";
import { formatSubmittedAddress } from "../utils/reservationAddressFormat";
import {
  formatPaymentStatus,
  getPaymentStatusBadgeConfig,
  formatRoomType,
  formatPhpCurrency,
  resolveReservationFeeStatus,
  resolveMoveInPaymentStatus,
} from "../utils/reservationFormatters";
import ProfileAvatar from "../../../shared/components/ProfileAvatar";
import { resolveApplianceBreakdown } from "../../tenant/utils/roomDetailsPricing.js";
import { getThumbnailUrl, getImageFallbackUrl } from "../../../shared/utils/imageOptimizer";
import "../styles/reservation-details-modal.css";

 const ACTION_MSGS = {
  moveIn: {
    title: "Move In Tenant",
    message:
      "Record move-in for this tenant? They'll be promoted to Tenant role with full system access.",
    confirmText: "Yes, Move In",
    variant: "success",
  },
  cancel: {
    title: "Cancel Reservation",
    message:
      "This will permanently remove the reservation. The reservation fee is non-refundable, and the bed will be released.",
    confirmText: "Cancel Reservation",
    variant: "danger",
  },
  approveCancellation: {
    title: "Approve Cancellation Request",
    message:
      "Approving will cancel the reservation and release the bed. The reservation fee is non-refundable.",
    confirmText: "Approve & Cancel",
    variant: "danger",
  },
  rejectCancellation: {
    title: "Reject Cancellation Request",
    message:
      "The cancellation request will be dismissed. The reservation stays active.",
    confirmText: "Reject Request",
    variant: "info",
  },
  approveForPayment: {
    title: "Approve for Payment",
    message:
      "This confirms the tenant's application and documents are approved. Payment will be unlocked for the applicant.",
    confirmText: "Approve for Payment",
    variant: "success",
  },
 requestRevision: {
 title: "Request Revision",
 message:
 "This keeps payment locked and asks the applicant to correct their application or documents.",
 confirmText: "Request Revision",
 variant: "info",
 },
 rejectApplication: {
    title: "Reject Application",
    message:
      "This rejects the application and keeps payment locked.",
    confirmText: "Reject Application",
    variant: "danger",
  },
};

const ACTION_LOADING_MSGS = {
  moveIn: "Processing Move-In...",
  cancel: "Cancelling Reservation...",
  approveCancellation: "Approving Cancellation...",
  rejectCancellation: "Rejecting Cancellation...",
  approveForPayment: "Approving Application...",
  requestRevision: "Sending Revision Request...",
  rejectApplication: "Rejecting Application...",
  extend: "Saving Reschedule...",
};

const getQuickActionsEmptyState = (status, isMovedOut) => {
  const normStatus = normalizeReservationStatus(status);
  if (normStatus === "moveIn" || normStatus === "checked-in") {
    return {
      Icon: CheckCircle,
      iconColor: "#059669",
      bgColor: "#ECFDF5",
      borderColor: "#A7F3D0",
      title: "Tenant Move In",
      desc: "This tenant has completed move-in. Occupancy, room stay details, and utility billing are actively managed under Tenancy & Rooms.",
    };
  }
  if (normStatus === "moveOut" || isMovedOut) {
    return {
      Icon: CheckCircle,
      iconColor: "#475569",
      bgColor: "#F8FAFC",
      borderColor: "#E2E8F0",
      title: "Tenant Checked Out",
      desc: "This tenant's stay has ended and they have checked out of the room.",
    };
  }
  if (normStatus === "cancelled") {
    return {
      Icon: Info,
      iconColor: "#DC2626",
      bgColor: "#FEF2F2",
      borderColor: "#FCA5A5",
      title: "Reservation Cancelled",
      desc: "This reservation is cancelled. The assigned bed has been released and no further admin actions are required.",
    };
  }
  if (normStatus === "rejected") {
    return {
      Icon: Info,
      iconColor: "#DC2626",
      bgColor: "#FEF2F2",
      borderColor: "#FCA5A5",
      title: "Application Rejected",
      desc: "This application was rejected. No further admin actions are required.",
    };
  }
  if (normStatus === "approved_for_payment") {
    return {
      Icon: Info,
      iconColor: "#2563EB",
      bgColor: "#EFF6FF",
      borderColor: "#BFDBFE",
      title: "Awaiting Tenant Payment",
      desc: "Application approved. Waiting for the applicant to settle their reservation payment.",
    };
  }
  if (normStatus === "payment_pending") {
    return {
      Icon: Info,
      iconColor: "#D97706",
      bgColor: "#FFFBEB",
      borderColor: "#FDE68A",
      title: "Payment Processing",
      desc: "Payment has been submitted and is awaiting settlement confirmation from the gateway.",
    };
  }
  return {
    Icon: Info,
    iconColor: "#475569",
    bgColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    title: "No Quick Actions Available",
    desc: "There are no pending quick actions required for this reservation stage.",
  };
};

const fmt = (value) =>
 value === null || value === undefined || value === "" ? "\u2014" : value;

const fmtDate = sharedFmtDate;
const fmtDateTime = sharedFmtDateTime;
const fmtTime = sharedFmtTime;

const safeFmtTime = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /AM|PM/i.test(value)) return value;
  const res = fmtTime(value);
  return res === "\u2014" || res === "—" ? null : res;
};

const toDateInputValue = (value) => {
 if (!value) return "";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "";
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, "0");
 const day = String(date.getDate()).padStart(2, "0");
 return `${year}-${month}-${day}`;
};

const isSafeDocumentUrl = (url) =>
 /^https:\/\//i.test(String(url || "").trim());

const isTemporaryLocalUrl = (url) =>
 /^(file|content|blob):/i.test(String(url || "").trim());

const formatSelectedBed = (selectedBed) => {
 if (!selectedBed) return "\u2014";
 const position = selectedBed.position
 ? `${String(selectedBed.position).charAt(0).toUpperCase()}${String(selectedBed.position).slice(1)}`
 : "Bed";
 return `${position}${selectedBed.id ? ` (${selectedBed.id})` : ""}`;
};

const VISIT_STATUS_CONFIG = {
  schedule_approved: {
    label: "Schedule Approved",
    color: "#047857",
    bg: "transparent",
    dot: "#10B981",
  },
  physical_visit_scheduled: {
    label: "Physical Visit Scheduled",
    color: "#B45309",
    bg: "transparent",
    dot: "#F59E0B",
  },
  visit_completed: {
    label: "Visit Completed",
    color: "#047857",
    bg: "transparent",
    dot: "#10B981",
  },
  no_show: {
    label: "No-Show",
    color: "#B45309",
    bg: "transparent",
    dot: "#F59E0B",
  },
  rescheduled: {
    label: "Rescheduled",
    color: "#B45309",
    bg: "transparent",
    dot: "#F59E0B",
  },
  visit_cancelled: {
    label: "Visit Cancelled",
    color: "#B91C1C",
    bg: "transparent",
    dot: "#EF4444",
  },
  allowed_without_visit: {
    label: "Allowed to Proceed Without Visit",
    color: "#0F766E",
    bg: "transparent",
    dot: "#14B8A6",
  },
};

const hasPhysicalVisit = (reservation) =>
 reservation?.viewingPreference === "physical_visit" ||
 reservation?.viewingType === "inperson" ||
 Boolean(reservation?.visitDate);

const getVisitStatusKey = (reservation) => {
 const explicit = String(reservation?.visitStatus || "")
 .trim()
 .toLowerCase()
 .replace(/^cancelled$/, "visit_cancelled")
 .replace(/^canceled$/, "visit_cancelled");
 if (VISIT_STATUS_CONFIG[explicit]) return explicit;
 if (reservation?.scheduleRejected) return "visit_cancelled";
 if (reservation?.visitApproved) return "visit_completed";
 if (reservation?.scheduleApproved) return "schedule_approved";
 if (hasPhysicalVisit(reservation)) return "physical_visit_scheduled";
 return "";
};

const normalizeVisitHistoryStatus = (status) => {
 const normalized = String(status || "").trim().toLowerCase();
 if (normalized === "completed") return "visit_completed";
 if (normalized === "approved") return "schedule_approved";
 if (normalized === "cancelled" || normalized === "canceled") return "visit_cancelled";
 return normalized;
};

const formatVisitSchedule = (date, time) => {
 const dateLabel = fmtDate(date);
 return `${dateLabel}${time ? ` at ${time}` : ""}`;
};

const getVisitHistoryTitle = (entry) => {
 const status = normalizeVisitHistoryStatus(entry?.status);
 return (
  VISIT_STATUS_CONFIG[status]?.label ||
  (status === "no_show"
    ? "No-Show"
    : status === "allowed_without_visit"
      ? "Allowed to Proceed Without Visit"
      : "Visit Updated")
 );
};

const getVisitHistoryScheduleLines = (entry) => {
 const status = normalizeVisitHistoryStatus(entry?.status);
 const currentSchedule = formatVisitSchedule(entry?.visitDate, entry?.visitTime);
 const nextSchedule = formatVisitSchedule(
  entry?.rescheduledToDate,
  entry?.rescheduledToTime,
 );

 if (status === "rescheduled") {
  const lines = [{ label: "Changed from:", value: currentSchedule }];
  if (entry?.rescheduledToDate || entry?.rescheduledToTime) {
   lines.push({ label: "Changed to:", value: nextSchedule });
  }
  return lines;
 }

 if (status === "visit_completed") {
  return [{ label: "Completed visit scheduled for:", value: currentSchedule }];
 }

 if (status === "schedule_approved" || status === "physical_visit_scheduled") {
  return [{ label: "Scheduled for:", value: currentSchedule }];
 }

 if (status === "no_show") {
  return [{ label: "No-show recorded for:", value: currentSchedule }];
 }

 if (status === "visit_cancelled") {
  return [{ label: "Cancelled visit scheduled for:", value: currentSchedule }];
 }

 if (status === "allowed_without_visit") {
  return entry?.visitDate || entry?.visitTime
   ? [{ label: "Visit requirement waived for:", value: currentSchedule }]
   : [{ label: "Visit requirement:", value: "Waived by admin" }];
 }

 return [{ label: "Visit schedule:", value: currentSchedule }];
};

const openImage = (url, title, options = {}) => {
 if (!url) {
 showNotification("No file available", "error");
 return;
 }
 if (options.requireHttps && !isSafeDocumentUrl(url)) {
 showNotification("This file link is invalid or temporary. Ask the applicant to re-upload the document.", "error");
 return;
 }
 if (!options.requireHttps && isTemporaryLocalUrl(url)) {
 showNotification("This file link is invalid or temporary.", "error");
 return;
 }

 const preview = window.open("", "_blank");
 preview?.document.write(
 `<html><head><title>${title}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#111;"><img src="${url}" style="max-width:100%;max-height:100vh;object-fit:contain;" alt="${title}"/></body></html>`,
 );
};

const buildDocs = (reservation) => [
 {
 label: "Selfie Photo",
 url: reservation.selfiePhotoUrl,
 precheck: reservation.documentPrechecks?.selfiePhoto,
 },
 {
 label: `Valid ID Front${reservation.validIDType ? ` (${reservation.validIDType})` : ""}`,
 url: reservation.validIDFrontUrl,
 precheck: reservation.documentPrechecks?.validIDFront,
 },
 {
 label: "Valid ID Back",
 url: reservation.validIDBackUrl,
 precheck: reservation.documentPrechecks?.validIDBack,
 },
 {
 label: "NBI Clearance",
 url: reservation.nbiClearanceUrl,
 reason: reservation.nbiReason,
 precheck: reservation.documentPrechecks?.nbiClearance,
 },
 {
 label: "Company/School ID",
 url: reservation.companyIDUrl,
 reason: reservation.companyIDReason,
 precheck: reservation.documentPrechecks?.companyID,
 },
];

const getPrecheckAppearance = (precheck) => {
 const precheckStatus = String(precheck?.precheckStatus || "").toLowerCase();
 if (precheckStatus === "ready_for_submission") {
 return { label: "Ready for Submission", color: "#047857", bg: "#D1FAE5" };
 }
 if (precheckStatus === "checking") {
 return { label: "Checking", color: "#1D4ED8", bg: "#DBEAFE" };
 }
 if (
 precheckStatus === "needs_reupload" &&
 precheck?.documentTypeStatus === "possible_mismatch"
 ) {
 return { label: "Check Document Type", color: "#B45309", bg: "#FEF3C7" };
 }
 if (precheckStatus === "needs_reupload") {
 return { label: "Needs Clearer Upload", color: "#B91C1C", bg: "#FEE2E2" };
 }
 if (precheckStatus === "manual_review_fallback") {
 return { label: "Manual Review Required", color: "#B45309", bg: "#FEF3C7" };
 }

 const status = String(precheck?.aiCheckStatus || "not_checked").toLowerCase();
 if (status === "passed") {
 return { label: "Ready for Submission", color: "#047857", bg: "#D1FAE5" };
 }
 if (status === "checking") {
 return { label: "Checking", color: "#1D4ED8", bg: "#DBEAFE" };
 }
 if (status === "warning") {
 return { label: "Check Document Type", color: "#B45309", bg: "#FEF3C7" };
 }
 if (status === "failed") {
 return { label: "Needs Clearer Upload", color: "#B91C1C", bg: "#FEE2E2" };
 }
 if (status === "error") {
 return { label: "Manual Review Required", color: "#B45309", bg: "#FEF3C7" };
 }
 return null;
};

const PERSONAL_FIELDS = (reservation) => [
 ["First Name", fmt(reservation.firstName || reservation.userId?.firstName)],
 ["Last Name", fmt(reservation.lastName || reservation.userId?.lastName)],
 ["Middle Name", fmt(reservation.middleName)],
 ["Nickname", fmt(reservation.nickname)],
 ["Birthday", fmtDate(reservation.birthday)],
 ["Marital Status", fmt(reservation.maritalStatus)],
 ["Nationality", fmt(reservation.nationality)],
 ["Education", fmt(reservation.educationLevel)],
 ["Address", fmt(formatSubmittedAddress(reservation.address))],
 ["Phone", fmt(reservation.phone || reservation.mobileNumber)],
];

const getInitials = (name) => {
 const initials = String(name || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean)
 .slice(0, 2)
 .map((part) => part.charAt(0).toUpperCase())
 .join("");

 return initials || "GU";
};

const STAGE_GUIDANCE = {
 pending: {
 Icon: Calendar,
 message: "Waiting for the tenant to select a viewing preference.",
 },
 viewing_preference_selected: {
 Icon: Eye,
 message:
 "Viewing preference recorded. Waiting for the tenant to submit the application and required documents.",
 },
  visit_pending: {
  Icon: Eye,
  message:
  "Physical visit is pending schedule approval or completion. Payment remains locked.",
  },
  visit_approved: {
  Icon: ClipboardList,
  message:
  "Visit schedule is approved or the visit requirement has been cleared. Waiting for the tenant application.",
  },
 pending_application_review: {
 Icon: ClipboardList,
 message:
 "Application and documents are under review. Payment remains locked until admin approval.",
 },
 needs_revision: {
 Icon: ClipboardList,
 message:
 "Application needs corrections. Payment stays locked until the tenant resubmits and admin approves it.",
 },
  approved_for_payment: {
    Icon: CreditCard,
    message:
      "Application approved. The applicant can now proceed to pay the reservation fee to lock their room.",
  },
 rejected: {
 Icon: ClipboardList,
 message:
 "Application rejected. Payment stays locked unless the reservation is reopened.",
 },
 payment_pending: {
 Icon: CreditCard,
 message:
 "Payment submitted and awaiting automatic verification from the payment gateway.",
 },
};

export default function ReservationDetailsModal({
 reservation,
 focusCancellation = false,
 onClose: onCloseModal,
 onUpdate,
}) {
 const reservationId = reservation?.id || reservation?._id || "";
 const reservationFeeAmount = reservation?.reservationFeeAmount || 2000;
 const reservationFeeLabel = `PHP ${reservationFeeAmount.toLocaleString("en-PH")}`;
 const queryClient = useQueryClient();
 const [adminNotes, setAdminNotes] = useState(reservation?.notes || "");
 const [isSavingNotes, setIsSavingNotes] = useState(false);

 useEffect(() => {
   setAdminNotes(reservation?.notes || "");
 }, [reservation?.notes, reservationId]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showViewingVisit, setShowViewingVisit] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const todayDateStr = useMemo(() => toDateInputValue(new Date()), []);
  const scheduledMoveInStr = useMemo(() => {
    const raw =
      reservation?.moveInDate ||
      reservation?.intendedMoveInDate ||
      reservation?.checkInDate;
    if (!raw) return todayDateStr;
    try {
      return toDateInputValue(new Date(raw));
    } catch {
      return todayDateStr;
    }
  }, [
    reservation?.moveInDate,
    reservation?.intendedMoveInDate,
    reservation?.checkInDate,
    todayDateStr,
  ]);
  const [rescheduleMoveInDate, setRescheduleMoveInDate] = useState("");
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const [meterReadingVal, setMeterReadingVal] = useState("");
  const [waterReadingVal, setWaterReadingVal] = useState("");
  const [actualMoveInDate, setActualMoveInDate] = useState(scheduledMoveInStr);
  const isFutureMoveInDate = Boolean(actualMoveInDate && actualMoveInDate > todayDateStr);
  const [houseRulesPrepared, setHouseRulesPrepared] = useState(false);
  const [showMeterPrompt, setShowMeterPrompt] = useState(false);

  const resetMoveInForm = () => {
    setMeterReadingVal("");
    setWaterReadingVal("");
    setActualMoveInDate(scheduledMoveInStr);
  };
  const onClose = () => {
    resetMoveInForm();
    setShowMeterPrompt(false);
    onCloseModal();
  };
  useEffect(() => {
    setMeterReadingVal("");
    setWaterReadingVal("");
    setActualMoveInDate(scheduledMoveInStr);
  }, [showMeterPrompt, scheduledMoveInStr, reservation?.id, reservation?._id]);
  useEffect(() => {
    setShowMeterPrompt(false);
  }, [reservation?.id, reservation?._id]);
  const cancellationPanelRef = useRef(null);
 const [confirmModal, setConfirmModal] = useState({
 open: false,
 title: "",
 message: "",
 variant: "info",
 onConfirm: null,
 });
 const [revisionModal, setRevisionModal] = useState({ open: false });

 useBodyScrollLock(Boolean(reservation));
 useEscapeClose(Boolean(reservation), onClose);
 const cancellationPending = Boolean(
   reservation?.cancellationRequested && reservation?.cancellationStatus === "pending",
 );

 useEffect(() => {
 if (!focusCancellation || !cancellationPending) return;

 const timer = window.setTimeout(() => {
 cancellationPanelRef.current?.scrollIntoView({
 block: "center",
 behavior: "smooth",
 });
 }, 120);

 return () => window.clearTimeout(timer);
 }, [cancellationPending, focusCancellation]);

  const status = reservation?.status || "pending";
  const visitStatusKey = getVisitStatusKey(reservation);
  const visitStatusAppearance = visitStatusKey
    ? VISIT_STATUS_CONFIG[visitStatusKey]
    : null;
  const visitBranch =
    (typeof reservation?.roomId === "object" ? reservation?.roomId?.branch : null) ||
    (typeof reservation?.room === "object" ? reservation?.room?.branch : null) ||
    reservation?.branch ||
    "";
  const visitRoomId =
    (typeof reservation?.roomId === "object" ? reservation?.roomId?._id : reservation?.roomId) ||
    (typeof reservation?.room === "object" ? reservation?.room?._id : reservation?.room) ||
    reservation?.assignedRoom?._id ||
    reservation?.assignedRoom ||
    "";
  /** True for branches with physical submeters (e.g. Gil Puyat). False for fixed-rate branches (e.g. Guadalupe). */
  const branchUsesSubmeter = SUBMETER_BRANCHES.has(visitBranch);
  const appearance = getReservationStatusAppearance(status, reservation);
  const allowedActions = getAllowedReservationActions(status);
  const isMoveInPaymentSettled =
    isReservationMoveInReady(reservation) ||
    reservation?.initialPaymentStatus === "paid" ||
    reservation?.paymentStatus === "paid_in_full" ||
    Boolean(reservation?.initialPaymentSettledAt) ||
    Boolean(reservation?.initialPaymentPaidAt);
  const isMovedOut = status === "moveOut";
  const stageGuide = STAGE_GUIDANCE[status];
  const hasActionButtons =
    allowedActions.includes("moveIn") ||
    allowedActions.includes("extend") ||
    allowedActions.includes("approve_for_payment") ||
    allowedActions.includes("needs_revision") ||
    allowedActions.includes("rejected") ||
    (allowedActions.includes("cancelled") && !cancellationPending);
  const hasQuickActions = showMeterPrompt || Boolean(stageGuide) || hasActionButtons;
  const emptyStateInfo = useMemo(
    () => getQuickActionsEmptyState(status, isMovedOut),
    [status, isMovedOut],
  );

  const moveInDate = readMoveInDate(reservation);
  const isOverdue =
    status === "reserved" && moveInDate && new Date(moveInDate) < new Date();
  const daysOverdue = isOverdue
    ? Math.floor((new Date() - new Date(moveInDate)) / 86400000)
    : 0;
  const docs = reservation ? buildDocs(reservation) : [];
  const guestName = reservation?.customer ?? "Unknown";
  const guestInitials = getInitials(guestName);
  const guestPhotoUrl = resolveApplicantPhotoUrl(reservation);
  const { data: latestUtilityRes } = useUtilityLatestReading(
    "electricity",
    visitRoomId,
    { enabled: Boolean(visitRoomId) && branchUsesSubmeter },
  );
  const waterRoomType = reservation?.roomId?.type || reservation?.room?.type || reservation?.roomType;
  const requiresWater = branchUsesSubmeter && ['private','double-sharing'].includes(waterRoomType);
  const {data:latestWaterRes} = useUtilityLatestReading('water',visitRoomId,{enabled:Boolean(visitRoomId) && requiresWater});
  const previousWaterReading = latestWaterRes?.reading?.reading ?? latestWaterRes?.data?.reading?.reading ?? null;
  const previousMeterReading = useMemo(() => {
    const raw =
      latestUtilityRes?.reading?.reading ??
      latestUtilityRes?.data?.reading?.reading ??
      (typeof latestUtilityRes?.reading === "number" ? latestUtilityRes.reading : null) ??
      (typeof latestUtilityRes?.data?.reading === "number" ? latestUtilityRes.data.reading : null) ??
      reservation?.roomId?.lastMeterReading ??
      reservation?.roomId?.lastReading ??
      reservation?.room?.lastMeterReading ??
      reservation?.room?.lastReading ??
      reservation?.meterReading ??
      null;

    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }, [latestUtilityRes, reservation]);
  const visitHistory = Array.isArray(reservation?.visitHistory)
    ? reservation.visitHistory
        .slice()
        .sort(
          (a, b) =>
            new Date(b?.updatedAt || b?.scheduledAt || 0) -
            new Date(a?.updatedAt || a?.scheduledAt || 0),
        )
    : [];

  const reservationFeeStatusKey = useMemo(
    () => resolveReservationFeeStatus(reservation),
    [reservation],
  );
  const moveInPaymentStatusKey = useMemo(
    () => resolveMoveInPaymentStatus(reservation),
    [reservation],
  );
  const reservationFeeBadge = useMemo(
    () => getPaymentStatusBadgeConfig(reservationFeeStatusKey),
    [reservationFeeStatusKey],
  );
  const moveInPaymentBadge = useMemo(
    () => getPaymentStatusBadgeConfig(moveInPaymentStatusKey),
    [moveInPaymentStatusKey],
  );
  const isReservationFeeSettled = useMemo(
    () =>
      reservationFeeStatusKey === "verified" ||
      reservationFeeStatusKey === "paid" ||
      reservationFeeStatusKey === "paid_in_full" ||
      Boolean(
        reservation?.paidAt ||
        reservation?.reservationFeePaidAt ||
        (reservation?.paymentStatus === "paid" && reservation?.paymentDate)
      ),
    [reservationFeeStatusKey, reservation],
  );
  const isMoveInSettled = useMemo(
    () =>
      moveInPaymentStatusKey === "paid_in_full" ||
      moveInPaymentStatusKey === "paid" ||
      moveInPaymentStatusKey === "verified" ||
      isMoveInPaymentSettled ||
      Boolean(
        reservation?.initialPaymentSettledAt ||
        reservation?.initialPaymentPaidAt ||
        (reservation?.initialPaymentStatus === "paid" &&
          (reservation?.initialPaymentDate || reservation?.updatedAt))
      ),
    [moveInPaymentStatusKey, isMoveInPaymentSettled, reservation],
  );

 if (!reservation) return null;
 const viewingPreferenceLabel =
 reservation.viewingPreference === "remote_2d_viewing"
 ? "2D Remote Viewing"
 : reservation.viewingPreference === "urgent_move_in_review"
 ? "Urgent Move-in Review"
 : reservation.viewingPreference === "physical_visit" ||
   reservation.viewingType === "inperson" ||
   reservation.visitDate
 ? "Schedule Physical Visit"
 : "\u2014";
  const roomImages = Array.isArray(reservation.roomId?.images)
  ? reservation.roomId.images.filter(Boolean)
  : [];
  const uploadedDocsCount = useMemo(
    () => docs.filter((d) => Boolean(d.url)).length,
    [docs],
  );
  const hasUploadedDocs = uploadedDocsCount > 0;
  const hasViewingData = useMemo(
    () =>
      Boolean(
        reservation?.viewingPreference ||
        reservation?.viewingType ||
        reservation?.visitDate ||
        reservation?.visitTime ||
        roomImages.length > 0
      ),
    [reservation?.viewingPreference, reservation?.viewingType, reservation?.visitDate, reservation?.visitTime, roomImages.length],
  );
  const hasPersonalDetails = useMemo(
    () =>
      Boolean(
        reservation?.birthday ||
        reservation?.maritalStatus ||
        reservation?.nationality ||
        reservation?.educationLevel ||
        reservation?.emergencyContact?.name ||
        reservation?.emergencyContact?.contactNumber ||
        reservation?.address?.street ||
        reservation?.address?.city ||
        (typeof reservation?.address === "string" && reservation.address.trim())
      ),
    [reservation],
  );
  const bookingDetails = [
    ["Room", reservation.room ?? "\u2014"],
    ["Room type", formatRoomType(reservation.roomType)],
    ["Bed / Slot", formatSelectedBed(reservation.selectedBed)],
    ["Branch", reservation.branch ?? "\u2014"],
    ["Viewing Preference", viewingPreferenceLabel],
    ["Move-in", fmtDate(moveInDate)],
    ["Lease term", reservation.leaseDuration ? `${reservation.leaseDuration} months` : "\u2014"],
    ["Contact", reservation.phone ?? reservation.mobileNumber ?? "\u2014"],
 [
 "Application Review",
 reservation.status === "pending_application_review"
 ? "Pending Application Review"
 : reservation.status === "needs_revision"
 ? "Needs Revision"
 : reservation.status === "approved_for_payment"
 ? "Approved for Reservation Fee"
 : reservation.status === "rejected"
 ? "Rejected"
 : "\u2014",
 { wide: true },
 ],
 ];
  const isRawId = (val) => typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val.trim());

  const cancelledByPerson = (() => {
    if (reservation.cancellationSource === "applicant" || reservation.cancellationSource === "user") {
      return reservation.customer || "Applicant";
    }
    if (reservation.cancellationSource === "system") {
      return "System Sweeper (24h Hold Expired)";
    }
    if (typeof reservation.cancelledBy === "object" && reservation.cancelledBy?.role) {
      const { role } = reservation.cancelledBy;
      if (role === "branch_admin") return "Branch Admin";
      if (role === "owner") return "System Owner";
      if (role === "applicant" || role === "tenant") return reservation.customer || "Applicant";
      return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (reservation.cancelledByName && !isRawId(reservation.cancelledByName)) {
      return reservation.cancelledByName;
    }
    if (reservation.cancellationSource === "admin" || reservation.cancelledAt) {
      return "Branch Admin";
    }
    return reservation.customer || "Applicant";
  })();

  const isCancelled = reservation.status === "cancelled" || Boolean(reservation.cancelledAt);
  const cancellationDetail = isCancelled
    ? reservation.cancelledAt
      ? `${fmtDate(reservation.cancelledAt)}${cancelledByPerson ? ` by ${cancelledByPerson}` : ""}`
      : `Cancelled by ${cancelledByPerson}`
    : null;


  const cancellationRequestDetails = [
    ["Requested", fmtDate(reservation.cancellationRequestedAt)],
    ["Requested By", cancelledByPerson || reservation.customer || "Applicant"],
    ["Reason", reservation.cancellationReason?.trim() || "No reason provided"],
  ];

  const activityTimeline = [
    {
      label: "Reservation Created",
      date: fmtDate(reservation.createdAt),
      time: safeFmtTime(reservation.createdAt),
    },
    (reservation.visitDate || reservation.visitTime)
      ? {
          label: "Viewing / Visit Scheduled",
          date: fmtDate(reservation.visitDate),
          time: reservation.visitTime ? String(reservation.visitTime) : null,
        }
      : null,
    (reservation.applicationSubmittedAt || reservation.submittedAt)
      ? {
          label: "Application Submitted",
          date: fmtDate(reservation.applicationSubmittedAt || reservation.submittedAt),
          time: safeFmtTime(reservation.applicationSubmittedAt || reservation.submittedAt),
        }
      : null,
    (reservation.approvedForPaymentAt || reservation.approvedAt)
      ? {
          label: "Approved for Reservation Fee",
          date: fmtDate(reservation.approvedForPaymentAt || reservation.approvedAt),
          time: safeFmtTime(reservation.approvedForPaymentAt || reservation.approvedAt),
        }
      : null,
    (reservation.paidAt || reservation.reservationFeePaidAt || (reservation.paymentStatus === "paid" && reservation.paymentDate))
      ? {
          label: "Reservation Fee Settled",
          date: fmtDate(reservation.paidAt || reservation.reservationFeePaidAt || reservation.paymentDate),
          time: safeFmtTime(reservation.paidAt || reservation.reservationFeePaidAt || reservation.paymentDate),
        }
      : null,
    (reservation.initialPaymentSettledAt || reservation.initialPaymentPaidAt || (reservation.initialPaymentStatus === "paid" && (reservation.initialPaymentDate || reservation.updatedAt)))
      ? {
          label: "Advance & Deposit Settled",
          date: fmtDate(reservation.initialPaymentSettledAt || reservation.initialPaymentPaidAt || reservation.initialPaymentDate || reservation.updatedAt),
          time: safeFmtTime(reservation.initialPaymentSettledAt || reservation.initialPaymentPaidAt || reservation.initialPaymentDate || reservation.updatedAt),
        }
      : null,
    moveInDate
      ? {
          label: "Target Move-in",
          date: fmtDate(moveInDate),
          time: null,
        }
      : null,
    (reservation.finalMoveInDate || reservation.movedInAt)
      ? {
          label: "Move-in Completed",
          date: fmtDate(reservation.finalMoveInDate || reservation.movedInAt),
          time: safeFmtTime(reservation.finalMoveInDate || reservation.movedInAt),
        }
      : null,
    cancellationDetail
      ? {
          label: "Cancellation",
          date: reservation.cancelledAt ? fmtDate(reservation.cancelledAt) : "Cancelled",
          time: reservation.cancelledAt ? safeFmtTime(reservation.cancelledAt) : null,
          meta: cancelledByPerson ? `by ${cancelledByPerson}` : null,
        }
      : null,
    {
      label: "Current Status",
      date: appearance.label,
      time:
        reservation.status === "cancelled"
          ? reservation.cancelledAt
            ? `Cancelled ${fmtDate(reservation.cancelledAt)} • ${safeFmtTime(reservation.cancelledAt)}`
            : reservation.updatedAt
              ? `Updated ${fmtDate(reservation.updatedAt)} • ${safeFmtTime(reservation.updatedAt)}`
              : null
          : reservation.status === "archived"
            ? reservation.archivedAt
              ? `Archived ${fmtDate(reservation.archivedAt)} • ${safeFmtTime(reservation.archivedAt)}`
              : reservation.updatedAt
                ? `Updated ${fmtDate(reservation.updatedAt)} • ${safeFmtTime(reservation.updatedAt)}`
                : null
            : reservation.updatedAt
              ? `Updated ${fmtDate(reservation.updatedAt)} • ${safeFmtTime(reservation.updatedAt)}`
              : reservation.createdAt
                ? `Created ${fmtDate(reservation.createdAt)}`
                : null,
      isCurrent: true,
    },
  ].filter(Boolean);

  const currentTimelineItem =
    activityTimeline.find((item) => item.isCurrent) ||
    activityTimeline[activityTimeline.length - 1];

  const pricingDisplay = reservation?.pricingDisplay || null;
  const { pricingIsUsable, pricingIsMissing, pricingBlocksApproval } =
    resolveReservationApprovalPricingGate(pricingDisplay);
  const formatPhp = formatPhpCurrency;
  const advanceRentAmount =
    pricingDisplay?.advanceRentAmount ??
    reservation?.pricingSnapshot?.advanceRentAmount ??
    reservation?.advanceRent ??
    null;
  const securityDepositAmount =
    pricingDisplay?.securityDepositAmount ??
    reservation?.pricingSnapshot?.securityDepositAmount ??
    reservation?.securityDeposit ??
    null;
  const initialTotalDue =
    pricingDisplay?.estimatedInitialPaymentTotal ??
    (advanceRentAmount !== null && securityDepositAmount !== null
      ? Math.max(0, advanceRentAmount + securityDepositAmount - reservationFeeAmount)
      : null);

  const leaseCategoryLabel =
    pricingDisplay?.leaseType === "long_term"
      ? "Long-term"
      : pricingDisplay?.leaseType === "short_term"
        ? "Short-term"
        : "—";

  const isGuadalupeReservation = useMemo(() => {
    const branchName = String(
      reservation?.roomId?.branch ||
      reservation?.branch ||
      reservation?.room?.branch ||
      visitBranch ||
      ""
    ).toLowerCase().trim();
    return branchName.includes("guadalupe");
  }, [reservation, visitBranch]);

  const applianceBreakdown = useMemo(() => {
    return resolveApplianceBreakdown(
      reservation?.selectedAppliances,
      reservation?.applianceFees,
      reservation?.roomId || reservation?.room,
    );
  }, [
    reservation?.selectedAppliances,
    reservation?.applianceFees,
    reservation?.roomId,
    reservation?.room,
  ]);

  const declaredAppliances = applianceBreakdown.items;
  const monthlyApplianceSubtotal = applianceBreakdown.totalApplianceFees;

  const showApplianceBlock =
    isGuadalupeReservation || declaredAppliances.length > 0 || monthlyApplianceSubtotal > 0;

  const doAction = (key, apiCall, successMsg) => {
    const modalConfig =
      key === "extend"
        ? {
            title: `Reschedule Move-in`,
            message: `Update the move-in date for the reservation.`,
            confirmText: "Save Changes",
            loadingText: ACTION_LOADING_MSGS.extend,
            variant: "info",
          }
        : key === "cancel"
          ? {
              ...ACTION_MSGS.cancel,
              message: `The ${reservationFeeLabel} reservation fee is non-refundable. The bed will be freed and user reset to applicant.`,
              loadingText: ACTION_LOADING_MSGS.cancel,
            }
          : {
              ...ACTION_MSGS[key],
              loadingText: ACTION_LOADING_MSGS[key] || "Processing...",
            };

    setConfirmModal({
      open: true,
      ...modalConfig,
      onConfirm: async () => {
        setIsSubmitting(true);

        try {
          await apiCall();
          setConfirmModal((previous) => ({ ...previous, open: false }));
          showNotification(successMsg, "success");
          onUpdate?.();
          onClose();
        } catch (error) {
          setConfirmModal((previous) => ({ ...previous, open: false }));
          const errorCode = error?.response?.data?.code;
          const isCancellationReviewAction =
            key === "approveCancellation" || key === "rejectCancellation";
          if (isCancellationReviewAction) {
            try {
              const latest = await reservationApi.getById(reservation.id);
              const latestReservation = latest?.reservation || latest;
              const latestCancellationPending =
                latestReservation?.cancellationRequested &&
                latestReservation?.cancellationStatus === "pending";
              const reviewWasApplied =
                key === "approveCancellation"
                  ? latestReservation?.status === "cancelled" ||
                    latestReservation?.cancellationStatus === "approved"
                  : !latestCancellationPending &&
                    (latestReservation?.cancellationStatus === "rejected" ||
                      latestReservation?.cancellationRequested === false);

              if (reviewWasApplied) {
                showNotification(successMsg, "success");
                onUpdate?.();
                onClose();
                return;
              }
            } catch (refreshError) {
              console.warn("Failed to verify cancellation review state:", refreshError);
            }
          }
          if (
            isCancellationReviewAction &&
            errorCode === "NO_PENDING_REQUEST"
          ) {
            showNotification(
              "This cancellation request was already reviewed. Refreshing reservation details.",
              "info",
            );
            onUpdate?.();
            onClose();
            return;
          }
          console.error(error);
          showNotification(
            getFriendlyError(error, "Action failed. Please try again."),
            "error",
          );
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleNotesBlur = async () => {
    const currentNotes = adminNotes ?? "";
    const savedNotes = reservation?.notes ?? "";

    if (currentNotes === savedNotes || isSavingNotes) {
      return;
    }

    setIsSavingNotes(true);
    try {
      await reservationApi.update(reservationId, { notes: currentNotes });
      showNotification("Notes saved", "success");
      onUpdate?.();
    } catch {
      showNotification("Failed to save notes", "error");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleViewReservationFeeReceipt = async () => {
    if (!isReservationFeeSettled) {
      showNotification(
        "Receipt unavailable: Reservation fee payment is not yet settled.",
        "warning",
      );
      return;
    }
    try {
      const { viewDepositReceipt } = await import(
        "../../../shared/utils/receiptGenerator.js"
      );
      await viewDepositReceipt(reservation, reservation?.userId);
    } catch (error) {
      console.error("Failed to view reservation fee receipt:", error);
      showNotification("Could not open receipt preview. Please try again.", "error");
    }
  };

  const handleViewMoveInReceipt = async () => {
    if (!isMoveInSettled) {
      showNotification(
        "Receipt unavailable: Advance Rent & Security Deposit are not yet settled.",
        "warning",
      );
      return;
    }
    try {
      const { viewMoveInReceipt } = await import(
        "../../../shared/utils/receiptGenerator.js"
      );
      await viewMoveInReceipt(reservation, reservation?.userId);
    } catch (error) {
      console.error("Failed to view move-in receipt:", error);
      showNotification("Could not open receipt preview. Please try again.", "error");
    }
  };

 return createPortal(
 <>
 <div className="rdm-overlay" onClick={onClose}>
 <div className="rdm" onClick={(event) => event.stopPropagation()}>
 <div className="rdm-top-card">
 <div className="rdm-top-header">
 <div className="rdm-guest-block">
 <ProfileAvatar
 className="rdm-avatar"
 src={guestPhotoUrl}
 initials={guestInitials}
 alt={`${guestName} profile photo`}
 size={44}
 />
 <div className="rdm-guest-copy">
 <h2 className="rdm-title">{guestName}</h2>
 <div className="rdm-header-meta">
 <span className="rdm-code">
 {reservation.reservationCode || "\u2014"}
 </span>
 <span className="rdm-header-sep">&bull;</span>
 <span className="rdm-header-detail">
 {reservation.email ?? "\u2014"}
 </span>
 </div>
 </div>
 </div>
 <div className="rdm-header-actions">
 <div
 className="rdm-status-chip"
 style={{
 "--rdm-status-bg": appearance.bg,
 "--rdm-status-color": appearance.color,
 "--rdm-status-dot": appearance.dot,
 }}
 >
 <span className="rdm-status-dot" />
 {appearance.label}
 </div>
 {isOverdue && (
 <div className="rdm-overdue-chip">
 {daysOverdue} day{daysOverdue > 1 ? "s" : ""} overdue
 </div>
 )}
 <button
 className="rdm-close"
 onClick={onClose}
 aria-label="Close"
 >
 <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
 <path
 d="M18 6L6 18M6 6l12 12"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 />
 </svg>
 </button>
 </div>
 </div>
 </div>

 <div className="rdm-body rdm-layout">
 <div className="rdm-main-column">
 {cancellationPending && (
 <div
 ref={cancellationPanelRef}
 className={`rdm-section rdm-surface-card rdm-cancellation-request${
 focusCancellation ? " rdm-cancellation-request--focused" : ""
 }`}
 >
 <div className="rdm-cancellation-request__header">
 <div>
 <h4 className="rdm-section-title rdm-cancellation-request__title">
 Cancellation Request
 </h4>
 <p className="rdm-cancellation-request__copy">
 Review this tenant request before releasing the bed. The reservation fee is non-refundable.
 </p>
 </div>
 <span className="rdm-cancellation-request__badge">
 Pending Review
 </span>
 </div>
 <div className="rdm-info-grid rdm-cancellation-request__details">
 {cancellationRequestDetails.map(([label, value]) => (
 <div className="rdm-info-item" key={label}>
 <span className="rdm-info-label">{label}</span>
 <span className="rdm-info-value">{value}</span>
 </div>
 ))}
 </div>
 <div className="rdm-cancellation-request__impact">
 <AlertTriangle size={15} style={{ flexShrink: 0 }} />
 <span>Approving cancels the reservation and releases the assigned bed.</span>
 </div>
 <div className="rdm-cancellation-request__actions">
 <button
 type="button"
 className="rdm-action rdm-action-neutral-outline"
 onClick={() =>
 doAction(
 "rejectCancellation",
 () => reservationApi.rejectCancellationRequest(reservation.id),
 "Cancellation request rejected. Reservation remains active.",
 )
 }
 disabled={isSubmitting}
 >
 <XCircle size={16} />
 <span>Reject Request</span>
 </button>
 <button
 type="button"
 className="rdm-action rdm-action-danger-solid"
 onClick={() =>
 doAction(
 "approveCancellation",
 () => reservationApi.approveCancellationRequest(reservation.id),
 "Cancellation approved. Reservation cancelled and bed released.",
 )
 }
 disabled={isSubmitting}
 >
 <CheckCircle size={16} />
 <span>Approve Cancellation</span>
 </button>
 </div>
 </div>
 )}
          {/* Main Column */}
          {/* Overview Card (Main / Non-collapsible) */}
          <div className="rdm-section rdm-surface-card rdm-glance-card">
            <div className="rdm-glance-header">
              <div className="rdm-glance-title-wrap">
                <h3 className="rdm-glance-title">Overview</h3>
              </div>
              <span className="rdm-glance-code">{reservation.reservationCode || "\u2014"}</span>
            </div>

            <div className="rdm-glance-grid">
              {/* Block 1: Unit & Room Assignment */}
              <div className="rdm-glance-block">
                <div className="rdm-glance-block-header">
                  <Building2 size={15} className="rdm-glance-icon" />
                  <span>Unit &amp; Room Assignment</span>
                </div>
                <div className="rdm-glance-primary">{reservation.room ?? "\u2014"}</div>
                <div className="rdm-glance-secondary">
                  <span>{formatSelectedBed(reservation.selectedBed)}</span>
                  <span className="rdm-glance-dot-sep">•</span>
                  <span>{formatRoomType(reservation.roomType)}</span>
                </div>
                <div className="rdm-glance-tertiary">
                  Branch: <strong>{reservation.branch ?? "\u2014"}</strong>
                </div>
              </div>

              {/* Block 2: Stay & Lease Timeline */}
              <div className="rdm-glance-block">
                <div className="rdm-glance-block-header">
                  <Calendar size={15} className="rdm-glance-icon" />
                  <span>Stay &amp; Lease Timeline</span>
                </div>
                <div className="rdm-glance-primary">
                  {fmtDate(moveInDate)}
                </div>
                <div className="rdm-glance-secondary">
                  <span>{reservation.leaseDuration ? `${reservation.leaseDuration} Months` : "\u2014"}</span>
                  <span className="rdm-glance-dot-sep">•</span>
                  <span>{leaseCategoryLabel}</span>
                </div>
                <div className="rdm-glance-tertiary">
                  {isOverdue ? (
                    <span className="rdm-danger" style={{ fontWeight: 700 }}>
                      {daysOverdue} day{daysOverdue > 1 ? "s" : ""} overdue
                    </span>
                  ) : (
                    <span>Target Move-In Scheduled</span>
                  )}
                </div>
              </div>

              {/* Block 3: Rates & Financial Snapshot */}
              <div className="rdm-glance-block">
                <div className="rdm-glance-block-header">
                  <CreditCard size={15} className="rdm-glance-icon" />
                  <span>Rates &amp; Settlement</span>
                </div>
                <div className="rdm-glance-primary">
                  {pricingDisplay?.finalMonthlyRate
                    ? formatPhp(pricingDisplay.finalMonthlyRate)
                    : formatPhp(reservation?.totalPrice)}
                  <span className="rdm-glance-unit"> / mo</span>
                </div>
                <div className="rdm-glance-secondary">
                  {Number.isFinite(Number(pricingDisplay?.discountPercentage)) && Number(pricingDisplay.discountPercentage) > 0 ? (
                    <span>
                      Regular: <del>{formatPhp(pricingDisplay.regularMonthlyRate)}</del> ({pricingDisplay.discountPercentage}% off)
                    </span>
                  ) : (
                    <span>Standard Monthly Rate</span>
                  )}
                </div>
                <div className="rdm-glance-tertiary">
                  Initial Due: <strong>{formatPhp(initialTotalDue)}</strong>
                </div>

                {/* Appliance Add-ons (Guadalupe / Declared Appliances) */}
                {showApplianceBlock && (
                  <div className="rdm-glance-appliance-subcard">
                    <div className="rdm-glance-appliance-header">
                      <Zap size={13} className="rdm-glance-appliance-icon" />
                      <span>Appliance Add-ons</span>
                    </div>
                    {declaredAppliances.length > 0 ? (
                      <div className="rdm-glance-appliance-content">
                        <ul className="rdm-glance-appliance-list">
                          {declaredAppliances.map((item, idx) => (
                            <li key={item.id || idx} className="rdm-glance-appliance-item">
                              <span className="rdm-glance-appliance-name">
                                {item.name} ×{item.quantity}
                              </span>
                              <span className="rdm-glance-appliance-rate">
                                ({formatPhp(item.subtotal)}/mo)
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="rdm-glance-appliance-subtotal">
                          <span>Monthly Subtotal:</span>
                          <strong>{formatPhp(monthlyApplianceSubtotal)} / mo</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="rdm-glance-appliance-empty">
                        <span>None declared ({formatPhp(0)}/mo)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Block 4: Stage Readiness & Verification */}
              <div className="rdm-glance-block">
                <div className="rdm-glance-block-header">
                  <CheckCircle size={15} className="rdm-glance-icon" />
                  <span>Stage Readiness</span>
                </div>
                <div className="rdm-glance-pills">
                  <div className="rdm-readiness-row">
                    <span className="rdm-readiness-label">Documents</span>
                    <span className="rdm-readiness-value">
                      {docs.filter((d) => Boolean(d.url)).length}/{docs.length} Uploaded
                    </span>
                  </div>
                  <div className="rdm-readiness-row">
                    <span className="rdm-readiness-label">Visit / Viewing</span>
                    <span
                      className="rdm-summary-badge"
                      style={{ color: visitStatusAppearance?.color || "#475569" }}
                    >
                      <span
                        className="rdm-summary-badge-dot"
                        style={{ backgroundColor: visitStatusAppearance?.dot || "#94a3b8" }}
                      />
                      {visitStatusAppearance?.label || viewingPreferenceLabel}
                    </span>
                  </div>
                  <div className="rdm-readiness-row">
                    <span className="rdm-readiness-label">Reservation Fee</span>
                    <span
                      className="rdm-summary-badge"
                      style={{ color: reservationFeeBadge.color }}
                    >
                      <span
                        className="rdm-summary-badge-dot"
                        style={{ backgroundColor: reservationFeeBadge.dot }}
                      />
                      {reservationFeeBadge.label}
                    </span>
                  </div>
                  <div className="rdm-readiness-row">
                    <span className="rdm-readiness-label">Advance &amp; Deposit</span>
                    <span
                      className="rdm-summary-badge"
                      style={{ color: moveInPaymentBadge.color }}
                    >
                      <span
                        className="rdm-summary-badge-dot"
                        style={{ backgroundColor: moveInPaymentBadge.dot }}
                      />
                      {moveInPaymentBadge.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Submitted Documents (Collapsible) */}
          <div className={`rdm-collapsible-card${!hasUploadedDocs ? " rdm-collapsible-card--disabled" : ""}`}>
            <button
              type="button"
              className="rdm-collapsible-header"
              onClick={() => {
                if (!hasUploadedDocs) return;
                setShowDocs((previous) => !previous);
              }}
              disabled={!hasUploadedDocs}
              title={
                hasUploadedDocs
                  ? "Toggle submitted documents"
                  : "Unavailable — No documents uploaded yet by the applicant"
              }
              aria-disabled={!hasUploadedDocs}
            >
              <div className="rdm-collapsible-header-left">
                <div className="rdm-collapsible-icon-wrap">
                  <FileText size={16} />
                </div>
                <div className="rdm-collapsible-title-wrap">
                  <h4 className="rdm-collapsible-title">Submitted Documents</h4>
                  <p className="rdm-collapsible-desc">
                    Identification proofs, clearances, and verification files
                  </p>
                </div>
              </div>
              <div className="rdm-collapsible-header-right">
                <span className="rdm-docs-counter-chip">
                  {uploadedDocsCount} / {docs.length} Uploaded
                </span>
                <svg
                  className={`rdm-collapsible-chevron ${showDocs ? "open" : ""}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {hasUploadedDocs && showDocs && (
              <div className="rdm-collapsible-content">
                <div className="rdm-docs-list">
                  {docs.map((doc, index) => (
                    <div key={`${doc.label}-${index}`} className="rdm-doc-row">
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span className="rdm-doc-label">{doc.label}</span>
                        {(() => {
                          const appearance = getPrecheckAppearance(doc.precheck);
                          const notes = [
                            doc.precheck?.applicantMessage,
                            doc.precheck?.adminNote,
                            ...(Array.isArray(doc.precheck?.aiCheckWarnings)
                              ? doc.precheck.aiCheckWarnings
                              : []),
                          ]
                            .map((note) => String(note || "").trim())
                            .filter(Boolean);

                          if (!appearance && notes.length === 0) return null;

                          const tooltipText =
                            notes.length > 0
                              ? notes.join(" • ")
                              : appearance?.label || "Manual admin inspection recommended";

                          const isWarningState =
                            appearance &&
                            (appearance.label.includes("Manual") ||
                              appearance.label.includes("Clearer") ||
                              appearance.label.includes("Type"));

                          return (
                            <div style={{ display: "inline-flex", alignItems: "center", marginTop: 2 }}>
                              {appearance ? (
                                <span
                                  title={`Document Review Note:\n• ${tooltipText}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "3px 10px",
                                    borderRadius: 999,
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    background: appearance.bg,
                                    color: appearance.color,
                                    cursor: "help",
                                    border: `1px solid ${appearance.color}30`,
                                  }}
                                >
                                  {isWarningState ? (
                                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                                  ) : (
                                    <CheckCircle size={12} style={{ flexShrink: 0 }} />
                                  )}
                                  <span>{appearance.label}</span>
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                      {doc.url && isSafeDocumentUrl(doc.url) ? (
                        <button
                          type="button"
                          className="rdm-doc-view"
                          onClick={() => openImage(doc.url, doc.label, { requireHttps: true })}
                        >
                          View Document
                        </button>
                      ) : (
                        <span className="rdm-doc-na">
                          {doc.url
                            ? "Invalid file link. Ask applicant to re-upload."
                            : doc.reason
                              ? `Skipped: ${doc.reason}`
                              : "Not submitted"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Viewing & Visit Schedule (Collapsible) */}
          <div className={`rdm-collapsible-card${!hasViewingData ? " rdm-collapsible-card--disabled" : ""}`}>
            <button
              type="button"
              className="rdm-collapsible-header"
              onClick={() => {
                if (!hasViewingData) return;
                setShowViewingVisit((previous) => !previous);
              }}
              disabled={!hasViewingData}
              title={
                hasViewingData
                  ? "Toggle viewing & visit schedule"
                  : "Unavailable — Viewing preference has not been selected yet by the applicant"
              }
              aria-disabled={!hasViewingData}
            >
              <div className="rdm-collapsible-header-left">
                <div className="rdm-collapsible-icon-wrap">
                  <Calendar size={16} />
                </div>
                <div className="rdm-collapsible-title-wrap">
                  <h4 className="rdm-collapsible-title">Viewing &amp; Visit Schedule</h4>
                  <p className="rdm-collapsible-desc">
                    Viewing preference, physical visit appointments, and assigned room photos
                  </p>
                </div>
              </div>
              <div className="rdm-collapsible-header-right">
                {visitStatusAppearance ? (
                  <span
                    className="rdm-status-chip rdm-visit-status-chip"
                    style={{
                      background: "transparent",
                      color: visitStatusAppearance.color,
                      padding: "2px 0",
                    }}
                  >
                    <span
                      className="rdm-status-dot"
                      style={{ background: visitStatusAppearance.dot }}
                    />
                    {visitStatusAppearance.label}
                  </span>
                ) : !hasViewingData ? (
                  <span className="rdm-docs-counter-chip" style={{ fontSize: "0.72rem" }}>
                    Pending Selection
                  </span>
                ) : null}
                <svg
                  className={`rdm-collapsible-chevron ${showViewingVisit ? "open" : ""}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {hasViewingData && showViewingVisit && (
              <div className="rdm-collapsible-content">
                <div className="rdm-info-grid" style={{ paddingTop: 4 }}>
                  <div className="rdm-info-item">
                    <span className="rdm-info-label">Selected Option</span>
                    <span className="rdm-info-value">{viewingPreferenceLabel}</span>
                  </div>
                  <div className="rdm-info-item">
                    <span className="rdm-info-label">Preferred Visit Date</span>
                    <span className="rdm-info-value">{fmtDate(reservation.visitDate)}</span>
                  </div>
                  <div className="rdm-info-item">
                    <span className="rdm-info-label">Preferred Visit Time</span>
                    <span className="rdm-info-value">{fmt(reservation.visitTime)}</span>
                  </div>
                  <div className="rdm-info-item">
                    <span className="rdm-info-label">Visit Code</span>
                    <span className="rdm-info-value">
                      {reservation.visitCode ? (
                        <button
                          type="button"
                          className="rdm-visit-code-badge"
                          onClick={() => {
                            navigator.clipboard.writeText(reservation.visitCode);
                            showNotification("Visit Code copied to clipboard!", "success", 2000);
                          }}
                          title="Click to copy Visit Code"
                        >
                          <span>{reservation.visitCode}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                      ) : (
                        "\u2014"
                      )}
                    </span>
                  </div>
                  <div className="rdm-info-item rdm-info-item--wide">
                    <span className="rdm-info-label">Remote Viewing Acknowledgement</span>
                    <span className="rdm-info-value">
                      {reservation.remoteViewingAcknowledged ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="rdm-info-item rdm-info-item--wide">
                    <span className="rdm-info-label">Urgent Move-in Review</span>
                    <span className="rdm-info-value">
                      {reservation.isUrgentMoveIn ? "Requested" : "No"}
                    </span>
                  </div>
                  {Boolean(reservation.remoteViewingQuestions || reservation.applicationReviewReason) && (
                    <div className="rdm-info-item rdm-info-item--wide">
                      <span className="rdm-info-label">Applicant Questions / Concerns</span>
                      <span className="rdm-info-value">
                        {fmt(reservation.remoteViewingQuestions || reservation.applicationReviewReason)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Room Photo Previews */}
                {roomImages.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(15, 23, 42, 0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span className="rdm-info-label" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                        <Camera size={13} style={{ color: "#64748B" }} />
                        <span>Assigned Room Photos</span>
                      </span>
                      <span style={{ fontSize: "0.74rem", color: "#64748B", fontWeight: 500 }}>
                        {roomImages.length} photo{roomImages.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {roomImages.map((imageUrl, index) => (
                        <button
                          key={`${imageUrl}-${index}`}
                          type="button"
                          onClick={() => openImage(imageUrl, `Room Photo ${index + 1}`)}
                          style={{
                            position: "relative",
                            width: 80,
                            height: 60,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: "1px solid rgba(15, 23, 42, 0.12)",
                            background: "#F8FAFC",
                            padding: 0,
                            cursor: "pointer",
                            transition: "all 0.15s ease-in-out",
                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                          }}
                          className="hover:border-slate-400 focus:outline-none group"
                          title={`Click to view Room Photo ${index + 1}`}
                        >
                          <img
                            src={getThumbnailUrl(imageUrl, { width: 160, quality: 75 })}
                            alt={`Room photo ${index + 1}`}
                            loading="lazy"
                            decoding="async"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(event) => {
                              const fb = getImageFallbackUrl(event.target.src);
                              if (fb && fb !== event.target.src) {
                                event.target.src = fb;
                                return;
                              }
                              event.target.style.display = "none";
                              if (event.target.nextSibling) event.target.nextSibling.style.display = "flex";
                            }}
                          />
                          <div
                            style={{
                              display: "none",
                              width: "100%",
                              height: "100%",
                              alignItems: "center",
                              justifyContent: "center",
                              flexDirection: "column",
                              gap: 2,
                              background: "#F1F5F9",
                              color: "#64748B",
                              fontSize: "0.68rem",
                            }}
                          >
                            <ImageIcon size={16} />
                            <span>Photo {index + 1}</span>
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(15, 23, 42, 0.45)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#FFFFFF",
                              opacity: 0,
                              transition: "opacity 0.15s ease",
                            }}
                            className="group-hover:opacity-100"
                          >
                            <Maximize2 size={15} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visit History Log */}
                {visitHistory.length > 0 && (
                  <div className="rdm-visit-management-note" style={{ marginTop: 14 }}>
                    <span className="rdm-info-label">Visit History Log</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {visitHistory.slice(0, 5).map((entry, index) => (
                        <div
                          key={`${entry.status || "visit"}-${entry.updatedAt || entry.scheduledAt || index}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "transparent",
                            border: "1px solid rgba(15, 23, 42, 0.08)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "0.84rem", color: "#0F172A" }}>
                              {getVisitHistoryTitle(entry)}
                            </strong>
                            <span style={{ fontSize: "0.78rem", color: "#64748B" }}>
                              {fmtDateTime(entry.updatedAt || entry.scheduledAt)}
                            </span>
                          </div>
                          {getVisitHistoryScheduleLines(entry).map((line) => (
                            <div
                              key={`${line.label}-${line.value}`}
                              style={{ fontSize: "0.8rem", color: "#334155", marginTop: 6 }}
                            >
                              <span style={{ fontWeight: 650 }}>{line.label}</span> {line.value}
                            </div>
                          ))}
                          {entry.updatedByName && (
                            <div style={{ fontSize: "0.78rem", color: "#64748B", marginTop: 4 }}>
                              Updated by {entry.updatedByName}
                            </div>
                          )}
                          {entry.notes && (
                            <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 6 }}>
                              {entry.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Personal & Contact Details (Collapsible) */}
          <div className={`rdm-collapsible-card${!hasPersonalDetails ? " rdm-collapsible-card--disabled" : ""}`}>
            <button
              type="button"
              className="rdm-collapsible-header"
              onClick={() => {
                if (!hasPersonalDetails) return;
                setShowPersonal((previous) => !previous);
              }}
              disabled={!hasPersonalDetails}
              title={
                hasPersonalDetails
                  ? "Toggle personal & contact details"
                  : "Unavailable — Application details have not been submitted yet by the applicant"
              }
              aria-disabled={!hasPersonalDetails}
            >
              <div className="rdm-collapsible-header-left">
                <div className="rdm-collapsible-icon-wrap">
                  <User size={16} />
                </div>
                <div className="rdm-collapsible-title-wrap">
                  <h4 className="rdm-collapsible-title">Personal &amp; Contact Details</h4>
                  <p className="rdm-collapsible-desc">
                    Applicant identity details, contact numbers, and emergency contact
                  </p>
                </div>
              </div>
              <div className="rdm-collapsible-header-right">
                {!hasPersonalDetails && (
                  <span className="rdm-docs-counter-chip" style={{ fontSize: "0.72rem" }}>
                    Not Submitted
                  </span>
                )}
                <svg
                  className={`rdm-collapsible-chevron ${showPersonal ? "open" : ""}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {hasPersonalDetails && showPersonal && (
              <div className="rdm-collapsible-content">
                <div className="rdm-info-grid" style={{ paddingTop: 4 }}>
                  {PERSONAL_FIELDS(reservation).map(([label, value]) => (
                    <div className="rdm-info-item" key={label}>
                      <span className="rdm-info-label">{label}</span>
                      <span className="rdm-info-value">{value}</span>
                    </div>
                  ))}
                </div>

                {reservation.emergencyContact && (
                  <div className="rdm-info-grid" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
                    {[
                      ["Emergency Contact", fmt(reservation.emergencyContact.name)],
                      ["Relationship", fmt(reservation.emergencyContact.relationship)],
                      ["Contact #", fmt(reservation.emergencyContact.contactNumber)],
                    ].map(([label, value]) => (
                      <div className="rdm-info-item" key={label}>
                        <span className="rdm-info-label">{label}</span>
                        <span className="rdm-info-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Internal Admin Notes (Collapsible) */}
          <div className="rdm-collapsible-card">
            <button
              type="button"
              className="rdm-collapsible-header"
              onClick={() => setShowNotes((previous) => !previous)}
              title="Toggle internal admin notes"
            >
              <div className="rdm-collapsible-header-left">
                <div className="rdm-collapsible-icon-wrap">
                  <ClipboardList size={16} />
                </div>
                <div className="rdm-collapsible-title-wrap">
                  <h4 className="rdm-collapsible-title">Internal Admin Notes</h4>
                  <p className="rdm-collapsible-desc">
                    Staff remarks and internal administration logs
                  </p>
                </div>
              </div>
              <div className="rdm-collapsible-header-right">
                {isSavingNotes ? (
                  <span className="rdm-docs-counter-chip" style={{ fontSize: "0.72rem" }}>
                    Saving...
                  </span>
                ) : Boolean(adminNotes?.trim()) ? (
                  <span className="rdm-docs-counter-chip" style={{ fontSize: "0.72rem" }}>
                    Note Logged
                  </span>
                ) : (
                  <span className="rdm-docs-counter-chip" style={{ fontSize: "0.72rem", color: "#64748B" }}>
                    No Notes
                  </span>
                )}
                <svg
                  className={`rdm-collapsible-chevron ${showNotes ? "open" : ""}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {showNotes && (
              <div className="rdm-collapsible-content">
                <div className="rdm-notes-form" style={{ paddingTop: 4 }}>
                  <textarea
                    className="rdm-notes-input"
                    placeholder="Add internal notes or administrative remarks..."
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    onBlur={handleNotesBlur}
                    rows="2"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Column */}
        <aside className="rdm-side-column">
          {/* Card 1: Quick Actions (Top Priority for Admin) */}
          {status !== "cancelled" && !isMovedOut && (
            <div className="rdm-side-card">
              <h4 className="rdm-side-title">
                {showMeterPrompt ? "Move-In Details" : "Quick Actions"}
              </h4>
              <div className="rdm-actions-card">
                {!hasQuickActions ? (
                  <div
                    className="rdm-empty-actions"
                    style={{
                      background: emptyStateInfo.bgColor,
                      border: `1px solid ${emptyStateInfo.borderColor}`,
                    }}
                  >
                    <div
                      className="rdm-empty-actions-icon-wrap"
                      style={{ background: "rgba(255, 255, 255, 0.7)" }}
                    >
                      <emptyStateInfo.Icon
                        size={18}
                        style={{ color: emptyStateInfo.iconColor }}
                      />
                    </div>
                    <div className="rdm-empty-actions-content">
                      <h5 className="rdm-empty-actions-title">
                        {emptyStateInfo.title}
                      </h5>
                      <p className="rdm-empty-actions-desc">
                        {emptyStateInfo.desc}
                      </p>
                    </div>
                  </div>
                ) : showMeterPrompt ? (
                  <div className="rdm-inline-movein-form">
                    <p className="rdm-inline-form-copy">
                      {branchUsesSubmeter
                        ? "Confirm actual move-in date and initial meter reading before recording occupancy."
                        : "Confirm actual move-in date before recording occupancy."}
                    </p>

                    {isFutureMoveInDate && (
                      <div className="rdm-movein-future-notice">
                        <div className="rdm-movein-future-notice-header">
                          <AlertTriangle size={15} className="rdm-movein-future-notice-icon" />
                          <span className="rdm-movein-future-notice-title">
                            Future Date Selected ({fmtDate(actualMoveInDate)})
                          </span>
                        </div>
                        <p className="rdm-movein-future-notice-text">
                          Recording Move In immediately activates this tenant and finalizes advance rent. If the tenant has not yet arrived on-site, please <strong>Cancel</strong> and use <strong>Reschedule move-in</strong> to update their expected arrival date instead.
                        </p>
                      </div>
                    )}

                    <div className="rdm-inline-field">
                      <label className="rdm-inline-label">
                        Actual Move-In Date <span className="rdm-asterisk">*</span>
                      </label>
                      <input
                        type="date"
                        value={actualMoveInDate}
                        onChange={(event) => setActualMoveInDate(event.target.value)}
                        onClick={(event) => {
                          try {
                            event.currentTarget.showPicker?.();
                          } catch {}
                        }}
                        className="rdm-inline-input"
                      />
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setActualMoveInDate(scheduledMoveInStr)}
                          className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                            actualMoveInDate === scheduledMoveInStr
                              ? "bg-slate-200 dark:bg-slate-700 text-foreground font-semibold"
                              : "text-muted-foreground hover:text-foreground bg-transparent"
                          }`}
                        >
                          Scheduled: {fmtDate(scheduledMoveInStr)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActualMoveInDate(todayDateStr)}
                          className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                            actualMoveInDate === todayDateStr
                              ? "bg-slate-200 dark:bg-slate-700 text-foreground font-semibold"
                              : "text-muted-foreground hover:text-foreground bg-transparent"
                          }`}
                        >
                          Today: {fmtDate(todayDateStr)}
                        </button>
                      </div>
                    </div>

                    {branchUsesSubmeter && (
                      <div className="rdm-inline-field">
                        <div className="rdm-inline-label-group">
                          <label htmlFor="movein-electricity-reading" className="rdm-inline-label">
                            Starting Electricity Reading <span className="rdm-asterisk">*</span>
                          </label>
                          <button type="button"
                            style={{border:0,padding:0}}
                            disabled={isSubmitting}
                            className="rdm-meter-info-badge"
                            onClick={() => {
                              if (previousMeterReading != null) {
                                setMeterReadingVal(String(previousMeterReading));
                              }
                            }}
                            title={previousMeterReading != null ? "Click to auto-fill previous reading baseline" : "No previous reading logged"}
                          >
                            <Info size={16} className="rdm-meter-info-icon" />
                            <div className="rdm-meter-tooltip">
                              <span>
                                {previousMeterReading != null ? (
                                  <>Last Recorded: <strong>{Number(previousMeterReading).toLocaleString("en-PH")} kWh</strong></>
                                ) : (
                                  "No previous reading logged yet for this room."
                                )}
                              </span>
                              <span className="rdm-meter-tooltip-hint">
                                {previousMeterReading != null
                                  ? "Click to auto-fill starting baseline"
                                  : "Enter initial room meter reading"}
                              </span>
                            </div>
                          </button>
                        </div>
                        <div className="rdm-inline-addon-group">
                          <input
                            type="number"
                            min="0"
                            max="99999"
                            step="0.01"
                            id="movein-electricity-reading"
                            value={meterReadingVal}
                            onChange={(event) => setMeterReadingVal(event.target.value)}
                            className="rdm-inline-addon-input"
                            placeholder={
                              previousMeterReading != null && !Number.isNaN(Number(previousMeterReading))
                                ? `e.g. ${Number(previousMeterReading).toLocaleString("en-PH")}`
                                : "e.g. 1250"
                            }
                            autoFocus
                          />
                          <span className="rdm-inline-addon-label">kWh</span>
                        </div>
                      </div>
                    )}

                    {requiresWater && (
                      <div className="rdm-inline-field">
                        <div className="rdm-inline-label-group">
                          <label htmlFor="movein-water-reading" className="rdm-inline-label">
                            Starting Water Reading <span className="rdm-asterisk">*</span>
                          </label>
                          <button type="button"
                            style={{border:0,padding:0}}
                            disabled={isSubmitting}
                            className="rdm-meter-info-badge"
                            onClick={() => {
                              if (previousWaterReading != null) {
                                setWaterReadingVal(String(previousWaterReading));
                              }
                            }}
                            title={previousWaterReading != null ? "Click to auto-fill previous reading baseline" : "No previous reading logged"}
                          >
                            <Info size={16} className="rdm-meter-info-icon" />
                            <div className="rdm-meter-tooltip">
                              <span>
                                {previousWaterReading != null ? (
                                  <>Last Recorded: <strong>{Number(previousWaterReading).toLocaleString("en-PH")} m³</strong></>
                                ) : (
                                  "No previous reading logged yet for this room."
                                )}
                              </span>
                              <span className="rdm-meter-tooltip-hint">
                                {previousWaterReading != null
                                  ? "Click to auto-fill starting baseline"
                                  : "Enter initial room meter reading"}
                              </span>
                            </div>
                          </button>
                        </div>
                        <div className="rdm-inline-addon-group">
                          <input
                            type="number"
                            min="0"
                            max="99999"
                            step="0.01"
                            id="movein-water-reading"
                            value={waterReadingVal}
                            onChange={(event) => setWaterReadingVal(event.target.value)}
                            className="rdm-inline-addon-input"
                            placeholder={
                              previousWaterReading != null && !Number.isNaN(Number(previousWaterReading))
                                ? `e.g. ${Number(previousWaterReading).toLocaleString("en-PH")}`
                                : "e.g. 1250"
                            }
                          />
                          <span className="rdm-inline-addon-label">m³</span>
                        </div>
                      </div>
                    )}

                    <div className="rdm-inline-actions">
                      <button
                        type="button"
                        className="rdm-action rdm-action-secondary"
                        onClick={() => setShowMeterPrompt(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rdm-action rdm-action-primary rdm-action-success"
                        onClick={() => {
                          if (cancellationPending) {
                            showNotification(
                              "Cannot move in tenant: A cancellation request is pending review. Please approve or reject the request first.",
                              "warning",
                            );
                            return;
                          }
                          const waterReading = Number(waterReadingVal);
                          if (requiresWater && (!waterReadingVal.trim() || !Number.isFinite(waterReading) || waterReading < 0 || (previousWaterReading != null && waterReading < Number(previousWaterReading)))) {
                            showNotification('A valid water reading (m³), at least the previous room reading, is required.','error',5000);
                            return;
                          }
                          const reading = branchUsesSubmeter ? Number(meterReadingVal) : null;
                          if (branchUsesSubmeter && (!meterReadingVal.trim() || Number.isNaN(reading) || reading < 0)) {
                            showNotification(
                              "A valid meter reading (kWh) is required.",
                              "error",
                              4000,
                            );
                            return;
                          }
                          if (
                            branchUsesSubmeter &&
                            reading !== null &&
                            previousMeterReading != null &&
                            Number.isFinite(Number(previousMeterReading)) &&
                            reading < Number(previousMeterReading)
                          ) {
                            showNotification(
                              `Initial meter reading (${reading} kWh) cannot be lower than the room's previous reading (${Number(previousMeterReading).toLocaleString("en-PH")} kWh).`,
                              "error",
                              5000,
                            );
                            return;
                          }
                          if (!actualMoveInDate) {
                            showNotification("The actual move-in date is required.", "error", 4000);
                            return;
                          }

                          doAction(
                            "moveIn",
                            async () => {
                              try {
                                await reservationApi.update(reservation.id, {
                                  status: "moveIn",
                                  ...(branchUsesSubmeter && reading !== null ? { meterReading: reading } : {}),
                                  ...(requiresWater ? {waterMeterReading:waterReading} : {}),
                                  actualMoveInDate,
                                  confirmedMoveInDate: actualMoveInDate,
                                  houseRulesPrepared: true,
                                });
                                resetMoveInForm();
                                setShowMeterPrompt(false);
                                // Invalidate utility caches so the billing timeline auto-updates.
                                await queryClient.invalidateQueries({ queryKey: ["utilities"] });
                              } catch (apiErr) {
                                // Surface backend blocker reasons if available
                                const blockers = apiErr?.response?.data?.missing || apiErr?.data?.missing;
                                if (blockers && blockers.length > 0) {
                                  throw new Error(
                                    "Move-in prerequisites not met:\n• " + blockers.join("\n• "),
                                  );
                                }
                                throw apiErr;
                              }
                            },
                            "Tenant move-in recorded successfully",
                          );
                        }}
                        disabled={isSubmitting || cancellationPending}
                        title={
                          cancellationPending
                            ? "Move-in locked: A cancellation request is pending admin review. Approve or reject the request first."
                            : undefined
                        }
                      >
                        Move In
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {stageGuide && (
                      <div className="rdm-stage-guide">
                        <div className="rdm-stage-guide-icon-wrap">
                          <stageGuide.Icon size={16} strokeWidth={1.75} />
                        </div>
                        <p className="rdm-stage-guide-msg">{stageGuide.message}</p>
                      </div>
                    )}

                    {allowedActions.includes("moveIn") && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                        <button
                          className="rdm-action rdm-action-primary"
                          onClick={() => {
                            if (cancellationPending) {
                              showNotification(
                                "Cannot move in tenant: A cancellation request is pending review. Please approve or reject the request first.",
                                "warning",
                              );
                              return;
                            }
                            if (!isMoveInPaymentSettled) return;
                            resetMoveInForm();
                            setShowMeterPrompt(true);
                          }}
                          disabled={isSubmitting || !isMoveInPaymentSettled || cancellationPending}
                          title={
                            cancellationPending
                              ? "Move-in locked: A cancellation request is pending admin review. Approve or reject the request first."
                              : isMoveInPaymentSettled
                                ? "Record tenant move-in and the initial meter reading"
                                : "Move-in locked: 1-Month Advance Rent and Security Deposit (1DP + 1Adv) must be settled first."
                          }
                        >
                          Record Move In
                        </button>
                        {cancellationPending && (
                          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs shadow-2xs">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              <strong className="text-slate-900 dark:text-slate-100">Move-In Locked:</strong> A tenant cancellation request is pending review. Review and resolve (Approve or Reject) the cancellation request above before moving in the tenant.
                            </span>
                          </div>
                        )}
                        {!cancellationPending && !isMoveInPaymentSettled && (
                          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs shadow-2xs">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                            <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              <strong className="text-slate-900 dark:text-slate-100">Move-In Locked:</strong> 1-Month Advance & Deposit (1DP + 1Adv) settlement is pending.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {allowedActions.includes("extend") && (
                      <button
                        className="rdm-action rdm-action-dark"
                        onClick={() => {
                          if (cancellationPending) {
                            showNotification(
                              "Cannot reschedule move-in while a cancellation request is pending review.",
                              "warning",
                            );
                            return;
                          }
                          setRescheduleMoveInDate(
                            toDateInputValue(readMoveInDate(reservation)) || todayDateStr,
                          );
                          setShowExtendPrompt(true);
                        }}
                        disabled={isSubmitting || cancellationPending}
                        title={
                          cancellationPending
                            ? "Reschedule locked: A cancellation request is pending admin review."
                            : undefined
                        }
                      >
                        Reschedule move-in
                      </button>
                    )}

                    {allowedActions.includes("approve_for_payment") && (
                      <button
                        className="rdm-action rdm-action-primary"
                        onClick={() => {
                          if (pricingBlocksApproval) {
                            showNotification(
                              pricingIsMissing
                                ? "Pricing information unavailable. Refresh and try again."
                                : "Pricing configuration is unavailable. This reservation cannot be approved yet.",
                              "error",
                            );
                            return;
                          }
                          doAction(
                            "approveForPayment",
                            () =>
                              reservationApi.update(reservation.id, {
                                status: "approved_for_payment",
                                applicationReviewReason: null,
                              }),
                            "Application approved for reservation fee",
                          );
                        }}
                        disabled={isSubmitting || pricingBlocksApproval}
                        title={
                          pricingBlocksApproval
                            ? (pricingIsMissing
                              ? "Pricing information unavailable. Refresh and try again."
                              : "Pricing configuration is unavailable. This reservation cannot be approved yet.")
                            : undefined
                        }
                      >
                        Approve for Reservation Fee
                      </button>
                    )}

                    {allowedActions.includes("needs_revision") && (
                      <button
                        className="rdm-action rdm-action-dark"
                        onClick={() => setRevisionModal({ open: true })}
                        disabled={isSubmitting}
                      >
                        Request Revision
                      </button>
                    )}

                    {allowedActions.includes("rejected") && (
                      <button
                        className="rdm-action rdm-action-danger-outline"
                        onClick={() => {
                          if (!adminNotes.trim()) {
                            showNotification("Add a reason in Admin Notes before rejecting.", "warning");
                            return;
                          }
                          doAction(
                            "rejectApplication",
                            () =>
                              reservationApi.update(reservation.id, {
                                status: "rejected",
                                applicationReviewReason: adminNotes.trim(),
                              }),
                            "Application rejected",
                          );
                        }}
                        disabled={isSubmitting}
                      >
                        Reject Application
                      </button>
                    )}

                    {allowedActions.includes("cancelled") && !cancellationPending && (
                      <button
                        className="rdm-action rdm-action-danger-outline"
                        onClick={() =>
                          doAction(
                            "cancel",
                            () =>
                              reservationApi.update(reservation.id, {
                                status: "cancelled",
                              }),
                            "Reservation cancelled",
                          )
                        }
                        disabled={isSubmitting}
                      >
                        Cancel Reservation
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Card 2: Quick Financial Summary */}
          <div className="rdm-side-card">
            <h4 className="rdm-side-title">Quick Summary</h4>
            <div className="rdm-side-summary-list">
              <div className="rdm-side-summary-item">
                <span>Reservation Fee</span>
                <strong>{formatPhpCurrency(pricingDisplay?.reservationFeeAmount ?? reservationFeeAmount)}</strong>
              </div>
              <div className="rdm-side-summary-item">
                <span>One-Month Advance Rent</span>
                <strong>{formatPhpCurrency(advanceRentAmount)}</strong>
              </div>
              <div className="rdm-side-summary-item">
                <span>One-Month Security Deposit</span>
                <strong>{formatPhpCurrency(securityDepositAmount)}</strong>
              </div>
              {showApplianceBlock && monthlyApplianceSubtotal > 0 && (
                <div className="rdm-side-summary-item">
                  <span>Monthly Appliance Add-ons</span>
                  <strong>+{formatPhpCurrency(monthlyApplianceSubtotal)}/mo</strong>
                </div>
              )}
              {initialTotalDue !== null && (
                <div className="rdm-side-summary-item rdm-side-summary-total">
                  <span>Initial Total Due</span>
                  <strong>{formatPhpCurrency(initialTotalDue)}</strong>
                </div>
              )}
              {/* Reservation Fee Status & View Receipt */}
              <div className="rdm-side-summary-item rdm-side-summary-item--with-action">
                <div className="rdm-side-summary-item-main">
                  <span>Reservation Fee Status</span>
                  <span
                    className="rdm-summary-badge"
                    style={{ color: reservationFeeBadge.color }}
                  >
                    <span
                      className="rdm-summary-badge-dot"
                      style={{ backgroundColor: reservationFeeBadge.dot }}
                    />
                    {reservationFeeBadge.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="rdm-view-receipt-btn"
                  onClick={handleViewReservationFeeReceipt}
                  disabled={!isReservationFeeSettled}
                  title={
                    isReservationFeeSettled
                      ? "View official Reservation Fee receipt"
                      : "Receipt unavailable — Reservation Fee has not been settled yet"
                  }
                >
                  <Receipt size={13} />
                  <span>View Reservation Fee Receipt</span>
                </button>
              </div>

              {/* Advance & Deposit Status & View Receipt */}
              <div className="rdm-side-summary-item rdm-side-summary-item--with-action">
                <div className="rdm-side-summary-item-main">
                  <span>Advance &amp; Deposit Status</span>
                  <span
                    className="rdm-summary-badge"
                    style={{ color: moveInPaymentBadge.color }}
                  >
                    <span
                      className="rdm-summary-badge-dot"
                      style={{ backgroundColor: moveInPaymentBadge.dot }}
                    />
                    {moveInPaymentBadge.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="rdm-view-receipt-btn"
                  onClick={handleViewMoveInReceipt}
                  disabled={!isMoveInSettled}
                  title={
                    isMoveInSettled
                      ? "View official Advance & Deposit settlement receipt"
                      : "Receipt unavailable — Advance Rent & Security Deposit have not been settled yet"
                  }
                >
                  <Receipt size={13} />
                  <span>View Advance &amp; Deposit Receipt</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Activity Timeline (Collapsible) */}
          <div className="rdm-side-card rdm-side-collapsible-card">
            <button
              type="button"
              className="rdm-side-collapsible-header"
              onClick={() => setShowTimeline((prev) => !prev)}
              aria-expanded={showTimeline}
            >
              <div className="rdm-side-collapsible-title-wrap">
                <h4 className="rdm-side-title">Activity Timeline</h4>
                {activityTimeline.length > 0 && (
                  <span className="rdm-timeline-count-badge">
                    {activityTimeline.length} events
                  </span>
                )}
              </div>
              <svg
                className={`rdm-collapsible-chevron ${showTimeline ? "open" : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* When collapsed: Highlight ONLY the current event */}
            {!showTimeline && currentTimelineItem && (
              <div
                className="rdm-timeline-current-highlight"
                style={{
                  backgroundColor: appearance.bg,
                  border: `1px solid ${appearance.color}35`,
                }}
              >
                <div className="rdm-timeline-current-header">
                  <span
                    className="rdm-timeline-dot"
                    style={{
                      background: appearance.dot,
                      boxShadow: `0 0 0 3px ${appearance.dot}30`,
                      width: 8,
                      height: 8,
                    }}
                  />
                  <span className="rdm-timeline-current-tag" style={{ color: appearance.color }}>
                    Current State
                  </span>
                </div>
                <div className="rdm-timeline-current-body">
                  <strong className="rdm-timeline-current-title" style={{ color: appearance.color }}>
                    {currentTimelineItem.date || appearance.label}
                  </strong>
                  <div className="rdm-timeline-current-meta">
                    <span>{currentTimelineItem.label}</span>
                    {currentTimelineItem.time && (
                      <>
                        <span className="rdm-timeline-sep">•</span>
                        <span className="rdm-timeline-time">{currentTimelineItem.time}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* When expanded: Show full connected timeline track */}
            {showTimeline && (
              <div className="rdm-timeline">
                {activityTimeline.map((item, index) => (
                  <div className="rdm-timeline-item" key={`${item.label}-${index}`}>
                    <div className="rdm-timeline-track">
                      <span
                        className="rdm-timeline-dot"
                        style={
                          item.isCurrent
                            ? { background: appearance.dot, boxShadow: `0 0 0 3px ${appearance.dot}30` }
                            : undefined
                        }
                      />
                      {index < activityTimeline.length - 1 && <span className="rdm-timeline-line" />}
                    </div>
                    <div className="rdm-timeline-copy">
                      <span className="rdm-timeline-label">{item.label}</span>
                      <div className="rdm-timeline-value">
                        <span style={item.isCurrent ? { fontWeight: 700, color: appearance.color } : undefined}>
                          {item.date}
                        </span>
                        {item.time && (
                          <>
                            <span className="rdm-timeline-sep">•</span>
                            <span className="rdm-timeline-time">{item.time}</span>
                          </>
                        )}
                        {item.meta && (
                          <span className="rdm-timeline-meta">({item.meta})</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
 </div>
 </div>
 </div>

 {showExtendPrompt && (
    <div
      className="rdm-extend-overlay"
      onClick={() => setShowExtendPrompt(false)}
    >
      <div
        className="rdm-reschedule-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rdm-reschedule-header">
          <div className="rdm-reschedule-icon-wrap">
            <Calendar size={18} className="rdm-reschedule-icon" />
          </div>
          <div className="rdm-reschedule-titles">
            <h3 className="rdm-reschedule-title">Reschedule Move-In Date</h3>
            <p className="rdm-reschedule-subtitle">
              Update the expected arrival date while keeping the reservation on standby.
            </p>
          </div>
        </div>

        <div className="rdm-reschedule-body">
          <div className="rdm-reschedule-current-info">
            <span className="rdm-reschedule-info-label">Current Scheduled Move-In:</span>
            <strong className="rdm-reschedule-info-val">
              {fmtDate(readMoveInDate(reservation)) || "Not set"}
            </strong>
          </div>

          <div className="rdm-reschedule-field">
            <label className="rdm-reschedule-label">
              New Expected Move-In Date <span className="rdm-asterisk">*</span>
            </label>
            <input
              type="date"
              value={rescheduleMoveInDate}
              min={todayDateStr}
              onChange={(event) => setRescheduleMoveInDate(event.target.value)}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {}
              }}
              className="rdm-reschedule-date-input"
              autoFocus
            />
          </div>

          <div className="rdm-reschedule-presets-group">
            <span className="rdm-reschedule-presets-label">Quick adjust shortcuts:</span>
            <div className="rdm-reschedule-presets">
              {[3, 7, 14, 30].map((days) => {
                const base = readMoveInDate(reservation)
                  ? new Date(readMoveInDate(reservation))
                  : new Date();
                const target = new Date(base);
                target.setDate(target.getDate() + days);
                const targetStr = toDateInputValue(target);
                const isSelected = rescheduleMoveInDate === targetStr;

                return (
                  <button
                    key={days}
                    type="button"
                    className={`rdm-reschedule-chip ${isSelected ? "rdm-reschedule-chip--active" : ""}`}
                    onClick={() => setRescheduleMoveInDate(targetStr)}
                  >
                    <span className="rdm-reschedule-chip-title">+{days} Days</span>
                    <span className="rdm-reschedule-chip-date">{fmtDate(targetStr)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rdm-reschedule-actions">
          <button
            type="button"
            className="rdm-reschedule-cancel"
            onClick={() => setShowExtendPrompt(false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rdm-reschedule-confirm"
            onClick={() => {
              if (cancellationPending) {
                showNotification(
                  "Cannot reschedule move-in while a cancellation request is pending review.",
                  "warning",
                );
                return;
              }
              if (!rescheduleMoveInDate) {
                showNotification("A valid move-in date is required.", "error");
                return;
              }
              setShowExtendPrompt(false);
              doAction(
                "extend",
                () =>
                  reservationApi.extend(reservation.id, {
                    newMoveInDate: rescheduleMoveInDate,
                  }),
                `Move-in rescheduled to ${fmtDate(rescheduleMoveInDate)}`,
              );
            }}
            disabled={isSubmitting || !rescheduleMoveInDate || cancellationPending}
            title={
              cancellationPending
                ? "Reschedule locked: A cancellation request is pending admin review."
                : undefined
            }
          >
            {isSubmitting ? "Saving..." : "Save Reschedule"}
          </button>
        </div>
      </div>
    </div>
  )}

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => {
          if (!isSubmitting) {
            setConfirmModal((previous) => ({ ...previous, open: false }));
          }
        }}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
        loadingText={confirmModal.loadingText || "Processing..."}
        loading={isSubmitting}
      />

      {revisionModal.open && (
        <RevisionReasonModal
          loading={isSubmitting}
          onClose={() => {
            if (!isSubmitting) {
              setRevisionModal({ open: false });
            }
          }}
          onSubmit={async (reason) => {
            setIsSubmitting(true);
            try {
              await reservationApi.update(reservation.id, {
                status: "needs_revision",
                applicationReviewReason: reason,
              });
              showNotification("Revision request sent to applicant", "success");
              setRevisionModal({ open: false });
              onUpdate?.();
              onClose();
            } catch (error) {
              setRevisionModal({ open: false });
              console.error(error);
              showNotification(
                getFriendlyError(error, "Failed to send revision request. Please try again."),
                "error",
              );
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      )}
    </>,
    document.body,
  );
}

/* ──────────────────────────────────────────────────────────────
   RevisionReasonModal — template-based revision request modal
────────────────────────────────────────────────────────────── */

const REVISION_TEMPLATES = [
  {
    id: "blurry_id",
    label: "Blurry / Unreadable ID",
    text: "Uploaded ID is blurry or unreadable. Please upload a clear, legible photo.",
  },
  {
    id: "wrong_doc_type",
    label: "Wrong Document Type",
    text: "Incorrect document type. Please upload the requested valid document.",
  },
  {
    id: "incomplete_info",
    label: "Incomplete Information",
    text: "Incomplete application details. Please fill out all required fields.",
  },
  {
    id: "mismatch_name",
    label: "Name Mismatch",
    text: "Name on ID does not match application details. Please verify and correct.",
  },
  {
    id: "missing_nbi",
    label: "Missing NBI Clearance",
    text: "NBI Clearance is missing. Please upload a valid clearance document.",
  },
  {
    id: "expired_id",
    label: "Expired ID",
    text: "Submitted ID is expired. Please provide a valid, unexpired ID.",
  },
  {
    id: "selfie_issue",
    label: "Selfie Photo Issue",
    text: "Selfie photo does not meet requirements. Please upload a clear, well-lit photo.",
  },
  {
    id: "company_id_missing",
    label: "Missing Company / School ID",
    text: "Company or school ID missing. Please upload a valid institutional ID.",
  },
];

function RevisionReasonModal({ onClose, onSubmit, loading = false }) {
  const [selected, setSelected] = useState([]);
  const [customNote, setCustomNote] = useState("");

  const toggleTemplate = (template) => {
    if (loading) return;
    setSelected((prev) =>
      prev.find((t) => t.id === template.id)
        ? prev.filter((t) => t.id !== template.id)
        : [...prev, template],
    );
  };

  const composedReason = [
    ...selected.map((t) => `• ${t.text}`),
    ...(customNote.trim() ? [`• ${customNote.trim()}`] : []),
  ].join("\n");

  const canSubmit = selected.length > 0 || customNote.trim().length > 0;

  return (
    <div
      className="rdm-revision-overlay"
      onClick={(e) => {
        if (!loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-busy={loading ? "true" : undefined}
    >
      <div
        className="rdm-revision-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rdm-revision-header">
          <h3 className="rdm-revision-title">Request Revision</h3>
          <p className="rdm-revision-subtitle">
            Select the reason(s) for requesting a revision. The applicant will
            see these in their notification.
          </p>
        </div>

        <div className="rdm-revision-templates">
          {REVISION_TEMPLATES.map((tpl) => {
            const isActive = selected.find((t) => t.id === tpl.id);
            return (
              <button
                key={tpl.id}
                type="button"
                className={`rdm-revision-chip ${isActive ? "rdm-revision-chip--active" : ""}`}
                onClick={() => toggleTemplate(tpl)}
                disabled={loading}
              >
                <span className="rdm-revision-chip-check">
                  {isActive ? "✓" : "+"}
                </span>
                {tpl.label}
              </button>
            );
          })}
        </div>

        <div className="rdm-revision-custom">
          <label className="rdm-revision-custom-label">
            Additional notes (optional)
          </label>
          <textarea
            className="rdm-notes-input"
            placeholder="Add specific details about what needs to be corrected..."
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            rows="3"
            disabled={loading}
          />
        </div>

        {composedReason && (
          <div className="rdm-revision-preview">
            <span className="rdm-revision-preview-label">Preview</span>
            <p className="rdm-revision-preview-text">{composedReason}</p>
          </div>
        )}

        <div className="rdm-revision-actions">
          <button
            type="button"
            className="rdm-action rdm-action-outline"
            onClick={onClose}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            <XCircle size={16} />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            className="rdm-action rdm-action-dark"
            disabled={!canSubmit || loading}
            onClick={() => onSubmit(composedReason)}
            style={{ opacity: loading ? 0.85 : !canSubmit ? 0.5 : 1, cursor: loading || !canSubmit ? "not-allowed" : "pointer" }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Sending Revision Request...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                <span>Send Revision Request</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
