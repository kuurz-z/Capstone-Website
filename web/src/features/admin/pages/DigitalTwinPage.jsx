import { useState, useMemo } from "react";
import { Wrench, DollarSign, Activity, AlertTriangle, X, ChevronRight, ChevronDown, AlertCircle, ShieldAlert } from "lucide-react";
import { useDigitalTwinSnapshot, useDigitalTwinRoomDetail } from "../../../shared/hooks/queries/useDigitalTwin";
import { PageShell, SummaryBar, StatusBadge } from "../components/shared";
import { formatBranch, formatRoomType } from "../utils/formatters";
import OccupancyTrackingPage from "./OccupancyTrackingPage";
import "../styles/design-tokens.css";
import "../styles/admin-digital-twin.css";

/* ── Health color helpers ── */
function healthColor(tier) {
  if (tier === "good") return "var(--status-success)";
  if (tier === "warning") return "var(--status-warning)";
  return "var(--status-error)";
}

function bedStatusColor(status) {
  switch (status) {
    case "occupied": return "var(--status-success)";
    case "reserved": return "var(--accent-blue)";
    case "locked": return "var(--accent-orange)";
    case "maintenance": return "var(--status-error)";
    default: return "var(--border-default)";
  }
}

function bedStatusLabel(status) {
  switch (status) {
    case "occupied": return "Occupied";
    case "reserved": return "Reserved";
    case "locked": return "Locked";
    case "maintenance": return "Maintenance";
    default: return "Available";
  }
}

/* ── Room Card ── */
function RoomCard({ room, isSelected, onClick }) {
  const borderColor = healthColor(room.health.tier);
  const occupancyRate = room.capacity > 0
    ? Math.round((room.currentOccupancy / room.capacity) * 100)
    : 0;

  return (
    <button
      className={`dt-room-card ${isSelected ? "dt-room-card--selected" : ""}`}
      onClick={() => onClick(room)}
      style={{ "--health-color": borderColor }}
    >
      <div className="dt-room-card__header">
        <span className="dt-room-card__name">{room.name}</span>
        <span className="dt-room-card__type">{formatRoomType(room.type)}</span>
      </div>

      {/* Bed status dots */}
      <div className="dt-room-card__beds">
        {room.beds.map((bed) => (
          <span
            key={bed.id}
            className="dt-room-card__bed-dot"
            style={{ background: bedStatusColor(bed.status) }}
            title={`${bed.position} — ${bedStatusLabel(bed.status)}${bed.occupant ? ` (${bed.occupant.name})` : ""}`}
          />
        ))}
      </div>

      {/* Occupancy bar */}
      <div className="dt-room-card__occupancy">
        <div className="dt-room-card__bar">
          <div
            className="dt-room-card__bar-fill"
            style={{ width: `${occupancyRate}%` }}
          />
        </div>
        <span className="dt-room-card__occ-label">
          {room.currentOccupancy}/{room.capacity}
        </span>
      </div>

      {/* Bottom indicators */}
      <div className="dt-room-card__indicators">
        {room.maintenance.openCount > 0 && (
          <span className="dt-room-card__indicator dt-room-card__indicator--maint">
            <Wrench size={11} />
            {room.maintenance.openCount}
          </span>
        )}
        {room.billing.overdueCount > 0 && (
          <span className="dt-room-card__indicator dt-room-card__indicator--overdue">
            <DollarSign size={11} />
            {room.billing.overdueCount}
          </span>
        )}
        <span
          className="dt-room-card__health-badge"
          style={{ color: borderColor }}
        >
          {room.health.score}
        </span>
      </div>
    </button>
  );
}

