import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X, Save } from "lucide-react";
import {
 ANNOUNCEMENT_CATEGORY_OPTIONS,
 formatAnnouncementBranch,
} from "../../../shared/utils/announcementConfig";
import { BRANCH_OPTIONS } from "../../../shared/utils/constants";
import "../styles/admin-common.css";
import "../styles/admin-announcements.css";

const toDateTimeLocal = (value) => {
 if (!value) return "";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "";
 const offset = date.getTimezoneOffset();
 return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
};

const normalizeInitialData = (data) =>
 data
 ? {
 ...data,
 startsAt: toDateTimeLocal(data.startsAt),
 endsAt: toDateTimeLocal(data.endsAt),
 effectiveDate: toDateTimeLocal(data.effectiveDate),
 }
 : data;

export default function AdminAnnouncementModal({
 isOpen,
 onClose,
 onSubmit,
 isPending,
 initialData,
 isOwner,
 defaultBranch,
}) {
 const normalizedInitialData = useMemo(
 () => normalizeInitialData(initialData),
 [initialData],
 );
 const [form, setForm] = useState(normalizedInitialData);

 useEffect(() => {
 if (isOpen && initialData) {
 setForm(normalizedInitialData);
 }
 }, [isOpen, normalizedInitialData, initialData]);

 if (!isOpen || !form) return null;

 const handleChange = (field, value) => {
 setForm((prev) => {
 if (field === "contentType" && value === "policy") {
 return {
 ...prev,
 contentType: value,
 category: "policy",
 requiresAcknowledgment: true,
 };
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

 const hasChanges =
 normalizedInitialData &&
 JSON.stringify(form) !== JSON.stringify(normalizedInitialData);

 const handleFormSubmit = (e) => {
 e.preventDefault();
 onSubmit({
 title: form.title.trim(),
 content: form.content.trim(),
 contentType: form.contentType || "announcement",
 category: form.category,
 targetBranch: form.targetBranch,
 requiresAcknowledgment: form.requiresAcknowledgment,
 publicationStatus: form.publicationStatus,
 startsAt: form.publicationStatus === "scheduled" ? (form.startsAt || undefined) : undefined,
 endsAt: form.publicationStatus === "scheduled" ? (form.endsAt || undefined) : undefined,
 policyKey: form.policyKey || undefined,
 version: Number(form.version) || 1,
 effectiveDate: form.effectiveDate || undefined,
 isPinned: Boolean(form.isPinned),
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
 <span>Record Type</span>
 <select
 value={form.contentType || "announcement"}
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
 value={form.publicationStatus || "published"}
 onChange={(event) => handleChange("publicationStatus", event.target.value)}
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
 value={form.policyKey || ""}
 onChange={(event) => handleChange("policyKey", event.target.value)}
 />
 </label>

 <label className="admin-announcements-field">
 <span>Version</span>
 <input
 type="number"
 min="1"
 value={form.version || 1}
 onChange={(event) => handleChange("version", event.target.value)}
 />
 </label>

 <label className="admin-announcements-field">
 <span>Effective Date</span>
 <input
 type="datetime-local"
 value={form.effectiveDate || ""}
 onChange={(event) => handleChange("effectiveDate", event.target.value)}
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
 onChange={(event) => handleChange("requiresAcknowledgment", event.target.checked)}
 />
 <span>
 <strong>Require acknowledgment</strong>
 <small>Track which tenants confirmed they saw this update.</small>
 </span>
 </label>

 <label className="admin-announcements-toggle">
 <input
 type="checkbox"
 checked={Boolean(form.isPinned)}
 onChange={(event) => handleChange("isPinned", event.target.checked)}
 />
 <span>
 <strong>Pin this notice</strong>
 <small>Keep this notice near the top of the tenant feed.</small>
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
