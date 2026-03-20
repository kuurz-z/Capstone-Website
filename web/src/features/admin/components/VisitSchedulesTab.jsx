import { useState, useMemo } from "react";
import { CalendarDays, CheckCircle2, XCircle, Check, RotateCcw, Trash2, Ban } from "lucide-react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import VisitDetailsModal from "./VisitDetailsModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { useQueryClient } from "@tanstack/react-query";
import { SummaryBar, DataTable, StatusBadge } from "./shared";
import "../styles/design-tokens.css";
import "../styles/admin-reservations.css";

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


function VisitSchedulesTab() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", variant: "info", onConfirm: null });
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [activeFilter, setActiveFilter] = useState(-1);

  const { data: rawReservations = [], isLoading: loading } = useReservations();

  // Flatten: each visitHistory entry becomes its own row + the current active visit
  const schedules = useMemo(() => {
    const rows = [];
    rawReservations
      .filter((r) => r.status === "visit_pending" || (r.visitDate && r.visitApproved) || r.scheduleRejected || (r.visitHistory && r.visitHistory.length > 0))
      .forEach((r) => {
        const customer = `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() || "Unknown";
        const base = {
          reservationId: r._id,
          reservationCode: r.reservationCode || "—",
          customer,
          email: r.userId?.email || "—",
          phone: r.mobileNumber || r.userId?.phone || "—",
          room: r.roomId?.name || "—",
          branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
          viewingType: r.viewingType,
          isOutOfTown: r.isOutOfTown,
          currentLocation: r.currentLocation,
          billingEmail: r.billingEmail,
          visitHistory: r.visitHistory || [],
        };

        // 1. Add historical rows from visitHistory (dimmed, read-only)
        if (r.visitHistory && r.visitHistory.length > 0) {
          r.visitHistory.forEach((h, idx) => {
            rows.push({
              ...base,
              id: `${r._id}-history-${idx}`,
              visitDate: h.visitDate,
              visitTime: h.visitTime || "—",
              visitApproved: h.status === "approved",
              scheduleApproved: h.status === "approved",
              scheduleRejected: h.status === "rejected",
              scheduleRejectionReason: h.rejectionReason || "",
              scheduledDate: h.scheduledAt || r.createdAt,
              historyStatus: h.status, // pending | rejected | approved | cancelled
              isHistorical: true,
              historyIndex: idx,
              attemptNumber: h.attemptNumber || null, // use persisted number
            });
          });
        }

        // 2. Add the current/active visit (full actions)
        // Skip if scheduleRejected — the rejection is already in visitHistory
        // The active row should only appear when user has a new/pending visit
        if (r.visitDate && !r.scheduleRejected && !r.visitApproved && r.status !== "cancelled") {
          rows.push({
            ...base,
            id: r._id,
            visitDate: r.visitDate,
            visitTime: r.visitTime || "—",
            visitApproved: r.visitApproved,
            scheduleApproved: r.scheduleApproved,
            scheduleRejected: false,
            scheduleRejectionReason: "",
            status: r.status,
            scheduledDate: r.createdAt,
            isHistorical: false,
            attemptNumber: (r.visitHistory?.length || 0) + 1,
          });
        }
      });

    // Sort: newest first, but group by reservation
    rows.sort((a, b) => new Date(b.visitDate || 0) - new Date(a.visitDate || 0));
    return rows;
  }, [rawReservations]);

  const upcoming = useMemo(() => schedules.filter((s) => !s.isHistorical && !s.visitApproved && !s.scheduleRejected && new Date(s.visitDate) >= new Date()), [schedules]);
  const completed = useMemo(() => schedules.filter((s) => (!s.isHistorical && s.visitApproved) || (s.isHistorical && s.historyStatus === "approved")), [schedules]);
  const noShows = useMemo(() => schedules.filter((s) => !s.isHistorical && !s.visitApproved && !s.scheduleRejected && new Date(s.visitDate) < new Date()), [schedules]);
  const rejected = useMemo(() => schedules.filter((s) => s.scheduleRejected || (s.isHistorical && s.historyStatus === "rejected")), [schedules]);

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["reservations"] });

  const confirmAction = (title, message, variant, confirmText, action) => {
    setConfirmModal({
      open: true, title, message, variant, confirmText,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        try { await action(); refetchAll(); }
        catch { showNotification(`Failed: ${title}`, "error"); }
      },
    });
  };

  const handleVerify = (id) => {
    confirmAction("Verify Attendance", "Confirm the applicant's on-site attendance?", "info", "Verify",
      async () => {
        setActionLoading(id);
        try {
          await reservationApi.update(id, { scheduleApproved: true, visitApproved: true, status: "visit_approved" });
          showNotification("Attendance verified", "success");
        } finally {
          setActionLoading(null);
        }
      },
    );
  };

  const handleRevoke = (id) => {
    confirmAction("Revoke Verification", "Revoke this applicant's attendance verification?", "danger", "Revoke",
      async () => {
        await reservationApi.update(id, { scheduleApproved: false, visitApproved: false });
        showNotification("Verification revoked", "success");
      },
    );
  };

  const handleDelete = (id) => {
    confirmAction("Delete Visit Schedule", "This will permanently delete this visit schedule.", "danger", "Delete",
      async () => {
        await reservationApi.delete(id);
        showNotification("Visit schedule deleted", "success");
      },
    );
  };

  const handleDeleteHistoryEntry = (reservationId, historyIndex) => {
    confirmAction("Delete History Entry", "Remove this visit history entry?", "danger", "Delete",
      async () => {
        await reservationApi.update(reservationId, { removeVisitHistoryIndex: historyIndex });
        showNotification("History entry removed", "success");
      },
    );
  };

  const handleRowClick = (row) => {
    if (row.isHistorical) return; // historical rows don't open the modal
    setSelectedSchedule(row);
  };

  const summaryItems = [
    { label: "Upcoming Visits", value: upcoming.length,  icon: CalendarDays,  color: "blue" },
    { label: "Completed",       value: completed.length, icon: CheckCircle2, color: "green" },
    { label: "No Shows",        value: noShows.length,   icon: XCircle,      color: "red" },
    { label: "Rejected",        value: rejected.length,  icon: Ban,          color: "orange" },
  ];

  // Filter data based on active summary card
  const displayData = useMemo(() => {
    if (activeFilter === 0) return upcoming;
    if (activeFilter === 1) return completed;
    if (activeFilter === 2) return noShows;
    if (activeFilter === 3) return rejected;
    return schedules;
  }, [activeFilter, schedules, upcoming, completed, noShows, rejected]);

  const columns = [
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
                <span style={{
                  marginLeft: 6, fontSize: "10px", fontWeight: 600,
                  padding: "1px 6px", borderRadius: 8,
                  background: "#FEF2F2", color: "#DC2626",
                }}>
                  Cancelled
                </span>
              ) : row.attemptNumber != null && (
                <span style={{
                  marginLeft: 6, fontSize: "10px", fontWeight: 600,
                  padding: "1px 6px", borderRadius: 8,
                  background: row.isHistorical ? "#F3F4F6" : "#EEF2FF",
                  color: row.isHistorical ? "#9CA3AF" : "#4F46E5",
                }}>
                  Attempt {row.attemptNumber}
                </span>
              )}
            </span>
            <span className="res-applicant-code">{row.email}</span>
          </div>
        </div>
      ),
    },
    { key: "branch", label: "Branch", render: (row) => <span style={{ opacity: row.isHistorical ? 0.55 : 1 }}>{row.branch}</span> },
    { key: "room",   label: "Room",   render: (row) => <span style={{ opacity: row.isHistorical ? 0.55 : 1 }}>{row.room}</span> },
    {
      key: "visitDate",
      label: "Date & Time",
      render: (row) => (
        <div style={{ lineHeight: 1.5, opacity: row.isHistorical ? 0.55 : 1 }}>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
            {row.visitDate ? new Date(row.visitDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{row.visitTime}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        // Historical entries
        if (row.isHistorical) {
          const map = {
            rejected:  { status: "overdue",  label: "Rejected" },
            approved:  { status: "verified", label: "Approved" },
            cancelled: { status: "overdue",  label: "Cancelled" },
            pending:   { status: "pending",  label: "Scheduled" },
          };
          const cfg = map[row.historyStatus] || map.pending;
          return <span style={{ opacity: 0.55 }}><StatusBadge status={cfg.status} label={cfg.label} /></span>;
        }
        // Active entries
        if (row.scheduleRejected) {
          return <StatusBadge status="overdue" label="Rejected" />;
        }
        const isUpcoming = !row.visitApproved && new Date(row.visitDate) >= new Date();
        const status = row.visitApproved ? "verified" : isUpcoming ? "pending" : "overdue";
        const label  = row.visitApproved ? "Completed" : isUpcoming ? "Upcoming" : "No Show";
        return <StatusBadge status={status} label={label} />;
      },
    },
    {
      key: "actions",
      label: "",
      width: "180px",
      align: "right",
      render: (row) => {
        // Historical rows only get a delete button (dimmed)
        if (row.isHistorical) {
          return (
            <div className="res-actions" style={{ opacity: 0.55 }}>
              <button
                className="res-icon-btn res-icon-btn--danger"
                title="Delete this history entry"
                onClick={(e) => { e.stopPropagation(); handleDeleteHistoryEntry(row.reservationId, row.historyIndex); }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        }

        const now = new Date();
        const visitDt = new Date(row.visitDate);
        const isUpcoming = !row.visitApproved && !row.scheduleRejected && visitDt >= now;
        return (
          <div className="res-actions">
            {isUpcoming && (
              <>
                <button
                  className="res-action-btn res-action-btn--success"
                  disabled={actionLoading === row.id}
                  onClick={(e) => { e.stopPropagation(); handleVerify(row.id); }}
                >
                  Confirm
                </button>
                <button
                  className="res-icon-btn"
                  title="Reject schedule"
                  style={{ color: "#DC2626" }}
                  onClick={(e) => { e.stopPropagation(); setSelectedSchedule(row); }}
                >
                  <Ban size={14} />
                </button>
              </>
            )}
            {row.visitApproved && (
              <button
                className="res-icon-btn"
                title="Revoke verification"
                onClick={(e) => { e.stopPropagation(); handleRevoke(row.id); }}
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              className="res-icon-btn res-icon-btn--danger"
              title="Delete schedule"
              onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
      <SummaryBar items={summaryItems} onItemClick={setActiveFilter} activeIndex={activeFilter} />
      <DataTable
        columns={columns}
        data={displayData}
        loading={loading}
        emptyState={{ icon: CalendarDays, title: "No visit schedules", description: "Visit schedules will appear here." }}
        onRowClick={handleRowClick}
      />
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
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
