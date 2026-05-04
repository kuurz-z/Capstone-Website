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
import OccupancyTrendCard from "../components/dashboard/OccupancyTrendCard";
import RevenueTrendCard from "../components/dashboard/RevenueTrendCard";
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
        tone: "rose",
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
        tone: "green",
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

  const reservationTotal =
    (reservationStatus.approved || 0) +
    (reservationStatus.pending || 0) +
    (reservationStatus.rejected || 0);

  const reservationSegment = (count) =>
    reservationTotal ? (count / reservationTotal) * 502.6 : 0;

  const metricValueStyle = {
    blue: { color: "var(--info)" },
    green: { color: "var(--success)" },
    violet: { color: "var(--chart-4)" },
    amber: { color: "var(--warning)" },
    rose: { color: "var(--danger)" },
  };

  const error = isError
    ? "Some dashboard data failed to load. Showing partial data."
    : null;

  return (
    <div className="dashboard-page-bg">
      <PageShell>
        <PageShell.Summary>
          <div className="mb-6">
            <h1
              className="mb-1 text-2xl font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Dashboard
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Monitor branch activity, guest pressures, and agent follow-up from
              one operations view
            </p>
          </div>

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
                  className="rounded-xl border p-5 shadow-sm transition-all hover:shadow-md"
                  style={{
                    borderColor: "var(--border-light)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {item.label}
                    </span>
                    <Icon
                      className="h-4 w-4"
                      style={{ color: "var(--text-muted)", opacity: 0.7 }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p
                      className="text-3xl font-bold leading-none tracking-tight"
                      style={
                        metricValueStyle[item.tone] || {
                          color: "var(--text-primary)",
                        }
                      }
                    >
                      {item.value}
                    </p>
                    <p
                      className="text-[11px] font-medium"
                      style={{ color: "var(--text-muted)", opacity: 0.8 }}
                    >
                      {item.trend}
                    </p>
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
                    className="text-lg font-bold tracking-tight"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Recent Inquiries
                  </h2>
                  <p
                    className="mt-0.5 text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {kpis.inquiries || 0} on the active range • newest items
                    first
                  </p>
                </div>
                <Link
                  to="/admin/inquiries"
                  className="inline-flex items-center gap-1 text-[13px] font-bold transition-opacity"
                  style={{ color: "var(--color-accent)" }}
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
                      className="group flex items-center justify-between rounded-xl p-4 border border-transparent transition-all"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--bg-inset) 50%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                            color: "var(--color-accent)",
                          }}
                        >
                          <Mail className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <h3
                            className="truncate text-[15px] font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {inq.name}
                          </h3>
                          <p
                            className="truncate text-sm font-medium"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {inq.email}
                          </p>
                          <div
                            className="mt-1.5 flex items-center gap-3 text-[12px] font-medium"
                            style={{ color: "var(--text-muted)", opacity: 0.7 }}
                          >
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
                        className="inline-flex items-center rounded-lg px-3 py-1 text-[11px] font-medium"
                        style={
                          inq.status === "responded"
                            ? {
                                backgroundColor:
                                  "color-mix(in srgb, var(--info) 12%, transparent)",
                                color: "var(--info)",
                              }
                            : {
                                backgroundColor:
                                  "color-mix(in srgb, var(--success) 12%, transparent)",
                                color: "var(--success)",
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
                  className="text-lg font-bold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Reservation Status
                </h2>
                <p
                  className="mt-0.5 text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {reservationStatus.pending || 0} pending •{" "}
                  {reservationStatus.approved || 0} approved •{" "}
                  {reservationStatus.rejected || 0} rejected
                </p>
              </div>

              <div className="mb-6 flex justify-center py-4">
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
              </div>

              <div className="space-y-3">
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
              </div>
            </section>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <OccupancyTrendCard data={occupancy} />
            <RevenueTrendCard data={kpis} />
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
                  className="text-lg font-bold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Recent Reservations
                </h2>
                <p
                  className="mt-0.5 text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {reservationStatus.pending || 0} pending review •{" "}
                  {kpis.activeBookings || 0} active bookings •{" "}
                  {recentReservations.length} current scope
                </p>
              </div>
              <Link
                to="/admin/reservations"
                className="inline-flex items-center gap-1 text-[13px] font-bold transition-opacity"
                style={{ color: "var(--color-accent)" }}
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {recentReservations.length > 0 ? (
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
                        className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Room Type
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Tenant
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Branch
                      </th>
                      <th
                        className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Date
                      </th>
                      <th
                        className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
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
                        className="group transition-colors"
                        style={{ backgroundColor: "transparent" }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-9 w-9 items-center justify-center rounded-lg"
                              style={{
                                backgroundColor:
                                  "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                                color: "var(--color-accent)",
                              }}
                            >
                              <DoorOpen className="h-4 w-4" />
                            </div>
                            <span
                              className="text-[14px] font-bold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {reservation.roomType}
                            </span>
                          </div>
                        </td>

                        <td
                          className="px-6 py-4 text-[14px] font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {reservation.guestName}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="flex items-center gap-1 text-[13px] font-medium"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {reservation.branch}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 text-[13px] font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {reservation.date}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className="inline-flex rounded-lg px-2.5 py-1 text-[11px] font-medium"
                            style={{
                              backgroundColor:
                                "color-mix(in srgb, var(--info) 12%, transparent)",
                              color: "var(--info)",
                            }}
                          >
                            {getReservationStatusLabel(reservation.status)}
                          </span>
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
