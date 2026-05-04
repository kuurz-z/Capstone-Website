import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Clock3,
    FileDown,
    Filter,
    Image as ImageIcon,
    Loader2,
    RefreshCcw,
    Search,
    UserRound,
    Wrench,
    XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtDate, fmtDateTime } from "../../../shared/utils/dateFormat";
import { useSearchParams } from "react-router-dom";
import {
    useAdminMaintenanceRequests,
    useBulkMaintenanceUpdate,
    useMaintenanceRequest,
    useUpdateMaintenanceRequest,
} from "../../../shared/hooks/queries/useMaintenance";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
    normalizeBranchFilterValue,
    syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import { BRANCH_DISPLAY_NAMES, BRANCH_OPTIONS } from "../../../shared/utils/constants";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import {
    ADMIN_MAINTENANCE_STATUS_OPTIONS,
    formatMaintenanceStatus,
    getAllowedAdminMaintenanceStatuses,
    getMaintenanceTypeMeta,
    getMaintenanceUrgencyMeta,
    isAdminTerminalMaintenanceStatus,
    MAINTENANCE_REQUEST_TYPES,
    MAINTENANCE_URGENCY_LEVELS,
} from "../../../shared/utils/maintenanceConfig";
import { showConfirmation, showNotification } from "../../../shared/utils/notification";
import {
    DataTable,
    DetailDrawer,
    PageShell,
    StatusBadge,
    SummaryBar,
} from "../components/shared";
import "../styles/admin-maintenance.css";
import "../styles/design-tokens.css";

const ITEMS_PER_PAGE = 10;

const formatSlaState = (slaState) => {
  if (!slaState) return "No SLA";
  if (slaState.label === "delayed") return "Delayed";
  if (slaState.label === "priority") return "Priority";
  if (slaState.label === "closed") return "Closed";
  return "On Track";
};

const getSlaTone = (slaState) => {
  if (!slaState) {
    return { bg: "#E2E8F0", color: "#475569" };
  }
  if (slaState.label === "delayed") {
    return { bg: "#FEE2E2", color: "#DC2626" };
  }
  if (slaState.label === "priority") {
    return { bg: "#FEF3C7", color: "#D97706" };
  }
  if (slaState.label === "closed") {
    return { bg: "#DCFCE7", color: "#166534" };
  }
  return { bg: "#DBEAFE", color: "#2563EB" };
};

const urgencyRank = {
  high: 0,
  normal: 1,
  low: 2,
};

const SUMMARY_STATUSES = [
  { key: "all", label: "All Requests", icon: ClipboardList, color: "blue" },
  { key: "pending", label: "Pending", icon: Clock3, color: "orange" },
  { key: "viewed", label: "Viewed", icon: Filter, color: "orange" },
  { key: "in_progress", label: "In Progress", icon: RefreshCcw, color: "blue" },
  { key: "waiting_tenant", label: "Waiting for Tenant", icon: Clock3, color: "blue" },
  { key: "resolved", label: "Resolved", icon: CheckCircle2, color: "green" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "green" },
  { key: "rejected", label: "Rejected", icon: XCircle, color: "red" },
  { key: "cancelled", label: "Cancelled", icon: AlertTriangle, color: "neutral" },
  { key: "closed", label: "Closed", icon: CheckCircle2, color: "neutral" },
];

const QUICK_FILTERS = [
  { key: "needs_action", label: "Needs Action" },
  { key: "unassigned", label: "Unassigned" },
  { key: "high_priority", label: "High Priority" },
  { key: "delayed", label: "Delayed" },
  { key: "waiting_tenant", label: "Waiting for Tenant" },
];

const ADMIN_RESPONSE_TEMPLATES = [
  "We have received your request.",
  "Assigned to maintenance staff.",
  "Work is in progress.",
  "Issue has been resolved.",
  "Please provide more details.",
];

const QUICK_STATUS_ACTIONS = [
  { status: "viewed", label: "Mark Viewed" },
  { status: "in_progress", label: "Start Work" },
  { status: "waiting_tenant", label: "Waiting for Tenant" },
  { status: "resolved", label: "Resolve" },
  { status: "completed", label: "Complete" },
  { status: "rejected", label: "Reject" },
  { status: "closed", label: "Close" },
];

const createFilterPayload = ({
  status,
  requestType,
  urgency,
  dateFrom,
  dateTo,
  branch,
}) => {
  const filters = { limit: 200 };

  if (status && status !== "all") filters.status = status;
  if (requestType && requestType !== "all") filters.request_type = requestType;
  if (urgency && urgency !== "all") filters.urgency = urgency;
  if (dateFrom) filters.date_from = dateFrom;
  if (dateTo) filters.date_to = dateTo;
  if (branch && branch !== "all") filters.branch = branch;

  return filters;
};

