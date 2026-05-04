import React, { useState, useEffect, useCallback } from "react";
import {
 getRegions,
 getProvinces,
 getCities,
 getBarangays,
 NCR_CODE,
} from "../../../../../shared/utils/psgcApi";

/**
 * Cascading Philippine address dropdowns powered by PSGC API.
 *
 * ALL fields are visible at all times. Each level unlocks once the
 * previous level has been selected:
 * Region → Province → City/Municipality → Barangay
 *
 * NCR has no provinces — cities load directly under the region.
 *
 * Stores the human-readable name for each level so the form
 * saves the display name (not the PSGC code).
 */
const AddressCascadeFields = ({
 // Street / unit (freetext)
 addressUnitHouseNo,
 setAddressUnitHouseNo,
 addressStreet,
 setAddressStreet,
 // Region (new)
 addressRegion,
 setAddressRegion,
 // PSGC-powered
 addressBarangay,
 setAddressBarangay,
 addressCity,
 setAddressCity,
 addressProvince,
 setAddressProvince,
 // Handlers from parent
 handleGeneralInput,
 validateField,
 fieldErrors,
 showValidationErrors,
}) => {
 // ── PSGC data caches ────────────────────────────────────────
 const [regions, setRegions] = useState([]);
 const [provinces, setProvinces] = useState([]);
 const [cities, setCities] = useState([]);
 const [barangays, setBarangays] = useState([]);

 // ── Selected codes (for cascading) ──────────────────────────
 const [selectedRegionCode, setSelectedRegionCode] = useState("");
 const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
 const [selectedCityCode, setSelectedCityCode] = useState("");
 const [isNCR, setIsNCR] = useState(false);

 // ── Loading flags ───────────────────────────────────────────
 const [loadingRegions, setLoadingRegions] = useState(true);
 const [loadingProvinces, setLoadingProvinces] = useState(false);
 const [loadingCities, setLoadingCities] = useState(false);
 const [loadingBarangays, setLoadingBarangays] = useState(false);

 // ── Load regions on mount ───────────────────────────────────
 useEffect(() => {
 getRegions()
 .then(setRegions)
 .catch(console.error)
 .finally(() => setLoadingRegions(false));
 }, []);

 // ── Restore saved values on load ────────────────────────────
 // When regions finish loading and we have a saved addressRegion,
 // reverse-lookup PSGC codes to re-initialize the cascade.
 const restoredRef = React.useRef(false);
 useEffect(() => {
 if (restoredRef.current || regions.length === 0 || !addressRegion) return;
 restoredRef.current = true;

 const restore = async () => {
 // 1. Find region code from saved name
 const regionObj = regions.find(
 (r) => r.name === addressRegion || r.name.toLowerCase() === addressRegion.toLowerCase(),
 );
 if (!regionObj) return;

 setSelectedRegionCode(regionObj.code);
 const isNcrRegion = regionObj.code === NCR_CODE;
 setIsNCR(isNcrRegion);

 if (isNcrRegion) {
 // NCR: load cities directly
 try {
 const cityList = await getCities(null, regionObj.code);
 setCities(cityList);
 if (addressCity) {
 const cityObj = cityList.find(
 (c) => c.name === addressCity || c.name.toLowerCase() === addressCity.toLowerCase(),
 );
 if (cityObj) {
 setSelectedCityCode(cityObj.code);
 const brgyList = await getBarangays(cityObj.code);
 setBarangays(brgyList);
 }
 }
 } catch (err) {
 console.error("Failed to restore NCR cascade:", err);
 }
 } else {
 // Non-NCR: load provinces → find match → load cities → find match → load barangays
 try {
 const provList = await getProvinces(regionObj.code);
 setProvinces(provList);
 if (addressProvince) {
 const provObj = provList.find(
 (p) => p.name === addressProvince || p.name.toLowerCase() === addressProvince.toLowerCase(),
 );
 if (provObj) {
 setSelectedProvinceCode(provObj.code);
 const cityList = await getCities(provObj.code);
 setCities(cityList);
 if (addressCity) {
 const cityObj = cityList.find(
 (c) => c.name === addressCity || c.name.toLowerCase() === addressCity.toLowerCase(),
 );
 if (cityObj) {
 setSelectedCityCode(cityObj.code);
 const brgyList = await getBarangays(cityObj.code);
 setBarangays(brgyList);
 }
 }
 }
 }
 } catch (err) {
 console.error("Failed to restore cascade:", err);
 }
 }
 };

 restore();
 }, [regions, addressRegion, addressProvince, addressCity]);

 // ── Region change → load provinces (or cities for NCR) ──────
 const handleRegionChange = useCallback(
 async (code) => {
 setSelectedRegionCode(code);
 setSelectedProvinceCode("");
 setSelectedCityCode("");
 setProvinces([]);
 setCities([]);
 setBarangays([]);
 setAddressProvince("");
 setAddressCity("");
 setAddressBarangay("");

 if (!code) {
 setAddressRegion("");
 setIsNCR(false);
 return;
 }

 const regionObj = regions.find((r) => r.code === code);
 setAddressRegion(regionObj?.name || "");
 const isNcrRegion = code === NCR_CODE;
 setIsNCR(isNcrRegion);

 if (isNcrRegion) {
 // NCR → skip provinces, load cities directly
 setAddressProvince(regionObj?.name || "NCR");
 setLoadingCities(true);
 try {
 const data = await getCities(null, code);
 setCities(data);
 } catch (err) {
 console.error("Failed to load NCR cities:", err);
 }
 setLoadingCities(false);
 } else {
 setLoadingProvinces(true);
 try {
 const data = await getProvinces(code);
 setProvinces(data);
 } catch (err) {
 console.error("Failed to load provinces:", err);
 }
 setLoadingProvinces(false);
 }
 },
 [regions, setAddressRegion, setAddressProvince, setAddressCity, setAddressBarangay],
 );

 // ── Province change → load cities ───────────────────────────
 const handleProvinceChange = useCallback(
 async (code) => {
 setSelectedProvinceCode(code);
 setSelectedCityCode("");
 setCities([]);
 setBarangays([]);
 setAddressCity("");
 setAddressBarangay("");

 if (!code) {
 setAddressProvince("");
 return;
 }

 const provObj = provinces.find((p) => p.code === code);
 setAddressProvince(provObj?.name || "");

 setLoadingCities(true);
 try {
 const data = await getCities(code);
 setCities(data);
 } catch (err) {
 console.error("Failed to load cities:", err);
 }
 setLoadingCities(false);
 },
 [provinces, setAddressProvince, setAddressCity, setAddressBarangay],
 );

 // ── City change → load barangays ────────────────────────────
 const handleCityChange = useCallback(
 async (code) => {
 setSelectedCityCode(code);
 setBarangays([]);
 setAddressBarangay("");

 if (!code) {
 setAddressCity("");
 return;
 }

 const cityObj = cities.find((c) => c.code === code);
 setAddressCity(cityObj?.name || "");

 setLoadingBarangays(true);
 try {
 const data = await getBarangays(code);
 setBarangays(data);
 } catch (err) {
 console.error("Failed to load barangays:", err);
 }
 setLoadingBarangays(false);
 },
 [cities, setAddressCity, setAddressBarangay],
 );

 // ── Barangay change ─────────────────────────────────────────
 const handleBarangayChange = useCallback(
 (name) => {
 setAddressBarangay(name);
 },
 [setAddressBarangay],
 );

 // ── Derived lock states ─────────────────────────────────────
 const regionSelected = Boolean(selectedRegionCode);
 const provinceReady = isNCR || Boolean(selectedProvinceCode);
 const cityReady = Boolean(selectedCityCode);

 // ── Error border helper ─────────────────────────────────────
 const errBorder = (show, value) =>
 show && !value ? "1.5px solid #dc2626" : undefined;

 // ── Shared styles ───────────────────────────────────────────
 const selectStyle = (disabled) => ({
 width: "100%",
 padding: "10px 12px",
 borderRadius: "8px",
 border: "1.5px solid #d1d5db",
 fontSize: "14px",
 background: disabled ? "#f3f4f6" : "white",
 cursor: disabled ? "not-allowed" : "pointer",
 color: disabled ? "#9CA3AF" : "#1F2937",
 opacity: disabled ? 0.7 : 1,
 });

 return (
 <>
 {/* Unit / House No. */}
 <div className="form-group" data-field="addressUnitHouseNo">
 <label className="form-label">
 Unit / House No. <span className="rf-required">*</span>
 </label>
 <input
 type="text"
 className="form-input"
 placeholder="e.g., 123-A"
 maxLength={64}
 value={addressUnitHouseNo}
 onChange={(e) => handleGeneralInput(e.target.value, setAddressUnitHouseNo, 64)}
 onBlur={() =>
 validateField("addressUnitHouseNo", addressUnitHouseNo, (v) => ({
 valid: Boolean(v?.trim()),
 error: v?.trim() ? null : "This field is required",
 }))
 }
 style={{ border: errBorder(showValidationErrors, addressUnitHouseNo) || "1.5px solid #999" }}
 />
 {(showValidationErrors && !addressUnitHouseNo) || fieldErrors.addressUnitHouseNo ? (
 <div className="rf-field-error">
 {showValidationErrors && !addressUnitHouseNo
 ? "Unit / House No. is required"
 : fieldErrors.addressUnitHouseNo}
 </div>
 ) : null}
 </div>

 {/* Street */}
 <div className="form-group" data-field="addressStreet">
 <label className="form-label">
 Street <span className="rf-required">*</span>
 </label>
 <input
 type="text"
 className="form-input"
 placeholder="e.g., Rizal Street"
 maxLength={64}
 value={addressStreet}
 onChange={(e) => handleGeneralInput(e.target.value, setAddressStreet, 64)}
 onBlur={() =>
 validateField("addressStreet", addressStreet, (v) => ({
 valid: Boolean(v?.trim()),
 error: v?.trim() ? null : "This field is required",
 }))
 }
 style={{ border: errBorder(showValidationErrors, addressStreet) || "1.5px solid #999" }}
 />
 {(showValidationErrors && !addressStreet) || fieldErrors.addressStreet ? (
 <div className="rf-field-error">
 {showValidationErrors && !addressStreet
 ? "Street is required"
 : fieldErrors.addressStreet}
 </div>
 ) : null}
 </div>

 {/* Region */}
 <div className="form-group" data-field="addressRegion">
 <label className="form-label">
 Region <span className="rf-required">*</span>
 </label>
 <select
 style={{
 ...selectStyle(false),
 border: errBorder(showValidationErrors, addressRegion) || "1.5px solid #d1d5db",
 }}
 value={selectedRegionCode}
 onChange={(e) => handleRegionChange(e.target.value)}
 disabled={loadingRegions}
 >
 <option value="">
 {loadingRegions ? "Loading regions..." : "Select region..."}
 </option>
 {regions.map((r) => (
 <option key={r.code} value={r.code}>
 {r.name}
 </option>
 ))}
 </select>
 {showValidationErrors && !addressRegion && (
 <div className="rf-field-error">
 Region is required
 </div>
 )}
 </div>

 {/* Province (disabled until region is selected, hidden for NCR) */}
 {!isNCR && (
 <div className="form-group" data-field="addressProvince">
 <label className="form-label">
 Province <span className="rf-required">*</span>
 </label>
 <select
 style={{
 ...selectStyle(!regionSelected),
 border: errBorder(showValidationErrors && regionSelected, addressProvince) || "1.5px solid #d1d5db",
 }}
 value={selectedProvinceCode}
 onChange={(e) => handleProvinceChange(e.target.value)}
 disabled={!regionSelected || loadingProvinces}
 >
 <option value="">
 {!regionSelected
 ? "Select a region first..."
 : loadingProvinces
 ? "Loading provinces..."
 : "Select province..."}
 </option>
 {provinces.map((p) => (
 <option key={p.code} value={p.code}>
 {p.name}
 </option>
 ))}
 </select>
 {showValidationErrors && regionSelected && !addressProvince && (
 <div className="rf-field-error">
 Province is required
 </div>
 )}
 </div>
 )}

 {/* City / Municipality (disabled until province is selected) */}
 <div className="form-group" data-field="addressCity">
 <label className="form-label">
 City / Municipality <span className="rf-required">*</span>
 </label>
 <select
 style={{
 ...selectStyle(!provinceReady || !regionSelected),
 border: errBorder(showValidationErrors && provinceReady && regionSelected, addressCity) || "1.5px solid #d1d5db",
 }}
 value={selectedCityCode}
 onChange={(e) => handleCityChange(e.target.value)}
 disabled={!provinceReady || !regionSelected || loadingCities}
 >
 <option value="">
 {!regionSelected
 ? "Select a region first..."
 : !provinceReady
 ? "Select a province first..."
 : loadingCities
 ? "Loading cities..."
 : "Select city..."}
 </option>
 {cities.map((c) => (
 <option key={c.code} value={c.code}>
 {c.name}
 </option>
 ))}
 </select>
 {showValidationErrors && provinceReady && regionSelected && !addressCity && (
 <div className="rf-field-error">
 City is required
 </div>
 )}
 </div>

 {/* Barangay (disabled until city is selected) */}
 <div className="form-group" data-field="addressBarangay">
 <label className="form-label">
 Barangay <span className="rf-required">*</span>
 </label>
 <select
 style={{
 ...selectStyle(!cityReady),
 border: errBorder(showValidationErrors && cityReady, addressBarangay) || "1.5px solid #d1d5db",
 }}
 value={addressBarangay}
 onChange={(e) => handleBarangayChange(e.target.value)}
 disabled={!cityReady || loadingBarangays}
 >
 <option value="">
 {!cityReady
 ? "Select a city first..."
 : loadingBarangays
 ? "Loading barangays..."
 : "Select barangay..."}
 </option>
 {barangays.map((b) => (
 <option key={b.code} value={b.name}>
 {b.name}
 </option>
 ))}
 </select>
 {showValidationErrors && cityReady && !addressBarangay && (
 <div className="rf-field-error">
 Barangay is required
 </div>
 )}
 </div>
 </>
 );
};

export default AddressCascadeFields;
