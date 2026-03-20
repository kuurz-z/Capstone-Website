import { useMemo, useState } from "react";
import { Users, UserPlus } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useApiClient } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers, useUserStats } from "../../../shared/hooks/queries/useUsers";
import EditUserModal from "../components/users/EditUserModal";
import AddUserModal from "../components/users/AddUserModal";
import DeleteUserModal from "../components/users/DeleteUserModal";
import AccountActionModal from "../components/users/AccountActionModal";
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-users.css";

function UserManagementPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const { authFetch } = useApiClient();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [accountAction, setAccountAction] = useState({ type: null, user: null });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Edit form state
  const [editForm, setEditForm] = useState({
    username: "", firstName: "", lastName: "", email: "", phone: "",
    role: "applicant", branch: "", isActive: true,
    gender: "", dateOfBirth: "", address: "", city: "",
    emergencyContact: "", emergencyPhone: "", studentId: "", school: "", yearLevel: "",
  });

  // Add form state
  const [addForm, setAddForm] = useState({
    username: "", firstName: "", lastName: "", email: "", phone: "",
    role: "applicant", password: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [addFormErrors, setAddFormErrors] = useState({});

  // Validation
  const validateAddField = (name, value) => {
    switch (name) {
      case "username": return !value ? "Username is required" : value.length < 3 ? "Min 3 characters" : "";
      case "email": return !value ? "Email is required" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "Invalid email" : "";
      case "firstName": return !value ? "First name is required" : "";
      case "lastName": return !value ? "Last name is required" : "";
      case "password": return !value ? "Password is required" : value.length < 6 ? "Min 6 characters" : "";
      default: return "";
    }
  };

  const handleAddFormChange = (field, value) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
    setAddFormErrors((prev) => ({ ...prev, [field]: validateAddField(field, value) }));
  };

  // Data fetching
  const userFilters = useMemo(() => {
    const params = { page: currentPage, limit: ITEMS_PER_PAGE };
    if (roleFilter !== "all") params.role = roleFilter;
    if (branchFilter !== "all") params.branch = branchFilter;
    if (statusFilter !== "all") {
      if (["active", "suspended", "banned"].includes(statusFilter)) {
        params.accountStatus = statusFilter;
      } else {
        params.isActive = statusFilter === "active";
      }
    }
    return params;
  }, [currentPage, roleFilter, branchFilter, statusFilter]);

  const { data: usersData, isLoading: loading } = useUsers(userFilters);
  const { data: stats } = useUserStats();
  const users = usersData?.users || [];
  const totalPages = usersData?.pagination?.totalPages || 1;
  const totalUsers = usersData?.pagination?.total || users.length;

  const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  // Handlers
  const handleEditClick = (userData) => {
    setSelectedUser(userData);
    setEditForm({
      username: userData.username || "", firstName: userData.firstName || "",
      lastName: userData.lastName || "", email: userData.email || "",
      phone: userData.phone || "", role: userData.role || "applicant",
      branch: userData.branch || "", isActive: userData.isActive !== false,
      gender: userData.gender || "",
      dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth).toISOString().split("T")[0] : "",
      address: userData.address || "", city: userData.city || "",
      emergencyContact: userData.emergencyContact || "", emergencyPhone: userData.emergencyPhone || "",
      studentId: userData.studentId || "", school: userData.school || "", yearLevel: userData.yearLevel || "",
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await authFetch(`/users/${selectedUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      showNotification("User updated successfully", "success", 3000);
      setIsEditModalOpen(false);
      refetchAll();
    } catch (error) {
      showNotification(error.message || "Failed to update user", "error", 3000);
    }
  };

  const handleDeleteClick = (userData) => { setSelectedUser(userData); setIsDeleteModalOpen(true); };

  const handleDeleteUser = async () => {
    try {
      await authFetch(`/users/${selectedUser._id}`, { method: "DELETE" });
      showNotification("User deleted successfully", "success", 3000);
      setIsDeleteModalOpen(false);
      refetchAll();
    } catch (error) {
      showNotification(error.message || "Failed to delete user", "error", 3000);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const errors = {};
    ["username", "email", "firstName", "lastName", "password"].forEach((f) => {
      const err = validateAddField(f, addForm[f]);
      if (err) errors[f] = err;
    });
    setAddFormErrors(errors);
    if (Object.keys(errors).length > 0) { showNotification("Please fix the highlighted fields", "error", 3000); return; }

    setIsCreating(true);
    try {
      await authFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: addForm.username, firstName: addForm.firstName, lastName: addForm.lastName,
          email: addForm.email, phone: addForm.phone || undefined, role: addForm.role, password: addForm.password,
        }),
      });
      showNotification("User created successfully!", "success", 3000);
      setIsAddModalOpen(false);
      refetchAll();
    } catch (error) {
      const msg = error.message || "";
      if (msg.includes("Email already") || error.code === "EMAIL_TAKEN")
        showNotification("This email is already registered.", "error", 4000);
      else if (msg.includes("Username already") || error.code === "USERNAME_TAKEN")
        showNotification("This username is taken.", "error", 4000);
      else if (msg.includes("Super Admin") || error.code === "ROLE_FORBIDDEN")
        showNotification("You don't have permission for this role.", "error", 4000);
      else showNotification("Something went wrong.", "error", 4000);
    } finally { setIsCreating(false); }
  };

  const handleAccountAction = async (action, userId, reason) => {
    try {
      if (action === "suspend") {
        await authFetch(`/users/${userId}/suspend`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
        showNotification("User suspended", "success", 3000);
      } else if (action === "ban") {
        await authFetch(`/users/${userId}/ban`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
        showNotification("User banned", "success", 3000);
      } else if (action === "reactivate") {
        await authFetch(`/users/${userId}/reactivate`, { method: "PATCH" });
        showNotification("User reactivated", "success", 3000);
      }
      refetchAll();
    } catch (error) {
      showNotification(error.message || `Failed to ${action} user`, "error", 3000);
    }
  };

  // Filter client-side by search
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return !q || u.username?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q);
  });

  const summaryItems = useMemo(() => [
    { label: "Total Users", value: stats?.total || totalUsers, color: "blue" },
    { label: "Active", value: stats?.activeCount || 0, color: "green" },
    { label: "Suspended", value: stats?.byAccountStatus?.suspended || 0, color: "orange" },
    { label: "Banned", value: stats?.byAccountStatus?.banned || 0, color: "red" },
  ], [stats, totalUsers]);

  const filters = [
    {
      key: "role",
      options: [
        { value: "all", label: "All Roles" },
        { value: "applicant", label: "Applicant" },
        { value: "tenant", label: "Tenant" },
        { value: "admin", label: "Admin" },
        ...(isSuperAdmin ? [{ value: "superAdmin", label: "Super Admin" }] : []),
      ],
      value: roleFilter,
      onChange: (v) => { setRoleFilter(v); setCurrentPage(1); },
    },
    ...(isSuperAdmin ? [{
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        { value: "gil-puyat", label: "Gil Puyat" },
        { value: "guadalupe", label: "Guadalupe" },
      ],
      value: branchFilter,
      onChange: (v) => { setBranchFilter(v); setCurrentPage(1); },
    }] : []),
    {
      key: "status",
      options: [
        { value: "all", label: "All Status" },
        { value: "active", label: "Active" },
        { value: "suspended", label: "Suspended" },
        { value: "banned", label: "Banned" },
      ],
      value: statusFilter,
      onChange: (v) => { setStatusFilter(v); setCurrentPage(1); },
    },
  ];

  const columns = [
    {
      key: "name",
      label: "User",
      sortable: true,
      render: (row) => (
        <div className="user-cell">
          <div className="user-cell__avatar">
            {(row.firstName?.charAt(0) || "").toUpperCase()}{(row.lastName?.charAt(0) || "").toUpperCase()}
          </div>
          <div className="user-cell__info">
            <span className="user-cell__name">{row.firstName} {row.lastName}</span>
            <span className="user-cell__email">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      render: (row) => <span className="user-role-badge">{row.role}</span>,
    },
    { key: "branch", label: "Branch", sortable: true, render: (row) => row.branch || "—" },
    {
      key: "accountStatus",
      label: "Status",
      render: (row) => <StatusBadge status={row.accountStatus || (row.isActive ? "active" : "suspended")} />,
    },
    {
      key: "actions",
      label: "",
      width: "120px",
      align: "right",
      render: (row) => {
        const isCurrentUser = row._id === (user?._id || user?.uid);
        return (
          <div className="user-actions" onClick={(e) => e.stopPropagation()}>
            <button className="user-action-btn" onClick={() => handleEditClick(row)}>Edit</button>
            {isSuperAdmin && !isCurrentUser && (
              <>
                {row.accountStatus !== "suspended" && (
                  <button className="user-action-btn user-action-btn--warn" onClick={() => setAccountAction({ type: "suspend", user: row })}>
                    Suspend
                  </button>
                )}
                {row.accountStatus === "suspended" && (
                  <button className="user-action-btn" onClick={() => setAccountAction({ type: "reactivate", user: row })}>
                    Activate
                  </button>
                )}
                <button className="user-action-btn user-action-btn--danger" onClick={() => handleDeleteClick(row)}>×</button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const actions = isSuperAdmin
    ? [{ label: "Add User", icon: UserPlus, onClick: () => {
        setAddForm({ username: "", firstName: "", lastName: "", email: "", phone: "", role: "applicant", password: "" });
        setAddFormErrors({});
        setIsAddModalOpen(true);
      }, variant: "primary" }]
    : [];

  return (
    <PageShell>
      <PageShell.Summary>
        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Actions>
        <ActionBar
          search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Search users..." }}
          filters={filters}
          actions={actions}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={filteredUsers}
          loading={loading}
          pagination={{
            page: currentPage,
            pageSize: ITEMS_PER_PAGE,
            total: totalUsers,
            onPageChange: setCurrentPage,
          }}
          emptyState={{ icon: Users, title: "No users found", description: "Try adjusting your filters." }}
        />
      </PageShell.Content>

      {/* Modals (kept — creation/destruction needs distinct UI) */}
      {isEditModalOpen && (
        <EditUserModal editForm={editForm} isSuperAdmin={isSuperAdmin}
          onFormChange={setEditForm} onSubmit={handleUpdateUser} onClose={() => setIsEditModalOpen(false)} />
      )}
      {isAddModalOpen && (
        <AddUserModal addForm={addForm} addFormErrors={addFormErrors} isCreating={isCreating}
          isSuperAdmin={isSuperAdmin} onFormChange={handleAddFormChange} onSubmit={handleCreateUser}
          onClose={() => setIsAddModalOpen(false)} />
      )}
      {isDeleteModalOpen && (
        <DeleteUserModal user={selectedUser} onDelete={handleDeleteUser} onClose={() => setIsDeleteModalOpen(false)} />
      )}
      {accountAction.type && (
        <AccountActionModal action={accountAction.type} user={accountAction.user}
          onConfirm={handleAccountAction} onClose={() => setAccountAction({ type: null, user: null })} />
      )}
    </PageShell>
  );
}

export default UserManagementPage;
