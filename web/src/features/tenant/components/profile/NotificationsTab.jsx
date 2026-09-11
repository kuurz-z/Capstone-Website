/**
 * ============================================================================
 * NotificationsTab — Real Notification Display
 * ============================================================================
 *
 * Connects to the existing notification backend via useNotifications hooks.
 *
 * Features:
 * - Paginated notification list
 * - Unread dot indicator
 * - "Mark all as read" button
 * - Type-based icons
 * - Grouped by date
 * - Empty state
 * - Filter tabs by category + unread toggle
 *
 * ============================================================================
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
	Bell,
	Check,
	CheckCheck,
	Calendar,
	CreditCard,
	Wrench,
	Home,
	Megaphone,
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	Filter,
} from "lucide-react";
import {
	useNotifications,
	useMarkAsRead,
	useMarkAllAsRead,
} from "../../../../shared/hooks/queries/useNotifications";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { ListSkeleton } from "../../../../shared/components/LoadingSkeletons";
import { getVisibleNotificationsForUser } from "../../../../shared/utils/notificationVisibility";
import {
	formatNotificationTitle,
	cleanNotificationMessage,
} from "../../../../shared/utils/notification";
import "../../../admin/styles/design-tokens.css";

// ── Filter tabs per role ──
const ALL_FILTER_TABS = [
	{ key: "all", label: "All", roles: ["applicant", "tenant"] },
	{ key: "reservation", label: "Reservations", roles: ["applicant", "tenant"] },
	{ key: "application", label: "Applications", roles: ["applicant"] },
	{ key: "visit", label: "Visits", roles: ["applicant", "tenant"] },
	{ key: "payment", label: "Payments", roles: ["applicant", "tenant"] },
	{ key: "billing", label: "Billing", roles: ["tenant"] },
	{ key: "maintenance", label: "Maintenance", roles: ["tenant"] },
	{ key: "announcement", label: "Announcements", roles: ["tenant"] },
];

// ── Filter matcher ──
function matchesFilter(notification, filter) {
	if (filter === "all") return true;
	if (filter === "reservation") {
		return notification.type.startsWith("reservation_") ||
			notification.title?.toLowerCase().includes("reservation") ||
			notification.title?.toLowerCase().includes("renewal");
	}
	if (filter === "application") {
		return notification.type === "general" && notification.title?.toLowerCase().includes("application");
	}
	if (filter === "visit") {
		return notification.type.startsWith("visit_") ||
			notification.title?.toLowerCase().includes("viewing") ||
			notification.title?.toLowerCase().includes("visit");
	}
	if (filter === "payment") {
		return notification.type === "payment_approved" || notification.type === "payment_confirmed" || notification.type === "payment_rejected";
	}
	if (filter === "billing") {
		return ["bill_generated", "bill_due_reminder", "penalty_applied",
			"contract_expiring", "grace_period_warning", "contract_document_ready", "renewal_effective"].includes(notification.type);
	}
	if (filter === "maintenance") {
		return notification.type === "maintenance_update";
	}
	if (filter === "announcement") {
		return notification.type === "announcement" || notification.type === "chat_reply";
	}
	return notification.type === filter;
}

// ── Notification semantic color schemes (Strict Standard Objectives) ──
const NOTIFICATION_COLOR_SCHEMES = {
	success: {
		icon: "#059669",
		dot: "#059669",
	},
	danger: {
		icon: "#DC2626",
		dot: "#DC2626",
	},
	warning: {
		icon: "#D97706",
		dot: "#D97706",
	},
	info: {
		icon: "#2563EB",
		dot: "#2563EB",
	},
	neutral: {
		icon: "#64748B",
		dot: "#64748B",
	},
};

// ── Notification type → icon + color mapping ──
const TYPE_CONFIG = {
	reservation_confirmed: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Confirmed" },
	reservation_cancelled: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Cancelled" },
	reservation_expired: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Expired" },
	reservation_noshow: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "No-Show" },
	reservation_cancellation_requested: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Under Review" },
	reservation_cancellation_rejected: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Rejected" },
	visit_requested: { icon: Home, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Scheduled" },
	visit_approved: { icon: Home, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Confirmed" },
	visit_rejected: { icon: Home, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Rejected" },
	payment_approved: { icon: CreditCard, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Confirmed" },
	payment_confirmed: { icon: CreditCard, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Confirmed" },
	payment_rejected: { icon: CreditCard, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Rejected" },
	bill_generated: { icon: CreditCard, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Bill Issued" },
	bill_due_reminder: { icon: AlertCircle, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Due Soon" },
	grace_period_warning: { icon: AlertCircle, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Grace Period" },
	penalty_applied: { icon: AlertCircle, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Penalty Applied" },
	contract_expiring: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.warning, label: "Expiring Soon" },
	contract_document_ready: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Ready for Signing" },
	renewal_effective: { icon: Calendar, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Renewal Active" },
	move_in_reminder: { icon: Home, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Move-In Notice" },
	account_suspended: { icon: AlertCircle, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Suspended" },
	account_reactivated: { icon: Check, colors: NOTIFICATION_COLOR_SCHEMES.success, label: "Reactivated" },
	maintenance_update: { icon: Wrench, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Update" },
	announcement: { icon: Megaphone, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Announcement" },
	chat_reply: { icon: Megaphone, colors: NOTIFICATION_COLOR_SCHEMES.info, label: "Admin Reply" },
	tenant_violation: { icon: AlertCircle, colors: NOTIFICATION_COLOR_SCHEMES.danger, label: "Violation" },
	general: { icon: Bell, colors: NOTIFICATION_COLOR_SCHEMES.neutral, label: "Notice" },
};

/**
 * Resolves notification icon, verb label, and color object scheme.
 * Dynamically detects action verbs and lifecycle states from title/message content.
 */
