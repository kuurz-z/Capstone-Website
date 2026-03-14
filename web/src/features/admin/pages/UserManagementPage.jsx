import { useMemo, useState } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useApiClient } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers, useUserStats } from "../../../shared/hooks/queries/useUsers";

import UserStatsBar from "../components/users/UserStatsBar";
import UserToolbar from "../components/users/UserToolbar";
import UserTable from "../components/users/UserTable";
import EditUserModal from "../components/users/EditUserModal";
import AddUserModal from "../components/users/AddUserModal";
import DeleteUserModal from "../components/users/DeleteUserModal";
import AccountActionModal from "../components/users/AccountActionModal";
import "../styles/admin-users.css";

function UserManagementPage() {
  const { user } = useAuth();
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
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");

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
    // Extended profile fields
    gender: "",
    dateOfBirth: "",
    address: "",
    city: "",
    emergencyContact: "",
    emergencyPhone: "",
    studentId: "",
    school: "",
    yearLevel: "",
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
  const [addFormErrors, setAddFormErrors] = useState({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // ── Validation ──
  const validateAddField = (name, value) => {
    switch (name) {
      case "username":
        if (!value) return "Username is required";
        if (value.length < 3) return "Username must be at least 3 characters";
        return "";
      case "email":
        if (!value) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          return "Please enter a valid email address";
        return "";
      case "firstName":
        if (!value) return "First name is required";
        return "";
      case "lastName":
        if (!value) return "Last name is required";
        return "";
      case "password":
        if (!value) return "Password is required";
        if (value.length < 6) return "Password must be at least 6 characters";
        return "";
      default:
        return "";
    }
  };

  const handleAddFormChange = (field, value) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
    const error = validateAddField(field, value);
    setAddFormErrors((prev) => ({ ...prev, [field]: error }));
  };

  // ── TanStack Query data fetching ──
  const userFilters = useMemo(() => {
    const params = { page: currentPage, limit: ITEMS_PER_PAGE };
    if (roleFilter !== "all") params.role = roleFilter;
    if (branchFilter !== "all") params.branch = branchFilter;
    if (statusFilter !== "all") {
      // Use accountStatus for granular filtering
      if (statusFilter === "active" || statusFilter === "suspended" || statusFilter === "banned") {
        params.accountStatus = statusFilter;
      } else {
        params.isActive = statusFilter === "active";
      }
    }
    if (tenantStatusFilter !== "all") params.tenantStatus = tenantStatusFilter;
    return params;
  }, [currentPage, roleFilter, branchFilter, statusFilter, tenantStatusFilter]);

  const { data: usersData, isLoading: loading } = useUsers(userFilters);
  const { data: stats } = useUserStats();

  const users = usersData?.users || [];
  const totalPages = usersData?.pagination?.totalPages || 1;

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  // ── Handlers ──
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
      // Extended profile fields
      gender: userData.gender || "",
      dateOfBirth: userData.dateOfBirth
        ? new Date(userData.dateOfBirth).toISOString().split("T")[0]
        : "",
      address: userData.address || "",
      city: userData.city || "",
      emergencyContact: userData.emergencyContact || "",
      emergencyPhone: userData.emergencyPhone || "",
      studentId: userData.studentId || "",
      school: userData.school || "",
      yearLevel: userData.yearLevel || "",
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
      await authFetch(`/users/${selectedUser._id}`, { method: "DELETE" });
      showNotification("User deleted successfully", "success", 3000);
      setIsDeleteModalOpen(false);
      refetchAll();
    } catch (error) {
      console.error("Error deleting user:", error);
      showNotification(error.message || "Failed to delete user", "error", 3000);
    }
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
    setAddFormErrors({});
    setIsAddModalOpen(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const errors = {};
    ["username", "email", "firstName", "lastName", "password"].forEach((f) => {
      const err = validateAddField(f, addForm[f]);
      if (err) errors[f] = err;
    });
    setAddFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showNotification("Please fix the highlighted fields", "error", 3000);
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
      showNotification("User created successfully!", "success", 3000);
      setIsAddModalOpen(false);
      refetchAll();
    } catch (error) {
      console.error("Error creating user:", error);
      const msg = error.message || "";
      if (msg.includes("Email already") || error.code === "EMAIL_TAKEN")
        showNotification(
          "This email is already registered. Try a different one.",
          "error",
          4000,
        );
      else if (
        msg.includes("Username already") ||
        error.code === "USERNAME_TAKEN"
      )
        showNotification(
          "This username is taken. Please choose another.",
          "error",
          4000,
        );
      else if (msg.includes("Super Admin") || error.code === "ROLE_FORBIDDEN")
        showNotification(
          "You don't have permission to create this type of account.",
          "error",
          4000,
        );
      else
        showNotification(
          "Something went wrong. Please try again.",
          "error",
          4000,
        );
    } finally {
      setIsCreating(false);
    }
  };

  // ── Account action handler ──
  const handleAccountAction = async (action, userId, reason) => {
    try {
      if (action === "suspend") {
        await authFetch(`/users/${userId}/suspend`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        showNotification("User suspended successfully", "success", 3000);
      } else if (action === "ban") {
        await authFetch(`/users/${userId}/ban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        showNotification("User banned successfully", "success", 3000);
      } else if (action === "reactivate") {
        await authFetch(`/users/${userId}/reactivate`, {
          method: "PATCH",
        });
        showNotification("User reactivated successfully", "success", 3000);
      }
      refetchAll();
    } catch (error) {
      console.error(`Account action '${action}' error:`, error);
      showNotification(error.message || `Failed to ${action} user`, "error", 3000);
    }
  };

  // ── Derived data ──
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

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

  const isSuperAdmin = user?.role === "superAdmin";

  // ── Render ──
  return (
    <div className="admin-users-page">
      <div className="admin-users-container">
        <UserStatsBar statsData={statsData} />

        <UserToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          roleFilter={roleFilter}
          onRoleChange={setRoleFilter}
          branchFilter={branchFilter}
          onBranchChange={setBranchFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          tenantStatusFilter={tenantStatusFilter}
          onTenantStatusChange={setTenantStatusFilter}
          isSuperAdmin={isSuperAdmin}
          onAddUser={handleAddUser}
        />

        <UserTable
          users={filteredUsers}
          loading={loading}
          isSuperAdmin={isSuperAdmin}
          currentUserId={user?._id || user?.uid}
          onEditClick={handleEditClick}
          onDeleteClick={handleDeleteClick}
          onAccountAction={(type, targetUser) =>
            setAccountAction({ type, user: targetUser })
          }
        />

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

      {/* Modals */}
      {isEditModalOpen && (
        <EditUserModal
          editForm={editForm}
          isSuperAdmin={isSuperAdmin}
          onFormChange={setEditForm}
          onSubmit={handleUpdateUser}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}

      {isAddModalOpen && (
        <AddUserModal
          addForm={addForm}
          addFormErrors={addFormErrors}
          isCreating={isCreating}
          isSuperAdmin={isSuperAdmin}
          onFormChange={handleAddFormChange}
          onSubmit={handleCreateUser}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}

      {isDeleteModalOpen && (
        <DeleteUserModal
          user={selectedUser}
          onDelete={handleDeleteUser}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}

      {accountAction.type && (
        <AccountActionModal
          action={accountAction.type}
          user={accountAction.user}
          onConfirm={handleAccountAction}
          onClose={() => setAccountAction({ type: null, user: null })}
        />
      )}
    </div>
  );
}

export default UserManagementPage;
