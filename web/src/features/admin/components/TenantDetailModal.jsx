import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  FileText,
  DollarSign,
  MapPin,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { showNotification } from "../../../shared/utils/notification";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";
import {
  useTenantWorkspaceDetail,
  useTenantActionContext,
  useMarkTenantAsViewed,
} from "../../../shared/hooks/queries/useReservations";
import {
  getTenantIndicator,
  getTenantTabIndicators,
  markTenantViewedInStorage,
  getViewedTabsForTenant,
  markTenantTabViewedInStorage,
} from "../pages/tenantWorkspaceActions.mjs";
import { reservationApi } from "../../../shared/api/apiClient";
import { contractApi } from "../../../shared/api/contractApi";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { userApi } from "../../../shared/api/userApi";
import ForceDeleteModal from "./ForceDeleteModal";
import {
  RenewLeaseModal,
  TransferTenantModal,
  MoveOutModal,
} from "./TenantWorkspaceModals";
import DigitalContractPaper from "../../tenant/components/contracts/DigitalContractPaper";
import TenantDetailModalSkeleton from "./TenantDetailModalSkeleton";
import { formatBranch } from "../utils/formatters";
import { resolveReservationFinancials } from "../../../shared/utils/depositUtils";
import { billingApi } from "../../../shared/api/billingApi";
import RecordViolationModal from "./billing/RecordViolationModal";
import ViolationDetailModal from "./billing/ViolationDetailModal";

import {
  TenantDetailModalHeader,
  TenantDetailModalSidebar,
  TenantOverviewTab,
  TenantContractsTab,
  TenantBillingTab,
  TenantViolationsTab,
  TenantHistoryTab,
  formatDate,
  getInitials,
  getOccupancyStatusConfig,
  getPaymentStatusConfig,
  buildItemFinancialBreakdown,
} from "./tenants/details";

