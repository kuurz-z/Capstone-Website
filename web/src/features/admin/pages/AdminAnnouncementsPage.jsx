import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
 BellRing,
 FileDown,
 LoaderCircle,
 Megaphone,
 Pencil,
 Search,
 Send,
 ShieldAlert,
 Trash2,
 X,
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

const CARD_HEIGHT_CLASS = "h-[720px]";

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

const getToneClasses = (tone) => {
 const tones = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200",
 };

 return tones[tone] || tones.slate;
};

const getAnnouncementDate = (announcement) =>
 announcement.startsAt ||
 announcement.effectiveDate ||
 announcement.createdAt ||
 announcement.updatedAt ||
 new Date().toISOString();

const formatMonthYear = (value) =>
 new Date(value).toLocaleString("en-US", {
  month: "long",
  year: "numeric",
 }).toUpperCase();

const groupAnnouncementsByMonth = (announcements) => {
 const grouped = new Map();

 announcements.forEach((announcement) => {
  const dateValue = getAnnouncementDate(announcement);
  const monthKey = formatMonthYear(dateValue);

  if (!grouped.has(monthKey)) {
   grouped.set(monthKey, []);
  }

  grouped.get(monthKey).push(announcement);
 });

 return Array.from(grouped.entries()).map(([month, items]) => ({ month, items }));
};

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
   drafts: announcements.filter((item) => item.publicationStatus === "draft").length,
   active: announcements.filter((item) => item.publicationStatus === "published").length,
   scheduled: announcements.filter((item) => item.publicationStatus === "scheduled").length,
   sent: announcements.filter((item) => item.publicationStatus === "published").length,
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
    }.` ,
    "success",
    3500,
   );
   setForm({
    ...INITIAL_FORM,
    targetBranch: isOwner ? "both" : defaultBranch,
   });
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

 const handleEdit = (announcement) => {
  setEditingAnnouncement(announcement);
  setIsEditingModalOpen(true);
 };

 const openAllAnnouncements = () => {
  setIsAllAnnouncementsOpen(true);
 };

 const closeAllAnnouncements = () => {
  setIsAllAnnouncementsOpen(false);
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
  <div className="text-slate-800 dark:bg-[#0b1221] dark:text-slate-100">
   <div>
    <header className="mb-4">
     <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
     <p className="mt-1 text-xs text-slate-500 dark:text-slate-300/70">Broadcast system-level announcements to specific audiences</p>
    </header>

    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
     <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/70 dark:bg-[#172237]">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400 dark:text-slate-300/55">TOTAL_DRAFTS</p>
      <p className="mt-2 text-[30px] font-medium leading-none text-slate-900 dark:text-white">{stats.drafts}</p>
     </div>
     <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/70 dark:bg-[#172237]">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400 dark:text-slate-300/55">ACTIVE</p>
      <p className="mt-2 text-[30px] font-medium leading-none text-slate-900 dark:text-white">{stats.active}</p>
     </div>
     <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/70 dark:bg-[#172237]">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400 dark:text-slate-300/55">SCHEDULED</p>
      <p className="mt-2 text-[30px] font-medium leading-none text-slate-900 dark:text-white">{stats.scheduled}</p>
     </div>
     <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/70 dark:bg-[#172237]">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400 dark:text-slate-300/55">ALL SENT/PUBLISHED</p>
      <p className="mt-2 text-[30px] font-medium leading-none text-slate-900 dark:text-white">{stats.sent}</p>
     </div>
    </div>

    <div className="grid grid-cols-12 gap-4 items-stretch">
     <section className={`col-span-12 flex ${CARD_HEIGHT_CLASS} flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700/70 dark:bg-[#172237] xl:col-span-5`}>
      <div className="flex shrink-0 items-start justify-between border-b border-slate-200/70 px-6 py-4 dark:border-slate-700/70">
       <div>
        <h2 className="text-lg font-semibold leading-none">Publish Notice</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300/70">Publish notice to general audiences</p>
       </div>
       <Megaphone size={16} className="mt-0.5 text-amber-500 dark:text-amber-400" />
      </div>

      <form className="flex flex-1 flex-col px-6 py-6" onSubmit={handleSubmit}>
       <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        <label className="block">
         <span className="text-sm font-medium">Title</span>
         <input
          type="text"
          value={form.title}
          onChange={(event) => handleChange("title", event.target.value)}
          placeholder="Enter announcement title"
          maxLength={120}
          required
          className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-slate-700 dark:placeholder:text-slate-500"
         />
        </label>

        <label className="block">
         <span className="text-sm font-medium">Message</span>
         <textarea
          value={form.content}
          onChange={(event) => handleChange("content", event.target.value)}
          placeholder="Write the announcement message, policy, or reminder here"
          rows={5}
          maxLength={2000}
          required
          className="mt-2 min-h-[122px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-slate-700 dark:placeholder:text-slate-500"
         />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
         <label>
          <span className="text-xs">Record Type</span>
          <select
           value={form.contentType}
           onChange={(event) => handleChange("contentType", event.target.value)}
           className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
          >
           <option value="announcement">Announcement</option>
           <option value="policy">Policy</option>
          </select>
         </label>

         <label>
          <span className="text-xs">Category</span>
          <select
           value={form.category}
           onChange={(event) => handleChange("category", event.target.value)}
           className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
          >
           {ANNOUNCEMENT_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
           ))}
          </select>
         </label>

         <label>
          <span className="text-xs">Publish Mode</span>
          <select
           value={form.publicationStatus}
           onChange={(event) => handleChange("publicationStatus", event.target.value)}
           className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
          >
           <option value="published">Publish now</option>
           <option value="scheduled">Schedule</option>
           <option value="draft">Save draft</option>
          </select>
         </label>
        </div>

        <label className="block">
         <span className="text-sm">Target Branch</span>
         {isOwner ? (
          <select
           value={form.targetBranch}
           onChange={(event) => handleChange("targetBranch", event.target.value)}
           className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
          >
           <option value="both">All Branches</option>
           {BRANCH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
           ))}
          </select>
         ) : (
          <input
           type="text"
           value={formatAnnouncementBranch(defaultBranch)}
           readOnly
           className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
          />
         )}
        </label>

        {form.publicationStatus === "scheduled" && (
         <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label>
           <span className="text-xs">Starts At</span>
           <input
            type="datetime-local"
            value={form.startsAt || ""}
            onChange={(event) => handleChange("startsAt", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
           />
          </label>
          <label>
           <span className="text-xs">Ends At</span>
           <input
            type="datetime-local"
            value={form.endsAt || ""}
            onChange={(event) => handleChange("endsAt", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
           />
          </label>
         </div>
        )}

        {form.contentType === "policy" && (
         <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label>
           <span className="text-xs">Policy Key</span>
           <input
            type="text"
            value={form.policyKey}
            onChange={(event) => handleChange("policyKey", event.target.value)}
            placeholder="house-rules"
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
           />
          </label>
          <label>
           <span className="text-xs">Version</span>
           <input
            type="number"
            min="1"
            value={form.version}
            onChange={(event) => handleChange("version", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
           />
          </label>
          <label>
           <span className="text-xs">Effective Date</span>
           <input
            type="datetime-local"
            value={form.effectiveDate}
            onChange={(event) => handleChange("effectiveDate", event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
           />
          </label>
         </div>
        )}

        <div className="flex flex-col gap-2">
         <label className="flex items-start gap-3 rounded-md border border-amber-100 bg-[#fff9ea] px-4 py-3 dark:border-[#4c4630] dark:bg-[#333127]">
          <input
           type="checkbox"
           checked={form.requiresAcknowledgment}
           onChange={(event) => handleChange("requiresAcknowledgment", event.target.checked)}
           className="mt-0.5"
          />
          <div>
           <div className="font-semibold">Require acknowledgment</div>
           <div className="text-xs text-slate-500 dark:text-slate-300/70">Track which tenants confirmed they saw this update.</div>
          </div>
         </label>

         <label className="flex items-start gap-3 rounded-md border border-amber-100 bg-[#fff9ea] px-4 py-3 dark:border-[#4c4630] dark:bg-[#333127]">
          <input
           type="checkbox"
           checked={form.isPinned}
           onChange={(event) => handleChange("isPinned", event.target.checked)}
           className="mt-0.5"
          />
          <div>
           <div className="font-semibold">Pin this notice</div>
           <div className="text-xs text-slate-500 dark:text-slate-300/70">Keep this notice near the top of the tenant feed.</div>
          </div>
         </label>
        </div>
       </div>

       <div className="flex shrink-0 pt-1">
        <button
         type="submit"
         disabled={createAnnouncement.isPending}
         className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#d8b23d] px-4 text-[15px] font-medium text-slate-900 hover:bg-[#dfbc51]"
        >
         {createAnnouncement.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
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

     <section className={`col-span-12 flex ${CARD_HEIGHT_CLASS} flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700/70 dark:bg-[#172237] xl:col-span-7`}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-slate-700/70">
       <div>
        <div className="flex items-center gap-2">
         <Megaphone size={15} className="text-amber-500 dark:text-amber-400" />
         <h2 className="text-lg font-semibold leading-none">Recent Announcements</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300/70">Latest broadcasts showing announcement groups</p>
       </div>
       <div className="flex items-center gap-3">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-700/60 dark:text-slate-300/70">{announcements.length} total</span>
        <button
         type="button"
         onClick={handleExport}
         disabled={announcements.length === 0}
         className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700"
        >
         <FileDown size={14} /> Export CSV
        </button>
        {isFetching ? <LoaderCircle size={18} className="animate-spin" /> : null}
       </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
       {isLoading ? (
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
         {[1, 2, 3].map((item) => (
          <div key={item} className="h-20 rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700/70 dark:bg-[#102035]" />
         ))}
        </div>
       ) : announcements.length === 0 ? (
        <div className="flex-1 px-6 py-10 text-center">
         <Megaphone size={28} className="mx-auto text-slate-400" />
         <h3 className="mt-4 text-lg font-semibold">No announcements yet</h3>
         <p className="text-sm text-slate-500 dark:text-slate-300/70">Your published announcements will appear here.</p>
        </div>
       ) : (
        <div className="flex-1 overflow-y-auto px-0 py-0">
         <div className="divide-y divide-slate-200/80 dark:divide-slate-700/70">
          {announcements.map((announcement) => {
           const categoryMeta = getAnnouncementCategoryMeta(announcement.category);

           return (
            <article key={announcement.id} className="px-6 py-4">
             <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
               <h3 className="text-[15px] font-medium leading-5 text-slate-900 dark:text-slate-50">{announcement.title}</h3>
               <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300/70">{announcement.content}</p>
               {announcement.contentType === "policy" ? (
                <p className="mt-2 text-xs text-slate-400">Policy key: {announcement.policyKey || "auto"} • Version {announcement.version || 1}</p>
               ) : null}

               <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getToneClasses(categoryMeta.tone)}`}>
                 {categoryMeta.label}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">
                 {announcement.contentType === "policy" ? "Policy" : "Announcement"}
                </span>
                {announcement.requiresAcknowledgment ? (
                 <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  <ShieldAlert size={14} /> Ack Required
                 </span>
                ) : (
                 <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  <BellRing size={14} /> Ack Required
                 </span>
                )}
               </div>

               <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                 <span className="h-3 w-3 rounded-sm border border-slate-300 dark:border-slate-600" />
                 {announcement.startsAt ? formatDateTime(announcement.startsAt) : "No start date"}
                </span>
                <span>•</span>
                <span>{formatAnnouncementBranch(announcement.targetBranch)}</span>
               </div>
              </div>

              <div className="flex shrink-0 items-start gap-2 pt-0.5">
               <button
                type="button"
                onClick={() => handleEdit(announcement)}
                disabled={deleteAnnouncement.isPending || updateAnnouncement.isPending}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
               >
                <Pencil size={14} />
               </button>
               <button
                type="button"
                onClick={() => handleDeleteClick(announcement.id)}
                disabled={deleteAnnouncement.isPending || updateAnnouncement.isPending}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-[#3b0e0e]"
               >
                {deleteAnnouncement.isPending ? <LoaderCircle size={14} /> : <Trash2 size={14} />}
               </button>
              </div>
             </div>
            </article>
           );
          })}
         </div>
        </div>
       )}
      </div>

      <div className="flex shrink-0 border-t border-slate-200/70 px-6 py-4 dark:border-slate-700/70">
       <button
        type="button"
        onClick={openAllAnnouncements}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#172237] dark:text-slate-100 dark:hover:bg-slate-700/40"
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
     onClose={closeAllAnnouncements}
     announcements={announcements}
     onEdit={handleEdit}
     onDelete={handleDeleteClick}
    />
   </div>
  </div>
 );
}

function AllAnnouncementsModal({ isOpen, onClose, announcements, onEdit, onDelete }) {
 const [search, setSearch] = useState("");
 const [statusFilter, setStatusFilter] = useState("all");
 const [categoryFilter, setCategoryFilter] = useState("all");
 const [branchFilter, setBranchFilter] = useState("all");
 const [typeFilter, setTypeFilter] = useState("all");

 useEffect(() => {
  if (isOpen) {
   setSearch("");
   setStatusFilter("all");
   setCategoryFilter("all");
   setBranchFilter("all");
   setTypeFilter("all");
  }
 }, [isOpen]);

 const filteredAnnouncements = useMemo(() => {
  const query = search.trim().toLowerCase();

  return announcements.filter((announcement) => {
   const matchesQuery =
    !query ||
    [announcement.title, announcement.content, announcement.policyKey, announcement.category, announcement.targetBranch]
     .filter(Boolean)
     .some((value) => String(value).toLowerCase().includes(query));

   const matchesStatus = statusFilter === "all" || announcement.publicationStatus === statusFilter;
   const matchesCategory = categoryFilter === "all" || announcement.category === categoryFilter;
   const matchesBranch = branchFilter === "all" || announcement.targetBranch === branchFilter;
   const matchesType = typeFilter === "all" || announcement.contentType === typeFilter;

   return matchesQuery && matchesStatus && matchesCategory && matchesBranch && matchesType;
  });
 }, [announcements, branchFilter, categoryFilter, search, statusFilter, typeFilter]);

 const groupedAnnouncements = useMemo(
  () => groupAnnouncementsByMonth(filteredAnnouncements),
  [filteredAnnouncements],
 );

 if (!isOpen) return null;

 return createPortal(
  <div
   className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
   onClick={onClose}
   role="presentation"
  >
   <div
    className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#172237]"
    onClick={(event) => event.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label="All Announcements"
   >
    <div className="flex shrink-0 items-start justify-between border-b border-slate-200/80 px-6 py-4 dark:border-slate-700/80">
     <div>
      <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-50">All Announcements</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300/70">Browse and manage all announcements</p>
     </div>
     <button
      type="button"
      onClick={onClose}
      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700/50 dark:hover:text-slate-100"
      aria-label="Close all announcements"
     >
      <X size={16} />
     </button>
    </div>

    <div className="flex shrink-0 gap-3 border-b border-slate-200/80 px-6 py-4 dark:border-slate-700/80">
     <label className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
       type="text"
       value={search}
       onChange={(event) => setSearch(event.target.value)}
       placeholder="Search..."
       className="h-10 w-full rounded-md border border-slate-200 bg-transparent pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-slate-700 dark:placeholder:text-slate-500"
      />
     </label>

     <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-36 rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700">
      <option value="all">All statuses</option>
      <option value="published">Published</option>
      <option value="scheduled">Scheduled</option>
      <option value="draft">Draft</option>
     </select>

     <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 w-36 rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700">
      <option value="all">All categories</option>
      {ANNOUNCEMENT_CATEGORY_OPTIONS.map((option) => (
       <option key={option.value} value={option.value}>{option.label}</option>
      ))}
     </select>

     <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-10 w-36 rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700">
      <option value="all">All branches</option>
      {BRANCH_OPTIONS.map((option) => (
       <option key={option.value} value={option.value}>{option.label}</option>
      ))}
     </select>

     <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 w-36 rounded-md border border-slate-200 bg-transparent px-3 text-sm dark:border-slate-700">
      <option value="all">All types</option>
      <option value="announcement">Announcement</option>
      <option value="policy">Policy</option>
     </select>
    </div>

    <div className="flex-1 overflow-y-auto px-6 py-4">
     {groupedAnnouncements.length === 0 ? (
      <div className="flex h-full items-center justify-center py-10 text-center">
       <div>
        <Megaphone size={28} className="mx-auto text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-50">No announcements found</h3>
        <p className="text-sm text-slate-500 dark:text-slate-300/70">Try adjusting the filters.</p>
       </div>
      </div>
     ) : (
      <div className="space-y-6">
       {groupedAnnouncements.map((group) => (
        <section key={group.month} className="space-y-3">
         <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300/70">{group.month}</h3>
         <div className="space-y-3">
          {group.items.map((announcement) => {
           const categoryMeta = getAnnouncementCategoryMeta(announcement.category);

           return (
            <article key={announcement.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/70 dark:bg-[#1a2435]">
             <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
               <h4 className="text-[15px] font-medium leading-5 text-slate-900 dark:text-slate-50">{announcement.title}</h4>
               <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300/70">{announcement.content}</p>

               <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getToneClasses(categoryMeta.tone)}`}>{categoryMeta.label}</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">{announcement.contentType === "policy" ? "Policy" : "Announcement"}</span>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{formatAnnouncementBranch(announcement.targetBranch)}</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">{announcement.publicationStatus === "draft" ? "Draft" : "Published"}</span>
               </div>

               <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{formatDateTime(getAnnouncementDate(announcement))}</span>
               </div>
              </div>

              <div className="flex shrink-0 items-start gap-2 pt-0.5">
               <button type="button" onClick={() => onEdit(announcement)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700/60 dark:hover:text-slate-100" aria-label="Edit announcement">
                <Pencil size={14} />
               </button>
               <button type="button" onClick={() => onDelete(announcement.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-[#3b0e0e]" aria-label="Delete announcement">
                <Trash2 size={14} />
               </button>
              </div>
             </div>
            </article>
           );
          })}
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
