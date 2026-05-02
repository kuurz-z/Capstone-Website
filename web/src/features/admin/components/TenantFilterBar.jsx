import React, { useState, useRef, useEffect } from "react";
import { Search, Filter, X, SearchX, Calendar } from "lucide-react";
import "./TenantFilterBar.css";

/**
 * TenantFilterBar
 * Minimalist and professional filter bar replacing ActionBar for TenantsWorkspacePage.
 */
export default function TenantFilterBar({
 searchTerm, setSearchTerm,
 branchFilter, setBranchFilter, isOwner,
 leaseStatusFilter, setLeaseStatusFilter,
 paymentStatusFilter, setPaymentStatusFilter,
 stayStatusFilter, setStayStatusFilter,
 dateFrom, setDateFrom,
 dateTo, setDateTo,
 quickFilters, toggleQuickFilter, QUICK_FILTERS,
 resetFilters,
}) {
 const [isFiltersOpen, setIsFiltersOpen] = useState(false);
 const filterRef = useRef(null);

 // Close dropdown on click outside
 useEffect(() => {
 function handleClickOutside(event) {
 if (filterRef.current && !filterRef.current.contains(event.target)) {
 setIsFiltersOpen(false);
 }
 }
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 // Calculate active filter count
 const getActiveFilterCount = () => {
 let count = 0;
 if (branchFilter && branchFilter !== "all" && isOwner) count++;
 if (leaseStatusFilter !== "all") count++;
 if (paymentStatusFilter !== "all") count++;
 if (stayStatusFilter !== "all") count++;
 if (dateFrom || dateTo) count++;
 return count;
 };
 
 const filterCount = getActiveFilterCount();

 return (
 <div className="tenant-filter-bar">
 {/* Top Row: Search and Actions */}
 <div className="tenant-filter-bar__top">
 <div className="tenant-filter-bar__search">
 <Search size={15} className="tenant-filter-bar__icon" />
 <input
 type="text"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Search by name, contact, room, or bed..."
 className="tenant-filter-bar__input"
 />
 </div>

 <div className="tenant-filter-bar__actions" ref={filterRef}>
 <button 
 type="button" 
 className={`tenant-filter-bar__btn ${isFiltersOpen ? "active" : ""} ${filterCount > 0 ? "has-filters" : ""}`}
 onClick={() => setIsFiltersOpen(!isFiltersOpen)}
 >
 <Filter size={15} />
 Filters {filterCount > 0 && <span className="tenant-filter-bar__badge">{filterCount}</span>}
 </button>
 
 <button 
 type="button" 
 className="tenant-filter-bar__btn tenant-filter-bar__btn--ghost"
 onClick={resetFilters}
 >
 <SearchX size={15} />
 Reset
 </button>

 {/* Filter Dropdown */}
 {isFiltersOpen && (
 <div className="tenant-filter-dropdown">
 <div className="tenant-filter-dropdown__header">
 <div className="tenant-filter-dropdown__heading">
 <h4>Advanced Filters</h4>
 <p>Current-tenant workspace filters</p>
 </div>
 <button type="button" onClick={() => setIsFiltersOpen(false)} className="tenant-filter-dropdown__close" aria-label="Close filters">
 <X size={14} />
 </button>
 </div>
 
 <div className="tenant-filter-dropdown__content">
 {isOwner && (
 <div className="tenant-filter-group">
 <label>Branch</label>
 <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
 <option value="all">All Branches</option>
 <option value="gil-puyat">Gil Puyat</option>
 <option value="guadalupe">Guadalupe</option>
 </select>
 </div>
 )}
 
 <div className="tenant-filter-group">
 <label>Contract Status</label>
 <select value={leaseStatusFilter} onChange={(e) => setLeaseStatusFilter(e.target.value)}>
 <option value="all">All Contract Statuses</option>
 <option value="active">Active</option>
 <option value="expiring_soon">Expiring Soon</option>
 <option value="expired">Expired</option>
 </select>
 </div>

 <div className="tenant-filter-group">
 <label>Payment Status</label>
 <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
 <option value="all">All Payment Statuses</option>
 <option value="paid">Paid</option>
 <option value="partial">Partial</option>
 <option value="overdue">Overdue</option>
 </select>
 </div>

 <div className="tenant-filter-group">
 <label>Occupancy Status</label>
 <select value={stayStatusFilter} onChange={(e) => setStayStatusFilter(e.target.value)}>
 <option value="all">All Occupancy Statuses</option>
 <option value="active">Active</option>
 <option value="moving_out">Moving Out</option>
 </select>
 </div>

 <div className="tenant-filter-group tenant-filter-group--full">
 <label className="tenant-filter-group__date-label">
 <Calendar size={14} className="tenant-filter-group__date-icon" /> Contract End Date Range
 </label>
 <div className="tenant-filter-dates">
 <input
 type="date"
 value={dateFrom}
 onChange={(e) => setDateFrom(e.target.value)}
 title="Start Contract End Date"
 />
 <span>—</span>
 <input
 type="date"
 value={dateTo}
 onChange={(e) => setDateTo(e.target.value)}
 title="End Contract End Date"
 />
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Bottom Row: Quick Filters */}
 <div className="tenant-filter-bar__bottom">
 <span className="tenant-filter-bar__quick-label">Quick Views:</span>
 <div className="tenant-filter-bar__quick-filters">
 {QUICK_FILTERS.map((filter) => {
 const active = quickFilters.includes(filter.key);
 let colorClass = "";
 if (active) {
 if (filter.key === "overdue") colorClass = "tenant-quick-filter--danger";
 else if (filter.key === "expiring_soon" || filter.key === "needs_action") colorClass = "tenant-quick-filter--warning";
 else colorClass = "tenant-quick-filter--active";
 }
 
 return (
 <button
 key={filter.key}
 type="button"
 className={`tenant-quick-filter ${colorClass}`}
 onClick={() => toggleQuickFilter(filter.key)}
 >
 {filter.label}
 </button>
 );
 })}
 </div>
 </div>
 </div>
 );
} 
