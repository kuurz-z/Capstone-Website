export default function TenantStatsBar({ stats }) {
  return (
    <section className="admin-tenants-stats">
      <div className="admin-tenants-stat-card">
        <p className="admin-tenants-stat-label">Total Tenants</p>
        <p className="admin-tenants-stat-value">{stats.total}</p>
      </div>
      <div className="admin-tenants-stat-card admin-tenants-stat-card-active">
        <p className="admin-tenants-stat-label">Active</p>
        <p className="admin-tenants-stat-value">{stats.active}</p>
      </div>
      <div className="admin-tenants-stat-card admin-tenants-stat-card-overdue">
        <p className="admin-tenants-stat-label">Overdue</p>
        <p className="admin-tenants-stat-value">{stats.overdue}</p>
      </div>
      <div className="admin-tenants-stat-card admin-tenants-stat-card-moving-out">
        <p className="admin-tenants-stat-label">Moving Out</p>
        <p className="admin-tenants-stat-value">{stats.movingOut}</p>
      </div>
    </section>
  );
}
