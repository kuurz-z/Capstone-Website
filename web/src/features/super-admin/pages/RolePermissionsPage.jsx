import { useEffect } from "react";
import { Shield, UserCog } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PermissionEditor from "../../admin/components/PermissionEditor";
import { useUsers, useUpdatePermissions } from "../../../shared/hooks/queries/useUsers";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-permissions.css";

const formatBranch = (branch) => {
  if (!branch) return "Unassigned";
  return branch
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export default function RolePermissionsPage() {
  const [searchParams] = useSearchParams();
  const { data: usersResponse, isLoading, error } = useUsers({ role: "branch_admin" });
  const updatePermissions = useUpdatePermissions();
  const users = usersResponse?.users || usersResponse || [];
  const focusedUserId = searchParams.get("userId");
  const hasFocusedUser = Boolean(
    focusedUserId && users.some((user) => String(user._id) === String(focusedUserId)),
  );

  useEffect(() => {
    if (!hasFocusedUser) return;

    const targetCard = document.getElementById(`sa-perm-card-${focusedUserId}`);
    if (!targetCard) return;

    targetCard.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [focusedUserId, hasFocusedUser]);

  return (
    <div className="sa2">
      <div className="sa2-header">
        <div>
          <p className="sa2-eyebrow">Super Admin</p>
          <h1 className="sa2-title">Role Permissions</h1>
        </div>
      </div>

      <div className="sa2-card">
        <div className="sa2-section-head">
          <div>
            <h2 className="sa2-card-title">
              <Shield size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Branch Admin Access
            </h2>
            <p className="sa2-subtle">
              Review and update the permissions assigned to each branch admin account.
            </p>
            {hasFocusedUser ? (
              <p className="sa-perm-focus-note">
                Focused on the branch admin selected from Accounts.
              </p>
            ) : null}
          </div>
        </div>

        {isLoading ? <p className="sa2-empty">Loading branch admin accounts...</p> : null}
        {!isLoading && error ? <p className="sa2-empty">Failed to load permissions data.</p> : null}
        {!isLoading && !error && users.length === 0 ? (
          <p className="sa2-empty">No branch admin accounts found.</p>
        ) : null}

        {!isLoading && !error && users.length > 0 ? (
          <div className="sa-perm-list">
            {users.map((user) => (
              <section
                key={user._id}
                id={`sa-perm-card-${user._id}`}
                className={`sa2-card sa-perm-card ${
                  String(user._id) === String(focusedUserId)
                    ? "sa-perm-card--focused"
                    : ""
                }`}
              >
                <div className="sa-perm-card-header">
                  <div className="sa-perm-user-info">
                    <div className="sa-perm-avatar">
                      <UserCog size={18} />
                    </div>
                    <div>
                      <h3 className="sa-perm-user-name">
                        {user.firstName} {user.lastName}
                      </h3>
                      <div className="sa-perm-user-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="sa-perm-meta">
                    <span className="sa-perm-branch">{formatBranch(user.branch)}</span>
                  </div>
                </div>

                <PermissionEditor
                  permissions={user.permissions || []}
                  saving={updatePermissions.isPending && updatePermissions.variables?.userId === user._id}
                  onSave={(permissions) =>
                    updatePermissions.mutate({ userId: user._id, permissions })
                  }
                />
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
