import { useMemo, useState } from "react";
import SkeletonPulse from "../../../shared/components/SkeletonPulse";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  DoorOpen,
  Wrench,
  Users,
  Mail,
  MapPin,
  ChevronRight,
} from "lucide-react";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
  getReservationStatusLabel,
} from "../utils/formatters";
import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  CardSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "../../../shared/components/LoadingSkeletons";
import { AdminDashboardSkeleton } from "../components/AdminContentSkeletons";
import { PageShell, StatusBadge } from "../components/shared";
import OccupancyTrendCard from "../components/dashboard/OccupancyTrendCard";
import RevenueTrendCard from "../components/dashboard/RevenueTrendCard";
import "../styles/design-tokens.css";
import "../styles/admin-dashboard.css";

/** Skeleton placeholder for a single KPI stat card — matches the real card layout. */
function StatCardSkeleton() {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: "var(--border-light)",
        backgroundColor: "var(--bg-card)",
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <SkeletonPulse variant="text" width="65%" height="11px" />
        <SkeletonPulse variant="circle" width="16px" />
      </div>
      <div className="flex flex-col gap-2">
        <SkeletonPulse width="40%" height="28px" borderRadius="6px" />
        <SkeletonPulse variant="text" width="80%" height="11px" />
      </div>
    </div>
  );
}

/** Skeleton for a single inquiry / reservation row */
function RowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid var(--border-light)" }}>
      <SkeletonPulse variant="circle" width="44px" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        <SkeletonPulse variant="text" width="45%" height="14px" />
        <SkeletonPulse variant="text" width="30%" height="11px" />
        <SkeletonPulse variant="text" width="55%" height="11px" />
      </div>
      <SkeletonPulse width="72px" height="24px" borderRadius="6px" />
    </div>
  );
}

/** Skeleton table row for reservations */
function TableRowSkeleton() {
  return (
    <tr>
      {["28%", "20%", "16%", "14%", "12%"].map((w, i) => (
        <td key={i} className="px-6 py-4">
          <SkeletonPulse variant="text" width={w} height="13px" />
        </td>
      ))}
    </tr>
  );
}