export default function TenantDetailModal({
  tenant: initialTenant,
  onClose,
  initialTab = "overview",
}) {
  useEscapeClose(!!initialTenant, onClose);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogState, setDialogState] = useState({ type: null, loading: false, error: null });
  const [transferRequestActionLoading, setTransferRequestActionLoading] = useState(false);
  const [safeguardsData, setSafeguardsData] = useState(null);
  const [dedicatedContract, setDedicatedContract] = useState(null);
  // "MULTIPLE_CANONICAL_CONTRACTS" | "LOOKUP_FAILED" | null — set only when the
  // backend canonical resolver cannot determine a single current Contract; the
  // UI must show a controlled error rather than guessing which record to display.
  const [dedicatedContractError, setDedicatedContractError] = useState(null);
  const [contractLookupDone, setContractLookupDone] = useState(false);
  const [allTenantContracts, setAllTenantContracts] = useState([]);
  const [selectedContractOverride, setSelectedContractOverride] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || "overview");

  const reservationId =
    initialTenant?.reservationId ||
    initialTenant?._id ||
    initialTenant?.id ||
    null;

  const [viewedTabs, setViewedTabs] = useState(() => {
    const saved = getViewedTabsForTenant(reservationId);
    if (initialTab) saved.add(initialTab);
    saved.add("overview");
    return saved;
  });

  const handleTabChange = useCallback((nextTab) => {
    setActiveTab(nextTab);
    if (reservationId && nextTab) {
      markTenantTabViewedInStorage(reservationId, nextTab);
    }
    setViewedTabs((prev) => {
      const next = new Set(prev);
      next.add(nextTab);
      return next;
    });
  }, [reservationId]);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [isDocsPanelOpen, setIsDocsPanelOpen] = useState(false);
  const docsPanelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [downloadingProof, setDownloadingProof] = useState(false);
  const [showDigitalContractModal, setShowDigitalContractModal] = useState(false);
  const [digitalContractData, setDigitalContractData] = useState(null);
  const [activeDigitalContract, setActiveDigitalContract] = useState(null);
  const [loadingDigitalContract, setLoadingDigitalContract] = useState(false);
  const [digitalContractError, setDigitalContractError] = useState("");
  // Guards against an earlier tenant's slow/late-resolving stay-proof
  // fetch overwriting a later tenant's freshly-opened preview — this modal
  // instance is reused across different tenants (no per-tenant remount), so
  // without this a stale response can land after the admin has already
  // switched to someone else's record.
  const digitalContractRequestRef = useRef(0);

  // Tenant Rule Violations & Formal Warnings state
  const [tenantViolations, setTenantViolations] = useState([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [recordViolationOpen, setRecordViolationOpen] = useState(false);
  const [selectedViolationForDetail, setSelectedViolationForDetail] = useState(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (reservationId) {
        markTenantTabViewedInStorage(reservationId, initialTab);
      }
      setViewedTabs((prev) => {
        const next = new Set(prev);
        next.add(initialTab);
        return next;
      });
    }
  }, [initialTab, reservationId]);

  useEffect(() => {
    if (activeTab && reservationId) {
      markTenantTabViewedInStorage(reservationId, activeTab);
      setViewedTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab, reservationId]);

  // Reset scroll container position when switching tabs to prevent jarring jumps
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  const {
    data: fetchedDetail,
    isLoading: isDetailLoading,
    refetch: refetchDetail,
  } = useTenantWorkspaceDetail(reservationId);
  const { data: actionContext } = useTenantActionContext(reservationId);
  const markTenantViewedMutation = useMarkTenantAsViewed();

  // Re-fetch live tenant detail when launching the move-out dialog
  useEffect(() => {
    if (dialogState.type === "moveOut" && typeof refetchDetail === "function") {
      refetchDetail();
    }
  }, [dialogState.type, refetchDetail]);

  // Mark tenant workspace record as viewed by admin upon modal inspection
  useEffect(() => {
    if (reservationId) {
      markTenantViewedInStorage(reservationId);
      markTenantViewedMutation.mutate(reservationId);
    }
  }, [reservationId]);

  // Sync the tenant's full contract list for display (list-only, no selection logic).
  useEffect(() => {
    if (!fetchedDetail && !initialTenant) return;
    const tenantId =
      fetchedDetail?.tenantId ||
      initialTenant?.tenantId?._id ||
      initialTenant?.tenantId ||
      initialTenant?.userId?._id ||
      initialTenant?.userId;

    let active = true;
    contractApi
      .listContracts({
        tenantId: tenantId ? String(tenantId) : undefined,
        archive: "all",
        limit: 100,
      })
      .then(({ contracts = [] }) => {
        if (!active) return;
        const matchingContracts = contracts.filter(
          (item) =>
            String(item.reservationId) === String(reservationId) ||
            (tenantId && String(item.tenantId) === String(tenantId)),
        );
        setAllTenantContracts(matchingContracts);
      })
      .catch(() => {
        if (active) setAllTenantContracts([]);
      });
    return () => {
      active = false;
    };
  }, [fetchedDetail, initialTenant, reservationId]);

  // Resolve the tenant's current Contract via the backend canonical selector
  // (resolveTenantCanonicalContract, through GET /contracts/tenant/:tenantId/current).
  // Never guessed client-side — no first-match/newest-record fallback.
  useEffect(() => {
    if (!fetchedDetail && !initialTenant) return;
    const tenantId =
      fetchedDetail?.tenantId ||
      initialTenant?.tenantId?._id ||
      initialTenant?.tenantId ||
      initialTenant?.userId?._id ||
      initialTenant?.userId;

    if (!tenantId) {
      setDedicatedContract(null);
      setDedicatedContractError(null);
      setContractLookupDone(true);
      return;
    }

    let active = true;
    setContractLookupDone(false);
    setDedicatedContractError(null);
    contractApi
      .getTenantCurrentContract(String(tenantId))
      .then(({ contract }) => {
        if (!active) return;
        setDedicatedContract(contract || null);
      })
      .catch((err) => {
        if (!active) return;
        const code = err?.response?.data?.code;
        setDedicatedContract(null);
        if (code === "MULTIPLE_CANONICAL_CONTRACTS") {
          setDedicatedContractError("MULTIPLE_CANONICAL_CONTRACTS");
        } else if (code === "CONTRACT_NOT_FOUND") {
          setDedicatedContractError(null);
        } else {
          setDedicatedContractError("LOOKUP_FAILED");
        }
      })
      .finally(() => {
        if (active) setContractLookupDone(true);
      });
    return () => {
      active = false;
    };
  }, [fetchedDetail, initialTenant]);

  // This modal instance is reused across different tenants (no per-tenant
  // remount from the parent), so Digital Contract preview state from a
  // previously viewed tenant must never survive a switch to another one.
  useEffect(() => {
    digitalContractRequestRef.current += 1;
    setShowDigitalContractModal(false);
    setDigitalContractData(null);
    setDigitalContractError("");
    setActiveDigitalContract(null);
    setSelectedContractOverride(null);
    setLoadingDigitalContract(false);
  }, [reservationId]);

  const fetchTenantViolations = useCallback(async () => {
    const targetTenantId =
      fetchedDetail?.tenantId ||
      fetchedDetail?.userId?._id ||
      fetchedDetail?.userId ||
      initialTenant?.tenantId?._id ||
      initialTenant?.tenantId ||
      initialTenant?.userId?._id ||
      initialTenant?.userId ||
      initialTenant?._id;

    if (!targetTenantId) return;

    try {
      setLoadingViolations(true);
      const res = await billingApi.getViolations({
        tenantId: String(targetTenantId),
      });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setTenantViolations(list);
    } catch (err) {
      console.error("Failed to load tenant violations in detail modal:", err);
    } finally {
      setLoadingViolations(false);
    }
  }, [fetchedDetail, initialTenant]);

  useEffect(() => {
    fetchTenantViolations();
  }, [fetchTenantViolations]);

  const handleDownloadStayProof = async (contractOverride = null) => {
    const targetContract =
      contractOverride ||
      selectedContractOverride ||
      activeDigitalContract ||
      dedicatedContract ||
      (allTenantContracts.length > 0 ? allTenantContracts[0] : null);

    if (!targetContract && dedicatedContractError === "MULTIPLE_CANONICAL_CONTRACTS" && allTenantContracts.length === 0) {
      showNotification(
        "Multiple active contract records were found for this tenant. Please resolve the conflicting contract records before downloading the lease contract.",
        "error",
      );
      return;
    }
    setDownloadingProof(true);
    try {
      const targetId =
        targetContract?._id ||
        targetContract?.id ||
        targetContract?.contractNumber ||
        reservationId ||
        initialTenant?.reservationCode ||
        initialTenant?._id ||
        initialTenant?.id;
      const blob = await contractApi.getStayProofFile(targetId, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Lilycrest-Lease-Contract-${targetContract?.contractNumber || initialTenant?.reservationCode || "Tenant"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const code = err?.response?.data?.code;
      const message =
        code === "MULTIPLE_CANONICAL_CONTRACTS" && !targetContract
          ? "Multiple active contract records were found for this tenant. Please resolve the conflicting contract records before downloading the lease contract."
          : err?.response?.data?.error || "Failed to generate Lease Contract PDF";
      showNotification(message, "error");
    } finally {
      setDownloadingProof(false);
    }
  };

  const handleOpenDigitalContract = async (specificContract = null) => {
    const selectedContract =
      (specificContract && typeof specificContract === "object")
        ? specificContract
        : (typeof specificContract === "string"
            ? allTenantContracts.find(
                (c) =>
                  String(c._id || c.id) === specificContract ||
                  String(c.contractNumber) === specificContract,
              )
            : null) ||
          selectedContractOverride ||
          dedicatedContract ||
          (allTenantContracts.length > 0 ? allTenantContracts[0] : null);

    if (!selectedContract && dedicatedContractError === "MULTIPLE_CANONICAL_CONTRACTS" && allTenantContracts.length === 0) {
      setDigitalContractData(null);
      setDigitalContractError(
        "Multiple active contract records were found for this tenant. Please resolve the conflicting contract records before viewing the digital contract.",
      );
      setShowDigitalContractModal(true);
      return;
    }
    const requestId = ++digitalContractRequestRef.current;
    setActiveDigitalContract(selectedContract);
    // Clear the previous tenant/contract's preview data immediately so a
    // slow request can never leave stale values on screen behind the
    // loading state.
    setDigitalContractData(null);
    setDigitalContractError("");
    setLoadingDigitalContract(true);
    setShowDigitalContractModal(true);
    try {
      const targetId =
        (typeof specificContract === "string"
          ? specificContract
          : specificContract?._id ||
            specificContract?.id ||
            specificContract?.contractNumber) ||
        selectedContract?._id ||
        selectedContract?.id ||
        selectedContract?.contractNumber ||
        dedicatedContract?._id ||
        dedicatedContract?.id ||
        dedicatedContract?.contractNumber ||
        reservationId ||
        initialTenant?.reservationCode ||
        initialTenant?._id ||
        initialTenant?.id;
      const res = await contractApi.getStayProofData(targetId);
      if (digitalContractRequestRef.current !== requestId) return; // superseded by a newer open
      if (res?.stayProof) {
        setDigitalContractData(res.stayProof);
      } else {
        setDigitalContractError("The current contract details are unavailable for this tenant.");
      }
    } catch (err) {
      if (digitalContractRequestRef.current !== requestId) return; // superseded by a newer open
      setDigitalContractError(
        err?.response?.data?.error || "Unable to load the current contract details. Please try again.",
      );
    } finally {
      if (digitalContractRequestRef.current === requestId) setLoadingDigitalContract(false);
    }
  };

  const handleWarningAction = (actionType) => {
    if (actionType === "view_bill" || actionType === "verify_receipt") {
      setActiveTab("financials");
    } else if (actionType === "renew_lease") {
      setDialogState({ type: "renew", loading: false, error: null });
    } else if (actionType === "view_violations") {
      onClose();
      navigate("/admin/billing?tab=violations");
    }
  };

  // "View Bill" from Room Transfer History — open the tenant's canonical
  // Billing (Financials) tab where the transfer_settlement Bill is listed.
  // History does NOT rebuild Billing; it only links to it.
  const handleViewBillFromHistory = () => {
    setActiveTab("financials");
  };

  const [generatingReceiptId, setGeneratingReceiptId] = useState(null);

  const handleViewBillReceipt = async (item = null) => {
    const cardId = item?.id || "monthly-rent";
    try {
      setGeneratingReceiptId(cardId);
      const { viewBillingReceiptPDF } = await import("../../../shared/utils/receiptGenerator.js");
      const isElec = item?.category === "electricity" || item?.code?.includes("electricity");
      const isWater = item?.category === "water" || item?.code?.includes("water");
      const isPenalty = item?.category === "penalty" || item?.code?.includes("penalty");
      const isViolation = item?.category === "violation" || item?.code?.includes("violation");
      const isOverdue =
        item?.code?.includes("overdue") ||
        item?.severity === "high" ||
        item?.severity === "error";

      const penaltyAmount =
        item?.financialBreakdown?.penaltyAmount ??
        (isPenalty ? Number(item?.amount || 0) : 0);

      const rentAmount =
        !item || item.category === "rent" || item.code?.includes("rent")
          ? Number(item?.amount || tenant.monthlyRate || 0)
          : 0;

      const payload = {
        id: item?.billId || tenant.reservationId || "bill",
        _id: item?.billId || tenant.reservationId || "bill",
        tenantName: tenant.name || tenant.tenantName || "Tenant",
        tenantEmail: tenant.email || "N/A",
        email: tenant.email || "N/A",
        branch: tenant.branch || "Lilycrest",
        room: tenant.room || "Assigned Room",
        bed: tenant.bed || "",
        roomType: tenant.roomType || "Standard",
        billingMonth: item?.cycle?.month || new Date().toISOString(),
        dueDate: item?.dueDate || tenant.leaseEndDate || new Date().toISOString(),
        status: isOverdue ? "overdue" : "pending",
        totalAmount: Number(item?.amount ?? tenant.monthlyRate ?? 0),
        paidAmount:
          tenant.paymentStatus === "paid" && !item
            ? Number(tenant.monthlyRate || 0)
            : 0,
        charges: {
          rent: rentAmount,
          electricity: isElec ? Number(item?.amount || 0) : 0,
          water: isWater ? Number(item?.amount || 0) : 0,
          penalty: Number(penaltyAmount || 0),
          violation: isViolation ? Number(item?.amount || 0) : 0,
        },
        createdAt: item?.date || new Date().toISOString(),
      };

      await viewBillingReceiptPDF(payload);
    } catch (err) {
      console.error("Failed to generate bill receipt/statement PDF:", err);
      showNotification("Could not generate PDF statement. Please try again.", "error");
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  // Derive a stable Tenant ID from the user's _id (not the reservation).
  const tenantDisplayCode = useMemo(() => {
    const rawTenantId =
      fetchedDetail?.tenantId ||
      initialTenant?.tenantId?._id ||
      initialTenant?.tenantId ||
      initialTenant?.userId?._id ||
      initialTenant?.userId ||
      "";
    const raw = String(rawTenantId);
    if (!raw) return "N/A";
    return `TEN-${raw.slice(-8).toUpperCase()}`;
  }, [fetchedDetail, initialTenant]);

  const attachedDocs = useMemo(() => {
    const source = fetchedDetail || initialTenant || {};
    const docs = [];

    if (source.validIDFrontUrl) {
      docs.push({
        id: "id_front",
        label: "Valid ID (Front)",
        type: source.validIDType || source.idType || "Government ID",
        url: source.validIDFrontUrl,
        category: "identity",
      });
    }
    if (source.validIDBackUrl) {
      docs.push({
        id: "id_back",
        label: "Valid ID (Back)",
        type: source.validIDType || source.idType || "Government ID",
        url: source.validIDBackUrl,
        category: "identity",
      });
    }
    if (source.selfiePhotoUrl) {
      docs.push({
        id: "selfie",
        label: "Selfie Verification Photo",
        type: "Face Verification",
        url: source.selfiePhotoUrl,
        category: "photo",
      });
    }
    if (source.nbiClearanceUrl) {
      docs.push({
        id: "nbi",
        label: "NBI / Police Clearance",
        type: "Clearance Document",
        url: source.nbiClearanceUrl,
        category: "clearance",
      });
    }
    if (source.companyIDUrl) {
      docs.push({
        id: "company",
        label: "Company / Student ID",
        type: "Organization ID",
        url: source.companyIDUrl,
        category: "employment",
      });
    }
    return docs;
  }, [fetchedDetail, initialTenant]);

  const tenant = useMemo(() => {
    const detail = fetchedDetail || initialTenant || {};
    const basicInfo = detail.basicInfo || {};
    const leaseInfo = detail.leaseInfo || {};
    const paymentInfo = detail.paymentInfo || {};
    const personalInfo = detail.personalInformation || {};
    const financialSummary = detail.financialSummary || initialTenant?.financialSummary || {};

    const fullName =
      basicInfo.name ||
      detail.name ||
      detail.tenantName ||
      "Tenant";

    const resolvedFinancials = resolveReservationFinancials(detail, detail);
    const monthlyRate =
      paymentInfo.monthlyRent ??
      financialSummary.monthlyRate ??
      detail.monthlyRate ??
      detail.monthlyRent ??
      resolvedFinancials.monthlyRent ??
      0;
    const advanceRent =
      paymentInfo.advanceRent ??
      financialSummary.advanceRent ??
      detail.advanceRent ??
      detail.moveInCashOut?.monthlyAdvance ??
      resolvedFinancials.advanceRent ??
      monthlyRate;
    const securityDeposit =
      paymentInfo.securityDeposit ??
      financialSummary.securityDeposit ??
      detail.securityDeposit ??
      detail.moveInCashOut?.securityDeposit ??
      resolvedFinancials.securityDeposit ??
      monthlyRate;
    const reservationFee =
      paymentInfo.reservationFee ??
      financialSummary.reservationFee ??
      detail.reservationFee ??
      detail.reservationFeeAmount ??
      detail.pricingSnapshot?.reservationFeeAmount ??
      resolvedFinancials.reservationFeeAmount ??
      2000;

    return {
      ...detail,
      reservationId,
      name: fullName,
      tenantName: fullName,
      initials: getInitials(fullName),
      email: basicInfo.email || detail.email || detail.contact?.email || "N/A",
      phone: basicInfo.phone || detail.phone || detail.contact?.phone || "N/A",
      branch: formatBranch(basicInfo.branch || detail.branch || "") || "N/A",
      room: basicInfo.room || detail.room || "N/A",
      bed: basicInfo.bed || detail.bed || "",
      roomType: detail.roomType || basicInfo.roomType || detail.room?.type || detail.assignedRoom?.type || detail.preferredRoomType || detail.type || "",
      moveInDate: formatDate(leaseInfo.moveInDate || detail.moveInDate || detail.moveIn),
      moveIn: formatDate(leaseInfo.moveInDate || detail.moveInDate || detail.moveIn),
      contractEnd: formatDate(leaseInfo.leaseEndDate || detail.contractEnd || detail.moveOut || detail.leaseEndDate),
      moveOut: formatDate(leaseInfo.leaseEndDate || detail.moveOut || detail.leaseEndDate),
      leaseEndDate: leaseInfo.leaseEndDate || detail.leaseEndDate,
      daysRemaining: leaseInfo.daysUntilLeaseEnd ?? detail.daysUntilLeaseEnd ?? null,
      balance: paymentInfo.currentBalance ?? detail.currentBalance ?? detail.balance ?? 0,
      monthlyRate,
      advanceRent,
      securityDeposit,
      reservationFee,
      paymentStatus: paymentInfo.paymentStatus || detail.paymentStatus || "paid",
      occupancyStatus: detail.stayStatus || detail.occupancyStatus || "active",
      stayStatus: detail.stayStatus || detail.occupancyStatus || "active",
      nextAction: detail.nextAction || "none",
      emergencyContact: basicInfo.emergencyContactName || personalInfo.emergencyContact?.name || detail.emergencyContact || "Not provided",
      emergencyPhone: basicInfo.emergencyContactPhone || personalInfo.emergencyContact?.phone || detail.emergencyPhone || "Not provided",
      emergencyRelationship: basicInfo.emergencyContactRelationship || personalInfo.emergencyContact?.relationship || detail.emergencyRelationship || "Not provided",
      warnings: (detail.systemWarnings || detail.warnings || detail.warningFlags || []).map((w, index) => ({
        id: w.id || w.code || `warning-${index}`,
        type: w.code || w.type || "warning",
        code: w.code || w.type || "warning",
        category: w.category || "general",
        title: w.title || null,
        amount: w.amount || null,
        overdueDays: w.overdueDays || null,
        billId: w.billId || null,
        cycle: w.cycle || null,
        location: w.location || null,
        violationType: w.violationType || null,
        penaltyAmount: w.penaltyAmount || null,
        status: w.status || null,
        dateOfIncident: w.dateOfIncident || null,
        message: w.message || "Warning",
        details: w.details || null,
        impact: w.impact || null,
        recommendation: w.recommendation || null,
        date: w.date ? formatDate(w.date) : (w.createdAt ? formatDate(w.createdAt) : null),
        dueDate: w.dueDate ? formatDate(w.dueDate) : null,
        rawDueDate: w.dueDate || null,
        severity: w.severity === "error" || w.severity === "high" ? "high" : (w.severity === "warning" || w.severity === "medium" ? "medium" : "low"),
      })),
      roomHistory: (detail.roomHistory || []).map((entry) => ({
        id: entry.id,
        roomId: entry.roomId || null,
        branch: formatBranch(entry.branch || basicInfo.branch || detail.branch || "") || "N/A",
        room: entry.roomName || entry.room || "N/A",
        bed: entry.bedLabel || entry.bed || "No bed",
        moveInDate: formatDate(entry.moveInDate),
        moveOutDate: entry.moveOutDate ? formatDate(entry.moveOutDate) : null,
        status: entry.moveOutDate ? "past" : "current",
        contract: entry.contract || null,
      })),
      extensionHistory: (leaseInfo.extensionHistory || detail.extensionHistory || []).map((entry) => {
        const addedMonths = Number(entry.addedMonths || 0);
        const startDateFormatted = entry.leaseStartDate ? formatDate(entry.leaseStartDate) : null;
        const endDateFormatted = entry.leaseEndDate ? formatDate(entry.leaseEndDate) : null;
        const dateRange = startDateFormatted && endDateFormatted ? `${startDateFormatted} – ${endDateFormatted}` : null;

        let duration = "+0 months";
        if (addedMonths > 0) {
          duration = `+${addedMonths} month${addedMonths === 1 ? "" : "s"}`;
        } else if (dateRange) {
          duration = "Lease Extension";
        }

        return {
          id: entry.id,
          duration,
          date: formatDate(entry.extendedAt || entry.date || entry.leaseStartDate),
          previousEnd: entry.previousDuration ? `${entry.previousDuration} months` : null,
          newEnd: entry.newDuration ? `${entry.newDuration} months` : null,
          startDate: startDateFormatted,
          endDate: endDateFormatted,
          dateRange,
          notes: entry.notes || "",
        };
      }),
      paymentHistory: paymentInfo.recentPayments || detail.paymentHistory || [],
      tenantId: detail.tenantId || "",
      userId: detail.userId || detail.tenantId || "",
      isOwnerViewing: initialTenant?.isOwnerViewing ?? true,
      reservationCode: detail.reservationCode || initialTenant?.reservationCode || "",
    };
  }, [fetchedDetail, initialTenant, reservationId]);

  const rawTabIndicators = useMemo(() => getTenantTabIndicators(tenant), [tenant]);
  const tabIndicators = useMemo(() => {
    return {
      overview: viewedTabs.has("overview") ? null : rawTabIndicators.overview,
      financials: viewedTabs.has("financials") ? null : rawTabIndicators.financials,
      warnings: viewedTabs.has("warnings") ? null : rawTabIndicators.warnings,
    };
  }, [rawTabIndicators, viewedTabs]);

  const headerIndicator = useMemo(
    () => getTenantIndicator(tenant, { ignoreViewed: true }),
    [tenant],
  );

  const closeDialog = () => {
    setDialogState({ type: null, loading: false, error: null });
  };

  const handleOpenDocsPanel = useCallback(() => {
    setActiveTab("overview");
    setIsDocsPanelOpen(true);
    setTimeout(() => {
      if (docsPanelRef.current) {
        docsPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }, []);

  const invalidateTenantQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
      queryClient.invalidateQueries({ queryKey: ["rooms"] }),
      queryClient.invalidateQueries({ queryKey: ["contracts"] }),
      queryClient.invalidateQueries({ queryKey: ["billing"] }),
      queryClient.invalidateQueries({ queryKey: ["utilities"] }),
    ]);

  const isGuadalupe = useMemo(() => {
    const branchStr = String(tenant?.branch || "").toLowerCase();
    return branchStr.includes("guadalupe") || branchStr.includes("guada");
  }, [tenant?.branch]);

  const roomHistory = useMemo(() => {
    const raw = (tenant?.roomHistory && tenant.roomHistory.length > 0)
      ? tenant.roomHistory.map((entry) => {
          if (entry.contract) return entry;
          const isCurrent = entry.status === "current" || !entry.moveOutDate;
          if (isCurrent && dedicatedContract) {
            return { ...entry, contract: dedicatedContract };
          }
          if (Array.isArray(allTenantContracts) && allTenantContracts.length > 0) {
            const matched =
              allTenantContracts.find((c) => {
                const cRoomId = String(c.roomId?._id || c.roomId || "");
                const entryRoomId = String(entry.roomId || "");
                if (entryRoomId && cRoomId && entryRoomId === cRoomId) return true;
                if (entry.room && c.roomNumber && String(entry.room).toLowerCase().includes(String(c.roomNumber).toLowerCase())) return true;
                return false;
              }) ||
              (!isCurrent
                ? allTenantContracts.find((c) => !c.isCurrent && !c.isCanonical)
                : allTenantContracts.find((c) => c.isCurrent || c.isCanonical));
            if (matched) {
              return {
                ...entry,
                contract: {
                  id: String(matched._id || matched.id),
                  contractNumber: matched.contractNumber || "Pending",
                  status: matched.status,
                  purpose: matched.contractPurpose || matched.purpose || "initial",
                  isCurrent: matched.isCurrent,
                  leaseStartDate: matched.leaseStartDate || null,
                  leaseEndDate: matched.leaseEndDate || null,
                  approvedMonthlyRate: matched.approvedMonthlyRate || null,
                },
              };
            }
          }
          return entry;
        })
      : (tenant?.branch || tenant?.room)
        ? [
            {
              id: "current-assignment",
              branch: tenant.branch || "N/A",
              room: tenant.room || "N/A",
              bed: tenant.bed || "N/A",
              moveInDate: tenant.moveInDate || tenant.moveIn || null,
              moveOutDate: null,
              status: "current",
              contract: dedicatedContract || allTenantContracts?.[0] || null,
            },
          ]
        : [];

    return [...raw].sort((a, b) => {
      const aIsCurrent = a.status === "current" || !a.moveOutDate;
      const bIsCurrent = b.status === "current" || !b.moveOutDate;
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      return 0;
    });
  }, [tenant, dedicatedContract, allTenantContracts]);

  const calculatedDueDate = useMemo(() => {
    const warns = tenant?.warnings || [];
    const overdueWarningItem = warns.find((w) => w.type === "overdue_balance" || w.code === "overdue_balance");
    return tenant?.dueDate || tenant?.lastDueDate || tenant?.overdueDueDate || overdueWarningItem?.dueDate || overdueWarningItem?.date || null;
  }, [tenant]);

  const masterLedgerData = useMemo(() => {
    const items = [];
    const warns = tenant?.warnings || [];

    const rentWarn = warns.find((w) => w.category === "rent" || w.code?.includes("rent"));
    const transferWarn = warns.find((w) => w.billType === "transfer_settlement" || w.category === "transfer_settlement");
    const elecWarn = !isGuadalupe ? warns.find((w) => w.category === "electricity" || w.code?.includes("electricity")) : null;
    const waterWarn = !isGuadalupe ? warns.find((w) => w.category === "water" || w.code?.includes("water")) : null;
    const penaltyWarn = warns.find((w) => w.category === "penalty" || w.code?.includes("penalty"));
    const violationWarns = warns.filter((w) => (w.category === "violation" || w.code?.includes("violation")) && Number(w.penaltyAmount || w.amount || 0) > 0);

    const monthlyRate = Number(tenant?.monthlyRate || 0);

    // 1. Rent Line Item
    const rentRemaining = rentWarn ? Number(rentWarn.amount || 0) : 0;
    const rentBilled = monthlyRate > 0 ? monthlyRate : rentRemaining;
    const rentPaid = Math.max(0, rentBilled - rentRemaining);
    const isRentOverdue = rentWarn && (rentWarn.code?.includes("overdue") || rentWarn.severity === "error" || rentWarn.severity === "high");
    const rentStatus = rentRemaining > 0 ? (isRentOverdue ? "overdue" : "pending") : "paid";
    const rentDueDate = rentWarn?.dueDate || calculatedDueDate || tenant?.moveInDate || "Monthly Cycle";
    const rentBreakdown = buildItemFinancialBreakdown({
      category: "rent",
      billedAmount: rentBilled,
      balanceAmount: rentRemaining,
      dueDate: rentWarn?.rawDueDate || rentWarn?.dueDate || calculatedDueDate,
      persistedPenalty: Number(rentWarn?.penaltyAmount || 0),
      discountAmount: Number(rentWarn?.discount || 0),
      creditAmount: Number(rentWarn?.creditApplied || 0),
    });

    items.push({
      id: "ledger-rent",
      title: isGuadalupe ? "All-Inclusive Room Rent & Utilities" : "Monthly Room Rent",
      subtitle: isGuadalupe ? "Fixed rate (rent & utilities all-inclusive)" : "Contracted room rate / month",
      category: "rent",
      dueDate: rentDueDate,
      overdueDays: rentWarn?.overdueDays || rentBreakdown.penaltyInfo?.daysLate || null,
      billed: rentBilled,
      paid: rentPaid,
      balance: rentRemaining,
      status: rentStatus,
      rawItem: rentWarn || null,
      financialBreakdown: rentBreakdown,
      details: isGuadalupe
        ? "Fixed all-inclusive monthly rate covering dormitory room occupancy and utility consumption without submetering."
        : "Contracted monthly room rent under active lease agreement. Billed per recurring cycle.",
    });

    if (transferWarn) {
      const transferRemaining = Number(transferWarn.amount || 0);
      const isTransferOverdue = transferWarn.code?.startsWith("overdue_") || transferWarn.severity === "error";
      items.push({
        id: transferWarn.id || "ledger-transfer-settlement",
        title: "Room Transfer Settlement",
        subtitle: "Rent adjustment, security deposit top-up, and finalized transfer charges",
        category: "transfer_settlement",
        dueDate: transferWarn.dueDate || calculatedDueDate || "Due at transfer",
        overdueDays: transferWarn.overdueDays || null,
        billed: Number(transferWarn.totalAmount || transferRemaining),
        paid: Math.max(0, Number(transferWarn.totalAmount || transferRemaining) - transferRemaining),
        balance: transferRemaining,
        status: isTransferOverdue ? "overdue" : "pending",
        rawItem: transferWarn,
        details: "This is a Room Transfer settlement balance, not recurring monthly room rent.",
      });
    }

    // 2. Submetered Electricity Line Item (if supported)
    if (!isGuadalupe && elecWarn) {
      const isElecOverdue = elecWarn.code?.includes("overdue") || elecWarn.severity === "error" || elecWarn.severity === "high";
      const elecRemaining = Number(elecWarn.amount || 0);
      const elecBilled = Number(elecWarn.grossAmount || elecWarn.totalAmount || elecRemaining);
      const elecPaid = Math.max(0, elecBilled - elecRemaining);
      const elecDueDate = elecWarn.dueDate || calculatedDueDate || "Scheduled";
      const elecBreakdown = buildItemFinancialBreakdown({
        category: "electricity",
        billedAmount: elecBilled,
        balanceAmount: elecRemaining,
        dueDate: elecWarn.rawDueDate || elecWarn.dueDate || calculatedDueDate,
        persistedPenalty: Number(elecWarn.penaltyAmount || 0),
      });

      items.push({
        id: elecWarn.id || "ledger-elec",
        title: "Submetered Electricity",
        subtitle: `Room ${tenant?.room || "submeter"} reading`,
        category: "electricity",
        cycle: elecWarn.cycle || null,
        dueDate: elecDueDate,
        overdueDays: elecWarn.overdueDays || elecBreakdown.penaltyInfo?.daysLate || null,
        billed: elecBilled,
        paid: elecPaid,
        balance: elecRemaining,
        status: isElecOverdue ? "overdue" : "pending",
        rawItem: elecWarn,
        financialBreakdown: elecBreakdown,
        details: "Calculated from room submeter kWh reading and shared equally among verified room occupants.",
      });
    }

    // 3. Room Water Share Line Item (if supported)
    if (!isGuadalupe && waterWarn) {
      const isWaterOverdue = waterWarn.code?.includes("overdue") || waterWarn.severity === "error" || waterWarn.severity === "high";
      const waterRemaining = Number(waterWarn.amount || 0);
      const waterBilled = Number(waterWarn.grossAmount || waterWarn.totalAmount || waterRemaining);
      const waterPaid = Math.max(0, waterBilled - waterRemaining);
      const waterDueDate = waterWarn.dueDate || calculatedDueDate || "Scheduled";
      const waterBreakdown = buildItemFinancialBreakdown({
        category: "water",
        billedAmount: waterBilled,
        balanceAmount: waterRemaining,
        dueDate: waterWarn.rawDueDate || waterWarn.dueDate || calculatedDueDate,
        persistedPenalty: Number(waterWarn.penaltyAmount || 0),
      });

      items.push({
        id: waterWarn.id || "ledger-water",
        title: "Room Water Share",
        subtitle: "Equal room occupant allocation",
        category: "water",
        cycle: waterWarn.cycle || null,
        dueDate: waterDueDate,
        overdueDays: waterWarn.overdueDays || waterBreakdown.penaltyInfo?.daysLate || null,
        billed: waterBilled,
        paid: waterPaid,
        balance: waterRemaining,
        status: isWaterOverdue ? "overdue" : "pending",
        rawItem: waterWarn,
        financialBreakdown: waterBreakdown,
        details: "Shared room water consumption divided equally among active registered room occupants.",
      });
    }

    // 4. Late Payment Penalties Line Item
    if (penaltyWarn) {
      const penaltyAmount = Number(penaltyWarn.amount || 0);
      items.push({
        id: penaltyWarn.id || "ledger-penalty",
        title: "Late Payment Penalties",
        subtitle: "Daily overdue fee accrual (₱50/day)",
        category: "penalty",
        cycle: penaltyWarn.cycle || null,
        dueDate: penaltyWarn.dueDate || calculatedDueDate || "Immediate",
        overdueDays: penaltyWarn.overdueDays || null,
        billed: penaltyAmount,
        paid: 0,
        balance: penaltyAmount,
        status: "overdue",
        rawItem: penaltyWarn,
        details: "Daily late penalty accrued automatically at ₱50/day on past-due balances until settled in full.",
      });
    }

    // 5. Active Rule Violations / Disciplinary Fines
    violationWarns.forEach((vWarn) => {
      const fineAmount = Number(vWarn.penaltyAmount || vWarn.amount || 0);
      items.push({
        id: vWarn.id || `ledger-violation-${vWarn.violationId}`,
        title: vWarn.title || "House Rule Violation Fine",
        subtitle: `Incident: ${vWarn.dateOfIncident ? new Date(vWarn.dateOfIncident).toLocaleDateString() : "Disciplinary"}`,
        category: "violation",
        cycle: null,
        dueDate: vWarn.date || calculatedDueDate || "Immediate",
        overdueDays: null,
        billed: fineAmount,
        paid: 0,
        balance: fineAmount,
        status: "overdue",
        rawItem: vWarn,
        details: vWarn.details || vWarn.message || "Assessed disciplinary penalty fine.",
      });
    });

    // Reconcile item balances if tenant.balance is explicitly provided
    const currentActualBalance = Number(tenant?.balance ?? 0);
    const calculatedSumBalance = items.reduce((acc, it) => acc + (Number(it.balance) || 0), 0);

    if (calculatedSumBalance !== currentActualBalance && currentActualBalance >= 0) {
      let excessBalance = calculatedSumBalance - currentActualBalance;
      for (let i = 0; i < items.length && excessBalance > 0; i++) {
        const it = items[i];
        if (it.balance > 0) {
          const deductible = Math.min(it.balance, excessBalance);
          it.balance -= deductible;
          it.paid += deductible;
          excessBalance -= deductible;
          if (it.balance === 0) {
            it.status = "paid";
          }
        }
      }
    }

    const totalBilled = items.reduce((acc, it) => acc + (Number(it.billed) || 0), 0);
    const totalPaid = items.reduce((acc, it) => acc + (Number(it.paid) || 0), 0);
    const totalBalance = Math.max(0, totalBilled - totalPaid);

    return {
      items,
      totalBilled,
      totalPaid,
      totalBalance: currentActualBalance > 0 ? currentActualBalance : totalBalance,
    };
  }, [tenant, isGuadalupe, calculatedDueDate]);

  if (!initialTenant && !reservationId) return null;

  // Zero-flash guarantee: If full detail is not yet loaded, render high-contrast skeleton
  if (isDetailLoading || (!fetchedDetail && !initialTenant?.basicInfo)) {
    return <TenantDetailModalSkeleton onClose={onClose} />;
  }

  const paymentStatus = tenant.paymentStatus || "paid";
  const occupancyStatus = tenant.occupancyStatus || "active";
  const paymentHistory = tenant.paymentHistory || [];
  const extensionHistory = tenant.extensionHistory || [];
  const warnings = tenant.warnings || [];

  const paymentConfig = getPaymentStatusConfig(paymentStatus);
  const occupancyConfig = getOccupancyStatusConfig(occupancyStatus);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* HEADER */}
          <TenantDetailModalHeader
            tenant={tenant}
            headerIndicator={headerIndicator}
            occupancyConfig={occupancyConfig}
            paymentStatus={paymentStatus}
            onClose={onClose}
          />

          {/* BODY - SPLIT PANEL LAYOUT (col-12) */}
          <div
            ref={scrollContainerRef}
            className="p-6 flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] bg-card grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* LEFT SIDEBAR (lg:col-span-4) - Fixed Context */}
            <TenantDetailModalSidebar
              tenant={tenant}
              masterLedgerData={masterLedgerData}
              paymentConfig={paymentConfig}
              paymentStatus={paymentStatus}
              calculatedDueDate={calculatedDueDate}
              attachedDocs={attachedDocs}
              onOpenDocsPanel={handleOpenDocsPanel}
              onTriggerDialog={(type) => {
                if (type === "forceDelete") {
                  setSafeguardsData(null);
                }
                setDialogState({ type, loading: false, error: null });
              }}
            />

            {/* RIGHT WORKSPACE PANEL (lg:col-span-8) - Tabbed Focus View */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              {/* Tab Navigation Header */}
              <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleTabChange("overview")}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap flex-shrink-0 cursor-pointer ${
                    activeTab === "overview"
                      ? "border-foreground text-foreground bg-muted/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Overview &amp; Contract</span>
                  {tabIndicators.overview && activeTab !== "overview" && !viewedTabs.has("overview") && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${tabIndicators.overview.dotClass}`}
                      title={tabIndicators.overview.tooltip}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange("financials")}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap flex-shrink-0 cursor-pointer ${
                    activeTab === "financials"
                      ? "border-foreground text-foreground bg-muted/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Financials &amp; Billing</span>
                  {tabIndicators.financials && activeTab !== "financials" && !viewedTabs.has("financials") && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${tabIndicators.financials.dotClass}`}
                      title={tabIndicators.financials.tooltip}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange("history")}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap flex-shrink-0 cursor-pointer ${
                    activeTab === "history"
                      ? "border-foreground text-foreground bg-muted/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Room &amp; History</span>
                  {roomHistory.length > 0 && activeTab !== "history" && !viewedTabs.has("history") && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground font-semibold inline-block">
                      {roomHistory.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange("warnings")}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap flex-shrink-0 cursor-pointer ${
                    activeTab === "warnings"
                      ? "border-foreground text-foreground bg-muted/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${activeTab === "warnings" ? "text-amber-600 dark:text-amber-400" : "text-amber-500/80"}`} />
                  <span>Warnings &amp; Infractions</span>
                  {(warnings.length > 0 || tenantViolations.filter((v) => !["dismissed", "resolved"].includes(v.status)).length > 0) && activeTab !== "warnings" && !viewedTabs.has("warnings") && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 inline-block border border-slate-200 dark:border-slate-700">
                      {warnings.length + tenantViolations.filter((v) => !["dismissed", "resolved"].includes(v.status)).length}
                    </span>
                  )}
                </button>
              </div>

              {/* TAB CONTENT VIEWS */}
              <div className="flex-1 space-y-4">
                {/* TAB 1: OVERVIEW & CONTRACT */}
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    <TenantContractsTab
                      tenant={tenant}
                      dedicatedContract={dedicatedContract}
                      dedicatedContractError={dedicatedContractError}
                      allTenantContracts={allTenantContracts}
                      stayReference={
                        (dedicatedContractError === "MULTIPLE_CANONICAL_CONTRACTS" ? "Conflicting records" : (dedicatedContract || allTenantContracts[0])?.contractNumber || tenant.reservationCode || "LIL-RES-RECORD")
                      }
                      downloadingProof={downloadingProof}
                      onOpenDigitalContract={handleOpenDigitalContract}
                      onDownloadStayProof={handleDownloadStayProof}
                      onContractUpdated={(updated) => {
                        setDedicatedContract(updated);
                        if (setSelectedContractOverride) setSelectedContractOverride(updated);
                      }}
                    />
                    <TenantOverviewTab
                      tenant={tenant}
                      fetchedDetail={fetchedDetail}
                      attachedDocs={attachedDocs}
                      extensionHistory={extensionHistory}
                      isDocsPanelOpen={isDocsPanelOpen}
                      setIsDocsPanelOpen={setIsDocsPanelOpen}
                      docsPanelRef={docsPanelRef}
                      onPreviewDoc={setPreviewDoc}
                      onOpenDigitalContract={handleOpenDigitalContract}
                      transferRequestLoading={transferRequestActionLoading}
                      onProceedTransferRequest={(request) =>
                        setDialogState({ type: "transfer", loading: false, error: null, request })
                      }
                      onDeclineTransferRequest={async (declineReason) => {
                        const request = fetchedDetail?.tenantTransferRequest;
                        if (!request?.id) return;
                        setTransferRequestActionLoading(true);
                        try {
                          const response = await reservationApi.declineTenantTransferRequest(
                            request.id,
                            declineReason,
                          );
                          await invalidateTenantQueries();
                          await refetchDetail();
                          showNotification(response?.message || "Room transfer request declined.", "success");
                        } catch (error) {
                          showNotification(error?.message || "Could not decline the room transfer request.", "error");
                        } finally {
                          setTransferRequestActionLoading(false);
                        }
                      }}
                    />
                  </div>
                )}

                {/* TAB 2: FINANCIALS & BILLING */}
                {activeTab === "financials" && (
                  <TenantBillingTab
                    tenant={tenant}
                    masterLedgerData={masterLedgerData}
                    paymentHistory={paymentHistory}
                    generatingReceiptId={generatingReceiptId}
                    onViewBillReceipt={handleViewBillReceipt}
                    onNavigateToBilling={() => {
                      onClose();
                      navigate(`/admin/billing?tenant=${tenant.reservationId || ""}`);
                    }}
                  />
                )}

                {/* TAB 3: ROOM & STAY HISTORY */}
                {activeTab === "history" && (
                  <TenantHistoryTab
                    tenant={tenant}
                    roomHistory={roomHistory}
                    roomTransferHistory={tenant?.roomTransferHistory || []}
                    dedicatedContract={dedicatedContract}
                    onOpenDigitalContract={handleOpenDigitalContract}
                    onViewBill={handleViewBillFromHistory}
                  />
                )}

                {/* TAB 4: TENANT RULE INFRACTIONS & SYSTEM WARNINGS */}
                {activeTab === "warnings" && (
                  <TenantViolationsTab
                    tenant={tenant}
                    warnings={warnings}
                    tenantViolations={tenantViolations}
                    loadingViolations={loadingViolations}
                    onRecordViolation={() => setRecordViolationOpen(true)}
                    onSelectViolationForDetail={(v) => setSelectedViolationForDetail(v)}
                    onPreviewDoc={setPreviewDoc}
                    onWarningAction={handleWarningAction}
                  />
                )}

                {/* TAB 5 (FALLBACK): APPLICATION DETAILS */}
                {activeTab === "application" && (
                  <TenantOverviewTab
                    tenant={tenant}
                    fetchedDetail={fetchedDetail}
                    attachedDocs={attachedDocs}
                    extensionHistory={extensionHistory}
                    isDocsPanelOpen={isDocsPanelOpen}
                    setIsDocsPanelOpen={setIsDocsPanelOpen}
                    docsPanelRef={docsPanelRef}
                    onPreviewDoc={setPreviewDoc}
                  />
                )}
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-between rounded-b-xl flex-shrink-0">
            <div className="text-xs text-muted-foreground">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70 mr-1">Tenant ID:</span>
              <span className="font-mono text-foreground text-[11px] font-semibold tracking-wide">{tenantDisplayCode}</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-xs font-semibold text-foreground cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {dialogState.type === "renew" ? (
        <RenewLeaseModal
          open
          tenant={tenant}
          detail={fetchedDetail || initialTenant}
          context={actionContext}
          loading={dialogState.loading}
          onClose={closeDialog}
          onOfferSubmit={async (offerPayload) => {
            setDialogState((s) => ({ ...s, loading: true, error: null }));
            try {
              const res = await reservationApi.createRenewalOffer(reservationId, offerPayload);
              await invalidateTenantQueries();
              showNotification(res?.message || "Renewal offer sent to tenant!", "success");
              closeDialog();
              onClose();
            } catch (err) {
              setDialogState((s) => ({
                ...s,
                loading: false,
                error: err.message || "Failed to create renewal offer",
              }));
              showNotification(err.message || "Failed to create renewal offer", "error");
            }
          }}
          onSubmit={async (payload) => {
            setDialogState((s) => ({ ...s, loading: true, error: null }));
            try {
              const res = await reservationApi.renew(reservationId, {
                newLeaseStartDate: payload.newLeaseStartDate,
                newLeaseEndDate: payload.newLeaseEndDate,
                monthlyRent: payload.monthlyRent ?? tenant?.monthlyRate ?? 0,
                notes: payload.notes,
                confirm: true,
              });
              await invalidateTenantQueries();
              showNotification(res?.message || "Lease renewed successfully!", "success");
              closeDialog();
              onClose();
            } catch (err) {
              setDialogState((s) => ({
                ...s,
                loading: false,
                error: err.message || "Failed to renew contract",
              }));
              showNotification(err.message || "Failed to renew contract", "error");
            }
          }}
        />
      ) : null}

      {dialogState.type === "transfer" ? (
        <TransferTenantModal
          open
          tenant={tenant}
          detail={fetchedDetail || initialTenant}
          transferRequest={dialogState.request || null}
          loading={dialogState.loading}
          sourceRoomLatestReading={actionContext?.sourceRoomLatestReading ?? null}
          electricityRatePerUnit={actionContext?.electricityRatePerUnit ?? null}
          onClose={closeDialog}
          onSubmit={async (payload) => {
            setDialogState((s) => ({ ...s, loading: true, error: null }));
            try {
              const res = await reservationApi.transfer(reservationId, {
                targetRoomId: payload.roomId,
                targetBedId: payload.bedId,
                tenantTransferRequestId: dialogState.request?.id || undefined,
                effectiveTransferDate: payload.effectiveTransferDate || new Date().toISOString().slice(0, 10),
                reason: payload.reason,
                notes: payload.notes || "",
                sourceRoomMeterReading: payload.sourceRoomMeterReading,
                targetRoomMeterReading: payload.targetRoomMeterReading,
                forceOverride: payload.forceOverride || false,
                confirm: true,
              });
              await invalidateTenantQueries();
              showNotification(res?.message || "Tenant transferred successfully!", "success");
              closeDialog();
              onClose();
            } catch (err) {
              const isOutstandingBlock = err?.code === "OUTSTANDING_BILLS_BLOCKING_TRANSFER"
                || err?.message?.includes("outstanding balance");
              const errorMsg = isOutstandingBlock
                ? `Transfer blocked: ₱${Number(err.outstandingBalance || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })} outstanding balance. Acknowledge in the form to force-proceed.`
                : err.message || "Failed to transfer tenant";
              setDialogState((s) => ({
                ...s,
                loading: false,
                error: errorMsg,
              }));
              showNotification(errorMsg, "error");
            }
          }}
        />
      ) : null}

      {dialogState.type === "moveOut" ? (
        <MoveOutModal
          open
          tenant={tenant}
          detail={fetchedDetail || initialTenant}
          loading={dialogState.loading}
          onClose={closeDialog}
          onSubmit={async (payload) => {
            setDialogState((s) => ({ ...s, loading: true, error: null }));
            try {
              const res = await reservationApi.moveOut(reservationId, {
                moveOutDate: payload.moveOutDate,
                actualVacateDate: payload.moveOutDate,
                reason: payload.reason || "move_out",
                finalNotes: payload.notes || "",
                damages: payload.damageDeductions || 0,
                deductions: (payload.damageDeductions || 0) + (payload.keyReturned ? 0 : 500),
                outstandingBalanceSnapshot: tenant?.balance || 0,
                finalUtilityReading: payload.meterReading,
        finalWaterReading: payload.finalWaterReading,
                confirm: true,
              });
              await invalidateTenantQueries();
              showNotification(res?.message || "Tenant moved out successfully!", "success");
              closeDialog();
              onClose();
            } catch (err) {
              setDialogState((s) => ({
                ...s,
                loading: false,
                error: err.message || "Failed to move out tenant",
              }));
              showNotification(err.message || "Failed to move out tenant", "error");
            }
          }}
        />
      ) : null}

      <ConfirmModal
        isOpen={dialogState.type === "deleteTenant"}
        onClose={closeDialog}
        onConfirm={async () => {
          const userId =
            tenant?.tenantId?._id ||
            tenant?.tenantId ||
            tenant?.userId?._id ||
            tenant?.userId;
          if (!userId) {
            showNotification("Cannot resolve tenant user ID.", "error");
            return;
          }
          setDialogState((s) => ({ ...s, loading: true }));
          try {
            await userApi.delete(userId, { hardDelete: true });
            await invalidateTenantQueries();
            showNotification("Tenant record deleted successfully.", "success");
            closeDialog();
            onClose();
          } catch (err) {
            closeDialog();
            setDialogState((s) => ({ ...s, loading: false }));
            // If blocked because force is needed, surface the force delete modal instead
            if (err?.code === "HARD_DELETE_BLOCKED" && err?.requiresForceDelete) {
              setSafeguardsData(err?.safeguards ?? null);
              setDialogState({ type: "forceDelete", loading: false, error: null });
              showNotification("This account requires Force Delete (owner only). See Force Delete modal.", "warning");
            } else {
              showNotification(err.message || "Failed to delete tenant record.", "error");
            }
          }
        }}
        title="Delete Tenant Record"
        message={`Permanently delete ${tenant?.name || "this tenant"}? This cannot be undone. All associated reservation and billing data will be purged.`}
        confirmText="Delete Permanently"
        cancelText="Cancel"
        variant="danger"
        loading={dialogState.loading}
      />

      {/* Force Delete Modal — owner-only, 3-step typed confirmation */}
      <ForceDeleteModal
        open={dialogState.type === "forceDelete"}
        tenant={tenant}
        safeguards={safeguardsData ?? tenant?.safeguards ?? {}}
        loading={dialogState.loading}
        onClose={closeDialog}
        onConfirm={async () => {
          const userId =
            tenant?.tenantId?._id ||
            tenant?.tenantId ||
            tenant?.userId?._id ||
            tenant?.userId;
          if (!userId) {
            showNotification("Cannot resolve tenant user ID.", "error");
            return;
          }
          setDialogState((s) => ({ ...s, loading: true }));
          try {
            const result = await userApi.delete(userId, {
              hardDelete: true,
              force: true,
              confirmationText: "DELETE",
            });
            await invalidateTenantQueries();
            const archived = result?.cleanup?.archivedReservations ?? 0;
            showNotification(
              `Account permanently deleted. ${archived} reservation(s) archived, beds released.`,
              "success",
            );
            closeDialog();
            onClose();
          } catch (err) {
            setDialogState((s) => ({ ...s, loading: false }));
            showNotification(err.message || "Force delete failed. Please try again.", "error");
          }
        }}
      />

      {/* Inline Document Preview Lightbox Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setPreviewDoc(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full p-4 space-y-3 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h4 className="font-bold text-sm text-foreground">{previewDoc.label}</h4>
                <span className="text-xs text-muted-foreground">{previewDoc.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-xs text-foreground flex items-center gap-1 font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Full
                </a>
                <button onClick={() => setPreviewDoc(null)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] flex items-center justify-center overflow-auto bg-black/10 rounded-lg p-2">
              {previewDoc.url && (previewDoc.url.match(/\.(jpeg|jpg|png|gif|webp)($|\?)/i) || previewDoc.category === "photo" || previewDoc.category === "identity") ? (
                <img src={previewDoc.url} alt={previewDoc.label} className="max-h-[65vh] w-auto object-contain rounded shadow-sm" />
              ) : (
                <div className="p-8 text-center space-y-3">
                  <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto" />
                  <p className="text-xs font-semibold text-foreground">Document File Preview</p>
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Open / Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDigitalContractModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setShowDigitalContractModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <h3 className="text-sm font-bold text-foreground">Official Digital Lease Contract</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDigitalContractModal(false)}
                  className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Close contract modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loadingDigitalContract ? (
              <div className="py-16 text-center text-muted-foreground text-xs animate-pulse">
                Loading contract data and legal clauses…
              </div>
            ) : digitalContractError && !digitalContractData ? (
              <div className="py-16 text-center space-y-3">
                <p className="text-xs text-red-600 dark:text-red-400 max-w-sm mx-auto">{digitalContractError}</p>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenDigitalContract(
                      activeDigitalContract ||
                        selectedContractOverride ||
                        dedicatedContract ||
                        (allTenantContracts.length > 0 ? allTenantContracts[0] : null),
                    )
                  }
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Try again
                </button>
              </div>
            ) : (
              <DigitalContractPaper
                stayData={digitalContractData}
                contract={
                  activeDigitalContract ||
                  selectedContractOverride ||
                  dedicatedContract ||
                  (allTenantContracts.length > 0 ? allTenantContracts[0] : null)
                }
                onDownloadPdf={() =>
                  handleDownloadStayProof(
                    activeDigitalContract ||
                      selectedContractOverride ||
                      dedicatedContract ||
                      (allTenantContracts.length > 0 ? allTenantContracts[0] : null),
                  )
                }
                isDownloading={downloadingProof}
                fetchDocumentPdf={(c) => (c?.finalDocument
                  ? contractApi.getFinalContractFile(c._id || c.id, false)
                  : contractApi.getPreparedContractFile(c._id || c.id))}
                // Signed scan resolves from the CANONICAL identity the backend
                // returned (signedScan.contractId — may be an ancestor lease
                // for a Room Transfer Addendum), via the ADMIN signed-file route.
                fetchSignedDoc={({ contractId, version, download }) =>
                  contractApi.getSignedContractFile(contractId, version, Boolean(download))}
              />
            )}
          </div>
        </div>
      )}

      {recordViolationOpen && (
        <RecordViolationModal
          isOpen={recordViolationOpen}
          onClose={() => setRecordViolationOpen(false)}
          onSuccess={() => {
            fetchTenantViolations();
            queryClient.invalidateQueries(["tenantWorkspaceDetail", reservationId]);
          }}
          branch={tenant?.branch}
          preselectedTenant={tenant}
        />
      )}

      {selectedViolationForDetail && (
        <ViolationDetailModal
          isOpen={!!selectedViolationForDetail}
          onClose={() => setSelectedViolationForDetail(null)}
          violation={selectedViolationForDetail}
          onUpdate={() => {
            fetchTenantViolations();
            setSelectedViolationForDetail(null);
            queryClient.invalidateQueries(["tenantWorkspaceDetail", reservationId]);
          }}
        />
      )}
    </div>,
    document.body
  );
}
