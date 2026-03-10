import { useState, useEffect, useCallback } from "react";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { inquiryApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";

import InquiryStatsBar from "../components/inquiries/InquiryStatsBar";
import InquiryToolbar from "../components/inquiries/InquiryToolbar";
import InquiryTable from "../components/inquiries/InquiryTable";
import "../styles/admin-inquiries.css";

export default function InquiriesPage({ isEmbedded = false }) {
  const [stats, setStats] = useState({ total: 0, new: 0, responded: 0 });
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // ── Fetch data ──
  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (statusFilter) params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;
      const response = await inquiryApi.getAll(params);
      setInquiries(response.inquiries || []);
      setPagination((prev) => ({ ...prev, ...response.pagination }));
    } catch (err) {
      console.error("Error fetching inquiries:", err);
      setError("Failed to load inquiries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, searchTerm]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await inquiryApi.getStats();
      setStats({
        total: response.total || 0,
        new: response.byStatus?.pending || 0,
        responded: response.byStatus?.resolved || 0,
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
          fetchInquiries();
          fetchStats();
        } catch (err) {
          console.error("Error archiving inquiry:", err);
        }
      },
    });
  };

  const handleInquiryUpdate = () => {
    fetchInquiries();
    fetchStats();
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
                          ? "1px solid #0C375F"
                          : "1px solid #d1d5db",
                      borderRadius: "6px",
                      backgroundColor:
                        page === pagination.page ? "#0C375F" : "white",
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
