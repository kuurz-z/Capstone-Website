import BusinessSettings from "../models/BusinessSettings.js";
import { BUSINESS } from "../config/constants.js";

const GLOBAL_KEY = "global";

export const DEFAULT_BRANCH_OVERRIDES = Object.freeze({
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
});

export const DEFAULT_POLICY_SETTINGS = Object.freeze({
  noShowGraceDays: BUSINESS.NOSHOW_GRACE_DAYS,
  stalePendingHours: BUSINESS.STALE_PENDING_HOURS,
  staleVisitPendingHours: BUSINESS.STALE_VISIT_PENDING_HOURS,
  visitPendingWarnDays: BUSINESS.VISIT_PENDING_WARN_DAYS,
  staleVisitApprovedHours: BUSINESS.STALE_VISIT_APPROVED_HOURS,
  stalePaymentPendingHours: BUSINESS.STALE_PAYMENT_PENDING_HOURS,
  archiveCancelledAfterDays: BUSINESS.ARCHIVE_CANCELLED_AFTER_DAYS,
});

export const DEFAULT_BUSINESS_SETTINGS = Object.freeze({
  reservationFeeAmount: BUSINESS.DEPOSIT_AMOUNT,
  penaltyRatePerDay: BUSINESS.PENALTY_RATE_PER_DAY,
  defaultElectricityRatePerKwh: BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH,
  defaultWaterRatePerUnit: 0,
  ...DEFAULT_POLICY_SETTINGS,
});

const BRANCH_OVERRIDE_KEYS = Object.keys(DEFAULT_BRANCH_OVERRIDES);
const POLICY_SETTING_KEYS = Object.keys(DEFAULT_POLICY_SETTINGS);
const BUSINESS_SETTING_KEYS = Object.keys(DEFAULT_BUSINESS_SETTINGS);

const parseFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeChangedBy = (value) => {
  if (!value || typeof value !== "object") return null;

  const userId =
    value.userId != null && value.userId !== ""
      ? String(value.userId)
      : null;
  const email = value.email ? String(value.email) : "";
  const role = value.role ? String(value.role) : "";

  if (!userId && !email && !role) {
    return null;
  }

  return {
    userId,
    email,
    role,
  };
};

const toSourceObject = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value && typeof value.toObject === "function") {
    return value.toObject();
  }

  return value || {};
};

const normalizeBranchOverride = (value, defaults) => {
  const source = toSourceObject(value);

  return {
    isApplianceFeeEnabled:
      source?.isApplianceFeeEnabled ?? defaults.isApplianceFeeEnabled,
    applianceFeeAmountPerUnit:
      parseFiniteNumber(source?.applianceFeeAmountPerUnit) ??
      defaults.applianceFeeAmountPerUnit,
    changedBy: normalizeChangedBy(source?.changedBy),
    changedAt: normalizeDate(source?.changedAt),
  };
};

function normalizeBranchOverrides(branchOverridesLike) {
  const source = toSourceObject(branchOverridesLike);
  const normalized = {};

  for (const branch of BRANCH_OVERRIDE_KEYS) {
    normalized[branch] = normalizeBranchOverride(
      source?.[branch],
      DEFAULT_BRANCH_OVERRIDES[branch],
    );
  }

  return normalized;
}

export function serializeBranchOverrides(branchOverridesLike) {
  return normalizeBranchOverrides(branchOverridesLike);
}

export function mergeBranchOverrides(currentOverridesLike, patchOverridesLike = {}) {
  const current = normalizeBranchOverrides(currentOverridesLike);
  const patch = toSourceObject(patchOverridesLike);
  const merged = { ...current };

  for (const branch of BRANCH_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, branch)) continue;

    merged[branch] = normalizeBranchOverride(
      {
        ...current[branch],
        ...toSourceObject(patch[branch]),
      },
      DEFAULT_BRANCH_OVERRIDES[branch],
    );
  }

  return merged;
}

export function serializeBusinessSettings(settingsLike = {}) {
  const source = toSourceObject(settingsLike);
  const serialized = {
    branchOverrides: normalizeBranchOverrides(source.branchOverrides),
    changedBy: normalizeChangedBy(source.changedBy),
    changedAt: normalizeDate(source.changedAt),
    updatedAt: normalizeDate(source.updatedAt),
  };

  for (const key of BUSINESS_SETTING_KEYS) {
    serialized[key] =
      parseFiniteNumber(source[key]) ?? DEFAULT_BUSINESS_SETTINGS[key];
  }

  return serialized;
}

