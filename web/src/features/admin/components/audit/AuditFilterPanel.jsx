export default function AuditFilterPanel({ filters, onFilterChange }) {
  return (
    <div className="audit-filters-panel">
      <div className="filter-group">
        <label>Activity Type</label>
        <select
          value={filters.type}
          onChange={(e) => onFilterChange("type", e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="login">Login/Logout</option>
          <option value="registration">Registration</option>
          <option value="data_modification">Data Modifications</option>
          <option value="data_deletion">Data Deletions</option>
          <option value="error">Errors</option>
        </select>
      </div>
      <div className="filter-group">
        <label>Severity</label>
        <select
          value={filters.severity}
          onChange={(e) => onFilterChange("severity", e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div className="filter-group">
        <label>Date Range</label>
        <select
          value={filters.dateRange}
          onChange={(e) => onFilterChange("dateRange", e.target.value)}
        >
          <option value="all">All Time</option>
          <option value="1days">Last 24 Hours</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
      </div>
      <div className="filter-group">
        <label>User Role</label>
        <select
          value={filters.role}
          onChange={(e) => onFilterChange("role", e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="user">User</option>
          <option value="tenant">Tenant</option>
          <option value="admin">Admin</option>
          <option value="superAdmin">Super Admin</option>
        </select>
      </div>
    </div>
  );
}
