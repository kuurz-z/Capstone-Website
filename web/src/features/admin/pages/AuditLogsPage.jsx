import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Shield,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  useAuditStats,
  useCleanupAuditLogs,
  useExportAuditLogs,
  useFailedLoginSignals,
  usePaginatedAuditLogs,
} from "../../../shared/hooks/queries/useAuditLogs";
import { showNotification } from "../../../shared/utils/notification";
import {
  ActionBar,
  DataTable,
  DetailDrawer,
  PageShell,
  StatusBadge,
  SummaryBar,
} from "../components/shared";
import {
  AUDIT_BRANCH_OPTIONS,
  AUDIT_ROLE_OPTIONS,
  AUDIT_SEVERITY_OPTIONS,
  AUDIT_TRAIL_TAB,
  AUDIT_TYPE_OPTIONS,
  SECURITY_SIGNALS_TAB,
  buildAuditExportFilters,
  buildAuditLogQueryParams,
  createDefaultAuditFilters,
  formatAuditBranch,
  formatAuditLabel,
  getAllowedAuditTabs,
  mapAuditSeverityToBadgeStatus,
  normalizeAuditTab,
} from "./auditLogPageConfig.mjs";
import "../styles/design-tokens.css";
import "../styles/admin-audit-logs.css";

const ITEMS_PER_PAGE = 10;
const RETENTION_OPTIONS = [90, 180, 365];
const SECURITY_WINDOW_OPTIONS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 72 hours" },
  { value: "168", label: "Last 7 days" },
];

const formatDateTime = (value) => {
  if (!value) return "Not available";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const renderMetadata = (metadata) => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "No metadata recorded";
  }

  return JSON.stringify(metadata, null, 2);
};

