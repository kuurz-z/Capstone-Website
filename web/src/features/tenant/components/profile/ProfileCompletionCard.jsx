/**
 * ProfileCompletionCard
 *
 * Shows two separate completion states:
 *
 * 1. When tenant has a visit_approved reservation (application step is next):
 *    Highlights the fields required to submit the application form.
 *    These are the fields the backend now enforces — selfie, valid ID (front),
 *    emergency contact name, and emergency contact phone.
 *
 * 2. Otherwise: shows general profile completion percentage.
 *
 * Props:
 *   profileData       — user profile object
 *   activeReservation — the tenant's current active reservation (optional)
 *   onGoToPersonal    — callback to navigate to the Personal Details tab
 */

import React, { useMemo } from "react";
import { AlertCircle, ArrowRight, BarChart3, CheckCircle2 } from "lucide-react";

// General profile fields (user account level)
const PROFILE_FIELDS = [
  { key: "firstName",       label: "First Name" },
  { key: "lastName",        label: "Last Name" },
  { key: "email",           label: "Email" },
  { key: "phone",           label: "Phone Number" },
  { key: "address",         label: "Address" },
  { key: "city",            label: "City" },
  { key: "dateOfBirth",     label: "Date of Birth" },
  { key: "emergencyContact",label: "Emergency Contact" },
  { key: "emergencyPhone",  label: "Emergency Phone" },
];

// Fields required on the RESERVATION to unlock application submission.
// Must match the backend validation in reservationsController.js.
const APPLICATION_REQUIRED_FIELDS = [
  { key: "selfiePhotoUrl",          label: "Profile photo (selfie)" },
  { key: "validIDFrontUrl",         label: "Valid ID — front side" },
  { key: "emergencyContactName",    label: "Emergency contact name" },
  { key: "emergencyContactNumber",  label: "Emergency contact phone" },
];

const hasValue = (val) =>
  val != null && String(val).trim().length > 0;

const ProfileCompletionCard = ({ profileData, activeReservation, onGoToPersonal }) => {
  const reservationStatus = activeReservation?.status;
  const isReadyForApplication = reservationStatus === "visit_approved";

  // ── Application-gate mode ────────────────────────────────────────────────
  // Show a focused checklist of what the tenant still needs before the
  // application form will accept their submission.
  const appGate = useMemo(() => {
    if (!isReadyForApplication || !activeReservation) return null;

    const missing = APPLICATION_REQUIRED_FIELDS.filter(
      (f) => !hasValue(activeReservation[f.key]),
    );
    const filled = APPLICATION_REQUIRED_FIELDS.length - missing.length;
    const pct = Math.round((filled / APPLICATION_REQUIRED_FIELDS.length) * 100);

    return { missing, filled, pct, total: APPLICATION_REQUIRED_FIELDS.length };
  }, [isReadyForApplication, activeReservation]);

  // ── General profile completion mode ─────────────────────────────────────
  const profileCompletion = useMemo(() => {
    if (isReadyForApplication) return null; // handled by appGate above

    const filled = PROFILE_FIELDS.filter((f) => hasValue(profileData?.[f.key]));
    const missing = PROFILE_FIELDS.filter((f) => !filled.includes(f));
    const pct = Math.round((filled.length / PROFILE_FIELDS.length) * 100);

    return { missing, pct };
  }, [isReadyForApplication, profileData]);

  // ── Hide when fully complete ─────────────────────────────────────────────
  if (appGate && appGate.pct >= 100) return null;
  if (profileCompletion && profileCompletion.pct >= 100) return null;

  // ── Shared styles ────────────────────────────────────────────────────────
  const card = {
    backgroundColor: "var(--surface-card, #fff)",
    borderRadius: "12px",
    border: isReadyForApplication
      ? "1px solid #fed7aa"
      : "1px solid var(--border-card, #E8EBF0)",
    background: isReadyForApplication ? "#fff7ed" : "#fff",
    padding: "20px 24px",
    marginBottom: "20px",
  };

  // ── Application-gate render ──────────────────────────────────────────────
  if (appGate) {
    const allDone = appGate.missing.length === 0;

    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          {allDone
            ? <CheckCircle2 style={{ width: 18, height: 18, color: "#16a34a", flexShrink: 0 }} />
            : <AlertCircle  style={{ width: 18, height: 18, color: "#ea580c", flexShrink: 0 }} />}
          <span style={{ fontSize: 14, fontWeight: 700, color: allDone ? "#166534" : "#9a3412" }}>
            {allDone
              ? "Ready to submit your application"
              : "Action required before submitting your application"}
          </span>
        </div>

        {!allDone && (
          <>
            <p style={{ fontSize: 12, color: "#9a3412", margin: "0 0 10px" }}>
              The following items must be uploaded before your application can be accepted:
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {appGate.missing.map((f) => (
                <li key={f.key} style={{ fontSize: 12, color: "#9a3412", fontWeight: 600 }}>
                  {f.label}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: 12, width: "100%", height: 6, background: "#fed7aa", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${appGate.pct}%`,
            background: allDone ? "#16a34a" : "linear-gradient(90deg, #ea580c, #f97316)",
            borderRadius: 999,
            transition: "width 0.5s ease",
          }} />
        </div>
        <p style={{ fontSize: 11, color: "#c2410c", margin: "6px 0 0", textAlign: "right" }}>
          {appGate.filled} / {appGate.total} required items complete
        </p>
      </div>
    );
  }

  // ── General profile completion render ────────────────────────────────────
  const { missing, pct } = profileCompletion;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-heading, #1F2937)" }}>
          <BarChart3 style={{ width: 18, height: 18, color: "#FF8C42" }} />
          Profile Completion
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#FF8C42" }}>{pct}%</span>
      </div>

      <div style={{ width: "100%", height: 8, backgroundColor: "var(--surface-muted, #F1F5F9)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: "linear-gradient(90deg, #FF8C42, #F59E0B)",
          borderRadius: 999,
          transition: "width 0.6s cubic-bezier(0.25,0.8,0.25,1)",
        }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted, #94A3B8)", margin: 0 }}>
          Missing: {missing.slice(0, 3).map((f) => f.label).join(", ")}
          {missing.length > 3 ? ` +${missing.length - 3} more` : ""}
        </p>
        {onGoToPersonal && (
          <button
            onClick={onGoToPersonal}
            style={{
              background: "none", border: "none", color: "#FF8C42",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, padding: 0,
            }}
          >
            Complete Now
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileCompletionCard;
