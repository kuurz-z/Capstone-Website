import { useState } from "react";

/**
 * FloatingTextarea — Material-style floating label textarea.
 *
 * Matches FloatingInput styling: border-on-focus, error/valid states,
 * floated label sits ON the border.
 *
 * Props:
 *  - label (string)      — The label text
 *  - name (string)       — Textarea name attribute
 *  - value (string)      — Controlled value
 *  - onChange (fn)        — Change handler
 *  - rows (number)       — Number of rows (default: 4)
 *  - disabled (bool)     — Disabled state
 *  - error (string|null) — Validation error message
 *  - valid (bool)        — Show green valid state
 *  - maxLength (number)  — Max character count
 *  - showCounter (bool)  — Show character counter
 */
const FloatingTextarea = ({
  label,
  name,
  value = "",
  onChange,
  rows = 4,
  disabled = false,
  error = null,
  valid = false,
  maxLength,
  showCounter = false,
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;
  const showValid = valid && hasValue && !focused;

  // Border color — always neutral; state indicated by label color only
  const borderColor = "var(--fi-border)";

  return (
    <div className="floating-field">
      <div
        className={`floating-field__wrapper ${hasValue || focused ? "active" : ""} ${focused ? "focused" : ""} ${error ? "has-error" : ""} ${showValid ? "is-valid" : ""}`}
        style={{ "--border-color": borderColor }}
      >
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className="floating-field__input floating-field__textarea"
          placeholder=" "
          style={{ resize: "none" }}
        />
        <label htmlFor={name} className="floating-field__label floating-field__label--textarea">
          {label}
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {error && <span className="floating-field__error">{error}</span>}
        {showCounter && maxLength && (
          <span
            className="floating-field__counter"
            style={{
              marginLeft: "auto",
              fontSize: "12px",
              color: value.length > maxLength * 0.9 ? "var(--fi-error)" : "var(--fi-label)",
            }}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
};

export default FloatingTextarea;
