import { useMemo, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MailCheck,
  MessageSquare,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { inquiryApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { ActionBar, StatusBadge, SummaryBar } from "../components/shared";
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

  const filters = useMemo(
    () => [
      {
        key: "branch",
        options: [
          { value: "", label: "All Branches" },
          { value: "gil-puyat", label: "Gil Puyat" },
          { value: "guadalupe", label: "Guadalupe" },
        ],
        value: branchFilter,
        onChange: (value) => {
          setBranchFilter(value);
          setPage(1);
        },
      },
      {
        key: "status",
        options: [
          { value: "", label: "All Status" },
          { value: "pending", label: "Pending" },
          { value: "resolved", label: "Resolved" },
        ],
        value: statusFilter,
        onChange: (value) => {
          setStatusFilter(value);
          setPage(1);
        },
      },
      {
        key: "sort",
        options: [
          { value: "recent", label: "Most Recent" },
          { value: "oldest", label: "Oldest First" },
          { value: "name-az", label: "Name A-Z" },
          { value: "name-za", label: "Name Z-A" },
        ],
        value: sortBy,
        onChange: (value) => setSortBy(value),
      },
    ],
    [branchFilter, sortBy, statusFilter],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
      {!isEmbedded && <SummaryBar items={summaryItems} />}

      <ActionBar
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: "Search inquiries...",
        }}
        filters={filters}
      />

      <div className="inquiry-list">
        {loading ? (
          [1, 2, 3].map((index) => (
            <div key={index} className="inquiry-card inquiry-card--skeleton">
              <div className="inquiry-card__avatar" style={{ background: "#e5e7eb" }} />
              <div className="inquiry-card__body">
                <div className="inquiry-skeleton-line" style={{ width: "40%" }} />
                <div className="inquiry-skeleton-line" style={{ width: "70%", marginTop: 6 }} />
              </div>
            </div>
          ))
        ) : inquiries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "var(--text-muted)",
              fontSize: "var(--font-size-base)",
            }}
          >
            No inquiries found
          </div>
        ) : (
          inquiries.map((inquiry) => {
            const name =
              inquiry.name ||
              `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
              "Unknown";
            const status = inquiry.status || "pending";
            return (
              <div
                key={inquiry._id}
                className="inquiry-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedInquiry(inquiry)}
                onKeyDown={(event) => event.key === "Enter" && setSelectedInquiry(inquiry)}
              >
                <div className="inquiry-card__avatar" style={{ background: avatarColor(name) }}>
                  {initial(name)}
                </div>

                <div className="inquiry-card__body">
                  <div className="inquiry-card__top">
                    <span className="inquiry-card__name">{name}</span>
                    <span className="inquiry-card__meta">
                      {inquiry.email || "-"} · {fmtDate(inquiry.createdAt)}
                    </span>
                  </div>
                  {inquiry.message && <p className="inquiry-card__message">{inquiry.message}</p>}
                </div>

                <div className="inquiry-card__tags" onClick={(event) => event.stopPropagation()}>
                  {(inquiry.subject || inquiry.inquiryType) && (
                    <span className="inquiry-type-badge">{inquiry.subject || inquiry.inquiryType}</span>
                  )}
                  <StatusBadge status={status} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, paddingTop: 4 }}>
          <button
            className="res-icon-btn"
            disabled={page <= 1}
            onClick={() => setPage((previous) => Math.max(1, previous - 1))}
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-muted)",
              minWidth: 48,
              textAlign: "center",
            }}
          >
            {page} / {totalPages}
          </span>
          <button
            className="res-icon-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
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
  );
}

