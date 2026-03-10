import {
  Clock,
  User,
  LogIn,
  UserPlus,
  FileEdit,
  Trash2,
  XCircle,
  Activity,
} from "lucide-react";
import { formatTimestamp } from "../../utils/formatters";

function getActivityIcon(type) {
  switch (type) {
    case "login":
      return <LogIn size={16} />;
    case "registration":
      return <UserPlus size={16} />;
    case "data_modification":
      return <FileEdit size={16} />;
    case "data_deletion":
      return <Trash2 size={16} />;
    case "error":
      return <XCircle size={16} />;
    default:
      return <Activity size={16} />;
  }
}

export default function AuditLogsTable({ logs, loading }) {
  if (loading) {
    return (
      <div className="audit-loading">
        <div className="audit-loading-spinner"></div>
        <p>Loading audit logs...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="audit-empty-state">
        <p>No logs match your filters</p>
      </div>
    );
  }

  return (
    <table className="audit-logs-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Activity</th>
          <th>User</th>
          <th>Role</th>
          <th>Severity</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.logId || log._id}>
            <td>
              <div className="log-timestamp">
                <Clock size={16} />
                {formatTimestamp(log.timestamp)}
              </div>
            </td>
            <td>
              <div className="log-activity">
                <div className="log-activity-icon">
                  {getActivityIcon(log.type)}
                </div>
                <span className="log-activity-text">{log.action}</span>
              </div>
            </td>
            <td>
              <div className="log-user">
                <div className="log-user-email">
                  <User size={14} />
                  {log.user}
                </div>
                {log.ip && <div className="log-user-ip">{log.ip}</div>}
              </div>
            </td>
            <td>
              <span className={`role-badge ${log.userRole || "unknown"}`}>
                {log.userRole || "N/A"}
              </span>
            </td>
            <td>
              <span className={`severity-badge ${log.severity}`}>
                {log.severity}
              </span>
            </td>
            <td>
              <div className="log-details">{log.details || "-"}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
