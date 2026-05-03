import "./BillingShared.css";
import { getRoomLabel } from "../../../../../shared/utils/roomLabel.js";

export default function BillingRoomList({
  title,
  rooms,
  selectedRoomId,
  onSelectRoom,
  isLoading,
  emptyMessage,
  isOwner = false,
  branchFilter = "",
  onBranchFilterChange,
  branchOptions = [],
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search rooms...",
  noSearchResultsMessage = "No rooms match your search.",
  loadingMessage = "Loading rooms...",
  loadingCount = 5,
  getRoomName = (room) => getRoomLabel(room),
  getBadge,
  getMeta = () => [],
  getItemClassName,
}) {
  const emptyMessageText = searchValue.trim() ? noSearchResultsMessage : emptyMessage;

  return (
    <div className="billing-room-list">
      <div className="billing-room-list__header">
        <div className="billing-room-list__title">{title}</div>
        {isOwner && onBranchFilterChange ? (
          <select
            className="billing-room-list__filter"
            value={branchFilter}
            onChange={(event) => onBranchFilterChange(event.target.value)}
          >
            {branchOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {onSearchChange ? (
        <div className="billing-room-list__search-wrap">
          <input
            type="text"
            className="billing-room-list__search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}

      <div className="billing-room-list__body">
        {isLoading ? (
          <div className="billing-room-list__skeleton-list">
            {Array.from({ length: loadingCount }, (_, index) => (
              <div key={index} className="billing-room-list__skeleton-card" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="billing-room-list__empty">{emptyMessageText}</div>
        ) : (
          rooms.map((room) => {
            const badge = getBadge?.(room);
            const meta = getMeta(room).filter(Boolean);

            return (
              <button
                key={room.id}
                type="button"
                className={`billing-room-card${selectedRoomId === room.id ? " is-active" : ""}${getItemClassName ? ` ${getItemClassName(room)}` : ""}`.trim()}
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="billing-room-card__top">
                  <span className="billing-room-card__name">{getRoomName(room)}</span>
                  {badge ? <span className="billing-room-card__badge">{badge}</span> : null}
                </div>
                {meta.map((line) => (
                  <div key={line} className="billing-room-card__meta">
                    {line}
                  </div>
                ))}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
