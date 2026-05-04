import { useMemo } from "react";
import { CheckCircle, Info } from "lucide-react";

import { DetailDrawer, StatusBadge } from "../shared";
import { useUser } from "../../../../shared/hooks/queries/useUsers";
import { useAuditLogs } from "../../../../shared/hooks/queries/useAuditLogs";

/* ---------------------------
   CONSTANTS
---------------------------- */
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

/* ---------------------------
   HELPERS
---------------------------- */
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
  if (!branch) return "—";

  return String(branch)
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatLabel(value) {
  if (!value) return "Unknown";

  return String(value)
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
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

function toPermissionLabels(role, permissions) {
  if (role === "owner") return Object.values(PERMISSION_LABELS);
  if (role !== "branch_admin") return [];

  return (permissions || [])
    .map((p) => PERMISSION_LABELS[p] || p)
    .sort((a, b) => a.localeCompare(b));
}

/* ---------------------------
   COMPONENT
---------------------------- */
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

  const permissionLabels = useMemo(() => {
    return toPermissionLabels(
      resolvedUser?.role,
      resolvedUser?.permissions || []
    );
  }, [resolvedUser?.permissions, resolvedUser?.role]);

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

  const visibleAudit = (auditEvents || []).slice(0, 3);

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500 dark:bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm tracking-wide flex-shrink-0">
            {initials}
          </div>
          <div className="flex flex-col -space-y-0.5">
            <span className="text-foreground font-semibold text-lg">{displayName} Access</span>
            <span className="text-sm font-normal text-muted-foreground">{resolvedUser?.email || "No email"}</span>
          </div>
        </div>
      }
      width={1000}
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Close
          </button>
          {canOpenPermissions && (
            <button
              onClick={() => onOpenPermissions?.(resolvedUser)}
              className="h-9 px-4 rounded-md bg-[var(--color-accent)] text-[var(--color-text-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Manage Access
            </button>
          )}
        </div>
      }
    >
      {isLoading && (
        <div className="p-4 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          Loading account access details...
        </div>
      )}

      {isError && (
        <div className="p-4 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          Failed to load account details.
        </div>
      )}

      {!isLoading && !isError && resolvedUser && (
        <div className="flex flex-col gap-6 pt-2">
          {/* BADGES */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={resolvedUser.accountStatus || "active"} />
            <span className="px-2.5 py-1 text-xs font-medium rounded-full border border-border bg-muted/50 text-foreground">
              {formatRole(resolvedUser.role)}
            </span>
          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl border border-border bg-card flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Core Profile</h3>

              <div className="flex flex-col gap-2.5 text-sm">
                <Row label="Username" value={resolvedUser.username || "—"} />
                <Row label="Phone" value={resolvedUser.phone || "—"} />
                <Row label="Role" value={formatRole(resolvedUser.role)} />
                <Row label="Branch" value={formatBranch(resolvedUser.branch)} />
                <Row
                  label="Email Verified"
                  value={
                    resolvedUser.isEmailVerified ? (
                      <span className="text-[var(--color-success)] inline-flex items-center gap-1.5 font-medium">
                        <CheckCircle className="w-4 h-4" /> Verified
                      </span>
                    ) : (
                      "Pending"
                    )
                  }
                />
                <Row label="Tenant Status" value={resolvedUser.tenantStatus ? formatLabel(resolvedUser.tenantStatus) : "—"} />
              </div>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Access State</h3>

              <div className="flex flex-col gap-2.5 text-sm">
                <Row
                  label="Current Status"
                  value={<StatusBadge status={resolvedUser.accountStatus || "active"} />}
                />
                <Row label="Status Changed" value={formatDateTime(resolvedUser.statusChangedAt)} />
                <Row label="Changed By" value={formatActor(resolvedUser.statusChangedBy)} />
                <Row label="Archived" value={resolvedUser.isArchived ? "Yes" : "No"} />
                <Row label="Active Stay" value={userSummary?.hasActiveStay ? "Yes" : "No"} />
                <Row label="Lifecycle Reservation" value={userSummary?.hasLifecycleReservation ? "Yes" : "No"} />
                <Row label="Created" value={formatDateTime(resolvedUser.createdAt)} />
                <Row label="Last Updated" value={formatDateTime(resolvedUser.updatedAt)} />
              </div>
            </div>

            <div className="p-5 rounded-xl border border-border bg-card flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Permission Summary</h3>

              {resolvedUser.role === "owner" && (
                <div className="p-3.5 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground leading-relaxed">
                  Owner accounts keep full platform access. This account inherits all admin permissions.
                </div>
              )}

              {resolvedUser.role === "branch_admin" && (
                <>
                  <div className="text-xs font-bold tracking-wide uppercase text-muted-foreground mb-1">
                    {permissionLabels.length} enabled permission{permissionLabels.length === 1 ? "" : "s"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {permissionLabels.length > 0 ? (
                      permissionLabels.map((label) => (
                        <span key={label} className="inline-flex items-center min-h-[28px] px-3 rounded-full bg-muted/30 border border-border text-foreground text-xs font-medium">
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No permissions assigned.</span>
                    )}
                  </div>
                </>
              )}

              {!["branch_admin", "owner"].includes(resolvedUser.role) && (
                <div className="p-3.5 rounded-lg border border-[var(--color-info)]/20 bg-[var(--color-info)]/10 text-[var(--color-info)] text-sm flex gap-3 items-start leading-relaxed">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Applicant and tenant accounts do not use granular admin permissions.</span>
                </div>
              )}
            </div>
          </div>

          {/* AUDIT */}
          {canViewReports && (
            <div className="rounded-xl border border-border bg-card overflow-hidden mt-2">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  Recent Related Audit Events
                </h3>
                <span className="text-sm text-muted-foreground">
                  (Showing latest {visibleAudit.length} of {auditEvents.length})
                </span>
              </div>

              <div className="p-5">
                {auditLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                {auditError && <div className="text-sm text-muted-foreground">Failed to load.</div>}
                
                {!auditLoading && !auditError && visibleAudit.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleAudit.map((event) => (
                      <div
                        key={event.logId || event.timestamp}
                        className="p-4 rounded-xl border border-border flex flex-col justify-between h-full bg-card"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h4 className="text-sm font-semibold text-foreground leading-tight">
                              {event.action || "Audit event"}
                            </h4>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--color-info)]/20 bg-[var(--color-info)]/10 text-[var(--color-info)] text-xs font-medium flex-shrink-0">
                              <Info className="w-3 h-3" />
                              {event.severity === "info" ? "Info" : event.severity || "Info"}
                            </span>
                          </div>
                          
                          <div className="text-xs text-muted-foreground mb-4">
                            {formatDateTime(event.timestamp)}
                          </div>
                        </div>

                        <div>
                          <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 text-foreground text-xs font-medium">
                            {formatLabel(event.type)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!auditLoading && !auditError && visibleAudit.length === 0 && (
                  <div className="text-sm text-muted-foreground">No recent audit events were found for this account email.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

/* ---------------------------
   ROW COMPONENT
---------------------------- */
function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-muted-foreground text-sm flex-shrink-0">{label}</span>
      <span className="text-foreground font-medium text-sm text-right break-words">{value}</span>
    </div>
  );
}
