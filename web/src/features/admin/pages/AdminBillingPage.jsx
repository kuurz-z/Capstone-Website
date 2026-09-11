import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import UtilityBillingTab from "../components/billing/UtilityBillingTab";
import RentBillingTab from "../components/billing/RentBillingTab";
import ReservationPaymentReviewTab from "../components/billing/ReservationPaymentReviewTab";

import BillingToolbar from "../components/billing/shared/BillingToolbar";
import OverdueEscalationTab from "../components/billing/OverdueEscalationTab";
import TenantViolationManager from "../components/TenantViolationManager";
import { billingApi } from "../../../shared/api/billingApi";
import { utilityApi } from "../../../shared/api/utilityApi";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import { exportReportPdf } from "../../../shared/utils/reportPdf";
import { showNotification } from "../../../shared/utils/notification";


// ── Column definitions per tab ──────────────────────────────────────────────

const UTILITY_COLUMNS = [
  { key: "room",        label: "Room" },
  { key: "branch",     label: "Branch" },
  { key: "tenant",     label: "Tenant" },
  { key: "period",     label: "Billing Period" },
  {
    key: "consumed",
    label: "Consumed",
    formatter: (v, row) => {
      if (v == null || v === "" || v === "-") return row.utilityType === "water" ? "Unknown (legacy)" : "-";
      if (!isNaN(v)) {
        return row.utilityType === "water" ? `${v} m³` : `${v} kWh`;
      }
      return String(v);
    },
  },
  {
    key: "amount",
    label: "Amount (PHP)",
    formatter: (v) => (v != null && !isNaN(v) ? `PHP ${Number(v).toFixed(2)}` : "PHP 0.00"),
  },
  { key: "status",     label: "Status" },
];

