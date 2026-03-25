export default function EditUserModal({
  editForm,
  isOwner,
  onFormChange,
  onSubmit,
  onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
        <div className="modal-header">
          <h2>Edit User</h2>
          <button onClick={onClose} className="modal-close">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* ── Basic Info ── */}
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
              <label>Gender</label>
              <select
                value={editForm.gender || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, gender: e.target.value })
                }
              >
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                value={editForm.dateOfBirth || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, dateOfBirth: e.target.value })
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
                <option value="branch_admin">Branch Admin</option>
                {isOwner && (
                  <option value="owner">Owner</option>
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

          {/* ── Extended Profile ── */}
          <h3 style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            margin: "16px 0 8px",
            paddingTop: "12px",
            borderTop: "1px solid #E8EBF0",
          }}>
            Extended Profile
          </h3>

          <div className="form-row">
            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                value={editForm.address || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, address: e.target.value })
                }
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label>City</label>
              <input
                type="text"
                value={editForm.city || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, city: e.target.value })
                }
                maxLength={100}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Emergency Contact</label>
              <input
                type="text"
                value={editForm.emergencyContact || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, emergencyContact: e.target.value })
                }
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label>Emergency Phone</label>
              <input
                type="tel"
                value={editForm.emergencyPhone || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, emergencyPhone: e.target.value })
                }
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Student ID</label>
              <input
                type="text"
                value={editForm.studentId || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, studentId: e.target.value })
                }
                maxLength={50}
              />
            </div>
            <div className="form-group">
              <label>School</label>
              <input
                type="text"
                value={editForm.school || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, school: e.target.value })
                }
                maxLength={100}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Year Level</label>
              <input
                type="text"
                value={editForm.yearLevel || ""}
                onChange={(e) =>
                  onFormChange({ ...editForm, yearLevel: e.target.value })
                }
                maxLength={20}
              />
            </div>
            <div className="form-group" />
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
