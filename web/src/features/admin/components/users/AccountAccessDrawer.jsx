import { useMemo } from "react";
import { DetailDrawer, StatusBadge } from "../shared";
import { useUser } from "../../../../shared/hooks/queries/useUsers";
import { useAuditLogs } from "../../../../shared/hooks/queries/useAuditLogs";

const ROLE_LABELS = Object.freeze({
  applicant: "Applicant",
  tenant: "Tenant",
  branch_admin: "Branch Admin",
  owner: "Owner",
});

const PERMISSION_LABELS = Object.freeze({
  manageReservations: "Manage Reservations",
  manageTenants: "Manage Tenants",
  manageBilling: "Manage Billing",
  manageRooms: "Manage Rooms",
  manageMaintenance: "Manage Maintenance",
  manageAnnouncements: "Manage Announcements",
  viewReports: "View Reports",
  manageUsers: "Manage Users",
});

const AUDIT_STATUS_MAP = Object.freeze({
  info: "new",
  warning: "pending",
  high: "overdue",
  critical: "banned",
});

function formatDateTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBranch(branch) {
  if (!branch) return "Unassigned";
  return String(branch)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLabel(value) {
  if (!value) return "Unknown";
  return String(value)
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRole(role) {
  return ROLE_LABELS[role] || formatLabel(role);
}

function formatActor(actor) {
  if (!actor) return "System";
  const fullName = `${actor.firstName || ""} ${actor.lastName || ""}`.trim();
  return fullName || actor.email || "System";
}

function toPermissionLabels(role, permissions = []) {
  if (role === "owner") {
    return Object.values(PERMISSION_LABELS);
  }

  if (role !== "branch_admin") {
    return [];
  }

  return permissions
    .map((permission) => PERMISSION_LABELS[permission] || permission)
    .sort((a, b) => a.localeCompare(b));
}

export default function AccountAccessDrawer({
  open,
  userSummary,
  onClose,
  canViewReports,
  canManagePermissions,
  onOpenPermissions,
}) {
  const userId = open ? userSummary?._id : null;
  const { data: userDetail, isLoading, isError } = useUser(userId);
  const resolvedUser = userDetail || userSummary || null;
  const permissionLabels = useMemo(
    () => toPermissionLabels(resolvedUser?.role, resolvedUser?.permissions || []),
    [resolvedUser?.permissions, resolvedUser?.role],
  );

  const auditParams = useMemo(() => {
    if (!resolvedUser?.email) return null;
    return {
      user: resolvedUser.email,
      limit: 6,
      offset: 0,
    };
  }, [resolvedUser?.email]);

  const {
    data: auditEvents = [],
    isLoading: auditLoading,
    isError: auditError,
  } = useAuditLogs(auditParams || {}, {
    enabled: Boolean(open && canViewReports && auditParams),
  });

  const displayName = resolvedUser
    ? `${resolvedUser.firstName || ""} ${resolvedUser.lastName || ""}`.trim() ||
      resolvedUser.username ||
      resolvedUser.email ||
      "Account"
    : "Account";
  const initials = resolvedUser
    ? `${(resolvedUser.firstName || "A")[0]}${(resolvedUser.lastName || "")[0] || ""}`.toUpperCase()
    : "A";
  const canOpenPermissions =
    canManagePermissions &&
    resolvedUser?.role === "branch_admin" &&
    resolvedUser?.isArchived !== true;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={`${displayName} Access`}
      width={760}
      footer={
        canOpenPermissions ? (
          <button
            type="button"
            className="btn-save"
            onClick={() => onOpenPermissions?.(resolvedUser)}
          >
            Open Roles & Permissions
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="user-access-drawer__empty">Loading account access details...</div>
      ) : null}

      {!isLoading && isError ? (
        <div className="user-access-drawer__empty">
          Failed to load the latest account details. Close the drawer and try again.
        </div>
      ) : null}

      {!isLoading && !isError && resolvedUser ? (
        <>
          <div className="user-access-drawer__hero">
            <div className="user-cell__avatar">{initials}</div>
            <div className="user-access-drawer__hero-copy">
              <strong>{displayName}</strong>
              <span>{resolvedUser.email || "No email"}</span>
              <div className="user-access-drawer__hero-tags">
                <StatusBadge
                  status={resolvedUser.accountStatus || "active"}
                  label={
                    (resolvedUser.accountStatus || "active") === "banned"
                      ? "Blocked account"
                      : undefined
                  }
                />
                <span className="user-access-drawer__tag">
                  {formatRole(resolvedUser.role)}
                </span>
                <span className="user-access-drawer__tag">
                  {formatBranch(resolvedUser.branch)}
                </span>
              </div>
            </div>
          </div>

          <DetailDrawer.Section label="Core Profile">
            <DetailDrawer.Row label="Username" value={resolvedUser.username || "Unassigned"} />
            <DetailDrawer.Row label="Phone" value={resolvedUser.phone || "No phone"} />
            <DetailDrawer.Row label="Role" value={formatRole(resolvedUser.role)} />
            <DetailDrawer.Row label="Branch" value={formatBranch(resolvedUser.branch)} />
            <DetailDrawer.Row label="Email Verified">
              <StatusBadge
                status={resolvedUser.isEmailVerified ? "verified" : "pending"}
                label={resolvedUser.isEmailVerified ? "Verified" : "Pending Verification"}
              />
            </DetailDrawer.Row>
            <DetailDrawer.Row
              label="Tenant Status"
              value={resolvedUser.tenantStatus ? formatLabel(resolvedUser.tenantStatus) : "Not Applicable"}
            />
          </DetailDrawer.Section>

          <DetailDrawer.Section label="Access State">
            <DetailDrawer.Row label="Current Status">
              <StatusBadge
                status={resolvedUser.accountStatus || "active"}
                label={
                  (resolvedUser.accountStatus || "active") === "banned"
                    ? "Blocked account"
                    : undefined
                }
              />
            </DetailDrawer.Row>
            <DetailDrawer.Row
              label="Status Changed"
              value={formatDateTime(resolvedUser.statusChangedAt)}
            />
            <DetailDrawer.Row
              label="Changed By"
              value={formatActor(resolvedUser.statusChangedBy)}
            />
            <DetailDrawer.Row
              label="Reason"
              value={resolvedUser.statusReason || "No reason recorded"}
            />
            <DetailDrawer.Row
              label="Archived"
              value={resolvedUser.isArchived ? "Yes" : "No"}
            />
            <DetailDrawer.Row
              label="Archived At"
              value={
                resolvedUser.isArchived
                  ? formatDateTime(resolvedUser.archivedAt)
                  : "Not archived"
              }
            />
            <DetailDrawer.Row
              label="Archived By"
              value={resolvedUser.isArchived ? formatActor(resolvedUser.archivedBy) : "Not archived"}
            />
            <DetailDrawer.Row
              label="Active Stay"
              value={userSummary?.hasActiveStay ? "Yes" : "No"}
            />
            <DetailDrawer.Row
              label="Lifecycle Reservation"
              value={userSummary?.hasLifecycleReservation ? "Yes" : "No"}
            />
            <DetailDrawer.Row
              label="Created"
              value={formatDateTime(resolvedUser.createdAt)}
            />
            <DetailDrawer.Row
              label="Last Updated"
              value={formatDateTime(resolvedUser.updatedAt)}
            />
          </DetailDrawer.Section>

          <DetailDrawer.Section label="Permission Summary">
            {resolvedUser.role === "owner" ? (
              <div className="user-access-drawer__note">
                Owner accounts keep full platform access. This account inherits all admin permissions.
              </div>
            ) : null}

            {resolvedUser.role === "branch_admin" ? (
              <>
                <div className="user-access-drawer__permission-meta">
                  {permissionLabels.length} enabled permission
                  {permissionLabels.length === 1 ? "" : "s"}
                </div>
                <div className="user-access-drawer__permission-list">
                  {permissionLabels.length > 0 ? (
                    permissionLabels.map((label) => (
                      <span key={label} className="user-access-drawer__permission-chip">
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="user-access-drawer__empty-inline">
                      No permissions assigned.
                    </span>
                  )}
                </div>
                {canOpenPermissions ? (
                  <div className="user-access-drawer__note">
                    Use the footer action to jump straight to the full permission editor for this branch admin.
                  </div>
                ) : null}
              </>
            ) : null}

            {!["branch_admin", "owner"].includes(resolvedUser.role) ? (
              <div className="user-access-drawer__note">
                Applicant and tenant accounts do not use granular admin permissions.
              </div>
            ) : null}
          </DetailDrawer.Section>

          <DetailDrawer.Section label="Recent Related Audit Events">
            {!canViewReports ? (
              <div className="user-access-drawer__note">
                Recent audit events are only available to viewers with the View Reports permission.
              </div>
            ) : null}

            {canViewReports && auditLoading ? (
              <div className="user-access-drawer__empty">Loading recent events...</div>
            ) : null}

            {canViewReports && !auditLoading && auditError ? (
              <div className="user-access-drawer__empty">
                Failed to load recent audit events for this account email.
              </div>
            ) : null}

            {canViewReports && !auditLoading && !auditError ? (
              <div className="user-access-drawer__audit-list">
                {auditEvents.length > 0 ? (
                  auditEvents.map((event) => (
                    <article
                      key={event.logId || `${event.type}-${event.timestamp}`}
                      className="user-access-drawer__audit-item"
                    >
                      <div className="user-access-drawer__audit-head">
                        <strong>{event.action || "Audit event"}</strong>
                        <StatusBadge
                          status={AUDIT_STATUS_MAP[event.severity] || "archived"}
                          label={event.severity || "unknown"}
                        />
                      </div>
                      <div className="user-access-drawer__audit-meta">
                        <span>{formatDateTime(event.timestamp)}</span>
                        <span>{formatLabel(event.type || "unknown")}</span>
                      </div>
                      <p className="user-access-drawer__audit-details">
                        {event.details || "No additional details recorded."}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="user-access-drawer__empty">
                    No recent audit events were found for this account email.
                  </div>
                )}
              </div>
            ) : null}
          </DetailDrawer.Section>
        </>
      ) : null}
    </DetailDrawer>
  );
}
