import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, CalendarCheck, Clock, CheckCircle2 } from "lucide-react";
import {
  formatRoomType,
  formatBranch,
  formatDate,
  formatRelativeTime,
} from "../utils/formatters";
import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import {
  PageShell,
  StatusBadge,
  ReportChartPanel,
  ReportMetricCard,
} from "../components/shared";
import ReservationStatusChart from "../components/dashboard/ReservationStatusChart";
import "../styles/design-tokens.css";
import "../styles/admin-dashboard.css";

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboardData();

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
      inquiryItems.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    [inquiryItems],
  );

  const summaryItems = useMemo(
    () => [
      {
        label: "Total Inquiries",
        value: kpis.inquiries || 0,
        trend: `${unresolvedInquiryCount} awaiting response`,
        tone: "blue",
      },
      {
        label: "Available Beds",
        value: kpis.availableBeds || 0,
        trend: `${occupancy.totalOccupancy || 0} currently occupied (${occupancy.totalCapacity || 0} total)`,
        tone: "green",
      },
      {
        label: "Active Maintenance",
        value: kpis.activeTickets || 0,
        trend:
          (kpis.activeTickets || 0) === 0
            ? "All facilities currently operational"
            : `${kpis.activeTickets || 0} issue${(kpis.activeTickets || 0) === 1 ? "" : "s"} requiring attention`,
        tone: "violet",
      },
      {
        label: "Pending Reservations",
        value: reservationStatus.pending || 0,
        trend: "Awaiting admin approval",
        tone: "amber",
      },
      {
        label: "Active Bookings",
        value: kpis.activeBookings || 0,
        trend: `${kpis.activeBookings || 0} active tenant account${(kpis.activeBookings || 0) === 1 ? "" : "s"}`,
        tone: "rose",
      },
    ],
    [kpis, occupancy, reservationStatus, unresolvedInquiryCount],
  );

  const recentInquiries = useMemo(
    () =>
      inquiryItems.slice(0, 4).map((item) => {
        const isResponded = item.status === "resolved" || item.status === "closed";
        return {
          id: item.id,
          name: item.name || "Unknown",
          email: item.email || "-",
          branch: formatBranch(item.branch),
          time: formatRelativeTime(item.createdAt),
          status: isResponded ? "responded" : "new",
          followUp: isResponded ? "Responded" : "Needs reply",
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

  const error = isError
    ? "Some dashboard data failed to load. Showing partial data."
    : null;

  return (
    <PageShell>
      <PageShell.Summary>
        {error && <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl mb-6 text-sm font-medium border border-rose-100">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8 w-full">
          {summaryItems.map((item) => (
            <ReportMetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              trend={item.trend}
              tone={item.tone}
            />
          ))}
        </div>
      </PageShell.Summary>

      <PageShell.Content>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6 mb-8">
          <ReportChartPanel
            title="Recent Inquiries"
            subtitle={`${kpis.inquiries || 0} in the active range • newest items first`}
            actions={
              <Link to="/admin/analytics/details?tab=operations" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                View All →
              </Link>
            }
          >
            <div className="flex flex-col gap-3 py-2">
              {recentInquiries.length > 0 ? (
                recentInquiries.map((inq) => (
                  <div key={inq.id} className="relative bg-slate-50 border border-slate-100 rounded-xl p-4 flex justify-between items-start gap-4 hover:bg-slate-100 transition-colors group">
                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <MessageSquare size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors" /> {inq.name}
                      </span>
                      <div className="text-sm font-semibold text-slate-800">{inq.email}</div>
                      <p className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-medium">
                        <span>{inq.branch}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400" /> {inq.time}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={inq.status} />
                      <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">
                        {inq.followUp}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                  <CheckCircle2 size={32} className="mb-2 text-emerald-400 opacity-50" />
                  <p className="text-sm font-medium">No recent inquiries.</p>
                </div>
              )}
            </div>
          </ReportChartPanel>

          <ReportChartPanel
            title="Reservation Status"
            subtitle={`${reservationStatus.pending || 0} pending • ${reservationStatus.approved || 0} approved • ${reservationStatus.rejected || 0} rejected`}
          >
            <ReservationStatusChart reservationStatus={reservationStatus} showHeading={false} />
          </ReportChartPanel>
        </div>

        <ReportChartPanel
          title="Recent Reservations"
          subtitle={`${reservationStatus.pending || 0} pending review • ${kpis.activeBookings || 0} active bookings in current scope`}
          actions={
            <Link to="/admin/reservations" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              View All →
            </Link>
          }
        >
          <div className="flex flex-col gap-3 py-2">
            {recentReservations.length > 0 ? (
              recentReservations.map((reservation) => (
                <div key={reservation.id} className="relative bg-slate-50 border border-slate-100 rounded-xl p-4 flex justify-between items-start gap-4 hover:bg-slate-100 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                      <CalendarCheck size={16} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="text-sm font-semibold text-slate-800">{reservation.roomType}</div>
                      <p className="text-sm text-slate-600 font-medium">{reservation.guestName}</p>
                      <p className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <span>{reservation.branch}</span>
                        <span>•</span>
                        <span>{reservation.date}</span>
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <CheckCircle2 size={32} className="mb-2 text-emerald-400 opacity-50" />
                <p className="text-sm font-medium">No recent reservations.</p>
              </div>
            )}
          </div>
        </ReportChartPanel>
      </PageShell.Content>
    </PageShell>
  );
}
