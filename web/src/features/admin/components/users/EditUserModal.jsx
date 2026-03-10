export default function EditUserModal({
  editForm,
  isSuperAdmin,
  onFormChange,
  onSubmit,
  onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit User</h2>
          <button onClick={onClose} className="modal-close">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={editForm.username}
                onChange={(e) =>
                  onFormChange({ ...editForm, username: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  onFormChange({ ...editForm, email: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) =>
                  onFormChange({ ...editForm, firstName: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={editForm.lastName}
                onChange={(e) =>
                  onFormChange({ ...editForm, lastName: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) =>
                  onFormChange({ ...editForm, phone: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select
                value={editForm.role}
                onChange={(e) =>
                  onFormChange({ ...editForm, role: e.target.value })
                }
                required
              >
                <option value="applicant">Applicant</option>
                <option value="tenant">Tenant</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && (
                  <option value="superAdmin">Super Admin</option>
                )}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Branch</label>
              <select
                value={editForm.branch}
                onChange={(e) =>
                  onFormChange({ ...editForm, branch: e.target.value })
                }
              >
                <option value="">No Branch</option>
                <option value="gil-puyat">Gil Puyat</option>
                <option value="guadalupe">Guadalupe</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={editForm.isActive ? "active" : "inactive"}
                onChange={(e) =>
                  onFormChange({
                    ...editForm,
                    isActive: e.target.value === "active",
                  })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancel
            </button>
            <button type="submit" className="btn-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
