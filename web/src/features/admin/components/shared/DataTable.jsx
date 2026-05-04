import { useMemo, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import EmptyState from "./EmptyState";
import { exportToExcel, exportToPDF } from "../../../../shared/utils/exportUtils";
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
  onRowHover,
  onRowFocus,
  emptyState,
  loading = false,
  sorting = "client",
  sortKey: externalSortKey = null,
  sortDir: externalSortDir = "asc",
  onSortChange,
  serverPagination = false,
  disableRowInteraction = false,
  // Row selection
  selectable = false,
  selectedIds = null,
  getRowId = (row) => row.request_id || row.id || row._id,
  onSelectionChange = null,
  // Export features
  exportable = false,
  exportFilename = "Table_Export",
  exportTitle = "Exported Data",
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const activeSortKey = sorting === "external" ? externalSortKey : sortKey;
  const activeSortDir = sorting === "external" ? externalSortDir : sortDir;

  const handleSort = (key) => {
    if (sorting === "external") {
      const nextDir =
        activeSortKey === key && activeSortDir === "asc" ? "desc" : "asc";
      onSortChange?.(key, nextDir);
      return;
    }
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (sorting === "external" || !sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, sorting]);

  // Selection helpers (only active when selectable=true)
  const activeSelectedIds = selectable && selectedIds instanceof Set ? selectedIds : null;

  const toggleRow = (row) => {
    if (!selectable || !onSelectionChange) return;
    const id = getRowId(row);
    const next = new Set(activeSelectedIds || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const togglePageAll = (pageRows) => {
    if (!selectable || !onSelectionChange) return;
    const next = new Set(activeSelectedIds || []);
    const pageIds = pageRows.map(getRowId);
    const allSelected = pageIds.every((id) => next.has(id));
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectionChange(next);
  };

  // Pagination
  const pageSize = pagination?.pageSize || data.length || 1;
  const currentPage = pagination?.page || 1;
  const total = pagination?.total ?? data.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Slice data for the current page
  const pagedData = pagination
    ? serverPagination
      ? sortedData
      : sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  if (!loading && data.length === 0 && emptyState) {
    return (
      <EmptyState
        icon={emptyState.icon}
        title={emptyState.title}
        description={emptyState.description}
      />
    );
  }

  return (
    <div className="data-table-wrapper">
      {exportable && data.length > 0 && (
        <div className="data-table-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button 
            type="button" 
            className="data-table__export-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }}
            onClick={() => exportToExcel(sortedData, columns, exportFilename)}
          >
            <Download size={14} /> Excel
          </button>
          <button 
            type="button" 
            className="data-table__export-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }}
            onClick={() => exportToPDF(sortedData, columns, exportFilename, exportTitle)}
          >
            <Download size={14} /> PDF
          </button>
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && (
                <th className="data-table__th data-table__th--checkbox">
                  <input
                    type="checkbox"
                    className="data-table__checkbox"
                    aria-label="Select all on this page"
                    checked={
                      pagedData.length > 0 &&
                      pagedData.every((row) => activeSelectedIds?.has(getRowId(row)))
                    }
                    onChange={() => togglePageAll(pagedData)}
                  />
                </th>
              )}
              {columns.map((col) => {
                const sortField = col.sortKey || col.key;
                return (
                  <th
                    key={col.key}
                    className={`data-table__th ${col.sortable ? "data-table__th--sortable" : ""} ${col.align ? `data-table__th--${col.align}` : ""}`}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => col.sortable && handleSort(sortField)}
                  >
                    <span className="data-table__th-content">
                      {col.label}
                      {col.sortable &&
                        activeSortKey === sortField &&
                        (activeSortDir === "asc" ? (
                          <ChevronUp size={13} />
                        ) : (
                          <ChevronDown size={13} />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={`skel-${i}`}
                    className="data-table__row data-table__row--skeleton"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="data-table__td">
                        <div className="data-table__skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              : pagedData.map((row, i) => {
                  const rowId = selectable ? getRowId(row) : null;
                  const isSelected = selectable && activeSelectedIds?.has(rowId);
                  return (
                  <tr
                    key={row.id || row._id || i}
                    className={`data-table__row ${onRowClick ? "data-table__row--clickable" : ""} ${disableRowInteraction ? "data-table__row--static" : ""} ${isSelected ? "data-table__row--selected" : ""}`}
                    onMouseEnter={() => onRowHover?.(row)}
                    onFocus={() => onRowFocus?.(row)}
                    onClickCapture={(e) => {
                      if (!disableRowInteraction) return;
                      const { target } = e;
                      if (!(target instanceof Element)) return;
                      if (target.closest("[data-action-cell], [data-action-portal='true']")) return;
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      if (disableRowInteraction) return;
                      if (!onRowClick) return;

                      const { target } = e;
                      if (!(target instanceof Element)) {
                        onRowClick(row);
                        return;
                      }

                      // Checkbox clicks toggle selection; never open the detail drawer
                      if (target.closest("[data-table-checkbox]")) return;
                      // Don't fire row click if the event came from an action cell
                      if (target.closest("[data-action-cell]")) return;
                      onRowClick(row);
                    }}
                  >
                    {selectable && (
                      <td className="data-table__td data-table__td--checkbox" data-table-checkbox>
                        <input
                          type="checkbox"
                          className="data-table__checkbox"
                          aria-label={`Select row ${rowId}`}
                          checked={isSelected}
                          onChange={() => toggleRow(row)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`data-table__td ${col.align ? `data-table__td--${col.align}` : ""}`}
                        {...(col.align === "right"
                          ? { "data-action-cell": "true" }
                          : {})}
                      >
                        {col.render ? col.render(row) : (row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                  );
                })}
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
