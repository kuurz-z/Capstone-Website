import StayExtensionRequests from '../components/StayExtensionRequests';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  RefreshCcw,
  UserRoundCheck,
  Users,
  LogOut,
  CreditCard,
  Filter,
  Clock3,
  Eye,
  ArrowUpDown,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useTenantActionContext,
  useTenantWorkspace,
  useTenantWorkspaceDetail,
  prefetchTenantWorkspaceDetail,
} from "../../../shared/hooks/queries/useReservations";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import StatusBadge from "../components/shared/StatusBadge";
import TenantDetailModal from "../components/TenantDetailModal";
import ProfileAvatar from "../../../shared/components/ProfileAvatar";
import TenantFilterBar from "../components/TenantFilterBar";
import Pagination from "../../../shared/components/Pagination";
import {
  MoveOutModal,
  RenewLeaseModal,
  TransferTenantModal,
} from "../components/TenantWorkspaceModals";
import ExpiredOccupancyAlert from "../components/ExpiredOccupancyAlert";
import MoveOutClearanceCalculator from "../components/MoveOutClearanceCalculator";
import { formatBranch, fmtCurrency } from "../utils/formatters";
import {
  getTenantActionMeta,
  getTenantIndicator,
  markTenantViewedInStorage,
  hasEnabledTenantAction,
  openTenantAction,
  resolveTenantNextAction,
} from "./tenantWorkspaceActions.mjs";
import {
  handleExportTenantsCSV,
  handleExportTenantsPDF,
} from "../utils/tenantExportUtils.js";
import { ExportButtons } from "./analyticsTabShared.js";
import { AdminTablePageSkeleton } from "../components/AdminContentSkeletons";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
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
    label: "Extend Stay",
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

// Local calendar date as YYYY-MM-DD — the same value a native
// <input type="date"> produces. Must NOT use toISOString(), which converts to
// UTC and can return the previous day for a Philippines (UTC+8) user shortly
// after local midnight.
const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

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



