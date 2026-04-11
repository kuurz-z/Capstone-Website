import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle,
  Clock,
  Eye,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { reservationApi } from "../../../shared/api/apiClient";
import { queryKeys } from "../../../shared/lib/queryKeys";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import {
  CANONICAL_RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  hasReservationStatus,
  readMoveInDate,
} from "../../../shared/utils/lifecycleNaming";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import VisitSchedulesTab from "../components/VisitSchedulesTab";
import InquiriesPage from "./InquiriesPage";
import {
  ActionBar,
  DataTable,
  PageShell,
  StatusBadge,
  SummaryBar,
} from "../components/shared";
import {
  IN_PROGRESS_STATUSES,
  RESERVATION_STAGE_MAP,
  checkOverdueReservation,
  getBranchLabel,
  mapReservationAdminRow,
} from "../utils/reservationRows";
import "../styles/design-tokens.css";
import "../styles/admin-reservations.css";

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

function initials(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

function formatShortDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ReservationsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const [activeTab, setActiveTab] = useState("reservations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(
    isOwner ? "all" : user?.branch || "all",
  );
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState({ key: "createdAt", dir: "desc" });
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });
  const itemsPerPage = 12;

  const {
    data: rawReservations = [],
    isLoading: loading,
    error: queryError,
  } = useReservations({ view: "admin-list" });
  const error = queryError?.message || null;

  const reservations = useMemo(
    () => rawReservations.map(mapReservationAdminRow),
    [rawReservations],
  );

  const counts = useMemo(
    () => ({
      total: reservations.length,
      inProgress: reservations.filter((reservation) =>
        IN_PROGRESS_STATUSES.includes(reservation.status),
      ).length,
      reserved: reservations.filter(
        (reservation) => reservation.status === "reserved",
      ).length,
      movedIn: reservations.filter(
        (reservation) => hasReservationStatus(reservation.status, "moveIn"),
      ).length,
      overdue: reservations.filter(checkOverdueReservation).length,
    }),
    [reservations],
  );

  const filteredReservations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return reservations.filter((reservation) => {
      const matchSearch =
        !query ||
        reservation.customer.toLowerCase().includes(query) ||
        reservation.email.toLowerCase().includes(query) ||
        reservation.reservationCode.toLowerCase().includes(query) ||
        reservation.room.toLowerCase().includes(query);
      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "overdue"
            ? checkOverdueReservation(reservation)
            : statusFilter === "in_progress"
              ? IN_PROGRESS_STATUSES.includes(reservation.status)
              : hasReservationStatus(reservation.status, statusFilter);
      const matchBranch =
        branchFilter === "all" ||
        reservation.branchCode === branchFilter;
      return matchSearch && matchStatus && matchBranch;
    });
  }, [branchFilter, reservations, searchTerm, statusFilter]);

  const sortedReservations = useMemo(() => {
    const { key, dir } = sortState;
    if (!key) return filteredReservations;

    return [...filteredReservations].sort((left, right) => {
      const leftValue = left[key];
      const rightValue = right[key];

      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      let comparison = 0;
      if (key === "createdAt") {
        comparison = new Date(leftValue) - new Date(rightValue);
      } else if (key === "moveInDate") {
        comparison =
          new Date(readMoveInDate(left)) - new Date(readMoveInDate(right));
      } else if (typeof leftValue === "string") {
        comparison = leftValue.localeCompare(rightValue);
      } else {
        comparison = leftValue - rightValue;
      }

      return dir === "asc" ? comparison : -comparison;
    });
  }, [filteredReservations, sortState]);

  const totalFiltered = sortedReservations.length;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, itemsPerPage, totalFiltered]);

  const summaryItems = useMemo(
    () => [
      { label: "Total", value: counts.total, icon: CalendarCheck, color: "blue" },
      { label: "In Progress", value: counts.inProgress, icon: Clock, color: "orange" },
      { label: "Reserved", value: counts.reserved, icon: CheckCircle, color: "green" },
      { label: "Moved In", value: counts.movedIn, icon: UserCheck, color: "blue" },
      { label: "Overdue", value: counts.overdue, icon: AlertTriangle, color: "red" },
    ],
    [counts],
  );

  const tabs = useMemo(
    () => [
      { key: "reservations", label: "Reservations" },
      { key: "visits", label: "Visit Schedules" },
      { key: "inquiries", label: "Inquiries" },
    ],
    [],
  );

  const filters = useMemo(
    () => [
      ...(isOwner
        ? [
            {
              key: "branch",
              options: OWNER_BRANCH_FILTER_OPTIONS,
              value: branchFilter,
              onChange: (value) => {
                setBranchFilter(value);
                setCurrentPage(1);
              },
            },
          ]
        : []),
      {
        key: "status",
        options: [
          { value: "all", label: "All Status" },
          { value: "in_progress", label: "In Progress" },
          { value: "overdue", label: "Overdue" },
          ...CANONICAL_RESERVATION_STATUSES.map((status) => ({
            value: status,
            label: RESERVATION_STATUS_LABELS[status] || status,
          })),
        ],
        value: statusFilter,
        onChange: (value) => {
          setStatusFilter(value);
          setCurrentPage(1);
        },
      },
    ],
    [branchFilter, isOwner, statusFilter],
  );

  const prefetchReservationDetail = useCallback(async (reservationId) => {
    if (!reservationId) return null;
    return queryClient.ensureQueryData({
      queryKey: queryKeys.reservations.detail(reservationId),
      queryFn: () => reservationApi.getById(reservationId),
    });
  }, [queryClient]);

  const handleView = useCallback(async (reservationId) => {
    try {
      const reservation = await prefetchReservationDetail(reservationId);
      setSelectedReservation({
        ...reservation,
        id: reservation._id,
        customer:
          `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
          "Unknown",
        email: reservation.userId?.email || "-",
        room: reservation.roomId?.name || reservation.roomId?.roomNumber || "-",
        branch: getBranchLabel(reservation.roomId?.branch),
        branchCode: reservation.roomId?.branch || "",
        roomType: reservation.roomId?.type || "",
        status: reservation.status || "pending",
        totalPrice: reservation.totalPrice,
        paymentStatus: reservation.paymentStatus,
        paymentMethod: reservation.paymentMethod,
        createdAt: reservation.createdAt,
        reservationCode: reservation.reservationCode || "-",
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        middleName: reservation.middleName,
        nickname: reservation.nickname,
        phone: reservation.mobileNumber || reservation.phone,
        birthday: reservation.birthday,
        maritalStatus: reservation.maritalStatus,
        nationality: reservation.nationality,
        educationLevel: reservation.educationLevel,
        address: reservation.address,
        emergencyContact: reservation.emergencyContact,
        healthConcerns: reservation.healthConcerns,
        employment: reservation.employment,
        selfiePhotoUrl: reservation.selfiePhotoUrl,
        validIDFrontUrl: reservation.validIDFrontUrl,
        validIDBackUrl: reservation.validIDBackUrl,
        validIDType: reservation.validIDType,
        nbiClearanceUrl: reservation.nbiClearanceUrl,
        nbiReason: reservation.nbiReason,
        companyIDUrl: reservation.companyIDUrl,
        companyIDReason: reservation.companyIDReason,
        finalMoveInDate: reservation.finalMoveInDate,
        proofOfPaymentUrl: reservation.proofOfPaymentUrl,
        leaseDuration: reservation.leaseDuration,
        billingEmail: reservation.billingEmail,
        moveInDate: reservation.moveInDate,
        moveOutDate: reservation.moveOutDate,
        visitDate: reservation.visitDate,
        visitTime: reservation.visitTime,
        visitApproved: reservation.visitApproved,
        notes: reservation.notes,
      });
    } catch {
      const fallbackReservation = reservations.find(
        (reservation) => reservation.id === reservationId,
      );
      if (fallbackReservation) {
        setSelectedReservation(fallbackReservation);
      }
    }
  }, [prefetchReservationDetail, reservations]);

  const refetchReservations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["reservations"] }),
    [queryClient],
  );

  const handleDelete = useCallback((reservationId) => {
    setConfirmModal({
      open: true,
      title: "Archive Reservation",
      message:
        "This action archives the reservation and preserves billing history. Permanent deletion is restricted when issued bills exist.",
      variant: "danger",
      confirmText: "Archive",
      onConfirm: async () => {
        setConfirmModal((previous) => ({ ...previous, open: false }));
        try {
          await reservationApi.delete(reservationId);
          showNotification("Reservation archived", "success");
          refetchReservations();
        } catch (error) {
          showNotification(error?.message || "Failed to archive reservation", "error");
        }
      },
    });
  }, [refetchReservations]);

  const columns = useMemo(
    () => [
      {
        key: "applicant",
        sortKey: "customer",
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
        render: (row) => (
          <StatusBadge status={checkOverdueReservation(row) ? "overdue" : row.status} />
        ),
      },
      {
        key: "stage",
        label: "Stage",
        render: (row) => {
          const info = RESERVATION_STAGE_MAP[row.status] || {
            step: "?",
            label: row.status,
          };
          if (info.step === 0) {
            return (
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-muted)",
                }}
              >
                -
              </span>
            );
          }
          return (
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              Step {info.step}/5 · {info.label}
            </span>
          );
        },
      },
      {
        key: "moveInDate",
        label: "Move-In",
        sortable: true,
        render: (row) => formatShortDate(row.moveInDate),
      },
      {
        key: "createdAt",
        label: "Date",
        sortable: true,
        render: (row) => formatShortDate(row.createdAt),
      },
      {
        key: "actions",
        label: "",
        width: "70px",
        align: "right",
        render: (row) => (
          <div className="res-actions" onClick={(event) => event.stopPropagation()}>
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
    ],
    [can, handleDelete, handleView],
  );

  return (
    <>
      <PageShell tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        <PageShell.Content>
          {activeTab === "reservations" && (
            <section
              id="page-shell-panel-reservations"
              className="page-shell__panel"
              role="tabpanel"
              aria-labelledby="page-shell-tab-reservations"
            >
              <SummaryBar items={summaryItems} />
              <ActionBar
                search={{
                  value: searchTerm,
                  onChange: (value) => {
                    setSearchTerm(value);
                    setCurrentPage(1);
                  },
                  placeholder: "Search by name, email, code, or room...",
                }}
                filters={filters}
              />
              <DataTable
                columns={columns}
                data={sortedReservations}
                loading={loading}
                sorting="external"
                sortKey={sortState.key}
                sortDir={sortState.dir}
                onSortChange={(key, dir) => setSortState({ key, dir })}
                onRowClick={(row) => handleView(row.id)}
                onRowHover={(row) => {
                  prefetchReservationDetail(row.id).catch(() => {});
                }}
                onRowFocus={(row) => {
                  prefetchReservationDetail(row.id).catch(() => {});
                }}
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
            </section>
          )}
          {activeTab === "visits" && (
            <section
              id="page-shell-panel-visits"
              className="page-shell__panel"
              role="tabpanel"
              aria-labelledby="page-shell-tab-visits"
            >
              <VisitSchedulesTab />
            </section>
          )}
          {activeTab === "inquiries" && (
            <section
              id="page-shell-panel-inquiries"
              className="page-shell__panel"
              role="tabpanel"
              aria-labelledby="page-shell-tab-inquiries"
            >
              <InquiriesPage isEmbedded />
            </section>
          )}
        </PageShell.Content>
      </PageShell>

      {selectedReservation && (
        <ReservationDetailsModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onUpdate={refetchReservations}
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
      {error && <div className="sr-only">{error}</div>}
    </>
  );
}

export default ReservationsPage;



