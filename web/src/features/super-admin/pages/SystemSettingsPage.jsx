import { useEffect, useState } from "react";
import {
 AlertTriangle,
 Archive,
 Clock3,
 Droplets,
 Info,
 Save,
 Settings2,
 UserCog,
 Zap,
} from "lucide-react";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-settings.css";
import { settingsApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";

const BRANCH_LABELS = {
 "gil-puyat": "Gil Puyat",
 guadalupe: "Guadalupe",
};

const DEFAULT_BRANCH_OVERRIDES = {
 "gil-puyat": {
 isApplianceFeeEnabled: false,
 applianceFeeAmountPerUnit: 0,
 changedBy: null,
 changedAt: null,
 },
 guadalupe: {
 isApplianceFeeEnabled: true,
 applianceFeeAmountPerUnit: 200,
 changedBy: null,
 changedAt: null,
 },
};

const DEFAULT_FORM = {
 reservationFeeAmount: 2000,
 penaltyRatePerDay: 50,
 defaultElectricityRatePerKwh: 16,
 defaultWaterRatePerUnit: 0,
 noShowGraceDays: 7,
 stalePendingHours: 2,
 staleVisitPendingHours: 336,
 visitPendingWarnDays: 12,
 staleVisitApprovedHours: 48,
 stalePaymentPendingHours: 48,
 archiveCancelledAfterDays: 7,
 branchOverrides: DEFAULT_BRANCH_OVERRIDES,
 changedBy: null,
 changedAt: null,
 updatedAt: null,
};

const BILLING_FIELDS = [
 {
 key: "reservationFeeAmount",
 label: "Reservation Deposit",
 description: "Deposit required to confirm a reservation before move-in.",
 icon: Settings2,
 step: "100",
 formatValue: (value) => `PHP ${Number(value || 0).toLocaleString("en-PH")}`,
 },
 {
 key: "penaltyRatePerDay",
 label: "Late Payment Penalty",
 description: "Daily penalty added to overdue balances.",
 icon: AlertTriangle,
 step: "1",
 formatValue: (value) =>
 `PHP ${Number(value || 0).toLocaleString("en-PH")} / day`,
 },
 {
 key: "defaultElectricityRatePerKwh",
 label: "Default Electricity Rate",
 description: "Prefill used when admins open a new electricity billing period.",
 icon: Zap,
 step: "0.01",
 formatValue: (value) =>
 `PHP ${Number(value || 0).toLocaleString("en-PH")} / kWh`,
 },
 {
 key: "defaultWaterRatePerUnit",
 label: "Default Water Rate",
 description: "Prefill used when admins prepare water charges.",
 icon: Droplets,
 step: "0.01",
 formatValue: (value) =>
 `PHP ${Number(value || 0).toLocaleString("en-PH")} / unit`,
 },
];

const LIFECYCLE_FIELDS = [
 {
 key: "noShowGraceDays",
 label: "No-Show Grace Period",
 description: "Days after the move-in deadline before a reserved no-show is cancelled.",
 icon: Clock3,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} days`,
 },
 {
 key: "stalePendingHours",
 label: "Pending Reservation Timeout",
 description: "Hours before an untouched `pending` reservation is expired.",
 icon: Clock3,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} hours`,
 },
 {
 key: "staleVisitPendingHours",
 label: "Visit Pending Timeout",
 description: "Hours before a `visit_pending` reservation is auto-expired.",
 icon: Clock3,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} hours`,
 },
 {
 key: "visitPendingWarnDays",
 label: "Visit Pending Warning Window",
 description: "Days before admins are warned that a visit request is stale.",
 icon: UserCog,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} days`,
 },
 {
 key: "staleVisitApprovedHours",
 label: "Visit Approved Timeout",
 description: "Hours past the scheduled visit before a `visit_approved` record expires.",
 icon: Clock3,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} hours`,
 },
 {
 key: "stalePaymentPendingHours",
 label: "Payment Pending Timeout",
 description: "Hours before a `payment_pending` reservation is auto-expired.",
 icon: Clock3,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} hours`,
 },
];

const RETENTION_FIELDS = [
 {
 key: "archiveCancelledAfterDays",
 label: "Cancelled Record Retention",
 description: "Days before eligible cancelled reservations are archived.",
 icon: Archive,
 step: "1",
 formatValue: (value) => `${Number(value || 0).toLocaleString("en-PH")} days`,
 },
];

const POLICY_KEYS = [
 ...BILLING_FIELDS.map((field) => field.key),
 ...LIFECYCLE_FIELDS.map((field) => field.key),
 ...RETENTION_FIELDS.map((field) => field.key),
];

const normalizeBranchOverrides = (branchOverrides = {}) => ({
 "gil-puyat": {
 ...DEFAULT_BRANCH_OVERRIDES["gil-puyat"],
 ...(branchOverrides["gil-puyat"] || {}),
 },
 guadalupe: {
 ...DEFAULT_BRANCH_OVERRIDES.guadalupe,
 ...(branchOverrides.guadalupe || {}),
 },
});

