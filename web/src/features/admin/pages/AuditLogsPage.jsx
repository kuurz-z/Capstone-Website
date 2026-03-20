import React, { useState, useMemo } from "react";
import { FileText, Download } from "lucide-react";

import { useAuth } from "../../../shared/hooks/useAuth";
import { useAuditLogs, useAuditStats } from "../../../shared/hooks/queries/useAuditLogs";
import { useApiClient } from "../../../shared/api/apiClient";
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-audit-logs.css";

const AuditLogsPage = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const { authFetch } = useApiClient();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [filters, setFilters] = useState({
    type: "all",
    severity: "all",
    dateRange: "7days",
    role: "all",
    search: "",
  });

  // Build query params
  const queryParams = useMemo(() => {
    const params = {};
    if (filters.type !== "all") params.type = filters.type;
    if (filters.severity !== "all") params.severity = filters.severity;
    if (filters.role !== "all") params.role = filters.role;
    if (filters.search) params.search = filters.search;
    params.limit = String(itemsPerPage);
    params.offset = String((currentPage - 1) * itemsPerPage);
    if (filters.dateRange !== "all") {
      const days = parseInt(filters.dateRange.replace("days", ""));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      params.startDate = startDate.toISOString();
    }
    return params;
  }, [filters, currentPage]);

  const { data: logsResponse, isLoading: loading } = useAuditLogs(queryParams);
  const { data: statsResponse } = useAuditStats();

  const logs = logsResponse?.data || [];
  const stats = statsResponse?.data || { total: 0, critical: 0, today: 0, deletions: 0 };
  const serverTotal = logsResponse?.pagination?.total || 0;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      const exportFilters = {};
      if (filters.type !== "all") exportFilters.type = filters.type;
      if (filters.severity !== "all") exportFilters.severity = filters.severity;
      if (filters.search) exportFilters.search = filters.search;
      if (filters.dateRange !== "all") {
        const days = parseInt(filters.dateRange.replace("days", ""));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        exportFilters.startDate = startDate.toISOString();
      }
      const response = await authFetch("/audit-logs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: exportFilters }),
      });
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export logs:", error);
    }
  };

  const summaryItems = [
    { label: "Total Logs", value: stats.total, color: "blue" },
    { label: "Critical", value: stats.critical, color: "red" },
    { label: "Today", value: stats.today, color: "green" },
    { label: "Deletions", value: stats.deletions, color: "orange" },
  ];

  const actionFilters = [
    {
      key: "severity",
      options: [
        { value: "all", label: "All Severity" },
        { value: "info", label: "Info" },
        { value: "warning", label: "Warning" },
        { value: "critical", label: "Critical" },
      ],
      value: filters.severity,
      onChange: (v) => handleFilterChange("severity", v),
    },
    {
      key: "type",
      options: [
        { value: "all", label: "All Types" },
        { value: "auth", label: "Auth" },
        { value: "data_change", label: "Data Change" },
        { value: "admin_action", label: "Admin Action" },
        { value: "system", label: "System" },
      ],
      value: filters.type,
      onChange: (v) => handleFilterChange("type", v),
    },
    {
      key: "dateRange",
      options: [
        { value: "7days", label: "Last 7 days" },
        { value: "30days", label: "Last 30 days" },
        { value: "90days", label: "Last 90 days" },
        { value: "all", label: "All time" },
      ],
      value: filters.dateRange,
      onChange: (v) => handleFilterChange("dateRange", v),
    },
  ];

  const columns = [
    {
      key: "type",
      label: "Type",
      width: "100px",
      render: (row) => (
        <span className="audit-type-badge">{row.type?.replace("_", " ") || "—"}</span>
      ),
    },
    {
      key: "message",
      label: "Event",
      render: (row) => (
        <span className="audit-message">{row.message || "—"}</span>
      ),
    },
    {
      key: "performedBy",
      label: "User",
      render: (row) => row.performedBy?.email || row.performedBy?.username || "System",
    },
    {
      key: "severity",
      label: "Severity",
      width: "90px",
      render: (row) => {
        const map = { info: "info", warning: "pending", critical: "overdue" };
        return <StatusBadge status={map[row.severity] || "info"} label={row.severity || "info"} />;
      },
    },
    {
      key: "createdAt",
      label: "Time",
      width: "140px",
      render: (row) =>
        row.createdAt ? new Date(row.createdAt).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }) : "—",
    },
  ];

  return (
    <PageShell>
      <PageShell.Summary>
        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Actions>
        <ActionBar
          search={{
            value: filters.search,
            onChange: (v) => handleFilterChange("search", v),
            placeholder: "Search logs...",
          }}
          filters={actionFilters}
          actions={[
            { label: "Export", icon: Download, onClick: handleExport, variant: "ghost" },
          ]}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={logs}
          loading={loading}
          pagination={{
            page: currentPage,
            pageSize: itemsPerPage,
            total: serverTotal,
            onPageChange: setCurrentPage,
          }}
          emptyState={{
            icon: FileText,
            title: "No audit logs",
            description: "Try adjusting your filters or date range.",
          }}
        />
      </PageShell.Content>
    </PageShell>
  );
};

export default AuditLogsPage;
