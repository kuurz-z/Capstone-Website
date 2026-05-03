import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Home,
  LoaderCircle,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { billingApi } from "../../../../shared/api/apiClient";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { showConfirmation, showNotification } from "../../../../shared/utils/notification";
import { fmtCurrency, fmtDate, fmtMonth, formatBranch, formatRoomType } from "../../utils/formatters";

const OWNER_ROLES = new Set(["owner", "superadmin"]);
const ROOMS_PER_PAGE = 10;

const BRANCH_OPTIONS = [
  { value: "", label: "All" },
  { value: "gil-puyat", label: "Gil-Puyat" },
  { value: "guadalupe", label: "Guadalupe" },
];

const ROOM_STATUS_LABELS = {
  no_active: "No Active Rent Bill",
  ready: "Ready to Generate",
  generated: "Generated",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

const TENANT_STATUS_LABELS = {
  ready: "Ready",
  generated: "Generated",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  partially_paid: "Partially paid",
  missing_data: "Missing data",
  already_billed: "Duplicate bill",
};

const getCurrentMonthInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getBillingMonthDate = (month) => (month ? `${month}-01` : new Date());

const getId = (value) => String(value?._id || value?.id || value || "");

const normalizeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCycle = (start, end) => {
  if (!start || !end) return "Missing cycle";
  return `${fmtDate(start)} - ${fmtDate(end)}`;
};

const buildPdfFilename = (bill) =>
  `${bill?.billReference || bill?.id || "rent-bill"}.pdf`;

const getRoomName = (room) =>
  room?.name || room?.roomName || room?.roomNumber || "Room";

const getBillDeliveryStatus = (bill) =>
  bill?.delivery?.email?.status ||
  bill?.delivery?.notification?.status ||
  (bill?.sentAt ? "sent" : "not_attempted");

const isBillSent = (bill) =>
  Boolean(
    bill?.sentAt ||
      bill?.delivery?.email?.status === "sent" ||
      bill?.delivery?.notification?.status === "sent",
  );

const getTenantBill = (tenant, billsById) => {
  const billId = getId(tenant?.currentMonthBill?.id || tenant?.currentMonthBill?._id);
  return billId ? billsById.get(billId) || tenant.currentMonthBill : null;
};

const getTenantStatus = (tenant, bill) => {
  if (!tenant?.currentMonthBill) {
    return tenant?.billStatus === "missing_data" ? "missing_data" : "ready";
  }

  const status = bill?.status || tenant.currentMonthBill?.status;
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  if (status === "partially-paid") return "partially_paid";
  if (isBillSent(bill)) return "sent";
  return "generated";
};

const pickSharedDateLabel = (tenants, picker) => {
  const values = [
    ...new Set(
      tenants
        .map(picker)
        .map((value) => {
          if (!value) return "";
          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
        })
        .filter(Boolean),
    ),
  ];
  if (values.length === 0) return "Missing";
  if (values.length > 1) return "Multiple cycles";
  return fmtDate(values[0]);
};

function PreviewModal({
  preview,
  isGenerating,
  isDownloading,
  onClose,
  onGenerate,
  onDownload,
}) {
  if (!preview) return null;

  const duplicateBill = preview.duplicateBill;
  const generateDisabled = isGenerating || Boolean(duplicateBill);

  return (
    <div className="rent-billing__modal-backdrop" role="presentation">
      <section className="rent-billing__modal" role="dialog" aria-modal="true" aria-labelledby="rent-preview-title">
        <div className="rent-billing__modal-header">
          <div>
            <span className="rent-billing__eyebrow">Bill Preview</span>
            <h3 id="rent-preview-title">Monthly Rent</h3>
          </div>
          <button type="button" onClick={onClose} disabled={isGenerating}>
            Close
          </button>
        </div>

        <div className="rent-billing__preview-grid">
          <div>
            <span>Tenant</span>
            <strong>{preview.tenant?.name || "Tenant"}</strong>
            <small>{preview.tenant?.email || ""}</small>
          </div>
          <div>
            <span>Room / Bed</span>
            <strong>{preview.room?.name || "Room"}</strong>
            <small>{preview.room?.bed || "No bed label"}</small>
          </div>
          <div>
            <span>Billing Period</span>
            <strong>{formatCycle(preview.billingPeriod?.start, preview.billingPeriod?.end)}</strong>
            <small>{formatBranch(preview.branch)}</small>
          </div>
          <div>
            <span>Due Date</span>
            <strong>{fmtDate(preview.dueDate)}</strong>
            <small>{preview.billReference}</small>
          </div>
        </div>

        <div className="rent-billing__breakdown">
          <div>
            <span>Monthly rent</span>
            <strong>{fmtCurrency(preview.charges?.rent || 0)}</strong>
          </div>
          <div>
            <span>Appliance fee</span>
            <strong>{fmtCurrency(preview.charges?.applianceFees || 0)}</strong>
          </div>
          <div>
            <span>Credit / advance applied</span>
            <strong>-{fmtCurrency(preview.creditApplied || 0)}</strong>
          </div>
          <div className="rent-billing__breakdown-total">
            <span>Total amount due</span>
            <strong>{fmtCurrency(preview.totalAmount || 0)}</strong>
          </div>
        </div>

        <div className="rent-billing__payment-note">
          Payment instructions are included in the tenant bill and billing history after generation.
        </div>

        {duplicateBill && (
          <div className="rent-billing__notice rent-billing__notice--warning">
            <AlertCircle size={15} />
            Duplicate bill already exists.
          </div>
        )}

        <div className="rent-billing__modal-actions">
          {duplicateBill && (
            <button
              type="button"
              onClick={() => onDownload(duplicateBill)}
              disabled={isDownloading === String(duplicateBill.id)}
            >
              {isDownloading === String(duplicateBill.id) ? (
                <LoaderCircle size={14} className="rent-billing__spin" />
              ) : (
                <Download size={14} />
              )}
              Download PDF
            </button>
          )}
          <button
            type="button"
            className="rent-billing__primary"
            onClick={onGenerate}
            disabled={generateDisabled}
          >
            {isGenerating ? (
              <LoaderCircle size={14} className="rent-billing__spin" />
            ) : (
              <Send size={14} />
            )}
            {isGenerating ? "Generating..." : "Generate & Send Bill"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function RentBillingTab({ isActive }) {
  const { user } = useAuth();
  const isOwner = OWNER_ROLES.has(user?.role);
  const [branch, setBranch] = useState(isOwner ? "" : user?.branch || "");
  const [month, setMonth] = useState(getCurrentMonthInput());
  const [dueDate, setDueDate] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [roomsPage, setRoomsPage] = useState(1);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [bills, setBills] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [batchAction, setBatchAction] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewTenant, setPreviewTenant] = useState(null);

  const branchParam = branch || undefined;
  const canLoad = isOwner || Boolean(branch);

  const loadData = useCallback(async () => {
    if (!canLoad || !isActive) return;

    setLoading(true);
    try {
      const [roomData, tenantData, billData] = await Promise.all([
        billingApi.getRoomsWithTenants(branchParam),
        billingApi.getRentBillableTenants({ branch: branchParam, month }),
        billingApi.getRentBills({ branch: branchParam, month, limit: 500 }),
      ]);
      const nextTenants = tenantData?.tenants || [];

      setRooms(roomData?.rooms || []);
      setTenants(nextTenants);
      setBills(billData?.bills || []);
      setAmounts((current) => {
        const next = { ...current };
        nextTenants.forEach((tenant) => {
          const key = getId(tenant.reservationId);
          if (next[key] == null) next[key] = tenant.monthlyRent || "";
        });
        return next;
      });
    } catch (error) {
      showNotification(error?.message || "Failed to load rent billing.", "error");
    } finally {
      setLoading(false);
    }
  }, [branchParam, canLoad, isActive, month]);

  useEffect(() => {
    if (isActive) loadData();
  }, [isActive, loadData]);

  const billsById = useMemo(
    () => new Map(bills.map((bill) => [getId(bill.id || bill._id), bill])),
    [bills],
  );

  const roomRows = useMemo(() => {
    const roomMap = new Map();
    rooms.forEach((room) => {
      const roomId = getId(room.id || room._id);
      roomMap.set(roomId, {
        ...room,
        id: roomId,
        rentTenants: [],
      });
    });

    tenants.forEach((tenant) => {
      const roomId = getId(tenant.roomId);
      if (!roomId) return;
      if (!roomMap.has(roomId)) {
        roomMap.set(roomId, {
          id: roomId,
          name: tenant.roomName,
          roomName: tenant.roomName,
          roomNumber: tenant.roomNumber || tenant.roomName,
          branch: tenant.branch,
          type: tenant.roomType,
          capacity: tenant.roomCapacity,
          tenantCount: 0,
          rentTenants: [],
        });
      }

      const row = roomMap.get(roomId);
      row.rentTenants.push({
        ...tenant,
        currentBill: getTenantBill(tenant, billsById),
      });
    });

    return [...roomMap.values()]
      .map((room) => {
        const activeTenants = room.rentTenants || [];
        const generated = activeTenants.filter((tenant) => tenant.currentMonthBill);
        const ready = activeTenants.filter(
          (tenant) =>
            !tenant.currentMonthBill &&
            tenant.billStatus === "ready" &&
            normalizeAmount(amounts[getId(tenant.reservationId)] ?? tenant.monthlyRent) > 0,
        );
        const hasOverdue = generated.some((tenant) => {
          const bill = tenant.currentBill;
          return (bill?.status || tenant.currentMonthBill?.status) === "overdue";
        });
        const allGenerated =
          activeTenants.length > 0 && generated.length === activeTenants.length;
        const allPaid =
          allGenerated &&
          generated.every((tenant) => {
            const bill = tenant.currentBill;
            return (bill?.status || tenant.currentMonthBill?.status) === "paid";
          });
        const allSent =
          allGenerated &&
          generated.every((tenant) => isBillSent(tenant.currentBill));

        let rentStatus = "no_active";
        if (hasOverdue) rentStatus = "overdue";
        else if (allPaid) rentStatus = "paid";
        else if (allSent) rentStatus = "sent";
        else if (allGenerated) rentStatus = "generated";
        else if (ready.length > 0 || activeTenants.length > 0) rentStatus = "ready";

        return {
          ...room,
          activeTenantCount: activeTenants.length,
          rentStatus,
          rentStatusLabel: ROOM_STATUS_LABELS[rentStatus],
        };
      })
      .sort((left, right) => {
        const branchCompare = String(left.branch || "").localeCompare(String(right.branch || ""));
        if (branchCompare) return branchCompare;
        return getRoomName(left).localeCompare(getRoomName(right), undefined, { numeric: true });
      });
  }, [amounts, billsById, rooms, tenants]);

  const filteredRooms = useMemo(() => {
    const search = sidebarSearch.trim().toLowerCase();
    if (!search) return roomRows;
    return roomRows.filter((room) => {
      const tenantText = (room.rentTenants || [])
        .map((tenant) => `${tenant.tenantName} ${tenant.email} ${tenant.bedPosition}`)
        .join(" ");
      return [
        getRoomName(room),
        room.roomNumber,
        room.branch,
        room.type,
        room.rentStatusLabel,
        tenantText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [roomRows, sidebarSearch]);

  const totalRoomPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  const pagedRooms = filteredRooms.slice(
    (roomsPage - 1) * ROOMS_PER_PAGE,
    roomsPage * ROOMS_PER_PAGE,
  );

  useEffect(() => {
    if (roomsPage > totalRoomPages) setRoomsPage(totalRoomPages);
  }, [roomsPage, totalRoomPages]);

  useEffect(() => {
    if (loading || roomRows.length === 0) return;
    if (!selectedRoomId || !roomRows.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(roomRows[0].id);
    }
  }, [loading, roomRows, selectedRoomId]);

  const selectedRoom = roomRows.find((room) => room.id === selectedRoomId) || null;
  const selectedTenants = selectedRoom?.rentTenants || [];

  const selectedSummary = useMemo(() => {
    const alreadyBilled = selectedTenants.filter((tenant) => tenant.currentMonthBill);
    const generatedBills = alreadyBilled
      .map((tenant) => getTenantBill(tenant, billsById))
      .filter(Boolean);
    const readyTenants = selectedTenants.filter((tenant) => {
      const amount = normalizeAmount(amounts[getId(tenant.reservationId)] ?? tenant.monthlyRent);
      return (
        !tenant.currentMonthBill &&
        tenant.billStatus === "ready" &&
        amount > 0 &&
        (dueDate || tenant.dueDate || tenant.billingCycle?.dueDate)
      );
    });
    const missingData = selectedTenants.filter((tenant) => {
      const amount = normalizeAmount(amounts[getId(tenant.reservationId)] ?? tenant.monthlyRent);
      return (
        !tenant.currentMonthBill &&
        (tenant.billStatus !== "ready" ||
          amount <= 0 ||
          !(dueDate || tenant.dueDate || tenant.billingCycle?.dueDate))
      );
    });
    const totalExpectedAmount = readyTenants.reduce(
      (sum, tenant) => sum + normalizeAmount(amounts[getId(tenant.reservationId)] ?? tenant.monthlyRent),
      0,
    );
    const outstandingBalance = generatedBills.reduce(
      (sum, bill) => sum + (bill.status === "paid" ? 0 : Number(bill.remainingAmount ?? bill.totalAmount ?? 0)),
      0,
    );

    return {
      totalTenants: selectedTenants.length,
      alreadyBilled: alreadyBilled.length,
      generatedBills,
      readyTenants,
      readyToGenerate: readyTenants.length,
      missingData: missingData.length,
      totalExpectedAmount,
      outstandingBalance,
      unsentBills: generatedBills.filter((bill) => !isBillSent(bill)),
      downloadableBills: generatedBills,
    };
  }, [amounts, billsById, dueDate, selectedTenants]);

  const formError = useMemo(() => {
    if (!canLoad) return "Branch is required.";
    if (!month) return "Billing month is required.";
    return "";
  }, [canLoad, month]);

  const buildPayload = (tenant) => {
    const reservationId = getId(tenant.reservationId);
    return {
      reservationId,
      branch: tenant.branch || selectedRoom?.branch || branch,
      billingMonth: month,
      rentAmount: normalizeAmount(amounts[reservationId] ?? tenant.monthlyRent),
      ...(dueDate ? { dueDate } : {}),
    };
  };

  const validateTenantAction = (tenant, { allowExisting = false } = {}) => {
    if (formError) return formError;
    if (!tenant) return "No active tenant found.";
    if (!month) return "Billing month is required.";
    if (!dueDate && !tenant.dueDate && !tenant.billingCycle?.dueDate) {
      return "Due date required.";
    }
    if (!allowExisting && tenant.currentMonthBill) {
      return "Duplicate bill already exists.";
    }
    if (tenant.billStatus === "missing_data") {
      const message = tenant.validationErrors?.[0] || "Missing tenant billing data.";
      if (message.toLowerCase().includes("rent")) return "Missing rent amount.";
      if (message.toLowerCase().includes("active")) return "No active tenant found.";
      return message;
    }
    if (normalizeAmount(amounts[getId(tenant.reservationId)] ?? tenant.monthlyRent) <= 0) {
      return "Missing rent amount.";
    }
    return "";
  };

  const handlePreview = async (tenant) => {
    const validationError = validateTenantAction(tenant, { allowExisting: true });
    if (validationError) {
      showNotification(validationError, "error");
      return;
    }

    const reservationId = getId(tenant.reservationId);
    setPreviewLoadingId(reservationId);
    try {
      const result = await billingApi.previewRentBill(buildPayload(tenant));
      setPreview(result?.preview || null);
      setPreviewTenant(tenant);
      if (result?.preview?.duplicateBill) {
        showNotification("Duplicate bill already exists.", "warning");
      }
    } catch (error) {
      showNotification(error?.message || "Failed to preview rent bill.", "error");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleGenerate = async (tenant, { skipConfirm = false } = {}) => {
    const validationError = validateTenantAction(tenant);
    if (validationError) {
      showNotification(validationError, validationError.includes("Duplicate") ? "warning" : "error");
      return;
    }

    if (!skipConfirm) {
      const confirmed = await showConfirmation(
        `Generate and send a Monthly Rent bill for ${tenant.tenantName} in ${getRoomName(selectedRoom)} for ${fmtMonth(getBillingMonthDate(month))}?`,
        "Generate",
        "Cancel",
      );
      if (!confirmed) return;
    }

    const reservationId = getId(tenant.reservationId);
    setGeneratingId(reservationId);
    try {
      const result = await billingApi.generateRentBill(buildPayload(tenant));
      if (result?.warning) {
        showNotification("Bill created, but email failed.", "warning");
      } else {
        showNotification("Rent bill generated successfully.", "success");
      }
      setPreview(null);
      setPreviewTenant(null);
      await loadData();
    } catch (error) {
      const message = error?.message || "Failed to generate rent bill.";
      showNotification(
        message.toLowerCase().includes("duplicate")
          ? "Duplicate bill already exists."
          : message,
        message.toLowerCase().includes("duplicate") ? "warning" : "error",
      );
    } finally {
      setGeneratingId(null);
    }
  };

  const handleSendBill = async (bill) => {
    const billId = getId(bill?.id || bill?._id);
    if (!billId) {
      showNotification("No generated rent bill found.", "error");
      return;
    }

    setSendingId(billId);
    try {
      const result = await billingApi.sendRentBill(billId);
      if (result?.warning) {
        showNotification("Bill created, but email failed.", "warning");
      } else {
        showNotification("Bill sent successfully.", "success");
      }
      await loadData();
    } catch (error) {
      showNotification(error?.message || "Failed to send rent bill.", "error");
    } finally {
      setSendingId(null);
    }
  };

  const handleDownloadPdf = async (bill) => {
    const billId = getId(bill?.id || bill?._id);
    if (!billId) {
      showNotification("No generated rent bill found.", "error");
      return;
    }

    setDownloadingId(billId);
    try {
      await billingApi.downloadBillPdf(billId, buildPdfFilename(bill));
      showNotification("PDF downloaded successfully.", "success");
      await loadData();
    } catch (error) {
      showNotification(error?.message || "Failed to download PDF.", "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleBatchGenerate = async () => {
    if (!selectedRoom) {
      showNotification("Select a room first.", "error");
      return;
    }
    if (formError) {
      showNotification(formError, "error");
      return;
    }
    if (selectedSummary.totalTenants === 0) {
      showNotification("No active tenant found.", "error");
      return;
    }
    if (selectedSummary.readyToGenerate <= 0) {
      showNotification(
        selectedSummary.alreadyBilled > 0
          ? "Some tenants already have bills for this cycle."
          : "Missing rent amount.",
        selectedSummary.alreadyBilled > 0 ? "warning" : "error",
      );
      return;
    }

    const confirmed = await showConfirmation(
      `Generate rent bills for ${getRoomName(selectedRoom)}? Tenants: ${selectedSummary.totalTenants}. Already billed: ${selectedSummary.alreadyBilled}. Ready to generate: ${selectedSummary.readyToGenerate}. Missing data: ${selectedSummary.missingData}. Total expected amount: ${fmtCurrency(selectedSummary.totalExpectedAmount)}.`,
      "Generate All",
      "Cancel",
    );
    if (!confirmed) return;

    setBatchAction("generate");
    let generated = 0;
    let duplicates = 0;
    let warnings = 0;
    let failures = 0;

    try {
      for (const tenant of selectedSummary.readyTenants) {
        try {
          const result = await billingApi.generateRentBill(buildPayload(tenant));
          generated += 1;
          if (result?.warning) warnings += 1;
        } catch (error) {
          if ((error?.message || "").toLowerCase().includes("duplicate")) {
            duplicates += 1;
          } else {
            failures += 1;
          }
        }
      }

      if (generated > 0) {
        showNotification("Rent bills generated for this room.", "success");
      }
      if (duplicates > 0 || selectedSummary.alreadyBilled > 0) {
        showNotification("Some tenants already have bills for this cycle.", "warning");
      }
      if (warnings > 0) {
        showNotification("Bill created, but email failed.", "warning");
      }
      if (failures > 0) {
        showNotification("Some rent bills could not be generated.", "error");
      }
      await loadData();
    } finally {
      setBatchAction("");
    }
  };

  const handleBatchSend = async () => {
    if (!selectedRoom) {
      showNotification("Select a room first.", "error");
      return;
    }
    if (selectedSummary.generatedBills.length === 0) {
      showNotification("No generated rent bill found.", "error");
      return;
    }

    const confirmed = await showConfirmation(
      `Send generated rent bills for ${getRoomName(selectedRoom)}? Generated bills: ${selectedSummary.generatedBills.length}. Already sent: ${selectedSummary.generatedBills.length - selectedSummary.unsentBills.length}.`,
      "Send All",
      "Cancel",
    );
    if (!confirmed) return;

    setBatchAction("send");
    let sent = 0;
    let warnings = 0;
    let failures = 0;

    try {
      for (const bill of selectedSummary.generatedBills) {
        try {
          const result = await billingApi.sendRentBill(getId(bill.id || bill._id));
          sent += 1;
          if (result?.warning) warnings += 1;
        } catch {
          failures += 1;
        }
      }

      if (sent > 0) showNotification("Bill sent successfully.", "success");
      if (warnings > 0) showNotification("Bill created, but email failed.", "warning");
      if (failures > 0) showNotification("Some rent bills could not be sent.", "error");
      await loadData();
    } finally {
      setBatchAction("");
    }
  };

  const handleBatchDownload = async () => {
    if (selectedSummary.downloadableBills.length === 0) {
      showNotification("No generated rent bill found.", "error");
      return;
    }

    const confirmed = await showConfirmation(
      `Download generated rent bill PDFs for ${getRoomName(selectedRoom)}? PDFs available: ${selectedSummary.downloadableBills.length}.`,
      "Download PDFs",
      "Cancel",
    );
    if (!confirmed) return;

    setBatchAction("download");
    let downloaded = 0;
    let failed = 0;

    try {
      for (const bill of selectedSummary.downloadableBills) {
        try {
          await billingApi.downloadBillPdf(getId(bill.id || bill._id), buildPdfFilename(bill));
          downloaded += 1;
        } catch {
          failed += 1;
        }
      }

      if (downloaded > 0) showNotification("PDF downloaded successfully.", "success");
      if (failed > 0) showNotification("Some PDFs could not be downloaded.", "error");
      await loadData();
    } finally {
      setBatchAction("");
    }
  };

  const renderCyclePanel = () => (
    <section className="rent-billing__cycle-panel">
      <div className="rent-billing__cycle-panel-header">
        <div>
          <h3>Rent Billing Cycle</h3>
          <p>Review the selected month and tenant cycle dates before generation.</p>
        </div>
        <button type="button" className="eb-btn eb-btn--ghost" onClick={loadData} disabled={loading}>
          <RefreshCw size={13} className={loading ? "rent-billing__spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="rent-billing__cycle-controls">
        <label className="eb-field">
          <span>Billing Month</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <label className="eb-field">
          <span>Due Date Override</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
      </div>

      <div className="rent-billing__cycle-grid">
        <div>
          <span>Billing month</span>
          <strong>{fmtMonth(getBillingMonthDate(month))}</strong>
        </div>
        <div>
          <span>Cycle start</span>
          <strong>{pickSharedDateLabel(selectedTenants, (tenant) => tenant.billingCycleStart)}</strong>
        </div>
        <div>
          <span>Cycle end</span>
          <strong>{pickSharedDateLabel(selectedTenants, (tenant) => tenant.billingCycleEnd)}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>
            {dueDate
              ? `${fmtDate(dueDate)} override`
              : pickSharedDateLabel(selectedTenants, (tenant) => tenant.dueDate || tenant.billingCycle?.dueDate)}
          </strong>
        </div>
        <div>
          <span>Generation date</span>
          <strong>{pickSharedDateLabel(selectedTenants, (tenant) => tenant.nextBillingDate || tenant.billingCycle?.generationDate)}</strong>
        </div>
      </div>

      {selectedSummary.alreadyBilled > 0 && (
        <div className="rent-billing__notice rent-billing__notice--warning">
          <AlertCircle size={15} />
          Some tenants already have bills for this cycle.
        </div>
      )}
    </section>
  );

  return (
    <section className="eb-shell rent-billing rent-billing--workspace" aria-label="Rent billing workspace">
      {formError && (
        <div className="rent-billing__notice">
          <AlertCircle size={15} />
          {formError}
        </div>
      )}

      <div className="eb-layout">
        <aside className="eb-sidebar">
          <div className="eb-sidebar__header">
            <span className="eb-sidebar__title">
              <Home size={13} /> Rooms
            </span>
            {isOwner && (
              <select
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value);
                  setSelectedRoomId(null);
                  setRoomsPage(1);
                }}
                className="eb-sidebar__filter"
              >
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="eb-sidebar__search-wrap">
            <input
              type="text"
              className="eb-sidebar__search"
              placeholder="Search rooms..."
              value={sidebarSearch}
              onChange={(event) => {
                setSidebarSearch(event.target.value);
                setRoomsPage(1);
              }}
              aria-label="Search rooms"
            />
          </div>

          <div className="eb-sidebar__list">
            {loading && roomRows.length === 0 ? (
              <div className="eb-skeleton-list">
                {[1, 2, 3, 4, 5].map((index) => (
                  <div key={index} className="eb-skeleton-card" />
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="eb-sidebar__empty">
                {sidebarSearch ? "No rooms match your search" : "No rooms found"}
              </div>
            ) : (
              pagedRooms.map((room) => (
                <button
                  key={room.id}
                  className={`eb-room${selectedRoomId === room.id ? " eb-room--active" : ""}`}
                  aria-pressed={selectedRoomId === room.id}
                  aria-label={`Select ${getRoomName(room)}`}
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  <div className="eb-room__top-row">
                    <span className="eb-room__name">{getRoomName(room)}</span>
                    <span
                      className={`eb-room__dot${room.activeTenantCount > 0 ? " eb-room__dot--active" : ""}`}
                      title={`${room.activeTenantCount} active tenant${room.activeTenantCount === 1 ? "" : "s"}`}
                    />
                  </div>
                  <div className="eb-room__bottom-row">
                    <span className={`eb-room__badge eb-room__badge--rent-${room.rentStatus}`}>
                      {room.rentStatusLabel}
                    </span>
                  </div>
                  <div className="eb-room__kwh">
                    {formatBranch(room.branch)} · {room.activeTenantCount} active
                  </div>
                </button>
              ))
            )}
          </div>

          {filteredRooms.length > ROOMS_PER_PAGE && (
            <div className="eb-sidebar__pager">
              <span className="eb-sidebar__pager-count">
                {filteredRooms.length} rooms
              </span>
              <div className="eb-room-pager">
                <button
                  className="eb-room-pager__btn"
                  disabled={roomsPage <= 1}
                  onClick={() => setRoomsPage((page) => page - 1)}
                  aria-label="Previous room page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="eb-room-pager__label">
                  {roomsPage}/{totalRoomPages}
                </span>
                <button
                  className="eb-room-pager__btn"
                  disabled={roomsPage >= totalRoomPages}
                  onClick={() => setRoomsPage((page) => page + 1)}
                  aria-label="Next room page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </aside>

        <main className="eb-main">
          {!selectedRoom ? (
            <div className="eb-empty-state">
              <Home size={40} strokeWidth={1.5} />
              <p className="eb-empty-state__title">Select a room to continue</p>
              <p className="eb-empty-state__hint">
                Pick a room to manage monthly rent bills by tenant and bed.
              </p>
            </div>
          ) : (
            <div className="eb-content">
              <div className="eb-header">
                <div className="eb-header__left">
                  <div className="eb-header__meta">
                    <h2 className="eb-header__title">{getRoomName(selectedRoom)}</h2>
                    <p className="eb-header__subtitle">
                      Manage rent previews, generation, sending, and PDFs for this room.
                    </p>
                  </div>
                  <span className="eb-header__branch">{formatBranch(selectedRoom.branch)}</span>
                  <span className="eb-header__room-type">
                    {formatRoomType(selectedRoom.type)}
                  </span>
                </div>
                <div className="eb-header__actions">
                  <span className={`rent-billing__room-status rent-billing__room-status--${selectedRoom.rentStatus}`}>
                    {selectedRoom.rentStatusLabel}
                  </span>
                </div>
              </div>

              <section className="eb-snapshot-card rent-billing__room-snapshot">
                <div className="eb-snapshot-card__header">
                  <div>
                    <h3 className="eb-snapshot-card__title">Room Occupancy</h3>
                    <p className="eb-snapshot-card__cycle">
                      {selectedRoom.activeTenantCount} active tenant{selectedRoom.activeTenantCount === 1 ? "" : "s"}
                      {selectedRoom.capacity ? ` / ${selectedRoom.capacity} beds` : ""}
                    </p>
                  </div>
                  <Users size={18} />
                </div>
                <div className="eb-snapshot-card__metrics">
                  <div className="eb-snapshot-metric">
                    <span className="eb-snapshot-metric__label">Ready</span>
                    <span className="eb-snapshot-metric__value">{selectedSummary.readyToGenerate}</span>
                  </div>
                  <div className="eb-snapshot-metric">
                    <span className="eb-snapshot-metric__label">Already billed</span>
                    <span className="eb-snapshot-metric__value">{selectedSummary.alreadyBilled}</span>
                  </div>
                  <div className="eb-snapshot-metric">
                    <span className="eb-snapshot-metric__label">Outstanding</span>
                    <span className="eb-snapshot-metric__value eb-snapshot-metric__value--strong">
                      {fmtCurrency(selectedSummary.outstandingBalance)}
                    </span>
                  </div>
                </div>
              </section>

              {renderCyclePanel()}

              <section className="rent-billing__batch-bar">
                <div>
                  <span>Selected room</span>
                  <strong>{getRoomName(selectedRoom)}</strong>
                </div>
                <div>
                  <span>Missing data</span>
                  <strong>{selectedSummary.missingData}</strong>
                </div>
                <div>
                  <span>Total expected</span>
                  <strong>{fmtCurrency(selectedSummary.totalExpectedAmount)}</strong>
                </div>
                <div className="rent-billing__batch-actions">
                  <button
                    type="button"
                    className="eb-btn eb-btn--primary"
                    onClick={handleBatchGenerate}
                    disabled={Boolean(batchAction) || selectedSummary.readyToGenerate <= 0}
                  >
                    {batchAction === "generate" ? (
                      <LoaderCircle size={13} className="rent-billing__spin" />
                    ) : (
                      <FileText size={13} />
                    )}
                    Generate Room Bills
                  </button>
                  <button
                    type="button"
                    className="eb-btn eb-btn--outline"
                    onClick={handleBatchSend}
                    disabled={Boolean(batchAction) || selectedSummary.generatedBills.length === 0}
                  >
                    {batchAction === "send" ? (
                      <LoaderCircle size={13} className="rent-billing__spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    Send Generated
                  </button>
                  <button
                    type="button"
                    className="eb-btn eb-btn--ghost"
                    onClick={handleBatchDownload}
                    disabled={Boolean(batchAction) || selectedSummary.downloadableBills.length === 0}
                  >
                    {batchAction === "download" ? (
                      <LoaderCircle size={13} className="rent-billing__spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    Download PDFs
                  </button>
                </div>
              </section>

              <section className="eb-section rent-billing__tenant-section">
                <div className="eb-section__header">
                  <div>
                    <h3 className="eb-section__title">Tenant Rent Billing</h3>
                    <p className="eb-section__hint">
                      Active tenants and bed assignments for the selected room.
                    </p>
                  </div>
                  <span className="eb-section__count eb-section__count--inline">
                    {selectedTenants.length} tenant{selectedTenants.length === 1 ? "" : "s"}
                  </span>
                </div>

                {selectedTenants.length === 0 ? (
                  <div className="rent-billing__empty">No active tenant found.</div>
                ) : (
                  <div className="rent-billing__table-wrap">
                    <table className="rent-billing__table rent-billing__table--room">
                      <thead>
                        <tr>
                          <th>Tenant</th>
                          <th>Bed / Room</th>
                          <th>Move-in</th>
                          <th>Monthly Rent</th>
                          <th>Billing Cycle</th>
                          <th>Next Due</th>
                          <th>Status</th>
                          <th>Outstanding</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTenants.map((tenant) => {
                          const reservationId = getId(tenant.reservationId);
                          const amount = amounts[reservationId] ?? tenant.monthlyRent ?? "";
                          const amountInvalid = normalizeAmount(amount) <= 0;
                          const bill = getTenantBill(tenant, billsById);
                          const billId = getId(bill?.id || bill?._id);
                          const tenantStatus = getTenantStatus(tenant, bill);
                          const rowBusy =
                            previewLoadingId === reservationId ||
                            generatingId === reservationId ||
                            sendingId === billId ||
                            downloadingId === billId ||
                            Boolean(batchAction);

                          return (
                            <tr key={reservationId}>
                              <td>
                                <strong>{tenant.tenantName}</strong>
                                <span>{tenant.email}</span>
                              </td>
                              <td>
                                <strong>{tenant.bedPosition || "No bed label"}</strong>
                                <span>{tenant.roomName || getRoomName(selectedRoom)}</span>
                              </td>
                              <td>{tenant.moveInDate ? fmtDate(tenant.moveInDate) : "Missing"}</td>
                              <td>
                                <label className="rent-billing__amount rent-billing__amount--inline">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={amount}
                                    onChange={(event) =>
                                      setAmounts((current) => ({
                                        ...current,
                                        [reservationId]: event.target.value,
                                      }))
                                    }
                                    aria-invalid={amountInvalid}
                                  />
                                  {amountInvalid && <em>Missing rent amount.</em>}
                                </label>
                              </td>
                              <td>{formatCycle(tenant.billingCycleStart, tenant.billingCycleEnd)}</td>
                              <td>{fmtDate(dueDate || tenant.dueDate || tenant.billingCycle?.dueDate)}</td>
                              <td>
                                <span className={`rent-billing__badge rent-billing__badge--${tenantStatus}`}>
                                  {TENANT_STATUS_LABELS[tenantStatus] || tenantStatus}
                                </span>
                              </td>
                              <td>
                                {bill
                                  ? fmtCurrency(bill.status === "paid" ? 0 : bill.remainingAmount ?? bill.totalAmount ?? 0)
                                  : fmtCurrency(0)}
                              </td>
                              <td>
                                <div className="rent-billing__actions">
                                  <button
                                    type="button"
                                    onClick={() => handlePreview(tenant)}
                                    disabled={rowBusy || amountInvalid}
                                  >
                                    {previewLoadingId === reservationId ? (
                                      <LoaderCircle size={14} className="rent-billing__spin" />
                                    ) : (
                                      <Eye size={14} />
                                    )}
                                    Preview
                                  </button>
                                  {!bill && (
                                    <button
                                      type="button"
                                      className="rent-billing__primary"
                                      onClick={() => handleGenerate(tenant)}
                                      disabled={
                                        rowBusy ||
                                        amountInvalid ||
                                        tenant.billStatus === "missing_data" ||
                                        Boolean(formError)
                                      }
                                    >
                                      {generatingId === reservationId ? (
                                        <LoaderCircle size={14} className="rent-billing__spin" />
                                      ) : (
                                        <FileText size={14} />
                                      )}
                                      Generate
                                    </button>
                                  )}
                                  {bill && bill.status !== "paid" && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendBill(bill)}
                                      disabled={rowBusy}
                                    >
                                      {sendingId === billId ? (
                                        <LoaderCircle size={14} className="rent-billing__spin" />
                                      ) : (
                                        <Send size={14} />
                                      )}
                                      Send
                                    </button>
                                  )}
                                  {bill && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadPdf(bill)}
                                      disabled={rowBusy}
                                    >
                                      {downloadingId === billId ? (
                                        <LoaderCircle size={14} className="rent-billing__spin" />
                                      ) : (
                                        <Download size={14} />
                                      )}
                                      PDF
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="eb-section">
                <div className="eb-section__header">
                  <div>
                    <h3 className="eb-section__title">
                      <CalendarDays size={13} /> Rent Bill History
                    </h3>
                    <p className="eb-section__hint">
                      Generated rent bills for the selected room and billing month.
                    </p>
                  </div>
                  <span className="eb-section__count eb-section__count--inline">
                    {selectedSummary.generatedBills.length} bill{selectedSummary.generatedBills.length === 1 ? "" : "s"}
                  </span>
                </div>
                {selectedSummary.generatedBills.length === 0 ? (
                  <p className="eb-empty-hint">No generated rent bills for this room yet.</p>
                ) : (
                  <div className="rent-billing__history-list">
                    {selectedSummary.generatedBills.map((bill) => (
                      <div className="rent-billing__history-row" key={getId(bill.id || bill._id)}>
                        <div>
                          <strong>{bill.tenant?.name || "Tenant"}</strong>
                          <span>{formatCycle(bill.billingCycleStart, bill.billingCycleEnd)}</span>
                        </div>
                        <span className={`rent-billing__delivery rent-billing__delivery--${getBillDeliveryStatus(bill)}`}>
                          {isBillSent(bill) ? "Sent" : getBillDeliveryStatus(bill) === "failed" ? "Email failed" : "Generated"}
                        </span>
                        <strong>{fmtCurrency(bill.totalAmount || 0)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      <PreviewModal
        preview={preview}
        isGenerating={Boolean(generatingId && previewTenant)}
        isDownloading={downloadingId}
        onClose={() => {
          if (!generatingId) {
            setPreview(null);
            setPreviewTenant(null);
          }
        }}
        onGenerate={() => previewTenant && handleGenerate(previewTenant, { skipConfirm: true })}
        onDownload={handleDownloadPdf}
      />
    </section>
  );
}
