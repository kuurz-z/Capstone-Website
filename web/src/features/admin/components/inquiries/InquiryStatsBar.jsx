export default function InquiryStatsBar({ stats }) {
  return (
    <section className="admin-inquiries-stats">
      <div className="admin-inquiries-stat-card">
        <p className="admin-inquiries-stat-label">Total Inquiries</p>
        <p className="admin-inquiries-stat-value">{stats.total}</p>
      </div>
      <div className="admin-inquiries-stat-card admin-inquiries-stat-card-new">
        <p className="admin-inquiries-stat-label">New</p>
        <p className="admin-inquiries-stat-value">{stats.new}</p>
      </div>
      <div className="admin-inquiries-stat-card admin-inquiries-stat-card-responded">
        <p className="admin-inquiries-stat-label">Responded</p>
        <p className="admin-inquiries-stat-value">{stats.responded}</p>
      </div>
    </section>
  );
}