function getNotificationConfig(notification = {}) {
	const type = notification.type;
	const baseConfig = TYPE_CONFIG[type] || TYPE_CONFIG.general;

	let label = baseConfig.label;
	let colors = baseConfig.colors;

	const title = (notification.title || "").toLowerCase();
	const message = (notification.message || "").toLowerCase();

	// Priority 1: Specific Under Review / In-Progress states (Amber)
	if (
		title.includes("pending review") ||
		title.includes("under review") ||
		title.includes("application pending") ||
		title.includes("in progress") ||
		title.includes("awaiting")
	) {
		label = "Under Review";
		colors = NOTIFICATION_COLOR_SCHEMES.warning;
	} else if (
		title.includes("revision") ||
		title.includes("needs revision") ||
		message.includes("does not meet the requirements") ||
		message.includes("please upload a clear") ||
		message.includes("re-upload")
	) {
		label = "Needs Revision";
		colors = NOTIFICATION_COLOR_SCHEMES.warning;
	} else if (
		title.includes("visit complete") ||
		title.includes("physical visit complete") ||
		title.includes("move-in complete") ||
		title.includes("move-out complete") ||
		title.includes("resolved") ||
		title.includes("completed")
	) {
		label = "Completed";
		colors = NOTIFICATION_COLOR_SCHEMES.success;
	} else if (
		title.includes("approved") ||
		title.includes("confirmed")
	) {
		label = title.includes("confirmed") ? "Confirmed" : "Approved";
		colors = NOTIFICATION_COLOR_SCHEMES.success;
	} else if (
		title.includes("rejected") ||
		title.includes("declined") ||
		title.includes("cancelled") ||
		title.includes("canceled") ||
		title.includes("suspended")
	) {
		label = title.includes("cancelled") || title.includes("canceled") ? "Cancelled" : "Rejected";
		colors = NOTIFICATION_COLOR_SCHEMES.danger;
	} else if (
		title.includes("scheduled")
	) {
		label = "Scheduled";
		colors = NOTIFICATION_COLOR_SCHEMES.warning;
	} else if (
		type === "announcement" ||
		title.includes("announcement") ||
		title.includes("broadcast")
	) {
		label = "Announcement";
		colors = NOTIFICATION_COLOR_SCHEMES.info;
	} else if (
		type === "chat_reply" ||
		title.includes("admin reply") ||
		title.includes("inquiry")
	) {
		label = "Inquiry";
		colors = NOTIFICATION_COLOR_SCHEMES.info;
	}

	return {
		icon: baseConfig.icon,
		colors,
		label,
	};
}

// ── Date grouping helper ──
const getDateLabel = (dateStr) => {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

	if (diff === 0) return "Today";
	if (diff === 1) return "Yesterday";
	if (diff < 7) return `${diff} days ago`;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
};

const formatTime = (dateStr) => {
	return new Date(dateStr).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
};

// ── Filter pill classes (High Contrast Minimalist & Dark Mode Supported) ──
const getFilterPillClass = (isActive) =>
	isActive
		? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold shadow-xs"
		: "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium";


