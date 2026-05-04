function renderOptions(options) {
 return options.map((option) => {
 if (typeof option === "string") {
 return (
 <option key={option} value={option}>
 {option}
 </option>
 );
 }

 return (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 );
 });
}

export default function AnalyticsToolbar({
 title,
 subtitle = null,
 range = null,
 branch = null,
 actions = null,
 compact = false,
}) {
 const sectionClassName = compact
 ? "analytics-toolbar analytics-toolbar--compact bg-card/80 backdrop-blur-md rounded-2xl border border-border/80 shadow-[0_2px_16px_-6px_rgba(15,23,42,0.06)] px-5 py-4 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
 : "analytics-toolbar bg-card/80 backdrop-blur-md rounded-2xl border border-border/80 shadow-[0_2px_16px_-6px_rgba(15,23,42,0.06)] px-7 py-5 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all";
 const titleClassName = compact
 ? "text-[1.15rem] font-bold text-foreground tracking-tight"
 : "text-[1.35rem] font-bold text-foreground tracking-tight";
 const subtitleClassName = compact
 ? "text-[0.78rem] text-muted-foreground font-medium"
 : "text-[0.85rem] text-muted-foreground font-medium";
 const controlsClassName = compact
 ? "flex flex-wrap items-center gap-2.5"
 : "flex flex-wrap items-center gap-3";
 const controlClassName = compact
 ? "flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground bg-card px-3.5 py-2 rounded-xl border border-border hover:border-blue-300 hover:shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer"
 : "flex items-center gap-2 text-[0.85rem] font-medium text-muted-foreground bg-card px-4 py-2.5 rounded-xl border border-border hover:border-blue-300 hover:shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer";
 const selectClassName = compact
 ? "bg-transparent border-none outline-none font-semibold text-foreground cursor-pointer min-w-[102px] w-full appearance-none"
 : "bg-transparent border-none outline-none font-semibold text-foreground cursor-pointer min-w-[110px] w-full appearance-none";
 const branchSelectClassName = compact
 ? "bg-transparent border-none outline-none font-semibold text-foreground cursor-pointer min-w-[118px] w-full appearance-none"
 : "bg-transparent border-none outline-none font-semibold text-foreground cursor-pointer min-w-[130px] w-full appearance-none";
 const actionsClassName = compact
 ? "flex items-center gap-2 border-l border-border pl-4 ml-1"
 : "flex items-center gap-2 border-l border-border pl-5 ml-2";

 return (
 <section className={sectionClassName}>
 <div className="analytics-toolbar__copy flex flex-col gap-1.5">
 <h2 className={titleClassName}>{title}</h2>
 {subtitle ? (
 <p className={subtitleClassName}>{subtitle}</p>
 ) : null}
 </div>

 <div className={`analytics-toolbar__controls ${controlsClassName}`}>
 {range ? (
 <label className={`analytics-toolbar__field ${controlClassName}`}>
 <span className="text-muted-foreground">Duration:</span>
 <select 
 value={range.value} 
 onChange={(event) => range.onChange?.(event.target.value)}
 className={`analytics-toolbar__select ${selectClassName}`}
 >
 {renderOptions(range.options || [])}
 </select>
 <span className="pointer-events-none w-4 h-4 ml-1 flex items-center justify-center text-muted-foreground">
 <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </span>
 </label>
 ) : null}

 {branch ? (
 <label className={`analytics-toolbar__field ${controlClassName}`}>
 <span className="text-muted-foreground">Branch:</span>
 <select 
 value={branch.value} 
 onChange={(event) => branch.onChange?.(event.target.value)}
 className={`analytics-toolbar__select analytics-toolbar__select--branch ${branchSelectClassName}`}
 >
 {renderOptions(branch.options || [])}
 </select>
 <span className="pointer-events-none w-4 h-4 ml-1 flex items-center justify-center text-muted-foreground">
 <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </span>
 </label>
 ) : null}

 {actions && (
 <div className={`analytics-toolbar__actions ${actionsClassName}`}>
 {actions}
 </div>
 )}
 </div>
 </section>
 );
}
