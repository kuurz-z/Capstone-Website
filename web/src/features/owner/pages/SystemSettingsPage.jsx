import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  Building2,
  Calendar,
  Clock,
  Clock3,
  CreditCard,
  Database,
  Droplets,
  KeyRound,
  Loader2,
  Lock,
  Percent,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import "../styles/owner-dashboard.css";
import "../styles/owner-settings.css";
import { settingsApi } from "../../../shared/api/apiClient";
import {
  useSystemSettings,
  useUpdateSystemSettingsMutation,
  useUpdateBranchSettingsMutation,
} from "../../../shared/hooks/queries/useSystemSettingsQuery";
import { useAppliances } from "../../../shared/hooks/queries/useAppliances";
import { showNotification } from "../../../shared/utils/notification";
import { AdminPoliciesSettingsSkeleton } from "../../admin/components/AdminContentSkeletons";
import SystemBackupPage from "../../admin/pages/SystemBackupPage";
import AdminTabs from "../../../shared/components/AdminTabs";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import ApplianceCatalogModal from "../components/ApplianceCatalogModal";

const BRANCH_META = {
  "gil-puyat": {
    label: "Gil Puyat Branch",
    tag: "gil-puyat",
  },
  guadalupe: {
    label: "Guadalupe Branch",
    tag: "guadalupe",
  },
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
  // Financial & Billing Rules
  reservationFeeAmount: 2000,
  penaltyRatePerDay: 50,
  latePaymentGraceDays: 1,
  defaultElectricityRatePerKwh: 16,
  defaultWaterRatePerUnit: 0,
  rfidReplacementCharge: 1000,
  depositRefundProcessingDays: 30,

  // Lease Pricing & Room Discounts
  isDiscountEnabled: true,
  longTermLeaseMinMonths: 6,
  defaultLongTermDiscountPercent: 10,
  quadrupleDiscountPercent: 10,
  doubleDiscountPercent: 20,
  privateDiscountPercent: 10,

  // Reservation Lifecycle & Automation
  stalePaymentPendingHours: 48,
  noShowGraceDays: 7,
  checkoutLockDurationMinutes: 30,
  archiveCancelledAfterDays: 7,

  // Technical scheduler tolerances (preserved for backend compatibility)
  stalePendingHours: 2,
  staleVisitPendingHours: 336,
  visitPendingWarnDays: 12,
  staleVisitApprovedHours: 48,
  renewalNoticeRequiredDays: 30,

  branchOverrides: DEFAULT_BRANCH_OVERRIDES,
  changedBy: null,
  changedAt: null,
  updatedAt: null,
};

const WHOLE_NUMBER_KEYS = new Set([
  "latePaymentGraceDays",
  "noShowGraceDays",
  "stalePaymentPendingHours",
  "checkoutLockDurationMinutes",
  "archiveCancelledAfterDays",
  "longTermLeaseMinMonths",
  "depositRefundProcessingDays",
  "stalePendingHours",
  "staleVisitPendingHours",
  "visitPendingWarnDays",
  "staleVisitApprovedHours",
  "renewalNoticeRequiredDays",
]);

const PERCENTAGE_KEYS = new Set([
  "defaultLongTermDiscountPercent",
  "quadrupleDiscountPercent",
  "doubleDiscountPercent",
  "privateDiscountPercent",
]);

const FIELD_LIMITS = Object.freeze({
  reservationFeeAmount: { min: 0, max: 50000, maxDigits: 6, unit: "PHP", label: "Reservation Deposit" },
  penaltyRatePerDay: { min: 0, max: 5000, maxDigits: 5, unit: "PHP/day", label: "Daily Late Penalty" },
  latePaymentGraceDays: { min: 0, max: 30, maxDigits: 2, unit: "days", label: "Late Payment Grace Period" },
  defaultElectricityRatePerKwh: { min: 0, max: 500, maxDigits: 6, unit: "PHP/kWh", label: "Default Electricity Rate" },
  defaultWaterRatePerUnit: { min: 0, max: 500, maxDigits: 6, unit: "PHP/m³", label: "Default Water Rate" },
  rfidReplacementCharge: { min: 0, max: 5000, maxDigits: 5, unit: "PHP", label: "RFID Replacement Charge" },
  depositRefundProcessingDays: { min: 1, max: 90, maxDigits: 2, unit: "days", label: "Deposit Refund Target Window" },
  longTermLeaseMinMonths: { min: 1, max: 24, maxDigits: 2, unit: "months", label: "Long-Term Lease Threshold" },
  defaultLongTermDiscountPercent: { min: 0, max: 100, maxDigits: 3, unit: "%", label: "Default Long-Term Discount" },
  quadrupleDiscountPercent: { min: 0, max: 100, maxDigits: 3, unit: "%", label: "Quadruple Room Discount" },
  doubleDiscountPercent: { min: 0, max: 100, maxDigits: 3, unit: "%", label: "Double Sharing Discount" },
  privateDiscountPercent: { min: 0, max: 100, maxDigits: 3, unit: "%", label: "Private Room Discount" },
  stalePaymentPendingHours: { min: 1, max: 720, maxDigits: 3, unit: "hours", label: "Payment & Hold Window" },
  noShowGraceDays: { min: 0, max: 60, maxDigits: 2, unit: "days", label: "No-Show Grace Period" },
  checkoutLockDurationMinutes: { min: 5, max: 120, maxDigits: 3, unit: "mins", label: "Bed Checkout Lock Window" },
  archiveCancelledAfterDays: { min: 1, max: 180, maxDigits: 3, unit: "days", label: "Cancelled Records Archival" },
  renewalNoticeRequiredDays: { min: 7, max: 60, maxDigits: 2, unit: "days", label: "Renewal Notice Window" },
  stalePendingHours: { min: 1, max: 720, maxDigits: 3, unit: "hours", label: "Stale Pending Hours" },
  staleVisitPendingHours: { min: 1, max: 720, maxDigits: 3, unit: "hours", label: "Stale Visit Pending Hours" },
  visitPendingWarnDays: { min: 1, max: 90, maxDigits: 2, unit: "days", label: "Visit Pending Warn Days" },
  staleVisitApprovedHours: { min: 1, max: 720, maxDigits: 3, unit: "hours", label: "Stale Visit Approved Hours" },
  applianceFeeAmountPerUnit: { min: 0, max: 10000, maxDigits: 5, unit: "PHP", label: "Appliance Surcharge Fee" },
});

