import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  LoaderCircle,
  Megaphone,
  Pin,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import {
  useAcknowledgeAnnouncement,
  useAnnouncements,
  useMarkAllAnnouncementsRead,
} from "../../../../shared/hooks/queries/useAnnouncements";
import {
  formatAnnouncementCategory,
  getAnnouncementCategoryMeta,
} from "../../../../shared/utils/announcementConfig";
import { showNotification } from "../../../../shared/utils/notification";
import { AnnouncementListSkeleton } from "../../../../shared/components/LoadingSkeletons";
import AnnouncementDetailModal from "../announcements/AnnouncementDetailModal";
import "../../../admin/styles/design-tokens.css";
import "../../styles/tenant-announcements.css";

const CATEGORY_ICONS = {
  general: Megaphone,
  reminder: Bell,
  maintenance: Wrench,
  policy: FileText,
  alert: TriangleAlert,
  emergency: TriangleAlert,
  event: Megaphone,
};

const getPriorityObjective = (announcement) => {
  const cat = announcement.category?.toLowerCase();
  if (cat === "emergency" || cat === "alert" || announcement.priority === "urgent") {
    return {
      tier: "urgent",
      badgeClass: "tenant-announcement-badge--urgent",
      iconColor: "#dc2626",
      label: cat === "emergency" ? "Emergency" : "Alert",
    };
  }
  if (cat === "maintenance" || announcement.priority === "high") {
    return {
      tier: "warning",
      badgeClass: "tenant-announcement-badge--warning",
      iconColor: "#d97706",
      label: "Maintenance",
    };
  }
  if (announcement.contentType === "policy" || cat === "policy") {
    return {
      tier: "policy",
      badgeClass: "tenant-announcement-badge--policy",
      iconColor: "#2563eb",
      label: "Policy",
    };
  }
  return {
    tier: "neutral",
    badgeClass: "tenant-announcement-badge--neutral",
    iconColor: "#64748b",
    label: formatAnnouncementCategory(announcement.category),
  };
};

const fmtDateTime = (value) => {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const datePart = d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return String(value);
  }
};

const getAnnouncementId = (announcement) => announcement.id || announcement._id;

