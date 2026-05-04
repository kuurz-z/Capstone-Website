import AuditLog from "../models/AuditLog.js";

function toAuditType(severity) {
  return severity === "critical" ? "data_deletion" : "data_modification";
}

export async function logBillingAudit(req, {
  admin,
  action,
  severity = "info",
  details = "",
  metadata = {},
  entityId = "",
  branch = null,
} = {}) {
  if (!admin?._id || !action) {
    return null;
  }

  const actorName =
    admin.displayName ||
    admin.email ||
    req.user?.email ||
    req.user?.name ||
    "Admin";

  return AuditLog.log({
    type: toAuditType(severity),
    action,
    severity,
    user: actorName,
    userId: admin._id,
    userRole: admin.role,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    branch: branch ?? admin.branch ?? "",
    details,
    metadata,
    entityType: "billing",
    entityId: entityId ? String(entityId) : "",
  });
}
