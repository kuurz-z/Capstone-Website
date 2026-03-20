import React, { useRef, useState } from "react";
import { uploadToImageKit, validateFile } from "../../../../../shared/utils/imageUpload";
import { CheckCircle, AlertTriangle, Upload } from "lucide-react";

/** Format bytes into a human-readable string */
function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Truncate filename if too long, keeping the extension */
function truncateName(name, max = 28) {
  if (!name || name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return name.slice(0, max - ext.length - 3) + "..." + ext;
}

/**
 * Reusable file upload field with:
 * - Drag & drop support
 * - Client-side validation (size + type)
 * - Upload progress bar
 * - Error feedback
 * - Displays file name + size after upload
 * - Immediate ImageKit upload on file select
 */
const FileUploadField = ({
  label,
  value,
  onChange,
  accept = "image/*,.pdf",
  hint,
  userId,
  hasError,
  required,
}) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [fileMeta, setFileMeta] = useState(null); // { name, size }

  const isUploaded = typeof value === "string" && value.startsWith("http");
  const isFile = value instanceof File;
  const showFieldError = hasError && !isUploaded && !isFile;

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

    // Save file metadata for display after upload
    setFileMeta({ name: file.name, size: file.size });
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const url = await uploadToImageKit(file, (pct) => setProgress(pct));
      setUploading(false);
      setProgress(100);
      onChange(url);
    } catch (err) {
      setUploading(false);
      setProgress(0);
      setError(err.message || "Upload failed. Please try again.");
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
      <label className="form-label">
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
      </label>
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
          border: `2px dashed ${showFieldError ? "#EF4444" : error ? "#EF4444" : isUploaded ? "#10B981" : "#d9d9d9"}`,
          borderRadius: "8px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          transition: "all 0.3s",
          marginTop: "8px",
          background: showFieldError ? "#FEF2F2" : error ? "#FEF2F2" : isUploaded ? "#F0FDF4" : "transparent",
          opacity: uploading ? 0.85 : 1,
        }}
      >
        {uploading ? (
          <>
            <div style={{ fontSize: "14px", color: "#FF8C42", fontWeight: 500, marginBottom: "4px" }}>
              Uploading… {progress}%
            </div>
            {fileMeta && (
              <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "8px" }}>
                {truncateName(fileMeta.name)}
              </div>
            )}
            <div style={{ width: "100%", height: "6px", background: "#F3F4F6", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #FF8C42, #F59E0B)",
                  borderRadius: "3px",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </>
        ) : isUploaded ? (
          <div>
            <div style={{ color: "#059669", fontWeight: 600, fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <CheckCircle size={15} /> Uploaded successfully
            </div>
            {fileMeta ? (
              <div style={{ fontSize: "12px", color: "#6B7280", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500, color: "#374151" }}>{truncateName(fileMeta.name)}</span>
                <span style={{ color: "#D1D5DB" }}>·</span>
                <span>{formatFileSize(fileMeta.size)}</span>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#6B7280" }}>
                File uploaded
              </div>
            )}
            <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>
              Click to replace
            </div>
          </div>
        ) : isFile ? (
          <div style={{ color: "#059669", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={14} /> {value.name}</div>
        ) : (
          <>
            <div style={{ marginBottom: "8px", color: "#9CA3AF" }}><Upload size={20} /></div>
            <div style={{ color: "#666" }}>Click to upload or drag and drop</div>
          </>
        )}

        {/* Error message */}
        {error && !uploading && (
          <div style={{ fontSize: "12px", color: "#EF4444", marginTop: "6px", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={12} /> {error}
          </div>
        )}

        {/* Hint */}
        {hint && !error && (
          <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
            {hint}
          </div>
        )}

        {/* File size limit hint */}
        {!isUploaded && !isFile && !uploading && !error && (
          <div style={{ fontSize: "11px", color: "#B0B0B0", marginTop: "4px" }}>
            Max 5MB · JPEG, PNG, or PDF
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadField;
