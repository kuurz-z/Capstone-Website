import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  parsePhoneNumber,
  isValidPhoneNumber,
  getExampleNumber,
  AsYouType,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { COUNTRY_CODES, DEFAULT_COUNTRY, parseE164 } from "../data/countryCodes";

/* ──────────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────────── */

/** Returns the expected national-number length for a country ISO code.
 *  Uses libphonenumber-js example numbers (most accurate source).
 *  Falls back to 10 if no example is available. */
const getExpectedLength = (isoCode) => {
  try {
    const ex = getExampleNumber(isoCode, examples);
    return ex?.nationalNumber?.length ?? 10;
  } catch {
    return 10;
  }
};

/** Detect country from a partial or full "+" prefixed string.
 *  Returns the matching COUNTRY_CODES entry or null. */
const detectCountryFromE164 = (e164) => {
  if (!e164 || !e164.startsWith("+")) return null;
  try {
    const parsed = parsePhoneNumber(e164);
    if (parsed?.country) {
      return COUNTRY_CODES.find((c) => c.code === parsed.country) ?? null;
    }
  } catch {
    /* number is incomplete — try prefix matching as fallback */
  }
  // Fallback: longest-dial-code-first prefix match
  const numericPart = e164.slice(1).replace(/\D/g, "");
  const sorted = COUNTRY_CODES
    .map((c) => ({ c, dialDigits: c.dialCode.replace(/\D/g, "") }))
    .sort((a, b) => b.dialDigits.length - a.dialDigits.length);
  const match = sorted.find(
    ({ dialDigits }) =>
      numericPart.startsWith(dialDigits) && numericPart.length > dialDigits.length
  );
  return match?.c ?? null;
};

/**
 * PhoneInput — Smart international phone input backed by libphonenumber-js.
 *
 * Behaviors:
 *   - Default country: Philippines (+63), or none when noDefault=true
 *   - Type "+" → full international mode, auto-detects country from prefix
 *   - Type "0..." → strips leading 0 (PH convention), applies current country code
 *   - Type plain digits → applies current country code
 *   - Dropdown selection → switches country, keeps existing local digits
 *   - Real-time digit counter + accurate per-country length validation
 *   - Output: always E.164 (e.g. "+639171234567")
 *
 * Props:
 *   value      {string}  — E.164 string or empty
 *   onChange   {fn}      — called with E.164 string
 *   error      {string}  — error message to display
 *   hasError   {bool}    — red border (alternative to error string)
 *   valid      {bool}    — green border (authStyle only)
 *   authStyle  {bool}    — renders as a FloatingInput-compatible field
 *   noDefault  {bool}    — start with no country selected
 *   label      {string}  — label text when authStyle=true
 *   className  {string}  — wrapper class
 */
