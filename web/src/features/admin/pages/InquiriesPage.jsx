import { useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  MessageSquare,
  Search,
  User,
  Mail,
  MapPin,
  Phone,
  FileText,
  Calendar,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  Clock,
  X as XIcon,
  ArrowLeft,
} from "lucide-react";
import PageShell from "../components/shared/PageShell";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import { useAuth } from "../../../shared/hooks/useAuth";
import { ListSkeleton, StatGridSkeleton } from "../../../shared/components/LoadingSkeletons";
import { AdminTablePageSkeleton } from "../components/AdminContentSkeletons";
import Pagination from "../../../shared/components/Pagination";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import ProfileAvatar from "../../../shared/components/ProfileAvatar";
import { ExportButtons } from "./analyticsTabShared";
import {
  handleExportInquiriesCSV,
  handleExportInquiriesPDF,
} from "../utils/inquiryExportUtils";

const getAvatarColor = (initials = "") => {
  const colors = [
    "bg-[color:var(--chart-5)] text-white",
    "bg-[color:var(--chart-1)] text-white",
    "bg-[color:var(--chart-4)] text-white",
    "bg-[color:var(--danger)] text-white",
    "bg-[color:var(--chart-2)] text-white",
    "bg-[color:var(--warning)] text-white",
  ];
  const charCode = (initials.charCodeAt(0) || 0) + (initials.charCodeAt(1) || 0);
  return colors[charCode % colors.length];
};

