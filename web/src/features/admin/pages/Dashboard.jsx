import { useMemo } from "react";
import ReservationItem from "../components/ReservationItem";
import InquiryItem from "../components/InquiryItem";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
} from "../utils/formatters";

import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useBillingStats } from "../../../shared/hooks/queries/useBilling";
import DashboardStatsBar from "../components/dashboard/DashboardStatsBar";
import ReservationStatusChart from "../components/dashboard/ReservationStatusChart";
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

  // ── Derive all dashboard data from query results ──
  const occupancyStats = occupancy.data?.statistics || occupancy.data;
  const inquiryStatsData = inquiryStats.data;
  const userStatsData = userStats.data;
  const reservations = reservationsQuery.data || [];
  const inquiryItems = (() => {
    const raw = inquiriesQuery.data;
    if (Array.isArray(raw)) return raw;
    return raw?.inquiries || [];
  })();

  const getMonthSeries = (monthsBack = 5) => {
    const now = new Date();
    const series = [];
    for (let i = monthsBack - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      series.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: String(date.getMonth() + 1).padStart(2, "0"),
      });
    }
    return series;
  };

  const stats = useMemo(() => {
    const totalInquiries = inquiryStatsData?.total || 0;
    const availableBeds =
      (occupancyStats?.totalCapacity || 0) -
      (occupancyStats?.totalOccupancy || 0);
    const registeredUsers = userStatsData?.total || 0;
    const activeBookings = (reservations || []).filter((r) =>
      ["confirmed", "checked-in"].includes(r.status),
    ).length;
    const approvedCount = activeBookings;

    return [
      {
        id: 1,
        label: "Total Inquiries",
        value: String(totalInquiries),
        icon: "inquiries",
        color: "#0F4A7F",
        percentage: inquiryStatsData?.recentCount
          ? `${inquiryStatsData.recentCount} last 7d`
          : "-",
      },
      {
        id: 2,
        label: "Available Beds",
        value: String(Math.max(availableBeds, 0)),
        icon: "rooms",
        color: "#F59E0B",
        percentage: occupancyStats?.overallOccupancyRate || "-",
      },
      {
        id: 3,
        label: "Registered Users",
        value: String(registeredUsers),
        icon: "tenants",
        color: "#10B981",
        percentage: userStatsData?.activeCount
          ? `${userStatsData.activeCount} active`
          : "-",
      },
      {
        id: 4,
        label: "Active Bookings",
        value: String(activeBookings),
        icon: "reservations",
        color: "#A855F7",
        percentage: approvedCount ? `${approvedCount} confirmed` : "-",
      },
      {
        id: 5,
        label: "Total Revenue",
        value: billingStats?.totalCollected
          ? `₱${Number(billingStats.totalCollected).toLocaleString()}`
          : "₱0",
        icon: "billing",
        color: "#3B82F6",
        percentage: billingStats?.overdueCount
          ? `${billingStats.overdueCount} overdue`
          : "0 overdue",
      },
    ];
  }, [occupancyStats, inquiryStatsData, userStatsData, reservations, billingStats]);

  const recentInquiries = useMemo(
    () =>
      (inquiryItems || []).slice(0, 4).map((item) => ({
        id: item._id,
        name:
          `${item.firstName || ""} ${item.lastName || ""}`.trim() ||
          item.name ||
          "Unknown",
        email: item.email || "-",
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
    <div className="admin-dashboard-main">
      {error && <div className="admin-dashboard-error">{error}</div>}
      {isLoading && (
        <div className="admin-dashboard-loading">Loading dashboard...</div>
      )}

      <DashboardStatsBar stats={stats} />

      <div className="admin-dashboard-bottom-section">
        {/* Recent Inquiries */}
        <div className="admin-dashboard-inquiries-section">
          <div className="admin-dashboard-inquiries-header">
            <h2 className="admin-dashboard-section-title">Recent Inquiries</h2>
            <a href="/admin/inquiries" className="admin-dashboard-view-all">
              View All
            </a>
          </div>
          <div className="admin-dashboard-inquiries-list">
            {recentInquiries.length > 0 ? (
              recentInquiries.map((inquiry) => (
                <InquiryItem key={inquiry.id} inquiry={inquiry} />
              ))
            ) : (
              <p className="admin-dashboard-empty">No recent inquiries.</p>
            )}
          </div>
        </div>

        <ReservationStatusChart reservationStatus={reservationStatus} />
      </div>

      {/* Recent Reservations */}
      <div className="admin-dashboard-reservations-full-section">
        <div className="admin-dashboard-reservations-header">
          <h2 className="admin-dashboard-section-title">Recent Reservations</h2>
          <a href="/admin/reservations" className="admin-dashboard-view-all">
            View All
          </a>
        </div>
        <div className="admin-dashboard-reservations-list">
          {recentReservations.length > 0 ? (
            recentReservations.map((reservation) => (
              <ReservationItem key={reservation.id} reservation={reservation} />
            ))
          ) : (
            <p className="admin-dashboard-empty">No recent reservations.</p>
          )}
        </div>
      </div>
    </div>
  );
}
