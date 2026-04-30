import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
 Building2,
 Percent,
 CalendarCheck,
 DollarSign,
 MessageSquare,
 ShieldAlert,
 AlertTriangle,
 ArrowRight,
 ArrowUpRight,
 Wrench,
} from "lucide-react";
import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import {
 useAuditAnalytics,
 useOccupancyForecast,
} from "../../../shared/hooks/queries/useAnalyticsReports";
import {
 formatBranch,
 formatRelativeTime,
 formatDate,
} from "../../admin/utils/formatters";
import {
 ReportChartPanel,
 ReportFilterBar,
} from "../../admin/components/shared";
import "../styles/superadmin-dashboard.css";

const STAT_ACCENTS = [
 { color: "#2563eb", bg: "#eff6ff" },
 { color: "#7c3aed", bg: "#f5f3ff" },
 { color: "#0284c7", bg: "#f0f9ff" },
 { color: "#d97706", bg: "#fffbeb" },
 { color: "#db2777", bg: "#fdf2f8" },
 { color: "#059669", bg: "#ecfdf5" },
 { color: "#e11d48", bg: "#fff1f2" },
 { color: "#14b8a6", bg: "#f0fdfa" },
 { color: "#6b7280", bg: "#f9fafb" },
];

const BRANCH_COLORS = ["#2563eb", "#059669"];

