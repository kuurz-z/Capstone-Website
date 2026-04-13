import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Search,
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
import { StatusBadge } from "../components/shared";
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

function formatShortDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SUMMARY_FILTERS = ["all", "in_progress", "reserved", "moveIn", "overdue"];
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
      { label: "Pending", value: counts.inProgress, icon: Clock, color: "orange" },
      { label: "Reserved", value: counts.reserved, icon: CheckCircle, color: "green" },
      { label: "Checked In", value: counts.movedIn, icon: UserCheck, color: "blue" },
      { label: "Overdue", value: counts.overdue, icon: AlertTriangle, color: "red" },
    ],
    [counts],
  );

  const summaryColorClasses = {
    blue: {
      base: "border-blue-100 bg-blue-50/60",
      active: "border-blue-300 bg-blue-100/80 shadow-sm ring-1 ring-blue-200",
      icon: "text-blue-600",
      label: "text-blue-700",
      value: "text-blue-900",
    },
    orange: {
      base: "border-amber-100 bg-amber-50/60",
      active: "border-amber-300 bg-amber-100/80 shadow-sm ring-1 ring-amber-200",
      icon: "text-amber-600",
      label: "text-amber-700",
      value: "text-amber-900",
    },
    green: {
      base: "border-emerald-100 bg-emerald-50/60",
      active: "border-emerald-300 bg-emerald-100/80 shadow-sm ring-1 ring-emerald-200",
      icon: "text-emerald-600",
      label: "text-emerald-700",
      value: "text-emerald-900",
    },
    red: {
      base: "border-red-100 bg-red-50/60",
      active: "border-red-300 bg-red-100/80 shadow-sm ring-1 ring-red-200",
      icon: "text-red-600",
      label: "text-red-700",
      value: "text-red-900",
    },
  };

  const tabs = useMemo(
    () => [
      { key: "reservations", label: "Reservations" },
      { key: "visits", label: "Visit Schedules" },
      { key: "inquiries", label: "Inquiries" },
    ],
    [],
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All Status" },
      { value: "in_progress", label: "In Progress" },
      { value: "overdue", label: "Overdue" },
      ...CANONICAL_RESERVATION_STATUSES.map((status) => ({
        value: status,
        label: RESERVATION_STATUS_LABELS[status] || status,
      })),
    ],
    [],
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

  const paginatedReservations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedReservations.slice(start, start + itemsPerPage);
  }, [currentPage, itemsPerPage, sortedReservations]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
  const paginatedStart = totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const paginatedEnd = Math.min(currentPage * itemsPerPage, totalFiltered);

  const handleSort = useCallback((key) => {
    setSortState((previous) => {
      if (previous.key !== key) return { key, dir: "asc" };
      return { key, dir: previous.dir === "asc" ? "desc" : "asc" };
    });
  }, []);

  const sortIndicator = (key) => {
    if (sortState.key !== key) return "";
    return sortState.dir === "asc" ? "▲" : "▼";
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50/50">
        <div className="border-b border-gray-200/60 bg-gradient-to-b from-gray-100/70 to-gray-50/40">
          <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold tracking-[0.01em] transition-all duration-200 ${
                    activeTab === tab.key
                      ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                      : "text-gray-500 hover:bg-white/70 hover:text-gray-700"
                  }`}
                  id={`page-shell-tab-${tab.key}`}
                >
                  {tab.label}
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>

        {activeTab === "reservations" && (
          <section
            id="page-shell-panel-reservations"
            role="tabpanel"
            aria-labelledby="page-shell-tab-reservations"
            className="w-full px-4 pb-4 pt-3 sm:px-6 lg:px-8"
          >
            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {summaryItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = statusFilter === SUMMARY_FILTERS[index];
                const palette = summaryColorClasses[item.color] || summaryColorClasses.blue;

                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      const nextFilter = SUMMARY_FILTERS[index] || "all";
                      setStatusFilter(nextFilter);
                      setCurrentPage(1);
                    }}
                    className={`min-h-[132px] rounded-xl border p-5 text-left transition-all ${
                      isActive
                        ? palette.active
                        : `${palette.base} hover:shadow-sm`
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <Icon
                        className={`h-5 w-5 ${palette.icon}`}
                      />
                      <span
                        className={`text-sm font-medium ${palette.label}`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div
                      className={`text-3xl font-semibold leading-none ${palette.value}`}
                    >
                      {item.value}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative w-full md:max-w-lg">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by name, email, code, or room..."
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-11 pr-4 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {isOwner && (
                  <select
                    value={branchFilter}
                    onChange={(event) => {
                      setBranchFilter(event.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {OWNER_BRANCH_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {loading ? (
                <div className="p-12 text-center">
                  <p className="text-base text-gray-500">Loading reservations...</p>
                </div>
              ) : paginatedReservations.length === 0 ? (
                <div className="p-12 text-center">
                  <CalendarCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-base font-medium text-gray-900">No reservations found</p>
                  <p className="mt-1 text-base text-gray-500">Try adjusting your filters</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-gray-200 bg-gray-50/80">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <button
                              className="text-sm font-semibold uppercase tracking-wide text-gray-600"
                              onClick={() => handleSort("customer")}
                            >
                              Applicant {sortIndicator("customer")}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left">
                            <button
                              className="text-sm font-semibold uppercase tracking-wide text-gray-600"
                              onClick={() => handleSort("room")}
                            >
                              Room {sortIndicator("room")}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left">
                            <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                              Status
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left">
                            <button
                              className="text-sm font-semibold uppercase tracking-wide text-gray-600"
                              onClick={() => handleSort("moveInDate")}
                            >
                              Move-In {sortIndicator("moveInDate")}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left">
                            <button
                              className="text-sm font-semibold uppercase tracking-wide text-gray-600"
                              onClick={() => handleSort("createdAt")}
                            >
                              Date {sortIndicator("createdAt")}
                            </button>
                          </th>
                          <th className="w-[100px] px-4 py-3 text-right">
                            <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                              Actions
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedReservations.map((row) => (
                          <tr
                            key={row.id}
                            className="transition-colors hover:bg-gray-50/50"
                            onMouseEnter={() => {
                              prefetchReservationDetail(row.id).catch(() => {});
                            }}
                            onFocus={() => {
                              prefetchReservationDetail(row.id).catch(() => {});
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                  style={{ background: avatarColor(row.customer) }}
                                  aria-label={row.customer}
                                >
                                  {initials(row.customer)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-base font-medium text-gray-900">
                                    {row.customer}
                                  </div>
                                  <div className="truncate text-sm text-gray-500">{row.email}</div>
                                  <div className="font-mono text-sm text-gray-400">
                                    {row.reservationCode}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-base font-medium text-gray-900">{row.room}</div>
                              <div className="text-sm text-gray-500">
                                {row.roomType || "Room"} · {row.branch}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                status={checkOverdueReservation(row) ? "overdue" : row.status}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-base text-gray-700">
                                {formatShortDate(row.moveInDate)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-base text-gray-700">
                                {formatShortDate(row.createdAt)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div
                                className="flex items-center justify-end gap-1"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  onClick={() => handleView(row.id)}
                                  className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                  title="View details"
                                >
                                  <Eye className="h-5 w-5" />
                                </button>
                                {can("manageReservations") && (
                                  <button
                                    onClick={() => handleDelete(row.id)}
                                    className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                      <div className="text-base text-gray-500">
                        Showing {paginatedStart} to {paginatedEnd} of {totalFiltered} results
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <span className="text-base text-gray-700">
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="rounded-lg p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {activeTab === "visits" && (
          <section
            id="page-shell-panel-visits"
            role="tabpanel"
            aria-labelledby="page-shell-tab-visits"
            className="w-full px-4 pb-4 pt-3 sm:px-6 lg:px-8"
          >
            <VisitSchedulesTab />
          </section>
        )}

        {activeTab === "inquiries" && (
          <section
            id="page-shell-panel-inquiries"
            role="tabpanel"
            aria-labelledby="page-shell-tab-inquiries"
            className="w-full px-4 pb-4 pt-3 sm:px-6 lg:px-8"
          >
            <InquiriesPage isEmbedded />
          </section>
        )}
      </div>

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



