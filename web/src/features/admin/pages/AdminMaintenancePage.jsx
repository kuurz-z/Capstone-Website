import { useEffect, useMemo, useState } from "react";
import {
 AlertTriangle,
 CheckCircle2,
 ClipboardList,
 Clock3,
 FileDown,
 Filter,
 Image as ImageIcon,
 Loader2,
 MessageSquare,
 RefreshCcw,
 Search,
 UserRound,
 Wrench,
 XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
 useAdminMaintenanceRequests,
 useMaintenanceRequest,
 useUpdateMaintenanceRequest,
} from "../../../shared/hooks/queries/useMaintenance";
import { showNotification } from "../../../shared/utils/notification";
import {
 ADMIN_MAINTENANCE_STATUS_OPTIONS,
 MAINTENANCE_REQUEST_TYPES,
 MAINTENANCE_URGENCY_LEVELS,
 formatMaintenanceStatus,
 getMaintenanceTypeMeta,
 getMaintenanceUrgencyMeta,
} from "../../../shared/utils/maintenanceConfig";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import { BRANCH_OPTIONS, BRANCH_DISPLAY_NAMES } from "../../../shared/utils/constants";
import {
 normalizeBranchFilterValue,
 syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import {
 DataTable,
 DetailDrawer,
 PageShell,
 StatusBadge,
 SummaryBar,
} from "../components/shared";

const ITEMS_PER_PAGE = 10;

const fmtDate = (value) => {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "Unknown date";
 return date.toLocaleDateString("en-PH", {
 year: "numeric",
 month: "short",
 day: "numeric",
 });
};

const fmtDateTime = (value) => {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "Unknown date";
 return date.toLocaleString("en-PH", {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
};

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
 { key: "resolved", label: "Resolved", icon: CheckCircle2, color: "green" },
 { key: "completed", label: "Completed", icon: CheckCircle2, color: "green" },
 { key: "rejected", label: "Rejected", icon: XCircle, color: "red" },
 { key: "cancelled", label: "Cancelled", icon: AlertTriangle, color: "neutral" },
];

const getStatusDotClass = (status) => {
 switch (status) {
 case "pending":
 return "bg-amber-300";
 case "viewed":
 return "bg-amber-300";
 case "in_progress":
 return "bg-blue-500";
 case "resolved":
 case "completed":
 return "bg-emerald-500";
 case "rejected":
 return "bg-rose-500";
 case "cancelled":
 return "bg-slate-400";
 default:
 return "bg-slate-400";
 }
};

const getStatusTextClass = (status) => {
 switch (status) {
 case "pending":
 case "viewed":
 return "text-warning-dark";
 case "in_progress":
 return "text-blue-600";
 case "resolved":
 case "completed":
 return "text-emerald-600";
 case "rejected":
 return "text-error-dark";
 case "cancelled":
 return "text-muted-foreground";
 default:
 return "text-muted-foreground";
 }
};

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
 const [currentPage, setCurrentPage] = useState(1);
 const [selectedRequestId, setSelectedRequestId] = useState(null);
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
 } = useAdminMaintenanceRequests(listFilters);
 const { data: summaryData } = useAdminMaintenanceRequests(summaryFilters);
 const {
 data: requestDetailData,
 isLoading: isDetailLoading,
 } = useMaintenanceRequest(selectedRequestId);
 const updateRequestMutation = useUpdateMaintenanceRequest();

 const requests = requestsData?.requests || [];
 const summaryRequests = summaryData?.requests || requests;
 const selectedRequest = requestDetailData?.request || null;

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
 ]
 .filter(Boolean)
 .join(" ")
 .toLowerCase();

 return haystack.includes(query);
 });
 }, [searchQuery, sortedRequests]);

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
 sortMode,
 statusFilter,
 urgencyFilter,
 ]);

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

 const initialStatus = ADMIN_MAINTENANCE_STATUS_OPTIONS.includes(selectedRequest.status)
 ? selectedRequest.status
 : "viewed";

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

 try {
 await updateRequestMutation.mutateAsync({
 requestId: selectedRequest.request_id,
 payload: {
 status: draftStatus,
 notes: draftNotes,
 assigned_to: draftAssignedTo,
 work_log_note: draftWorkLogNote,
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

 const columns = useMemo(
 () => [
 {
 key: "tenant",
 label: "Tenant",
 render: (row) => (
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-xs font-semibold text-warning-dark">
 {(row.tenant?.full_name || "T")
 .split(/\s+/)
 .filter(Boolean)
 .slice(0, 2)
 .map((part) => part[0])
 .join("")
 .toUpperCase()}
 </div>
 <div>
 <div className="text-sm font-semibold text-card-foreground">
 {row.tenant?.full_name || "Unknown Tenant"}
 </div>
 <div className="text-xs text-muted-foreground">
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
 <div className="flex items-center gap-3">
 <span
 className="flex h-9 w-9 items-center justify-center rounded-lg"
 style={{
 backgroundColor: `${typeMeta.color}1A`,
 color: typeMeta.color,
 }}
 >
 <TypeIcon size={16} />
 </span>
 <div>
 <div className="text-sm font-semibold text-card-foreground">{typeMeta.label}</div>
 <div className="text-xs text-muted-foreground">
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
 <div>
 <div className="max-w-[240px] truncate text-sm text-muted-foreground">
 {row.description}
 </div>
 <div className="text-xs text-muted-foreground">{row.request_id}</div>
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
 className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
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
 <div className="flex flex-col gap-2">
 <div className={`flex items-center gap-2 text-[13px] font-medium ${getStatusTextClass(row.status)}`}>
 <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(row.status)}`} />
 <span>{formatMaintenanceStatus(row.status)}</span>
 </div>
 {row.slaState ? (
 <span
 className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
 style={{
 background: getSlaTone(row.slaState).bg,
 color: getSlaTone(row.slaState).color,
 }}
 >
 {formatSlaState(row.slaState)}
 </span>
 ) : null}
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
 <div className="bg-card">
 <PageShell>
 <PageShell.Summary>
 <div>
 <div className="mb-4">
 <h1 className="mb-1 text-2xl font-semibold text-foreground">Maintenance</h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Manage tenant repair requests, assign work, and keep the tenant-visible
 pattern responsive up to date
 </p>
 </div>
 <SummaryBar
 items={summaryItems}
 activeIndex={activeSummaryIndex === -1 ? 0 : activeSummaryIndex}
 onItemClick={(index) => handleSummaryFilter(index)}
 />
 </div>
 </PageShell.Summary>

 <PageShell.Actions>
 <section className="mt-5 rounded-xl border border-border bg-card px-5 py-5">
 <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 Find requests quickly
 </h2>

 <div className="mt-4 flex flex-wrap items-center gap-3">
 <label className="relative min-w-[220px] flex-1">
 <span className="sr-only">Search</span>
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <input
 type="search"
 placeholder="Search tenant, ID, assignment, or description"
 value={searchQuery}
 onChange={(event) => setSearchQuery(event.target.value)}
 className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 />
 </label>

 <label className="min-w-[170px] flex-1">
 <span className="sr-only">Status</span>
 <select
 value={statusFilter}
 onChange={(event) => setStatusFilter(event.target.value)}
 className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 >
 <option value="all">All statuses</option>
 {SUMMARY_STATUSES.filter((item) => item.key !== "all").map((item) => (
 <option key={item.key} value={item.key}>
 {item.label}
 </option>
 ))}
 </select>
 </label>

 <label className="min-w-[180px] flex-1">
 <span className="sr-only">Request Type</span>
 <select
 value={requestTypeFilter}
 onChange={(event) => setRequestTypeFilter(event.target.value)}
 className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 >
 <option value="all">All request types</option>
 {MAINTENANCE_REQUEST_TYPES.map((requestType) => (
 <option key={requestType} value={requestType}>
 {getMaintenanceTypeMeta(requestType).label}
 </option>
 ))}
 </select>
 </label>

 <label className="min-w-[170px] flex-1">
 <span className="sr-only">Urgency</span>
 <select
 value={urgencyFilter}
 onChange={(event) => setUrgencyFilter(event.target.value)}
 className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 >
 <option value="all">All urgency levels</option>
 {MAINTENANCE_URGENCY_LEVELS.map((urgency) => (
 <option key={urgency} value={urgency}>
 {getMaintenanceUrgencyMeta(urgency).label}
 </option>
 ))}
 </select>
 </label>

 {isOwner ? (
 <label className="min-w-[160px] flex-1">
 <span className="sr-only">Branch</span>
 <select
 value={branchFilter}
 onChange={(event) => setBranchFilter(event.target.value)}
 className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
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

 <button
 type="button"
 className="inline-flex h-9 min-w-[140px] items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-card-foreground hover:bg-muted"
 onClick={handleExport}
 disabled={filteredRequests.length === 0}
 >
 <FileDown size={14} />
 Export CSV
 </button>
 </div>

 <div className="mt-3 flex flex-wrap items-center gap-3">
 <label className="min-w-[170px]">
 <span className="sr-only">Date From</span>
 <input
 type="date"
 value={dateFrom}
 onChange={(event) => setDateFrom(event.target.value)}
 className="h-8 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 />
 </label>

 <label className="min-w-[170px]">
 <span className="sr-only">Date To</span>
 <input
 type="date"
 value={dateTo}
 onChange={(event) => setDateTo(event.target.value)}
 className="h-8 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 />
 </label>

 <label className="min-w-[180px]">
 <span className="sr-only">Sort By</span>
 <select
 value={sortMode}
 onChange={(event) => setSortMode(event.target.value)}
 className="h-8 w-full rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-slate-100"
 >
 <option value="newest">Newest first</option>
 <option value="urgency">Urgency high first</option>
 </select>
 </label>

 <button
 type="button"
 className="text-sm font-medium text-muted-foreground hover:text-card-foreground"
 onClick={handleResetFilters}
 >
 Reset Filters
 </button>
 </div>

 <div className="mt-4 text-sm text-muted-foreground">
 Showing {filteredRequests.length} of {summaryRequests.length} requests
 </div>

 {activeFilterChips.length ? (
 <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
 {activeFilterChips.map((chip) => (
 <span
 key={chip.key}
 className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
 >
 {chip.label}
 </span>
 ))}
 </div>
 ) : null}

 <div className="mt-4 border-t border-border pt-4">
 <div className="overflow-hidden rounded-lg border border-border">
 <DataTable
 columns={columns}
 data={filteredRequests}
 loading={isLoading}
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
 </div>
 </div>
 </section>
 </PageShell.Actions>

 <PageShell.Content>
 <DetailDrawer
 width={1200}
 open={Boolean(selectedRequestId)}
 onClose={() => setSelectedRequestId(null)}
 title="Maintenance Request"
 subtitle={selectedRequest ? `Request #${selectedRequest.request_id}` : ""}
 footer={
 selectedRequest ? (
 <div className="flex items-center justify-between gap-3">
 <button
 type="button"
 className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium text-muted-foreground hover:bg-muted"
 onClick={() => setSelectedRequestId(null)}
 >
 Close
 </button>
 <button
 type="submit"
 form="maintenance-admin-form"
 className="inline-flex h-10 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-sm hover:opacity-90"
 style={{
   backgroundColor: "var(--primary)",
   color: "var(--primary-foreground)",
 }}
 disabled={
 updateRequestMutation.isPending ||
 selectedRequest.status === "cancelled"
 }
 >
 {updateRequestMutation.isPending ? "Saving..." : "Save Update"}
 </button>
 </div>
 ) : null
 }
 >
 {isDetailLoading || !selectedRequest ? (
 <div className="flex items-center gap-2 px-6 py-6 text-sm text-muted-foreground">
 <Loader2 size={18} className="animate-spin" />
 Loading request details...
 </div>
 ) : (
 <div>
 <div className="grid gap-6 lg:grid-cols-3">
 <div className="space-y-6 lg:col-span-2">
 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <ClipboardList size={14} />
 Request Overview
 </>
 )}
 >
 <DetailDrawer.Row label="Tenant">
 <span className="flex items-center gap-2 text-sm font-medium text-card-foreground">
 <UserRound size={14} className="text-muted-foreground" />
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
 className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
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
 </div>

 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <AlertTriangle size={14} />
 Issue Details
 </>
 )}
 >
 <div className="text-sm text-card-foreground">{selectedRequest.description}</div>
 </DetailDrawer.Section>
 </div>

 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <ImageIcon size={14} />
 Attachments
 </>
 )}
 >
 {selectedRequest.attachments?.length ? (
 <div className="grid gap-3 md:grid-cols-2">
 {selectedRequest.attachments.map((attachment, index) => (
 <a
 key={`${attachment.name}-${index}`}
 href={attachment.uri}
 target="_blank"
 rel="noreferrer"
 className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted"
 >
 <img
 src={attachment.uri}
 alt={attachment.name || `Attachment ${index + 1}`}
 className="h-12 w-12 rounded-md object-cover"
 />
 <span className="text-sm font-medium text-card-foreground">
 {attachment.name || `Attachment ${index + 1}`}
 </span>
 </a>
 ))}
 </div>
 ) : (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <ImageIcon size={16} />
 No attachments uploaded.
 </div>
 )}
 </DetailDrawer.Section>
 </div>

 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <RefreshCcw size={14} />
 Reopen History
 </>
 )}
 >
 {selectedRequest.reopen_history?.length ? (
 <div className="space-y-3">
 {selectedRequest.reopen_history.map((entry, index) => (
 <article
 key={`${entry.reopened_at}-${index}`}
 className="rounded-lg border border-border bg-card p-3"
 >
 <strong className="block text-xs font-semibold text-card-foreground">
 {fmtDateTime(entry.reopened_at)}
 </strong>
 <span className="text-xs text-muted-foreground">
 Reopened from {formatMaintenanceStatus(entry.previous_status)}
 </span>
 <p className="mt-2 text-sm text-muted-foreground">
 {entry.note || "No reopen note provided."}
 </p>
 </article>
 ))}
 </div>
 ) : (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <RefreshCcw size={16} />
 This request has not been reopened.
 </div>
 )}
 </DetailDrawer.Section>
 </div>
 </div>

 <div className="space-y-6">
 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <Clock3 size={14} />
 Status Timeline
 </>
 )}
 >
 {selectedRequest.statusHistory?.length ? (
 <div className="space-y-3">
 {selectedRequest.statusHistory.map((entry, index) => (
 <article
 key={`${entry.timestamp}-${entry.status}-${index}`}
 className="rounded-lg border border-border bg-card p-3"
 >
 <strong className="block text-xs font-semibold text-card-foreground">
 {fmtDateTime(entry.timestamp)}
 </strong>
 <span className="text-xs text-muted-foreground">
 {formatMaintenanceStatus(entry.status)}
 {entry.actor_name ? ` • ${entry.actor_name}` : ""}
 </span>
 <p className="mt-2 text-sm text-muted-foreground">
 {entry.note || entry.event || "Status updated."}
 </p>
 </article>
 ))}
 </div>
 ) : (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Clock3 size={16} />
 No timeline entries recorded yet.
 </div>
 )}
 </DetailDrawer.Section>
 </div>

 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <ClipboardList size={14} />
 Work Log
 </>
 )}
 >
 {selectedRequest.workLog?.length ? (
 <div className="space-y-3">
 {selectedRequest.workLog.map((entry, index) => (
 <article
 key={`${entry.logged_at}-${index}`}
 className="rounded-lg border border-border bg-card p-3"
 >
 <strong className="block text-xs font-semibold text-card-foreground">
 {fmtDateTime(entry.logged_at)}
 </strong>
 <span className="text-xs text-muted-foreground">
 {entry.actor_name || "Staff update"}
 </span>
 <p className="mt-2 text-sm text-muted-foreground">{entry.note}</p>
 </article>
 ))}
 </div>
 ) : (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <ClipboardList size={16} />
 No work log entries yet.
 </div>
 )}
 </DetailDrawer.Section>
 </div>

 <div className="rounded-xl border border-border bg-card p-5">
 <DetailDrawer.Section
 label={(
 <>
 <MessageSquare size={14} />
 Admin Response
 </>
 )}
 >
 {selectedRequest.status === "cancelled" ? (
 <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-warning-dark">
 Cancelled requests are tenant-only terminal records. Admin notes,
 assignments, and status changes are disabled.
 </div>
 ) : null}

 <form
 id="maintenance-admin-form"
 className="mt-4 space-y-4"
 onSubmit={handleSubmitUpdate}
 >
 <label className="block">
 <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
 Status
 </span>
 <select
 value={draftStatus}
 onChange={(event) => setDraftStatus(event.target.value)}
 disabled={selectedRequest.status === "cancelled"}
 className="mt-2 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-card-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-border"
 >
 {ADMIN_MAINTENANCE_STATUS_OPTIONS.map((status) => (
 <option key={status} value={status}>
 {formatMaintenanceStatus(status)}
 </option>
 ))}
 </select>
 </label>

 <label className="block">
 <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
 Assign To
 </span>
 <input
 type="text"
 placeholder="Staff member or team"
 value={draftAssignedTo}
 onChange={(event) => setDraftAssignedTo(event.target.value)}
 disabled={selectedRequest.status === "cancelled"}
 className="mt-2 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-border"
 />
 </label>

 <label className="block">
 <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
 Admin Response
 </span>
 <textarea
 rows="6"
 placeholder="This note is shown to the tenant in the mobile app."
 value={draftNotes}
 onChange={(event) => setDraftNotes(event.target.value)}
 disabled={selectedRequest.status === "cancelled"}
 className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-border"
 />
 </label>

 <label className="block">
 <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
 Work Log Note
 </span>
 <textarea
 rows="3"
 placeholder="Optional internal progress note for the status timeline and work log."
 value={draftWorkLogNote}
 onChange={(event) => setDraftWorkLogNote(event.target.value)}
 disabled={selectedRequest.status === "cancelled"}
 className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-border"
 />
 </label>
 </form>
 </DetailDrawer.Section>
 </div>
 </div>
 </div>
 </div>
 )}
 </DetailDrawer>
 </PageShell.Content>
 </PageShell>
 </div>
 );
}
