import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  Headphones,
  RotateCcw,
  X,
  Sparkles,
  Send,
  Paperclip,
  LoaderCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ReceiptText,
  Zap,
  Droplet,
  FileText,
  Wrench,
  Calendar,
  UserCheck,
  Copy,
  Check,
  Square,
  CreditCard,
  Clock,
  Megaphone,
  CheckCircle2,
  Eye,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { chatApi } from "../../../../shared/api/chatApi.js";
import { validateFile } from "../../../../shared/utils/firebaseStorageUpload.js";
import useChatSocket from "../../../../shared/hooks/useChatSocket.js";
import { streamTenantAssistant, getTenantContext } from "../../api/tenantAssistantApi";
import TenantBillingBreakdownCard from "./cards/TenantBillingBreakdownCard";
import TenantLeaseTimelineCard from "./cards/TenantLeaseTimelineCard";
import TenantMaintenanceCard from "./cards/TenantMaintenanceCard";
import TenantPaymentGuideCard from "./cards/TenantPaymentGuideCard";
import TenantHouseRulesCard from "./cards/TenantHouseRulesCard";
import TenantAnnouncementCard from "./cards/TenantAnnouncementCard";
import TenantHumanEscalateModal from "./modals/TenantHumanEscalateModal";
import "../../styles/tenant-assistant.css";

const BASE_STORAGE_KEY = "lilycrest_tenant_assistant_msgs";

export const getTenantAssistantStorageKey = (currentUser) => {
  const identifier =
    currentUser?._id || currentUser?.id || currentUser?.firebaseUid || currentUser?.email;
  return identifier ? `${BASE_STORAGE_KEY}_${identifier}` : BASE_STORAGE_KEY;
};

const DYNAMIC_PROMPT_CONFIGS = {
  // --- Applicant Lifecycle Stages ---
  applicant_exploring: {
    label: "Quick Applicant Prompts",
    prompts: [
      { label: "Accepted IDs", prompt: "What valid IDs are accepted for identity verification?", icon: FileText },
      { label: "Viewing schedule", prompt: "How can I schedule an in-person room viewing appointment?", icon: Calendar },
      { label: "Deposit payment steps", prompt: "How do I settle the advance rent and security deposit?", icon: ReceiptText },
      { label: "Room availability", prompt: "What room types and beds are currently available?", icon: ShieldCheck },
      { label: "House rules overview", prompt: "What are the dormitory gate hours and visitor rules?", icon: FileText },
    ],
  },
  applicant_under_review: {
    label: "Reservation Review Prompts",
    prompts: [
      { label: "Review turnaround time", prompt: "How long does application review usually take?", icon: Clock },
      { label: "ID verification status", prompt: "What is the status of my uploaded identification documents?", icon: ShieldCheck },
      { label: "Modify reservation", prompt: "How can I change my target branch or move-in date?", icon: Calendar },
      { label: "Branch location", prompt: "Can you tell me the complete address and landmark of the branch?", icon: ShieldCheck },
    ],
  },
  applicant_payment_pending: {
    label: "Payment & Onboarding Prompts",
    prompts: [
      { label: "Deposit payment steps", prompt: "How do I settle the advance rent and security deposit?", icon: ReceiptText },
      { label: "Accepted payment channels", prompt: "What payment channels (GCash, Bank Transfer) can I use?", icon: CreditCard },
      { label: "Payment deadline", prompt: "When is the deadline to secure my room reservation?", icon: Calendar },
      { label: "Move-in requirements", prompt: "What documents or clearance do I need before move-in day?", icon: FileText },
    ],
  },
  applicant_move_in_ready: {
    label: "Move-in Readiness Prompts",
    prompts: [
      { label: "Move-in day checklist", prompt: "What is the move-in day procedure and gate access schedule?", icon: Calendar },
      { label: "What to bring", prompt: "What appliances and personal items are permitted in the room?", icon: ShieldCheck },
      { label: "Digital lease signing", prompt: "How do I review and sign my digital lease agreement?", icon: FileText },
      { label: "WiFi & Keycard access", prompt: "How do I get my tenant keycard and WiFi credentials?", icon: Zap },
    ],
  },

  // --- Active Tenant Contexts ---
  tenant_billing: {
    label: "Quick Billing Prompts",
    prompts: [
      { label: "Bill breakdown", prompt: "Can you show my current monthly bill breakdown?", icon: ReceiptText },
      { label: "Electricity math", prompt: "How was my submetered electricity share computed this month?", icon: Zap },
      { label: "Payment due date", prompt: "When is my current bill due and how do I settle it?", icon: Calendar },
      { label: "Water consumption", prompt: "Is water really free and included in my monthly rent?", icon: Droplet },
      { label: "Accepted payment channels", prompt: "What payment methods (GCash, Bank) can I use?", icon: CreditCard },
    ],
  },
  tenant_maintenance: {
    label: "Quick Maintenance Prompts",
    prompts: [
      { label: "Active tickets", prompt: "What is the current status of my room repair requests?", icon: Wrench },
      { label: "Report issue", prompt: "How do I submit an urgent plumbing or air-conditioning issue?", icon: Wrench },
      { label: "Technician hours", prompt: "What are the available hours for on-site technician repairs?", icon: UserCheck },
      { label: "Emergency maintenance", prompt: "Who do I contact for emergency electrical or water issues?", icon: AlertCircle },
    ],
  },
  tenant_contracts: {
    label: "Quick Lease Prompts",
    prompts: [
      { label: "Lease expiration", prompt: "When does my current lease contract expire and how many days are left?", icon: Calendar },
      { label: "Renew contract", prompt: "What are the steps to request a lease renewal?", icon: FileText },
      { label: "Deposit refund", prompt: "How does the security deposit refund and move-out clearance work?", icon: ShieldCheck },
      { label: "House rules", prompt: "What are the dormitory quiet hours, curfew, and visitor policies?", icon: FileText },
    ],
  },
  tenant_default: {
    label: "Quick Tenant Prompts",
    prompts: [
      { label: "Bill breakdown", prompt: "Can you show my current monthly bill breakdown?", icon: ReceiptText },
      { label: "Active tickets", prompt: "Do I have any active maintenance tickets scheduled?", icon: Wrench },
      { label: "Electricity math", prompt: "How was my submetered electricity share computed this month?", icon: Zap },
      { label: "Lease timeline", prompt: "How many days are left on my lease agreement?", icon: FileText },
      { label: "Report issue", prompt: "How do I submit an urgent plumbing or air-conditioning issue?", icon: Wrench },
      { label: "Deposit refund", prompt: "How does the security deposit refund and move-out clearance work?", icon: ShieldCheck },
    ],
  },
};

