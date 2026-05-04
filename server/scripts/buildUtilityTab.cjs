const fs = require('fs');

const p = 'd:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/components/billing/ElectricityBillingTab.jsx';
let content = fs.readFileSync(p, 'utf8');

// Replacements
content = content.replace(/ElectricityBillingTab/g, 'UtilityBillingTab');
content = content.replace(/useElectricityRooms/g, 'useUtilityRooms');
content = content.replace(/useMeterReadings/g, 'useUtilityReadings');
content = content.replace(/useLatestReading/g, 'useUtilityLatestReading');
content = content.replace(/useBillingPeriods/g, 'useUtilityPeriods');
content = content.replace(/useBillingResult/g, 'useUtilityResult');
content = content.replace(/useOpenPeriod/g, 'useOpenUtilityPeriod');
content = content.replace(/useUpdatePeriod/g, 'useUpdateUtilityPeriod');
content = content.replace(/useClosePeriod/g, 'useCloseUtilityPeriod');
content = content.replace(/useBatchClosePeriods/g, 'useBatchCloseUtilityPeriods');
content = content.replace(/useReviseResult/g, 'useReviseUtilityResult');
content = content.replace(/useDeleteReading/g, 'useDeleteUtilityReading');
content = content.replace(/useUpdateReading/g, 'useUpdateUtilityReading');
content = content.replace(/useDeletePeriod/g, 'useDeleteUtilityPeriod');

content = content.replace(/\.\.\/\.\.\/\.\.\/\.\.\/shared\/hooks\/queries\/useElectricity/g, '../../../../shared/hooks/queries/useUtility');
content = content.replace(/\.\.\/\.\.\/\.\.\/\.\.\/shared\/api\/electricityApi\.js/g, '../../../../shared/api/utilityApi.js');
content = content.replace(/electricityApi/g, 'utilityApi');

// The component param
content = content.replace(/const UtilityBillingTab = \(\) => \{/g, 'const UtilityBillingTab = ({ utilityType }) => {');

// Fix the hooks passing utilityType
content = content.replace(/useUtilityRooms\(branchFilter\)/g, 'useUtilityRooms(utilityType, branchFilter)');
content = content.replace(/useUtilityReadings\(selectedRoomId\)/g, 'useUtilityReadings(utilityType, selectedRoomId)');
content = content.replace(/useUtilityLatestReading\(selectedRoomId\)/g, 'useUtilityLatestReading(utilityType, selectedRoomId)');
content = content.replace(/useUtilityPeriods\(selectedRoomId\)/g, 'useUtilityPeriods(utilityType, selectedRoomId)');
content = content.replace(/useUtilityResult\(selectedPeriodId\)/g, 'useUtilityResult(utilityType, selectedPeriodId)');

content = content.replace(/useOpenUtilityPeriod\(\)/g, 'useOpenUtilityPeriod(utilityType)');
content = content.replace(/useUpdateUtilityPeriod\(\)/g, 'useUpdateUtilityPeriod(utilityType)');
content = content.replace(/useCloseUtilityPeriod\(\)/g, 'useCloseUtilityPeriod(utilityType)');
content = content.replace(/useBatchCloseUtilityPeriods\(\)/g, 'useBatchCloseUtilityPeriods(utilityType)');
content = content.replace(/useReviseUtilityResult\(\)/g, 'useReviseUtilityResult(utilityType)');
content = content.replace(/useDeleteUtilityReading\(\)/g, 'useDeleteUtilityReading(utilityType)');
content = content.replace(/useUpdateUtilityReading\(\)/g, 'useUpdateUtilityReading(utilityType)');
content = content.replace(/useDeleteUtilityPeriod\(\)/g, 'useDeleteUtilityPeriod(utilityType)');

// Adjust strings
content = content.replace(/`electricity_billing_\$\{branchFilter \|\| "all"\}_\$\{getTodayInput\(\)\}`/g, '`${utilityType}_billing_${branchFilter || "all"}_${getTodayInput()}`');
content = content.replace(/Electricity/g, '{utilityType === "electricity" ? "Electricity" : "Water"}');
content = content.replace(/ratePerKwh/g, 'ratePerUnit');
content = content.replace(/kwhConsumed/g, 'computedTotalUsage');
content = content.replace(/totalRoomKwh/g, 'computedTotalUsage');
content = content.replace(/totalKwh/g, 'totalUsage');
content = content.replace(/ sharePerTenantKwh/g, ' sharePerTenantUnits');
content = content.replace(/kWh/g, '{utilityType === "electricity" ? "kWh" : "cu.m."}');
content = content.replace(/UTILITY_EXPORT_COLUMNS/g, 'UTILITY_EXPORT_COLUMNS');

// Replace rate defaults logic
content = content.replace(
  /const defaultRatePerUnit = businessSettings\?\.default\{utilityType === \"electricity\" \? \"Electricity\" \: \"Water\"\}RatePerCubicMeter \?\? \"\";/g, 
  'const defaultRatePerUnit = utilityType === "electricity" ? businessSettings?.defaultElectricityRatePerKwh : businessSettings?.defaultWaterRatePerCubicMeter;'
);

fs.writeFileSync('d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/features/admin/components/billing/UtilityBillingTab.jsx', content);
console.log("Done");
