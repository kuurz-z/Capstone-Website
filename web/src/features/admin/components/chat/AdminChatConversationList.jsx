import { useMemo, useState } from "react";
import {
  Inbox,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react";
import ProfileAvatar from "../../../../shared/components/ProfileAvatar";
import { BRANCH_OPTIONS } from "../../../../shared/utils/constants";
import { ChatConversationListSkeleton } from "../AdminContentSkeletons";
import {
  STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_SECTION_ORDER,
  getStatusLabel,
  getCategoryLabel,
  getPriorityLabel,
  getBranchLabel,
  getRoomLabel,
  getInitials,
  fmtRelativeTime,
} from "./chatConstants";

export default function AdminChatConversationList({
  conversations = [],
  selectedConversation = null,
  onSelectConversation,
  initialLoading = false,
  listError = "",
  isOwner = false,
  accessInfo = null,
  user = null,
  branchFilter = "all",
  onBranchFilterChange,
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "unread" | "urgent" | "me"
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count += 1;
    if (priorityFilter !== "all") count += 1;
    if (categoryFilter !== "all") count += 1;
    if (isOwner && branchFilter !== "all") count += 1;
    return count;
  }, [statusFilter, priorityFilter, categoryFilter, branchFilter, isOwner]);

  const handleResetFilters = () => {
    setSearch("");
    setActiveTab("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCategoryFilter("all");
    if (onBranchFilterChange) onBranchFilterChange("all");
    setShowAdvancedFilters(false);
  };

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const myAdminId = accessInfo?.adminId || user?._id || user?.id;

    return conversations.filter((item) => {
      // 1. Search filter
      if (q) {
        const matchesSearch =
          (item.requestId || "").toLowerCase().includes(q) ||
          (item.concern || "").toLowerCase().includes(q) ||
          (item.ticketId || "").toLowerCase().includes(q) ||
          (item.tenantName || "").toLowerCase().includes(q) ||
          (item.tenantEmail || "").toLowerCase().includes(q) ||
          (item.roomNumber || "").toLowerCase().includes(q) ||
          (item.roomBed || "").toLowerCase().includes(q) ||
          (item.lastMessage || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // 2. Active Tab filter
      if (activeTab === "unread" && !(item.unreadAdminCount > 0)) {
        return false;
      }
      if (activeTab === "urgent" && item.priority !== "urgent") {
        return false;
      }
      if (activeTab === "me") {
        if (!item.assignedAdminId || String(item.assignedAdminId) !== String(myAdminId)) {
          return false;
        }
      }

      // 3. Status filter
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      // 4. Priority filter (if not in urgent tab)
      if (activeTab !== "urgent" && priorityFilter !== "all" && item.priority !== priorityFilter) {
        return false;
      }

      // 5. Category filter
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [
    conversations,
    search,
    activeTab,
    accessInfo?.adminId,
    user?._id,
    user?.id,
    statusFilter,
    priorityFilter,
    categoryFilter,
  ]);

  const groupedConversations = useMemo(() => {
    const groups = STATUS_SECTION_ORDER.map((status) => ({
      status,
      label: getStatusLabel(status),
      items: [],
    }));

    filteredConversations.forEach((item) => {
      const targetGroup =
        groups.find((group) => group.status === item.status) || groups[0];
      targetGroup.items.push(item);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [filteredConversations]);

  return (
    <aside className="rounded-xl border border-border bg-card shadow-xs flex flex-col h-full overflow-hidden">
      {/* Search & Filter Bar */}
      <div className="p-3 border-b border-border space-y-2.5 bg-card/60">
        <div className="relative flex items-center">
          <Search
            size={15}
            className="absolute left-3 text-muted-foreground pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, room, or message..."
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-input-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Quick Segmented Tabs inside Sidebar */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-muted border border-border text-[11px] font-semibold">
          <button
            type="button"
            className={`py-1 rounded text-center transition-colors cursor-pointer ${
              activeTab === "all"
                ? "bg-card text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`py-1 rounded text-center transition-colors cursor-pointer ${
              activeTab === "unread"
                ? "bg-card text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("unread")}
          >
            Unread
          </button>
          <button
            type="button"
            className={`py-1 rounded text-center transition-colors cursor-pointer ${
              activeTab === "urgent"
                ? "bg-card text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("urgent")}
          >
            Urgent
          </button>
          <button
            type="button"
            className={`py-1 rounded text-center transition-colors cursor-pointer ${
              activeTab === "me"
                ? "bg-card text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("me")}
          >
            Assigned
          </button>
        </div>

        {/* Filter Toggle & Reset */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium border transition-colors cursor-pointer ${
              showAdvancedFilters || activeFiltersCount > 0
                ? "bg-muted border-border text-foreground font-semibold"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
          </button>

          {(activeFiltersCount > 0 || search || activeTab !== "all") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              Reset all
            </button>
          )}
        </div>

        {showAdvancedFilters && (
          <div className="pt-2 border-t border-border/70 grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={isOwner ? "" : "col-span-2"}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Priority
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {PRIORITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {isOwner && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Branch
                </label>
                <select
                  value={branchFilter}
                  onChange={(e) => onBranchFilterChange?.(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="all">All branches</option>
                  {BRANCH_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {initialLoading ? (
          <ChatConversationListSkeleton count={7} />
        ) : listError ? (
          <div className="p-6 text-center text-xs text-destructive space-y-2">
            <XCircle size={22} className="mx-auto" />
            <span>{listError}</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <Inbox size={26} className="mx-auto text-muted-foreground/60" />
            <div className="font-semibold text-foreground">
              {conversations.length === 0 ? "No conversations found" : "No matching conversations"}
            </div>
            <div>
              {conversations.length === 0
                ? "Tenant messages will appear here."
                : "No tenant messages match your active filter criteria."}
            </div>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          groupedConversations.map((group) => (
            <div key={group.status} className="space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>{group.label}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                  {group.items.length}
                </span>
              </div>

              <div className="space-y-1">
                {group.items.map((conversation) => {
                  const isSelected = selectedConversation?.id === conversation.id;
                  const isUnread = conversation.unreadAdminCount > 0;
                  const isUrgent = conversation.priority === "urgent";

                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      onClick={() => onSelectConversation(conversation)}
                      className={`w-full text-left p-2.5 rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer border ${
                        isSelected
                          ? "bg-muted/90 border-border shadow-2xs font-medium text-foreground"
                          : "border-transparent hover:bg-muted/40 text-card-foreground"
                      } ${isUnread && !isSelected ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
                    >
                      {/* Circular Avatar */}
                      <ProfileAvatar
                        src={conversation.tenantProfileImage}
                        user={{
                          name: conversation.tenantName,
                          profileImage: conversation.tenantProfileImage,
                        }}
                        initials={getInitials(conversation.tenantName)}
                        size={32}
                        alt={conversation.tenantName}
                        className="shrink-0 ring-1 ring-border/40"
                      />

                      {/* Middle Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-baseline justify-between gap-1">
                          <span
                            className={`text-xs truncate ${
                              isUnread
                                ? "font-bold text-foreground"
                                : "font-semibold text-foreground/90"
                            }`}
                          >
                            {conversation.tenantName}
                          </span>
                          <time className="text-[10px] text-muted-foreground shrink-0 font-normal">
                            {fmtRelativeTime(conversation.updatedAt || conversation.lastMessageAt)}
                          </time>
                        </div>

                        <div className="text-[11px] text-muted-foreground truncate font-normal">
                          {conversation.requestId || conversation.ticketId || "Legacy thread"} · {getBranchLabel(conversation.branch)} · {getRoomLabel(conversation)}
                        </div>

                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/50 truncate max-w-full">
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                            <span className="truncate">{getCategoryLabel(conversation.category)}</span>
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground truncate line-clamp-1 leading-tight font-normal">
                          {conversation.concern || conversation.lastMessage || "No messages yet"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Assigned: {conversation.assignedAdminName || "Unassigned"}
                        </p>
                      </div>

                      {/* Badges Column */}
                      <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                        {conversation.rating !== null && conversation.rating !== undefined && <span className="text-xs">★ {conversation.rating}/5{conversation.legacy ? " (historical)" : ""}</span>}
                        {conversation.ratingState === "unrated" && <span className="text-xs">Not yet rated</span>}
                        {conversation.ratingState === "unavailable" && <span className="text-xs">Rating unavailable</span>}
                        {isUnread && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                            {conversation.unreadAdminCount}
                          </span>
                        )}
                        {isUrgent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Urgent
                          </span>
                        )}
                        {conversation.priority === "high" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            High
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
