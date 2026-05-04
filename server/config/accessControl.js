export const ALL_PERMISSIONS = Object.freeze([
  "manageReservations",
  "manageTenants",
  "manageBilling",
  "manageRooms",
  "manageMaintenance",
  "manageAnnouncements",
  "viewReports",
  "manageUsers",
]);

export const DEFAULT_BRANCH_ADMIN_PERMISSIONS = Object.freeze([
  "manageReservations",
  "manageTenants",
  "manageUsers",
  "manageBilling",
  "manageRooms",
  "manageMaintenance",
  "manageAnnouncements",
  "viewReports",
]);

export const DEFAULT_PERMISSIONS = Object.freeze({
  applicant: Object.freeze([]),
  tenant: Object.freeze([]),
  branch_admin: DEFAULT_BRANCH_ADMIN_PERMISSIONS,
  owner: ALL_PERMISSIONS,
});

export const PERMISSION_LABELS = Object.freeze({
  manageReservations: "Manage Reservations",
  manageTenants: "Manage Tenants",
  manageBilling: "Manage Billing",
  manageRooms: "Manage Rooms",
  manageMaintenance: "Manage Maintenance",
  manageAnnouncements: "Manage Announcements",
  viewReports: "View Reports",
  manageUsers: "Manage Users",
});

export const normalizePermissions = (permissions = []) => {
  const values = Array.isArray(permissions)
    ? permissions.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  return ALL_PERMISSIONS.filter((permission) => values.includes(permission));
};

export const getDefaultPermissionsForRole = (role) =>
  [...(DEFAULT_PERMISSIONS[role] || [])];
