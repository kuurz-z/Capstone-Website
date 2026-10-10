import { allowedSupportStatuses } from '../../../../shared/utils/supportConcern.js';
import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  Sparkles,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { chatApi } from "../../../../shared/api/chatApi.js";
import { validateFile } from "../../../../shared/utils/firebaseStorageUpload.js";
import { showNotification } from "../../../../shared/utils/notification";
import AdminAssistantReplyButton from "../assistant/AdminAssistantReplyButton";
import {
  QUICK_REPLIES,
  MAX_SUPPORT_ATTACHMENTS,
  fmtFileSize,
} from "./chatConstants";

export default function AdminChatComposer({
  selectedConversation = null,
  messages = [],
  replyText = "",
  setReplyText,
  stagedAttachments = [],
  setStagedAttachments,
  sending = false,
  uploadingAttachments = false,
  replyError = "",
  setReplyError,
  onSendReply,
  onRequestResolution,
  updatingStatus = false,
}) {
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const fileInputRef = useRef(null);
  const typingSendRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newAttachments = [];
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        showNotification(validation.error, "error");
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      newAttachments.push({
        file,
        previewUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        isImage,
      });
    }

    if (newAttachments.length > 0) {
      setStagedAttachments((prev) =>
        [...prev, ...newAttachments].slice(0, MAX_SUPPORT_ATTACHMENTS),
      );
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveStagedAttachment = (index) => {
    setStagedAttachments((prev) => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePaste = (e) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    const pastedImages = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const validation = validateFile(file);
          if (!validation.valid) {
            showNotification(validation.error, "error");
            continue;
          }
          const previewUrl = URL.createObjectURL(file);
          const extension = file.type.split("/")[1] || "png";
          const formattedName =
            file.name && file.name !== "image.png"
              ? file.name
              : `Pasted_Image_${Date.now()}.${extension}`;
          pastedImages.push({
            file,
            previewUrl,
            name: formattedName,
            size: file.size,
            type: file.type,
            isImage: true,
          });
        }
      }
    }

    if (pastedImages.length > 0) {
      setStagedAttachments((prev) =>
        [...prev, ...pastedImages].slice(0, MAX_SUPPORT_ATTACHMENTS),
      );
      const hasText = e.clipboardData.getData("text/plain");
      if (!hasText) {
        e.preventDefault();
      }
    }
  };

  const handleKeyDownReply = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendReply();
    }
  };

  const handleTextChange = (e) => {
    setReplyText(e.target.value);
    if (replyError) setReplyError("");

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
  };

  return (
    <footer className="p-3 border-t border-border bg-card space-y-2">
      {/* Expandable Quick Replies */}
      {showQuickReplies && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 border-b border-border/40 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {QUICK_REPLIES.map((template) => (
            <button
              type="button"
              key={template.id}
              disabled={template.action === "resolve" && (sending || uploadingAttachments || updatingStatus || !onRequestResolution || !allowedSupportStatuses(selectedConversation).includes("resolved"))}
              onClick={() => {
                if (template.action === "resolve") {
                  onRequestResolution();
                  return;
                }
                setReplyText(template.text);
                if (replyError) setReplyError("");
              }}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap cursor-pointer shrink-0"
            >
              {template.text}
            </button>
          ))}
        </div>
      )}

      {/* Expandable AI Auto-Draft Reply */}
      {showAiDraft && (
        <div className="pt-0.5 pb-1 border-b border-border/40 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <AdminAssistantReplyButton
            conversationId={selectedConversation?.id}
            ticketCategory={selectedConversation?.category || "general_inquiry"}
            urgency={selectedConversation?.priority || "normal"}
            recentMessages={
              Array.isArray(messages)
                ? messages.slice(-6).map((m) => ({
                    senderRole: m.senderRole || (m.isStaff ? "admin" : "tenant"),
                    message: m.message || "",
                  }))
                : []
            }
            tenantContext={{
              tenantName: selectedConversation?.tenantName,
              roomNumber: selectedConversation?.roomNumber,
              branch: selectedConversation?.branch,
            }}
            branch={selectedConversation?.branch}
            onDraftGenerated={(draft) => {
              setReplyText(draft);
              if (replyError) setReplyError("");
            }}
            disabled={sending}
          />
        </div>
      )}

      {/* Collapsible Action Bar & Attachment Trigger */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowQuickReplies((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors cursor-pointer ${
              showQuickReplies
                ? "bg-muted border-border text-foreground shadow-2xs"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Toggle quick response templates"
          >
            <Zap
              size={13}
              className={showQuickReplies ? "text-amber-500" : "text-muted-foreground"}
            />
            <span>Quick Replies</span>
            {showQuickReplies ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>

          <button
            type="button"
            onClick={() => setShowAiDraft((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors cursor-pointer ${
              showAiDraft
                ? "bg-muted border-border text-foreground shadow-2xs"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
            title="Toggle AI Auto-Draft Assistant"
          >
            <Sparkles
              size={13}
              className={showAiDraft ? "text-primary" : "text-muted-foreground"}
            />
            <span>AI Draft Reply</span>
            {showAiDraft ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingAttachments}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-50"
            title="Attach photos or documents (JPEG, PNG, WebP, PDF up to 5MB)"
          >
            <Paperclip size={13} className="text-muted-foreground" />
            <span>Attach File / Photo</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {/* Staged Attachments Tray */}
      {stagedAttachments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1.5 px-1 bg-muted/40 rounded-lg border border-border animate-in fade-in duration-150">
          {stagedAttachments.map((item, idx) => (
            <div
              key={idx}
              className="relative group flex items-center gap-2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground shrink-0 shadow-2xs"
            >
              {item.isImage && item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="h-8 w-8 rounded object-cover border border-border/50 shrink-0"
                />
              ) : (
                <FileText size={18} className="text-muted-foreground shrink-0" />
              )}
              <div className="max-w-[120px] truncate">
                <p className="font-medium text-[11px] truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">{fmtFileSize(item.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveStagedAttachment(idx)}
                disabled={sending || uploadingAttachments}
                className="ml-1 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                title="Remove attachment"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {replyError && (
        <div className="text-xs text-destructive flex items-center gap-1">
          <XCircle size={13} />
          <span>{replyError}</span>
        </div>
      )}

      <div>
        <textarea
          value={replyText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDownReply}
          onPaste={handlePaste}
          placeholder="Type a reply or paste photos... (Press Enter to send, Shift+Enter for new line)"
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-border bg-input-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border transition-colors resize-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] ${
            replyText.length > 900
              ? "text-rose-600 font-bold"
              : "text-muted-foreground"
          }`}
        >
          {replyText.trim().length} / 1000
        </span>

        <button
          type="button"
          onClick={onSendReply}
          disabled={
            sending ||
            uploadingAttachments ||
            (!replyText.trim() && stagedAttachments.length === 0)
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {sending || uploadingAttachments ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          <span>
            {uploadingAttachments
              ? "Uploading..."
              : sending
              ? "Sending..."
              : "Send Reply"}
          </span>
        </button>
      </div>
    </footer>
  );
}
