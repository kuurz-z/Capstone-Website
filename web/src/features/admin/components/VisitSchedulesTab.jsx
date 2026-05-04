import { useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import VisitDetailsModal from "./VisitDetailsModal";
import { ActionBar, DataTable, StatusBadge, SummaryBar } from "./shared";
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

  const visitFilters = useMemo(
    () => [
      {
        key: "branch",
        options: [
          { value: "all", label: "All Branches" },
          { value: "Gil Puyat", label: "Gil Puyat" },
          { value: "Guadalupe", label: "Guadalupe" },
        ],
        value: branchFilter,
        onChange: (value) => setBranchFilter(value),
      },
      {
        key: "sort",
        options: [
          { value: "recent", label: "Most Recent" },
          { value: "oldest", label: "Oldest First" },
          { value: "name-az", label: "Name A-Z" },
          { value: "name-za", label: "Name Z-A" },
        ],
        value: sortBy,
        onChange: (value) => setSortBy(value),
      },
    ],
    [branchFilter, sortBy],
  );

  const columns = useMemo(
    () => [
      {
        key: "customer",
        label: "Visitor",
        render: (row) => (
          <div className="res-applicant-cell" style={{ opacity: row.isHistorical ? 0.55 : 1 }}>
            <div className="res-avatar" style={{ background: avatarColor(row.customer) }}>
              {initials(row.customer)}
            </div>
            <div className="res-applicant-info">
              <span className="res-applicant-name">
                {row.customer}
                {row.historyStatus === "cancelled" ? (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 8,
                      background: "#FEF2F2",
                      color: "#DC2626",
                    }}
                  >
                    Cancelled
                  </span>
                ) : row.attemptNumber != null ? (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 8,
                      background: row.isHistorical ? "#F3F4F6" : "#EEF2FF",
                      color: row.isHistorical ? "#9CA3AF" : "#4F46E5",
                    }}
                  >
                    Attempt {row.attemptNumber}
                  </span>
                ) : null}
              </span>
              <span className="res-applicant-code">{row.email}</span>
            </div>
          </div>
        ),
      },
      {
        key: "branch",
        label: "Branch",
        render: (row) => <span style={{ opacity: row.isHistorical ? 0.55 : 1 }}>{row.branch}</span>,
      },
      {
        key: "room",
        label: "Room",
        render: (row) => <span style={{ opacity: row.isHistorical ? 0.55 : 1 }}>{row.room}</span>,
      },
      {
        key: "scheduledDate",
        label: "Requested",
        render: (row) => {
          const dateValue = row.scheduledDate;
          if (!dateValue) {
            return (
              <span style={{ color: "var(--text-muted)", opacity: row.isHistorical ? 0.55 : 1 }}>
                -
              </span>
            );
          }
          const date = new Date(dateValue);
          return (
            <div style={{ lineHeight: 1.5, opacity: row.isHistorical ? 0.55 : 1 }}>
              <div
                style={{
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                {date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        },
      },
      {
        key: "visitDate",
        label: "Visit Appointment",
        render: (row) => (
          <div style={{ lineHeight: 1.5, opacity: row.isHistorical ? 0.55 : 1 }}>
            <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
              {row.visitDate
                ? new Date(row.visitDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "-"}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {row.visitTime}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => {
          const ActionedTime = () => {
            if (!row.actionedAt) return null;
            const date = new Date(row.actionedAt);
            return (
              <div style={{ marginTop: 4, lineHeight: 1.4 }}>
                <div
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-primary)",
                    fontWeight: 500,
                  }}
                >
                  {date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          };

          if (row.isHistorical) {
            const historyMap = {
              rejected: { status: "overdue", label: "Rejected" },
              approved: { status: "verified", label: "Approved" },
              cancelled: { status: "overdue", label: "Cancelled" },
              pending: { status: "pending", label: "Scheduled" },
            };
            const config = historyMap[row.historyStatus] || historyMap.pending;
            return (
              <div style={{ opacity: 0.55 }}>
                <StatusBadge status={config.status} label={config.label} />
                <ActionedTime />
              </div>
            );
          }

          if (row.scheduleRejected) {
            return <StatusBadge status="overdue" label="Rejected" />;
          }

          const isUpcoming = !row.visitApproved && new Date(row.visitDate) >= new Date();
          const status = row.visitApproved ? "verified" : isUpcoming ? "pending" : "overdue";
          const label = row.visitApproved ? "Completed" : isUpcoming ? "Upcoming" : "No Show";
          return (
            <div>
              <StatusBadge status={status} label={label} />
              <ActionedTime />
            </div>
          );
        },
      },
      {
        key: "actions",
        label: "",
        width: "180px",
        align: "right",
        render: (row) => {
          if (row.isHistorical) {
            return (
              <div className="res-actions" style={{ opacity: 0.55 }}>
                <button
                  className="res-icon-btn res-icon-btn--danger"
                  title="Delete this history entry"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteHistoryEntry(row.reservationId, row.historyIndex);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          }

          const now = new Date();
          const visitDate = new Date(row.visitDate);
          const isUpcoming = !row.visitApproved && !row.scheduleRejected && visitDate >= now;
          return (
            <div className="res-actions">
              {isUpcoming && (
                <>
                  <button
                    className="res-action-btn res-action-btn--success"
                    disabled={actionLoading === row.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleVerify(row.id);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="res-icon-btn"
                    title="Reject schedule"
                    style={{ color: "#DC2626" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedSchedule(row);
                    }}
                  >
                    <Ban size={14} />
                  </button>
                </>
              )}
              {row.visitApproved && (
                <button
                  className="res-icon-btn"
                  title="Revoke verification"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRevoke(row.id);
                  }}
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                className="res-icon-btn res-icon-btn--danger"
                title="Delete schedule"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(row.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        },
      },
    ],
    [actionLoading],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
      <SummaryBar items={summaryItems} onItemClick={setActiveFilter} activeIndex={activeFilter} />
      <ActionBar
        search={{
          value: searchTerm,
          onChange: (value) => setSearchTerm(value),
          placeholder: "Search by name, email, code, or room...",
        }}
        filters={visitFilters}
      />
      <DataTable
        columns={columns}
        data={displayData}
        loading={loading}
        sorting="external"
        emptyState={{
          icon: CalendarDays,
          title: "No visit schedules",
          description: "Visit schedules will appear here.",
        }}
      />
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

