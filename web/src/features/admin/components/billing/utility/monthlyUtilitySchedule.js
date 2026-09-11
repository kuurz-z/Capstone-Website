// Calendar dates are interpreted in the property's timezone, not the browser's.
export function utilityDateInput(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

export function nextMonthlyCutoff(value) {
  const date = utilityDateInput(value);
  if (!date) return '';
  let [year,month,day] = date.split('-').map(Number);
  if (day >= 15) { month += 1; if (month > 12) { month = 1; year += 1; } }
  return `${year}-${String(month).padStart(2,'0')}-15`;
}

export function openingOnDate({date, activePeriod, readings = []}) {
  if (activePeriod && utilityDateInput(activePeriod.startDate) === date) {
    return {date:activePeriod.startDate,reading:activePeriod.startReading};
  }
  return readings.filter(item => !item.isArchived && !['corrected','voided'].includes(item.readingStatus) && !item.supersededByReadingId && utilityDateInput(item.date) === date)
    .sort((a,b) => +new Date(a.date)-+new Date(b.date) || +new Date(a.createdAt || 0)-+new Date(b.createdAt || 0))[0] || null;
}

export function defaultUtilityOpening({activePeriod, lastClosedPeriod, latestReading}) {
  if (activePeriod) return {date:activePeriod.startDate,reading:activePeriod.startReading};
  const previous = lastClosedPeriod?.endDate && lastClosedPeriod?.endReading != null
    ? {date:lastClosedPeriod.endDate,reading:lastClosedPeriod.endReading} : null;
  const latest = latestReading?.date && latestReading?.reading != null && !latestReading.isArchived && !['corrected','voided'].includes(latestReading.readingStatus) && !latestReading.supersededByReadingId ? latestReading : null;
  // An ordinary in-cycle reading must not silently discard usage since the
  // previous close. Only an explicitly established new baseline supersedes it.
  const newBaseline = ['periodStart','meterReplacement','meterRollover'].includes(latest?.eventType);
  return latest && (!previous || (newBaseline && +new Date(latest.date)>+new Date(previous.date))) ? latest : previous;
}
