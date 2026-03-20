import { useState, useMemo } from "react";
import { billingApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { AlertTriangle, Download, DollarSign } from "lucide-react";
import { showNotification } from "../../../shared/utils/notification";
import getFriendlyError from "../../../shared/utils/friendlyError";
import { exportToCSV, BILLING_COLUMNS } from "../../../shared/utils/exportUtils";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBillingStats,
  useBillsByBranch,
  useRoomsWithTenants,
} from "../../../shared/hooks/queries/useBilling";

import BillingRoomGrid from "../components/billing/BillingRoomGrid";
import GenerateBillModal from "../components/billing/GenerateBillModal";
import BillDetailModal from "../components/billing/BillDetailModal";
import PaymentRequestsTab from "../components/PaymentRequestsTab";
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-billing.css";

const AdminBillingPage = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [activeTab, setActiveTab] = useState("billing");

  // Rooms
  const [roomBranchFilter, setRoomBranchFilter] = useState(
    isSuperAdmin ? "" : (user?.branch || "")
  );
  const [roomTypeFilter, setRoomTypeFilter] = useState("");

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [genMonth, setGenMonth] = useState(new Date().toISOString().slice(0, 7));
  const [genDueDate, setGenDueDate] = useState("");
  const [genCharges, setGenCharges] = useState({ electricity: "", water: "" });
  const [generating, setGenerating] = useState(false);

  // Detail modal
  const [detailBill, setDetailBill] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  // TanStack Query
  const billParams = useMemo(() => {
    const params = { page, limit: 15 };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (monthFilter) params.month = monthFilter;
    return params;
  }, [page, search, statusFilter, monthFilter]);

  const { data: billsResponse, isLoading: loading } = useBillsByBranch(billParams);
  const { data: stats } = useBillingStats();
  const { data: roomsResponse, isLoading: roomsLoading } = useRoomsWithTenants();

  const bills = billsResponse?.bills || [];
  const meta = billsResponse?.pagination || { total: 0, page: 1, totalPages: 1 };
  const rooms = roomsResponse?.rooms || [];

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomBranchFilter && r.branch !== roomBranchFilter) return false;
      if (roomTypeFilter && r.type !== roomTypeFilter) return false;
      return true;
    });
  }, [rooms, roomBranchFilter, roomTypeFilter]);

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["billing"] });

  // Handlers
  const handleRoomClick = (room) => {
    if (!can("manageBilling")) return;
    if (room.tenantCount === 0) return;
    setSelectedRoom(room);
    const currentMonth = new Date().toISOString().slice(0, 7);
    setGenMonth(currentMonth);
    const monthDate = new Date(currentMonth + "-01");
    const defaultDue = new Date(monthDate);
    defaultDue.setDate(defaultDue.getDate() + 30);
    setGenDueDate(defaultDue.toISOString().slice(0, 10));
    setGenCharges({ electricity: "", water: "" });
    setShowGenerate(true);
  };

  const handleGenerate = async () => {
    if (!selectedRoom) return;
    const genTotal = Number(genCharges.electricity || 0) + Number(genCharges.water || 0);
    if (genTotal <= 0) return showNotification("Please enter at least one utility charge.", "error");
    setGenerating(true);
    try {
      const monthDate = genMonth ? new Date(genMonth + "-01") : new Date();
      await billingApi.generateRoomBill({
        roomId: selectedRoom.id,
        billingMonth: monthDate.toISOString(),
        dueDate: genDueDate || undefined,
        charges: { electricity: Number(genCharges.electricity) || 0, water: Number(genCharges.water) || 0 },
      });
      setShowGenerate(false);
      setSelectedRoom(null);
      refetchAll();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to generate bills."), "error");
    } finally { setGenerating(false); }
  };

  const handleMarkPaid = async () => {
    if (!detailBill) return;
    setPaying(true);
    try {
      await billingApi.markAsPaid(detailBill._id, Number(payAmount) || detailBill.totalAmount, payNote);
      setDetailBill(null); setPayAmount(""); setPayNote("");
      refetchAll();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to mark as paid."), "error");
    } finally { setPaying(false); }
  };

  const handleApplyPenalties = async () => {
    if (!window.confirm("Apply ₱50/day penalties to all overdue bills?")) return;
    try {
      await billingApi.applyPenalties();
      showNotification("Penalties applied successfully.", "success");
      refetchAll();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to apply penalties."), "error");
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (monthFilter) params.month = monthFilter;
      const res = await billingApi.getExportData(params);
      exportToCSV(res.data || [], BILLING_COLUMNS, `billing_export_${new Date().toISOString().slice(0, 10)}`);
    } catch (err) {
      showNotification(getFriendlyError(err, "Export failed."), "error");
    }
  };

  // Summary
  const summaryItems = [
    { label: "Total Revenue", value: stats?.totalCollected ? `₱${Number(stats.totalCollected).toLocaleString()}` : "₱0", color: "green" },
    { label: "Pending", value: stats?.pendingCount || 0, color: "orange" },
    { label: "Overdue", value: stats?.overdueCount || 0, color: "red" },
    { label: "Paid", value: stats?.paidCount || 0, color: "blue" },
  ];

  // Tabs
  const tabs = [
    { key: "billing", label: "Billing", icon: DollarSign },
    { key: "payments", label: "Payment Requests" },
  ];

  // Filters
  const actionFilters = [
    {
      key: "status",
      options: [
        { value: "", label: "All Status" },
        { value: "pending", label: "Pending" },
        { value: "paid", label: "Paid" },
        { value: "overdue", label: "Overdue" },
        { value: "partial", label: "Partial" },
      ],
      value: statusFilter,
      onChange: (v) => { setStatusFilter(v); setPage(1); },
    },
    {
      key: "month",
      options: [
        { value: "", label: "All Months" },
        ...(() => {
          const months = [];
          const now = new Date();
          for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = d.toISOString().slice(0, 7);
            const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
            months.push({ value: val, label });
          }
          return months;
        })(),
      ],
      value: monthFilter,
      onChange: (v) => { setMonthFilter(v); setPage(1); },
    },
  ];

  const actions = [
    ...(can("manageBilling") ? [{ label: "Apply Penalties", icon: AlertTriangle, onClick: handleApplyPenalties, variant: "danger" }] : []),
    { label: "Export CSV", icon: Download, onClick: handleExport, variant: "ghost" },
  ];

  // Table columns
  const columns = [
    {
      key: "tenant",
      label: "Tenant",
      render: (row) => row.tenantId?.firstName
        ? `${row.tenantId.firstName} ${row.tenantId.lastName || ""}`
        : row.tenantId?.email || "—",
    },
    {
      key: "room",
      label: "Room",
      render: (row) => row.roomId?.name || row.roomId?.roomNumber || "—",
    },
    {
      key: "billingMonth",
      label: "Month",
      render: (row) => row.billingMonth
        ? new Date(row.billingMonth).toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "—",
    },
    {
      key: "totalAmount",
      label: "Amount",
      align: "right",
      render: (row) => row.totalAmount ? `₱${Number(row.totalAmount).toLocaleString()}` : "—",
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status || "pending"} />,
    },
    {
      key: "dueDate",
      label: "Due",
      render: (row) => row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "—",
    },
  ];

  return (
    <PageShell tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      <PageShell.Summary>
        {activeTab === "billing" && <SummaryBar items={summaryItems} />}
      </PageShell.Summary>

      <PageShell.Actions>
        {activeTab === "billing" && (
          <ActionBar
            search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search bills..." }}
            filters={actionFilters}
            actions={actions}
          />
        )}
      </PageShell.Actions>

      <PageShell.Content>
        {activeTab === "billing" && (
          <>
            {/* Room grid for bill generation */}
            <BillingRoomGrid
              filteredRooms={filteredRooms}
              roomsLoading={roomsLoading}
              roomBranchFilter={roomBranchFilter}
              roomTypeFilter={roomTypeFilter}
              onBranchChange={setRoomBranchFilter}
              onTypeChange={setRoomTypeFilter}
              onRoomClick={handleRoomClick}
            />

            <h3 className="billing-section-title">Bill History</h3>

            <DataTable
              columns={columns}
              data={bills}
              loading={loading}
              onRowClick={setDetailBill}
              pagination={{
                page: page,
                pageSize: 15,
                total: meta.total,
                onPageChange: setPage,
              }}
              emptyState={{ icon: DollarSign, title: "No bills found", description: "Generate bills from the room grid above." }}
            />
          </>
        )}

        {activeTab === "payments" && <PaymentRequestsTab />}
      </PageShell.Content>

      {/* Modals */}
      {showGenerate && selectedRoom && (
        <GenerateBillModal selectedRoom={selectedRoom} genMonth={genMonth} genDueDate={genDueDate}
          genCharges={genCharges} generating={generating} onMonthChange={setGenMonth}
          onDueDateChange={setGenDueDate} onChargesChange={setGenCharges} onGenerate={handleGenerate}
          onClose={() => { setShowGenerate(false); setSelectedRoom(null); }} />
      )}
      {detailBill && (
        <BillDetailModal bill={detailBill} payAmount={payAmount} payNote={payNote} paying={paying}
          onPayAmountChange={setPayAmount} onPayNoteChange={setPayNote} onMarkPaid={handleMarkPaid}
          onClose={() => { setDetailBill(null); setPayAmount(""); setPayNote(""); }} />
      )}
    </PageShell>
  );
};

export default AdminBillingPage;
