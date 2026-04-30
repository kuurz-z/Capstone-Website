import React, { useRef, useState } from "react";
import { uploadToImageKit, validateFile } from "../../../../../shared/utils/imageUpload";
import { CheckCircle, AlertTriangle, Upload } from "lucide-react";

function formatFileSize(bytes) {
 if (!bytes) return "";
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
 label, value, onChange,
 accept = "image/*,.pdf", hint, userId,
 hasError, required,
}) => {
 const inputRef = useRef(null);
 const [uploading, setUploading] = useState(false);
 const [progress, setProgress] = useState(0);
 const [error, setError] = useState(null);
 const [fileMeta, setFileMeta] = useState(null);

 const isUploaded = typeof value === "string" && value.startsWith("http");
 const isFile = value instanceof File;
 const showFieldError = hasError && !isUploaded && !isFile;

 const handleClick = () => { if (!uploading) inputRef.current?.click(); };

 const processFile = async (file) => {
 if (!file) return;
 const check = validateFile(file);
 if (!check.valid) { setError(check.error); return; }
 setFileMeta({ name: file.name, size: file.size });
 setError(null); setUploading(true); setProgress(0);
 try {
 const url = await uploadToImageKit(file, (pct) => setProgress(pct));
 setUploading(false); setProgress(100); onChange(url);
 } catch (err) {
 setUploading(false); setProgress(0);
 setError(err.message || "Upload failed. Please try again.");
 onChange(file);
 }
 };

 const handleChange = (e) => { const file = e.target.files?.[0] || null; processFile(file); e.target.value = ""; };
 const handleDrop = (e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0] || null; if (file) processFile(file); };
 const handleDragOver = (e) => e.preventDefault();

 /* Determine state-based CSS class modifiers */
 const zoneClass = [
 "rf-upload-zone",
 showFieldError ? "rf-upload-zone--error" : "",
 error ? "rf-upload-zone--error" : "",
 isUploaded ? "rf-upload-zone--success" : "",
 uploading ? "rf-upload-zone--uploading" : "",
 ].filter(Boolean).join(" ");

 return (
 <div className="form-group">
 <label className="form-label">
 {label}
 {required && <span className="rf-required"> *</span>}
 </label>
 <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="rf-file-input-hidden" />
 <div className={zoneClass} onClick={handleClick} onDrop={handleDrop} onDragOver={handleDragOver}>

 {uploading ? (
 <>
 <div className="rf-upload-status rf-upload-status--uploading">
 Uploading… {progress}%
 </div>
 {fileMeta && <div className="rf-upload-filename">{truncateName(fileMeta.name)}</div>}
 <div className="rf-upload-progress-track">
 <div className="rf-upload-progress-fill" style={{ width: `${progress}%` }} />
 </div>
 </>
 ) : isUploaded ? (
 <div>
 <div className="rf-upload-status rf-upload-status--success">
 <CheckCircle size={15} /> Uploaded successfully
 </div>
 {fileMeta ? (
 <div className="rf-upload-meta">
 <span className="rf-upload-meta__name">{truncateName(fileMeta.name)}</span>
 <span className="rf-upload-meta__dot">·</span>
 <span>{formatFileSize(fileMeta.size)}</span>
 </div>
 ) : (
 <div className="rf-upload-hint">File uploaded</div>
 )}
 <div className="rf-upload-replace-hint">Click to replace</div>
 </div>
 ) : isFile ? (
 <div className="rf-upload-status rf-upload-status--success">
 <CheckCircle size={14} /> {value.name}
 </div>
 ) : (
 <>
 <div className="rf-upload-icon"><Upload size={20} /></div>
 <div className="rf-upload-cta">Click to upload or drag and drop</div>
 </>
 )}

 {error && !uploading && (
 <div className="rf-upload-error">
 <AlertTriangle size={12} /> {error}
 </div>
 )}

 {hint && !error && <div className="rf-upload-hint">{hint}</div>}

 {!isUploaded && !isFile && !uploading && !error && (
 <div className="rf-upload-limit">Max 5MB · JPEG, PNG, or PDF</div>
 )}
 </div>
 </div>
 );
};

export default FileUploadField;
