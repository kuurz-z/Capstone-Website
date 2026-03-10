import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useApiClient } from "../../../shared/api/apiClient";
import AuditStatsBar from "../components/audit/AuditStatsBar";
import AuditToolbar from "../components/audit/AuditToolbar";
import AuditFilterPanel from "../components/audit/AuditFilterPanel";
import AuditLogsTable from "../components/audit/AuditLogsTable";
import "../styles/admin-audit-logs.css";

const AuditLogsPage = () => {
  const { authFetch } = useApiClient();

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

  // ── Fetch ──
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
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

  const fetchStats = useCallback(async () => {
    try {
      const response = await authFetch("/audit-logs/stats");
      if (response.success) setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch audit stats:", error);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Handlers ──
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  const handleSearch = (e) => {
    setFilters((prev) => ({ ...prev, search: e.target.value }));
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
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

  return (
    <div className="admin-audit-page">
      <AuditStatsBar stats={stats} />

      <div className="audit-filters-container">
        <AuditToolbar
          filters={filters}
          showFilters={showFilters}
          onSearch={handleSearch}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onFilterChange={handleFilterChange}
          onExport={handleExport}
        />

        {showFilters && (
          <AuditFilterPanel
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        )}

        <div className="audit-logs-table-container">
          <AuditLogsTable logs={logs} loading={loading} />
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
                <ChevronLeft size={16} /> Previous
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
                      setPagination((prev) => ({ ...prev, currentPage: page }))
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
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
