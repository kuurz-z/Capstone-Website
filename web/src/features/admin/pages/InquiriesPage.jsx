import { useMemo, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MailCheck,
  MessageSquare,
  Search,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { inquiryApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-inquiries.css";

const AVATAR_COLORS = [
  "#f97316",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
];

function avatarColor(name = "") {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function initial(name = "") {
  return (name.trim()[0] || "?").toUpperCase();
}

function fmtDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InquiriesPage({ isEmbedded = false }) {
  const queryClient = useQueryClient();
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const params = useMemo(() => {
    const nextParams = { page, limit: LIMIT };
    if (statusFilter) nextParams.status = statusFilter;
    if (searchTerm) nextParams.search = searchTerm;
    if (branchFilter) nextParams.branch = branchFilter;
    return nextParams;
  }, [branchFilter, page, searchTerm, statusFilter]);

  const { data: inquiriesData, isLoading: loading } = useInquiries(params);
  const { data: statsData } = useInquiryStats({ enabled: !isEmbedded });

  const rawInquiries = inquiriesData?.inquiries || [];
  const inquiries = useMemo(() => {
    const getName = (inquiry) =>
      inquiry.name || `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() || "";

    if (sortBy === "recent") {
      return rawInquiries;
    }

    const sorted = [...rawInquiries];
    if (sortBy === "oldest") {
      sorted.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    } else if (sortBy === "name-az") {
      sorted.sort((left, right) => getName(left).localeCompare(getName(right)));
    } else if (sortBy === "name-za") {
      sorted.sort((left, right) => getName(right).localeCompare(getName(left)));
    }
    return sorted;
  }, [rawInquiries, sortBy]);
  const totalPages = inquiriesData?.pagination?.pages || 1;

  const stats = {
    total: statsData?.total || 0,
    new: statsData?.byStatus?.pending || 0,
    responded: statsData?.byStatus?.resolved || 0,
  };

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["inquiries"] });

  const handleArchive = (inquiryId) => {
    setConfirmModal({
      open: true,
      title: "Archive Inquiry",
      message: "Are you sure you want to archive this inquiry?",
      variant: "warning",
      confirmText: "Archive",
      onConfirm: async () => {
        setConfirmModal((previous) => ({ ...previous, open: false }));
        try {
          await inquiryApi.archive(inquiryId);
          refetchAll();
          showNotification("Inquiry archived successfully", "success", 3000);
        } catch (error) {
          console.error("Error archiving inquiry:", error);
          showNotification(error.message || "Failed to archive inquiry", "error", 3000);
        }
      },
    });
  };

  const summaryItems = useMemo(
    () => [
      { label: "New Inquiries", value: stats.new, icon: MessageSquare, color: "orange" },
      { label: "Responded", value: stats.responded, icon: MailCheck, color: "blue" },
      { label: "Resolved", value: stats.responded, icon: CheckCheck, color: "green" },
    ],
    [stats.new, stats.responded],
  );

  const summaryColorClasses = {
    blue: {
      base: "border-blue-100 bg-blue-50/60",
      active: "border-blue-300 bg-blue-100/80 shadow-sm ring-1 ring-blue-200",
      icon: "text-blue-600",
      label: "text-blue-700",
      value: "text-blue-900",
    },
    orange: {
      base: "border-amber-100 bg-amber-50/60",
      active: "border-amber-300 bg-amber-100/80 shadow-sm ring-1 ring-amber-200",
      icon: "text-amber-600",
      label: "text-amber-700",
      value: "text-amber-900",
    },
    green: {
      base: "border-emerald-100 bg-emerald-50/60",
      active: "border-emerald-300 bg-emerald-100/80 shadow-sm ring-1 ring-emerald-200",
      icon: "text-emerald-600",
      label: "text-emerald-700",
      value: "text-emerald-900",
    },
    red: {
      base: "border-red-100 bg-red-50/60",
      active: "border-red-300 bg-red-100/80 shadow-sm ring-1 ring-red-200",
      icon: "text-red-600",
      label: "text-red-700",
      value: "text-red-900",
    },
  };

  const summaryFilterValues = ["", "resolved", "pending"];

  return (
    <div className="min-h-screen w-full bg-gray-50/50">
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        {!isEmbedded && (
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {summaryItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = statusFilter === summaryFilterValues[index];
              const palette = summaryColorClasses[item.color] || summaryColorClasses.orange;

              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setStatusFilter(summaryFilterValues[index]);
                    setPage(1);
                  }}
                  className={`min-h-[132px] rounded-xl border p-5 text-left transition-all ${
                    isActive ? palette.active : `${palette.base} hover:shadow-sm`
                  }`}
                >
                  <div className="mb-3 flex items-center gap-2.5">
                    <Icon className={`h-5 w-5 ${palette.icon}`} />
                    <span className={`text-sm font-medium ${palette.label}`}>{item.label}</span>
                  </div>
                  <div className={`text-3xl font-semibold leading-none ${palette.value}`}>
                    {item.value}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-lg">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search inquiries..."
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-11 pr-4 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Branches</option>
              <option value="gil-puyat">Gil Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="name-az">Name A-Z</option>
              <option value="name-za">Name Z-A</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-base text-gray-500">Loading inquiries...</p>
            </div>
          ) : inquiries.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-base font-medium text-gray-900">No inquiries found</p>
              <p className="mt-1 text-base text-gray-500">Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inquiries.map((inquiry) => {
                const name =
                  inquiry.name ||
                  `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
                  "Unknown";
                const status = inquiry.status || "pending";

                return (
                  <div
                    key={inquiry._id}
                    className="group flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-gray-50/50"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedInquiry(inquiry)}
                    onKeyDown={(event) => event.key === "Enter" && setSelectedInquiry(inquiry)}
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: avatarColor(name) }}
                    >
                      {initial(name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-base font-medium text-gray-900">{name}</p>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mb-1 truncate text-sm text-gray-500">
                        {inquiry.email || "-"} · {fmtDate(inquiry.createdAt)}
                      </p>
                      {inquiry.message && <p className="line-clamp-2 text-sm text-gray-700">{inquiry.message}</p>}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      {(inquiry.subject || inquiry.inquiryType) && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                          {inquiry.subject || inquiry.inquiryType}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <div className="text-base text-gray-500">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                title="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                title="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

      {selectedInquiry && (
        <InquiryDetailsModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={() => {
            refetchAll();
            setSelectedInquiry(null);
          }}
          onArchive={handleArchive}
        />
      )}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((previous) => ({ ...previous, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
      {!isEmbedded && stats.total > 0 && <div className="sr-only">{stats.total}</div>}
      </div>
    </div>
  );
}

