/**
 * Constants for the ReservationFlowPage.
 */

export const RESERVATION_STAGES = [
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

/** Convert a File object to a base64 data URL */
export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
