import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  FileDown,
  Filter,
  Inbox,
  LoaderCircle,
  Lock,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Tag,
  UserCheck,
  XCircle,
} from "lucide-react";
import { chatApi } from "../../../shared/api/chatApi.js";
import { useAuth } from "../../../shared/hooks/useAuth";
import useChatSocket from "../../../shared/hooks/useChatSocket.js";
import { showConfirmation, showNotification } from "../../../shared/utils/notification";
import { BRANCH_DISPLAY_NAMES, BRANCH_OPTIONS } from "../../../shared/utils/constants";
import "../styles/design-tokens.css";
import "../styles/admin-common.css";
import "../styles/admin-chat.css";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In Review" },
  { value: "waiting_tenant", label: "Waiting for Tenant" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const STATUS_SECTION_ORDER = [
  "open",
  "in_review",
  "waiting_tenant",
  "resolved",
  "closed",
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "billing_concern", label: "Billing Concern" },
  { value: "maintenance_concern", label: "Maintenance Concern" },
  { value: "reservation_concern", label: "Reservation Concern" },
  { value: "payment_concern", label: "Payment Concern" },
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "urgent_issue", label: "Urgent Issue" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const QUICK_REPLIES = [
  "We have received your concern.",
  "Please provide more details.",
  "Your request is being processed.",
  "This issue has been resolved.",
];

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };

