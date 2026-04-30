/**
 * Canonical list of payment methods supported across the system.
 * Import this constant into every model that carries a paymentMethod /
 * method field so that adding a new channel requires a single edit here.
 */
export const PAYMENT_METHODS = Object.freeze([
  "bank",
  "gcash",
  "card",
  "check",
  "cash",
  "paymongo",
  "paymaya",
  "grab_pay",
  "maya",
  "online",
]);
