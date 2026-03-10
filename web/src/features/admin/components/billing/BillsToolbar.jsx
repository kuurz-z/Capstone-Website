import { Search } from "lucide-react";

export default function BillsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  monthFilter,
  onMonthChange,
}) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <span className="search-icon">
          <Search size={16} />
        </span>
        <input
          placeholder="Search by tenant name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-group">
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <input
          type="month"
          className="month-filter"
          value={monthFilter}
          onChange={(e) => onMonthChange(e.target.value)}
        />
      </div>
    </div>
  );
}
