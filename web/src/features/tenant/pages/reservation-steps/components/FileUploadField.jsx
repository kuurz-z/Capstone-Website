import React, { useRef, useState } from "react";
import { uploadToImageKit, validateFile } from "../../../../../shared/utils/imageUpload";

/**
 * Reusable file upload field with:
 * - Drag & drop support
 * - Client-side validation (size + type)
 * - Upload progress bar
 * - Error feedback
 * - Immediate ImageKit upload on file select
 */
const FileUploadField = ({
  label,
  value,
  onChange,
  accept = "image/*,.pdf",
  hint,
  userId,
}) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const isUploaded = typeof value === "string" && value.startsWith("http");
  const isFile = value instanceof File;
  const fileName = isUploaded
    ? "✓ Uploaded"
    : isFile
      ? value.name
      : null;

  const handleClick = () => {
    if (!uploading) inputRef.current?.click();
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate before upload
    const check = validateFile(file);
    if (!check.valid) {
      setError(check.error);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const url = await uploadToImageKit(file, (pct) => setProgress(pct));
      setUploading(false);
      setProgress(100);
      onChange(url); // Pass the ImageKit URL, not the File
    } catch (err) {
      setUploading(false);
      setProgress(0);
      setError(err.message || "Upload failed. Please try again.");
      // Still pass the File so user can retry
      onChange(file);
    }
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0] || null;
    processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] || null;
    if (file) processFile(file);
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
          border: `2px dashed ${error ? "#EF4444" : isUploaded ? "#10B981" : "#d9d9d9"}`,
          borderRadius: "8px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          transition: "all 0.3s",
          marginTop: "8px",
          background: error ? "#FEF2F2" : isUploaded ? "#F0FDF4" : "transparent",
          opacity: uploading ? 0.85 : 1,
        }}
      >
        {uploading ? (
          <>
            <div style={{ fontSize: "14px", color: "#E7710F", fontWeight: 500, marginBottom: "8px" }}>
              Uploading… {progress}%
            </div>
            <div style={{ width: "100%", height: "6px", background: "#F3F4F6", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #E7710F, #F59E0B)",
                  borderRadius: "3px",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </>
        ) : isUploaded ? (
          <div style={{ color: "#059669", fontWeight: 500 }}>
            ✓ Uploaded — click to replace
          </div>
        ) : fileName ? (
          <div style={{ color: "#059669", fontWeight: 500 }}>✓ {fileName}</div>
        ) : (
          <>
            <div style={{ fontSize: "20px", marginBottom: "8px", color: "#6B7280" }}>↑</div>
            <div style={{ color: "#666" }}>Click to upload or drag and drop</div>
          </>
        )}

        {/* Error message */}
        {error && !uploading && (
          <div style={{ fontSize: "12px", color: "#EF4444", marginTop: "6px", fontWeight: 500 }}>
            ⚠ {error}
          </div>
        )}

        {/* Hint */}
        {hint && !error && (
          <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
            {hint}
          </div>
        )}

        {/* File size limit hint */}
        {!fileName && !uploading && !error && (
          <div style={{ fontSize: "11px", color: "#B0B0B0", marginTop: "4px" }}>
            Max 5MB · JPEG, PNG, or PDF
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadField;