// ── Component ──

const NotificationsTab = () => {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [page, setPage] = useState(1);
	const [typeFilter, setTypeFilter] = useState("all");
	const [unreadOnly, setUnreadOnly] = useState(false);
	const { data, isLoading, error } = useNotifications(page, { unreadOnly });
	const markAsRead = useMarkAsRead();
	const markAllAsRead = useMarkAllAsRead();

	const notifications = getVisibleNotificationsForUser(data?.notifications || [], user);
	const pagination = data?.pagination || {};
	const unreadCount = data?.unreadCount || 0;
	const isApplicant = user?.role === "applicant";

	const currentRole = isApplicant ? "applicant" : "tenant";
	const filterTabs = useMemo(
		() => ALL_FILTER_TABS.filter((t) => t.roles.includes(currentRole)),
		[currentRole]
	);

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
				el.scrollLeft += e.deltaY * 0.85;
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
		if (e.button !== 0) return;
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
		if (hasDragged.current) {
			setTimeout(() => {
				hasDragged.current = false;
			}, 50);
		}
	};

	// Apply type filter
	const filtered = useMemo(
		() => notifications.filter((n) => matchesFilter(n, typeFilter)),
		[notifications, typeFilter],
	);

	// Group filtered notifications by date
	const grouped = useMemo(() => {
		const groups = {};
		filtered.forEach((n) => {
			const label = getDateLabel(n.createdAt);
			if (!groups[label]) groups[label] = [];
			groups[label].push(n);
		});
		return groups;
	}, [filtered]);

	const handleMarkRead = (id) => {
		markAsRead.mutate(id);
	};

	const handleMarkAllRead = () => {
		markAllAsRead.mutate();
	};

	const handleNotificationClick = (notification) => {
		if (!notification.isRead) {
			markAsRead.mutate(notification._id);
		}
		if (notification.type === "announcement") {
			navigate("/applicant/announcements");
		} else if (
			notification.type === "contract_document_ready" ||
			notification.type === "renewal_effective" ||
			notification.entityType === "contract"
		) {
			navigate("/applicant/contracts");
		} else if (notification.actionUrl) {
			const rawUrl = notification.actionUrl;
			if (rawUrl === "/tenant/documents" || rawUrl === "/tenant/contracts" || rawUrl === "/documents" || rawUrl === "/contracts") {
				navigate("/applicant/contracts");
			} else if (rawUrl.startsWith("/tenant/reservation")) {
				navigate(rawUrl.replace(/^\/tenant\/reservation/, "/applicant/reservation"));
			} else if (rawUrl.startsWith("/tenant/billing") || rawUrl.startsWith("/bill-details")) {
				navigate("/applicant/billing");
			} else if (rawUrl.startsWith("/tenant/maintenance")) {
				navigate(rawUrl.replace(/^\/tenant\/maintenance/, "/applicant/maintenance"));
			} else if (rawUrl.startsWith("/tenant/announcements")) {
				navigate(rawUrl.replace(/^\/tenant\/announcements/, "/applicant/announcements"));
			} else if (rawUrl.startsWith("/tenant/account") || rawUrl.startsWith("/tenant/profile")) {
				navigate("/applicant/profile");
			} else {
				navigate(rawUrl);
			}
		}
	};

	const handleFilterChange = (key) => {
		setTypeFilter(key);
		setPage(1);
	};

	const handleToggleUnread = () => {
		setUnreadOnly((prev) => !prev);
		setPage(1);
	};

	// ── Styles ──
	const cardStyle = {
		backgroundColor: "var(--card)",
		borderRadius: "12px",
		border: "1px solid var(--border)",
		overflow: "hidden",
	};

	return (
		<div style={{ width: "100%", maxWidth: "100%" }}>
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
				<div>
					<h1
						style={{
							fontSize: "22px",
							fontWeight: 700,
							color: "var(--foreground)",
							margin: "0 0 4px",
						}}
					>
						Notifications
					</h1>
					<p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
						{isApplicant
							? "Stay updated on your reservation, visit, and application progress"
							: "Stay updated on billing, maintenance, contracts, and account notices"}
					</p>
				</div>

				<button
					onClick={handleMarkAllRead}
					disabled={markAllAsRead.isPending || unreadCount === 0}
					className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-0 disabled:pointer-events-none cursor-pointer flex-shrink-0"
				>
					<CheckCheck style={{ width: "14px", height: "14px" }} />
					Mark all as read
				</button>
			</div>

			{/* Mobile Dropdown & Filter Controls (< 640px) */}
			<div className="sm:hidden flex items-center gap-2 mb-4">
				<div className="relative flex-1">
					<label htmlFor="mobile-notification-filter" className="sr-only">
						Filter notifications
					</label>
					<select
						id="mobile-notification-filter"
						value={typeFilter}
						onChange={(e) => handleFilterChange(e.target.value)}
						className="w-full sm:hidden appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-all cursor-pointer"
					>
						{filterTabs.map((tab) => (
							<option key={tab.key} value={tab.key}>
								{tab.label}
							</option>
						))}
					</select>
					<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
						<Filter size={13} />
					</div>
				</div>

				<button
					onClick={handleToggleUnread}
					type="button"
					className={`px-3 py-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
						unreadOnly
							? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100"
							: "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
					}`}
				>
					Unread only
				</button>
			</div>

			{/* Desktop Filter Pills Carousel with Arrows & Smooth Scrolling (>= 640px) */}
			<div className="hidden sm:flex notif-filter-carousel notif-filter-scroll-wrapper mb-5">
				<button
					type="button"
					className={`notif-filter-carousel-arrow notif-filter-carousel-arrow--left ${
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
					className={`notif-filter-scroll ${isDragging ? "is-dragging" : ""}`}
					role="tablist"
					aria-label="Filter notifications"
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUpOrLeave}
					onMouseLeave={handleMouseUpOrLeave}
				>
					{filterTabs.map((tab) => (
						<button
							key={tab.key}
							type="button"
							role="tab"
							aria-selected={typeFilter === tab.key}
							onClick={(e) => {
								if (hasDragged.current) {
									e.preventDefault();
									return;
								}
								handleFilterChange(tab.key);
							}}
							className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all duration-150 cursor-pointer ${getFilterPillClass(
								typeFilter === tab.key
							)}`}
						>
							{tab.label}
						</button>
					))}

					{/* Separator */}
					<span
						style={{
							width: "1px",
							height: "20px",
							backgroundColor: "var(--border)",
							margin: "0 2px",
							flexShrink: 0,
						}}
					/>

					{/* Unread only toggle */}
					<button
						type="button"
						onClick={(e) => {
							if (hasDragged.current) {
								e.preventDefault();
								return;
							}
							handleToggleUnread();
						}}
						className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all duration-150 cursor-pointer ${getFilterPillClass(
							unreadOnly
						)}`}
					>
						<span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
							<Filter style={{ width: "12px", height: "12px" }} />
							Unread only
						</span>
					</button>
				</div>

				<button
					type="button"
					className={`notif-filter-carousel-arrow notif-filter-carousel-arrow--right ${
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


			{/* Loading */}
			{isLoading && (
				<ListSkeleton rows={5} avatar />
			)}

			{/* Error */}
			{error && (
				<div style={{ ...cardStyle, padding: "48px", textAlign: "center" }}>
					<AlertCircle style={{ width: "32px", height: "32px", color: "var(--danger)", margin: "0 auto 12px" }} />
					<p style={{ color: "var(--danger)", fontSize: "14px" }}>Failed to load notifications</p>
				</div>
			)}

			{/* Empty state */}
			{!isLoading && !error && filtered.length === 0 && (
				<div
					style={{
						...cardStyle,
						padding: "64px 32px",
						textAlign: "center",
					}}
				>
					<div
						style={{
							width: "64px",
							height: "64px",
							borderRadius: "50%",
							backgroundColor: "var(--muted)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							margin: "0 auto 16px",
						}}
					>
						<Bell style={{ width: "28px", height: "28px", color: "var(--neutral)" }} />
					</div>
					<p style={{ fontSize: "16px", fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>
						{typeFilter !== "all" || unreadOnly
							? "No matching notifications"
							: "No notifications yet"}
					</p>
					<p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
						{typeFilter !== "all"
							? `No ${filterTabs.find((t) => t.key === typeFilter)?.label?.toLowerCase() || ""} notifications found.`
							: unreadOnly
								? "No unread notifications — you're all caught up!"
								: "You're all caught up! We'll notify you when something happens."}
					</p>
				</div>
			)}

			{/* Notification list grouped by date */}
			{!isLoading && !error && filtered.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
					{Object.entries(grouped).map(([dateLabel, items]) => (
						<div key={dateLabel}>
							<p
								style={{
									fontSize: "12px",
									fontWeight: 600,
									color: "var(--text-muted)",
									textTransform: "uppercase",
									letterSpacing: "0.5px",
									margin: "0 0 8px",
								}}
							>
								{dateLabel}
							</p>
							<div style={{ ...cardStyle, overflow: "hidden" }}>
								{items.map((notification, idx) => {
									const config = getNotificationConfig(notification);
									const Icon = config.icon;
									const isAnnouncement = notification.type === "announcement";

									return (
										<div
											key={notification._id}
											onClick={() => handleNotificationClick(notification)}
											role="button"
											tabIndex={0}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													handleNotificationClick(notification);
												}
											}}
											aria-label={
												isAnnouncement
													? `Open announcement: ${notification.title}`
													: !notification.isRead
														? `Mark "${notification.title}" as read`
														: undefined
											}
											style={{
												display: "flex",
												alignItems: "flex-start",
												gap: "12px",
												padding: "16px 20px",
												borderBottom:
													idx < items.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
												backgroundColor: notification.isRead
													? "var(--card)"
													: "color-mix(in srgb, var(--foreground) 3%, var(--card))",
												cursor: "pointer",
												transition: "background-color 0.15s",
												outlineOffset: "-2px",
											}}
										>
											{/* Icon */}
											<span
												style={{
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													marginTop: "2px",
													flexShrink: 0,
												}}
											>
												<Icon
													style={{
														width: "18px",
														height: "18px",
														color: config.colors.icon,
													}}
												/>
											</span>

											{/* Content */}
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: "8px",
														marginBottom: "2px",
													}}
												>
													<span
														style={{
															fontSize: "14px",
															fontWeight: notification.isRead ? 500 : 600,
															color: "var(--foreground)",
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															minWidth: 0,
														}}
													>
														{formatNotificationTitle(notification.title)}
													</span>
													<span
														style={{
															display: "inline-flex",
															alignItems: "center",
															gap: "5px",
															fontSize: "11px",
															fontWeight: 600,
															color: "var(--foreground)",
															backgroundColor: "transparent",
															border: "1px solid var(--border)",
															padding: "1px 8px",
															borderRadius: "999px",
															flexShrink: 0,
														}}
													>
														<span
															style={{
																width: "6px",
																height: "6px",
																borderRadius: "50%",
																backgroundColor: config.colors.dot,
																flexShrink: 0,
															}}
														/>
														<span>{config.label}</span>
													</span>
												</div>
												<p
													style={{
														fontSize: "13px",
														color: "var(--text-secondary)",
														margin: "0 0 4px",
														lineHeight: 1.4,
													}}
												>
													{cleanNotificationMessage(notification.message)}
												</p>
												<div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
													<span
														style={{
															fontSize: "12px",
															color: "var(--text-muted)",
														}}
													>
														{formatTime(notification.createdAt)}
													</span>
												</div>
											</div>

											{/* Unread dot */}
											{!notification.isRead && (
												<div
													style={{
														width: "7px",
														height: "7px",
														borderRadius: "50%",
														backgroundColor: "var(--foreground, #0A1628)",
														flexShrink: 0,
														marginTop: "6px",
													}}
												/>
											)}
										</div>
									);
								})}
							</div>
						</div>
					))}

					{/* Pagination */}
					{pagination.totalPages > 1 && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "16px",
								paddingTop: "8px",
							}}
						>
							<button
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page <= 1}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									padding: "6px 12px",
									border: "1px solid var(--border)",
									borderRadius: "8px",
									backgroundColor: "var(--card)",
									fontSize: "13px",
									color: page <= 1 ? "var(--neutral-light)" : "var(--text-secondary)",
									cursor: page <= 1 ? "not-allowed" : "pointer",
								}}
							>
								<ChevronLeft style={{ width: "14px", height: "14px" }} />
								Previous
							</button>
							<span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
								Page {page} of {pagination.totalPages}
							</span>
							<button
								onClick={() =>
									setPage((p) => Math.min(pagination.totalPages, p + 1))
								}
								disabled={page >= pagination.totalPages}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									padding: "6px 12px",
									border: "1px solid var(--border)",
									borderRadius: "8px",
									backgroundColor: "var(--card)",
									fontSize: "13px",
									color: page >= pagination.totalPages ? "var(--neutral-light)" : "var(--text-secondary)",
									cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
								}}
							>
								Next
								<ChevronRight style={{ width: "14px", height: "14px" }} />
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default NotificationsTab;