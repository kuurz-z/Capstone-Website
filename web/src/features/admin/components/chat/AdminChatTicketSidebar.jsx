import AdminSupportRequestDetails from './AdminSupportRequestDetails.jsx';
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  FileDown,
  FileText,
  LoaderCircle,
  Lock,
  UserCheck,
} from "lucide-react";
import ProfileAvatar from "../../../../shared/components/ProfileAvatar";
import AdminIssueClusterBanner from "../assistant/AdminIssueClusterBanner";
import {
  getBranchLabel,
  getRoomLabel,
  getCategoryLabel,
  getStatusLabel,
  getPriorityLabel,
  getInitials,
} from "./chatConstants";

export default function AdminChatTicketSidebar({
  selectedConversation = null,
  accessInfo = null,
  assigning = false,
  downloading = false,
  onOpenStatusModal,
  onOpenPriorityModal,
  onOpenCloseModal,
  onAssignToMe,
  onDownloadTranscript,
  onReviewRoomHistory,
  dismissedClusters = {},
  setDismissedClusters,
}) {
  const navigate = useNavigate();
  if (!selectedConversation) return null;

  const assignedToAnother =
    selectedConversation?.assignedAdminId &&
    accessInfo?.adminId &&
    selectedConversation.assignedAdminId !== accessInfo.adminId;

  return (
    <>
      {/* Thread Header */}
      <header className="p-3.5 border-b border-border bg-card/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ProfileAvatar
            src={selectedConversation.tenantProfileImage}
            user={{
              name: selectedConversation.tenantName,
              profileImage: selectedConversation.tenantProfileImage,
            }}
            initials={getInitials(selectedConversation.tenantName)}
            size={40}
            alt={selectedConversation.tenantName}
            className="shrink-0 ring-1 ring-border/40"
          />
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-foreground truncate">
                {selectedConversation.tenantName}
              </h2>
              <span className="text-xs font-medium text-muted-foreground">
                {getBranchLabel(selectedConversation.branch)} · {getRoomLabel(selectedConversation)}
              </span>
              {selectedConversation.ticketId && (
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  {selectedConversation.ticketId}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>{getCategoryLabel(selectedConversation.category)}</span>
              </span>

              {/* Contract context */}
              {selectedConversation.context?.entityType === "contract" && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/admin/contracts/${selectedConversation.context.entityId}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400 hover:bg-muted/40 transition-colors cursor-pointer"
                  title="Open the related Contract"
                >
                  <FileText size={12} />
                  <span>View Contract</span>
                </button>
              )}

              {/* Interactive Status Badge Button */}
              <button
                type="button"
                onClick={onOpenStatusModal}
                disabled={selectedConversation.lifecycleLocked}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold border transition-colors bg-transparent ${
                  selectedConversation.status === "closed"
                    ? "border-border text-slate-600 dark:text-slate-400 cursor-default"
                    : selectedConversation.status === "resolved"
                    ? "border-border text-emerald-700 dark:text-emerald-400 hover:bg-muted/40 cursor-pointer"
                    : selectedConversation.status === "waiting_tenant"
                    ? "border-border text-amber-700 dark:text-amber-400 hover:bg-muted/40 cursor-pointer"
                    : selectedConversation.status === "in_review"
                    ? "border-border text-sky-700 dark:text-sky-400 hover:bg-muted/40 cursor-pointer"
                    : "border-border text-blue-700 dark:text-blue-400 hover:bg-muted/40 cursor-pointer"
                }`}
                title="Click to update status with confirmation"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    selectedConversation.status === "resolved"
                      ? "bg-emerald-500"
                      : selectedConversation.status === "waiting_tenant"
                      ? "bg-amber-500"
                      : selectedConversation.status === "in_review"
                      ? "bg-sky-500"
                      : selectedConversation.status === "open"
                      ? "bg-blue-500"
                      : "bg-slate-400"
                  }`}
                />
                <span>{getStatusLabel(selectedConversation.status)}</span>
                {selectedConversation.status !== "closed" && (
                  <ChevronDown size={12} className="opacity-70" />
                )}
              </button>

              {/* Interactive Priority Badge Button */}
              <button
                type="button"
                onClick={onOpenPriorityModal}
                disabled={selectedConversation.lifecycleLocked}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold border transition-colors bg-transparent ${
                  selectedConversation.status === "closed"
                    ? "border-border text-slate-600 dark:text-slate-400 cursor-default"
                    : selectedConversation.priority === "urgent"
                    ? "border-border text-rose-700 dark:text-rose-400 hover:bg-muted/40 cursor-pointer"
                    : selectedConversation.priority === "high"
                    ? "border-border text-amber-700 dark:text-amber-400 hover:bg-muted/40 cursor-pointer"
                    : "border-border text-slate-700 dark:text-slate-300 hover:bg-muted/40 cursor-pointer"
                }`}
                title="Click to update priority"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    selectedConversation.priority === "urgent"
                      ? "bg-rose-500"
                      : selectedConversation.priority === "high"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                  }`}
                />
                <span>Priority: {getPriorityLabel(selectedConversation.priority)}</span>
                {selectedConversation.status !== "closed" && (
                  <ChevronDown size={12} className="opacity-70" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Assigned Admin Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-xs">
            <span className="text-muted-foreground">Assigned:</span>
            <span className="font-semibold text-foreground">
              {selectedConversation.assignedAdminName || "Unassigned"}
            </span>
            {!selectedConversation.assignedAdminName && !selectedConversation.lifecycleLocked && (
              <button
                type="button"
                onClick={onAssignToMe}
                disabled={assigning}
                className="ml-1 inline-flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {assigning ? (
                  <LoaderCircle size={11} className="animate-spin" />
                ) : (
                  <UserCheck size={11} />
                )}
                <span>Assign to me</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onDownloadTranscript}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {downloading ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            <span>Transcript</span>
          </button>

          {selectedConversation.legacy && !selectedConversation.lifecycleLocked && (
            <button
              type="button"
              onClick={onOpenCloseModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-700 dark:hover:text-white px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              title="Close this thread with an audit note"
            >
              <Lock size={13} />
              <span>Close thread</span>
            </button>
          )}
        </div>
      </header>

      <AdminSupportRequestDetails concern={selectedConversation} />

      {/* Issue Cluster Banner */}
      {selectedConversation?.priority === "urgent" &&
        selectedConversation?.status !== "closed" &&
        !dismissedClusters[selectedConversation?.id] && (
          <div className="px-4 pt-3 pb-1 border-b border-border">
            <AdminIssueClusterBanner
              clusters={[
                {
                  type: "Maintenance Cluster",
                  description: "Multiple open tickets detected for the same unit.",
                  count: 3,
                  location: selectedConversation?.roomNumber
                    ? `Room ${selectedConversation.roomNumber}`
                    : `${getBranchLabel(selectedConversation?.branch)} Branch`,
                  action: "Review Room History",
                  onAction: onReviewRoomHistory,
                },
              ]}
              onDismiss={() => {
                if (selectedConversation?.id && setDismissedClusters) {
                  setDismissedClusters((prev) => ({
                    ...prev,
                    [selectedConversation.id]: true,
                  }));
                }
              }}
            />
          </div>
        )}

      {/* Assigned to Another Warning */}
      {assignedToAnother && (
        <div className="px-4 py-2 bg-card border-b border-border text-xs text-foreground flex items-center gap-2 shadow-2xs">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            Currently assigned to <strong className="font-semibold text-foreground">{selectedConversation.assignedAdminName}</strong>. Please coordinate before replying.
          </span>
        </div>
      )}
    </>
  );
}
