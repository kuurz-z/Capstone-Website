import { useMemo } from "react";
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
import { PageShell } from "../components/shared";
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
 icon: MessageSquare,
 },
 {
 label: "Available Beds",
 value: kpis.availableBeds || 0,
 trend: `${occupancy.totalOccupancy || 0} currently occupied / ${occupancy.totalCapacity || 0} total`,
 tone: "green",
 icon: DoorOpen,
 },
 {
 label: "Active Maintenance",
 value: kpis.activeTickets || 0,
 trend:
 (kpis.activeTickets || 0) === 0
 ? "All facilities currently operational"
 : `${kpis.activeTickets || 0} issue${(kpis.activeTickets || 0) === 1 ? "" : "s"} requiring attention`,
 tone: "violet",
 icon: Wrench,
 },
 {
 label: "Pending Reservations",
 value: reservationStatus.pending || 0,
 trend: "Awaiting admin approval",
 tone: "amber",
 icon: Calendar,
 },
 {
 label: "Active Bookings",
 value: kpis.activeBookings || 0,
 trend: `${kpis.activeBookings || 0} active tenant account${(kpis.activeBookings || 0) === 1 ? "" : "s"}`,
 tone: "rose",
 icon: Users,
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

 const reservationTotal =
 (reservationStatus.approved || 0) +
 (reservationStatus.pending || 0) +
 (reservationStatus.rejected || 0);

 const reservationSegment = (count) =>
 reservationTotal ? (count / reservationTotal) * 502.6 : 0;

  const metricValueClass = {
    blue: "text-[#2563eb] dark:text-blue-500",
    green: "text-[#16a34a] dark:text-emerald-500",
    violet: "text-[#2563eb] dark:text-blue-500",
    amber: "text-[#2563eb] dark:text-blue-500",
    rose: "text-[#16a34a] dark:text-emerald-500",
  };


 const error = isError
 ? "Some dashboard data failed to load. Showing partial data."
 : null;

 return (
 <div className="dashboard-page-bg">
 <PageShell>
 <PageShell.Summary>
 <div className="mb-6">
 <h1 className="mb-1 text-2xl font-semibold text-foreground">Dashboard</h1>
 <p className="text-sm text-muted-foreground">
 Monitor branch activity, guest pressures, and agent follow-up from one operations view
 </p>
 </div>

 {error && <div className="mb-6 rounded-xl border border-error bg-error-light px-4 py-3 text-sm font-medium text-error-dark">{error}</div>}
 {isLoading && (
 <div className="dash-loading mb-6">
 <span className="dash-loading__spinner" aria-hidden="true" />
 <span className="dash-loading__label">
 Loading dashboard data
 <span className="dash-loading__ellipsis" aria-hidden="true">
 <span>.</span>
 <span>.</span>
 <span>.</span>
 </span>
 </span>
 </div>
 )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.label}
              className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {item.label}
                </span>
                <Icon className="h-4 w-4 text-[var(--text-muted)]/70" />
              </div>
              <div className="flex flex-col gap-1">
                <p className={`text-3xl font-bold leading-none tracking-tight ${metricValueClass[item.tone] || "text-[var(--text-primary)]"}`}>
                  {item.value}
                </p>
                <p className="text-[11px] font-medium text-[var(--text-muted)]/80">{item.trend}</p>
              </div>
            </article>
          );
        })}
      </div>

 </PageShell.Summary>

 <PageShell.Content>
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-6 lg:col-span-2 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Recent Inquiries</h2>
                <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
                  {kpis.inquiries || 0} on the active range • newest items first
                </p>
              </div>
              <Link
                to="/admin/inquiries"
                className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-accent)] hover:opacity-80 transition-opacity"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>

            </div>

            <div className="space-y-3">
              {recentInquiries.length > 0 ? (
                recentInquiries.map((inq) => (
                  <article
                    key={inq.id}
                    className="group flex items-center justify-between rounded-xl bg-[var(--bg-inset)]/50 p-4 border border-transparent hover:border-[var(--border-light)] hover:bg-[var(--bg-card)] transition-all"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                        <Mail className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-[var(--text-primary)]">{inq.name}</h3>
                        <p className="truncate text-sm font-medium text-[var(--text-muted)]">{inq.email}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-[12px] font-medium text-[var(--text-muted)]/70">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {inq.branch}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {inq.date || inq.time}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-lg px-3 py-1 text-[11px] font-medium ${
                        inq.status === "responded"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-green-100 text-green-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}
                    >
                      {inq.followUp}
                    </span>

                  </article>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
                  <CheckCircle2 className="mb-2 h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium">No recent inquiries.</p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Reservation Status</h2>
              <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
                {reservationStatus.pending || 0} pending • {reservationStatus.approved || 0} approved • {reservationStatus.rejected || 0} rejected
              </p>
            </div>

            <div className="mb-6 flex justify-center py-4">
              <svg className="h-[180px] w-[180px]" viewBox="0 0 200 200" aria-label="Reservation status chart">
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="20"
                  strokeDasharray={`${reservationSegment(reservationStatus.approved || 0)} 502.6`}
                  transform="rotate(-90 100 100)"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke="#f59e0b"
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
                  stroke="#dc2626"
                  strokeWidth="20"
                  strokeDasharray={`${reservationSegment(reservationStatus.rejected || 0)} 502.6`}
                  strokeDashoffset={`-${reservationSegment((reservationStatus.approved || 0) + (reservationStatus.pending || 0))}`}
                  transform="rotate(-90 100 100)"
                />
              </svg>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-medium text-[var(--text-secondary)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
                  Approved
                </span>
                <span className="font-bold text-[var(--text-primary)]">{reservationStatus.approved || 0}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-medium text-[var(--text-secondary)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                  Pending
                </span>
                <span className="font-bold text-[var(--text-pending)]">{reservationStatus.pending || 0}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-medium text-[var(--text-secondary)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
                  Rejected
                </span>
                <span className="font-bold text-[var(--text-primary)]">{reservationStatus.rejected || 0}</span>
              </div>
            </div>
          </section>
        </div>

      <section className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)] p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Recent Reservations</h2>
            <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
              {reservationStatus.pending || 0} pending review • {kpis.activeBookings || 0} active bookings • {recentReservations.length} current scope
            </p>
          </div>
          <Link
            to="/admin/reservations"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-accent)] hover:opacity-80 transition-opacity"
          >
            View All
            <ChevronRight className="h-4 w-4" />
          </Link>

        </div>

        {recentReservations.length > 0 ? (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-inset)]/30">
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Room Type</th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tenant</th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Branch</th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {recentReservations.map((reservation) => (
                  <tr key={reservation.id} className="group transition-colors hover:bg-[var(--bg-inset)]/40">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                          <DoorOpen className="h-4 w-4" />
                        </div>
                        <span className="text-[14px] font-bold text-[var(--text-primary)]">{reservation.roomType}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] font-medium text-[var(--text-primary)]">{reservation.guestName}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1 text-[13px] font-medium text-[var(--text-muted)]">
                        <MapPin className="h-3.5 w-3.5" />
                        {reservation.branch}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[13px] font-medium text-[var(--text-muted)]">{reservation.date}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
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
