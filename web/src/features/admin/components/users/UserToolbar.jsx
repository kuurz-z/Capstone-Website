export default function UserToolbar({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleChange,
  branchFilter,
  onBranchChange,
  statusFilter,
  onStatusChange,
  isSuperAdmin,
  onAddUser,
}) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
          >
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
          placeholder="Search by name, username, or email..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="filter-group">
        <select
          value={roleFilter}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="applicant">Applicant</option>
          <option value="tenant">Tenant</option>
          <option value="admin">Admin</option>
          <option value="superAdmin">Super Admin</option>
        </select>

        {isSuperAdmin && (
          <select
            value={branchFilter}
            onChange={(e) => onBranchChange(e.target.value)}
          >
            <option value="all">All Branches</option>
            <option value="gil-puyat">Gil Puyat</option>
            <option value="guadalupe">Guadalupe</option>
            <option value="">No Branch</option>
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isSuperAdmin && (
        <button type="button" className="btn btn-primary" onClick={onAddUser}>
          <span>+</span>
          Add New User
        </button>
      )}
    </div>
  );
}
