import React from "react";
import "../styles/bed-selector.css";

/**
 * Visual Bed Selector — minimalist double-deck bunk bed layout.
 */
const BedSelector = ({ beds = [], selectedBed, onSelect, readOnly = false }) => {
  if (!beds.length) return null;

  const upperBeds = beds.filter((b) => b.position === "upper");
  const lowerBeds = beds.filter((b) => b.position === "lower");
  const singleBeds = beds.filter((b) => b.position === "single");

  const bunkUnits = [];
  const maxBunks = Math.max(upperBeds.length, lowerBeds.length);
  for (let i = 0; i < maxBunks; i++) {
    bunkUnits.push({ upper: upperBeds[i] || null, lower: lowerBeds[i] || null });
  }

  const getStatus = (bed) => {
    if (!bed) return "empty";
    return bed.status || (bed.available === false ? "occupied" : "available");
  };

  const isSelectable = (bed) => !readOnly && bed && getStatus(bed) === "available";
  const isSelected = (bed) => bed && selectedBed?.id === bed.id;

  const handleClick = (bed) => {
    if (!isSelectable(bed)) return;
    onSelect?.({ id: bed.id, position: bed.position });
  };

  const renderBed = (bed, label) => {
    if (!bed) return null;
    const status = getStatus(bed);
    const selected = isSelected(bed);
    const selectable = isSelectable(bed);

    return (
      <div
        className={`bs-bed bs-${status} ${selected ? "bs-selected" : ""} ${selectable ? "bs-clickable" : ""}`}
        onClick={() => handleClick(bed)}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        onKeyDown={(e) => {
          if (selectable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleClick(bed);
          }
        }}
      >
        <div className="bs-bed-content">
          <div className="bs-bed-left">
            <div className={`bs-dot bs-dot-${status}`} />
            <div>
              <div className="bs-label">{label}</div>
              <div className="bs-id">{bed.id}</div>
            </div>
          </div>
          <div className="bs-badge">
            {selected ? "✓ Selected" : status === "occupied" ? "Occupied" : status === "maintenance" ? "Locked" : "Available"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bed-selector">
      <div className="bs-header">
        <h4 className="bs-title">Select Your Bed</h4>
        <div className="bs-legend">
          <span className="bs-legend-item"><span className="bs-legend-dot bs-legend-avail" />Available</span>
          <span className="bs-legend-item"><span className="bs-legend-dot bs-legend-occ" />Occupied</span>
          <span className="bs-legend-item"><span className="bs-legend-dot bs-legend-maint" />Maintenance</span>
        </div>
      </div>

      <div className="bs-bunks">
        {bunkUnits.map((bunk, i) => (
          <div key={`bunk-${i}`} className="bs-frame">
            <div className="bs-frame-label">Bunk {i + 1}</div>
            <div className="bs-tier">
              {renderBed(bunk.upper, "Upper")}
            </div>
            <div className="bs-divider" />
            <div className="bs-tier">
              {renderBed(bunk.lower, "Lower")}
            </div>
          </div>
        ))}

        {singleBeds.map((bed) => (
          <div key={bed.id} className="bs-frame bs-frame-single">
            <div className="bs-tier">
              {renderBed(bed, "Single")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BedSelector;
