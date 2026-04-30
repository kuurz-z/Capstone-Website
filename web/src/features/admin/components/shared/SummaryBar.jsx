const COLOR_CLASSES = {
 blue: {
 value: "text-foreground",
 icon: "text-blue-600",
 },
 green: {
 value: "text-foreground",
 icon: "text-emerald-600",
 },
 orange: {
 value: "text-foreground",
 icon: "text-amber-500",
 },
 red: {
 value: "text-foreground",
 icon: "text-rose-500",
 },
 purple: {
 value: "text-foreground",
 icon: "text-violet-600",
 },
 neutral: {
 value: "text-foreground",
 icon: "text-muted-foreground",
 },
};

/**
 * SummaryBar — A row of metric cards with icon, value, and label.
 *
 * items: [{
 * label,
 * value,
 * icon?, // Lucide component
 * color?, // "blue" | "green" | "orange" | "red" | "purple" | "neutral"
 * highlighted?, // true = solid blue active card (for "Total")
 * trend?, // small subtext
 * }]
 *
 * onItemClick?(index) — called when a card is clicked
 * activeIndex? — index of the currently active/filtered card (-1 or null = none)
 */
export default function SummaryBar({ items = [], onItemClick, activeIndex }) {
 return (
 <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8" role="list">
 {items.map((item, i) => {
 const palette = COLOR_CLASSES[item.color || "neutral"] || COLOR_CLASSES.neutral;
 const Icon = item.icon;
 return (
 <div
 key={i}
 className={`flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 ${onItemClick ? "cursor-pointer" : ""} ${activeIndex === i ? "ring-2 ring-border" : ""}`}
 role="listitem"
 onClick={() => onItemClick?.(activeIndex === i ? -1 : i)}
 >
 {Icon && (
 <div className={`flex h-7 w-7 items-center justify-center ${palette.icon}`}>
 <Icon size={16} />
 </div>
 )}
 <div>
 <div className={`text-[22px] font-semibold leading-tight ${palette.value}`}>
 {item.value ?? "—"}
 </div>
 <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
 {item.label}
 </div>
 {item.trend && (
 <div className="mt-1 text-xs text-muted-foreground">{item.trend}</div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 );
}
