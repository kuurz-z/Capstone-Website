export default function ReservationStatsBar({
  statItems,
  activeFilter,
  onFilterChange,
}) {
  return (
    <div className="ar-stats">
      {statItems.map((s) => (
        <button
          key={s.key}
          className={`ar-stat ${s.cls} ${activeFilter === s.key ? "active" : ""}`}
          onClick={() => onFilterChange(activeFilter === s.key ? "all" : s.key)}
        >
          <span className="ar-stat-count">{s.count}</span>
          <span className="ar-stat-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
