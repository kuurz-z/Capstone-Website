import { useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
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
  const [activeFilter, setActiveFilter] = useState(-1);
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

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

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["reservations"] });

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
      "Failed to revoke verification. Please try again.",
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
        await reservationApi.update(reservationId, { removeVisitHistoryIndex: historyIndex });
      },
      "History entry removed",
      "Failed to remove history entry. Please try again.",
    );
  };

  const summaryItems = useMemo(
    () => [
      { label: "Upcoming Visits", value: upcoming.length, icon: CalendarDays, color: "blue" },
      { label: "Completed", value: completed.length, icon: CheckCircle2, color: "green" },
      { label: "No Shows", value: noShows.length, icon: XCircle, color: "red" },
      { label: "Rejected", value: rejected.length, icon: Ban, color: "orange" },
    ],
    [completed.length, noShows.length, rejected.length, upcoming.length],
  );

  const displayData = useMemo(() => {
    let base;
    if (activeFilter === 0) base = upcoming;
    else if (activeFilter === 1) base = completed;
    else if (activeFilter === 2) base = noShows;
    else if (activeFilter === 3) base = rejected;
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
        (left, right) => new Date(left.scheduledDate || 0) - new Date(right.scheduledDate || 0),
      );
    } else if (sortBy === "name-az") {
      result = [...result].sort((left, right) => left.customer.localeCompare(right.customer));
    } else if (sortBy === "name-za") {
      result = [...result].sort((left, right) => right.customer.localeCompare(left.customer));
    }

    return result;
  }, [activeFilter, branchFilter, completed, noShows, rejected, schedules, searchTerm, sortBy, upcoming]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeFilter === index;
          const palette = summaryColorClasses[item.color] || summaryColorClasses.blue;

          return (
            <button
              key={item.label}
              onClick={() => setActiveFilter(index)}
              className={`min-h-[120px] rounded-xl border p-5 text-left transition-all ${
                isActive ? palette.active : `${palette.base} hover:shadow-sm`
              }`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <Icon className={`h-5 w-5 ${palette.icon}`} />
                <span className={`text-sm font-medium ${palette.label}`}>{item.label}</span>
              </div>
              <div className={`text-3xl font-semibold leading-none ${palette.value}`}>
                {item.value}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-lg">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, code, or room..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-11 pr-4 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Branches</option>
            <option value="Gil Puyat">Gil Puyat</option>
            <option value="Guadalupe">Guadalupe</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
            <option value="name-az">Name A-Z</option>
            <option value="name-za">Name Z-A</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-base text-gray-500">Loading visit schedules...</p>
          </div>
        ) : displayData.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-900">No visit schedules</p>
            <p className="mt-1 text-base text-gray-500">Visit schedules will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Visitor
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Branch
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Room
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Requested
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Visit Appointment
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Status
                  </th>
                  <th className="w-[180px] px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayData.map((row) => {
                  const isDim = row.isHistorical ? "opacity-55" : "";
                  const now = new Date();
                  const visitDate = new Date(row.visitDate);
                  const isUpcoming = !row.visitApproved && !row.scheduleRejected && visitDate >= now;
                  const actionedDate = row.actionedAt ? new Date(row.actionedAt) : null;

                  let statusNode;
                  if (row.isHistorical) {
                    const historyMap = {
                      rejected: { status: "overdue", label: "Rejected" },
                      approved: { status: "verified", label: "Approved" },
                      cancelled: { status: "overdue", label: "Cancelled" },
                      pending: { status: "pending", label: "Scheduled" },
                    };
                    const config = historyMap[row.historyStatus] || historyMap.pending;
                    statusNode = (
                      <div className="opacity-60">
                        <StatusBadge status={config.status} label={config.label} />
                        {actionedDate && (
                          <div className="mt-1 text-xs text-gray-500">
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
                    statusNode = <StatusBadge status="overdue" label="Rejected" />;
                  } else {
                    const status = row.visitApproved ? "verified" : isUpcoming ? "pending" : "overdue";
                    const label = row.visitApproved ? "Completed" : isUpcoming ? "Upcoming" : "No Show";
                    statusNode = (
                      <div>
                        <StatusBadge status={status} label={label} />
                        {actionedDate && (
                          <div className="mt-1 text-xs text-gray-500">
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
                    <tr key={row.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-3 ${isDim}`}>
                          <div
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ background: avatarColor(row.customer) }}
                          >
                            {initials(row.customer)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-gray-900">
                              {row.customer}
                              {row.historyStatus === "cancelled" ? (
                                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                  Cancelled
                                </span>
                              ) : row.attemptNumber != null ? (
                                <span
                                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    row.isHistorical
                                      ? "bg-gray-100 text-gray-500"
                                      : "bg-indigo-50 text-indigo-600"
                                  }`}
                                >
                                  Attempt {row.attemptNumber}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-sm text-gray-500">{row.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-base text-gray-700">
                        <span className={isDim}>{row.branch}</span>
                      </td>
                      <td className="px-4 py-3 text-base text-gray-700">
                        <span className={isDim}>{row.room}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`leading-5 ${isDim}`}>
                          <div className="text-sm font-medium text-gray-900">
                            {row.scheduledDate
                              ? new Date(row.scheduledDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "-"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {row.scheduledDate
                              ? new Date(row.scheduledDate).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`leading-5 ${isDim}`}>
                          <div className="text-sm font-medium text-gray-900">
                            {row.visitDate
                              ? new Date(row.visitDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "-"}
                          </div>
                          <div className="text-xs text-gray-500">{row.visitTime || "-"}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusNode}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {row.isHistorical ? (
                            <button
                              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Delete this history entry"
                              onClick={() => handleDeleteHistoryEntry(row.reservationId, row.historyIndex)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <>
                              {isUpcoming && (
                                <>
                                  <button
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                                    disabled={actionLoading === row.id}
                                    onClick={() => handleVerify(row.id)}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    title="Reject schedule"
                                    onClick={() => setSelectedSchedule(row)}
                                  >
                                    <Ban size={14} />
                                  </button>
                                </>
                              )}
                              {row.visitApproved && (
                                <button
                                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                  title="Revoke verification"
                                  onClick={() => handleRevoke(row.id)}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                title="Delete schedule"
                                onClick={() => handleDelete(row.id)}
                              >
                                <Trash2 size={14} />
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
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((previous) => ({ ...previous, open: false }))}
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