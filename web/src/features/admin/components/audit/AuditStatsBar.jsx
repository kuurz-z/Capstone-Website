import { Activity, AlertCircle, Clock, Trash2 } from "lucide-react";
import { formatTimestamp } from "../../utils/formatters";

export default function AuditStatsBar({ stats }) {
  return (
    <div className="audit-stats">
      <div className="stat-card">
        <div className="stat-card-content">
          <div className="stat-card-info">
            <p>Total Logs</p>
            <h3 className="text-blue">{stats.total.toLocaleString()}</h3>
          </div>
          <div className="stat-card-icon blue">
            <Activity size={32} />
          </div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-content">
          <div className="stat-card-info">
            <p>Critical Events</p>
            <h3 className="text-red">{stats.critical}</h3>
          </div>
          <div className="stat-card-icon red">
            <AlertCircle size={32} />
          </div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-content">
          <div className="stat-card-info">
            <p>Today's Activity</p>
            <h3 className="text-green">{stats.today}</h3>
          </div>
          <div className="stat-card-icon green">
            <Clock size={32} />
          </div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-content">
          <div className="stat-card-info">
            <p>Data Deletions</p>
            <h3 className="text-orange">{stats.deletions}</h3>
          </div>
          <div className="stat-card-icon orange">
            <Trash2 size={32} />
          </div>
        </div>
      </div>
    </div>
  );
}