/* ── Detail Drawer ── */
function RoomDetailDrawer({ roomId, onClose }) {
  const { data: detail, isLoading } = useDigitalTwinRoomDetail(roomId);

  if (!roomId) return null;

  return (
    <>
      <div className="dt-drawer__backdrop" onClick={onClose} />
      <aside className="dt-drawer">
        <div className="dt-drawer__header">
          <h2 className="dt-drawer__title">
            {isLoading ? "Loading…" : detail?.room?.name || "Room Detail"}
          </h2>
          <button className="dt-drawer__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="dt-drawer__body">
          {isLoading ? (
            <div className="dt-drawer__loading">Loading room data…</div>
          ) : detail ? (
            <>
              {/* Health Score */}
              <div className="dt-drawer__section">
                <span className="dt-drawer__section-label">Health Score</span>
                <div className="dt-health-gauge">
                  <div
                    className="dt-health-gauge__ring"
                    style={{
                      "--score": detail.health.score,
                      "--color": healthColor(detail.health.tier),
                    }}
                  >
                    <span className="dt-health-gauge__value">
                      {detail.health.score}
                    </span>
                  </div>
                  <div className="dt-health-gauge__breakdown">
                    <span>Open maintenance: {detail.health.breakdown.openMaintenance}</span>
                    <span>High urgency: {detail.health.breakdown.highUrgency}</span>
                    <span>Overdue bills: {detail.health.breakdown.overdueBills}</span>
                  </div>
                </div>
              </div>

              {/* Room Info */}
              <div className="dt-drawer__section">
                <span className="dt-drawer__section-label">Room Info</span>
                <div className="dt-drawer__row">
                  <span className="dt-drawer__row-label">Type</span>
                  <span className="dt-drawer__row-value">{formatRoomType(detail.room.type)}</span>
                </div>
                <div className="dt-drawer__row">
                  <span className="dt-drawer__row-label">Branch</span>
                  <span className="dt-drawer__row-value">{formatBranch(detail.room.branch)}</span>
                </div>
                <div className="dt-drawer__row">
                  <span className="dt-drawer__row-label">Floor</span>
                  <span className="dt-drawer__row-value">{detail.room.floor}</span>
                </div>
                <div className="dt-drawer__row">
                  <span className="dt-drawer__row-label">Occupancy</span>
                  <span className="dt-drawer__row-value">
                    {detail.room.currentOccupancy} / {detail.room.capacity}
                  </span>
                </div>
              </div>

              {/* Beds / Occupants */}
              <div className="dt-drawer__section">
                <span className="dt-drawer__section-label">Bed Occupancy</span>
                {detail.beds.map((bed) => (
                  <div key={bed.id} className="dt-bed-row">
                    <span
                      className="dt-bed-row__dot"
                      style={{ background: bedStatusColor(bed.status) }}
                    />
                    <div className="dt-bed-row__info">
                      <span className="dt-bed-row__position">
                        {bed.position.charAt(0).toUpperCase() + bed.position.slice(1)} {bed.id?.split("-").pop() || ""}
                      </span>
                      {bed.occupant ? (
                        <span className="dt-bed-row__tenant">
                          {bed.occupant.name}
                          {bed.occupant.since && (
                            <span className="dt-bed-row__since">
                              since {new Date(bed.occupant.since).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="dt-bed-row__vacant">{bedStatusLabel(bed.status)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Maintenance */}
              {detail.maintenance.length > 0 && (
                <div className="dt-drawer__section">
                  <span className="dt-drawer__section-label">
                    Maintenance ({detail.maintenance.length})
                  </span>
                  {detail.maintenance.slice(0, 8).map((m) => (
                    <div key={m._id} className="dt-maint-row">
                      <div className="dt-maint-row__header">
                        <span className="dt-maint-row__title">{m.title}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="dt-maint-row__meta">
                        <span className="dt-maint-row__cat">{m.category}</span>
                        <span className={`dt-maint-row__urgency dt-maint-row__urgency--${m.urgency}`}>
                          {m.urgency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Billing */}
              {detail.billing.length > 0 && (
                <div className="dt-drawer__section">
                  <span className="dt-drawer__section-label">Billing Status</span>
                  {detail.billing.map((tb, i) => (
                    <div key={i} className="dt-billing-group">
                      <span className="dt-billing-group__name">{tb.tenantName}</span>
                      {tb.bills.slice(0, 4).map((bill) => (
                        <div key={bill._id} className="dt-billing-row">
                          <span className="dt-billing-row__month">
                            {new Date(bill.billingMonth).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}
                          </span>
                          <span className="dt-billing-row__amount">
                            ₱{bill.totalAmount?.toLocaleString()}
                          </span>
                          <StatusBadge status={bill.status} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="dt-drawer__loading">No data available</div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ── Main Page ── */
export default function DigitalTwinPage() {
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [activeTab, setActiveTab] = useState("map");
  const [searchTerm, setSearchTerm] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const branch = branchFilter === "all" ? null : branchFilter;
  const { data: snapshot, isLoading, isError } = useDigitalTwinSnapshot(branch);
  const rooms = snapshot?.rooms || [];
  const kpis = snapshot?.kpis || {};

  // Filter rooms based on search + pill filters
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      // Search
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          room.name?.toLowerCase().includes(q) ||
          room.roomNumber?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      // Health tier
      if (healthFilter !== "all" && room.health?.tier !== healthFilter) return false;
      // Occupancy status
      if (occupancyFilter === "full" && room.currentOccupancy < room.capacity) return false;
      if (occupancyFilter === "partial" && (room.currentOccupancy === 0 || room.currentOccupancy >= room.capacity)) return false;
      if (occupancyFilter === "empty" && room.currentOccupancy > 0) return false;
      // Room type
      if (typeFilter !== "all" && room.type !== typeFilter) return false;
      return true;
    });
  }, [rooms, searchTerm, healthFilter, occupancyFilter, typeFilter]);

  // Group filtered rooms by floor
  const roomsByFloor = useMemo(() => {
    const groups = {};
    for (const room of filteredRooms) {
      const floorKey = room.floor || 1;
      if (!groups[floorKey]) groups[floorKey] = [];
      groups[floorKey].push(room);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([floor, rooms]) => ({ floor: Number(floor), rooms }));
  }, [filteredRooms]);

  // KPI summary items
  const summaryItems = useMemo(() => [
    { label: "Overall Health", value: `${kpis.overallHealth || 0}/100`, color: "green" },
    { label: "Rooms At Risk", value: kpis.atRiskRooms || 0, color: "red" },
    { label: "Occupancy", value: `${kpis.occupancyRate || 0}%`, color: "blue" },
    { label: "Open Maintenance", value: kpis.openMaintenance || 0, color: "orange" },
    {
      label: "Revenue Due",
      value: `₱${(kpis.totalOwed || 0).toLocaleString()}`,
      color: "purple",
    },
  ], [kpis]);

  // Active filter count for badge
  const activeFilterCount = [healthFilter, occupancyFilter, typeFilter].filter((f) => f !== "all").length;

  // ── Alert Ribbon: derive alerts from snapshot data ──
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const alerts = useMemo(() => {
    const result = [];
    for (const room of rooms) {
      if (room.health?.tier === "critical") {
        result.push({
          id: `health-${room._id}`,
          roomId: room._id,
          severity: "critical",
          icon: ShieldAlert,
          message: `${room.name} is critical (health score: ${room.health.score})`,
        });
      }
      if (room.billing?.overdueCount > 0) {
        result.push({
          id: `overdue-${room._id}`,
          roomId: room._id,
          severity: "warning",
          icon: DollarSign,
          message: `${room.name} has ${room.billing.overdueCount} overdue bill${room.billing.overdueCount > 1 ? "s" : ""}`,
        });
      }
      if (room.maintenance?.highUrgencyCount > 0) {
        result.push({
          id: `maint-${room._id}`,
          roomId: room._id,
          severity: "warning",
          icon: Wrench,
          message: `${room.name} has ${room.maintenance.highUrgencyCount} high-urgency maintenance request${room.maintenance.highUrgencyCount > 1 ? "s" : ""}`,
        });
      }
      if (room.currentOccupancy > 0 && room.currentOccupancy >= room.capacity) {
        result.push({
          id: `full-${room._id}`,
          roomId: room._id,
          severity: "info",
          icon: AlertCircle,
          message: `${room.name} is at full capacity`,
        });
      }
    }
    // Sort: critical first, then warning, then info
    const order = { critical: 0, warning: 1, info: 2 };
    result.sort((a, b) => order[a.severity] - order[b.severity]);
    return result;
  }, [rooms]);

  const visibleAlerts = alertsExpanded ? alerts : alerts.slice(0, 5);

  return (
    <>
      <PageShell>
        <PageShell.Summary>
          {isError && (
            <div className="dash-error">Failed to load some digital twin data.</div>
          )}
          <SummaryBar items={summaryItems} />
        </PageShell.Summary>

        <PageShell.Content>
          {/* Alert Ribbon */}
          {alerts.length > 0 && activeTab === "map" && (
            <div className="dt-alert-ribbon">
              <button
                className="dt-alert-ribbon__toggle"
                onClick={() => setAlertsExpanded(!alertsExpanded)}
              >
                <AlertTriangle size={14} />
                <span className="dt-alert-ribbon__count">{alerts.length} Alert{alerts.length !== 1 ? "s" : ""}</span>
                {alertsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {alertsExpanded && (
                <div className="dt-alert-ribbon__list">
                  {visibleAlerts.map((alert) => {
                    const Icon = alert.icon;
                    return (
                      <div key={alert.id} className={`dt-alert-item dt-alert-item--${alert.severity}`}>
                        <Icon size={13} className="dt-alert-item__icon" />
                        <span className="dt-alert-item__msg">{alert.message}</span>
                        <button
                          className="dt-alert-item__view"
                          onClick={() => { setSelectedRoomId(alert.roomId); setActiveTab("map"); }}
                        >
                          View
                        </button>
                      </div>
                    );
                  })}
                  {alerts.length > 5 && !alertsExpanded && (
                    <button className="dt-alert-ribbon__more" onClick={() => setAlertsExpanded(true)}>
                      Show all {alerts.length} alerts
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* View tabs */}
          <div className="dt-view-tabs">
            <button
              className={`dt-view-tab ${activeTab === "map" ? "dt-view-tab--active" : ""}`}
              onClick={() => setActiveTab("map")}
            >
              Visual Map
            </button>
            <button
              className={`dt-view-tab ${activeTab === "occupancy" ? "dt-view-tab--active" : ""}`}
              onClick={() => setActiveTab("occupancy")}
            >
              Occupancy
            </button>
          </div>

          {activeTab === "occupancy" ? (
            <OccupancyTrackingPage isEmbedded={true} />
          ) : (
            <>
              {/* Branch tabs + search + filters toolbar */}
              <div className="dt-toolbar">
                <div className="dt-branch-tabs">
                  {["all", "gil-puyat", "guadalupe"].map((b) => (
                    <button
                      key={b}
                      className={`dt-branch-tab ${branchFilter === b ? "dt-branch-tab--active" : ""}`}
                      onClick={() => setBranchFilter(b)}
                    >
                      {b === "all" ? "All Branches" : formatBranch(b)}
                    </button>
                  ))}
                </div>

                <div className="dt-search">
                  <input
                    type="text"
                    className="dt-search__input"
                    placeholder="Search rooms…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Pill filters */}
              <div className="dt-filters">
                <div className="dt-filter-group">
                  <span className="dt-filter-label">Health:</span>
                  {[
                    { value: "all", label: "All" },
                    { value: "good", label: "Healthy" },
                    { value: "warning", label: "Warning" },
                    { value: "critical", label: "Critical" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`dt-filter-pill ${healthFilter === opt.value ? "dt-filter-pill--active" : ""}`}
                      onClick={() => setHealthFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="dt-filter-group">
                  <span className="dt-filter-label">Occupancy:</span>
                  {[
                    { value: "all", label: "All" },
                    { value: "full", label: "Full" },
                    { value: "partial", label: "Partial" },
                    { value: "empty", label: "Empty" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`dt-filter-pill ${occupancyFilter === opt.value ? "dt-filter-pill--active" : ""}`}
                      onClick={() => setOccupancyFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="dt-filter-group">
                  <span className="dt-filter-label">Type:</span>
                  {[
                    { value: "all", label: "All" },
                    { value: "private", label: "Private" },
                    { value: "double-sharing", label: "Double" },
                    { value: "quadruple-sharing", label: "Quad" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`dt-filter-pill ${typeFilter === opt.value ? "dt-filter-pill--active" : ""}`}
                      onClick={() => setTypeFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    className="dt-filter-clear"
                    onClick={() => { setHealthFilter("all"); setOccupancyFilter("all"); setTypeFilter("all"); setSearchTerm(""); }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="dt-loading">Loading digital twin data…</div>
              ) : filteredRooms.length === 0 ? (
                <div className="dt-empty">
                  <Activity size={36} strokeWidth={1.5} />
                  <p>{rooms.length > 0 ? "No rooms match your filters." : "No rooms found for this branch."}</p>
                </div>
              ) : (
                <>
                  {/* Legend */}
                  <div className="dt-legend">
                    <span className="dt-legend__title">Bed Status:</span>
                    <span className="dt-legend__item">
                      <span className="dt-legend__dot" style={{ background: "var(--status-success)" }} /> Occupied
                    </span>
                    <span className="dt-legend__item">
                      <span className="dt-legend__dot" style={{ background: "var(--accent-blue)" }} /> Reserved
                    </span>
                    <span className="dt-legend__item">
                      <span className="dt-legend__dot" style={{ background: "var(--border-default)" }} /> Available
                    </span>
                    <span className="dt-legend__item">
                      <span className="dt-legend__dot" style={{ background: "var(--status-error)" }} /> Maintenance
                    </span>
                  </div>

                  {/* Room grid grouped by floor */}
                  {roomsByFloor.map(({ floor, rooms: floorRooms }) => (
                    <div key={floor} className="dt-floor-group">
                      <h3 className="dt-floor-label">Floor {floor} <span className="dt-floor-count">({floorRooms.length} room{floorRooms.length !== 1 ? "s" : ""})</span></h3>
                      <div className="dt-room-grid">
                        {floorRooms.map((room) => (
                          <RoomCard
                            key={room._id}
                            room={room}
                            isSelected={selectedRoomId === room._id}
                            onClick={(r) => setSelectedRoomId(r._id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </PageShell.Content>
      </PageShell>

      {/* Detail Drawer — must be outside PageShell (slot-based rendering) */}
      {selectedRoomId && (
        <RoomDetailDrawer
          roomId={selectedRoomId}
          onClose={() => setSelectedRoomId(null)}
        />
      )}
    </>
  );
}
