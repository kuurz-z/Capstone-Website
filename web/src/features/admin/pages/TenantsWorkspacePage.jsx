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
    Filter,
    Clock3,
    } from "lucide-react";
    import { useAuth } from "../../../shared/hooks/useAuth";
    import {
    useTenantActionContext,
    useTenantWorkspace,
    useTenantWorkspaceDetail,
    } from "../../../shared/hooks/queries/useReservations";
    import { reservationApi } from "../../../shared/api/apiClient";
    import { showNotification } from "../../../shared/utils/notification";
    import { StatusBadge } from "../components/shared";
    import TenantDetailModal from "../components/TenantDetailModal";
    import TenantFilterBar from "../components/TenantFilterBar";
    import {
    MoveOutModal,
    RenewLeaseModal,
    TransferTenantModal,
    } from "../components/TenantWorkspaceModals";
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
        <div
        className="flex items-center justify-center gap-2"
        data-action-cell="true"
        >
        <button
            type="button"
            className="text-sm font-medium text-[#c99700] hover:text-[#ad8400] hover:underline"
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
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
                        className="fixed inset-0 z-[59]"
                        data-action-portal="true"
                        aria-label="Close tenant actions"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        ref={menuRef}
                        className="fixed z-[60] w-48 overflow-hidden rounded-lg border border-[var(--border-light)] bg-popover shadow-lg"
                        data-action-portal="true"
                        style={{
                        top: `${menuPosition.top}px`,
                        left: `${menuPosition.left}px`,
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {TENANT_ACTION_ITEMS.map(
                        ({ key, type, label, icon: Icon, className }) => {
                            const actionMeta = getTenantActionMeta(row, key);
                            return (
                            <button
                                key={key}
                                type="button"
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                                className === "tenant-dropdown-item--danger"
                                    ? "text-red-600"
                                    : "text-foreground"
                                }`}
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
                        },
                        )}
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
    const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
    const [selectedReservationId, setSelectedReservationId] = useState(null);
    const [actionState, setActionState] = useState({ type: null, tenant: null });
    const [currentPage, setCurrentPage] = useState(1);
    const [actionLoading, setActionLoading] = useState(null);

    const hasActiveFilters =
      Boolean(searchTerm.trim()) ||
      branchFilter !== "all" ||
      leaseStatusFilter !== "all" ||
      paymentStatusFilter !== "all" ||
      stayStatusFilter !== "all" ||
      Boolean(dateFrom || dateTo) ||
      quickFilters.length > 0;

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
            label: "Total Residents",
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

    const paginatedTenants = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedTenants.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedTenants, currentPage]);

    const totalPages = Math.max(
        1,
        Math.ceil(sortedTenants.length / ITEMS_PER_PAGE),
    );

    const startRecord =
        sortedTenants.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endRecord = Math.min(
        currentPage * ITEMS_PER_PAGE,
        sortedTenants.length,
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

        const base = selectedTenantRow || {};
        const detail = tenantDetail || {};
        const basicInfo = detail.basicInfo || {};
        const leaseInfo = detail.leaseInfo || {};
        const paymentInfo = detail.paymentInfo || {};

        const extensionHistory = (leaseInfo.extensionHistory || []).map(
        (entry) => ({
            id: entry.id,
            duration: `+${entry.addedMonths || 0} month${entry.addedMonths === 1 ? "" : "s"}`,
            date: fmtDate(entry.extendedAt),
            previousEnd: `${entry.previousDuration || 0} months`,
            newEnd: `${entry.newDuration || 0} months`,
        }),
        );

        const roomHistory = (detail.roomHistory || []).map((entry) => ({
        id: entry.id,
        branch:
            formatBranch(entry.branch || basicInfo.branch || base.branch || "") ||
            "N/A",
        room: entry.roomName || "N/A",
        bed: entry.bedLabel || "No bed",
        moveInDate: fmtDate(entry.moveInDate),
        status: entry.moveOutDate ? "past" : "current",
        }));

        const warnings = (detail.systemWarnings || []).map((warning, index) => ({
        id: warning.code || `${warning.message || "warning"}-${index}`,
        type: warning.code || "warning",
        message: warning.message || "Warning",
        date: fmtDate(warning.createdAt),
        severity:
            warning.severity === "error"
            ? "high"
            : warning.severity === "warning"
                ? "medium"
                : "low",
        }));

        return {
        reservationId: selectedReservationId,
        initials:
            (base.tenantName || basicInfo.name || "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase() || "?",
        name:
            basicInfo.name ||
            base.tenantName ||
            (tenantDetailLoading ? "Loading..." : "Tenant"),
        email: basicInfo.email || base.contact?.email || "",
        phone: basicInfo.phone || base.contact?.phone || "",
        emergencyContact: basicInfo.emergencyContactName || "",
        emergencyPhone: basicInfo.emergencyContactPhone || "",
        branch: formatBranch(basicInfo.branch || base.branch || "") || "N/A",
        room: basicInfo.room || base.room || "N/A",
        bed: basicInfo.bed || base.bed || "",
        moveIn: fmtDate(leaseInfo.moveInDate || base.moveInDate),
        moveOut: fmtDate(leaseInfo.leaseEndDate || base.leaseEndDate),
        contractEnd: fmtDate(leaseInfo.leaseEndDate || base.leaseEndDate),
        daysRemaining:
            leaseInfo.daysUntilLeaseEnd ?? base.daysUntilLeaseEnd ?? null,
        contractStatus: detail.leaseStatus || base.leaseStatus || "unknown",
        paymentStatus: detail.paymentStatus || base.paymentStatus || "unknown",
        occupancyStatus: detail.stayStatus || base.stayStatus || "unknown",
        nextAction: detail.nextAction || base.nextAction || "none",
        monthlyRate: paymentInfo.monthlyRent ?? base.monthlyRent,
        initialDeposit: paymentInfo.initialDeposit,
        balance: paymentInfo.currentBalance,
        paymentHistory: paymentInfo.recentPayments || [],
        extensionHistory,
        roomHistory,
        warnings,
        };
    }, [
        selectedReservationId,
        selectedTenantRow,
        tenantDetail,
        tenantDetailLoading,
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
        setBranchFilter(isOwner ? "all" : user?.branch || "all");
      setIsFilterBarOpen(false);
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
                <span className="tenant-cell__email">
                    {row.contact?.email || "No email"}
                </span>
                <span className="tenant-cell__meta">
                    {row.contact?.phone || "No phone"}
                </span>
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
                <span className="tenant-room-cell__secondary">
                {row.bed || "No bed"}
                </span>
            </div>
            ),
        },
        {
            key: "leaseEndDate",
            label: "Contract End",
            sortable: true,
            render: (row) => (
            <div className="tenant-room-cell">
                <span className="tenant-room-cell__primary">
                {fmtDate(row.leaseEndDate)}
                </span>
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
      <div className="space-y-6">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-foreground">
            Tenants
          </h2>
          <p className="text-sm text-muted-foreground">
            Handle renewals, transfers, move-out actions, and current-stay
            visibility in one workspace.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-blue-600">
                  {summaryItems[0].value}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Residents
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserRoundCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-green-600">
                  {summaryItems[1].value}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Active Tenants
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock3 className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-amber-500">
                  {summaryItems[2].value}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Expiring Soon
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-red-500">
                  {summaryItems[3].value}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Overdue Payments
                </div>
              </div>
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
          quickFilters={quickFilters}
          toggleQuickFilter={toggleQuickFilter}
          clearQuickFilters={clearQuickFilters}
          QUICK_FILTERS={QUICK_FILTERS}
          resetFilters={resetFilters}
        />


        <div className="bg-[var(--card)] border border-[var(--border-light)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tenant
                  </th>
                  {isOwner ? (
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Branch
                    </th>
                  ) : null}
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Room + Bed
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Contract End
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Billing
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Contract
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Occupancy
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Next Action
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTenants.map((tenant) => (
                  <tr
                    key={tenant.reservationId || tenant.tenantName}
                    className="border-b border-[var(--border-light)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    onClick={() => setSelectedReservationId(tenant.reservationId)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                          {tenant.tenantName
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-foreground">
                            {tenant.tenantName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tenant.contact?.email || "No email"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tenant.contact?.phone || "No phone"}
                          </div>
                        </div>
                      </div>
                    </td>
                    {isOwner ? (
                      <td className="py-3 px-4 text-sm text-foreground">
                        {formatBranch(tenant.branch) || "—"}
                      </td>
                    ) : null}
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-foreground">
                        {tenant.room || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.bed || "No bed"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-foreground">
                        {fmtDate(tenant.leaseEndDate)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.daysUntilLeaseEnd == null
                          ? "No contract"
                          : `${tenant.daysUntilLeaseEnd} day${tenant.daysUntilLeaseEnd === 1 ? "" : "s"}`}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={tenant.paymentStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={tenant.leaseStatus} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={tenant.stayStatus} />
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {tenant.nextActionLabel}
                    </td>
                    <td className="py-3 px-4">
                      <RowActionsMenu
                        row={tenant}
                        onSelect={setSelectedReservationId}
                        onAction={setActionState}
                      />
                    </td>
                  </tr>
                ))}
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

          {totalPages > 1 ? (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-light)]">
              <span className="text-xs text-muted-foreground">
                Showing {startRecord} to {endRecord} of {sortedTenants.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  className="px-3 py-1.5 text-xs border border-[var(--border-light)] rounded-md hover:bg-muted disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  className="px-3 py-1.5 text-xs border border-[var(--border-light)] rounded-md hover:bg-muted disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <TenantDetailModal
          tenant={selectedTenantForModal}
          onClose={() => setSelectedReservationId(null)}
        />

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
                if (
                  !window.confirm(
                    "Confirm lease renewal? This will preserve the current stay history and create a new lease term.",
                  )
                ) {
                  return null;
                }
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
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("transfer", async () => {
                if (
                  !window.confirm(
                    "Confirm room transfer? This will close the current room history and create a new room assignment.",
                  )
                ) {
                  return null;
                }
                return reservationApi.transfer(
                  actionState.tenant.reservationId,
                  {
                    targetRoomId: payload.roomId,
                    targetBedId: payload.bedId,
                    effectiveTransferDate:
                      payload.effectiveTransferDate ||
                      toDateInputValue(new Date()),
                    reason: payload.reason,
                    notes: payload.notes || "",
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
            onClose={() => setActionState({ type: null, tenant: null })}
            onSubmit={(payload) =>
              runAction("moveOut", async () => {
                if (
                  !window.confirm(
                    "Confirm move-out? This will end the active stay and release the assigned bed while preserving tenant history.",
                  )
                ) {
                  return null;
                }
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