import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "./EmptyState";
import "./DataTable.css";

/**
 * DataTable — Sortable, paginated, clickable table.
 *
 * Props:
 *   columns:    [{ key, label, sortable?, render?, width?, align? }]
 *   data:       array of row objects
 *   pagination: { page, pageSize, total, onPageChange }
 *   onRowClick: (row) => void
 *   emptyState: { icon?, title, description? }
 *   loading:    boolean
 */
export default function DataTable({
  columns = [],
  data = [],
  pagination,
  onRowClick,
  emptyState,
  loading = false,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal)
        : aVal - bVal;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  // Pagination
  const pageSize = pagination?.pageSize || data.length;
  const currentPage = pagination?.page || 1;
  const total = pagination?.total ?? data.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const pagedData = pagination
    ? sortedData
    : sortedData;

  if (!loading && data.length === 0 && emptyState) {
    return <EmptyState icon={emptyState.icon} title={emptyState.title} description={emptyState.description} />;
  }

  return (
    <div className="data-table-wrapper">
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`data-table__th ${col.sortable ? "data-table__th--sortable" : ""} ${col.align ? `data-table__th--${col.align}` : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="data-table__th-content">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === "asc"
                        ? <ChevronUp size={13} />
                        : <ChevronDown size={13} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`} className="data-table__row data-table__row--skeleton">
                  {columns.map((col) => (
                    <td key={col.key} className="data-table__td">
                      <div className="data-table__skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              pagedData.map((row, i) => (
                <tr
                  key={row.id || row._id || i}
                  className={`data-table__row ${onRowClick ? "data-table__row--clickable" : ""}`}
                  onClick={(e) => {
                    // Don't fire row click if the event came from an action cell
                    if (e.target.closest("[data-action-cell]")) return;
                    onRowClick?.(row);
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`data-table__td ${col.align ? `data-table__td--${col.align}` : ""}`}
                      {...(col.align === "right" ? { "data-action-cell": "true" } : {})}
                    >
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pageCount > 1 && (
        <div className="data-table__pagination">
          <span className="data-table__pagination-info">
            {total} result{total !== 1 ? "s" : ""}
          </span>
          <div className="data-table__pagination-controls">
            <button
              className="data-table__page-btn"
              disabled={currentPage <= 1}
              onClick={() => pagination.onPageChange(currentPage - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="data-table__page-label">
              {currentPage} / {pageCount}
            </span>
            <button
              className="data-table__page-btn"
              disabled={currentPage >= pageCount}
              onClick={() => pagination.onPageChange(currentPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
