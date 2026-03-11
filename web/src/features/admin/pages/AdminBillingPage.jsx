import { useState, useMemo } from "react";
import { billingApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { TrendingUp, ShieldAlert, Clock, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBillingStats,
  useBillsByBranch,
  useRoomsWithTenants,
} from "../../../shared/hooks/queries/useBilling";

import BillingStatsBar from "../components/billing/BillingStatsBar";
import BillingRoomGrid from "../components/billing/BillingRoomGrid";
import BillsToolbar from "../components/billing/BillsToolbar";
import BillsTable from "../components/billing/BillsTable";
import GenerateBillModal from "../components/billing/GenerateBillModal";
import BillDetailModal from "../components/billing/BillDetailModal";
import "../styles/admin-billing.css";

const AdminBillingPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── State ──
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // Rooms
  const [roomBranchFilter, setRoomBranchFilter] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState("");

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [genMonth, setGenMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [genDueDate, setGenDueDate] = useState("");
  const [genCharges, setGenCharges] = useState({
    electricity: "",
    water: "",
  });
  const [generating, setGenerating] = useState(false);

  // Detail modal
  const [detailBill, setDetailBill] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  // ── TanStack Query ──
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

  // ── Filtered rooms (client-side) ──
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomBranchFilter && r.branch !== roomBranchFilter) return false;
      if (roomTypeFilter && r.type !== roomTypeFilter) return false;
      return true;
    });
  }, [rooms, roomBranchFilter, roomTypeFilter]);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  };

  // ── Room card click → open generate modal ──
  const handleRoomClick = (room) => {
    if (room.tenantCount === 0) return;
    setSelectedRoom(room);
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    setGenMonth(currentMonth);
    // Default due date = 30 days from billing month start
    const monthDate = new Date(currentMonth + "-01");
    const defaultDue = new Date(monthDate);
    defaultDue.setDate(defaultDue.getDate() + 30);
    setGenDueDate(defaultDue.toISOString().slice(0, 10));
    setGenCharges({
      electricity: "",
      water: "",
    });
    setShowGenerate(true);
  };

  const genTotal =
    Number(genCharges.electricity || 0) + Number(genCharges.water || 0);

  const handleGenerate = async () => {
    if (!selectedRoom) return;
    if (genTotal <= 0) return alert("Please enter at least one utility charge");
    setGenerating(true);
    try {
      const monthDate = genMonth ? new Date(genMonth + "-01") : new Date();
      await billingApi.generateRoomBill({
        roomId: selectedRoom.id,
        billingMonth: monthDate.toISOString(),
        dueDate: genDueDate || undefined,
        charges: {
          electricity: Number(genCharges.electricity) || 0,
          water: Number(genCharges.water) || 0,
        },
      });
      setShowGenerate(false);
      setSelectedRoom(null);
      refetchAll();
    } catch (err) {
      alert(err.error || err.message || "Failed to generate bills");
    } finally {
      setGenerating(false);
    }
  };

  // ── Mark as paid ──
  const handleMarkPaid = async () => {
    if (!detailBill) return;
    setPaying(true);
    try {
      await billingApi.markAsPaid(
        detailBill._id,
        Number(payAmount) || detailBill.totalAmount,
        payNote,
      );
      setDetailBill(null);
      setPayAmount("");
      setPayNote("");
      refetchAll();
    } catch (err) {
      alert(err.message || "Failed to mark as paid");
    } finally {
      setPaying(false);
    }
  };

  // ── Apply penalties ──
  const handleApplyPenalties = async () => {
    if (!confirm("Apply ₱50/day penalties to all overdue bills?")) return;
    try {
      const res = await billingApi.applyPenalties();
      alert(res.message || "Penalties applied");
      refetchAll();
    } catch (err) {
      alert(err.error || err.message || "Failed to apply penalties");
    }
  };

  return (
    <div className="admin-billing-page">
      <div className="admin-billing-container">
        {/* Header */}
        <div className="billing-header">
          <div>
            <h1>Billing Management</h1>
            <p className="billing-subtitle">
              Select a room to generate bills — utilities are auto-split among
              tenants
            </p>
          </div>
          <button
            className="btn btn-outline"
            onClick={handleApplyPenalties}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#fef2f2",
              color: "#dc2626",
              border: "1px solid #fecaca",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            <AlertTriangle size={14} /> Apply Penalties
          </button>
        </div>

        {/* Stats */}
        <BillingStatsBar stats={stats} />


        {/* Room Cards */}
        <BillingRoomGrid
          filteredRooms={filteredRooms}
          roomsLoading={roomsLoading}
          roomBranchFilter={roomBranchFilter}
          roomTypeFilter={roomTypeFilter}
          onBranchChange={setRoomBranchFilter}
          onTypeChange={setRoomTypeFilter}
          onRoomClick={handleRoomClick}
        />

        {/* Bill History */}
        <h2 className="section-title">
          <TrendingUp size={18} />
          Bill History
        </h2>

        <BillsToolbar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          monthFilter={monthFilter}
          onMonthChange={setMonthFilter}
        />

        <BillsTable
          bills={bills}
          loading={loading}
          onViewBill={setDetailBill}
        />

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={meta.page <= 1}
              onClick={() => setPage(Math.max(1, meta.page - 1))}
            >
              Previous
            </button>
            <span>
              Page {meta.page} of {meta.totalPages}
            </span>
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage(meta.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Generate Bill Modal */}
      {showGenerate && selectedRoom && (
        <GenerateBillModal
          selectedRoom={selectedRoom}
          genMonth={genMonth}
          genDueDate={genDueDate}
          genCharges={genCharges}
          generating={generating}
          onMonthChange={setGenMonth}
          onDueDateChange={setGenDueDate}
          onChargesChange={setGenCharges}
          onGenerate={handleGenerate}
          onClose={() => {
            setShowGenerate(false);
            setSelectedRoom(null);
          }}
        />
      )}

      {/* Bill Detail Modal */}
      {detailBill && (
        <BillDetailModal
          bill={detailBill}
          payAmount={payAmount}
          payNote={payNote}
          paying={paying}
          onPayAmountChange={setPayAmount}
          onPayNoteChange={setPayNote}
          onMarkPaid={handleMarkPaid}
          onClose={() => {
            setDetailBill(null);
            setPayAmount("");
            setPayNote("");
          }}
        />
      )}
    </div>
  );
};

export default AdminBillingPage;