// ── 1. Financial & Billing Subgroups ──────────────────────────────────────────
const BILLING_SUBGROUPS = [
  {
    id: "deposits",
    title: "Security Deposits & Clearance Fees",
    description: "Upfront deposit baselines and itemized turnover charges assessed at move-in and check-out.",
    icon: CreditCard,
    iconColor: "text-sky-600 dark:text-sky-400",
    gridClass: "sa-settings-form-grid--3col",
    fields: [
      {
        key: "reservationFeeAmount",
        label: "Reservation Deposit",
        description: "Upfront deposit required to hold and confirm an applicant bed slot.",
        icon: CreditCard,
        iconColor: "text-sky-600 dark:text-sky-400",
        prefix: "₱",
        step: "100",
        min: 0,
        max: 50000,
        boundsHint: "Range: ₱0 – ₱50,000",
        formatValue: (v) => `PHP ${Number(v || 0).toLocaleString("en-PH")}`,
      },
      {
        key: "rfidReplacementCharge",
        label: "RFID Key Replacement Fee",
        description: "Standard charge assessed if an access RFID card is lost or unreturned.",
        icon: KeyRound,
        iconColor: "text-amber-600 dark:text-amber-400",
        prefix: "₱",
        step: "100",
        min: 0,
        max: 5000,
        boundsHint: "Range: ₱0 – ₱5,000",
        formatValue: (v) => `PHP ${Number(v || 0).toLocaleString("en-PH")}`,
      },
      {
        key: "depositRefundProcessingDays",
        label: "Deposit Refund Window",
        description: "Committed business days to process outgoing tenant deposit returns.",
        icon: Clock,
        iconColor: "text-sky-600 dark:text-sky-400",
        suffix: "Days",
        step: "1",
        min: 1,
        max: 90,
        boundsHint: "Range: 1 – 90 days",
        formatValue: (v) => `${Number(v || 0)} business days`,
      },
    ],
  },
  {
    id: "tariffs",
    title: "Utility Tariffs & Overdue Penalties",
    description: "Default consumption rates applied per unit and daily compounded late surcharge ceilings.",
    icon: Zap,
    iconColor: "text-amber-500 dark:text-amber-400",
    gridClass: "sa-settings-form-grid--4col",
    fields: [
      {
        key: "defaultElectricityRatePerKwh",
        label: "Default Electricity Rate",
        description: "Baseline electricity tariff prefilled during monthly billing cycles.",
        icon: Zap,
        iconColor: "text-amber-500 dark:text-amber-400",
        prefix: "₱",
        suffix: "/ kWh",
        step: "0.01",
        min: 0,
        max: 500,
        boundsHint: "Range: ₱0 – ₱500 / kWh",
        formatValue: (v) => `PHP ${Number(v || 0).toFixed(2)} / kWh`,
      },
      {
        key: "defaultWaterRatePerUnit",
        label: "Default Water Rate",
        description: "Baseline water tariff applied per cubic meter across shared meters.",
        icon: Droplets,
        iconColor: "text-sky-500 dark:text-sky-400",
        prefix: "₱",
        suffix: "/ m³",
        step: "0.01",
        min: 0,
        max: 500,
        boundsHint: "Range: ₱0 – ₱500 / m³",
        formatValue: (v) => `PHP ${Number(v || 0).toFixed(2)} / m³`,
      },
      {
        key: "penaltyRatePerDay",
        label: "Daily Late Penalty",
        description: "Daily surcharge added to overdue monthly tenant rent balances.",
        icon: AlertTriangle,
        iconColor: "text-rose-600 dark:text-rose-400",
        prefix: "₱",
        suffix: "/ day",
        step: "1",
        min: 0,
        max: 5000,
        boundsHint: "Range: ₱0 – ₱5,000 / day",
        formatValue: (v) => `PHP ${Number(v || 0).toLocaleString("en-PH")} / day`,
      },
      {
        key: "latePaymentGraceDays",
        label: "Late Payment Grace Period",
        description: "Buffer days after the due date before daily late penalties begin to accrue.",
        icon: Clock,
        iconColor: "text-amber-600 dark:text-amber-400",
        suffix: "Days",
        step: "1",
        min: 0,
        max: 30,
        boundsHint: "Range: 0 – 30 days (Default: 1 day)",
        formatValue: (v) => `${Number(v || 0)} grace day${Number(v || 0) === 1 ? "" : "s"}`,
      },
    ],
  },
];

