import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ClipboardList,
  MessageSquare,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import {
  useAdminMaintenanceRequests,
  useArchiveMaintenanceRequest,
  useAssignMaintenanceBranch,
  useAssignMaintenanceProvider,
  useGenerateMaintenanceReport,
  useGenerateMaintenanceUpdate,
  useMaintenanceDuplicates,
  useMaintenanceRequest,
  useRemoveMaintenanceAttachment,
  useRespondToMaintenanceReschedule,
  useRestoreMaintenanceRequest,
  useSaveMaintenanceProof,
  useScheduleAdminMaintenance,
  useSendMaintenanceReply,
  useSendMaintenanceTenantSummary,
  useServiceProviders,
  useSuggestMaintenanceProvider,
  useUpdateMaintenanceCost,
  useUpdateMaintenanceRequest,
} from "../../../shared/hooks/queries/useMaintenance";
import { maintenanceApi } from "../../../shared/api/maintenanceApi";
import {
  getAllowedAdminMaintenanceStatuses,
  LOCKED_ADMIN_MAINTENANCE_STATUSES,
  getMaintenanceTypeMeta,
  getMaintenanceUrgencyMeta,
  formatMaintenanceStatus,
} from "../../../shared/utils/maintenanceConfig";
import { BRANCH_OPTIONS } from "../../../shared/utils/constants";
import { DataTable, DetailDrawer, PageShell } from "../components/shared";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import { DrawerSkeleton } from "../../../shared/components/LoadingSkeletons";
import { AdminMaintenanceSkeleton } from "../components/AdminContentSkeletons";

import {
  ARCHIVE_FILTER_OPTIONS,
  buildMaintenanceTimeline,
  buildUploadedAdminAttachment,
  createAttachmentClientId,
  createFilterPayload,
  createReportFilterPayload,
  exportCsvFile,
  exportMaintenanceRequestsPdf,
  handleExportMaintenanceCSV,
  handleExportMaintenancePDF,
  fmtDate,
  fmtDateTime,
  formatBranchLabel,
  formatMaintenanceCsvRows,
  formatMaintenanceReportAsText,
  getDefaultMaintenanceReportRange,
  getFormSummaryMessage,
  getMaintenanceApiErrorMessage,
  getMaintenanceAttachmentLabel,
  getMaintenanceAttachmentName,
  getMaintenanceAttachmentUri,
  getMaintenanceRequestUploadId,
  getReportFilenameBase,
  getRequestBranch,
  getSlaTone,
  getStatusDotClass,
  getStatusTextClass,
  getWorkLogAttachmentKey,
  hasValidRequestBranch,
  isBlockingWorkLogAttachment,
  isRemoteUri,
  isUploadedWorkLogAttachment,
  ITEMS_PER_PAGE,
  MANAGEMENT_SUMMARY_CARDS,
  mapMaintenanceApiErrors,
  matchesSlaFilter,
  matchesSummaryCard,
  normalizeApiValidationDetail,
  normalizeMaintenanceAttachments,
  normalizeMaintenanceBranch,
  PROVIDER_MANUAL_CHOICE,
  PROVIDER_NONE_CHOICE,
  SLA_FILTER_OPTIONS,
  TEXT_MIN_LENGTHS,
  urgencyRank,
  validateAmount,
  validateMinimumText,
  validatePhilippineMobile,
  validateProgressAttachmentFile,
  formatSlaState,
  getDateFieldLabel,
  getStageLabel,
  getStatusLabel,
  getStageStatusLabel,
} from "./maintenance/maintenanceUtils";
import { handleExportSingleMaintenanceVoucherPDF } from "../utils/maintenanceVoucherPdf";

