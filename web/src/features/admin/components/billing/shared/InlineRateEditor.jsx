import { Check, X } from "lucide-react";
import "./BillingShared.css";

export default function InlineRateEditor({
  editing,
  value,
  onChange,
  onSave,
  onCancel,
  onStartEdit,
  displayValue,
  disabled = false,
  editLabel = "Rate",
  renderActions,
  renderDisplay,
}) {
  if (editing) {
    return (
      <div className="billing-inline-rate">
        <input
          type="number"
          min="0"
          step="0.01"
          className="billing-inline-rate__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="billing-inline-rate__actions">
          {renderActions ? renderActions({ onSave, onCancel, disabled }) : (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={disabled}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontWeight: "500",
                  fontSize: "0.9rem",
                  opacity: disabled ? 0.6 : 1,
                  transition: "background-color 0.2s ease",
                }}
                onMouseEnter={(e) => !disabled && (e.target.style.backgroundColor = "#059669")}
                onMouseLeave={(e) => !disabled && (e.target.style.backgroundColor = "#10b981")}
              >
                <Check size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "0.9rem",
                  transition: "background-color 0.2s ease",
                }}
                onMouseEnter={(e) => (e.target.style.backgroundColor = "#dc2626")}
                onMouseLeave={(e) => (e.target.style.backgroundColor = "#ef4444")}
              >
                <X size={16} />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (renderDisplay) {
    return renderDisplay({ displayValue, onStartEdit });
  }

  return (
    <div className="billing-inline-rate">
      <span>{displayValue}</span>
      {onStartEdit ? (
        <button type="button" className="wb-inline-btn" onClick={onStartEdit}>
          {editLabel}
        </button>
      ) : null}
    </div>
  );
}
