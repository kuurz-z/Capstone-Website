import { useMemo, useState } from "react";
import {
 CheckCheck,
 ChevronLeft,
 ChevronRight,
 MailCheck,
 MessageSquare,
 Search,
 MoreVertical,
} from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { inquiryApi } from "../../../shared/api/apiClient";
import { useAuth } from "../../../shared/hooks/useAuth";
import { showNotification } from "../../../shared/utils/notification";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { useInquiries, useInquiryStats } from "../../../shared/hooks/queries/useInquiries";
import {
 normalizeBranchFilterValue,
 syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import InquiryDetailsModal from "../components/InquiryDetailsModal";
import { StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-inquiries.css";

const getAvatarColor = (initials = "") => {
 const colors = [
 "bg-[#ec4899] text-primary-foreground",
 "bg-[#22c55e] text-primary-foreground",
 "bg-[#8b5cf6] text-primary-foreground",
 "bg-[#ef4444] text-primary-foreground",
 "bg-[#3b82f6] text-primary-foreground",
 "bg-[#f59e0b] text-primary-foreground",
 ];
 const charCode = initials.length > 0 ? initials.charCodeAt(0) : 0;
 const index = charCode % colors.length;
 return colors[index];
};

function initial(name = "") {
 return (name.trim()[0] || "?").toUpperCase();
}

function fmtDate(value) {
 if (!value) return "";
 return new Date(value).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 });
}

