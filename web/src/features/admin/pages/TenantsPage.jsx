import { useMemo, useState, useEffect } from "react";
import TenantDetailModal from "../components/TenantDetailModal";
import { reservationApi, userApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import "../styles/admin-tenants.css";

export default function TenantsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch tenants (users with role="tenant") from database
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all users with tenant role
        const usersResponse = await userApi.getAll({ role: "tenant" });
        const users = usersResponse.users || usersResponse; // Handle both array and object response

        // Fetch all reservations to get room details
        const reservations = await reservationApi.getAll();

        // Map users to tenant data with their reservation info
        const tenantsData = users.map((user) => {
          // Find the most recent checked-in reservation for this user
          const userReservation = reservations
            .filter(
              (res) =>
                res.userId?._id === user._id && res.status === "checked-in",
            )
            .sort(
              (a, b) => new Date(b.checkInDate) - new Date(a.checkInDate),
            )[0];

          // Determine status based on payment and dates
          let status = "Active";
          if (userReservation) {
            if (
              userReservation.paymentStatus === "pending" ||
              userReservation.paymentStatus === "partial"
            ) {
              status = "Overdue";
            }
            // Check if moving out soon (within 30 days)
            if (userReservation.checkOutDate) {
              const daysUntilMoveOut = Math.ceil(
                (new Date(userReservation.checkOutDate) - new Date()) /
                  (1000 * 60 * 60 * 24),
              );
              if (daysUntilMoveOut <= 30 && daysUntilMoveOut > 0) {
                status = "Moving Out";
              }
            }
          }

          const firstName = user.firstName || "";
          const lastName = user.lastName || "";
          const fullName =
            `${firstName} ${lastName}`.trim() || user.email || "Unknown";

          return {
            id: user._id,
            name: fullName,
            initials:
              `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
              user.email?.charAt(0).toUpperCase() ||
              "U",
            status: status,
            room:
              userReservation?.roomId?.name ||
              userReservation?.roomId?.roomNumber ||
              "Not Assigned",
            branch:
              userReservation?.roomId?.branch === "gil-puyat"
                ? "Gil Puyat"
                : userReservation?.roomId?.branch === "guadalupe"
                  ? "Guadalupe"
                  : "N/A",
            moveIn: userReservation?.checkInDate
              ? new Date(userReservation.checkInDate)
                  .toISOString()
                  .split("T")[0]
              : "-",
            moveOut: userReservation?.checkOutDate
              ? new Date(userReservation.checkOutDate)
                  .toISOString()
                  .split("T")[0]
              : "-",
            email: user.email || "N/A",
            phone: userReservation?.mobileNumber || user.phone || "N/A",
            reservationId: userReservation?._id,
          };
        });

        setTenants(tenantsData);
      } catch (err) {
        console.error("❌ Error fetching tenants:", err);
        setError("Failed to load tenants. Please try again.");
        showNotification("Failed to load tenants", "error", 3000);
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, []);

  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter(
      (tenant) => tenant.status === "Active",
    ).length;
    const overdue = tenants.filter(
      (tenant) => tenant.status === "Overdue",
    ).length;
    const movingOut = tenants.filter(
      (tenant) => tenant.status === "Moving Out",
    ).length;

    return {
      total,
      active,
      overdue,
      movingOut,
    };
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return tenants.filter((tenant) => {
      const matchesSearch =
        !term ||
        tenant.name.toLowerCase().includes(term) ||
        tenant.email.toLowerCase().includes(term) ||
        tenant.room.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" || tenant.status.toLowerCase() === statusFilter;
      const matchesBranch =
        branchFilter === "all" || tenant.branch.toLowerCase() === branchFilter;

      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [searchTerm, statusFilter, branchFilter, tenants]);

  // Pagination
  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTenants = filteredTenants.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="admin-tenants-page">
      <main className="admin-tenants-main">
        <header className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Tenants</h1>
            <p className="admin-page-subtitle">
              Manage all tenant information, contracts, and documents
            </p>
          </div>
        </header>

        <section className="admin-tenants-stats">
          <div className="admin-tenants-stat-card">
            <p className="admin-tenants-stat-label">Total Tenants</p>
            <p className="admin-tenants-stat-value">{stats.total}</p>
          </div>
          <div className="admin-tenants-stat-card admin-tenants-stat-card-active">
            <p className="admin-tenants-stat-label">Active</p>
            <p className="admin-tenants-stat-value">{stats.active}</p>
          </div>
          <div className="admin-tenants-stat-card admin-tenants-stat-card-overdue">
            <p className="admin-tenants-stat-label">Overdue</p>
            <p className="admin-tenants-stat-value">{stats.overdue}</p>
          </div>
          <div className="admin-tenants-stat-card admin-tenants-stat-card-moving-out">
            <p className="admin-tenants-stat-label">Moving Out</p>
            <p className="admin-tenants-stat-value">{stats.movingOut}</p>
          </div>
        </section>

        <section className="admin-tenants-tools">
          <div className="admin-tenants-search">
            <span className="admin-tenants-search-icon">
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
              placeholder="Search by name..."
              className="admin-tenants-search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="admin-tenants-filters">
            <select
              className="admin-tenants-filter"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
            >
              <option value="all">All Branches</option>
              <option value="gil puyat">Gil Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>
            <select
              className="admin-tenants-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="moving out">Moving Out</option>
            </select>
          </div>
        </section>

        <section className="admin-tenants-table">
          <div className="admin-tenants-table-header">
            <div>Tenant Name</div>
            <div>Contract</div>
            <div>Room / Room #</div>
            <div>Move In</div>
            <div>Move Out</div>
            <div>Contact Details</div>
            <div>Action</div>
          </div>
          <div className="admin-tenants-table-body">
            {loading ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#6b7280",
                }}
              >
                Loading tenants...
              </div>
            ) : error ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            ) : paginatedTenants.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#6b7280",
                }}
              >
                No tenants found.
              </div>
            ) : (
              paginatedTenants.map((tenant) => (
                <div key={tenant.id} className="admin-tenants-row">
                  <div className="admin-tenants-cell">
                    <div className="admin-tenants-profile">
                      <div
                        className={`admin-tenants-avatar admin-tenants-avatar-${tenant.id % 5}`}
                      >
                        {tenant.initials}
                      </div>
                      <span className="admin-tenants-name">{tenant.name}</span>
                    </div>
                  </div>
                  <div className="admin-tenants-cell">
                    <span
                      className={`admin-tenants-status admin-tenants-status-${tenant.status.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {tenant.status}
                    </span>
                  </div>
                  <div className="admin-tenants-cell">
                    <div className="admin-tenants-room">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <g clip-path="url(#clip0_141_187)">
                          <path
                            d="M8 6.66663H8.00667"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M8 9.33337H8.00667"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M8 4H8.00667"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M10.667 6.66663H10.6737"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M10.667 9.33337H10.6737"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M10.667 4H10.6737"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M5.33301 6.66663H5.33967"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M5.33301 9.33337H5.33967"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M5.33301 4H5.33967"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M6 14.6667V12.6667C6 12.4899 6.07024 12.3203 6.19526 12.1953C6.32029 12.0702 6.48986 12 6.66667 12H9.33333C9.51014 12 9.67971 12.0702 9.80474 12.1953C9.92976 12.3203 10 12.4899 10 12.6667V14.6667"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <path
                            d="M12.0003 1.33337H4.00033C3.26395 1.33337 2.66699 1.93033 2.66699 2.66671V13.3334C2.66699 14.0698 3.26395 14.6667 4.00033 14.6667H12.0003C12.7367 14.6667 13.3337 14.0698 13.3337 13.3334V2.66671C13.3337 1.93033 12.7367 1.33337 12.0003 1.33337Z"
                            stroke="#99A1AF"
                            stroke-width="1.33333"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </g>
                        <defs>
                          <clipPath id="clip0_141_187">
                            <rect width="16" height="16" fill="white" />
                          </clipPath>
                        </defs>
                      </svg>
                      {tenant.room}
                    </div>
                  </div>
                  <div className="admin-tenants-cell admin-tenants-date">
                    {tenant.moveIn}
                  </div>
                  <div className="admin-tenants-cell admin-tenants-date">
                    {tenant.moveOut}
                  </div>
                  <div className="admin-tenants-cell">
                    <div className="admin-tenants-contact">
                      <div className="admin-tenants-contact-line">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
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
                        </svg>
                        <span>{tenant.email}</span>
                      </div>
                      <div className="admin-tenants-contact-line">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M6.916 8.284C7.01926 8.33142 7.1356 8.34226 7.24585 8.31472C7.35609 8.28718 7.45367 8.22291 7.5225 8.1325L7.7 7.9C7.79315 7.7758 7.91393 7.675 8.05279 7.60557C8.19164 7.53614 8.34475 7.5 8.5 7.5H10C10.2652 7.5 10.5196 7.60536 10.7071 7.79289C10.8946 7.98043 11 8.23478 11 8.5V10C11 10.2652 10.8946 10.5196 10.7071 10.7071C10.5196 10.8946 10.2652 11 10 11C7.61305 11 5.32387 10.0518 3.63604 8.36396C1.94821 6.67613 1 4.38695 1 2C1 1.73478 1.10536 1.48043 1.29289 1.29289C1.48043 1.10536 1.73478 1 2 1H3.5C3.76522 1 4.01957 1.10536 4.20711 1.29289C4.39464 1.48043 4.5 1.73478 4.5 2V3.5C4.5 3.65525 4.46386 3.80836 4.39443 3.94721C4.325 4.08607 4.2242 4.20685 4.1 4.3L3.866 4.4755C3.77421 4.54559 3.70951 4.64529 3.6829 4.75768C3.65628 4.87006 3.66939 4.98819 3.72 5.092C4.40334 6.47993 5.52721 7.6024 6.916 8.284Z"
                            stroke="#4A5565"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{tenant.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className="admin-tenants-cell">
                    <button
                      className="admin-tenants-action"
                      type="button"
                      onClick={() => setSelectedTenant(tenant)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M1.16669 7C1.16669 7 3.50002 2.33334 7.00002 2.33334C10.5 2.33334 12.8334 7 12.8334 7C12.8334 7 10.5 11.6667 7.00002 11.6667C3.50002 11.6667 1.16669 7 1.16669 7Z"
                          stroke="#0C375F"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M7 8.75C7.9665 8.75 8.75 7.9665 8.75 7C8.75 6.0335 7.9665 5.25 7 5.25C6.0335 5.25 5.25 6.0335 5.25 7C5.25 7.9665 6.0335 8.75 7 8.75Z"
                          stroke="#0C375F"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>View</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {!loading && !error && filteredTenants.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                backgroundColor: "white",
              }}
            >
              <div style={{ fontSize: "14px", color: "#6b7280" }}>
                Showing {startIndex + 1} to{" "}
                {Math.min(startIndex + itemsPerPage, filteredTenants.length)} of{" "}
                {filteredTenants.length} tenants
              </div>

              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    backgroundColor: currentPage === 1 ? "#f3f4f6" : "white",
                    color: currentPage === 1 ? "#9ca3af" : "#374151",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  ← Previous
                </button>

                <div style={{ display: "flex", gap: "4px" }}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        style={{
                          padding: "6px 10px",
                          border:
                            page === currentPage
                              ? "1px solid #0C375F"
                              : "1px solid #d1d5db",
                          borderRadius: "6px",
                          backgroundColor:
                            page === currentPage ? "#0C375F" : "white",
                          color: page === currentPage ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: "500",
                          minWidth: "32px",
                        }}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    backgroundColor:
                      currentPage === totalPages ? "#f3f4f6" : "white",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor:
                      currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Tenant Detail Modal */}
        {selectedTenant && (
          <TenantDetailModal
            tenant={selectedTenant}
            onClose={() => setSelectedTenant(null)}
          />
        )}
      </main>
    </div>
  );
}
