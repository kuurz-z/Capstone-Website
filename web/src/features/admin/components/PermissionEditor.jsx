import React, { useState, useEffect } from "react";
import { Shield, Check, X, Save, Loader } from "lucide-react";
import "../styles/permission-editor.css";

/**
 * All available permissions with labels and descriptions
 */
const PERMISSIONS = [
 {
 key: "manageReservations",
 label: "Manage Reservations",
 description: "View, update, and cancel reservations",
 icon: "📋",
 },
 {
 key: "manageTenants",
 label: "Manage Tenants",
 description: "View/edit tenant profiles, account actions",
 icon: "👥",
 },
 {
 key: "manageBilling",
 label: "Manage Billing",
 description: "Generate bills, verify payments, apply penalties",
 icon: "💰",
 },
 {
 key: "manageRooms",
 label: "Manage Rooms",
 description: "Edit rooms, beds, and occupancy",
 icon: "🏠",
 },
 {
 key: "manageMaintenance",
 label: "Manage Maintenance",
 description: "Handle maintenance requests",
 icon: "🔧",
 },
 {
 key: "manageAnnouncements",
 label: "Manage Announcements",
 description: "Create, edit, and delete announcements",
 icon: "📢",
 },
 {
 key: "viewReports",
 label: "View Reports",
 description: "Access reports and analytics",
 icon: "📊",
 },
 {
 key: "manageUsers",
 label: "Manage Users",
 description: "Create, edit, and delete user accounts",
 icon: "🔐",
 },
];

/**
 * PermissionEditor — Toggle grid for admin permissions.
 * Used by the owner to customise what each admin can do.
 *
 * @param {Object} props
 * @param {string[]} props.permissions - Current permissions array
 * @param {Function} props.onChange - Called with updated permissions array
 * @param {boolean} props.isOwnerTarget - If the target user is owner (show read-only)
 * @param {boolean} props.saving - Loading state for save button
 * @param {Function} props.onSave - Called when save is clicked
 */
export default function PermissionEditor({
 permissions = [],
 onChange,
 isOwnerTarget = false,
 saving = false,
 onSave,
}) {
 const [localPermissions, setLocalPermissions] = useState(permissions);
 const [hasChanges, setHasChanges] = useState(false);

 useEffect(() => {
 setLocalPermissions(permissions);
 setHasChanges(false);
 }, [permissions]);

 const handleToggle = (key) => {
 if (isOwnerTarget) return;

 const updated = localPermissions.includes(key)
 ? localPermissions.filter((p) => p !== key)
 : [...localPermissions, key];

 setLocalPermissions(updated);
 setHasChanges(true);
 if (onChange) onChange(updated);
 };

 const handleSelectAll = () => {
 if (isOwnerTarget) return;
 const all = PERMISSIONS.map((p) => p.key);
 setLocalPermissions(all);
 setHasChanges(true);
 if (onChange) onChange(all);
 };

 const handleClearAll = () => {
 if (isOwnerTarget) return;
 setLocalPermissions([]);
 setHasChanges(true);
 if (onChange) onChange([]);
 };

 const handleSave = () => {
 if (onSave) onSave(localPermissions);
 setHasChanges(false);
 };

 return (
 <div className="permission-editor">
 <div className="pe-header">
 <div className="pe-title">
 <Shield size={18} />
 <h4>Permissions</h4>
 </div>
 {isOwnerTarget ? (
 <span className="pe-badge pe-badge-full">Full Access</span>
 ) : (
 <div className="pe-header-actions">
 <button
 className="pe-link-btn"
 onClick={handleSelectAll}
 type="button"
 >
 Select All
 </button>
 <span className="pe-divider">|</span>
 <button
 className="pe-link-btn"
 onClick={handleClearAll}
 type="button"
 >
 Clear All
 </button>
 </div>
 )}
 </div>

 <div className="pe-grid">
 {PERMISSIONS.map((perm) => {
 const isActive =
 isOwnerTarget || localPermissions.includes(perm.key);

 return (
 <div
 key={perm.key}
 className={`pe-item ${isActive ? "active" : ""} ${isOwnerTarget ? "readonly" : ""}`}
 onClick={() => handleToggle(perm.key)}
 role="button"
 tabIndex={0}
 >
 <div className="pe-item-icon">{perm.icon}</div>
 <div className="pe-item-content">
 <span className="pe-item-label">{perm.label}</span>
 <span className="pe-item-desc">{perm.description}</span>
 </div>
 <div className="pe-item-toggle">
 {isActive ? (
 <Check size={16} className="pe-check" />
 ) : (
 <X size={16} className="pe-x" />
 )}
 </div>
 </div>
 );
 })}
 </div>

 {!isOwnerTarget && onSave && (
 <div className="pe-footer">
 <button
 className="pe-save-btn"
 onClick={handleSave}
 disabled={!hasChanges || saving}
 type="button"
 >
 {saving ? (
 <>
 <Loader size={14} className="pe-spinner" />
 Saving…
 </>
 ) : (
 <>
 <Save size={14} />
 Save Permissions
 </>
 )}
 </button>
 </div>
 )}
 </div>
 );
}
