import React from "react";
import { User, Edit2 } from "lucide-react";
import { fmtDate } from "../../../../shared/utils/formatDate";

/**
 * Personal Details tab content for ProfilePage.
 * Handles both view and edit modes for user profile information.
 */

const PROFILE_FIELDS = [
  { label: "Full Name", field: "firstName", display: "fullName" },
  { label: "Email Address", field: "email" },
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
}) => (
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
        {/* Header with avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#0C375F" }}
          >
            <User className="w-10 h-10 text-white" />
          </div>
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
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 text-sm rounded-lg text-white"
              style={{ backgroundColor: "#E7710F" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={onCancel}
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
                      className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 mb-2"
                      placeholder="First Name"
                      style={{ borderColor: "#E8EBF0" }}
                    />
                    <input
                      type="text"
                      value={editData.lastName || ""}
                      onChange={(e) =>
                        setEditData({ ...editData, lastName: e.target.value })
                      }
                      className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
                      placeholder="Last Name"
                      style={{ borderColor: "#E8EBF0" }}
                    />
                  </>
                ) : (
                  <input
                    type={item.type || "text"}
                    value={editData[item.field] || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, [item.field]: e.target.value })
                    }
                    className="w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
                    style={{ borderColor: "#E8EBF0" }}
                  />
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

export default PersonalDetailsTab;
