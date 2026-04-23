export default function ReportChartPanel({
  title,
  subtitle = null,
  actions = null,
  children,
}) {
  return (
    <section className="report-chart-panel bg-white rounded-[1.25rem] border border-slate-200/80 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col h-full hover:shadow-[0_8px_32px_-12px_rgba(15,23,42,0.1)] transition-all duration-300">
      <header className="report-chart-panel__header px-6 py-5 border-b border-slate-100 flex justify-between items-center gap-4">
        <div className="report-chart-panel__copy flex-1">
          <h2 className="report-chart-panel__title text-base font-semibold text-slate-800 tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="report-chart-panel__subtitle text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="report-chart-panel__actions flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="report-chart-panel__body p-6 flex-1 min-h-[160px] flex flex-col justify-center relative">
        {children}
      </div>
    </section>
  );
}
