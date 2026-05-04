import React, { useState, useMemo, useRef } from "react";
import {
 Edit2, User, Save, X, Camera, Mail,
 Briefcase, Globe, ChevronDown, Sparkles,
} from "lucide-react";
import { fmtDate } from "../../../../shared/utils/formatDate";
import { showNotification } from "../../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";

/* ─────────────────────────────────────────────────────────────────────────────
 VALIDATION
───────────────────────────────────────────────────────────────────────────── */
const validateField = (field, value) => {
 if (!value || !value.trim()) return null;
 switch (field) {
 case "firstName":
 case "lastName":
 if (value.trim().length < 2) return "At least 2 characters";
 if (value.trim().length > 50) return "50 characters max";
 if (!/^[a-zA-Z\s\-']+$/.test(value.trim())) return "Letters only";
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

/* ─────────────────────────────────────────────────────────────────────────────
 STYLES
───────────────────────────────────────────────────────────────────────────── */
const s = {
 container: { width: "100%" },

 /* page heading */
 heading: { marginBottom: 24 },
 title: { fontSize: 22, fontWeight: 700, color: "var(--text-heading, #0A1628)", margin: 0 },
 subtitle: { fontSize: 13, color: "var(--text-muted, #9CA3AF)", marginTop: 4 },

 /* ── Hero profile card ── */
 profileCard: {
 background: "var(--surface-card, #fff)",
 borderRadius: 16,
 border: "1px solid var(--border-card, #E8EBF0)",
 marginBottom: 16,
 overflow: "hidden",
 },
 heroBanner: {
 height: 80,
 background: "linear-gradient(135deg, #0A1628 0%, #1E3A5F 60%, #FF8C42 100%)",
 },
 heroBody: {
 padding: "0 24px 20px",
 display: "flex",
 alignItems: "flex-end",
 justifyContent: "space-between",
 gap: 16,
 flexWrap: "wrap",
 },
 avatarWrap: {
 position: "relative",
 marginTop: -36,
 flexShrink: 0,
 },
 avatar: {
 width: 72, height: 72, borderRadius: "50%",
 border: "3px solid var(--surface-card, #fff)",
 overflow: "hidden",
 boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
 },
 avatarFallback: {
 width: 72, height: 72, borderRadius: "50%",
 border: "3px solid var(--surface-card, #fff)",
 display: "flex", alignItems: "center", justifyContent: "center",
 background: "linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%)",
 color: "#fff", fontSize: 24, fontWeight: 700, letterSpacing: "1px",
 boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
 },
 profileMeta: { paddingTop: 12, flex: 1, minWidth: 0 },
 profileName: {
 fontSize: 18, fontWeight: 700,
 color: "var(--text-heading, #0A1628)",
 margin: "0 0 2px", whiteSpace: "nowrap",
 overflow: "hidden", textOverflow: "ellipsis",
 },
 profileEmail: {
 fontSize: 13, color: "var(--text-secondary, #6B7280)", margin: 0,
 },
 profileChips: {
 display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap",
 },
 chip: {
 display: "inline-flex", alignItems: "center", gap: 4,
 fontSize: 11, fontWeight: 500,
 color: "var(--text-muted, #94A3B8)",
 background: "var(--surface-muted, #F1F5F9)",
 borderRadius: 999, padding: "2px 8px",
 },
 actionWrap: {
 display: "flex", gap: 8, paddingTop: 12, alignSelf: "flex-end",
 },
 editBtn: {
 display: "flex", alignItems: "center", gap: 6,
 padding: "9px 18px",
 border: "1px solid var(--border-card, #E8EBF0)",
 borderRadius: 10, background: "var(--surface-card, #fff)",
 fontSize: 13, fontWeight: 600, color: "#FF8C42",
 cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
 },
 saveBtn: {
 display: "flex", alignItems: "center", gap: 6,
 padding: "9px 20px", border: "none", borderRadius: 10,
 background: "linear-gradient(135deg, #FF8C42, #e07030)",
 fontSize: 13, fontWeight: 600, color: "#fff",
 cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
 boxShadow: "0 2px 8px rgba(255,140,66,0.3)",
 },
 cancelBtn: {
 display: "flex", alignItems: "center", gap: 6,
 padding: "9px 16px",
 border: "1px solid var(--border-card, #E8EBF0)",
 borderRadius: 10, background: "var(--surface-card, #fff)",
 fontSize: 13, fontWeight: 500, color: "var(--text-secondary, #6B7280)",
 cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
 },

 /* ── Identity info card ── */
 infoCard: {
 background: "var(--surface-card, #fff)",
 borderRadius: 16,
 border: "1px solid var(--border-card, #E8EBF0)",
 overflow: "hidden",
 },
 sectionHeader: {
 display: "flex", alignItems: "center", gap: 10,
 padding: "16px 22px",
 },
 sectionAccent: {
 width: 3, height: 18, borderRadius: 2, flexShrink: 0,
 },
 sectionIconWrap: {
 width: 30, height: 30, borderRadius: 8,
 display: "flex", alignItems: "center", justifyContent: "center",
 flexShrink: 0,
 },
 sectionTitle: {
 fontSize: 13, fontWeight: 700,
 color: "var(--text-heading, #0A1628)",
 margin: 0, flex: 1,
 },
 divider: { height: 1, background: "var(--border-subtle, #F1F5F9)", margin: "0 22px" },
 sectionBody: { padding: "20px 22px 22px" },

 /* ── Field grid ── */
 grid2: {
 display: "grid",
 gridTemplateColumns: "1fr 1fr",
 gap: "18px 28px",
 },
 grid4: {
 display: "grid",
 gridTemplateColumns: "1fr 1fr 1fr 1fr",
 gap: "18px 20px",
 },
 rowSep: {
 height: 1, background: "var(--border-subtle, #F1F5F9)", margin: "18px 0",
 },

 /* ── Field atoms ── */
 fieldLabel: {
 fontSize: 10, fontWeight: 700,
 color: "var(--text-muted, #94A3B8)",
 textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5,
 },
 fieldValue: {
 fontSize: 14, fontWeight: 500,
 color: "var(--text-heading, #1F2937)",
 margin: 0, lineHeight: 1.4,
 },
 fieldEmpty: {
 fontSize: 14, color: "var(--text-muted, #CBD5E1)",
 fontStyle: "italic", margin: 0,
 },

 /* ── Inputs ── */
 input: {
 width: "100%", padding: "9px 12px", fontSize: 14,
 border: "1.5px solid var(--border-card, #E2E8F0)",
 borderRadius: 9, color: "var(--text-heading, #1F2937)",
 background: "var(--surface-card, #fff)",
 outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
 boxSizing: "border-box", lineHeight: 1.4,
 },
 inputFocus: {
 borderColor: "#FF8C42",
 boxShadow: "0 0 0 3px rgba(255,140,66,0.10)",
 },
 inputError: {
 borderColor: "#EF4444",
 boxShadow: "0 0 0 3px rgba(239,68,68,0.08)",
 },
 inputLocked: {
 background: "var(--surface-muted, #F8FAFC)",
 color: "var(--text-secondary, #94A3B8)",
 cursor: "not-allowed",
 border: "1.5px solid var(--border-subtle, #E2E8F0)",
 },
 errorText: { fontSize: 11, color: "#EF4444", marginTop: 3 },

 /* ── Note banner ── */
 noteBanner: {
 display: "flex", alignItems: "flex-start", gap: 10,
 background: "rgba(255,140,66,0.06)",
 border: "1px solid rgba(255,140,66,0.18)",
 borderRadius: 10, padding: "10px 14px",
 marginTop: 20,
 },
 noteText: {
 fontSize: 12, color: "var(--text-secondary, #6B7280)",
 lineHeight: 1.5, margin: 0,
 },
};

/* ─────────────────────────────────────────────────────────────────────────────
 ATOMS
───────────────────────────────────────────────────────────────────────────── */

const Field = ({ label, value, field, type = "text", editing, editData,
 setEditData, errors, onBlur, required, locked }) => {
 const [focused, setFocused] = useState(false);
 const hasError = errors?.[field];

 return (
 <div>
 <div style={s.fieldLabel}>
 {label}
 {required && editing && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
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
 value={editData?.[field] || ""}
 onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
 onFocus={() => setFocused(true)}
 onBlur={() => { setFocused(false); onBlur?.(field); }}
 style={{
 ...s.input,
 ...(focused && !hasError ? s.inputFocus : {}),
 ...(hasError ? s.inputError : {}),
 }}
 placeholder={`Enter ${label.toLowerCase()}`}
 />
 {hasError && <div style={s.errorText}>{errors[field]}</div>}
 </div>
 )
 ) : (
 <p style={value && value !== "Not provided" ? s.fieldValue : s.fieldEmpty}>
 {type === "date" && value ? fmtDate(value) : value || "Not provided"}
 </p>
 )}
 </div>
 );
};

const SelectField = ({ label, field, options, editing, editData, setEditData }) => {
 const currentValue = editData?.[field] || "";
 const displayLabel = options.find((o) => o.value === currentValue)?.label;
 return (
 <div>
 <div style={s.fieldLabel}>{label}</div>
 {editing ? (
 <div style={{ position: "relative" }}>
 <select
 value={currentValue}
 onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
 style={{ ...s.input, appearance: "none", paddingRight: 32, cursor: "pointer" }}
 >
 <option value="">— Select —</option>
 {options.map((o) => (
 <option key={o.value} value={o.value}>{o.label}</option>
 ))}
 </select>
 <ChevronDown size={14} color="#94A3B8" style={{
 position: "absolute", right: 10, top: "50%",
 transform: "translateY(-50%)", pointerEvents: "none",
 }} />
 </div>
 ) : (
 <p style={currentValue ? s.fieldValue : s.fieldEmpty}>
 {currentValue ? displayLabel : "Not provided"}
 </p>
 )}
 </div>
 );
};

/* ─────────────────────────────────────────────────────────────────────────────
 MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
const resolveOccupancyLabel = ({ role, tenantStatus }) => {
 if (role === "tenant") return "Tenant";
 if (role === "applicant") return "Applicant";

 const normalizedTenantStatus = String(tenantStatus || "").toLowerCase();
 if (["active", "inactive", "moved_out"].includes(normalizedTenantStatus)) {
 return "Tenant";
 }

 return "Applicant";
};

const PersonalDetailsTab = ({
 profileData, editData, setEditData, fullName,
 isEditingProfile, setIsEditingProfile, saving, onSave, onCancel,
}) => {
 const [errors, setErrors] = useState({});
 const fileInputRef = useRef(null);
 const [uploading, setUploading] = useState(false);
 const [pendingFile, setPendingFile] = useState(null);
 const [localPreviewUrl, setLocalPreviewUrl] = useState(null);

 const initials = useMemo(() => {
 const f = (profileData.firstName || "").charAt(0).toUpperCase();
 const l = (profileData.lastName || "").charAt(0).toUpperCase();
 return f + l || "?";
 }, [profileData.firstName, profileData.lastName]);

 const occupancyLabel = useMemo(
 () =>
 resolveOccupancyLabel({
 role: profileData.role,
 tenantStatus: profileData.tenantStatus,
 }),
 [profileData.role, profileData.tenantStatus],
 );

 const handleFileSelect = (e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
 const blobUrl = URL.createObjectURL(file);
 setPendingFile(file);
 setLocalPreviewUrl(blobUrl);
 e.target.value = "";
 };

 const hasChanges = useMemo(() => {
 if (pendingFile) return true;
 if (!editData) return false;
 return (
 editData.firstName !== (profileData.firstName || "") ||
 editData.lastName !== (profileData.lastName || "") ||
 editData.dateOfBirth !== (profileData.dateOfBirth || "") ||
 editData.gender !== (profileData.gender || "") ||
 editData.civilStatus !== (profileData.civilStatus || "") ||
 editData.nationality !== (profileData.nationality || "") ||
 editData.occupation !== (profileData.occupation || "")
 );
 }, [editData, profileData, pendingFile]);

 const handleBlur = (field) => {
 if (field === "firstName" || field === "lastName") {
 if (!editData[field]?.trim()) {
 setErrors((p) => ({ ...p, [field]: `${field === "firstName" ? "First" : "Last"} name is required` }));
 return;
 }
 }
 const err = validateField(field, editData[field]);
 setErrors((p) => { const n = { ...p }; if (err) n[field] = err; else delete n[field]; return n; });
 };

 const handleSaveWithValidation = async () => {
 const newErrors = {};
 if (!editData.firstName?.trim()) newErrors.firstName = "Required";
 else { const e = validateField("firstName", editData.firstName); if (e) newErrors.firstName = e; }
 if (!editData.lastName?.trim()) newErrors.lastName = "Required";
 else { const e = validateField("lastName", editData.lastName); if (e) newErrors.lastName = e; }
 if (editData.dateOfBirth) {
 const e = validateField("dateOfBirth", editData.dateOfBirth); if (e) newErrors.dateOfBirth = e;
 }
 setErrors(newErrors);
 if (Object.keys(newErrors).length > 0) return;

 if (pendingFile) {
 setUploading(true);
 try {
 const { uploadToImageKit } = await import("../../../../shared/utils/imageUpload");
 const imageUrl = await uploadToImageKit(pendingFile);
 if (imageUrl) {
 editData.profileImage = imageUrl;
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
 onSave();
 };

 const handleCancel = () => {
 setErrors({});
 setPendingFile(null);
 if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
 setLocalPreviewUrl(null);
 onCancel();
 };

 const fp = { editing: isEditingProfile, editData, setEditData, errors, onBlur: handleBlur };

 return (
 <div style={s.container}>

 {/* ── Page heading ── */}
 <div style={s.heading}>
 <h1 style={s.title}>Personal Details</h1>
 <p style={s.subtitle}>Your identity information — who you are</p>
 </div>

 {/* ── Hero Profile Card ── */}
 <div style={s.profileCard}>
 <div style={s.heroBanner} />
 <div style={s.heroBody}>

 {/* Avatar */}
 <div style={s.avatarWrap}>
 <div
 onClick={() => isEditingProfile && !uploading && fileInputRef.current?.click()}
 style={{ position: "relative", cursor: isEditingProfile ? "pointer" : "default" }}
 title={isEditingProfile ? "Click to change photo" : undefined}
 onMouseEnter={(e) => {
 if (!isEditingProfile) return;
 const ov = e.currentTarget.querySelector("[data-overlay]");
 if (ov) ov.style.opacity = "1";
 }}
 onMouseLeave={(e) => {
 if (!isEditingProfile || uploading) return;
 const ov = e.currentTarget.querySelector("[data-overlay]");
 if (ov) ov.style.opacity = "0";
 }}
 >
 {(() => {
 const img = localPreviewUrl
 || (isEditingProfile ? editData?.profileImage : null)
 || profileData.profileImage;
 return img ? (
 <div style={s.avatar}>
 <img src={img} alt="Profile"
 style={{ width: "100%", height: "100%", objectFit: "cover" }} />
 </div>
 ) : (
 <div style={s.avatarFallback}>{initials}</div>
 );
 })()}

 {isEditingProfile && (
 <>
 <div data-overlay style={{
 position: "absolute", inset: 0, borderRadius: "50%",
 background: uploading ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.45)",
 display: "flex", flexDirection: "column",
 alignItems: "center", justifyContent: "center", gap: 2,
 opacity: uploading ? 1 : 0, transition: "opacity 0.2s",
 }}>
 {uploading ? (
 <>
 <div style={{
 width: 24, height: 24,
 border: "3px solid rgba(255,255,255,0.25)",
 borderTop: "3px solid #FF8C42", borderRadius: "50%",
 animation: "spin 0.8s linear infinite",
 }} />
 <span style={{ color: "#fff", fontSize: 9, fontWeight: 600, marginTop: 2 }}>
 Uploading
 </span>
 <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
 </>
 ) : (
 <>
 <Camera size={15} color="#fff" />
 <span style={{ color: "#fff", fontSize: 9, fontWeight: 600 }}>Change</span>
 </>
 )}
 </div>
 <div style={{
 position: "absolute", bottom: 2, right: 2,
 width: 22, height: 22, borderRadius: "50%",
 background: "#FF8C42", border: "2px solid var(--surface-card,#fff)",
 display: "flex", alignItems: "center", justifyContent: "center",
 boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
 }}>
 <Camera size={11} color="#fff" />
 </div>
 </>
 )}

 <input ref={fileInputRef} type="file" accept="image/*"
 style={{ display: "none" }} onChange={handleFileSelect} />
 </div>
 </div>

 {/* Name + meta chips */}
 <div style={s.profileMeta}>
 <h2 style={s.profileName}>{fullName}</h2>
 <p style={s.profileEmail}>{profileData.email}</p>
 <div style={s.profileChips}>
 <span style={s.chip}>
 <User size={10} />
 {occupancyLabel}
 </span>
 {profileData.occupation && (
 <span style={s.chip}><Briefcase size={10} />{profileData.occupation}</span>
 )}
 {profileData.nationality && (
 <span style={s.chip}><Globe size={10} />{profileData.nationality}</span>
 )}
 {profileData.gender && (
 <span style={s.chip}>
 {profileData.gender.charAt(0).toUpperCase() + profileData.gender.slice(1).replace(/-/g," ")}
 </span>
 )}
 </div>
 </div>

 {/* Buttons */}
 <div style={s.actionWrap}>
 {isEditingProfile ? (
 <>
 <button onClick={handleCancel} style={s.cancelBtn}
 onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-muted,#F8FAFC)"}
 onMouseLeave={(e) => e.currentTarget.style.background = "var(--surface-card,#fff)"}>
 <X size={14} /> Discard
 </button>
 <button
 onClick={handleSaveWithValidation}
 disabled={saving || uploading || !hasChanges}
 style={{
 ...s.saveBtn,
 opacity: (saving || uploading || !hasChanges) ? 0.55 : 1,
 cursor: (saving || uploading || !hasChanges) ? "not-allowed" : "pointer",
 }}>
 <Save size={14} />
 {uploading ? "Uploading…" : saving ? "Saving…" : "Save Changes"}
 </button>
 </>
 ) : (
 <button onClick={() => setIsEditingProfile(true)} style={s.editBtn}
 onMouseEnter={(e) => {
 e.currentTarget.style.background = "rgba(255,140,66,0.06)";
 e.currentTarget.style.borderColor = "#FF8C42";
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.background = "var(--surface-card,#fff)";
 e.currentTarget.style.borderColor = "var(--border-card,#E8EBF0)";
 }}>
 <Edit2 size={14} /> Edit Profile
 </button>
 )}
 </div>
 </div>
 </div>

 {/* ── Identity Info Card ── */}
 <div style={s.infoCard}>

 {/* ── Section header ── */}
 <div style={s.sectionHeader}>
 <div style={{ ...s.sectionAccent, background: "#0A2463" }} />
 <div style={{ ...s.sectionIconWrap, background: "#0A246314" }}>
 <User size={15} color="#0A2463" />
 </div>
 <h3 style={s.sectionTitle}>Identity Information</h3>
 </div>
 <div style={s.divider} />

 <div style={s.sectionBody}>

 {/* Row 1 — name */}
 <div style={s.grid2}>
 {isEditingProfile ? (
 <>
 <Field label="First Name" field="firstName" required {...fp} />
 <Field label="Last Name" field="lastName" required {...fp} />
 </>
 ) : (
 <>
 <Field label="Full Name" field="firstName" value={fullName} {...fp} />
 <Field label="Email Address" field="email" value={profileData.email} {...fp} />
 </>
 )}
 </div>

 {/* Email row in edit mode */}
 {isEditingProfile && (
 <div style={{ ...s.grid2, marginTop: 18 }}>
 <Field label="Email Address" field="email" value={profileData.email}
 locked editing={true} editData={editData} setEditData={setEditData}
 errors={errors} onBlur={handleBlur} />
 <Field label="Date of Birth" field="dateOfBirth" type="date"
 value={editData?.dateOfBirth || ""} {...fp} />
 </div>
 )}

 <div style={s.rowSep} />

 {/* Row 2 — demographics (2×2 grid) */}
 <div style={s.grid2}>
 {!isEditingProfile && (
 <Field label="Date of Birth" field="dateOfBirth" type="date"
 value={profileData.dateOfBirth} {...fp} />
 )}
 <SelectField label="Gender" field="gender"
 options={[
 { value: "male", label: "Male" },
 { value: "female", label: "Female" },
 { value: "other", label: "Other" },
 { value: "prefer-not-to-say", label: "Prefer not to say" },
 ]}
 editing={isEditingProfile} editData={editData} setEditData={setEditData} />
 <SelectField label="Civil Status" field="civilStatus"
 options={[
 { value: "single", label: "Single" },
 { value: "married", label: "Married" },
 { value: "widowed", label: "Widowed" },
 { value: "separated", label: "Separated" },
 { value: "divorced", label: "Divorced" },
 ]}
 editing={isEditingProfile} editData={editData} setEditData={setEditData} />
 </div>

 <div style={s.rowSep} />

 {/* Row 3 — nationality + occupation */}
 <div style={s.grid2}>
 <Field label="Nationality" field="nationality"
 value={isEditingProfile ? (editData?.nationality || "") : profileData.nationality}
 {...fp} />
 <Field label="Occupation / Profession" field="occupation"
 value={isEditingProfile ? (editData?.occupation || "") : profileData.occupation}
 {...fp} />
 </div>

 {/* Note banner */}
 <div style={s.noteBanner}>
 <Sparkles size={14} color="#FF8C42" style={{ flexShrink: 0, marginTop: 1 }} />
 <p style={s.noteText}>
 Contact details (phone, address) and emergency contacts are collected
 when you submit a reservation application — keeping your profile focused
 on who you are, not what you're booking.
 </p>
 </div>

 </div>
 </div>
 </div>
 );
};

export default PersonalDetailsTab;
