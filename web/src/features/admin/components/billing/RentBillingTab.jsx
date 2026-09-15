import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCw,
  Send,
  Users,
  CheckCircle,
  Home,
  Settings,
  Search,
  Sparkles,
  TrendingUp,
  User,
  DollarSign,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  ChevronDown,
  X
} from "lucide-react";
import { billingApi } from "../../../../shared/api/apiClient";
import { useAdminPayments } from "../../../../shared/hooks/queries/useBilling";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { showConfirmation, showNotification } from "../../../../shared/utils/notification";
import { fmtCurrency, fmtDate, fmtMonth, formatBranch } from "../../utils/formatters";
import { AdminTablePageSkeleton } from "../AdminContentSkeletons";
import BatchGenerateRentBillsModal from "./BatchGenerateRentBillsModal";
import {
  buildPaymentLedgerByBillId as buildSharedPaymentLedgerByBillId,
  formatAdminPaymentMode,
  getNormalizedBillSnapshot as getSharedNormalizedBillSnapshot,
  getNormalizedPaidState as getSharedNormalizedPaidState,
  resolvePaymentDetails as resolveSharedPaymentDetails,
} from "./paymentDisplay";

const OWNER_ROLES = new Set(["owner"]);

const BRANCH_OPTIONS = [
  { value: "", label: "All Branches" },
  { value: "gil-puyat", label: "Gil-Puyat" },
  { value: "guadalupe", label: "Guadalupe" },
];

const TENANT_STATUS_LABELS = {
  ready: "Upcoming",
  pending_generation: "Pending Generation",
  generated: "Generated",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  partially_paid: "Partially paid",
  missing_data: "Action Required",
  already_billed: "Duplicate bill",
};