const RENT_COLUMNS = [
  { key: "tenantName",   label: "Tenant" },
  { key: "roomName",     label: "Room" },
  { key: "branch",       label: "Branch" },
  { key: "billingMonth", label: "Billing Month" },
  { key: "totalAmount",  label: "Total (PHP)",      formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "paidAmount",   label: "Paid (PHP)",       formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "status",       label: "Status" },
  { key: "dueDate",      label: "Due Date",        formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];

const RESERVATION_COLUMNS = [
  { key: "reservationCode", label: "Code" },
  { key: "tenantName",      label: "Tenant" },
  { key: "roomName",        label: "Room" },
  { key: "branch",          label: "Branch" },
  { key: "status",          label: "Status" },
  { key: "totalPrice",      label: "Total (PHP)",  formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "paidAmount",      label: "Paid (PHP)",   formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "createdAt",       label: "Date",        formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];

const OVERDUE_COLUMNS = [
  { key: "tenantName",  label: "Tenant" },
  { key: "roomName",    label: "Room" },
  { key: "branch",      label: "Branch" },
  { key: "totalAmount", label: "Bill Amount (PHP)", formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "paidAmount",  label: "Paid (PHP)",        formatter: (v) => `PHP ${Number(v || 0).toFixed(2)}` },
  { key: "noticeStage", label: "Notice Stage" },
  { key: "dueDate",     label: "Due Date",         formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];



const VIOLATION_COLUMNS = [
  { key: "tenantName",    label: "Tenant" },
  { key: "roomName",      label: "Room" },
  { key: "branch",        label: "Branch" },
  { key: "type",          label: "Violation Type" },
  { key: "severity",      label: "Severity" },
  { key: "description",   label: "Description" },
  { key: "status",        label: "Status" },
  { key: "createdAt",     label: "Date Logged", formatter: (v) => v ? new Date(v).toLocaleDateString("en-PH") : "" },
];

// ── Room label helper ───────────────────────────────────────────────────────

const extractRoomLabel = (item) => {
  if (!item) return "-";
  if (typeof item === "string") return item;
  return (
    item.roomName ||
    item.roomNumber ||
    item.name ||
    item.room_number ||
    (typeof item.roomId === "object" && item.roomId ? (item.roomId.name || item.roomId.roomNumber) : null) ||
    (typeof item.room === "object" && item.room ? (item.room.name || item.room.roomNumber) : null) ||
    (typeof item.reservationId?.roomId === "object" && item.reservationId?.roomId ? (item.reservationId.roomId.name || item.reservationId.roomId.roomNumber) : null) ||
    (typeof item.bill?.roomId === "object" && item.bill?.roomId ? (item.bill.roomId.name || item.bill.roomId.roomNumber) : null) ||
    (typeof item.bill?.room === "object" && item.bill?.room ? (item.bill.room.name || item.bill.room.roomNumber) : null) ||
    (typeof item.roomId === "string" ? item.roomId : null) ||
    "-"
  );
};

// ── Date Range Filter Helper ─────────────────────────────────────────────────

const filterRowsByDateRange = (rows, startDateStr, endDateStr) => {
  if (!startDateStr && !endDateStr) return rows;
  const start = startDateStr ? new Date(startDateStr + "T00:00:00") : null;
  const end = endDateStr ? new Date(endDateStr + "T23:59:59") : null;

  return rows.filter((row) => {
    const candidates = [
      row.rawStartDate,
      row.startDate,
      row.createdAt,
      row.dueDate,
      row.billingMonth,
      row.date,
      row.period,
    ].filter(Boolean);

    let rowDate = null;
    for (const cand of candidates) {
      const valStr = String(cand);
      const firstPart = valStr.includes(" to ") ? valStr.split(" to ")[0] : valStr;
      const parsed = new Date(firstPart);
      if (!isNaN(parsed.getTime())) {
        rowDate = parsed;
        break;
      }
    }

    if (!rowDate) return true;
    if (start && rowDate < start) return false;
    if (end && rowDate > end) return false;
    return true;
  });
};

// ── Preset Labels ─────────────────────────────────────────────────────────────

const PRESET_LABELS = {
  all: "All Time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "60d": "Last 60 days",
  "90d": "Last 90 days",
  "1y": "Last 1 year",
  "2y": "Last 2 years",
};

// ── Filename builder ─────────────────────────────────────────────────────────

const buildFilename = (tab, branch, preset) => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const branchSlug = branch ? `_${branch}` : "_all-branches";
  const presetSlug = preset && preset !== "all" ? `_${preset}` : "";
  return `lilycrest_${tab}${branchSlug}${presetSlug}_${ym}`;
};

// ── Row normalizer per tab ───────────────────────────────────────────────────



const normalizeUtilityRows = (data, utilityType = "electricity") => {
  const rooms = data?.rooms || data?.data?.rooms || [];
  const rows = [];
  for (const room of rooms) {
    const branch = room.branch || (typeof room.roomId === "object" ? room.roomId?.branch : null) || "-";
    if (String(branch).toLowerCase() === "guadalupe") continue;
    const period = room.activePeriod || room.latestPeriod || null;
    const amount = period?.totalAmount ?? period?.amount ?? period?.computedTotalCost ?? room.latestPeriodAmount ?? 0;
    const consumed = period?.totalConsumption ?? period?.consumption ?? (utilityType === "water" ? "Unknown (legacy)" : "-");
    rows.push({
      rawStartDate: period?.startDate,
      utilityType,
      room:     extractRoomLabel(room),
      branch:   branch,
      tenant:   room.currentTenant?.name || room.currentTenant?.firstName
                  ? `${room.currentTenant.firstName || ""} ${room.currentTenant.lastName || ""}`.trim()
                  : (room.activeTenantCount > 0 ? `${room.activeTenantCount} Tenant(s)` : "-"),
      period:   period?.label || (period?.startDate ? new Date(period.startDate).toLocaleDateString("en-PH") : (room.billingLabel || "-")),
      consumed: consumed,
      amount:   amount,
      status:   room.billingLabel || period?.billingState || period?.status || room.status || "-",
    });
  }
  return rows;
};

const normalizeRentRows = (data) => {
  const bills = data?.bills || data?.data || [];
  return bills.map((b) => ({
    rawStartDate: b.dueDate || b.billingMonth || b.createdAt,
    tenantName:   b.tenantName || `${b.tenant?.firstName || ""} ${b.tenant?.lastName || ""}`.trim() || "-",
    roomName:     extractRoomLabel(b),
    branch:       b.branch || b.room?.branch || b.roomId?.branch || "-",
    billingMonth: b.billingMonth || b.month || "-",
    totalAmount:  b.totalAmount,
    paidAmount:   b.paidAmount,
    status:       b.status || "-",
    dueDate:      b.dueDate,
  }));
};

const normalizeReservationRows = (data) => {
  const payments = data?.payments || data?.data || [];
  return payments.map((p) => ({
    rawStartDate: p.createdAt,
    reservationCode: p.reservationCode || p.reservationId?.reservationCode || "-",
    tenantName:      p.tenantName || `${p.tenant?.firstName || ""} ${p.tenant?.lastName || ""}`.trim() || "-",
    roomName:        extractRoomLabel(p),
    branch:          p.branch || p.reservationId?.roomId?.branch || p.roomId?.branch || "-",
    status:          p.status || "-",
    totalPrice:      p.totalPrice || p.reservationId?.totalPrice,
    paidAmount:      p.amount || p.paidAmount,
    createdAt:       p.createdAt,
  }));
};

const normalizeOverdueRows = (data) => {
  const notices = data?.notices || data?.data || [];
  return notices.map((n) => ({
    rawStartDate: n.dueDate || n.createdAt,
    tenantName:  n.tenantName || `${n.bill?.tenant?.firstName || ""} ${n.bill?.tenant?.lastName || ""}`.trim() || "-",
    roomName:    extractRoomLabel(n),
    branch:      n.branch || n.bill?.room?.branch || n.bill?.roomId?.branch || "-",
    totalAmount: n.totalAmount || n.bill?.totalAmount,
    paidAmount:  n.paidAmount  || n.bill?.paidAmount,
    noticeStage: n.noticeStage || n.stage || "-",
    dueDate:     n.dueDate     || n.bill?.dueDate,
  }));
};

const normalizeViolationRows = (data) => {
  const violations = Array.isArray(data) ? data : data?.violations || data?.data || [];
  return violations.map((v) => ({
    rawStartDate: v.dateOfIncident || v.createdAt,
    tenantName:  v.tenantName || `${v.tenantId?.firstName || ""} ${v.tenantId?.lastName || ""}`.trim() || "-",
    roomName:    v.roomName || extractRoomLabel(v),
    branch:      v.branch || v.room?.branch || v.roomId?.branch || "-",
    type:        v.violationType || v.type || "-",
    severity:    v.warningNumber ? `Warning #${v.warningNumber}` : "-",
    description: v.evidenceNotes || v.customViolationDescription || v.description || "-",
    status:      v.status || "-",
    createdAt:   v.dateOfIncident || v.createdAt,
  }));
};

// ── Page ─────────────────────────────────────────────────────────────────────

const AdminBillingPage = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [searchParams, setSearchParams] = useSearchParams();
  const [branchFilter, setBranchFilter] = useState("");
  const effectiveBranch = isOwner ? branchFilter : (user?.branch || "");
  
  const requestedTab = searchParams.get("tab");
  const defaultTab = user?.branch === "guadalupe" ? "rent" : "electricity";
  const [activeTab, setActiveTabState] = useState(() => requestedTab || defaultTab);

  const setActiveTab = useCallback(
    (nextTab) => {
      setActiveTabState(nextTab);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", nextTab);
      setSearchParams(nextParams, { replace: true, preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const tabInUrl = searchParams.get("tab");
    if (tabInUrl && tabInUrl !== activeTab) {
      setActiveTabState(tabInUrl);
    }
  }, [searchParams, activeTab]);

  const [preset, setPreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (effectiveBranch === "guadalupe" && (activeTab === "electricity" || activeTab === "water")) {
      setActiveTab("rent");
    }
  }, [effectiveBranch, activeTab, setActiveTab]);

  const handleBranchChange = useCallback((newBranch) => {
    setBranchFilter(newBranch);
    if (newBranch === "guadalupe" && (activeTab === "electricity" || activeTab === "water")) {
      setActiveTab("rent");
    }
  }, [activeTab, setActiveTab]);

  const handlePresetChange = useCallback((newPreset) => {
    setPreset(newPreset);
    const now = new Date();
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (newPreset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (newPreset === "7d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    } else if (newPreset === "30d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    } else if (newPreset === "60d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 60);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    } else if (newPreset === "90d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    } else if (newPreset === "1y") {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    } else if (newPreset === "2y") {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 2);
      setStartDate(formatDate(start));
      setEndDate(formatDate(now));
    }
  }, []);

  const handleClearDates = useCallback(() => {
    setPreset("all");
    setStartDate("");
    setEndDate("");
  }, []);

  const fetchCurrentTabData = useCallback(async () => {
    let rows = [];
    let columns = [];
    let title = "";
    let headers = [];

    const queryParams = {
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };

    if (activeTab === "electricity" || activeTab === "water") {
      title = activeTab === "electricity" ? "Electricity Billing" : "Water Billing";

      const exportData = await utilityApi.exportRows(activeTab, queryParams);
      let raw = exportData?.rows || exportData?.data || exportData || [];

      if (!Array.isArray(raw) || raw.length === 0) {
        const roomsData = await utilityApi.getRooms(activeTab, effectiveBranch);
        raw = normalizeUtilityRows(roomsData, activeTab);
      } else {
        raw = raw.map((r) => ({
          rawStartDate: r.startDate,
          utilityType: activeTab,
          room:     extractRoomLabel(r),
          branch:   r.branch     || "-",
          tenant:   r.tenantName || r.tenant || "-",
          period:   r.startDate && r.endDate ? `${r.startDate} to ${r.endDate}` : (r.period || r.billingPeriod || "-"),
          consumed: r.usage      ?? r.totalUsage ?? r.consumed ?? r.totalConsumption ?? (activeTab === "water" ? "Unknown (legacy)" : "-"),
          amount:   r.billAmount ?? r.amount     ?? r.totalAmount ?? r.totalRoomCost ?? r.computedTotalCost ?? r.waterCharge ?? r.electricityCharge ?? 0,
          status:   r.periodStatus || r.status || "-",
        }));
      }

      rows = raw;
      columns = UTILITY_COLUMNS;
      headers = ["Room", "Branch", "Tenant", "Billing Period", "Consumed", "Amount (PHP)", "Status"];
    } else if (activeTab === "rent") {
      title = "Rent Billing";
      const data = await billingApi.getRentBills(queryParams);
      rows = normalizeRentRows(data);
      columns = RENT_COLUMNS;
      headers = ["Tenant", "Room", "Branch", "Billing Month", "Total (PHP)", "Paid (PHP)", "Status", "Due Date"];
    } else if (activeTab === "reservation-payments") {
      title = "Reservation Payments";
      const data = await billingApi.getAdminPayments(queryParams);
      const payments = data?.payments || data?.data || [];
      rows = normalizeReservationRows({ payments });
      columns = RESERVATION_COLUMNS;
      headers = ["Code", "Tenant", "Room", "Branch", "Status", "Total (PHP)", "Paid (PHP)", "Date"];
    } else if (activeTab === "overdue-notices") {
      title = "Overdue Notices";
      const data = await billingApi.getOverdueNotices(queryParams);
      rows = normalizeOverdueRows(data);
      columns = OVERDUE_COLUMNS;
      headers = ["Tenant", "Room", "Branch", "Bill Amount (PHP)", "Paid (PHP)", "Notice Stage", "Due Date"];
    } else if (activeTab === "violations") {
      title = "Tenant Violations";
      const data = await billingApi.getViolations(queryParams);
      rows = normalizeViolationRows(data);
      columns = VIOLATION_COLUMNS;
      headers = ["Tenant", "Room", "Branch", "Type", "Severity", "Description", "Status", "Date Logged"];
    }

    // Apply client-side date range filter
    const filteredRows = filterRowsByDateRange(rows, startDate, endDate);

    return { rows: filteredRows, columns, title, headers };
  }, [activeTab, effectiveBranch, startDate, endDate]);

  const handleExportCsv = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { rows, columns } = await fetchCurrentTabData();
      if (!rows.length) {
        showNotification("No data available to export for the selected range and branch filter.", "info");
        return;
      }
      exportToCSV(rows, columns, buildFilename(activeTab, effectiveBranch, preset));
    } catch (err) {
      console.error("[BillingExport] CSV export failed:", err);
      showNotification("CSV export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [fetchCurrentTabData, activeTab, effectiveBranch, preset, isExporting]);

  const handleExportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { rows, columns, title, headers } = await fetchCurrentTabData();
      if (!rows.length) {
        showNotification("No data available to export for the selected range and branch filter.", "info");
        return;
      }

      const pdfRows = rows.map((r) => {
        const pdfObj = {};
        columns.forEach((col, idx) => {
          const headerName = headers[idx] || col.label;
          const rawValue = r[col.key];
          const formatted = col.formatter ? col.formatter(rawValue, r) : rawValue;
          pdfObj[headerName] = formatted != null && formatted !== "" ? String(formatted) : "-";
        });
        return pdfObj;
      });

      const branchLabel = effectiveBranch
        ? (effectiveBranch === "gil-puyat" ? "Gil Puyat" : "Guadalupe")
        : "All Branches";

      const presetLabel = PRESET_LABELS[preset] || "All Time";

      await exportReportPdf({
        title: `${title} Report`,
        subtitle: `Branch: ${branchLabel}  ·  Range: ${presetLabel}`,
        filename: `${buildFilename(activeTab, effectiveBranch, preset)}.pdf`,
        period: presetLabel,
        reportType: title,
        kpis: [
          { label: "Total Records", value: rows.length, highlight: true },
          { label: "Active Branch", value: branchLabel },
          { label: "Filtered Period", value: presetLabel },
        ],
        sections: [
          {
            title: `${title} Records (${presetLabel})`,
            type: "table",
            headers: headers,
            rows: pdfRows,
          },
        ],
      });
    } catch (err) {
      console.error("[BillingExport] PDF export failed:", err);
      showNotification("PDF export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [fetchCurrentTabData, activeTab, effectiveBranch, preset, isExporting]);

  return (
    <div className="space-y-4">
      <BillingToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        branchFilter={isOwner ? branchFilter : undefined}
        onBranchChange={isOwner ? handleBranchChange : undefined}
        preset={preset}
        onPresetChange={handlePresetChange}
        isOwner={isOwner}
        user={user}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
      />

      <div className="min-h-[680px]">
        <section
          role="tabpanel"
          id="billing-panel-electricity"
          aria-labelledby="billing-tab-electricity"
          className={activeTab === "electricity" ? "block" : "hidden"}
        >


          <UtilityBillingTab
            utilityType="electricity"
            isActive={activeTab === "electricity"}
            ownerBranchFilter={isOwner ? branchFilter : undefined}
            onOwnerBranchChange={isOwner ? setBranchFilter : undefined}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-water"
          aria-labelledby="billing-tab-water"
          className={activeTab === "water" ? "block" : "hidden"}
        >
          <UtilityBillingTab
            utilityType="water"
            isActive={activeTab === "water"}
            ownerBranchFilter={isOwner ? branchFilter : undefined}
            onOwnerBranchChange={isOwner ? setBranchFilter : undefined}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-rent"
          aria-labelledby="billing-tab-rent"
          className={activeTab === "rent" ? "block" : "hidden"}
        >
          <RentBillingTab
            isActive={activeTab === "rent"}
            ownerBranchFilter={isOwner ? branchFilter : undefined}
            onOwnerBranchChange={isOwner ? setBranchFilter : undefined}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-reservation-payments"
          aria-labelledby="billing-tab-reservation-payments"
          className={activeTab === "reservation-payments" ? "block" : "hidden"}
        >
          <ReservationPaymentReviewTab
            isActive={activeTab === "reservation-payments"}
            branch={effectiveBranch}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-overdue-notices"
          aria-labelledby="billing-tab-overdue-notices"
          className={activeTab === "overdue-notices" ? "block" : "hidden"}
        >
          <OverdueEscalationTab branch={effectiveBranch} />
        </section>


        <section
          role="tabpanel"
          id="billing-panel-violations"
          aria-labelledby="billing-tab-violations"
          className={activeTab === "violations" ? "block" : "hidden"}
        >
          <TenantViolationManager branch={effectiveBranch} />
        </section>
      </div>
    </div>
  );
};

export default AdminBillingPage;
