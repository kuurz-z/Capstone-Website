import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Headphones,
  RotateCcw,
  X,
  AlertTriangle,
  FileCheck,
  Send,
  LoaderCircle,
} from "lucide-react";
import ChatMessageList from "./ChatMessageList";
import ChatLeadEscalationForm from "./ChatLeadEscalationForm";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import { chatbotApi } from "../../../../shared/api/chatbotApi";

const STORAGE_KEY = "lc_chatbot_history_v1";
const LAST_ACTIVE_KEY = "lc_chatbot_last_active_v1";
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
const WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000; // Show warning 2 minutes before reset (at 13 minutes idle)
const WARNING_THRESHOLD_MS = INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS; // 13 minutes (780,000 ms)

const INITIAL_MESSAGE = {
  id: "welcome-msg",
  role: "assistant",
  text: "Hello! I am the **Lilycrest AI Chatbot**. I can assist you with our room types, branch locations (*Gil Puyat* & *Guadalupe*), house rules, curfews, utility billing, and checking live room availability.\n\nHow can I help you today?",
  timestamp: Date.now(),
  suggestedActions: [
    { label: "Check Room Availability", url: "/applicant/check-availability" },
    { label: "Room Types & Amenities", prompt: "What are your room types and amenities for Gil Puyat and Guadalupe?" },
    { label: "Check ID Requirements", action: "open_kyc_widget" },
    { label: "Curfew & Policies", prompt: "What are the building curfew hours and visitor policies?" },
  ],
};

/**
 * PublicChatbotModal
 *
 * 380px x 560px (desktop) / full-screen (mobile < 640px) conversational modal.
 * Built with solid HSL tokens, 1px crisp borders, zero gradients, 15-minute inactivity lifecycle with warning,
 * prompt auto-dismissal, and real-time SSE streaming.
 */
