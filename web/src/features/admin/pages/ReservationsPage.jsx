import { useState, useMemo } from "react";
import {
  CalendarCheck, Clock, CheckCircle, UserCheck, AlertTriangle, Eye, Trash2,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import VisitSchedulesTab from "../components/VisitSchedulesTab";
import InquiriesPage from "./InquiriesPage";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { useQueryClient } from "@tanstack/react-query";
import { checkOverdue } from "../components/reservations/ReservationTable";
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-reservations.css";

/* Stable avatar colors per letter */
const AVATAR_COLORS = [
  "#f97316","#8b5cf6","#0ea5e9","#10b981","#ef4444",
  "#f59e0b","#6366f1","#ec4899","#14b8a6","#84cc16",
];
function avatarColor(name = "") {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
function initials(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

function ReservationsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("reservations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(
    isSuperAdmin ? "all" : (user?.branch || "all")
  );
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false, title: "", message: "", variant: "info", onConfirm: null,
  });
  const itemsPerPage = 12;

  const { data: rawReservations = [], isLoading: loading, error: queryError } = useReservations();
  const error = queryError?.message || null;

  // All reservations mapped to display shape — no status pre-filtering.
  // Cancelled reservations remain visible in the table with their status badge.
  const reservations = rawReservations.map((r) => ({
    id: r._id,
    reservationCode: r.reservationCode || "—",
    customer: `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() || "Unknown",
    email: r.userId?.email || "—",
    room: r.roomId?.name || "—",
    roomType: r.roomId?.type || "",
    branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
    moveInDate: r.checkInDate,
    status: r.status || "pending",
    step: r.currentStep || null,
    totalSteps: r.totalSteps || null,
    stepLabel: r.stepLabel || null,
    totalPrice: r.totalPrice,
    paymentStatus: r.paymentStatus,
    createdAt: r.createdAt,
    checkInDate: r.checkInDate,
    _raw: r,
  }));

  const refetchReservations = () =>
    queryClient.invalidateQueries({ queryKey: ["reservations"] });

  const handleView = async (id) => {
    try {
      const { data: r } = await reservationApi.getById(id);
      setSelectedReservation({
        ...r, id: r._id,
        customer: `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() || "Unknown",
        email: r.userId?.email || "—",
        room: r.roomId?.name || "—",
        branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
        status: r.status || "pending",
        totalPrice: r.totalPrice, paymentStatus: r.paymentStatus,
        createdAt: r.createdAt, reservationCode: r.reservationCode || "—",
        birthday: r.birthday, maritalStatus: r.maritalStatus,
        nationality: r.nationality, educationLevel: r.educationLevel,
        address: r.address, emergencyContact: r.emergencyContact,
        healthConcerns: r.healthConcerns, employment: r.employment,
        selfiePhotoUrl: r.selfiePhotoUrl, validIDFrontUrl: r.validIDFrontUrl,
        validIDBackUrl: r.validIDBackUrl, validIDType: r.validIDType,
        nbiClearanceUrl: r.nbiClearanceUrl, nbiReason: r.nbiReason,
        companyIDUrl: r.companyIDUrl, companyIDReason: r.companyIDReason,
        finalMoveInDate: r.finalMoveInDate, paymentMethod: r.paymentMethod,
        proofOfPaymentUrl: r.proofOfPaymentUrl, leaseDuration: r.leaseDuration,
        billingEmail: r.billingEmail, checkInDate: r.checkInDate,
        visitDate: r.visitDate, visitTime: r.visitTime, visitApproved: r.visitApproved,
      });
    } catch {
      const fallback = reservations.find((x) => x.id === id);
      if (fallback) setSelectedReservation(fallback);
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      open: true, title: "Delete Reservation",
      message: "This reservation will be permanently deleted. This cannot be undone.",
      variant: "danger", confirmText: "Delete",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await reservationApi.delete(id);
          showNotification("Reservation deleted", "success");
          refetchReservations();
        } catch { showNotification("Failed to delete", "error"); }
      },
    });
  };

  /* Filter + paginate */
  const filtered = reservations.filter((r) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      r.customer.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.reservationCode.toLowerCase().includes(q) ||
      r.room.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all"
      ? true
      : statusFilter === "overdue"      ? checkOverdue(r)
      : statusFilter === "in_progress"  ? IN_PROGRESS_STATUSES.includes(r.status)
      : r.status.toLowerCase() === statusFilter;
    const matchBranch = branchFilter === "all" || r.branch.toLowerCase() === branchFilter.toLowerCase();
    return matchSearch && matchStatus && matchBranch;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totalFiltered = sorted.length;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const pageData = sorted.slice(startIdx, startIdx + itemsPerPage);
  if (currentPage > Math.ceil(totalFiltered / itemsPerPage) && totalFiltered > 0) setCurrentPage(1);

  const IN_PROGRESS_STATUSES = ["pending", "visit_pending", "visit_approved", "payment_pending"];

  const counts = {
    total:      reservations.length,
    inProgress: reservations.filter((r) => IN_PROGRESS_STATUSES.includes(r.status)).length,
    reserved:   reservations.filter((r) => r.status === "reserved").length,
    checkedIn:  reservations.filter((r) => r.status === "checked-in").length,
    overdue:    reservations.filter(checkOverdue).length,
  };

  const summaryItems = [
    { label: "Total",       value: counts.total,      icon: CalendarCheck, color: "blue"   },
    { label: "In Progress", value: counts.inProgress, icon: Clock,         color: "orange" },
    { label: "Reserved",    value: counts.reserved,   icon: CheckCircle,   color: "green"  },
    { label: "Checked In",  value: counts.checkedIn,  icon: UserCheck,     color: "blue"   },
    { label: "Overdue",     value: counts.overdue,    icon: AlertTriangle, color: "red"    },
  ];

  const tabs = [
    { key: "reservations", label: "Reservations" },
    { key: "visits",       label: "Visit Schedules" },
    { key: "inquiries",    label: "Inquiries" },
  ];

  const filters = [
    ...(isSuperAdmin ? [{
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        { value: "gil puyat", label: "Gil Puyat" },
        { value: "guadalupe", label: "Guadalupe" },
      ],
      value: branchFilter,
      onChange: (v) => { setBranchFilter(v); setCurrentPage(1); },
    }] : []),
    {
      key: "status",
      options: [
        { value: "all",          label: "All Status" },
        { value: "in_progress",  label: "In Progress" },
        { value: "reserved",     label: "Reserved" },
        { value: "checked-in",   label: "Checked In" },
        { value: "overdue",      label: "Overdue" },
        { value: "cancelled",    label: "Cancelled" },
      ],
      value: statusFilter,
      onChange: (v) => { setStatusFilter(v); setCurrentPage(1); },
    },
  ];

  const columns = [
    {
      key: "applicant",
      label: "Applicant",
      sortable: true,
      render: (row) => (
        <div className="res-applicant-cell">
          <div
            className="res-avatar"
            style={{ background: avatarColor(row.customer) }}
            aria-label={row.customer}
          >
            {initials(row.customer)}
          </div>
          <div className="res-applicant-info">
            <span className="res-applicant-name">{row.customer}</span>
            <span className="res-applicant-email">{row.email}</span>
            <span className="res-applicant-code">{row.reservationCode}</span>
          </div>
        </div>
      ),
    },
    { key: "room", label: "Room", sortable: true },
    { key: "branch", label: "Branch", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={checkOverdue(row) ? "overdue" : row.status} />,
    },
    {
      key: "stage",
      label: "Stage",
      render: (row) => {
        const STAGE_MAP = {
          pending: { step: 1, label: "Room Selected" },
          visit_pending: { step: 2, label: "Visit Scheduled" },
          visit_approved: { step: 3, label: "Filling Application" },
          payment_pending: { step: 4, label: "Payment Submitted" },
          reserved: { step: 5, label: "Confirmed" },
          "checked-in": { step: 5, label: "Moved In" },
          "checked-out": { step: 5, label: "Completed" },
          cancelled: { step: 0, label: "Cancelled" },
        };
        const info = STAGE_MAP[row.status] || { step: "?", label: row.status };
        if (info.step === 0) return <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>—</span>;
        return (
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Step {info.step}/5 · {info.label}
          </span>
        );
      },
    },
    {
      key: "moveInDate",
      label: "Move-In",
      sortable: true,
      render: (row) => row.moveInDate
        ? new Date(row.moveInDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "—",
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (row) => row.createdAt
        ? new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "—",
    },
    {
      key: "actions",
      label: "",
      width: "70px",
      align: "right",
      render: (row) => (
        <div className="res-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="res-icon-btn"
            title="View details"
            onClick={() => handleView(row.id)}
          >
            <Eye size={16} />
          </button>
          {can("manageReservations") && (
            <button
              className="res-icon-btn res-icon-btn--danger"
              title="Delete"
              onClick={() => handleDelete(row.id)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageShell tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        <PageShell.Summary>
          {activeTab === "reservations" && <SummaryBar items={summaryItems} />}
        </PageShell.Summary>

        <PageShell.Actions>
          {activeTab === "reservations" && (
            <ActionBar
              search={{
                value: searchTerm,
                onChange: (v) => { setSearchTerm(v); setCurrentPage(1); },
                placeholder: "Search by name, email, code, or room...",
              }}
              filters={filters}
            />
          )}
        </PageShell.Actions>

        <PageShell.Content>
          {activeTab === "reservations" && (
            <DataTable
              columns={columns}
              data={pageData}
              loading={loading}
              onRowClick={(row) => handleView(row.id)}
              pagination={{
                page: currentPage,
                pageSize: itemsPerPage,
                total: totalFiltered,
                onPageChange: setCurrentPage,
              }}
              emptyState={{
                icon: CalendarCheck,
                title: "No reservations found",
                description: "Try adjusting your filters.",
              }}
            />
          )}
          {activeTab === "visits"    && <VisitSchedulesTab />}
          {activeTab === "inquiries" && <InquiriesPage isEmbedded />}
        </PageShell.Content>
      </PageShell>

      {/* Modals rendered outside PageShell so they are never swallowed by slot filtering */}
      {selectedReservation && (
        <ReservationDetailsModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={refetchReservations}
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
    </>
  );
}

export default ReservationsPage;