function initial(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const KPI_ICON_COLORS = {
  sky: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  slate: "text-slate-500 dark:text-slate-400",
};

function InquiriesPage({ isEmbedded = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const showBackToDashboard = !isEmbedded && Boolean(
    location.state?.fromDashboard || window.history.state?.idx > 0
  );
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Branch admins are scoped to their branch — owners can filter across all branches
  const [branchFilter, setBranchFilter] = useState(isOwner ? "" : (user?.branch || ""));
  const activeBranchDisplay = isOwner ? branchFilter : null;
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const {
    data,
    isLoading: loading,
    refetch,
  } = useInquiries({
    page,
    limit,
    search: searchTerm,
    status: statusFilter,
    branch: branchFilter,
    sortBy,
  });

  const {
    data: statsData,
    isLoading: statsLoading,
  } = useInquiryStats(
    branchFilter ? { branch: branchFilter } : {},
    { refetchInterval: 5000, refetchOnWindowFocus: true }
  );

  const inquiries = Array.isArray(data) ? data : (data?.inquiries || []);
  const total = data?.pagination?.totalItems ?? data?.total ?? inquiries.length;
  const totalPages = data?.pagination?.totalPages ?? (Math.ceil(total / limit) || 1);

  const pendingCount = (statsData?.byStatus?.pending || 0) + (statsData?.byStatus?.new || 0);
  const resolvedCount = (statsData?.byStatus?.resolved || 0) + (statsData?.byStatus?.["in-progress"] || 0);
  const totalCount = statsData?.total ?? total;
  const recentCount = statsData?.recentCount ?? 0;

  const kpiItems = useMemo(
    () => [
      {
        key: "total",
        label: "Total Inquiries",
        value: totalCount,
        icon: MessageSquare,
        color: "sky",
        subtext: "Total lead volume",
      },
      {
        key: "pending",
        label: "New / Pending",
        value: pendingCount,
        icon: Clock,
        color: "amber",
        subtext: "Awaiting staff response",
      },
      {
        key: "resolved",
        label: "Responded",
        value: resolvedCount,
        icon: CheckCircle2,
        color: "emerald",
        subtext: "Answered & resolved",
      },
      {
        key: "recent",
        label: "Recent (7 Days)",
        value: recentCount,
        icon: Calendar,
        color: "slate",
        subtext: "Received this week",
      },
    ],
    [totalCount, pendingCount, resolvedCount, recentCount],
  );

  const handleExportCSV = useCallback(() => {
    handleExportInquiriesCSV({
      inquiries,
      branchFilter: branchFilter || "all",
    });
  }, [inquiries, branchFilter]);

  const handleExportPDF = useCallback(async () => {
    try {
      await handleExportInquiriesPDF({
        inquiries,
        counts: {
          total: totalCount,
          pending: pendingCount,
          resolved: resolvedCount,
          recent: recentCount,
        },
        branchFilter: branchFilter || "all",
        statusFilter,
        searchTerm,
      });
    } catch (error) {
      console.error("[InquiriesExport] PDF generation failed:", error);
    }
  }, [inquiries, totalCount, pendingCount, resolvedCount, recentCount, branchFilter, statusFilter, searchTerm]);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/admin/dashboard");
    }
  };

  if (!isEmbedded && user && !isOwner) {
    return <Navigate to="/admin/reservations?tab=inquiries" replace />;
  }

  if (!isEmbedded && loading && !data) {
    return <AdminTablePageSkeleton />;
  }

  return (
    <PageShell>
      <PageShell.Content>
        {/* Pattern 1 Sticky Sub-Header */}
        {!isEmbedded && (
          <AdminPageHeader
            title="Inquiries"
            subtitle="Review, filter, and respond to applicant and tenant inquiries across acquisition channels."
            actions={
              showBackToDashboard ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-card-foreground shadow-xs transition-all hover:bg-muted hover:text-foreground cursor-pointer"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Dashboard</span>
                </button>
              ) : null
            }
          />
        )}

        {/* Informational KPI Summary Cards Grid */}
        {statsLoading && !statsData ? (
          <StatGridSkeleton count={4} className="mb-4" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" role="region" aria-label="Inquiry Statistics">
            {kpiItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.key}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-light)",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                  }}
                  className="relative flex flex-col justify-between min-h-[108px] rounded-xl border p-4 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default select-none"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                      {item.label}
                    </span>
                    <div
                      className={`flex shrink-0 items-center justify-center ${
                        KPI_ICON_COLORS[item.color] || KPI_ICON_COLORS.slate
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold tracking-tight text-foreground leading-none tabular-nums">
                      {item.value}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium truncate ml-2">
                      {item.subtext}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dedicated Separate Filter Toolbar */}
        <div
          className="border rounded-lg p-4 sm:p-5 mb-6 overflow-visible"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-light)",
          }}
        >
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search inquiries by name, email, subject..."
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="w-full pl-10 pr-8 h-9 border rounded-lg text-xs focus:outline-none focus:border-[var(--primary)] focus:ring-0 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:justify-start lg:justify-end">
              {isOwner && (
                <select
                  value={branchFilter}
                  onChange={(event) => {
                    setBranchFilter(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by branch"
                  style={{
                    backgroundColor: "var(--input-background)",
                    borderColor: "var(--border-light)",
                  }}
                  className="h-9 px-3 border rounded-lg text-xs font-medium focus:outline-none focus:border-[var(--primary)] focus:ring-0 cursor-pointer hover:bg-muted transition-colors"
                >
                  <option value="">All Branches</option>
                  <option value="gil-puyat">Gil Puyat</option>
                  <option value="guadalupe">Guadalupe</option>
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter by status"
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="h-9 px-3 border rounded-lg text-xs font-medium focus:outline-none focus:border-[var(--primary)] focus:ring-0 cursor-pointer hover:bg-muted transition-colors"
              >
                <option value="">All Statuses</option>
                <option value="pending">New / Pending</option>
                <option value="resolved">Responded</option>
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sort inquiries"
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="h-9 px-3 border rounded-lg text-xs font-medium focus:outline-none focus:border-[var(--primary)] focus:ring-0 cursor-pointer hover:bg-muted transition-colors"
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="name-az">Name A-Z</option>
                <option value="name-za">Name Z-A</option>
              </select>

              <ExportButtons
                onCsv={handleExportCSV}
                onPdf={handleExportPDF}
                disabled={inquiries.length === 0}
              />
            </div>
          </div>

          {(activeBranchDisplay || statusFilter || searchTerm) && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[var(--border-light)] text-xs">
              <span className="text-muted-foreground font-medium">Active Filters:</span>
              {activeBranchDisplay && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                  Branch: {activeBranchDisplay === "gil-puyat" ? "Gil Puyat" : activeBranchDisplay === "guadalupe" ? "Guadalupe" : activeBranchDisplay}
                  <button
                    type="button"
                    onClick={() => {
                      setBranchFilter("");
                      setPage(1);
                    }}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 focus:outline-none cursor-pointer"
                    aria-label="Clear branch filter"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                  Status: {statusFilter === "pending" ? "New / Pending" : statusFilter === "resolved" ? "Responded" : statusFilter}
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("");
                      setPage(1);
                    }}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 focus:outline-none cursor-pointer"
                    aria-label="Clear status filter"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchTerm && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                  Search: "{searchTerm}"
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setPage(1);
                    }}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 focus:outline-none cursor-pointer"
                    aria-label="Clear search query"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isOwner) {
                    setBranchFilter("");
                  }
                  setStatusFilter("");
                  setSearchTerm("");
                  setPage(1);
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 underline underline-offset-2 ml-1.5 cursor-pointer transition-colors"
                title="Clear all active filters"
                aria-label="Clear all active filters"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

          <div className="space-y-4">
            {loading ? (
              <ListSkeleton rows={6} avatar />
            ) : inquiries.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-base font-medium text-foreground">
                  No inquiries found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your filters.
                </p>
              </div>
            ) : (
              inquiries.map((inquiry) => {
                const name =
                  inquiry.name ||
                  inquiry.fullName ||
                  `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
                  "Unknown";
                const status = inquiry.status || "pending";
                const isNew = status === "pending";

                return (
                  <div
                    key={inquiry._id}
                    onClick={() => setSelectedInquiry(inquiry)}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-light, rgba(0, 0, 0, 0.05))",
                    }}
                    className="group flex items-stretch justify-between p-5 border border-border/40 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all duration-200 cursor-pointer hover:bg-muted/40 hover:border-border/70 gap-4"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <ProfileAvatar
                        user={{ name }}
                        initials={initial(name)}
                        size={48}
                        defaultOnly
                      />
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">
                              {name}
                            </h3>
                            {isNew && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {inquiry.email || "-"}
                          </p>
                        </div>
                        {inquiry.message && (
                          <p className="text-sm text-foreground mb-2 line-clamp-2">
                            {inquiry.message}
                          </p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {(inquiry.subject || inquiry.inquiryType) && (
                            <span className="text-xs px-3 py-1 bg-muted text-foreground rounded-md">
                              {inquiry.subject || inquiry.inquiryType}
                            </span>
                          )}
                          <span
                            style={{
                              backgroundColor:
                                status === "resolved"
                                  ? inquiry.emailDeliveryStatus === "failed"
                                    ? "#fffbeb"
                                    : "var(--status-success-bg)"
                                  : "var(--status-warning-bg)",
                              color:
                                status === "resolved"
                                  ? inquiry.emailDeliveryStatus === "failed"
                                    ? "#b45309"
                                    : "var(--status-success)"
                                  : "var(--status-warning)",
                              border:
                                inquiry.emailDeliveryStatus === "failed"
                                  ? "1px solid #fde68a"
                                  : "none",
                            }}
                            className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                          >
                            {status === "resolved"
                              ? inquiry.emailDeliveryStatus === "failed"
                                ? "Email Undelivered"
                                : "Responded"
                              : "Pending"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end justify-between pl-2">
                      <div className="flex-1 flex items-center justify-center">
                        <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap mt-2">
                        {fmtDate(inquiry.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Control Bar */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
            pageSizeOptions={[5, 10, 20, 50]}
            itemLabel="inquiries"
            variant="numbered"
            className="mt-6 pt-4 border-t border-border"
          />
        </PageShell.Content>

      {selectedInquiry && (
        <InquiryDetailsModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={refetch}
        />
      )}
    </PageShell>
  );
}

export default InquiriesPage;
