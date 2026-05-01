import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * ============================================================================
 * EXPORT UTILITIES (CSV, EXCEL, PDF)
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
 * Filter out columns not meant for export (e.g., action columns)
 */
function getExportableColumns(columns) {
  return columns.filter((col) => {
    if (col.excludeFromExport) return false;
    if (col.key === "actions" || col.label === "Actions" || col.key === "action") return false;
    return true;
  });
}

/**
 * Extract textual data from a row dynamically for non-CSV exports.
 */
function getExportCellText(row, col) {
  if (typeof col.exportFormatter === "function") {
    return col.exportFormatter(row, col);
  }
  if (typeof col.formatter === "function") {
    return col.formatter(row[col.key], row);
  }
  const val = row[col.key || col.accessor];
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    // If it's a deeply nested object, we can stringify, but often it's not meant to be exported.
    if (Object.keys(val).length > 0) return JSON.stringify(val);
    return "";
  }
  return String(val);
}

/**
 * Convert array of objects to Excel format (.xlsx) and trigger download.
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @param {string} filename - Filename without extension
 */
export function exportToExcel(data, columns, filename = "export") {
  if (!data || data.length === 0) return;

  const exportCols = getExportableColumns(columns);
  const headers = exportCols.map((c) => c.label || c.key);
  const rows = data.map((row) =>
    exportCols.map((col) => getExportCellText(row, col))
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Convert array of objects to PDF format and trigger download.
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @param {string} filename - Filename without extension
 * @param {string} title - Optional title at top of PDF
 */
export function exportToPDF(data, columns, filename = "export", title = "Export Data") {
  if (!data || data.length === 0) return;

  const exportCols = getExportableColumns(columns);
  const headers = exportCols.map((c) => c.label || c.key);
  const rows = data.map((row) =>
    exportCols.map((col) => getExportCellText(row, col))
  );

  const doc = new jsPDF("landscape");
  
  if (title) {
    doc.setFontSize(14);
    doc.text(title, 14, 15);
  }
  
  autoTable(doc, {
    startY: title ? 20 : 10,
    head: [headers],
    body: rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [52, 73, 94] },
    margin: { top: 20 },
  });
  
  doc.save(`${filename}.pdf`);
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
  {
    key: "moveInDate",
    label: "Move In",
    formatter: (v) => (v ? new Date(v).toLocaleDateString("en-PH") : ""),
  },
  { key: "leaseDuration", label: "Lease (months)" },
  { key: "totalPrice", label: "Total Price (₱)", formatter: (v) => (v || 0).toFixed(2) },
  { key: "createdAt", label: "Created", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];
