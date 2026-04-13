import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  RefreshCcw,
  UserRoundCheck,
  Users,
  MoreHorizontal,
  LogOut,
  CreditCard,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useTenantActionContext,
  useTenantWorkspace,
  useTenantWorkspaceDetail,
} from "../../../shared/hooks/queries/useReservations";
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import {
  DataTable,
  DetailDrawer,
  PageShell,
  StatusBadge,
  SummaryBar,
} from "../components/shared";
import TenantFilterBarOptimized from "../components/TenantFilterBarOptimized";
import { formatBranch } from "../utils/formatters";
import {
  getTenantActionMeta,
  hasEnabledTenantAction,
  openTenantAction,
} from "./tenantWorkspaceActions.mjs";
import "../styles/design-tokens.css";
import "../styles/admin-tenants.css";

const ITEMS_PER_PAGE = 10;

const QUICK_FILTERS = [
  { key: "expiring_soon", label: "Expiring Soon" },
  { key: "needs_action", label: "Needs Action" },
  { key: "overdue", label: "Overdue" },
];

const TENANT_ACTION_ITEMS = [
  {
    key: "renew",
    type: "renew",
    label: "Renew Lease",
    icon: RefreshCcw,
    className: "",
  },
  {
    key: "transfer",
    type: "transfer",
    label: "Transfer Room",
    icon: ArrowRightLeft,
    className: "",
  },
  {
    key: "moveOut",
    type: "moveOut",
    label: "Move Out",
    icon: LogOut,
    className: "tenant-dropdown-item--danger",
  },
];

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

const normalizeStatusLabel = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function warningTone(severity) {
  if (severity === "error") return "tenant-warning-pill--error";
  if (severity === "warning") return "tenant-warning-pill--warning";
  return "tenant-warning-pill--info";
}

function actionTone(action) {
  if (action === "verify_payment" || action === "review_overdue_account") {
    return "tenant-next-action--danger";
  }
  if (action === "renew_lease" || action === "process_move_out") {
    return "tenant-next-action--warning";
  }
  return "tenant-next-action--neutral";
}

function matchesDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (from) {
    const fromDate = new Date(from);
    if (date < fromDate) return false;
  }

  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (date > toDate) return false;
  }

  return true;
}

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
        {footer ? (
          <div className="tenant-workspace-modal__footer">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function RenewLeaseModal({
  open,
  tenant,
  detail,
  context,
  contextLoading,
  loading,
  submitError,
  onClose,
  onSubmit,
}) {
  const [newLeaseStartDate, setNewLeaseStartDate] = useState("");
  const [newLeaseEndDate, setNewLeaseEndDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const currentEnd = context?.currentStay?.leaseEndDate || detail?.leaseInfo?.leaseEndDate;
    const nextStart = currentEnd ? new Date(currentEnd) : new Date();
    nextStart.setDate(nextStart.getDate() + 1);
    const nextEnd = currentEnd ? new Date(currentEnd) : new Date();
    nextEnd.setMonth(nextEnd.getMonth() + 12);
    setNewLeaseStartDate(toDateInputValue(nextStart));
    setNewLeaseEndDate(toDateInputValue(nextEnd));
    setMonthlyRent(String(context?.currentStay?.monthlyRent ?? ""));
    setNotes("");
    setConfirm(false);
  }, [open, detail, context]);

  const extensionHistory = context?.renewalHistory || detail?.leaseInfo?.extensionHistory || [];
  const hasDateError =
    newLeaseStartDate &&
    newLeaseEndDate &&
    new Date(newLeaseEndDate) <= new Date(newLeaseStartDate);

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
            onClick={() => onSubmit({ newLeaseEndDate, notes })}
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
                <strong>+{entry.addedMonths} month{entry.addedMonths === 1 ? "" : "s"}</strong>
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

function TransferTenantModal({
  open,
  tenant,
  detail,
  loading,
  onClose,
  onSubmit,
}) {
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
  const availableBeds =
    selectedRoom?.beds?.filter((bed) => bed.status === "available") || [];

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
        Transfers are limited to the same branch and only to beds that are available at submit time.
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

function MoveOutModal({ open, tenant, detail, loading, onClose, onSubmit }) {
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

const RowActionsMenu = ({ row, onSelect, onAction }) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const hasActionMenu = hasEnabledTenantAction(
    row,
    TENANT_ACTION_ITEMS.map(({ key }) => key),
  );

  const notifyBlocked = (actionMeta) => {
    showNotification(
      actionMeta?.reason || "This action is not available for this tenant.",
      "error",
      3500,
    );
  };

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width || 180;
    const menuHeight = menuRect?.height || 140;
    const gutter = 8;

    const left = Math.min(
      Math.max(gutter, triggerRect.right - menuWidth),
      window.innerWidth - menuWidth - gutter,
    );

    const preferredTop = triggerRect.bottom + 6;
    const top =
      preferredTop + menuHeight <= window.innerHeight - gutter
        ? preferredTop
        : Math.max(gutter, triggerRect.top - menuHeight - 6);

    setMenuPosition({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const rafId = window.requestAnimationFrame(updateMenuPosition);
    const handleViewportChange = () => setOpen(false);

    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  return (
    <div className="tenant-row-actions" data-action-cell="true">
      <button
        type="button"
        className="tenant-row-action tenant-row-action--primary"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(row.reservationId);
        }}
      >
        View Details
      </button>

      {hasActionMenu ? (
        <div style={{ position: "relative" }}>
          <button
            ref={triggerRef}
            type="button"
            className="tenant-row-action tenant-action-more"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <MoreHorizontal size={14} />
          </button>

          {open && typeof document !== "undefined"
            ? createPortal(
                <>
                  <button
                    type="button"
                    className="tenant-action-dropdown-backdrop"
                    data-action-portal="true"
                    aria-label="Close tenant actions"
                    onClick={() => setOpen(false)}
                  />
                  <div
                    ref={menuRef}
                    className="tenant-action-dropdown tenant-action-dropdown--portal"
                    data-action-portal="true"
                    style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {TENANT_ACTION_ITEMS.map(({ key, type, label, icon: Icon, className }) => {
                      const actionMeta = getTenantActionMeta(row, key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`tenant-dropdown-item${className ? ` ${className}` : ""}`}
                          aria-disabled={!actionMeta.enabled}
                          title={actionMeta.reason || ""}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const opened = openTenantAction({
                              tenant: row,
                              actionKey: key,
                              actionType: type,
                              notifyBlocked,
                              onAction,
                            });
                            if (opened) {
                              setOpen(false);
                            }
                          }}
                        >
                          <Icon size={14} /> {label}
                        </button>
                      );
                    })}
                  </div>
                </>,
                document.body,
              )
            : null}
        </div>
      ) : null}
    </div>
  );
};

