import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  CalendarCheck,
  Clock,
  Users,
  Bed,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import {
  hasReservationStatus,
  readMoveInDate,
} from "../../../shared/utils/lifecycleNaming";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
} from "../utils/formatters";

import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useBillingStats } from "../../../shared/hooks/queries/useBilling";
import { StatusBadge } from "../components/shared";
import ReservationStatusChart from "../components/dashboard/ReservationStatusChart";
import "../styles/design-tokens.css";
import "../styles/admin-dashboard.css";

export default function Dashboard() {
  const {
    occupancy,
    inquiryStats,
    userStats,
    reservations: reservationsQuery,
    inquiries: inquiriesQuery,
    isLoading,
    isError,
  } = useDashboardData();

  const { data: billingStats } = useBillingStats();

  // ── Derive dashboard data ──
  const occupancyStats = occupancy.data?.statistics || occupancy.data;
  const inquiryStatsData = inquiryStats.data;
  const userStatsData = userStats.data;
  const reservations = reservationsQuery.data || [];
  const inquiryItems = (() => {
    const raw = inquiriesQuery.data;
    if (Array.isArray(raw)) return raw;
    return raw?.inquiries || [];
  })();

  // ── Summary bar pills ──
  const summaryItems = useMemo(() => {
    const totalInquiries = inquiryStatsData?.total || 0;
    const availableBeds =
      (occupancyStats?.totalCapacity || 0) -
      (occupancyStats?.totalOccupancy || 0);
    const registeredUsers = userStatsData?.total || 0;
    const activeBookings = (reservations || []).filter(
      (r) =>
        r.status === "confirmed" ||
        r.status === "reserved" ||
        hasReservationStatus(r.status, "moveIn"),
    ).length;
    const revenue = billingStats?.totalCollected
      ? `₱${Number(billingStats.totalCollected).toLocaleString()}`
      : "₱0";

    return [
      {
        label: "Total Inquiries",
        value: totalInquiries,
        trend: inquiryStatsData?.recentCount
          ? `${inquiryStatsData.recentCount} last 7d`
          : null,
        color: "blue",
      },
      {
        label: "Available Beds",
        value: Math.max(availableBeds, 0),
        trend: occupancyStats?.overallOccupancyRate
          ? `${String(occupancyStats.overallOccupancyRate).replace("%", "")}% occ.`
          : null,
        color: "green",
      },
      {
        label: "Registered Users",
        value: registeredUsers,
        trend: userStatsData?.activeCount
          ? `${userStatsData.activeCount} active`
          : null,
        color: "purple",
      },
      {
        label: "Active Bookings",
        value: activeBookings,
        color: "orange",
      },
      {
        label: "Total Revenue",
        value: revenue,
        trend: billingStats?.overdueCount
          ? `${billingStats.overdueCount} overdue`
          : null,
        color: "blue",
      },
    ];
  }, [
    occupancyStats,
    inquiryStatsData,
    userStatsData,
    reservations,
    billingStats,
  ]);

  // ── Recent items ──
  const recentInquiries = useMemo(
    () =>
      (inquiryItems || []).slice(0, 4).map((item) => ({
        id: item._id,
        name:
          `${item.firstName || ""} ${item.lastName || ""}`.trim() ||
          item.name ||
          "Unknown",
        email: item.email || "—",
        branch: formatBranch(item.branch),
        time: formatRelativeTime(item.createdAt),
        status:
          item.status === "resolved" || item.status === "closed"
            ? "responded"
            : "new",
      })),
    [inquiryItems],
  );

  const recentReservations = useMemo(() => {
    const sorted = (reservations || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted.slice(0, 4).map((item) => ({
      id: item._id,
      roomType: formatRoomType(item.roomId?.type || item.preferredRoomType),
      guestName:
        `${item.userId?.firstName || ""} ${item.userId?.lastName || ""}`.trim() ||
        item.guestName ||
        "Unknown",
      branch: formatBranch(item.roomId?.branch || item.branch),
      date: formatDate(readMoveInDate(item) || item.createdAt),
      status: item.status || "pending",
    }));
  }, [reservations]);

  const reservationStatus = useMemo(() => {
    const approved = (reservations || []).filter(
      (r) =>
        r.status === "confirmed" ||
        r.status === "reserved" ||
        hasReservationStatus(r.status, "moveIn"),
    ).length;
    const pending = (reservations || []).filter(
      (r) => r.status === "pending",
    ).length;
    const rejected = (reservations || []).filter((r) =>
      ["cancelled", "rejected"].includes(r.status),
    ).length;
    return { approved, pending, rejected };
  }, [reservations]);

  const error = isError
    ? "Some dashboard data failed to load. Showing partial data."
    : null;

  const summaryIcons = {
    "Total Inquiries": MessageSquare,
    "Available Beds": Bed,
    "Registered Users": Users,
    "Active Bookings": CalendarCheck,
    "Total Revenue": DollarSign,
  };

  const colorClasses = {
    blue: "from-blue-50 to-blue-100/50 text-blue-600",
    green: "from-green-50 to-green-100/50 text-green-600",
    purple: "from-violet-50 to-violet-100/50 text-violet-600",
    orange: "from-orange-50 to-orange-100/50 text-orange-600",
    emerald: "from-emerald-50 to-emerald-100/50 text-emerald-600",
  };

  return (
    <div className="min-h-screen w-full bg-slate-50/70">
      <div className="w-full px-3 py-4 sm:px-4 lg:px-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {isLoading && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Loading dashboard...
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          {summaryItems.map((stat) => {
            const Icon = summaryIcons[stat.label] || TrendingUp;
            const palette = colorClasses[stat.color] || colorClasses.blue;
            const [bgFrom, bgTo, iconText] = palette.split(" ");

            return (
              <div
                key={stat.label}
                className="group min-h-[190px] rounded-2xl border border-slate-200/70 bg-white p-8 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <div className="mb-5 flex items-start justify-between">
                  <div
                    className={`rounded-xl bg-gradient-to-br p-3 ${bgFrom} ${bgTo}`}
                  >
                    <Icon className={`h-6 w-6 ${iconText}`} />
                  </div>
                  <TrendingUp className="h-5 w-5 text-slate-400 transition-colors group-hover:text-slate-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                  <p className="text-2xl font-semibold leading-tight text-slate-900">{stat.value}</p>
                  {stat.trend && <p className="text-xs text-slate-500">{stat.trend}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="h-full rounded-2xl border border-slate-200/70 bg-white p-8 transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/60">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Recent Inquiries
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Latest customer inquiries
                </p>
              </div>
              <Link
                to="/admin/reservations"
                className="group inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="space-y-1">
              {recentInquiries.length > 0 ? (
                recentInquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className="group flex cursor-pointer items-start gap-3 rounded-xl p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 transition-colors group-hover:bg-blue-100">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {inq.name}
                        </p>
                        <StatusBadge status={inq.status} />
                      </div>
                      <p className="mb-1 truncate text-sm text-slate-600">{inq.email}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{inq.branch}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {inq.time}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center">
                  <MessageSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="text-sm text-slate-500">No recent inquiries.</p>
                </div>
              )}
            </div>
          </div>

          <div className="h-full rounded-2xl border border-slate-200/70 bg-white p-8 transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/60">
            <ReservationStatusChart reservationStatus={reservationStatus} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/60">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Recent Reservations
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">Latest booking activity</p>
            </div>
            <Link
              to="/admin/reservations"
              className="group inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View All
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="space-y-1">
            {recentReservations.length > 0 ? (
              recentReservations.map((res) => (
                <div
                  key={res.id}
                  className="group flex cursor-pointer items-start gap-3 rounded-xl p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 transition-colors group-hover:bg-violet-100">
                    <CalendarCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {res.roomType}
                      </p>
                      <StatusBadge status={res.status} />
                    </div>
                    <p className="mb-1 truncate text-sm text-slate-600">
                      {res.guestName}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">{res.branch}</span>
                      <span>{res.date}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center">
                <CalendarCheck className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-500">No recent reservations.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
