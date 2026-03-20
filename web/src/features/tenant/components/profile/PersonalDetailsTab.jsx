import React, { useState, useMemo, useRef } from "react";
import {
  Edit2,
  User,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  Calendar,
  Save,
  X,
  Camera,
} from "lucide-react";
import { fmtDate } from "../../../../shared/utils/formatDate";
import { showNotification } from "../../../../shared/utils/notification";
import { authFetch } from "../../../../shared/api/apiClient";
import { useQueryClient } from "@tanstack/react-query";

/**
 * PersonalDetailsTab — Modern, sectioned profile display with inline editing.
 */

/* ── Validation ─────────────────────────────────── */
const validateField = (field, value) => {
  if (!value || !value.trim()) return null;
  switch (field) {
    case "firstName":
    case "lastName":
      if (value.trim().length < 2) return "At least 2 characters";
      if (value.trim().length > 50) return "50 characters max";
      if (!/^[a-zA-Z\s\-']+$/.test(value.trim())) return "Letters only";
      return null;
    case "phone":
    case "emergencyPhone":
      if (!/^[+\d\-() ]{7,20}$/.test(value.trim())) return "Invalid format";
      return null;
    case "dateOfBirth": {
      const dob = new Date(value);
      if (isNaN(dob.getTime())) return "Invalid date";
      if (dob > new Date()) return "Cannot be in the future";
      return null;
    }
    default:
      return null;
  }
};

/* ── Styles ──────────────────────────────────────── */
const s = {
  container: { width: "100%" },
  heading: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: 0 },
  subtitle: { fontSize: 13, color: "var(--text-muted, #9CA3AF)", marginTop: 4 },

  card: {
    background: "var(--surface-card, #fff)",
    borderRadius: 12,
    border: "1px solid var(--border-card, #E8EBF0)",
    marginBottom: 16,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-heading, #0A1628)",
    margin: 0,
  },
  cardBody: {
    padding: "16px 20px",
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px 24px",
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted, #94A3B8)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-heading, #1F2937)",
    margin: 0,
  },
  fieldEmpty: {
    fontSize: 14,
    fontWeight: 400,
    color: "var(--text-muted, #CBD5E1)",
    fontStyle: "italic",
    margin: 0,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid var(--border-card, #E8EBF0)",
    borderRadius: 8,
    color: "var(--text-heading, #1F2937)",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxSizing: "border-box",
  },
  inputFocus: {
    borderColor: "#FF8C42",
    boxShadow: "0 0 0 3px rgba(212,152,43,0.08)",
  },
  inputError: {
    borderColor: "#EF4444",
    boxShadow: "0 0 0 3px rgba(239,68,68,0.06)",
  },
  errorText: {
    fontSize: 11,
    color: "#EF4444",
    marginTop: 2,
  },

  // Profile card (top card)
  profileCard: {
    background: "var(--surface-card, #fff)",
    borderRadius: 12,
    border: "1px solid var(--border-card, #E8EBF0)",
    padding: "24px",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%)",
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "1px",
  },
  profileName: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-heading, #0A1628)",
    margin: 0,
  },
  profileEmail: {
    fontSize: 13,
    color: "var(--text-secondary, #6B7280)",
    margin: "2px 0 0",
  },
  profileLocation: {
    fontSize: 12,
    color: "var(--text-muted, #9CA3AF)",
    margin: "2px 0 0",
  },

  // Buttons
  editBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    border: "1px solid var(--border-card, #E8EBF0)",
    borderRadius: 8,
    background: "var(--surface-card, #fff)",
    fontSize: 13,
    fontWeight: 600,
    color: "#FF8C42",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  saveBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 20px",
    border: "none",
    borderRadius: 8,
    background: "#FF8C42",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  cancelBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    border: "1px solid var(--border-card, #E8EBF0)",
    borderRadius: 8,
    background: "var(--surface-card, #fff)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary, #6B7280)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
};

/* ── Field display / edit component ──────────────── */
const Field = ({
  label,
  value,
  field,
  type = "text",
  editing,
  editData,
  setEditData,
  errors,
  onBlur,
  required,
  colSpan,
}) => {
  const [focused, setFocused] = useState(false);
  const hasError = errors?.[field];

  return (
    <div style={colSpan ? { gridColumn: "1 / -1" } : {}}>
      <div style={s.fieldLabel}>
        {label}
        {required && editing && (
          <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>
        )}
      </div>
      {editing && field !== "email" ? (
        <div>
          <input
            type={type}
            value={editData?.[field] || ""}
            onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.(field);
            }}
            style={{
              ...s.input,
              ...(focused && !hasError ? s.inputFocus : {}),
              ...(hasError ? s.inputError : {}),
            }}
            placeholder={`Enter ${label.toLowerCase()}`}
          />
          {hasError && <div style={s.errorText}>{errors[field]}</div>}
        </div>
      ) : (
        <p style={value && value !== "Not provided" ? s.fieldValue : s.fieldEmpty}>
          {type === "date" && value ? fmtDate(value) : value || "Not provided"}
        </p>
      )}
    </div>
  );
};

