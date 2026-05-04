/**
 * InvoicePublishTab.jsx
 *
 * The "Issue Invoices" tab — the canonical place to publish bills.
 * Architecture: Factory Floor vs. Shipping Dock.
 *
 * - Electricity tab  = manages readings & periods (factory floor)
 * - Water tab        = manages water records (factory floor)
 * - This tab         = shipping dock: confirm readiness, then dispatch
 *
 * Dispatch = draft → pending + PDF generation + email notification.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Send, CheckCircle2, Clock, AlertCircle, RefreshCw,
  Zap, Droplets, FileText, ChevronDown, ChevronUp
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { invoiceApi } from "../../../../shared/api/invoiceApi.js";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import useBillingNotifier from "./shared/useBillingNotifier";
import "./InvoicePublishTab.css";

// ── Formatters ──────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

// ── Status badge component ────────────────────────────────────────────────────

const UtilityBadge = ({ type, status }) => {
  const iconMap = {
    electricity: <Zap size={11} />,
    water: <Droplets size={11} />,
  };
  const statusMap = {
    closed:    { label: "Closed",    cls: "ipt-badge--success" },
    finalized: { label: "Finalized", cls: "ipt-badge--success" },
    open:      { label: "Open",      cls: "ipt-badge--warning" },
    pending:   { label: "Pending",   cls: "ipt-badge--warning" },
    "n/a":     { label: "N/A",       cls: "ipt-badge--neutral" },
  };
  const s = statusMap[status] || { label: status, cls: "ipt-badge--neutral" };
  return (
    <span className={`ipt-badge ${s.cls}`}>
      {iconMap[type]}
      {s.label}
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const InvoicePublishTab = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const notify = useBillingNotifier();

  const [branchFilter, setBranchFilter] = useState(isOwner ? "" : (user?.branch || ""));
  const [readinessData, setReadinessData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState({}); // { [roomId]: true }
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null });

  // Load readiness data
  const loadReadiness = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoiceApi.getRoomReadiness(branchFilter || undefined);
      setReadinessData(data);
    } catch (err) {
      notify.error(err, "Failed to load invoice readiness.");
    } finally {
      setLoading(false);
    }
  }, [branchFilter]);

  // Load on mount and when branch changes
  useEffect(() => { loadReadiness(); }, [loadReadiness]);

  // Rooms split by readiness
  const rooms = readinessData?.rooms || [];
  const readyRooms = useMemo(
    () => rooms.filter((r) => r.publishState === "ready"),
    [rooms],
  );
  const blockedRooms = useMemo(
    () => rooms.filter((r) => r.publishState === "blocked"),
    [rooms],
  );
  const sentRooms = useMemo(
    () => rooms.filter((r) => r.publishState === "issued"),
    [rooms],
  );

  const handlePublishRoom = (room) => {
    setConfirmModal({
      open: true,
      title: "Publish Invoices",
      message: `Send ${room.draftBillCount} bill${room.draftBillCount !== 1 ? "s" : ""} to tenants in ${room.roomName}? They will receive an email notification with their billing statement. This cannot be undone.`,
      variant: "primary",
      confirmText: "Publish Now",
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        setPublishing((p) => ({ ...p, [String(room.roomId)]: true }));
        try {
          const res = await invoiceApi.publishRoom(room.roomId);
          if (res.published > 0) {
            notify.success(`${res.published} invoice${res.published !== 1 ? "s" : ""} published for ${room.roomName}.`);
            if (res.partialFailures?.length > 0) {
              notify.warn(`${res.partialFailures.length} invoice${res.partialFailures.length !== 1 ? "s" : ""} had delivery issues. Check the server logs or bill metadata.`);
            }
            await loadReadiness();
          } else {
            notify.warn(`No draft bills found for ${room.roomName}. They may have already been published.`);
            await loadReadiness();
          }
        } catch (err) {
          notify.error(err, `Failed to publish bills for ${room.roomName}.`);
        } finally {
          setPublishing((p) => ({ ...p, [String(room.roomId)]: false }));
        }
      },
    });
  };

  const handlePublishAll = () => {
    if (readyRooms.length === 0) return;
    const totalBills = readyRooms.reduce((sum, r) => sum + r.draftBillCount, 0);
    setConfirmModal({
      open: true,
      title: "Publish All Ready Invoices",
      message: `This will publish ${totalBills} bill${totalBills !== 1 ? "s" : ""} across ${readyRooms.length} room${readyRooms.length !== 1 ? "s" : ""}. All tenants will receive email notifications. This cannot be undone.`,
      variant: "primary",
      confirmText: `Publish ${readyRooms.length} Room${readyRooms.length !== 1 ? "s" : ""}`,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, open: false }));
        let successCount = 0;
        // Sequential to avoid write contention
        for (const room of readyRooms) {
          setPublishing((p) => ({ ...p, [String(room.roomId)]: true }));
          try {
            const res = await invoiceApi.publishRoom(room.roomId);
            if (res.published > 0) {
              successCount++;
              if (res.partialFailures?.length > 0) {
                notify.warn(`${room.roomName} published with delivery issues on ${res.partialFailures.length} bill${res.partialFailures.length !== 1 ? "s" : ""}.`);
              }
            }
          } catch (err) {
            notify.warn(`Failed for ${room.roomName}: ${err?.message || "Unknown error"}`);
          } finally {
            setPublishing((p) => ({ ...p, [String(room.roomId)]: false }));
          }
        }
        if (successCount > 0) {
          notify.success(`Published invoices for ${successCount} room${successCount !== 1 ? "s" : ""}.`);
        }
        await loadReadiness();
      },
    });
  };

  const toggleExpand = (roomId) => {
    setExpandedRoomId((prev) => (prev === roomId ? null : roomId));
  };

  const cycleLabel = readinessData
    ? `${fmtDate(readinessData.cycleStart)} – ${fmtDate(readinessData.cycleEnd)}`
    : "Loading...";

  // ── Row renderer ────────────────────────────────────────────────────────
  // NOTE: This is a plain render function, NOT a React component.
  // Defining it as `const RoomRow = () =>` inside the parent would cause React
  // to treat it as a new component type on every render, destroying the instance
  // (and swallowing onClick) before the modal state could be set.

  const renderRoomRow = (room, isReady, isSent) => {
    const roomIdStr = String(room.roomId);
    const isExpanded = expandedRoomId === roomIdStr;
    const isPublishing = publishing[roomIdStr];

    return (
      <div key={roomIdStr} className={`ipt-row ${isReady ? "ipt-row--ready" : ""} ${isSent ? "ipt-row--sent" : ""} ${!isReady && !isSent ? "ipt-row--blocked" : ""}`}>
        <div className="ipt-row__main">
          <div className="ipt-row__info">
            <span className="ipt-row__name">{room.roomName}</span>
            <span className="ipt-row__branch">{room.branch}</span>
          </div>

          <div className="ipt-row__badges">
            <UtilityBadge type="electricity" status={room.electricityStatus} />
            {room.waterApplicable && room.waterStatus !== "n/a" && (
              <UtilityBadge type="water" status={room.waterStatus} />
            )}
          </div>

          <div className="ipt-row__meta">
            {isSent ? (
              <span className="ipt-row__sent-label">
                <CheckCircle2 size={14} /> Sent
              </span>
            ) : isReady ? (
              <span className="ipt-row__draft-count">
                <FileText size={12} /> {room.draftBillCount} draft{room.draftBillCount !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="ipt-row__blocked-reason" title={room.blockingReason}>
                <AlertCircle size={12} /> Blocked
              </span>
            )}
          </div>

          <div className="ipt-row__actions">
            {isReady && !isSent && (
              <>
                <button
                  className="ipt-btn ipt-btn--xs ipt-btn--ghost"
                  onClick={() => toggleExpand(roomIdStr)}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  className="ipt-btn ipt-btn--sm ipt-btn--primary"
                  onClick={() => handlePublishRoom(room)}
                  disabled={isPublishing}
                >
                  <Send size={13} />
                  {isPublishing ? "Publishing..." : "Publish"}
                </button>
              </>
            )}
            {!isReady && !isSent && (
              <span className="ipt-row__tooltip" title={room.blockingReason}>
                {room.blockingReason}
              </span>
            )}
          </div>
        </div>

        {isExpanded && isReady && !isSent && (
          <div className="ipt-row__detail">
            <div className="ipt-detail-grid">
              <div className="ipt-detail-item">
                <span className="ipt-detail-label">Electricity</span>
                <span className={`ipt-detail-val ipt-detail-val--${room.electricityStatus}`}>
                  {room.electricityStatus}
                </span>
              </div>
              {room.waterApplicable && (
                <div className="ipt-detail-item">
                  <span className="ipt-detail-label">Water</span>
                  <span className={`ipt-detail-val ipt-detail-val--${room.waterStatus}`}>
                    {room.waterStatus}
                  </span>
                </div>
              )}
              <div className="ipt-detail-item">
                <span className="ipt-detail-label">Draft Bills</span>
                <span className="ipt-detail-val">{room.draftBillCount}</span>
              </div>
              <div className="ipt-detail-item">
                <span className="ipt-detail-label">Issued Bills</span>
                <span className="ipt-detail-val">{room.issuedBillCount || 0}</span>
              </div>
              <div className="ipt-detail-item">
                <span className="ipt-detail-label">Room Type</span>
                <span className="ipt-detail-val">{room.type}</span>
              </div>
            </div>
            <p className="ipt-detail-note">
              Publishing will flip all draft bills to <strong>pending</strong>, generate PDF statements, and send email notifications to each tenant.
            </p>
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal((p) => ({ ...p, open: false }))}
      />

      {/* Summary strip */}
      <div className="ipt-summary-strip">
        <div className="ipt-summary-strip__counts">
          <span className="ipt-summary-count ipt-summary-count--ready">{readyRooms.length} ready</span>
          <span className="ipt-summary-count ipt-summary-count--blocked">{blockedRooms.length} blocked</span>
          <span className="ipt-summary-count ipt-summary-count--sent">{sentRooms.length} sent</span>
        </div>
        {readyRooms.length > 0 && (
          <button
            className="ipt-btn ipt-btn--publish-all"
            onClick={handlePublishAll}
            disabled={Object.values(publishing).some(Boolean)}
          >
            <Send size={14} /> Publish All Ready ({readyRooms.length})
          </button>
        )}
      </div>
      {/* Header toolbar */}
      <div className="ipt-toolbar">
        <div className="ipt-toolbar__meta">
          <span className="ipt-toolbar__title">Issue Invoices</span>
          <span className="ipt-toolbar__cycle">{cycleLabel}</span>
        </div>
        <div className="ipt-toolbar__actions">
          {isOwner && (
            <select
              className="ipt-select"
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setReadinessData(null); }}
            >
              <option value="">All Branches</option>
              <option value="gil-puyat">Gil-Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>
          )}
          <button
            className="ipt-btn ipt-btn--outline"
            onClick={() => { loadReadiness(); }}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "ipt-spin" : ""} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="ipt-layout">
        {loading && !readinessData && (
          <div className="ipt-loading">
            <RefreshCw size={20} className="ipt-spin" />
            <span>Loading room readiness...</span>
          </div>
        )}

        {!loading && readinessData && rooms.length === 0 && (
          <div className="ipt-empty">
            <FileText size={32} />
            <p>No rooms found for this branch.</p>
          </div>
        )}

        {readinessData && (
          <div className="ipt-rooms">
            {/* Ready rooms */}
            {readyRooms.length > 0 && (
              <section className="ipt-section">
                <div className="ipt-section__header">
                  <CheckCircle2 size={14} />
                  <span>Ready to Publish ({readyRooms.length})</span>
                </div>
                {readyRooms.map((room) => renderRoomRow(room, true, false))}
              </section>
            )}

            {/* Already sent rooms */}
            {sentRooms.length > 0 && (
              <section className="ipt-section ipt-section--sent">
                <div className="ipt-section__header">
                  <Send size={14} />
                  <span>Published This Session ({sentRooms.length})</span>
                </div>
                {sentRooms.map((room) => renderRoomRow(room, false, true))}
              </section>
            )}

            {/* Blocked rooms */}
            {blockedRooms.length > 0 && (
              <section className="ipt-section ipt-section--blocked">
                <div className="ipt-section__header">
                  <Clock size={14} />
                  <span>Awaiting Finalization ({blockedRooms.length})</span>
                </div>
                {blockedRooms.map((room) => renderRoomRow(room, false, false))}
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default InvoicePublishTab;
