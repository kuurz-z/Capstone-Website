/**
 * Reservation progress calculation logic.
 * Extracted from ProfilePage.getReservationProgress() (~160 lines).
 *
 * Computes the current step, step statuses, and step metadata
 * for the reservation progress tracker.
 */

const STEP_ORDER = [
  "room_selected",
  "visit_scheduled",
  "visit_completed",
  "application_submitted",
  "payment_submitted",
  "confirmed",
];

export const DEFAULT_STEPS = [
  {
    step: "room_selected",
    title: "1. Room Selection",
    description: "Select a room to reserve",
    status: "current",
  },
  {
    step: "visit_scheduled",
    title: "2. Policies & Visit Scheduled",
    description: "Acknowledge policies and schedule your room visit",
    status: "locked",
  },
  {
    step: "visit_completed",
    title: "3. Visit Completed",
    description: "Room visit completed and verified",
    status: "locked",
  },
  {
    step: "application_submitted",
    title: "4. Tenant Application Submitted",
    description: "Personal details and documents uploaded",
    status: "locked",
  },
  {
    step: "payment_submitted",
    title: "5. Payment Submitted",
    description: "Payment proof uploaded and verified",
    status: "locked",
  },
  {
    step: "confirmed",
    title: "6. Reservation Confirmed",
    description: "Reservation finalized and ready for move-in",
    status: "locked",
  },
];

export function getReservationProgress(reservation) {
  if (!reservation) {
    return { currentStep: "not_started", steps: [], currentStepIndex: -1 };
  }

  const status =
    reservation.reservationStatus || reservation.status || "pending";

  const hasRoom = Boolean(reservation.roomId);
  const hasPoliciesAccepted = Boolean(reservation.agreedToPrivacy === true);
  const hasVisitRequest = Boolean(
    reservation.viewingType && reservation.viewingType !== "none",
  );
  const isVisitScheduled = hasPoliciesAccepted && hasVisitRequest;
  const isVisitCompleted = Boolean(reservation.visitApproved === true);
  const hasApplication = Boolean(reservation.firstName && reservation.lastName);
  const hasPayment = Boolean(reservation.proofOfPaymentUrl);
  const isConfirmed =
    status === "confirmed" || reservation.paymentStatus === "paid";

  const isScheduleRejected = Boolean(reservation.scheduleRejected === true);
  const scheduleRejectionReason = reservation.scheduleRejectionReason || null;

  let currentStepIndex = -1;
  if (hasRoom) currentStepIndex = 0;
  if (reservation.roomConfirmed) currentStepIndex = 1;
  if (isVisitScheduled && !isScheduleRejected) currentStepIndex = 1;
  if (isVisitCompleted) currentStepIndex = 2;
  if (hasApplication) currentStepIndex = 3;
  if (hasPayment) currentStepIndex = 4;
  if (isConfirmed) currentStepIndex = 5;

  const isApplicationEditable =
    currentStepIndex >= 3 && !hasPayment && !isConfirmed;
  const isSchedulePendingApproval =
    isVisitScheduled && !reservation.scheduleApproved && !isScheduleRejected;
  const isPaymentPendingApproval = hasPayment && !isConfirmed;

  const steps = [
    {
      step: "room_selected",
      title: "1. Room Selection",
      description: "Room selected and reserved",
      status: currentStepIndex >= 0 ? "completed" : "current",
      completedDate: reservation.createdAt,
      roomName: reservation.roomId?.name || "Unknown Room",
      branch: reservation.roomId?.branch,
    },
    {
      step: "visit_scheduled",
      title: "2. Policies & Visit Scheduled",
      description: isScheduleRejected
        ? `Schedule rejected: ${scheduleRejectionReason || "Please reschedule your visit"}`
        : "Acknowledge policies and schedule your room visit",
      status: isScheduleRejected
        ? "rejected"
        : currentStepIndex >= 1
          ? isSchedulePendingApproval
            ? "pending_approval"
            : "completed"
          : currentStepIndex === 0
            ? "current"
            : "locked",
      completedDate: currentStepIndex >= 1 ? reservation.updatedAt : undefined,
      rejectionReason: scheduleRejectionReason,
      rejectedAt: reservation.scheduleRejectedAt,
    },
    {
      step: "visit_completed",
      title: "3. Visit Completed",
      description: reservation.scheduleApproved
        ? "Waiting for admin to verify visit completion"
        : "Complete your scheduled visit first",
      status:
        currentStepIndex >= 2
          ? "completed"
          : currentStepIndex === 1 && reservation.scheduleApproved
            ? "pending_approval"
            : "locked",
      completedDate:
        currentStepIndex >= 2 ? reservation.visitCompletedAt : undefined,
    },
    {
      step: "application_submitted",
      title: "4. Tenant Application Submitted",
      description: isApplicationEditable
        ? "Application submitted - can still edit"
        : isConfirmed
          ? "Application locked - reservation confirmed"
          : hasPayment
            ? "Application locked - payment submitted"
            : "Personal details and documents submitted",
      status:
        currentStepIndex >= 3
          ? "completed"
          : currentStepIndex === 2
            ? "current"
            : "locked",
      completedDate:
        currentStepIndex >= 3 ? reservation.applicationSubmittedAt : undefined,
      editable: isApplicationEditable,
    },
    {
      step: "payment_submitted",
      title: "5. Payment Submitted",
      description: isPaymentPendingApproval
        ? "Awaiting admin payment verification"
        : "Payment proof uploaded and verified",
      status: isPaymentPendingApproval
        ? "pending_approval"
        : currentStepIndex >= 4
          ? "completed"
          : currentStepIndex === 3
            ? "current"
            : "locked",
      completedDate:
        currentStepIndex >= 4 ? reservation.paymentDate : undefined,
    },
    {
      step: "confirmed",
      title: "6. Reservation Confirmed",
      description: isPaymentPendingApproval
        ? "Pending admin payment verification"
        : "Reservation fully confirmed and finalized",
      status: currentStepIndex >= 5 ? "completed" : "locked",
      completedDate:
        currentStepIndex >= 5 ? reservation.approvedDate : undefined,
    },
  ];

  return {
    currentStep: STEP_ORDER[currentStepIndex] || "room_selected",
    steps,
    currentStepIndex: Math.max(currentStepIndex, 0),
  };
}

