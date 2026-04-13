import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X, Save } from "lucide-react";
import {
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  formatAnnouncementBranch,
} from "../../../shared/utils/announcementConfig";
import { BRANCH_OPTIONS } from "../../../shared/utils/constants";
import "../styles/admin-common.css";
import "../styles/admin-announcements.css";

export default function AdminAnnouncementModal({
  isOpen,
  onClose,
  onSubmit,
  isPending,
  initialData,
  isOwner,
  defaultBranch,
}) {
  const [form, setForm] = useState(initialData);

  useEffect(() => {
    if (isOpen && initialData) {
      setForm(initialData);
    }
  }, [isOpen, initialData]);

  if (!isOpen || !form) return null;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasChanges = initialData && JSON.stringify(form) !== JSON.stringify(initialData);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category,
      targetBranch: form.targetBranch,
      requiresAcknowledgment: form.requiresAcknowledgment,
    });
  };

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">Edit Announcement</h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleFormSubmit}>
          <div className="admin-modal-body admin-announcements-form">
            <label className="admin-announcements-field">
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => handleChange("title", event.target.value)}
                placeholder="Water interruption on Saturday"
                maxLength={120}
                required
              />
            </label>

            <div className="admin-announcements-form__row">
              <label className="admin-announcements-field">
                <span>Category</span>
                <select
                  value={form.category}
                  onChange={(event) => handleChange("category", event.target.value)}
                >
                  {ANNOUNCEMENT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-announcements-field">
                <span>Target Branch</span>
                {isOwner ? (
                  <select
                    value={form.targetBranch}
                    onChange={(event) => handleChange("targetBranch", event.target.value)}
                  >
                    <option value="both">All Branches</option>
                    {BRANCH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={formatAnnouncementBranch(defaultBranch)} readOnly />
                )}
              </label>
            </div>

            <label className="admin-announcements-field">
              <span>Message</span>
              <textarea
                value={form.content}
                onChange={(event) => handleChange("content", event.target.value)}
                placeholder="Share the operational update, policy reminder, or event details here."
                rows={6}
                maxLength={2000}
                required
              />
            </label>

            <label className="admin-announcements-toggle">
              <input
                type="checkbox"
                checked={form.requiresAcknowledgment}
                onChange={(event) => handleChange("requiresAcknowledgment", event.target.checked)}
              />
              <span>
                <strong>Require acknowledgment</strong>
                <small>Track which tenants confirmed they saw this update.</small>
              </span>
            </label>
          </div>
          <div className="admin-modal-footer">
            <button
              className="admin-btn-secondary"
              type="button"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
              <button className="admin-btn-primary" type="submit" disabled={isPending || !hasChanges}>
              {isPending ? <LoaderCircle size={16} className="admin-announcements-spin" /> : <Save size={16} />}
              {isPending ? "Saving..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
