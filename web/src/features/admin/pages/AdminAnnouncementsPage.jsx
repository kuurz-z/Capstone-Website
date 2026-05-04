import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Clock,
  FileDown,
  LoaderCircle,
  Megaphone,
  Pencil,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  X,
  Bell,
  CalendarDays,
  Receipt,
  ScrollText,
  Siren,
  TriangleAlert,
  Wrench,
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
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 16);
};

/**
 * Map the tone key returned by getAnnouncementCategoryMeta()
 * to inline CSS using design tokens — no raw Tailwind color classes.
 */

const CATEGORY_ICON_MAP = {
  Megaphone:     Megaphone,
  Bell:          Bell,
  Wrench:        Wrench,
  Siren:         Siren,
  ScrollText:    ScrollText,
  CalendarDays:  CalendarDays,
  Receipt:       Receipt,
  TriangleAlert: TriangleAlert,
};

const TONE_STYLES = {
  green: {
    background: "color-mix(in srgb, var(--success) 14%, var(--card))",
    color: "var(--success-dark)",
  },
  amber: {
    background: "color-mix(in srgb, var(--warning) 14%, var(--card))",
    color: "var(--warning-dark)",
  },
  blue: {
    background: "color-mix(in srgb, var(--info) 14%, var(--card))",
    color: "var(--info-dark)",
  },
  red: {
    background: "color-mix(in srgb, var(--danger) 14%, var(--card))",
    color: "var(--danger-dark)",
  },
  purple: {
    background: "color-mix(in srgb, var(--chart-4) 14%, var(--card))",
    color: "var(--chart-4)",
  },
  // ↓ NEW — distinct from amber, used for "reminder"
  teal: {
    background: "color-mix(in srgb, var(--chart-2) 14%, var(--card))",
    color: "var(--chart-2)",
  },
  slate: {
    background: "var(--muted)",
    color: "var(--muted-foreground)",
  },
  orange: {
  background: "color-mix(in srgb, var(--chart-3) 14%, var(--card))",
  color: "var(--chart-3)",
},
};
const getToneStyle = (tone) => TONE_STYLES[tone] ?? TONE_STYLES.slate;

/** Record-type (announcement vs policy) distinct pill styles */
const RECORD_TYPE_STYLES = {
  announcement: {
    background: "color-mix(in srgb, var(--primary) 18%, var(--card))",
    color: "var(--warning-dark)", // gold-on-gold-tint
    label: "Announcement",
  },
  policy: {
    background: "color-mix(in srgb, var(--secondary) 18%, var(--card))",
    color: "var(--info-dark)",
    label: "Policy",
  },
};
const getRecordTypeStyle = (contentType) =>
  RECORD_TYPE_STYLES[contentType] ?? RECORD_TYPE_STYLES.announcement;

const getAnnouncementDate = (a) =>
  a.startsAt || a.effectiveDate || a.createdAt || a.updatedAt || new Date().toISOString();

const formatMonthYear = (value) =>
  new Date(value).toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();

const groupAnnouncementsByMonth = (announcements) => {
  const grouped = new Map();
  announcements.forEach((a) => {
    const key = formatMonthYear(getAnnouncementDate(a));
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a);
  });
  return Array.from(grouped.entries()).map(([month, items]) => ({ month, items }));
};

/** Shared focus ring helper — uses var(--ring) */
const ringFocus = {
  style: { outlineColor: "var(--ring)" },
  onFocus: (e) => {
    e.currentTarget.style.borderColor = "var(--ring)";
    e.currentTarget.style.boxShadow =
      "0 0 0 2px color-mix(in srgb, var(--ring) 20%, transparent)";
  },
  onBlur: (e) => {
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.boxShadow = "";
  },
};

/** Acknowledgement counter badge — only renders when requiresAcknowledgment is true */
function AckBadge({ announcement }) {
  if (!announcement.requiresAcknowledgment) return null;
  const acked = announcement.acknowledgmentCount ?? 0;
  const total = announcement.recipientCount ?? 0;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: "color-mix(in srgb, var(--chart-4) 14%, var(--card))",
        color: "var(--chart-4)",
      }}
    >
      <ShieldAlert size={12} />
      Acknowledgement Required
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
        style={{ background: "var(--chart-4)", color: "var(--card)" }}
      >
        {acked}/{total}
      </span>
    </span>
  );
}

