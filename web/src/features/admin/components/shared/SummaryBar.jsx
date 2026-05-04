const COLOR_CLASSES = {
  blue: {
    value: "text-foreground",
    icon: "text-blue-700 dark:text-blue-300",
    surface: "bg-blue-50/80 dark:bg-blue-950/35 border-blue-200 dark:border-blue-800/70",
    active: "border-blue-500 dark:border-blue-400 ring-2 ring-inset ring-blue-500/80 dark:ring-blue-400/80",
  },
  green: {
    value: "text-foreground",
    icon: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/70",
    active: "border-emerald-500 dark:border-emerald-400 ring-2 ring-inset ring-emerald-500/80 dark:ring-emerald-400/80",
  },
  orange: {
    value: "text-foreground",
    icon: "text-amber-700 dark:text-amber-300",
    surface: "bg-amber-50/80 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70",
    active: "border-amber-500 dark:border-amber-400 ring-2 ring-inset ring-amber-500/80 dark:ring-amber-400/80",
  },
  red: {
    value: "text-foreground",
    icon: "text-rose-700 dark:text-rose-300",
    surface: "bg-rose-50/80 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70",
    active: "border-rose-500 dark:border-rose-400 ring-2 ring-inset ring-rose-500/80 dark:ring-rose-400/80",
  },
  purple: {
    value: "text-foreground",
    icon: "text-violet-700 dark:text-violet-300",
    surface: "bg-violet-50/80 dark:bg-violet-950/35 border-violet-200 dark:border-violet-800/70",
    active: "border-violet-500 dark:border-violet-400 ring-2 ring-inset ring-violet-500/80 dark:ring-violet-400/80",
  },
  neutral: {
    value: "text-foreground",
    icon: "text-muted-foreground",
    surface: "bg-card border-border",
    active: "border-[var(--primary)] ring-2 ring-inset ring-[var(--primary)]/75",
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
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7" role="list">
        {items.map((item, i) => {
        const palette =
          COLOR_CLASSES[item.color || "neutral"] || COLOR_CLASSES.neutral;
        const Icon = item.icon;
        return (
          <div
            key={i}
            className={`flex min-h-[132px] flex-col gap-3 rounded-xl border px-4 py-4 transition-colors ${palette.surface} ${onItemClick ? "cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110" : ""} ${activeIndex === i ? palette.active : ""}`}
            role="listitem"
            onClick={() => onItemClick?.(activeIndex === i ? -1 : i)}
          >
            {Icon && (
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/60 ${palette.icon}`}
              >
                <Icon size={16} />
              </div>
            )}
            <div>
              <div
                className={`text-[22px] font-semibold leading-tight ${palette.value}`}
              >
                {item.value ?? "—"}
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </div>
              {item.trend && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.trend}
                </div>
              )}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