export default function TenantsWorkspacePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get("search") || "",
  );
  const [branchFilter, setBranchFilter] = useState(
    isOwner ? "all" : user?.branch || "all",
  );
  const [leaseStatusFilter, setLeaseStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [stayStatusFilter, setStayStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [quickFilters, setQuickFilters] = useState([]);
  const [sortBy, setSortBy] = useState(
    () => searchParams.get("sortBy") || "newest",
  );
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState(
    () => searchParams.get("reservationId") || null,
  );
  const [modalInitialTab, setModalInitialTab] = useState("overview");
  const [actionState, setActionState] = useState({ type: null, tenant: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [actionLoading, setActionLoading] = useState(null);
  const [viewedTick, setViewedTick] = useState(0);

  const handleOpenTenantDetail = useCallback((reservationId, initialTab = "overview") => {
    if (!reservationId) return;
    markTenantViewedInStorage(reservationId);
    setViewedTick((v) => v + 1);
    setModalInitialTab(initialTab);
    setSelectedReservationId(reservationId);
  }, []);

  const handleCloseTenantDetail = useCallback(() => {
    setSelectedReservationId(null);
    setModalInitialTab("overview");
    if (searchParams.get("reservationId")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("reservationId");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch !== null && urlSearch !== searchTerm) {
      setSearchTerm(urlSearch);
    }
    const urlResId = searchParams.get("reservationId");
    if (urlResId && urlResId !== selectedReservationId) {
      handleOpenTenantDetail(urlResId, "overview");
    }
  }, [searchParams, selectedReservationId, handleOpenTenantDetail]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    (isOwner && branchFilter !== "all") ||
    leaseStatusFilter !== "all" ||
    paymentStatusFilter !== "all" ||
    stayStatusFilter !== "all" ||
    Boolean(dateFrom || dateTo) ||
    quickFilters.length > 0 ||
    sortBy !== "newest";

    const previousHasActiveFilters = useRef(hasActiveFilters);

    const workspaceParams = useMemo(
        () => ({
        ...(branchFilter && branchFilter !== "all"
            ? { branch: branchFilter }
            : {}),
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

    const { data: tenantDetail, isLoading: tenantDetailLoading } =
        useTenantWorkspaceDetail(selectedReservationId, {
        enabled: !!selectedReservationId,
        });
    const { data: actionTenantDetail } = useTenantWorkspaceDetail(
        actionState.tenant?.reservationId,
        {
        enabled: !!actionState.tenant?.reservationId,
        },
    );
    const { data: actionContext } = useTenantActionContext(
        actionState.tenant?.reservationId,
        {
        enabled: !!actionState.tenant?.reservationId,
        },
    );

    const tenants = workspaceData?.tenants || [];
    const loading = authLoading || (isLoading && !workspaceData);

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
        const matchesDate = matchesDateRange(
            tenant.leaseEndDate,
            dateFrom,
            dateTo,
        );

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
            label: "Total Tenants",
            value: baseFiltered.length,
            icon: Users,
            color: "blue",
        },
        {
            label: "Active Tenants",
            value: baseFiltered.filter((tenant) => tenant.stayStatus === "active")
            .length,
            icon: UserRoundCheck,
            color: "green",
        },
        {
            label: "Expiring Soon",
            value: baseFiltered.filter(
            (tenant) => tenant.leaseStatus === "expiring_soon",
            ).length,
            icon: RefreshCcw,
            color: "orange",
        },
        {
            label: "Overdue Payments",
            value: baseFiltered.filter(
            (tenant) => tenant.paymentStatus === "overdue",
            ).length,
            icon: AlertTriangle,
            color: "red",
        },
        ],
        [baseFiltered],
    );

    const filteredTenants = useMemo(() => {
        return baseFiltered.filter((tenant) =>
        quickFilters.every((filterKey) => {
            if (filterKey === "expiring_soon")
            return tenant.leaseStatus === "expiring_soon";
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
        if (tenant.nextAction === "settle_transfer") return 3;
        if (tenant.nextAction === "complete_transfer") return 3;
        if (tenant.nextAction === "process_move_out") return 4;
        if (tenant.nextAction === "transfer_scheduled") return 5;
        if (tenant.nextAction === "renew_lease") return 6;
        return 7;
        };

        return [...filteredTenants].sort((left, right) => {
        if (sortBy === "newest") {
            const dateLeft = left.moveInDate
            ? new Date(left.moveInDate).getTime()
            : left.createdAt
            ? new Date(left.createdAt).getTime()
            : 0;
            const dateRight = right.moveInDate
            ? new Date(right.moveInDate).getTime()
            : right.createdAt
            ? new Date(right.createdAt).getTime()
            : 0;
            const dateDelta = dateRight - dateLeft;
            if (dateDelta !== 0) return dateDelta;
            return (left.tenantName || "").localeCompare(right.tenantName || "");
        }

        if (sortBy === "oldest") {
            const dateLeft = left.moveInDate
            ? new Date(left.moveInDate).getTime()
            : left.createdAt
            ? new Date(left.createdAt).getTime()
            : 0;
            const dateRight = right.moveInDate
            ? new Date(right.moveInDate).getTime()
            : right.createdAt
            ? new Date(right.createdAt).getTime()
            : 0;
            const dateDelta = dateLeft - dateRight;
            if (dateDelta !== 0) return dateDelta;
            return (left.tenantName || "").localeCompare(right.tenantName || "");
        }

        if (sortBy === "lease_asc") {
            const leftLease = left.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
            const rightLease = right.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
            if (leftLease !== rightLease) return leftLease - rightLease;
            return (left.tenantName || "").localeCompare(right.tenantName || "");
        }

        if (sortBy === "lease_desc") {
            const leftLease = left.daysUntilLeaseEnd ?? -Number.MAX_SAFE_INTEGER;
            const rightLease = right.daysUntilLeaseEnd ?? -Number.MAX_SAFE_INTEGER;
            if (leftLease !== rightLease) return rightLease - leftLease;
            return (left.tenantName || "").localeCompare(right.tenantName || "");
        }

        if (sortBy === "name_asc") {
            return (left.tenantName || "").localeCompare(right.tenantName || "");
        }

        if (sortBy === "name_desc") {
            return (right.tenantName || "").localeCompare(left.tenantName || "");
        }

        // Default: urgency (Action Needed triage)
        const urgencyDelta = urgencyScore(left) - urgencyScore(right);
        if (urgencyDelta !== 0) return urgencyDelta;

        const leftLease = left.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
        const rightLease = right.daysUntilLeaseEnd ?? Number.MAX_SAFE_INTEGER;
        if (leftLease !== rightLease) return leftLease - rightLease;

        return (left.tenantName || "").localeCompare(right.tenantName || "");
        });
    }, [filteredTenants, sortBy]);

    const paginatedTenants = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedTenants.slice(start, start + itemsPerPage);
    }, [sortedTenants, currentPage, itemsPerPage]);

    const totalPages = Math.max(
        1,
        Math.ceil(sortedTenants.length / itemsPerPage),
    );

    const selectedTenantRow = useMemo(
        () =>
        sortedTenants.find(
            (tenant) => tenant.reservationId === selectedReservationId,
        ) || null,
        [sortedTenants, selectedReservationId],
    );

    const selectedTenantForModal = useMemo(() => {
        if (!selectedReservationId) return null;

        return {
            reservationId: selectedReservationId,
            ...(selectedTenantRow || {}),
            ...(tenantDetail || {}),
            isOwnerViewing: isOwner,
        };
    }, [
        selectedReservationId,
        selectedTenantRow,
        tenantDetail,
        isOwner,
    ]);

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
        sortBy,
    ]);

      useEffect(() => {
          if (hasActiveFilters) {
            setIsFilterBarOpen(true);
          } else if (previousHasActiveFilters.current) {
            setIsFilterBarOpen(false);
          }

          previousHasActiveFilters.current = hasActiveFilters;
      }, [hasActiveFilters]);

    useEffect(() => {
        if (currentPage > totalPages) {
        setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const toggleQuickFilter = (filterKey) => {
        setQuickFilters((current) =>
        current.includes(filterKey)
            ? current.filter((entry) => entry !== filterKey)
            : [...current, filterKey],
        );
    };

    const clearQuickFilters = () => {
      setQuickFilters([]);
    };

    const resetFilters = () => {
        setSearchTerm("");
        setLeaseStatusFilter("all");
        setPaymentStatusFilter("all");
        setStayStatusFilter("all");
        setDateFrom("");
        setDateTo("");
        setQuickFilters([]);
        setSortBy("newest");
        setBranchFilter(isOwner ? "all" : user?.branch || "all");
      setIsFilterBarOpen(false);
    };

    const invalidateWorkspace = async () => {
        await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        ]);
    };

    const runAction = async (label, callback) => {
        setActionLoading(label);
        try {
        const response = await callback();
        await invalidateWorkspace();
        setActionState({ type: null, tenant: null });
        showNotification(
            response?.message || "Tenant record updated.",
            "success",
            2500,
        );
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

    const notifyBlockedAction = useCallback((actionMeta) => {
      showNotification(
        actionMeta?.reason || "This action is not available for this tenant.",
        "error",
        3500,
      );
    }, []);

    const openActionForTenant = useCallback((tenant, actionKey, actionType) =>
      openTenantAction({
        tenant,
        actionKey,
        actionType,
        notifyBlocked: notifyBlockedAction,
        onAction: setActionState,
      }), [notifyBlockedAction]);

    const handleNextActionClick = useCallback((tenant) => {
      if (!tenant) return;
      const target = resolveTenantNextAction(tenant);
      if (target.type === "navigate") {
        navigate(target.path);
      } else if (target.type === "modal") {
        openActionForTenant(tenant, target.actionKey, target.actionType);
      } else if (target.type === "detail" && target.reservationId) {
        handleOpenTenantDetail(target.reservationId, target.initialTab || "overview");
      }
    }, [navigate, openActionForTenant, handleOpenTenantDetail]);

    const [isExporting, setIsExporting] = useState(false);

    const handleExportCSV = useCallback(() => {
      if (!sortedTenants.length) {
        showNotification("No tenant records available to export for the active filters.", "info", 3000);
        return;
      }
      handleExportTenantsCSV({
        tenants: sortedTenants,
        branchFilter: isOwner ? branchFilter : (user?.branch || "all"),
      });
      showNotification(`Successfully exported ${sortedTenants.length} tenant record(s) to CSV.`, "success", 3000);
    }, [sortedTenants, isOwner, branchFilter, user?.branch]);

    const handleExportPDF = useCallback(async () => {
      if (!sortedTenants.length) {
        showNotification("No tenant records available to export for the active filters.", "info", 3000);
        return;
      }
      setIsExporting(true);
      try {
        await handleExportTenantsPDF({
          tenants: sortedTenants,
          summaryItems,
          branchFilter: isOwner ? branchFilter : (user?.branch || "all"),
          leaseStatusFilter,
          paymentStatusFilter,
          stayStatusFilter,
          searchTerm,
        });
        showNotification("Tenant directory report generated as PDF successfully.", "success", 3000);
      } catch (err) {
        console.error("[TenantsWorkspace] PDF export failed:", err);
        showNotification(err.message || "Failed to generate tenant directory PDF report.", "error", 4000);
      } finally {
        setIsExporting(false);
      }
    }, [
      sortedTenants,
      summaryItems,
      isOwner,
      branchFilter,
      user?.branch,
      leaseStatusFilter,
      paymentStatusFilter,
      stayStatusFilter,
      searchTerm,
    ]);

    const columns = useMemo(
        () => [
        {
            key: "tenantName",
            label: "Tenant",
            sortable: true,
            render: (row) => {
              const indicator = getTenantIndicator(row);
              return (
                <div className="tenant-cell">
                  <div className="relative shrink-0">
                    <ProfileAvatar
                      user={{ name: row.tenantName, email: row.contact?.email }}
                      size={36}
                      defaultOnly
                    />
                    {indicator && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center pointer-events-none"
                        title={indicator.tooltip}
                      >
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${indicator.pingClass} opacity-75`} />
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${indicator.dotClass}`} />
                      </span>
                    )}
                  </div>
                  <div className="tenant-cell__info">
                    <span className="tenant-cell__name">{row.tenantName}</span>
                    <span className="tenant-cell__email">
                      {row.contact?.email || "No email"}
                    </span>
                    <span className="tenant-cell__meta">
                      {row.contact?.phone || "No phone"}
                    </span>
                  </div>
                </div>
              );
            },
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
            label: "Room & Bed",
            render: (row) => (
            <div className="tenant-room-cell">
                <span className="tenant-room-cell__primary">{row.room || "—"}</span>
                <span className="tenant-room-cell__secondary">
                {row.bed || "No bed"}
                </span>
            </div>
            ),
        },
        {
            key: "leaseEndDate",
            label: "Lease & Stay",
            sortable: true,
            render: (row) => {
              const stayBadgeStatus =
                row.stayStatus === "moving_out"
                  ? "moving_out"
                  : row.stayStatus === "moved_out"
                  ? "moved_out"
                  : row.leaseStatus === "expired"
                  ? "expired"
                  : row.leaseStatus === "expiring_soon"
                  ? "expiring_soon"
                  : "active";

              const stayBadgeLabel =
                row.stayStatus === "moving_out"
                  ? "Moving Out"
                  : row.stayStatus === "moved_out"
                  ? "Moved Out"
                  : row.leaseStatus === "expired"
                  ? "Contract Expired"
                  : row.leaseStatus === "expiring_soon"
                  ? "Expiring Soon"
                  : "Active Stay";

              return (
                <div className="tenant-lease-cell">
                  <div className="tenant-lease-cell__primary">
                    <span>{fmtDate(row.leaseEndDate)}</span>
                    {row.daysUntilLeaseEnd != null ? (
                      <span className={`tenant-lease-cell__countdown ${
                        row.daysUntilLeaseEnd < 0
                          ? "tenant-lease-cell__countdown--expired"
                          : row.daysUntilLeaseEnd <= 30
                          ? "tenant-lease-cell__countdown--warning"
                          : ""
                      }`}>
                        {row.daysUntilLeaseEnd < 0
                          ? `(${Math.abs(row.daysUntilLeaseEnd)}d overdue)`
                          : `(${row.daysUntilLeaseEnd}d left)`}
                      </span>
                    ) : (
                      <span className="tenant-lease-cell__countdown">(No contract)</span>
                    )}
                  </div>
                  <div className="tenant-lease-cell__secondary">
                    <StatusBadge
                      module="contract"
                      status={stayBadgeStatus}
                      label={stayBadgeLabel}
                    />
                  </div>
                </div>
              );
            },
        },
        {
            key: "paymentStatus",
            label: "Billing & Balance",
            render: (row) => {
              const isOverdue = row.paymentStatus === "overdue";
              const isPaid = row.paymentStatus === "paid";
              return (
                <div className="tenant-billing-cell">
                  <div className="tenant-billing-cell__status">
                    <StatusBadge module="billing" status={row.paymentStatus} />
                  </div>
                  <div className="tenant-billing-cell__balance">
                    {isPaid && (!row.currentBalance || row.currentBalance === 0) ? (
                      <span className="tenant-billing-balance--settled">₱0.00 settled</span>
                    ) : (
                      <span className={isOverdue ? "tenant-billing-balance--overdue" : "tenant-billing-balance--pending"}>
                        {fmtCurrency(row.currentBalance || 0)}
                      </span>
                    )}
                  </div>
                </div>
              );
            },
        },
        {
            key: "nextAction",
            label: "Action Needed",
            render: (row) => (
              row.nextAction && row.nextAction !== "none" ? (
                <div className="flex flex-col items-start gap-0.5">
                  <button
                    type="button"
                    className={`tenant-action-btn tenant-action-btn--${row.nextAction}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextActionClick(row);
                    }}
                    title={`Quick action: ${row.nextActionLabel}`}
                  >
                    <span>{row.nextActionLabel}</span>
                    <span className="tenant-action-btn__arrow">→</span>
                  </button>
                  {row.nextActionDetail ? (
                    <span className="text-[11px] text-muted-foreground">
                      {row.nextActionDetail}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                  Up to date
                </span>
              )
            ),
        },
        {
            key: "actions",
            label: "Actions",
            align: "right",
            render: (row) => (
            <RowActionsMenu
                row={row}
                onSelect={(id) => handleOpenTenantDetail(id, "overview")}
                onAction={setActionState}
            />
            ),
        },
        ],
        [isOwner, viewedTick, handleNextActionClick, handleOpenTenantDetail],
    );

    const expiredStays = useMemo(() => {
      return (tenants || []).filter(
        (row) => row.stayStatus === "expired_occupancy_continuing" || row.isExpiredOccupancy
      );
    }, [tenants]);

    if (loading && !workspaceData) {
      return <AdminTablePageSkeleton />;
    }

    return (
      <div className="space-y-6">
        <StayExtensionRequests onReviewed={() => queryClient.invalidateQueries()} />
        {/* Pattern 1 Sticky Sub-Header */}
        <AdminPageHeader
          title="Tenants"
          subtitle="Handle renewals, transfers, move-out actions, and current-stay visibility in one workspace."
          actions={
            <ExportButtons
              onCsv={handleExportCSV}
              onPdf={handleExportPDF}
              loading={isExporting}
              disabled={sortedTenants.length === 0}
            />
          }
        />

        {expiredStays.length > 0 && (
          <ExpiredOccupancyAlert
            expiredStays={expiredStays}
            onApproved={() => invalidateWorkspace()}
          />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
          <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                Total Tenants
              </span>
              <div className="flex shrink-0 items-center justify-center text-sky-600 dark:text-sky-400">
                <Users size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums mt-2">
              {summaryItems[0].value}
            </div>
          </div>

          <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                Active Tenants
              </span>
              <div className="flex shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
                <UserRoundCheck size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums mt-2">
              {summaryItems[1].value}
            </div>
          </div>

          <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                Expiring Soon
              </span>
              <div className="flex shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
                <Clock3 size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums mt-2">
              {summaryItems[2].value}
            </div>
          </div>

          <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                Overdue Payments
              </span>
              <div className="flex shrink-0 items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertTriangle size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums mt-2">
              {summaryItems[3].value}
            </div>
          </div>
        </div>

        <TenantFilterBar
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
          sortBy={sortBy}
          setSortBy={setSortBy}
          quickFilters={quickFilters}
          toggleQuickFilter={toggleQuickFilter}
          clearQuickFilters={clearQuickFilters}
          QUICK_FILTERS={QUICK_FILTERS}
          resetFilters={resetFilters}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          isExporting={isExporting}
          disabledExport={sortedTenants.length === 0}
        />


        <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  <th
                    className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => setSortBy((prev) => (prev === "name_asc" ? "name_desc" : "name_asc"))}
                    title="Click to sort alphabetically by tenant name"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>Tenant</span>
                      <ArrowUpDown
                        size={12}
                        className={
                          sortBy === "name_asc" || sortBy === "name_desc"
                            ? "text-sky-600 dark:text-sky-400"
                            : "text-muted-foreground opacity-50"
                        }
                      />
                    </div>
                  </th>
                  {isOwner ? (
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Branch
                    </th>
                  ) : null}
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Room & Bed
                  </th>
                  <th
                    className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => setSortBy((prev) => (prev === "newest" ? "oldest" : "newest"))}
                    title="Click to toggle sorting by move-in / registration date (Newest / Oldest)"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>Lease & Stay</span>
                      <ArrowUpDown
                        size={12}
                        className={
                          sortBy === "newest" || sortBy === "oldest"
                            ? "text-sky-600 dark:text-sky-400"
                            : "text-muted-foreground opacity-50"
                        }
                      />
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Billing & Balance
                  </th>
                  <th
                    className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => setSortBy("urgency")}
                    title="Click to sort by priority and action needed"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>Action Needed</span>
                      <ArrowUpDown
                        size={12}
                        className={
                          sortBy === "urgency"
                            ? "text-sky-600 dark:text-sky-400"
                            : "text-muted-foreground opacity-50"
                        }
                      />
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTenants.map((tenant) => {
                  const isOverdue = tenant.paymentStatus === "overdue";
                  const isPaid = tenant.paymentStatus === "paid";
                  const stayBadgeStatus =
                    tenant.stayStatus === "moving_out"
                      ? "moving_out"
                      : tenant.stayStatus === "moved_out"
                      ? "moved_out"
                      : tenant.leaseStatus === "expired"
                      ? "expired"
                      : tenant.leaseStatus === "expiring_soon"
                      ? "expiring_soon"
                      : "active";

                  const stayBadgeLabel =
                    tenant.stayStatus === "moving_out"
                      ? "Moving Out"
                      : tenant.stayStatus === "moved_out"
                      ? "Moved Out"
                      : tenant.leaseStatus === "expired"
                      ? "Contract Expired"
                      : tenant.leaseStatus === "expiring_soon"
                      ? "Expiring Soon"
                      : "Active Stay";

                  return (
                    <tr
                      key={tenant.reservationId || tenant.tenantName}
                      className="border-b border-[var(--border-light)] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      onMouseEnter={() => prefetchTenantWorkspaceDetail(queryClient, tenant.reservationId)}
                    >
                      {/* 1. Tenant */}
                      <td className="py-3 px-4">
                        {(() => {
                          const indicator = getTenantIndicator(tenant);
                          return (
                            <div className="tenant-cell">
                              <div className="relative shrink-0">
                                <ProfileAvatar
                                  user={{ name: tenant.tenantName, email: tenant.contact?.email }}
                                  size={36}
                                  defaultOnly
                                />
                                {indicator && (
                                  <span
                                    className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center pointer-events-none"
                                    title={indicator.tooltip}
                                  >
                                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${indicator.pingClass} opacity-75`} />
                                    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${indicator.dotClass}`} />
                                  </span>
                                )}
                              </div>
                              <div className="tenant-cell__info">
                                <span className="tenant-cell__name">{tenant.tenantName}</span>
                                <span className="tenant-cell__email">
                                  {tenant.contact?.email || "No email"}
                                </span>
                                <span className="tenant-cell__meta">
                                  {tenant.contact?.phone || "No phone"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 2. Branch (Owner only) */}
                      {isOwner ? (
                        <td className="py-3 px-4 text-sm text-foreground">
                          {formatBranch(tenant.branch) || "—"}
                        </td>
                      ) : null}

                      {/* 3. Room & Bed */}
                      <td className="py-3 px-4">
                        <div className="tenant-room-cell">
                          <span className="tenant-room-cell__primary">{tenant.room || "—"}</span>
                          <span className="tenant-room-cell__secondary">
                            {tenant.bed || "No bed"}
                          </span>
                        </div>
                      </td>

                      {/* 4. Lease & Stay (Consolidated) */}
                      <td className="py-3 px-4">
                        <div className="tenant-lease-cell">
                          <div className="tenant-lease-cell__primary">
                            <span>{fmtDate(tenant.leaseEndDate)}</span>
                            {tenant.daysUntilLeaseEnd != null ? (
                              <span className={`tenant-lease-cell__countdown ${
                                tenant.daysUntilLeaseEnd < 0
                                  ? "tenant-lease-cell__countdown--expired"
                                  : tenant.daysUntilLeaseEnd <= 30
                                  ? "tenant-lease-cell__countdown--warning"
                                  : ""
                              }`}>
                                {tenant.daysUntilLeaseEnd < 0
                                  ? `(${Math.abs(tenant.daysUntilLeaseEnd)}d overdue)`
                                  : `(${tenant.daysUntilLeaseEnd}d left)`}
                              </span>
                            ) : (
                              <span className="tenant-lease-cell__countdown">(No contract)</span>
                            )}
                          </div>
                          <div className="tenant-lease-cell__secondary">
                            <StatusBadge
                              module="contract"
                              status={stayBadgeStatus}
                              label={stayBadgeLabel}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 5. Billing & Balance */}
                      <td className="py-3 px-4">
                        <div className="tenant-billing-cell">
                          <div className="tenant-billing-cell__status">
                            <StatusBadge
                              module="billing"
                              status={tenant.paymentStatus}
                            />
                          </div>
                          <div className="tenant-billing-cell__balance">
                            {isPaid && (!tenant.currentBalance || tenant.currentBalance === 0) ? (
                              <span className="tenant-billing-balance--settled">₱0.00 settled</span>
                            ) : (
                              <span className={isOverdue ? "tenant-billing-balance--overdue" : "tenant-billing-balance--pending"}>
                                {fmtCurrency(tenant.currentBalance || 0)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 6. Action Needed (Interactive CTA Button) */}
                      <td className="py-3 px-4">
                        {tenant.nextAction && tenant.nextAction !== "none" ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <button
                              type="button"
                              className={`tenant-action-btn tenant-action-btn--${tenant.nextAction}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNextActionClick(tenant);
                              }}
                              title={`Quick action: ${tenant.nextActionLabel}`}
                            >
                              <span>{tenant.nextActionLabel}</span>
                              <span className="tenant-action-btn__arrow">→</span>
                            </button>
                            {tenant.nextActionDetail ? (
                              <span className="text-[11px] text-muted-foreground">
                                {tenant.nextActionDetail}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                            Up to date
                          </span>
                        )}
                      </td>

                      {/* 7. View Details */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          className="tenant-view-btn"
                          title="View tenant details"
                          onMouseEnter={() => prefetchTenantWorkspaceDetail(queryClient, tenant.reservationId)}
                          onFocus={() => prefetchTenantWorkspaceDetail(queryClient, tenant.reservationId)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTenantDetail(tenant.reservationId, "overview");
                          }}
                        >
                          <Eye size={14} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sortedTenants.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {isError
                  ? error?.message || "Unable to load tenants"
                  : "No tenants found matching your criteria"}
              </p>
            </div>
          ) : null}

          {sortedTenants.length > 0 ? (
            <div className="p-4 border-t border-[var(--border-light)]">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={sortedTenants.length}
                itemsPerPage={itemsPerPage}
                onPageChange={(page) => setCurrentPage(page)}
                onLimitChange={(newLimit) => {
                  setItemsPerPage(newLimit);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[5, 10, 20, 50]}
                itemLabel="tenants"
              />
            </div>
          ) : null}
        </div>

        <TenantDetailModal
          tenant={selectedTenantForModal}
          initialTab={modalInitialTab}
          onClose={handleCloseTenantDetail}
        />

        {actionState.type === "renew" ? (
          <RenewLeaseModal
            open
            tenant={actionState.tenant}
            detail={actionTenantDetail}
            loading={actionLoading === "renew"}
            onClose={() => setActionState({ type: null, tenant: null })}
            onOfferSubmit={(offerPayload) =>
              runAction("renew_offer", async () => {
                return reservationApi.createRenewalOffer(
                  actionState.tenant.reservationId,
                  offerPayload,
                );
              })
            }
            onSubmit={(payload) =>
              runAction("renew", async () => {
                const currentLeaseEnd =
                  actionContext?.currentStay?.leaseEndDate ||
                  actionTenantDetail?.leaseInfo?.leaseEndDate;
                const defaultStart = new Date(currentLeaseEnd || Date.now());
                defaultStart.setDate(defaultStart.getDate() + 1);
                return reservationApi.renew(actionState.tenant.reservationId, {
                  newLeaseStartDate:
                    payload.newLeaseStartDate || toDateInputValue(defaultStart),
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
            sourceRoomLatestReading={actionContext?.sourceRoomLatestReading ?? null}
            electricityRatePerUnit={actionContext?.electricityRatePerUnit ?? null}
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("transfer", async () => {
                return reservationApi.transfer(
                  actionState.tenant.reservationId,
                  {
                    targetRoomId: payload.roomId,
                    targetBedId: payload.bedId,
                    effectiveTransferDate:
                      payload.effectiveTransferDate ||
                      toDateInputValue(new Date()),
                    effectiveTransferTime: payload.effectiveTransferTime || undefined,
                    reason: payload.reason,
                    notes: payload.notes || "",
                    sourceRoomMeterReading: payload.sourceRoomMeterReading,
                    targetRoomMeterReading: payload.targetRoomMeterReading,
                    confirm: true,
                  },
                );
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
            sourceRoomLatestReading={actionContext?.sourceRoomLatestReading ?? null}
            electricityRatePerUnit={actionContext?.electricityRatePerUnit ?? null}
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("moveOut", async () => {
                const response = await reservationApi.moveOut(
                  actionState.tenant.reservationId,
                  {
                    moveOutDate: payload.moveOutDate,
                    actualVacateDate:
                      payload.actualVacateDate || payload.moveOutDate,
                    reason: payload.reason || "move_out",
                    finalNotes: payload.finalNotes || payload.notes || "",
                    damages: payload.damages || 0,
                    deductions: payload.deductions || 0,
                    outstandingBalanceSnapshot:
                      actionContext?.billingSummary?.currentBalance ??
                      actionTenantDetail?.paymentInfo?.currentBalance ??
                      0,
                    finalWaterReading: payload.finalWaterReading,
                    finalUtilityReading:
                      payload.finalUtilityReading ?? payload.meterReading,
                    confirm: true,
                  },
                );
                if (
                  selectedReservationId === actionState.tenant.reservationId
                ) {
                  setSelectedReservationId(null);
                }
                return response;
              })
            }
          />
        ) : null}
      </div>
    );
    }