export default function AnnouncementsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(0);

  const { data: announcementData, isLoading } = useAnnouncements(100);
  const announcements = announcementData?.announcements || [];

  const acknowledgeAnnouncement = useAcknowledgeAnnouncement();
  const markAllAsReadMutation = useMarkAllAnnouncementsRead();

  // Metrics for smart filter tabs
  const stats = useMemo(() => {
    const total = announcements.length;
    const pendingAck = announcements.filter(
      (a) => a.requiresAck && !a.acknowledged,
    ).length;
    const unread = announcements.filter((a) => a.unread).length;
    const policies = announcements.filter(
      (a) => a.contentType === "policy" || a.category === "policy",
    ).length;
    const maintenance = announcements.filter((a) => a.category === "maintenance").length;
    const alerts = announcements.filter((a) => a.category === "alert" || a.category === "emergency").length;
    const reminders = announcements.filter((a) => a.category === "reminder").length;
    const events = announcements.filter((a) => a.category === "event").length;
    const general = announcements.filter((a) => a.category === "general").length;
    const acknowledged = announcements.filter((a) => a.acknowledged).length;

    return {
      total,
      pendingAck,
      unread,
      policies,
      maintenance,
      alerts,
      reminders,
      events,
      general,
      acknowledged,
    };
  }, [announcements]);

  // Tab definitions
  const filterTabs = useMemo(() => {
    const tabs = [
      { key: "all", label: "All Notices", count: stats.total },
    ];

    if (stats.pendingAck > 0) {
      tabs.push({
        key: "action_required",
        label: "Action Required",
        count: stats.pendingAck,
        badgeType: "ack",
      });
    }

    if (stats.unread > 0) {
      tabs.push({
        key: "unread",
        label: "Unread",
        count: stats.unread,
      });
    }

    if (stats.policies > 0) {
      tabs.push({ key: "policy", label: "Policies", count: stats.policies });
    }

    if (stats.maintenance > 0) {
      tabs.push({ key: "maintenance", label: "Maintenance", count: stats.maintenance });
    }

    if (stats.alerts > 0) {
      tabs.push({ key: "alert", label: "Alerts", count: stats.alerts, badgeType: "alert" });
    }

    if (stats.reminders > 0) {
      tabs.push({ key: "reminder", label: "Reminders", count: stats.reminders });
    }

    if (stats.events > 0) {
      tabs.push({ key: "event", label: "Events", count: stats.events });
    }

    if (stats.general > 0) {
      tabs.push({ key: "general", label: "General", count: stats.general });
    }

    if (stats.acknowledged > 0) {
      tabs.push({ key: "acknowledged", label: "Acknowledged", count: stats.acknowledged });
    }

    return tabs;
  }, [stats]);

  const filterScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDragged = useRef(false);

  const updateScrollButtons = useCallback(() => {
    const el = filterScrollRef.current;
    if (!el) return;
    setCanScrollLeft((prev) => (prev ? el.scrollLeft > 4 : el.scrollLeft > 18));
    setCanScrollRight((prev) => {
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      return prev ? remaining > 4 : remaining > 18;
    });
  }, []);

  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;

    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateScrollButtons();
      });
      ro.observe(el);
    }

    // Translate vertical mouse wheel into horizontal scroll for mouse users
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      el.removeEventListener("wheel", onWheel);
      if (ro) ro.disconnect();
    };
  }, [updateScrollButtons, filterTabs]);

  const scrollFilters = (direction) => {
    const el = filterScrollRef.current;
    if (!el) return;
    const offset = direction === "left" ? -180 : 180;
    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  const handleMouseDown = (e) => {
    const el = filterScrollRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    hasDragged.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const el = filterScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.2;
    if (Math.abs(walk) > 4) {
      hasDragged.current = true;
    }
    el.scrollLeft = dragScrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Filtered announcements
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return announcements.filter((a) => {
      // Smart Tab Filter
      if (activeTab === "action_required") {
        if (!a.requiresAck || a.acknowledged) return false;
      } else if (activeTab === "unread") {
        if (!a.unread) return false;
      } else if (activeTab === "acknowledged") {
        if (!a.acknowledged) return false;
      } else if (activeTab === "policy") {
        if (a.contentType !== "policy" && a.category !== "policy") return false;
      } else if (activeTab === "alert") {
        if (a.category !== "alert" && a.category !== "emergency") return false;
      } else if (activeTab !== "all") {
        if (a.category !== activeTab) return false;
      }

      // Search Query
      if (query) {
        const title = (a.title || "").toLowerCase();
        const content = (a.content || "").toLowerCase();
        const author = (a.authorName || "").toLowerCase();
        const policyKey = (a.policyKey || "").toLowerCase();
        const version = String(a.version || "");

        const matches =
          title.includes(query) ||
          content.includes(query) ||
          author.includes(query) ||
          policyKey.includes(query) ||
          version.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [announcements, activeTab, searchQuery]);

  // Option 1: Pinned Slideshow List & Unpinned Stream
  // Sorted descending so the main pin (index 0) is always guaranteed to be the latest!
  const { pinnedList, unpinnedList } = useMemo(() => {
    const getTimestamp = (item) => {
      const val = item.pinnedAt || item.date || item.createdAt || item.updatedAt;
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    const pinned = filtered
      .filter((a) => a.isPinned)
      .sort((a, b) => getTimestamp(b) - getTimestamp(a));

    const unpinned = filtered
      .filter((a) => !a.isPinned)
      .sort((a, b) => getTimestamp(b) - getTimestamp(a));

    return { pinnedList: pinned, unpinnedList: unpinned };
  }, [filtered]);

  // Reset index when pinned list length shrinks or changes
  useEffect(() => {
    if (pinnedIndex >= pinnedList.length && pinnedList.length > 0) {
      setPinnedIndex(0);
    }
  }, [pinnedList.length, pinnedIndex]);

  const hasActiveFilters = searchQuery.trim() !== "" || activeTab !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setActiveTab("all");
    setPinnedIndex(0);
  };

  const handleAcknowledge = async (e, announcement) => {
    e.stopPropagation();
    const id = getAnnouncementId(announcement);
    if (!id || acknowledgingId) return;

    setAcknowledgingId(id);
    try {
      await acknowledgeAnnouncement.mutateAsync(id);
      showNotification("Notice acknowledged successfully.", "success", 3500);
      if (selectedAnnouncement && getAnnouncementId(selectedAnnouncement) === id) {
        setSelectedAnnouncement((prev) => ({
          ...prev,
          acknowledged: true,
          acknowledgedAt: new Date().toISOString(),
        }));
      }
    } catch (error) {
      showNotification(
        error.message || "Failed to acknowledge notice.",
        "error",
        4000,
      );
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = announcements
      .filter((a) => a.unread)
      .map((a) => getAnnouncementId(a));

    if (unreadIds.length === 0 || isMarkingAllRead) return;

    setIsMarkingAllRead(true);
    try {
      await markAllAsReadMutation.mutateAsync(unreadIds);
      showNotification("All announcements marked as read.", "success", 3000);
    } catch (err) {
      showNotification(err?.message || "Failed to mark notices as read.", "error", 4000);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  if (isLoading) {
    return (
      <div className="tenant-announcements-root">
        <div className="tenant-announcements-header">
          <div className="tenant-announcements-header__text">
            <div className="tenant-announcements-header__title-row">
              <h1>Announcements</h1>
            </div>
            <p>
              Stay updated with branch notices, policy guidelines, and dormitory advisories.
            </p>
          </div>
        </div>
        <AnnouncementListSkeleton count={4} />
      </div>
    );
  }

  const currentPinned =
    pinnedList.length > 0 ? pinnedList[pinnedIndex % pinnedList.length] : null;

  return (
    <div className="tenant-announcements-root">
      {/* ── Top Header & Actions ── */}
      <div className="tenant-announcements-header">
        <div className="tenant-announcements-header__text">
          <div className="tenant-announcements-header__title-row">
            <h1>Announcements</h1>
            {stats.unread > 0 && (
              <span className="tenant-announcements-unread-badge">
                {stats.unread} {stats.unread === 1 ? "Unread" : "Unread"}
              </span>
            )}
          </div>
          <p>
            Stay updated with branch notices, policy guidelines, and dormitory advisories.
          </p>
        </div>

        <div className="tenant-announcements-header__actions">
          <button
            type="button"
            className="tenant-announcements-btn-secondary"
            onClick={handleMarkAllRead}
            disabled={stats.unread === 0 || isMarkingAllRead}
            title={stats.unread === 0 ? "All announcements are marked as read" : "Mark all as read"}
          >
            {isMarkingAllRead ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                Marking Read...
              </>
            ) : (
              <>
                <CheckCheck size={14} />
                Mark All as Read
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Individual Filter Cards Row & Search ── */}
      <div className="tenant-announcements-filters-bar">
        {/* Mobile Filter Selector (< 640px) */}
        <div className="sm:hidden w-full relative mb-1">
          <label htmlFor="mobile-announcement-filter" className="sr-only">
            Filter notices
          </label>
          <select
            id="mobile-announcement-filter"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full sm:hidden appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-all cursor-pointer"
          >
            {filterTabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
            <Filter size={13} />
          </div>
        </div>

        {/* Desktop Filter Cards Row with Arrows & Smooth Scrolling (>= 640px) */}
        <div className="hidden sm:flex tenant-announcements-filter-carousel">
          <button
            type="button"
            className={`tenant-announcements-carousel-arrow tenant-announcements-carousel-arrow--left ${
              canScrollLeft ? "is-visible" : ""
            }`}
            onClick={() => scrollFilters("left")}
            aria-label="Scroll filters left"
            title="Scroll filters left"
            tabIndex={canScrollLeft ? 0 : -1}
            aria-hidden={!canScrollLeft}
          >
            <ChevronLeft size={15} />
          </button>

          <div
            ref={filterScrollRef}
            className={`tenant-announcements-filter-cards ${isDragging ? "is-dragging" : ""}`}
            role="tablist"
            aria-label="Filter notices"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
          >
            {filterTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              let badgeExtraClass = "";
              if (tab.badgeType === "ack") {
                badgeExtraClass = " tenant-announcements-card-badge--ack";
              } else if (tab.badgeType === "alert") {
                badgeExtraClass = " tenant-announcements-card-badge--alert";
              }

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`tenant-announcements-filter-card ${
                    isActive ? "tenant-announcements-filter-card--active" : ""
                  }`}
                  onClick={(e) => {
                    if (hasDragged.current) {
                      e.preventDefault();
                      return;
                    }
                    setActiveTab(tab.key);
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined ? (
                    <span className={`tenant-announcements-card-badge${badgeExtraClass}`}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={`tenant-announcements-carousel-arrow tenant-announcements-carousel-arrow--right ${
              canScrollRight ? "is-visible" : ""
            }`}
            onClick={() => scrollFilters("right")}
            aria-label="Scroll filters right"
            title="Scroll filters right"
            tabIndex={canScrollRight ? 0 : -1}
            aria-hidden={!canScrollRight}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Keyword Search Input */}
        <div className="tenant-announcements-search-wrap">
          <Search size={14} className="tenant-announcements-search-icon" />
          <input
            type="text"
            className="tenant-announcements-search-input"
            placeholder="Search notices, policies, updates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className="tenant-announcements-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter Summary */}
      {hasActiveFilters ? (
        <div className="tenant-announcements-summary-bar">
          <span>
            Showing <strong>{filtered.length}</strong> of{" "}
            <strong>{announcements.length}</strong> notices
          </span>
          <button
            type="button"
            className="tenant-announcements-clear-btn"
            onClick={handleResetFilters}
          >
            <RotateCcw size={12} />
            Reset Filters
          </button>
        </div>
      ) : null}

      {/* ── Empty State or Notice Stream ── */}
      {filtered.length === 0 ? (
        <div className="tenant-announcements-empty">
          <div className="tenant-announcements-empty__icon">
            {hasActiveFilters ? <Filter size={24} /> : <Megaphone size={24} />}
          </div>
          <h3 className="tenant-announcements-empty__title">
            {hasActiveFilters
              ? "No matching announcements"
              : "No announcements published"}
          </h3>
          <p className="tenant-announcements-empty__desc">
            {hasActiveFilters
              ? "No announcements matched your current search or filter. Try clearing active filters."
              : "There are currently no active notices or policy updates published for your branch."}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="tenant-announcements-btn-secondary"
              onClick={handleResetFilters}
            >
              <RotateCcw size={13} />
              Clear All Filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="tenant-announcements-list">
          {/* 🌟 1. Option 1: Pinned Spotlight Slideshow Card (Main Pin is the Latest) */}
          {currentPinned
            ? renderSpotlightSlideshow(
                currentPinned,
                pinnedList.length,
                pinnedIndex % pinnedList.length,
                setPinnedIndex,
                handleAcknowledge,
                setSelectedAnnouncement,
                acknowledgingId,
              )
            : null}

          {/* 🌟 2. Regular (Unpinned) Announcement Cards Stream */}
          {unpinnedList.map((announcement) =>
            renderAnnouncementCard(
              announcement,
              handleAcknowledge,
              setSelectedAnnouncement,
              acknowledgingId,
            ),
          )}
        </div>
      )}

      {/* ── Detail & Reader Modal ── */}
      <AnnouncementDetailModal
        isOpen={Boolean(selectedAnnouncement)}
        onClose={() => setSelectedAnnouncement(null)}
        announcement={selectedAnnouncement}
      />
    </div>
  );
}

/**
 * Option 1: Pinned Spotlight Slideshow Card
 * Sorted so the main pin is always the latest! Displays Date & Time.
 */
function renderSpotlightSlideshow(
  announcement,
  totalPinned,
  currentIndex,
  setPinnedIndex,
  handleAcknowledge,
  setSelectedAnnouncement,
  acknowledgingId,
) {
  const id = getAnnouncementId(announcement);
  const CategoryIcon = CATEGORY_ICONS[announcement.category] || Megaphone;
  const priority = getPriorityObjective(announcement);

  return (
    <div
      key={`spotlight-${id}`}
      className="tenant-announcement-spotlight"
      onClick={() => setSelectedAnnouncement(announcement)}
      role="article"
      tabIndex={0}
    >
      {/* Spotlight Header Row with Slideshow Controls & Date/Time */}
      <div className="tenant-announcement-spotlight__tag-row">
        <span className="tenant-announcement-spotlight__tag">
          <Pin size={13} style={{ fill: "currentColor" }} />
          Pinned Announcement
        </span>

        <div
          className="tenant-announcement-spotlight__nav"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Previous / Next Slideshow Buttons if 2+ pins */}
          {totalPinned > 1 ? (
            <>
              <button
                type="button"
                className="tenant-announcement-spotlight__nav-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedIndex((prev) => (prev - 1 + totalPinned) % totalPinned);
                }}
                title="Previous pinned notice"
                aria-label="Previous pinned notice"
              >
                <ChevronLeft size={14} />
              </button>

              <span className="tenant-announcement-spotlight__counter">
                {currentIndex + 1} of {totalPinned}
              </span>

              <button
                type="button"
                className="tenant-announcement-spotlight__nav-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedIndex((prev) => (prev + 1) % totalPinned);
                }}
                title="Next pinned notice"
                aria-label="Next pinned notice"
              >
                <ChevronRight size={14} />
              </button>
            </>
          ) : null}

          {/* Date and Time */}
          <span className="tenant-announcement-spotlight__date">
            {fmtDateTime(announcement.date || announcement.createdAt)}
          </span>
        </div>
      </div>

      {/* Title + Priority Badges */}
      <div className="tenant-announcement-card__top">
        <div className="tenant-announcement-card__title-row">
          {announcement.unread ? (
            <div
              className="tenant-announcement-card__unread-dot"
              title="Unread Notice"
            />
          ) : null}

          <span className={`tenant-announcement-badge ${priority.badgeClass}`}>
            <CategoryIcon size={12} style={{ color: priority.iconColor }} />
            {priority.label}
          </span>

          {announcement.contentType === "policy" ? (
            <span className="tenant-announcement-badge tenant-announcement-badge--policy">
              <FileText size={11} style={{ color: "#2563eb" }} />
              Policy v{announcement.version || 1}
            </span>
          ) : null}

          <h3 className="tenant-announcement-card__title">
            {announcement.title}
          </h3>
        </div>
      </div>

      {/* Body Snippet */}
      <p className="tenant-announcement-card__body">{announcement.content}</p>

      {/* Footer & Actions */}
      <div className="tenant-announcement-card__footer">
        <div className="tenant-announcement-card__status-wrap">
          {announcement.requiresAck ? (
            announcement.acknowledged ? (
              <span className="tenant-announcement-ack-badge">
                <CheckCheck size={14} />
                Acknowledged on {fmtDateTime(announcement.acknowledgedAt)}
              </span>
            ) : (
              <span className="tenant-announcement-ack-pending-text">
                <ShieldAlert size={14} />
                Tenant Acknowledgment Required
              </span>
            )
          ) : null}
        </div>

        <div className="tenant-announcement-card__btn-group">
          <button
            type="button"
            className="tenant-announcement-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAnnouncement(announcement);
            }}
          >
            <Eye size={13} />
            View Details
          </button>

          {announcement.requiresAck && !announcement.acknowledged ? (
            <button
              type="button"
              className="tenant-announcement-btn-ack"
              onClick={(e) => handleAcknowledge(e, announcement)}
              disabled={acknowledgingId === id}
            >
              {acknowledgingId === id ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  Acknowledging...
                </>
              ) : (
                <>
                  <ShieldCheck size={13} />
                  Acknowledge
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Regular Announcement Card
 * Displays Date & Time and Semantic Priority Badges
 */
function renderAnnouncementCard(
  announcement,
  handleAcknowledge,
  setSelectedAnnouncement,
  acknowledgingId,
) {
  const id = getAnnouncementId(announcement);
  const CategoryIcon = CATEGORY_ICONS[announcement.category] || Megaphone;
  const priority = getPriorityObjective(announcement);

  return (
    <div
      key={id}
      className="tenant-announcement-card"
      onClick={() => setSelectedAnnouncement(announcement)}
      role="article"
      tabIndex={0}
      style={{ cursor: "pointer" }}
    >
      {/* Top row: Title + Priority Badges */}
      <div className="tenant-announcement-card__top">
        <div className="tenant-announcement-card__title-row">
          {announcement.unread ? (
            <div
              className="tenant-announcement-card__unread-dot"
              title="Unread Notice"
            />
          ) : null}

          {/* Semantic Priority / Category Badge */}
          <span className={`tenant-announcement-badge ${priority.badgeClass}`}>
            <CategoryIcon size={12} style={{ color: priority.iconColor }} />
            {priority.label}
          </span>

          <h3 className="tenant-announcement-card__title">
            {announcement.title}
          </h3>
        </div>

        <div className="tenant-announcement-card__badges">
          {announcement.contentType === "policy" ? (
            <span className="tenant-announcement-badge tenant-announcement-badge--policy">
              <FileText size={11} style={{ color: "#2563eb" }} />
              Policy v{announcement.version || 1}
            </span>
          ) : null}

          {/* Date and Time */}
          <span className="tenant-announcement-card__date">
            {fmtDateTime(announcement.date || announcement.createdAt)}
          </span>
        </div>
      </div>

      {/* Body Content Snippet — Crisp & Legible */}
      <p className="tenant-announcement-card__body">{announcement.content}</p>

      {/* Footer & Action Buttons */}
      <div className="tenant-announcement-card__footer">
        <div className="tenant-announcement-card__status-wrap">
          {announcement.requiresAck ? (
            announcement.acknowledged ? (
              <span className="tenant-announcement-ack-badge">
                <CheckCheck size={14} />
                Acknowledged on {fmtDateTime(announcement.acknowledgedAt)}
              </span>
            ) : (
              <span className="tenant-announcement-ack-pending-text">
                <ShieldAlert size={14} />
                Tenant Acknowledgment Required
              </span>
            )
          ) : null}
        </div>

        <div className="tenant-announcement-card__btn-group">
          <button
            type="button"
            className="tenant-announcement-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAnnouncement(announcement);
            }}
          >
            <Eye size={13} />
            View Details
          </button>

          {announcement.requiresAck && !announcement.acknowledged ? (
            <button
              type="button"
              className="tenant-announcement-btn-ack"
              onClick={(e) => handleAcknowledge(e, announcement)}
              disabled={acknowledgingId === id}
            >
              {acknowledgingId === id ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  Acknowledging...
                </>
              ) : (
                <>
                  <ShieldCheck size={13} />
                  Acknowledge
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
