import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  RotateCcw,
  Search,
  Trash2,
  X as XIcon,
  AlertCircle,
  CalendarDays,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import VisitDetailsModal from "./VisitDetailsModal";
import { StatusBadge } from "./shared";
import { mapVisitScheduleRows } from "../utils/reservationRows";
import "../styles/design-tokens.css";
import "../styles/admin-reservations.css";

const getAvatarColor = (initials = "") => {
  const colors = [
    "bg-[color:var(--chart-5)] text-white",
    "bg-[color:var(--chart-1)] text-white",
    "bg-[color:var(--chart-4)] text-white",
    "bg-[color:var(--danger)] text-white",
    "bg-[color:var(--chart-2)] text-white",
    "bg-[color:var(--warning)] text-white",
  ];
  const charCode = initials.length > 0 ? initials.charCodeAt(0) : 0;
  const index = charCode % colors.length;
  return colors[index];
};

function initials(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

function VisitSchedulesTab() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
    onConfirm: null,
  });
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [activeFilter, setActiveFilter] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: rawReservations = [], isLoading: loading } = useReservations({
    view: "admin-list",
  });

  const schedules = useMemo(
    () => mapVisitScheduleRows(rawReservations),
    [rawReservations],
  );

  const upcoming = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          !schedule.isHistorical &&
          !schedule.visitApproved &&
          !schedule.scheduleRejected &&
          new Date(schedule.visitDate) >= new Date(),
      ),
    [schedules],
  );
  const completed = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          (!schedule.isHistorical && schedule.visitApproved) ||
          (schedule.isHistorical && schedule.historyStatus === "approved"),
      ),
    [schedules],
  );
  const noShows = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          !schedule.isHistorical &&
          !schedule.visitApproved &&
          !schedule.scheduleRejected &&
          new Date(schedule.visitDate) < new Date(),
      ),
    [schedules],
  );
  const rejected = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          schedule.scheduleRejected ||
          (schedule.isHistorical && schedule.historyStatus === "rejected"),
      ),
    [schedules],
  );
  const cancelled = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          (schedule.isHistorical && schedule.historyStatus === "cancelled") ||
          (!schedule.isHistorical && schedule.status === "cancelled"),
      ),
    [schedules],
  );

  const refetchAll = () =>
    queryClient.invalidateQueries({ queryKey: ["reservations"] });

  const confirmAction = (
    title,
    message,
    variant,
    confirmText,
    action,
    successMsg = null,
    errorMsg = null,
  ) => {
    setConfirmModal({
      open: true,
      title,
      message,
      variant,
      confirmText,
      onConfirm: async () => {
        setConfirmModal((previous) => ({ ...previous, open: false }));
        try {
          await action();
          refetchAll();
          if (successMsg) showNotification(successMsg, "success", 3000);
        } catch {
          showNotification(errorMsg || `Failed: ${title}`, "error", 3000);
        }
      },
    });
  };

  const handleVerify = (id) => {
    confirmAction(
      "Verify Attendance",
      "Confirm the applicant's on-site attendance?",
      "info",
      "Verify",
      async () => {
        setActionLoading(id);
        try {
          await reservationApi.update(id, {
            scheduleApproved: true,
            visitApproved: true,
            status: "visit_approved",
          });
        } finally {
          setActionLoading(null);
        }
      },
      "Attendance verified successfully",
      "Failed to verify attendance. Please try again.",
    );
  };

  const handleRevoke = (id) => {
    confirmAction(
      "Revoke Verification",
      "Revoke this applicant's attendance verification?",
      "danger",
      "Revoke",
      async () => {
        await reservationApi.update(id, {
          scheduleApproved: false,
          visitApproved: false,
        });
      },
      "Verification revoked successfully",
      "Failed to verify attendance. Please try again.",
    );
  };

  const handleDelete = (id) => {
    confirmAction(
      "Archive Visit Schedule",
      "This action archives the reservation record for this visit schedule and preserves billing history.",
      "danger",
      "Archive",
      async () => {
        await reservationApi.delete(id);
      },
      "Visit schedule archived",
      "Failed to archive visit schedule. Please try again.",
    );
  };

  const handleDeleteHistoryEntry = (reservationId, historyIndex) => {
    confirmAction(
      "Delete History Entry",
      "Remove this visit history entry?",
      "danger",
      "Delete",
      async () => {
        await reservationApi.update(reservationId, {
          removeVisitHistoryIndex: historyIndex,
        });
      },
      "History entry removed",
      "Failed to remove history entry. Please try again.",
    );
  };

  const summaryItems = useMemo(
    () => [
      { label: "All", value: schedules.length, icon: Calendar, color: "blue" },
      {
        label: "Pending",
        value: upcoming.length,
        icon: Clock,
        color: "orange",
      },
      {
        label: "Approved",
        value: completed.length,
        icon: CheckCircle,
        color: "green",
      },
      {
        label: "Rejected",
        value: rejected.length,
        icon: XIcon,
        color: "red",
      },
      {
        label: "No-Show",
        value: noShows.length,
        icon: AlertCircle,
        color: "red",
      },
      { label: "Cancelled", value: cancelled.length, icon: Ban, color: "red" },
    ],
    [
      cancelled.length,
      completed.length,
      rejected.length,
      noShows.length,
      schedules.length,
      upcoming.length,
    ],
  );

  const displayData = useMemo(() => {
    let base;
    if (activeFilter === 0) base = schedules;
    else if (activeFilter === 1) base = upcoming;
    else if (activeFilter === 2) base = completed;
    else if (activeFilter === 3) base = rejected;
    else if (activeFilter === 4) base = noShows;
    else if (activeFilter === 5) base = cancelled;
    else base = schedules;

    const query = searchTerm.trim().toLowerCase();
    let result = base.filter((schedule) => {
      const matchSearch =
        !query ||
        schedule.customer.toLowerCase().includes(query) ||
        schedule.email.toLowerCase().includes(query) ||
        schedule.reservationCode.toLowerCase().includes(query) ||
        schedule.room.toLowerCase().includes(query);
      const matchBranch =
        branchFilter === "all" ||
        schedule.branch.toLowerCase() === branchFilter.toLowerCase();
      return matchSearch && matchBranch;
    });

    if (sortBy === "oldest") {
      result = [...result].sort(
        (left, right) =>
          new Date(left.scheduledDate || 0) -
          new Date(right.scheduledDate || 0),
      );
    } else if (sortBy === "name-az") {
      result = [...result].sort((left, right) =>
        left.customer.localeCompare(right.customer),
      );
    } else if (sortBy === "name-za") {
      result = [...result].sort((left, right) =>
        right.customer.localeCompare(left.customer),
      );
    }

    return result;
  }, [
    activeFilter,
    branchFilter,
    cancelled,
    completed,
    noShows,
    rejected,
    schedules,
    searchTerm,
    sortBy,
    upcoming,
  ]);

  const totalPages = Math.max(1, Math.ceil(displayData.length / itemsPerPage));
  const paginatedData = useMemo(
    () =>
      displayData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
      ),
    [currentPage, displayData],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm, branchFilter, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6">
      <div className="grid grid-flow-col auto-cols-[minmax(150px,1fr)] gap-3 overflow-x-auto pb-1">
        {summaryItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeFilter === index;

          return (
            <div
              key={item.label}
              onClick={() => setActiveFilter(index)}
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: isActive
                  ? "color-mix(in srgb, var(--primary) 55%, var(--border-light))"
                  : "var(--border-light)",
              }}
              className="border rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer min-h-[108px]"
            >
              <div className="flex items-start justify-between mb-3">
                <Icon
                  className={`w-5 h-5 ${
                    item.color === "blue"
                      ? "text-[color:var(--info)]"
                      : item.color === "orange"
                        ? "text-[color:var(--warning)]"
                        : item.color === "green"
                          ? "text-[color:var(--success)]"
                          : "text-[color:var(--danger)]"
                  }`}
                />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">
                  {item.label}
                </span>
              </div>
              <div
                className={`text-[28px] font-medium leading-none ${
                  item.color === "blue"
                    ? "text-[color:var(--info)]"
                    : item.color === "orange"
                      ? "text-[color:var(--warning)]"
                      : item.color === "green"
                        ? "text-[color:var(--success)]"
                        : "text-[color:var(--danger)]"
                }`}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="border rounded-lg p-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-light)",
        }}
      >
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, code, or room..."
              style={{
                backgroundColor: "var(--input-background)",
                borderColor: "var(--border-light)",
              }}
              className="w-full pl-10 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              style={{
                backgroundColor: "var(--input-background)",
                borderColor: "var(--border-light)",
              }}
              className="px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Branches</option>
              <option value="Gil Puyat">Gil Puyat</option>
              <option value="Guadalupe">Guadalupe</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              style={{
                backgroundColor: "var(--input-background)",
                borderColor: "var(--border-light)",
              }}
              className="px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="name-az">Name A-Z</option>
              <option value="name-za">Name Z-A</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-base text-muted-foreground">
                Loading visit schedules...
              </p>
            </div>
          ) : displayData.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">
                No visit schedules
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                Visit schedules will appear here.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    borderColor: "var(--border-light)",
                    backgroundColor:
                      "color-mix(in srgb, var(--bg-inset) 30%, transparent)",
                  }}
                >
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Visitor
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Room
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Requested
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Visit Appointment
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row) => {
                  const isDim = row.isHistorical ? "opacity-55" : "";
                  const now = new Date();
                  const visitDate = new Date(row.visitDate);
                  const isUpcoming =
                    !row.visitApproved &&
                    !row.scheduleRejected &&
                    visitDate >= now;
                  const actionedDate = row.actionedAt
                    ? new Date(row.actionedAt)
                    : null;

                  let statusNode;
                  if (row.isHistorical) {
                    const historyMap = {
                      rejected: { status: "overdue", label: "Rejected" },
                      approved: { status: "verified", label: "Approved" },
                      cancelled: { status: "overdue", label: "Cancelled" },
                      pending: { status: "pending", label: "Scheduled" },
                    };
                    const config =
                      historyMap[row.historyStatus] || historyMap.pending;
                    statusNode = (
                      <div className="opacity-60">
                        <StatusBadge
                          status={config.status}
                          label={config.label}
                        />
                        {actionedDate && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {actionedDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            <div>
                              {actionedDate.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } else if (row.scheduleRejected) {
                    statusNode = (
                      <StatusBadge status="rejected" label="Rejected" />
                    );
                  } else {
                    const status = row.visitApproved
                      ? "completed"
                      : isUpcoming
                        ? "pending"
                        : "no-show";
                    const label = row.visitApproved
                      ? "Completed"
                      : isUpcoming
                        ? "Pending Approval"
                        : "No-Show";
                    statusNode = (
                      <div>
                        <StatusBadge status={status} label={label} />
                        {actionedDate && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {actionedDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            <div>
                              {actionedDate.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border-light)] hover:bg-muted transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className={`flex items-center gap-3 ${isDim}`}>
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${getAvatarColor(initials(row.customer))}`}
                          >
                            {initials(row.customer)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">
                              {row.customer}
                              {row.historyStatus === "cancelled" ? (
                                <span className="ml-2 rounded-full bg-error-light px-2 py-0.5 text-[10px] font-semibold text-error-dark">
                                  Cancelled
                                </span>
                              ) : row.attemptNumber != null ? (
                                <span
                                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    row.isHistorical
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-info-light text-info-dark"
                                  }`}
                                >
                                  Attempt {row.attemptNumber}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-foreground">
                        <span className={isDim}>{row.branch}</span>
                      </td>
                      <td className="py-4 px-4 text-sm text-foreground">
                        <span className={isDim}>{row.room}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className={`leading-5 ${isDim}`}>
                          <div className="text-sm text-foreground">
                            {row.scheduledDate
                              ? new Date(row.scheduledDate).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.scheduledDate
                              ? new Date(row.scheduledDate).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "-"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className={`leading-5 ${isDim}`}>
                          <div className="text-sm text-foreground">
                            {row.visitDate
                              ? new Date(row.visitDate).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.visitTime || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">{statusNode}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {row.isHistorical ? (
                            <button
                              className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-600 rounded-md transition-colors"
                              title="Delete this history entry"
                              onClick={() =>
                                handleDeleteHistoryEntry(
                                  row.reservationId,
                                  row.historyIndex,
                                )
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <>
                              {isUpcoming && (
                                <>
                                  <button
                                    className="px-2.5 py-1.5 bg-[color:var(--success-light)] hover:bg-[color:var(--success)]/20 text-[color:var(--success-dark)] dark:text-[color:var(--success-dark)] font-medium rounded-md transition-colors flex items-center gap-1.5 text-sm"
                                    disabled={actionLoading === row.id}
                                    onClick={() => handleVerify(row.id)}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Complete
                                  </button>
                                  <button
                                    className="px-2.5 py-1.5 bg-[color:var(--danger-light)] hover:bg-[color:var(--danger)]/20 text-[color:var(--danger-dark)] dark:text-[color:var(--danger-dark)] font-medium rounded-md transition-colors flex items-center gap-1.5 text-sm"
                                    title="Reject schedule"
                                    onClick={() => setSelectedSchedule(row)}
                                  >
                                    <XIcon className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}
                              {row.visitApproved && (
                                <button
                                  className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                  title="Revoke verification"
                                  onClick={() => handleRevoke(row.id)}
                                >
                                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                                </button>
                              )}
                              <button
                                className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-600 rounded-md transition-colors"
                                title="Delete schedule"
                                onClick={() => handleDelete(row.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-end items-center gap-2 mt-4 pt-4 border-t border-[var(--border-light)]">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-3 py-1 text-sm border border-[var(--border-light)] rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-3 py-1 text-sm border border-[var(--border-light)] rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() =>
          setConfirmModal((previous) => ({ ...previous, open: false }))
        }
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
      <VisitDetailsModal
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onUpdate={refetchAll}
      />
    </div>
  );
}

export default VisitSchedulesTab;
