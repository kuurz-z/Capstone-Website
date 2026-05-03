/**
 * Super Admin User Management Page
 *
 * Re‑exports the Admin UserManagementPage which already has full super‑admin
 * capabilities: cross‑branch filtering, add/edit/delete users,
 * suspend/ban/reactivate actions, and role changes.
 *
 * The admin page detects `isOwner` via useAuth() and unlocks:
 * - Branch dropdown filter (all branches)
 * - "Add User" button with role selection
 * - Suspend / Ban / Reactivate controls
 * - Super Admin role option in filters
 */
export { default } from "../../admin/pages/UserManagementPage";
