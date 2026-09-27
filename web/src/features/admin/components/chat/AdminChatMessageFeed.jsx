import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  Eye,
  FileText,
  ImageOff,
  MessageSquare,
} from "lucide-react";
import { chatApi } from "../../../../shared/api/chatApi.js";
import ProfileAvatar from "../../../../shared/components/ProfileAvatar";
import { ChatMessageFeedSkeleton } from "../AdminContentSkeletons";
import {
  fmtDateTime,
  fmtShortTime,
  fmtDateDivider,
  isSameDay,
  fmtFileSize,
  getBranchLabel,
  getRoomLabel,
  getCategoryLabel,
  getInitials,
} from "./chatConstants";

export function ProtectedChatImage({ attachment, className, onOpen, onLoad }) {
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setStatus("loading");
    setSource("");
    chatApi
      .getAttachmentBlob(attachment)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSource(objectUrl);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, attempt]);

  if (status === "error") {
    return (
      <div
        className={`${className} bg-muted border border-border/60 rounded-lg flex flex-col items-center justify-center gap-1 text-center p-2`}
        role="alert"
        data-attachment-state="error"
      >
        <ImageOff size={18} className="text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] leading-tight text-muted-foreground">
          Attachment unavailable
        </span>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="text-[11px] underline text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === "loading" || !source) {
    return (
      <div
        className={`${className} bg-muted animate-pulse`}
        aria-label="Loading protected attachment"
        data-attachment-state="loading"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen?.({ ...attachment, objectUrl: source })}
      className="relative group rounded-lg overflow-hidden border border-border/40 focus:outline-none cursor-pointer block"
      title="Click to enlarge"
      data-attachment-state="ready"
    >
      <img
        src={source}
        alt={attachment.name || "Attachment"}
        className={className}
        onLoad={onLoad}
      />
      <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center text-white">
        <Eye size={18} />
      </span>
    </button>
  );
}

