import { useState, useEffect, useCallback } from "react";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { inquiryApi } from "../../../shared/api/apiClient";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../styles/admin-inquiries.css";

export default function InquiriesPage({ isEmbedded = false }) {
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    responded: 0,
  });

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

  // Fetch inquiries from API
  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (statusFilter) params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;

      const response = await inquiryApi.getAll(params);
      setInquiries(response.inquiries || []);
      setPagination((prev) => ({
        ...prev,
        ...response.pagination,
      }));
    } catch (err) {
      console.error("Error fetching inquiries:", err);
      setError("Failed to load inquiries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, searchTerm]);

  // Fetch statistics
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

  // Handle search
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Handle filter change
  const handleFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Handle archive
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
          showNotification?.("Failed to archive inquiry", "error", 3000);
        }
      },
    });
  };

  // Handle inquiry update (after responding)
  const handleInquiryUpdate = () => {
    fetchInquiries();
    fetchStats();
    setSelectedInquiry(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format time for display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Extract inquiry type from subject
  const getInquiryType = (subject) => {
    if (!subject) return "General";
    // Subject format is "InquiryType: Name" so extract the part before the colon
    const type = subject.split(":")[0].trim();
    return type || "General";
  };

  // Format branch name for display
  const formatBranchName = (branch) => {
    const branchNames = {
      "gil-puyat": "Gil Puyat",
      guadalupe: "Guadalupe",
      general: "General",
    };
    return branchNames[branch] || branch;
  };

  if (isEmbedded) {
    return (
      <main>
        <section className="admin-inquiries-stats">
          <div className="admin-inquiries-stat-card">
            <p className="admin-inquiries-stat-label">Total Inquiries</p>
            <p className="admin-inquiries-stat-value">{stats.total}</p>
          </div>
          <div className="admin-inquiries-stat-card admin-inquiries-stat-card-new">
            <p className="admin-inquiries-stat-label">New</p>
            <p className="admin-inquiries-stat-value">{stats.new}</p>
          </div>
          <div className="admin-inquiries-stat-card admin-inquiries-stat-card-responded">
            <p className="admin-inquiries-stat-label">Responded</p>
            <p className="admin-inquiries-stat-value">{stats.responded}</p>
          </div>
        </section>

        <section className="admin-inquiries-tools">
          <div className="admin-inquiries-search">
            <span className="admin-inquiries-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20L17 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by name, email, or branch..."
              className="admin-inquiries-search-input"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
          <select
            className="admin-inquiries-filter"
            value={statusFilter}
            onChange={handleFilterChange}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="responded">Responded</option>
          </select>
        </section>

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
            {loading ? (
              <div className="admin-inquiries-loading">
                Loading inquiries...
              </div>
            ) : error ? (
              <div className="admin-inquiries-error">{error}</div>
            ) : inquiries.length === 0 ? (
              <div className="admin-inquiries-empty">No inquiries found.</div>
            ) : (
              inquiries.map((inquiry) => (
                <div key={inquiry._id} className="admin-inquiries-row">
                  <div className="admin-inquiries-cell">
                    <span className="admin-inquiries-name">{inquiry.name}</span>
                  </div>
                  <div className="admin-inquiries-cell">
                    <div className="admin-inquiries-contact">
                      <div className="admin-inquiries-contact-line">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <g clipPath="url(#clip0_113_170)">
                            <path
                              d="M11 3.5L6.5045 6.3635C6.35195 6.45211 6.17867 6.49878 6.00225 6.49878C5.82583 6.49878 5.65255 6.45211 5.5 6.3635L1 3.5"
                              stroke="#4A5565"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M10 2H2C1.44772 2 1 2.44772 1 3V9C1 9.55228 1.44772 10 2 10H10C10.5523 10 11 9.55228 11 9V3C11 2.44772 10.5523 2 10 2Z"
                              stroke="#4A5565"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_113_170">
                              <rect width="12" height="12" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                        <span>{inquiry.email}</span>
                      </div>
                      <div className="admin-inquiries-contact-line">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <g clipPath="url(#clip0_113_175)">
                            <path
                              d="M6.916 8.284C7.01926 8.33142 7.1356 8.34226 7.24585 8.31472C7.35609 8.28718 7.45367 8.22291 7.5225 8.1325L7.7 7.9C7.79315 7.7758 7.91393 7.675 8.05279 7.60557C8.19164 7.53614 8.34475 7.5 8.5 7.5H10C10.2652 7.5 10.5196 7.60536 10.7071 7.79289C10.8946 7.98043 11 8.23478 11 8.5V10C11 10.2652 10.8946 10.5196 10.7071 10.7071C10.5196 10.8946 10.2652 11 10 11C7.61305 11 5.32387 10.0518 3.63604 8.36396C1.94821 6.67613 1 4.38695 1 2C1 1.73478 1.10536 1.48043 1.29289 1.29289C1.48043 1.10536 1.73478 1 2 1H3.5C3.76522 1 4.01957 1.10536 4.20711 1.29289C4.39464 1.48043 4.5 1.73478 4.5 2V3.5C4.5 3.65525 4.46386 3.80836 4.39443 3.94721C4.325 4.08607 4.2242 4.20685 4.1 4.3L3.866 4.4755C3.77421 4.54559 3.70951 4.64529 3.6829 4.75768C3.65628 4.87006 3.66939 4.98819 3.72 5.092C4.40334 6.47993 5.52721 7.6024 6.916 8.284Z"
                              stroke="#4A5565"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_113_175">
                              <rect width="12" height="12" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                        <span>{inquiry.phone || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="admin-inquiries-cell">
                    <span
                      className={`admin-inquiries-inquiry-type-badge ${getInquiryType(inquiry.subject).toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {getInquiryType(inquiry.subject)}
                    </span>
                  </div>
                  <div className="admin-inquiries-cell">
                    <div className="admin-inquiries-branch">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M13.3332 6.66668C13.3332 9.99534 9.6405 13.462 8.4005 14.5327C8.28499 14.6195 8.14437 14.6665 7.99984 14.6665C7.85531 14.6665 7.71469 14.6195 7.59917 14.5327C6.35917 13.462 2.6665 9.99534 2.6665 6.66668C2.6665 5.25219 3.22841 3.89563 4.2286 2.89544C5.2288 1.89525 6.58535 1.33334 7.99984 1.33334C9.41433 1.33334 10.7709 1.89525 11.7711 2.89544C12.7713 3.89563 13.3332 5.25219 13.3332 6.66668Z"
                          stroke="#99A1AF"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 8.66666C9.10457 8.66666 10 7.77123 10 6.66666C10 5.56209 9.10457 4.66666 8 4.66666C6.89543 4.66666 6 5.56209 6 6.66666C6 7.77123 6.89543 8.66666 8 8.66666Z"
                          stroke="#99A1AF"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{formatBranchName(inquiry.branch)}</span>
                    </div>
                  </div>
                  <div className="admin-inquiries-cell">
                    <div className="admin-inquiries-datetime">
                      <span>{formatDate(inquiry.createdAt)}</span>
                      <span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <g clipPath="url(#clip0_113_292)">
                            <path
                              d="M6 3V6L8 7"
                              stroke="#99A1AF"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z"
                              stroke="#99A1AF"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_113_292">
                              <rect width="12" height="12" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                        {formatTime(inquiry.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="admin-inquiries-cell">
                    <span
                      className={`admin-inquiries-status ${inquiry.status}`}
                    >
                      {inquiry.status}
                    </span>
                  </div>
                  <div className="admin-inquiries-cell admin-inquiries-actions">
                    <button
                      className="admin-inquiries-action"
                      aria-label="View"
                      onClick={() => setSelectedInquiry(inquiry)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M1.37468 8.232C1.31912 8.08232 1.31912 7.91767 1.37468 7.768C1.91581 6.4559 2.83435 5.33402 4.01386 4.5446C5.19336 3.75517 6.58071 3.33374 8.00001 3.33374C9.41932 3.33374 10.8067 3.75517 11.9862 4.5446C13.1657 5.33402 14.0842 6.4559 14.6253 7.768C14.6809 7.91767 14.6809 8.08232 14.6253 8.232C14.0842 9.54409 13.1657 10.666 11.9862 11.4554C10.8067 12.2448 9.41932 12.6663 8.00001 12.6663C6.58071 12.6663 5.19336 12.2448 4.01386 11.4554C2.83435 10.666 1.91581 9.54409 1.37468 8.232Z"
                          stroke="#155DFC"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
                          stroke="#155DFC"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {inquiry.status !== "resolved" && (
                      <button
                        className="admin-inquiries-action"
                        aria-label="Respond"
                        onClick={() => setSelectedInquiry(inquiry)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <g clipPath="url(#clip0_113_255)">
                            <path
                              d="M9.6907 14.4573C9.71603 14.5205 9.76006 14.5743 9.81688 14.6117C9.87371 14.6491 9.9406 14.6682 10.0086 14.6664C10.0766 14.6647 10.1424 14.6422 10.1973 14.6019C10.2521 14.5617 10.2933 14.5057 10.3154 14.4413L14.6487 1.77466C14.67 1.71559 14.6741 1.65167 14.6604 1.59037C14.6468 1.52907 14.6159 1.47293 14.5715 1.42852C14.5271 1.3841 14.471 1.35326 14.4097 1.33959C14.3484 1.32592 14.2844 1.32999 14.2254 1.35133L1.5587 5.68466C1.49436 5.70673 1.43832 5.74794 1.39808 5.80278C1.35785 5.85761 1.33535 5.92344 1.33361 5.99144C1.33186 6.05943 1.35096 6.12632 1.38834 6.18315C1.42571 6.23997 1.47958 6.284 1.5427 6.30933L6.82937 8.42933C6.99649 8.49624 7.14833 8.5963 7.27574 8.72348C7.40315 8.85066 7.50349 9.00233 7.5707 9.16933L9.6907 14.4573Z"
                              stroke="#00A63E"
                              strokeWidth="1.33333"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M14.5692 1.43134L7.27588 8.724"
                              stroke="#00A63E"
                              strokeWidth="1.33333"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                          <defs>
                            <clipPath id="clip0_113_255">
                              <rect width="16" height="16" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                      </button>
                    )}
                    <button
                      className="admin-inquiries-action delete"
                      aria-label="Archive"
                      onClick={() => handleArchive(inquiry._id)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M6.6665 7.33334V11.3333"
                          stroke="#E7000B"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.3335 7.33334V11.3333"
                          stroke="#E7000B"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12.6668 4V13.3333C12.6668 13.687 12.5264 14.0261 12.2763 14.2761C12.0263 14.5262 11.6871 14.6667 11.3335 14.6667H4.66683C4.31321 14.6667 3.97407 14.5262 3.72402 14.2761C3.47397 14.0261 3.3335 13.687 3.3335 13.3333V4"
                          stroke="#E7000B"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 4H14"
                          stroke="#E7000B"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M5.3335 4.00001V2.66668C5.3335 2.31305 5.47397 1.97392 5.72402 1.72387C5.97407 1.47382 6.31321 1.33334 6.66683 1.33334H9.3335C9.68712 1.33334 10.0263 1.47382 10.2763 1.72387C10.5264 1.97392 10.6668 2.31305 10.6668 2.66668V4.00001"
                          stroke="#E7000B"
                          strokeWidth="1.33333"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
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
                    backgroundColor:
                      pagination.page === 1 ? "#f3f4f6" : "white",
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
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page,
                        }))
                      }
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

        {/* Inquiry Details Modal */}
        {selectedInquiry && (
          <InquiryDetailsModal
            inquiry={selectedInquiry}
            onClose={() => setSelectedInquiry(null)}
            onUpdate={handleInquiryUpdate}
          />
        )}

        {/* Confirm Modal */}
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
  }

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

      {/* Copy the rest of the content from the embedded version - use grep to find it */}
    </div>
  );
}