export default function InquiriesPage({ isEmbedded = false }) {
 const { user } = useAuth();
 const isOwner = user?.role === "owner";
 const queryClient = useQueryClient();
 const [searchParams, setSearchParams] = useSearchParams();
 const [selectedInquiry, setSelectedInquiry] = useState(null);
 const [confirmModal, setConfirmModal] = useState({
 open: false,
 title: "",
 message: "",
 variant: "info",
 onConfirm: null,
 });
 const [searchTerm, setSearchTerm] = useState("");
 const [statusFilter, setStatusFilter] = useState("");
 const requestedBranch = searchParams.get("branch");
 const [branchFilter, setBranchFilter] = useState(() =>
 normalizeBranchFilterValue({
 requestedBranch: isOwner ? requestedBranch : null,
 allValue: "",
 }),
 );
 const [sortBy, setSortBy] = useState("recent");
 const [page, setPage] = useState(1);
 const LIMIT = 10;

 useEffect(() => {
 const nextBranch = normalizeBranchFilterValue({
 requestedBranch: isOwner ? requestedBranch : null,
 allValue: "",
 });

 setBranchFilter((current) => (current === nextBranch ? current : nextBranch));
 }, [isOwner, requestedBranch]);

 useEffect(() => {
 if (isEmbedded) return;
 if (!user?.role) return;

 const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
 enabled: isOwner,
 allValue: "",
 });

 if (nextParams.toString() === searchParams.toString()) return;
 setSearchParams(nextParams, { replace: true });
 }, [branchFilter, isEmbedded, isOwner, searchParams, setSearchParams, user?.role]);

 const params = useMemo(() => {
 const nextParams = { page, limit: LIMIT };
 if (statusFilter) nextParams.status = statusFilter;
 if (searchTerm) nextParams.search = searchTerm;
 if (branchFilter) nextParams.branch = branchFilter;
 return nextParams;
 }, [branchFilter, page, searchTerm, statusFilter]);

 const { data: inquiriesData, isLoading: loading } = useInquiries(params);
 const { data: statsData } = useInquiryStats({ enabled: !isEmbedded });

 const rawInquiries = inquiriesData?.inquiries || [];
 const inquiries = useMemo(() => {
 const getName = (inquiry) =>
 inquiry.name || `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() || "";

 if (sortBy === "recent") {
 return rawInquiries;
 }

 const sorted = [...rawInquiries];
 if (sortBy === "oldest") {
 sorted.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
 } else if (sortBy === "name-az") {
 sorted.sort((left, right) => getName(left).localeCompare(getName(right)));
 } else if (sortBy === "name-za") {
 sorted.sort((left, right) => getName(right).localeCompare(getName(left)));
 }
 return sorted;
 }, [rawInquiries, sortBy]);
 const totalPages = inquiriesData?.pagination?.pages || 1;

 const stats = {
 total: statsData?.total || 0,
 new: statsData?.byStatus?.pending || 0,
 responded: statsData?.byStatus?.resolved || 0,
 };

 const refetchAll = () => queryClient.invalidateQueries({ queryKey: ["inquiries"] });

 const handleArchive = (inquiryId) => {
 setConfirmModal({
 open: true,
 title: "Archive Inquiry",
 message: "Are you sure you want to archive this inquiry?",
 variant: "warning",
 confirmText: "Archive",
 onConfirm: async () => {
 setConfirmModal((previous) => ({ ...previous, open: false }));
 try {
 await inquiryApi.archive(inquiryId);
 refetchAll();
 showNotification("Inquiry archived successfully", "success", 3000);
 } catch (error) {
 console.error("Error archiving inquiry:", error);
 showNotification(error.message || "Failed to archive inquiry", "error", 3000);
 }
 },
 });
 };

 const summaryItems = useMemo(
 () => [
 { label: "New Inquiries", value: stats.new, icon: MessageSquare, color: "orange" },
 { label: "Responded", value: stats.responded, icon: MailCheck, color: "blue" },
 { label: "Resolved", value: stats.responded, icon: CheckCheck, color: "green" },
 ],
 [stats.new, stats.responded],
 );

 const summaryColorClasses = {
 blue: {
 base: "border-blue-100 bg-blue-50/60",
 active: "border-blue-300 bg-info-light/80 shadow-sm ring-1 ring-blue-200",
 icon: "text-blue-600",
 label: "text-info-dark",
 value: "text-blue-900",
 },
 orange: {
 base: "border-amber-100 bg-amber-50/60",
 active: "border-amber-300 bg-warning-light/80 shadow-sm ring-1 ring-amber-200",
 icon: "text-warning-dark",
 label: "text-warning-dark",
 value: "text-amber-900",
 },
 green: {
 base: "border-emerald-100 bg-emerald-50/60",
 active: "border-emerald-300 bg-success-light/80 shadow-sm ring-1 ring-emerald-200",
 icon: "text-emerald-600",
 label: "text-success-dark",
 value: "text-emerald-900",
 },
 red: {
 base: "border-red-100 bg-red-50/60",
 active: "border-red-300 bg-red-100/80 shadow-sm ring-1 ring-red-200",
 icon: "text-red-600",
 label: "text-red-700",
 value: "text-red-900",
 },
 };

 const summaryFilterValues = ["", "resolved", "pending"];

 return (
 <div className={isEmbedded ? "" : "min-h-screen w-full"}>
 <div className={isEmbedded ? "" : "w-full px-4 py-4 sm:px-6 lg:px-8"}>
 {!isEmbedded && (
 <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
 {summaryItems.map((item, index) => {
 const Icon = item.icon;
 const isActive = statusFilter === summaryFilterValues[index];
 const palette = summaryColorClasses[item.color] || summaryColorClasses.orange;

 return (
 <button
 key={item.label}
 onClick={() => {
 setStatusFilter(summaryFilterValues[index]);
 setPage(1);
 }}
 className={`bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer ${
 isActive ? "ring-2 ring-primary" : ""
 }`}
 >
 <div className="flex items-start justify-between mb-4">
 <Icon
 strokeWidth={1.5}
 className={`w-5 h-5 ${
 item.color === "blue"
 ? "text-blue-600"
 : item.color === "orange"
 ? "text-amber-500"
 : item.color === "green"
 ? "text-green-600"
 : "text-red-600"
 }`}
 />
 <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
 {item.label}
 </span>
 </div>
 <div
 className={`text-[32px] font-medium leading-none ${
 item.color === "blue"
 ? "text-blue-600"
 : item.color === "orange"
 ? "text-amber-500"
 : item.color === "green"
 ? "text-green-600"
 : "text-red-600"
 }`}
 >
 {item.value}
 </div>
 </button>
 );
 })}
 </div>
 )}

 <div className="bg-card border border-border rounded-lg p-6">
 <div className="flex flex-col md:flex-row gap-4 mb-6">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 value={searchTerm}
 onChange={(event) => {
 setSearchTerm(event.target.value);
 setPage(1);
 }}
 placeholder="Search inquiries..."
 className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
 />
 </div>

 <div className="flex gap-2">
 <select
 value={branchFilter}
 onChange={(event) => {
 setBranchFilter(event.target.value);
 setPage(1);
 }}
 className="px-4 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
 >
 <option value="">All Branches</option>
 <option value="gil-puyat">Gil Puyat</option>
 <option value="guadalupe">Guadalupe</option>
 </select>

 <select
 value={statusFilter}
 onChange={(event) => {
 setStatusFilter(event.target.value);
 setPage(1);
 }}
 className="px-4 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
 >
 <option value="">All Status</option>
 <option value="pending">Pending</option>
 <option value="resolved">Resolved</option>
 </select>

 <select
 value={sortBy}
 onChange={(event) => setSortBy(event.target.value)}
 className="px-4 py-2 bg-input-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
 >
 <option value="recent">Most Recent</option>
 <option value="oldest">Oldest First</option>
 <option value="name-az">Name A-Z</option>
 <option value="name-za">Name Z-A</option>
 </select>
 </div>
 </div>

 <div className="space-y-4">
 {loading ? (
 <div className="p-12 text-center">
 <p className="text-sm text-muted-foreground">Loading inquiries...</p>
 </div>
 ) : inquiries.length === 0 ? (
 <div className="p-12 text-center">
 <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
 <p className="text-base font-medium text-foreground">No inquiries found</p>
 <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters.</p>
 </div>
 ) : (
 inquiries.map((inquiry) => {
 const name =
 inquiry.name ||
 `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
 "Unknown";
 const status = inquiry.status || "pending";

 return (
 <div
 key={inquiry._id}
 onClick={() => setSelectedInquiry(inquiry)}
 className="flex items-start justify-between p-5 bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
 >
 <div className="flex items-start gap-4 flex-1">
 <div
 className={`w-12 h-12 rounded-full flex items-center justify-center font-medium ${getAvatarColor(initial(name))}`}
 >
 {initial(name)}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between mb-2">
 <div>
 <h3 className="font-semibold text-foreground">{name}</h3>
 <p className="text-sm text-muted-foreground">{inquiry.email || "-"}</p>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">
 {fmtDate(inquiry.createdAt)}
 </span>
 <button
 onClick={(e) => {
 e.stopPropagation();
 setSelectedInquiry(inquiry);
 }}
 className="p-1 hover:bg-muted rounded-md transition-colors"
 >
 <MoreVertical className="w-4 h-4 text-muted-foreground" />
 </button>
 </div>
 </div>
 {inquiry.message && (
 <p className="text-sm text-foreground mb-2 line-clamp-2">
 {inquiry.message}
 </p>
 )}
 <div className="flex items-center gap-3">
 {(inquiry.subject || inquiry.inquiryType) && (
 <span className="text-xs px-3 py-1 bg-muted text-foreground rounded-md">
 {inquiry.subject || inquiry.inquiryType}
 </span>
 )}
 <StatusBadge status={status} />
 </div>
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>
 </div>

 {totalPages > 1 && (
 <div className="flex justify-end items-center gap-2 mt-4 pt-4 border-t border-border">
 <button
 className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 disabled={page <= 1}
 onClick={() => setPage((previous) => Math.max(1, previous - 1))}
 title="Previous page"
 >
 Previous
 </button>
 <span className="px-3 py-1 text-sm text-muted-foreground">
 Page {page} of {totalPages}
 </span>
 <button
 className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 disabled={page >= totalPages}
 onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
 title="Next page"
 >
 Next
 </button>
 </div>
 )}

 {selectedInquiry && (
 <InquiryDetailsModal
 inquiry={selectedInquiry}
 onClose={() => setSelectedInquiry(null)}
 onUpdate={() => {
 refetchAll();
 setSelectedInquiry(null);
 }}
 onArchive={handleArchive}
 />
 )}
 <ConfirmModal
 isOpen={confirmModal.open}
 onClose={() => setConfirmModal((previous) => ({ ...previous, open: false }))}
 onConfirm={confirmModal.onConfirm}
 title={confirmModal.title}
 message={confirmModal.message}
 variant={confirmModal.variant}
 confirmText={confirmModal.confirmText || "Confirm"}
 />
 {!isEmbedded && stats.total > 0 && <div className="sr-only">{stats.total}</div>}
 </div>
 </div>
 );
}

