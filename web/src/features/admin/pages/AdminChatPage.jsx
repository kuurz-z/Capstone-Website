import { useState } from "react";
import { MessageSquareText, RefreshCw } from "lucide-react";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import { AdminChatSkeleton } from "../components/AdminContentSkeletons";
import {
  AdminChatConversationList,
  AdminChatMessageFeed,
  AdminChatComposer,
  AdminChatTicketSidebar,
  AdminChatMetricsOverview,
  AdminChatClosedBanner,
  AdminChatCloseModal,
  AdminChatStatusModal,
  AdminChatPriorityModal,
  AdminChatLightboxModal,
  useAdminChat,
} from "../components/chat";
import "../styles/design-tokens.css";
import "../styles/admin-common.css";
import "../styles/admin-chat.css";

export default function AdminChatPage() {
  const [conversationListOpen, setConversationListOpen] = useState(false);
  const {
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
  } = useAdminChat();

  if (initialLoading && !conversations.length) {
    return <AdminChatSkeleton />;
  }

  return (
    <section className="admin-chat-page">
      {/* ── Pattern 1 Sticky Sub-Header ── */}
      <AdminPageHeader
        title="Support Chat"
        subtitle="View tenant conversations, respond in real-time, and manage branch messaging."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
              onClick={handleRefresh}
              disabled={isRefreshing || messagesLoading}
              title="Refresh conversations"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider border ${
                socketConnected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
              }`}
              title={socketConnected ? "Real-time socket active" : "Polling fallback active"}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  socketConnected ? "bg-emerald-600 animate-pulse" : "bg-amber-600"
                }`}
              />
              {socketConnected ? "Live" : "Polling"}
            </span>
          </div>
        }
      />

      {/* ── Full-Width 4-Metric Summary Grid ── */}
      <AdminChatMetricsOverview
        totalThreads={conversations.length}
        unreadTotal={unreadTotal}
        urgentTotal={urgentTotal}
        assignedToMeTotal={assignedToMeTotal}
      />

      {/* ── Main Chat Workspace ── */}
      <button type="button" className="admin-chat-list-toggle rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
        aria-expanded={conversationListOpen || !selectedConversation} aria-controls="admin-chat-conversations"
        onClick={() => setConversationListOpen((open) => !open)} disabled={!selectedConversation}>
        {conversationListOpen || !selectedConversation ? 'Conversations' : 'Change conversation'}
        {conversationListOpen && selectedConversation ? ' · Back to chat' : ''}
      </button>
      <div className="admin-chat-workspace" data-show-list={conversationListOpen || !selectedConversation}>
        {/* Left Sidebar: Conversations & Filters */}
        <div id="admin-chat-conversations" className="admin-chat-conversations">
        <AdminChatConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={(conversation) => {
            setConversationListOpen(false);
            handleSelectConversation(conversation);
          }}
          initialLoading={initialLoading}
          listError={listError}
          isOwner={isOwner}
          accessInfo={accessInfo}
          user={user}
          branchFilter={branchFilter}
          onBranchFilterChange={setBranchFilter}
        />
        </div>

        {/* Right Pane: Conversation Details & Message Feed */}
        <section className="admin-chat-thread rounded-xl border border-border bg-card shadow-xs flex flex-col h-full overflow-hidden">
          {selectedConversation ? (
            <>
              <div className="admin-chat-context" tabIndex={0} role="region" aria-label="Conversation details and controls">
              <AdminChatTicketSidebar
                selectedConversation={selectedConversation}
                accessInfo={accessInfo}
                assigning={assigning}
                downloading={downloading}
                onOpenStatusModal={() => setStatusModalOpen(true)}
                onOpenPriorityModal={() => setPriorityModalOpen(true)}
                onOpenCloseModal={() => setCloseModalOpen(true)}
                onAssignToMe={handleAssignToMe}
                onDownloadTranscript={handleDownloadTranscript}
                onReviewRoomHistory={handleReviewRoomHistory}
                dismissedClusters={dismissedClusters}
                setDismissedClusters={setDismissedClusters}
              />
              </div>

              <AdminChatMessageFeed
                selectedConversation={selectedConversation}
                messages={messages}
                messagesLoading={messagesLoading}
                user={user}
                tenantTyping={tenantTyping}
                onPreviewImage={setPreviewImageModal}
                onDownloadAttachment={handleDownloadAttachment}
                feedContainerRef={feedContainerRef}
                messageEndRef={messageEndRef}
                scrollToBottom={scrollToBottom}
              />

              {selectedConversation.lifecycleLocked || (!selectedConversation.legacy && selectedConversation.status === "resolved") ? (
                <AdminChatClosedBanner status={selectedConversation.status} ratingState={selectedConversation.ratingState} closingNote={selectedConversation.closingNote} />
              ) : (
                <AdminChatComposer
                  selectedConversation={selectedConversation}
                  messages={messages}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  stagedAttachments={stagedAttachments}
                  setStagedAttachments={setStagedAttachments}
                  sending={sending}
                  uploadingAttachments={uploadingAttachments}
                  replyError={replyError}
                  setReplyError={setReplyError}
                  onSendReply={handleSendReply}
                />
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <MessageSquareText size={28} />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Select a conversation to view messages
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Choose a tenant thread from the list on the left to read messages, send replies, or adjust ticket statuses.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Modals ── */}
      <AdminChatCloseModal
        isOpen={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onConfirm={handleConfirmClose}
        tenantName={selectedConversation?.tenantName}
        closing={closing}
      />

      <AdminChatStatusModal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        onConfirm={handleConfirmStatusChange}
        concern={selectedConversation}
        currentStatus={selectedConversation?.status}
        tenantName={selectedConversation?.tenantName}
        updating={updatingStatus}
      />

      <AdminChatPriorityModal
        isOpen={priorityModalOpen}
        onClose={() => setPriorityModalOpen(false)}
        onConfirm={handleConfirmPriorityChange}
        currentPriority={selectedConversation?.priority}
        tenantName={selectedConversation?.tenantName}
        updating={updatingPriority}
      />

      <AdminChatLightboxModal
        imageModal={previewImageModal}
        onClose={() => setPreviewImageModal(null)}
      />
    </section>
  );
}
