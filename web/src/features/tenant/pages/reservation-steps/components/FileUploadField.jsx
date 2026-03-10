import React, { useRef } from "react";

/**
 * Reusable file upload field — replaces 5 identical copy-paste blocks
 * in ReservationApplicationStep.
 *
 * Uses native <input type="file"> instead of antd Upload to avoid
 * pulling in the ~1.2 MB Ant Design dependency.
 */
const FileUploadField = ({
  label,
  value,
  onChange,
  accept = "image/*,.pdf",
  hint,
}) => {
  const inputRef = useRef(null);

  const fileName =
    value instanceof File
      ? value.name
      : typeof value === "string"
        ? "Uploaded"
        : null;

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e) => {
    const file = e.target.files?.[0] || null;
    onChange(file);
    // Reset so selecting the same file again triggers onChange
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] || null;
    if (file) onChange(file);
  };

  const handleDragOver = (e) => e.preventDefault();

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{
          padding: "16px",
          border: "2px dashed #d9d9d9",
          borderRadius: "8px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.3s",
          marginTop: "8px",
        }}
      >
        {fileName ? (
          <div style={{ color: "#059669", fontWeight: 500 }}>✓ {fileName}</div>
        ) : (
          <>
            <div
              style={{
                fontSize: "20px",
                marginBottom: "8px",
                color: "#6B7280",
              }}
            >
              ↑
            </div>
            <div style={{ color: "#666" }}>
              Click to upload or drag and drop
            </div>
          </>
        )}
        {hint && (
          <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadField;
