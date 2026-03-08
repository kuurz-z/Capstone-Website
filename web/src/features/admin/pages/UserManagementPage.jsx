import { useMemo, useState, useEffect } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useApiClient } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";

import "../styles/admin-users.css";

function UserManagementPage() {
  const { user } = useAuth();
  const { authFetch } = useApiClient();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit form state
  const [editForm, setEditForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "applicant",
    branch: "",
    isActive: true,
  });

  // Add form state
  const [addForm, setAddForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "applicant",
    password: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, roleFilter, branchFilter, statusFilter]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
      });

      if (roleFilter !== "all") params.append("role", roleFilter);
      if (branchFilter !== "all") params.append("branch", branchFilter);
      if (statusFilter !== "all")
        params.append("isActive", statusFilter === "active");

      const data = await authFetch(`/users?${params}`);
      setUsers(data.users || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Error fetching users:", error);
      showNotification("Failed to load users", "error", 3000);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await authFetch("/users/stats");
      setStats(data || null);
    } catch (error) {
      console.error("Error fetching user stats:", error);
    }
  };

  const handleEditClick = (userData) => {
    setSelectedUser(userData);
    setEditForm({
      username: userData.username || "",
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      email: userData.email || "",
      phone: userData.phone || "",
      role: userData.role || "applicant",
      branch: userData.branch || "",
      isActive: userData.isActive !== false,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();

    try {
      await authFetch(`/users/${selectedUser._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      });

      showNotification("User updated successfully", "success", 3000);
      setIsEditModalOpen(false);
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error("Error updating user:", error);
      showNotification(error.message || "Failed to update user", "error", 3000);
    }
  };

  const handleDeleteClick = (userData) => {
    setSelectedUser(userData);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    try {
      await authFetch(`/users/${selectedUser._id}`, {
        method: "DELETE",
      });

      showNotification("User deleted successfully", "success", 3000);
      setIsDeleteModalOpen(false);
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error("Error deleting user:", error);
      showNotification(error.message || "Failed to delete user", "error", 3000);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      searchQuery === "" ||
      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const getRoleBadgeClass = (role) => {
    const classes = {
      superAdmin: "badge-superadmin",
      admin: "badge-admin",
      tenant: "badge-tenant",
      applicant: "badge-applicant",
    };
    return classes[role] || "badge-applicant";
  };

  const getDisplayRole = (role) => {
    if (!role) return "Applicant";
    if (role === "superAdmin") return "Super Admin";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const handleAddUser = () => {
    setAddForm({
      username: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      role: "applicant",
      password: "",
    });
    setIsAddModalOpen(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (
      !addForm.username ||
      !addForm.firstName ||
      !addForm.lastName ||
      !addForm.email ||
      !addForm.password
    ) {
      showNotification("Please fill in all required fields", "error", 3000);
      return;
    }

    if (addForm.password.length < 6) {
      showNotification("Password must be at least 6 characters", "error", 3000);
      return;
    }

    setIsCreating(true);
    try {
      await authFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: addForm.username,
          firstName: addForm.firstName,
          lastName: addForm.lastName,
          email: addForm.email,
          phone: addForm.phone || undefined,
          role: addForm.role,
          password: addForm.password,
        }),
      });

      showNotification("User created successfully", "success", 3000);
      setIsAddModalOpen(false);
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error("Error creating user:", error);
      showNotification(error.message || "Failed to create user", "error", 4000);
    } finally {
      setIsCreating(false);
    }
  };

  const statsData = useMemo(() => {
    if (stats) {
      const branchKeys = Object.keys(stats.byBranch || {}).filter(Boolean);
      const roleKeys = Object.keys(stats.byRole || {}).filter(
        (key) => (stats.byRole?.[key] || 0) > 0,
      );

      return {
        total: stats.total || 0,
        active: stats.activeCount || 0,
        branches: branchKeys.length,
        roles: roleKeys.length,
        branchLabel: branchKeys.length ? branchKeys.join(", ") : "Unassigned",
      };
    }

    const activeCount = users.filter((u) => u.isActive).length;
    const branchSet = new Set(users.map((u) => u.branch).filter(Boolean));
    const roleSet = new Set(users.map((u) => u.role).filter(Boolean));

    return {
      total: users.length,
      active: activeCount,
      branches: branchSet.size,
      roles: roleSet.size,
      branchLabel: branchSet.size
        ? Array.from(branchSet).join(", ")
        : "Unassigned",
    };
  }, [stats, users]);

  const getAvatarGradient = (seed) => {
    const gradients = [
      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
      "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
      "linear-gradient(135deg, #ff6b2c 0%, #ff8c42 100%)",
    ];

    const value = seed || "user";
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  return (
    <div className="admin-users-page">
      <div className="admin-users-container">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Accounts</h1>
            <p className="admin-page-subtitle">
              Manage system users and their access permissions
            </p>
          </div>
        </div>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-header">
              <div>
                <div className="stat-label">Total Users</div>
                <div className="stat-value">{statsData.total}</div>
                <div className="stat-change">Updated just now</div>
              </div>
              <div className="stat-icon blue">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H7C5.93913 15 4.92172 15.4214 4.17157 16.1716C3.42143 16.9217 3 17.9391 3 19V21"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 11C12.2091 11 14 9.20914 14 7C14 4.79086 12.2091 3 10 3C7.79086 3 6 4.79086 6 7C6 9.20914 7.79086 11 10 11Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 21V19C20.9993 18.1137 20.7044 17.2527 20.1614 16.5523C19.6184 15.8519 18.8577 15.3516 18 15.13"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15 3.13C15.8604 3.3503 16.623 3.8507 17.1676 4.55231C17.7122 5.25392 18.0078 6.11683 18.0078 7.005C18.0078 7.89318 17.7122 8.75608 17.1676 9.45769C16.623 10.1593 15.8604 10.6597 15 10.88"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <div>
                <div className="stat-label">Active Users</div>
                <div className="stat-value">{statsData.active}</div>
                <div className="stat-subtitle">
                  {statsData.total
                    ? `${Math.round((statsData.active / statsData.total) * 100)}% active rate`
                    : "No users yet"}
                </div>
              </div>
              <div className="stat-icon blue">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M20 6L9 17L4 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <div>
                <div className="stat-label">Branches</div>
                <div className="stat-value">{statsData.branches}</div>
                <div className="stat-subtitle">{statsData.branchLabel}</div>
              </div>
              <div className="stat-icon orange">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M3 21V8L12 3L21 8V21"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 21V12H15V21"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <div>
                <div className="stat-label">User Roles</div>
                <div className="stat-value">{statsData.roles}</div>
                <div className="stat-subtitle">Different access levels</div>
              </div>
              <div className="stat-icon orange">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M12 3L19 6.5V11.5C19 16 16 19.5 12 21C8 19.5 5 16 5 11.5V6.5L12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.5 12.5L11 14L14.5 10.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="applicant">Applicant</option>
              <option value="tenant">Tenant</option>
              <option value="admin">Admin</option>
              <option value="superAdmin">Super Admin</option>
            </select>

            {user?.role === "superAdmin" && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="all">All Branches</option>
                <option value="gil-puyat">Gil Puyat</option>
                <option value="guadalupe">Guadalupe</option>
                <option value="">No Branch</option>
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {user?.role === "superAdmin" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddUser}
            >
              <span>+</span>
              Add New User
            </button>
          )}
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="empty-state">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">*</div>
            <div>No users found</div>
          </div>
        ) : (
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
                {filteredUsers.map((u) => (
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
                          {(
                            u.firstName?.[0] ||
                            u.username?.[0] ||
                            "U"
                          ).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <div className="user-name">
                            {u.firstName} {u.lastName}
                          </div>
                          <div className="user-username">
                            @{u.username || "user"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{u.email || "N/A"}</td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(u.role)}`}>
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
                        <button
                          onClick={() => handleEditClick(u)}
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
                        {user?.role === "superAdmin" && (
                          <button
                            onClick={() => handleDeleteClick(u)}
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
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit User</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) =>
                      setEditForm({ ...editForm, username: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, lastName: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({ ...editForm, role: e.target.value })
                    }
                    required
                  >
                    <option value="applicant">Applicant</option>
                    <option value="tenant">Tenant</option>
                    <option value="admin">Admin</option>
                    {user?.role === "superAdmin" && (
                      <option value="superAdmin">Super Admin</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Branch</label>
                  <select
                    value={editForm.branch}
                    onChange={(e) =>
                      setEditForm({ ...editForm, branch: e.target.value })
                    }
                  >
                    <option value="">No Branch</option>
                    <option value="gil-puyat">Gil Puyat</option>
                    <option value="guadalupe">Guadalupe</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.isActive ? "active" : "inactive"}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        isActive: e.target.value === "active",
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New User</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={addForm.username}
                    onChange={(e) =>
                      setAddForm({ ...addForm, username: e.target.value })
                    }
                    required
                    placeholder="john_doe"
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) =>
                      setAddForm({ ...addForm, email: e.target.value })
                    }
                    required
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={addForm.firstName}
                    onChange={(e) =>
                      setAddForm({ ...addForm, firstName: e.target.value })
                    }
                    required
                    placeholder="John"
                  />
                </div>
                <div className="form-group">
                  <label>Last Name *</label>
                  <input
                    type="text"
                    value={addForm.lastName}
                    onChange={(e) =>
                      setAddForm({ ...addForm, lastName: e.target.value })
                    }
                    required
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) =>
                      setAddForm({ ...addForm, phone: e.target.value })
                    }
                    placeholder="+1234567890"
                  />
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    value={addForm.password}
                    onChange={(e) =>
                      setAddForm({ ...addForm, password: e.target.value })
                    }
                    required
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={addForm.role}
                    onChange={(e) =>
                      setAddForm({ ...addForm, role: e.target.value })
                    }
                    required
                  >
                    <option value="applicant">Applicant</option>
                    {user?.role === "superAdmin" && (
                      <option value="admin">Admin</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Branch</label>
                  <div className="form-hint-box">
                    Auto-assigned when user becomes a tenant
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsDeleteModalOpen(false)}
        >
          <div
            className="modal-content modal-small"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Delete User</h2>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete user{" "}
                <strong>
                  {selectedUser?.firstName} {selectedUser?.lastName}
                </strong>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button onClick={handleDeleteUser} className="btn-delete-confirm">
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagementPage;
