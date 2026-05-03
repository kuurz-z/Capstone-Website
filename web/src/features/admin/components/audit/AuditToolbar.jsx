import { Search, Filter, Download, ChevronDown } from "lucide-react";

export default function AuditToolbar({
  filters,
  showFilters,
  onSearch,
  onToggleFilters,
  onFilterChange,
  onExport,
}) {
  return (
    <div className="audit-filters-header">
      <div className="audit-filters-main">
        <div className="audit-search">
          <Search className="audit-search-icon" size={20} />
          <input
            type="text"
            placeholder="Search logs by action, user, or details..."
            value={filters.search}
            onChange={onSearch}
          />
        </div>
        <button className="audit-filter-btn" onClick={onToggleFilters}>
          <Filter size={18} />
          Filters
          <ChevronDown
            size={16}
            style={{
              transform: showFilters ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </button>
        <button className="audit-export-btn" onClick={onExport}>
          <Download size={18} />
          Export
        </button>
      </div>
    </div>
  );
}
