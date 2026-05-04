import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CreditCard,
  Hammer,
  Loader2,
  MessageSquare,
  UserCog,
  Users,
} from "lucide-react";
import { useApiClient } from "../../../shared/api/apiClient";
import { buildBranchScopedHref } from "../../../shared/utils/branchFilterQuery.mjs";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-branches.css";

const BRANCH_META = Object.freeze({
  "gil-puyat": {
    color: "#2563eb",
    surface: "#eff6ff",
  },
  guadalupe: {
    color: "#d97706",
    surface: "#fff7ed",
  },
});

const WARNING_COPY = Object.freeze({
  noAssignedAdmin: "No assigned admin",
  highOccupancyPressure: "High occupancy pressure",
  elevatedUnresolvedWorkload: "Elevated unresolved workload",
});

const buildBranchLinks = (branch) => [
  {
    label: "Occupancy",
    description: "Open the occupancy workspace with this branch selected.",
    to: buildBranchScopedHref("/admin/room-availability", branch, {
      tab: "occupancy",
    }),
  },
  {
    label: "Accounts",
    description: "Review branch-scoped accounts and assigned admins.",
    to: buildBranchScopedHref("/admin/users", branch),
  },
  {
    label: "Reservations",
    description: "Inspect pending and in-progress reservations.",
    to: buildBranchScopedHref("/admin/reservations", branch),
  },
  {
    label: "Overdue Billing",
    description: "Jump to owner financial reporting for this branch.",
    to: buildBranchScopedHref("/admin/analytics/details", branch, {
      tab: "financials",
    }),
  },
  {
    label: "Maintenance",
    description: "See open maintenance requests in this branch.",
    to: buildBranchScopedHref("/admin/maintenance", branch),
  },
  {
    label: "Inquiries",
    description: "Review pending inquiries for this branch.",
    to: buildBranchScopedHref("/admin/inquiries", branch),
  },
];

