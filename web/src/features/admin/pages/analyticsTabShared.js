import { useMemo } from "react";
import { Download, FileDown } from "lucide-react";
import { exportToCSV } from "../../../shared/utils/exportUtils";
import { exportReportPdf } from "../../../shared/utils/reportPdf";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import { useAnalyticsInsights } from "../../../shared/hooks/queries/useAnalyticsReports";
import { AnalyticsInsightPanel, ReportChartPanel, ReportMetricCard } from "../components/shared";

export const RANGE_OPTIONS_SHORT = [
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
];

export const RANGE_OPTIONS_LONG = [
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
];

export function ExportButtons({ onCsv, onPdf }) {
  return (
    <div className="flex items-center gap-3">
      <button 
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm" 
        onClick={onCsv}
      >
        <FileDown size={16} className="text-slate-400" />
        Export CSV
      </button>
      <button 
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-sm" 
        onClick={onPdf}
      >
        <Download size={16} />
        Export PDF
      </button>
    </div>
  );
}

export function MetricGrid({ items }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {items.map((item) => (
        <ReportMetricCard
          key={item.label}
          label={item.label}
          value={item.value}
          tone={item.tone}
        />
      ))}
    </div>
  );
}

export function buildBranchControl({ isOwner, branch, onChange }) {
  if (!isOwner) return null;
  return {
    value: branch,
    onChange,
    options: OWNER_BRANCH_FILTER_OPTIONS,
  };
}

export function handleCsvExport(data, columns, filename) {
  exportToCSV(data, columns, filename);
}

export function handlePdfExport(config) {
  exportReportPdf(config);
}

export function useReportInsights({ reportType, range, branch }) {
  const params = useMemo(
    () => ({
      reportType,
      range,
      ...(branch !== undefined ? { branch } : {}),
    }),
    [branch, range, reportType],
  );

  return useAnalyticsInsights(params);
}

export function AnalyticsInsightSection({
  reportLabel,
  summaryTitle,
  data,
  isLoading,
  isError,
}) {
  return (
    <ReportChartPanel
      title="AI summary"
      subtitle={`Simple explanation of this ${reportLabel} report`}
    >
      <AnalyticsInsightPanel
        title={summaryTitle}
        subtitle="Simple AI explanation"
        data={data}
        isLoading={isLoading}
        isError={isError}
      />
    </ReportChartPanel>
  );
}

export function buildInsightPdfSections(insightData, title = "AI Summary") {
  const insight = insightData?.insight;
  if (!insight) return [];

  const rows = [
    insight.headline ? `Headline: ${insight.headline}` : null,
    insight.summary ? `Summary: ${insight.summary}` : null,
    insight.confidence ? `Confidence: ${insight.confidence}` : null,
    ...(insight.keyFindings || []).map((item) => `What stands out: ${item}`),
    ...(insight.anomalies || []).map((item) => `Things to watch: ${item}`),
    ...(insight.recommendedActions || []).map((item) => `What to do next: ${item}`),
    insight.disclaimer ? `Disclaimer: ${insight.disclaimer}` : null,
  ].filter(Boolean);

  if (rows.length === 0) return [];

  return [
    {
      title,
      description: "AI-generated narrative based on the report data shown in this export.",
      rows,
    },
  ];
}