// ── 2. Lease Pricing & Room Type Discounts Fields (Unified 4-Col Grid) ───────
const LEASE_PRICING_FIELDS = [
  {
    key: "longTermLeaseMinMonths",
    label: "Long-Term Lease Threshold",
    description: "Minimum lease contract duration required to qualify for promotional room discounts.",
    icon: Calendar,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    suffix: "Months",
    step: "1",
    min: 1,
    max: 24,
    boundsHint: "Range: 1 – 24 months",
    formatValue: (v) => `${Number(v || 0)} months minimum`,
  },
  {
    key: "quadrupleDiscountPercent",
    label: "Quadruple Room Discount",
    description: "Promotional discount percentage for 4-Bed Shared Dormitory accommodations.",
    icon: Percent,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    suffix: "%",
    step: "1",
    min: 0,
    max: 100,
    boundsHint: "Range: 0% – 100% off",
    formatValue: (v) => `${Number(v || 0)}% discount`,
  },
  {
    key: "doubleDiscountPercent",
    label: "Double Sharing Discount",
    description: "Promotional discount percentage for 2-Bed Double Dormitory accommodations.",
    icon: Percent,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    suffix: "%",
    step: "1",
    min: 0,
    max: 100,
    boundsHint: "Range: 0% – 100% off",
    formatValue: (v) => `${Number(v || 0)}% discount`,
  },
  {
    key: "privateDiscountPercent",
    label: "Private Room Discount",
    description: "Promotional discount percentage for Single/Solo Private accommodations.",
    icon: Percent,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    suffix: "%",
    step: "1",
    min: 0,
    max: 100,
    boundsHint: "Range: 0% – 100% off",
    formatValue: (v) => `${Number(v || 0)}% discount`,
  },
];

// ── 3. Reservation Lifecycle Fields (Unified 4-Col Grid) ─────────────────────
const LIFECYCLE_FIELDS = [
  {
    key: "stalePaymentPendingHours",
    label: "Payment & Hold Window",
    description: "Hours granted to settle initial deposit before the selected bed slot is auto-released.",
    icon: Clock3,
    iconColor: "text-amber-600 dark:text-amber-400",
    suffix: "Hours",
    step: "1",
    min: 1,
    max: 720,
    boundsHint: "Range: 1 – 720 hours",
    formatValue: (v) =>
      `${Number(v || 0)} hrs (${(Number(v || 0) / 24).toFixed(1)} days)`,
  },
  {
    key: "checkoutLockDurationMinutes",
    label: "Bed Checkout Lock Window",
    description: "Temporary hold duration while an applicant is completing the online reservation form.",
    icon: Lock,
    iconColor: "text-amber-600 dark:text-amber-400",
    suffix: "Mins",
    step: "5",
    min: 5,
    max: 120,
    boundsHint: "Range: 5 – 120 minutes",
    formatValue: (v) => `${Number(v || 0)} mins lock`,
  },
  {
    key: "noShowGraceDays",
    label: "No-Show Move-In Grace Period",
    description: "Days past scheduled check-in before an unattended reservation is auto-cancelled.",
    icon: Calendar,
    iconColor: "text-rose-600 dark:text-rose-400",
    suffix: "Days",
    step: "1",
    min: 0,
    max: 60,
    boundsHint: "Range: 0 – 60 days",
    formatValue: (v) => `${Number(v || 0)} grace days`,
  },
  {
    key: "archiveCancelledAfterDays",
    label: "Cancelled Records Archival",
    description: "Days before cancelled or expired reservations are automatically archived from active views.",
    icon: Archive,
    iconColor: "text-slate-500 dark:text-slate-400",
    suffix: "Days",
    step: "1",
    min: 1,
    max: 180,
    boundsHint: "Range: 1 – 180 days",
    formatValue: (v) => `${Number(v || 0)} days retention`,
  },
];

const ALL_POLICY_FIELDS = [
  ...BILLING_SUBGROUPS.flatMap((group) => group.fields),
  ...LEASE_PRICING_FIELDS,
  ...LIFECYCLE_FIELDS,
];

const POLICY_KEYS = [
  ...ALL_POLICY_FIELDS.map((f) => f.key),
  // Technical scheduler keys preserved in background payload
  "stalePendingHours",
  "staleVisitPendingHours",
  "visitPendingWarnDays",
  "staleVisitApprovedHours",
  "defaultLongTermDiscountPercent",
  "renewalNoticeRequiredDays",
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
  if (!actor) return "Default System Configuration";
  if (actor.email) return actor.email;
  if (actor.role) return `Authorized ${actor.role}`;
  if (actor.userId) return `ID: ${actor.userId}`;
  return "System Administrator";
};

