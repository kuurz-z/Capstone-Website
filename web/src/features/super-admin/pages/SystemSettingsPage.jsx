import { Settings, DollarSign, Clock, Database, AlertTriangle, Info } from "lucide-react";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-settings.css";

/**
 * Current system constants — displayed read-only.
 * Source of truth: server/config/constants.js
 */
const BUSINESS_RULES = [
  {
    key: "deposit",
    label: "Reservation Deposit",
    value: "₱2,000",
    description: "Required deposit amount when confirming a reservation.",
    icon: DollarSign,
    env: "DEPOSIT_AMOUNT",
  },
  {
    key: "penalty",
    label: "Late Payment Penalty",
    value: "₱50 / day",
    description: "Daily penalty applied to overdue bills after due date.",
    icon: AlertTriangle,
    env: "PENALTY_RATE",
  },
  {
    key: "noshow",
    label: "No-Show Grace Period",
    value: "7 days",
    description: "Days before a reserved (no-show) reservation is auto-cancelled.",
    icon: Clock,
  },
  {
    key: "stale_pending",
    label: "Stale Pending Timeout",
    value: "2 hours",
    description: "Hours before an unscheduled pending reservation expires.",
    icon: Clock,
  },
  {
    key: "stale_visit_pending",
    label: "Visit Pending Timeout",
    value: "24 hours",
    description: "Hours before a visit_pending reservation expires.",
    icon: Clock,
  },
  {
    key: "stale_visit_approved",
    label: "Visit Approved Timeout",
    value: "48 hours",
    description: "Hours past visit date before a visit_approved reservation expires.",
    icon: Clock,
  },
  {
    key: "stale_payment",
    label: "Payment Pending Timeout",
    value: "48 hours",
    description: "Hours before a payment_pending reservation expires.",
    icon: Clock,
  },
];

const CACHE_SETTINGS = [
  {
    key: "token_ttl",
    label: "Token Cache TTL",
    value: "5 minutes",
    description: "How long Firebase token verifications are cached.",
    icon: Database,
  },
  {
    key: "status_ttl",
    label: "Account Status Cache TTL",
    value: "2 minutes",
    description: "How long account suspension/ban checks are cached.",
    icon: Database,
  },
  {
    key: "max_tokens",
    label: "Max Token Cache Entries",
    value: "500",
    description: "Maximum entries in the LRU token verification cache.",
    icon: Database,
  },
  {
    key: "max_status",
    label: "Max Status Cache Entries",
    value: "500",
    description: "Maximum entries in the account status cache.",
    icon: Database,
  },
];

export default function SystemSettingsPage() {
  return (
    <div className="sa2">
      <div className="sa2-header">
        <div>
          <p className="sa2-eyebrow">Super Admin</p>
          <h1 className="sa2-title">System Settings</h1>
        </div>
      </div>

      <div className="sa2-alert">
        <Info size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
        These values are defined in <code>server/config/constants.js</code> and can be overridden via environment variables at deployment time. Changes require a server restart.
      </div>

      {/* Business Rules Section */}
      <div className="sa2-card sa-settings-section">
        <h2 className="sa2-card-title">
          <DollarSign size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Business Rules
        </h2>
        <div className="sa-settings-grid">
          {BUSINESS_RULES.map((setting) => (
            <div key={setting.key} className="sa-setting-item">
              <div className="sa-setting-icon">
                <setting.icon size={16} />
              </div>
              <div className="sa-setting-content">
                <div className="sa-setting-header">
                  <span className="sa-setting-label">{setting.label}</span>
                  <span className="sa-setting-value">{setting.value}</span>
                </div>
                <p className="sa-setting-desc">{setting.description}</p>
                {setting.env && (
                  <span className="sa-setting-env">
                    ENV: <code>{setting.env}</code>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cache Tuning Section */}
      <div className="sa2-card sa-settings-section">
        <h2 className="sa2-card-title">
          <Database size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Cache Tuning
        </h2>
        <div className="sa-settings-grid">
          {CACHE_SETTINGS.map((setting) => (
            <div key={setting.key} className="sa-setting-item">
              <div className="sa-setting-icon">
                <setting.icon size={16} />
              </div>
              <div className="sa-setting-content">
                <div className="sa-setting-header">
                  <span className="sa-setting-label">{setting.label}</span>
                  <span className="sa-setting-value">{setting.value}</span>
                </div>
                <p className="sa-setting-desc">{setting.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
