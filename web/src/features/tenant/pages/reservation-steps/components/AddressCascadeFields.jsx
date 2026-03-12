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
 * Flow: Region → Province → City/Municipality → Barangay
 * NCR has no provinces — cities load directly under the region.
 *
 * Stores both code and name so the form saves the human-readable name
 * while having the code available for the cascade.
 */
const AddressCascadeFields = ({
  // Street / unit (kept as freetext)
  addressUnitHouseNo,
  setAddressUnitHouseNo,
  addressStreet,
  setAddressStreet,
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

      if (!code) return;

      const regionObj = regions.find((r) => r.code === code);
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
    [regions, setAddressProvince, setAddressCity, setAddressBarangay],
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

      if (!code) return;

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

      if (!code) return;

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

  // ── Shared select style ─────────────────────────────────────
  const selectStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1.5px solid #d1d5db",
    fontSize: "14px",
    background: "white",
    cursor: "pointer",
    color: "#1F2937",
  };

  return (
    <>
      {/* Unit / House No. */}
      <div className="form-group">
        <label className="form-label">
          Unit / House No. <span style={{ color: "#dc2626" }}>*</span>
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
          style={{ border: "1.5px solid #999" }}
        />
        {fieldErrors.addressUnitHouseNo && (
          <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
            {fieldErrors.addressUnitHouseNo}
          </div>
        )}
      </div>

      {/* Street */}
      <div className="form-group">
        <label className="form-label">
          Street <span style={{ color: "#dc2626" }}>*</span>
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
          style={{ border: "1.5px solid #999" }}
        />
        {fieldErrors.addressStreet && (
          <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
            {fieldErrors.addressStreet}
          </div>
        )}
      </div>

      {/* Region */}
      <div className="form-group">
        <label className="form-label">
          Region <span style={{ color: "#dc2626" }}>*</span>
        </label>
        <select
          style={selectStyle}
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
      </div>

      {/* Province (hidden for NCR) */}
      {!isNCR && selectedRegionCode && (
        <div className="form-group">
          <label className="form-label">
            Province <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <select
            style={selectStyle}
            value={selectedProvinceCode}
            onChange={(e) => handleProvinceChange(e.target.value)}
            disabled={loadingProvinces}
          >
            <option value="">
              {loadingProvinces ? "Loading provinces..." : "Select province..."}
            </option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* City / Municipality */}
      {(isNCR || selectedProvinceCode) && (
        <div className="form-group">
          <label className="form-label">
            City / Municipality <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <select
            style={selectStyle}
            value={selectedCityCode}
            onChange={(e) => handleCityChange(e.target.value)}
            disabled={loadingCities}
          >
            <option value="">
              {loadingCities ? "Loading cities..." : "Select city..."}
            </option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Barangay */}
      {selectedCityCode && (
        <div className="form-group">
          <label className="form-label">
            Barangay <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <select
            style={selectStyle}
            value={addressBarangay}
            onChange={(e) => handleBarangayChange(e.target.value)}
            disabled={loadingBarangays}
          >
            <option value="">
              {loadingBarangays ? "Loading barangays..." : "Select barangay..."}
            </option>
            {barangays.map((b) => (
              <option key={b.code} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

export default AddressCascadeFields;
