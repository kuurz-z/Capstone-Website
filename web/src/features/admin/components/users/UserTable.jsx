const ROLE_BADGE_MAP = {
  superAdmin: "badge-superadmin",
  admin: "badge-admin",
  tenant: "badge-tenant",
  applicant: "badge-applicant",
};

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff6b2c 0%, #ff8c42 100%)",
];

function getAvatarGradient(seed) {
  const value = seed || "user";
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function getDisplayRole(role) {
  if (!role) return "Applicant";
  if (role === "superAdmin") return "Super Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UserTable({
  users,
  loading,
  isSuperAdmin,
  onEditClick,
  onDeleteClick,
}) {
  if (loading) {
    return <div className="empty-state">Loading users...</div>;
  }

  if (users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">*</div>
        <div>No users found</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>
                <div className="user-cell">
                  <div
                    className="user-avatar"
                    style={{
                      background: getAvatarGradient(
                        u._id || u.email || u.username,
                      ),
                    }}
                  >
                    {(u.firstName?.[0] || u.username?.[0] || "U").toUpperCase()}
                  </div>
                  <div className="user-info">
                    <div className="user-name">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="user-username">@{u.username || "user"}</div>
                  </div>
                </div>
              </td>
              <td>{u.email || "N/A"}</td>
              <td>
                <span
                  className={`badge ${ROLE_BADGE_MAP[u.role] || "badge-applicant"}`}
                >
                  {getDisplayRole(u.role)}
                </span>
              </td>
              <td>
                <span className="branch-tag">{u.branch || "-"}</span>
              </td>
              <td>
                <span
                  className={`badge ${u.isActive ? "badge-active" : "badge-inactive"}`}
                >
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <div className="actions">
                  {isSuperAdmin && (
                    <>
                      <button
                        onClick={() => onEditClick(u)}
                        className="action-btn"
                        title="Edit user"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteClick(u)}
                        className="action-btn delete"
                        title="Delete user"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