/* ── Section component ───────────────────────────── */
const Section = ({ icon: Icon, title, color, children }) => (
  <div style={s.card}>
    <div style={s.cardHeader}>
      <div style={{ ...s.cardHeaderIcon, backgroundColor: color + "12" }}>
        <Icon size={16} color={color} />
      </div>
      <h3 style={s.cardHeaderTitle}>{title}</h3>
    </div>
    <div style={s.cardBody}>
      <div style={s.fieldGrid}>{children}</div>
    </div>
  </div>
);

/* ── Main Component ──────────────────────────────── */
const PersonalDetailsTab = ({
  profileData,
  editData,
  setEditData,
  fullName,
  isEditingProfile,
  setIsEditingProfile,
  saving,
  onSave,
  onCancel,
}) => {
  const [errors, setErrors] = useState({});

  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // File waiting to be uploaded on save
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null); // blob URL for preview
  const queryClient = useQueryClient();

  const initials = useMemo(() => {
    const f = (profileData.firstName || "").charAt(0).toUpperCase();
    const l = (profileData.lastName || "").charAt(0).toUpperCase();
    return f + l || "?";
  }, [profileData.firstName, profileData.lastName]);

  // File selected → show local preview instantly (no dialog, no upload yet)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clean up old preview
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const blobUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setLocalPreviewUrl(blobUrl);
    e.target.value = "";
  };

  // Detect if anything changed
  const hasChanges = useMemo(() => {
    if (pendingFile) return true; // new photo selected
    if (!editData) return false;
    return (
      editData.firstName !== (profileData.firstName || "") ||
      editData.lastName !== (profileData.lastName || "") ||
      editData.phone !== (profileData.phone || "") ||
      editData.address !== (profileData.address || "") ||
      editData.city !== (profileData.city || "") ||
      editData.dateOfBirth !== (profileData.dateOfBirth || "") ||
      editData.emergencyContact !== (profileData.emergencyContact || "") ||
      editData.emergencyPhone !== (profileData.emergencyPhone || "")
    );
  }, [editData, profileData, pendingFile]);

  const handleBlur = (field) => {
    if (field === "firstName" || field === "lastName") {
      if (!editData[field]?.trim()) {
        setErrors((prev) => ({
          ...prev,
          [field]: `${field === "firstName" ? "First" : "Last"} name is required`,
        }));
        return;
      }
    }
    const err = validateField(field, editData[field]);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  };

  const handleSaveWithValidation = async () => {
    const newErrors = {};
    if (!editData.firstName?.trim()) newErrors.firstName = "Required";
    else {
      const err = validateField("firstName", editData.firstName);
      if (err) newErrors.firstName = err;
    }
    if (!editData.lastName?.trim()) newErrors.lastName = "Required";
    else {
      const err = validateField("lastName", editData.lastName);
      if (err) newErrors.lastName = err;
    }
    ["phone", "dateOfBirth", "emergencyPhone"].forEach((f) => {
      if (editData[f]) {
        const err = validateField(f, editData[f]);
        if (err) newErrors[f] = err;
      }
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    // If there's a pending photo, upload it first
    if (pendingFile) {
      setUploading(true);
      try {
        const { uploadToImageKit } = await import("../../../../shared/utils/imageUpload");
        const imageUrl = await uploadToImageKit(pendingFile);
        if (imageUrl) {
          // Directly mutate editData so onSave sees it immediately
          editData.profileImage = imageUrl;
          setEditData((prev) => ({ ...prev, profileImage: imageUrl }));
        }
      } catch (err) {
        console.error("Photo upload failed:", err);
        showNotification("Failed to upload photo. Please try again.", "error", 3000);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setPendingFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onSave();
  };

  const handleCancel = () => {
    setErrors({});
    setPendingFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onCancel();
  };

  const fieldProps = {
    editing: isEditingProfile,
    editData,
    setEditData,
    errors,
    onBlur: handleBlur,
  };

  return (
    <div style={s.container}>
      {/* Heading */}
      <div style={s.heading}>
        <h1 style={s.title}>Personal Details</h1>
        <p style={s.subtitle}>
          Basic information for inquiries, visits, and reservations
        </p>
      </div>

      {/* Profile Card */}
      <div style={s.profileCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar — interactive only in edit mode */}
          <div
            onClick={() => isEditingProfile && !uploading && fileInputRef.current?.click()}
            style={{
              position: "relative",
              cursor: isEditingProfile ? "pointer" : "default",
            }}
            title={isEditingProfile ? "Click to change photo" : undefined}
            onMouseEnter={(e) => {
              if (!isEditingProfile) return;
              const overlay = e.currentTarget.querySelector("[data-overlay]");
              if (overlay) overlay.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              if (!isEditingProfile || uploading) return;
              const overlay = e.currentTarget.querySelector("[data-overlay]");
              if (overlay) overlay.style.opacity = "0";
            }}
          >
            {(() => {
              const displayImage = localPreviewUrl
                || (isEditingProfile ? editData?.profileImage : null)
                || profileData.profileImage;
              return displayImage ? (
                <div style={s.avatar}>
                  <img
                    src={displayImage}
                    alt="Profile"
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                  />
                </div>
              ) : (
                <div style={s.avatarFallback}>{initials}</div>
              );
            })()}
            {/* Hover overlay / Upload spinner — edit mode only */}
            {isEditingProfile && (
              <div
                data-overlay
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: uploading ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.45)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  opacity: uploading ? 1 : 0,
                  transition: "opacity 0.2s",
                }}
              >
                {uploading ? (
                  <>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        border: "3px solid rgba(255,255,255,0.25)",
                        borderTop: "3px solid #FF8C42",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span style={{ color: "#fff", fontSize: 9, fontWeight: 600, marginTop: 2 }}>Uploading</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  </>
                ) : (
                  <>
                    <Camera size={16} color="#fff" />
                    <span style={{ color: "#fff", fontSize: 9, fontWeight: 600, letterSpacing: "0.03em" }}>Change</span>
                  </>
                )}
              </div>
            )}
            {/* Camera badge — edit mode only */}
            {isEditingProfile && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#FF8C42",
                  border: "2px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }}
              >
                <Camera size={12} color="#fff" />
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

          <div>
            <h2 style={s.profileName}>{fullName}</h2>
            <p style={s.profileEmail}>{profileData.email}</p>
            {profileData.city && (
              <p style={s.profileLocation}>
                <MapPin
                  size={11}
                  style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}
                />
                {profileData.city}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          {isEditingProfile ? (
            <>
              <button
                onClick={handleCancel}
                style={s.cancelBtn}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted, #F8FAFC)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-card, #fff)")}
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={handleSaveWithValidation}
                disabled={saving || uploading || !hasChanges}
                style={{
                  ...s.saveBtn,
                  opacity: (saving || uploading || !hasChanges) ? 0.5 : 1,
                  cursor: (saving || uploading || !hasChanges) ? "not-allowed" : "pointer",
                  background: !hasChanges ? "#9CA3AF" : s.saveBtn.background,
                }}
                onMouseEnter={(e) => {
                  if (!saving && !uploading && hasChanges) e.currentTarget.style.background = "#C48A24";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = !hasChanges ? "#9CA3AF" : "#FF8C42";
                }}
              >
                <Save size={14} /> {uploading ? "Uploading…" : saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditingProfile(true)}
              style={s.editBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 140, 66, 0.06)";
                e.currentTarget.style.borderColor = "#FF8C42";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--surface-card, #fff)";
                e.currentTarget.style.borderColor = "var(--border-card, #E8EBF0)";
              }}
            >
              <Edit2 size={14} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Section: Personal Information */}
      <Section icon={User} title="Personal Information" color="#0A1628">
        {isEditingProfile ? (
          <>
            <Field label="First Name" field="firstName" required {...fieldProps} />
            <Field label="Last Name" field="lastName" required {...fieldProps} />
          </>
        ) : (
          <Field
            label="Full Name"
            field="firstName"
            value={fullName}
            {...fieldProps}
          />
        )}
        <Field
          label="Email Address"
          field="email"
          value={profileData.email}
          {...fieldProps}
        />
        <Field
          label="Date of Birth"
          field="dateOfBirth"
          type="date"
          value={isEditingProfile ? (editData?.dateOfBirth || "") : profileData.dateOfBirth}
          {...fieldProps}
        />
      </Section>

      {/* Section: Contact & Address */}
      <Section icon={Phone} title="Contact & Address" color="#2563EB">
        <Field
          label="Phone Number"
          field="phone"
          value={profileData.phone}
          {...fieldProps}
        />
        <Field
          label="City"
          field="city"
          value={profileData.city}
          {...fieldProps}
        />
        <Field
          label="Address"
          field="address"
          value={profileData.address}
          colSpan
          {...fieldProps}
        />
      </Section>

      {/* Section: Emergency Contact */}
      <Section icon={AlertTriangle} title="Emergency Contact" color="#DC2626">
        <Field
          label="Contact Name"
          field="emergencyContact"
          value={profileData.emergencyContact}
          {...fieldProps}
        />
        <Field
          label="Contact Phone"
          field="emergencyPhone"
          value={profileData.emergencyPhone}
          {...fieldProps}
        />
      </Section>


    </div>
  );
};

export default PersonalDetailsTab;
