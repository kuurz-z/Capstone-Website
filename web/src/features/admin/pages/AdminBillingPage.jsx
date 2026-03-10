import { useState, useEffect, useCallback, useMemo } from "react";
import { billingApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { TrendingUp, ShieldAlert, Clock, AlertTriangle } from "lucide-react";

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
  });
  const [generating, setGenerating] = useState(false);

  // Detail modal
  const [detailBill, setDetailBill] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  // Pending verifications
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

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

  const fetchPendingVerifications = async () => {
    setPendingLoading(true);
    try {
      const res = await billingApi.getPendingVerifications();
      setPendingVerifications(res.bills || []);
    } catch (err) {
      console.error("Pending verifications error:", err);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
    fetchStats();
    fetchRooms();
    fetchPendingVerifications();
  }, [fetchBills]);

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

  // ── Verify payment proof ──
  const handleVerifyPayment = async (billId, { action, rejectionReason }) => {
    try {
      await billingApi.verifyPayment(billId, { action, rejectionReason });
      setDetailBill(null);
      fetchBills();
      fetchStats();
      fetchPendingVerifications();
    } catch (err) {
      alert(err.error || err.message || "Failed to verify payment");
    }
  };

  // ── Apply penalties ──
  const handleApplyPenalties = async () => {
    if (!confirm("Apply ₱50/day penalties to all overdue bills?")) return;
    try {
      const res = await billingApi.applyPenalties();
      alert(res.message || "Penalties applied");
      fetchBills();
      fetchStats();
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

        {/* Pending Verifications Banner */}
        {pendingVerifications.length > 0 && (
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: "10px",
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <ShieldAlert
              size={20}
              style={{ color: "#d97706", flexShrink: 0 }}
            />
            <div>
              <strong style={{ color: "#92400e" }}>
                {pendingVerifications.length} payment
                {pendingVerifications.length !== 1 ? "s" : ""} awaiting
                verification
              </strong>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#78350f",
                  margin: "0.15rem 0 0",
                }}
              >
                {pendingVerifications
                  .map((v) => v.tenant?.name || "Tenant")
                  .join(", ")}
              </p>
            </div>
            <button
              style={{
                marginLeft: "auto",
                background: "#d97706",
                color: "#fff",
                border: "none",
                padding: "0.4rem 1rem",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
              }}
              onClick={() => {
                // Show the first pending bill
                if (pendingVerifications[0]) {
                  setDetailBill(pendingVerifications[0]);
                }
              }}
            >
              Review
            </button>
          </div>
        )}

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
          onVerifyPayment={handleVerifyPayment}
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