const formatAdminName = (admin) =>
  `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email || "Branch admin";

export default function BranchManagementPage() {
  const { authFetch } = useApiClient();
  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["branches", "summary"],
    queryFn: () => authFetch("/branches/summary"),
    staleTime: 60_000,
  });

  const branches = useMemo(() => {
    return (data?.branches || []).map((branchSummary) => {
      const meta = BRANCH_META[branchSummary.branch] || {
        color: "#475569",
        surface: "#f8fafc",
      };

      return {
        ...branchSummary,
        color: meta.color,
        surface: meta.surface,
        warningLabels: Object.entries(branchSummary.warningStates || {})
          .filter(([, active]) => active)
          .map(([key]) => WARNING_COPY[key] || key),
        quickLinks: buildBranchLinks(branchSummary.branch),
      };
    });
  }, [data?.branches]);

  const comparisonSummary = useMemo(() => {
    return branches.reduce(
      (summary, branch) => ({
        totalBeds: summary.totalBeds + Number(branch.occupancy?.totalBeds || 0),
        occupiedBeds:
          summary.occupiedBeds + Number(branch.occupancy?.occupiedBeds || 0),
        availableBeds:
          summary.availableBeds + Number(branch.occupancy?.availableBeds || 0),
        overdueBillingCount:
          summary.overdueBillingCount + Number(branch.overdueBillingCount || 0),
        unresolvedWorkloadCount:
          summary.unresolvedWorkloadCount +
          Number(branch.unresolvedWorkloadCount || 0),
      }),
      {
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        overdueBillingCount: 0,
        unresolvedWorkloadCount: 0,
      },
    );
  }, [branches]);

  const comparisonRate =
    comparisonSummary.totalBeds > 0
      ? ((comparisonSummary.occupiedBeds / comparisonSummary.totalBeds) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="sa2">
      <div className="sa2-header">
        <div>
          <p className="sa2-eyebrow">System Control Hub</p>
          <h1 className="sa2-title">Branches</h1>
          <p className="sa-branches-header-copy">
            Compare fixed branch health side by side, then jump directly into the
            filtered owner workflows that need attention.
          </p>
        </div>
        <button
          type="button"
          className="sa-branches-refresh-btn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="sa-branches-overview">
        <article className="sa-branches-overview-card">
          <span className="sa-branches-overview-label">Network Occupancy</span>
          <strong className="sa-branches-overview-value">{comparisonRate}%</strong>
          <span className="sa-branches-overview-meta">
            {comparisonSummary.occupiedBeds} of {comparisonSummary.totalBeds} beds occupied
          </span>
        </article>
        <article className="sa-branches-overview-card">
          <span className="sa-branches-overview-label">Available Beds</span>
          <strong className="sa-branches-overview-value">
            {comparisonSummary.availableBeds}
          </strong>
          <span className="sa-branches-overview-meta">
            Capacity remaining across Gil Puyat and Guadalupe
          </span>
        </article>
        <article className="sa-branches-overview-card">
          <span className="sa-branches-overview-label">Overdue Billing</span>
          <strong className="sa-branches-overview-value">
            {comparisonSummary.overdueBillingCount}
          </strong>
          <span className="sa-branches-overview-meta">
            Bills currently marked overdue
          </span>
        </article>
        <article className="sa-branches-overview-card">
          <span className="sa-branches-overview-label">Open Workload</span>
          <strong className="sa-branches-overview-value">
            {comparisonSummary.unresolvedWorkloadCount}
          </strong>
          <span className="sa-branches-overview-meta">
            Pending reservations, maintenance, and inquiries
          </span>
        </article>
      </div>

      {isLoading ? (
        <section className="sa-branches-state">
          <Loader2 size={20} className="sa-branches-state-spinner" />
          <div>
            <strong>Loading branch summaries</strong>
            <p>Fetching owner branch metrics from the summary endpoint.</p>
          </div>
        </section>
      ) : error ? (
        <section className="sa-branches-state sa-branches-state--error">
          <AlertTriangle size={20} />
          <div>
            <strong>Unable to load branch summaries</strong>
            <p>{error.message || "The branch summary endpoint could not be loaded."}</p>
          </div>
        </section>
      ) : (
        <div className="sa-branches-grid">
          {branches.map((branch) => (
            <article key={branch.branch} className="sa-branch-card">
              <div className="sa-branch-card-header">
                <div
                  className="sa-branch-icon"
                  style={{
                    background: branch.surface,
                    color: branch.color,
                  }}
                >
                  <Building2 size={22} />
                </div>
                <div className="sa-branch-card-heading">
                  <div>
                    <h2 className="sa-branch-card-name">{branch.label}</h2>
                    <span className="sa-branch-card-id">{branch.branch}</span>
                  </div>
                  {branch.warningLabels.length ? (
                    <div className="sa-branch-warning-badges">
                      {branch.warningLabels.map((warning) => (
                        <span key={warning} className="sa-branch-warning-badge">
                          <AlertTriangle size={12} />
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="sa-branch-health-pill">Stable</span>
                  )}
                </div>
              </div>

              <div className="sa-branch-occupancy">
                <div className="sa-branch-occupancy-header">
                  <span>Occupancy</span>
                  <span
                    className="sa-branch-occupancy-rate"
                    style={{ color: branch.color }}
                  >
                    {branch.occupancy?.rate || 0}%
                  </span>
                </div>
                <div className="sa2-bar-track">
                  <div
                    className="sa2-bar-fill"
                    style={{
                      width: `${Math.min(branch.occupancy?.rate || 0, 100)}%`,
                      background: branch.color,
                    }}
                  />
                </div>
                <div className="sa-branch-occupancy-detail">
                  {branch.occupancy?.occupiedBeds || 0} / {branch.occupancy?.totalBeds || 0} beds occupied
                </div>
              </div>

              <div className="sa-branch-stats">
                <div className="sa-branch-stat-item">
                  <BedDouble size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">{branch.totalRooms}</span>
                    <span className="sa-branch-stat-label">Rooms</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <BedDouble size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.occupancy?.availableBeds || 0}
                    </span>
                    <span className="sa-branch-stat-label">Available Beds</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <Users size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">{branch.tenantCount}</span>
                    <span className="sa-branch-stat-label">Tenants</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <UserCog size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.assignedAdminCount}
                    </span>
                    <span className="sa-branch-stat-label">Assigned Admins</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <CreditCard size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.overdueBillingCount}
                    </span>
                    <span className="sa-branch-stat-label">Overdue Billing</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <Hammer size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.openMaintenanceCount}
                    </span>
                    <span className="sa-branch-stat-label">Open Maintenance</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <Building2 size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.pendingReservationsCount}
                    </span>
                    <span className="sa-branch-stat-label">Pending Reservations</span>
                  </div>
                </div>
                <div className="sa-branch-stat-item">
                  <MessageSquare size={16} className="sa-branch-stat-icon" />
                  <div>
                    <span className="sa-branch-stat-value">
                      {branch.pendingInquiriesCount}
                    </span>
                    <span className="sa-branch-stat-label">Pending Inquiries</span>
                  </div>
                </div>
              </div>

              <div className="sa-branch-admins">
                <div className="sa-branch-admins-header">
                  <UserCog size={14} />
                  <span>Assigned Admins ({branch.assignedAdminCount})</span>
                </div>
                {branch.assignedAdmins?.length ? (
                  <div className="sa-branch-admins-list">
                    {branch.assignedAdmins.map((admin) => (
                      <div key={admin._id} className="sa-branch-admin-row">
                        <div>
                          <span className="sa-branch-admin-name">
                            {formatAdminName(admin)}
                          </span>
                          <span className="sa-branch-admin-email">{admin.email}</span>
                        </div>
                        <span className="sa-branch-admin-badge">branch admin</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="sa2-empty">
                    No branch admin is assigned. Review Accounts to add coverage.
                  </p>
                )}
              </div>

              <div className="sa-branch-links">
                <div className="sa-branch-admins-header">
                  <ArrowRight size={14} />
                  <span>Quick Links</span>
                </div>
                <div className="sa-branch-link-grid">
                  {branch.quickLinks.map((link) => (
                    <Link key={link.label} to={link.to} className="sa-branch-link-card">
                      <strong>{link.label}</strong>
                      <span>{link.description}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
