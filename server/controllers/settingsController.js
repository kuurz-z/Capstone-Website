import {
  DEFAULT_BRANCH_OVERRIDES,
  getBranchSettings,
  getBusinessSettings,
  mergeBranchOverrides,
  serializeBusinessSettings,
} from "../utils/businessSettings.js";
import { sendSuccess } from "../middleware/errorHandler.js";
import auditLogger from "../utils/auditLogger.js";

const WHOLE_NUMBER_FIELDS = new Set([
  "noShowGraceDays",
  "stalePendingHours",
  "staleVisitPendingHours",
  "visitPendingWarnDays",
  "staleVisitApprovedHours",
  "stalePaymentPendingHours",
  "archiveCancelledAfterDays",
]);

const FIELD_ERROR_LABELS = Object.freeze({
  reservationFeeAmount: "Reservation fee amount",
  penaltyRatePerDay: "Penalty rate per day",
  defaultElectricityRatePerKwh: "Default electricity rate",
  defaultWaterRatePerUnit: "Default water rate",
  noShowGraceDays: "No-show grace days",
  stalePendingHours: "Stale pending hours",
  staleVisitPendingHours: "Stale visit pending hours",
  visitPendingWarnDays: "Visit pending warn days",
  staleVisitApprovedHours: "Stale visit approved hours",
  stalePaymentPendingHours: "Stale payment pending hours",
  archiveCancelledAfterDays: "Archive cancelled after days",
  applianceFeeAmountPerUnit: "Appliance fee amount",
});

const SETTINGS_ENTITY_TYPE = "business_settings";

const buildSettingsPayload = (settings) => serializeBusinessSettings(settings);

const buildComparablePayload = (payload) => ({
  reservationFeeAmount: payload.reservationFeeAmount,
  penaltyRatePerDay: payload.penaltyRatePerDay,
  defaultElectricityRatePerKwh: payload.defaultElectricityRatePerKwh,
  defaultWaterRatePerUnit: payload.defaultWaterRatePerUnit,
  noShowGraceDays: payload.noShowGraceDays,
  stalePendingHours: payload.stalePendingHours,
  staleVisitPendingHours: payload.staleVisitPendingHours,
  visitPendingWarnDays: payload.visitPendingWarnDays,
  staleVisitApprovedHours: payload.staleVisitApprovedHours,
  stalePaymentPendingHours: payload.stalePaymentPendingHours,
  archiveCancelledAfterDays: payload.archiveCancelledAfterDays,
  branchOverrides: payload.branchOverrides,
});

const buildBranchComparablePayload = (settings) => ({
  isApplianceFeeEnabled: settings.isApplianceFeeEnabled,
  applianceFeeAmountPerUnit: settings.applianceFeeAmountPerUnit,
});

const areEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

const resolveRequestRole = (req) => {
  if (req?.user?.dbRole) return req.user.dbRole;
  if (req?.user?.role) return req.user.role;
  if (req?.user?.owner) return "owner";
  if (req?.user?.branch_admin) return "branch_admin";
  return "";
};

const buildChangedBy = (req) => ({
  userId: req?.user?.mongoId || req?.user?.uid || null,
  email: req?.user?.email || "",
  role: resolveRequestRole(req),
});

const normalizeNumberField = (value, fieldKey) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: `${FIELD_ERROR_LABELS[fieldKey]} must be a non-negative number`,
    };
  }

  if (WHOLE_NUMBER_FIELDS.has(fieldKey) && !Number.isInteger(parsed)) {
    return {
      error: `${FIELD_ERROR_LABELS[fieldKey]} must be a non-negative whole number`,
    };
  }

  return { value: parsed };
};

const logSettingsChange = async (req, settings, beforePayload, afterPayload, action) => {
  await auditLogger.logModification(
    req,
    SETTINGS_ENTITY_TYPE,
    settings?._id || settings?.key || "global",
    beforePayload,
    afterPayload,
    action,
  );
};

