import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import "./AnalyticsInsightsHub.css";

function HubList({ icon: Icon, title, items, emptyText }) {
  return (
    <section className="analytics-insights-hub__section">
      <div className="analytics-insights-hub__section-header">
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      {items?.length ? (
        <ul className="analytics-insights-hub__list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="analytics-insights-hub__empty">{emptyText}</p>
      )}
    </section>
  );
}

export default function AnalyticsInsightsHub({
  data,
  isLoading,
  isError,
  title = "AI Insights Hub",
  heading = "Summary, risks, forecasts, and actions",
  loadingText = "Preparing consolidated report insights...",
  emptyText = "No consolidated AI insight is available for this scope yet.",
}) {
  const insight = data?.insight;
  const snapshotMeta = data?.snapshotMeta || {};
  const providerLabel = snapshotMeta.usedFallback
    ? "Fallback insight"
    : snapshotMeta.provider === "gemini"
      ? `Gemini${snapshotMeta.model ? ` ${snapshotMeta.model}` : ""}`
      : "AI insight";

  return (
    <section className="analytics-insights-hub" data-ai-insights-hub="true">
      <header className="analytics-insights-hub__header">
        <div className="analytics-insights-hub__title">
          <span className="analytics-insights-hub__eyebrow">
            <Sparkles size={14} />
            {title}
          </span>
          <h2>{heading}</h2>
        </div>
        <div className="analytics-insights-hub__meta">
          <span>{providerLabel}</span>
          {insight?.confidence ? <span>Confidence: {insight.confidence}</span> : null}
        </div>
      </header>

      {isLoading ? (
        <div className="analytics-insights-hub__state">
          {loadingText}
        </div>
      ) : isError ? (
        <div className="analytics-insights-hub__state analytics-insights-hub__state--warning">
          AI insights are unavailable right now. The charts and tables below still show the actual report data.
        </div>
      ) : !insight ? (
        <div className="analytics-insights-hub__state">
          {emptyText}
        </div>
      ) : (
        <>
          <div className="analytics-insights-hub__summary">
            <div>
              <span className="analytics-insights-hub__summary-label">Summary</span>
              <h3>{insight.headline}</h3>
            </div>
            <p>{insight.summary}</p>
          </div>

          <div className="analytics-insights-hub__grid">
            <HubList
              icon={Lightbulb}
              title="What Stands Out"
              items={insight.keyFindings}
              emptyText="No major finding is strong enough to highlight yet."
            />
            <HubList
              icon={AlertTriangle}
              title="Risks"
              items={insight.riskAlerts?.length ? insight.riskAlerts : insight.anomalies}
              emptyText="No immediate risk signal stands out for this scope."
            />
            <HubList
              icon={TrendingUp}
              title="Forecasts"
              items={insight.forecastHighlights}
              emptyText="More occupancy history is needed before forecast highlights can be shown."
            />
            <HubList
              icon={CheckCircle2}
              title="Recommended Actions"
              items={insight.recommendedActions}
              emptyText="No recommended action is available yet."
            />
          </div>

          <p className="analytics-insights-hub__disclaimer">{insight.disclaimer}</p>
        </>
      )}
    </section>
  );
}
