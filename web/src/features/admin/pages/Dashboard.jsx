import { useMemo } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, MessageSquare, CalendarCheck, Clock } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
} from "../utils/formatters";

import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useBillingStats } from "../../../shared/hooks/queries/useBilling";
import { PageShell, SummaryBar, StatusBadge } from "../components/shared";
import ReservationStatusChart from "../components/dashboard/ReservationStatusChart";
import "../styles/design-tokens.css";
import "../styles/admin-dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
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
    const activeBookings = (reservations || []).filter((r) =>
      ["confirmed", "checked-in"].includes(r.status),
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
          ? `${String(occupancyStats.overallOccupancyRate).replace('%', '')}% occ.`
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
  }, [occupancyStats, inquiryStatsData, userStatsData, reservations, billingStats]);

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
      roomType: formatRoomType(
        item.roomId?.type || item.preferredRoomType,
      ),
      guestName:
        `${item.userId?.firstName || ""} ${item.userId?.lastName || ""}`.trim() ||
        item.guestName ||
        "Unknown",
      branch: formatBranch(item.roomId?.branch || item.branch),
      date: formatDate(item.checkInDate || item.createdAt),
      status: item.status || "pending",
    }));
  }, [reservations]);

  const reservationStatus = useMemo(() => {
    const approved = (reservations || []).filter((r) =>
      ["confirmed", "checked-in"].includes(r.status),
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

  return (
    <PageShell>
      <PageShell.Summary>
        {error && <div className="dash-error">{error}</div>}
        {isLoading && <div className="dash-loading">Loading dashboard...</div>}

        {/* Super Admin callout */}
        {isSuperAdmin && (
          <div className="dash-callout">
            <div className="dash-callout__left">
              <div className="dash-callout__icon">
                <LayoutGrid size={15} strokeWidth={2} />
              </div>
              <div>
                <p className="dash-callout__title">System Overview</p>
                <p className="dash-callout__desc">
                  View aggregated metrics and branch comparison across all locations.
                </p>
              </div>
            </div>
            <Link to="/admin/dashboard" className="dash-callout__btn">
              Open →
            </Link>
          </div>
        )}

        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Content>
        {/* Two-column grid: Inquiries + Reservation Chart */}
        <div className="dash-grid">
          <div className="dash-card">
            <div className="dash-card__header">
              <h2 className="dash-card__title">Recent Inquiries</h2>
              <Link to="/admin/reservations" className="dash-card__link">View All</Link>
            </div>
            <div className="dash-card__list">
              {recentInquiries.length > 0 ? (
                recentInquiries.map((inq) => (
                  <div key={inq.id} className="dash-list-item">
                    <div className="dash-list-item__icon">
                      <MessageSquare size={16} />
                    </div>
                    <div className="dash-list-item__body">
                      <span className="dash-list-item__name">{inq.name}</span>
                      <span className="dash-list-item__sub">{inq.email}</span>
                      <div className="dash-list-item__meta">
                        <span>{inq.branch}</span>
                        <span className="dash-list-item__time">
                          <Clock size={11} /> {inq.time}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={inq.status} />
                  </div>
                ))
              ) : (
                <p className="dash-empty">No recent inquiries.</p>
              )}
            </div>
          </div>

          <div className="dash-card">
            <ReservationStatusChart reservationStatus={reservationStatus} />
          </div>
        </div>

        {/* Recent Reservations */}
        <div className="dash-card dash-card--full">
          <div className="dash-card__header">
            <h2 className="dash-card__title">Recent Reservations</h2>
            <Link to="/admin/reservations" className="dash-card__link">View All</Link>
          </div>
          <div className="dash-card__list">
            {recentReservations.length > 0 ? (
              recentReservations.map((res) => (
                <div key={res.id} className="dash-list-item">
                  <div className="dash-list-item__icon dash-list-item__icon--purple">
                    <CalendarCheck size={16} />
                  </div>
                  <div className="dash-list-item__body">
                    <span className="dash-list-item__name">{res.roomType}</span>
                    <span className="dash-list-item__sub">{res.guestName}</span>
                    <div className="dash-list-item__meta">
                      <span>{res.branch}</span>
                      <span>{res.date}</span>
                    </div>
                  </div>
                  <StatusBadge status={res.status} />
                </div>
              ))
            ) : (
              <p className="dash-empty">No recent reservations.</p>
            )}
          </div>
        </div>
      </PageShell.Content>
    </PageShell>
  );
}
