import { useState } from "react";
import { Shield, User } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useApiClient } from "../../../shared/api/apiClient";
import { useUsers } from "../../../shared/hooks/queries/useUsers";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import PermissionEditor from "../../admin/components/PermissionEditor";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-permissions.css";

export default function RolePermissionsPage() {
  const { user } = useAuth();
  const { authFetch } = useApiClient();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState(null);

  // Fetch all admin + superAdmin users
  const { data: adminResponse, isLoading: adminsLoading } = useUsers({ role: "admin" });
  const { data: saResponse } = useUsers({ role: "superAdmin" });

  const adminUsers = adminResponse?.users || adminResponse || [];
  const superAdminUsers = saResponse?.users || saResponse || [];
  const allStaff = [...superAdminUsers, ...adminUsers];

  const handleSavePermissions = async (userId, permissions) => {
    setSavingId(userId);
    try {
      await authFetch(`/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      showNotification("Permissions updated successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      showNotification("Failed to update permissions", "error");
      console.error("Permission update error:", err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="sa2">
      <div className="sa2-header">
        <div>
          <p className="sa2-eyebrow">Super Admin</p>
          <h1 className="sa2-title">Roles & Permissions</h1>
        </div>
      </div>

      <div className="sa2-alert">
        <Shield size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
        Super Admin accounts always have full access. Permissions below apply only to Admin accounts.
      </div>

      {adminsLoading ? (
        <div className="sa2-card">
          <p className="sa2-empty">Loading staff accounts…</p>
        </div>
      ) : allStaff.length === 0 ? (
        <div className="sa2-card">
          <p className="sa2-empty">No admin accounts found.</p>
        </div>
      ) : (
        <div className="sa-perm-list">
          {allStaff.map((staff) => {
            const isSA = staff.role === "superAdmin";
            return (
              <div key={staff._id} className="sa-perm-card sa2-card">
                <div className="sa-perm-card-header">
                  <div className="sa-perm-user-info">
                    <div className="sa-perm-avatar">
                      {staff.profileImage ? (
                        <img src={staff.profileImage} alt="" />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    <div>
                      <h3 className="sa-perm-user-name">
                        {staff.firstName} {staff.lastName}
                      </h3>
                      <span className="sa-perm-user-email">{staff.email}</span>
                    </div>
                  </div>
                  <div className="sa-perm-meta">
                    <span className={`sa2-badge ${isSA ? "sa2-badge-checked-in" : "sa2-badge-reserved"}`}>
                      {isSA ? "super admin" : "admin"}
                    </span>
                    {staff.branch && (
                      <span className="sa-perm-branch">
                        {staff.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe"}
                      </span>
                    )}
                  </div>
                </div>

                <PermissionEditor
                  permissions={staff.permissions || []}
                  isSuperAdminTarget={isSA}
                  saving={savingId === staff._id}
                  onSave={(perms) => handleSavePermissions(staff._id, perms)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