import { BranchBadge } from "./maintenance/components/BranchBadge";
import { SectionBadge } from "./maintenance/components/SectionBadge";
import { MaintenanceTimeline } from "./maintenance/components/MaintenanceTimeline";
import { ConfirmationModal } from "./maintenance/components/ConfirmationModal";
import { AssignBranchModal } from "./maintenance/components/AssignBranchModal";
import { AttachmentRemovalModal } from "./maintenance/components/AttachmentRemovalModal";
import { ServiceProviderAssignmentPanel } from "./maintenance/components/ServiceProviderAssignmentPanel";
import { CostAttributionCard } from "./maintenance/components/CostAttributionCard";
import { MaintenanceProofInspector } from "./maintenance/components/MaintenanceProofInspector";
import { MaintenanceSummaryCards } from "./maintenance/components/MaintenanceSummaryCards";
import { MaintenanceDetailModal } from "./maintenance/components/MaintenanceDetailModal";
import { MaintenanceFilters } from "./maintenance/components/MaintenanceFilters";
import { MaintenanceTable } from "./maintenance/components/MaintenanceTable";
import {
  MaintenanceExportDropdown,
  ReportPreviewModal,
} from "./maintenance/components/MaintenanceReportModal";
import { useMaintenanceData } from "./maintenance/hooks/useMaintenanceData";

