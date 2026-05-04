/**
 * PSGC Cloud API Utility
 *
 * Philippine Standard Geographic Code — https://psgc.cloud
 * Free, no auth required, public reference data.
 *
 * Cascading geographic data:
 *   Regions → Provinces → Cities/Municipalities → Barangays
 *
 * NCR (code 1300000000) has no provinces — cities sit directly under the region.
 * NCR cities-municipalities endpoint includes SubMun types which we filter out.
 */

const BASE = "https://psgc.cloud/api";

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PSGC API error: ${res.status}`);
  return res.json();
};

/** Fetch all 17 regions, sorted by name */
export const getRegions = async () => {
  const data = await fetchJson(`${BASE}/regions`);
  return data
    .map((r) => ({ code: r.code, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Fetch provinces for a region (returns [] for NCR) */
export const getProvinces = async (regionCode) => {
  const data = await fetchJson(`${BASE}/regions/${regionCode}/provinces`);
  return data
    .map((p) => ({ code: p.code, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Fetch cities/municipalities.
 * - If provinceCode is provided → cities under that province.
 * - If only regionCode → cities directly under the region (for NCR).
 * Filters out SubMun types (e.g. Tondo, Binondo) for NCR.
 */
export const getCities = async (provinceCode, regionCode) => {
  const url = provinceCode
    ? `${BASE}/provinces/${provinceCode}/cities-municipalities`
    : `${BASE}/regions/${regionCode}/cities-municipalities`;
  const data = await fetchJson(url);
  return data
    .filter((c) => c.type === "City" || c.type === "Mun")
    .map((c) => ({ code: c.code, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Fetch barangays for a city/municipality */
export const getBarangays = async (cityCode) => {
  const data = await fetchJson(
    `${BASE}/cities-municipalities/${cityCode}/barangays`
  );
  return data
    .map((b) => ({ code: b.code, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** NCR region code — has no provinces, cities sit directly under it */
export const NCR_CODE = "1300000000";
