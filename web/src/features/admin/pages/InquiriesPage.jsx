import { useEffect, useState, useMemo } from "react";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { inquiryApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import { useQueryClient } from "@tanstack/react-query";

import InquiryStatsBar from "../components/inquiries/InquiryStatsBar";
import InquiryToolbar from "../components/inquiries/InquiryToolbar";
import InquiryTable from "../components/inquiries/InquiryTable";
import "../styles/admin-inquiries.css";

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
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });

  // ── TanStack Query ──
  const params = useMemo(() => {
    const p = { page: pagination.page, limit: pagination.limit };
    if (statusFilter) p.status = statusFilter;
    if (searchTerm) p.search = searchTerm;
    return p;
  }, [pagination.page, pagination.limit, statusFilter, searchTerm]);

  const { data: inquiriesData, isLoading: loading, error: queryError } = useInquiries(params);
  const { data: statsData } = useInquiryStats();

  const inquiries = inquiriesData?.inquiries || [];
  const error = queryError ? "Failed to load inquiries. Please try again." : null;

  // Sync pagination from server response
  const serverTotal = inquiriesData?.pagination?.total;
  const serverPages = inquiriesData?.pagination?.pages;
  useEffect(() => {
    if (serverTotal != null && serverTotal !== pagination.total) {
      setPagination((prev) => ({ ...prev, total: serverTotal, pages: serverPages }));
    }
  }, [serverTotal, serverPages]);

  const stats = {
    total: statsData?.total || 0,
    new: statsData?.byStatus?.pending || 0,
    responded: statsData?.byStatus?.resolved || 0,
  };

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["inquiries"] });
  };

  // ── Handlers ──
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleArchive = (inquiryId) => {
    setConfirmModal({
      open: true,
      title: "Archive Inquiry",
      message:
        "Are you sure you want to archive this inquiry? It will be moved to the archived section.",
      variant: "warning",
      confirmText: "Archive",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await inquiryApi.archive(inquiryId);
          refetchAll();
        } catch (err) {
          console.error("Error archiving inquiry:", err);
        }
      },
    });
  };

  const handleInquiryUpdate = () => {
    refetchAll();
    setSelectedInquiry(null);
  };

  // ── Content ──
  const content = (
    <main>
      <InquiryStatsBar stats={stats} />
      <InquiryToolbar
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      <section className="admin-inquiries-table">
        <div className="admin-inquiries-table-header">
          <div>NAME</div>
          <div>CONTACT</div>
          <div>INQUIRY TYPE</div>
          <div>BRANCH</div>
          <div>DATE &amp; TIME</div>
          <div>STATUS</div>
          <div>ACTIONS</div>
        </div>
        <div className="admin-inquiries-table-body">
          <InquiryTable
            inquiries={inquiries}
            loading={loading}
            error={error}
            onSelectInquiry={setSelectedInquiry}
            onArchive={handleArchive}
          />
        </div>

        {/* Pagination */}
        {!loading && inquiries.length > 0 && pagination.total > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px",
              borderTop: "1px solid #e5e7eb",
              backgroundColor: "#fafafa",
            }}
          >
            <div style={{ fontSize: "14px", color: "#6B7280" }}>
              Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} inquiries
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() =>
                  setPagination((prev) => ({
                    ...prev,
                    page: Math.max(1, prev.page - 1),
                  }))
                }
                disabled={pagination.page === 1}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: pagination.page === 1 ? "#f3f4f6" : "white",
                  color: pagination.page === 1 ? "#9ca3af" : "#374151",
                  cursor: pagination.page === 1 ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s",
                }}
              >
                ← Previous
              </button>
              <div
                style={{ display: "flex", gap: "4px", alignItems: "center" }}
              >
                {Array.from(
                  { length: pagination.pages || 0 },
                  (_, i) => i + 1,
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() => setPagination((prev) => ({ ...prev, page }))}
                    style={{
                      padding: "6px 10px",
                      border:
                        page === pagination.page
                          ? "1px solid #183153"
                          : "1px solid #d1d5db",
                      borderRadius: "6px",
                      backgroundColor:
                        page === pagination.page ? "#183153" : "white",
                      color: page === pagination.page ? "white" : "#374151",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "500",
                      minWidth: "32px",
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  setPagination((prev) => ({
                    ...prev,
                    page: Math.min(pagination.pages || 1, prev.page + 1),
                  }))
                }
                disabled={pagination.page === (pagination.pages || 1)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor:
                    pagination.page === (pagination.pages || 1)
                      ? "#f3f4f6"
                      : "white",
                  color:
                    pagination.page === (pagination.pages || 1)
                      ? "#9ca3af"
                      : "#374151",
                  cursor:
                    pagination.page === (pagination.pages || 1)
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedInquiry && (
        <InquiryDetailsModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={handleInquiryUpdate}
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
    </main>
  );

  if (isEmbedded) return content;

  return (
    <div className="admin-inquiries-page">
      <header className="admin-inquiries-header">
        <div>
          <h1 className="admin-inquiries-title">Inquiries Management</h1>
          <p className="admin-inquiries-subtitle">
            View and respond to customer inquiries
          </p>
        </div>
      </header>
      {content}
    </div>
  );
}
