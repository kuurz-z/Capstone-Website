import { normalizeSupportConcern, reconcileSupportConcern, supportStatusPayload } from '../../../../shared/utils/supportConcern.js';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { chatApi } from "../../../../shared/api/chatApi.js";
import { useAuth } from "../../../../shared/hooks/useAuth";
import useChatSocket from "../../../../shared/hooks/useChatSocket.js";
import { showNotification } from "../../../../shared/utils/notification";
import {
  downloadChatTranscript,
  getErrorMessage,
  getStatusLabel,
  getPriorityLabel,
} from "./chatConstants";

export function useAdminChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const listSequence = useRef(0);
  const selectedId = useRef(null);
  const messageSequence = useRef(0);
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [branchFilter, setBranchFilter] = useState("all");
  const [conversations, setConversations] = useState([]);
  const [accessInfo, setAccessInfo] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [dismissedClusters, setDismissedClusters] = useState({});
  const [stagedAttachments, setStagedAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState(null);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);

  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [listError, setListError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [tenantTyping, setTenantTyping] = useState(null);

  const hasLoadedOnceRef = useRef(false);
  const typingClearRef = useRef(null);
  const feedContainerRef = useRef(null);
  const messageEndRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = feedContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        if (!hasLoadedOnceRef.current) setInitialLoading(true);
        else setIsRefreshing(true);
      }
      setListError("");
      const sequence = ++listSequence.current;
      try {
        const data = await chatApi.getAdminConversations({
          branch: isOwner ? branchFilter : "all",
          requestId: new URLSearchParams(location.search).get("requestId"),
          conversationId: new URLSearchParams(location.search).get("conversationId"),
        });
        if (sequence !== listSequence.current) return;
        const nextConversations = (data?.conversations || []).map((item) => normalizeSupportConcern(item));
        setConversations((current) => nextConversations.map((item) => reconcileSupportConcern(current.find((old) => old.id === item.id), item)));
        setAccessInfo(data?.access || null);
        hasLoadedOnceRef.current = true;
        setSelectedConversation((current) => {
          if (!current) return current;
          const next = nextConversations.find((item) => item.id === current.id);
          return next ? reconcileSupportConcern(current, next) : null;
        });
      } catch (error) {
        if (sequence !== listSequence.current) return;
        const message = getErrorMessage(error, "Failed to load conversations.");
        setListError(message);
        if (!silent) showNotification(message, "error");
      } finally {
        if (sequence === listSequence.current) {
          setInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [branchFilter, isOwner, location.search],
  );

  const loadMessages = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) return [];
      const sequence = ++messageSequence.current;
      if (!silent) setMessagesLoading(true);
      try {
        const data = await chatApi.getAdminMessages(conversationId);
        const nextMessages = data?.messages || [];
        if (selectedId.current !== conversationId || sequence !== messageSequence.current) return [];
        setMessages(nextMessages);
        if (data.conversation) {
          setSelectedConversation((current) => reconcileSupportConcern(current, data.conversation));
          setConversations((current) => current.map((item) => item.id === conversationId ? reconcileSupportConcern(item, data.conversation) : item));
        }
        await loadConversations({ silent: true });
        return nextMessages;
      } catch (error) {
        if (selectedId.current !== conversationId || sequence !== messageSequence.current) return [];
        if ([403, 404].includes(error?.response?.status) && selectedId.current === conversationId) {
          setSelectedConversation(null);
          setMessages([]);
          setConversations((current) => current.filter((item) => item.id !== conversationId));
        }
        const message = getErrorMessage(error, "Failed to load messages.");
        if (!silent) showNotification(message, "error");
        return [];
      } finally {
        if (!silent && sequence === messageSequence.current) setMessagesLoading(false);
      }
    },
    [loadConversations],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useLayoutEffect(() => {
    if (!messagesLoading && messages.length > 0) {
      scrollToBottom("auto");
    }
  }, [messages, messagesLoading, scrollToBottom]);

  useEffect(() => {
    if (!messagesLoading && messages.length > 0) {
      scrollToBottom("auto");
      const rAF = requestAnimationFrame(() => scrollToBottom("auto"));
      const t1 = setTimeout(() => scrollToBottom("auto"), 50);
      const t2 = setTimeout(() => scrollToBottom("auto"), 150);
      const t3 = setTimeout(() => scrollToBottom("auto"), 300);
      return () => {
        cancelAnimationFrame(rAF);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [messages, messagesLoading, selectedConversation?.id, tenantTyping, scrollToBottom]);

  const { isConnected: socketConnected } = useChatSocket({
    onTyping: ({ conversationId, senderRole, senderName } = {}) => {
      if (senderRole === "tenant" && selectedConversation?.id === conversationId) {
        setTenantTyping({ name: senderName, conversationId });
        window.clearTimeout(typingClearRef.current);
        typingClearRef.current = window.setTimeout(() => setTenantTyping(null), 4000);
      }
    },
    onNewMessage: ({ message, conversationId } = {}) => {
      if (!conversationId || !message) return;
      if (selectedConversation?.id === conversationId) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;
          return [...current, message];
        });
        chatApi.markAdminRead(conversationId).catch(() => {});
      }
      loadConversations({ silent: true });
    },
    onMessagesRead: ({ conversationId, readerRole, readAt } = {}) => {
      if (selectedConversation?.id === conversationId && readerRole === "tenant") {
        setMessages((current) =>
          current.map((msg) => {
            if (msg.senderRole !== "tenant" && !msg.readAt) {
              return { ...msg, readAt: readAt || new Date().toISOString() };
            }
            return msg;
          }),
        );
      }
    },
    // Socket payloads are invalidations: refetch through the scoped API.
    onConversationUpdated: () => loadConversations({ silent: true }),
  });

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      if (selectedId.current) loadMessages(selectedId.current, { silent: true });
      else loadConversations({ silent: true });
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadConversations, loadMessages]);

  useEffect(() => { selectedId.current = selectedConversation?.id || null; }, [selectedConversation?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestId = params.get('requestId');
    const conversationId = params.get('conversationId');
    if (!requestId && !conversationId) return;
    const exact = conversations.find((item) => (!requestId || item.requestId === requestId) && (!conversationId || item.id === conversationId));
    if (exact && selectedId.current !== exact.id) handleSelectConversation(exact);
  }, [location.search, conversations]);

  const handleSelectConversation = async (conversation) => {
    selectedId.current = conversation.id;
    setMessages([]);
    setStatusModalOpen(false);
    setCloseModalOpen(false);
    setPriorityModalOpen(false);
    setSelectedConversation(conversation);
    setReplyError("");
    setReplyText("");
    setTenantTyping(null);
    await loadMessages(conversation.id);
    requestAnimationFrame(() => scrollToBottom("auto"));
    setTimeout(() => scrollToBottom("auto"), 50);
  };

  const handleRefresh = async () => {
    await loadConversations();
    if (selectedConversation?.id) {
      await loadMessages(selectedConversation.id);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversation || selectedConversation.lifecycleLocked || (!selectedConversation.legacy && selectedConversation.status === "resolved") || sending || uploadingAttachments) return;
    const message = replyText.trim();
    if (!message && stagedAttachments.length === 0) {
      setReplyError("Please enter a reply message or attach a file.");
      return;
    }
    if (message.length > 1000) {
      setReplyError("Reply exceeds maximum length of 1000 characters.");
      return;
    }

    setSending(true);
    setReplyError("");
    try {
      let uploadedAttachments = [];
      if (stagedAttachments.length > 0) {
        setUploadingAttachments(true);
        const uploadPromises = stagedAttachments.map(async (item) => {
          const result = await chatApi.uploadAttachment(selectedConversation.id, item.file);
          return result.attachment;
        });
        uploadedAttachments = await Promise.all(uploadPromises);
      }

      const data = await chatApi.sendAdminMessage(
        selectedConversation.id,
        message,
        uploadedAttachments,
      );

      if (selectedId.current !== selectedConversation.id) {
        await loadConversations({ silent: true });
        return;
      }
      stagedAttachments.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setStagedAttachments([]);
      setReplyText("");
      setMessages((current) => {
        const next = [...current, data.message].filter(Boolean);
        const seen = new Set();
        return next.filter((m) => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      });
      setSelectedConversation((current) => current?.id === data.conversation?.id ? reconcileSupportConcern(current, data.conversation) : current);
      await loadConversations({ silent: true });
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      const messageText = getErrorMessage(error, "Failed to send reply.");
      setReplyError(messageText);
      showNotification(messageText, "error");
    } finally {
      setSending(false);
      setUploadingAttachments(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedConversation || assigning) return;
    setAssigning(true);
    try {
      const data = await chatApi.assignConversation(selectedConversation.id, "me");
      setSelectedConversation((current) => current?.id === data.conversation?.id ? reconcileSupportConcern(current, data.conversation) : current);
      await loadConversations({ silent: true });
      showNotification("Conversation assigned successfully.", "success");
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      showNotification(getErrorMessage(error, "Failed to assign conversation."), "error");
    } finally {
      setAssigning(false);
    }
  };

  const handleConfirmStatusChange = async (pendingStatus, note = "", setNoteError) => {
    if (!selectedConversation || updatingStatus) return;
    if (pendingStatus === selectedConversation.status) {
      setStatusModalOpen(false);
      return;
    }
    if (pendingStatus === "closed") {
      setStatusModalOpen(false);
      setCloseModalOpen(true);
      return;
    }

    setUpdatingStatus(true);
    try {
      const payload = supportStatusPayload(selectedConversation, pendingStatus, note);
      const data = await chatApi.updateStatus(selectedConversation.id, payload.status, payload.note, payload);
      setSelectedConversation((current) => current?.id === data.conversation?.id ? reconcileSupportConcern(current, data.conversation) : current);
      await loadConversations({ silent: true });
      setStatusModalOpen(false);
      showNotification(`Conversation status changed to ${getStatusLabel(pendingStatus)}.`, "success");
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      const message = getErrorMessage(error, "Failed to update conversation status.");
      setNoteError?.(message);
      showNotification(message, "error");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmPriorityChange = async (pendingPriority) => {
    if (!selectedConversation || updatingPriority) return;
    if (pendingPriority === selectedConversation.priority) {
      setPriorityModalOpen(false);
      return;
    }

    setUpdatingPriority(true);
    try {
      const data = await chatApi.updatePriority(selectedConversation.id, pendingPriority);
      setSelectedConversation((current) => current?.id === data.conversation?.id ? reconcileSupportConcern(current, data.conversation) : current);
      await loadConversations({ silent: true });
      setPriorityModalOpen(false);
      showNotification(`Conversation priority changed to ${getPriorityLabel(pendingPriority)}.`, "success");
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      showNotification(getErrorMessage(error, "Failed to update conversation priority."), "error");
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleConfirmClose = async (note, setNoteError) => {
    if (!selectedConversation || closing || selectedConversation.lifecycleLocked) return;
    setClosing(true);
    try {
      const payload = supportStatusPayload(selectedConversation, "closed", note);
      const data = selectedConversation.legacy
        ? await chatApi.closeConversation(selectedConversation.id, payload.note)
        : await chatApi.updateStatus(selectedConversation.id, payload.status, payload.note, payload);
      setSelectedConversation((current) => current?.id === data.conversation?.id ? reconcileSupportConcern(current, data.conversation) : current);
      await loadConversations({ silent: true });
      setCloseModalOpen(false);
      showNotification("Conversation closed successfully.", "success");
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      const msg = getErrorMessage(error, "Failed to close conversation.");
      if (setNoteError) setNoteError(msg);
      showNotification(msg, "error");
    } finally {
      setClosing(false);
    }
  };

  const handleDownloadTranscript = async () => {
    if (!selectedConversation || downloading) return;
    setDownloading(true);
    try {
      await downloadChatTranscript(selectedConversation, messages);
      showNotification("Chat transcript downloaded.", "success");
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      showNotification(getErrorMessage(error, "Failed to download transcript."), "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      const blob = await chatApi.getAttachmentBlob(attachment);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.name || attachment.fileName || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      if (error?.response?.status === 409) {
        await loadConversations({ silent: true });
        showNotification("This concern changed. The latest status has been refreshed.", "error");
      }
      showNotification(getErrorMessage(error, "Unable to download attachment."), "error");
    }
  };

  const handleReviewRoomHistory = useCallback(() => {
    if (!selectedConversation) return;
    const searchParam = selectedConversation.roomNumber || "";
    const branchParam = selectedConversation.branch || "";
    const params = new URLSearchParams();
    if (searchParam) params.set("search", searchParam);
    if (branchParam) params.set("branch", branchParam);
    navigate(`/admin/maintenance?${params.toString()}`);
  }, [navigate, selectedConversation]);

  const unreadTotal = useMemo(
    () => conversations.reduce((total, item) => total + (item.unreadAdminCount || 0), 0),
    [conversations],
  );
  const urgentTotal = useMemo(
    () => conversations.filter((item) => item.priority === "urgent").length,
    [conversations],
  );
  const assignedToMeTotal = useMemo(() => {
    const myAdminId = accessInfo?.adminId || user?._id || user?.id;
    return conversations.filter(
      (item) => item.assignedAdminId && String(item.assignedAdminId) === String(myAdminId),
    ).length;
  }, [conversations, accessInfo?.adminId, user?._id, user?.id]);

  return {
    isOwner,
    user,
    branchFilter,
    setBranchFilter,
    conversations,
    accessInfo,
    selectedConversation,
    messages,
    replyText,
    setReplyText,
    stagedAttachments,
    setStagedAttachments,
    uploadingAttachments,
    sending,
    closing,
    assigning,
    updatingStatus,
    updatingPriority,
    downloading,
    listError,
    replyError,
    setReplyError,
    tenantTyping,
    dismissedClusters,
    setDismissedClusters,
    initialLoading,
    isRefreshing,
    messagesLoading,
    socketConnected,
    previewImageModal,
    setPreviewImageModal,
    closeModalOpen,
    setCloseModalOpen,
    statusModalOpen,
    setStatusModalOpen,
    priorityModalOpen,
    setPriorityModalOpen,
    unreadTotal,
    urgentTotal,
    assignedToMeTotal,
    feedContainerRef,
    messageEndRef,
    scrollToBottom,
    handleSelectConversation,
    handleRefresh,
    handleSendReply,
    handleAssignToMe,
    handleConfirmStatusChange,
    handleConfirmPriorityChange,
    handleConfirmClose,
    handleDownloadTranscript,
    handleDownloadAttachment,
    handleReviewRoomHistory,
  };
}
