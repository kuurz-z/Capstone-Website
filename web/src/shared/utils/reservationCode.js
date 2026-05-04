export const generateReservationCode = (reservationId) => {
  if (!reservationId) return "N/A";
  const normalized = String(reservationId).replace(/[^a-zA-Z0-9]/g, "");
  const prefix = normalized.substring(0, 3).toUpperCase();
  const suffix = normalized.substring(normalized.length - 4).toUpperCase();
  return `RES-${prefix}${suffix}`;
};
