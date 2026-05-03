import React, { useEffect, useRef, useState } from "react";
import { Calendar, Filter, Search, SearchX, X } from "lucide-react";
import "./TenantFilterBarOptimized.css";

export default function TenantFilterBarOptimized({
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setIsFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filterCount = [
    isOwner && branchFilter !== "all",
    leaseStatusFilter !== "all",
    paymentStatusFilter !== "all",
    stayStatusFilter !== "all",
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length;

  return (
    <div className="tenant-filter-bar-v2">
      <div className="tenant-filter-bar-v2__top">
        <div className="tenant-filter-bar-v2__search">
          <Search size={15} className="tenant-filter-bar-v2__icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, contact, room, or bed..."
            className="tenant-filter-bar-v2__input"
          />
        </div>

        <div className="tenant-filter-bar-v2__actions" ref={filterRef}>
          <button
            type="button"
            className={`tenant-filter-bar-v2__btn ${isFiltersOpen ? "is-active" : ""}`}
            onClick={() => setIsFiltersOpen((open) => !open)}
          >
            <Filter size={15} />
            <span>Filters</span>
            {filterCount > 0 ? (
              <span className="tenant-filter-bar-v2__badge">{filterCount}</span>
            ) : null}
          </button>

          <button
            type="button"
            className="tenant-filter-bar-v2__btn tenant-filter-bar-v2__btn--ghost"
            onClick={resetFilters}
          >
            <SearchX size={15} />
            <span>Reset</span>
          </button>

          {isFiltersOpen ? (
            <div className="tenant-filter-panel">
              <div className="tenant-filter-panel__header">
                <div className="tenant-filter-panel__title">
                  <h4>Advanced Filters</h4>
                  <p>Current-tenant workspace filters</p>
                </div>
                <button
                  type="button"
                  className="tenant-filter-panel__close"
                  onClick={() => setIsFiltersOpen(false)}
                  aria-label="Close filters"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="tenant-filter-panel__content">
                {isOwner ? (
                  <div className="tenant-filter-field">
                    <label>Branch</label>
                    <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                      <option value="all">All Branches</option>
                      <option value="gil-puyat">Gil Puyat</option>
                      <option value="guadalupe">Guadalupe</option>
                    </select>
                  </div>
                ) : null}

                <div className="tenant-filter-field">
                  <label>Contract Status</label>
                  <select value={leaseStatusFilter} onChange={(event) => setLeaseStatusFilter(event.target.value)}>
                    <option value="all">All Contract Statuses</option>
                    <option value="active">Active</option>
                    <option value="expiring_soon">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div className="tenant-filter-field">
                  <label>Payment Status</label>
                  <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)}>
                    <option value="all">All Payment Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                <div className="tenant-filter-field">
                  <label>Occupancy Status</label>
                  <select value={stayStatusFilter} onChange={(event) => setStayStatusFilter(event.target.value)}>
                    <option value="all">All Occupancy Statuses</option>
                    <option value="active">Active</option>
                    <option value="moving_out">Moving Out</option>
                  </select>
                </div>

                <div className="tenant-filter-field tenant-filter-field--full">
                  <div className="tenant-filter-field__header">
                    <label className="tenant-filter-field__date-label">
                      <Calendar size={14} />
                      <span>Contract End Date</span>
                    </label>
                    {dateFrom || dateTo ? (
                      <button
                        type="button"
                        className="tenant-filter-field__clear"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <div className="tenant-filter-field__dates">
                    <div className="tenant-filter-field__date-col">
                      <span>From</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(event) => setDateFrom(event.target.value)}
                        aria-label="Contract end date from"
                      />
                    </div>
                    <div className="tenant-filter-field__date-col">
                      <span>To</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(event) => setDateTo(event.target.value)}
                        aria-label="Contract end date to"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="tenant-filter-bar-v2__bottom">
        <span className="tenant-filter-bar-v2__quick-label">Quick Views:</span>
        <div className="tenant-filter-bar-v2__quick-filters">
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