export default function SuperAdminDashboard() {
 const { data, isLoading, isError } = useDashboardData();
 const { data: auditData } = useAuditAnalytics({ range: "30d" });
 const { data: forecastData } = useOccupancyForecast({ months: 3, branch: "all" });
 const kpis = data?.kpis || {};
 const branches = data?.branchComparison || [];
 const reservations = data?.recentReservations || [];
 const auditKpis = auditData?.kpis || {};
 const securityEvents = auditData?.tables?.recentSecurityEvents || [];
 const securityByBranch = auditData?.series?.branchSummary || [];
 const forecast = forecastData?.forecast || {};
 const projectedMonths = forecast.projected || [];

 const stats = useMemo(
 () => [
 {
 label: "Total Rooms",
 value: kpis.totalRooms ?? 0,
 Icon: Building2,
 sub: `${data?.occupancy?.totalCapacity ?? 0} beds total`,
 },
 {
 label: "Occupancy",
 value: kpis.occupancyRateLabel ?? "0%",
 Icon: Percent,
 sub: `${data?.occupancy?.totalOccupancy ?? 0} occupied beds`,
 },
 {
 label: "Revenue",
 value: kpis.revenueLabel ?? "PHP 0",
 Icon: DollarSign,
 sub: "Last 30 days collected",
 },
 {
 label: "Active Bookings",
 value: kpis.activeBookings ?? 0,
 Icon: CalendarCheck,
 sub: `${data?.reservationStatus?.pending ?? 0} pending`,
 },
 {
 label: "Inquiries",
 value: kpis.inquiries ?? 0,
 Icon: MessageSquare,
 sub: "Selected range",
 },
 {
 label: "Active Tickets",
 value: kpis.activeTickets ?? 0,
 Icon: Wrench,
 sub: "Open maintenance requests",
 },
 {
 label: "Failed Logins",
 value: auditKpis.failedLogins ?? 0,
 Icon: ShieldAlert,
 sub: "Last 30 days",
 },
 {
 label: "Critical Events",
 value: auditKpis.criticalEvents ?? 0,
 Icon: AlertTriangle,
 sub: "Security and audit alerts",
 },
 ],
 [auditKpis, data, kpis],
 );

 const recentActivity = useMemo(
 () =>
 reservations.slice(0, 6).map((reservation) => ({
 id: reservation.id,
 guest: reservation.guestName || "Unknown",
 branch: formatBranch(reservation.branch),
 room: reservation.roomName || "-",
 status: reservation.status,
 time: formatRelativeTime(reservation.createdAt),
 })),
 [reservations],
 );

 const quickLinks = [
 { label: "Reservations", to: "/admin/reservations" },
 { label: "Room Availability", to: "/admin/room-availability" },
 { label: "Billing", to: "/admin/billing" },
 { label: "Financials", to: "/admin/analytics/details?tab=financials" },
 { label: "Tenants", to: "/admin/tenants" },
 { label: "User Management", to: "/admin/users" },
 { label: "System Monitoring", to: "/admin/analytics/details?tab=monitoring" },
 ];

 return (
 <div className="sa2">
 <ReportFilterBar
 title="System-wide dashboard"
 subtitle="Owner scope • unified analytics payload"
 />

 <header className="sa2-header">
 <div>
 <p className="sa2-eyebrow">Super Admin</p>
 <h1 className="sa2-title">System Overview</h1>
 </div>
 <Link to="/admin/dashboard" className="sa2-back">
 Live Dashboard <ArrowRight size={14} />
 </Link>
 </header>

 {isError && (
 <div className="sa2-alert">
 Some data failed to load - showing partial results.
 </div>
 )}

 <section className="sa2-stats">
 {stats.map((stat, index) => {
 const { color, bg } = STAT_ACCENTS[index];
 const Icon = stat.Icon;
 return (
 <div key={stat.label} className="sa2-stat" style={{ "--accent": color }}>
 <div className="sa2-stat-icon" style={{ background: bg, color }}>
 <Icon size={16} strokeWidth={2} />
 </div>
 <span className="sa2-stat-value">{isLoading ? "-" : stat.value}</span>
 <span className="sa2-stat-label">{stat.label}</span>
 <span className="sa2-stat-sub">{stat.sub}</span>
 </div>
 );
 })}
 </section>

 <section className="sa2-card">
 <h2 className="sa2-card-title">Branch Comparison</h2>
 <div className="sa2-branches">
 {branches.map((branch, index) => (
 <div key={branch.branch} className="sa2-branch">
 <div className="sa2-branch-top">
 <span className="sa2-branch-name">{branch.label}</span>
 <span
 className="sa2-branch-rate"
 style={{ color: BRANCH_COLORS[index % BRANCH_COLORS.length] }}
 >
 {branch.occupancyRate}%
 </span>
 </div>
 <div className="sa2-bar-track">
 <div
 className="sa2-bar-fill"
 style={{
 width: `${branch.occupancyRate}%`,
 background: BRANCH_COLORS[index % BRANCH_COLORS.length],
 }}
 />
 </div>
 <p className="sa2-branch-caption">Occupancy rate</p>
 <div className="sa2-branch-grid">
 <div className="sa2-branch-kv">
 <span>Rooms</span><strong>{branch.totalRooms}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Capacity</span><strong>{branch.totalCapacity}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Occupied</span><strong>{branch.totalOccupancy}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Available</span><strong>{branch.availableBeds}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Revenue</span><strong>{`PHP ${Number(branch.revenueCollected || 0).toLocaleString()}`}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Tickets</span><strong>{branch.activeTickets}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Overdue</span><strong>{`PHP ${Number(branch.overdueAmount || 0).toLocaleString()}`}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Collection</span><strong>{branch.collectionRate || 0}%</strong>
 </div>
 </div>
 </div>
 ))}
 </div>
 </section>

 <div className="sa2-bottom">
 <ReportChartPanel
 title="Recent Activity"
 subtitle="Latest reservations across both branches"
 >
 <section className="sa2-card sa2-activity-card">
 <div className="sa2-card-header">
 <h2 className="sa2-card-title">Recent Activity</h2>
 <Link to="/admin/reservations" className="sa2-view-all">
 View all <ArrowUpRight size={13} />
 </Link>
 </div>
 {recentActivity.length === 0 ? (
 <p className="sa2-empty">No recent activity.</p>
 ) : (
 <table className="sa2-table">
 <thead>
 <tr>
 <th>Guest</th>
 <th>Branch</th>
 <th>Room</th>
 <th>Status</th>
 <th>Time</th>
 </tr>
 </thead>
 <tbody>
 {recentActivity.map((activity) => (
 <tr key={activity.id}>
 <td className="sa2-td-guest">{activity.guest}</td>
 <td>{activity.branch}</td>
 <td>{activity.room}</td>
 <td>
 <span className={`sa2-badge sa2-badge-${activity.status}`}>
 {activity.status}
 </span>
 </td>
 <td className="sa2-td-time">{activity.time}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </section>
 </ReportChartPanel>

 <ReportChartPanel
 title="System Monitoring"
 subtitle="Owner-level audit and security snapshot"
 >
 <section className="sa2-card sa2-activity-card">
 <div className="sa2-card-header">
 <h2 className="sa2-card-title">Security Summary</h2>
 <Link to="/admin/audit-logs" className="sa2-view-all">
 Review logs <ArrowUpRight size={13} />
 </Link>
 </div>
 <div className="sa2-branches">
 {securityByBranch.map((branch) => (
 <div key={branch.branch} className="sa2-branch">
 <div className="sa2-branch-top">
 <span className="sa2-branch-name">{branch.label}</span>
 <span className="sa2-branch-rate">{branch.highSeverityCount}</span>
 </div>
 <p className="sa2-branch-caption">High-severity actions</p>
 <div className="sa2-branch-grid">
 <div className="sa2-branch-kv">
 <span>Total Events</span><strong>{branch.totalEvents}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Critical</span><strong>{branch.criticalCount}</strong>
 </div>
 <div className="sa2-branch-kv">
 <span>Overrides</span><strong>{branch.accessOverrideCount}</strong>
 </div>
 </div>
 </div>
 ))}
 </div>
 {securityEvents.length > 0 ? (
 <table className="sa2-table">
 <thead>
 <tr>
 <th>Event</th>
 <th>Branch</th>
 <th>Severity</th>
 <th>Time</th>
 </tr>
 </thead>
 <tbody>
 {securityEvents.slice(0, 5).map((event) => (
 <tr key={event.id}>
 <td className="sa2-td-guest">{event.action}</td>
 <td>{formatBranch(event.branch)}</td>
 <td>{event.severity}</td>
 <td className="sa2-td-time">{formatDate(event.timestamp)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 ) : (
 <p className="sa2-empty">No recent security events.</p>
 )}
 </section>
 </ReportChartPanel>

 <ReportChartPanel
 title="Forecasting Insights"
 subtitle="System-wide deterministic occupancy projection"
 >
 <section className="sa2-card sa2-activity-card">
 <div className="sa2-card-header">
 <h2 className="sa2-card-title">3-Month Outlook</h2>
 </div>
 {forecast.sufficientHistory ? (
 <>
 <p className="sa2-empty" style={{ textAlign: "left" }}>
 {forecast.insights?.headline}
 </p>
 <table className="sa2-table">
 <thead>
 <tr>
 <th>Month</th>
 <th>Projected</th>
 <th>Baseline</th>
 <th>Seasonal</th>
 </tr>
 </thead>
 <tbody>
 {projectedMonths.map((item) => (
 <tr key={item.month}>
 <td>{item.label}</td>
 <td>{item.projectedOccupancyRate}%</td>
 <td>{item.baselineRate}%</td>
 <td>{item.seasonalMultiplier}x</td>
 </tr>
 ))}
 </tbody>
 </table>
 {(forecast.insights?.recommendations || []).slice(0, 2).map((item) => (
 <p key={item} className="sa2-empty" style={{ textAlign: "left" }}>
 {item}
 </p>
 ))}
 </>
 ) : (
 <p className="sa2-empty">
 {forecast.insights?.headline || "Insufficient history to forecast occupancy."}
 </p>
 )}
 </section>
 </ReportChartPanel>

 <ReportChartPanel
 title="Quick Access"
 subtitle="Owner workspace shortcuts"
 >
 <section className="sa2-card sa2-nav-card">
 <h2 className="sa2-card-title">Quick Access</h2>
 <nav className="sa2-nav">
 {quickLinks.map((link) => (
 <Link key={link.to} to={link.to} className="sa2-nav-link">
 <span>{link.label}</span>
 <ArrowRight size={14} />
 </Link>
 ))}
 </nav>
 </section>
 </ReportChartPanel>
 </div>
 </div>
 );
}