/**
 * Determines the next action CTA for the user based on reservation progress.
 */
export function getNextAction(activeReservation, reservationProgress) {
  if (!activeReservation) {
    return {
      title: "Start Your Reservation",
      description: "Browse available rooms and start the reservation process",
      buttonText: "Browse Rooms",
      buttonLink: "/tenant/check-availability",
    };
  }

  const currentStep = reservationProgress.currentStep;

  switch (currentStep) {
    case "room_selected":
      return {
        title: "Confirm Room & Continue",
        description: "Review your selected room and confirm your choice.",
        buttonText: "Continue",
        buttonLink: "/tenant/reservation-flow",
        reservationId: activeReservation._id,
        step: 1,
      };
    case "visit_scheduled": {
      const hasVisitDate = Boolean(activeReservation.visitDate);
      if (!hasVisitDate) {
        return {
          title: "Schedule Your Visit",
          description:
            "Pick a date and time to visit the dormitory and review policies.",
          buttonText: "Schedule Visit",
          buttonLink: "/tenant/reservation-flow",
          reservationId: activeReservation._id,
          step: 2,
        };
      }
      return {
        title: "Waiting for Visit Completion",
        description:
          "Your visit has been scheduled. Please complete your visit and wait for admin verification.",
        buttonText: "View Status",
        buttonLink: "/tenant/profile",
        buttonVariant: "outline",
      };
    }
    case "visit_completed":
      return {
        title: "Submit Your Application",
        description:
          "Provide your personal details and upload required documents for admin review.",
        buttonText: "Fill Application Form",
        buttonLink: "/tenant/reservation-flow",
        reservationId: activeReservation._id,
        step: 4,
      };
    case "application_submitted":
      return {
        title: "Submit Your Payment",
        description:
          "Your application has been submitted. Upload your proof of payment to confirm your reservation.",
        buttonText: "Upload Payment",
        buttonLink: "/tenant/reservation-flow",
        reservationId: activeReservation._id,
        step: 5,
      };
    case "payment_submitted":
    case "confirmed":
      return {
        title: "Reservation Confirmed!",
        description:
          "Your reservation is confirmed! Prepare for move-in and check your email for contract details.",
        buttonText: "View Details",
        buttonLink: "/tenant/profile",
      };
    default:
      return {
        title: "Get Started",
        description: "Browse available rooms to begin your reservation",
        buttonText: "Browse Rooms",
        buttonLink: "/tenant/check-availability",
      };
  }
}
