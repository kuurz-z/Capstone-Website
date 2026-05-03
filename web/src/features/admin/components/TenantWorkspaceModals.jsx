import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { formatBranch } from "../utils/formatters";

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const fmtMoney = (value) =>
  typeof value === "number"
    ? `PHP ${value.toLocaleString(undefined, {
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}`
    : "—";

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

function TenantModalShell({ open, title, children, footer, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="tenant-workspace-modal__overlay" onClick={onClose}>
      <div
        className="tenant-workspace-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tenant-workspace-modal__header">
          <h3>{title}</h3>
          <button
            type="button"
            className="tenant-workspace-modal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="tenant-workspace-modal__body">{children}</div>
        {footer ? <div className="tenant-workspace-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function RenewLeaseModal({
  open,
  tenant,
  detail,
  context,
  loading,
  onClose,
  onSubmit,
}) {
  const [newLeaseStartDate, setNewLeaseStartDate] = useState("");
  const [newLeaseEndDate, setNewLeaseEndDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;

    const currentEnd =
      context?.currentStay?.leaseEndDate || detail?.leaseInfo?.leaseEndDate;
    const nextStart = currentEnd ? new Date(currentEnd) : new Date();
    nextStart.setDate(nextStart.getDate() + 1);
    const nextEnd = currentEnd ? new Date(currentEnd) : new Date();
    nextEnd.setMonth(nextEnd.getMonth() + 12);

    setNewLeaseStartDate(toDateInputValue(nextStart));
    setNewLeaseEndDate(toDateInputValue(nextEnd));
    setNotes("");
  }, [open, detail, context]);

  const extensionHistory =
    context?.renewalHistory || detail?.leaseInfo?.extensionHistory || [];

  return (
    <TenantModalShell
      open={open}
      title={`Renew Lease${tenant?.tenantName ? ` • ${tenant.tenantName}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--primary"
            disabled={loading || !newLeaseEndDate}
            onClick={() => onSubmit({ newLeaseStartDate, newLeaseEndDate, notes })}
          >
            {loading ? "Saving..." : "Renew Lease"}
          </button>
        </>
      }
    >
      <div className="tenant-modal-grid">
        <label className="tenant-modal-field">
          <span>Current Lease End</span>
          <input
            type="text"
            value={fmtDate(detail?.leaseInfo?.leaseEndDate || tenant?.leaseEndDate)}
            readOnly
          />
        </label>
        <label className="tenant-modal-field">
          <span>New Lease End Date</span>
          <input
            type="date"
            value={newLeaseEndDate}
            onChange={(event) => setNewLeaseEndDate(event.target.value)}
          />
        </label>
      </div>

      <label className="tenant-modal-field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional renewal notes"
        />
      </label>

      <div className="tenant-modal-section">
        <h4>Extension History</h4>
        {extensionHistory.length === 0 ? (
          <p className="tenant-modal-empty">No previous extensions recorded.</p>
        ) : (
          <div className="tenant-history-list">
            {extensionHistory.map((entry) => (
              <div key={entry.id} className="tenant-history-item">
                <strong>
                  +{entry.addedMonths} month{entry.addedMonths === 1 ? "" : "s"}
                </strong>
                <span>
                  {entry.previousDuration} → {entry.newDuration} months
                </span>
                <span>{fmtDate(entry.extendedAt)}</span>
                {entry.notes ? <span>{entry.notes}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </TenantModalShell>
  );
}

export function TransferTenantModal({ open, tenant, detail, loading, onClose, onSubmit }) {
  const branch = detail?.basicInfo?.branch || tenant?.branch || "";
  const { data: roomsData = [], isLoading: roomsLoading } = useRooms(
    open && branch ? { branch } : {},
  );
  const rooms = Array.isArray(roomsData) ? roomsData : roomsData.rooms || [];
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");
  const [reason, setReason] = useState("Room transfer");

  useEffect(() => {
    if (!open) return;
    setRoomId("");
    setBedId("");
    setReason("Room transfer");
  }, [open]);

  const availableRooms = useMemo(
    () =>
      rooms.filter(
        (room) =>
          String(room._id || room.id) !== String(tenant?.roomId) &&
          Array.isArray(room.beds) &&
          room.beds.some((bed) => bed.status === "available"),
      ),
    [rooms, tenant?.roomId],
  );

  const selectedRoom = availableRooms.find(
    (room) => String(room._id || room.id) === String(roomId),
  );
  const availableBeds = selectedRoom?.beds?.filter((bed) => bed.status === "available") || [];

  return (
    <TenantModalShell
      open={open}
      title={`Transfer Tenant${tenant?.tenantName ? ` • ${tenant.tenantName}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--primary"
            disabled={loading || !roomId || !bedId}
            onClick={() => onSubmit({ roomId, bedId, reason })}
          >
            {loading ? "Saving..." : "Transfer Tenant"}
          </button>
        </>
      }
    >
      <div className="tenant-modal-callout">
        Transfers are limited to the same branch and only to beds that are
        available at submit time.
      </div>

      <div className="tenant-modal-grid">
        <label className="tenant-modal-field">
          <span>Current Assignment</span>
          <input
            type="text"
            value={`${tenant?.room || "Unknown room"} • ${tenant?.bed || "No bed"}`}
            readOnly
          />
        </label>
        <label className="tenant-modal-field">
          <span>Branch</span>
          <input type="text" value={formatBranch(branch) || "—"} readOnly />
        </label>
      </div>

      <div className="tenant-modal-grid">
        <label className="tenant-modal-field">
          <span>New Room</span>
          <select
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value);
              setBedId("");
            }}
            disabled={roomsLoading}
          >
            <option value="">Select a room</option>
            {availableRooms.map((room) => (
              <option key={room._id || room.id} value={room._id || room.id}>
                {room.name || room.roomNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="tenant-modal-field">
          <span>New Bed</span>
          <select
            value={bedId}
            onChange={(event) => setBedId(event.target.value)}
            disabled={!roomId}
          >
            <option value="">Select a bed</option>
            {availableBeds.map((bed) => (
              <option key={bed._id || bed.id} value={bed._id || bed.id}>
                {(bed.position || bed.id || "Bed").replace("-", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="tenant-modal-field">
        <span>Reason</span>
        <textarea
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required transfer reason"
        />
      </label>
    </TenantModalShell>
  );
}

export function MoveOutModal({ open, tenant, detail, loading, onClose, onSubmit }) {
  const [moveOutDate, setMoveOutDate] = useState("");
  const [moveOutTime, setMoveOutTime] = useState("10:00");
  const [meterReading, setMeterReading] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMoveOutDate(toDateInputValue(new Date()));
    setMoveOutTime("10:00");
    setMeterReading("");
    setNotes("");
  }, [open]);

  const moveOutReason = tenant?.allowedActions?.moveOut?.reason || "";

  return (
    <TenantModalShell
      open={open}
      title={`Process Move-Out${tenant?.tenantName ? ` • ${tenant.tenantName}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tenant-modal-btn tenant-modal-btn--danger"
            disabled={loading || !moveOutDate || !moveOutTime || !meterReading}
            onClick={() =>
              onSubmit({
                moveOutDate,
                moveOutTime,
                meterReading: Number(meterReading),
                notes,
              })
            }
          >
            {loading ? "Saving..." : "Confirm Move-Out"}
          </button>
        </>
      }
    >
      <div className="tenant-modal-grid">
        <label className="tenant-modal-field">
          <span>Lease End</span>
          <input
            type="text"
            value={fmtDate(detail?.leaseInfo?.leaseEndDate || tenant?.leaseEndDate)}
            readOnly
          />
        </label>
        <label className="tenant-modal-field">
          <span>Current Balance</span>
          <input
            type="text"
            value={fmtMoney(detail?.paymentInfo?.currentBalance ?? tenant?.currentBalance)}
            readOnly
          />
        </label>
      </div>

      {moveOutReason ? (
        <div className="tenant-modal-callout tenant-modal-callout--danger">
          {moveOutReason}
        </div>
      ) : null}

      <div className="tenant-modal-grid">
        <label className="tenant-modal-field">
          <span>Move-Out Date</span>
          <input
            type="date"
            value={moveOutDate}
            onChange={(event) => setMoveOutDate(event.target.value)}
          />
        </label>
        <label className="tenant-modal-field">
          <span>Move-Out Time</span>
          <input
            type="time"
            value={moveOutTime}
            onChange={(event) => setMoveOutTime(event.target.value)}
          />
        </label>
      </div>

      <label className="tenant-modal-field">
        <span>Meter Reading (kWh)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={meterReading}
          onChange={(event) => setMeterReading(event.target.value)}
        />
      </label>

      <label className="tenant-modal-field">
        <span>Final Notes</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional move-out notes"
        />
      </label>
    </TenantModalShell>
  );
}
