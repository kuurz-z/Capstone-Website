import { X, Home, Users, Zap, Droplets } from "lucide-react";
import { fmtCurrency } from "../../utils/formatters";

export default function GenerateBillModal({
  selectedRoom,
  genMonth,
  genDueDate,
  genCharges,
  genTotal,
  generating,
  onMonthChange,
  onDueDateChange,
  onChargesChange,
  onGenerate,
  onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-lg"
        onClick={(e) => e.stopPropagation()}
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
              <span className="form-hint">Defaults to 15th of next month</span>
            </div>
          </div>

          {/* Room-level charges */}
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
            <div className="form-row">
              <div className="form-group">
                <label>Appliance Fees (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={genCharges.applianceFees}
                  onChange={(e) =>
                    onChargesChange({
                      ...genCharges,
                      applianceFees: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Corkage Fees (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={genCharges.corkageFees}
                  onChange={(e) =>
                    onChargesChange({
                      ...genCharges,
                      corkageFees: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Total preview */}
          <div className="bill-total-preview">
            <span>Total Room Utilities</span>
            <strong>{fmtCurrency(genTotal)}</strong>
          </div>

          {selectedRoom.tenantCount > 1 && (
            <div className="form-hint" style={{ marginBottom: "0.5rem" }}>
              Split among {selectedRoom.tenantCount} tenants by days occupied.
              Each tenant's rent is added from their reservation.
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating
                ? "Generating..."
                : `Generate ${selectedRoom.tenantCount} Bill${selectedRoom.tenantCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
