import { useState, useEffect } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import GlobalLoading from "../../../shared/components/GlobalLoading";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import VisitSchedulesTab from "../components/VisitSchedulesTab";
import InquiriesPage from "./InquiriesPage";
import "../styles/admin-layout.css";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../styles/admin-reservations.css";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function statusBadgeClass(status) {
  const map = {
    pending: "ar-badge-pending",
    confirmed: "ar-badge-confirmed",
    "checked-in": "ar-badge-checkedin",
    cancelled: "ar-badge-cancelled",
  };
  return map[(status || "").toLowerCase()] || "ar-badge-pending";
}

function statusLabel(status) {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    "checked-in": "Checked In",
    "checked-out": "Checked Out",
    cancelled: "Cancelled",
  };
  return map[(status || "").toLowerCase()] || status || "—";
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function checkOverdue(r) {
  return (
    r.status === "confirmed" &&
    r.moveInDate &&
    new Date(r.moveInDate) < new Date()
  );
}

/* ── component ────────────────────────────────────────────────────────────── */

function ReservationsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("reservations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });
  const itemsPerPage = 12;

  /* ── data ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (user) fetchReservations();
  }, [user]);

  const fetchReservations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await reservationApi.getAll();
      const list = data
        .filter((r) => {
          const hasVisitOnly =
            r.visitDate &&
            !r.visitApproved &&
            !r.firstName &&
            !r.proofOfPaymentUrl;
          return !hasVisitOnly;
        })
        .map((r) => ({
          id: r._id,
          reservationCode: r.reservationCode || "—",
          customer:
            `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() ||
            "Unknown",
          email: r.userId?.email || "—",
          room: r.roomId?.name || "—",
          branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
          moveInDate: r.checkInDate,
          status: r.status || "pending",
          totalPrice: r.totalPrice,
          paymentStatus: r.paymentStatus,
          createdAt: r.createdAt,
          checkInDate: r.checkInDate,
        }));
      setReservations(list);
    } catch (err) {
      console.error("Error fetching reservations:", err);
      setError(err.message);
      showNotification("Failed to load reservations", "error", 3000);
    } finally {
      setLoading(false);
    }
  };

  /* ── actions ─────────────────────────────────────────────────────────── */

  const handleAccept = (id) => {
    setConfirmModal({
      open: true,
      title: "Confirm Reservation",
      message:
        "This will confirm the payment and reserve a bed for this applicant.",
      variant: "info",
      confirmText: "Confirm",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          setActionLoading(id);
          await reservationApi.update(id, { status: "confirmed" });
          showNotification("Reservation confirmed", "success");
          fetchReservations();
        } catch {
          showNotification("Failed to confirm reservation", "error");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleView = async (id) => {
    try {
      const r = await reservationApi.getById(id);
      setSelectedReservation({
        id: r._id,
        reservationCode: r.reservationCode || "—",
        customer:
          `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() ||
          "Unknown",
        email: r.userId?.email || r.billingEmail || "—",
        phone: r.mobileNumber || "—",
        room: r.roomId?.name || "—",
        roomType: r.roomId?.type || "—",
        branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
        moveInDate: r.checkInDate
          ? new Date(r.checkInDate).toISOString().split("T")[0]
          : "—",
        totalPrice: r.totalPrice,
        paymentStatus: r.paymentStatus,
        status: r.status,
        notes: r.notes,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName,
        nickname: r.nickname,
        mobileNumber: r.mobileNumber,
        birthday: r.birthday,
        maritalStatus: r.maritalStatus,
        nationality: r.nationality,
        educationLevel: r.educationLevel,
        address: r.address,
        emergencyContact: r.emergencyContact,
        healthConcerns: r.healthConcerns,
        employment: r.employment,
        selfiePhotoUrl: r.selfiePhotoUrl,
        validIDFrontUrl: r.validIDFrontUrl,
        validIDBackUrl: r.validIDBackUrl,
        validIDType: r.validIDType,
        nbiClearanceUrl: r.nbiClearanceUrl,
        nbiReason: r.nbiReason,
        companyIDUrl: r.companyIDUrl,
        companyIDReason: r.companyIDReason,
        finalMoveInDate: r.finalMoveInDate,
        paymentMethod: r.paymentMethod,
        proofOfPaymentUrl: r.proofOfPaymentUrl,
        leaseDuration: r.leaseDuration,
        billingEmail: r.billingEmail,
        checkInDate: r.checkInDate,
        visitDate: r.visitDate,
        visitTime: r.visitTime,
        visitApproved: r.visitApproved,
      });
    } catch {
      const fallback = reservations.find((x) => x.id === id);
      if (fallback) setSelectedReservation(fallback);
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      open: true,
      title: "Delete Reservation",
      message:
        "This reservation will be permanently deleted. This cannot be undone.",
      variant: "danger",
      confirmText: "Delete",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await reservationApi.delete(id);
          showNotification("Reservation deleted", "success");
          fetchReservations();
        } catch {
          showNotification("Failed to delete", "error");
        }
      },
    });
  };

  /* ── filter + sort + paginate ───────────────────────────────────────── */

  const filtered = reservations.filter((r) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      r.customer.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.reservationCode.toLowerCase().includes(q) ||
      r.room.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "overdue"
          ? checkOverdue(r)
          : r.status.toLowerCase() === statusFilter;
    const matchBranch =
      branchFilter === "all" ||
      r.branch.toLowerCase() === branchFilter.toLowerCase();
    return matchSearch && matchStatus && matchBranch;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.createdAt) - new Date(b.createdAt);
      case "name-az":
        return a.customer.localeCompare(b.customer);
      case "name-za":
        return b.customer.localeCompare(a.customer);
      case "recent":
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const page = sorted.slice(startIdx, startIdx + itemsPerPage);

  if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

  /* ── stats ──────────────────────────────────────────────────────────── */

  const counts = {
    total: reservations.length,
    pending: reservations.filter((r) => r.status === "pending").length,
    confirmed: reservations.filter((r) => r.status === "confirmed").length,
    checkedIn: reservations.filter((r) => r.status === "checked-in").length,
    overdue: reservations.filter(checkOverdue).length,
  };

  const statItems = [
    { key: "all", cls: "ar-stat-total", label: "Total", count: counts.total },
    {
      key: "pending",
      cls: "ar-stat-pending",
      label: "Pending",
      count: counts.pending,
    },
    {
      key: "confirmed",
      cls: "ar-stat-confirmed",
      label: "Confirmed",
      count: counts.confirmed,
    },
    {
      key: "checked-in",
      cls: "ar-stat-checkedin",
      label: "Checked In",
      count: counts.checkedIn,
    },
    {
      key: "overdue",
      cls: "ar-stat-overdue",
      label: "Overdue",
      count: counts.overdue,
    },
  ];

  const tabs = [
    { key: "reservations", label: "Reservations" },
    { key: "visits", label: "Visit Schedules" },
    { key: "inquiries", label: "Inquiries" },
  ];

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div className="admin-page-header">
          <h1 className="admin-page-title">Reservations</h1>
          <p className="admin-page-subtitle">
            Review and manage reservation applications
          </p>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`admin-tab ${activeTab === t.key ? "active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Reservations Tab ────────────────────────── */}
        {activeTab === "reservations" && (
          <>
            {/* Stats */}
            <div className="ar-stats">
              {statItems.map((s) => (
                <button
                  key={s.key}
                  className={`ar-stat ${s.cls} ${statusFilter === s.key ? "active" : ""}`}
                  onClick={() => {
                    setStatusFilter(statusFilter === s.key ? "all" : s.key);
                    setCurrentPage(1);
                  }}
                >
                  <span className="ar-stat-count">{s.count}</span>
                  <span className="ar-stat-label">{s.label}</span>
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="ar-toolbar">
              <input
                className="ar-search"
                type="text"
                placeholder="Search by name, email, code, or room..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
              <select
                className="ar-select"
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Branches</option>
                <option value="gil puyat">Gil Puyat</option>
                <option value="guadalupe">Guadalupe</option>
              </select>
              <select
                className="ar-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="name-az">Name A–Z</option>
                <option value="name-za">Name Z–A</option>
              </select>
            </div>

            {/* Table */}
            <div className="ar-table-wrap">
              {loading ? (
                <GlobalLoading />
              ) : error ? (
                <div className="ar-error">Error: {error}</div>
              ) : filtered.length === 0 ? (
                <div className="ar-empty">
                  <p className="ar-empty-title">No reservations found</p>
                  <p className="ar-empty-sub">
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      className="ar-table"
                      style={{ tableLayout: "fixed", width: "100%" }}
                    >
                      <thead>
                        <tr>
                          <th style={{ width: "12%" }}>Code</th>
                          <th style={{ width: "24%" }}>Customer</th>
                          <th style={{ width: "18%" }}>Room / Branch</th>
                          <th style={{ width: "14%" }}>Move-in</th>
                          <th style={{ width: "12%" }}>Status</th>
                          <th style={{ width: "20%" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.map((r) => {
                          const overdue = checkOverdue(r);
                          return (
                            <tr
                              key={r.id}
                              className={overdue ? "ar-row-overdue" : ""}
                              onClick={() => handleView(r.id)}
                            >
                              <td>
                                <span className="ar-cell-code">
                                  {r.reservationCode}
                                </span>
                              </td>
                              <td>
                                <p className="ar-cell-name">{r.customer}</p>
                                <p className="ar-cell-sub">{r.email}</p>
                              </td>
                              <td>
                                <p className="ar-cell-name">{r.room}</p>
                                <p className="ar-cell-sub">{r.branch}</p>
                              </td>
                              <td>
                                <span
                                  className={`ar-cell-date ${overdue ? "overdue" : ""}`}
                                >
                                  {formatDate(r.moveInDate)}
                                </span>
                                {overdue && (
                                  <span className="ar-badge ar-badge-overdue">
                                    Overdue
                                  </span>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`ar-badge ${statusBadgeClass(r.status)}`}
                                >
                                  {statusLabel(r.status)}
                                </span>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div className="ar-actions">
                                  <button
                                    className="ar-btn ar-btn-view"
                                    onClick={() => handleView(r.id)}
                                  >
                                    View
                                  </button>
                                  <button
                                    className="ar-btn ar-btn-delete"
                                    onClick={() => handleDelete(r.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="ar-pagination">
                      <span>
                        {startIdx + 1}–
                        {Math.min(startIdx + itemsPerPage, filtered.length)} of{" "}
                        {filtered.length}
                      </span>
                      <div className="ar-pagination-buttons">
                        <button
                          className="ar-page-btn"
                          onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                          }
                          disabled={currentPage === 1}
                        >
                          Previous
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(
                            (p) =>
                              p === 1 ||
                              p === totalPages ||
                              Math.abs(p - currentPage) <= 1,
                          )
                          .map((p, idx, arr) => (
                            <span key={p}>
                              {idx > 0 && arr[idx - 1] !== p - 1 && (
                                <span className="ar-page-ellipsis">…</span>
                              )}
                              <button
                                className={`ar-page-btn ${p === currentPage ? "active" : ""}`}
                                onClick={() => setCurrentPage(p)}
                              >
                                {p}
                              </button>
                            </span>
                          ))}
                        <button
                          className="ar-page-btn"
                          onClick={() =>
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1),
                            )
                          }
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── Visit Schedules Tab ──────────────────────── */}
        {activeTab === "visits" && <VisitSchedulesTab />}

        {/* ── Inquiries Tab ────────────────────────────── */}
        {activeTab === "inquiries" && <InquiriesPage isEmbedded={true} />}
      </div>

      {/* Details Modal */}
      {selectedReservation && (
        <ReservationDetailsModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={fetchReservations}
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
    </div>
  );
}

export default ReservationsPage;
