import { useState } from "react";
import {
  X,
  Home,
  Users,
  Zap,
  Droplets,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { fmtCurrency } from "../../utils/formatters";

export default function GenerateBillModal({
  selectedRoom,
  genMonth,
  genDueDate,
  genCharges,
  generating,
  onMonthChange,
  onDueDateChange,
  onChargesChange,
  onGenerate,
  onClose,
}) {
  // Custom charges inherited from each tenant's reservation
  // Admin can override for this specific bill
  const [tenantOverrides, setTenantOverrides] = useState(() => {
    const overrides = {};
    (selectedRoom.tenants || []).forEach((t) => {
      overrides[t.userId] = {
        customCharges: [...(t.customCharges || [])],
      };
    });
    return overrides;
  });

  // New custom charge being added
  const [newChargeName, setNewChargeName] = useState("");
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [addingForTenant, setAddingForTenant] = useState(null);

  const handleAddCharge = (tenantId) => {
    if (!newChargeName.trim() || !newChargeAmount) return;
    setTenantOverrides((prev) => ({
      ...prev,
      [tenantId]: {
        ...prev[tenantId],
        customCharges: [
          ...(prev[tenantId]?.customCharges || []),
          { name: newChargeName.trim(), amount: Number(newChargeAmount) },
        ],
      },
    }));
    setNewChargeName("");
    setNewChargeAmount("");
    setAddingForTenant(null);
  };

  const handleRemoveCharge = (tenantId, chargeIndex) => {
    setTenantOverrides((prev) => ({
      ...prev,
      [tenantId]: {
        ...prev[tenantId],
        customCharges: (prev[tenantId]?.customCharges || []).filter(
          (_, i) => i !== chargeIndex,
        ),
      },
    }));
  };

  // --- Compute totals ---
  const tenants = selectedRoom.tenants || [];
  const electricity = Number(genCharges.electricity) || 0;
  const water = Number(genCharges.water) || 0;
  const totalUtilities = electricity + water;

  const tenantEstimates = tenants.map((t) => {
    const charges = tenantOverrides[t.userId]?.customCharges || [];
    const customTotal = charges.reduce(
      (s, c) => s + (Number(c.amount) || 0),
      0,
    );
    const utilityShare =
      tenants.length > 0 ? totalUtilities / tenants.length : 0;
    return {
      ...t,
      customCharges: charges,
      customTotal,
      utilityShare: Math.round(utilityShare * 100) / 100,
      estimated: t.monthlyRent + utilityShare + customTotal,
    };
  });

  // Pass overrides through charges object
  const handleGenerate = () => {
    // Store tenant custom charge overrides in a way the backend can use
    onGenerate(tenantOverrides);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "650px" }}
      >
        <div className="modal-header">
          <h2>Generate Bill — {selectedRoom.name}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          {/* Room info */}
          <div className="room-info-bar">
            <div className="room-info-item">
              <Home size={14} />
              <span>{selectedRoom.name}</span>
            </div>
            <div className="room-info-item">
              <span className="room-card-branch">{selectedRoom.branch}</span>
            </div>
            <div className="room-info-item">
              <Users size={12} />
              {selectedRoom.tenantCount}/{selectedRoom.capacity} occupied
            </div>
            <div
              className="room-info-item"
              style={{ textTransform: "capitalize" }}
            >
              {selectedRoom.type}
            </div>
          </div>

          {/* Billing month + due date */}
          <div className="form-row">
            <div className="form-group">
              <label>Billing Month</label>
              <input
                type="month"
                value={genMonth}
                onChange={(e) => onMonthChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                value={genDueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
              />
              <span className="form-hint">
                Defaults to 30 days from billing month
              </span>
            </div>
          </div>

          {/* Room utilities — separate water + electricity */}
          <div className="charges-section">
            <h3>Room Utility Charges</h3>
            <div className="form-row">
              <div className="form-group">
                <label>
                  <Zap size={12} style={{ marginRight: 4 }} />
                  Electricity (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={genCharges.electricity}
                  onChange={(e) =>
                    onChargesChange({
                      ...genCharges,
                      electricity: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>
                  <Droplets size={12} style={{ marginRight: 4 }} />
                  Water (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={genCharges.water}
                  onChange={(e) =>
                    onChargesChange({ ...genCharges, water: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Total preview */}
          <div className="bill-total-preview">
            <span>Total Room Utilities</span>
            <strong>{fmtCurrency(totalUtilities)}</strong>
          </div>

          {/* Per-Tenant Breakdown */}
          {tenants.length > 0 && (
            <div className="charges-section" style={{ marginTop: "1rem" }}>
              <h3>Per-Tenant Breakdown</h3>
              {tenantEstimates.map((t) => (
                <div
                  key={t.userId}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.4rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <User size={13} /> {t.name}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#0C375F",
                        fontSize: "0.9rem",
                      }}
                    >
                      {fmtCurrency(t.estimated)}
                    </span>
                  </div>

                  {/* Rent */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.78rem",
                      color: "#64748b",
                      padding: "2px 0",
                    }}
                  >
                    <span>Rent</span>
                    <span>{fmtCurrency(t.monthlyRent)}</span>
                  </div>

                  {/* Utility share */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.78rem",
                      color: "#64748b",
                      padding: "2px 0",
                    }}
                  >
                    <span>Utilities (split ÷ {tenants.length})</span>
                    <span>{fmtCurrency(t.utilityShare)}</span>
                  </div>

                  {/* Custom charges */}
                  {t.customCharges.map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.78rem",
                        color: "#E7710F",
                        padding: "2px 0",
                      }}
                    >
                      <span>{c.name}</span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        {fmtCurrency(c.amount)}
                        <button
                          onClick={() => handleRemoveCharge(t.userId, idx)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#dc2626",
                            padding: 0,
                            display: "flex",
                          }}
                          title="Remove charge"
                        >
                          <Trash2 size={11} />
                        </button>
                      </span>
                    </div>
                  ))}

                  {/* Add custom charge */}
                  {addingForTenant === t.userId ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        marginTop: "0.4rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Charge name"
                        value={newChargeName}
                        onChange={(e) => setNewChargeName(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.78rem",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                        }}
                      />
                      <input
                        type="number"
                        placeholder="₱"
                        min="0"
                        value={newChargeAmount}
                        onChange={(e) => setNewChargeAmount(e.target.value)}
                        style={{
                          width: "70px",
                          padding: "0.3rem 0.5rem",
                          fontSize: "0.78rem",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                        }}
                      />
                      <button
                        onClick={() => handleAddCharge(t.userId)}
                        style={{
                          background: "#E7710F",
                          color: "#fff",
                          border: "none",
                          padding: "0.3rem 0.5rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingForTenant(null);
                          setNewChargeName("");
                          setNewChargeAmount("");
                        }}
                        style={{
                          background: "#f1f5f9",
                          color: "#64748b",
                          border: "none",
                          padding: "0.3rem 0.5rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingForTenant(t.userId);
                        setNewChargeName("");
                        setNewChargeAmount("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "0.75rem",
                        color: "#E7710F",
                        cursor: "pointer",
                        padding: "4px 0 0",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <Plus size={11} /> Add charge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tenants.length > 1 && (
            <div className="form-hint" style={{ marginBottom: "0.5rem" }}>
              Utilities are split equally among {tenants.length} tenants. Each
              tenant's rent comes from their reservation rate.
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating
                ? "Generating..."
                : `Generate ${tenants.length} Bill${tenants.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
