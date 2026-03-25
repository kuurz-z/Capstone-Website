/**
 * pdfUtils.js — Billing PDF generation utilities
 * Used by BillingPage.jsx to generate billing statement PDFs.
 */

/**
 * Generate and download a billing statement PDF for a given bill.
 * @param {Object} bill - Bill object with charges, dates, etc.
 */
export const generateBillingPDF = async (bill) => {
  try {
    // Dynamic import of receiptGenerator which has the actual jsPDF logic
    const { generateBillingReceiptPDF } = await import("./receiptGenerator.js");
    if (typeof generateBillingReceiptPDF === "function") {
      return generateBillingReceiptPDF(bill);
    }
  } catch (err) {
    console.error("PDF generation failed:", err);
  }

  // Fallback: generate a simple text-based download
  const lines = [
    "LILYCREST DORMITORY",
    "Billing Statement",
    "=".repeat(40),
    `Billing Period: ${new Date(bill.billingMonth).toLocaleDateString("en-PH", { year: "numeric", month: "long" })}`,
    `Room: ${bill.room || "N/A"} | Branch: ${bill.branch || "N/A"}`,
    `Due Date: ${new Date(bill.dueDate).toLocaleDateString("en-PH")}`,
    "",
    "CHARGES:",
    `  Monthly Rent:  ₱${(bill.charges?.rent || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    `  Electricity:   ₱${(bill.charges?.electricity || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    `  Water:         ₱${(bill.charges?.water || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    `  Penalty:       ₱${(bill.charges?.penalty || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    `  Discount:     -₱${(bill.charges?.discount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    "-".repeat(40),
    `  TOTAL:         ₱${(bill.totalAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    `  Status:        ${bill.status?.toUpperCase()}`,
  ];

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `billing-statement-${bill.id || "unknown"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};