const PhoneInput = ({
  value = "",
  onChange,
  error,
  required,
  hasError,
  valid = false,
  authStyle = false,
  noDefault = false,
  label = "Phone number",
  className,
}) => {
  const parsed = parseE164(value);

  const [selectedCountry, setSelectedCountry] = useState(
    noDefault && !value ? null : parsed.country
  );
  const [localNumber, setLocalNumber] = useState(parsed.localNumber || "");
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [focused, setFocused] = useState(false);

  const wrapRef   = useRef(null);
  const searchRef = useRef(null);
  const numberRef = useRef(null);

  /* ── Expected local digit length (libphonenumber-js) ────────── */
  const expectedLength = selectedCountry
    ? getExpectedLength(selectedCountry.code)
    : 10;

  /* ── Sync from external value prop ──────────────────────────── */
  useEffect(() => {
    if (!value) return;
    const p = parseE164(value);
    if (selectedCountry && p.country.code !== selectedCountry.code) {
      setSelectedCountry(p.country);
    }
    if (p.localNumber !== localNumber) setLocalNumber(p.localNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /* ── Close dropdown on outside click ────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* ── Auto-focus search when dropdown opens ───────────────────── */
  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  /* ── Filtered country list ───────────────────────────────────── */
  const filtered = COUNTRY_CODES.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });
  const pinnedFiltered = filtered.filter((c) => c.pinned);
  const otherFiltered  = filtered.filter((c) => !c.pinned);

  /* ── Manual country selection ────────────────────────────────── */
  const selectCountry = useCallback((country) => {
    const currentLocal = localNumber.startsWith("+") ? "" : localNumber;
    const newExpected  = getExpectedLength(country.code);
    const trimmed      = currentLocal.slice(0, newExpected);
    setSelectedCountry(country);
    setLocalNumber(trimmed);
    setOpen(false);
    setSearch("");
    onChange?.(trimmed ? country.dialCode + trimmed : country.dialCode);
    setTimeout(() => numberRef.current?.focus(), 80);
  }, [onChange, localNumber]);

  /* ────────────────────────────────────────────────────────────
     Smart number input handler
     ──────────────────────────────────────────────────────────── */
  const handleLocalChange = (e) => {
    const raw = e.target.value;

    // ── MODE 1: Full international ("+" prefix typed) ──────────
    if (raw.startsWith("+")) {
      const numericPart = raw.slice(1).replace(/\D/g, "").slice(0, 14);
      const cleaned = "+" + numericPart;

      if (!numericPart) {
        setLocalNumber("+");
        onChange?.("");
        return;
      }

      // Detect country using libphonenumber-js first, then prefix fallback
      const detectedCountry = detectCountryFromE164(cleaned);

      if (detectedCountry) {
        // Country detected — extract local number
        const dialDigits = detectedCountry.dialCode.replace(/\D/g, "");
        const local = numericPart.slice(dialDigits.length);
        const maxL  = getExpectedLength(detectedCountry.code);
        const truncated = local.slice(0, maxL);
        setSelectedCountry(detectedCountry);
        setLocalNumber(truncated);
        onChange?.(truncated ? detectedCountry.dialCode + truncated : detectedCountry.dialCode);
      } else {
        // Still building country code prefix
        setLocalNumber(cleaned);
        onChange?.("");
      }
      return;
    }

    // ── MODE 2: Local digit mode ───────────────────────────────
    let digits = raw.replace(/\D/g, "");

    // Auto-convert leading "0" (e.g. PH: "09171..." → "9171...")
    if (digits.startsWith("0")) digits = digits.slice(1);

    const truncated = digits.slice(0, expectedLength);
    setLocalNumber(truncated);
    if (!selectedCountry) return;
    onChange?.(truncated ? selectedCountry.dialCode + truncated : "");
  };

  /* ── Counter state ───────────────────────────────────────────── */
  const displayLength = localNumber.startsWith("+")
    ? Math.max(0, localNumber.length - 1)
    : localNumber.length;

  const counterColor =
    displayLength === 0
      ? "var(--fi-label, #94a3b8)"
      : displayLength < expectedLength
        ? "#f59e0b"
        : "#10b981";

  /* ── Validation ──────────────────────────────────────────────── */
  const showError = hasError || !!error;

  /* ── Placeholder ─────────────────────────────────────────────── */
  const getPlaceholder = () => {
    if (!selectedCountry) return "Pick a country first";
    if (selectedCountry.code === "PH") return "9171234567 or 09171234567";
    return "Local number or +[code]…";
  };

  /* ──────────────────────────────────────────────────────────────
     AUTH STYLE — matches .floating-field__wrapper exactly
  ────────────────────────────────────────────────────────────── */
  if (authStyle) {
    const borderColor = showError
      ? "var(--fi-error, #ef4444)"
      : valid && !focused
        ? "var(--fi-valid, #10b981)"
        : focused
          ? "var(--fi-border-focus, #b0bec5)"
          : "var(--fi-border, #e2e8f0)";

    const labelColor = showError
      ? "var(--fi-error, #ef4444)"
      : valid && !focused
        ? "var(--fi-valid, #10b981)"
        : focused
          ? "var(--fi-focus, #FF8C42)"
          : "var(--fi-label-active, #64748b)";

    return (
      <div ref={wrapRef} style={{ position: "relative" }} className={className}>
        <div style={{
          position: "relative",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--fi-radius, 12px)",
          background: "var(--fi-bg, #ffffff)",
          transition: "border-color 0.2s ease",
          overflow: "visible",
        }}>
          {/* Floating label */}
          <label style={{
            position: "absolute", top: 8, left: 16,
            fontSize: 11, fontWeight: 500, color: labelColor,
            pointerEvents: "none", zIndex: 1,
            letterSpacing: "0.02em", transition: "color 0.2s ease",
          }}>
            {label}
          </label>

          {/* Input row */}
          <div
            style={{ display: "flex", alignItems: "center", paddingTop: 22, paddingBottom: 6 }}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget)) setFocused(false); }}
          >
            {/* Country picker */}
            <button type="button" onClick={() => setOpen((o) => !o)} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "0 10px 0 14px",
              background: "transparent", border: "none",
              borderRight: "1px solid var(--fi-border, #e2e8f0)",
              cursor: "pointer", whiteSpace: "nowrap",
              flexShrink: 0, height: 28,
              color: selectedCountry ? "var(--fi-text, #1e293b)" : "var(--fi-label, #94a3b8)",
            }}>
              {selectedCountry ? (
                <>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{selectedCountry.flag}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "inherit" }}>
                    {selectedCountry.dialCode}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 13 }}>Select country</span>
              )}
              <ChevronDown size={12} style={{
                color: "var(--fi-label, #94a3b8)",
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 0.15s", marginLeft: 2,
              }} />
            </button>

            {/* Number input */}
            <input
              ref={numberRef}
              type="tel" inputMode="numeric"
              value={localNumber}
              onChange={handleLocalChange}
              maxLength={localNumber.startsWith("+") ? 16 : expectedLength}
              placeholder={getPlaceholder()}
              style={{
                flex: 1, border: "none", outline: "none",
                padding: "0 8px 0 14px",
                fontSize: 15, fontWeight: 450,
                color: "var(--fi-text, #1e293b)",
                background: "transparent", lineHeight: 1.4,
              }}
            />

            {/* Real-time counter (hidden in full-int mode) */}
            {selectedCountry && !localNumber.startsWith("+") && (
              <span style={{
                fontSize: 11, fontWeight: 500, color: counterColor,
                paddingRight: 12, flexShrink: 0,
                transition: "color 0.2s", minWidth: 34, textAlign: "right",
              }}>
                {localNumber.length}/{expectedLength}
              </span>
            )}
          </div>
        </div>

        {error && (
          <span style={{ fontSize: 12, color: "var(--fi-error, #ef4444)", marginTop: 4, display: "block" }}>
            {error}
          </span>
        )}

        {open && (
          <CountryDropdown
            pinnedFiltered={pinnedFiltered} otherFiltered={otherFiltered}
            filtered={filtered} search={search} setSearch={setSearch}
            searchRef={searchRef} selectedCountry={selectedCountry}
            selectCountry={selectCountry}
          />
        )}
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────
     STANDARD STYLE — reservation forms, etc.
  ────────────────────────────────────────────────────────────── */
  return (
    <div ref={wrapRef} style={{ position: "relative" }} className={className}>
      <div style={{
        display: "flex",
        border: `1.5px solid ${showError ? "#dc2626" : "#D1D5DB"}`,
        borderRadius: 8,
        background: "var(--surface-card, #fff)",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: showError ? "0 0 0 3px rgba(220,38,38,0.08)" : "none",
        overflow: "visible",
      }}
        onFocus={(e) => {
          if (!showError) {
            e.currentTarget.style.borderColor = "#FF8C42";
            e.currentTarget.style.boxShadow  = "0 0 0 3px rgba(255,140,66,0.10)";
          }
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.style.borderColor = showError ? "#dc2626" : "#D1D5DB";
            e.currentTarget.style.boxShadow   = showError ? "0 0 0 3px rgba(220,38,38,0.08)" : "none";
          }
        }}
      >
        <button type="button" onClick={() => setOpen((o) => !o)} style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "0 10px",
          background: "transparent", border: "none",
          borderRight: "1.5px solid #E5E7EB",
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, minWidth: 84,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>
            {selectedCountry ? selectedCountry.flag : "🌐"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading, #374151)" }}>
            {selectedCountry ? selectedCountry.dialCode : "--"}
          </span>
          <ChevronDown size={12} color="#9CA3AF"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>

        <input
          ref={numberRef}
          type="tel" inputMode="numeric"
          value={localNumber}
          onChange={handleLocalChange}
          maxLength={localNumber.startsWith("+") ? 16 : expectedLength}
          placeholder={getPlaceholder()}
          style={{
            flex: 1, border: "none", outline: "none",
            padding: "10px 12px", fontSize: 14,
            color: "var(--text-heading, #111827)",
            background: "transparent",
            borderRadius: "0 8px 8px 0", minWidth: 0,
          }}
        />
      </div>

      {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{error}</div>}

      {open && (
        <CountryDropdown
          pinnedFiltered={pinnedFiltered} otherFiltered={otherFiltered}
          filtered={filtered} search={search} setSearch={setSearch}
          searchRef={searchRef} selectedCountry={selectedCountry}
          selectCountry={selectCountry}
        />
      )}
    </div>
  );
};

