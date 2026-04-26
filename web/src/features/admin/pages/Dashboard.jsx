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
    reservationTotal ? (count / reservationTotal) * 439.8 : 0;

  const metricValueClass = {
    blue: "text-[#2563eb]",
    green: "text-[#16a34a]",
    violet: "text-[#2563eb]",
    amber: "text-[#2563eb]",
    rose: "text-[#16a34a]",
  };

  const error = isError
    ? "Some dashboard data failed to load. Showing partial data."
    : null;

  return (
    <div className="dashboard-page-bg">
      <PageShell>
        <PageShell.Summary>
          <div className="mb-6">
            <h1 className="mb-1 text-2xl font-semibold text-slate-800">Dashboard</h1>
            <p className="text-sm text-muted-foreground text-slate-500">
              Monitor branch activity, guest pressures, and agent follow-up from one operations view
            </p>
          </div>

          {error && <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</div>}
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

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.label}
                  className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground text-slate-500">
                      {item.label}
                    </span>
                    <Icon className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className={`text-3xl font-semibold leading-tight ${metricValueClass[item.tone] || "text-slate-800"}`}>
                    {item.value}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground text-slate-500">{item.trend}</p>
                </article>
              );
            })}
          </div>
        </PageShell.Summary>

        <PageShell.Content>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-800">Recent Inquiries</h2>
                  <p className="text-sm text-muted-foreground text-slate-500">
                    {kpis.inquiries || 0} on the active range • newest items first
                  </p>
                </div>
                <Link
                  to="/admin/analytics/details?tab=operations"
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 transition-colors hover:text-amber-700"
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
                      className="flex items-start justify-between rounded-lg bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                          <Mail className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium text-slate-800">{inq.name}</h3>
                          <p className="truncate text-sm text-muted-foreground text-slate-500">{inq.email}</p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {inq.branch}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {inq.date || inq.time}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`ml-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          inq.status === "responded"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {inq.followUp}
                      </span>
                    </article>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400/70" />
                    <p className="text-sm font-medium">No recent inquiries.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="mb-1 text-lg font-semibold text-slate-800">Reservation Status</h2>
                <p className="text-sm text-muted-foreground text-slate-500">
                  {reservationStatus.pending || 0} pending • {reservationStatus.approved || 0} approved • {reservationStatus.rejected || 0} rejected
                </p>
              </div>

              <div className="mb-4 flex justify-center py-3">
                <svg className="h-[200px] w-[200px]" viewBox="0 0 200 200" aria-label="Reservation status chart">
                  <circle
                    cx="100"
                    cy="100"
                    r="70"
                    fill="none"
                    stroke="#16A34A"
                    strokeWidth="24"
                    strokeDasharray={`${reservationSegment(reservationStatus.approved || 0)} 439.8`}
                    transform="rotate(-90 100 100)"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="70"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="24"
                    strokeDasharray={`${reservationSegment(reservationStatus.pending || 0)} 439.8`}
                    strokeDashoffset={`-${reservationSegment(reservationStatus.approved || 0)}`}
                    transform="rotate(-90 100 100)"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="70"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="24"
                    strokeDasharray={`${reservationSegment(reservationStatus.rejected || 0)} 439.8`}
                    strokeDashoffset={`-${reservationSegment((reservationStatus.approved || 0) + (reservationStatus.pending || 0))}`}
                    transform="rotate(-90 100 100)"
                  />
                </svg>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
                    Approved
                  </span>
                  <strong className="font-medium text-slate-800">{reservationStatus.approved || 0}</strong>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Pending
                  </span>
                  <strong className="font-medium text-slate-800">{reservationStatus.pending || 0}</strong>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                    Rejected
                  </span>
                  <strong className="font-medium text-slate-800">{reservationStatus.rejected || 0}</strong>
                </div>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="mb-1 text-lg font-semibold text-slate-800">Recent Reservations</h2>
                <p className="text-sm text-muted-foreground text-slate-500">
                  {reservationStatus.pending || 0} pending review • {kpis.activeBookings || 0} active bookings • {recentReservations.length} current scope
                </p>
              </div>
              <Link
                to="/admin/reservations"
                className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 transition-colors hover:text-amber-700"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {recentReservations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-3 text-left text-sm font-medium text-muted-foreground text-slate-500">Room Type</th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-muted-foreground text-slate-500">Tenant</th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-muted-foreground text-slate-500">Branch</th>
                      <th className="px-3 py-3 text-left text-sm font-medium text-muted-foreground text-slate-500">Date</th>
                      <th className="px-3 py-3 text-right text-sm font-medium text-muted-foreground text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReservations.map((reservation) => (
                      <tr key={reservation.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                              <DoorOpen className="h-4 w-4" />
                            </span>
                            <span className="text-sm font-medium text-slate-800">{reservation.roomType}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-sm text-slate-800">{reservation.guestName}</td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground text-slate-500">
                            <MapPin className="h-3 w-3" />
                            {reservation.branch}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-sm text-muted-foreground text-slate-500">{reservation.date}</td>
                        <td className="px-3 py-3.5 text-right">
                          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                            {getReservationStatusLabel(reservation.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400/70" />
                <p className="text-sm font-medium">No recent reservations.</p>
              </div>
            )}
          </section>
        </PageShell.Content>
      </PageShell>
    </div>
  );
}
