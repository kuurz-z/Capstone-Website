import { useState, useEffect } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import GlobalLoading from "../../../shared/components/GlobalLoading";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import VisitSchedulesTab from "../components/VisitSchedulesTab";
import InquiriesPage from "./InquiriesPage";
import ConfirmModal from "../../../shared/components/ConfirmModal";

import ReservationStatsBar from "../components/reservations/ReservationStatsBar";
import ReservationToolbar from "../components/reservations/ReservationToolbar";
import ReservationTable, {
  checkOverdue,
} from "../components/reservations/ReservationTable";
import "../styles/admin-layout.css";
import "../styles/admin-reservations.css";

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

  /* ── data ── */
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

  /* ── actions ── */
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

  /* ── filter + sort + paginate ── */
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
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const page = sorted.slice(startIdx, startIdx + itemsPerPage);
  if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

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

  return (
    <div>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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

        {activeTab === "reservations" && (
          <>
            <ReservationStatsBar
              statItems={statItems}
              activeFilter={statusFilter}
              onFilterChange={(key) => {
                setStatusFilter(key);
                setCurrentPage(1);
              }}
            />
            <ReservationToolbar
              searchTerm={searchTerm}
              branchFilter={branchFilter}
              sortBy={sortBy}
              onSearchChange={(v) => {
                setSearchTerm(v);
                setCurrentPage(1);
              }}
              onBranchChange={(v) => {
                setBranchFilter(v);
                setCurrentPage(1);
              }}
              onSortChange={(v) => {
                setSortBy(v);
                setCurrentPage(1);
              }}
            />

            <div className="ar-table-wrap">
              <ReservationTable
                reservations={page}
                loading={loading}
                error={error}
                LoadingComponent={GlobalLoading}
                onView={handleView}
                onDelete={handleDelete}
              />

              {!loading && !error && filtered.length > 0 && totalPages > 1 && (
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
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "visits" && <VisitSchedulesTab />}
        {activeTab === "inquiries" && <InquiriesPage isEmbedded={true} />}
      </div>

      {selectedReservation && (
        <ReservationDetailsModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={fetchReservations}
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
}

export default ReservationsPage;
