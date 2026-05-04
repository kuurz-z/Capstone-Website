import { useState, useCallback } from "react";

/**
 * ElasticSlider — a styled range slider with left/right icon buttons.
 * Used by FilterPanel.jsx for the price range filter.
 */
function ElasticSlider({
 defaultValue = 5000,
 startingValue = 0,
 maxValue = 15000,
 isStepped = false,
 stepSize = 100,
 leftIcon,
 rightIcon,
 onChange,
}) {
 const [value, setValue] = useState(defaultValue);

 const step = isStepped ? stepSize : 1;

 const handleChange = useCallback(
 (e) => {
 const v = Number(e.target.value);
 setValue(v);
 if (onChange) onChange(v);
 },
 [onChange]
 );

 const decrement = () => {
 const next = Math.max(startingValue, value - step);
 setValue(next);
 if (onChange) onChange(next);
 };

 const increment = () => {
 const next = Math.min(maxValue, value + step);
 setValue(next);
 if (onChange) onChange(next);
 };

 const percent = ((value - startingValue) / (maxValue - startingValue)) * 100;

 return (
 <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
 {/* Value Display */}
 <div style={{ fontSize: "22px", fontWeight: "700", color: "#FF8C42" }}>
 ₱{value.toLocaleString()}
 </div>

 {/* Slider Row */}
 <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
 {leftIcon && (
 <button
 type="button"
 onClick={decrement}
 style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}
 >
 {leftIcon}
 </button>
 )}

 <div style={{ flex: 1, position: "relative" }}>
 {/* Track fill */}
 <div
 style={{
 position: "absolute",
 top: "50%",
 left: 0,
 transform: "translateY(-50%)",
 height: "4px",
 width: `${percent}%`,
 backgroundColor: "#FF8C42",
 borderRadius: "2px",
 pointerEvents: "none",
 zIndex: 1,
 }}
 />
 <input
 type="range"
 min={startingValue}
 max={maxValue}
 step={step}
 value={value}
 onChange={handleChange}
 style={{
 width: "100%",
 accentColor: "#FF8C42",
 cursor: "pointer",
 position: "relative",
 zIndex: 2,
 background: "transparent",
 }}
 />
 </div>

 {rightIcon && (
 <button
 type="button"
 onClick={increment}
 style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex" }}
 >
 {rightIcon}
 </button>
 )}
 </div>

 {/* Min/Max labels */}
 <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "12px", color: "#9ca3af" }}>
 <span>₱{startingValue.toLocaleString()}</span>
 <span>₱{maxValue.toLocaleString()}</span>
 </div>
 </div>
 );
}

export default ElasticSlider;