const formatTimestamp = (value) => {
  if (!value) return "Standard Baseline";
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

const validateFieldValue = (key, rawValue) => {
  if (rawValue === "" || rawValue === null || rawValue === undefined) {
    return "Field value is required.";
  }
  const num = Number(rawValue);
  if (!Number.isFinite(num)) {
    return "Must be a valid number.";
  }
  const limits = FIELD_LIMITS[key];
  if (limits) {
    if (num < limits.min) {
      return `Must be at least ${limits.min}${limits.unit === "%" ? "%" : ""}.`;
    }
    if (num > limits.max) {
      return `Must not exceed ${limits.max}${limits.unit === "%" ? "%" : ""}.`;
    }
  } else if (num < 0) {
    return "Must be a non-negative number.";
  }
  if (PERCENTAGE_KEYS.has(key) && (num < 0 || num > 100)) {
    return "Percentage must be between 0% and 100%.";
  }
  if (WHOLE_NUMBER_KEYS.has(key) && !Number.isInteger(num)) {
    return "Must be a whole number.";
  }
  return null;
};

export default function SystemSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "policies";
  const validTabs = ["policies", "backups"];
  const activeTab = validTabs.includes(rawTab) ? rawTab : "policies";

  const { data: serverSettings, isLoading: loading } = useSystemSettings();
  const { data: rawAppliances = [] } = useAppliances({ includeInactive: true });
  const updateSettingsMutation = useUpdateSystemSettingsMutation();
  const updateBranchMutation = useUpdateBranchSettingsMutation();

  const [serverBaseline, setServerBaseline] = useState(DEFAULT_FORM);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});

  const [savingBranch, setSavingBranch] = useState("");
  const savingPolicies = updateSettingsMutation.isPending;

  const [pendingTab, setPendingTab] = useState(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isApplianceCatalogOpen, setIsApplianceCatalogOpen] = useState(false);

  const activeCatalogCount = useMemo(() => {
    return Array.isArray(rawAppliances)
      ? rawAppliances.filter((a) => a.isActive).length
      : 0;
  }, [rawAppliances]);

  useEffect(() => {
    if (serverSettings) {
      const normalized = normalizeSettingsPayload(serverSettings);
      setServerBaseline(normalized);
      setForm((curr) => (curr === DEFAULT_FORM ? normalized : curr));
    }
  }, [serverSettings]);

  // Compute dirty policy fields
  const dirtyPolicyKeys = useMemo(() => {
    const dirty = [];
    for (const key of POLICY_KEYS) {
      if (Number(form[key]) !== Number(serverBaseline[key])) {
        dirty.push(key);
      }
    }
    if (
      Boolean(form.isDiscountEnabled) !==
      Boolean(serverBaseline.isDiscountEnabled)
    ) {
      dirty.push("isDiscountEnabled");
    }
    return dirty;
  }, [form, serverBaseline]);

  const isPoliciesDirty = dirtyPolicyKeys.length > 0;

  // Compute branch dirty fields
  const isBranchDirty = (branch) => {
    const curr =
      form.branchOverrides?.[branch] || DEFAULT_BRANCH_OVERRIDES[branch];
    const base =
      serverBaseline.branchOverrides?.[branch] ||
      DEFAULT_BRANCH_OVERRIDES[branch];
    return (
      Boolean(curr.isApplianceFeeEnabled) !==
        Boolean(base.isApplianceFeeEnabled) ||
      Number(curr.applianceFeeAmountPerUnit || 0) !==
        Number(base.applianceFeeAmountPerUnit || 0)
    );
  };

  const isAnyBranchDirty = useMemo(() => {
    return Object.keys(BRANCH_META).some((branch) => isBranchDirty(branch));
  }, [form.branchOverrides, serverBaseline.branchOverrides]);

  const hasUnsavedChanges = isPoliciesDirty || isAnyBranchDirty;

  const settingsTabs = useMemo(
    () => [
      {
        id: "policies",
        label: "Operational Policies",
        icon: Settings2,
        iconClassName: "text-sky-500 dark:text-sky-400",
        badge: hasUnsavedChanges
          ? dirtyPolicyKeys.length + (isAnyBranchDirty ? 1 : 0)
          : undefined,
        badgeVariant: "warning",
      },
      {
        id: "backups",
        label: "Database Backup & Restore",
        icon: Database,
        iconClassName: "text-emerald-600 dark:text-emerald-400",
      },
    ],
    [hasUnsavedChanges, dirtyPolicyKeys.length, isAnyBranchDirty],
  );

  const handleTabChange = (tabKey) => {
    if (activeTab === "policies" && hasUnsavedChanges && tabKey !== "policies") {
      setPendingTab(tabKey);
      setShowUnsavedModal(true);
      return;
    }
    commitTabChange(tabKey);
  };

  const commitTabChange = (tabKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tabKey === "policies") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tabKey);
    }
    setSearchParams(nextParams, { replace: true });
    setShowUnsavedModal(false);
    setPendingTab(null);
  };

  const handleDiscardAndSwitch = () => {
    setForm(serverBaseline);
    setTouched({});
    setErrors({});
    if (pendingTab) {
      commitTabChange(pendingTab);
    }
  };

  const applyServerSettings = (data) => {
    const normalized = normalizeSettingsPayload(data);
    setServerBaseline(normalized);
    setForm(normalized);
    setTouched({});
    setErrors({});
  };

  const updateField = (key, value) => {
    const limits = FIELD_LIMITS[key];
    if (limits?.maxDigits && value && String(value).length > limits.maxDigits + 3) {
      return;
    }
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setTouched((curr) => ({ ...curr, [key]: true }));
    const err = validateFieldValue(key, value);
    setErrors((curr) => ({ ...curr, [key]: err }));
  };

  const handleFieldBlur = (key) => {
    setTouched((curr) => ({ ...curr, [key]: true }));
    const err = validateFieldValue(key, form[key]);
    setErrors((curr) => ({ ...curr, [key]: err }));
  };

  const handleResetSingleField = (key) => {
    const baselineVal = serverBaseline[key];
    setForm((curr) => ({ ...curr, [key]: baselineVal }));
    setTouched((curr) => ({ ...curr, [key]: false }));
    setErrors((curr) => ({ ...curr, [key]: null }));
    const fieldDef = ALL_POLICY_FIELDS.find((f) => f.key === key);
    showNotification(
      `Reverted "${fieldDef?.label || key}" to saved configuration.`,
      "info",
    );
  };

  const updateBranchField = (branch, key, value) => {
    if (key === "applianceFeeAmountPerUnit" && value && String(value).length > 8) {
      return;
    }
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
  };

  const handleDiscardPolicies = () => {
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(POLICY_KEYS.map((k) => [k, serverBaseline[k]])),
      isDiscountEnabled: serverBaseline.isDiscountEnabled,
    }));
    setTouched({});
    setErrors({});
    showNotification("Policy changes reverted to saved defaults.", "info");
  };

  const handleDiscardBranch = (branch) => {
    setForm((current) => ({
      ...current,
      branchOverrides: {
        ...current.branchOverrides,
        [branch]: {
          ...serverBaseline.branchOverrides?.[branch],
        },
      },
    }));
    showNotification(
      `Branch override for ${BRANCH_META[branch]?.label || branch} reverted.`,
      "info",
    );
  };

  const hasValidationErrors = useMemo(() => {
    for (const key of ALL_POLICY_FIELDS.map((f) => f.key)) {
      if (validateFieldValue(key, form[key])) {
        return true;
      }
    }
    return false;
  }, [form]);

  const savePolicySettings = async () => {
    const newErrors = {};
    let hasErr = false;
    for (const key of ALL_POLICY_FIELDS.map((f) => f.key)) {
      const err = validateFieldValue(key, form[key]);
      if (err) {
        newErrors[key] = err;
        hasErr = true;
      }
    }
    if (hasErr) {
      setErrors(newErrors);
      setTouched(
        ALL_POLICY_FIELDS.reduce(
          (acc, f) => ({ ...acc, [f.key]: true }),
          {},
        ),
      );
      showNotification(
        "Please resolve input validation errors before saving.",
        "error",
      );
      return;
    }

    try {
      const payload = POLICY_KEYS.reduce((acc, key) => {
        acc[key] = Number(form[key]);
        return acc;
      }, {});
      payload.isDiscountEnabled = Boolean(form.isDiscountEnabled);
      const data = await updateSettingsMutation.mutateAsync(payload);
      applyServerSettings(data);
      showNotification(
        "Operational policies and billing defaults updated successfully.",
        "success",
      );
    } catch (error) {
      showNotification(
        error.message || "Failed to update business policies.",
        "error",
      );
    }
  };

  const saveBranchSettings = async (branch) => {
    try {
      setSavingBranch(branch);
      const branchSettings =
        form.branchOverrides?.[branch] || DEFAULT_BRANCH_OVERRIDES[branch];
      const data = await updateBranchMutation.mutateAsync({
        branch,
        isApplianceFeeEnabled: Boolean(branchSettings.isApplianceFeeEnabled),
        applianceFeeAmountPerUnit: Number(
          branchSettings.applianceFeeAmountPerUnit || 0,
        ),
      });
      applyServerSettings(data);
      showNotification(
        `Branch override saved for ${BRANCH_META[branch]?.label || branch}.`,
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

  if (loading && activeTab !== "backups") {
    return <AdminPoliciesSettingsSkeleton activeTab={activeTab} />;
  }

  function renderFieldCard(field) {
    const Icon = field.icon;
    const iconColor = field.iconColor || "text-slate-600 dark:text-slate-400";
    const isDirty =
      Number(form[field.key]) !== Number(serverBaseline[field.key]);
    const isTouched = Boolean(touched[field.key]);
    const fieldError = isTouched ? errors[field.key] : null;
    const rawVal = form[field.key];
    const validationErr = validateFieldValue(field.key, rawVal);

    return (
      <article
        key={field.key}
        className={`sa-settings-field-card ${
          isDirty ? "sa-settings-field-card--dirty" : ""
        } ${fieldError ? "sa-settings-field-card--error" : ""}`}
      >
        <div className="sa-settings-field-header">
          <div className={`sa-setting-icon ${iconColor}`}>
            <Icon size={18} />
          </div>
          <div className="sa-settings-field-heading">
            <div className="sa-setting-title-row">
              <span className="sa-setting-label">{field.label}</span>
              <div className="sa-setting-badge-group">
                {isDirty && !fieldError && (
                  <>
                    <span className="sa-settings-dirty-badge">Modified</span>
                    <button
                      type="button"
                      className="sa-setting-micro-revert"
                      title="Reset this field to saved default"
                      aria-label={`Reset ${field.label}`}
                      onClick={() => handleResetSingleField(field.key)}
                      disabled={savingPolicies}
                    >
                      <RotateCcw size={11} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sa-setting-preview-wrap">
          <span
            className={`sa-setting-live-value ${
              validationErr ? "sa-setting-live-value--error" : ""
            }`}
          >
            {validationErr ? "Invalid value" : field.formatValue(rawVal)}
          </span>
          <p className="sa-setting-desc">{field.description}</p>
        </div>

        <div>
          <div className="sa-settings-input-group">
            {field.prefix && (
              <span className="sa-settings-input-affix sa-settings-input-affix--prefix">
                {field.prefix}
              </span>
            )}
            <input
              className={`sa-settings-input ${
                field.prefix ? "has-prefix" : ""
              } ${field.suffix ? "has-suffix" : ""} ${
                fieldError ? "sa-settings-input--error" : ""
              }`}
              type="number"
              min={field.min ?? "0"}
              max={field.max}
              step={field.step}
              value={form[field.key] ?? ""}
              disabled={savingPolicies}
              onChange={(event) => updateField(field.key, event.target.value)}
              onBlur={() => handleFieldBlur(field.key)}
            />
            {field.suffix && (
              <span className="sa-settings-input-affix sa-settings-input-affix--suffix">
                {field.suffix}
              </span>
            )}
          </div>

          <div className="sa-settings-card-bottom">
            {fieldError ? (
              <span className="sa-settings-field-error">{fieldError}</span>
            ) : (
              <span className="sa-settings-bounds-hint">{field.boundsHint}</span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="sa2">
      {/* ── Unsaved Changes Tab Modal ── */}
      {showUnsavedModal && (
        <div className="sa-modal-overlay">
          <div className="sa-modal-dialog">
            <div className="sa-modal-header">
              <AlertTriangle className="h-6 w-6 text-warning" />
              <h3>Unsaved Policy Changes</h3>
            </div>
            <p className="sa-modal-body">
              You have <strong>{dirtyPolicyKeys.length} unsaved modification{dirtyPolicyKeys.length > 1 ? "s" : ""}</strong>.
              If you leave this tab without saving, your edits will be discarded.
            </p>
            <div className="sa-modal-actions">
              <button
                type="button"
                className="sa-settings-secondary-btn"
                onClick={() => setShowUnsavedModal(false)}
              >
                Stay on Page
              </button>
              <button
                type="button"
                className="sa-settings-destructive-btn"
                onClick={handleDiscardAndSwitch}
              >
                Discard & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pattern 1 Sticky Sub-Header ── */}
      <AdminPageHeader
        title="Settings & Policies"
        subtitle="Control platform policies, defaults, branch overrides, and manage database backup and recovery."
        tabs={settingsTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        ariaLabel="Operational policies and database backup navigation"
      />

      {/* ── Tab Content ── */}
      {activeTab === "backups" ? (
        <SystemBackupPage isEmbedded={true} />
      ) : (
        /* ══════════════════════════════════════════════════════════════════
           OPERATIONAL POLICIES TAB (SYMMETRICAL, OPTIMIZED ALIGNMENTS)
           ══════════════════════════════════════════════════════════════════ */
        <>
          {/* Metadata & Audit Strip (Inline balanced toolbar) */}
          <section className="sa-settings-meta-bar">
            <div className="sa-settings-meta-item">
              <div className="sa-settings-meta-icon">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="sa-settings-meta-content">
                <span className="sa-settings-meta-label">
                  Last Global Policy Change
                </span>
                <strong className="sa-settings-meta-value">
                  {formatActor(form.changedBy)}
                </strong>
              </div>
            </div>

            <div className="sa-settings-meta-divider" />

            <div className="sa-settings-meta-item">
              <div className="sa-settings-meta-icon">
                <Clock size={18} className="text-sky-600 dark:text-sky-400" />
              </div>
              <div className="sa-settings-meta-content">
                <span className="sa-settings-meta-label">
                  Timestamp & Effective Date
                </span>
                <strong className="sa-settings-meta-value">
                  {formatTimestamp(form.changedAt || form.updatedAt)}
                </strong>
              </div>
            </div>

            <div className="sa-settings-meta-badge">
              <span className="sa-settings-meta-badge-dot" />
              <span>Audit Baseline Enforced</span>
            </div>
          </section>

          {/* Section 1: Financial & Billing Rules */}
          <section className="sa-settings-section">
            <div className="sa-settings-section-header">
              <div>
                <h2 className="sa2-card-title">Financial & Billing Rules</h2>
                <p className="sa-settings-section-copy">
                  Core monetary baselines governing reservation deposits, late
                  overdue penalties, default utility tariffs, and clearance charges.
                </p>
              </div>
              <span className="sa-settings-section-pill">
                Billing Source of Truth
              </span>
            </div>

            {BILLING_SUBGROUPS.map((subgroup) => {
              const SubIcon = subgroup.icon;
              return (
                <div key={subgroup.id} className="sa-settings-subgroup">
                  <div className="sa-settings-subgroup-header">
                    <div className="sa-settings-subgroup-title-wrap">
                      <SubIcon size={16} className={subgroup.iconColor || "text-slate-600 dark:text-slate-400"} />
                      <h3 className="sa-settings-subgroup-title">{subgroup.title}</h3>
                    </div>
                    <p className="sa-settings-subgroup-desc">{subgroup.description}</p>
                  </div>
                  <div className={`sa-settings-form-grid ${subgroup.gridClass}`}>
                    {subgroup.fields.map((field) => renderFieldCard(field))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Section 2: Lease Pricing & Room Type Discounts */}
          <section className="sa-settings-section">
            <div className="sa-settings-section-header flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="sa2-card-title">
                  Lease Pricing & Room Type Discounts
                </h2>
                <p className="sa-settings-section-copy">
                  Automatic promotional discount percentages applied to standard
                  room base prices for qualifying long-term tenant contracts.
                </p>
              </div>

              {/* Master Discount Switch */}
              <div className="sa-discount-toggle-card">
                <div className="sa-discount-toggle-text">
                  <span className="sa-discount-toggle-title">
                    Master Promo Switch
                  </span>
                  <span
                    className={`sa-discount-toggle-status ${
                      form.isDiscountEnabled
                        ? "sa-discount-toggle-status--active"
                        : "sa-discount-toggle-status--disabled"
                    }`}
                  >
                    {form.isDiscountEnabled
                      ? "Discounts Active"
                      : "Discounts Disabled (0%)"}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(form.isDiscountEnabled)}
                  aria-label="Toggle Room Discounts"
                  onClick={() =>
                    updateField("isDiscountEnabled", !form.isDiscountEnabled)
                  }
                  disabled={savingPolicies}
                  className={`sa-switch-btn ${
                    form.isDiscountEnabled ? "sa-switch-btn--active" : ""
                  }`}
                >
                  <div className="sa-switch-thumb" />
                </button>
              </div>
            </div>

            {!form.isDiscountEnabled && (
              <div className="sa-settings-warning-banner">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  <strong>Discounts Disabled:</strong> All room types revert to
                  100% standard base rent (0% promotional deduction applied to
                  contracts).
                </span>
              </div>
            )}

            {/* Symmetrical 4-Column Row (1 Tenure Threshold + 3 Room Discounts) */}
            <div className="sa-settings-form-grid sa-settings-form-grid--4col">
              {LEASE_PRICING_FIELDS.map((field) => renderFieldCard(field))}
            </div>
          </section>

          {/* Section 3: Branch Billing & Appliance Overrides */}
          <section className="sa-settings-section">
            <div className="sa-settings-section-header">
              <div>
                <h2 className="sa2-card-title">
                  Branch Operational & Appliance Governance
                </h2>
                <p className="sa-settings-section-copy">
                  Explicitly configure branch-level appliance surcharges and review
                  inherited global utility rate policies for each facility.
                </p>
              </div>
              <span className="sa-settings-section-pill">
                Branch Overrides
              </span>
            </div>

            <div className="sa-branch-matrix-grid">
              {Object.entries(form.branchOverrides || {}).map(
                ([branch, branchSettings]) => {
                  const meta = BRANCH_META[branch] || {
                    label: branch,
                    tag: branch,
                  };
                  const dirtyBranch = isBranchDirty(branch);
                  const isEnabled = Boolean(
                    branchSettings?.isApplianceFeeEnabled,
                  );

                  return (
                    <article
                      key={branch}
                      className={`sa-branch-matrix-card ${
                        dirtyBranch ? "sa-branch-matrix-card--dirty" : ""
                      }`}
                    >
                      <div className="sa-branch-matrix-header">
                        <div className="sa-branch-matrix-icon">
                          <Building2
                            size={20}
                            className={
                              branch === "gil-puyat"
                                ? "text-sky-600 dark:text-sky-400"
                                : "text-amber-600 dark:text-amber-400"
                            }
                          />
                        </div>
                        <div className="sa-branch-matrix-title-wrap">
                          <div className="flex items-center gap-2">
                            <h3 className="sa-branch-matrix-title">
                              {meta.label}
                            </h3>
                            {dirtyBranch && (
                              <span className="sa-settings-dirty-badge">
                                Modified
                              </span>
                            )}
                          </div>
                          <span className="sa-branch-matrix-tag">
                            {meta.tag}
                          </span>
                        </div>
                        <span
                          className={`sa-branch-status-pill ${
                            isEnabled
                              ? "sa-branch-status-pill--active"
                              : "sa-branch-status-pill--neutral"
                          }`}
                        >
                          {isEnabled ? "Surcharge Active" : "No Surcharge"}
                        </span>
                      </div>

                      {/* Policy Control Box */}
                      <div className="sa-branch-matrix-body">
                        <div className="sa-branch-control-block">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="sa-setting-label">
                                Enable Appliance Monthly Surcharge
                              </span>
                              <p className="sa-branch-control-sub">
                                Applies to tenant-registered appliances from the active catalog.
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              aria-label={`Toggle appliance surcharge for ${meta.label}`}
                              onClick={() =>
                                updateBranchField(
                                  branch,
                                  "isApplianceFeeEnabled",
                                  !isEnabled,
                                )
                              }
                              disabled={savingBranch === branch}
                              className={`sa-switch-btn ${
                                isEnabled ? "sa-switch-btn--active" : ""
                              } flex-shrink-0`}
                            >
                              <div className="sa-switch-thumb" />
                            </button>
                          </div>

                          <div className="mt-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                  Appliance Surcharge Catalog
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  {activeCatalogCount} Active
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {isEnabled
                                  ? "Itemized monthly surcharges applied per registered unit."
                                  : "Catalog configured (surcharges disabled for this branch)."}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setIsApplianceCatalogOpen(true)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 shadow-2xs flex items-center justify-center gap-1.5"
                            >
                              <Zap size={12} className="text-amber-500" />
                              <span>Manage Catalog</span>
                            </button>
                          </div>
                        </div>

                        {/* Inherited Policies Summary */}
                        <div className="sa-branch-inherited-strip">
                          <span className="sa-branch-inherited-label">
                            Inherited Network Defaults
                          </span>
                          <div className="sa-branch-inherited-row">
                            <span>Electricity Rate</span>
                            <strong>
                              PHP{" "}
                              {Number(
                                form.defaultElectricityRatePerKwh || 16,
                              ).toFixed(2)}{" "}
                              / kWh
                            </strong>
                          </div>
                          <div className="sa-branch-inherited-row">
                            <span>Reservation Fee</span>
                            <strong>
                              PHP{" "}
                              {Number(
                                form.reservationFeeAmount || 2000,
                              ).toLocaleString("en-PH")}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Audit Strip & Actions */}
                      <div className="sa-branch-matrix-footer">
                        <div className="sa-branch-matrix-audit">
                          <span>Last Override Change</span>
                          <strong>
                            {formatActor(branchSettings?.changedBy)}
                          </strong>
                          <span>
                            {formatTimestamp(branchSettings?.changedAt)}
                          </span>
                        </div>

                        <div className="sa-branch-matrix-actions">
                          {dirtyBranch && (
                            <button
                              type="button"
                              className="sa-settings-secondary-btn"
                              onClick={() => handleDiscardBranch(branch)}
                              disabled={savingBranch === branch}
                              title={`Discard pending modifications for ${meta.label}`}
                              aria-label={`Discard override changes for ${meta.label}`}
                            >
                              <RotateCcw size={13} />
                              Discard
                            </button>
                          )}
                          <button
                            type="button"
                            className="sa-settings-primary-btn"
                            onClick={() => saveBranchSettings(branch)}
                            disabled={
                              savingBranch === branch || !dirtyBranch
                            }
                            title={
                              !dirtyBranch
                                ? `No changes detected for ${meta.label}.`
                                : savingBranch === branch
                                ? "Saving branch override..."
                                : `Save override settings for ${meta.label}`
                            }
                            aria-label={`Save override for ${meta.label}`}
                          >
                            {savingBranch === branch ? (
                              <>
                                <Loader2
                                  size={13}
                                  className="animate-spin"
                                />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save size={13} />
                                Save Override
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </section>

          {/* Section 4: Reservation Lifecycle & Automation */}
          <section className="sa-settings-section">
            <div className="sa-settings-section-header">
              <div>
                <h2 className="sa2-card-title">
                  Reservation Lifecycle & Automation
                </h2>
                <p className="sa-settings-section-copy">
                  Automated timing rules and timeout windows executed by background
                  schedulers to release abandoned beds and archive old records.
                </p>
              </div>
              <span className="sa-settings-section-pill">
                Scheduler Enforced
              </span>
            </div>

            {/* Symmetrical 4-Column Grid */}
            <div className="sa-settings-form-grid sa-settings-form-grid--4col">
              {LIFECYCLE_FIELDS.map((field) => renderFieldCard(field))}
            </div>

            {/* Bottom Audit Notice & Actions */}
            <div className="sa-settings-footer">
              <div className="sa-settings-footer-copy">
                <strong>Audit Compliance Guarantee</strong>
                <span>
                  All modifications to business policies and branch overrides are
                  cryptographically stamped and recorded in the immutable audit trail.
                </span>
              </div>

              <div className="sa-settings-footer-actions">
                {isPoliciesDirty && (
                  <button
                    type="button"
                    className="sa-settings-secondary-btn"
                    onClick={handleDiscardPolicies}
                    disabled={savingPolicies}
                    title="Discard all pending modifications and revert to saved baselines"
                    aria-label="Discard all unsaved policy changes"
                  >
                    <RotateCcw size={13} />
                    Discard Changes
                  </button>
                )}
                <button
                  type="button"
                  className="sa-settings-primary-btn"
                  onClick={savePolicySettings}
                  disabled={
                    loading ||
                    savingPolicies ||
                    !isPoliciesDirty ||
                    hasValidationErrors
                  }
                  title={
                    !isPoliciesDirty
                      ? "No policy changes detected. Modify any value above to enable saving."
                      : hasValidationErrors
                      ? "Please correct invalid input values before saving."
                      : savingPolicies
                      ? "Saving operational policies..."
                      : "Save operational policies to system defaults"
                  }
                  aria-label={
                    isPoliciesDirty
                      ? `Save ${dirtyPolicyKeys.length} policy changes`
                      : "Save policies"
                  }
                >
                  {savingPolicies ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Saving Policies...
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      Save Policies {isPoliciesDirty ? `(${dirtyPolicyKeys.length})` : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Appliance Surcharge Catalog Management Modal */}
      <ApplianceCatalogModal
        isOpen={isApplianceCatalogOpen}
        onClose={() => setIsApplianceCatalogOpen(false)}
      />
    </div>
  );
}