const getInitials = (name) => {
  if (!name) return "TN";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const getCurrentMonthInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getId = (value) => String(value?._id || value?.id || value || "");

const normalizeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCycle = (start, end) => {
  if (!start || !end) return "Missing cycle";
  return `${fmtDate(start)} - ${fmtDate(end)}`;
};

const isGenerationDatePast = (date) => {
  if (!date) return false;
  const genDate = new Date(date);
  if (Number.isNaN(genDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  genDate.setHours(0, 0, 0, 0);
  return genDate.getTime() < today.getTime();
};

const getNextCronCountdown = () => {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const manilaTime = new Date(utcTime + 8 * 3600000);
  const nextMidnight = new Date(manilaTime);
  nextMidnight.setHours(24, 0, 0, 0);
  const diffMs = nextMidnight.getTime() - manilaTime.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMinutes = Math.floor((diffMs % 3600000) / 60000);
  return `${diffHours}h ${diffMinutes}m`;
};

const buildPdfFilename = (bill) =>
  `${bill?.billReference || bill?.id || "rent-bill"}.pdf`;

const isBillSent = (bill) =>
  Boolean(
    bill?.sentAt ||
      bill?.delivery?.email?.status === "sent" ||
      bill?.delivery?.notification?.status === "sent",
  );

const getBillDaysOverdue = (bill) => {
  if (!bill?.dueDate || bill?.status === "paid") return 0;
  const dueDate = new Date(bill.dueDate);
  if (Number.isNaN(dueDate.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
  return diffDays > 0 ? diffDays : 0;
};

const canSendReminder = (bill, paymentRecord = null) => {
  const normalized = getSharedNormalizedBillSnapshot(bill, paymentRecord, {
    isSent: isBillSent,
    getDaysOverdue: getBillDaysOverdue,
  });
  return Boolean(
    bill &&
      !normalized.isPaid &&
      ["pending", "partially-paid", "overdue"].includes(normalized.rawStatus),
  );
};

const formatPaymentMethodLabel = (value) => {
  if (!value) return "—";
  return formatAdminPaymentMode({ paymentMethod: value });
};

const buildPaymentLedgerByBillId = (payments = []) => {
  return buildSharedPaymentLedgerByBillId(payments);
};

const getBillPenaltyAmount = (bill) => Number(bill?.charges?.penalty || 0);

const getNormalizedPaidState = (bill, paymentRecord = null) => {
  return getSharedNormalizedPaidState(bill, paymentRecord);
};

const getNormalizedBillSnapshot = (bill, paymentRecord = null) => {
  return getSharedNormalizedBillSnapshot(bill, paymentRecord, {
    isSent: isBillSent,
    getDaysOverdue: getBillDaysOverdue,
  });
};

const canSendPenaltyNotice = (bill, paymentRecord = null) =>
  Boolean(bill && !getNormalizedPaidState(bill, paymentRecord).isPaid && getBillPenaltyAmount(bill) > 0);

const getPenaltyReason = (bill) => {
  if (!canSendPenaltyNotice(bill)) return "";
  const daysLate = Number(bill?.penaltyDetails?.daysLate || 0);
  const ratePerDay = Number(bill?.penaltyDetails?.ratePerDay || 0);
  if (daysLate > 0 && ratePerDay > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} at PHP ${ratePerDay.toFixed(2)}/day`;
  }
  if (daysLate > 0) {
    return `Late payment penalty for ${daysLate} day${daysLate === 1 ? "" : "s"} overdue`;
  }
  return "Late payment penalty applied";
};

const getTenantBill = (tenant, billsById) => {
  const billId = getId(tenant?.currentMonthBill?.id || tenant?.currentMonthBill?._id);
  return billId ? billsById.get(billId) || tenant.currentMonthBill : null;
};

const getTenantStatus = (tenant, bill, paymentRecord = null) => {
  if (!tenant?.currentMonthBill) {
    return tenant?.billStatus === "missing_data" ? "missing_data" : "ready";
  }
  return getNormalizedBillSnapshot(bill, paymentRecord).status;
};

const getStatusConfig = (status) => {
  switch (status) {
    case "paid":
      return { text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" };
    case "sent":
      return { text: "text-sky-700 dark:text-sky-400", dot: "bg-sky-500" };
    case "generated":
    case "pending_generation":
      return { text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" };
    case "overdue":
    case "missing_data":
      return { text: "text-rose-700 dark:text-rose-400", dot: "bg-rose-500" };
    case "ready":
    default:
      return { text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-400" };
  }
};

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  preview,
  isGenerating,
  onClose,
  onGenerate,
}) {
  if (!preview) return null;

  const duplicateBill = preview.duplicateBill;
  const generateDisabled = isGenerating || Boolean(duplicateBill);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl">
        <div className="border-b border-border bg-muted/20 px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--color-accent,#D4AF37)]">
            Manual Override
          </p>
          <h3 className="mt-1 text-lg font-semibold text-card-foreground">Force Rent Bill Generation</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <div className="rounded-xl border border-border/50 bg-background px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Tenant</p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">{preview.tenant?.name}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-background px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Room / Bed</p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">{preview.room?.name}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-background px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Billing Period</p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">
              {formatCycle(preview.billingPeriod?.start, preview.billingPeriod?.end)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-background px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Due Date</p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">{fmtDate(preview.dueDate)}</p>
          </div>
        </div>

        <div className="space-y-3 border-t border-border bg-muted/10 px-6 py-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monthly rent</span>
            <span className="font-medium text-card-foreground">{fmtCurrency(preview.charges?.rent || 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Appliance fee</span>
            <span className="font-medium text-card-foreground">{fmtCurrency(preview.charges?.applianceFees || 0)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-4 text-base">
            <span className="font-semibold text-card-foreground">Total amount due</span>
            <span className="text-xl font-bold text-[color:var(--color-accent,#D4AF37)]">
              {fmtCurrency(preview.totalAmount || 0)}
            </span>
          </div>
        </div>

        {duplicateBill && (
          <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl border border-warning/20 bg-warning-light p-4 text-sm text-warning-dark">
            <AlertCircle size={18} className="shrink-0" /> 
            <div>
              <p className="font-semibold">Duplicate Bill Detected</p>
              <p className="text-xs">A bill for this cycle has already been generated.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border bg-card px-4 text-xs font-bold text-card-foreground shadow-sm transition hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generateDisabled}
            title={generateDisabled ? "A bill for this cycle has already been generated" : "Generate and dispatch rent bill statement now"}
            className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md transition-transform hover:bg-emerald-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-600 disabled:active:scale-100"
          >
            {isGenerating ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} className="text-white" />}
            Generate & Send Statement
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RentBillingTab({
  isActive,
  ownerBranchFilter = "",
  onOwnerBranchChange,
}) {
  const { user } = useAuth();
  const isOwner = OWNER_ROLES.has(user?.role);
  const [internalBranch, setInternalBranch] = useState(
    ownerBranchFilter || (user?.branch || "")
  );

  const branch = isOwner
    ? ownerBranchFilter !== undefined
      ? ownerBranchFilter
      : internalBranch
    : user?.branch || "";

  useEffect(() => {
    if (ownerBranchFilter !== undefined) {
      setInternalBranch(ownerBranchFilter);
    }
  }, [ownerBranchFilter]);

  const handleBranchSelectChange = (newBranch) => {
    setInternalBranch(newBranch);
    if (onOwnerBranchChange) {
      onOwnerBranchChange(newBranch);
    }
  };

  const isBranchAssigned = isOwner || Boolean(user?.branch);
  const hasManageBillingPermission = isOwner || (
    user?.role === "branch_admin" && (
      !Array.isArray(user.permissions) ||
      user.permissions.length === 0 ||
      user.permissions.includes("manageBilling")
    )
  );

  const [timeframeMode, setTimeframeMode] = useState("month"); // "month" | "all"
  const [month, setMonth] = useState(getCurrentMonthInput());
  
  const [tenants, setTenants] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [activeTab, setActiveTab] = useState('all'); // all, upcoming, overdue, exceptions
  const [searchQuery, setSearchQuery] = useState("");
  const [cronCountdown, setCronCountdown] = useState(getNextCronCountdown());

  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [activeNoticeKey, setActiveNoticeKey] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewTenant, setPreviewTenant] = useState(null);

  const [selectedReservationIds, setSelectedReservationIds] = useState(new Set());
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  const branchParam = branch && branch !== "all" ? branch : undefined;
  const canLoad = isOwner || Boolean(branch);
  const activeMonthParam = timeframeMode === "all" ? "all" : month;

  const fetchIdRef = useRef(0);

  // Keep cron countdown fresh
  useEffect(() => {
    const interval = setInterval(() => {
      setCronCountdown(getNextCronCountdown());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Clear selection and preview modal on filter/branch switches
  useEffect(() => {
    setSelectedReservationIds(new Set());
    setPreview(null);
    setPreviewTenant(null);
  }, [branchParam, activeMonthParam, timeframeMode, activeTab, searchQuery]);

  const loadData = useCallback(async () => {
    if (!canLoad || !isActive) return;
    const currentFetchId = ++fetchIdRef.current;

    if (!hasLoadedOnceRef.current) {
      setInitialLoading(true);
    } else {
      setLoading(true);
    }
    try {
      const [tenantData, billData] = await Promise.all([
        billingApi.getRentBillableTenants({ branch: branchParam, month: activeMonthParam }),
        billingApi.getRentBills({ branch: branchParam, month: activeMonthParam, limit: 1000 }),
      ]);
      // Commit only if this is still the most recent request
      if (currentFetchId === fetchIdRef.current) {
        setTenants(tenantData?.tenants || []);
        setBills(billData?.bills || []);
        hasLoadedOnceRef.current = true;
      }
    } catch (error) {
      if (currentFetchId === fetchIdRef.current) {
        showNotification(error?.message || "Failed to load rent billing.", "error");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setInitialLoading(false);
        setLoading(false);
      }
    }
  }, [branchParam, canLoad, isActive, activeMonthParam]);

  useEffect(() => {
    if (isActive) loadData();
  }, [isActive, loadData]);

  const paymentParams = useMemo(() => ({ branch: branchParam, limit: 1000 }), [branchParam]);
  const { data: paymentLedgerData } = useAdminPayments(paymentParams, { enabled: Boolean(isActive && canLoad) });
  const paymentsByBillId = useMemo(
    () => buildPaymentLedgerByBillId(paymentLedgerData?.data || []),
    [paymentLedgerData?.data],
  );

  const billsById = useMemo(() => new Map(bills.map((b) => [getId(b.id || b._id), b])), [bills]);

  // Derived state for the table with contract-rate locking and pending generation detection
  const tableRows = useMemo(() => {
    if (timeframeMode === "all") {
      // 1. Build a row for every bill in bills (all historical and current statements)
      const billedReservationIds = new Set();
      const billRows = bills.map((bill) => {
        const billId = getId(bill.id || bill._id);
        const reservationId = getId(bill.reservationId?._id || bill.reservationId);
        if (reservationId) billedReservationIds.add(reservationId);
        
        const paymentRecord = billId ? paymentsByBillId.get(billId) : null;
        const normalizedBill = getNormalizedBillSnapshot(bill, paymentRecord);
        const tenantName = bill.tenant?.name || `${bill.userId?.firstName || ""} ${bill.userId?.lastName || ""}`.trim() || bill.tenantName || "Tenant";
        const roomName = bill.roomName || bill.room || bill.reservationId?.roomName || "Unassigned";
        const contractRate = normalizeAmount(bill.charges?.rent || bill.grossAmount || bill.totalAmount || 0);

        return {
          id: billId,
          reservationId: reservationId || billId,
          tenantName,
          roomName,
          branch: bill.branch,
          bill,
          paymentRecord,
          normalizedBill,
          computedStatus: normalizedBill.status,
          contractRate,
          billingCycleStart: bill.billingCycleStart,
          billingCycleEnd: bill.billingCycleEnd,
          dueDate: normalizedBill.dueDate || bill.dueDate,
          daysOverdue: normalizedBill.daysOverdue,
          isPastGen: false,
          applianceFees: normalizeAmount(bill.charges?.applianceFees || 0),
          isHistoricalBill: true,
        };
      });

      // 2. For active tenants who do not have any bill generated yet, include them as upcoming / action required
      const unbilledTenantRows = tenants
        .filter((tenant) => {
          const resId = getId(tenant.reservationId);
          const currentBillId = getId(tenant.currentMonthBill?.id || tenant.currentMonthBill?._id);
          const isAlreadyBilled =
            (currentBillId && billsById.has(currentBillId)) ||
            tenant.billStatus === "already_billed" ||
            billedReservationIds.has(resId);
          return !isAlreadyBilled;
        })
        .map((tenant) => {
          const contractRate = normalizeAmount(tenant.monthlyRent || tenant.pricingSnapshot?.finalMonthlyRate || 0);
          const isMissingData = tenant.billStatus === "missing_data" || contractRate <= 0;
          const genDate = tenant.nextBillingDate || tenant.billingCycle?.generationDate;
          const isPastGen = isGenerationDatePast(genDate);
          let computedStatus = isMissingData ? "missing_data" : "ready";
          if (computedStatus === "ready" && isPastGen) {
            computedStatus = "pending_generation";
          }
          return {
            ...tenant,
            id: getId(tenant.reservationId),
            bill: null,
            paymentRecord: null,
            normalizedBill: { isPaid: false, balance: contractRate, paidAmount: 0, status: computedStatus, daysOverdue: 0 },
            computedStatus,
            contractRate,
            daysOverdue: 0,
            isPastGen,
            isHistoricalBill: false,
          };
        });

      return [...billRows, ...unbilledTenantRows].sort((a, b) => {
        const order = { missing_data: 1, overdue: 2, pending_generation: 3, ready: 4, generated: 5, sent: 6, partially_paid: 7, paid: 8 };
        const statusDiff = (order[a.computedStatus] || 99) - (order[b.computedStatus] || 99);
        if (statusDiff !== 0) return statusDiff;
        const dateA = new Date(a.dueDate || a.billingCycleEnd || 0).getTime();
        const dateB = new Date(b.dueDate || b.billingCycleEnd || 0).getTime();
        return dateB - dateA;
      });
    }

    // Specific Month mode: standard active cycle calculation
    return tenants.map((tenant) => {
      const bill = getTenantBill(tenant, billsById);
      const billId = getId(bill?.id || bill?._id);
      const paymentRecord = billId ? paymentsByBillId.get(billId) : null;
      const normalizedBill = getNormalizedBillSnapshot(bill, paymentRecord);
      const baseStatus = bill ? normalizedBill.status : getTenantStatus(tenant, bill, paymentRecord);
      
      const contractRate = normalizeAmount(tenant.monthlyRent || tenant.pricingSnapshot?.finalMonthlyRate || 0);
      const isMissingData = baseStatus === "missing_data" || contractRate <= 0;
      
      const genDate = tenant.nextBillingDate || tenant.billingCycle?.generationDate;
      const isPastGen = isGenerationDatePast(genDate);
      
      let computedStatus = isMissingData ? "missing_data" : baseStatus;
      if (computedStatus === "ready" && isPastGen) {
        computedStatus = "pending_generation";
      }

      return {
        ...tenant,
        id: getId(tenant.reservationId),
        bill,
        paymentRecord,
        normalizedBill,
        computedStatus,
        contractRate,
        daysOverdue: normalizedBill.daysOverdue,
        isPastGen,
        isHistoricalBill: false,
      };
    }).sort((a, b) => {
      // Sort by status priority: exceptions -> overdue -> pending_generation -> ready -> generated -> sent -> partially_paid -> paid
      const order = { missing_data: 1, overdue: 2, pending_generation: 3, ready: 4, generated: 5, sent: 6, partially_paid: 7, paid: 8 };
      return (order[a.computedStatus] || 99) - (order[b.computedStatus] || 99);
    });
  }, [timeframeMode, bills, tenants, billsById, paymentsByBillId]);

  const filteredRows = useMemo(() => {
    let rows = tableRows;
    if (activeTab === 'upcoming') {
      rows = rows.filter(r => r.computedStatus === 'ready' || r.computedStatus === 'pending_generation');
    } else if (activeTab === 'overdue') {
      rows = rows.filter(r => r.computedStatus === 'overdue');
    } else if (activeTab === 'exceptions') {
      rows = rows.filter(r => r.computedStatus === 'missing_data');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        (r.tenantName && r.tenantName.toLowerCase().includes(q)) ||
        (r.roomName && r.roomName.toLowerCase().includes(q)) ||
        (r.branch && r.branch.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [tableRows, activeTab, searchQuery]);

  const kpis = useMemo(() => {
    let expected = 0;
    let collected = 0;
    let outstanding = 0;
    let exceptions = 0;
    let upcoming = 0;

    tableRows.forEach(row => {
      if (row.bill) {
        const applianceFee = Number(row.bill.charges?.applianceFees || 0);
        const billTotal = Number(row.bill.totalAmount || (row.contractRate + applianceFee));
        expected += billTotal;
        collected += row.normalizedBill.paidAmount;
        outstanding += row.normalizedBill.balance;
      } else {
        const applianceFee = Number(row.applianceFees || row.charges?.applianceFees || 0);
        const amount = row.contractRate + (Number.isFinite(applianceFee) ? applianceFee : 0);
        expected += amount;
      }

      if (row.computedStatus === 'missing_data') exceptions++;
      if (row.computedStatus === 'ready' || row.computedStatus === 'pending_generation') upcoming++;
    });

    const collectionPercent = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;

    return { expected, collected, outstanding, exceptions, upcoming, collectionPercent };
  }, [tableRows]);

  const eligibleRows = useMemo(
    () =>
      filteredRows.filter(
        (r) => !r.bill && r.computedStatus !== "missing_data" && r.contractRate > 0,
      ),
    [filteredRows],
  );

  const hasEligibleRows = eligibleRows.length > 0;

  const selectedRows = useMemo(
    () =>
      eligibleRows.filter((r) =>
        selectedReservationIds.has(getId(r.reservationId)),
      ),
    [eligibleRows, selectedReservationIds],
  );

  const selectedTotalAmount = useMemo(
    () =>
      selectedRows.reduce((sum, r) => sum + (Number(r.contractRate) || 0), 0),
    [selectedRows],
  );

  const handleToggleSelect = useCallback((reservationId) => {
    const idStr = String(reservationId || "");
    if (!idStr) return;
    setSelectedReservationIds((prev) => {
      const next = new Set(prev);
      if (next.has(idStr)) {
        next.delete(idStr);
      } else {
        next.add(idStr);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedReservationIds((prev) => {
      if (prev.size === eligibleRows.length) {
        return new Set();
      }
      return new Set(eligibleRows.map((r) => getId(r.reservationId)).filter(Boolean));
    });
  }, [eligibleRows]);

  const handleClearSelection = useCallback(() => {
    setSelectedReservationIds(new Set());
  }, []);

  const handleBatchGenerate = async () => {
    if (isBatchGenerating || selectedReservationIds.size === 0) return;
    setIsBatchGenerating(true);
    try {
      const targetMonth = timeframeMode === "all" ? getCurrentMonthInput() : month;
      const payload = {
        reservationIds: Array.from(selectedReservationIds),
        billingMonth: targetMonth,
        branch: branchParam,
      };
      const result = await billingApi.generateBatchRentBills(payload);
      const generatedCount = result?.summary?.generated ?? result?.bills?.length ?? 0;
      const failedCount = result?.summary?.failed ?? 0;

      if (generatedCount > 0) {
        showNotification(
          `${generatedCount} rent bill${generatedCount !== 1 ? "s" : ""} generated successfully.`,
          "success",
        );
      }
      if (failedCount > 0) {
        showNotification(
          `${failedCount} bill${failedCount !== 1 ? "s" : ""} failed to generate.`,
          "error",
        );
      }

      setSelectedReservationIds(new Set());
      setIsBatchModalOpen(false);
      await loadData();
    } catch (error) {
      showNotification(error?.message || "Batch generation failed.", "error");
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handlePreview = async (tenant) => {
    const reservationId = getId(tenant.reservationId);
    setPreviewLoadingId(reservationId);
    try {
      const targetMonth = timeframeMode === "all" ? getCurrentMonthInput() : month;
      const payload = {
        reservationId,
        branch: tenant.branch || branch || user?.branch,
        billingMonth: targetMonth,
        rentAmount: tenant.contractRate || tenant.monthlyRent,
      };
      const result = await billingApi.previewRentBill(payload);
      setPreview(result?.preview || null);
      setPreviewTenant(tenant);
    } catch (error) {
      showNotification(error?.message || "Preview failed.", "error");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleGenerate = async (tenant, { skipConfirm = false } = {}) => {
    const targetMonth = timeframeMode === "all" ? getCurrentMonthInput() : month;
    const payload = {
      reservationId: getId(tenant.reservationId),
      branch: tenant.branch || branch || user?.branch,
      billingMonth: targetMonth,
      rentAmount: tenant.contractRate || tenant.monthlyRent,
    };
    setGeneratingId(payload.reservationId);
    try {
      await billingApi.generateRentBill(payload);
      showNotification("Rent bill forced successfully.", "success");
      setPreview(null);
      setPreviewTenant(null);
      await loadData();
    } catch (error) {
      showNotification(error?.message || "Generation failed.", "error");
    } finally {
      setGeneratingId(null);
    }
  };

  const handleAction = async (action, bill, noticeType = "reminder", paymentRecord = null) => {
    const billId = getId(bill?.id || bill?._id);
    if (!billId) return;

    if (action === "send_bill") {
      setSendingId(billId);
      try {
        await billingApi.sendRentBill(billId);
        showNotification("Bill sent successfully.", "success");
        await loadData();
      } catch (e) { showNotification(e.message, "error"); }
      finally { setSendingId(null); }
    } else if (action === "reminder") {
      setActiveNoticeKey(`${billId}:${noticeType}`);
      try {
        await billingApi.sendBillReminder(billId, { noticeType });
        showNotification("Notice sent.", "success");
        await loadData();
      } catch (e) { showNotification(e.message, "error"); }
      finally { setActiveNoticeKey(null); }
    } else if (action === "download") {
      setDownloadingId(billId);
      try {
        await billingApi.downloadBillPdf(billId, buildPdfFilename(bill));
        showNotification("PDF downloaded.", "success");
      } catch (e) { showNotification(e.message, "error"); }
      finally { setDownloadingId(null); }
    }
  };

  if (initialLoading && tenants.length === 0 && bills.length === 0) {
    return <AdminTablePageSkeleton />;
  }

  return (
    <section className="space-y-6" aria-label="Rent Billing Observability">
      {/* ── Branch / Permission Diagnostic Alerts ────────────────────────────── */}
      {!isBranchAssigned && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-card p-4 text-xs shadow-xs">
          <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-card-foreground">No Branch Assigned</p>
            <p className="text-muted-foreground">
              Your Branch Admin account is not currently assigned to a branch. Please contact the Dorm Owner to assign your account to Gil-Puyat or Guadalupe to manage rent billing.
            </p>
          </div>
        </div>
      )}

      {isBranchAssigned && !hasManageBillingPermission && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-card p-4 text-xs shadow-xs">
          <ShieldAlert size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-card-foreground">Billing Permissions Restricted</p>
            <p className="text-muted-foreground">
              Your account does not currently have permission to generate or manage bills. Please contact the Dorm Owner to enable "Manage Billing" for your account.
            </p>
          </div>
        </div>
      )}

      {/* ── Dashboard Header & KPIs ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-card-foreground">
            <Settings className="text-slate-600 dark:text-slate-400" size={18} />
            Automated Rent Lifecycle
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Monitor auto-generated rent bills. Bills generate automatically 14 days before their due date.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isOwner && (
            <select
              value={branch}
              onChange={(e) => handleBranchSelectChange(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
              title="Filter by branch"
              aria-label="Filter by branch"
            >
              {BRANCH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={timeframeMode}
              onChange={(e) => setTimeframeMode(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
              title="Select timeframe view"
              aria-label="Select timeframe view"
            >
              <option value="month">Specific Month</option>
              <option value="all">All Time</option>
            </select>

            {timeframeMode === "month" && (
              <input
                type="month"
                min="2020-01"
                max="2099-12"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                className="h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 cursor-pointer"
                title="Select billing month"
                aria-label="Select billing month"
              />
            )}
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card shadow-xs transition-colors hover:bg-muted active:scale-[0.98]"
            title="Refresh rent billing data"
          >
            <RefreshCw size={15} className={loading ? "animate-spin text-muted-foreground" : "text-muted-foreground"} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Expected Revenue</p>
            <div className="flex shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
              <DollarSign size={18} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">{fmtCurrency(kpis.expected)}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-card-foreground">{tableRows.length}</span> {timeframeMode === "all" ? "total record" : "billable tenant"}{tableRows.length !== 1 ? 's' : ''} {timeframeMode === "all" ? "(All-Time)" : ""}
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Collected</p>
            <div className="text-emerald-700 dark:text-emerald-400 font-extrabold text-[12px]">
              {kpis.collectionPercent}%
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">{fmtCurrency(kpis.collected)}</p>
          <div className="mt-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 h-1.5 w-full">
            <div className="h-full bg-emerald-600 rounded-full transition-all duration-500" style={{ width: `${kpis.collectionPercent}%` }} />
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Outstanding</p>
            <div className="flex shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">{fmtCurrency(kpis.outstanding)}</p>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            {kpis.exceptions > 0 ? (
              <span className="font-bold text-red-600 flex items-center gap-1">
                <AlertCircle size={12} /> {kpis.exceptions} missing rate data
              </span>
            ) : (
              <span className="text-slate-500 font-medium">All tenant rates configured</span>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between text-card-foreground">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Clock3 size={16} className="text-sky-600 dark:text-sky-400" />
                Automated Cron System
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Active</span>
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Generates bills 14 days before due date automatically.</p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                Daily at 12:00 AM
              </div>
              <span className="font-semibold text-muted-foreground text-[10px]">
                Next in ~{cronCountdown}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lifecycle Data Table ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/20 px-3.5 py-2.5 gap-2.5">
          <div className="flex overflow-x-auto items-center gap-1 scrollbar-none">
            {[
              { id: 'all', label: 'Lifecycle Overview', count: tableRows.length },
              { id: 'upcoming', label: 'Upcoming Auto-Gen', count: kpis.upcoming },
              { id: 'overdue', label: 'Overdue Rent', count: tableRows.filter(r => r.computedStatus === 'overdue').length },
              { id: 'exceptions', label: 'Action Required', count: kpis.exceptions, isAlert: true },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-lg ${
                  activeTab === tab.id 
                    ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950" 
                    : "text-muted-foreground hover:text-card-foreground hover:bg-card"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    tab.isAlert && tab.count > 0 
                      ? "bg-red-500 text-white" 
                      : activeTab === tab.id 
                        ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900" 
                        : "bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}>
                    {tab.count}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="relative flex items-center shrink-0 w-full sm:w-60">
            <Search size={14} className="absolute left-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              maxLength={50}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tenant or room..."
              className="w-full h-8 rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-medium text-card-foreground shadow-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 p-0.5 rounded-full text-muted-foreground hover:text-card-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedReservationIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/15 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-card-foreground shadow-xs">
                <Users size={14} className="text-slate-500" />
                {selectedReservationIds.size} tenant{selectedReservationIds.size !== 1 ? "s" : ""} selected
              </span>
              <span className="text-xs text-muted-foreground">
                Total Value: <span className="font-bold text-[color:var(--color-accent,#D4AF37)]">{fmtCurrency(selectedTotalAmount)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearSelection}
                className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-[0.98]"
              >
                <Send size={13} />
                Generate Rent Bills ({selectedReservationIds.size})
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto min-h-[380px]">
          <table className="w-full min-w-[860px] table-fixed text-left text-xs">
            <colgroup>
              {hasEligibleRows && <col className="w-[48px]" />}
              <col className="w-[26%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="bg-background">
              <tr>
                {hasEligibleRows && (
                  <th className="w-[48px] px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all eligible tenants"
                      checked={selectedReservationIds.size === eligibleRows.length}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            selectedReservationIds.size > 0 &&
                            selectedReservationIds.size < eligibleRows.length;
                        }
                      }}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="w-[26%] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Tenant / Room</th>
                <th className="w-[20%] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">System Status</th>
                <th className="w-[20%] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Cycle & Due Date</th>
                <th className="w-[18%] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Amount Tracker</th>
                <th className="w-[16%] px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.10em] text-foreground/80 dark:text-slate-300">Override Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={hasEligibleRows ? 6 : 5} className="py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-muted-foreground">
                      <div className="flex shrink-0 items-center justify-center mb-2.5">
                        <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-sm font-bold text-card-foreground">No rent statements found</p>
                      <p className="mt-0.5 text-xs text-muted-foreground text-center">
                        {searchQuery
                          ? `No records match your search "${searchQuery}".`
                          : timeframeMode === "all"
                            ? `No rent billing records found in ${branch ? formatBranch(branch) : 'All Branches'}.`
                            : `No billable tenant records for ${fmtMonth(month)} in ${branch ? formatBranch(branch) : 'All Branches'}.`}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
                          >
                            <X size={12} /> Clear Search
                          </button>
                        )}
                        {timeframeMode === "month" && month !== getCurrentMonthInput() && (
                          <button
                            type="button"
                            onClick={() => setMonth(getCurrentMonthInput())}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
                          >
                            <CalendarDays size={12} /> Current Month
                          </button>
                        )}
                        {timeframeMode === "month" ? (
                          <button
                            type="button"
                            onClick={() => setTimeframeMode("all")}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
                          >
                            <CalendarDays size={12} /> Switch to All Time
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setTimeframeMode("month"); setMonth(getCurrentMonthInput()); }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
                          >
                            <CalendarDays size={12} /> Switch to Current Month
                          </button>
                        )}
                        {branch && isOwner && (
                          <button
                            type="button"
                            onClick={() => setBranch("")}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground shadow-xs hover:bg-muted active:scale-[0.98]"
                          >
                            <Filter size={12} /> All Branches
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowKey = row.bill ? getId(row.bill.id || row.bill._id) : `${getId(row.reservationId)}_${row.computedStatus}`;
                  const reservationId = getId(row.reservationId);
                  const isBusy = previewLoadingId === reservationId || generatingId === reservationId;
                  const genDate = row.nextBillingDate || row.billingCycle?.generationDate;
                  const isEligible = !row.bill && row.computedStatus !== "missing_data" && row.contractRate > 0;
                  const isSelected = selectedReservationIds.has(reservationId);
                  
                  return (
                    <tr key={rowKey} className={`group transition-colors hover:bg-muted/30 ${isSelected ? "bg-muted/20" : ""}`}>
                      {hasEligibleRows && (
                        <td className="w-[48px] px-3 py-3 text-center">
                          {isEligible && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.tenantName}`}
                              checked={isSelected}
                              onChange={() => handleToggleSelect(reservationId)}
                              className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          )}
                        </td>
                      )}
                      <td className="w-[26%] px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-white dark:bg-[#D4AF37] dark:text-[#0A1628] border border-[#0A1628]/20 dark:border-[#D4AF37]/40 text-[11px] font-bold shadow-xs">
                            {getInitials(row.tenantName)}
                          </div>
                          <div>
                            <p className="font-bold text-card-foreground text-xs">{row.tenantName}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                              <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                {row.roomName || "Unassigned"}
                              </span>
                              <span>•</span>
                              <span className="uppercase text-[10px] tracking-wider opacity-85 font-semibold">{formatBranch(row.branch)}</span>
                              {row.bill?.billType === "transfer_settlement" && row.bill?.transferSnapshot?.fromRoomName && (
                                <span className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-slate-800 dark:text-slate-200">
                                  <span>TRANSFER: {row.bill.transferSnapshot.fromRoomName}</span>
                                  <span>→</span>
                                  <span>{row.bill.transferSnapshot.toRoomName || row.roomName}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="w-[20%] px-5 py-3">
                        <div className="flex flex-col items-start gap-1">
                          {(() => {
                            const cfg = getStatusConfig(row.computedStatus);
                            return (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {row.computedStatus === 'missing_data' && <AlertCircle size={11} className="text-rose-600 shrink-0" />}
                                {row.computedStatus === 'pending_generation' && <Clock3 size={11} className="text-amber-600 shrink-0" />}
                                <span>{TENANT_STATUS_LABELS[row.computedStatus] || row.computedStatus}</span>
                              </span>
                            );
                          })()}
                          {row.daysOverdue > 0 && (
                            <p className="text-[10px] font-bold text-red-600">
                              {row.daysOverdue} DAYS OVERDUE
                            </p>
                          )}
                          {row.computedStatus === 'ready' && (
                            <p className="text-[10px] font-medium text-muted-foreground">
                              Auto-generates {fmtDate(genDate)}
                            </p>
                          )}
                          {row.computedStatus === 'pending_generation' && (
                            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                              Scheduled {fmtDate(genDate)} (Awaiting cycle)
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="w-[20%] px-5 py-3">
                        <p className="text-xs font-medium text-card-foreground">
                          {formatCycle(row.billingCycleStart, row.billingCycleEnd)}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                          Due: <span className="font-bold text-card-foreground">{fmtDate(row.dueDate || row.billingCycle?.dueDate)}</span>
                        </p>
                      </td>
                      <td className="w-[18%] px-5 py-3">
                        {(() => {
                          const rentCharge = Number(row.bill?.charges?.rent || row.contractRate || 0);
                          const elecAmt = Number(row.bill?.charges?.electricity || 0);
                          const waterAmt = Number(row.bill?.charges?.water || 0);
                          const applianceAmt = Number(row.bill?.charges?.applianceFees || row.applianceFees || 0);
                          const corkageAmt = Number(row.bill?.charges?.corkageFees || 0);
                          const baseSubtotal = rentCharge + elecAmt + waterAmt + applianceAmt + corkageAmt;
                          
                          const daysLate = Number(row.bill?.penaltyDetails?.daysLate || row.daysOverdue || 0);
                          const penaltyRate = Number(row.bill?.penaltyDetails?.ratePerDay || 50);
                          const persistedPenalty = Number(row.bill?.charges?.penalty || 0);
                          const livePenalty = persistedPenalty > 0 ? persistedPenalty : (daysLate > 0 && !row.normalizedBill?.isPaid ? daysLate * penaltyRate : 0);
                          const discount = Number(row.bill?.charges?.discount || 0);
                          const credit = Number(row.bill?.reservationCreditApplied || 0);
                          
                          const computedTotal = Math.max(0, baseSubtotal + livePenalty - discount - credit);
                          const totalDisplay = row.bill?.totalAmount && persistedPenalty > 0 ? Number(row.bill.totalAmount) : computedTotal;
                          const paidAmount = Number(row.bill?.paidAmount || (row.normalizedBill?.isPaid ? totalDisplay : 0));
                          const remainingBalance = Math.max(0, totalDisplay - paidAmount);

                          if (row.bill) {
                            return (
                              <div className="relative group/breakdown">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-card-foreground">
                                    {fmtCurrency(row.normalizedBill.isPaid ? 0 : remainingBalance)}
                                  </span>
                                  {livePenalty > 0 && !row.normalizedBill.isPaid && (
                                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-border cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors">
                                      +{fmtCurrency(livePenalty)} overdue
                                      <ChevronDown size={10} />
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                                  {livePenalty > 0 && !row.normalizedBill.isPaid ? (
                                    <span>Subtotal: {fmtCurrency(baseSubtotal)} · of {fmtCurrency(totalDisplay)} total</span>
                                  ) : (
                                    <span>of {fmtCurrency(totalDisplay)} total</span>
                                  )}
                                </p>

                                {/* Interactive Overdue / Charge Breakdown Dropdown */}
                                <div className="pointer-events-none group-hover/breakdown:pointer-events-auto absolute right-0 top-full mt-1.5 z-40 hidden group-hover/breakdown:block w-72 rounded-xl border border-border bg-card p-3.5 shadow-xl">
                                  <div className="flex items-center justify-between border-b border-border pb-2 mb-2.5">
                                    <span className="text-xs font-bold text-card-foreground">Billing Breakdown</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${daysLate > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                                      {daysLate > 0 ? `${daysLate}d Overdue` : row.normalizedBill.isPaid ? "Settled" : "Current Cycle"}
                                    </span>
                                  </div>

                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Monthly Base Rent</span>
                                      <span className="font-semibold text-card-foreground">{fmtCurrency(rentCharge)}</span>
                                    </div>
                                    {applianceAmt > 0 && (
                                      <div className="flex justify-between text-muted-foreground">
                                        <span>Appliance Fees</span>
                                        <span className="font-semibold text-card-foreground">{fmtCurrency(applianceAmt)}</span>
                                      </div>
                                    )}
                                    {elecAmt > 0 && (
                                      <div className="flex justify-between text-muted-foreground">
                                        <span>Electricity Share</span>
                                        <span className="font-semibold text-card-foreground">{fmtCurrency(elecAmt)}</span>
                                      </div>
                                    )}
                                    {waterAmt > 0 && (
                                      <div className="flex justify-between text-muted-foreground">
                                        <span>Water Share</span>
                                        <span className="font-semibold text-card-foreground">{fmtCurrency(waterAmt)}</span>
                                      </div>
                                    )}

                                    {/* Subtotal */}
                                    <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-card-foreground">
                                      <span>Subtotal (Base Charges)</span>
                                      <span>{fmtCurrency(baseSubtotal)}</span>
                                    </div>

                                    {/* Overdue / Late Penalty Line */}
                                    {livePenalty > 0 && (
                                      <div className="flex justify-between items-center bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg border border-border text-rose-700 dark:text-rose-400 my-1">
                                        <div className="flex flex-col">
                                          <span className="font-bold text-[11px]">Late Payment Penalty</span>
                                          <span className="text-[10px] text-muted-foreground">{daysLate} days @ ₱{penaltyRate.toFixed(2)}/day</span>
                                        </div>
                                        <span className="font-bold">+{fmtCurrency(livePenalty)}</span>
                                      </div>
                                    )}

                                    {discount > 0 && (
                                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                        <span>Discount Applied</span>
                                        <span>-{fmtCurrency(discount)}</span>
                                      </div>
                                    )}

                                    {/* Total Amount Due */}
                                    <div className="flex justify-between border-t border-border pt-2 font-bold text-card-foreground text-sm">
                                      <span>Total Amount Due</span>
                                      <span>{fmtCurrency(totalDisplay)}</span>
                                    </div>

                                    {paidAmount > 0 && (
                                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-xs">
                                        <span>Total Amount Paid</span>
                                        <span>-{fmtCurrency(paidAmount)}</span>
                                      </div>
                                    )}
                                    {paidAmount > 0 && (
                                      <div className="flex justify-between font-bold text-card-foreground border-t border-dashed border-border pt-1">
                                        <span>Remaining Balance</span>
                                        <span>{fmtCurrency(remainingBalance)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-card-foreground">
                                  {fmtCurrency(row.contractRate)}
                                </span>
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  Contract
                                </span>
                              </div>
                              {Number(row.applianceFees || row.charges?.applianceFees || 0) > 0 && (
                                <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                                  +{fmtCurrency(row.applianceFees || row.charges?.applianceFees)} appliance fee
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="w-[16%] px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!row.bill && (
                            <button
                              type="button"
                              onClick={() => handlePreview(row)}
                              disabled={isBusy || row.computedStatus === 'missing_data'}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-card-foreground shadow-xs transition hover:bg-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card disabled:active:scale-100"
                              title={row.computedStatus === 'missing_data' ? "Contract rate missing. Update tenant contract pricing to enable force generation." : "Manually force rent bill generation before the auto-scheduled date"}
                            >
                              {isBusy ? <LoaderCircle size={13} className="animate-spin text-muted-foreground" /> : <Settings size={13} className="text-[color:var(--color-accent,#D4AF37)]" />}
                              Force Generate
                            </button>
                          )}
                          
                          {row.bill && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAction('download', row.bill)}
                                disabled={downloadingId === getId(row.bill?.id || row.bill?._id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition hover:bg-muted hover:text-card-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                title="Download official rent bill PDF statement"
                              >
                                {downloadingId === getId(row.bill?.id || row.bill?._id) ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
                              </button>
                              
                              {!row.normalizedBill.isPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleAction('reminder', row.bill, canSendPenaltyNotice(row.bill, row.paymentRecord) ? 'penalty' : row.daysOverdue > 0 ? 'overdue' : 'reminder')}
                                  disabled={Boolean(activeNoticeKey)}
                                  title={row.daysOverdue > 0 ? "Send overdue rent notice with late payment tracking" : "Send rent bill reminder notice"}
                                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-xs transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                                    row.daysOverdue > 0 
                                      ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100" 
                                      : "border-border bg-card text-card-foreground hover:bg-muted"
                                  }`}
                                >
                                  {activeNoticeKey?.startsWith(getId(row.bill?.id || row.bill?._id)) ? (
                                    <LoaderCircle size={13} className="animate-spin" />
                                  ) : (
                                    <Send size={13} className={row.daysOverdue > 0 ? "text-red-600" : "text-[color:var(--color-accent,#D4AF37)]"} />
                                  )}
                                  {row.daysOverdue > 0 ? "Send Notice" : "Remind"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal
        preview={preview}
        isGenerating={Boolean(generatingId && previewTenant)}
        onClose={() => { if (!generatingId) { setPreview(null); setPreviewTenant(null); } }}
        onGenerate={() => previewTenant && handleGenerate(previewTenant, { skipConfirm: true })}
      />

      {/* Batch Generate Rent Bills Modal */}
      <BatchGenerateRentBillsModal
        isOpen={isBatchModalOpen}
        onClose={() => {
          if (!isBatchGenerating) setIsBatchModalOpen(false);
        }}
        onConfirm={handleBatchGenerate}
        selectedRows={selectedRows}
        isGenerating={isBatchGenerating}
        billingMonth={activeMonthParam}
      />
    </section>
  );
}
