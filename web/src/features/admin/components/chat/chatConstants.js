import { chatApi } from "../../../../shared/api/chatApi.js";
import { BRANCH_DISPLAY_NAMES } from "../../../../shared/utils/constants.js";

export const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In Review" },
  { value: "waiting_tenant", label: "Waiting for Tenant" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const STATUS_DESCRIPTIONS = {
  open: "Conversation is active and awaiting staff response or triage.",
  in_review: "Staff is currently investigating and working on the tenant's concern.",
  waiting_tenant: "Staff replied; awaiting further information from the tenant.",
  resolved: "Admin resolved the concern with a resolution note.",
  closed: "Permanently closes and archives the conversation thread with an audit note.",
};

export const PRIORITY_DESCRIPTIONS = {
  normal: "Standard priority ticket with standard target turnaround timeline.",
  high: "High priority ticket requiring prioritized administrative attention.",
  urgent: "Critical urgent issue requiring immediate response and handling.",
};

export const STATUS_SECTION_ORDER = [
  "open",
  "in_review",
  "waiting_tenant",
  "resolved",
  "closed",
];

export const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "billing_concern", label: "Billing Concern" },
  { value: "maintenance_concern", label: "Maintenance Concern" },
  { value: "reservation_concern", label: "Reservation Concern" },
  { value: "payment_concern", label: "Payment Concern" },
  { value: "general_inquiry", label: "General Inquiry" },
];

export const CATEGORY_FALLBACK_LABELS = {
  urgent_issue: "Urgent Issue",
  billing_dispute: "Billing & Utility Inquiry",
  contract_lease: "Contract Renewal & Move-Out",
  facility_repair: "Room & Facility Maintenance",
  security_curfew: "Curfew & Security Concern",
  roommate_concern: "Roommate & Common Space Concern",
};

export const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const QUICK_REPLIES = [
  "We have received your concern.",
  "Please provide more details.",
  "Your request is being processed.",
  "Please confirm whether this resolved your concern.",
];

export const MAX_SUPPORT_ATTACHMENTS = 5;

export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

export const fmtDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const fmtShortTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const fmtDateDivider = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
};

export const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export const fmtFileSize = (bytes) => {
  if (!bytes || Number.isNaN(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const fmtRelativeTime = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const AVATAR_BG_COLORS = [
  "bg-slate-700 text-white",
  "bg-blue-700 text-white",
  "bg-amber-700 text-white",
  "bg-emerald-700 text-white",
  "bg-indigo-700 text-white",
  "bg-teal-700 text-white",
];

export const getAvatarBg = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index];
};

export const getInitials = (name = "T") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0]?.[0] || "T").toUpperCase();
};

export const getBranchLabel = (branch) =>
  BRANCH_DISPLAY_NAMES[branch] || branch || "Unassigned";

export const getRoomLabel = (conversation) =>
  [conversation?.roomNumber, conversation?.roomBed].filter(Boolean).join(" / ") ||
  "No room assigned";

export const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.detail ||
  error?.message ||
  fallback;

export const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character] || character;
  });

export const getStatusLabel = (status) =>
  STATUS_OPTIONS.find((item) => item.value === status)?.label || "Open";

export const getCategoryLabel = (category) =>
  CATEGORY_OPTIONS.find((item) => item.value === category)?.label ||
  CATEGORY_FALLBACK_LABELS[category] ||
  "General Inquiry";

export const getPriorityLabel = (priority) =>
  PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || "Normal";

export const slugify = (value) =>
  String(value || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function addWrappedPdfText(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  return y + Math.max(lines.length, 1) * lineHeight;
}

export async function downloadChatTranscript(selectedConversation, messages) {
  if (!selectedConversation) return;
  let transcriptMessages = messages;
  if (!transcriptMessages.length) {
    const data = await chatApi.getAdminMessages(selectedConversation.id);
    transcriptMessages = data?.messages || [];
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 18;

  const ensureSpace = (needed = 16) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("LilyCrest Support Chat Transcript", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, margin, y);
  y += 10;

  const details = [
    ["Inquiry ID", selectedConversation.ticketId || "Not assigned"],
    ["Tenant", selectedConversation.tenantName],
    ["Branch / Room", `${getBranchLabel(selectedConversation.branch)} - ${getRoomLabel(selectedConversation)}`],
    ["Category", getCategoryLabel(selectedConversation.category)],
    ["Priority", getPriorityLabel(selectedConversation.priority)],
    ["Status", getStatusLabel(selectedConversation.status)],
    ["Assigned Admin", selectedConversation.assignedAdminName || "Unassigned"],
    ["Closed Date", fmtDateTime(selectedConversation.closedAt) || "Not closed"],
  ];

  doc.setFont("helvetica", "bold");
  doc.text("Conversation Details", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  details.forEach(([label, value]) => {
    ensureSpace(7);
    doc.text(`${label}:`, margin, y);
    y = addWrappedPdfText(doc, value || "-", margin + 38, y, pageWidth - margin * 2 - 38, 5);
  });

  if (selectedConversation.closingNote) {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.text("Closing Note", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    y = addWrappedPdfText(doc, selectedConversation.closingNote, margin, y, pageWidth - margin * 2, 5);
  }

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Messages", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");

  if (!transcriptMessages.length) {
    doc.text("No messages yet.", margin, y);
  } else {
    transcriptMessages.forEach((message) => {
      ensureSpace(22);
      const sender = `${message.senderName || "User"} (${message.senderRole || "user"})`;
      doc.setFont("helvetica", "bold");
      doc.text(sender, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(fmtDateTime(message.createdAt), pageWidth - margin - 44, y);
      y += 6;
      y = addWrappedPdfText(doc, message.message, margin, y, pageWidth - margin * 2, 5);
      y += 4;
    });
  }

  const filename = `lilycrest-chat-${slugify(selectedConversation.tenantName)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
