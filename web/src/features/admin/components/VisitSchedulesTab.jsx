import { useState, useMemo } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { useQueryClient } from "@tanstack/react-query";
import "../styles/admin-common.css";
import "../styles/admin-reservations.css";

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

  const { data: rawReservations = [], isLoading: loading } = useReservations();

  const schedules = useMemo(
    () =>
      rawReservations
        .filter((r) => r.visitDate)
        .map((r) => ({
          id: r._id,
          reservationCode: r.reservationCode || "—",
          customer:
            `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() ||
            "Unknown",
          email: r.userId?.email || "—",
          phone: r.mobileNumber || r.userId?.phone || "—",
          room: r.roomId?.name || "—",
          branch: r.roomId?.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe",
          visitDate: r.visitDate,
          visitTime: r.visitTime || "—",
          visitApproved: r.visitApproved,
          status: r.status,
        })),
    [rawReservations],
  );

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  };

  const confirmAction = (title, message, variant, confirmText, action) => {
    setConfirmModal({
      open: true,
      title,
      message,
      variant,
      confirmText,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        try {
          await action();
          refetchAll();
        } catch {
          showNotification(`Failed: ${title}`, "error");
        }
      },
    });
  };

  const handleVerify = (id) => {
    setActionLoading(id);
    confirmAction(
      "Verify Attendance",
      "Confirm the applicant's on-site attendance? This unlocks their next reservation stage.",
      "info",
      "Verify",
      async () => {
        await reservationApi.update(id, {
          scheduleApproved: true,
          visitApproved: true,
        });
        showNotification("Attendance verified", "success");
        setActionLoading(null);
      },
    );
  };

  const handleRevoke = (id) => {
    setActionLoading(id);
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
        showNotification("Verification revoked", "success");
        setActionLoading(null);
      },
    );
  };

  const handleDelete = (id) => {
    confirmAction(
      "Delete Visit Schedule",
      "This will permanently delete this visit schedule. This cannot be undone.",
      "danger",
      "Delete",
      async () => {
        await reservationApi.delete(id);
        showNotification("Visit schedule deleted", "success");
      },
    );
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const pending = schedules.filter((s) => !s.visitApproved);
  const verified = schedules.filter((s) => s.visitApproved);

  if (loading) {
    return <div className="admin-loading-state">Loading visit schedules…</div>;
  }

  return (
    <div>
      {/* Stats */}
      <div className="admin-stat-cards">
        <div className="admin-stat-card">
          <p className="admin-stat-label">Awaiting Verification</p>
          <p className="admin-stat-value" style={{ color: "#b45309" }}>
            {pending.length}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">Verified</p>
          <p className="admin-stat-value" style={{ color: "#059669" }}>
            {verified.length}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">Total Visits</p>
          <p className="admin-stat-value">{schedules.length}</p>
        </div>
      </div>

      {/* Awaiting Verification */}
      <div className="admin-table-container" style={{ marginBottom: 24 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#fffbeb",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#92400e",
              margin: 0,
            }}
          >
            Awaiting Verification ({pending.length})
          </h3>
        </div>
        {pending.length === 0 ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state-text">No pending verifications</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Room</th>
                <th>Visit Date</th>
                <th>Time</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.customer}</div>
                    <div
                      style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}
                    >
                      {s.reservationCode}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.room}</div>
                    <div
                      style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}
                    >
                      {s.branch}
                    </div>
                  </td>
                  <td style={{ fontWeight: 500, color: "#0C375F" }}>
                    {fmtDate(s.visitDate)}
                  </td>
                  <td>{s.visitTime}</td>
                  <td>
                    <div style={{ fontSize: 13 }}>{s.email}</div>
                    <div
                      style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}
                    >
                      {s.phone}
                    </div>
                  </td>
                  <td>
                    <div className="ar-actions">
                      <button
                        className="ar-btn ar-btn-accept"
                        onClick={() => handleVerify(s.id)}
                        disabled={actionLoading === s.id}
                      >
                        Verify
                      </button>
                      <button
                        className="ar-btn ar-btn-delete"
                        onClick={() => handleDelete(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Verified */}
      <div className="admin-table-container">
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            background: "#ecfdf5",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#047857",
              margin: 0,
            }}
          >
            Verified Attendance ({verified.length})
          </h3>
        </div>
        {verified.length === 0 ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state-text">No verified visits yet</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Room</th>
                <th>Visit Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {verified.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.customer}</div>
                    <div
                      style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}
                    >
                      {s.reservationCode}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.room}</div>
                    <div
                      style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}
                    >
                      {s.branch}
                    </div>
                  </td>
                  <td>{fmtDate(s.visitDate)}</td>
                  <td>{s.visitTime}</td>
                  <td>
                    <span className="admin-badge admin-badge-success">
                      Verified
                    </span>
                  </td>
                  <td>
                    <div className="ar-actions">
                      <button
                        className="ar-btn ar-btn-delete"
                        onClick={() => handleRevoke(s.id)}
                        disabled={actionLoading === s.id}
                      >
                        Revoke
                      </button>
                      <button
                        className="ar-btn ar-btn-delete"
                        onClick={() => handleDelete(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText || "Confirm"}
      />
    </div>
  );
}

export default VisitSchedulesTab;