function getReservationStatusBadgeStyle(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (
    [
      "approved",
      "confirmed",
      "checked_in",
      "active",
      "reserved",
      "movein",
      "moved_in",
      "approved_for_payment",
      "completed",
      "settled",
      "paid",
    ].includes(normalized)
  ) {
    return {
      backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)",
      color: "var(--success)",
      borderColor: "color-mix(in srgb, var(--success) 28%, transparent)",
    };
  }
  if (
    [
      "pending",
      "pending_approval",
      "under_review",
      "pending_application_review",
      "needs_revision",
      "payment_pending",
      "visit_pending",
      "partial",
      "cancellation_requested",
      "disputed",
    ].includes(normalized)
  ) {
    return {
      backgroundColor: "color-mix(in srgb, var(--warning) 15%, transparent)",
      color: "var(--warning-dark, #92400e)",
      borderColor: "color-mix(in srgb, var(--warning) 32%, transparent)",
    };
  }
  if (
    [
      "viewing_preference_selected",
      "visit_approved",
      "inquiry",
      "responded",
      "new",
    ].includes(normalized)
  ) {
    return {
      backgroundColor: "color-mix(in srgb, var(--info) 12%, transparent)",
      color: "var(--info)",
      borderColor: "color-mix(in srgb, var(--info) 28%, transparent)",
    };
  }
  if (
    [
      "rejected",
      "cancelled",
      "expired",
      "terminated",
      "overdue",
      "no-show",
      "noshow",
      "no_show",
      "banned",
      "suspended",
      "failed",
    ].includes(normalized)
  ) {
    return {
      backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)",
      color: "var(--danger)",
      borderColor: "color-mix(in srgb, var(--danger) 28%, transparent)",
    };
  }
  return {
    backgroundColor: "color-mix(in srgb, var(--neutral) 12%, transparent)",
    color: "var(--neutral)",
    borderColor: "color-mix(in srgb, var(--neutral) 28%, transparent)",
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const isOwner = user?.role === "super_admin" || user?.role === "owner";
  const [range, setRange] = useState("30d");
  const [branch, setBranch] = useState("all");

  const queryParams = useMemo(
    () => ({
      range,
      ...(isOwner ? { branch } : {}),
    }),
    [branch, isOwner, range],
  );

  const { data, isLoading, isError } = useDashboardData(queryParams);
  const showSkeleton = isLoading && !data;

  const reservations = data?.recentReservations || [];
  const inquiryItems = data?.recentInquiries || [];
  const reservationStatus = data?.reservationStatus || {
    approved: 0,
    pending: 0,
    rejected: 0,
  };
  const kpis = data?.kpis || {};
  const occupancy = data?.occupancy || {};

  const unresolvedInquiryCount = useMemo(
    () =>
      inquiryItems.filter(
        (item) => !["resolved", "closed"].includes(item.status),
      ).length,
    [inquiryItems],
  );

  const summaryItems = useMemo(
    () => [
      {
        label: "Total Inquiries",
        value: kpis.inquiries || 0,
        trend: `${unresolvedInquiryCount} awaiting response`,
        tone: "blue",
        icon: MessageSquare,
      },
      {
        label: "Available Beds",
        value: kpis.availableBeds || 0,
        trend: `${occupancy.totalOccupancy || 0} currently occupied / ${occupancy.totalCapacity || 0} total`,
        tone: (kpis.availableBeds || 0) > 0 ? "green" : "neutral",
        icon: DoorOpen,
      },
      {
        label: "Active Maintenance",
        value: kpis.activeTickets || 0,
        trend:
          (kpis.activeTickets || 0) === 0
            ? "All facilities currently operational"
            : `${kpis.activeTickets || 0} issue${(kpis.activeTickets || 0) === 1 ? "" : "s"} requiring attention`,
        tone: (kpis.activeTickets || 0) > 0 ? "rose" : "green",
        icon: Wrench,
      },
      {
        label: "Pending Reservations",
        value: reservationStatus.pending || 0,
        trend:
          (reservationStatus.pending || 0) === 0
            ? "No pending approvals queued"
            : "Awaiting admin approval",
        tone: (reservationStatus.pending || 0) > 0 ? "amber" : "neutral",
        icon: Calendar,
      },
      {
        label: "Active Bookings",
        value: kpis.activeBookings || 0,
        trend: `${kpis.activeBookings || 0} active tenant account${(kpis.activeBookings || 0) === 1 ? "" : "s"}`,
        tone: (kpis.activeBookings || 0) > 0 ? "green" : "neutral",
        icon: Users,
      },
    ],
    [kpis, occupancy, reservationStatus, unresolvedInquiryCount],
  );

  const recentInquiries = useMemo(
    () =>
      inquiryItems.slice(0, 4).map((item) => {
        const isResponded =
          item.status === "resolved" || item.status === "closed";
        return {
          id: item.id,
          name: item.name || "Unknown",
          email: item.email || "-",
          branch: formatBranch(item.branch),
          time: formatRelativeTime(item.createdAt),
          date: formatDate(item.createdAt),
          status: isResponded ? "responded" : "new",
          followUp: isResponded ? "Responded" : "Needs Reply",
        };
      }),
    [inquiryItems],
  );

  const recentReservations = useMemo(
    () =>
      reservations.slice(0, 4).map((item) => ({
        id: item.id,
        roomType: formatRoomType(item.roomType),
        guestName: item.guestName || "Unknown",
        branch: formatBranch(item.branch),
        date: formatDate(item.moveInDate || item.createdAt),
        status: item.status || "pending",
      })),
    [reservations],
  );

  if (isLoading && !data) {
    return <AdminDashboardSkeleton />;
  }

  const reservationTotal =
    (reservationStatus.approved || 0) +
    (reservationStatus.pending || 0) +
    (reservationStatus.rejected || 0);

  const reservationSegment = (count) =>
    reservationTotal ? (count / reservationTotal) * 502.6 : 0;

  const DASHBOARD_STAT_ICON_COLORS = {
    blue: "text-sky-600 dark:text-sky-400",
    green: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
    neutral: "text-slate-500 dark:text-slate-400",
  };

  const metricValueStyle = {
    blue: { color: "var(--info)" },
    green: { color: "var(--success)" },
    violet: { color: "var(--text-primary)" },
    amber: { color: "var(--warning-dark, #92400e)" },
    rose: { color: "var(--danger)" },
    neutral: { color: "var(--text-primary)" },
  };

  const error = isError
    ? "Some dashboard data failed to load. Showing partial data."
    : null;

  const dashboardControls = (
    <div className="flex flex-wrap items-center gap-3">
      {isOwner && (
        <div className="flex items-center gap-2">
          <label htmlFor="dashboard-branch-select" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Branch:
          </label>
          <select
            id="dashboard-branch-select"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            style={{
              borderColor: "var(--border-light)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">All Branches</option>
            <option value="gil-puyat">Gil Puyat</option>
            <option value="guadalupe">Guadalupe</option>
          </select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="dashboard-range-select" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Range:
        </label>
        <select
          id="dashboard-range-select"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
          style={{
            borderColor: "var(--border-light)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
          }}
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="60d">Last 60 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="365d">Last 1 Year</option>
          <option value="12m">Last 12 Months</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="dashboard-page-bg">
      <PageShell
        title="Dashboard"
        subtitle="Monitor branch activity, queue pressure, and urgent follow-up from one operations view."
        controls={dashboardControls}
      >
        <PageShell.Summary>

          {error && (
            <div
              className="mb-6 rounded-xl border px-4 py-3 text-sm font-medium"
              style={{
                borderColor: "var(--color-danger)",
                backgroundColor: "var(--danger-light)",
                color: "var(--danger-dark)",
              }}
            >
              {error}
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {showSkeleton
              ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
              : summaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article
                      key={item.label}
                      className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                          {item.label}
                        </span>
                        <div
                          className={`flex shrink-0 items-center justify-center ${
                            DASHBOARD_STAT_ICON_COLORS[item.tone] || DASHBOARD_STAT_ICON_COLORS.neutral
                          }`}
                        >
                          <Icon size={18} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
                          {item.value}
                        </p>
                        {item.trend && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground font-medium line-clamp-1">
                            {item.trend}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
          </div>
        </PageShell.Summary>

        <PageShell.Content>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section
              className="rounded-xl border p-6 lg:col-span-2 shadow-sm"
              style={{
                borderColor: "var(--border-light)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2
                    className="text-sm font-semibold tracking-tight text-foreground"
                  >
                    Recent Inquiries
                  </h2>
                  {showSkeleton ? (
                    <SkeletonPulse variant="text" width="200px" height="11px" style={{ marginTop: "4px" }} />
                  ) : (
                    <p
                      className="mt-0.5 text-xs font-normal text-muted-foreground"
                    >
                      {kpis.inquiries || 0} on the active range • newest items first
                    </p>
                  )}
                </div>
                <Link
                  to={isOwner ? "/admin/inquiries" : "/admin/reservations?tab=inquiries"}
                  state={{ fromDashboard: true }}
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:underline transition-all text-primary"
                >
                  View All
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="space-y-3">
                {showSkeleton ? (
                  Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
                ) : recentInquiries.length > 0 ? (
                  recentInquiries.map((inq) => (
                    <article
                      key={inq.id}
                      className="group flex items-center justify-between rounded-xl p-4 border border-transparent transition-all"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--bg-inset) 50%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className="flex shrink-0 items-center justify-center text-sky-600 dark:text-sky-400"
                        >
                          <Mail className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <h3
                            className="truncate text-[13px] font-semibold text-foreground"
                          >
                            {inq.name}
                          </h3>
                          <p
                            className="truncate text-[11px] font-normal text-muted-foreground"
                          >
                            {inq.email}
                          </p>
                          <div
                            className="mt-1 flex items-center gap-3 text-[11px] font-normal text-muted-foreground"
                          >
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {inq.branch}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {inq.date || inq.time}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center rounded-lg px-3 py-1 text-[11px] font-medium border"
                        style={
                          inq.status === "responded"
                            ? {
                                backgroundColor:
                                  "color-mix(in srgb, var(--success) 12%, transparent)",
                                color: "var(--success)",
                                borderColor:
                                  "color-mix(in srgb, var(--success) 24%, transparent)",
                              }
                            : {
                                backgroundColor:
                                  "color-mix(in srgb, var(--warning) 15%, transparent)",
                                color: "var(--warning-dark, #92400e)",
                                borderColor:
                                  "color-mix(in srgb, var(--warning) 30%, transparent)",
                              }
                        }
                      >
                        {inq.followUp}
                      </span>
                    </article>
                  ))
                ) : (
                  <div
                    className="flex flex-col items-center justify-center py-10"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <CheckCircle2 className="mb-2 h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium">No recent inquiries.</p>
                  </div>
                )}
              </div>
            </section>

            <section
              className="rounded-xl border p-6 shadow-sm"
              style={{
                borderColor: "var(--border-light)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div className="mb-4">
                <h2
                  className="text-sm font-semibold tracking-tight text-foreground"
                >
                  Reservation Status
                </h2>
                {showSkeleton ? (
                  <SkeletonPulse variant="text" width="180px" height="11px" style={{ marginTop: "4px" }} />
                ) : (
                  <p
                    className="mt-0.5 text-xs font-normal text-muted-foreground"
                  >
                    {reservationStatus.pending || 0} pending •{" "}
                    {reservationStatus.approved || 0} approved •{" "}
                    {reservationStatus.rejected || 0} rejected
                  </p>
                )}
              </div>

              <div className="mb-6 flex justify-center py-4">
                {showSkeleton ? (
                  <SkeletonPulse variant="circle" width="180px" />
                ) : (
                  <svg
                    className="h-[180px] w-[180px]"
                    viewBox="0 0 200 200"
                    aria-label="Reservation status chart"
                  >
                    <circle
                      cx="100"
                      cy="100"
                      r="80"
                      fill="none"
                      stroke="var(--border-light)"
                      strokeWidth="20"
                      opacity={0.5}
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="80"
                      fill="none"
                      stroke="var(--color-success)"
                      strokeWidth="20"
                      strokeDasharray={`${reservationSegment(reservationStatus.approved || 0)} 502.6`}
                      transform="rotate(-90 100 100)"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="80"
                      fill="none"
                      stroke="var(--color-warning)"
                      strokeWidth="20"
                      strokeDasharray={`${reservationSegment(reservationStatus.pending || 0)} 502.6`}
                      strokeDashoffset={`-${reservationSegment(reservationStatus.approved || 0)}`}
                      transform="rotate(-90 100 100)"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="80"
                      fill="none"
                      stroke="var(--color-danger)"
                      strokeWidth="20"
                      strokeDasharray={`${reservationSegment(reservationStatus.rejected || 0)} 502.6`}
                      strokeDashoffset={`-${reservationSegment((reservationStatus.approved || 0) + (reservationStatus.pending || 0))}`}
                      transform="rotate(-90 100 100)"
                    />
                  </svg>
                )}
              </div>

              <div className="space-y-3">
                {showSkeleton ? (
                  ["65%", "50%", "40%"].map((w, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <SkeletonPulse variant="text" width={w} height="13px" />
                      <SkeletonPulse variant="text" width="24px" height="13px" />
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[13px]">
                      <span
                        className="flex items-center gap-2 font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: "var(--color-success)" }}
                        />
                        Approved
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {reservationStatus.approved || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span
                        className="flex items-center gap-2 font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: "var(--color-warning)" }}
                        />
                        Pending
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {reservationStatus.pending || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span
                        className="flex items-center gap-2 font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: "var(--color-danger)" }}
                        />
                        Rejected
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {reservationStatus.rejected || 0}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {showSkeleton ? (
              <>
                <div
                  className="rounded-xl border p-6 shadow-sm"
                  style={{ borderColor: "var(--border-light)", backgroundColor: "var(--bg-card)" }}
                >
                  <SkeletonPulse variant="text" width="150px" height="16px" style={{ marginBottom: "8px" }} />
                  <SkeletonPulse variant="text" width="210px" height="11px" style={{ marginBottom: "20px" }} />
                  <SkeletonPulse width="100%" height="140px" borderRadius="8px" />
                </div>
                <div
                  className="rounded-xl border p-6 shadow-sm"
                  style={{ borderColor: "var(--border-light)", backgroundColor: "var(--bg-card)" }}
                >
                  <SkeletonPulse variant="text" width="150px" height="16px" style={{ marginBottom: "8px" }} />
                  <SkeletonPulse variant="text" width="210px" height="11px" style={{ marginBottom: "20px" }} />
                  <SkeletonPulse width="100%" height="140px" borderRadius="8px" />
                </div>
              </>
            ) : (
              <>
                <OccupancyTrendCard data={occupancy} />
                <RevenueTrendCard data={kpis} />
              </>
            )}
          </div>

          <section
            className="rounded-xl border p-6 shadow-sm"
            style={{
              borderColor: "var(--border-light)",
              backgroundColor: "var(--bg-card)",
            }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2
                  className="text-sm font-semibold tracking-tight text-foreground"
                >
                  Recent Reservations
                </h2>
                {showSkeleton ? (
                  <SkeletonPulse variant="text" width="240px" height="11px" style={{ marginTop: "4px" }} />
                ) : (
                  <p
                    className="mt-0.5 text-xs font-normal text-muted-foreground"
                  >
                    {reservationStatus.pending || 0} pending review •{" "}
                    {kpis.activeBookings || 0} active bookings •{" "}
                    {recentReservations.length} current scope
                  </p>
                )}
              </div>
              <Link
                to="/admin/reservations"
                className="inline-flex items-center gap-1 text-xs font-semibold hover:underline transition-all text-primary"
              >
                View All
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {showSkeleton ? (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[800px]">
                  <tbody className="divide-y" style={{ borderColor: "var(--border-light)" }}>
                    {Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}
                  </tbody>
                </table>
              </div>
            ) : recentReservations.length > 0 ? (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr
                      className="border-b"
                      style={{
                        borderColor: "var(--border-light)",
                        backgroundColor:
                          "color-mix(in srgb, var(--bg-inset) 30%, transparent)",
                      }}
                    >
                      <th
                        className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Room Type
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Tenant
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Branch
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Date
                      </th>
                      <th
                        className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y"
                    style={{ borderColor: "var(--border-light)" }}
                  >
                    {recentReservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className="group transition-colors hover:bg-muted/30"
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex shrink-0 items-center justify-center text-muted-foreground"
                            >
                              <DoorOpen className="h-4 w-4" />
                            </div>
                            <span
                              className="text-[13px] font-semibold text-foreground"
                            >
                              {reservation.roomType}
                            </span>
                          </div>
                        </td>

                        <td
                          className="px-6 py-3.5 text-[13px] font-medium text-foreground"
                        >
                          {reservation.guestName}
                        </td>
                        <td className="px-6 py-3.5">
                          <span
                            className="flex items-center gap-1 text-[12px] font-normal text-muted-foreground"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {reservation.branch}
                          </span>
                        </td>
                        <td
                          className="px-6 py-3.5 text-[12px] font-normal tabular-nums text-muted-foreground"
                        >
                          {reservation.date}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <StatusBadge status={reservation.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center py-10"
                style={{ color: "var(--text-muted)" }}
              >
                <CheckCircle2 className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm font-medium">No recent reservations.</p>
              </div>
            )}
          </section>
        </PageShell.Content>
      </PageShell>
    </div>
  );
}