export function PublicChatbotModal({
  isOpen,
  onClose,
  initialPrompt = "",
  onClearInitialPrompt,
}) {
  const [messages, setMessages] = useState(() => {
    try {
      const lastActive = sessionStorage.getItem(LAST_ACTIVE_KEY);
      if (lastActive) {
        const lastActiveTime = parseInt(lastActive, 10);
        if (!isNaN(lastActiveTime) && Date.now() - lastActiveTime > INACTIVITY_TIMEOUT_MS) {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(LAST_ACTIVE_KEY);
          return [INITIAL_MESSAGE];
        }
      }
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clear any leftover streaming flags from previous session
          return parsed.map((m) => ({ ...m, isStreaming: false }));
        }
      }
    } catch {
      // Fallback
    }
    return [INITIAL_MESSAGE];
  });

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationContext, setEscalationContext] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [inactivitySecondsLeft, setInactivitySecondsLeft] = useState(120);
  const [sessionExpiryNotice, setSessionExpiryNotice] = useState(null);

  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastProcessedPromptRef = useRef(null);

  const touchActivity = useCallback(() => {
    try {
      sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      setShowInactivityWarning(false);
    } catch {
      // Ignore
    }
  }, []);

  // Direct local widget injection handler (e.g. clicking widget suggestion chips)
  const handleOpenWidget = useCallback((widgetDescriptor) => {
    touchActivity();
    const widgetType = widgetDescriptor?.type || widgetDescriptor;
    let descriptionText = "Here is the interactive tool you requested:";
    let defaultActions = [];

    if (widgetType === "budget_estimator") {
      descriptionText = "You can use our **Monthly Budget Estimator** below to calculate your estimated accommodation and pro-rata utility expenses:";
      defaultActions = [
        { label: "Quadruple Sharing Rates", prompt: "What are the rates for Quadruple Sharing rooms?" },
        { label: "Check ID Requirements", action: "open_kyc_widget" },
        { label: "Request Front Desk Assistance", action: "open_escalation_form" },
      ];
    } else if (widgetType === "viewing_booking") {
      descriptionText = "Please fill in your preferred schedule and contact details below to schedule an in-person tour of our dormitory facilities:";
      defaultActions = [
        { label: "Check ID Requirements", action: "open_kyc_widget" },
        { label: "Quadruple Sharing Rates", prompt: "What are the rates for Quadruple Sharing rooms?" },
      ];
    } else if (widgetType === "kyc_checklist") {
      descriptionText = "Here is the official checklist of accepted Philippine Government IDs and documentation required for tenant verification:";
      defaultActions = [
        { label: "Browse Available Rooms", url: "/applicant/check-availability" },
        { label: "Request Front Desk Assistance", action: "open_escalation_form" },
      ];
    } else if (widgetType === "room_showcase") {
      descriptionText = "Here is an overview of our dormitory room features and starting monthly rental rates:";
      defaultActions = [
        { label: "Check ID Requirements", action: "open_kyc_widget" },
        { label: "Browse Available Rooms", url: "/applicant/check-availability" },
      ];
    }

    const injectedMessage = {
      id: `bot-widget-${Date.now()}`,
      role: "assistant",
      text: descriptionText,
      timestamp: Date.now(),
      isStreaming: false,
      richWidgets: [
        {
          type: widgetType,
          data: widgetDescriptor?.data || {},
        },
      ],
      suggestedActions: defaultActions,
    };

    setMessages((prev) => [...prev, injectedMessage]);
  }, [touchActivity]);

  // Send message handler with SSE Streaming support
  const handleSendMessage = useCallback(
    async (textToSend) => {
      const queryText = (textToSend || input).trim();
      if (!queryText || isTyping) return;

      // Abort any ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: queryText,
        timestamp: Date.now(),
      };

      const botMessageId = `bot-${Date.now()}`;
      const placeholderBotMessage = {
        id: botMessageId,
        role: "assistant",
        text: "",
        timestamp: Date.now(),
        isStreaming: true,
        richWidgets: [],
        suggestedActions: [],
      };

      // Optimistic message list update
      setMessages((prev) => [...prev, userMessage, placeholderBotMessage]);
      setInput("");
      setIsTyping(true);
      touchActivity();

      // Format conversation history for backend context (pruned to last 8 clean turns)
      const conversationHistory = messages
        .slice(-8)
        .filter((m) => m.text && !m.isError)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      try {
        await chatbotApi.streamPublicChatbot({
          message: queryText,
          conversationHistory,
          branchFocus: "all",
          signal: abortController.signal,
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? {
                      ...msg,
                      text: msg.text + token,
                      isStreaming: true,
                    }
                  : msg
              )
            );
          },
          onWidget: (widget) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? {
                      ...msg,
                      richWidgets: msg.richWidgets?.some((w) => w.type === widget.type)
                        ? msg.richWidgets
                        : [...(msg.richWidgets || []), widget],
                    }
                  : msg
              )
            );
          },
          onActions: (actions) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? {
                      ...msg,
                      suggestedActions: actions,
                    }
                  : msg
              )
            );
          },
          onDone: (finalResult) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? {
                      ...msg,
                      text: msg.text || finalResult?.text || "",
                      richWidgets:
                        msg.richWidgets?.length > 0
                          ? msg.richWidgets
                          : finalResult?.widget
                          ? Array.isArray(finalResult.widget)
                            ? finalResult.widget
                            : [finalResult.widget]
                          : [],
                      suggestedActions:
                        msg.suggestedActions?.length > 0
                          ? msg.suggestedActions
                          : finalResult?.actions || [],
                      isStreaming: false,
                    }
                  : msg
              )
            );
            setIsTyping(false);
            touchActivity();
          },
          onError: (err) => {
            console.error("Public Chatbot stream error:", err);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? {
                      ...msg,
                      text: msg.text || "We encountered an issue connecting to the AI assistant. You can retry or request front desk assistance.",
                      isError: true,
                      isStreaming: false,
                      suggestedActions: [
                        { label: "Request Front Desk Assistance", action: "open_escalation_form" },
                      ],
                    }
                  : msg
              )
            );
            setIsTyping(false);
          },
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Chatbot submission caught error:", err);
          setIsTyping(false);
        }
      }
    },
    [input, isTyping, messages, touchActivity]
  );

  // Save messages to sessionStorage and update last active timestamp
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    } catch {
      // Ignore quota errors
    }
  }, [messages]);

  // Periodic and focus-based inactivity timeout watcher (15 minutes with 2-minute warning)
  useEffect(() => {
    const checkInactivity = () => {
      try {
        const lastActive = sessionStorage.getItem(LAST_ACTIVE_KEY);
        if (!lastActive) return;

        const lastActiveTime = parseInt(lastActive, 10);
        if (isNaN(lastActiveTime)) return;

        const idleMs = Date.now() - lastActiveTime;

        // 15-Minute Expiration Reset
        if (idleMs >= INACTIVITY_TIMEOUT_MS) {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          const resetMsg = [
            {
              ...INITIAL_MESSAGE,
              id: `welcome-${Date.now()}`,
              timestamp: Date.now(),
            },
          ];
          setMessages(resetMsg);
          setIsEscalating(false);
          setIsTyping(false);
          setShowInactivityWarning(false);
          setSessionExpiryNotice("Session reset due to 15 minutes of inactivity.");
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
          return;
        }

        // 13-Minute Warning Trigger (shown only if visitor has started chatting)
        const hasUserChatted = messages.length > 1 || messages.some((m) => m.role === "user");
        if (idleMs >= WARNING_THRESHOLD_MS && hasUserChatted) {
          const secondsLeft = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - idleMs) / 1000));
          setInactivitySecondsLeft(secondsLeft);
          setShowInactivityWarning(true);
        } else if (idleMs < WARNING_THRESHOLD_MS && showInactivityWarning) {
          setShowInactivityWarning(false);
        }
      } catch {
        // Ignore
      }
    };

    const interval = setInterval(checkInactivity, 1000);
    window.addEventListener("focus", checkInactivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkInactivity);
    };
  }, [messages, showInactivityWarning]);

  // Auto-dismiss session reset expiry banner after 6 seconds
  useEffect(() => {
    if (sessionExpiryNotice) {
      const timer = setTimeout(() => {
        setSessionExpiryNotice(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [sessionExpiryNotice]);

  // Focus input and touch activity on open
  useEffect(() => {
    if (isOpen) {
      touchActivity();
      setTimeout(() => {
        if (inputRef.current && !isEscalating) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, isEscalating, touchActivity]);

  // Escape key closes modal (when confirmation modal is not open)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !showClearConfirm && !showInactivityWarning) {
        handleModalClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showClearConfirm, showInactivityWarning]);

  // Cleanup active stream on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle initial external prompt if provided (consumed once per trigger)
  useEffect(() => {
    if (initialPrompt && isOpen && lastProcessedPromptRef.current !== initialPrompt) {
      lastProcessedPromptRef.current = initialPrompt;
      handleSendMessage(initialPrompt);
      if (typeof onClearInitialPrompt === "function") {
        onClearInitialPrompt();
      }
    }
  }, [initialPrompt, isOpen, handleSendMessage, onClearInitialPrompt]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleModalClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  };

  const handleClearHistory = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    lastProcessedPromptRef.current = null;
    if (typeof onClearInitialPrompt === "function") {
      onClearInitialPrompt();
    }
    const reset = [
      {
        ...INITIAL_MESSAGE,
        id: `welcome-${Date.now()}`,
        timestamp: Date.now(),
      },
    ];
    setMessages(reset);
    setIsEscalating(false);
    setIsTyping(false);
    setShowInactivityWarning(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    } catch {
      // Ignore
    }
    setShowClearConfirm(false);
  };

  const handleExtendSession = () => {
    touchActivity();
    setShowInactivityWarning(false);
  };

  const handleOpenEscalation = (action) => {
    touchActivity();
    setEscalationContext(action?.prompt || input || "Assistance request from AI chat");
    setIsEscalating(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalPopIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes liveDotPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            box-shadow: 0 0 0 5px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        .lc-live-dot {
          animation: liveDotPulse 2.2s ease-in-out infinite;
        }

        .lc-public-send-btn {
          background-color: #0A1628 !important;
          border: 1px solid #0A1628 !important;
          color: #ffffff !important;
          transition: background-color 0.15s ease, transform 0.15s ease;
        }

        .lc-public-send-btn svg {
          color: #ffffff !important;
          stroke: #ffffff !important;
        }

        .lc-public-send-btn:hover:not(:disabled) {
          background-color: #162f53 !important;
        }

        .dark .lc-public-send-btn,
        [data-theme="dark"] .lc-public-send-btn {
          background-color: #D4AF37 !important;
          border: 1px solid #B9921F !important;
          color: #0A1628 !important;
        }

        .dark .lc-public-send-btn svg,
        [data-theme="dark"] .lc-public-send-btn svg {
          color: #0A1628 !important;
          stroke: #0A1628 !important;
        }

        .dark .lc-public-send-btn:hover:not(:disabled),
        [data-theme="dark"] .lc-public-send-btn:hover:not(:disabled) {
          background-color: #E5C358 !important;
        }

        .lc-public-chat-input:focus {
          border-color: #0A1628 !important;
          box-shadow: 0 0 0 1px #0A1628;
        }

        .dark .lc-public-chat-input:focus,
        [data-theme="dark"] .lc-public-chat-input:focus {
          border-color: #D4AF37 !important;
          box-shadow: 0 0 0 1px #D4AF37;
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chatbot-header-title"
        className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-[380px] h-[100dvh] sm:h-[560px] max-h-[100dvh] sm:max-h-[560px] z-[999] flex flex-col rounded-none sm:rounded-2xl shadow-2xl overflow-hidden bg-white dark:bg-[#08111F] border border-slate-300 dark:border-slate-700"
        style={{
          backgroundColor: "var(--lp-bg, #ffffff)",
          borderColor: "var(--lp-border, #cbd5e1)",
          animation: "modalPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          transformOrigin: "bottom right",
        }}
      >
        {/* Header */}
        <div
          className="px-3.5 py-3 flex items-center justify-between flex-shrink-0 select-none bg-white dark:bg-[#08111F] border-b border-slate-300 dark:border-slate-700"
          style={{
            backgroundColor: "var(--lp-bg, #ffffff)",
            borderBottomColor: "var(--lp-border, #cbd5e1)",
          }}
        >
          {/* Left: Avatar + Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 select-none shadow-xs overflow-hidden bg-white dark:bg-slate-800 border-[1.5px] border-[#D4AF37] dark:border-[#D4AF37] p-[3.5px]"
            >
              <img
                src="/lilycrest-logo.png"
                alt="Lilycrest Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3
                  id="chatbot-header-title"
                  className="text-xs sm:text-sm font-bold tracking-tight truncate text-[#162f53] dark:text-[#F8FAFC]"
                  style={{ color: "var(--lp-text, #162f53)" }}
                >
                  Lilycrest AI Chatbot
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] dark:text-[#A8B3C3]" style={{ color: "var(--lp-text-secondary, #64748B)" }}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 lc-live-dot flex-shrink-0" />
                <span className="truncate">Online • 24/7 Digital Assistant</span>
              </div>
            </div>
          </div>

          {/* Right: Actions (Staff Assistance, Clear, Close) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Request Staff Assistance Shortcut */}
            <button
              type="button"
              onClick={() => {
                touchActivity();
                setIsEscalating(!isEscalating);
              }}
              title="Request Front Desk Assistance"
              aria-label="Request Front Desk Assistance"
              className="p-1.5 rounded-lg text-slate-600 hover:text-amber-800 hover:bg-amber-50 dark:text-slate-300 dark:hover:text-amber-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Headphones size={15} />
            </button>

            {/* Clear History */}
            <button
              type="button"
              onClick={handleClearHistory}
              title="Reset conversation"
              aria-label="Reset conversation"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={handleModalClose}
              title="Close chatbot"
              aria-label="Close chatbot window"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Expiry Notice Banner */}
        {sessionExpiryNotice && (
          <div
            className="px-3 py-1.5 flex items-center justify-between text-[11px] font-medium border-b flex-shrink-0 bg-amber-50/90 dark:bg-amber-950/40 border-[#E6D9B2] dark:border-amber-900/60 text-amber-800 dark:text-amber-300"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">{sessionExpiryNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setSessionExpiryNotice(null)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors ml-1 flex-shrink-0 cursor-pointer"
              aria-label="Dismiss notice"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Body / Active View */}
        <div className="flex-1 overflow-hidden flex flex-col relative bg-white dark:bg-[#08111F]" style={{ backgroundColor: "var(--lp-bg, #ffffff)" }}>
          {/* Inactivity Warning Dialog Overlay */}
          {showInactivityWarning && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center p-4"
              style={{
                backgroundColor: "rgba(10, 22, 40, 0.75)",
                backdropFilter: "blur(2px)",
              }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="inactivity-warning-title"
            >
              <div
                className="w-full max-w-[300px] rounded-2xl p-4 shadow-2xl text-center space-y-3 bg-white dark:bg-[#111C31] border border-[#E6D9B2] dark:border-[#27334A]"
              >
                <div className="space-y-1">
                  <AlertTriangle size={24} className="text-amber-600 dark:text-amber-400 mx-auto" />
                  <h4
                    id="inactivity-warning-title"
                    className="text-sm font-bold tracking-tight text-[#162f53] dark:text-[#F8FAFC]"
                  >
                    Session Expiring Soon
                  </h4>
                  <p
                    className="text-xs leading-relaxed text-[#64748B] dark:text-[#D0D7E2]"
                  >
                    Your chat session has been idle and will reset in{" "}
                    <strong className="font-semibold text-amber-700 dark:text-amber-400">
                      {Math.floor(inactivitySecondsLeft / 60)}:{String(inactivitySecondsLeft % 60).padStart(2, "0")}
                    </strong>{" "}
                    to protect your privacy.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmClear}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    Reset Now
                  </button>
                  <button
                    type="button"
                    onClick={handleExtendSession}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-white dark:text-[#0A1628] bg-[#0A1628] dark:bg-[#D4AF37] hover:bg-[#162f53] dark:hover:bg-[#E5C358] transition-all cursor-pointer shadow-xs active:scale-95 border border-[#0A1628] dark:border-[#B9921F]"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {isEscalating ? (
            <div className="flex-1 overflow-y-auto px-2 py-1.5">
              <ChatLeadEscalationForm
                initialBranch="all"
                initialMessage={escalationContext}
                conversationHistory={messages}
                onCancel={() => setIsEscalating(false)}
                onClose={() => setIsEscalating(false)}
                onSuccessSubmitted={(submittedData) => {
                  touchActivity();
                  if (submittedData?.inquiryId) {
                    const confirmationMsg = {
                      id: `escalation-confirm-${Date.now()}`,
                      role: "assistant",
                      text: `Your assistance request has been submitted successfully with reference ID **${submittedData.inquiryId}**. Our Front Desk Admin Team will contact you shortly.`,
                      timestamp: Date.now(),
                      isStreaming: false,
                    };
                    setMessages((prev) => [...prev, confirmationMsg]);
                  }
                }}
              />
            </div>
          ) : (
            <>
              {/* Message List */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <ChatMessageList
                  messages={messages}
                  isTyping={isTyping}
                  showQuickPrompts={messages.filter((m) => m.role === "user").length === 0}
                  onSelectPrompt={handleSendMessage}
                  onOpenEscalation={handleOpenEscalation}
                  onOpenWidget={handleOpenWidget}
                  onScrollActivity={touchActivity}
                  onRetry={() => {
                    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                    if (lastUserMsg) {
                      handleSendMessage(lastUserMsg.text);
                    }
                  }}
                />
              </div>

              {/* Quick Actions Bar */}
              <div
                className="px-3 py-2 border-t flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none text-xs flex-shrink-0 bg-slate-50/80 dark:bg-[#0B1628] border-[#E6D9B2] dark:border-[#27334A]"
              >
                <button
                  type="button"
                  onClick={() => handleOpenWidget("kyc_checklist")}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs bg-white dark:bg-[#162238] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-amber-50/80 dark:hover:bg-slate-700/80 hover:border-amber-400 dark:hover:border-amber-400"
                >
                  <FileCheck size={13} className="text-amber-600 dark:text-amber-400" />
                  <span className="font-bold">ID Requirements</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    touchActivity();
                    setIsEscalating(true);
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs bg-white dark:bg-[#162238] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-amber-50/80 dark:hover:bg-slate-700/80 hover:border-amber-400 dark:hover:border-amber-400"
                >
                  <Headphones size={13} className="text-amber-600 dark:text-amber-400" />
                  <span className="font-bold">Front Desk Assistance</span>
                </button>
              </div>

              {/* Input Bar */}
              <div
                className="p-2.5 border-t flex-shrink-0 bg-white dark:bg-[#08111F] border-[#E6D9B2] dark:border-[#27334A]"
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <div className="flex-1 relative flex items-center">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        touchActivity();
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about rates, curfews, or locations..."
                      disabled={isTyping}
                      className="w-full text-xs py-2 px-3 pr-8 rounded-xl border outline-none resize-none transition-all disabled:opacity-60 bg-slate-50 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-1 focus:ring-amber-500/20 max-h-[80px]"
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    title="Send message"
                    aria-label="Send message"
                    className="w-9 h-9 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-xs focus:outline-none active:scale-95 flex-shrink-0 bg-[#0A1628] dark:bg-[#D4AF37] text-white dark:text-[#0A1628] hover:bg-[#162f53] dark:hover:bg-[#E5C358] border border-[#0A1628] dark:border-[#B9921F]"
                  >
                    {isTyping ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </form>

                <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                  <span>Press Enter to send</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Resetting Conversation */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="Clear Conversation"
        message="Are you sure you want to clear this conversation? This will reset your current chat history and start a fresh session."
        confirmText="Clear Chat"
        cancelText="Cancel"
        variant="warning"
      />
    </>
  );
}

export default PublicChatbotModal;