export async function getBusinessRules(req, res, next) {
  try {
    const settings = await getBusinessSettings();
    sendSuccess(res, buildSettingsPayload(settings));
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessRules(req, res, next) {
  try {
    const settings = await getBusinessSettings();
    const beforePayload = buildSettingsPayload(settings);
    const touchedBranchOverrides = {};
    let branchOverridePatch = null;

    for (const fieldKey of Object.keys(FIELD_ERROR_LABELS)) {
      if (
        fieldKey === "applianceFeeAmountPerUnit" ||
        req.body[fieldKey] === undefined
      ) {
        continue;
      }

      const result = normalizeNumberField(req.body[fieldKey], fieldKey);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      settings[fieldKey] = result.value;
    }

    if (req.body.branchOverrides !== undefined) {
      branchOverridePatch = {};

      for (const [branch, overridePatch] of Object.entries(req.body.branchOverrides || {})) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_BRANCH_OVERRIDES, branch)) {
          return res.status(400).json({
            error: `Unsupported branch override: ${branch}`,
          });
        }

        const nextPatch = {};

        if (overridePatch?.isApplianceFeeEnabled !== undefined) {
          nextPatch.isApplianceFeeEnabled = Boolean(
            overridePatch.isApplianceFeeEnabled,
          );
        }

        if (overridePatch?.applianceFeeAmountPerUnit !== undefined) {
          const result = normalizeNumberField(
            overridePatch.applianceFeeAmountPerUnit,
            "applianceFeeAmountPerUnit",
          );
          if (result.error) {
            return res.status(400).json({ error: result.error });
          }
          nextPatch.applianceFeeAmountPerUnit = result.value;
        }

        branchOverridePatch[branch] = nextPatch;
        touchedBranchOverrides[branch] = true;
      }

      settings.branchOverrides = mergeBranchOverrides(
        settings.branchOverrides,
        branchOverridePatch,
      );
    }

    const comparableBefore = buildComparablePayload(beforePayload);
    const comparableAfter = buildComparablePayload(buildSettingsPayload(settings));

    if (!areEqual(comparableBefore, comparableAfter)) {
      const changedAt = new Date();
      const changedBy = buildChangedBy(req);

      settings.changedBy = changedBy;
      settings.changedAt = changedAt;

      if (Object.keys(touchedBranchOverrides).length > 0) {
        const branchOverrides = mergeBranchOverrides(settings.branchOverrides);
        for (const branch of Object.keys(touchedBranchOverrides)) {
          branchOverrides[branch] = {
            ...branchOverrides[branch],
            changedBy,
            changedAt,
          };
        }
        settings.branchOverrides = branchOverrides;
      }

      await settings.save();
      const afterPayload = buildSettingsPayload(settings);
      await logSettingsChange(
        req,
        settings,
        beforePayload,
        afterPayload,
        "Updated business settings",
      );

      sendSuccess(res, afterPayload);
      return;
    }

    sendSuccess(res, beforePayload);
  } catch (error) {
    next(error);
  }
}

export async function updateBranchBillingSettings(req, res, next) {
  try {
    const branch = String(req.params.branch || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_BRANCH_OVERRIDES, branch)) {
      return res.status(400).json({ error: "Unsupported branch for billing overrides" });
    }

    const settings = await getBusinessSettings();
    const beforePayload = buildSettingsPayload(settings);
    const current = getBranchSettings(branch, settings);
    const nextSettings = { ...current };

    if (req.body.isApplianceFeeEnabled !== undefined) {
      nextSettings.isApplianceFeeEnabled = Boolean(req.body.isApplianceFeeEnabled);
    }

    if (req.body.applianceFeeAmountPerUnit !== undefined) {
      const result = normalizeNumberField(
        req.body.applianceFeeAmountPerUnit,
        "applianceFeeAmountPerUnit",
      );
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      nextSettings.applianceFeeAmountPerUnit = result.value;
    }

    if (
      areEqual(
        buildBranchComparablePayload(current),
        buildBranchComparablePayload(nextSettings),
      )
    ) {
      sendSuccess(res, {
        ...beforePayload,
        branch,
        settings: current,
      });
      return;
    }

    const changedAt = new Date();
    const changedBy = buildChangedBy(req);
    settings.changedBy = changedBy;
    settings.changedAt = changedAt;
    settings.branchOverrides = mergeBranchOverrides(settings.branchOverrides, {
      [branch]: {
        ...nextSettings,
        changedBy,
        changedAt,
      },
    });

    await settings.save();

    const afterPayload = buildSettingsPayload(settings);
    await logSettingsChange(
      req,
      settings,
      beforePayload,
      afterPayload,
      `Updated ${branch} branch billing override`,
    );

    sendSuccess(res, {
      ...afterPayload,
      branch,
      settings: getBranchSettings(branch, settings),
    });
  } catch (error) {
    next(error);
  }
}
