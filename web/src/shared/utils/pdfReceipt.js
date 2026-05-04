/**
 * pdfReceipt.js — Payment receipt PDF generation
 * Used by BillingPage.jsx for paid bill receipt downloads.
 * Delegates to receiptGenerator.js for the actual PDF logic.
 */

/**
 * Generate and download a payment receipt PDF for a paid bill.
 * @param {Object} bill - Bill object (status should be "paid")
 */
export const generateBillingReceipt = async (bill) => {
  try {
    const { generateReceiptPDF } = await import("./receiptGenerator.js");
    if (typeof generateReceiptPDF === "function") {
      return generateReceiptPDF(bill);
    }
  } catch (err) {
    console.error("Receipt generation failed:", err);
  }

  // Fallback: text receipt
  const receiptNo = bill.paymongoPaymentId
    ? bill.paymongoPaymentId.slice(-12).toUpperCase()
    : (bill.id || bill._id || "N/A").slice(-8).toUpperCase();

  const lines = [
    "LILYCREST DORMITORY",
    "PAYMENT RECEIPT",
    "=".repeat(40),
    `Receipt No.:   ${receiptNo}`,
    `Date Paid:     ${new Date(bill.paymentDate || bill.updatedAt).toLocaleDateString("en-PH")}`,
    `Billing Period:${new Date(bill.billingMonth).toLocaleDateString("en-PH", { year: "numeric", month: "long" })}`,
    `Payment Method:${bill.paymentMethod || "N/A"}`,
    "-".repeat(40),
    `Amount Paid:   ₱${(bill.paidAmount || bill.totalAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    "",
    "Thank you for your payment — Lilycrest Dormitory",
  ];

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${receiptNo}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