const AuditLogsPage = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const auditTabs = useMemo(
    () =>
      getAllowedAuditTabs(isOwner).map((key) => ({
        key,
        label: key === AUDIT_TRAIL_TAB ? "Audit Trail" : "Security Signals",
        icon: key === AUDIT_TRAIL_TAB ? FileText : Shield,
      })),
    [isOwner],
  );

  const [activeTab, setActiveTab] = useState(AUDIT_TRAIL_TAB);
  const currentTab = normalizeAuditTab(activeTab, isOwner);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [securityWindowHours, setSecurityWindowHours] = useState("24");
  const [cleanupDays, setCleanupDays] = useState(String(RETENTION_OPTIONS[0]));
  const [filters, setFilters] = useState(() => createDefaultAuditFilters());

  const queryParams = useMemo(
    () =>
      buildAuditLogQueryParams(filters, {
        currentPage,
        itemsPerPage: ITEMS_PER_PAGE,
      }),
    [filters, currentPage],
  );
  const statsBranch =
    isOwner && filters.branch !== "all" ? filters.branch : undefined;

  const { data: logsEnvelope, isLoading: auditLoading } = usePaginatedAuditLogs(
    queryParams,
  );
  const { data: auditStats } = useAuditStats(statsBranch);
  const { data: securitySignals, isLoading: securityLoading } =
    useFailedLoginSignals(Number(securityWindowHours), {
      enabled: isOwner && currentTab === SECURITY_SIGNALS_TAB,
    });
  const exportAuditLogs = useExportAuditLogs();
  const cleanupAuditLogs = useCleanupAuditLogs();

  const logs = Array.isArray(logsEnvelope?.data) ? logsEnvelope.data : [];
  const pagination = logsEnvelope?.meta?.pagination || {};
  const totalLogs = Number(
    pagination.total ?? pagination.totalItems ?? auditStats?.total ?? 0,
  );
  const stats = auditStats || {
    total: 0,
    critical: 0,
    today: 0,
    deletions: 0,
  };
  const failedLogins = securitySignals?.recentAttempts || [];
  const suspiciousIps = securitySignals?.suspiciousIPs || [];

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      const response = await exportAuditLogs.mutateAsync(
        buildAuditExportFilters(filters),
      );
      const blob = new Blob([JSON.stringify(response, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification("Audit export generated successfully.", "success", 3000);
    } catch (error) {
      showNotification(
        error.message || "Failed to export audit logs.",
        "error",
        3500,
      );
    }
  };

  const handleCleanup = async () => {
    const daysToKeep = Number(cleanupDays);
    if (!daysToKeep) return;

    const confirmed = window.confirm(
      `Delete non-critical audit logs older than ${daysToKeep} days? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const result = await cleanupAuditLogs.mutateAsync(daysToKeep);
      showNotification(
        `Retention cleanup completed. ${result.deletedCount || 0} log(s) removed.`,
        "success",
        3500,
      );
    } catch (error) {
      showNotification(
        error.message || "Failed to run audit retention cleanup.",
        "error",
        3500,
      );
    }
  };

  const auditSummaryItems = [
    { label: "Total Logs", value: stats.total || 0, color: "blue" },
    { label: "Critical", value: stats.critical || 0, color: "red" },
    { label: "Today", value: stats.today || 0, color: "green" },
    { label: "Deletions", value: stats.deletions || 0, color: "orange" },
  ];

  const securitySummaryItems = [
    {
      label: "Failed Logins",
      value: securitySignals?.totalFailedLogins || 0,
      color: "orange",
    },
    {
      label: "Suspicious IPs",
      value: suspiciousIps.length,
      color: "red",
    },
    {
      label: "Recent Attempts",
      value: failedLogins.length,
      color: "blue",
    },
    {
      label: "Retention Default",
      value: `${cleanupDays}d`,
      color: "green",
    },
  ];

  const auditColumns = [
    {
      key: "type",
      label: "Type",
      width: "150px",
      render: (row) => (
        <span className="audit-type-badge">{formatAuditLabel(row.type, "Unknown")}</span>
      ),
    },
    {
      key: "action",
      label: "Event",
      render: (row) => <span className="audit-message">{row.action || "No action recorded"}</span>,
    },
    {
      key: "user",
      label: "User",
      render: (row) => row.user || "System",
    },
    {
      key: "branch",
      label: "Branch",
      width: "140px",
      render: (row) => formatAuditBranch(row.branch),
    },
    {
      key: "severity",
      label: "Severity",
      width: "110px",
      render: (row) => (
        <StatusBadge
          status={mapAuditSeverityToBadgeStatus(row.severity)}
          label={formatAuditLabel(row.severity, "Unknown")}
        />
      ),
    },
    {
      key: "timestamp",
      label: "Time",
      width: "165px",
      render: (row) => formatDateTime(row.timestamp),
    },
  ];

  const suspiciousIpColumns = [
    {
      key: "ip",
      label: "IP Address",
      render: (row) => row.ip || "Unknown",
    },
    {
      key: "attemptCount",
      label: "Attempts",
      width: "110px",
      render: (row) => row.attemptCount || 0,
    },
    {
      key: "lastAttempt",
      label: "Last Attempt",
      width: "180px",
      render: (row) => formatDateTime(row.lastAttempt),
    },
    {
      key: "targetedUsers",
      label: "Targeted Users",
      render: (row) =>
        Array.isArray(row.targetedUsers) && row.targetedUsers.length > 0
          ? row.targetedUsers.join(", ")
          : "No users recorded",
    },
  ];

  const failedLoginColumns = [
    {
      key: "user",
      label: "User",
      render: (row) => row.user || "Unknown",
    },
    {
      key: "ip",
      label: "IP",
      width: "140px",
      render: (row) => row.ip || "Unknown",
    },
    {
      key: "branch",
      label: "Branch",
      width: "140px",
      render: (row) => formatAuditBranch(row.branch),
    },
    {
      key: "timestamp",
      label: "Attempted",
      width: "180px",
      render: (row) => formatDateTime(row.timestamp),
    },
    {
      key: "details",
      label: "Details",
      render: (row) => row.details || "No details recorded",
    },
  ];

  const auditTrailFilters = [
    ...(isOwner
      ? [
          {
            key: "branch",
            options: AUDIT_BRANCH_OPTIONS,
            value: filters.branch,
            onChange: (value) => handleFilterChange("branch", value),
          },
        ]
      : []),
    {
      key: "role",
      options: AUDIT_ROLE_OPTIONS,
      value: filters.role,
      onChange: (value) => handleFilterChange("role", value),
    },
    {
      key: "severity",
      options: AUDIT_SEVERITY_OPTIONS,
      value: filters.severity,
      onChange: (value) => handleFilterChange("severity", value),
    },
    {
      key: "type",
      options: AUDIT_TYPE_OPTIONS,
      value: filters.type,
      onChange: (value) => handleFilterChange("type", value),
    },
  ];

  return (
    <PageShell
      tabs={isOwner ? auditTabs : []}
      activeTab={currentTab}
      onTabChange={(nextTab) => {
        setActiveTab(nextTab);
        setSelectedLog(null);
      }}
    >
      <PageShell.Summary>
        <SummaryBar
          items={
            currentTab === SECURITY_SIGNALS_TAB
              ? securitySummaryItems
              : auditSummaryItems
          }
        />
      </PageShell.Summary>

      <PageShell.Actions>
        {currentTab === AUDIT_TRAIL_TAB ? (
          <ActionBar
            search={{
              value: filters.search,
              onChange: (value) => handleFilterChange("search", value),
              placeholder: "Search actions, users, or details...",
            }}
            filters={auditTrailFilters}
            actions={[
              {
                label: "Export",
                icon: Download,
                onClick: handleExport,
                variant: "ghost",
                disabled: exportAuditLogs.isPending,
              },
            ]}
          >
            <div className="audit-logs__field-group">
              <label className="audit-logs__field">
                <span>User Email</span>
                <input
                  type="text"
                  value={filters.user}
                  onChange={(event) =>
                    handleFilterChange("user", event.target.value)
                  }
                  placeholder="Filter by user email"
                />
              </label>
              <label className="audit-logs__field audit-logs__field--date">
                <span>Start Date</span>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) =>
                    handleFilterChange("startDate", event.target.value)
                  }
                />
              </label>
              <label className="audit-logs__field audit-logs__field--date">
                <span>End Date</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) =>
                    handleFilterChange("endDate", event.target.value)
                  }
                />
              </label>
            </div>
          </ActionBar>
        ) : (
          <ActionBar
            filters={[
              {
                key: "hours",
                options: SECURITY_WINDOW_OPTIONS,
                value: securityWindowHours,
                onChange: setSecurityWindowHours,
              },
            ]}
          />
        )}
      </PageShell.Actions>

      <PageShell.Content>
        {currentTab === AUDIT_TRAIL_TAB ? (
          <DataTable
            columns={auditColumns}
            data={logs}
            loading={auditLoading}
            serverPagination
            pagination={{
              page: currentPage,
              pageSize: ITEMS_PER_PAGE,
              total: totalLogs,
              onPageChange: setCurrentPage,
            }}
            onRowClick={setSelectedLog}
            emptyState={{
              icon: FileText,
              title: "No audit events found",
              description: "Try adjusting the branch, role, date, or severity filters.",
            }}
          />
        ) : (
          <div className="audit-security">
            <div className="audit-security__notice">
              Security Signals are owner-only in this phase because failed-login
              monitoring is not branch-scoped.
            </div>

            <div className="audit-security__grid">
              <section className="audit-panel">
                <div className="audit-panel__header">
                  <div>
                    <h3>Suspicious IPs</h3>
                    <p>IPs with repeated failed login attempts in the selected window.</p>
                  </div>
                </div>
                <DataTable
                  columns={suspiciousIpColumns}
                  data={suspiciousIps}
                  loading={securityLoading}
                  emptyState={{
                    icon: Shield,
                    title: "No suspicious IPs",
                    description: "No IPs crossed the current suspicious-attempt threshold.",
                  }}
                />
              </section>

              <section className="audit-panel">
                <div className="audit-panel__header">
                  <div>
                    <h3>Recent Failed Logins</h3>
                    <p>Latest warning-level login failures returned by the existing audit backend.</p>
                  </div>
                </div>
                <DataTable
                  columns={failedLoginColumns}
                  data={failedLogins}
                  loading={securityLoading}
                  emptyState={{
                    icon: AlertTriangle,
                    title: "No failed logins",
                    description: "No failed login attempts were recorded in the selected window.",
                  }}
                />
              </section>
            </div>

            <section className="audit-panel audit-panel--retention">
              <div className="audit-panel__header">
                <div>
                  <h3>Retention Cleanup</h3>
                  <p>
                    Delete non-critical audit logs older than the selected retention
                    window. Critical logs are retained.
                  </p>
                </div>
              </div>

              <div className="audit-retention">
                <label className="audit-logs__field audit-logs__field--date">
                  <span>Days To Keep</span>
                  <select
                    value={cleanupDays}
                    onChange={(event) => setCleanupDays(event.target.value)}
                  >
                    {RETENTION_OPTIONS.map((days) => (
                      <option key={days} value={String(days)}>
                        {days} days
                      </option>
                    ))}
                  </select>
                </label>

                <div className="audit-retention__copy">
                  Safe defaults start at 90 days. Cleanup requires explicit confirmation
                  before anything is deleted.
                </div>

                <button
                  type="button"
                  className="audit-retention__button"
                  onClick={handleCleanup}
                  disabled={cleanupAuditLogs.isPending}
                >
                  <Trash2 size={15} />
                  Run Cleanup
                </button>
              </div>
            </section>
          </div>
        )}
      </PageShell.Content>

      <DetailDrawer
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? selectedLog.action || "Audit Event" : "Audit Event"}
        width={760}
      >
        {selectedLog ? (
          <>
            <div className="audit-log-detail__hero">
              <div className="audit-log-detail__hero-tags">
                <StatusBadge
                  status={mapAuditSeverityToBadgeStatus(selectedLog.severity)}
                  label={formatAuditLabel(selectedLog.severity, "Unknown")}
                />
                <span className="audit-log-detail__tag">
                  {formatAuditLabel(selectedLog.type, "Unknown")}
                </span>
                <span className="audit-log-detail__tag">
                  {formatAuditBranch(selectedLog.branch)}
                </span>
              </div>
              <p>{selectedLog.details || "No additional details recorded."}</p>
            </div>

            <DetailDrawer.Section label="Event Context">
              <DetailDrawer.Row label="User" value={selectedLog.user || "System"} />
              <DetailDrawer.Row
                label="Role"
                value={formatAuditLabel(selectedLog.userRole, "Unknown")}
              />
              <DetailDrawer.Row
                label="Recorded"
                value={formatDateTime(selectedLog.timestamp)}
              />
              <DetailDrawer.Row label="IP Address" value={selectedLog.ip || "Unknown"} />
              <DetailDrawer.Row
                label="User Agent"
                value={selectedLog.userAgent || "Unknown"}
              />
            </DetailDrawer.Section>

            <DetailDrawer.Section label="Entity Details">
              <DetailDrawer.Row
                label="Entity Type"
                value={formatAuditLabel(selectedLog.entityType, "Not linked")}
              />
              <DetailDrawer.Row
                label="Entity ID"
                value={selectedLog.entityId || "Not linked"}
              />
              <DetailDrawer.Row
                label="Log ID"
                value={selectedLog.logId || "Unavailable"}
              />
            </DetailDrawer.Section>

            <DetailDrawer.Section label="Metadata">
              <pre className="audit-log-detail__json">
                {renderMetadata(selectedLog.metadata)}
              </pre>
            </DetailDrawer.Section>
          </>
        ) : null}
      </DetailDrawer>
    </PageShell>
  );
};

export default AuditLogsPage;
