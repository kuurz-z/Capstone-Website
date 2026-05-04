import { useMemo, useState } from "react";
import {
 ChevronUp,
 ChevronDown,
 ChevronLeft,
 ChevronRight,
} from "lucide-react";
import EmptyState from "./EmptyState";

/**
 * DataTable — Sortable, paginated, clickable table.
 *
 * Props:
 * columns: [{ key, label, sortable?, render?, width?, align? }]
 * data: array of row objects
 * pagination: { page, pageSize, total, onPageChange }
 * onRowClick: (row) => void
 * emptyState: { icon?, title, description? }
 * loading: boolean
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
 <div className="flex flex-col gap-3">
 <div className="overflow-x-auto">
 <table className="w-full border-collapse">
 <thead>
 <tr>
 {columns.map((col) => {
 const sortField = col.sortKey || col.key;
 return (
 <th
 key={col.key}
 className={`border-b border-border bg-card px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground ${col.sortable ? "cursor-pointer hover:text-muted-foreground" : ""} ${col.align === "right" ? "text-right" : ""} ${col.align === "center" ? "text-center" : ""}`}
 style={col.width ? { width: col.width } : undefined}
 onClick={() => col.sortable && handleSort(sortField)}
 >
 <span className="inline-flex items-center gap-1">
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
 className="border-b border-border"
 >
 {columns.map((col) => (
 <td key={col.key} className="px-4 py-3">
 <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
 </td>
 ))}
 </tr>
 ))
 : pagedData.map((row, i) => (
 <tr
 key={row.id || row._id || i}
 className={`border-b border-border ${onRowClick ? "cursor-pointer hover:bg-muted" : ""} ${disableRowInteraction ? "cursor-default" : ""}`}
 onMouseEnter={() => onRowHover?.(row)}
 onFocus={() => onRowFocus?.(row)}
 onClickCapture={(e) => {
 if (!disableRowInteraction) return;
 const target = e.target;
 if (!(target instanceof Element)) return;
 if (target.closest("[data-action-cell], [data-action-portal='true']")) return;
 e.stopPropagation();
 }}
 onClick={(e) => {
 if (disableRowInteraction) return;
 if (!onRowClick) return;

 const target = e.target;
 if (!(target instanceof Element)) {
 onRowClick(row);
 return;
 }

 // Don't fire row click if the event came from an action cell
 if (target.closest("[data-action-cell]")) return;
 onRowClick(row);
 }}
 >
 {columns.map((col) => (
 <td
 key={col.key}
 className={`px-4 py-4 text-sm text-muted-foreground ${col.align === "right" ? "text-right" : ""} ${col.align === "center" ? "text-center" : ""}`}
 {...(col.align === "right"
 ? { "data-action-cell": "true" }
 : {})}
 >
 {col.render ? col.render(row) : (row[col.key] ?? "—")}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Pagination */}
 {pagination && pageCount > 1 && (
 <div className="flex items-center justify-between px-4 pb-4">
 <span className="text-sm text-muted-foreground">
 {total} result{total !== 1 ? "s" : ""}
 </span>
 <div className="flex items-center gap-2">
 <button
 className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
 disabled={currentPage <= 1}
 onClick={() => pagination.onPageChange(currentPage - 1)}
 >
 <ChevronLeft size={15} />
 </button>
 <span className="min-w-[56px] text-center text-sm font-medium text-muted-foreground">
 {currentPage} / {pageCount}
 </span>
 <button
 className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
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