export async function getBusinessSettings() {
  let settings = await BusinessSettings.findOne({ key: GLOBAL_KEY });

  if (!settings) {
    settings = await BusinessSettings.create({
      key: GLOBAL_KEY,
      ...DEFAULT_BUSINESS_SETTINGS,
      branchOverrides: DEFAULT_BRANCH_OVERRIDES,
      changedBy: null,
      changedAt: null,
    });
    return settings;
  }

  let changed = false;

  for (const key of BUSINESS_SETTING_KEYS) {
    if (settings[key] === undefined || settings[key] === null) {
      settings[key] = DEFAULT_BUSINESS_SETTINGS[key];
      changed = true;
    }
  }

  if (settings.changedBy === undefined) {
    settings.changedBy = null;
    changed = true;
  }

  if (settings.changedAt === undefined) {
    settings.changedAt = null;
    changed = true;
  }

  const currentBranchOverrides = toSourceObject(settings.branchOverrides);
  const normalizedBranchOverrides = normalizeBranchOverrides(currentBranchOverrides);
  if (
    JSON.stringify(currentBranchOverrides) !==
    JSON.stringify(normalizedBranchOverrides)
  ) {
    settings.branchOverrides = normalizedBranchOverrides;
    changed = true;
  }

  if (changed) {
    await settings.save();
  }

  return settings;
}

export async function getReservationFeeAmount() {
  const settings = await getBusinessSettings();
  return settings.reservationFeeAmount ?? BUSINESS.DEPOSIT_AMOUNT;
}

export async function getPenaltyRatePerDay() {
  const settings = await getBusinessSettings();
  return settings.penaltyRatePerDay ?? BUSINESS.PENALTY_RATE_PER_DAY;
}

export function resolvePenaltyRatePerDay(storedRatePerDay, configuredRatePerDay) {
  const stored = parseFiniteNumber(storedRatePerDay);
  if (stored !== null && stored > 0) return stored;

  const configured = parseFiniteNumber(configuredRatePerDay);
  if (configured !== null && configured > 0) return configured;

  return BUSINESS.PENALTY_RATE_PER_DAY;
}

export async function getDefaultElectricityRatePerKwh() {
  const settings = await getBusinessSettings();
  return settings.defaultElectricityRatePerKwh ?? BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH;
}

export function resolveElectricityRatePerKwh(previousRatePerKwh, defaultRatePerKwh) {
  const previous = parseFiniteNumber(previousRatePerKwh);
  if (previous !== null && previous > 0) return previous;

  const configured = parseFiniteNumber(defaultRatePerKwh);
  if (configured !== null && configured > 0) return configured;

  return BUSINESS.DEFAULT_ELECTRICITY_RATE_PER_KWH;
}

export async function getDefaultWaterRatePerUnit() {
  const settings = await getBusinessSettings();
  return settings.defaultWaterRatePerUnit ?? 0;
}

export function getBranchSettings(branch, settingsLike = null) {
  const normalizedBranch = String(branch || "").toLowerCase();
  const normalizedOverrides = normalizeBranchOverrides(
    settingsLike?.branchOverrides ?? settingsLike,
  );
  return (
    normalizedOverrides[normalizedBranch] || {
      isApplianceFeeEnabled: false,
      applianceFeeAmountPerUnit: 0,
      changedBy: null,
      changedAt: null,
    }
  );
}

export async function getBranchSettingsForBranch(branch) {
  const settings = await getBusinessSettings();
  return getBranchSettings(branch, settings);
}

export function isApplianceFeeEnabled(branch, settingsLike = null) {
  return !!getBranchSettings(branch, settingsLike).isApplianceFeeEnabled;
}

export function resolveWaterRatePerUnit(requestedRatePerUnit, defaultRatePerUnit) {
  const requestedProvided =
    requestedRatePerUnit !== undefined &&
    requestedRatePerUnit !== null &&
    requestedRatePerUnit !== "";

  if (requestedProvided) {
    return requestedRatePerUnit;
  }

  const configured = parseFiniteNumber(defaultRatePerUnit);
  return configured !== null ? configured : 0;
}

export function serializeLifecyclePolicySettings(settingsLike = {}) {
  const serialized = serializeBusinessSettings(settingsLike);

  return POLICY_SETTING_KEYS.reduce((acc, key) => {
    acc[key] = serialized[key];
    return acc;
  }, {});
}

export async function getLifecyclePolicySettings() {
  const settings = await getBusinessSettings();
  return serializeLifecyclePolicySettings(settings);
}
