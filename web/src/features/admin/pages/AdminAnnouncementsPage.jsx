import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  BellRing,
  FileDown,
  LoaderCircle,
  Megaphone,
  Send,
  ShieldAlert,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { showNotification } from "../../../shared/utils/notification";
import { BRANCH_OPTIONS } from "../../../shared/utils/constants";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import {
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  formatAnnouncementBranch,
  getAnnouncementCategoryMeta,
} from "../../../shared/utils/announcementConfig";
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from "../../../shared/hooks/queries/useAnnouncements";
import AdminAnnouncementModal from "../components/AdminAnnouncementModal";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import "../styles/design-tokens.css";
import "../styles/admin-common.css";
import "../styles/admin-announcements.css";

const INITIAL_FORM = {
  title: "",
  content: "",
  contentType: "announcement",
  category: "general",
  targetBranch: "both",
  requiresAcknowledgment: false,
  publicationStatus: "published",
  startsAt: "",
  endsAt: "",
  policyKey: "",
  version: 1,
  effectiveDate: "",
  isPinned: false,
};

const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const toDateTimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
};

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { can, isOwner } = usePermissions();
  const [form, setForm] = useState(INITIAL_FORM);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);

  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const { data, isLoading, isFetching } = useAdminAnnouncements(20);

  const announcements = data?.announcements || [];
  const defaultBranch = user?.branch || "both";

  const stats = useMemo(
    () => ({
      total: announcements.length,
      policies: announcements.filter((item) => item.contentType === "policy").length,
      ackRequired: announcements.filter((item) => item.requiresAcknowledgment)
        .length,
      scheduled: announcements.filter((item) => item.publicationStatus === "scheduled").length,
    }),
    [announcements],
  );

  if (!can("manageAnnouncements")) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleChange = (field, value) => {
    setForm((previous) => {
      if (field === "contentType" && value === "policy") {
        return {
          ...previous,
          contentType: value,
          category: "policy",
          requiresAcknowledgment: true,
        };
      }

      if (field === "publicationStatus" && value === "scheduled" && !previous.startsAt) {
        const nextStart = new Date(Date.now() + 60 * 60 * 1000);
        return {
          ...previous,
          publicationStatus: value,
          startsAt: toDateTimeLocal(nextStart),
        };
      }

      return { ...previous, [field]: value };
    });
  };

  const handleExport = () => {
    exportToCSV(
      announcements.map((announcement) => ({
        title: announcement.title,
        type: announcement.contentType || "announcement",
        category: announcement.category,
        branch: formatAnnouncementBranch(announcement.targetBranch),
        publicationStatus: announcement.publicationStatus,
        startsAt: announcement.startsAt ? formatDateTime(announcement.startsAt) : "",
        endsAt: announcement.endsAt ? formatDateTime(announcement.endsAt) : "",
        requiresAck: announcement.requiresAcknowledgment ? "Yes" : "No",
        acknowledgmentCount: announcement.acknowledgmentCount || 0,
        recipientCount: announcement.recipientCount || 0,
        completion: `${announcement.acknowledgmentCompletionPercent || 0}%`,
      })),
      [
        { key: "title", label: "Title" },
        { key: "type", label: "Type" },
        { key: "category", label: "Category" },
        { key: "branch", label: "Branch" },
        { key: "publicationStatus", label: "Status" },
        { key: "startsAt", label: "Starts At" },
        { key: "endsAt", label: "Ends At" },
        { key: "requiresAck", label: "Requires Ack" },
        { key: "acknowledgmentCount", label: "Acknowledgments" },
        { key: "recipientCount", label: "Recipients" },
        { key: "completion", label: "Completion" },
      ],
      "announcements-and-policies",
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      contentType: form.contentType,
      category: form.category,
      requiresAcknowledgment: form.requiresAcknowledgment,
      publicationStatus: form.publicationStatus,
      startsAt: form.publicationStatus === "scheduled" ? (form.startsAt || undefined) : undefined,
      endsAt: form.publicationStatus === "scheduled" ? (form.endsAt || undefined) : undefined,
      isPinned: form.isPinned,
    };

    if (form.contentType === "policy") {
      payload.policyKey = form.policyKey.trim();
      payload.version = Number(form.version) || 1;
      payload.effectiveDate = form.effectiveDate || form.startsAt || undefined;
    }

    if (isOwner) {
      payload.targetBranch = form.targetBranch;
    }

    try {
      const result = await createAnnouncement.mutateAsync(payload);
      showNotification(
        `${form.contentType === "policy" ? "Policy" : "Announcement"} saved for ${result.recipientCount} tenant${
          result.recipientCount === 1 ? "" : "s"
        }.`,
        "success",
        3500,
      );
      setForm({
        ...INITIAL_FORM,
        targetBranch: isOwner ? "both" : defaultBranch,
      });
    } catch (error) {
      showNotification(
        error.message || "Failed to publish announcement.",
        "error",
        4000,
      );
    }
  };

  const handleEditSubmit = async (payload) => {
    try {
      await updateAnnouncement.mutateAsync({ id: editingAnnouncement.id, data: payload });
      showNotification("Announcement updated successfully.", "success", 3500);
      setIsEditingModalOpen(false);
      setEditingAnnouncement(null);
    } catch (error) {
      showNotification(
        error.message || "Failed to update announcement.",
        "error",
        4000,
      );
    }
  };

  const handleEdit = (announcement) => {
    setEditingAnnouncement(announcement);
    setIsEditingModalOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingAnnouncement(null);
    setIsEditingModalOpen(false);
  };

  const handleDeleteClick = (id) => {
    setAnnouncementToDelete(id);
  };

  const cancelDelete = () => {
    if (!deleteAnnouncement.isPending) {
      setAnnouncementToDelete(null);
    }
  };

  const confirmDelete = async () => {
    if (!announcementToDelete) return;
    try {
      await deleteAnnouncement.mutateAsync(announcementToDelete);
      showNotification("Announcement deleted successfully.", "success", 3500);
      setAnnouncementToDelete(null);
    } catch (error) {
      showNotification(error.message || "Failed to delete announcement.", "error", 4000);
    }
  };

  return (
    <div className="admin-announcements-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Announcements</h1>
        <p className="admin-page-subtitle">
          Publish tenant-facing updates to the announcement feed and notification
          bell.
        </p>
      </div>

      <div className="admin-stat-cards">
        <article className="admin-stat-card">
          <p className="admin-stat-label">Recent Posts</p>
          <p className="admin-stat-value">{stats.total}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Policies</p>
          <p className="admin-stat-value">{stats.policies}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Scheduled</p>
          <p className="admin-stat-value">{stats.scheduled}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Ack Required</p>
          <p className="admin-stat-value">{stats.ackRequired}</p>
        </article>
      </div>

      <div className="admin-announcements-grid">
        <section className="admin-announcements-card">
          <div className="admin-announcements-card__header">
            <div>
              <h2>Publish Notice</h2>
              <p>Draft, schedule, or publish announcements and governed policy updates.</p>
            </div>
            <Megaphone size={20} />
          </div>

          <form className="admin-announcements-form" onSubmit={handleSubmit}>
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
                <span>Record Type</span>
                <select
                  value={form.contentType}
                  onChange={(event) => handleChange("contentType", event.target.value)}
                >
                  <option value="announcement">Announcement</option>
                  <option value="policy">Policy</option>
                </select>
              </label>

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
                <span>Publish Mode</span>
                <select
                  value={form.publicationStatus}
                  onChange={(event) =>
                    handleChange("publicationStatus", event.target.value)
                  }
                >
                  <option value="published">Publish now</option>
                  <option value="scheduled">Schedule</option>
                  <option value="draft">Save draft</option>
                </select>
              </label>
            </div>

            <div className="admin-announcements-form__row">
              <label className="admin-announcements-field">
                <span>Target Branch</span>
                {isOwner ? (
                  <select
                    value={form.targetBranch}
                    onChange={(event) =>
                      handleChange("targetBranch", event.target.value)
                    }
                  >
                    <option value="both">All Branches</option>
                    {BRANCH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formatAnnouncementBranch(defaultBranch)}
                    readOnly
                  />
                )}
              </label>

              {form.publicationStatus === "scheduled" && (
                <>
                  <label className="admin-announcements-field">
                    <span>Starts At</span>
                    <input
                      type="datetime-local"
                      value={form.startsAt || ""}
                      onChange={(event) => handleChange("startsAt", event.target.value)}
                    />
                  </label>

                  <label className="admin-announcements-field">
                    <span>Ends At</span>
                    <input
                      type="datetime-local"
                      value={form.endsAt || ""}
                      onChange={(event) => handleChange("endsAt", event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>

            {form.contentType === "policy" ? (
              <div className="admin-announcements-form__row">
                <label className="admin-announcements-field">
                  <span>Policy Key</span>
                  <input
                    type="text"
                    value={form.policyKey}
                    onChange={(event) => handleChange("policyKey", event.target.value)}
                    placeholder="house-rules"
                  />
                </label>

                <label className="admin-announcements-field">
                  <span>Version</span>
                  <input
                    type="number"
                    min="1"
                    value={form.version}
                    onChange={(event) => handleChange("version", event.target.value)}
                  />
                </label>

                <label className="admin-announcements-field">
                  <span>Effective Date</span>
                  <input
                    type="datetime-local"
                    value={form.effectiveDate}
                    onChange={(event) =>
                      handleChange("effectiveDate", event.target.value)
                    }
                  />
                </label>
              </div>
            ) : null}

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
                onChange={(event) =>
                  handleChange("requiresAcknowledgment", event.target.checked)
                }
              />
              <span>
                <strong>Require acknowledgment</strong>
                <small>
                  Track which tenants confirmed they saw this update.
                </small>
              </span>
            </label>

            <label className="admin-announcements-toggle">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(event) => handleChange("isPinned", event.target.checked)}
              />
              <span>
                <strong>Pin this notice</strong>
                <small>Keep this notice near the top of the tenant feed.</small>
              </span>
            </label>

            <div className="admin-announcements-actions">
              <button
                className="admin-btn-primary"
                type="submit"
                disabled={createAnnouncement.isPending}
              >
                {createAnnouncement.isPending ? (
                  <LoaderCircle
                    size={16}
                    className="admin-announcements-spin"
                  />
                ) : (
                  <Send size={16} />
                )}
                {createAnnouncement.isPending
                  ? "Publishing..."
                  : form.publicationStatus === "draft"
                    ? "Save Draft"
                    : form.publicationStatus === "scheduled"
                      ? "Schedule Notice"
                      : form.contentType === "policy"
                        ? "Publish Policy"
                        : "Publish Announcement"}
              </button>
            </div>
          </form>
        </section>

        <section className="admin-announcements-card">
          <div className="admin-announcements-card__header">
            <div>
              <h2>Recent Announcements</h2>
              <p>Latest tenant-facing announcements in your admin scope.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={handleExport}
                disabled={announcements.length === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <FileDown size={15} />
                Export CSV
              </button>
              {isFetching ? (
                <LoaderCircle
                  size={18}
                  className="admin-announcements-spin"
                />
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="admin-announcements-list admin-announcements-list--loading">
              {[1, 2, 3].map((item) => (
                <div key={item} className="admin-announcements-skeleton" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="admin-announcements-empty">
              <Megaphone size={28} />
              <h3>No announcements yet</h3>
              <p>Your published announcements will appear here.</p>
            </div>
          ) : (
            <div className="admin-announcements-list">
              {announcements.map((announcement) => {
                const categoryMeta = getAnnouncementCategoryMeta(
                  announcement.category,
                );

                return (
                  <article
                    key={announcement.id}
                    className="admin-announcement-item"
                  >
                    <div className="admin-announcement-item__top">
                      <div>
                        <h3>{announcement.title}</h3>
                        <p>{announcement.content}</p>
                        {announcement.contentType === "policy" ? (
                          <p style={{ marginTop: 8, color: "#64748B", fontSize: 13 }}>
                            Policy key: {announcement.policyKey || "auto"} • Version {announcement.version || 1}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`admin-announcement-pill admin-announcement-pill--${categoryMeta.tone}`}
                      >
                        {categoryMeta.label}
                      </span>
                    </div>

                    <div className="admin-announcement-item__meta">
                      <span className="admin-announcement-pill admin-announcement-pill--branch">
                        {formatAnnouncementBranch(announcement.targetBranch)}
                      </span>
                      {announcement.requiresAcknowledgment ? (
                        <span className="admin-announcement-pill admin-announcement-pill--ack">
                          <ShieldAlert size={13} />
                          {announcement.acknowledgmentCount || 0}/{announcement.recipientCount || 0} acknowledged
                        </span>
                      ) : (
                        <span className="admin-announcement-pill admin-announcement-pill--notify">
                          <BellRing size={13} />
                          Bell Notification
                        </span>
                      )}
                      <span className="admin-announcement-meta-text">
                        {announcement.startsAt
                          ? `Starts ${formatDateTime(announcement.startsAt)}`
                          : "No start date"}
                      </span>
                      <span className="admin-announcement-meta-text">
                        {announcement.publicationStatus}
                      </span>
                      <span className="admin-announcement-meta-text">
                        Views {announcement.viewCount || 0}
                      </span>
                      <div className="admin-announcement-item__actions style-overrides">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          title="Edit Announcement"
                          onClick={() => handleEdit(announcement)}
                          disabled={deleteAnnouncement.isPending || updateAnnouncement.isPending}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn--danger"
                          title="Delete Announcement"
                          onClick={() => handleDeleteClick(announcement.id)}
                          disabled={deleteAnnouncement.isPending || updateAnnouncement.isPending}
                        >
                          {deleteAnnouncement.isPending ? <LoaderCircle size={15} className="admin-announcements-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AdminAnnouncementModal
        isOpen={isEditingModalOpen}
        onClose={handleCancelEdit}
        onSubmit={handleEditSubmit}
        isPending={updateAnnouncement.isPending}
        initialData={editingAnnouncement}
        isOwner={isOwner}
        defaultBranch={defaultBranch}
      />

        <ConfirmModal
          isOpen={!!announcementToDelete}
          onClose={cancelDelete}
          onConfirm={confirmDelete}
          title="Delete Announcement"
          message="Are you sure you want to delete this announcement? This action cannot be undone."
          confirmText="Delete Announcement"
          variant="danger"
          loading={deleteAnnouncement.isPending}
        />    </div>
  );
}
