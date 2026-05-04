import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtShortDate as formatShortDate } from "../../../shared/utils/dateFormat";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle,
  Clock,
  Eye,
  FileDown,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { reservationApi } from "../../../shared/api/apiClient";
import { queryKeys } from "../../../shared/lib/queryKeys";
import { showNotification } from "../../../shared/utils/notification";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import {
  normalizeBranchFilterValue,
  syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
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
import VisitAvailabilityTab from "../components/VisitAvailabilityTab";
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

// formatShortDate moved to shared/utils/dateFormat — imported at top of file

const SUMMARY_FILTERS = ["all", "in_progress", "reserved", "moveIn", "overdue"];
function ReservationsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner" || user?.role === "superadmin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("reservations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("active");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      fallbackBranch: isOwner ? null : user?.branch,
      allValue: "all",
    }),
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
  } = useReservations({ view: "admin-list", archive: archiveFilter });
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

  useEffect(() => {
    const nextBranch = normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      fallbackBranch: isOwner ? null : user?.branch,
      allValue: "all",
    });

    setBranchFilter((current) => (current === nextBranch ? current : nextBranch));
  }, [isOwner, requestedBranch, user?.branch]);

  useEffect(() => {
    if (!user?.role) return;

    const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
      enabled: isOwner,
      allValue: "all",
    });

    if (nextParams.toString() === searchParams.toString()) return;
    setSearchParams(nextParams, { replace: true });
  }, [branchFilter, isOwner, searchParams, setSearchParams, user?.role]);

  useEffect(() => {
    if (statusFilter === "archived") {
      setStatusFilter("all");
      setCurrentPage(1);
    }
  }, [statusFilter]);

  const summaryItems = useMemo(
    () => [
      { label: "Total", value: counts.total, icon: CalendarCheck, color: "blue" },
      { label: "Pending", value: counts.inProgress, icon: Clock, color: "orange" },
      { label: "Reserved", value: counts.reserved, icon: CheckCircle, color: "green" },
      { label: "Checked In", value: counts.movedIn, icon: UserCheck, color: "blue" },
      { label: "Overdue", value: counts.overdue, icon: AlertTriangle, color: "red" },
    ],
    [counts],
  );
  const activeSummaryIndex = SUMMARY_FILTERS.indexOf(statusFilter);

  const tabs = useMemo(
    () => [
      { key: "reservations", label: "Reservations" },
      { key: "visits", label: "Visit Schedules" },
      { key: "availability", label: "Availability Rules" },
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
        key: "archive",
        options: [
          { value: "active", label: "Active Records" },
          { value: "archived", label: "Archived Records" },
          { value: "all", label: "All Records" },
        ],
        value: archiveFilter,
        onChange: (value) => {
          setArchiveFilter(value);
          setStatusFilter("all");
          setCurrentPage(1);
        },
      },
      {
        key: "status",
        options: [
          { value: "all", label: "All Status" },
          { value: "in_progress", label: "In Progress" },
          { value: "overdue", label: "Overdue" },
          ...CANONICAL_RESERVATION_STATUSES.filter(
            (status) => status !== "archived",
          ).map((status) => ({
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
    [archiveFilter, branchFilter, isOwner, statusFilter],
  );

  const prefetchReservationDetail = useCallback(async (reservationId) => {
    if (!reservationId) return null;
    return queryClient.fetchQuery({
      queryKey: queryKeys.reservations.detail(reservationId),
      queryFn: () => reservationApi.getById(reservationId),
    });
  }, [queryClient]);

  useEffect(() => {
    if (!selectedReservation?.id) return;

    const liveReservation = reservations.find(
      (reservation) => reservation.id === selectedReservation.id,
    );

    if (!liveReservation) return;

    setSelectedReservation((previous) => {
      if (!previous) return previous;
      if (
        previous.status === liveReservation.status &&
        previous.moveInDate === liveReservation.moveInDate &&
        previous.moveOutDate === liveReservation.moveOutDate
      ) {
        return previous;
      }

      return {
        ...previous,
        customer: liveReservation.customer,
        email: liveReservation.email,
        room: liveReservation.room,
        branch: liveReservation.branch,
        branchCode: liveReservation.branchCode,
        roomType: liveReservation.roomType,
        reservationCode: liveReservation.reservationCode,
        status: liveReservation.status,
        moveInDate: liveReservation.moveInDate,
        moveOutDate: liveReservation.moveOutDate,
        createdAt: liveReservation.createdAt,
      };
    });
  }, [reservations, selectedReservation]);

  const handleView = useCallback(async (reservationId) => {
    try {
      const reservation = await prefetchReservationDetail(reservationId);
      setSelectedReservation({
        ...reservation,
        id: reservation._id,
        customer:
          reservation.customer ||
          `${reservation.userId?.firstName || ""} ${reservation.userId?.lastName || ""}`.trim() ||
          "Unknown",
        email: reservation.email || reservation.userId?.email || "-",
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
        idType: reservation.idType,
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

  const handleDelete = useCallback((reservation) => {
    const isPermanentDelete = reservation?.isArchived === true;
    setConfirmModal({
      open: true,
      title: isPermanentDelete ? "Permanently Delete Reservation" : "Archive Reservation",
      message:
        isPermanentDelete
          ? "This permanently removes the archived reservation. It cannot be restored, and the server will block deletion if issued bills exist."
          : "This archives the reservation and preserves billing history. Use the Archived filter if you need to permanently delete it later.",
      variant: "danger",
      confirmText: isPermanentDelete ? "Delete Permanently" : "Archive",
      onConfirm: async () => {
        setConfirmModal((previous) => ({ ...previous, open: false }));
        try {
          await reservationApi.delete(reservation.id, {
            hardDelete: isPermanentDelete,
          });
          showNotification(
            isPermanentDelete
              ? "Reservation permanently deleted"
              : "Reservation archived",
            "success",
          );
          refetchReservations();
        } catch (error) {
          showNotification(
            error?.message ||
              (isPermanentDelete
                ? "Failed to permanently delete reservation"
                : "Failed to archive reservation"),
            "error",
          );
        }
      },
    });
  }, [refetchReservations]);

  const handleExportReservations = useCallback(() => {
    exportToCSV(
      sortedReservations.map((reservation) => ({
        reservationCode: reservation.reservationCode,
        applicant: reservation.customer,
        email: reservation.email,
        branch: reservation.branch,
        room: reservation.room,
        status: RESERVATION_STATUS_LABELS[reservation.status] || reservation.status,
        moveInDate: formatShortDate(readMoveInDate(reservation)),
        createdAt: formatShortDate(reservation.createdAt),
      })),
      [
        { key: "reservationCode", label: "Reservation Code" },
        { key: "applicant", label: "Applicant" },
        { key: "email", label: "Email" },
        { key: "branch", label: "Branch" },
        { key: "room", label: "Room" },
        { key: "status", label: "Status" },
        { key: "moveInDate", label: "Move In" },
        { key: "createdAt", label: "Created" },
      ],
      "reservations",
    );
  }, [sortedReservations]);

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
      {
        key: "room",
        label: "Room",
        sortable: true,
        render: (row) => (
          <div className="res-room-cell">
            <span className="res-room-name">{row.room}</span>
            <span className="res-room-meta">
              {row.roomType || "Room"} · {row.branch}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <StatusBadge status={checkOverdueReservation(row) ? "overdue" : row.status} />
        ),
      },
      {
        key: "record",
        label: "Record",
        render: (row) => (
          <StatusBadge status={row.isArchived ? "archived" : "active"} />
        ),
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
                title={row.isArchived ? "Delete permanently" : "Archive"}
                onClick={() => handleDelete(row)}
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
              className="page-shell__panel reservations-workspace"
              role="tabpanel"
              aria-labelledby="page-shell-tab-reservations"
            >
              <div className="reservations-workspace__summary">
                <SummaryBar
                  items={summaryItems}
                  activeIndex={activeSummaryIndex}
                  onItemClick={(index) => {
                    const nextFilter = index < 0 ? "all" : SUMMARY_FILTERS[index];
                    setStatusFilter(nextFilter);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="reservations-workspace__toolbar">
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
                  actions={[
                    {
                      label: "Export CSV",
                      icon: FileDown,
                      onClick: handleExportReservations,
                    },
                  ]}
                />
              </div>
              <div className="reservations-workspace__table">
                <DataTable
                  columns={columns}
                  data={sortedReservations}
                  loading={loading}
                  exportable={true}
                  exportFilename="Reservations"
                  exportTitle="Reservations Export"
                  disableRowInteraction
                  sorting="external"
                  sortKey={sortState.key}
                  sortDir={sortState.dir}
                  onSortChange={(key, dir) => setSortState({ key, dir })}
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
              </div>
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
          {activeTab === "availability" && (
            <section
              id="page-shell-panel-availability"
              className="page-shell__panel"
              role="tabpanel"
              aria-labelledby="page-shell-tab-availability"
            >
              <VisitAvailabilityTab />
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



