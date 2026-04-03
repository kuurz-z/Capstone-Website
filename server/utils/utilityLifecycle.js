import { UtilityPeriod } from "../models/index.js";
import {
  getDefaultElectricityRatePerKwh,
  getDefaultWaterRatePerUnit,
} from "./businessSettings.js";
import {
  getUtilityTargetCloseDate,
  resolveUtilityAutoOpenStartDate,
} from "./billingPolicy.js";

function resolveUtilityRate(utilityType, previousRate, defaultRate) {
  if (previousRate !== undefined && previousRate !== null) {
    return previousRate;
  }
  return defaultRate;
}

export async function ensureOpenUtilityPeriodForRoom({
  utilityType,
  room,
  anchorDate,
  anchorReading,
}) {
  const existingOpenPeriod = await UtilityPeriod.findOne({
    utilityType,
    roomId: room._id,
    status: "open",
    isArchived: false,
  });

  if (existingOpenPeriod) {
    return {
      period: existingOpenPeriod,
      created: false,
      targetCloseDate: getUtilityTargetCloseDate(existingOpenPeriod.startDate),
    };
  }

  const previousPeriod = await UtilityPeriod.findOne({
    utilityType,
    roomId: room._id,
    isArchived: false,
  })
    .sort({ startDate: -1 })
    .lean();

  let configuredRate;
  if (utilityType === "electricity") {
    configuredRate = await getDefaultElectricityRatePerKwh();
  } else {
    configuredRate = await getDefaultWaterRatePerUnit();
  }
  
  const ratePerUnit = resolveUtilityRate(
    utilityType,
    previousPeriod?.ratePerUnit,
    configuredRate,
  );
  
  const periodStartDate = resolveUtilityAutoOpenStartDate({
    anchorDate,
    previousPeriodEndDate: previousPeriod?.endDate || null,
  });

  const period = await UtilityPeriod.create({
    utilityType,
    roomId: room._id,
    branch: room.branch,
    startDate: periodStartDate || new Date(anchorDate),
    startReading: Number(anchorReading),
    ratePerUnit,
    status: "open",
  });

  return {
    period,
    created: true,
    targetCloseDate: getUtilityTargetCloseDate(period.startDate),
  };
}
