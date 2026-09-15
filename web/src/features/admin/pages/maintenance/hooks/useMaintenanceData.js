import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../../shared/hooks/useAuth";
import { showNotification } from "../../../../../shared/utils/notification";
import {
  useAdminMaintenanceRequests,
  useArchiveMaintenanceRequest,
  useAssignMaintenanceBranch,
  useAssignMaintenanceProvider,
  useGenerateMaintenanceReport,
  useGenerateMaintenanceUpdate,
  useMaintenanceAnalytics,
  useMaintenanceBranchReport,
  useMaintenanceProviderReport,
  useMaintenanceRequest,
  useRemoveMaintenanceAttachment,
  useRestoreMaintenanceRequest,
  useSaveMaintenanceProof,
  useSendMaintenanceReply,
  useSendMaintenanceTenantSummary,
  useServiceProviders,
  useSuggestMaintenanceProvider,
  useRateMaintenanceProvider,
  useUpdateMaintenanceRequest,
  useMarkAdminMaintenanceRead,
} from "../../../../../shared/hooks/queries/useMaintenance";
import { maintenanceApi } from "../../../../../shared/api/maintenanceApi";
import {
  getAllowedAdminMaintenanceStatuses,
  LOCKED_ADMIN_MAINTENANCE_STATUSES,
} from "../../../../../shared/utils/maintenanceConfig";
import {
  buildUploadedAdminAttachment,
  createAttachmentClientId,
  createFilterPayload,
  createReportFilterPayload,
  getDefaultMaintenanceReportRange,
  getFormSummaryMessage,
  getMaintenanceApiErrorMessage,
  getMaintenanceAttachmentUri,
  getMaintenanceRequestUploadId,
  getReportFilenameBase,
  getRequestBranch,
  isBlockingWorkLogAttachment,
  isUploadedWorkLogAttachment,
  hasUnreadTenantReplies,
  isRequestNewForAdmin,
  hasTenantConcern,
  getTenantConcernIndicator,
  getRequestLastActivityTime,
  isDeletedAccountRequest,
  ITEMS_PER_PAGE,
  MANAGEMENT_SUMMARY_CARDS,
  mapMaintenanceApiErrors,
  matchesSlaFilter,
  matchesSummaryCard,
  normalizeApiValidationDetail,
  normalizeMaintenanceBranch,
  OPERATIONAL_STAGES,
  CONSOLIDATED_STATUS_OPTIONS,
  SPECIFIC_STATUS_OPTIONS,
  matchesStage,
  matchesStatus,
  matchesStageOrStatus,
  getStageLabel,
  getStatusLabel,
  getStageStatusLabel,
  PROVIDER_MANUAL_CHOICE,
  PROVIDER_NONE_CHOICE,
  TEXT_MIN_LENGTHS,
  urgencyRank,
  validateAmount,
  validateMinimumText,
  validatePhilippineMobile,
  validateProgressAttachmentFile,
} from "../maintenanceUtils";