/* ── Shared sub-components ───────────────────────────────────── */
const CountryDropdown = ({
  pinnedFiltered, otherFiltered, filtered,
  search, setSearch, searchRef, selectedCountry, selectCountry,
}) => (
  <div className="pi-dropdown" style={{
    position: "absolute", top: "calc(100% + 4px)", left: 0,
    zIndex: 9999,
    background: "var(--fi-bg, #fff)",
    border: "1px solid var(--fi-border, #E5E7EB)",
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    width: 280, maxHeight: 320,
    display: "flex", flexDirection: "column", overflow: "hidden",
  }}>
    <div className="pi-dropdown-search" style={{
      padding: "10px 12px",
      borderBottom: "1px solid var(--fi-border, #F3F4F6)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <Search size={14} style={{ color: "var(--fi-label, #9CA3AF)", flexShrink: 0 }} />
      <input ref={searchRef} type="text" value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search country or code…"
        style={{
          flex: 1, border: "none", outline: "none",
          fontSize: 13,
          color: "var(--fi-text, #111827)",
          background: "transparent",
        }} />
      {search && (
        <button type="button" onClick={() => setSearch("")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <X size={12} style={{ color: "var(--fi-label, #9CA3AF)" }} />
        </button>
      )}
    </div>

    <div style={{ overflowY: "auto", flex: 1 }}>
      {pinnedFiltered.length > 0 && (
        <>
          <SectionLabel>Common</SectionLabel>
          {pinnedFiltered.map((c) => (
            <CountryOption key={`p-${c.code}`} country={c}
              selected={!!selectedCountry && c.code === selectedCountry.code && c.dialCode === selectedCountry.dialCode}
              onSelect={selectCountry} />
          ))}
          {otherFiltered.length > 0 && (
            <div style={{ height: 1, background: "var(--fi-border, #F3F4F6)", margin: "4px 0" }} />
          )}
        </>
      )}
      {otherFiltered.length > 0 && (
        <>
          {pinnedFiltered.length > 0 && <SectionLabel>All Countries</SectionLabel>}
          {otherFiltered.map((c) => (
            <CountryOption key={c.code} country={c}
              selected={!!selectedCountry && c.code === selectedCountry.code}
              onSelect={selectCountry} />
          ))}
        </>
      )}
      {filtered.length === 0 && (
        <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: "var(--fi-label, #9CA3AF)" }}>
          No countries found
        </div>
      )}
    </div>
  </div>
);

const SectionLabel = ({ children }) => (
  <div className="pi-section-label" style={{
    fontSize: 10, fontWeight: 700,
    color: "var(--fi-label, #9CA3AF)",
    letterSpacing: "0.06em", textTransform: "uppercase",
    padding: "8px 12px 4px",
  }}>{children}</div>
);

const CountryOption = ({ country, selected, onSelect }) => (
  <button type="button" onClick={() => onSelect(country)}
    className="pi-option"
    style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: "8px 12px",
      background: selected ? "rgba(255,140,66,0.12)" : "transparent",
      border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s",
    }}
    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--surface-hover, #F9FAFB)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = selected ? "rgba(255,140,66,0.12)" : "transparent"; }}>
    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{country.flag}</span>
    <span style={{ flex: 1, fontSize: 13, color: "var(--fi-text, #374151)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {country.name}
    </span>
    <span style={{ fontSize: 12, fontWeight: 600, color: selected ? "#FF8C42" : "var(--fi-label, #9CA3AF)", flexShrink: 0 }}>
      {country.dialCode}
    </span>
  </button>
);

export { isValidPhoneNumber };  // re-export for use in form validation
export default PhoneInput;
