import { useState, useMemo } from "react";
import { MessageSquare, MailCheck, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { inquiryApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import { useQueryClient } from "@tanstack/react-query";
import { SummaryBar, ActionBar, StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-inquiries.css";

const AVATAR_COLORS = [
  "#f97316","#8b5cf6","#0ea5e9","#10b981","#ef4444",
  "#f59e0b","#6366f1","#ec4899","#14b8a6","#84cc16",
];
function avatarColor(name = "") {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function initial(name = "") {
  return (name.trim()[0] || "?").toUpperCase();
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function InquiriesPage({ isEmbedded = false }) {
  const queryClient = useQueryClient();
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", variant: "info", onConfirm: null });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const params = useMemo(() => {
    const p = { page, limit: LIMIT };
    if (statusFilter) p.status = statusFilter;
    if (searchTerm) p.search = searchTerm;
    return p;
  }, [page, statusFilter, searchTerm]);

  const { data: inquiriesData, isLoading: loading } = useInquiries(params);
  const { data: statsData } = useInquiryStats();

  const inquiries = inquiriesData?.inquiries || [];
  const total = inquiriesData?.pagination?.total || 0;
  const totalPages = inquiriesData?.pagination?.pages || 1;

  const stats = {
    total: statsData?.total || 0,
    new: statsData?.byStatus?.pending || 0,
    responded: statsData?.byStatus?.resolved || 0,
  };

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["inquiries"] });

  const handleArchive = (inquiryId) => {
    setConfirmModal({
      open: true, title: "Archive Inquiry",
      message: "Are you sure you want to archive this inquiry?",
      variant: "warning", confirmText: "Archive",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try { await inquiryApi.archive(inquiryId); refetchAll(); }
        catch (err) { console.error("Error archiving inquiry:", err); }
      },
    });
  };

  const summaryItems = [
    { label: "New Inquiries", value: stats.new,       icon: MessageSquare, color: "orange" },
    { label: "Responded",     value: stats.responded, icon: MailCheck,     color: "blue" },
    { label: "Resolved",      value: stats.responded, icon: CheckCheck,    color: "green" },
  ];

  const filters = [
    {
      key: "status",
      options: [
        { value: "", label: "All" },
        { value: "pending", label: "Pending" },
        { value: "resolved", label: "Resolved" },
      ],
      value: statusFilter,
      onChange: (v) => { setStatusFilter(v); setPage(1); },
    },
  ];

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
      <SummaryBar items={summaryItems} />

      <ActionBar
        search={{
          value: searchTerm,
          onChange: (v) => { setSearchTerm(v); setPage(1); },
          placeholder: "Search inquiries...",
        }}
        filters={filters}
      />

      {/* Card-list */}
      <div className="inquiry-list">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="inquiry-card inquiry-card--skeleton">
              <div className="inquiry-card__avatar" style={{ background: "#e5e7eb" }} />
              <div className="inquiry-card__body">
                <div className="inquiry-skeleton-line" style={{ width: "40%" }} />
                <div className="inquiry-skeleton-line" style={{ width: "70%", marginTop: 6 }} />
              </div>
            </div>
          ))
        ) : inquiries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "var(--font-size-base)" }}>
            No inquiries found
          </div>
        ) : (
          inquiries.map((inq) => {
            const name = inq.name || `${inq.firstName || ""} ${inq.lastName || ""}`.trim() || "Unknown";
            const statusStr = inq.status || "pending";
            return (
              <div
                key={inq._id}
                className="inquiry-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedInquiry(inq)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedInquiry(inq)}
              >
                {/* Avatar */}
                <div className="inquiry-card__avatar" style={{ background: avatarColor(name) }}>
                  {initial(name)}
                </div>

                {/* Content */}
                <div className="inquiry-card__body">
                  <div className="inquiry-card__top">
                    <span className="inquiry-card__name">{name}</span>
                    <span className="inquiry-card__meta">{inq.email || "—"} · {fmtDate(inq.createdAt)}</span>
                  </div>
                  {inq.message && (
                    <p className="inquiry-card__message">{inq.message}</p>
                  )}
                </div>

                {/* Tags */}
                <div className="inquiry-card__tags" onClick={(e) => e.stopPropagation()}>
                  {(inq.subject || inq.inquiryType) && (
                    <span className="inquiry-type-badge">{inq.subject || inq.inquiryType}</span>
                  )}
                  <StatusBadge status={statusStr} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, paddingTop: 4 }}>
          <button
            className="res-icon-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            title="Previous page"
          ><ChevronLeft size={16} /></button>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", minWidth: 48, textAlign: "center" }}>
            {page} / {totalPages}
          </span>
          <button
            className="res-icon-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            title="Next page"
          ><ChevronRight size={16} /></button>
        </div>
      )}

      {selectedInquiry && (
        <InquiryDetailsModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={() => { refetchAll(); setSelectedInquiry(null); }}
        />
      )}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </div>
  );

  return content;
}
