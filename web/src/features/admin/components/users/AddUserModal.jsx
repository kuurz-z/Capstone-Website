import { useState } from "react";

export default function AddUserModal({
  addForm,
  addFormErrors,
  isCreating,
  isSuperAdmin,
  onFormChange,
  onSubmit,
  onClose,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New User</h2>
          <button onClick={onClose} className="modal-close">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <div className="form-row">
            <div
              className={`form-group ${addFormErrors.username ? "has-error" : ""}`}
            >
              <label>Username *</label>
              <input
                type="text"
                value={addForm.username}
                onChange={(e) => onFormChange("username", e.target.value)}
                required
                placeholder="john_doe"
              />
              {addFormErrors.username && (
                <span className="field-error">{addFormErrors.username}</span>
              )}
            </div>
            <div
              className={`form-group ${addFormErrors.email ? "has-error" : ""}`}
            >
              <label>Email *</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => onFormChange("email", e.target.value)}
                required
                placeholder="user@example.com"
              />
              {addFormErrors.email && (
                <span className="field-error">{addFormErrors.email}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div
              className={`form-group ${addFormErrors.firstName ? "has-error" : ""}`}
            >
              <label>First Name *</label>
              <input
                type="text"
                value={addForm.firstName}
                onChange={(e) => onFormChange("firstName", e.target.value)}
                required
                placeholder="John"
              />
              {addFormErrors.firstName && (
                <span className="field-error">{addFormErrors.firstName}</span>
              )}
            </div>
            <div
              className={`form-group ${addFormErrors.lastName ? "has-error" : ""}`}
            >
              <label>Last Name *</label>
              <input
                type="text"
                value={addForm.lastName}
                onChange={(e) => onFormChange("lastName", e.target.value)}
                required
                placeholder="Doe"
              />
              {addFormErrors.lastName && (
                <span className="field-error">{addFormErrors.lastName}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={addForm.phone}
                onChange={(e) => onFormChange("phone", e.target.value)}
                placeholder="+1234567890"
              />
            </div>
            <div
              className={`form-group ${addFormErrors.password ? "has-error" : ""}`}
            >
              <label>Password *</label>
              <div className="password-field-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  value={addForm.password}
                  onChange={(e) => onFormChange("password", e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {addFormErrors.password && (
                <span className="field-error">{addFormErrors.password}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <select
                value={addForm.role}
                onChange={(e) => onFormChange("role", e.target.value)}
                required
              >
                <option value="applicant">Applicant</option>
                {isSuperAdmin && <option value="admin">Admin</option>}
              </select>
            </div>
            <div className="form-group">
              <label>Branch</label>
              <div className="form-hint-box">
                Auto-assigned when user becomes a tenant
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" className="btn-save" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
