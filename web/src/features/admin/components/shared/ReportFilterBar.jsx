import "./ReportFilterBar.css";

export default function ReportFilterBar({
 title,
 subtitle = null,
 controls = null,
}) {
 return (
 <section className="report-filter-bar">
 <div>
 <h2 className="report-filter-bar__title">{title}</h2>
 {subtitle ? <p className="report-filter-bar__subtitle">{subtitle}</p> : null}
 </div>
 {controls ? <div className="report-filter-bar__controls">{controls}</div> : null}
 </section>
 );
}