export default function AdminMaintenancePage() {
  const data = useMaintenanceData();
  const {
    isOwner,
    userBranch,
    stageFilter,
    setStageFilter,
    stageCounts,
    statusFilter,
    setStatusFilter,
    statusCounts,
    stageStatusFilter,
    setStageStatusFilter,
    stageStatusCounts,
    urgencyCounts,
    branchCounts,
    archiveView,
    setArchiveView,
    requestTypeFilter,
    setRequestTypeFilter,
    urgencyFilter,
    setUrgencyFilter,
    slaFilter,
    setSlaFilter,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    branchFilter,
    setBranchFilter,
    sortMode,
    setSortMode,
    searchQuery,
    setSearchQuery,
    summaryCardKey,
    setSummaryCardKey,
    showAdvancedFilters,
    setShowAdvancedFilters,
    handleResetFilters,
    requests,
    summaryRequests,
    filteredRequests,
    isLoading,
    isError,
    error,
    currentPage,
    setCurrentPage,
    selectedRequestId,
    setSelectedRequestId,
    handleCloseDetail,
    selectedRequest,
    isDetailLoading,
    serviceProviders,
    isLoadingProviders,
    summaryItems,
    activeSummaryIndex,
    reportPreview,
    setReportPreview,
    archiveDialogMode,
    setArchiveDialogMode,
    branchAssignmentDialog,
    setBranchAssignmentDialog,
    attachmentRemovalDialog,
    setAttachmentRemovalDialog,
    sendTenantSummaryDialogOpen,
    setSendTenantSummaryDialogOpen,
    updateRequestMutation,
    sendReplyMutation,
    saveProofMutation,
    removeAttachmentMutation,
    archiveRequestMutation,
    restoreRequestMutation,
    assignBranchMutation,
    assignProviderMutation,
    generateUpdateMutation,
    generateReportMutation,
    sendTenantSummaryMutation,
    suggestProviderMutation,
    rateProviderMutation,
  } = data;

  const [draftStatus, setDraftStatus] = useState("viewed");
  const [draftNotes, setDraftNotes] = useState("");
  const [providerChoice, setProviderChoice] = useState(PROVIDER_NONE_CHOICE);
  const [manualProvider, setManualProvider] = useState({
    providerName: "",
    contactNumber: "",
    serviceType: "",
    notes: "",
  });
  const [saveManualProviderForFuture, setSaveManualProviderForFuture] = useState(false);
  const [providerFieldErrors, setProviderFieldErrors] = useState({});
  const [providerFormMessage, setProviderFormMessage] = useState("");
  const [providerSuggestion, setProviderSuggestion] = useState(null);
  const [draftWorkLogNote, setDraftWorkLogNote] = useState("");
  const [draftWorkLogAttachments, setDraftWorkLogAttachments] = useState([]);
  const [uploadingUpdateAttachment, setUploadingUpdateAttachment] = useState(false);
  const [updateFieldErrors, setUpdateFieldErrors] = useState({});
  const [updateFormMessage, setUpdateFormMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [uploadingReplyAttachment, setUploadingReplyAttachment] = useState(false);
  const [replyFieldErrors, setReplyFieldErrors] = useState({});
  const [replyFormMessage, setReplyFormMessage] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofAttachments, setProofAttachments] = useState([]);
  const [uploadingProofAttachment, setUploadingProofAttachment] = useState(false);
  const [proofFieldErrors, setProofFieldErrors] = useState({});
  const [proofFormMessage, setProofFormMessage] = useState("");
  const [updateType, setUpdateType] = useState("status_update");
  const [isExporting, setIsExporting] = useState(false);

  const selectedRequestStatusOptions = useMemo(
    () => getAllowedAdminMaintenanceStatuses(selectedRequest?.status),
    [selectedRequest?.status],
  );
  const isSelectedRequestLocked = LOCKED_ADMIN_MAINTENANCE_STATUSES.includes(
    selectedRequest?.status || "",
  );
  const hasDraftChanges = Boolean(selectedRequest) && (
    draftStatus !== (selectedRequest.status || "") ||
    draftNotes.trim() !== String(selectedRequest.notes || "").trim() ||
    Boolean(draftWorkLogNote.trim()) ||
    draftWorkLogAttachments.length > 0
  );
  const timelineItems = useMemo(
    () => buildMaintenanceTimeline(selectedRequest),
    [selectedRequest],
  );

  useEffect(() => {
    if (!selectedRequest) return;
    const assignedId =
      selectedRequest.assignedProviderId ||
      selectedRequest.assignedProvider?.id ||
      selectedRequest.assignedProvider?._id ||
      selectedRequest.providerDetails?.internalProviderId ||
      "";
    const assignedName =
      selectedRequest.assignedProviderName ||
      selectedRequest.assigned_to ||
      selectedRequest.assignedProvider?.providerName ||
      "";

    if (assignedId) {
      setProviderChoice(String(assignedId));
    } else if (assignedName) {
      setProviderChoice(PROVIDER_MANUAL_CHOICE);
      setManualProvider({
        providerName: assignedName,
        contactNumber:
          selectedRequest.assignedProviderContact ||
          selectedRequest.assignedProvider?.contactNumber ||
          "",
        serviceType:
          selectedRequest.assignedProviderCategory ||
          selectedRequest.assignedProvider?.serviceType ||
          "",
        notes:
          selectedRequest.assignedProviderNotes ||
          selectedRequest.notes ||
          "",
      });
    } else {
      setProviderChoice(PROVIDER_MANUAL_CHOICE);
      setManualProvider({
        providerName: "Lilycrest Facilities Team",
        contactNumber: "09171234567",
        serviceType: selectedRequest?.request_type ? getMaintenanceTypeMeta(selectedRequest.request_type).label : "Maintenance",
        notes: `In-house facilities team for ${formatBranchLabel(getRequestBranch(selectedRequest))}.`,
      });
    }
    setProviderSuggestion(null);
    setProviderFieldErrors({});
    setProviderFormMessage("");
  }, [
    selectedRequest?.request_id,
    selectedRequest?.assignedProviderId,
    selectedRequest?.assignedProviderName,
    selectedRequest?.assigned_to,
  ]);

  const { data: duplicateData } = useMaintenanceDuplicates(selectedRequest?.request_id);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (stageFilter && stageFilter !== "all") {
      chips.push({
        key: `stage-${stageFilter}`,
        label: `Stage: ${getStageLabel(stageFilter)}`,
        onRemove: () => setStageFilter("all"),
      });
    }
    if (statusFilter && statusFilter !== "all") {
      chips.push({
        key: `status-${statusFilter}`,
        label: `Status: ${getStatusLabel(statusFilter)}`,
        onRemove: () => setStatusFilter("all"),
      });
    }
    if (isOwner && branchFilter !== "all") {
      const branchOpt = BRANCH_OPTIONS.find((b) => b.value === branchFilter);
      chips.push({
        key: `branch-${branchFilter}`,
        label: `Branch: ${branchOpt?.label || branchFilter}`,
        onRemove: () => setBranchFilter("all"),
      });
    }
    if (archiveView !== "active") {
      const archiveLabel = ARCHIVE_FILTER_OPTIONS.find((item) => item.key === archiveView)?.label || archiveView;
      chips.push({
        key: `archive-${archiveView}`,
        label: `View: ${archiveLabel}`,
        onRemove: () => setArchiveView("active"),
      });
    }
    if (requestTypeFilter !== "all") {
      chips.push({
        key: `type-${requestTypeFilter}`,
        label: `Type: ${getMaintenanceTypeMeta(requestTypeFilter).label}`,
        onRemove: () => setRequestTypeFilter("all"),
      });
    }
    if (urgencyFilter !== "all") {
      chips.push({
        key: `urgency-${urgencyFilter}`,
        label: `Urgency: ${getMaintenanceUrgencyMeta(urgencyFilter).label}`,
        onRemove: () => setUrgencyFilter("all"),
      });
    }
    if (slaFilter !== "all") {
      const slaLabel = SLA_FILTER_OPTIONS.find((item) => item.key === slaFilter)?.label || slaFilter;
      chips.push({
        key: `sla-${slaFilter}`,
        label: `Timeline: ${slaLabel}`,
        onRemove: () => setSlaFilter("all"),
      });
    }
    if (dateFrom && dateTo) {
      const fieldLabel = getDateFieldLabel(dateType);
      chips.push({
        key: `date-range-${dateType}-${dateFrom}-${dateTo}`,
        label: `${fieldLabel}: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`,
        onRemove: () => {
          setDateFrom("");
          setDateTo("");
        },
      });
    } else if (dateFrom) {
      const fieldLabel = getDateFieldLabel(dateType);
      chips.push({
        key: `from-${dateType}-${dateFrom}`,
        label: `${fieldLabel} From: ${fmtDate(dateFrom)}`,
        onRemove: () => setDateFrom(""),
      });
    } else if (dateTo) {
      const fieldLabel = getDateFieldLabel(dateType);
      chips.push({
        key: `to-${dateType}-${dateTo}`,
        label: `${fieldLabel} To: ${fmtDate(dateTo)}`,
        onRemove: () => setDateTo(""),
      });
    } else if (dateType !== "created_at") {
      const fieldLabel = getDateFieldLabel(dateType);
      chips.push({
        key: `datetype-${dateType}`,
        label: `Date Target: ${fieldLabel}`,
        onRemove: () => setDateType("created_at"),
      });
    }
    return chips;
  }, [
    archiveView,
    branchFilter,
    dateType,
    dateFrom,
    dateTo,
    isOwner,
    requestTypeFilter,
    slaFilter,
    stageFilter,
    statusFilter,
    urgencyFilter,
  ]);

  const handleExportCsv = () => {
    handleExportMaintenanceCSV({
      requests: filteredRequests,
      branchFilter,
    });
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      await handleExportMaintenancePDF({
        requests: filteredRequests,
        summaryItems,
        branchFilter,
        stageFilter,
        statusFilter,
        urgencyFilter,
        slaFilter,
        searchQuery,
        dateFrom,
        dateTo,
      });
    } catch (err) {
      showNotification({
        title: "Export Failed",
        message: "Failed to generate maintenance PDF report.",
        type: "error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSummaryFilter = (index) => {
    const cardKey = MANAGEMENT_SUMMARY_CARDS[index]?.key;
    if (!cardKey) return;
    setSummaryCardKey((current) => (current === cardKey ? null : cardKey));
  };

  const handleQuickStatusChange = async (requestId, nextStatus, options = {}) => {
    try {
      const res = await updateRequestMutation.mutateAsync({
        requestId,
        payload: { status: nextStatus },
      });
      if (!options?.silent && nextStatus !== "viewed") {
        showNotification({
          title: "Request Updated",
          message: `Request #${requestId} is now ${formatMaintenanceStatus(nextStatus)}.`,
          type: "success",
        });
      }
      return res;
    } catch (err) {
      if (!options?.silent) {
        showNotification({
          title: "Update Failed",
          message: getMaintenanceApiErrorMessage(err, "Failed to update request status"),
          type: "error",
        });
      }
      throw err;
    }
  };

  const handleAssignProvider = async (extraPayload = {}) => {
    if (!selectedRequest) return;
    try {
      let payload;
      if (providerChoice === PROVIDER_NONE_CHOICE || !providerChoice) {
        payload = {
          providerSource: "none",
          providerId: null,
          notes: manualProvider.notes?.trim() || "",
          ...extraPayload,
        };
      } else if (providerChoice === PROVIDER_MANUAL_CHOICE) {
        const trimmedName = manualProvider.providerName?.trim() || "";
        const cleanContact = (manualProvider.contactNumber || "").replace(/\D/g, "");
        const errors = {};

        if (!trimmedName || trimmedName.length < 3) {
          errors.providerName = "Provider name must be at least 3 characters.";
        }
        if (!cleanContact || !/^09\d{9}$/.test(cleanContact)) {
          errors.contactNumber = "Please enter a valid 11-digit Philippine mobile number starting with 09.";
        }

        if (Object.keys(errors).length > 0) {
          setProviderFieldErrors(errors);
          showNotification({
            title: "Validation Error",
            message: Object.values(errors)[0],
            type: "warning",
          });
          return;
        }

        payload = {
          providerSource: "manual",
          providerName: trimmedName,
          contactNumber: cleanContact,
          serviceType: manualProvider.serviceType?.trim() || undefined,
          notes: manualProvider.notes?.trim() || "",
          saveForFuture: Boolean(saveManualProviderForFuture),
          ...extraPayload,
        };
      } else {
        payload = {
          providerSource: "directory",
          providerId: providerChoice,
          notes: manualProvider.notes?.trim() || "",
          ...extraPayload,
        };
      }

      const res = await assignProviderMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        payload,
      });

      showNotification({
        title: extraPayload.scheduledDate ? "Provider & Schedule Confirmed" : "Provider Assigned",
        message: extraPayload.scheduledDate
          ? `Technician assigned and visit scheduled for #${selectedRequest.request_id}. Work is now in progress.`
          : `Contractor details updated for ticket #${selectedRequest.request_id}.`,
        type: "success",
      });
      setProviderFieldErrors({});
      setProviderFormMessage("");
      return res;
    } catch (err) {
      setProviderFormMessage(getMaintenanceApiErrorMessage(err, "Failed to assign provider."));
      showNotification({
        title: "Assignment Failed",
        message: getMaintenanceApiErrorMessage(err, "Failed to assign provider."),
        type: "error",
      });
      throw err;
    }
  };

  const handleSuggestProvider = async () => {
    if (!selectedRequest) return;
    try {
      const result = await suggestProviderMutation.mutateAsync({
        requestId: selectedRequest.request_id,
      });
      setProviderSuggestion(result?.data || result);
      showNotification({
        title: "Nearby Services Found",
        message: "Ranked nearby service recommendations are ready for review.",
        type: "success",
      });
    } catch (err) {
      showNotification({
        title: "Suggestion Failed",
        message: getMaintenanceApiErrorMessage(err, "Unable to generate provider suggestion."),
        type: "error",
      });
    }
  };

  const handleUseProviderSuggestion = (providerId) => {
    if (providerId) {
      setProviderChoice(providerId);
    } else {
      setProviderSuggestion(null);
    }
  };

  const handleRateProvider = async (payload) => {
    const targetRequestId =
      payload?.requestId ||
      selectedRequest?.request_id ||
      selectedRequest?.id ||
      selectedRequest?._id ||
      selectedRequestId;

    if (!targetRequestId) return null;
    try {
      const res = await rateProviderMutation.mutateAsync({
        requestId: targetRequestId,
        ...payload,
      });
      showNotification({
        title: "Rating Submitted",
        message: "Contractor rating recorded. This helps prioritize top-rated contractors in future AI suggestions.",
        type: "success",
      });
      return res;
    } catch (err) {
      showNotification({
        title: "Rating Failed",
        message: getMaintenanceApiErrorMessage(err, "Unable to record provider rating."),
        type: "error",
      });
      throw err;
    }
  };

  const scheduleAdminMutation = useScheduleAdminMaintenance();
  const respondToRescheduleMutation = useRespondToMaintenanceReschedule();

  const handleRespondToReschedule = async ({ action, scheduledDate, notes }) => {
    if (!selectedRequest) return;
    return await respondToRescheduleMutation.mutateAsync({
      requestId: selectedRequest.request_id,
      payload: { action, scheduledDate, notes },
    });
  };

  const handleSchedule = () => {
    // Scheduling is handled internally by MaintenanceDetailModal via useScheduleAdminMaintenance
  };

  const handleGenerateReport = async (reportType = "admin") => {
    if (!selectedRequest) return;
    try {
      const res = await generateReportMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        reportType,
      });
      const reportPayload = res?.data || res;
      setReportPreview(reportPayload);
    } catch (err) {
      showNotification({
        title: "Report Generation Failed",
        message: getMaintenanceApiErrorMessage(err, "Unable to generate maintenance report."),
        type: "error",
      });
    }
  };

  if (isLoading && (!requests || requests.length === 0)) {
    return <AdminMaintenanceSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Pattern 1 Sticky Sub-Header */}
      <AdminPageHeader
        title="Maintenance"
        subtitle="Review tenant repair requests, assign work, and keep response workflows up to date."
      />

      <PageShell>
        <PageShell.Summary>
          <MaintenanceSummaryCards
            summaryItems={summaryItems}
          />
        </PageShell.Summary>

        <PageShell.Actions>
          <MaintenanceFilters
            searchQuery={searchQuery}
            stageFilter={stageFilter}
            stageCounts={stageCounts}
            statusFilter={statusFilter}
            statusCounts={statusCounts}
            stageStatusFilter={stageStatusFilter}
            stageStatusCounts={stageStatusCounts}
            urgencyCounts={urgencyCounts}
            branchCounts={branchCounts}
            archiveView={archiveView}
            branchFilter={branchFilter}
            userBranch={userBranch}
            urgencyFilter={urgencyFilter}
            slaFilter={slaFilter}
            requestTypeFilter={requestTypeFilter}
            dateType={dateType}
            dateFrom={dateFrom}
            dateTo={dateTo}
            sortMode={sortMode}
            showAdvancedFilters={showAdvancedFilters}
            isOwner={isOwner}
            filteredRequestsCount={filteredRequests.length}
            summaryRequestsCount={summaryRequests.length}
            activeFilterChips={activeFilterChips}
            onStageFilterChange={setStageFilter}
            onStatusFilterChange={setStatusFilter}
            onStageStatusFilterChange={setStageStatusFilter}
            onSearchQueryChange={setSearchQuery}
            onArchiveViewChange={setArchiveView}
            onBranchFilterChange={setBranchFilter}
            onUrgencyFilterChange={setUrgencyFilter}
            onSlaFilterChange={setSlaFilter}
            onRequestTypeFilterChange={setRequestTypeFilter}
            onDateTypeChange={setDateType}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onSortModeChange={setSortMode}
            onToggleAdvancedFilters={() => setShowAdvancedFilters((curr) => !curr)}
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            isExporting={isExporting}
            onResetFilters={handleResetFilters}
          />
        </PageShell.Actions>

        <PageShell.Content>
          <MaintenanceTable
            requests={filteredRequests}
            isLoading={isLoading}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onRowClick={async (row) => {
              setSelectedRequestId(row.request_id);
              if (row.status === "pending") {
                handleQuickStatusChange(row.request_id, "viewed");
              }
              try {
                await maintenanceApi.markAsRead(row.request_id);
              } catch {
                // non-fatal
              }
            }}
          />

          <MaintenanceDetailModal
            open={Boolean(selectedRequestId)}
            onClose={handleCloseDetail}
            request={selectedRequest}
            isLoading={isDetailLoading}
            duplicateData={duplicateData}
            timelineItems={timelineItems}
            serviceProviders={serviceProviders}
            isLoadingProviders={isLoadingProviders}
            providerChoice={providerChoice}
            onProviderChoiceChange={setProviderChoice}
            manualProvider={manualProvider}
            onManualProviderChange={(k, v) => setManualProvider((curr) => ({ ...curr, [k]: v }))}
            saveManualProviderForFuture={saveManualProviderForFuture}
            onSaveManualProviderForFutureChange={setSaveManualProviderForFuture}
            providerFieldErrors={providerFieldErrors}
            providerFormMessage={providerFormMessage}
            providerSuggestion={providerSuggestion}
            onAssignProvider={handleAssignProvider}
            onSuggestProvider={handleSuggestProvider}
            onUseProviderSuggestion={handleUseProviderSuggestion}
            onClearSuggestion={() => setProviderSuggestion(null)}
            onRateProvider={handleRateProvider}
            isAssigningProvider={assignProviderMutation.isPending}
            isSuggestingProvider={suggestProviderMutation.isPending}
            isRatingProvider={rateProviderMutation.isPending}
            onSchedule={handleSchedule}
            onRespondToReschedule={handleRespondToReschedule}
            isRespondingToReschedule={respondToRescheduleMutation.isPending}
            onQuickStatusChange={handleQuickStatusChange}
            onGenerateReport={handleGenerateReport}
            onDownloadReport={handleExportSingleMaintenanceVoucherPDF}
            onRemoveAttachment={(target) => {
              if (target) {
                setAttachmentRemovalDialog({
                  open: true,
                  scope: target.scope,
                  reason: "duplicate_or_invalid",
                  customReason: "",
                  error: null,
                });
              }
            }}
            canRemoveAttachments={true}
          />

          <ReportPreviewModal
            open={Boolean(reportPreview)}
            report={reportPreview}
            request={selectedRequest}
            onExport={(format) => {
              if (format === "csv") {
                handleExportCsv();
              } else {
                handleExportPdf();
              }
            }}
            onSendToTenant={() => setSendTenantSummaryDialogOpen(true)}
            onClose={() => setReportPreview(null)}
          />

          <ConfirmationModal
            open={sendTenantSummaryDialogOpen}
            title="Send Tenant Summary?"
            message="This will send the tenant-safe maintenance summary to the tenant."
            confirmLabel="Send Summary"
            confirmTone="emerald"
            onCancel={() => setSendTenantSummaryDialogOpen(false)}
          />

          <ConfirmationModal
            open={Boolean(archiveDialogMode)}
            title={archiveDialogMode === "restore" ? "Restore Request" : "Archive Request"}
            message="Confirm request action"
            confirmLabel={archiveDialogMode === "restore" ? "Restore Request" : "Archive Request"}
            confirmTone={archiveDialogMode === "restore" ? "emerald" : "rose"}
            onCancel={() => setArchiveDialogMode(null)}
          />

          <AssignBranchModal
            open={branchAssignmentDialog.open}
            branch={branchAssignmentDialog.branch}
            error={branchAssignmentDialog.error}
            onCancel={() => setBranchAssignmentDialog((curr) => ({ ...curr, open: false }))}
          />

          <AttachmentRemovalModal
            open={attachmentRemovalDialog.open}
            scope={attachmentRemovalDialog.scope}
            reason={attachmentRemovalDialog.reason}
            customReason={attachmentRemovalDialog.customReason}
            error={attachmentRemovalDialog.error}
            onCancel={() => setAttachmentRemovalDialog((curr) => ({ ...curr, open: false }))}
          />
        </PageShell.Content>
      </PageShell>
    </div>
  );
}
