import { useState } from "react";

/**
 * FloatingInput — Material-style floating label input.
 *
 * When empty + not focused: label sits inside the field as placeholder.
 * When focused or has value: label animates up to the top border.
 *
 * Props:
 *  - label (string)      — The label / placeholder text
 *  - name (string)       — Input name attribute
 *  - type (string)       — Input type (default: "text")
 *  - value (string)      — Controlled value
 *  - onChange (fn)        — Change handler
 *  - disabled (bool)     — Disabled state
 *  - error (string|null) — Validation error message
 *  - valid (bool)        — Show green valid state
 *  - autoComplete (str)  — autoComplete attribute
 *  - endAdornment (node) — Element rendered at end (e.g. eye toggle)
 *  - inputMode (string)  — inputMode attribute
 *  - maxLength (number)  — maxLength attribute
 */
const FloatingInput = ({
  label,
  name,
  type = "text",
  value = "",
  onChange,
  onBlur: externalBlur,
  disabled = false,
  error = null,
  valid = false,
  autoComplete,
  endAdornment,
  inputMode,
  maxLength,
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
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (externalBlur) externalBlur();
          }}
          disabled={disabled}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          className="floating-field__input"
          placeholder=" "
        />
        <label htmlFor={name} className="floating-field__label">
          {label}
        </label>
        {endAdornment && (
          <div className="floating-field__adornment">{endAdornment}</div>
        )}
      </div>
      {error && <span className="floating-field__error">{error}</span>}
    </div>
  );
};

export default FloatingInput;