function formatBranch(raw) {
  if (!raw) return "Lilycrest";
  const str = String(raw).toLowerCase();
  if (str.includes("gil") || str.includes("puyat") || str.includes("pasay")) return "Gil Puyat";
  if (str.includes("guadalupe") || str.includes("makati")) return "Guadalupe";
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TenantAssistantDrawer({ isOpen, onClose, onUnreadCountChange }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const userStorageKey = useMemo(
    () => getTenantAssistantStorageKey(user),
    [user?._id, user?.id, user?.firebaseUid, user?.email]
  );

  const [activeTicket, setActiveTicket] = useState(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(userStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return [];
  });

  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeWidget, setActiveWidget] = useState(null);
  const [activeActions, setActiveActions] = useState([]);
  const [isEscalateOpen, setIsEscalateOpen] = useState(false);
  const [contextSnapshot, setContextSnapshot] = useState(null);
  const [hasCopied, setHasCopied] = useState(false);

  const bodyRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isScrolledUpRef = useRef(false);

  // Dynamic user status & role resolution
  const isApplicant = useMemo(() => {
    if (contextSnapshot?.isApplicant !== undefined) {
      return Boolean(contextSnapshot.isApplicant);
    }
    if (user?.role === "tenant" || user?.tenantStatus === "active") {
      return false;
    }
    const path = location.pathname.toLowerCase();
    return (
      user?.role === "applicant" ||
      user?.isApplicant ||
      path.includes("/applicant/viewing") ||
      path.includes("/applicant/reservation")
    );
  }, [contextSnapshot, user, location.pathname]);

  // Load live context snapshot on drawer open
  useEffect(() => {
    if (isOpen) {
      getTenantContext()
        .then((res) => {
          if (res?.data) {
            setContextSnapshot(res.data);
          }
        })
        .catch(() => {
          // Gracefully fall back to local auth state
        });
    }
  }, [isOpen]);

  // Check active support ticket on load / when opened
  const checkActiveSupportTicket = useCallback(async () => {
    try {
      const res = await chatApi.getMyConversations();
      const convs = Array.isArray(res?.conversations)
        ? res.conversations
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
        ? res
        : [];
      const ongoing = convs.find(
        (c) => c.status !== "closed" && c.status !== "resolved"
      );
      if (ongoing) {
        const convId = ongoing._id || ongoing.id;
        setActiveTicket({
          ...ongoing,
          _id: convId,
          id: convId,
        });
        onUnreadCountChange?.(ongoing.unreadTenantCount || 0);
        try {
          const msgRes = await chatApi.getTenantMessages(convId);
          const rawMsgs = Array.isArray(msgRes?.messages)
            ? msgRes.messages
            : Array.isArray(msgRes?.data)
            ? msgRes.data
            : Array.isArray(msgRes)
            ? msgRes
            : [];
          if (rawMsgs.length > 0) {
            setMessages(
              rawMsgs.map((msg) => ({
                _id: msg._id || msg.id,
                role: msg.senderRole === "tenant" ? "user" : "admin",
                senderName: msg.senderName || "Branch Admin",
                message: msg.message,
                content: msg.message,
                attachments: msg.attachments || [],
                timestamp: msg.createdAt || new Date().toISOString(),
                isStaff: msg.senderRole !== "tenant",
              }))
            );
          }
        } catch (msgErr) {
          console.error("Failed to load active ticket messages:", msgErr);
        }
      } else {
        setActiveTicket(null);
        onUnreadCountChange?.(0);
      }
    } catch (err) {
      console.error("Failed to check active support conversation:", err);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      checkActiveSupportTicket();
    }
  }, [isOpen, checkActiveSupportTicket]);

  // Periodic fallback polling while in live support session to guarantee zero missed replies
  useEffect(() => {
    if (!isOpen || !activeTicket) return;
    const interval = setInterval(() => {
      checkActiveSupportTicket();
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, activeTicket, checkActiveSupportTicket]);

  // Real-time WebSocket subscriptions
  const handleNewMessage = useCallback((msg, convId) => {
    const activeId = String(activeTicket?._id || activeTicket?.id || "");
    const incomingConvId = String(convId || msg?.conversationId || "");
    if (activeId && incomingConvId && incomingConvId === activeId) {
      const msgId = msg?._id || msg?.id;
      setMessages((prev) => {
        const exists = prev.some((m) => {
          const mId = m._id || m.id;
          return mId && msgId && String(mId) === String(msgId);
        });
        if (exists) return prev;
        return [
          ...prev,
          {
            _id: msgId,
            id: msgId,
            role: msg.senderRole === "tenant" ? "user" : "admin",
            senderName: msg.senderName || "Branch Admin",
            message: msg.message,
            content: msg.message,
            attachments: msg.attachments || [],
            timestamp: msg.createdAt || new Date().toISOString(),
            isStaff: msg.senderRole !== "tenant",
          },
        ];
      });
      if (!isOpen && msg.senderRole !== "tenant") {
        onUnreadCountChange?.(1);
      }
    }
  }, [activeTicket, isOpen, onUnreadCountChange]);

  const handleConversationUpdated = useCallback((conv) => {
    const activeId = String(activeTicket?._id || activeTicket?.id || "");
    const updatedId = String(conv?._id || conv?.id || "");
    if (activeId && updatedId && updatedId === activeId) {
      setActiveTicket((prev) => ({
        ...prev,
        ...conv,
        _id: updatedId,
        id: updatedId,
      }));
      if (conv.status === "waiting_tenant") {
        setMessages((prev) => {
          const hasPrompt = prev.some(
            (m) => m.role === "resolution_prompt" && m.ticketId === conv.ticketId
          );
          if (hasPrompt) return prev;
          return [
            ...prev,
            {
              role: "resolution_prompt",
              ticketId: conv.ticketId,
              timestamp: new Date().toISOString(),
            },
          ];
        });
      } else if (conv.status === "resolved" || conv.status === "closed") {
        setActiveTicket(null);
        onUnreadCountChange?.(0);
        setMessages((prev) => [
          ...prev,
          {
            role: "system_ended",
            ticketId: conv.ticketId,
            message: `Live support session for #${conv.ticketId || "ticket"} has concluded. Your AI Assistant is active again.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    }
  }, [activeTicket, onUnreadCountChange]);

  const handleTyping = useCallback((data) => {
    const activeId = String(activeTicket?._id || activeTicket?.id || "");
    const typingConvId = String(data?.conversationId || "");
    if (activeId && typingConvId && typingConvId === activeId && data?.senderRole !== "tenant") {
      setAdminTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setAdminTyping(false), 3000);
    }
  }, [activeTicket]);

  useChatSocket({
    onMessageNew: handleNewMessage,
    onConversationUpdated: handleConversationUpdated,
    onTyping: handleTyping,
    enabled: Boolean(isOpen && (activeTicket?._id || activeTicket?.id)),
  });

  // Dynamic Prompt Set Resolution based on Role, Status, and Active Route
  const activePromptConfig = useMemo(() => {
    const reservationStatus = String(
      contextSnapshot?.reservation?.status || user?.reservationStatus || ""
    ).toLowerCase();
    const path = location.pathname.toLowerCase();

    if (isApplicant) {
      if (["submitted", "under_review", "pending", "review"].includes(reservationStatus)) {
        return DYNAMIC_PROMPT_CONFIGS.applicant_under_review;
      }
      if (["payment_pending", "approved_for_payment", "approved"].includes(reservationStatus)) {
        return DYNAMIC_PROMPT_CONFIGS.applicant_payment_pending;
      }
      if (["confirmed", "reserved", "movein", "move_in", "move_in_ready"].includes(reservationStatus)) {
        return DYNAMIC_PROMPT_CONFIGS.applicant_move_in_ready;
      }
      return DYNAMIC_PROMPT_CONFIGS.applicant_exploring;
    }

    // Active Tenant
    if (path.includes("billing")) return DYNAMIC_PROMPT_CONFIGS.tenant_billing;
    if (path.includes("maintenance")) return DYNAMIC_PROMPT_CONFIGS.tenant_maintenance;
    if (path.includes("contract")) return DYNAMIC_PROMPT_CONFIGS.tenant_contracts;

    return DYNAMIC_PROMPT_CONFIGS.tenant_default;
  }, [isApplicant, contextSnapshot, user, location.pathname]);

  const activeRoutePrompts = activePromptConfig.prompts;

  // Synchronize and isolate messages when authenticated user identity changes
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(userStorageKey);
      setMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setMessages([]);
    }
    setStreamingText("");
    setActiveWidget(null);
    setActiveActions([]);
    setAttachments([]);
    setContextSnapshot(null);
  }, [userStorageKey]);

  // Auto-reset conversation to a fresh state when drawer is closed (Zero-clutter clean on reopen)
  useEffect(() => {
    if (!isOpen) {
      if (isStreaming) {
        abortControllerRef.current?.abort();
        setIsStreaming(false);
      }
      setMessages([]);
      setStreamingText("");
      setActiveWidget(null);
      setActiveActions([]);
      setAttachments([]);
      setInputMessage("");
      try {
        sessionStorage.removeItem(userStorageKey);
      } catch {
        // Ignore
      }
    }
  }, [isOpen, userStorageKey, isStreaming]);

  // Persist messages to user-scoped session storage
  useEffect(() => {
    if (!isOpen || messages.length === 0) return;
    try {
      sessionStorage.setItem(userStorageKey, JSON.stringify(messages));
    } catch {
      // Ignore storage errors
    }
  }, [messages, userStorageKey, isOpen]);

  // ESC key handler to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isEscalateOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEscalateOpen, onClose]);

  // Auto-scroll logic with scroll-lock detection
  const scrollToBottom = (behavior = "smooth") => {
    if (bodyRef.current && !isScrolledUpRef.current) {
      bodyRef.current.scrollTo({
        top: bodyRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages, streamingText, activeWidget, adminTyping]);

  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    isScrolledUpRef.current = !atBottom;
  };

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        scrollToBottom("auto");
      }, 150);
    }
  }, [isOpen]);

  const tenantDisplayName =
    `${user?.firstName || ""}`.trim() ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.username ||
    "Tenant";

  const branchLabel = formatBranch(user?.branch || contextSnapshot?.branch);
  const roomLabel = user?.roomNumber || contextSnapshot?.roomNumber || "Unassigned";
  const bedLabel = user?.roomBed || user?.bedPosition || contextSnapshot?.bedPosition || "Assigned Bed";

  const handleClearHistory = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setMessages([]);
    setStreamingText("");
    setActiveWidget(null);
    setActiveActions([]);
    try {
      sessionStorage.removeItem(userStorageKey);
    } catch {
      // Ignore
    }
  };

  const handleCopyTranscript = async () => {
    if (!messages.length) return;
    const transcript = messages
      .map((m) => {
        const sender = m.isStaff
          ? `[Branch Admin - ${m.senderName || "Staff"}]`
          : m.role === "user"
          ? "[User]"
          : `[${isApplicant ? "Applicant Assistant" : "Tenant Assistant"}]`;
        return `${sender} (${new Date(m.timestamp).toLocaleTimeString()}):\n${m.content || m.message}\n`;
      })
      .join("\n---\n\n");

    try {
      await navigator.clipboard.writeText(transcript);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (streamingText) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: streamingText,
          widget: activeWidget,
          actions: activeActions,
          timestamp: new Date().toISOString(),
        },
      ]);
      setStreamingText("");
      setActiveWidget(null);
      setActiveActions([]);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      try {
        validateFile(file, { maxSizeMB: 5, allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"] });
      } catch (validationErr) {
        alert(validationErr.message);
        return;
      }
    }

    if (!activeTicket) {
      alert("Attachments are supported when speaking directly with Branch Admin staff.");
      return;
    }

    setIsUploading(true);
    try {
      for (const file of files) {
        const res = await chatApi.uploadTenantAttachment(activeTicket._id, file);
        if (res?.data) {
          setAttachments((prev) => [...prev, res.data]);
        }
      }
    } catch (err) {
      console.error("Attachment upload error:", err);
      alert("Failed to upload attachment. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmResolution = async (resolved) => {
    if (!activeTicket) return;
    try {
      await chatApi.confirmTenantResolution(activeTicket._id, resolved);
      if (resolved) {
        const ticketId = activeTicket.ticketId;
        setActiveTicket(null);
        onUnreadCountChange?.(0);
        setMessages((prev) => [
          ...prev,
          {
            role: "system_ended",
            ticketId,
            message: `Thank you for confirming resolution. Live support for #${ticketId || "ticket"} has concluded. Your AI Assistant is active again.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        const followUpText = "I still need assistance with this concern.";
        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            content: followUpText,
            timestamp: new Date().toISOString(),
          },
        ]);
        await chatApi.sendTenantMessage(activeTicket._id, followUpText);
      }
    } catch (err) {
      console.error("Resolution confirm failed:", err);
    }
  };

  const handleEndLiveSession = async () => {
    if (!activeTicket) return;
    setIsEndingSession(true);
    try {
      await chatApi.closeTenantConversation(activeTicket._id, "Session closed by user.");
      const ticketId = activeTicket.ticketId;
      setActiveTicket(null);
      onUnreadCountChange?.(0);
      setMessages((prev) => [
        ...prev,
        {
          role: "system_ended",
          ticketId,
          message: `Live support session for #${ticketId || "ticket"} was ended. Your AI Assistant is active again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to close live support session:", err);
    } finally {
      setIsEndingSession(false);
    }
  };

  const handleSendMessage = async (customPrompt = null) => {
    const rawMessage = customPrompt || inputMessage;
    if (!rawMessage.trim() && attachments.length === 0) return;
    if (isStreaming || isUploading) return;

    setInputMessage("");

    // Route 1: Active Live Support Chat with Branch Admin
    if (activeTicket) {
      const userMsg = {
        role: "user",
        content: rawMessage,
        attachments: [...attachments],
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      const currentAttachments = [...attachments];
      setAttachments([]);

      try {
        await chatApi.sendTenantMessage(activeTicket._id, rawMessage, currentAttachments);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Failed to deliver message to Branch Admin. Please check your internet connection.",
            isError: true,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
      return;
    }

    // Route 2: Normal AI Assistant Stream
    const userMsg = {
      role: "user",
      content: rawMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText("");
    setActiveWidget(null);
    setActiveActions([]);

    const historyPayload = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.content || m.message,
      }));

    abortControllerRef.current = new AbortController();

    try {
      const result = await streamTenantAssistant({
        message: rawMessage,
        conversationHistory: historyPayload,
        onToken: (token, accumulated) => {
          setStreamingText(accumulated);
        },
        onWidget: (widget) => {
          setActiveWidget(widget);
        },
        onActions: (actions) => {
          setActiveActions(actions);
        },
        onDone: (meta) => {
          if (meta?.contextSnapshot) {
            setContextSnapshot(meta.contextSnapshot);
          }
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "I encountered a temporary connection issue reaching the AI service. You can retry your question or speak directly with our Branch Admin.",
              isError: true,
              timestamp: new Date().toISOString(),
            },
          ]);
        },
        signal: abortControllerRef.current.signal,
      });

      if (result && (result.text || result.widget)) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.text || "",
            widget: result.widget || null,
            actions: result.actions || [],
            timestamp: new Date().toISOString(),
          },
        ]);
        setStreamingText("");
        setActiveWidget(null);
        setActiveActions([]);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Unable to load stay information right now. Please verify your connection or ask our Branch Admin for assistance.",
            isError: true,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleActionClick = (action) => {
    if (typeof action === "string") {
      handleSendMessage(action);
      return;
    }
    if (
      action.action === "open_escalate_modal" ||
      action.action === "escalate" ||
      action.type === "escalate" ||
      action.label === "Chat with Admin" ||
      action.label === "Dispute / Chat with Admin" ||
      action.label === "Dispute / Admin Help"
    ) {
      setIsEscalateOpen(true);
      return;
    }
    if (action.type === "prompt" || action.prompt) {
      handleSendMessage(action.prompt || action.label);
      return;
    }
    if (action.type === "navigate" || action.url || action.path) {
      onClose();
      navigate(action.url || action.path);
      return;
    }
    if (action.label) {
      handleSendMessage(action.label);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e) => {
    setInputMessage(e.target.value);
    if (activeTicket && e.target.value.trim().length > 0) {
      chatApi.broadcastTyping(activeTicket._id, "tenant", tenantDisplayName).catch(() => {});
    }
  };

  const renderWidget = (widget) => {
    if (!widget) return null;
    const widgetType = typeof widget === "string" ? widget : widget.type;
    const widgetData = widget.data || contextSnapshot;
    const billData = widgetData?.activeUnpaidBill || widgetData?.currentBill;

    switch (widgetType) {
      case "billing_breakdown":
        return <TenantBillingBreakdownCard data={billData} />;
      case "lease_timeline":
        return <TenantLeaseTimelineCard data={widgetData?.contract} />;
      case "maintenance_status":
        return <TenantMaintenanceCard data={widgetData?.activeMaintenance} />;
      case "payment_guide":
        return <TenantPaymentGuideCard data={billData} />;
      case "house_rules":
        return <TenantHouseRulesCard />;
      case "announcements":
        return <TenantAnnouncementCard />;
      default:
        return null;
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const paragraphs = text.split(/\n{2,}/);
    return paragraphs.map((para, pIdx) => {
      const lines = para.split("\n");
      return (
        <div key={pIdx} className="mb-2 last:mb-0 leading-relaxed text-[13px] text-slate-800 dark:text-slate-200">
          {lines.map((line, lIdx) => {
            const isBullet = /^[*-]\s+(.*)/.test(line);
            const isNumbered = /^\d+\.\s+(.*)/.test(line);
            const content = line.replace(/^[*-]\s+/, "").replace(/^\d+\.\s+/, "");

            const boldPattern = /\*\*(.*?)\*\*/g;
            const formatted = content.split(boldPattern).map((segment, sIdx) => {
              if (sIdx % 2 === 1) {
                return (
                  <strong key={sIdx} className="font-semibold text-slate-900 dark:text-slate-100">
                    {segment}
                  </strong>
                );
              }
              return segment;
            });

            if (isBullet) {
              return (
                <div key={lIdx} className="flex items-start gap-1.5 ml-2 my-0.5">
                  <span className="text-slate-400 select-none">•</span>
                  <span>{formatted}</span>
                </div>
              );
            }

            if (isNumbered) {
              const numMatch = line.match(/^(\d+)\./);
              return (
                <div key={lIdx} className="flex items-start gap-1.5 ml-2 my-0.5">
                  <span className="font-semibold text-slate-500 select-none">
                    {numMatch ? `${numMatch[1]}.` : "•"}
                  </span>
                  <span>{formatted}</span>
                </div>
              );
            }

            return (
              <p key={lIdx} className={lIdx > 0 ? "mt-1" : ""}>
                {formatted}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`tenant-assistant-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <div
        className={`tenant-assistant-drawer ${isOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Lilycrest Assistant"
      >
        {/* Header */}
        <div className="tenant-assistant-header">
          <div className="tenant-assistant-header-top">
            <div className="tenant-assistant-header-brand">
              <div className="tenant-assistant-avatar-badge" aria-hidden="true">
                <Bot className="w-4 h-4" />
              </div>
              <span className="tenant-assistant-title">
                {activeTicket
                  ? "Live Support Chat"
                  : isApplicant
                  ? "Applicant Assistant"
                  : "Tenant Assistant"}
              </span>
            </div>

            <div className="tenant-assistant-header-actions">
              {!activeTicket && (
                <button
                  type="button"
                  onClick={() => setIsEscalateOpen(true)}
                  className="tenant-assistant-escalate-btn"
                  title="Chat directly with Branch Admin staff"
                >
                  <Headphones className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <span>Chat with Admin</span>
                </button>
              )}

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="tenant-assistant-icon-btn"
                  aria-label="Copy conversation transcript"
                  title={hasCopied ? "Copied to clipboard!" : "Copy conversation"}
                >
                  {hasCopied ? (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              )}

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="tenant-assistant-icon-btn"
                  aria-label="Clear chat history"
                  title="Clear conversation"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="tenant-assistant-icon-btn"
                aria-label="Close assistant drawer"
                title="Close drawer (Esc)"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Dynamic Context Banner */}
          {activeTicket ? (
            <div className="tenant-assistant-banner support-active">
              <div className="tenant-assistant-banner-left">
                <span className="tenant-support-live-dot" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">Live Support Active</span>
                <span>•</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  #{activeTicket.ticketId || "Ticket"}
                </span>
                <span>•</span>
                <span className="text-slate-600 dark:text-slate-400 capitalize">
                  {activeTicket.category?.replace(/_/g, " ") || "Inquiry"}
                </span>
              </div>
              <div className="tenant-assistant-banner-right">
                <button
                  type="button"
                  onClick={handleEndLiveSession}
                  disabled={isEndingSession}
                  className="tenant-assistant-end-support-btn"
                  title="End live support and return to AI bot"
                >
                  <span>{isEndingSession ? "Ending..." : "End Session"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="tenant-assistant-banner">
              <div className="tenant-assistant-banner-left">
                <span className="tenant-assistant-banner-branch">{branchLabel}</span>
                <span>•</span>
                {isApplicant ? (
                  <span>
                    {contextSnapshot?.reservation?.status
                      ? `Reservation: ${contextSnapshot.reservation.status.toUpperCase()}`
                      : "Application in Progress"}
                  </span>
                ) : (
                  <span>Room {roomLabel} ({bedLabel})</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Message Area */}
        <div ref={bodyRef} onScroll={handleScroll} className="tenant-assistant-body">
          {/* Default Welcome Message if empty */}
          {messages.length === 0 && (
            <div className="tenant-msg-row assistant">
              <div className="tenant-msg-meta">
                <span>{isApplicant ? "Applicant Assistant" : "Tenant Assistant"}</span>
              </div>
              <div className="tenant-msg-bubble">
                <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Hello, {tenantDisplayName}!
                </p>
                {isApplicant ? (
                  <>
                    <p>
                      I am your <strong>Lilycrest Applicant Assistant</strong>. I have real-time access to your reservation status, viewing schedule, ID document verification progress, and advance deposit guidelines.
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Select a suggested prompt below or ask about your application:
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      I am your <strong>Lilycrest Tenant Assistant</strong>. I am grounded in your live room stay data at <strong>{branchLabel}</strong>, including current billing, electricity meter usage, lease agreement, and active repair tickets.
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Select a suggested prompt below or ask about your stay:
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Unified Conversation Feed */}
          {messages.map((msg, index) => {
            // 1. Escalation system notice
            if (msg.role === "system_escalation") {
              return (
                <div key={index} className="tenant-support-escalation-card">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <Headphones className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Inquiry Escalated to Branch Admin</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Ticket <strong>#{msg.ticketId || "Pending"}</strong> • Category: {msg.category} • Priority: {msg.priority}
                  </p>
                  {msg.summary && (
                    <p className="text-xs italic text-slate-500 dark:text-slate-400">
                      &quot;{msg.summary}&quot;
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    A staff member has been notified. You can message them directly here in real time.
                  </p>
                </div>
              );
            }

            // 2. Resolution confirmation card
            if (msg.role === "resolution_prompt") {
              return (
                <div key={index} className="tenant-support-resolution-card">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Has your concern been resolved?</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Our Branch Admin marked this ticket as resolved. Please confirm if your inquiry is completed.
                      </p>
                    </div>
                  </div>
                  <div className="tenant-support-resolution-actions">
                    <button
                      type="button"
                      onClick={() => handleConfirmResolution(true)}
                      className="tenant-support-btn-primary"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Yes, Resolved</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmResolution(false)}
                      className="tenant-support-btn-secondary"
                    >
                      <span>Still Need Help</span>
                    </button>
                  </div>
                </div>
              );
            }

            // 3. System ended divider
            if (msg.role === "system_ended") {
              return (
                <div key={index} className="tenant-support-ended-divider">
                  <span>{msg.message}</span>
                </div>
              );
            }

            // 4. Admin / Staff turn
            if (msg.isStaff || msg.role === "admin") {
              return (
                <div key={index} className="tenant-msg-row admin">
                  <div className="tenant-msg-meta">
                    <span className="tenant-staff-tag">Staff</span>
                    <span>{msg.senderName || "Branch Admin"}</span>
                  </div>
                  <div className="tenant-msg-bubble">
                    {renderFormattedText(msg.content || msg.message)}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        {msg.attachments.map((att, attIdx) => (
                          <div key={attIdx}>
                            {att.contentType?.startsWith("image/") ? (
                              <img
                                src={att.url || att.fileUrl}
                                alt={att.fileName || "attachment"}
                                className="tenant-chat-img-thumb"
                                onClick={() => setPreviewAttachment(att)}
                              />
                            ) : (
                              <a
                                href={att.url || att.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tenant-chat-pdf-chip"
                              >
                                <FileText className="w-3.5 h-3.5 text-rose-500" />
                                <span className="truncate max-w-[140px]">{att.fileName || "Document"}</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // 5. User / Tenant turn
            if (msg.role === "user") {
              return (
                <div key={index} className="tenant-msg-row user">
                  <div className="tenant-msg-meta">
                    <span>You</span>
                  </div>
                  <div className="tenant-msg-bubble">
                    {renderFormattedText(msg.content)}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-700">
                        {msg.attachments.map((att, attIdx) => (
                          <div key={attIdx}>
                            {att.contentType?.startsWith("image/") ? (
                              <img
                                src={att.url || att.fileUrl}
                                alt={att.fileName || "attachment"}
                                className="tenant-chat-img-thumb"
                                onClick={() => setPreviewAttachment(att)}
                              />
                            ) : (
                              <a
                                href={att.url || att.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tenant-chat-pdf-chip"
                              >
                                <FileText className="w-3.5 h-3.5 text-rose-500" />
                                <span className="truncate max-w-[140px]">{att.fileName || "Document"}</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // 6. Normal Assistant AI Bot turn
            return (
              <div key={index} className="tenant-msg-row assistant">
                <div className="tenant-msg-meta">
                  <span>{isApplicant ? "Applicant Assistant" : "Tenant Assistant"}</span>
                </div>
                <div className={`tenant-msg-bubble ${msg.isError ? "error" : ""}`}>
                  {renderFormattedText(msg.content)}
                </div>

                {msg.widget && renderWidget(msg.widget)}

                {msg.actions && msg.actions.length > 0 && (
                  <div className="tenant-assistant-actions">
                    {msg.actions.map((act, aIdx) => {
                      const label = typeof act === "string" ? act : act.label || act.prompt || "Action";
                      return (
                        <button
                          key={aIdx}
                          type="button"
                          onClick={() => handleActionClick(act)}
                          className="tenant-assistant-action-chip"
                          title={label}
                        >
                          <span>{label}</span>
                          <ArrowRight className="w-3 h-3 ml-1 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin Typing Signal */}
          {adminTyping && (
            <div className="tenant-msg-row admin">
              <div className="tenant-msg-meta">
                <span className="tenant-staff-tag">Staff</span>
                <span>Branch Admin is typing...</span>
              </div>
              <div className="tenant-assistant-typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {/* Live AI Streaming Bubble */}
          {isStreaming && (
            <div className="tenant-msg-row assistant">
              <div className="tenant-msg-meta">
                <span>{isApplicant ? "Applicant Assistant" : "Tenant Assistant"}</span>
              </div>
              <div className="tenant-msg-bubble">
                {streamingText ? (
                  renderFormattedText(streamingText)
                ) : (
                  <div className="tenant-assistant-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>

              {activeWidget && renderWidget(activeWidget)}

              {activeActions && activeActions.length > 0 && (
                <div className="tenant-assistant-actions">
                  {activeActions.map((act, aIdx) => {
                    const label = typeof act === "string" ? act : act.label || act.prompt || "Action";
                    return (
                      <button
                        key={aIdx}
                        type="button"
                        onClick={() => handleActionClick(act)}
                        className="tenant-assistant-action-chip"
                        title={label}
                      >
                        <span>{label}</span>
                        <ArrowRight className="w-3 h-3 ml-1 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Route & Lifecycle Prompts Bar (visible only in AI Bot mode) */}
        {!activeTicket && (
          <div className="tenant-quick-prompts-container">
            <div className="tenant-quick-prompts-label">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>{activePromptConfig.label}</span>
            </div>
            <div className="tenant-quick-prompts-scroll">
              {activePromptConfig.prompts.map((item, idx) => {
                const IconComp = item.icon || Sparkles;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    disabled={isStreaming}
                    className="tenant-quick-prompt-pill"
                    title={item.prompt}
                  >
                    <IconComp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input Composer */}
        <div className="tenant-assistant-footer">
          {/* Staged Attachments Preview */}
          {attachments.length > 0 && (
            <div className="tenant-attachment-preview-list">
              {attachments.map((att, idx) => (
                <div key={idx} className="tenant-attachment-preview-chip">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span className="truncate max-w-[120px]">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="tenant-assistant-input-wrapper">
            {/* Attachment Button (Live Support Mode) */}
            {activeTicket && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="tenant-assistant-attach-btn"
                  title="Attach file (image or PDF up to 5MB)"
                >
                  {isUploading ? (
                    <LoaderCircle className="w-4 h-4 animate-spin text-amber-500" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>
              </>
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputMessage}
              maxLength={1000}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                activeTicket
                  ? "Type a message to Branch Admin staff..."
                  : isApplicant
                  ? "Ask about reservation, ID verification, viewing, or deposits..."
                  : "Ask about bills, electricity, lease, or repairs..."
              }
              disabled={isStreaming}
              className="tenant-assistant-textarea"
              aria-label={
                activeTicket
                  ? "Message Branch Admin"
                  : isApplicant
                  ? "Ask Lilycrest Applicant Assistant"
                  : "Ask Lilycrest Tenant Assistant"
              }
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="tenant-assistant-stop-btn"
                aria-label="Stop generating response"
                title="Stop generating"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() && attachments.length === 0}
                className="tenant-assistant-send-btn"
                aria-label="Send message"
                title="Send (Enter)"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="tenant-assistant-footer-meta">
            <span>Enter to send • Shift+Enter for newline</span>
            <span>{inputMessage.length}/1000</span>
          </div>
        </div>
      </div>

      {/* Human Admin Escalation Modal */}
      <TenantHumanEscalateModal
        isOpen={isEscalateOpen}
        onClose={() => setIsEscalateOpen(false)}
        lastBotMessage={
          messages[messages.length - 1]?.role === "assistant"
            ? messages[messages.length - 1]?.content
            : ""
        }
        onEscalationSuccess={(res) => {
          const newConv = res?.data || res;
          if (newConv && (newConv.conversationId || newConv.id || newConv._id)) {
            const convId = newConv.conversationId || newConv.id || newConv._id;
            setActiveTicket({
              _id: convId,
              id: convId,
              ticketId: newConv.ticketId,
              status: newConv.status || "open",
              category: newConv.category,
              priority: newConv.priority,
              assignedAdminName: newConv.assignedAdminName,
            });
            setMessages((prev) => [
              ...prev,
              {
                role: "system_escalation",
                ticketId: newConv.ticketId,
                category: newConv.category,
                priority: newConv.priority,
                summary: newConv.summary || "Inquiry escalated to Branch Admin.",
                timestamp: new Date().toISOString(),
              },
            ]);
            checkActiveSupportTicket();
          }
        }}
      />

      {/* Attachment Image Enlargement Lightbox */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewAttachment.url || previewAttachment.fileUrl}
              alt={previewAttachment.fileName || "attachment"}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewAttachment(null)}
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
