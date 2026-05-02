import { useEffect, useMemo, useState } from "react";
import { Users, UserPlus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { useApiClient } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers, useUserStats } from "../../../shared/hooks/queries/useUsers";
import EditUserModal from "../components/users/EditUserModal";
import AddUserModal from "../components/users/AddUserModal";
import HardDeleteUserModal from "../components/users/HardDeleteUserModal";
import DeleteUserModal from "../components/users/DeleteUserModal";
import RestoreUserModal from "../components/users/RestoreUserModal";
import AccountActionModal from "../components/users/AccountActionModal";
import AccountRowActions from "../components/users/AccountRowActions";
import AccountAccessDrawer from "../components/users/AccountAccessDrawer";
import {
  PageShell,
  SummaryBar,
  ActionBar,
  DataTable,
  StatusBadge,
} from "../components/shared";
import {
  normalizeBranchFilterValue,
  syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import "../styles/design-tokens.css";
import "../styles/admin-users.css";

function UserManagementPage() {
  const { user, refreshUser } = useAuth();
  const { can, isOwner: permissionOwner } = usePermissions();
  const isOwner = permissionOwner || user?.role === "owner";
  const canManageUsers = isOwner || can("manageUsers");
  const canViewReports = isOwner || can("viewReports");
  const appNavigate = useAppNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authFetch } = useApiClient();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState(null);
  const [accessDrawerUser, setAccessDrawerUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHardDeleteModalOpen, setIsHardDeleteModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [accountAction, setAccountAction] = useState({
    type: null,
    user: null,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      fallbackBranch: isOwner ? null : user?.branch,
      allValue: "all",
    }),
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const nextBranch = normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      fallbackBranch: isOwner ? null : user?.branch,
      allValue: "all",
    });

    setBranchFilter((current) => (current === nextBranch ? current : nextBranch));
  }, [isOwner, requestedBranch, user?.branch]);

  useEffect(() => {
    if (!user?.role && !permissionOwner) return;

    const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
      enabled: isOwner,
      allValue: "all",
    });

    if (nextParams.toString() === searchParams.toString()) return;
    setSearchParams(nextParams, { replace: true });
  }, [branchFilter, isOwner, permissionOwner, searchParams, setSearchParams, user?.role]);

  const [editForm, setEditForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "applicant",
    branch: "",
    isActive: true,
    gender: "",
    dateOfBirth: "",
    address: "",
    city: "",
    emergencyContact: "",
    emergencyPhone: "",
    studentId: "",
    school: "",
    yearLevel: "",
    tenantStatus: "applicant",
    hasActiveStay: false,
    hasLifecycleReservation: false,
    lifecycleManaged: false,
  });

  const [addForm, setAddForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "applicant",
    branch: "",
    password: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [addFormErrors, setAddFormErrors] = useState({});

  const validateAddField = (name, value) => {
    switch (name) {
      case "username":
        return !value
          ? "Username is required"
          : value.length < 3
            ? "Min 3 characters"
            : "";
      case "email":
        return !value
          ? "Email is required"
          : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? "Invalid email"
            : "";
      case "firstName":
        return !value ? "First name is required" : "";
      case "lastName":
        return !value ? "Last name is required" : "";
      case "password":
        return !value
          ? "Password is required"
          : value.length < 6
            ? "Min 6 characters"
            : "";
      case "branch":
        return addForm.role === "branch_admin" && !value
          ? "Branch is required for branch admins"
          : "";
      default:
        return "";
    }
  };

  const handleAddFormChange = (field, value) => {
    const nextForm = {
      ...addForm,
      [field]: value,
      ...(field === "role" && value !== "branch_admin" ? { branch: "" } : {}),
    };
    setAddForm(nextForm);
    setAddFormErrors((prev) => ({
      ...prev,
      [field]: validateAddField(field, value),
      ...(field === "role" || field === "branch"
        ? {
            branch:
              nextForm.role === "branch_admin" && !nextForm.branch
                ? "Branch is required for branch admins"
                : "",
          }
        : {}),
    }));
  };

  const userFilters = useMemo(() => {
    const params = { page: currentPage, limit: ITEMS_PER_PAGE };
    if (debouncedSearchQuery) params.search = debouncedSearchQuery;
    if (roleFilter !== "all") params.role = roleFilter;
    if (branchFilter !== "all") params.branch = branchFilter;
    if (statusFilter !== "all") {
      if (statusFilter === "restricted") {
        params.accountStatus = "suspended,banned";
      } else if (statusFilter === "archived") {
        params.accountStatus = "archived";
      } else if (
        ["active", "suspended", "banned", "pending_verification"].includes(
          statusFilter,
        )
      ) {
        params.accountStatus = statusFilter;
      }
    }
    return params;
  }, [
    currentPage,
    debouncedSearchQuery,
    roleFilter,
    branchFilter,
    statusFilter,
  ]);

  const { data: usersData, isLoading: loading } = useUsers(userFilters);
  const { data: stats } = useUserStats();
  const users = usersData?.users || [];
  const totalUsers =
    usersData?.pagination?.totalItems ||
    usersData?.pagination?.total ||
    users.length;

  const refetchAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["reservations", "currentResidents"] }),
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
    ]);

  const formatUserLabel = (userData) => {
    if (!userData) return "User";
    const fullName = `${userData.firstName || ""} ${userData.lastName || ""}`.trim();
    return fullName || userData.username || userData.email || "User";
  };

  const handleOpenPermissions = (userData) => {
    if (!userData?._id) return;
    appNavigate(`/admin/roles?userId=${encodeURIComponent(userData._id)}`);
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
      tenantStatus: userData.tenantStatus || "applicant",
      hasActiveStay: Boolean(userData.hasActiveStay),
      hasLifecycleReservation: Boolean(userData.hasLifecycleReservation),
      lifecycleManaged:
        userData.lifecycleManaged ?? ["applicant", "tenant"].includes(userData.role),
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
      if (selectedUser?._id && String(selectedUser._id) === String(user?.id || user?._id || "")) {
        await refreshUser();
      }
      showNotification("User updated successfully", "success", 3000);
      setIsEditModalOpen(false);
      await refetchAll();
    } catch (error) {
      showNotification(error.message || "Failed to update user", "error", 3000);
    }
  };

  const handleDeleteClick = (userData) => {
    setSelectedUser(userData);
    setIsDeleteModalOpen(true);
  };

  const handleHardDeleteClick = (userData) => {
    setSelectedUser(userData);
    setIsHardDeleteModalOpen(true);
  };

  const handleDeleteUser = async ({
    hardDelete = false,
    forceDelete = false,
    confirmationText = "",
  } = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (hardDelete) queryParams.set("hardDelete", "true");
      if (forceDelete) queryParams.set("force", "true");
      const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
      const response = await authFetch(`/users/${selectedUser._id}${query}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText }),
      });

      const userLabel = formatUserLabel(selectedUser);
      if (response?.blocked) {
        showNotification(`${userLabel} was blocked successfully.`, "success", 3000);
      } else if (response?.archived) {
        showNotification(`${userLabel} was archived successfully.`, "success", 3000);
      } else if (response?.forceDeleted) {
        showNotification(`${userLabel} was force deleted successfully.`, "success", 3000);
      } else {
        showNotification(`${userLabel} was permanently deleted.`, "success", 3000);
      }

      setIsDeleteModalOpen(false);
      setIsHardDeleteModalOpen(false);
      refetchAll();
    } catch (error) {
      if (error?.code === "HARD_DELETE_BLOCKED") {
        const safeguards = error?.safeguards || {};
        const summary = [
          ["reservation(s)", safeguards.reservations],
          ["utility reading(s)", safeguards.utilityReadings],
          ["bill(s)", Number(safeguards.issuedBills || 0) + Number(safeguards.draftBills || 0)],
          ["maintenance record(s)", safeguards.maintenanceRequests],
        ]
          .filter(([, count]) => Number(count || 0) > 0)
          .map(([label, count]) => `${count} ${label}`)
          .join(", ");
        showNotification(
          `Hard delete blocked: ${summary || "significant history found"}. Block the account instead, or use owner force delete.`,
          "error",
          5500,
        );
      } else if (error?.code === "FORCE_DELETE_CONFIRMATION_REQUIRED") {
        showNotification("Type DELETE exactly to force delete this account.", "error", 3500);
      } else {
        showNotification(error.message || "Failed to delete user", "error", 3000);
      }
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const errors = {};
    ["username", "email", "firstName", "lastName", "password", "branch"].forEach((f) => {
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
      const createdUserLabel = formatUserLabel(addForm);
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
          branch: addForm.branch || undefined,
          password: addForm.password,
        }),
      });
      showNotification(
        `${createdUserLabel} was added successfully.`,
        "success",
        3000,
      );
      setIsAddModalOpen(false);
      refetchAll();
    } catch (error) {
      const msg = error.message || "";
      if (msg.includes("Email already") || error.code === "EMAIL_TAKEN") {
        showNotification("This email is already registered.", "error", 4000);
      } else if (
        msg.includes("Username already") ||
        error.code === "USERNAME_TAKEN"
      ) {
        showNotification("This username is taken.", "error", 4000);
      } else if (
        msg.toLowerCase().includes("owner") ||
        error.code === "ROLE_FORBIDDEN"
      ) {
        showNotification(
          "You don't have permission for this role.",
          "error",
          4000,
        );
      } else {
        showNotification("Something went wrong.", "error", 4000);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleAccountAction = async (action, userId, reason) => {
    try {
      const actionUser =
        users.find((userData) => userData._id === userId) ||
        accountAction.user ||
        selectedUser;
      const actionUserLabel = formatUserLabel(actionUser);

      if (action === "suspend") {
        await authFetch(`/users/${userId}/suspend`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        showNotification(
          `${actionUserLabel} was suspended successfully.`,
          "success",
          3000,
        );
      } else if (action === "ban") {
        await authFetch(`/users/${userId}/ban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        showNotification(
          `${actionUserLabel} was blocked successfully.`,
          "success",
          3000,
        );
      } else if (action === "reactivate") {
        await authFetch(`/users/${userId}/reactivate`, { method: "PATCH" });
        showNotification(
          `${actionUserLabel} was reactivated successfully.`,
          "success",
          3000,
        );
      } else if (action === "restore") {
        await authFetch(`/users/${userId}/restore`, { method: "PATCH" });
        showNotification(
          `${actionUserLabel} was restored successfully.`,
          "success",
          3000,
        );
      }
      refetchAll();
    } catch (error) {
      showNotification(
        error.message || `Failed to ${action} user`,
        "error",
        3000,
      );
      throw error;
    }
  };

  const summaryItems = useMemo(
    () => [
      {
        label: "Total Accounts",
        value: stats?.total || totalUsers,
        color: "blue",
      },
      { label: "Active", value: stats?.activeCount || 0, color: "green" },
      {
        label: "Branch Admins",
        value: stats?.byRole?.branch_admin || 0,
        color: "blue",
      },
      {
        label: "Owners",
        value: stats?.byRole?.owner || 0,
        color: "purple",
      },
      {
        label: "Blocked",
        value:
          (stats?.byAccountStatus?.suspended || 0) +
          (stats?.byAccountStatus?.banned || 0),
        color: "orange",
      },
      {
        label: "Archived",
        value: stats?.archivedCount || 0,
        color: "red",
      },
    ],
    [stats, totalUsers],
  );

  const filters = [
    {
      key: "role",
      options: [
        { value: "all", label: "All Roles" },
        { value: "applicant", label: "Applicant" },
        { value: "tenant", label: "Tenant" },
        { value: "branch_admin", label: "Branch Admin" },
        ...(isOwner ? [{ value: "owner", label: "Owner" }] : []),
      ],
      value: roleFilter,
      onChange: (v) => {
        setRoleFilter(v);
        setCurrentPage(1);
      },
    },
    ...(isOwner
      ? [
          {
            key: "branch",
            options: [
              { value: "all", label: "All Branches" },
              { value: "gil-puyat", label: "Gil Puyat" },
              { value: "guadalupe", label: "Guadalupe" },
            ],
            value: branchFilter,
            onChange: (v) => {
              setBranchFilter(v);
              setCurrentPage(1);
            },
          },
        ]
      : []),
    {
      key: "status",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "active", label: "Active" },
        { value: "pending_verification", label: "Pending Verification" },
        { value: "restricted", label: "All Restricted (Blocked/Suspended)" },
        { value: "suspended", label: "Suspended (Temporary)" },
        { value: "banned", label: "Banned (Permanent)" },
        { value: "archived", label: "Archived" },
      ],
      value: statusFilter,
      onChange: (v) => {
        setStatusFilter(v);
        setCurrentPage(1);
      },
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
            {(row.firstName?.charAt(0) || "").toUpperCase()}
            {(row.lastName?.charAt(0) || "").toUpperCase()}
          </div>
          <div className="user-cell__info">
            <span className="user-cell__name">
              {row.firstName} {row.lastName}
            </span>
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
    {
      key: "branch",
      label: "Branch",
      sortable: true,
      render: (row) => row.branch || "—",
    },
    {
      key: "accountStatus",
      label: "Status",
      render: (row) => (
        <StatusBadge
          status={row.accountStatus || (row.isActive ? "active" : "suspended")}
          label={
            (row.accountStatus || (row.isActive ? "active" : "suspended")) === "banned"
              ? "Blocked account"
              : undefined
          }
        />
      ),
    },
    {
      key: "actions",
      label: "",
      width: "360px",
      align: "right",
      render: (row) => {
        const isCurrentUser = row._id === (user?._id || user?.uid);
        const isArchived = row.isArchived === true;
        const isPrivilegedAccount = ["branch_admin", "owner"].includes(row.role);
        const status =
          row.accountStatus || (row.isActive ? "active" : "suspended");
        const canManagePermissions =
          isOwner && row.role === "branch_admin" && !isArchived;
        const canBlock =
          canManageUsers && !isCurrentUser && !isArchived && status === "active";
        const canUnblock =
          canManageUsers &&
          !isCurrentUser &&
          !isArchived &&
          ["suspended", "banned"].includes(status);
        const canRestore =
          canManageUsers &&
          !isCurrentUser &&
          isArchived &&
          (isOwner || !isPrivilegedAccount);
        const canDelete =
          canManageUsers &&
          !isCurrentUser &&
          !isArchived &&
          (!isPrivilegedAccount || isOwner);
        const canHardDelete = canManageUsers && !isCurrentUser && isArchived && (!isPrivilegedAccount || isOwner);

        return (
          <AccountRowActions
            canViewAccess
            canManagePermissions={canManagePermissions}
            canEdit={canManageUsers && !isArchived && (isOwner || !isPrivilegedAccount)}
            canBlock={canBlock}
            canUnblock={canUnblock}
            canRestore={canRestore}
            canDelete={canDelete}
            canHardDelete={canHardDelete}
            onViewAccess={() => setAccessDrawerUser(row)}
            onManagePermissions={() => handleOpenPermissions(row)}
            onEdit={() => handleEditClick(row)}
            onBlock={() => setAccountAction({ type: "ban", user: row })}
            onUnblock={() =>
              setAccountAction({ type: "reactivate", user: row })
            }
            onRestore={() =>
              setAccountAction({ type: "restore", user: row })
            }
            onDelete={() => handleDeleteClick(row)}
            onHardDelete={() => handleHardDeleteClick(row)}
          />
        );
      },
    },
  ];

  const actions = isOwner
    ? [
        {
          label: "Add User",
          icon: UserPlus,
          onClick: () => {
            setAddForm({
              username: "",
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              role: "applicant",
              branch: "",
              password: "",
            });
            setAddFormErrors({});
            setIsAddModalOpen(true);
          },
          variant: "primary",
        },
      ]
    : [];

  return (
    <PageShell>
      <PageShell.Summary>
        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Actions>
        {!isOwner ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#FFF7ED",
              color: "#9A3412",
              fontSize: 13,
              border: "1px solid #FED7AA",
            }}
          >
            Branch admins can manage applicant and tenant account status inside their own branch.
            Owner-only role changes and cross-branch updates are intentionally hidden here.
          </div>
        ) : null}
        <ActionBar
          search={{
            value: searchQuery,
            onChange: (value) => {
              setSearchQuery(value);
              setCurrentPage(1);
            },
            placeholder: "Search users...",
          }}
          filters={filters}
          actions={actions}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          exportable={true}
          exportFilename="System_Users"
          exportTitle="System Users Export"
          pagination={{
            page: currentPage,
            pageSize: ITEMS_PER_PAGE,
            total: totalUsers,
            onPageChange: setCurrentPage,
          }}
          serverPagination
          emptyState={{
            icon: Users,
            title: "No users found",
            description: "Try adjusting your filters.",
          }}
          onRowClick={(row) => setAccessDrawerUser(row)}
        />
      </PageShell.Content>

      {isEditModalOpen && (
        <EditUserModal
          editForm={editForm}
          isOwner={isOwner}
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
          isOwner={isOwner}
          onFormChange={handleAddFormChange}
          onSubmit={handleCreateUser}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}
      {isDeleteModalOpen && (
        <DeleteUserModal
          user={selectedUser}
          isOwner={isOwner}
          onDelete={handleDeleteUser}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}
      {isHardDeleteModalOpen && (
        <HardDeleteUserModal
          user={selectedUser}
          isOwner={isOwner}
          onDelete={handleDeleteUser}
          onClose={() => setIsHardDeleteModalOpen(false)}
        />
      )}
      {accountAction.type === "restore" && (
        <RestoreUserModal
          user={accountAction.user}
          onConfirm={async () => {
            try {
              await handleAccountAction("restore", accountAction.user?._id, "");
            } finally {
              setAccountAction({ type: null, user: null });
            }
          }}
          onClose={() => setAccountAction({ type: null, user: null })}
        />
      )}
      {accountAction.type && accountAction.type !== "restore" && (
        <AccountActionModal
          action={accountAction.type}
          user={accountAction.user}
          onConfirm={handleAccountAction}
          onClose={() => setAccountAction({ type: null, user: null })}
        />
      )}
      <AccountAccessDrawer
        open={Boolean(accessDrawerUser)}
        userSummary={accessDrawerUser}
        onClose={() => setAccessDrawerUser(null)}
        canViewReports={canViewReports}
        canManagePermissions={isOwner}
        onOpenPermissions={handleOpenPermissions}
      />
    </PageShell>
  );
}

export default UserManagementPage;

