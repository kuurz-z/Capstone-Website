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
}) {
  return (
    <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-6px_rgba(15,23,42,0.06)] px-7 py-5 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[1.35rem] font-bold text-slate-900 tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-[0.85rem] text-slate-500 font-medium">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {range ? (
          <label className="flex items-center gap-2 text-[0.85rem] font-medium text-slate-600 bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer">
            <span className="text-slate-400">Duration:</span>
            <select 
              value={range.value} 
              onChange={(event) => range.onChange?.(event.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-slate-800 cursor-pointer min-w-[110px] w-full appearance-none"
            >
              {renderOptions(range.options || [])}
            </select>
            <span className="pointer-events-none w-4 h-4 ml-1 flex items-center justify-center text-slate-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </label>
        ) : null}

        {branch ? (
          <label className="flex items-center gap-2 text-[0.85rem] font-medium text-slate-600 bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer">
            <span className="text-slate-400">Branch:</span>
            <select 
              value={branch.value} 
              onChange={(event) => branch.onChange?.(event.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-slate-800 cursor-pointer min-w-[130px] w-full appearance-none"
            >
              {renderOptions(branch.options || [])}
            </select>
            <span className="pointer-events-none w-4 h-4 ml-1 flex items-center justify-center text-slate-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </label>
        ) : null}

        {actions && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-5 ml-2">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
