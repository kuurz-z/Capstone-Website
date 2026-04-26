import "./AnalyticsInsightPanel.css";

function SectionList({ title, items }) {
  return (
    <section className="analytics-insight-panel__section">
      <h4 className="analytics-insight-panel__section-title">{title}</h4>
      {items?.length ? (
        <ul className="analytics-insight-panel__list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="admin-reports__hint">No items highlighted for this section.</p>
      )}
    </section>
  );
}

export default function AnalyticsInsightPanel({
  title = "AI Summary",
  subtitle = "Simple AI explanation based on this report",
  data,
  isLoading,
  isError,
}) {
  if (isLoading) {
    return (
      <div className="analytics-insight-panel__state">
        Preparing a simple AI summary for this report...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="analytics-insight-panel__state">
        AI summary is unavailable right now. The charts and tables below still show the actual report data.
      </div>
    );
  }

  const insight = data?.insight;
  if (!insight) {
    return (
      <div className="analytics-insight-panel__state">
        No AI summary is available for this report yet.
      </div>
    );
  }

  return (
    <div className="analytics-insight-panel">
      <div className="analytics-insight-panel__banner">
        <span className="analytics-insight-panel__eyebrow">{title}</span>
        <h3 className="analytics-insight-panel__headline">{insight.headline}</h3>
        <p className="analytics-insight-panel__summary">{insight.summary}</p>
        <div className="analytics-insight-panel__meta">
          <span className="analytics-insight-panel__pill">
            {subtitle}
          </span>
          <span className="analytics-insight-panel__pill">
            How sure: {insight.confidence || "low"}
          </span>
        </div>
      </div>

      <div className="analytics-insight-panel__grid">
        <SectionList title="What Stands Out" items={insight.keyFindings} />
        <SectionList title="Things To Watch" items={insight.anomalies} />
        <SectionList title="What To Do Next" items={insight.recommendedActions} />
      </div>

      <p className="admin-reports__hint">{insight.disclaimer}</p>
    </div>
  );
}
