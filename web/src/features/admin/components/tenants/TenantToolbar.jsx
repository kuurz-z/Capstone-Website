export default function TenantToolbar({
  searchTerm,
  onSearchChange,
  branchFilter,
  onBranchChange,
  statusFilter,
  onStatusChange,
}) {
  return (
    <section className="admin-tenants-tools">
      <div className="admin-tenants-search">
        <span className="admin-tenants-search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M20 20L17 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search by name..."
          className="admin-tenants-search-input"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="admin-tenants-filters">
        <select
          className="admin-tenants-filter"
          value={branchFilter}
          onChange={(e) => onBranchChange(e.target.value)}
        >
          <option value="all">All Branches</option>
          <option value="gil puyat">Gil Puyat</option>
          <option value="guadalupe">Guadalupe</option>
        </select>
        <select
          className="admin-tenants-filter"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="moving out">Moving Out</option>
        </select>
      </div>
    </section>
  );
}
