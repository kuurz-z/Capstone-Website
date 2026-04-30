import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Wrench,
  Receipt,
  Megaphone,
  UserCog,
  FileText,
  BarChart3,
  Building2,
  MessageSquareText,
  Shield,
  Settings,
  Bell,
} from "lucide-react";

export const NAV_GROUPS = [
  { id: "workspace", label: "Workspace", priority: 1 },
  { id: "system", label: "System", priority: 2 },
];

export const NAV_ITEMS = [
  { to: "/admin/dashboard", icon: LayoutDashboard, text: "Dashboard", group: "workspace", priority: 1 },
  { to: "/admin/reservations", icon: CalendarCheck, text: "Reservations", group: "workspace", priority: 2 },
  { to: "/admin/room-availability", icon: BedDouble, text: "Room Management", group: "workspace", priority: 3 },
  { to: "/admin/tenants", icon: Users, text: "Tenants", group: "workspace", priority: 4 },
  { to: "/admin/maintenance", icon: Wrench, text: "Maintenance", group: "workspace", priority: 5, permission: "manageMaintenance" },
  { to: "/admin/chat", icon: MessageSquareText, text: "Support Chat", group: "workspace", priority: 6 },
  { to: "/admin/billing", icon: Receipt, text: "Billing", group: "workspace", priority: 7 },
  { to: "/admin/analytics", icon: BarChart3, text: "Analytics", group: "workspace", priority: 8 },
  { to: "/admin/announcements", icon: Megaphone, text: "Announcements", group: "workspace", priority: 9, permission: "manageAnnouncements" },
  { to: "/admin/notifications", icon: Bell, text: "Notifications", group: "workspace", priority: 10 },
  { to: "/admin/users", icon: UserCog, text: "Accounts", group: "system", priority: 1 },
  { to: "/admin/roles", icon: Shield, text: "Roles & Permissions", group: "system", priority: 2, saOnly: true },
  { to: "/admin/audit-logs", icon: FileText, text: "Audit & Security", group: "system", priority: 3 },
  { to: "/admin/branches", icon: Building2, text: "Branches", group: "system", priority: 4, saOnly: true },
  { to: "/admin/settings", icon: Settings, text: "Policies & Settings", group: "system", priority: 5, saOnly: true },
];

export function getVisibleNavItems({ isOwner = false, can = () => true } = {}) {
  return NAV_ITEMS.filter(
    (item) => (!item.saOnly || isOwner) && (!item.permission || can(item.permission)),
  ).sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

export function getSidebarBrandMeta(isOwner) {
  return {
    title: "Lilycrest",
    subtitle: "Operations Workspace",
    roleLabel: isOwner ? "Owner" : "Branch Admin",
  };
}