export default function TenantsWorkspacePage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState(
    isOwner ? "all" : user?.branch || "all",
  );
  const [leaseStatusFilter, setLeaseStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [stayStatusFilter, setStayStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [quickFilters, setQuickFilters] = useState([]);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [actionState, setActionState] = useState({ type: null, tenant: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);

  const workspaceParams = useMemo(
    () => ({
      ...((branchFilter && branchFilter !== "all") ? { branch: branchFilter } : {}),
    }),
    [branchFilter],
  );

  const {
    data: workspaceData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useTenantWorkspace(workspaceParams, {
    enabled: !authLoading && !!user,
  });

  const {
    data: tenantDetail,
    isLoading: tenantDetailLoading,
  } = useTenantWorkspaceDetail(selectedReservationId, {
    enabled: !!selectedReservationId,
  });
  const {
    data: actionTenantDetail,
  } = useTenantWorkspaceDetail(actionState.tenant?.reservationId, {
    enabled: !!actionState.tenant?.reservationId,
  });
  const { data: actionContext } = useTenantActionContext(actionState.tenant?.reservationId, {
    enabled: !!actionState.tenant?.reservationId,
  });

  const tenants = workspaceData?.tenants || [];
  const loading = authLoading || isLoading || isFetching;

  const baseFiltered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return tenants.filter((tenant) => {
      const matchesSearch =
        !term ||
        tenant.tenantName.toLowerCase().includes(term) ||
        (tenant.contact?.email || "").toLowerCase().includes(term) ||
        (tenant.contact?.phone || "").toLowerCase().includes(term) ||
        (tenant.room || "").toLowerCase().includes(term) ||
        (tenant.bed || "").toLowerCase().includes(term);

      const matchesLease =
        leaseStatusFilter === "all" || tenant.leaseStatus === leaseStatusFilter;
      const matchesPayment =
        paymentStatusFilter === "all" ||
        tenant.paymentStatus === paymentStatusFilter;
      const matchesStay =
        stayStatusFilter === "all" || tenant.stayStatus === stayStatusFilter;
      const matchesDate = matchesDateRange(tenant.leaseEndDate, dateFrom, dateTo);

      return (
        matchesSearch &&
        matchesLease &&
        matchesPayment &&
        matchesStay &&
        matchesDate
      );
    });
  }, [
    tenants,
    searchTerm,
    leaseStatusFilter,
    paymentStatusFilter,
    stayStatusFilter,
    dateFrom,
    dateTo,
  ]);

  const summaryItems = useMemo(
    () => [
      {
        label: "Total Residents",
        value: baseFiltered.length,
        icon: Users,
        color: "blue",
      },
      {
        label: "Active Tenants",
        value: baseFiltered.filter((tenant) => tenant.stayStatus === "active").length,
        icon: UserRoundCheck,
        color: "green",
      },
      {
        label: "Expiring Soon",
        value: baseFiltered.filter((tenant) => tenant.leaseStatus === "expiring_soon").length,
        icon: RefreshCcw,
        color: "orange",
      },
      {
        label: "Overdue Payments",
        value: baseFiltered.filter((tenant) => tenant.paymentStatus === "overdue").length,
        icon: AlertTriangle,
        color: "red",
      },
    ],
    [baseFiltered],
  );

  const filteredTenants = useMemo(() => {
    return baseFiltered.filter((tenant) =>
      quickFilters.every((filterKey) => {
        if (filterKey === "expiring_soon") return tenant.leaseStatus === "expiring_soon";
        if (filterKey === "needs_action") return tenant.nextAction !== "none";
        if (filterKey === "overdue") return tenant.paymentStatus === "overdue";
        return true;
      }),
    );
  }, [baseFiltered, quickFilters]);

  const sortedTenants = useMemo(() => {
    const urgencyScore = (tenant) => {
      if (tenant.nextAction === "verify_payment") return 1;
      if (tenant.nextAction === "review_overdue_account") return 2;
      if (tenant.nextAction === "process_move_out") return 3;
      if (tenant.nextAction === "renew_lease") return 4;
      return 5;
    };

    return [...filteredTenants].sort((left, right) => {
      const urgencyDelta = urgencyScore(left) - urgencyScore(right);
      if (urgencyDelta !== 0) return urgencyDelta;

      const leftLease = left.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
      const rightLease = right.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
      if (leftLease !== rightLease) return leftLease - rightLease;

      return left.tenantName.localeCompare(right.tenantName);
    });
  }, [filteredTenants]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    branchFilter,
    leaseStatusFilter,
    paymentStatusFilter,
    stayStatusFilter,
    dateFrom,
    dateTo,
    quickFilters,
  ]);

  const toggleQuickFilter = (filterKey) => {
    setQuickFilters((current) =>
      current.includes(filterKey)
        ? current.filter((entry) => entry !== filterKey)
        : [...current, filterKey],
    );
  };

  const resetFilters = () => {
    setSearchTerm("");
    setLeaseStatusFilter("all");
    setPaymentStatusFilter("all");
    setStayStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setQuickFilters([]);
    setBranchFilter(isOwner ? "all" : user?.branch || "all");
  };

  const invalidateWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
      queryClient.invalidateQueries({ queryKey: ["rooms"] }),
      queryClient.invalidateQueries({ queryKey: ["billing"] }),
    ]);
  };

  const runAction = async (label, callback) => {
    setActionLoading(label);
    try {
      const response = await callback();
      await invalidateWorkspace();
      setActionState({ type: null, tenant: null });
      showNotification(response?.message || "Tenant record updated.", "success", 2500);
    } catch (actionError) {
      showNotification(
        actionError.message || "The tenant action could not be completed.",
        "error",
        4500,
      );
    } finally {
      setActionLoading(null);
    }
  };

  const notifyBlockedAction = (actionMeta) => {
    showNotification(
      actionMeta?.reason || "This action is not available for this tenant.",
      "error",
      3500,
    );
  };

  const openActionForTenant = (tenant, actionKey, actionType) =>
    openTenantAction({
      tenant,
      actionKey,
      actionType,
      notifyBlocked: notifyBlockedAction,
      onAction: setActionState,
    });

  const columns = useMemo(
    () => [
      {
        key: "tenantName",
        label: "Tenant",
        sortable: true,
        render: (row) => (
          <div className="tenant-cell">
            <div className="tenant-cell__avatar">
              {row.tenantName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "?"}
            </div>
            <div className="tenant-cell__info">
              <span className="tenant-cell__name">{row.tenantName}</span>
              <span className="tenant-cell__email">{row.contact?.email || "No email"}</span>
              <span className="tenant-cell__meta">{row.contact?.phone || "No phone"}</span>
            </div>
          </div>
        ),
      },
      ...(isOwner
        ? [
            {
              key: "branch",
              label: "Branch",
              render: (row) => formatBranch(row.branch) || "—",
            },
          ]
        : []),
      {
        key: "room",
        label: "Room + Bed",
        render: (row) => (
          <div className="tenant-room-cell">
            <span className="tenant-room-cell__primary">{row.room || "—"}</span>
            <span className="tenant-room-cell__secondary">{row.bed || "No bed"}</span>
          </div>
        ),
      },
      {
        key: "leaseEndDate",
        label: "Contract End",
        sortable: true,
        render: (row) => (
          <div className="tenant-room-cell">
            <span className="tenant-room-cell__primary">{fmtDate(row.leaseEndDate)}</span>
            <span className="tenant-room-cell__secondary">
              {row.daysUntilLeaseEnd == null
                ? "No contract"
                : `${row.daysUntilLeaseEnd} day${row.daysUntilLeaseEnd === 1 ? "" : "s"}`}
            </span>
          </div>
        ),
      },
      {
        key: "paymentStatus",
        label: "Billing",
        render: (row) => <StatusBadge status={row.paymentStatus} />,
      },
      {
        key: "leaseStatus",
        label: "Contract",
        render: (row) => <StatusBadge status={row.leaseStatus} />,
      },
      {
        key: "stayStatus",
        label: "Occupancy",
        render: (row) => <StatusBadge status={row.stayStatus} />,
      },
      {
        key: "nextAction",
        label: "Next Action",
        render: (row) => (
          <span className={`tenant-next-action ${actionTone(row.nextAction)}`}>
            {row.nextActionLabel}
          </span>
        ),
      },
      {
          key: "actions",
          label: "Actions",
          align: "right",
          render: (row) => (
            <RowActionsMenu 
              row={row} 
              onSelect={setSelectedReservationId} 
              onAction={setActionState} 
            />
          ),
        },
    ],
    [isOwner],
  );

  return (
    <PageShell>
      <PageShell.Summary>
        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Actions>
        <TenantFilterBarOptimized
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          branchFilter={branchFilter}
          setBranchFilter={setBranchFilter}
          isOwner={isOwner}
          leaseStatusFilter={leaseStatusFilter}
          setLeaseStatusFilter={setLeaseStatusFilter}
          paymentStatusFilter={paymentStatusFilter}
          setPaymentStatusFilter={setPaymentStatusFilter}
          stayStatusFilter={stayStatusFilter}
          setStayStatusFilter={setStayStatusFilter}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          quickFilters={quickFilters}
          toggleQuickFilter={toggleQuickFilter}
          QUICK_FILTERS={QUICK_FILTERS}
          resetFilters={resetFilters}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={sortedTenants}
          loading={loading}
          disableRowInteraction
          pagination={{
            page: currentPage,
            pageSize: ITEMS_PER_PAGE,
            total: sortedTenants.length,
            onPageChange: setCurrentPage,
          }}
          emptyState={
            isError
              ? {
                  icon: AlertTriangle,
                  title: "Unable to load tenants",
                  description: error?.message || "The tenancy workspace could not be loaded.",
                }
              : {
                  icon: Users,
                  title: "No tenants found",
                  description: "Adjust the filters or wait for tenant records to appear.",
                }
          }
        />

        <DetailDrawer
          open={!!selectedReservationId}
          onClose={() => setSelectedReservationId(null)}
          title="Tenant Workspace"
        >
          {tenantDetailLoading || !tenantDetail ? (
            <div className="tenant-drawer-loading">Loading tenant details...</div>
          ) : (
            <>
              <DetailDrawer.Section label="Basic Info">
                <DetailDrawer.Row label="Name" value={tenantDetail.basicInfo?.name} />
                <DetailDrawer.Row label="Email" value={tenantDetail.basicInfo?.email || "—"} />
                <DetailDrawer.Row label="Phone" value={tenantDetail.basicInfo?.phone || "—"} />
                <DetailDrawer.Row
                  label="Branch"
                  value={formatBranch(tenantDetail.basicInfo?.branch) || "—"}
                />
                <DetailDrawer.Row label="Room" value={tenantDetail.basicInfo?.room || "—"} />
                <DetailDrawer.Row label="Bed" value={tenantDetail.basicInfo?.bed || "—"} />
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Contract Info">
                <DetailDrawer.Row label="Move-In Date" value={fmtDate(tenantDetail.leaseInfo?.moveInDate)} />
                <DetailDrawer.Row label="Contract End Date" value={fmtDate(tenantDetail.leaseInfo?.leaseEndDate)} />
                <DetailDrawer.Row label="Days Until Contract End">
                  {tenantDetail.leaseInfo?.daysUntilLeaseEnd ?? "—"}
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Contract Status">
                  <StatusBadge status={tenantDetail.leaseStatus} />
                </DetailDrawer.Row>
                <div className="tenant-drawer-list">
                  <span className="tenant-drawer-list__label">Extension History</span>
                  {(tenantDetail.leaseInfo?.extensionHistory || []).length === 0 ? (
                    <span className="tenant-drawer-list__empty">No extensions recorded.</span>
                  ) : (
                    tenantDetail.leaseInfo.extensionHistory.map((entry) => (
                      <div key={entry.id} className="tenant-drawer-list__item">
                        <strong>+{entry.addedMonths} month{entry.addedMonths === 1 ? "" : "s"}</strong>
                        <span>{entry.previousDuration} → {entry.newDuration} months</span>
                        <span>{fmtDate(entry.extendedAt)}</span>
                        {entry.notes ? <span>{entry.notes}</span> : null}
                      </div>
                    ))
                  )}
                </div>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Payment Info">
                <DetailDrawer.Row label="Current Balance" value={fmtMoney(tenantDetail.paymentInfo?.currentBalance)} />
                <DetailDrawer.Row label="Payment Status">
                  <StatusBadge status={tenantDetail.paymentStatus} />
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Pending Verification">
                  {tenantDetail.paymentInfo?.pendingVerification ? "Yes" : "No"}
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Next Action">
                  <span className={`tenant-next-action ${actionTone(tenantDetail.nextAction)}`}>
                    {tenantDetail.nextActionLabel}
                  </span>
                </DetailDrawer.Row>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Room History">
                <div className="tenant-drawer-list">
                  {(tenantDetail.roomHistory || []).length === 0 ? (
                    <span className="tenant-drawer-list__empty">No room history recorded.</span>
                  ) : (
                    tenantDetail.roomHistory.map((entry) => (
                      <div key={entry.id} className="tenant-drawer-list__item">
                        <strong>{entry.roomName}</strong>
                        <span>{entry.bedLabel || "No bed label"}</span>
                        <span>
                          {fmtDate(entry.moveInDate)} → {fmtDate(entry.moveOutDate)}
                        </span>
                        {entry.source === "reservation_fallback" ? (
                          <span>Derived from reservation record</span>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="System Warnings">
                <div className="tenant-warning-list">
                  {(tenantDetail.systemWarnings || []).length === 0 ? (
                    <span className="tenant-drawer-list__empty">No warnings.</span>
                  ) : (
                    tenantDetail.systemWarnings.map((warning) => (
                      <span
                        key={warning.code}
                        className={`tenant-warning-pill ${warningTone(warning.severity)}`}
                      >
                        {warning.message}
                      </span>
                    ))
                  )}
                </div>
              </DetailDrawer.Section>

            </>
          )}
        </DetailDrawer>

        {actionState.type === "renew" ? (
          <RenewLeaseModal
            open
            tenant={actionState.tenant}
            detail={actionTenantDetail}
            loading={actionLoading === "renew"}
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("renew", async () => {
                const currentLeaseEnd =
                  actionContext?.currentStay?.leaseEndDate ||
                  actionTenantDetail?.leaseInfo?.leaseEndDate;
                const defaultStart = new Date(currentLeaseEnd || Date.now());
                defaultStart.setDate(defaultStart.getDate() + 1);
                if (!window.confirm("Confirm lease renewal? This will preserve the current stay history and create a new lease term.")) {
                  return null;
                }
                return reservationApi.renew(actionState.tenant.reservationId, {
                  newLeaseStartDate: payload.newLeaseStartDate || toDateInputValue(defaultStart),
                  newLeaseEndDate: payload.newLeaseEndDate,
                  monthlyRent:
                    payload.monthlyRent ??
                    actionContext?.currentStay?.monthlyRent ??
                    actionState.tenant?.monthlyRent ??
                    0,
                  notes: payload.notes,
                  confirm: true,
                });
              })
            }
          />
        ) : null}

        {actionState.type === "transfer" ? (
          <TransferTenantModal
            open
            tenant={actionState.tenant}
            detail={actionTenantDetail}
            loading={actionLoading === "transfer"}
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("transfer", async () => {
                if (!window.confirm("Confirm room transfer? This will close the current room history and create a new room assignment.")) {
                  return null;
                }
                return reservationApi.transfer(actionState.tenant.reservationId, {
                  targetRoomId: payload.roomId,
                  targetBedId: payload.bedId,
                  effectiveTransferDate: payload.effectiveTransferDate || toDateInputValue(new Date()),
                  reason: payload.reason,
                  notes: payload.notes || "",
                  confirm: true,
                });
              })
            }
          />
        ) : null}

        {actionState.type === "moveOut" ? (
          <MoveOutModal
            open
            tenant={actionState.tenant}
            detail={actionTenantDetail}
            loading={actionLoading === "moveOut"}
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("moveOut", async () => {
                if (!window.confirm("Confirm move-out? This will end the active stay and release the assigned bed while preserving tenant history.")) {
                  return null;
                }
                const response = await reservationApi.moveOut(actionState.tenant.reservationId, {
                  moveOutDate: payload.moveOutDate,
                  actualVacateDate: payload.actualVacateDate || payload.moveOutDate,
                  reason: payload.reason || "move_out",
                  finalNotes: payload.finalNotes || payload.notes || "",
                  damages: payload.damages || 0,
                  deductions: payload.deductions || 0,
                  outstandingBalanceSnapshot:
                    actionContext?.billingSummary?.currentBalance ??
                    actionTenantDetail?.paymentInfo?.currentBalance ??
                    0,
                  finalUtilityReading:
                    payload.finalUtilityReading ??
                    payload.meterReading,
                  confirm: true,
                });
                if (selectedReservationId === actionState.tenant.reservationId) {
                  setSelectedReservationId(null);
                }
                return response;
              })
            }
          />
        ) : null}
      </PageShell.Content>
    </PageShell>
  );
}

