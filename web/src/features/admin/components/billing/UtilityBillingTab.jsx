import { useEffect, useMemo, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  Droplets,
  History,
  Users,
  Clock3,
  LoaderCircle,
  FileX,
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import NewBillingPeriodModal from "./NewBillingPeriodModal";
import OpenCurrentPeriodModal from "./OpenCurrentPeriodModal";
import CloseCurrentPeriodModal from "./CloseCurrentPeriodModal";
import BillingCycleDetailModal from "./BillingCycleDetailModal";
import {
  useUtilityRooms,
  useUtilityReadings,
  useUtilityLatestReading,
  useUtilityPeriods,
  useUtilityResult,
  useUpdateUtilityPeriod,
  useSendUtilityPeriod,
  useDeleteUtilityReading,
  useUpdateUtilityReading,
  useDeleteUtilityPeriod,
  utilityKeys,
} from "../../../../shared/hooks/queries/useUtility";
import {
  useAdminPayments,
  useBillsByBranch,
} from "../../../../shared/hooks/queries/useBilling";
import { utilityApi } from "../../../../shared/api/utilityApi";
import { billingApi } from "../../../../shared/api/billingApi";
import { useBusinessSettings } from "../../../../shared/hooks/queries/useSettings";
import { exportToCSV } from "../../../../shared/utils/exportUtils";
import { getRoomLabel } from "../../../../shared/utils/roomLabel";
import { fmtDate } from "../../utils/formatters";
import { AdminTablePageSkeleton } from "../AdminContentSkeletons";
import useBillingNotifier from "./shared/useBillingNotifier";
import "./shared/BillingDelta.css";

// Modular sub-components
import UtilityKpiCards from "./utility/UtilityKpiCards";
import UtilityRoomSelector from "./utility/UtilityRoomSelector";
import UtilityCycleOverviewCard from "./utility/UtilityCycleOverviewCard";
import UtilityCycleHistoryPanel from "./utility/UtilityCycleHistoryPanel";
import UtilityTenantPaymentPanel from "./utility/UtilityTenantPaymentPanel";
import UtilityTimelinePanel from "./utility/UtilityTimelinePanel";
import EditReadingModal from "./utility/EditReadingModal";
import EditPeriodModal from "./utility/EditPeriodModal";
import BatchSendReadyModal from "./utility/BatchSendReadyModal";
import {
  fmtCurrency,
  fmtNumber,
  fmtShortDate,
  toInputDate,
  getTodayInput,
  getCycleLabel,
  getDisplayStatus,
  getDisplayStatusLabel,
  getRoomFloor,
  getEventDayKey,
  getEventTypeOrder,
  isMoveLifecycleEvent,
  EVENT_TYPE_LABELS,
  buildPaymentLedgerByBillId,
  resolvePaymentDetails,
  getSegmentPeriodLabel,
  EMPTY_VALUE,
} from "./utility/utilityConstants";

const ROOMS_PER_PAGE = 7;
const PERIODS_PER_PAGE = 5;
const TIMELINE_PER_PAGE = 8;

const UtilityBillingTab = ({
  utilityType = "electricity",
  isActive = true,
  ownerBranchFilter = "",
  onOwnerBranchChange,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notify = useBillingNotifier();
  const isOwner = user?.role === "owner";

  // Branch filter handling
  const [internalBranchFilter, setInternalBranchFilter] = useState(
    ownerBranchFilter || (user?.branch === "guadalupe" ? "guadalupe" : "gil-puyat"),
  );

  const branchFilter = isOwner
    ? ownerBranchFilter !== undefined
      ? ownerBranchFilter
      : internalBranchFilter
    : user?.branch || "";

  useEffect(() => {
    if (ownerBranchFilter !== undefined) {
      setInternalBranchFilter(ownerBranchFilter);
    }
  }, [ownerBranchFilter]);

  const isBranchAssigned = isOwner || Boolean(user?.branch);
  const hasManageBillingPermission = isOwner || (
    user?.role === "branch_admin" && (
      !Array.isArray(user.permissions) ||
      user.permissions.length === 0 ||
      user.permissions.includes("manageBilling")
    )
  );

  // Active sub-tab workspace navigation (history, payments, timeline)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("history");

  // Selection state
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);

  // Filter and pagination states for Room Selector
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomStatusFilter, setRoomStatusFilter] = useState("all");
  const [roomsPage, setRoomsPage] = useState(1);

  // Filter and pagination states for Cycle History
  const [periodStatusFilter, setPeriodStatusFilter] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [periodSearch, setPeriodSearch] = useState("");
  const [periodsPage, setPeriodsPage] = useState(1);

  // Timeline state
  const [timelinePage, setTimelinePage] = useState(1);
  const [unmaskedRows, setUnmaskedRows] = useState({});

  // Modals and UI actions
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "primary",
    confirmText: "Confirm",
    onConfirm: null,
  });
  const [isNewPeriodModalOpen, setIsNewPeriodModalOpen] = useState(false);
  const [isOpenCurrentPeriodModalOpen, setIsOpenCurrentPeriodModalOpen] = useState(false);
  const [isCloseCurrentPeriodModalOpen, setIsCloseCurrentPeriodModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isBatchSendModalOpen, setIsBatchSendModalOpen] = useState(false);
  const [historyModalPeriod, setHistoryModalPeriod] = useState(null);
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sendingByPeriodId, setSendingByPeriodId] = useState({});
  const [activeNoticeKey, setActiveNoticeKey] = useState(null);
  const [lastRemindedByBillId, setLastRemindedByBillId] = useState({});
  const [isBatchReminding, setIsBatchReminding] = useState(false);

  // Edit Reading Form & Modal
  const [editReadingModal, setEditReadingModal] = useState({ open: false, reading: null });
  const [editReadingForm, setEditReadingForm] = useState({ reading: "", date: "", eventType: "regularBilling" });

  // Edit Period Form & Modal
  const [editPeriodModal, setEditPeriodModal] = useState({ open: false, periodId: null });
  const [editPeriodForm, setEditPeriodForm] = useState({
    startDate: "",
    endDate: "",
    startReading: "",
    endReading: "",
    ratePerUnit: "",
  });

  // Queries
  const { data: settingsData } = useBusinessSettings();
  const { data: roomsData, isLoading: roomsLoading } = useUtilityRooms(utilityType, branchFilter);
  const { data: readingsData } = useUtilityReadings(utilityType, selectedRoomId);
  const { data: latestData } = useUtilityLatestReading(utilityType, selectedRoomId);
  const { data: periodsData } = useUtilityPeriods(utilityType, selectedRoomId);

  // Periods list for selected room
  const periodList = useMemo(() => {
    if (!periodsData) return [];
    if (Array.isArray(periodsData)) return periodsData;
    if (Array.isArray(periodsData?.periods)) return periodsData.periods;
    if (Array.isArray(periodsData?.data)) return periodsData.data;
    return [];
  }, [periodsData]);

  const isPeriodValid = useMemo(() => {
    return Boolean(
      selectedPeriodId &&
        periodList.some((p) => (p.id || p._id) === selectedPeriodId),
    );
  }, [selectedPeriodId, periodList]);

  const { data: resultData } = useUtilityResult(utilityType, selectedPeriodId, {
    enabled: isPeriodValid,
  });
  const { data: billsData } = useBillsByBranch(branchFilter);
  const { data: adminPaymentsData } = useAdminPayments({ branch: branchFilter });

  // Mutations
  const updatePeriod = useUpdateUtilityPeriod(utilityType);
  const sendPeriod = useSendUtilityPeriod(utilityType);
  const deleteReading = useDeleteUtilityReading(utilityType);
  const updateReading = useUpdateUtilityReading(utilityType);
  const deletePeriod = useDeleteUtilityPeriod(utilityType);

  // Default rates from settings
  const defaultRatePerUnit = useMemo(() => {
    if (utilityType === "electricity") {
      return Number(settingsData?.utilityRates?.electricityRatePerKwh || 16.0);
    }
    return Number(settingsData?.defaultWaterRatePerUnit ?? 0);
  }, [settingsData, utilityType]);

  // Normalized rooms list (filter out branches like Guadalupe that use fixed-rate billing without separate utilities)
  const rooms = useMemo(() => {
    let list = [];
    if (!roomsData) list = [];
    else if (Array.isArray(roomsData)) list = roomsData;
    else if (Array.isArray(roomsData?.rooms)) list = roomsData.rooms;
    else if (Array.isArray(roomsData?.data)) list = roomsData.data;

    return list.filter((r) => {
      const b = String(r.branch || "").toLowerCase();
      return b !== "guadalupe";
    });
  }, [roomsData]);

  // Available floors from rooms
  const availableFloors = useMemo(() => {
    const floorsSet = new Set();
    rooms.forEach((r) => {
      floorsSet.add(getRoomFloor(r));
    });
    return Array.from(floorsSet).sort((a, b) => Number(a) - Number(b));
  }, [rooms]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const q = sidebarSearch.trim().toLowerCase();
      if (q) {
        const name = String(r.name || r.roomNumber || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (floorFilter !== "all" && getRoomFloor(r) !== floorFilter) {
        return false;
      }
      if (roomStatusFilter === "occupied") {
        const hasTenants = Boolean(r.hasActiveTenants || (r.activeTenantCount && r.activeTenantCount > 0));
        if (!hasTenants) return false;
      }
      if (roomStatusFilter === "vacant") {
        const hasTenants = Boolean(r.hasActiveTenants || (r.activeTenantCount && r.activeTenantCount > 0));
        if (hasTenants) return false;
      }
      return true;
    });
  }, [rooms, sidebarSearch, floorFilter, roomStatusFilter]);

  const totalRoomPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  const pagedRooms = useMemo(() => {
    const start = (roomsPage - 1) * ROOMS_PER_PAGE;
    return filteredRooms.slice(start, start + ROOMS_PER_PAGE);
  }, [filteredRooms, roomsPage]);

  // Auto-select first room if none selected or if previously selected room was filtered out
  useEffect(() => {
    if (filteredRooms.length > 0) {
      const isStillPresent = filteredRooms.some((r) => r.id === selectedRoomId);
      if (!selectedRoomId || !isStillPresent) {
        setSelectedRoomId(filteredRooms[0].id);
      }
    } else {
      setSelectedRoomId(null);
    }
  }, [filteredRooms, selectedRoomId]);

  // Selected room object
  const selectedRoom = useMemo(() => {
    return rooms.find((r) => r.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  // Active / current and last closed periods
  const openPeriodForRoom = periodList.find((p) => p.status === "open");
  const manualReviewPeriod = periodList.find((p) => p.status === "manual_review_required");
  const lastClosedPeriod = periodList.find((p) => p.status === "closed" || p.status === "revised");
  const currentPeriod = openPeriodForRoom || null;

  // Auto-select latest period for tenant payment monitoring
  useEffect(() => {
    if (periodList.length > 0) {
      const hasCurrent = periodList.some((p) => p.id === selectedPeriodId);
      if (!selectedPeriodId || !hasCurrent) {
        setSelectedPeriodId(periodList[0].id);
      }
    } else {
      setSelectedPeriodId(null);
    }
  }, [periodList, selectedPeriodId]);

  // Selected period object
  const selectedPeriodFromList = useMemo(() => {
    return periodList.find((p) => p.id === selectedPeriodId) || null;
  }, [periodList, selectedPeriodId]);

  // Filtered periods
  const filteredPeriods = useMemo(() => {
    return periodList.filter((p) => {
      if (periodStatusFilter) {
        const s = getDisplayStatus(p);
        if (s !== periodStatusFilter && p.status !== periodStatusFilter) return false;
      }
      if (periodStartDate) {
        const start = new Date(periodStartDate);
        if (p.startDate && new Date(p.startDate) < start) return false;
      }
      if (periodEndDate) {
        const end = new Date(periodEndDate);
        const pEnd = p.endDate || p.targetCloseDate;
        if (pEnd && new Date(pEnd) > end) return false;
      }
      if (periodSearch.trim()) {
        const q = periodSearch.trim().toLowerCase();
        const label = getCycleLabel(p).toLowerCase();
        if (!label.includes(q)) return false;
      }
      return true;
    });
  }, [periodList, periodStatusFilter, periodStartDate, periodEndDate, periodSearch]);

  const totalPeriodPages = Math.max(1, Math.ceil(filteredPeriods.length / PERIODS_PER_PAGE));
  const pagedPeriods = useMemo(() => {
    const start = (periodsPage - 1) * PERIODS_PER_PAGE;
    return filteredPeriods.slice(start, start + PERIODS_PER_PAGE);
  }, [filteredPeriods, periodsPage]);

  // Ready to send rooms across the branch
  const readyRooms = useMemo(() => {
    return rooms.filter((r) => {
      const s = r.billingState || r.displayStatus;
      return s === "ready_to_send" || s === "ready";
    });
  }, [rooms]);

  // Current period usage and cost calculations
  const currentPeriodUsage = useMemo(() => {
    if (!currentPeriod) return null;
    if (utilityType === "water") {
      return currentPeriod.calculationVersion === "water-meter-v1" ? currentPeriod.computedTotalUsage ?? currentPeriod.totalConsumption ?? null : null;
    }
    if (currentPeriod.endReading != null && currentPeriod.startReading != null) {
      return Math.max(0, currentPeriod.endReading - currentPeriod.startReading);
    }
    return currentPeriod.totalConsumption ?? null;
  }, [currentPeriod, utilityType]);

  const currentPeriodCost = useMemo(() => {
    if (!currentPeriod) return null;
    return currentPeriod.totalAmount ?? currentPeriod.computedTotalCost ?? currentPeriod.amount ?? null;
  }, [currentPeriod]);

  // Combined tenant monitoring calculations
  const paymentLedger = useMemo(() => {
    const payments = adminPaymentsData?.payments || adminPaymentsData?.data || [];
    return buildPaymentLedgerByBillId(payments);
  }, [adminPaymentsData]);

  const activeModalPeriodId = historyModalPeriod?.id || historyModalPeriod?._id;
  const { data: modalResultData } = useUtilityResult(
    utilityType,
    activeModalPeriodId,
    {
      enabled: Boolean(isHistoryModalOpen && activeModalPeriodId),
    },
  );

  const resultWithBilling = useMemo(() => {
    const baseResult =
      resultData?.result ||
      resultData?.data ||
      resultData ||
      selectedPeriodFromList;
    if (!baseResult) return null;

    const summaries =
      baseResult?.tenantSummaries ||
      selectedPeriodFromList?.tenantSummaries ||
      [];
    const branchBills = billsData?.bills || billsData?.data || [];

    const enhancedSummaries = summaries.map((tenant) => {
      const bill = branchBills.find(
        (b) =>
          (tenant.billId &&
            (String(b._id) === String(tenant.billId) ||
              String(b.id) === String(tenant.billId))) ||
          String(b.tenantId) === String(tenant.tenantId) ||
          String(b.tenant?._id) === String(tenant.tenantId) ||
          String(b.tenant?.id) === String(tenant.tenantId) ||
          String(b.userId?._id) === String(tenant.tenantId) ||
          String(b.userId) === String(tenant.tenantId),
      );
      const latestPayment = bill?._id ? paymentLedger[bill._id] : null;

      return {
        ...tenant,
        bill,
        latestPayment,
        billStatus: bill?.status || tenant.billStatus || "draft",
        remainingAmount:
          bill?.balance ?? tenant.remainingAmount ?? tenant.billAmount,
        dueDate: bill?.dueDate || tenant.dueDate,
        canSendReminder: Boolean(
          bill && ["pending", "partially-paid", "overdue"].includes(bill.status),
        ),
        canSendPenaltyNotice: Boolean(
          bill && Number(bill?.charges?.penalty || 0) > 0,
        ),
        daysOverdue: Number(tenant.daysOverdue || 0),
      };
    });

    return {
      ...baseResult,
      tenantSummaries: enhancedSummaries,
    };
  }, [resultData, selectedPeriodFromList, billsData, paymentLedger]);

  const modalResultWithBilling = useMemo(() => {
    const activeData =
      modalResultData ||
      (activeModalPeriodId === selectedPeriodId ? resultData : null);
    const baseResult =
      activeData?.result ||
      activeData?.data ||
      activeData ||
      historyModalPeriod;
    if (!baseResult) return null;

    const summaries =
      baseResult?.tenantSummaries ||
      historyModalPeriod?.tenantSummaries ||
      [];
    const branchBills = billsData?.bills || billsData?.data || [];

    const enhancedSummaries = summaries.map((tenant) => {
      const bill = branchBills.find(
        (b) =>
          (tenant.billId &&
            (String(b._id) === String(tenant.billId) ||
              String(b.id) === String(tenant.billId))) ||
          String(b.tenantId) === String(tenant.tenantId) ||
          String(b.tenant?._id) === String(tenant.tenantId) ||
          String(b.tenant?.id) === String(tenant.tenantId) ||
          String(b.userId?._id) === String(tenant.tenantId) ||
          String(b.userId) === String(tenant.tenantId),
      );
      const latestPayment = bill?._id ? paymentLedger[bill._id] : null;

      return {
        ...tenant,
        bill,
        latestPayment,
        billStatus: bill?.status || tenant.billStatus || "draft",
        remainingAmount:
          bill?.balance ?? tenant.remainingAmount ?? tenant.billAmount,
        dueDate: bill?.dueDate || tenant.dueDate,
        canSendReminder: Boolean(
          bill && ["pending", "partially-paid", "overdue"].includes(bill.status),
        ),
        canSendPenaltyNotice: Boolean(
          bill && Number(bill?.charges?.penalty || 0) > 0,
        ),
        daysOverdue: Number(tenant.daysOverdue || 0),
      };
    });

    return {
      ...baseResult,
      tenantSummaries: enhancedSummaries,
    };
  }, [
    modalResultData,
    activeModalPeriodId,
    selectedPeriodId,
    resultData,
    historyModalPeriod,
    billsData,
    paymentLedger,
  ]);

  // Timeline events computation
  const billingTimelineRows = useMemo(() => {
    const rawReadings = readingsData?.readings || readingsData?.data || [];
    const occupancyEvents = selectedRoom?.occupants || [];

    const timeline = [];
    rawReadings.forEach((r) => {
      timeline.push({
        id: r._id || r.id,
        date: r.readingDate || r.date || r.createdAt,
        eventType: r.eventType || "regularBilling",
        source: "meter",
        reading: r.reading,
        rawReading: r,
        hasMeterRecord: true,
        tenantName: r.tenantName,
        tenantEmail: r.tenantEmail,
        bedName: r.bedName,
      });
    });

    occupancyEvents.forEach((occ, idx) => {
      if (occ.moveInDate) {
        timeline.push({
          id: `occ-in-${idx}`,
          date: occ.moveInDate,
          eventType: "moveIn",
          source: "occupancy",
          reading: occ.startReading,
          tenantName: occ.name,
          tenantEmail: occ.email,
          bedName: occ.bedNumber || occ.bedName,
          isActive: true,
        });
      }
      if (occ.moveOutDate) {
        timeline.push({
          id: `occ-out-${idx}`,
          date: occ.moveOutDate,
          eventType: "moveOut",
          source: "occupancy",
          reading: occ.endReading,
          tenantName: occ.name,
          tenantEmail: occ.email,
          bedName: occ.bedNumber || occ.bedName,
          isActive: false,
        });
      }
    });

    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [readingsData, selectedRoom]);

  const totalTimelinePages = Math.max(1, Math.ceil(billingTimelineRows.length / TIMELINE_PER_PAGE));
  const pagedTimelineRows = useMemo(() => {
    const start = (timelinePage - 1) * TIMELINE_PER_PAGE;
    return billingTimelineRows.slice(start, start + TIMELINE_PER_PAGE);
  }, [billingTimelineRows, timelinePage]);

  // High-level KPI metrics computation
  const kpiMetrics = useMemo(() => {
    let totalUsage = 0;
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    rooms.forEach((r) => {
      const p = r.activePeriod || r.latestPeriod;
      if (p) {
        const usage = Number(p.computedTotalUsage ?? p.totalConsumption ?? p.consumption ?? 0);
        const amount = Number(p.totalAmount ?? p.amount ?? p.computedTotalCost ?? 0);
        if (utilityType !== "water" || p.calculationVersion === "water-meter-v1") totalUsage += usage;
        totalBilled += amount;
      }
    });

    const bills = billsData?.bills || billsData?.data || [];
    const chargeField = utilityType === "water" ? "water" : "electricity";
    bills.forEach((b) => {
      if (String(b.branch || "").toLowerCase() === "guadalupe") return;
      const utilityCharge = Number(b.charges?.[chargeField] || 0);
      if (utilityCharge > 0) {
        if (b.status === "paid") {
          totalCollected += utilityCharge;
        } else if (b.status === "partially-paid") {
          const paidShare = Math.min(utilityCharge, Number(b.paidAmount || 0));
          totalCollected += paidShare;
          totalOutstanding += Math.max(0, utilityCharge - paidShare);
        } else if (b.status === "pending" || b.status === "overdue") {
          totalOutstanding += utilityCharge;
        }
      }
    });

    const collectionPercent =
      totalBilled > 0 ? Math.min(100, Math.round((totalCollected / totalBilled) * 100)) : 0;

    return {
      totalUsage,
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionPercent,
      readyToSendCount: readyRooms.length,
      coveredRoomsCount: rooms.length,
    };
  }, [rooms, billsData, readyRooms, utilityType]);

  // Handlers
  const handleToggleUnmaskRow = useCallback((rowId) => {
    setUnmaskedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  }, []);

  const handleSendSinglePeriod = async (period) => {
    if (!period) return;
    const roomName = getRoomLabel(selectedRoom || {}, "Room");
    const cycleText = getCycleLabel(period);

    setConfirmModal({
      open: true,
      title: `Send ${utilityType === "water" ? "Water" : "Electricity"} To Tenants`,
      message: `Send the ${utilityType} charge for ${roomName} (${cycleText}) to the tenant side now? This will make the charge visible in the tenant billing view and payment total.`,
      variant: "primary",
      confirmText: "Send Now",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        setSendingByPeriodId((prev) => ({ ...prev, [period.id]: true }));
        try {
          await sendPeriod.mutateAsync({ periodId: period.id });
          notify.success(`Sent ${utilityType} charges for ${roomName}.`);
          await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
        } catch (err) {
          notify.error(err, `Failed to send ${utilityType} charges.`);
        } finally {
          setSendingByPeriodId((prev) => ({ ...prev, [period.id]: false }));
        }
      },
    });
  };

  const handleOpenBatchSendModal = () => {
    if (readyRooms.length === 0) return;
    setIsBatchSendModalOpen(true);
  };

  const handleConfirmBatchSend = async (selectedRoomIds) => {
    if (!selectedRoomIds || selectedRoomIds.length === 0) return;
    setIsSendingBatch(true);
    let successCount = 0;
    const targetRooms = readyRooms.filter((r) =>
      selectedRoomIds.includes(r.id || r._id),
    );

    try {
      for (const r of targetRooms) {
        if (r.latestPeriodId) {
          try {
            await sendPeriod.mutateAsync({ periodId: r.latestPeriodId });
            successCount += 1;
          } catch {
            // individual error caught
          }
        }
      }
      if (successCount > 0) {
        notify.success(
          `Released ${utilityType} statements for ${successCount} room${successCount !== 1 ? "s" : ""}.`,
        );
        await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
        setIsBatchSendModalOpen(false);
      } else {
        notify.error("Unable to release statements for the selected rooms.");
      }
    } finally {
      setIsSendingBatch(false);
    }
  };

  const handleSendReminder = async (billId, noticeType = "reminder") => {
    if (!billId) return;
    const noticeKey = `${billId}:${noticeType}`;
    setActiveNoticeKey(noticeKey);
    try {
      await billingApi.sendBillReminder(billId, { noticeType });
      notify.success(
        noticeType === "penalty"
          ? "Penalty notice sent successfully."
          : "Reminder sent successfully.",
      );
      const nowIso = new Date().toISOString();
      setLastRemindedByBillId((prev) => ({ ...prev, [billId]: nowIso }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) }),
        queryClient.invalidateQueries({ queryKey: ["billing", "branch"] }),
      ]);
    } catch (error) {
      notify.error(error, "Failed to send notice.");
    } finally {
      setActiveNoticeKey(null);
    }
  };

  const handleBatchSendReminders = async (tenantsToRemind) => {
    if (!tenantsToRemind || tenantsToRemind.length === 0) return;
    const billIds = tenantsToRemind.map((t) => t.billId).filter(Boolean);
    if (billIds.length === 0) return;

    const count = billIds.length;
    const roomName = getRoomLabel(selectedRoom || {}, "Room");

    setConfirmModal({
      open: true,
      title: "Remind All Unpaid Tenants",
      message: `Send payment reminder notices to ${count} unpaid tenant${count === 1 ? "" : "s"} in ${roomName}? Each tenant will receive an email and system notification with their current balance and due date.`,
      variant: "primary",
      confirmText: `Remind ${count} Tenant${count === 1 ? "" : "s"}`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        setIsBatchReminding(true);
        try {
          const res = await billingApi.batchSendBillReminders(billIds);
          if (res?.success) {
            notify.success(
              `Sent reminders to ${res.successCount} tenant${res.successCount === 1 ? "" : "s"}.`,
            );
            const nowIso = new Date().toISOString();
            setLastRemindedByBillId((prev) => {
              const next = { ...prev };
              billIds.forEach((id) => {
                next[id] = nowIso;
              });
              return next;
            });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) }),
              queryClient.invalidateQueries({ queryKey: ["billing", "branch"] }),
            ]);
          } else {
            notify.error("Could not send reminders for the selected tenants.");
          }
        } catch (err) {
          notify.error(err, "Failed to send batch reminders.");
        } finally {
          setIsBatchReminding(false);
        }
      },
    });
  };

  // Edit reading flow
  const handleOpenEditReading = (reading) => {
    setEditReadingModal({ open: true, reading });
    setEditReadingForm({
      reading: String(reading?.reading ?? ""),
      date: toInputDate(reading?.readingDate || reading?.date || new Date()),
      eventType: reading?.eventType || "regularBilling",
      correctionReason:"",
    });
  };

  const handleSaveEditReading = async () => {
    if (!editReadingModal.reading?.id) return;
    try {
      await updateReading.mutateAsync({
        readingId: editReadingModal.reading.id,
        reading: Number(editReadingForm.reading),
        ...(utilityType === "water" ? {correctionReason:editReadingForm.correctionReason} : {readingDate:editReadingForm.date,eventType:editReadingForm.eventType}),
      });
      notify.success(utilityType === "water" ? "Correction recorded. Original observation preserved." : "Meter reading updated.");
      setEditReadingModal({ open: false, reading: null });
      await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    } catch (err) {
      notify.error(err, "Failed to update meter reading.");
    }
  };

  const handleDeleteReading = (readingId) => {
    setConfirmModal({
      open: true,
      title: "Archive Meter Reading",
      message: "Archive this meter reading? It will leave active billing views but remain preserved in system history. This cannot be changed after a bill has been sent.",
      variant: "danger",
      confirmText: "Archive",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        try {
          await deleteReading.mutateAsync(readingId);
          notify.success("Meter reading archived.");
          await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
        } catch (err) {
          notify.error(err, "Failed to archive meter reading.");
        }
      },
    });
  };

  // Edit period flow
  const handleOpenEditPeriod = (period) => {
    setEditPeriodModal({ open: true, periodId: period.id });
    setEditPeriodForm({
      startDate: toInputDate(period.startDate),
      endDate: toInputDate(period.endDate || period.targetCloseDate),
      startReading: String(period.startReading ?? ""),
      endReading: String(period.endReading ?? ""),
      ratePerUnit: String(period.ratePerUnit ?? defaultRatePerUnit),
    });
  };

  const handleSaveEditPeriod = async () => {
    if (!editPeriodModal.periodId) return;
    try {
      await updatePeriod.mutateAsync({
        periodId: editPeriodModal.periodId,
        startDate: editPeriodForm.startDate,
        endDate: editPeriodForm.endDate,
        startReading: editPeriodForm.startReading ? Number(editPeriodForm.startReading) : undefined,
        endReading: editPeriodForm.endReading ? Number(editPeriodForm.endReading) : undefined,
        ratePerUnit: Number(editPeriodForm.ratePerUnit),
      });
      notify.success("Billing period updated successfully.");
      setEditPeriodModal({ open: false, periodId: null });
      await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    } catch (err) {
      notify.error(err, "Unable to update billing period. Please try again.");
    }
  };

  const handleDeletePeriod = (periodId) => {
    const targetPeriod = periodList.find((p) => (p.id || p._id) === periodId);
    const isOpen = targetPeriod?.status === "open";
    const isSent = targetPeriod?.status === "sent" || targetPeriod?.billingState === "sent";
    const roomName = getRoomLabel(selectedRoom || {}, "Room");
    const cycleLabel = getCycleLabel(targetPeriod);
    const tenantCount = targetPeriod?.tenantSummaries?.length || 0;
    const totalCharge = targetPeriod?.computedTotalCost ?? targetPeriod?.totalAmount ?? 0;

    let title = "Delete Billing Cycle";
    let message = `Are you sure you want to permanently delete this billing cycle for ${roomName}?`;

    if (isOpen) {
      title = "Delete Open Cycle";
      message = `Permanently delete this open cycle for ${roomName}? This will remove the unfinalized billing period and its initial meter reading.`;
    } else if (isSent || tenantCount > 0) {
      title = "Delete & Rollback Billing Cycle";
      message = `Permanently delete this billing cycle for ${roomName}? The closing meter reading will be removed and utility charges will be retracted from tenant records.`;
    }

    setConfirmModal({
      open: true,
      periodId,
      roomName,
      cycleLabel,
      totalCharge,
      tenantCount,
      title,
      message,
      variant: "danger",
      confirmText: "Delete Cycle",
      loadingText: "Deleting...",
      loading: false,
      hasPayments: !isOpen && (isSent || tenantCount > 0),
      overrideChecked: false,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal.periodId) return;
    const { periodId, roomName, overrideChecked } = confirmModal;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      if (selectedPeriodId === periodId) {
        setSelectedPeriodId(null);
      }
      await deletePeriod.mutateAsync({ periodId, force: Boolean(overrideChecked) });
      notify.success(
        overrideChecked
          ? `Billing cycle force-deleted and charges retracted with administrative override for ${roomName || "room"}.`
          : `Billing cycle deleted and charges retracted for ${roomName || "room"}.`
      );
      setConfirmModal((prev) => ({ ...prev, open: false, loading: false, overrideChecked: false, periodId: null }));
      await queryClient.invalidateQueries({ queryKey: utilityKeys.all(utilityType) });
    } catch (err) {
      setConfirmModal((prev) => ({ ...prev, loading: false }));
      notify.error(err, "Failed to delete billing cycle.");
    }
  };

  // Export handlers
  const handleExportRows = async () => {
    try {
      setIsExporting(true);
      const params = { branch: branchFilter || undefined };
      if (selectedRoomId) params.roomId = selectedRoomId;

      const response = await utilityApi.exportRows(utilityType, params);
      const rows = response?.rows || [];
      if (!rows.length) {
        notify.warn("No billing rows available for export.");
        return;
      }

      exportToCSV(
        rows,
        [
          { key: "roomName", label: "Room" },
          { key: "tenantName", label: "Tenant" },
          { key: "startDate", label: "Start Date", formatter: fmtDate },
          { key: "endDate", label: "End Date", formatter: fmtDate },
          { key: "usage", label: `Usage (${utilityType === "electricity" ? "kWh" : "m³"})` },
          { key: "amount", label: "Charge (PHP)", formatter: fmtCurrency },
          { key: "status", label: "Status" },
        ],
        `${utilityType}_billing_${branchFilter || "all"}_${getTodayInput()}`,
      );
      notify.success(`Exported ${rows.length} ${utilityType} billing rows.`);
    } catch (err) {
      notify.error(err, "CSV export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const { exportReportPdf } = await import("../../../../shared/utils/reportPdf");
      const params = { branch: branchFilter || undefined };
      if (selectedRoomId) params.roomId = selectedRoomId;

      const response = await utilityApi.exportRows(utilityType, params);
      const rows = response?.rows || [];
      if (!rows.length) {
        notify.warn("No billing rows available for PDF export.");
        return;
      }

      const unit = utilityType === "electricity" ? "kWh" : "m³";
      const tableRows = rows.map((r) => ({
        Room: r.roomName || getRoomLabel(selectedRoom) || "Room",
        Tenant: r.tenantName || "Unassigned",
        Cycle: r.startDate && r.endDate ? `${fmtShortDate(r.startDate)} - ${fmtShortDate(r.endDate)}` : "Cycle",
        Usage: r.usage == null || r.usage === "" ? "Unknown (legacy)" : `${Number(r.usage).toFixed(2)} ${unit}`,
        Charge: fmtCurrency(r.amount || 0),
        Status: String(r.status || "Draft").toUpperCase(),
      }));

      await exportReportPdf({
        title: `${utilityType === "electricity" ? "Electricity" : "Water"} Utility Statement Report`,
        subtitle: `Branch: ${branchFilter ? branchFilter.toUpperCase() : "All Branches"} • ${rows.length} Records`,
        reportType: `${utilityType.toUpperCase()} Billing`,
        filename: `${utilityType}_billing_report_${getTodayInput()}.pdf`,
        kpis: [
          { label: "Total Records", value: rows.length },
          { label: "Active Branch", value: branchFilter || "All Branches" },
        ],
        sections: [
          {
            title: "Billing Cycles & Usage Summary",
            type: "table",
            headers: ["Room", "Tenant", "Cycle", "Usage", "Charge", "Status"],
            rows: tableRows,
          },
        ],
      });
      notify.success("PDF report generated successfully.");
    } catch (err) {
      notify.error(err, "PDF export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const isGuadaUtility =
    (utilityType === "electricity" || utilityType === "water") &&
    branchFilter === "guadalupe";

  if (isGuadaUtility) {
    return null;
  }

  if (roomsLoading && !roomsData) {
    return <AdminTablePageSkeleton />;
  }

  return (
    <section className="space-y-6" aria-label={`${utilityType} billing workspace`}>
      {/* ── Branch / Permission Diagnostic Alerts ────────────────────────────── */}
      {!isBranchAssigned && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-card p-4 text-xs shadow-xs">
          <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-card-foreground">No Branch Assigned</p>
            <p className="text-muted-foreground">
              Your Branch Admin account is not currently assigned to a branch. Please contact the Dorm Owner to assign your account to Gil-Puyat to manage utility billing.
            </p>
          </div>
        </div>
      )}

      {isBranchAssigned && !hasManageBillingPermission && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-card p-4 text-xs shadow-xs">
          <AlertCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-card-foreground">Billing Permissions Restricted</p>
            <p className="text-muted-foreground">
              Your account does not currently have permission to generate or manage bills. Please contact the Dorm Owner to enable "Manage Billing" for your account.
            </p>
          </div>
        </div>
      )}

      {/* ── Top-Level KPI Metric Cards ────────────────────────────────────────────── */}
      <UtilityKpiCards utilityType={utilityType} kpiMetrics={kpiMetrics} />

      {/* ── Main Workspace Grid (Left Room Selector + Right Content Panels) ───────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] items-start">
        {/* Left: Room Quick Switcher */}
        <UtilityRoomSelector
          rooms={rooms}
          filteredRooms={filteredRooms}
          pagedRooms={pagedRooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(id) => {
            setSelectedRoomId(id);
            setPeriodsPage(1);
            setTimelinePage(1);
          }}
          sidebarSearch={sidebarSearch}
          onSearchChange={(val) => {
            setSidebarSearch(val);
            setRoomsPage(1);
          }}
          floorFilter={floorFilter}
          onFloorFilterChange={(fl) => {
            setFloorFilter(fl);
            setRoomsPage(1);
          }}
          availableFloors={availableFloors}
          roomStatusFilter={roomStatusFilter}
          onRoomStatusFilterChange={(st) => {
            setRoomStatusFilter(st);
            setRoomsPage(1);
          }}
          roomsPage={roomsPage}
          totalRoomPages={totalRoomPages}
          onPageChange={setRoomsPage}
          roomsLoading={roomsLoading}
          utilityType={utilityType}
        />

        {/* Right: Active Room Dashboard & Segmented Panels */}
        <div className="space-y-4">
          {/* Active Cycle Highlight Card */}
          <UtilityCycleOverviewCard
            selectedRoom={selectedRoom}
            currentPeriod={currentPeriod}
            currentPeriodUsage={currentPeriodUsage}
            currentPeriodCost={currentPeriodCost}
            readyRoomsCount={readyRooms.length}
            onOpenNewPeriodModal={() => setIsNewPeriodModalOpen(true)}
            onBatchSendReady={handleOpenBatchSendModal}
            onExportCsv={handleExportRows}
            onExportPdf={handleExportPdf}
            isExporting={isExporting}
            utilityType={utilityType}
            manualReviewPeriod={manualReviewPeriod}
            latestHistoricalPeriod={lastClosedPeriod}
            onOpenCurrentPeriod={() => setIsOpenCurrentPeriodModalOpen(true)}
            onCloseCurrentPeriod={() => setIsCloseCurrentPeriodModalOpen(true)}
            isSendingBatch={isSendingBatch}
          />

          {/* Segmented Sub-View Navigation Tabs */}
          <div className="flex border-b border-border gap-2" role="tablist" aria-label="Utility billing workspace views">
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTab === "history"}
              aria-controls="utility-subpanel-history"
              id="utility-subtab-history"
              onClick={() => setActiveWorkspaceTab("history")}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-xs font-bold transition-colors ${
                activeWorkspaceTab === "history"
                  ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-white"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <History size={14} className={activeWorkspaceTab === "history" ? "text-slate-900 dark:text-white" : "text-slate-500"} />
              <span>Billing Cycle History ({periodList.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTab === "payments"}
              aria-controls="utility-subpanel-payments"
              id="utility-subtab-payments"
              onClick={() => setActiveWorkspaceTab("payments")}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-xs font-bold transition-colors ${
                activeWorkspaceTab === "payments"
                  ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-white"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <Users size={14} className={activeWorkspaceTab === "payments" ? "text-sky-600 dark:text-sky-400" : "text-sky-600/80 dark:text-sky-400/80"} />
              <span>Tenant Payments & Splits ({resultWithBilling?.tenantSummaries?.length || 0})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTab === "timeline"}
              aria-controls="utility-subpanel-timeline"
              id="utility-subtab-timeline"
              onClick={() => setActiveWorkspaceTab("timeline")}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-xs font-bold transition-colors ${
                activeWorkspaceTab === "timeline"
                  ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-white"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <Clock3 size={14} className={activeWorkspaceTab === "timeline" ? "text-amber-600 dark:text-amber-400" : "text-amber-600/80 dark:text-amber-400/80"} />
              <span>Audit Timeline ({billingTimelineRows.length})</span>
            </button>
          </div>

          {/* Sub-Panel Content Area with Stable Min-Height */}
          <div className="min-h-[460px]">
            {/* Sub-Panel 1: Billing Cycle History */}
            {activeWorkspaceTab === "history" && (
              <div
                role="tabpanel"
                id="utility-subpanel-history"
                aria-labelledby="utility-subtab-history"
              >
                <UtilityCycleHistoryPanel
                  periods={periodList}
                  filteredPeriods={filteredPeriods}
                  pagedPeriods={pagedPeriods}
                  selectedPeriodId={selectedPeriodId}
                  onSelectPeriod={setSelectedPeriodId}
                  periodStatusFilter={periodStatusFilter}
                  onStatusFilterChange={(st) => {
                    setPeriodStatusFilter(st);
                    setPeriodsPage(1);
                  }}
                  periodStartDate={periodStartDate}
                  onStartDateChange={(dt) => {
                    setPeriodStartDate(dt);
                    setPeriodsPage(1);
                  }}
                  periodEndDate={periodEndDate}
                  onEndDateChange={(dt) => {
                    setPeriodEndDate(dt);
                    setPeriodsPage(1);
                  }}
                  periodSearch={periodSearch}
                  onSearchChange={(q) => {
                    setPeriodSearch(q);
                    setPeriodsPage(1);
                  }}
                  onClearFilters={() => {
                    setPeriodStatusFilter("");
                    setPeriodStartDate("");
                    setPeriodEndDate("");
                    setPeriodSearch("");
                    setPeriodsPage(1);
                  }}
                  periodsPage={periodsPage}
                  totalPeriodPages={totalPeriodPages}
                  onPageChange={setPeriodsPage}
                  onSendPeriod={handleSendSinglePeriod}
                  onEditPeriod={handleOpenEditPeriod}
                  onDeletePeriod={handleDeletePeriod}
                  onOpenHistoryModal={(periodId) => {
                    const target = periodList.find(
                      (p) => (p.id || p._id) === periodId,
                    );
                    setHistoryModalPeriod(target || null);
                    setSelectedPeriodId(periodId);
                    setIsHistoryModalOpen(true);
                  }}
                  sendingByPeriodId={sendingByPeriodId}
                  isSendingPeriod={sendPeriod.isPending}
                  isDeletingPeriod={deletePeriod.isPending}
                  utilityType={utilityType}
                  selectedRoom={selectedRoom}
                />
              </div>
            )}

            {/* Sub-Panel 2: Tenant Allocation & Payments */}
            {activeWorkspaceTab === "payments" && (
              <div
                role="tabpanel"
                id="utility-subpanel-payments"
                aria-labelledby="utility-subtab-payments"
              >
                <UtilityTenantPaymentPanel
                  selectedPeriod={selectedPeriodFromList}
                  monitoringResult={resultWithBilling}
                  utilityType={utilityType}
                  onSendReminder={handleSendReminder}
                  onBatchSendReminder={handleBatchSendReminders}
                  activeNoticeKey={activeNoticeKey}
                  onExportCsv={handleExportRows}
                  onExportPdf={handleExportPdf}
                  isExporting={isExporting}
                  isBatchReminding={isBatchReminding}
                  lastRemindedByBillId={lastRemindedByBillId}
                />
              </div>
            )}

            {/* Sub-Panel 3: Audit & Meter Timeline */}
            {activeWorkspaceTab === "timeline" && (
              <div
                role="tabpanel"
                id="utility-subpanel-timeline"
                aria-labelledby="utility-subtab-timeline"
              >
                <UtilityTimelinePanel
                  timelineRows={billingTimelineRows}
                  pagedTimelineRows={pagedTimelineRows}
                  timelinePage={timelinePage}
                  totalTimelinePages={totalTimelinePages}
                  onPageChange={setTimelinePage}
                  unmaskedRows={unmaskedRows}
                  onToggleUnmaskRow={handleToggleUnmaskRow}
                  onEditReading={handleOpenEditReading}
                  isCurrentCycleLocked={Boolean(currentPeriod?.status === "closed" || currentPeriod?.billingState === "sent")}
                  utilityType={utilityType}
                  onExportCsv={handleExportRows}
                  onExportPdf={handleExportPdf}
                  isExporting={isExporting}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <EditReadingModal
        isOpen={editReadingModal.open}
        onClose={() => setEditReadingModal({ open: false, reading: null })}
        reading={editReadingModal.reading}
        currentPeriod={currentPeriod}
        utilityType={utilityType}
        editForm={editReadingForm}
        setEditForm={setEditReadingForm}
        onSave={handleSaveEditReading}
        onDelete={handleDeleteReading}
        isSaving={updateReading.isPending}
      />

      <EditPeriodModal
        isOpen={editPeriodModal.open}
        onClose={() => setEditPeriodModal({ open: false, periodId: null })}
        periodId={editPeriodModal.periodId}
        periodList={periodList}
        utilityType={utilityType}
        editForm={editPeriodForm}
        setEditForm={setEditPeriodForm}
        onSave={handleSaveEditPeriod}
        isSaving={updatePeriod.isPending}
      />

      <NewBillingPeriodModal
        isOpen={isNewPeriodModalOpen}
        onClose={() => setIsNewPeriodModalOpen(false)}
        utilityType={utilityType}
        selectedRoomId={selectedRoomId}
        selectedPeriodId={selectedPeriodId}
        openPeriodForRoom={openPeriodForRoom}
        lastClosedPeriod={lastClosedPeriod}
        latestReading={latestData?.reading}
        defaultRatePerUnit={defaultRatePerUnit}
        roomBranch={selectedRoom?.branch}
        roomName={getRoomLabel(selectedRoom) || selectedRoom?.name || selectedRoom?.roomNumber || ""}
        activeTenantCount={selectedRoom?.activeTenantCount ?? selectedRoom?.occupants?.length ?? 0}
        periods={periodList}
        onSuccess={(newPeriodId) => {
          if (newPeriodId) {
            setSelectedPeriodId(newPeriodId);
          }
        }}
      />

      <OpenCurrentPeriodModal
        isOpen={isOpenCurrentPeriodModalOpen}
        onClose={() => setIsOpenCurrentPeriodModalOpen(false)}
        utilityType={utilityType}
        selectedRoomId={selectedRoomId}
        roomName={getRoomLabel(selectedRoom) || selectedRoom?.name || selectedRoom?.roomNumber || ""}
        lastClosedPeriod={lastClosedPeriod}
        latestReading={latestData?.reading}
        defaultRatePerUnit={defaultRatePerUnit}
        onSuccess={(newPeriodId) => {
          if (newPeriodId) setSelectedPeriodId(newPeriodId);
        }}
      />

      <CloseCurrentPeriodModal
        isOpen={isCloseCurrentPeriodModalOpen}
        onClose={() => setIsCloseCurrentPeriodModalOpen(false)}
        utilityType={utilityType}
        period={currentPeriod}
        roomName={getRoomLabel(selectedRoom) || selectedRoom?.name || selectedRoom?.roomNumber || ""}
        latestReading={latestData?.reading}
        onSuccess={(nextPeriodId) => {
          if (nextPeriodId) setSelectedPeriodId(nextPeriodId);
        }}
      />

      <BillingCycleDetailModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistoryModalPeriod(null);
        }}
        period={historyModalPeriod}
        result={modalResultWithBilling}
        utilityType={utilityType}
        statusLabel={historyModalPeriod ? getDisplayStatusLabel(historyModalPeriod) : ""}
        isReadOnly={historyModalPeriod ? historyModalPeriod.status === "sent" : true}
        formatters={{
          fmtCurrency,
          fmtNumber,
          fmtShortDate,
          getSegmentPeriodLabel,
        }}
        eventTypeLabels={EVENT_TYPE_LABELS}
        onSendReminder={handleSendReminder}
        onBatchSendReminder={handleBatchSendReminders}
        activeNoticeKey={activeNoticeKey}
        lastRemindedByBillId={lastRemindedByBillId}
        isBatchReminding={isBatchReminding}
      />

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false, overrideChecked: false, periodId: null }))}
        onConfirm={handleConfirmDelete}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant || "primary"}
        confirmText={confirmModal.overrideChecked ? "Force Delete Cycle" : (confirmModal.confirmText || "Confirm")}
        loading={confirmModal.loading || false}
        loadingText={confirmModal.overrideChecked ? "Force Deleting..." : (confirmModal.loadingText || "Processing...")}
      >
        {/* Structured Impact Summary Grid */}
        {confirmModal.periodId && (
          <div className="mt-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2.5 text-slate-600 dark:text-slate-300">
              <div>
                <span className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 block uppercase tracking-wider">Room</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{confirmModal.roomName || "Selected Room"}</span>
              </div>
              <div>
                <span className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 block uppercase tracking-wider">Billing Cycle</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{confirmModal.cycleLabel || "Current Cycle"}</span>
              </div>
              <div>
                <span className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 block uppercase tracking-wider">Total Charges</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">₱{Number(confirmModal.totalCharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 block uppercase tracking-wider">Affected Bills</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                  {confirmModal.tenantCount > 0 ? `${confirmModal.tenantCount} tenant bill${confirmModal.tenantCount === 1 ? "" : "s"}` : "None / Unassigned"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Administrative Override Option */}
        {confirmModal.hasPayments && (
          <div className="mt-2.5 p-3 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
            <label htmlFor="override-payment-locks" className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                id="override-payment-locks"
                type="checkbox"
                checked={confirmModal.overrideChecked || false}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setConfirmModal((prev) => ({
                    ...prev,
                    overrideChecked: isChecked,
                  }));
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 cursor-pointer transition-colors"
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200 block">
                  Override active payment locks and force cycle deletion
                </span>
                <span className="block mt-0.5 text-slate-500 dark:text-slate-400 leading-normal font-normal">
                  Administrative Override: Retracts utility charges and recalculates tenant balances even if payments were recorded.
                </span>
              </div>
            </label>
          </div>
        )}
      </ConfirmModal>

      <BatchSendReadyModal
        isOpen={isBatchSendModalOpen}
        onClose={() => setIsBatchSendModalOpen(false)}
        readyRooms={readyRooms}
        utilityType={utilityType}
        onConfirmSend={handleConfirmBatchSend}
        isSending={isSendingBatch}
      />
    </section>
  );
};

export default UtilityBillingTab;
