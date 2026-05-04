import { Search, ChevronDown } from "lucide-react";
import "./ActionBar.css";

/**
 * ActionBar — Unified filter/search/action row.
 *
 * Props:
 *   search?:  { value, onChange, placeholder }
 *   filters?: [{ key, label, options: [{value, label}], value, onChange }]
 *   actions?: [{ label, icon?, onClick, variant?: "primary"|"ghost"|"danger" }]
 */
export default function ActionBar({ search, filters = [], actions = [], children }) {
  return (
    <div className="action-bar">
      <div className="action-bar__left">
        {/* Search */}
        {search && (
          <div className="action-bar__search">
            <Search size={15} className="action-bar__search-icon" />
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || "Search..."}
              className="action-bar__search-input"
            />
          </div>
        )}

        {/* Filters */}
        {filters.map((filter) => (
          <select
            key={filter.key}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="action-bar__select"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}

        {/* Custom slot */}
        {children}
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="action-bar__right">
          {actions.map((action, i) => (
            <button
              key={i}
              className={`action-bar__btn action-bar__btn--${action.variant || "ghost"}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon && <action.icon size={15} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
