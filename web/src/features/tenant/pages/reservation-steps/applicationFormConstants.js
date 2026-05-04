/**
 * Constants and date computation helpers for the Reservation Application form.
 * Extracted from ReservationApplicationStep.jsx.
 */

export const MOVE_IN_TIME_SLOTS = [
 { value: "08:00", label: "8:00 AM" },
 { value: "09:00", label: "9:00 AM" },
 { value: "10:00", label: "10:00 AM" },
 { value: "11:00", label: "11:00 AM" },
 { value: "12:00", label: "12:00 PM" },
 { value: "13:00", label: "1:00 PM" },
 { value: "14:00", label: "2:00 PM" },
 { value: "15:00", label: "3:00 PM" },
 { value: "16:00", label: "4:00 PM" },
 { value: "17:00", label: "5:00 PM" },
 { value: "18:00", label: "6:00 PM" },
];

export const REFERRAL_OPTIONS = [
 { id: "facebook", value: "facebook", label: "Facebook Ad" },
 { id: "instagram", value: "instagram", label: "Instagram" },
 { id: "tiktok", value: "tiktok", label: "TikTok" },
 { id: "walkin", value: "walkin", label: "Walk-in" },
 { id: "friend", value: "friend", label: "Referred by a Friend" },
 { id: "other", value: "other", label: "Other" },
];

export const WORK_SCHEDULE_OPTIONS = [
 { id: "dayshift", value: "day", label: "Day Shift (around 9 am to 5 pm)" },
 {
 id: "nightshift",
 value: "night",
 label: "Night Shift (around 11 pm to 7 am)",
 },
 { id: "others", value: "others", label: "Others" },
];

export const LEASE_OPTIONS = [
 { value: "12", label: "1 year" },
 { value: "6", label: "6 months" },
 { value: "5", label: "5 months" },
 { value: "4", label: "4 months" },
 { value: "3", label: "3 months" },
 { value: "2", label: "2 months" },
 { value: "1", label: "1 month" },
];

const formatDateInputValue = (date) => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, "0");
 const day = String(date.getDate()).padStart(2, "0");
 return `${year}-${month}-${day}`;
};

/** Compute date constraints relative to today */
export function getDateConstraints() {
 const today = new Date();
 const birthdayMax = new Date(
 today.getFullYear() - 18,
 today.getMonth(),
 today.getDate(),
 );
 const birthdayMin = new Date(
 today.getFullYear() - 80,
 today.getMonth(),
 today.getDate(),
 );
 const moveInMin = new Date(
 today.getFullYear(),
 today.getMonth(),
 today.getDate() + 3,
 );
 const moveInMax = new Date(
 today.getFullYear(),
 today.getMonth(),
 today.getDate() + 90,
 );
 return {
 birthdayMin: formatDateInputValue(birthdayMin),
 birthdayMax: formatDateInputValue(birthdayMax),
 moveInMin: formatDateInputValue(moveInMin),
 moveInMax: formatDateInputValue(moveInMax),
 };
}
