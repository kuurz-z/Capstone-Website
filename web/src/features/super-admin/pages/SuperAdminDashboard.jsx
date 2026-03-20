import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Users,
  Percent,
  CalendarCheck,
  DollarSign,
  MessageSquare,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

import { useDashboardData } from "../../../shared/hooks/queries/useDashboard";
import { useBillingStats } from "../../../shared/hooks/queries/useBilling";
import { useBranchOccupancy } from "../../../shared/hooks/queries/useRooms";
import {
  formatBranch,
  formatRelativeTime,
} from "../../admin/utils/formatters";
import "../styles/superadmin-dashboard.css";

// Accent colors per stat — kept minimal, single hue each
const STAT_ACCENTS = [
  { color: "#2563eb", bg: "#eff6ff" }, // blue — rooms
  { color: "#059669", bg: "#ecfdf5" }, // green — tenants
  { color: "#7c3aed", bg: "#f5f3ff" }, // violet — occupancy
  { color: "#d97706", bg: "#fffbeb" }, // amber — bookings
  { color: "#0284c7", bg: "#f0f9ff" }, // sky — revenue
  { color: "#db2777", bg: "#fdf2f8" }, // pink — inquiries
];

const BRANCH_COLORS = ["#2563eb", "#059669"];

export default function SuperAdminDashboard() {
  const {
    occupancy,
    inquiryStats,
    userStats,
    reservations: reservationsQuery,
    isLoading,
    isError,
  } = useDashboardData();

  const { data: billingStats } = useBillingStats();
  const { data: gilPuyatOcc } = useBranchOccupancy("gil-puyat");
  const { data: guadalupeOcc } = useBranchOccupancy("guadalupe");

  const occupancyStats = occupancy.data?.statistics || occupancy.data;
  const reservations = reservationsQuery.data || [];

  const stats = useMemo(() => {
    const totalCap = occupancyStats?.totalCapacity || 0;
    const totalOcc = occupancyStats?.totalOccupancy || 0;
    const occRate = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0;
    const activeBookings = reservations.filter((r) =>
      ["confirmed", "checked-in", "reserved"].includes(r.status)
    ).length;

    return [
      {
        label: "Total Rooms",
        value: occupancyStats?.totalRooms ?? 0,
        Icon: Building2,
        sub: `${totalCap} beds total`,
      },
      {
        label: "Active Tenants",
        value: userStats.data?.activeCount ?? totalOcc,
        Icon: Users,
        sub: `${userStats.data?.total ?? 0} registered`,
      },
      {
        label: "Occupancy",
        value: `${occRate}%`,
        Icon: Percent,
        sub: `${totalOcc} / ${totalCap} beds`,
      },
      {
        label: "Active Bookings",
        value: activeBookings,
        Icon: CalendarCheck,
        sub: `${reservations.filter((r) => r.status === "pending").length} pending`,
      },
      {
        label: "Total Revenue",
        value: billingStats?.totalCollected
          ? `₱${Number(billingStats.totalCollected).toLocaleString()}`
          : "₱0",
        Icon: DollarSign,
        sub: `${billingStats?.overdueCount ?? 0} overdue`,
      },
      {
        label: "Inquiries",
        value: inquiryStats.data?.total ?? 0,
        Icon: MessageSquare,
        sub: `${inquiryStats.data?.recentCount ?? 0} this week`,
      },
    ];
  }, [occupancyStats, userStats.data, reservations, billingStats, inquiryStats.data]);

  const branches = useMemo(() => {
    const parse = (label, raw) => {
      const s = raw?.statistics || raw || {};
      const cap = s.totalCapacity || 0;
      const occ = s.totalOccupancy || 0;
      return {
        label,
        rooms: s.totalRooms || 0,
        capacity: cap,
        occupancy: occ,
        available: cap - occ,
        rate: cap > 0 ? Math.round((occ / cap) * 100) : 0,
      };
    };
    return [parse("Gil Puyat", gilPuyatOcc), parse("Guadalupe", guadalupeOcc)];
  }, [gilPuyatOcc, guadalupeOcc]);

  const recentActivity = useMemo(() =>
    [...reservations]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6)
      .map((r) => ({
        id: r._id,
        guest:
          `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim() ||
          "Unknown",
        branch: formatBranch(r.roomId?.branch || r.branch),
        room: r.roomId?.name || r.roomId?.roomNumber || "—",
        status: r.status,
        time: formatRelativeTime(r.createdAt),
      })),
    [reservations]
  );

  const quickLinks = [
    { label: "Reservations", to: "/admin/reservations" },
    { label: "Room Availability", to: "/admin/room-availability" },
    { label: "Billing", to: "/admin/billing" },
    { label: "Tenants", to: "/admin/tenants" },
    { label: "Audit Logs", to: "/admin/audit-logs" },
  ];

  return (
    <div className="sa2">
      {/* ── Header ── */}
      <header className="sa2-header">
        <div>
          <p className="sa2-eyebrow">Super Admin</p>
          <h1 className="sa2-title">System Overview</h1>
        </div>
        <Link to="/admin/dashboard" className="sa2-back">
          Branch View <ArrowRight size={14} />
        </Link>
      </header>

      {isError && (
        <div className="sa2-alert">
          Some data failed to load — showing partial results.
        </div>
      )}

      {/* ── Stats ── */}
      <section className="sa2-stats">
        {stats.map((s, i) => {
          const { color, bg } = STAT_ACCENTS[i];
          const Icon = s.Icon;
          return (
            <div key={i} className="sa2-stat" style={{ "--accent": color }}>
              <div className="sa2-stat-icon" style={{ background: bg, color }}>
                <Icon size={16} strokeWidth={2} />
              </div>
              <span className="sa2-stat-value">{isLoading ? "—" : s.value}</span>
              <span className="sa2-stat-label">{s.label}</span>
              <span className="sa2-stat-sub">{s.sub}</span>
            </div>
          );
        })}
      </section>

      {/* ── Branch Comparison ── */}
      <section className="sa2-card">
        <h2 className="sa2-card-title">Branch Comparison</h2>
        <div className="sa2-branches">
          {branches.map((b, i) => (
            <div key={i} className="sa2-branch">
              <div className="sa2-branch-top">
                <span className="sa2-branch-name">{b.label}</span>
                <span className="sa2-branch-rate" style={{ color: BRANCH_COLORS[i] }}>
                  {b.rate}%
                </span>
              </div>
              <div className="sa2-bar-track">
                <div
                  className="sa2-bar-fill"
                  style={{
                    width: `${b.rate}%`,
                    background: BRANCH_COLORS[i],
                  }}
                />
              </div>
              <p className="sa2-branch-caption">Occupancy rate</p>
              <div className="sa2-branch-grid">
                <div className="sa2-branch-kv">
                  <span>Rooms</span><strong>{b.rooms}</strong>
                </div>
                <div className="sa2-branch-kv">
                  <span>Capacity</span><strong>{b.capacity}</strong>
                </div>
                <div className="sa2-branch-kv">
                  <span>Occupied</span><strong>{b.occupancy}</strong>
                </div>
                <div className="sa2-branch-kv">
                  <span>Available</span><strong>{b.available}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom row ── */}
      <div className="sa2-bottom">
        {/* Activity */}
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
                {recentActivity.map((a) => (
                  <tr key={a.id}>
                    <td className="sa2-td-guest">{a.guest}</td>
                    <td>{a.branch}</td>
                    <td>{a.room}</td>
                    <td>
                      <span className={`sa2-badge sa2-badge-${a.status}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="sa2-td-time">{a.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Quick links */}
        <section className="sa2-card sa2-nav-card">
          <h2 className="sa2-card-title">Quick Access</h2>
          <nav className="sa2-nav">
            {quickLinks.map((l, i) => (
              <Link key={i} to={l.to} className="sa2-nav-link">
                <span>{l.label}</span>
                <ArrowRight size={14} />
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </div>
  );
}
