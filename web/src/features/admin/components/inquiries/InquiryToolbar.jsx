export default function InquiryToolbar({
  searchTerm,
  statusFilter,
  onSearch,
  onFilterChange,
}) {
  return (
    <section className="admin-inquiries-tools">
      <div className="admin-inquiries-search">
        <span className="admin-inquiries-search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M20 20L17 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search by name, email, or branch..."
          className="admin-inquiries-search-input"
          value={searchTerm}
          onChange={onSearch}
        />
      </div>
      <select
        className="admin-inquiries-filter"
        value={statusFilter}
        onChange={onFilterChange}
      >
        <option value="">All</option>
        <option value="new">New</option>
        <option value="responded">Responded</option>
      </select>
    </section>
  );
}