export function useMaintenanceData() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner" || user?.role === "super_admin";
  const userBranch = normalizeMaintenanceBranch(user?.branch);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    ["requests", "analytics", "branch_reports", "service_providers"].includes(requestedTab)
      ? requestedTab
      : "requests",
  );

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === "requests") {
        next.delete("tab");
      } else {
        next.set("tab", nextTab);
      }
      return next;
    });
  };

  const defaultReportRange = useMemo(() => getDefaultMaintenanceReportRange(), []);

  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [archiveView, setArchiveView] = useState("active");
  const [requestTypeFilter, setRequestTypeFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [dateType, setDateType] = useState("created_at");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    isOwner ? (requestedBranch || "all") : (userBranch || "all"),
  );
  const [sortMode, setSortMode] = useState("newest");
  const requestedSearch = searchParams.get("search") || searchParams.get("room") || "";
  const [searchQuery, setSearchQuery] = useState(requestedSearch);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const requestedRequestId = searchParams.get("requestId");
  const [selectedRequestId, setSelectedRequestId] = useState(requestedRequestId || null);

  const handleCloseDetail = useCallback(() => {
    setSelectedRequestId(null);
    setSearchParams((prev) => {
      if (!prev.has("requestId")) return prev;
      const next = new URLSearchParams(prev);
      next.delete("requestId");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const urlSearch = searchParams.get("search") || searchParams.get("room");
    if (urlSearch !== null && urlSearch !== undefined) {
      setSearchQuery(urlSearch);
    }
    const urlBranch = searchParams.get("branch");
    if (urlBranch) {
      setBranchFilter(isOwner ? urlBranch : (userBranch || "all"));
    }
    const urlRequestId = searchParams.get("requestId");
    if (urlRequestId) {
      setSelectedRequestId((prev) => (prev !== urlRequestId ? urlRequestId : prev));
    }
  }, [searchParams, isOwner, userBranch]);

  const [analyticsFilters, setAnalyticsFilters] = useState({
    branch: isOwner ? "all" : (userBranch || "all"),
    dateFrom: defaultReportRange.dateFrom,
    dateTo: defaultReportRange.dateTo,
    status: "all",
    requestType: "all",
    urgency: "all",
    provider: "all",
    assignmentStatus: "all",
    slaHealth: "all",
    overdueOnly: false,
  });

  const [branchReportFilters, setBranchReportFilters] = useState({
    branch: isOwner ? "all" : (userBranch || "all"),
    dateFrom: defaultReportRange.dateFrom,
    dateTo: defaultReportRange.dateTo,
    status: "all",
    requestType: "all",
    urgency: "all",
    provider: "all",
    assignmentStatus: "all",
    slaHealth: "all",
    overdueOnly: false,
  });

  const [analyticsRequestPage, setAnalyticsRequestPage] = useState(1);
  const [branchReportRequestPage, setBranchReportRequestPage] = useState(1);

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

  const [archiveDialogMode, setArchiveDialogMode] = useState(null);
  const [branchAssignmentDialog, setBranchAssignmentDialog] = useState({
    open: false,
    branch: "",
    error: "",
  });
  const [reportPreview, setReportPreview] = useState(null);
  const [isCopyingReport, setIsCopyingReport] = useState(false);
  const [sendTenantSummaryDialogOpen, setSendTenantSummaryDialogOpen] = useState(false);
  const [updateType, setUpdateType] = useState("status_update");
  const [attachmentRemovalDialog, setAttachmentRemovalDialog] = useState({
    open: false,
    target: null,
    scope: "",
    reason: "",
    customReason: "",
    error: "",
  });

  const effectiveBranchFilter = isOwner
    ? branchFilter === "all"
      ? null
      : branchFilter
    : userBranch || null;

  const listFilters = useMemo(
    () =>
      createFilterPayload({
        stage: stageFilter,
        status: statusFilter,
        requestType: requestTypeFilter,
        urgency: urgencyFilter,
        dateType,
        dateFrom,
        dateTo,
        branch: effectiveBranchFilter,
        archiveView,
      }),
    [
      archiveView,
      effectiveBranchFilter,
      dateType,
      dateFrom,
      dateTo,
      requestTypeFilter,
      stageFilter,
      statusFilter,
      urgencyFilter,
    ],
  );

  const summaryFilters = useMemo(
    () =>
      createFilterPayload({
        requestType: requestTypeFilter,
        urgency: urgencyFilter,
        dateType,
        dateFrom,
        dateTo,
        branch: effectiveBranchFilter,
        archiveView,
      }),
    [archiveView, effectiveBranchFilter, dateType, dateFrom, dateTo, requestTypeFilter, urgencyFilter],
  );

  const analyticsQueryFilters = useMemo(
    () => createReportFilterPayload(analyticsFilters, { isOwner, userBranch }),
    [analyticsFilters, isOwner, userBranch],
  );
  const branchReportQueryFilters = useMemo(
    () => createReportFilterPayload(branchReportFilters, { isOwner, userBranch }),
    [branchReportFilters, isOwner, userBranch],
  );

  const {
    data: requestsData,
    isLoading,
    isError,
    error,
  } = useAdminMaintenanceRequests(listFilters);
  const { data: summaryData } = useAdminMaintenanceRequests(summaryFilters);
  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
    error: analyticsError,
  } = useMaintenanceAnalytics(analyticsQueryFilters, {
    enabled: activeTab === "analytics",
  });
  const {
    data: branchReportData,
    isLoading: isBranchReportLoading,
    isError: isBranchReportError,
    error: branchReportError,
  } = useMaintenanceBranchReport(branchReportQueryFilters, {
    enabled: activeTab === "branch_reports",
  });
  const {
    data: providerReportData,
    isLoading: isProviderReportLoading,
    isError: isProviderReportError,
    error: providerReportError,
  } = useMaintenanceProviderReport(branchReportQueryFilters, {
    enabled: activeTab === "service_providers",
  });
  const {
    data: requestDetailData,
    isLoading: isDetailLoading,
  } = useMaintenanceRequest(selectedRequestId);

  const updateRequestMutation = useUpdateMaintenanceRequest();
  const sendReplyMutation = useSendMaintenanceReply();
  const saveProofMutation = useSaveMaintenanceProof();
  const removeAttachmentMutation = useRemoveMaintenanceAttachment();
  const archiveRequestMutation = useArchiveMaintenanceRequest();
  const restoreRequestMutation = useRestoreMaintenanceRequest();
  const assignBranchMutation = useAssignMaintenanceBranch();
  const assignProviderMutation = useAssignMaintenanceProvider();
  const generateUpdateMutation = useGenerateMaintenanceUpdate();
  const generateReportMutation = useGenerateMaintenanceReport();
  const sendTenantSummaryMutation = useSendMaintenanceTenantSummary();
  const suggestProviderMutation = useSuggestMaintenanceProvider();
  const rateProviderMutation = useRateMaintenanceProvider();
  const markAdminReadMutation = useMarkAdminMaintenanceRead();

  useEffect(() => {
    if (selectedRequestId) {
      markAdminReadMutation.mutate(selectedRequestId);
    }
  }, [selectedRequestId]);

  const requests = requestsData?.requests || [];
  const summaryRequests = summaryData?.requests || requests;

  const baseSelectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    return (
      requests.find(
        (r) =>
          String(r.request_id || r.id || r._id) === String(selectedRequestId),
      ) || null
    );
  }, [requests, selectedRequestId]);

  const selectedRequest = useMemo(() => {
    const detail =
      requestDetailData?.data?.request ||
      requestDetailData?.request ||
      requestDetailData?.data ||
      null;

    if (detail && typeof detail === "object" && Object.keys(detail).length > 0) {
      return {
        ...(baseSelectedRequest || {}),
        ...detail,
      };
    }
    return baseSelectedRequest;
  }, [baseSelectedRequest, requestDetailData]);

  const providerFilters = useMemo(() => {
    if (!selectedRequest) return {};
    const branchId = getRequestBranch(selectedRequest);
    const category = selectedRequest.request_type
      ? selectedRequest.request_type
      : "";
    return { branchId, category };
  }, [selectedRequest]);

  const {
    data: providerData,
    isLoading: isLoadingProviders,
  } = useServiceProviders(providerFilters, {
    enabled: Boolean(selectedRequest && getRequestBranch(selectedRequest)),
  });

  const serviceProviders = providerData?.providers || [];

  const summaryItems = useMemo(() => {
    const unreadCount = summaryRequests.filter(
      (r) => hasTenantConcern(r),
    ).length;

    return MANAGEMENT_SUMMARY_CARDS.map((item) => {
      const val = summaryRequests.filter((request) =>
        matchesSummaryCard({
          request,
          cardKey: item.key,
          dateFrom,
          dateTo,
        }),
      ).length;

      let trend = item.description;
      if (item.key === "open_queue" && unreadCount > 0) {
        trend = `${item.description} • ${unreadCount} new`;
      }

      return {
        ...item,
        value: val,
        trend,
      };
    });
  }, [dateFrom, dateTo, summaryRequests]);

  const stageCounts = useMemo(() => {
    const counts = { all: summaryRequests.length };
    OPERATIONAL_STAGES.forEach((stage) => {
      counts[stage.key] = summaryRequests.filter((request) =>
        matchesStage({
          request,
          stage: stage.key,
          dateFrom,
          dateTo,
        }),
      ).length;
      counts[stage.stageKey] = counts[stage.key];
    });
    return counts;
  }, [dateFrom, dateTo, summaryRequests]);

  const statusCounts = useMemo(() => {
    const counts = { all: summaryRequests.length };
    CONSOLIDATED_STATUS_OPTIONS.forEach((status) => {
      counts[status.key] = summaryRequests.filter((request) =>
        matchesStatus({
          request,
          status: status.key,
        }),
      ).length;
    });
    return counts;
  }, [summaryRequests]);

  const stageStatusCounts = useMemo(
    () => ({ ...stageCounts, ...statusCounts }),
    [stageCounts, statusCounts],
  );

  const queueCounts = stageCounts;

  const urgencyCounts = useMemo(() => {
    const counts = {
      all: summaryRequests.length,
      emergency: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    summaryRequests.forEach((req) => {
      const u = String(req.urgency || "").toLowerCase();
      if (u && counts[u] !== undefined) {
        counts[u] += 1;
      }
    });
    return counts;
  }, [summaryRequests]);

  const branchCounts = useMemo(() => {
    const counts = {
      all: summaryRequests.length,
      guadalupe: 0,
      "gil-puyat": 0,
    };
    summaryRequests.forEach((req) => {
      const b = normalizeMaintenanceBranch(req.branch);
      if (b && counts[b] !== undefined) {
        counts[b] += 1;
      }
    });
    return counts;
  }, [summaryRequests]);

  const activeSummaryIndex = MANAGEMENT_SUMMARY_CARDS.findIndex(
    (item) => item.key === stageFilter,
  );

  const sortedRequests = useMemo(() => {
    const nextRequests = [...requests];
    nextRequests.sort((left, right) => {
      // 0. Deleted account requests ALWAYS sink to the bottom of the table
      const leftDeleted = isDeletedAccountRequest(left);
      const rightDeleted = isDeletedAccountRequest(right);
      if (leftDeleted && !rightDeleted) return 1;
      if (!leftDeleted && rightDeleted) return -1;
      if (leftDeleted && rightDeleted) {
        return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
      }

      if (sortMode === "urgency") {
        const urgencyDelta =
          (urgencyRank[left.urgency] ?? 99) - (urgencyRank[right.urgency] ?? 99);
        if (urgencyDelta !== 0) return urgencyDelta;
      }

      // Default (All statuses / Newest First): Sort by latest activity time
      const leftActivity = getRequestLastActivityTime(left);
      const rightActivity = getRequestLastActivityTime(right);
      if (rightActivity !== leftActivity) {
        return rightActivity - leftActivity;
      }

      const leftCreated = new Date(left.created_at || left.createdAt || 0).getTime();
      const rightCreated = new Date(right.created_at || right.createdAt || 0).getTime();
      return rightCreated - leftCreated;
    });
    return nextRequests;
  }, [requests, sortMode]);

  const searchedRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedRequests;

    return sortedRequests.filter((request) => {
      const haystack = [
        request.request_id,
        request.description,
        request.assigned_to,
        request.user_id,
        request.tenant?.user_id,
        request.tenant?.full_name,
        request.tenant?.branch,
        request.room_number,
        request.roomNumber,
        request.unit,
        request.location,
        request.room,
        request.tenant?.room_number,
        request.tenant?.roomNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [searchQuery, sortedRequests]);

  const filteredRequests = useMemo(
    () =>
      searchedRequests.filter(
        (request) =>
          matchesSlaFilter({ request, slaFilter }) &&
          matchesStage({
            request,
            stage: stageFilter,
            dateFrom,
            dateTo,
          }) &&
          matchesStatus({
            request,
            status: statusFilter,
          }),
      ),
    [dateFrom, dateTo, searchedRequests, slaFilter, stageFilter, statusFilter],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    stageFilter,
    statusFilter,
    archiveView,
    requestTypeFilter,
    urgencyFilter,
    slaFilter,
    dateType,
    dateFrom,
    dateTo,
    branchFilter,
    sortMode,
    searchQuery,
  ]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [filteredRequests.length, currentPage]);

  const handleResetFilters = () => {
    setStageFilter("all");
    setStatusFilter("all");
    setArchiveView("active");
    setRequestTypeFilter("all");
    setUrgencyFilter("all");
    setSlaFilter("all");
    setDateType("created_at");
    setDateFrom("");
    setDateTo("");
    setBranchFilter(isOwner ? "all" : userBranch);
    setSortMode("newest");
    setSearchQuery("");
    setShowAdvancedFilters(false);
    setCurrentPage(1);
  };

  return {
    isOwner,
    userBranch,
    activeTab,
    handleTabChange,

    // Filters
    stageFilter,
    setStageFilter,
    stageCounts,
    statusFilter,
    setStatusFilter,
    statusCounts,
    stageStatusFilter: stageFilter !== "all" ? stageFilter : statusFilter,
    setStageStatusFilter: (val) => {
      if (!val || val === "all") {
        setStageFilter("all");
        setStatusFilter("all");
      } else if (OPERATIONAL_STAGES.some((s) => s.key === val || s.stageKey === val || `stage:${s.key}` === val)) {
        setStageFilter(val.replace(/^stage:/, ""));
      } else {
        setStatusFilter(val.replace(/^status:/, ""));
      }
    },
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
    summaryCardKey: stageFilter,
    setSummaryCardKey: setStageFilter,
    queueFilter: stageFilter,
    setQueueFilter: setStageFilter,
    queueCounts: stageCounts,
    activeSummaryIndex,
    showAdvancedFilters,
    setShowAdvancedFilters,
    handleResetFilters,

    // Query Data
    requests,
    summaryRequests,
    filteredRequests,
    isLoading,
    isError,
    error,
    currentPage,
    setCurrentPage,

    // Detail & Selected Request
    selectedRequestId,
    setSelectedRequestId,
    handleCloseDetail,
    selectedRequest,
    isDetailLoading,
    serviceProviders,
    isLoadingProviders,

    // Summary Items
    summaryItems,

    // Analytics / Reports
    analyticsData,
    isAnalyticsLoading,
    isAnalyticsError,
    analyticsError,
    analyticsFilters,
    setAnalyticsFilters,
    analyticsRequestPage,
    setAnalyticsRequestPage,

    branchReportData,
    isBranchReportLoading,
    isBranchReportError,
    branchReportError,
    branchReportFilters,
    setBranchReportFilters,
    branchReportRequestPage,
    setBranchReportRequestPage,

    providerReportData,
    isProviderReportLoading,
    isProviderReportError,
    providerReportError,

    // Modals state
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

    // Mutations
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
    markAdminReadMutation,
  };
}
