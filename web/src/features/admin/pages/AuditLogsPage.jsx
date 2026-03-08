/**
 * ============================================================================
 * AUDIT LOGS PAGE
 * ============================================================================
 *
 * Admin page for viewing and managing audit logs.
 * Features:
 * - View all system activities
 * - Filter by type, severity, date range, role
 * - Search logs
 * - Export logs as JSON
 * - Security monitoring (failed logins)
 *
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  UserPlus,
  LogIn,
  FileEdit,
  Trash2,
  XCircle,
  Activity,
  AlertCircle,
} from "lucide-react";

import { useApiClient } from "../../../shared/api/apiClient";
import "../styles/admin-audit-logs.css";

const AuditLogsPage = () => {
  // Get API client
  const { authFetch } = useApiClient();

  // State
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    today: 0,
    deletions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    total: 0,
    pageCount: 0,
  });

  const [filters, setFilters] = useState({
    type: "all",
    severity: "all",
    dateRange: "7days",
    role: "all",
    search: "",
  });

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Build query params
      const params = new URLSearchParams();
      if (filters.type !== "all") params.append("type", filters.type);
      if (filters.severity !== "all")
        params.append("severity", filters.severity);
      if (filters.role !== "all") params.append("role", filters.role);
      if (filters.search) params.append("search", filters.search);
      params.append("limit", pagination.itemsPerPage);
      params.append(
        "offset",
        (pagination.currentPage - 1) * pagination.itemsPerPage,
      );

      // Calculate date range
      if (filters.dateRange !== "all") {
        const days = parseInt(filters.dateRange.replace("days", ""));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        params.append("startDate", startDate.toISOString());
      }

      const response = await authFetch(`/audit-logs?${params.toString()}`);

      if (response.success) {
        setLogs(response.data);
        const pageCount = Math.ceil(
          (response.pagination?.total || 0) / pagination.itemsPerPage,
        );
        setPagination((prev) => ({
          ...prev,
          total: response.pagination?.total || 0,
          pageCount,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, pagination.currentPage, pagination.itemsPerPage]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await authFetch("/audit-logs/stats");
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch audit stats:", error);
    }
  }, [authFetch]);

  // Load data on mount and filter change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, currentPage: 1 })); // Reset to first page
  };

  // Handle search
  const handleSearch = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({ ...prev, search: value }));
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  // Export logs
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

      // Create and download file
      const blob = new Blob([JSON.stringify(response, null, 2)], {
        type: "application/json",
      });
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

  // Get activity icon
  const getActivityIcon = (type) => {
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
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="admin-audit-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Activity Log</h1>
          <p className="admin-page-subtitle">
            Monitor all system activities and maintain audit trails
          </p>
        </div>
      </div>

      {/* Stats Cards */}
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

      {/* Filters Section */}
      <div className="audit-filters-container">
        <div className="audit-filters-header">
          <div className="audit-filters-main">
            <div className="audit-search">
              <Search className="audit-search-icon" size={20} />
              <input
                type="text"
                placeholder="Search logs by action, user, or details..."
                value={filters.search}
                onChange={handleSearch}
              />
            </div>
            <button
              className="audit-filter-btn"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={18} />
              Filters
              <ChevronDown
                size={16}
                style={{
                  transform: showFilters ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            <button className="audit-export-btn" onClick={handleExport}>
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="audit-filters-panel">
            <div className="filter-group">
              <label>Activity Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange("type", e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="login">Login/Logout</option>{" "}
                <option value="registration">Registration</option>{" "}
                <option value="data_modification">Data Modifications</option>
                <option value="data_deletion">Data Deletions</option>
                <option value="error">Errors</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Severity</label>
              <select
                value={filters.severity}
                onChange={(e) => handleFilterChange("severity", e.target.value)}
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Date Range</label>
              <select
                value={filters.dateRange}
                onChange={(e) =>
                  handleFilterChange("dateRange", e.target.value)
                }
              >
                <option value="all">All Time</option>
                <option value="1days">Last 24 Hours</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
              </select>
            </div>

            <div className="filter-group">
              <label>User Role</label>
              <select
                value={filters.role}
                onChange={(e) => handleFilterChange("role", e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="tenant">Tenant</option>
                <option value="admin">Admin</option>
                <option value="superAdmin">Super Admin</option>
              </select>
            </div>
          </div>
        )}

        {/* Logs Table */}
        <div className="audit-logs-table-container">
          {loading ? (
            <div className="audit-loading">
              <div className="audit-loading-spinner"></div>
              <p>Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="audit-empty-state">
              <p>No logs match your filters</p>
            </div>
          ) : (
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
                      <span
                        className={`role-badge ${log.userRole || "unknown"}`}
                      >
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
          )}
        </div>

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="audit-pagination">
            <div className="audit-pagination-info">
              Showing{" "}
              {(pagination.currentPage - 1) * pagination.itemsPerPage + 1} -{" "}
              {Math.min(
                pagination.currentPage * pagination.itemsPerPage,
                pagination.total,
              )}{" "}
              of {pagination.total} logs
            </div>
            <div
              className="audit-pagination-controls"
              style={{ display: "flex", gap: "8px" }}
            >
              <button
                className="audit-pagination-btn"
                onClick={() =>
                  setPagination((prev) => ({
                    ...prev,
                    currentPage: Math.max(1, prev.currentPage - 1),
                  }))
                }
                disabled={pagination.currentPage === 1}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor:
                    pagination.currentPage === 1 ? "#f3f4f6" : "white",
                  color: pagination.currentPage === 1 ? "#9ca3af" : "#374151",
                  cursor:
                    pagination.currentPage === 1 ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <div
                style={{ display: "flex", gap: "4px", alignItems: "center" }}
              >
                {Array.from(
                  { length: pagination.pageCount },
                  (_, i) => i + 1,
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() =>
                      setPagination((prev) => ({
                        ...prev,
                        currentPage: page,
                      }))
                    }
                    style={{
                      padding: "6px 10px",
                      border:
                        page === pagination.currentPage
                          ? "1px solid #0C375F"
                          : "1px solid #d1d5db",
                      borderRadius: "6px",
                      backgroundColor:
                        page === pagination.currentPage ? "#0C375F" : "white",
                      color:
                        page === pagination.currentPage ? "white" : "#374151",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "500",
                      minWidth: "32px",
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                className="audit-pagination-btn"
                onClick={() =>
                  setPagination((prev) => ({
                    ...prev,
                    currentPage: Math.min(
                      pagination.pageCount,
                      prev.currentPage + 1,
                    ),
                  }))
                }
                disabled={pagination.currentPage === pagination.pageCount}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor:
                    pagination.currentPage === pagination.pageCount
                      ? "#f3f4f6"
                      : "white",
                  color:
                    pagination.currentPage === pagination.pageCount
                      ? "#9ca3af"
                      : "#374151",
                  cursor:
                    pagination.currentPage === pagination.pageCount
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
