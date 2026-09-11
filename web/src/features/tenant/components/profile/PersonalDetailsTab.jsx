import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Edit2,
  User,
  Save,
  X,
  Camera,
  Briefcase,
  Globe,
  ChevronDown,
  Phone,
  Home,
  CalendarDays,
  Mail,
  MapPin,
  Heart,
  Users,
  Building2,
  Layers,
  Shield,
  Loader2,
  Lock,
} from "lucide-react";
import PhoneInput from "../../../../shared/components/PhoneInput";
import { fmtDate, formatBranch } from "../../../../shared/utils/formatDate";
import { showNotification } from "../../../../shared/utils/notification";

import {
  toTitleCase,
  formatProperCase,
  formatBed,
  MONTH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  parseDateParts,
  getDaysInMonth,
  composeDate,
  buildYearOptions,
  validateField,
  validateEmergencyContactGroup,
  isSamePhone,
} from "./personalDetailsValidation";

export {
  toTitleCase,
  formatBed,
  MONTH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  parseDateParts,
  getDaysInMonth,
  composeDate,
  buildYearOptions,
  validateField,
  validateEmergencyContactGroup,
  isSamePhone,
};


/* ─────────────────────────────────────────────────────────────────────────────
 STYLES — Solid HSL tokens, no gradients, clean 1px borders
───────────────────────────────────────────────────────────────────────────── */
const s = {
  container: {
    width: "100%",
    maxWidth: "100%",
    margin: 0,
  },

  heading: {
    marginBottom: 20,
  },
  title: {
    fontSize: "var(--font-size-2xl, 24px)",
    fontWeight: "var(--font-weight-bold, 700)",
    color: "var(--foreground)",
    margin: 0,
    letterSpacing: "var(--letter-spacing-tight, -0.02em)",
  },
  subtitle: {
    fontSize: "var(--font-size-base, 14px)",
    color: "var(--muted-foreground)",
    marginTop: 4,
    marginBottom: 0,
  },

  /* ── Header Summary Card ── */
  headerCard: {
    background: "var(--card)",
    borderRadius: "var(--radius-xl, 12px)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-sm, 0 1px 2px 0 rgba(0,0,0,0.05))",
    padding: "22px 24px",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },
  avatarWrap: {
    position: "relative",
    cursor: "pointer",
    flexShrink: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    border: "none",
    boxShadow: "var(--avatar-shadow-lg)",
    background: "var(--muted)",
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent)",
    color: "var(--primary-foreground)",
    fontSize: 24,
    fontWeight: "var(--font-weight-bold, 700)",
    letterSpacing: "0.5px",
    flexShrink: 0,
    border: "none",
    boxShadow: "var(--avatar-shadow-lg)",
  },
  avatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "var(--primary)",
    border: "2px solid var(--card)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.1))",
    cursor: "pointer",
  },
  avatarOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    transition: "opacity var(--duration-normal, 200ms)",
  },
  profileMeta: {
    flex: 1,
    minWidth: 220,
  },
  profileName: {
    fontSize: "var(--font-size-xl, 18px)",
    fontWeight: "var(--font-weight-bold, 700)",
    color: "var(--foreground)",
    margin: "0 0 4px",
    letterSpacing: "var(--letter-spacing-tight, -0.01em)",
  },
  profileEmail: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "var(--font-size-sm, 13px)",
    color: "var(--muted-foreground)",
    margin: "0 0 10px",
  },
  profileChips: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: "var(--font-size-xs, 12px)",
    fontWeight: "var(--font-weight-medium, 500)",
    color: "var(--foreground)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-full, 999px)",
    padding: "3px 10px",
  },
  chipPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: "var(--font-size-xs, 12px)",
    fontWeight: "var(--font-weight-semibold, 600)",
    color: "var(--primary-foreground)",
    background: "var(--primary)",
    borderRadius: "var(--radius-full, 999px)",
    padding: "3px 11px",
  },
  completionWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    maxWidth: 360,
  },
  completionTrack: {
    height: 6,
    flex: 1,
    minWidth: 100,
    background: "var(--muted)",
    borderRadius: "var(--radius-full, 999px)",
    overflow: "hidden",
  },
  completionFill: {
    height: "100%",
    background: "var(--primary)",
    borderRadius: "var(--radius-full, 999px)",
    transition: "width 0.2s ease",
  },
  completionText: {
    fontSize: "var(--font-size-xs, 12px)",
    fontWeight: "var(--font-weight-medium, 500)",
    color: "var(--muted-foreground)",
    whiteSpace: "nowrap",
  },

  actionWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  lockedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: "var(--radius-full, 999px)",
    background: "transparent",
    border: "1px solid var(--border)",
    fontSize: "var(--font-size-xs, 12px)",
    fontWeight: "var(--font-weight-medium, 500)",
    color: "var(--muted-foreground)",
  },
  changePhotoBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    background: "var(--card)",
    fontSize: "var(--font-size-sm, 13px)",
    fontWeight: "var(--font-weight-semibold, 600)",
    color: "var(--foreground)",
    cursor: "pointer",
    transition: "all var(--duration-fast, 150ms)",
    whiteSpace: "nowrap",
  },
  editBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    background: "var(--card)",
    fontSize: "var(--font-size-sm, 13px)",
    fontWeight: "var(--font-weight-semibold, 600)",
    color: "var(--foreground)",
    cursor: "pointer",
    transition: "all var(--duration-fast, 150ms)",
    whiteSpace: "nowrap",
  },
  saveBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 18px",
    border: "none",
    borderRadius: "var(--radius-md, 8px)",
    background: "var(--success)",
    fontSize: "var(--font-size-sm, 13px)",
    fontWeight: "var(--font-weight-semibold, 600)",
    color: "var(--success-foreground)",
    cursor: "pointer",
    transition: "all var(--duration-fast, 150ms)",
    whiteSpace: "nowrap",
  },
  cancelBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    background: "var(--card)",
    fontSize: "var(--font-size-sm, 13px)",
    fontWeight: "var(--font-weight-medium, 500)",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    transition: "all var(--duration-fast, 150ms)",
    whiteSpace: "nowrap",
  },

  /* ── Info Cards ── */
  infoCard: {
    background: "var(--card)",
    borderRadius: "var(--radius-xl, 12px)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-sm, 0 1px 2px 0 rgba(0,0,0,0.05))",
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 22px",
  },
  sectionIconWrap: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "transparent",
  },
  sectionTitle: {
    fontSize: "var(--font-size-base, 15px)",
    fontWeight: "var(--font-weight-bold, 700)",
    color: "var(--foreground)",
    margin: 0,
    flex: 1,
  },
  divider: {
    height: 1,
    background: "var(--border-light, var(--border))",
    margin: "0 22px",
  },
  sectionBody: {
    padding: "20px 24px 24px",
  },

  /* ── Unified Grid System ── */
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px 24px",
  },

  /* ── Structured Field Tile (Clean, unboxed presentation) ── */
  fieldTile: {
    background: "transparent",
    border: "none",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: "auto",
    boxSizing: "border-box",
  },
  fieldHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  fieldLabel: {
    fontSize: "11px",
    fontWeight: "var(--font-weight-bold, 700)",
    color: "var(--muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: "var(--letter-spacing-wide, 0.05em)",
  },
  fieldValue: {
    fontSize: "var(--font-size-base, 14px)",
    fontWeight: "var(--font-weight-semibold, 600)",
    color: "var(--foreground)",
    margin: 0,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  fieldEmpty: {
    fontSize: "var(--font-size-sm, 13px)",
    color: "var(--muted-foreground)",
    fontStyle: "italic",
    margin: 0,
  },
  emptyLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  addNowBtn: {
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: "var(--font-size-xs, 12px)",
    fontWeight: "var(--font-weight-bold, 700)",
    color: "var(--primary)",
    cursor: "pointer",
  },

  /* ── Inputs ── */
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: "var(--font-size-sm, 13px)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md, 8px)",
    color: "var(--foreground)",
    background: "var(--card)",
    outline: "none",
    transition: "border-color var(--duration-fast, 150ms), box-shadow var(--duration-fast, 150ms)",
    boxSizing: "border-box",
    lineHeight: 1.4,
    marginTop: 2,
  },
  inputFocus: {
    borderColor: "var(--ring, var(--primary))",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--ring, var(--primary)) 20%, transparent)",
  },
  inputError: {
    borderColor: "var(--danger)",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--danger) 15%, transparent)",
  },
  dateClearBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    padding: "3px",
    borderRadius: "var(--radius-sm, 6px)",
    cursor: "pointer",
  },
  datePickerBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    padding: "3px",
    borderRadius: "var(--radius-sm, 6px)",
    cursor: "pointer",
  },
  charCounter: {
    fontSize: "10px",
    fontWeight: "var(--font-weight-medium, 500)",
    color: "var(--muted-foreground)",
    marginLeft: "auto",
  },
  helperText: {
    fontSize: "11px",
    color: "var(--muted-foreground)",
    marginTop: 4,
    lineHeight: 1.3,
  },
  inputLocked: {
    background: "var(--card)",
    color: "var(--foreground)",
    cursor: "not-allowed",
    border: "1px solid var(--border)",
  },
  errorText: {
    fontSize: "11px",
    color: "var(--danger)",
    marginTop: 3,
    lineHeight: 1.3,
  },

  /* ── Note text ── */
  noteText: {
    fontSize: "var(--font-size-xs, 12px)",
    color: "var(--muted-foreground)",
    fontStyle: "italic",
    lineHeight: 1.5,
    marginTop: 14,
    marginBottom: 0,
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 ATOMS
───────────────────────────────────────────────────────────────────────────── */

const Field = ({
  icon: Icon,
  label,
  value,
  field,
  type = "text",
  colSpan,
  editing,
  editData,
  setEditData,
  errors,
  onBlur,
  required,
  locked,
  onAdd,
  maxLength,
  autoCapitalizeWords,
}) => {
  const [focused, setFocused] = useState(false);
  const hasError = errors?.[field];
  const currentVal = editData?.[field] !== undefined && editData?.[field] !== null ? String(editData[field]) : "";

  const handleChange = (e) => {
    let val = e.target.value;
    if (maxLength && val.length > maxLength) {
      val = val.slice(0, maxLength);
    }
    setEditData({ ...editData, [field]: val });
  };

  const handleInputBlur = () => {
    setFocused(false);
    let val = editData?.[field] !== undefined && editData?.[field] !== null ? String(editData[field]).trim() : "";
    if (autoCapitalizeWords && val) {
      val = toTitleCase(val);
      setEditData((prev) => ({ ...prev, [field]: val }));
    }
    onBlur?.(field, val);
  };

  return (
    <div style={{ ...s.fieldTile, ...(colSpan ? { gridColumn: `span ${colSpan}` } : {}) }}>
      <div style={s.fieldHeader}>
        {Icon && <Icon size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />}
        <span style={s.fieldLabel}>
          {label}
          {required && editing && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
        </span>
        {editing && !locked && maxLength && focused && (
          <span style={s.charCounter}>
            {currentVal.length}/{maxLength}
          </span>
        )}
      </div>
      {editing ? (
        locked ? (
          <input
            type={type}
            value={value || ""}
            readOnly
            style={{ ...s.input, ...s.inputLocked }}
          />
        ) : (
          <div>
            <input
              type={type}
              value={currentVal}
              maxLength={maxLength}
              onChange={handleChange}
              onFocus={() => setFocused(true)}
              onBlur={handleInputBlur}
              style={{
                ...s.input,
                ...(focused && !hasError ? s.inputFocus : {}),
                ...(hasError ? s.inputError : {}),
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
            {hasError && <div style={s.errorText}>{hasError}</div>}
          </div>
        )
      ) : value && value !== "Not provided" ? (
        <p style={s.fieldValue}>
          {type === "date"
            ? fmtDate(value)
            : autoCapitalizeWords || field === "firstName" || field === "lastName" || field === "middleName"
              ? formatProperCase(value)
              : value}
        </p>
      ) : (
        <div style={s.emptyLine}>
          <p style={s.fieldEmpty}>Not provided</p>
          {onAdd && (
            <button type="button" style={s.addNowBtn} onClick={onAdd}>
              + Add now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const PhoneField = ({
  icon: Icon,
  label,
  value,
  field,
  colSpan,
  editing,
  editData,
  setEditData,
  errors,
  onBlur,
  required,
  locked,
  onAdd,
  placeholder = "Enter contact number",
}) => {
  const [focused, setFocused] = useState(false);
  const hasError = errors?.[field];
  const currentVal = editData?.[field] !== undefined && editData?.[field] !== null ? String(editData[field]) : "";

  const handlePhoneChange = (val) => {
    setEditData((prev) => ({ ...prev, [field]: val }));
  };

  const handlePhoneBlur = () => {
    setFocused(false);
    onBlur?.(field, currentVal);
  };

  return (
    <div style={{ ...s.fieldTile, ...(colSpan ? { gridColumn: `span ${colSpan}` } : {}) }}>
      <div style={s.fieldHeader}>
        {Icon && <Icon size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />}
        <span style={s.fieldLabel}>
          {label}
          {required && editing && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
        </span>
      </div>
      {editing ? (
        locked ? (
          <input
            type="text"
            value={value || "Not provided"}
            readOnly
            style={{ ...s.input, ...s.inputLocked }}
          />
        ) : (
          <div style={{ marginTop: 2 }}>
            <PhoneInput
              value={currentVal}
              onChange={handlePhoneChange}
              onBlur={handlePhoneBlur}
              onFocus={() => setFocused(true)}
              placeholder={placeholder}
              error={Boolean(hasError)}
              hasError={Boolean(hasError)}
              showValidation={Boolean(hasError)}
              defaultCountry="PH"
              inputStyle={{
                fontSize: "13px",
                padding: "8px 12px",
                borderRadius: "var(--radius-md, 8px)",
              }}
            />
            {hasError && <div style={s.errorText}>{hasError}</div>}
          </div>
        )
      ) : value && value !== "Not provided" ? (
        <p style={s.fieldValue}>{value}</p>
      ) : (
        <div style={s.emptyLine}>
          <p style={s.fieldEmpty}>Not provided</p>
          {onAdd && (
            <button type="button" style={s.addNowBtn} onClick={onAdd}>
              + Add now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const BirthdayField = ({
  icon: Icon,
  label,
  field,
  colSpan,
  editing,
  editData,
  setEditData,
  value,
  errors,
  onBlur,
  onAdd,
  locked,
}) => {
  const [focused, setFocused] = useState(false);
  const datePickerRef = useRef(null);
  const hasError = errors?.[field];

  const rawDateValue = useMemo(() => {
    const val = editData?.[field] || "";
    if (typeof val === "string") return val.slice(0, 10);
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
    return "";
  }, [editData, field]);

  const { minDate, maxDate } = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return {
      maxDate: `${year - 18}-${month}-${day}`,
      minDate: `${year - 100}-01-01`,
    };
  }, []);

  const handleClear = (e) => {
    e.stopPropagation();
    setEditData((prev) => ({ ...prev, [field]: "" }));
    onBlur?.(field, "");
  };

  return (
    <div style={{ ...s.fieldTile, ...(colSpan ? { gridColumn: `span ${colSpan}` } : {}) }}>
      <div style={s.fieldHeader}>
        {Icon && <Icon size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />}
        <span style={s.fieldLabel}>{label}</span>
      </div>
      {editing ? (
        locked ? (
          <input
            type="text"
            value={value && value !== "Not provided" ? fmtDate(value) : "Not provided"}
            readOnly
            style={{ ...s.input, ...s.inputLocked }}
          />
        ) : (
          <div style={{ marginTop: 2 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                ref={datePickerRef}
                type="date"
                id="profileDateOfBirthInput"
                aria-label="Date of Birth"
                min={minDate}
                max={maxDate}
                value={rawDateValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditData((prev) => ({ ...prev, [field]: val }));
                  onBlur?.(field, val);
                }}
                onFocus={() => setFocused(true)}
                onBlur={(e) => {
                  setFocused(false);
                  onBlur?.(field, e.target.value);
                }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch (_) {}
                }}
                className="hide-native-date-indicator"
                style={{
                  ...s.input,
                  marginTop: 0,
                  paddingRight: rawDateValue ? 58 : 34,
                  cursor: "pointer",
                  colorScheme: "inherit",
                  ...(focused && !hasError ? s.inputFocus : {}),
                  ...(hasError ? s.inputError : {}),
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {rawDateValue && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Clear date"
                    aria-label="Clear date"
                    style={s.dateClearBtn}
                  >
                    <X size={13} color="var(--muted-foreground)" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      datePickerRef.current?.showPicker?.();
                    } catch (_) {
                      datePickerRef.current?.focus();
                    }
                  }}
                  title="Open calendar picker"
                  aria-label="Open calendar picker"
                  style={s.datePickerBtn}
                >
                  <CalendarDays size={14} color="var(--muted-foreground)" />
                </button>
              </div>
            </div>
            <div style={s.helperText}>Must be at least 18 years old</div>
            {hasError && <div style={s.errorText}>{hasError}</div>}
          </div>
        )
      ) : value && value !== "Not provided" ? (
        <p style={s.fieldValue}>{fmtDate(value)}</p>
      ) : (
        <div style={s.emptyLine}>
          <p style={s.fieldEmpty}>Not provided</p>
          {onAdd && (
            <button type="button" style={s.addNowBtn} onClick={onAdd}>
              + Add now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const SelectField = ({
  icon: Icon,
  label,
  field,
  options,
  colSpan,
  editing,
  editData,
  setEditData,
  value,
  errors,
  onBlur,
  onAdd,
  locked,
}) => {
  const [focused, setFocused] = useState(false);
  const hasError = errors?.[field];
  const currentValue = editData?.[field] || "";
  const displayValue = editing ? currentValue : value || currentValue;
  const readLabel = options.find((o) => o.value === displayValue)?.label;

  return (
    <div style={{ ...s.fieldTile, ...(colSpan ? { gridColumn: `span ${colSpan}` } : {}) }}>
      <div style={s.fieldHeader}>
        {Icon && <Icon size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />}
        <span style={s.fieldLabel}>{label}</span>
      </div>
      {editing ? (
        locked ? (
          <input
            type="text"
            value={readLabel || toTitleCase(displayValue) || "Not provided"}
            readOnly
            style={{ ...s.input, ...s.inputLocked }}
          />
        ) : (
          <div style={{ position: "relative" }}>
            <select
              value={currentValue}
              onChange={(e) => {
                const nextVal = e.target.value;
                setEditData({ ...editData, [field]: nextVal });
                onBlur?.(field, nextVal);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                onBlur?.(field);
              }}
              style={{
                ...s.input,
                appearance: "none",
                paddingRight: 30,
                cursor: "pointer",
                ...(focused && !hasError ? s.inputFocus : {}),
                ...(hasError ? s.inputError : {}),
              }}
            >
              <option value="">— Select —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              color="var(--muted-foreground)"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            />
            {hasError && <div style={s.errorText}>{hasError}</div>}
          </div>
        )
      ) : displayValue ? (
        <p style={s.fieldValue}>{readLabel || toTitleCase(displayValue)}</p>
      ) : (
        <div style={s.emptyLine}>
          <p style={s.fieldEmpty}>Not provided</p>
          {onAdd && (
            <button type="button" style={s.addNowBtn} onClick={onAdd}>
              + Add now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title }) => (
  <>
    <div style={s.sectionHeader}>
      {Icon && (
        <span style={s.sectionIconWrap}>
          <Icon size={18} color="var(--foreground)" />
        </span>
      )}
      <h3 style={s.sectionTitle}>{title}</h3>
    </div>
    <div style={s.divider} />
  </>
);

/* ─────────────────────────────────────────────────────────────────────────────
 MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
const resolveOccupancyLabel = ({ role, tenantStatus }) => {
  if (role === "tenant") return "Tenant";
  if (role === "applicant") return "Applicant";
  const normalizedTenantStatus = String(tenantStatus || "").toLowerCase();
  if (["active", "inactive", "moved_out"].includes(normalizedTenantStatus)) return "Tenant";
  return "Applicant";
};

const PersonalDetailsTab = ({
  profileData,
  editData,
  setEditData,
  fullName,
  isEditingProfile,
  setIsEditingProfile,
  isProfileLocked = false,
  saving,
  onSave,
  onCancel,
}) => {
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [hoveringAvatar, setHoveringAvatar] = useState(false);

  const initials = useMemo(() => {
    const f = (profileData.firstName || "").charAt(0).toUpperCase();
    const l = (profileData.lastName || "").charAt(0).toUpperCase();
    return f + l || "?";
  }, [profileData.firstName, profileData.lastName]);

  const occupancyLabel = useMemo(
    () => resolveOccupancyLabel({ role: profileData.role, tenantStatus: profileData.tenantStatus }),
    [profileData.role, profileData.tenantStatus],
  );

  const completeness = useMemo(() => {
    const hasText = (value) => String(value || "").trim().length > 0;
    const items = [
      hasText(profileData.firstName) && hasText(profileData.lastName),
      Boolean(profileData.dateOfBirth),
      hasText(profileData.gender),
      hasText(profileData.civilStatus),
      hasText(profileData.nationality),
      hasText(profileData.occupation),
      hasText(profileData.profileImage),
      hasText(profileData.phone),
      hasText(profileData.address),
      hasText(profileData.emergencyContact) && hasText(profileData.emergencyPhone),
    ];
    const completed = items.filter(Boolean).length;
    return { completed, total: items.length, percent: Math.round((completed / items.length) * 100) };
  }, [
    profileData.firstName,
    profileData.lastName,
    profileData.dateOfBirth,
    profileData.gender,
    profileData.civilStatus,
    profileData.nationality,
    profileData.occupation,
    profileData.profileImage,
    profileData.phone,
    profileData.address,
    profileData.emergencyContact,
    profileData.emergencyPhone,
  ]);

  const handleStartEditing = () => {
    setIsEditingProfile(true);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Stage preview for batch save
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const blobUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setLocalPreviewUrl(blobUrl);
  };

  const hasChanges = useMemo(() => {
    if (pendingFile) return true;
    if (!editData) return false;

    const normEditDob = editData.dateOfBirth ? composeDate(parseDateParts(editData.dateOfBirth)) : "";
    const normProfileDob = profileData.dateOfBirth ? composeDate(parseDateParts(profileData.dateOfBirth)) : "";

    return (
      (editData.firstName || "").trim() !== (profileData.firstName || "").trim() ||
      (editData.middleName || "").trim() !== (profileData.middleName || "").trim() ||
      (editData.lastName || "").trim() !== (profileData.lastName || "").trim() ||
      normEditDob !== normProfileDob ||
      (editData.gender || "") !== (profileData.gender || "") ||
      (editData.civilStatus || "") !== (profileData.civilStatus || "") ||
      (editData.nationality || "").trim() !== (profileData.nationality || "").trim() ||
      (editData.occupation || "").trim() !== (profileData.occupation || "").trim() ||
      (editData.phone || "").trim() !== (profileData.phone || "").trim() ||
      (editData.address || "").trim() !== (profileData.address || "").trim() ||
      (editData.emergencyContact || "").trim() !== (profileData.emergencyContact || "").trim() ||
      (editData.emergencyRelationship || "").trim() !== (profileData.emergencyRelationship || "").trim() ||
      (editData.emergencyPhone || "").trim() !== (profileData.emergencyPhone || "").trim() ||
      (editData.profileImage || "") !== (profileData.profileImage || "")
    );
  }, [editData, profileData, pendingFile]);

  const handleBlur = (field, customVal) => {
    const val = customVal !== undefined ? customVal : editData?.[field];
    const personalPhone = editData?.phone || profileData?.phone || "";
    const err = validateField(field, val, { personalPhone });
    setErrors((p) => {
      const n = { ...p };
      if (err) n[field] = err;
      else delete n[field];
      return n;
    });
  };

  const handleSaveWithValidation = async () => {
    if (!isProfileLocked) {
      const newErrors = {};
      const fieldsToValidate = [
        "firstName",
        "middleName",
        "lastName",
        "dateOfBirth",
        "gender",
        "civilStatus",
        "nationality",
        "occupation",
        "phone",
        "address",
      ];
      const personalPhone = (editData.phone || "").trim();
      for (const f of fieldsToValidate) {
        const val = editData[f];
        const e = validateField(f, val, { personalPhone });
        if (e) newErrors[f] = e;
      }

      // Emergency Contact group validation
      const emGroup = validateEmergencyContactGroup(editData, personalPhone);
      if (!emGroup.isValid) {
        Object.assign(newErrors, emGroup.errors);
      }

      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        showNotification("Please correct the errors in the form before saving.", "warning", 3500);
        return;
      }
    }

    let payload;
    if (isProfileLocked) {
      // When locked, only allow profileImage update
      payload = {};
    } else {
      payload = {
        ...editData,
        firstName: (editData.firstName || "").trim(),
        middleName: (editData.middleName || "").trim(),
        lastName: (editData.lastName || "").trim(),
        nationality: (editData.nationality || "").trim(),
        occupation: (editData.occupation || "").trim(),
        phone: (editData.phone || "").trim() || null,
        address: (editData.address || "").trim(),
        emergencyContact: (editData.emergencyContact || "").trim(),
        emergencyRelationship: (editData.emergencyRelationship || "").trim(),
        emergencyPhone: (editData.emergencyPhone || "").trim(),
      };
    }


    if (pendingFile) {
      setUploading(true);
      try {
        const { uploadToFirebaseStorage } = await import(
          "../../../../shared/utils/firebaseStorageUpload"
        );
        const { downloadUrl: imageUrl } = await uploadToFirebaseStorage(pendingFile, {
          documentType: "profile-photo",
        });
        if (imageUrl) {
          payload.profileImage = imageUrl;
          setEditData((prev) => ({ ...prev, profileImage: imageUrl }));
        }
      } catch {
        showNotification("Failed to upload photo. Please try again.", "error", 3000);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    setPendingFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onSave(payload);
  };

  const handleCancel = () => {
    setErrors({});
    setPendingFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onCancel();
  };

  const hasValidationErrors = Object.keys(errors).length > 0;
  const fp = { editing: isEditingProfile, editData, setEditData, errors, onBlur: handleBlur, locked: isProfileLocked };
  const canTriggerPhotoUpload = isEditingProfile && !uploading && !saving;

  return (
    <div style={s.container}>
      {/* ── Page Heading ── */}
      <div style={s.heading}>
        <h1 style={s.title}>Personal Details</h1>
        <p style={s.subtitle}>Your identity information, contact records, and profile details</p>
      </div>

      {/* ── Profile Summary Header Card ── */}
      <div style={s.headerCard}>
        {/* Avatar (Click to change photo in edit mode) */}
        <div
          style={{
            ...s.avatarWrap,
            cursor: canTriggerPhotoUpload ? "pointer" : "default",
          }}
          title={canTriggerPhotoUpload ? "Click to select a new profile photo" : undefined}
          onClick={canTriggerPhotoUpload ? () => fileInputRef.current?.click() : undefined}
          onMouseEnter={() => isEditingProfile && setHoveringAvatar(true)}
          onMouseLeave={() => setHoveringAvatar(false)}
        >
          {(() => {
            const img =
              localPreviewUrl ||
              (isEditingProfile ? editData?.profileImage : null) ||
              profileData.profileImage;
            return img ? (
              <div style={s.avatar}>
                <img
                  src={img}
                  alt="Profile"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ) : (
              <div style={s.avatarFallback}>{initials}</div>
            );
          })()}

          {/* Hover / Uploading Overlay (only active in edit profile mode) */}
          <div
            style={{
              ...s.avatarOverlay,
              opacity: isEditingProfile && (uploading || hoveringAvatar) ? 1 : 0,
              pointerEvents: "none",
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, marginTop: 2 }}>
                  Uploading…
                </span>
              </>
            ) : (
              <>
                <Camera size={16} color="#fff" />
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>Change</span>
              </>
            )}
          </div>

          {/* Camera Badge indicator (only visible in edit profile mode) */}
          {isEditingProfile && !uploading && (
            <div style={s.avatarBadge} title="Select new photo">
              <Camera size={12} color="var(--primary-foreground)" />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
        </div>

        {/* Name + Meta Chips */}
        <div style={s.profileMeta}>
          <h2 style={s.profileName}>{fullName}</h2>
          <div style={s.profileEmail}>
            <Mail size={13} color="var(--muted-foreground)" />
            <span>{profileData.email}</span>
          </div>
          <div style={s.profileChips}>
            <span style={s.chipPrimary}>
              <User size={11} />
              {occupancyLabel}
            </span>
            {profileData.occupation && (
              <span style={s.chip}>
                <Briefcase size={11} />
                {profileData.occupation}
              </span>
            )}
            {profileData.nationality && (
              <span style={s.chip}>
                <Globe size={11} />
                {profileData.nationality}
              </span>
            )}
            {profileData.gender && (
              <span style={s.chip}>
                <Users size={11} />
                {toTitleCase(profileData.gender)}
              </span>
            )}
          </div>
          <div
            style={s.completionWrap}
            aria-label={`Profile completeness: ${completeness.completed} of ${completeness.total} details completed`}
          >
            <div style={s.completionTrack}>
              <div style={{ ...s.completionFill, width: `${completeness.percent}%` }} />
            </div>
            <span style={s.completionText}>
              {completeness.completed}/{completeness.total} complete
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={s.actionWrap}>
          {isEditingProfile ? (
            <>
              <button onClick={handleCancel} style={s.cancelBtn} type="button">
                <X size={14} /> Discard
              </button>
              <button
                onClick={handleSaveWithValidation}
                disabled={saving || uploading || !hasChanges || (!isProfileLocked && hasValidationErrors)}
                type="button"
                style={{
                  ...s.saveBtn,
                  opacity: saving || uploading || !hasChanges || (!isProfileLocked && hasValidationErrors) ? 0.55 : 1,
                  cursor: saving || uploading || !hasChanges || (!isProfileLocked && hasValidationErrors) ? "not-allowed" : "pointer",
                }}
                title={
                  !isProfileLocked && hasValidationErrors
                    ? "Please fix validation errors before saving"
                    : !hasChanges
                    ? "No changes to save"
                    : "Save Changes"
                }
              >
                <Save size={14} />
                {uploading ? "Uploading…" : saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <>
              {isProfileLocked && (
                <span style={s.lockedBadge} title="Personal identity details are locked following application submission">
                  <Lock size={12} color="var(--muted-foreground)" />
                  Profile Locked
                </span>
              )}
              <button onClick={handleStartEditing} style={s.editBtn} type="button">
                <Edit2 size={14} /> Edit Profile
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Section 1: Identity Information ── */}
      <div style={s.infoCard}>
        <SectionHeader icon={User} title="Personal & Identity Information" />
        <div style={s.sectionBody}>
          <div style={s.grid3}>
            {/* Structured Names */}
            <Field
              icon={User}
              label="First Name"
              field="firstName"
              value={profileData.firstName}
              required
              maxLength={50}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <Field
              icon={User}
              label="Middle Name"
              field="middleName"
              value={isEditingProfile ? editData?.middleName || "" : profileData.middleName}
              maxLength={50}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <Field
              icon={User}
              label="Last Name"
              field="lastName"
              value={profileData.lastName}
              required
              maxLength={50}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <BirthdayField
              icon={CalendarDays}
              label="Date of Birth"
              field="dateOfBirth"
              value={isEditingProfile ? editData?.dateOfBirth || "" : profileData.dateOfBirth}
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />

            {/* Demographics */}
            <SelectField
              icon={Users}
              label="Gender"
              field="gender"
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
                { value: "prefer-not-to-say", label: "Prefer not to say" },
              ]}
              value={isEditingProfile ? editData?.gender || "" : profileData.gender}
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <SelectField
              icon={Heart}
              label="Civil Status"
              field="civilStatus"
              options={[
                { value: "single", label: "Single" },
                { value: "married", label: "Married" },
                { value: "widowed", label: "Widowed" },
                { value: "separated", label: "Separated" },
                { value: "divorced", label: "Divorced" },
              ]}
              value={isEditingProfile ? editData?.civilStatus || "" : profileData.civilStatus}
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <Field
              icon={Globe}
              label="Nationality"
              field="nationality"
              value={isEditingProfile ? editData?.nationality || "" : profileData.nationality}
              maxLength={50}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />

            {/* Occupation */}
            <Field
              icon={Briefcase}
              label="Occupation / Profession"
              field="occupation"
              value={isEditingProfile ? editData?.occupation || "" : profileData.occupation}
              maxLength={60}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
          </div>

          <p style={s.noteText}>
            {isProfileLocked
              ? "* Your personal identity details are locked following application submission. Profile photo updates remain available. For legal information changes, please contact the dormitory administration."
              : "* Your profile details are editable. Any information you complete here will automatically help pre-fill your dormitory application form."}
          </p>
        </div>
      </div>

      {/* ── Section 2: Contact Information ── */}
      <div style={{ ...s.infoCard, marginTop: 16 }}>
        <SectionHeader icon={Phone} title="Contact Information" />
        <div style={s.sectionBody}>
          <div style={s.grid3}>
            <PhoneField
              icon={Phone}
              label="Contact Number"
              field="phone"
              value={isEditingProfile ? editData?.phone || "" : profileData.phone}
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <Field
              icon={Mail}
              label="Email Address"
              field="email"
              value={profileData.email}
              locked
            />
            <Field
              icon={MapPin}
              label="Current Address"
              field="address"
              value={isEditingProfile ? editData?.address || "" : profileData.address}
              maxLength={200}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
          </div>
        </div>
      </div>

      {/* ── Section 3: Emergency Contact ── */}
      <div style={{ ...s.infoCard, marginTop: 16 }}>
        <SectionHeader icon={Shield} title="Emergency Contact" />
        <div style={s.sectionBody}>
          <div style={s.grid3}>
            <Field
              icon={User}
              label="Contact Person"
              field="emergencyContact"
              value={isEditingProfile ? editData?.emergencyContact || "" : profileData.emergencyContact}
              maxLength={100}
              autoCapitalizeWords
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <SelectField
              icon={Users}
              label="Relationship"
              field="emergencyRelationship"
              options={RELATIONSHIP_OPTIONS}
              value={isEditingProfile ? editData?.emergencyRelationship || "" : profileData.emergencyRelationship}
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
            <PhoneField
              icon={Phone}
              label="Contact Number"
              field="emergencyPhone"
              value={isEditingProfile ? editData?.emergencyPhone || "" : profileData.emergencyPhone}
              placeholder="Enter emergency contact number"
              onAdd={isProfileLocked ? undefined : handleStartEditing}
              {...fp}
            />
          </div>
        </div>
      </div>


      {/* ── Section 4: Current Stay & Lease Details (Tenants Only) ── */}
      {profileData.role === "tenant" && (
        <div style={{ ...s.infoCard, marginTop: 16 }}>
          <SectionHeader icon={Home} title="Current Stay & Accommodation" />
          <div style={s.sectionBody}>
            <div style={s.grid3}>
              <Field
                icon={Building2}
                label="Branch"
                field="branch"
                value={formatBranch(profileData.occupancy?.branch || profileData.branch)}
                locked
              />
              <Field
                icon={Home}
                label="Room"
                field="room"
                value={profileData.occupancy?.room || profileData.room}
                locked
              />
              <Field
                icon={Layers}
                label="Bed"
                field="bed"
                value={formatBed(profileData.occupancy?.bed || profileData.bed)}
                locked
              />
              <Field
                icon={CalendarDays}
                label="Move-In Date"
                field="moveInDate"
                value={
                  profileData.occupancy?.moveInDate
                    ? fmtDate(profileData.occupancy.moveInDate)
                    : ""
                }
                locked
              />
              <Field
                icon={CalendarDays}
                label="Lease Start"
                field="leaseStart"
                value={
                  profileData.lease?.startDate ? fmtDate(profileData.lease.startDate) : ""
                }
                locked
              />
              <Field
                icon={CalendarDays}
                label="Lease End"
                field="leaseEnd"
                value={profileData.lease?.endDate ? fmtDate(profileData.lease.endDate) : ""}
                locked
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalDetailsTab;