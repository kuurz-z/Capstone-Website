import { DollarSign, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { fmtCurrency } from "../../utils/formatters";

const STAT_ITEMS = [
  {
    key: "revenue",
    label: "Total Revenue",
    icon: CheckCircle,
    color: "green",
    getValue: (s) => fmtCurrency(s?.totalRevenue || 0),
  },
  {
    key: "outstanding",
    label: "Outstanding",
    icon: Clock,
    color: "orange",
    getValue: (s) => fmtCurrency(s?.totalOutstanding || 0),
  },
  {
    key: "overdue",
    label: "Overdue",
    icon: AlertTriangle,
    color: "red",
    getValue: (s) => s?.overdueCount || 0,
  },
  {
    key: "collection",
    label: "Collection Rate",
    icon: DollarSign,
    color: "blue",
    getValue: (s) => (s?.collectionRate != null ? `${s.collectionRate}%` : "—"),
  },
];

export default function BillingStatsBar({ stats }) {
  return (
    <div className="billing-stats">
      {STAT_ITEMS.map(({ key, label, icon: Icon, color, getValue }) => (
        <div key={key} className="stat-card">
          <div className="stat-header">
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{getValue(stats)}</div>
            </div>
            <div className={`stat-icon ${color}`}>
              <Icon size={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
