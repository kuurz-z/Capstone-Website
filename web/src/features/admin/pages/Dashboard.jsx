import { useEffect, useMemo, useState } from "react";
import ReservationItem from "../components/ReservationItem";
import InquiryItem from "../components/InquiryItem";
import {
  inquiryApi,
  reservationApi,
  roomApi,
  userApi,
} from "../../../shared/api/apiClient";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
} from "../utils/formatters";

import DashboardStatsBar from "../components/dashboard/DashboardStatsBar";
import ReservationStatusChart from "../components/dashboard/ReservationStatusChart";
import "../styles/admin-dashboard.css";

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [branchData, setBranchData] = useState([]);
  const [reservationData, setReservationData] = useState([]);
  const [recentInquiries, setRecentInquiries] = useState([]);
  const [reservationStatus, setReservationStatus] = useState({
    approved: 0,
    pending: 0,
    rejected: 0,
  });
  const [recentReservations, setRecentReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          roomApi.getBranchOccupancy(),
          inquiryApi.getStats(),
          userApi.getStats(),
          reservationApi.getAll(),
          inquiryApi.getAll({ limit: 6, sort: "createdAt", order: "desc" }),
        ]);

        const [
          occupancyResult,
          inquiryStatsResult,
          userStatsResult,
          reservationsResult,
          inquiriesResult,
        ] = results;
        const getValue = (result, fallback) =>
          result.status === "fulfilled" ? result.value : fallback;

        const occupancyResponse = getValue(occupancyResult, null);
        const inquiryStats = getValue(inquiryStatsResult, null);
        const userStats = getValue(userStatsResult, null);
        const reservations = getValue(reservationsResult, []);
        const inquiries = getValue(inquiriesResult, []);
        const inquiryItems = Array.isArray(inquiries)
          ? inquiries
          : inquiries?.inquiries || [];
        const failedCount = results.filter(
          (r) => r.status === "rejected",
        ).length;

        const occupancyStats =
          occupancyResponse?.statistics || occupancyResponse;
        const totalInquiries = inquiryStats?.total || 0;
        const availableBeds =
          (occupancyStats?.totalCapacity || 0) -
          (occupancyStats?.totalOccupancy || 0);
        const registeredUsers = userStats?.total || 0;
        const activeBookings = (reservations || []).filter((r) =>
          ["confirmed", "checked-in"].includes(r.status),
        ).length;

        const recentInquiriesData = (inquiryItems || [])
          .slice(0, 4)
          .map((item) => ({
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
          }));

        const sortedReservations = (reservations || [])
          .slice()
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recentReservationsData = sortedReservations
          .slice(0, 4)
          .map((item) => ({
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

        const approvedCount = (reservations || []).filter((r) =>
          ["confirmed", "checked-in"].includes(r.status),
        ).length;
        const pendingCount = (reservations || []).filter(
          (r) => r.status === "pending",
        ).length;
        const rejectedCount = (reservations || []).filter((r) =>
          ["cancelled", "rejected"].includes(r.status),
        ).length;

        const monthSeries = getMonthSeries(5);
        const monthlyData = monthSeries.map((entry) => ({
          key: entry.key,
          month: entry.month,
          gilPuyat: 0,
          guadalupe: 0,
          total: 0,
        }));
        const monthIndex = monthlyData.reduce((acc, item, index) => {
          acc[item.key] = index;
          return acc;
        }, {});

        (reservations || []).forEach((reservation) => {
          const dateValue = reservation.createdAt || reservation.checkInDate;
          if (!dateValue) return;
          const date = new Date(dateValue);
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          const index = monthIndex[key];
          if (index === undefined) return;
          const branch = reservation.roomId?.branch || reservation.branch;
          if (branch === "gil-puyat") monthlyData[index].gilPuyat += 1;
          if (branch === "guadalupe") monthlyData[index].guadalupe += 1;
          monthlyData[index].total += 1;
        });

        if (isMounted) {
          setStats([
            {
              id: 1,
              label: "Total Inquiries",
              value: String(totalInquiries),
              icon: "inquiries",
              color: "#0F4A7F",
              percentage: inquiryStats?.recentCount
                ? `${inquiryStats.recentCount} last 7d`
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
              percentage: userStats?.activeCount
                ? `${userStats.activeCount} active`
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
          ]);
          setRecentInquiries(recentInquiriesData);
          setRecentReservations(recentReservationsData);
          setReservationStatus({
            approved: approvedCount,
            pending: pendingCount,
            rejected: rejectedCount,
          });
          setBranchData(
            monthlyData.map(({ month, gilPuyat, guadalupe }) => ({
              month,
              gilPuyat,
              guadalupe,
            })),
          );
          setReservationData(
            monthlyData.map((item) => ({
              month: item.month,
              value: item.total,
            })),
          );
          if (failedCount > 0)
            setError(
              "Some dashboard data failed to load. Showing partial data.",
            );
        }
      } catch (fetchError) {
        console.error("Failed to load dashboard data:", fetchError);
        if (isMounted)
          setError("Failed to load dashboard data. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDashboardData();
    const refreshInterval = setInterval(fetchDashboardData, 60000);
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  return (
    <div className="admin-dashboard-main">
      {error && <div className="admin-dashboard-error">{error}</div>}
      {loading && (
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
