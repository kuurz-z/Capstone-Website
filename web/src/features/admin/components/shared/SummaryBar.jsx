import "../../styles/design-tokens.css";
import "./SummaryBar.css";

/**
 * SummaryBar — A row of metric cards with icon, value, and label.
 *
 * items: [{
 *   label,
 *   value,
 *   icon?,         // Lucide component
 *   color?,        // "blue" | "green" | "orange" | "red" | "purple" | "neutral"
 *   highlighted?,  // true = solid blue active card (for "Total")
 *   trend?,        // small subtext
 * }]
 *
 * onItemClick?(index) — called when a card is clicked
 * activeIndex? — index of the currently active/filtered card (-1 or null = none)
 */
export default function SummaryBar({ items = [], onItemClick, activeIndex }) {
  return (
    <div className="summary-bar" role="list">
      {items.map((item, i) => {
        const colorClass = `summary-pill--${item.color || "neutral"}`;
        const Icon = item.icon;
        return (
          <div
            key={i}
            className={`summary-pill ${colorClass}${activeIndex === i ? " summary-pill--active" : ""}${onItemClick ? " summary-pill--clickable" : ""}`}
            role="listitem"
            onClick={() => onItemClick?.(activeIndex === i ? -1 : i)}
          >
            {Icon && (
              <div className="summary-pill__icon">
                <Icon size={18} />
              </div>
            )}
            <div className="summary-pill__body">
              <span className="summary-pill__value">{item.value ?? "—"}</span>
              <span className="summary-pill__label">{item.label}</span>
              {item.trend && (
                <span className="summary-pill__trend">{item.trend}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
