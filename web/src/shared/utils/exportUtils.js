/**
 * ============================================================================
 * CSV EXPORT UTILITY
 * ============================================================================
 *
 * Client-side CSV generation and download utility.
 * No external dependencies required.
 *
 * Usage:
 *   import { exportToCSV } from "shared/utils/exportUtils";
 *   exportToCSV(data, columns, "billing_report");
 *
 * ============================================================================
 */

/**
 * Convert array of objects to CSV and trigger download.
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @param {string} filename - Filename without extension
 */
export function exportToCSV(data, columns, filename = "export") {
  if (!data || data.length === 0) {
    return;
  }

  // Build header row
  const header = columns.map((col) => escapeCSV(col.label)).join(",");

  // Build data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = col.formatter ? col.formatter(row[col.key], row) : row[col.key];
        return escapeCSV(value);
      })
      .join(","),
  );

  const csvContent = [header, ...rows].join("\n");
  downloadFile(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
}

/**
 * Escape a value for CSV (handles commas, quotes, newlines)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Trigger file download in the browser
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// PRE-BUILT COLUMN CONFIGS
// ============================================================================

/**
 * Standard billing export columns
 */
export const BILLING_COLUMNS = [
  { key: "tenantName", label: "Tenant" },
  { key: "roomName", label: "Room" },
  { key: "billingMonth", label: "Billing Month" },
  { key: "rent", label: "Rent (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "electricity", label: "Electricity (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "water", label: "Water (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "penalty", label: "Penalty (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "totalAmount", label: "Total (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "paidAmount", label: "Paid (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "status", label: "Status" },
  { key: "dueDate", label: "Due Date", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];

/**
 * Standard user export columns
 */
export const USER_COLUMNS = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "role", label: "Role" },
  { key: "accountStatus", label: "Status" },
  { key: "branch", label: "Branch" },
  { key: "createdAt", label: "Joined", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];

/**
 * Standard reservation export columns
 */
export const RESERVATION_COLUMNS = [
  { key: "reservationCode", label: "Code" },
  { key: "tenantName", label: "Tenant" },
  { key: "roomName", label: "Room" },
  { key: "status", label: "Status" },
  { key: "checkInDate", label: "Check-In", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
  { key: "leaseDuration", label: "Lease (months)" },
  { key: "totalPrice", label: "Total Price (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "createdAt", label: "Created", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];
