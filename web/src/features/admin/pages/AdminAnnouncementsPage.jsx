import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  BellRing,
  LoaderCircle,
  Megaphone,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { showNotification } from "../../../shared/utils/notification";
import { BRANCH_OPTIONS } from "../../../shared/utils/constants";
import {
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  formatAnnouncementBranch,
  getAnnouncementCategoryMeta,
} from "../../../shared/utils/announcementConfig";
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
} from "../../../shared/hooks/queries/useAnnouncements";
import "../styles/design-tokens.css";
import "../styles/admin-common.css";
import "../styles/admin-announcements.css";

const INITIAL_FORM = {
  title: "",
  content: "",
  category: "general",
  targetBranch: "both",
  requiresAcknowledgment: false,
};

const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { can, isOwner } = usePermissions();
  const [form, setForm] = useState(INITIAL_FORM);

  const createAnnouncement = useCreateAnnouncement();
  const { data, isLoading, isFetching } = useAdminAnnouncements(20);

  const announcements = data?.announcements || [];
  const defaultBranch = user?.branch || "both";

  const stats = useMemo(
    () => ({
      total: announcements.length,
      ackRequired: announcements.filter((item) => item.requiresAcknowledgment)
        .length,
      latestBranch:
        announcements.length > 0
          ? formatAnnouncementBranch(announcements[0].targetBranch)
          : formatAnnouncementBranch(isOwner ? "both" : defaultBranch),
    }),
    [announcements, defaultBranch, isOwner],
  );

  if (!can("manageAnnouncements")) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleChange = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category,
      requiresAcknowledgment: form.requiresAcknowledgment,
    };

    if (isOwner) {
      payload.targetBranch = form.targetBranch;
    }

    try {
      const result = await createAnnouncement.mutateAsync(payload);
      showNotification(
        `Announcement published to ${result.recipientCount} tenant${
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
          <p className="admin-stat-label">Ack Required</p>
          <p className="admin-stat-value">{stats.ackRequired}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-label">Primary Scope</p>
          <p className="admin-stat-value">{stats.latestBranch}</p>
        </article>
      </div>

      <div className="admin-announcements-grid">
        <section className="admin-announcements-card">
          <div className="admin-announcements-card__header">
            <div>
              <h2>Publish Announcement</h2>
              <p>Tenant-only delivery with optional acknowledgment tracking.</p>
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
            {isFetching ? (
              <LoaderCircle
                size={18}
                className="admin-announcements-spin"
              />
            ) : null}
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
                          Ack Required
                        </span>
                      ) : (
                        <span className="admin-announcement-pill admin-announcement-pill--notify">
                          <BellRing size={13} />
                          Bell Notification
                        </span>
                      )}
                      <span className="admin-announcement-meta-text">
                        {formatDateTime(announcement.publishedAt)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