export default function AdminMaintenancePage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState("all");
  const [requestTypeFilter, setRequestTypeFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      allValue: "all",
    }),
  );
  const [sortMode, setSortMode] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignedTo, setBulkAssignedTo] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkFailures, setBulkFailures] = useState([]);
  const [draftStatus, setDraftStatus] = useState("viewed");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftAssignedTo, setDraftAssignedTo] = useState("");
  const [draftWorkLogNote, setDraftWorkLogNote] = useState("");

  const listFilters = useMemo(
    () =>
      createFilterPayload({
        status: statusFilter,
        requestType: requestTypeFilter,
        urgency: urgencyFilter,
        dateFrom,
        dateTo,
        branch: isOwner ? branchFilter : null,
      }),
    [
      branchFilter,
      dateFrom,
      dateTo,
      isOwner,
      requestTypeFilter,
      statusFilter,
      urgencyFilter,
    ],
  );

  const summaryFilters = useMemo(
    () =>
      createFilterPayload({
        requestType: requestTypeFilter,
        urgency: urgencyFilter,
        dateFrom,
        dateTo,
        branch: isOwner ? branchFilter : null,
      }),
    [branchFilter, dateFrom, dateTo, isOwner, requestTypeFilter, urgencyFilter],
  );

  const {
    data: requestsData,
    isLoading,
    isError,
    error,
    refetch,
    refresh,
  } = useAdminMaintenanceRequests(listFilters);
  const { data: summaryData } = useAdminMaintenanceRequests(summaryFilters);
  const {
    data: requestDetailData,
    isLoading: isDetailLoading,
  } = useMaintenanceRequest(selectedRequestId);
  const updateRequestMutation = useUpdateMaintenanceRequest();
  const bulkUpdateMutation = useBulkMaintenanceUpdate();
  const [quickActionStatus, setQuickActionStatus] = useState("");

  const requests = requestsData?.requests || [];
  const summaryRequests = summaryData?.requests || requests;
  const selectedRequest = requestDetailData?.request || null;
  const selectedRequestIsTerminal = isAdminTerminalMaintenanceStatus(
    selectedRequest?.status,
  );
  const allowedDraftStatuses = useMemo(() => {
    if (!selectedRequest) return [];
    const allowed = getAllowedAdminMaintenanceStatuses(selectedRequest.status);
    return allowed.length ? allowed : [selectedRequest.status].filter(Boolean);
  }, [selectedRequest]);
  const normalizedDraft = useMemo(
    () => ({
      status: draftStatus,
      notes: draftNotes.trim(),
      assigned_to: draftAssignedTo.trim(),
      work_log_note: draftWorkLogNote.trim(),
    }),
    [draftAssignedTo, draftNotes, draftStatus, draftWorkLogNote],
  );
  const updateValidationErrors = useMemo(() => {
    if (!selectedRequest || selectedRequestIsTerminal) return {};

    const errors = {};
    const hasAdminResponse = normalizedDraft.notes.length > 0;
    const hasWorkLogNote = normalizedDraft.work_log_note.length > 0;

    if (["rejected", "waiting_tenant", "closed"].includes(normalizedDraft.status) && !hasAdminResponse) {
      errors.notes = "Add an admin response before updating this status.";
    }
    if (
      ["resolved", "completed"].includes(normalizedDraft.status) &&
      !hasAdminResponse &&
      !hasWorkLogNote
    ) {
      errors.resolution = "Add an admin response or work log note before resolving.";
    }

    return errors;
  }, [normalizedDraft, selectedRequest, selectedRequestIsTerminal]);
  const hasUpdateValidationErrors = Object.keys(updateValidationErrors).length > 0;
  const hasAdminDraftChanges = useMemo(() => {
    if (!selectedRequest || selectedRequestIsTerminal) return false;

    return (
      normalizedDraft.status !== selectedRequest.status ||
      normalizedDraft.notes !== (selectedRequest.notes || "").trim() ||
      normalizedDraft.assigned_to !== (selectedRequest.assigned_to || "").trim() ||
      normalizedDraft.work_log_note.length > 0
    );
  }, [normalizedDraft, selectedRequest, selectedRequestIsTerminal]);

  const hasActiveFilters = useMemo(() => (
    statusFilter !== "all" ||
    requestTypeFilter !== "all" ||
    urgencyFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    (isOwner && branchFilter !== "all") ||
    sortMode !== "newest" ||
    searchQuery.trim() !== "" ||
    quickFilter !== "all"
  ), [statusFilter, requestTypeFilter, urgencyFilter, dateFrom, dateTo, isOwner, branchFilter, sortMode, searchQuery, quickFilter]);

  const summaryItems = useMemo(() => {
    const counts = summaryRequests.reduce((acc, request) => {
      const key = request.status || "pending";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return SUMMARY_STATUSES.map((item) => ({
      ...item,
      value:
        item.key === "all"
          ? summaryRequests.length
          : counts[item.key] || 0,
    }));
  }, [summaryRequests]);

  const activeSummaryIndex = SUMMARY_STATUSES.findIndex(
    (item) => item.key === statusFilter,
  );

  const sortedRequests = useMemo(() => {
    const nextRequests = [...requests];

    nextRequests.sort((left, right) => {
      if (sortMode === "urgency") {
        const urgencyDelta =
          (urgencyRank[left.urgency] ?? 99) - (urgencyRank[right.urgency] ?? 99);
        if (urgencyDelta !== 0) return urgencyDelta;
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    return nextRequests;
  }, [requests, sortMode]);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const quickFiltered = sortedRequests.filter((request) => {
      if (quickFilter === "needs_action") {
        return ["pending", "viewed", "in_progress", "waiting_tenant"].includes(request.status);
      }
      if (quickFilter === "unassigned") {
        return !String(request.assigned_to || "").trim();
      }
      if (quickFilter === "high_priority") {
        return request.urgency === "high";
      }
      if (quickFilter === "delayed") {
        return request.slaState?.label === "delayed";
      }
      if (quickFilter === "waiting_tenant") {
        return request.status === "waiting_tenant";
      }
      return true;
    });

    if (!query) return quickFiltered;

    return quickFiltered.filter((request) => {
      const haystack = [
        request.request_id,
        request.description,
        request.assigned_to,
        request.user_id,
        request.tenant?.user_id,
        request.tenant?.full_name,
        request.tenant?.branch,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [quickFilter, searchQuery, sortedRequests]);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (statusFilter !== "all") {
      chips.push({
        key: `status-${statusFilter}`,
        label: `Status: ${formatMaintenanceStatus(statusFilter)}`,
      });
    }

    if (requestTypeFilter !== "all") {
      chips.push({
        key: `type-${requestTypeFilter}`,
        label: `Type: ${getMaintenanceTypeMeta(requestTypeFilter).label}`,
      });
    }

    if (urgencyFilter !== "all") {
      chips.push({
        key: `urgency-${urgencyFilter}`,
        label: `Urgency: ${getMaintenanceUrgencyMeta(urgencyFilter).label}`,
      });
    }

    if (dateFrom) {
      chips.push({
        key: `from-${dateFrom}`,
        label: `From: ${fmtDate(dateFrom)}`,
      });
    }

    if (dateTo) {
      chips.push({
        key: `to-${dateTo}`,
        label: `To: ${fmtDate(dateTo)}`,
      });
    }

    if (isOwner && branchFilter !== "all") {
      chips.push({
        key: `branch-${branchFilter}`,
        label: `Branch: ${BRANCH_DISPLAY_NAMES[branchFilter] || branchFilter}`,
      });
    }

    if (sortMode === "urgency") {
      chips.push({
        key: "sort-urgency",
        label: "Sort: Urgency high first",
      });
    }

    if (searchQuery.trim()) {
      chips.push({
        key: "search",
        label: `Search: ${searchQuery.trim()}`,
      });
    }
    return chips;
  }, [
    branchFilter,
    dateFrom,
    dateTo,
    isOwner,
    requestTypeFilter,
    searchQuery,
    sortMode,
    statusFilter,
    urgencyFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    branchFilter,
    dateFrom,
    dateTo,
    requestTypeFilter,
    quickFilter,
    sortMode,
    statusFilter,
    urgencyFilter,
  ]);

  useEffect(() => {
    setSelectedRequestIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(filteredRequests.map((request) => request.request_id));
      return new Set([...prev].filter((id) => visibleIds.has(id)));
    });
  }, [filteredRequests]);

  useEffect(() => {
    const nextBranch = normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      allValue: "all",
    });

    setBranchFilter((current) => (current === nextBranch ? current : nextBranch));
  }, [isOwner, requestedBranch]);

  useEffect(() => {
    if (!user?.role) return;

    const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
      enabled: isOwner,
      allValue: "all",
    });

    if (nextParams.toString() === searchParams.toString()) return;
    setSearchParams(nextParams, { replace: true });
  }, [branchFilter, isOwner, searchParams, setSearchParams, user?.role]);

  useEffect(() => {
    if (!selectedRequest) return;

    const allowedStatuses = getAllowedAdminMaintenanceStatuses(selectedRequest.status);
    const initialStatus = allowedStatuses[0] || selectedRequest.status || "viewed";

    setDraftStatus(initialStatus);
    setDraftNotes(selectedRequest.notes || "");
    setDraftAssignedTo(selectedRequest.assigned_to || "");
    setDraftWorkLogNote("");
  }, [selectedRequest]);

  const handleResetFilters = () => {
    setStatusFilter("all");
    setRequestTypeFilter("all");
    setUrgencyFilter("all");
    setDateFrom("");
    setDateTo("");
    setBranchFilter("all");
    setSortMode("newest");
    setSearchQuery("");
    setQuickFilter("all");
    setSelectedRequestIds(new Set());
  };

  const handleExport = () => {
    exportToCSV(
      filteredRequests.map((request) => ({
        requestId: request.request_id,
        tenantName: request.tenant?.full_name || "Unknown Tenant",
        branch: request.tenant?.branch || request.branch || "",
        requestType: getMaintenanceTypeMeta(request.request_type).label,
        urgency: getMaintenanceUrgencyMeta(request.urgency).label,
        status: formatMaintenanceStatus(request.status),
        sla: formatSlaState(request.slaState),
        assignedTo: request.assigned_to || "Unassigned",
        createdAt: fmtDateTime(request.created_at),
        updatedAt: fmtDateTime(request.updated_at),
      })),
      [
        { key: "requestId", label: "Request ID" },
        { key: "tenantName", label: "Tenant" },
        { key: "branch", label: "Branch" },
        { key: "requestType", label: "Request Type" },
        { key: "urgency", label: "Urgency" },
        { key: "status", label: "Status" },
        { key: "sla", label: "SLA State" },
        { key: "assignedTo", label: "Assigned To" },
        { key: "createdAt", label: "Created At" },
        { key: "updatedAt", label: "Updated At" },
      ],
      "maintenance-requests",
    );
  };

  const handleSummaryFilter = (index) => {
    if (index === -1) {
      setStatusFilter("all");
      return;
    }
    const item = SUMMARY_STATUSES[index];
    if (!item) return;
    setStatusFilter(item.key);
  };

  const handleSubmitUpdate = async (event) => {
    event.preventDefault();
    if (!selectedRequest) return;
    if (isAdminTerminalMaintenanceStatus(selectedRequest.status)) {
      showNotification("Terminal maintenance requests cannot be updated.", "error");
      return;
    }
    if (!hasAdminDraftChanges) {
      showNotification("No changes to save.", "info");
      return;
    }
    if (hasUpdateValidationErrors) {
      showNotification("Please complete the required admin notes.", "error");
      return;
    }

    try {
      await updateRequestMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        payload: {
          status: normalizedDraft.status,
          notes: normalizedDraft.notes,
          assigned_to: normalizedDraft.assigned_to,
          work_log_note: normalizedDraft.work_log_note,
        },
      });
      showNotification("Maintenance request updated.", "success");
      setDraftWorkLogNote("");
    } catch (submitError) {
      showNotification(
        submitError.message || "Failed to update maintenance request.",
        "error",
      );
    }
  };

  const handleBulkUpdate = async (overrideStatus) => {
    if (selectedRequestIds.size === 0) {
      showNotification("Select at least one request.", "info");
      return;
    }

    const targetStatus = overrideStatus || bulkStatus || undefined;
    const assignedTo = bulkAssignedTo.trim() || undefined;
    const notes = bulkNotes.trim() || undefined;

    if (!targetStatus && !assignedTo && !notes) {
      showNotification("Choose a status, assignee, or admin response.", "error");
      return;
    }

    const count = selectedRequestIds.size;
    const label = overrideStatus
      ? `"${formatMaintenanceStatus(overrideStatus)}"`
      : "this update";

    const confirmed = await showConfirmation(
      `Apply ${label} to ${count} request${count > 1 ? "s" : ""}?`,
      "Apply Bulk Update",
      "Cancel",
    );
    if (!confirmed) return;

    const payload = {
      requestIds: Array.from(selectedRequestIds),
      ...(targetStatus && { status: targetStatus }),
      ...(assignedTo && { assigned_to: assignedTo }),
      ...(notes && { notes }),
    };

    try {
      const result = await bulkUpdateMutation.mutateAsync(payload);
      if (result?.failedCount > 0) {
        showNotification(
          `${result.updatedCount} updated, ${result.failedCount} failed — check details below.`,
          "warning",
        );
        setBulkFailures(result.failed || []);
      } else {
        showNotification(
          `${result?.updatedCount ?? count} request${count > 1 ? "s" : ""} updated.`,
          "success",
        );
        setSelectedRequestIds(new Set());
        setBulkStatus("");
        setBulkAssignedTo("");
        setBulkNotes("");
        setBulkFailures([]);
      }
    } catch (bulkError) {
      showNotification(
        bulkError?.message || "Failed to apply bulk update.",
        "error",
      );
    }
  };

  const handleQuickStatusAction = async (status) => {
    if (!selectedRequest || selectedRequestIsTerminal) return;
    if (!allowedDraftStatuses.includes(status)) return;

    const nextDraft = {
      ...normalizedDraft,
      status,
    };
    const hasAdminResponse = nextDraft.notes.length > 0;
    const hasWorkLogNote = nextDraft.work_log_note.length > 0;

    if (["rejected", "waiting_tenant", "closed"].includes(status) && !hasAdminResponse) {
      setDraftStatus(status);
      showNotification("Add an admin response before updating this status.", "error");
      return;
    }
    if (["resolved", "completed"].includes(status) && !hasAdminResponse && !hasWorkLogNote) {
      setDraftStatus(status);
      showNotification("Add an admin response or work log note before closing.", "error");
      return;
    }

    setQuickActionStatus(status);
    try {
      await updateRequestMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        payload: nextDraft,
      });
      showNotification("Maintenance request updated.", "success");
      setDraftStatus(status);
      setDraftWorkLogNote("");
    } catch (submitError) {
      showNotification(
        submitError.message || "Failed to update maintenance request.",
        "error",
      );
    } finally {
      setQuickActionStatus("");
    }
  };

  const applyResponseTemplate = (template) => {
    setDraftNotes((current) => {
      const trimmed = current.trim();
      if (!trimmed) return template;
      if (trimmed.includes(template)) return current;
      return `${trimmed}\n\n${template}`;
    });
  };

  const columns = useMemo(
    () => [
      {
        key: "tenant",
        label: "Tenant",
        render: (row) => (
          <div className="admin-maintenance__tenant-cell">
            <div className="admin-maintenance__avatar">
              {(row.tenant?.full_name || "T")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <div className="admin-maintenance__tenant-name">
                {row.tenant?.full_name || "Unknown Tenant"}
              </div>
              <div className="admin-maintenance__tenant-meta">
                {row.tenant?.user_id || row.user_id}
              </div>
            </div>
          </div>
        ),
      },
      ...(isOwner
        ? [
            {
              key: "branch",
              label: "Branch",
              render: (row) => row.tenant?.branch || row.branch || "-",
            },
          ]
        : []),
      {
        key: "request_type",
        label: "Type",
        render: (row) => {
          const typeMeta = getMaintenanceTypeMeta(row.request_type);
          const TypeIcon = typeMeta.icon;

          return (
            <div className="admin-maintenance__type-cell">
              <span
                className="admin-maintenance__type-icon"
                style={{
                  backgroundColor: `${typeMeta.color}1A`,
                  color: typeMeta.color,
                }}
              >
                <TypeIcon size={16} />
              </span>
              <div>
                <div className="admin-maintenance__type-label">{typeMeta.label}</div>
                <div className="admin-maintenance__type-meta">
                  {row.attachments?.length || 0} attachment
                  {(row.attachments?.length || 0) === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        key: "description",
        label: "Description",
        render: (row) => (
          <div className="admin-maintenance__description-cell">
            <div className="admin-maintenance__description-preview">
              {row.description}
            </div>
            <div className="admin-maintenance__description-meta">
              {row.request_id}
            </div>
          </div>
        ),
      },
      {
        key: "urgency",
        label: "Urgency",
        render: (row) => {
          const urgencyMeta = getMaintenanceUrgencyMeta(row.urgency);
          return (
            <span
              className="admin-maintenance__urgency-pill"
              style={{
                backgroundColor: `${urgencyMeta.color}1A`,
                color: urgencyMeta.color,
              }}
            >
              {urgencyMeta.label}
            </span>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <StatusBadge status={row.status} />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                padding: "4px 8px",
                borderRadius: 999,
                background: getSlaTone(row.slaState).bg,
                color: getSlaTone(row.slaState).color,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {formatSlaState(row.slaState)}
            </span>
          </div>
        ),
      },
      {
        key: "assigned_to",
        label: "Assigned To",
        render: (row) => row.assigned_to || "Unassigned",
      },
      {
        key: "created_at",
        label: "Date",
        sortable: true,
        render: (row) => fmtDate(row.created_at),
      },
    ],
    [isOwner],
  );

  return (
    <div className="admin-maintenance-page">
      <PageShell>
        <PageShell.Summary>
          <SummaryBar
            items={summaryItems}
            activeIndex={activeSummaryIndex === -1 ? 0 : activeSummaryIndex}
            onItemClick={(index) => handleSummaryFilter(index)}
          />
        </PageShell.Summary>

        <PageShell.Actions>
          <section className="admin-maintenance__filters">
            <div className="admin-maintenance__filters-header">
              <div className="admin-maintenance__filters-title-group">
                <h2 className="admin-maintenance__filters-title">Find requests quickly</h2>
                <span className="admin-maintenance__result-count">
                  {filteredRequests.length} of {summaryRequests.length} requests
                </span>
              </div>
              <div className="admin-maintenance__filters-actions">
                <button
                  type="button"
                  className="admin-maintenance__icon-btn"
                  title="Refresh"
                  aria-label="Refresh"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCcw size={14} />
                </button>
                <select
                  className="admin-maintenance__sort-select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                  aria-label="Sort requests"
                >
                  <option value="newest">Newest first</option>
                  <option value="urgency">Urgency first</option>
                </select>
                <button
                  type="button"
                  className="admin-maintenance__header-btn"
                  onClick={handleExport}
                  disabled={filteredRequests.length === 0}
                >
                  <FileDown size={14} />
                  Export CSV
                </button>
                <button
                  type="button"
                  className="admin-maintenance__header-btn admin-maintenance__header-btn--ghost"
                  onClick={handleResetFilters}
                  disabled={!hasActiveFilters}
                >
                  Reset Filters
                </button>
              </div>
            </div>

            <div className="admin-maintenance__filters-grid">
              <label className="admin-maintenance__field admin-maintenance__field--search">
                <div className="admin-maintenance__search-wrap">
                  <Search size={16} />
                  <input
                    type="search"
                    placeholder="Search tenant, ID, assignment, or description"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </label>

            <label className="admin-maintenance__field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {SUMMARY_STATUSES.filter((item) => item.key !== "all").map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-maintenance__field">
              <span>Request Type</span>
              <select
                value={requestTypeFilter}
                onChange={(event) => setRequestTypeFilter(event.target.value)}
              >
                <option value="all">All request types</option>
                {MAINTENANCE_REQUEST_TYPES.map((requestType) => (
                  <option key={requestType} value={requestType}>
                    {getMaintenanceTypeMeta(requestType).label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-maintenance__field">
              <span>Urgency</span>
              <select
                value={urgencyFilter}
                onChange={(event) => setUrgencyFilter(event.target.value)}
              >
                <option value="all">All urgency levels</option>
                {MAINTENANCE_URGENCY_LEVELS.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    {getMaintenanceUrgencyMeta(urgency).label}
                  </option>
                ))}
              </select>
            </label>

            <div className="admin-maintenance__field admin-maintenance__field--daterange">
              <span>Date Range</span>
              <div className="admin-maintenance__daterange-wrap">
                <input
                  type="date"
                  aria-label="Date from"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
                <span className="admin-maintenance__daterange-sep" aria-hidden>—</span>
                <input
                  type="date"
                  aria-label="Date to"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
            </div>

            {isOwner ? (
              <label className="admin-maintenance__field">
                <span>Branch</span>
                <select
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                >
                  <option value="all">All branches</option>
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            </div>

            <div className="admin-maintenance__filters-footer">
              <div className="admin-maintenance__quick-filters" aria-label="Quick filters">
                <button
                  type="button"
                  className={quickFilter === "all" ? "is-active" : ""}
                  onClick={() => setQuickFilter("all")}
                >
                  All
                </button>
                {QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={quickFilter === filter.key ? "is-active" : ""}
                    onClick={() => setQuickFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {activeFilterChips.length > 0 && (
                <div className="admin-maintenance__active-filters" aria-live="polite">
                  <span className="admin-maintenance__chips-label">Filtered by:</span>
                  {activeFilterChips.map((chip) => (
                    <span key={chip.key} className="admin-maintenance__chip">
                      {chip.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {selectedRequestIds.size > 0 && (
            <section className="admin-maintenance__bulk">
              <div className="admin-maintenance__bulk-header">
                <span className="admin-maintenance__bulk-count">
                  <strong>{selectedRequestIds.size}</strong> request{selectedRequestIds.size > 1 ? "s" : ""} selected
                </span>
                <button
                  type="button"
                  className="admin-maintenance__bulk-clear"
                  onClick={() => { setSelectedRequestIds(new Set()); setBulkFailures([]); }}
                >
                  Deselect all
                </button>
              </div>

              {/* Quick-action one-click status buttons */}
              <div className="admin-maintenance__bulk-quick">
                {[
                  { status: "viewed", label: "Mark Viewed" },
                  { status: "in_progress", label: "Start Work" },
                  { status: "waiting_tenant", label: "Waiting" },
                  { status: "resolved", label: "Resolve" },
                  { status: "completed", label: "Complete" },
                  { status: "rejected", label: "Reject" },
                ].map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    className={`admin-maintenance__bulk-quick-btn admin-maintenance__bulk-quick-btn--${action.status}`}
                    onClick={() => handleBulkUpdate(action.status)}
                    disabled={bulkUpdateMutation.isPending}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Custom status / assign / notes for non-quick updates */}
              <div className="admin-maintenance__bulk-grid">
                <label className="admin-maintenance__field">
                  <span>Custom Status</span>
                  <select
                    value={bulkStatus}
                    onChange={(event) => setBulkStatus(event.target.value)}
                    disabled={bulkUpdateMutation.isPending}
                  >
                    <option value="">No change</option>
                    {ADMIN_MAINTENANCE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatMaintenanceStatus(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-maintenance__field">
                  <span>Assign To</span>
                  <input
                    type="text"
                    placeholder="Staff member or team"
                    value={bulkAssignedTo}
                    onChange={(event) => setBulkAssignedTo(event.target.value)}
                    disabled={bulkUpdateMutation.isPending}
                  />
                </label>
                <label className="admin-maintenance__field admin-maintenance__field--bulk-notes">
                  <span>Admin Response</span>
                  <textarea
                    rows="2"
                    placeholder="Optional note for all selected requests"
                    value={bulkNotes}
                    onChange={(event) => setBulkNotes(event.target.value)}
                    disabled={bulkUpdateMutation.isPending}
                  />
                </label>
              </div>
              <div className="admin-maintenance__bulk-actions">
                <button
                  type="button"
                  className="admin-maintenance__primary-btn"
                  onClick={() => handleBulkUpdate()}
                  disabled={bulkUpdateMutation.isPending || !bulkStatus}
                  title={bulkStatus ? undefined : "Select a status to apply"}
                >
                  {bulkUpdateMutation.isPending
                    ? "Applying…"
                    : `Apply to ${selectedRequestIds.size} request${selectedRequestIds.size > 1 ? "s" : ""}`}
                </button>
              </div>

              {/* Failure detail panel — shows which IDs failed and why */}
              {bulkFailures.length > 0 && (
                <div className="admin-maintenance__bulk-failures">
                  <strong>{bulkFailures.length} request{bulkFailures.length > 1 ? "s" : ""} could not be updated:</strong>
                  <ul>
                    {bulkFailures.map((f) => (
                      <li key={f.requestId}>
                        <code>{f.requestId}</code>
                        {f.error ? ` — ${f.error}` : ""}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="admin-maintenance__bulk-clear"
                    onClick={() => setBulkFailures([])}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </section>
          )}
        </PageShell.Actions>

        <PageShell.Content>
          <DataTable
            columns={columns}
            data={filteredRequests}
            loading={isLoading}
            exportable={true}
            exportFilename="Maintenance_Requests"
            exportTitle="Maintenance Requests Export"
            selectable
            selectedIds={selectedRequestIds}
            getRowId={(row) => row.request_id}
            onSelectionChange={setSelectedRequestIds}
            onRowClick={(row) => setSelectedRequestId(row.request_id)}
            pagination={{
              page: currentPage,
              pageSize: ITEMS_PER_PAGE,
              total: filteredRequests.length,
              onPageChange: setCurrentPage,
            }}
            emptyState={
              isError
                ? {
                    icon: AlertTriangle,
                    title: "Unable to load maintenance requests",
                    description:
                      error?.message ||
                      "The maintenance workspace could not be loaded.",
                  }
                : {
                    icon: Wrench,
                    title: "No maintenance requests found",
                    description:
                      "Adjust filters or search terms, or wait for new tenant requests.",
                  }
            }
          />

        <DetailDrawer
          open={Boolean(selectedRequestId)}
          onClose={() => setSelectedRequestId(null)}
          title="Maintenance Request"
          footer={
            selectedRequest ? (
              <div className="admin-maintenance__drawer-footer">
                <button
                  type="button"
                  className="admin-maintenance__secondary-btn"
                  onClick={() => setSelectedRequestId(null)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  form="maintenance-admin-form"
                  className="admin-maintenance__primary-btn"
                  disabled={
                    updateRequestMutation.isPending ||
                    selectedRequestIsTerminal ||
                    !hasAdminDraftChanges ||
                    hasUpdateValidationErrors
                  }
                  title={
                    !hasAdminDraftChanges && !selectedRequestIsTerminal
                      ? "No changes to save."
                      : undefined
                  }
                >
                  {updateRequestMutation.isPending ? "Saving..." : "Save Update"}
                </button>
              </div>
            ) : null
          }
        >
          {isDetailLoading || !selectedRequest ? (
            <div className="admin-maintenance__drawer-loading">
              <Loader2 size={18} className="admin-maintenance__spin" />
              Loading request details...
            </div>
          ) : (
            <>
              <DetailDrawer.Section label="Request Overview">
                <DetailDrawer.Row label="Tenant">
                  <span className="admin-maintenance__drawer-person">
                    <UserRound size={14} />
                    <span>{selectedRequest.tenant?.full_name || "Unknown Tenant"}</span>
                  </span>
                </DetailDrawer.Row>
                <DetailDrawer.Row
                  label="User ID"
                  value={selectedRequest.tenant?.user_id || selectedRequest.user_id}
                />
                <DetailDrawer.Row
                  label="Branch"
                  value={selectedRequest.tenant?.branch || selectedRequest.branch || "-"}
                />
                <DetailDrawer.Row label="Request Type">
                  {getMaintenanceTypeMeta(selectedRequest.request_type).label}
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Urgency">
                  <span
                    className="admin-maintenance__urgency-pill"
                    style={{
                      backgroundColor: `${getMaintenanceUrgencyMeta(selectedRequest.urgency).color}1A`,
                      color: getMaintenanceUrgencyMeta(selectedRequest.urgency).color,
                    }}
                  >
                    {getMaintenanceUrgencyMeta(selectedRequest.urgency).label}
                  </span>
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Status">
                  <StatusBadge status={selectedRequest.status} />
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Created At" value={fmtDateTime(selectedRequest.created_at)} />
                <DetailDrawer.Row label="Updated At" value={fmtDateTime(selectedRequest.updated_at)} />
                <DetailDrawer.Row label="SLA">
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 999,
                      background: getSlaTone(selectedRequest.slaState).bg,
                      color: getSlaTone(selectedRequest.slaState).color,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {formatSlaState(selectedRequest.slaState)}
                  </span>
                </DetailDrawer.Row>
                <DetailDrawer.Row
                  label="Target Resolution"
                  value={
                    selectedRequest.slaState?.targetAt
                      ? fmtDateTime(selectedRequest.slaState.targetAt)
                      : "Not set"
                  }
                />
                <DetailDrawer.Row
                  label="Assigned At"
                  value={
                    selectedRequest.assignment?.assignedAt
                      ? fmtDateTime(selectedRequest.assignment.assignedAt)
                      : "Not assigned"
                  }
                />
                <DetailDrawer.Row
                  label="Started At"
                  value={
                    selectedRequest.assignment?.startedAt
                      ? fmtDateTime(selectedRequest.assignment.startedAt)
                      : "Not started"
                  }
                />
                <DetailDrawer.Row
                  label="Resolved At"
                  value={
                    selectedRequest.assignment?.resolvedAt
                      ? fmtDateTime(selectedRequest.assignment.resolvedAt)
                      : "Not resolved"
                  }
                />
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Issue Details">
                <div className="admin-maintenance__description-panel">
                  {selectedRequest.description}
                </div>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Attachments">
                {selectedRequest.attachments?.length ? (
                  <div className="admin-maintenance__attachments">
                    {selectedRequest.attachments.map((attachment, index) => (
                      <a
                        key={`${attachment.name}-${index}`}
                        href={attachment.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-maintenance__attachment"
                      >
                        <img
                          src={attachment.uri}
                          alt={attachment.name || `Attachment ${index + 1}`}
                        />
                        <span>{attachment.name || `Attachment ${index + 1}`}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="admin-maintenance__empty-inline">
                    <ImageIcon size={16} />
                    No attachments uploaded.
                  </div>
                )}
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Reopen History">
                {selectedRequest.reopen_history?.length ? (
                  <div className="admin-maintenance__history-list">
                    {selectedRequest.reopen_history.map((entry, index) => (
                      <article
                        key={`${entry.reopened_at}-${index}`}
                        className="admin-maintenance__history-item"
                      >
                        <strong>{fmtDateTime(entry.reopened_at)}</strong>
                        <span>
                          Reopened from {formatMaintenanceStatus(entry.previous_status)}
                        </span>
                        <p>{entry.note || "No reopen note provided."}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-maintenance__empty-inline">
                    <RefreshCcw size={16} />
                    This request has not been reopened.
                  </div>
                )}
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Status Timeline">
                {selectedRequest.statusHistory?.length ? (
                  <div className="admin-maintenance__history-list">
                    {selectedRequest.statusHistory.map((entry, index) => (
                      <article
                        key={`${entry.timestamp}-${entry.status}-${index}`}
                        className="admin-maintenance__history-item"
                      >
                        <strong>{fmtDateTime(entry.timestamp)}</strong>
                        <span>
                          {formatMaintenanceStatus(entry.status)}
                          {entry.actor_name ? ` • ${entry.actor_name}` : ""}
                        </span>
                        <p>{entry.note || entry.event || "Status updated."}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-maintenance__empty-inline">
                    <Clock3 size={16} />
                    No timeline entries recorded yet.
                  </div>
                )}
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Work Log">
                {selectedRequest.workLog?.length ? (
                  <div className="admin-maintenance__history-list">
                    {selectedRequest.workLog.map((entry, index) => (
                      <article
                        key={`${entry.logged_at}-${index}`}
                        className="admin-maintenance__history-item"
                      >
                        <strong>{fmtDateTime(entry.logged_at)}</strong>
                        <span>{entry.actor_name || "Staff update"}</span>
                        <p>{entry.note}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-maintenance__empty-inline">
                    <ClipboardList size={16} />
                    No work log entries yet.
                  </div>
                )}
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Admin Response">
                {selectedRequestIsTerminal ? (
                  <div className="admin-maintenance__callout">
                    This request is in a terminal state. Admin notes,
                    assignments, work logs, and status changes are disabled.
                  </div>
                ) : (
                  <>
                    <div className="admin-maintenance__quick-actions">
                      {QUICK_STATUS_ACTIONS.map((action) => {
                        const allowed = allowedDraftStatuses.includes(action.status);
                        const isLoadingAction =
                          updateRequestMutation.isPending &&
                          quickActionStatus === action.status;

                        return (
                          <button
                            key={action.status}
                            type="button"
                            className="admin-maintenance__secondary-btn"
                            disabled={
                              !allowed ||
                              updateRequestMutation.isPending ||
                              selectedRequestIsTerminal
                            }
                            onClick={() => handleQuickStatusAction(action.status)}
                          >
                            {isLoadingAction ? "Working..." : action.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="admin-maintenance__templates">
                      {ADMIN_RESPONSE_TEMPLATES.map((template) => (
                        <button
                          key={template}
                          type="button"
                          className="admin-maintenance__template-btn"
                          onClick={() => applyResponseTemplate(template)}
                        >
                          {template}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <form
                  id="maintenance-admin-form"
                  className="admin-maintenance__form"
                  onSubmit={handleSubmitUpdate}
                >
                  <label className="admin-maintenance__field">
                    <span>Next Status</span>
                    <select
                      value={draftStatus}
                      onChange={(event) => setDraftStatus(event.target.value)}
                      disabled={selectedRequestIsTerminal}
                    >
                      {allowedDraftStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatMaintenanceStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-maintenance__field">
                    <span>Assign To</span>
                    <input
                      type="text"
                      placeholder="Staff member or team"
                      value={draftAssignedTo}
                      onChange={(event) => setDraftAssignedTo(event.target.value)}
                      onBlur={() => setDraftAssignedTo((current) => current.trim())}
                      disabled={selectedRequestIsTerminal}
                    />
                  </label>

                  <label className="admin-maintenance__field">
                    <span>Admin Response</span>
                    <textarea
                      rows="6"
                      placeholder="This note is shown to the tenant in the mobile app."
                      value={draftNotes}
                      onChange={(event) => setDraftNotes(event.target.value)}
                      disabled={selectedRequestIsTerminal}
                    />
                    {updateValidationErrors.notes ? (
                      <p className="admin-maintenance__field-error">
                        {updateValidationErrors.notes}
                      </p>
                    ) : null}
                  </label>

                  <label className="admin-maintenance__field">
                    <span>Work Log Note</span>
                    <textarea
                      rows="3"
                      placeholder="Optional internal progress note for the status timeline and work log."
                      value={draftWorkLogNote}
                      onChange={(event) => setDraftWorkLogNote(event.target.value)}
                      disabled={selectedRequestIsTerminal}
                    />
                    {updateValidationErrors.resolution ? (
                      <p className="admin-maintenance__field-error">
                        {updateValidationErrors.resolution}
                      </p>
                    ) : null}
                  </label>
                  {!selectedRequestIsTerminal && !hasAdminDraftChanges ? (
                    <p className="admin-maintenance__helper-text">
                      No changes to save.
                    </p>
                  ) : null}
                </form>
              </DetailDrawer.Section>
            </>
          )}
        </DetailDrawer>
        </PageShell.Content>
      </PageShell>
    </div>
  );
}