const normalizeSettingsPayload = (payload = {}) => ({
 ...DEFAULT_FORM,
 ...payload,
 branchOverrides: normalizeBranchOverrides(payload.branchOverrides || {}),
 changedBy: payload.changedBy || null,
 changedAt: payload.changedAt || null,
 updatedAt: payload.updatedAt || null,
});

const formatActor = (actor) => {
 if (!actor) return "No recorded owner change yet";
 if (actor.email) return actor.email;
 if (actor.role) return actor.role;
 if (actor.userId) return actor.userId;
 return "Unknown actor";
};

const formatTimestamp = (value) => {
 if (!value) return "Not recorded yet";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "Invalid timestamp";
 return date.toLocaleString("en-PH", {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
};

function renderFieldCard(field, form, onChange, disabled) {
 const Icon = field.icon;

 return (
 <article key={field.key} className="sa-settings-field-card">
 <div className="sa-settings-field-header">
 <div className="sa-setting-icon">
 <Icon size={16} />
 </div>
 <div className="sa-settings-field-heading">
 <span className="sa-setting-label">{field.label}</span>
 <span className="sa-setting-value">{field.formatValue(form[field.key])}</span>
 </div>
 </div>
 <p className="sa-setting-desc">{field.description}</p>
 <input
 className="sa-settings-input"
 type="number"
 min="0"
 step={field.step}
 value={form[field.key]}
 disabled={disabled}
 onChange={(event) => onChange(field.key, event.target.value)}
 />
 </article>
 );
}

export default function SystemSettingsPage() {
 const [form, setForm] = useState(DEFAULT_FORM);
 const [loading, setLoading] = useState(true);
 const [savingPolicies, setSavingPolicies] = useState(false);
 const [savingBranch, setSavingBranch] = useState("");

 useEffect(() => {
 let mounted = true;

 const load = async () => {
 try {
 const data = await settingsApi.getBusinessSettings();
 if (!mounted) return;
 setForm(normalizeSettingsPayload(data));
 } catch (error) {
 showNotification("Failed to load business settings.", "error");
 } finally {
 if (mounted) setLoading(false);
 }
 };

 load();
 return () => {
 mounted = false;
 };
 }, []);

 const applyServerSettings = (data) => {
 setForm(normalizeSettingsPayload(data));
 };

 const updateField = (key, value) =>
 setForm((current) => ({
 ...current,
 [key]: value,
 }));

 const updateBranchField = (branch, key, value) =>
 setForm((current) => ({
 ...current,
 branchOverrides: {
 ...current.branchOverrides,
 [branch]: {
 ...current.branchOverrides?.[branch],
 [key]: value,
 },
 },
 }));

 const savePolicySettings = async () => {
 try {
 setSavingPolicies(true);
 const payload = POLICY_KEYS.reduce((acc, key) => {
 acc[key] = Number(form[key]);
 return acc;
 }, {});
 const data = await settingsApi.updateBusinessSettings(payload);
 applyServerSettings(data);
 showNotification("Policies and defaults updated.", "success");
 } catch (error) {
 showNotification(
 error.message || "Failed to update policy settings.",
 "error",
 );
 } finally {
 setSavingPolicies(false);
 }
 };

 const saveBranchSettings = async (branch) => {
 try {
 setSavingBranch(branch);
 const branchSettings = form.branchOverrides?.[branch] || DEFAULT_BRANCH_OVERRIDES[branch];
 const data = await settingsApi.updateBranchSettings(branch, {
 isApplianceFeeEnabled: Boolean(branchSettings.isApplianceFeeEnabled),
 applianceFeeAmountPerUnit: Number(
 branchSettings.applianceFeeAmountPerUnit || 0,
 ),
 });
 applyServerSettings(data);
 showNotification(
 `Branch override saved for ${BRANCH_LABELS[branch] || branch}.`,
 "success",
 );
 } catch (error) {
 showNotification(
 error.message || "Failed to update branch override.",
 "error",
 );
 } finally {
 setSavingBranch("");
 }
 };

 return (
 <div className="sa2">
 <div className="sa2-header">
 <div>
 <p className="sa2-eyebrow">System Governance</p>
 <h1 className="sa2-title">Policies & Settings</h1>
 <p className="sa-settings-header-copy">
 Backend-configured defaults, lifecycle rules, and retention automation
 live here. Scheduler jobs consume these saved values directly.
 </p>
 </div>
 <button
 type="button"
 className="sa-settings-primary-btn"
 onClick={savePolicySettings}
 disabled={loading || savingPolicies}
 >
 <Save size={14} />
 {savingPolicies ? "Saving..." : "Save Policy Changes"}
 </button>
 </div>

 <div className="sa2-alert">
 <Info size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
 Every settings update is persisted in `BusinessSettings`, stamped with changer
 metadata, and recorded in the audit trail.
 </div>

 <section className="sa-settings-meta-bar">
 <div>
 <span className="sa-settings-meta-label">Last policy change</span>
 <strong className="sa-settings-meta-value">
 {formatActor(form.changedBy)}
 </strong>
 </div>
 <div>
 <span className="sa-settings-meta-label">Changed At</span>
 <strong className="sa-settings-meta-value">
 {formatTimestamp(form.changedAt || form.updatedAt)}
 </strong>
 </div>
 </section>

 {loading ? (
 <section className="sa2-card sa-settings-loading">
 <strong>Loading policy settings</strong>
 <p>Fetching the current `BusinessSettings` document.</p>
 </section>
 ) : (
 <>
 <section className="sa2-card sa-settings-section">
 <div className="sa-settings-section-header">
 <div>
 <h2 className="sa2-card-title">Billing Defaults</h2>
 <p className="sa-settings-section-copy">
 These values drive reservation deposits, late penalties, and default utility rates.
 </p>
 </div>
 <span className="sa-settings-section-pill">Backend Source of Truth</span>
 </div>
 <div className="sa-settings-form-grid">
 {BILLING_FIELDS.map((field) =>
 renderFieldCard(field, form, updateField, savingPolicies),
 )}
 </div>
 </section>

 <section className="sa2-card sa-settings-section">
 <div className="sa-settings-section-header">
 <div>
 <h2 className="sa2-card-title">Branch Overrides</h2>
 <p className="sa-settings-section-copy">
 Keep branch appliance fee behavior explicit and auditable per branch.
 </p>
 </div>
 </div>
 <div className="sa-settings-override-grid">
 {Object.entries(form.branchOverrides || {}).map(([branch, branchSettings]) => (
 <article key={branch} className="sa-settings-override-card">
 <div className="sa-settings-override-header">
 <div>
 <h3>{BRANCH_LABELS[branch] || branch}</h3>
 <p>
 {branchSettings?.isApplianceFeeEnabled
 ? "Appliance fees are enabled."
 : "Appliance fees are disabled."}
 </p>
 </div>
 <span className="sa-settings-override-tag">Branch Billing Override</span>
 </div>

 <label className="sa-settings-toggle">
 <input
 type="checkbox"
 checked={Boolean(branchSettings?.isApplianceFeeEnabled)}
 disabled={savingBranch === branch}
 onChange={(event) =>
 updateBranchField(
 branch,
 "isApplianceFeeEnabled",
 event.target.checked,
 )
 }
 />
 <span>Enable appliance fees for this branch</span>
 </label>

 <label className="sa-settings-inline-field">
 <span>Appliance fee per unit</span>
 <input
 className="sa-settings-input"
 type="number"
 min="0"
 step="1"
 value={branchSettings?.applianceFeeAmountPerUnit ?? 0}
 disabled={savingBranch === branch}
 onChange={(event) =>
 updateBranchField(
 branch,
 "applianceFeeAmountPerUnit",
 event.target.value,
 )
 }
 />
 </label>

 <div className="sa-settings-override-meta">
 <span>Last override change</span>
 <strong>{formatActor(branchSettings?.changedBy)}</strong>
 <span>{formatTimestamp(branchSettings?.changedAt)}</span>
 </div>

 <button
 type="button"
 className="sa-settings-secondary-btn"
 onClick={() => saveBranchSettings(branch)}
 disabled={savingBranch === branch}
 >
 <Save size={14} />
 {savingBranch === branch ? "Saving..." : "Save Branch Override"}
 </button>
 </article>
 ))}
 </div>
 </section>

 <section className="sa2-card sa-settings-section">
 <div className="sa-settings-section-header">
 <div>
 <h2 className="sa2-card-title">Reservation & Lifecycle Policy</h2>
 <p className="sa-settings-section-copy">
 Scheduler-driven reservation actions read these values from the database.
 </p>
 </div>
 <span className="sa-settings-section-pill">Scheduler Backed</span>
 </div>
 <div className="sa-settings-form-grid">
 {LIFECYCLE_FIELDS.map((field) =>
 renderFieldCard(field, form, updateField, savingPolicies),
 )}
 </div>
 </section>

 <section className="sa2-card sa-settings-section">
 <div className="sa-settings-section-header">
 <div>
 <h2 className="sa2-card-title">Retention & Automation</h2>
 <p className="sa-settings-section-copy">
 Retention rules determine when safe-to-hide cancelled records are archived.
 </p>
 </div>
 </div>
 <div className="sa-settings-form-grid">
 {RETENTION_FIELDS.map((field) =>
 renderFieldCard(field, form, updateField, savingPolicies),
 )}
 </div>
 <div className="sa-settings-footer">
 <div className="sa-settings-footer-copy">
 <strong>Audit coverage stays on.</strong>
 <span>
 Global policy saves and branch override saves both emit configuration
 changes into `Audit & Security`.
 </span>
 </div>
 <button
 type="button"
 className="sa-settings-primary-btn"
 onClick={savePolicySettings}
 disabled={savingPolicies}
 >
 <Save size={14} />
 {savingPolicies ? "Saving..." : "Save Policy Changes"}
 </button>
 </div>
 </section>
 </>
 )}
 </div>
 );
}