export default function AdminChatMessageFeed({
  selectedConversation = null,
  messages = [],
  messagesLoading = false,
  user = null,
  tenantTyping = null,
  onPreviewImage,
  onDownloadAttachment,
  feedContainerRef,
  messageEndRef,
  scrollToBottom,
}) {
  const sortedMessages = useMemo(() => {
    return [...new Map([...messages, ...(selectedConversation?.lifecycleEvents || [])].map((item) => [item.id, item])).values()].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }, [messages, selectedConversation?.lifecycleEvents]);

  return (
    <div
      ref={feedContainerRef}
      className="flex-1 p-4 overflow-y-auto space-y-2 bg-muted/15"
    >
      {/* Thread Initialization Banner */}
      {selectedConversation && (
        <div className="mx-auto my-3 max-w-sm rounded-xl border border-border bg-card p-3.5 text-center shadow-2xs space-y-1">
          <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground mx-auto mb-0.5">
            <MessageSquare size={16} />
          </div>
          <div className="text-xs font-bold text-foreground">
            Support Thread with {selectedConversation.tenantName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {getBranchLabel(selectedConversation.branch)} · {getRoomLabel(selectedConversation)}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            <span>{getCategoryLabel(selectedConversation.category)}</span>
            <span>•</span>
            <span>{fmtDateTime(selectedConversation.createdAt)}</span>
          </div>
        </div>
      )}

      {messagesLoading ? (
        <ChatMessageFeedSkeleton count={5} />
      ) : sortedMessages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8 space-y-2">
          <MessageSquare size={32} className="text-muted-foreground/50" />
          <div className="font-semibold text-foreground">No messages yet</div>
          <div className="text-xs">
            Conversation opened. Awaiting messages or replies.
          </div>
        </div>
      ) : (
        sortedMessages.map((msg, i) => {
          const isSystem = msg.senderRole === "system";
          const isTenant = msg.senderRole === "tenant";
          const senderAvatarSrc = isTenant
            ? msg.senderProfileImage || selectedConversation?.tenantProfileImage
            : msg.senderProfileImage ||
              (user?._id === msg.senderId ? user?.profileImage : "");

          const prevMsg = i > 0 ? sortedMessages[i - 1] : null;
          const nextMsg =
            i < sortedMessages.length - 1 ? sortedMessages[i + 1] : null;

          const showDateDivider =
            !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt);

          if (isSystem) {
            return (
              <div key={msg.id} className="space-y-1">
                {showDateDivider && (
                  <div className="flex items-center justify-center my-3">
                    <span className="rounded-full bg-card border border-border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-2xs">
                      {fmtDateDivider(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-center my-2">
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground text-center max-w-md shadow-2xs">
                    <Clock size={13} className="shrink-0 text-amber-500" />
                    <span>{msg.message}</span>
                  </div>
                </div>
              </div>
            );
          }

          const isSameSenderAsPrev =
            prevMsg &&
            prevMsg.senderRole === msg.senderRole &&
            (msg.senderRole !== "tenant" || prevMsg.senderId === msg.senderId) &&
            isSameDay(msg.createdAt, prevMsg.createdAt) &&
            new Date(msg.createdAt) - new Date(prevMsg.createdAt) < 5 * 60 * 1000;

          const isSameSenderAsNext =
            nextMsg &&
            nextMsg.senderRole === msg.senderRole &&
            (msg.senderRole !== "tenant" || nextMsg.senderId === msg.senderId) &&
            isSameDay(msg.createdAt, nextMsg.createdAt) &&
            new Date(nextMsg.createdAt) - new Date(msg.createdAt) < 5 * 60 * 1000;

          const isFirstInGroup = !isSameSenderAsPrev;
          const isLastInGroup = !isSameSenderAsNext;

          return (
            <div key={msg.id} className="space-y-1">
              {showDateDivider && (
                <div className="flex items-center justify-center my-3">
                  <span className="rounded-full bg-card border border-border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-2xs">
                    {fmtDateDivider(msg.createdAt)}
                  </span>
                </div>
              )}

              <div
                className={`flex items-end gap-2 ${
                  isTenant ? "justify-start" : "justify-end"
                } ${isFirstInGroup ? "mt-2.5" : "mt-0.5"}`}
              >
                {/* Tenant Avatar on Left: Visible on last message of group */}
                {isTenant && (
                  <div className="w-7 shrink-0 flex justify-center">
                    {isLastInGroup ? (
                      <ProfileAvatar
                        src={senderAvatarSrc}
                        user={{
                          name: msg.senderName,
                          profileImage: senderAvatarSrc,
                        }}
                        initials={getInitials(msg.senderName)}
                        size={28}
                        alt={msg.senderName}
                        className="mb-0.5 ring-1 ring-border/40"
                      />
                    ) : (
                      <div className="w-7 h-7" />
                    )}
                  </div>
                )}

                {/* Message Content & Metadata */}
                <div
                  className={`max-w-[75%] space-y-0.5 ${
                    isTenant ? "text-left" : "text-right"
                  }`}
                >
                  {/* Sender Header on First Message in Group */}
                  {isFirstInGroup && (
                    <div
                      className={`text-[10px] font-bold text-muted-foreground px-1 pb-0.5 ${
                        isTenant ? "text-left" : "text-right"
                      }`}
                    >
                      {msg.senderName} ({msg.senderRole || (isTenant ? "tenant" : "admin")})
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`inline-block text-left p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-2xs space-y-2 ${
                      isTenant
                        ? `bg-card border border-border text-foreground ${
                            isLastInGroup ? "rounded-bl-xs" : ""
                          }`
                        : `bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 ${
                            isLastInGroup ? "rounded-br-xs" : ""
                          }`
                    }`}
                  >
                    {/* Photo Attachments */}
                    {Array.isArray(msg.attachments) &&
                      msg.attachments.filter((a) =>
                        String(a.type || a.mimeType || "").startsWith("image"),
                      ).length > 0 && (
                        <div
                          className={`gap-1.5 ${
                            msg.attachments.filter((a) =>
                              String(a.type || a.mimeType || "").startsWith("image"),
                            ).length === 1
                              ? "block max-w-[260px]"
                              : "grid grid-cols-2 max-w-[320px]"
                          }`}
                        >
                          {msg.attachments
                            .filter((a) =>
                              String(a.type || a.mimeType || "").startsWith("image"),
                            )
                            .map((img, imgIdx) => (
                              <ProtectedChatImage
                                key={imgIdx}
                                attachment={img}
                                className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                                onOpen={onPreviewImage}
                                onLoad={() => scrollToBottom?.("auto")}
                              />
                            ))}
                        </div>
                      )}

                    {/* Document / PDF Attachments */}
                    {Array.isArray(msg.attachments) &&
                      msg.attachments.filter(
                        (a) =>
                          !String(a.type || a.mimeType || "").startsWith("image"),
                      ).length > 0 && (
                        <div className="space-y-1.5 max-w-[280px]">
                          {msg.attachments
                            .filter(
                              (a) =>
                                !String(a.type || a.mimeType || "").startsWith("image"),
                            )
                            .map((doc, docIdx) => (
                              <button
                                type="button"
                                key={docIdx}
                                onClick={() => onDownloadAttachment?.(doc)}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                                  isTenant
                                    ? "bg-muted/40 hover:bg-muted border-border text-foreground"
                                    : "bg-white/10 hover:bg-white/20 border-white/20 text-white dark:bg-black/10 dark:hover:bg-black/20 dark:border-black/20 dark:text-slate-900"
                                }`}
                              >
                                <FileText size={16} className="shrink-0 opacity-80" />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate font-medium text-[11px]">
                                    {doc.name || "Attached File"}
                                  </p>
                                  {doc.size > 0 && (
                                    <p className="text-[10px] opacity-70">
                                      {fmtFileSize(doc.size)}
                                    </p>
                                  )}
                                </div>
                                <Download size={13} className="shrink-0 opacity-70" />
                              </button>
                            ))}
                        </div>
                      )}

                    {/* Text message (if present) */}
                    {msg.message ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                        {msg.message}
                      </p>
                    ) : null}
                  </div>

                  {/* Timestamp & Seen Indicator on Last Message in Group */}
                  {isLastInGroup && (
                    <div
                      className={`flex items-center gap-1.5 text-[10px] text-muted-foreground px-1 pt-0.5 ${
                        isTenant ? "justify-start" : "justify-end"
                      }`}
                    >
                      <time>{fmtShortTime(msg.createdAt)}</time>
                      {!isTenant && (
                        <>
                          <span>•</span>
                          {msg.readAt ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold"
                              title={`Seen at ${fmtDateTime(msg.readAt)}`}
                            >
                              <CheckCheck size={11} />
                              <span>Seen</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                              <Check size={11} />
                              <span>Sent</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Staff/Owner Avatar on Right: Visible on last message of group */}
                {!isTenant && (
                  <div className="w-7 shrink-0 flex justify-center">
                    {isLastInGroup ? (
                      <ProfileAvatar
                        src={senderAvatarSrc}
                        user={{
                          name: msg.senderName,
                          profileImage: senderAvatarSrc,
                        }}
                        initials={getInitials(msg.senderName)}
                        size={28}
                        alt={msg.senderName}
                        className="mb-0.5 ring-1 ring-border/40"
                      />
                    ) : (
                      <div className="w-7 h-7" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {tenantTyping?.conversationId === selectedConversation?.id && (
        <div className="flex items-center gap-2 text-xs italic text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
          </span>
          <span>{tenantTyping.name} is typing...</span>
        </div>
      )}

      <div ref={messageEndRef} />
    </div>
  );
}
