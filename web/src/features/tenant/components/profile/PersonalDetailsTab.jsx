import React, { useState, useMemo } from "react";
import { Edit2 } from "lucide-react";
import { fmtDate } from "../../../../shared/utils/formatDate";

/**
 * Personal Details tab content for ProfilePage.
 * Handles both view and edit modes for user profile information.
 *
 * Phase 6 enhancements:
 * - Initials avatar fallback (colored circle with initials)
 * - Client-side validation with inline error messages
 * - Required field markers (*)
 */

const PROFILE_FIELDS = [
  { label: "Full Name", field: "firstName", display: "fullName", required: true },
  { label: "Email Address", field: "email", required: true },
  { label: "Phone Number", field: "phone" },
  { label: "Date of Birth", field: "dateOfBirth", type: "date" },
  { label: "Address", field: "address" },
  { label: "City", field: "city" },
  { label: "Student ID", field: "studentId" },
  { label: "School", field: "school" },
  { label: "Year Level", field: "yearLevel" },
  { label: "Emergency Contact", field: "emergencyContact" },
  { label: "Emergency Phone", field: "emergencyPhone" },
];

// ── Validation ──
const validateField = (field, value) => {
  if (!value || !value.trim()) return null; // empty is OK (optional)

  switch (field) {
    case "firstName":
    case "lastName":
      if (value.trim().length < 2) return "Must be at least 2 characters";
      if (value.trim().length > 50) return "Must be 50 characters or less";
      if (!/^[a-zA-Z\s\-']+$/.test(value.trim()))
        return "Letters, spaces, hyphens, apostrophes only";
      return null;

    case "phone":
    case "emergencyPhone":
      if (!/^[+\d\-() ]{7,20}$/.test(value.trim()))
        return "Invalid phone number format";
      return null;

    case "dateOfBirth":
      const dob = new Date(value);
      if (isNaN(dob.getTime())) return "Invalid date";
      if (dob > new Date()) return "Cannot be in the future";
      if (dob < new Date("1900-01-01")) return "Invalid date";
      return null;

    case "address":
      if (value.length > 200) return "200 characters max";
      return null;

    case "city":
    case "school":
      if (value.length > 100) return "100 characters max";
      return null;

    case "studentId":
      if (value.length > 50) return "50 characters max";
      return null;

    case "yearLevel":
      if (value.length > 20) return "20 characters max";
      return null;

    case "emergencyContact":
      if (value.length > 100) return "100 characters max";
      return null;

    default:
      return null;
  }
};

// ── Initials Avatar ──
const InitialsAvatar = ({ firstName, lastName, profileImage }) => {
  const initials = useMemo(() => {
    const f = (firstName || "").charAt(0).toUpperCase();
    const l = (lastName || "").charAt(0).toUpperCase();
    return f + l || "?";
  }, [firstName, lastName]);

  if (profileImage) {
    return (
      <div className="w-20 h-20 rounded-full overflow-hidden">
        <img
          src={profileImage}
          alt="Profile"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center"
      style={{ backgroundColor: "#0C375F" }}
    >
      <span
        style={{
          color: "#fff",
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "1px",
        }}
      >
        {initials}
      </span>
    </div>
  );
};

// ── Component ──

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

  // Validate on save
  const handleSaveWithValidation = () => {
    const newErrors = {};

    // Required fields
    if (!editData.firstName?.trim())
      newErrors.firstName = "First name is required";
    else {
      const err = validateField("firstName", editData.firstName);
      if (err) newErrors.firstName = err;
    }

    if (!editData.lastName?.trim())
      newErrors.lastName = "Last name is required";
    else {
      const err = validateField("lastName", editData.lastName);
      if (err) newErrors.lastName = err;
    }

    // Optional fields — only validate if filled
    ["phone", "dateOfBirth", "address", "city", "studentId", "school", "yearLevel", "emergencyContact", "emergencyPhone"].forEach((field) => {
      if (editData[field]) {
        const err = validateField(field, editData[field]);
        if (err) newErrors[field] = err;
      }
    });

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onSave();
    }
  };

  // Validate on blur
  const handleBlur = (field) => {
    if (field === "firstName" || field === "lastName") {
      if (!editData[field]?.trim()) {
        setErrors((prev) => ({ ...prev, [field]: `${field === "firstName" ? "First" : "Last"} name is required` }));
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

  const handleCancel = () => {
    setErrors({});
    onCancel();
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F2937" }}>
          Personal Details
        </h1>
        <p className="text-sm text-gray-500">
          Basic information for inquiries, visits, and reservations
        </p>
      </div>

      <div className="space-y-6">
        <div
          className="bg-white rounded-xl p-6 border"
          style={{ borderColor: "#E8EBF0" }}
        >
          {/* Header with initials avatar */}
          <div className="flex items-center gap-4 mb-6">
            <InitialsAvatar
              firstName={profileData.firstName}
              lastName={profileData.lastName}
              profileImage={profileData.profileImage}
            />
            <div className="flex-1">
              <h2
                className="text-xl font-semibold mb-1"
                style={{ color: "#1F2937" }}
              >
                {fullName}
              </h2>
              <p className="text-sm text-gray-500">{profileData.email}</p>
              <p className="text-sm text-gray-400">
                {profileData.city || "Not provided"}
              </p>
            </div>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
                style={{ borderColor: "#E8EBF0", color: "#E7710F" }}
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>

          {/* Save/Cancel buttons in edit mode */}
          {isEditingProfile && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={handleSaveWithValidation}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg text-white"
                style={{ backgroundColor: "#E7710F" }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={handleCancel}
                className="px-5 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50"
                style={{ borderColor: "#E8EBF0" }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Field grid */}
          <div className="grid grid-cols-2 gap-6">
            {PROFILE_FIELDS.map((item) => (
              <div key={item.field}>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  {item.label}
                  {item.required && isEditingProfile && (
                    <span style={{ color: "#EF4444", marginLeft: "2px" }}>*</span>
                  )}
                </label>
                {isEditingProfile && item.field !== "email" ? (
                  item.field === "firstName" ? (
                    <>
                      <input
                        type="text"
                        value={editData.firstName || ""}
                        onChange={(e) =>
                          setEditData({ ...editData, firstName: e.target.value })
                        }
                        onBlur={() => handleBlur("firstName")}
                        className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 mb-1"
                        placeholder="First Name"
                        style={{
                          borderColor: errors.firstName ? "#EF4444" : "#E8EBF0",
                        }}
                      />
                      {errors.firstName && (
                        <p style={{ color: "#EF4444", fontSize: "11px", margin: "0 0 4px" }}>
                          {errors.firstName}
                        </p>
                      )}
                      <input
                        type="text"
                        value={editData.lastName || ""}
                        onChange={(e) =>
                          setEditData({ ...editData, lastName: e.target.value })
                        }
                        onBlur={() => handleBlur("lastName")}
                        className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
                        placeholder="Last Name"
                        style={{
                          borderColor: errors.lastName ? "#EF4444" : "#E8EBF0",
                        }}
                      />
                      {errors.lastName && (
                        <p style={{ color: "#EF4444", fontSize: "11px", margin: "2px 0 0" }}>
                          {errors.lastName}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type={item.type || "text"}
                        value={editData[item.field] || ""}
                        onChange={(e) =>
                          setEditData({ ...editData, [item.field]: e.target.value })
                        }
                        onBlur={() => handleBlur(item.field)}
                        className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
                        style={{
                          borderColor: errors[item.field] ? "#EF4444" : "#E8EBF0",
                        }}
                      />
                      {errors[item.field] && (
                        <p style={{ color: "#EF4444", fontSize: "11px", margin: "2px 0 0" }}>
                          {errors[item.field]}
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <p className="text-sm py-2.5" style={{ color: "#1F2937" }}>
                    {item.field === "firstName"
                      ? fullName
                      : item.type === "date" && profileData[item.field]
                        ? fmtDate(profileData[item.field])
                        : profileData[item.field] || "Not provided"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalDetailsTab;
