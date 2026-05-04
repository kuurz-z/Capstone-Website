export default function ReservationToolbar({
  searchTerm,
  branchFilter,
  sortBy,
  onSearchChange,
  onBranchChange,
  onSortChange,
}) {
  return (
    <div className="ar-toolbar">
      <input
        className="ar-search"
        type="text"
        placeholder="Search by name, email, code, or room..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="ar-select"
        value={branchFilter}
        onChange={(e) => onBranchChange(e.target.value)}
      >
        <option value="all">All Branches</option>
        <option value="gil puyat">Gil Puyat</option>
        <option value="guadalupe">Guadalupe</option>
      </select>
      <select
        className="ar-select"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
      >
        <option value="recent">Most Recent</option>
        <option value="oldest">Oldest First</option>
        <option value="name-az">Name A–Z</option>
        <option value="name-za">Name Z–A</option>
      </select>
    </div>
  );
}