const fmtDateTime = (value) => {
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

const getBranchLabel = (branch) => BRANCH_DISPLAY_NAMES[branch] || branch || "Unassigned";

const getRoomLabel = (conversation) =>
  [conversation?.roomNumber, conversation?.roomBed].filter(Boolean).join(" / ") ||
  "No room assigned";

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.detail ||
  error?.message ||
  fallback;

const escapeHtml = (value = "") =>
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

const getStatusLabel = (status) =>
  STATUS_OPTIONS.find((item) => item.value === status)?.label || "Open";

const getCategoryLabel = (category) =>
  CATEGORY_OPTIONS.find((item) => item.value === category)?.label ||
  "General Inquiry";

const getPriorityLabel = (priority) =>
  PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || "Normal";

const slugify = (value) =>
  String(value || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function addWrappedPdfText(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  return y + Math.max(lines.length, 1) * lineHeight;
}

export default function AdminChatPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner" || user?.role === "superadmin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [branchFilter, setBranchFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [accessInfo, setAccessInfo] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [listError, setListError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [replyError, setReplyError] = useState("");
  // Typing indicator state — cleared automatically after 4s of inactivity
  const [tenantTyping, setTenantTyping] = useState(null); // { name, conversationId }
  const typingClearRef = useRef(null);
  const typingSendRef = useRef(null);

  const filters = useMemo(
    () => ({
      status: statusFilter,
      branch: isOwner ? branchFilter : "all",
      unread: unreadOnly ? "true" : "",
      assigned: assignedToMeOnly ? "me" : "",
      priority: priorityFilter,
      category: categoryFilter,
      search: search.trim(),
    }),
    [
      assignedToMeOnly,
      branchFilter,
      categoryFilter,
      isOwner,
      priorityFilter,
      search,
      statusFilter,
      unreadOnly,
    ],
  );

  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setListLoading(true);
      setListError("");
      try {
        const data = await chatApi.getAdminConversations(filters);
        const nextConversations = data?.conversations || [];
        setConversations(nextConversations);
        setAccessInfo(data?.access || null);
        setSelectedConversation((current) => {
          if (!current) return current;
          return nextConversations.find((item) => item.id === current.id) || current;
        });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load conversations.");
        setListError(message);
        if (!silent) showNotification(message, "error");
      } finally {
        if (!silent) setListLoading(false);
      }
    },
    [filters],
  );

  const loadMessages = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) return [];
      if (!silent) setMessagesLoading(true);
      setMessagesError("");
      try {
        const data = await chatApi.getAdminMessages(conversationId);
        const nextMessages = data?.messages || [];
        setMessages(nextMessages);
        await loadConversations({ silent: true });
        return nextMessages;
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load messages.");
        setMessagesError(message);
        if (!silent) showNotification(message, "error");
        return [];
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [loadConversations],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadConversations();
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadConversations]);

  // Socket.IO — primary real-time update path.
  // Polling below is the fallback at a reduced 30s interval.
  const { isConnected: socketConnected } = useChatSocket({
    onTyping: ({ conversationId, senderRole, senderName } = {}) => {
      // Only surface tenant typing; admins seeing other admins type is noise.
      if (senderRole === "tenant" && selectedConversation?.id === conversationId) {
        setTenantTyping({ name: senderName, conversationId });
        window.clearTimeout(typingClearRef.current);
        typingClearRef.current = window.setTimeout(() => setTenantTyping(null), 4000);
      }
    },
    onMessageNew: (message, conversationId) => {
      if (!message) return;
      if (selectedConversation?.id !== conversationId) {
        loadConversations({ silent: true });
        return;
      }
      // Append to feed only if this conversation is open
      setMessages((current) => {
        const alreadyExists = current.some((m) => m.id === message.id);
        return alreadyExists ? current : [...current, message];
      });
      // Always refresh conversation list to update unread counts
      loadConversations({ silent: true });
    },
    onConversationUpdated: (updatedConversation) => {
      if (!updatedConversation) return;
      setConversations((current) =>
        current.map((c) => (c.id === updatedConversation.id ? updatedConversation : c)),
      );
      setSelectedConversation((current) => {
        if (!current || current.id !== updatedConversation.id) return current;
        return updatedConversation;
      });
    },
  });

  // Polling fallback — 30s when socket is connected, 10s when disconnected.
  useEffect(() => {
    const interval = socketConnected ? 30000 : 10000;
    const intervalId = window.setInterval(() => {
      loadConversations({ silent: true });
    }, interval);
    return () => window.clearInterval(intervalId);
  }, [loadConversations, socketConnected]);

  // Message polling fallback — only active when socket is disconnected.
  useEffect(() => {
    if (!selectedConversation?.id || socketConnected) return undefined;
    const intervalId = window.setInterval(() => {
      loadMessages(selectedConversation.id, { silent: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [loadMessages, selectedConversation?.id, socketConnected]);

  const groupedConversations = useMemo(() => {
    const sorted = [...conversations].sort((left, right) => {
      const priorityDiff =
        (PRIORITY_RANK[left.priority || "normal"] ?? 2) -
        (PRIORITY_RANK[right.priority || "normal"] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;
      const unreadDiff = (right.unreadAdminCount || 0) - (left.unreadAdminCount || 0);
      if (unreadDiff !== 0) return unreadDiff;
      const leftDate = new Date(left.lastMessageAt || left.updatedAt || 0).getTime();
      const rightDate = new Date(right.lastMessageAt || right.updatedAt || 0).getTime();
      return rightDate - leftDate;
    });

    return STATUS_SECTION_ORDER.map((status) => ({
      status,
      label: getStatusLabel(status),
      items: sorted.filter((conversation) => (conversation.status || "open") === status),
    })).filter((group) => group.items.length > 0);
  }, [conversations]);

  const handleSelectConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setReplyText("");
    setReplyError("");
    setCloseNote(conversation.closingNote || "");
    await loadMessages(conversation.id);
  };

  const handleRefresh = async () => {
    await loadConversations();
    if (selectedConversation?.id) {
      await loadMessages(selectedConversation.id);
    }
    showNotification("Support chat refreshed.", "success");
  };

  const handleSendReply = async () => {
    const message = replyText.trim();
    if (!selectedConversation || sending) return;
    if (!message) {
      setReplyError("Message cannot be empty.");
      return;
    }
    if (message.length > 1000) {
      setReplyError("Message must be 1000 characters or fewer.");
      return;
    }
    if (selectedConversation.status === "closed") {
      setReplyError("This conversation is closed.");
      return;
    }

    setSending(true);
    setReplyError("");
    try {
      const data = await chatApi.sendAdminMessage(selectedConversation.id, message);
      setReplyText("");
      setMessages((current) => [...current, data.message].filter(Boolean));
      setSelectedConversation(data.conversation);
      await loadConversations({ silent: true });
      showNotification("Reply sent successfully.", "success");
    } catch (error) {
      const messageText = getErrorMessage(error, "Failed to send reply.");
      setReplyError(messageText);
      showNotification(messageText, "error");
    } finally {
      setSending(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedConversation || assigning) return;
    setAssigning(true);
    try {
      const data = await chatApi.assignConversation(selectedConversation.id, "me");
      setSelectedConversation(data.conversation);
      await loadConversations({ silent: true });
      showNotification("Conversation assigned successfully.", "success");
    } catch (error) {
      showNotification(
        getErrorMessage(error, "Failed to assign conversation."),
        "error",
      );
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (!selectedConversation || updatingStatus) return;
    if (status === selectedConversation.status) return;
    if (status === "closed") {
      setReplyError("Use the close action and enter a closing note.");
      return;
    }

    setUpdatingStatus(true);
    try {
      const data = await chatApi.updateStatus(selectedConversation.id, status);
      setSelectedConversation(data.conversation);
      await loadConversations({ silent: true });
      showNotification("Conversation status updated.", "success");
    } catch (error) {
      showNotification(
        getErrorMessage(error, "Failed to update conversation status."),
        "error",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    if (!selectedConversation || updatingPriority) return;
    if (priority === selectedConversation.priority) return;

    setUpdatingPriority(true);
    try {
      const data = await chatApi.updatePriority(selectedConversation.id, priority);
      setSelectedConversation(data.conversation);
      await loadConversations({ silent: true });
      showNotification("Conversation priority updated.", "success");
    } catch (error) {
      showNotification(
        getErrorMessage(error, "Failed to update conversation priority."),
        "error",
      );
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleCloseConversation = async () => {
    if (!selectedConversation || closing) return;
    const note = closeNote.trim();
    if (!note) {
      setReplyError("Please enter a closing note.");
      showNotification("Please enter a closing note.", "warning");
      return;
    }

    const confirmed = await showConfirmation(
      `Close this conversation with ${escapeHtml(selectedConversation.tenantName)}? Closing note: ${escapeHtml(note)}. Messages will stay visible, but replies will be locked.`,
      "Close Conversation",
      "Cancel",
    );
    if (!confirmed) return;

    setClosing(true);
    try {
      const data = await chatApi.closeConversation(selectedConversation.id, note);
      setSelectedConversation(data.conversation);
      await loadConversations({ silent: true });
      showNotification("Conversation closed.", "success");
    } catch (error) {
      showNotification(
        getErrorMessage(error, "Failed to close conversation."),
        "error",
      );
    } finally {
      setClosing(false);
    }
  };

  const handleDownloadTranscript = async () => {
    if (!selectedConversation || downloading) return;
    setDownloading(true);
    try {
      let transcriptMessages = messages;
      if (!transcriptMessages.length) {
        const data = await chatApi.getAdminMessages(selectedConversation.id);
        transcriptMessages = data?.messages || [];
        setMessages(transcriptMessages);
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
      showNotification("Chat transcript downloaded.", "success");
    } catch (error) {
      showNotification(
        getErrorMessage(error, "Failed to download transcript."),
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };

  const unreadTotal = conversations.reduce(
    (total, item) => total + (item.unreadAdminCount || 0),
    0,
  );
  const urgentTotal = conversations.filter((item) => item.priority === "urgent").length;
  const assignedToMeTotal = conversations.filter(
    (item) => item.assignedAdminId && item.assignedAdminId === accessInfo?.adminId,
  ).length;
  const assignedToAnother =
    selectedConversation?.assignedAdminId &&
    accessInfo?.adminId &&
    selectedConversation.assignedAdminId !== accessInfo.adminId;

  return (
    <section className="admin-chat-page">
      <div className="chat-summary-row">
        <div className="chat-summary-card">
          <MessageSquareText size={18} />
          <div>
            <span className="chat-summary-value">{conversations.length}</span>
            <span className="chat-summary-label">Conversations</span>
          </div>
        </div>
        <div className="chat-summary-card">
          <CircleAlert size={18} />
          <div>
            <span className="chat-summary-value">{unreadTotal}</span>
            <span className="chat-summary-label">Unread</span>
          </div>
        </div>
        <div className="chat-summary-card chat-summary-card--urgent">
          <AlertTriangle size={18} />
          <div>
            <span className="chat-summary-value">{urgentTotal}</span>
            <span className="chat-summary-label">Urgent</span>
          </div>
        </div>
        <div className="chat-summary-card">
          <UserCheck size={18} />
          <div>
            <span className="chat-summary-value">{assignedToMeTotal}</span>
            <span className="chat-summary-label">Assigned to me</span>
          </div>
        </div>
        <button
          type="button"
          className="chat-refresh-btn"
          onClick={handleRefresh}
          disabled={listLoading || messagesLoading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <span
          className={`chat-socket-status ${socketConnected ? "chat-socket-status--live" : "chat-socket-status--polling"}`}
          title={socketConnected ? "Real-time active" : "Polling fallback active"}
        >
          <span className="chat-socket-status__dot" />
          {socketConnected ? "Live" : "Polling"}
        </span>
      </div>

      <div className="chat-workspace">
        <aside className="chat-list-panel">
          <div className="chat-filters">
            <label className="chat-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tenant or message"
              />
            </label>

            <label className="chat-filter-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="chat-filter-2col">
              <label className="chat-filter-field">
                <span>Priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  {PRIORITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="chat-filter-field">
                <span>Category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isOwner ? (
              <label className="chat-filter-field">
                <span>Branch</span>
                <select
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                >
                  <option value="all">All branches</option>
                  {BRANCH_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="chat-toggle-row">
              <button
                type="button"
                className={`chat-quick-toggle ${unreadOnly ? "is-active" : ""}`}
                onClick={() => setUnreadOnly((v) => !v)}
              >
                Unread only
              </button>
              <button
                type="button"
                className={`chat-quick-toggle ${assignedToMeOnly ? "is-active" : ""}`}
                onClick={() => setAssignedToMeOnly((v) => !v)}
              >
                Assigned to me
              </button>
            </div>
          </div>

          {listLoading ? (
            <div className="chat-panel-state">
              <LoaderCircle className="spin" size={22} />
              <span>Loading conversations...</span>
            </div>
          ) : listError ? (
            <div className="chat-panel-state chat-panel-state--error">
              <XCircle size={22} />
              <span>{listError}</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="chat-panel-state">
              <Inbox size={24} />
              <strong>No conversations yet.</strong>
              <span>Tenant messages will appear here.</span>
            </div>
          ) : (
            <div className="chat-conversation-list">
              {groupedConversations.map((group) => (
                <div className="chat-status-group" key={group.status}>
                  <div className="chat-status-group-title">
                    {group.label}
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.map((conversation) => (
                    <button
                      type="button"
                      key={conversation.id}
                      className={`chat-conversation-item ${
                        selectedConversation?.id === conversation.id ? "active" : ""
                      } ${
                        conversation.unreadAdminCount > 0
                          ? "chat-conversation-item--unread"
                          : ""
                      } ${
                        conversation.priority === "urgent"
                          ? "chat-conversation-item--urgent"
                          : ""
                      }`}
                      onClick={() => handleSelectConversation(conversation)}
                    >
                      <span className="chat-avatar">
                        {(conversation.tenantName || "T").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="chat-conversation-copy">
                        <span className="chat-conversation-top">
                          <strong>{conversation.tenantName}</strong>
                          <time>{fmtDateTime(conversation.lastMessageAt)}</time>
                        </span>
                        <span className="chat-conversation-meta">
                          {getBranchLabel(conversation.branch)} · {getRoomLabel(conversation)}
                        </span>
                        <span className="chat-conversation-preview">
                          {conversation.lastMessage || "No messages yet"}
                        </span>
                      </span>
                      <span className="chat-conversation-side">
                        {conversation.unreadAdminCount > 0 ? (
                          <span className="chat-unread-badge">
                            {conversation.unreadAdminCount}
                          </span>
                        ) : null}
                        {conversation.priority !== "normal" && (
                          <span className={`chat-priority chat-priority--${conversation.priority}`}>
                            {getPriorityLabel(conversation.priority)}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="chat-detail-panel">
          {selectedConversation ? (
            <>
              <header className="chat-detail-header">
                <div>
                  <h2>{selectedConversation.tenantName}</h2>
                  <p>
                    {getBranchLabel(selectedConversation.branch)} -{" "}
                    {getRoomLabel(selectedConversation)}
                  </p>
                  <div className="chat-detail-badges">
                    <span className="chat-category-badge">
                      {getCategoryLabel(selectedConversation.category)}
                    </span>
                    <span className={`chat-priority chat-priority--${selectedConversation.priority || "normal"}`}>
                      {getPriorityLabel(selectedConversation.priority)}
                    </span>
                    <span className={`chat-status chat-status--${selectedConversation.status || "open"}`}>
                      {getStatusLabel(selectedConversation.status)}
                    </span>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <button
                    type="button"
                    className="chat-secondary-btn"
                    onClick={handleDownloadTranscript}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <FileDown size={15} />
                    )}
                    Transcript
                  </button>
                </div>
              </header>

              <div className="chat-management-bar">
                <div className="chat-management-field">
                  <span>Assigned to</span>
                  <strong>{selectedConversation.assignedAdminName || "Unassigned"}</strong>
                  <button
                    type="button"
                    className="chat-mini-btn"
                    onClick={handleAssignToMe}
                    disabled={assigning || selectedConversation.status === "closed"}
                  >
                    {assigning ? <LoaderCircle className="spin" size={14} /> : <UserCheck size={14} />}
                    Assign to me
                  </button>
                </div>
                <label className="chat-management-field">
                  <span>Status</span>
                  <select
                    value={selectedConversation.status || "open"}
                    onChange={(event) => handleStatusChange(event.target.value)}
                    disabled={updatingStatus || selectedConversation.status === "closed"}
                  >
                    {STATUS_OPTIONS.filter((item) => item.value !== "all").map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="chat-management-field">
                  <span>Priority</span>
                  <select
                    value={selectedConversation.priority || "normal"}
                    onChange={(event) => handlePriorityChange(event.target.value)}
                    disabled={updatingPriority || selectedConversation.status === "closed"}
                  >
                    {PRIORITY_OPTIONS.filter((item) => item.value !== "all").map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {assignedToAnother ? (
                <div className="chat-warning-banner">
                  <AlertTriangle size={16} />
                  Assigned to {selectedConversation.assignedAdminName}. Coordinate before replying.
                </div>
              ) : null}

              {messagesError ? (
                <div className="chat-inline-error">
                  <XCircle size={16} />
                  {messagesError}
                </div>
              ) : null}

              <div className="chat-message-feed">
                {messagesLoading ? (
                  <div className="chat-panel-state">
                    <LoaderCircle className="spin" size={22} />
                    <span>Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-panel-state">
                    <Inbox size={24} />
                    <strong>No messages yet.</strong>
                    <span>This conversation is ready when the tenant sends one.</span>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isTenant = message.senderRole === "tenant";
                    return (
                      <article
                        key={message.id}
                        className={`chat-message ${
                          isTenant ? "chat-message--tenant" : "chat-message--admin"
                        }`}
                      >
                        <div className="chat-message-bubble">
                          <div className="chat-message-meta">
                            <strong>{message.senderName}</strong>
                            <time>{fmtDateTime(message.createdAt)}</time>
                          </div>
                          <p>{message.message}</p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {tenantTyping?.conversationId === selectedConversation?.id && (
                <div className="chat-typing-indicator">
                  <span className="chat-typing-indicator__dots">
                    <span /><span /><span />
                  </span>
                  <span>{tenantTyping.name} is typing…</span>
                </div>
              )}

              {selectedConversation.status === "closed" ? (
                <div className="chat-closed-banner">
                  <CheckCircle2 size={16} />
                  This conversation is closed.
                  {selectedConversation.closingNote ? (
                    <span>Note: {selectedConversation.closingNote}</span>
                  ) : null}
                </div>
              ) : (
                <div className="chat-close-panel">
                  <label>
                    Closing note
                    <textarea
                      value={closeNote}
                      onChange={(event) => setCloseNote(event.target.value)}
                      placeholder="Required before closing the conversation"
                      maxLength={1000}
                    />
                  </label>
                  <button
                    type="button"
                    className="chat-close-btn"
                    onClick={handleCloseConversation}
                    disabled={closing}
                  >
                    {closing ? <LoaderCircle className="spin" size={15} /> : <Lock size={15} />}
                    Close Conversation
                  </button>
                </div>
              )}

              <footer className="chat-reply-box">
                <div className="chat-template-row">
                  {QUICK_REPLIES.map((template) => (
                    <button
                      type="button"
                      key={template}
                      className="chat-template-btn"
                      onClick={() => {
                        setReplyText(template);
                        setReplyError("");
                      }}
                      disabled={selectedConversation.status === "closed"}
                    >
                      {template}
                    </button>
                  ))}
                </div>
                {replyError ? (
                  <div className="chat-inline-error">
                    <XCircle size={16} />
                    {replyError}
                  </div>
                ) : null}
                <textarea
                  value={replyText}
                  onChange={(event) => {
                    setReplyText(event.target.value);
                    if (replyError) setReplyError("");
                    // Debounced typing signal — fire at most once every 2s
                    if (
                      selectedConversation?.id &&
                      selectedConversation.status !== "closed" &&
                      !typingSendRef.current
                    ) {
                      chatApi.broadcastTyping(selectedConversation.id);
                      typingSendRef.current = window.setTimeout(() => {
                        typingSendRef.current = null;
                      }, 2000);
                    }
                  }}
                  placeholder="Write a reply to the tenant"
                  maxLength={1000}
                  disabled={sending || selectedConversation.status === "closed"}
                />
                <div className="chat-reply-actions">
                  <span>{replyText.trim().length}/1000</span>
                  <button
                    type="button"
                    className="chat-send-btn"
                    onClick={handleSendReply}
                    disabled={
                      sending ||
                      !replyText.trim() ||
                      selectedConversation.status === "closed"
                    }
                  >
                    {sending ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="chat-empty-selection">
              <MessageSquareText size={32} />
              <h2>Select a conversation to view messages.</h2>
              <p>Replies, unread counts, and workflow actions will update here.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