/** Shared announcement row — used in both the recent list and the all-announcements modal */
function AnnouncementCard({ announcement, onEdit, onDelete, isPendingDelete }) {
  const categoryMeta = getAnnouncementCategoryMeta(announcement.category);
  const toneStyle = getToneStyle(categoryMeta.tone);
  const recordStyle = getRecordTypeStyle(announcement.contentType);
  const CategoryIcon = CATEGORY_ICON_MAP[categoryMeta.icon] ?? Megaphone;

  const pubStatusStyle =
    announcement.publicationStatus === "published"
      ? {
          background: "color-mix(in srgb, var(--success) 12%, var(--card))",
          color: "var(--success-dark)",
        }
      : announcement.publicationStatus === "scheduled"
        ? {
            background: "color-mix(in srgb, var(--info) 12%, var(--card))",
            color: "var(--info-dark)",
          }
        : { background: "var(--muted)", color: "var(--muted-foreground)" };

  const pubStatusLabel =
    announcement.publicationStatus === "published"
      ? "Published"
      : announcement.publicationStatus === "scheduled"
        ? "Scheduled"
        : "Draft";

  return (
    <article className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium leading-5 text-card-foreground">
            {announcement.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {announcement.content}
          </p>
          {announcement.contentType === "policy" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Policy key: {announcement.policyKey || "auto"} · Version{" "}
              {announcement.version || 1}
            </p>
          )}

          {/* Pill row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Category */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={toneStyle}
            >
              <CategoryIcon size={11} />   {/* ← add this line */}
              {categoryMeta.label}
            </span>

            {/* Record type */}
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: recordStyle.background, color: recordStyle.color }}
            >
              {recordStyle.label}
            </span>

            {/* Publication status */}
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              style={pubStatusStyle}
            >
              {pubStatusLabel}
            </span>

            {/* Acknowledgement badge — only when checked */}
            <AckBadge announcement={announcement} />
          </div>

          {/* Meta line */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {announcement.startsAt
                ? formatDateTime(announcement.startsAt)
                : "No start date"}
            </span>
            <span>·</span>
            <span>{formatAnnouncementBranch(announcement.targetBranch)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-start gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onEdit(announcement)}
            disabled={isPendingDelete}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:opacity-40"
            aria-label="Edit announcement"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(announcement.id)}
            disabled={isPendingDelete}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground disabled:opacity-40"
            style={{ "--hover-bg": "var(--danger-light)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--danger-light)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            onMouseDown={(e) => (e.currentTarget.style.color = "var(--danger)")}
            onMouseUp={(e) => (e.currentTarget.style.color = "")}
            aria-label="Delete announcement"
          >
            {isPendingDelete ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════ */
export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { can, isOwner } = usePermissions();
  const [form, setForm] = useState(INITIAL_FORM);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);
  const [isAllAnnouncementsOpen, setIsAllAnnouncementsOpen] = useState(false);

  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const { data, isLoading, isFetching } = useAdminAnnouncements(20);

  const announcements = data?.announcements || [];
  const defaultBranch = user?.branch || "both";

  const stats = useMemo(
    () => ({
      drafts: announcements.filter((a) => a.publicationStatus === "draft").length,
      active: announcements.filter((a) => a.publicationStatus === "published").length,
      scheduled: announcements.filter((a) => a.publicationStatus === "scheduled").length,
      sent: announcements.filter((a) => a.publicationStatus === "published").length,
    }),
    [announcements],
  );

  if (!can("manageAnnouncements")) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleChange = (field, value) => {
    setForm((prev) => {
      if (field === "contentType" && value === "policy") {
        return { ...prev, contentType: value, category: "policy", requiresAcknowledgment: true };
      }
      if (field === "publicationStatus" && value === "scheduled" && !prev.startsAt) {
        return {
          ...prev,
          publicationStatus: value,
          startsAt: toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)),
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleExport = () => {
    exportToCSV(
      announcements.map((a) => ({
        title: a.title,
        type: a.contentType || "announcement",
        category: a.category,
        branch: formatAnnouncementBranch(a.targetBranch),
        publicationStatus: a.publicationStatus,
        startsAt: a.startsAt ? formatDateTime(a.startsAt) : "",
        endsAt: a.endsAt ? formatDateTime(a.endsAt) : "",
        requiresAck: a.requiresAcknowledgment ? "Yes" : "No",
        acknowledgmentCount: a.acknowledgmentCount || 0,
        recipientCount: a.recipientCount || 0,
        completion: `${a.acknowledgmentCompletionPercent || 0}%`,
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
      startsAt: form.publicationStatus === "scheduled" ? form.startsAt || undefined : undefined,
      endsAt: form.publicationStatus === "scheduled" ? form.endsAt || undefined : undefined,
      isPinned: form.isPinned,
    };
    if (form.contentType === "policy") {
      payload.policyKey = form.policyKey.trim();
      payload.version = Number(form.version) || 1;
      payload.effectiveDate = form.effectiveDate || form.startsAt || undefined;
    }
    if (isOwner) payload.targetBranch = form.targetBranch;

    try {
      const result = await createAnnouncement.mutateAsync(payload);
      showNotification(
        `${form.contentType === "policy" ? "Policy" : "Announcement"} saved for ${result.recipientCount} tenant${result.recipientCount === 1 ? "" : "s"}.`,
        "success",
        3500,
      );
      setForm({ ...INITIAL_FORM, targetBranch: isOwner ? "both" : defaultBranch });
    } catch (error) {
      showNotification(error.message || "Failed to publish announcement.", "error", 4000);
    }
  };

  const handleEditSubmit = async (payload) => {
    try {
      await updateAnnouncement.mutateAsync({ id: editingAnnouncement.id, data: payload });
      showNotification("Announcement updated successfully.", "success", 3500);
      setIsEditingModalOpen(false);
      setEditingAnnouncement(null);
    } catch (error) {
      showNotification(error.message || "Failed to update announcement.", "error", 4000);
    }
  };

  const handleEdit = (a) => { setEditingAnnouncement(a); setIsEditingModalOpen(true); };
  const handleCancelEdit = () => { setEditingAnnouncement(null); setIsEditingModalOpen(false); };
  const handleDeleteClick = (id) => setAnnouncementToDelete(id);
  const cancelDelete = () => { if (!deleteAnnouncement.isPending) setAnnouncementToDelete(null); };
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
    <div>
      <div>
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Broadcast system-level announcements to specific audiences
          </p>
        </header>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "TOTAL DRAFTS", value: stats.drafts },
            { label: "ACTIVE", value: stats.active },
            { label: "SCHEDULED", value: stats.scheduled },
            { label: "ALL SENT / PUBLISHED", value: stats.sent },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-[30px] font-medium leading-none text-card-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 items-stretch gap-4">          {/* ── Compose panel ── */}
          <section
            className="col-span-12 flex flex-col overflow-hidden rounded-lg border border-border bg-card xl:col-span-5"
          >
            <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold leading-none text-card-foreground">
                  <Megaphone size={16} className="text-primary" />
                  Publish Announcement
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Publish notice to general audiences
                </p>
              </div>
            </div>

<form className="flex flex-1 flex-col justify-between px-6 py-6" onSubmit={handleSubmit}>
  <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {/* Title */}
                <label className="block">
                  <span className="text-sm font-medium text-card-foreground">Title</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    placeholder="Enter announcement title"
                    maxLength={120}
                    required
                    className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
                    {...ringFocus}
                  />
                </label>

                {/* Message */}
                <label className="block">
                  <span className="text-sm font-medium text-card-foreground">Message</span>
                  <textarea
                    value={form.content}
                    onChange={(e) => handleChange("content", e.target.value)}
                    placeholder="Write the announcement message, policy, or reminder here"
                    rows={5}
                    maxLength={2000}
                    required
                    className="mt-2 min-h-[122px] w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
                    {...ringFocus}
                  />
                </label>

                {/* Record type / Category / Publish mode */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label>
                    <span className="text-xs font-medium text-muted-foreground">Record Type</span>
                    <select
                      value={form.contentType}
                      onChange={(e) => handleChange("contentType", e.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                      {...ringFocus}
                    >
                      <option value="announcement">Announcement</option>
                      <option value="policy">Policy</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-xs font-medium text-muted-foreground">Category</span>
                    <select
                      value={form.category}
                      onChange={(e) => handleChange("category", e.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                      {...ringFocus}
                    >
                      {ANNOUNCEMENT_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs font-medium text-muted-foreground">Publish Mode</span>
                    <select
                      value={form.publicationStatus}
                      onChange={(e) => handleChange("publicationStatus", e.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                      {...ringFocus}
                    >
                      <option value="published">Publish now</option>
                      <option value="scheduled">Schedule</option>
                      <option value="draft">Save draft</option>
                    </select>
                  </label>
                </div>

                {/* Target branch */}
                <label className="block">
                  <span className="text-sm font-medium text-card-foreground">Target Branch</span>
                  {isOwner ? (
                    <select
                      value={form.targetBranch}
                      onChange={(e) => handleChange("targetBranch", e.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                      {...ringFocus}
                    >
                      <option value="both">All Branches</option>
                      {BRANCH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formatAnnouncementBranch(defaultBranch)}
                      readOnly
                      className="mt-2 h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground"
                    />
                  )}
                </label>

                {/* Scheduling */}
                {form.publicationStatus === "scheduled" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[{ label: "Starts At", field: "startsAt" }, { label: "Ends At", field: "endsAt" }].map(({ label, field }) => (
                      <label key={field}>
                        <span className="text-xs font-medium text-muted-foreground">{label}</span>
                        <input
                          type="datetime-local"
                          value={form[field] || ""}
                          onChange={(e) => handleChange(field, e.target.value)}
                          className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                          {...ringFocus}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {/* Policy fields */}
                {form.contentType === "policy" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label>
                      <span className="text-xs font-medium text-muted-foreground">Policy Key</span>
                      <input
                        type="text"
                        value={form.policyKey}
                        onChange={(e) => handleChange("policyKey", e.target.value)}
                        placeholder="house-rules"
                        className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                        {...ringFocus}
                      />
                    </label>
                    <label>
                      <span className="text-xs font-medium text-muted-foreground">Version</span>
                      <input
                        type="number"
                        min="1"
                        value={form.version}
                        onChange={(e) => handleChange("version", e.target.value)}
                        className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                        {...ringFocus}
                      />
                    </label>
                    <label>
                      <span className="text-xs font-medium text-muted-foreground">Effective Date</span>
                      <input
                        type="datetime-local"
                        value={form.effectiveDate}
                        onChange={(e) => handleChange("effectiveDate", e.target.value)}
                        className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
                        {...ringFocus}
                      />
                    </label>
                  </div>
                )}

                {/* Checkboxes */}
                <div className="flex flex-col gap-2">
                  {[
                    {
                      field: "requiresAcknowledgment",
                      checked: form.requiresAcknowledgment,
                      title: "Require acknowledgement",
                      desc: "Track which tenants confirmed they saw this update.",
                    },
                    {
                      field: "isPinned",
                      checked: form.isPinned,
                      title: "Pin this notice",
                      desc: "Keep this notice near the top of the tenant feed.",
                    },
                  ].map(({ field, checked, title, desc }) => (
                    <label
                      key={field}
                      className="flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3"
                      style={{
                        borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))",
                        background: "color-mix(in srgb, var(--warning) 8%, var(--card))",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleChange(field, e.target.checked)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-semibold text-card-foreground">{title}</div>
                        <div className="text-xs text-muted-foreground">{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="shrink-0 pt-4">
                <button
                  type="submit"
                  disabled={createAnnouncement.isPending}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-[15px] font-medium disabled:opacity-60"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {createAnnouncement.isPending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  <span>
                    {createAnnouncement.isPending
                      ? "Publishing..."
                      : form.publicationStatus === "draft"
                        ? "Save Draft"
                        : form.publicationStatus === "scheduled"
                          ? "Schedule Notice"
                          : form.contentType === "policy"
                            ? "Publish Policy"
                            : "Publish Announcement"}
                  </span>
                </button>
              </div>
            </form>
          </section>

          {/* ── Recent panel ── */}
          <section
            className="col-span-12 flex h-[780px] flex-col overflow-hidden rounded-lg border border-border bg-card xl:col-span-7"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-primary" />
                  <h2 className="text-lg font-semibold leading-none text-card-foreground">
                    Recent Announcements
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Latest broadcasts showing announcement groups
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {announcements.length} total
                </span>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={announcements.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-card-foreground hover:bg-muted disabled:opacity-40"
                >
                  <FileDown size={14} /> Export CSV
                </button>
                {isFetching && (
                  <LoaderCircle size={18} className="animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
              {isLoading ? (
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-md border border-border bg-muted" />
                  ))}
                </div>
              ) : announcements.length === 0 ? (
                <div className="flex-1 px-6 py-10 text-center">
                  <Megaphone size={28} className="mx-auto text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold text-card-foreground">No announcements yet</h3>
                  <p className="text-sm text-muted-foreground">Your published announcements will appear here.</p>
                </div>
              ) : (
                <div className="flex-1 divide-y divide-border overflow-y-auto">
                  {announcements.map((a) => (
                    <AnnouncementCard
                      key={a.id}
                      announcement={a}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      isPendingDelete={deleteAnnouncement.isPending}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setIsAllAnnouncementsOpen(true)}
                className="h-10 w-full rounded-md border border-border bg-card px-4 text-sm font-medium text-card-foreground hover:bg-muted"
              >
                View All Announcements
              </button>
            </div>
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
        />

        <AllAnnouncementsModal
          isOpen={isAllAnnouncementsOpen}
          onClose={() => setIsAllAnnouncementsOpen(false)}
          announcements={announcements}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ALL ANNOUNCEMENTS MODAL
═══════════════════════════════════════════ */
function AllAnnouncementsModal({ isOpen, onClose, announcements, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (isOpen) {
      setSearch(""); setStatusFilter("all"); setCategoryFilter("all");
      setBranchFilter("all"); setTypeFilter("all");
    }
  }, [isOpen]);

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase();
    return announcements.filter((a) => {
      const matchesQuery =
        !query ||
        [a.title, a.content, a.policyKey, a.category, a.targetBranch]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query));
      return (
        matchesQuery &&
        (statusFilter === "all" || a.publicationStatus === statusFilter) &&
        (categoryFilter === "all" || a.category === categoryFilter) &&
        (branchFilter === "all" || a.targetBranch === branchFilter) &&
        (typeFilter === "all" || a.contentType === typeFilter)
      );
    });
  }, [announcements, branchFilter, categoryFilter, search, statusFilter, typeFilter]);

  const groupedAnnouncements = useMemo(
    () => groupAnnouncementsByMonth(filteredAnnouncements),
    [filteredAnnouncements],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "color-mix(in srgb, var(--background) 55%, transparent)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="All Announcements"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-[17px] font-semibold text-card-foreground">All Announcements</h2>
            <p className="mt-1 text-xs text-muted-foreground">Browse and manage all announcements</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-card-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap gap-3 border-b border-border px-6 py-4">
          <label className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
              {...ringFocus}
            />
          </label>
          {[
            { value: statusFilter, onChange: setStatusFilter, opts: [
              { value: "all", label: "All statuses" },
              { value: "published", label: "Published" },
              { value: "scheduled", label: "Scheduled" },
              { value: "draft", label: "Draft" },
            ]},
            { value: categoryFilter, onChange: setCategoryFilter, opts: [
              { value: "all", label: "All categories" },
              ...ANNOUNCEMENT_CATEGORY_OPTIONS,
            ]},
            { value: branchFilter, onChange: setBranchFilter, opts: [
              { value: "all", label: "All branches" },
              ...BRANCH_OPTIONS,
            ]},
            { value: typeFilter, onChange: setTypeFilter, opts: [
              { value: "all", label: "All types" },
              { value: "announcement", label: "Announcement" },
              { value: "policy", label: "Policy" },
            ]},
          ].map((sel, idx) => (
            <select
              key={idx}
              value={sel.value}
              onChange={(e) => sel.onChange(e.target.value)}
              className="h-10 w-36 rounded-md border border-border bg-card px-3 text-sm text-card-foreground focus:outline-none"
              {...ringFocus}
            >
              {sel.opts.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {groupedAnnouncements.length === 0 ? (
            <div className="flex h-full items-center justify-center py-10 text-center">
              <div>
                <Megaphone size={28} className="mx-auto text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold text-card-foreground">No announcements found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting the filters.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedAnnouncements.map((group) => (
                <section key={group.month} className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group.month}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="divide-y divide-border">
                      {group.items.map((a) => (
                        <AnnouncementCard
                          key={a.id}
                          announcement={a}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          isPendingDelete={false}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}