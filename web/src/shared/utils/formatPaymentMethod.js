/**
 * Format raw payment method values from PayMongo into display-friendly names.
 * Used across confirmation, dashboard, receipts, and PDFs.
 */
export const formatPaymentMethod = (method) => {
  if (!method) return "Online Payment";
  const key = method.toLowerCase().replace(/[_\s-]/g, "");
  const methods = {
    gcash: "GCash",
    paymaya: "Maya",
    maya: "Maya",
    card: "Credit/Debit Card",
    creditcard: "Credit/Debit Card",
    debitcard: "Credit/Debit Card",
    grabpay: "GrabPay",
    grab_pay: "GrabPay",
    bank: "Bank Transfer",
    banktransfer: "Bank Transfer",
    check: "Check",
    cash: "Cash",
    online: "Online Payment",
    paymongo: "Online Payment",
  };
  return methods[key] || method.charAt(0).toUpperCase() + method.slice(1);
};
