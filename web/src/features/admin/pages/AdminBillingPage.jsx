import { useState, useEffect, useCallback, useMemo } from "react";
import { billingApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { TrendingUp } from "lucide-react";

import BillingStatsBar from "../components/billing/BillingStatsBar";
import BillingRoomGrid from "../components/billing/BillingRoomGrid";
import BillsToolbar from "../components/billing/BillsToolbar";
import BillsTable from "../components/billing/BillsTable";
import GenerateBillModal from "../components/billing/GenerateBillModal";
import BillDetailModal from "../components/billing/BillDetailModal";
import "../styles/admin-billing.css";

const AdminBillingPage = () => {
  const { user } = useAuth();

  // ── State ──
  const [bills, setBills] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // Rooms
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
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
    applianceFees: "",
    corkageFees: "",
  });
  const [generating, setGenerating] = useState(false);

  // Detail modal
  const [detailBill, setDetailBill] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  // ── Filtered rooms (client-side) ──
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomBranchFilter && r.branch !== roomBranchFilter) return false;
      if (roomTypeFilter && r.type !== roomTypeFilter) return false;
      return true;
    });
  }, [rooms, roomBranchFilter, roomTypeFilter]);

  // ── Fetch data ──
  const fetchBills = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = { page, limit: 15 };
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;
        if (monthFilter) params.month = monthFilter;
        const res = await billingApi.getBillsByBranch(params);
        setBills(res.bills || []);
        setMeta(res.pagination || { total: 0, page: 1, totalPages: 1 });
      } catch (err) {
        console.error("Fetch bills error:", err);
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, monthFilter],
  );

  const fetchStats = async () => {
    try {
      const data = await billingApi.getStats();
      setStats(data);
    } catch (err) {
      console.error("Stats error:", err);
    }
  };

  const fetchRooms = async () => {
    setRoomsLoading(true);
    try {
      const res = await billingApi.getRoomsWithTenants();
      setRooms(res.rooms || []);
    } catch (err) {
      console.error("Fetch rooms error:", err);
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
    fetchStats();
    fetchRooms();
  }, [fetchBills]);

  // ── Room card click → open generate modal ──
  const handleRoomClick = (room) => {
    if (room.tenantCount === 0) return;
    setSelectedRoom(room);
    setGenMonth(new Date().toISOString().slice(0, 7));
    setGenDueDate("");
    setGenCharges({
      electricity: "",
      water: "",
      applianceFees: "",
      corkageFees: "",
    });
    setShowGenerate(true);
  };

  const genTotal =
    Number(genCharges.electricity || 0) +
    Number(genCharges.water || 0) +
    Number(genCharges.applianceFees || 0) +
    Number(genCharges.corkageFees || 0);

  const handleGenerate = async () => {
    if (!selectedRoom) return;
    if (genTotal <= 0) return alert("Please enter at least one charge");
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
          applianceFees: Number(genCharges.applianceFees) || 0,
          corkageFees: Number(genCharges.corkageFees) || 0,
        },
      });
      setShowGenerate(false);
      setSelectedRoom(null);
      fetchBills();
      fetchStats();
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
      fetchBills();
      fetchStats();
    } catch (err) {
      alert(err.message || "Failed to mark as paid");
    } finally {
      setPaying(false);
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
              onClick={() => fetchBills(meta.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {meta.page} of {meta.totalPages}
            </span>
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => fetchBills(meta.page + 1)}
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
          genTotal={genTotal}
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
