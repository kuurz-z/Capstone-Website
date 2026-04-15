import { useState, useEffect } from "react";
import { ImagePlus, LoaderCircle, Trash2, X } from "lucide-react";
import { BRANCH_OPTIONS } from "../../../../shared/utils/constants";
import { uploadIfFile } from "../../../../shared/utils/imageUpload";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

/**
 * Generate default beds based on room type and capacity.
 * - private          → single beds
 * - double-sharing   → 1 upper + 1 lower per bunk
 * - quadruple-sharing→ 2 upper + 2 lower per bunk pair
 */
function generateBeds(type, capacity) {
  const beds = [];

  if (type === "private") {
    // Private = 1 tenant but 2 beds (1 bunk: upper + lower)
    beds.push({ id: "bed-1", position: "upper", status: "available" });
    beds.push({ id: "bed-2", position: "lower", status: "available" });
  } else {
    // For shared rooms: double=1 bunk, quad=2 bunks, six=3 bunks
    for (let i = 1; i <= capacity; i++) {
      const position = i % 2 === 1 ? "upper" : "lower";
      beds.push({ id: `bed-${i}`, position, status: "available" });
    }
  }

  return beds;
}

/** Locked capacity values per room type */
const CAPACITY_BY_TYPE = {
  private: 1,
  "double-sharing": 2,
  "quadruple-sharing": 4,
};

const INITIAL_FORM = {
  name: "",
  roomNumber: "",
  branch: "gil-puyat",
  type: "private",
  floor: 1,
  capacity: 1,
  price: 0,
  description: "",
  amenities: "",
  policies: "",
  images: [],
};

const makeImageId = () =>
  `room-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildImageState = (value) => ({
  id: makeImageId(),
  value,
  preview: typeof value === "string" ? value : URL.createObjectURL(value),
  name: typeof value === "string" ? "Uploaded image" : value.name,
});

export default function RoomFormModal({ room, onClose, onSave }) {
  const isEdit = Boolean(room);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEscapeClose(true, onClose);

  // Populate form when editing
  useEffect(() => {
    if (room) {
      setForm({
        name: room.name || "",
        roomNumber: room.roomNumber || "",
        branch: room.branch || "gil-puyat",
        type: room.type || "private",
        floor: room.floor || 1,
        capacity: room.capacity || 1,
        price: room.price || 0,
        description: room.description || "",
        amenities: (room.amenities || []).join(", "),
        policies: (room.policies || []).join(", "),
        images: (room.images || []).map(buildImageState),
      });
    }
  }, [room]);

  const handleChange = (field, value) => {
    if (field === "type") {
      // When type changes, auto-lock capacity to the correct value
      setForm((prev) => ({ ...prev, type: value, capacity: CAPACITY_BY_TYPE[value] ?? 1 }));
      if (errors.type) setErrors((prev) => ({ ...prev, type: null }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = "Room name is required";
    if (!form.roomNumber.trim()) newErrors.roomNumber = "Room number is required";
    if (!form.capacity || form.capacity < 1) newErrors.capacity = "Capacity must be at least 1";
    if (form.price === "" || form.price < 0) newErrors.price = "Price must be 0 or more";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const uploadedImages = await Promise.all(
        (form.images || []).map((entry) => uploadIfFile(entry.value)),
      );
      const payload = {
        name: form.name.trim(),
        roomNumber: form.roomNumber.trim(),
        branch: form.branch,
        type: form.type,
        floor: Number(form.floor),
        capacity: Number(form.capacity),
        price: Number(form.price),
        description: form.description.trim(),
        amenities: form.amenities
          ? form.amenities.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        policies: form.policies
          ? form.policies.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        images: uploadedImages.filter(Boolean),
      };

      // Auto-generate beds on create only
      if (!isEdit) {
        payload.beds = generateBeds(payload.type, payload.capacity);
      }

      await onSave(payload, room?._id);
    } catch (err) {
      console.error("Failed to save room:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleImageSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter(Boolean);
    if (selectedFiles.length === 0) return;

    setForm((prev) => ({
      ...prev,
      images: [...(prev.images || []), ...selectedFiles.map(buildImageState)],
    }));

    event.target.value = "";
  };

  const handleRemoveImage = (imageId) => {
    setForm((prev) => ({
      ...prev,
      images: (prev.images || []).filter((entry) => entry.id !== imageId),
    }));
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-content room-form-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h2>{isEdit ? `Edit Room: ${room.name}` : "Add New Room"}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-modal-body">
            {/* Row 1: Name + Room Number */}
            <div className="room-form-row">
              <div className={`room-form-group ${errors.name ? "has-error" : ""}`}>
                <label>Room Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. Room 101"
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className={`room-form-group ${errors.roomNumber ? "has-error" : ""}`}>
                <label>Room Number *</label>
                <input
                  type="text"
                  value={form.roomNumber}
                  onChange={(e) => handleChange("roomNumber", e.target.value)}
                  placeholder="e.g. 101"
                />
                {errors.roomNumber && <span className="field-error">{errors.roomNumber}</span>}
              </div>
            </div>

            {/* Row 2: Branch + Type */}
            <div className="room-form-row">
              <div className="room-form-group">
                <label>Branch *</label>
                <select
                  value={form.branch}
                  onChange={(e) => handleChange("branch", e.target.value)}
                >
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="room-form-group">
                <label>Room Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => handleChange("type", e.target.value)}
                >
                  <option value="private">Private</option>
                  <option value="double-sharing">Double Sharing</option>
                  <option value="quadruple-sharing">Quadruple Sharing</option>
                </select>
              </div>
            </div>

            <div className="room-form-group">
              <label>Room Images</label>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    width: "fit-content",
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px dashed var(--border-default)",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                  }}
                >
                  <ImagePlus size={16} />
                  <span>Add room images</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    hidden
                    onChange={handleImageSelection}
                  />
                </label>

                {form.images?.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {form.images.map((entry) => (
                      <article
                        key={entry.id}
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          borderRadius: 14,
                          border: "1px solid rgba(15, 23, 42, 0.08)",
                          background: "#fff",
                        }}
                      >
                        <img
                          src={entry.preview}
                          alt={entry.name || "Room image"}
                          style={{
                            width: "100%",
                            height: 112,
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div
                          style={{
                            padding: "8px 10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(entry.id)}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "#DC2626",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                            aria-label="Remove image"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Upload real room photos. Applicant browsing will use these before fallback images.
                  </span>
                )}
              </div>
            </div>

            {/* Row 3: Floor + Capacity + Price */}
            <div className="room-form-row room-form-row-3">
              <div className="room-form-group">
                <label>Floor</label>
                <input
                  type="number"
                  min="1"
                  value={form.floor}
                  onChange={(e) => handleChange("floor", e.target.value)}
                />
              </div>
              <div className={`room-form-group ${errors.capacity ? "has-error" : ""}`}>
                <label>Capacity *</label>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  readOnly
                  disabled
                  style={{ opacity: 0.65, cursor: "not-allowed" }}
                />
                {form.type === "private" && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3, display: "block" }}>
                    Private rooms are for 1 tenant (2 beds/bunk included) — capacity is fixed at 1.
                  </span>
                )}
                {errors.capacity && <span className="field-error">{errors.capacity}</span>}
              </div>
              <div className={`room-form-group ${errors.price ? "has-error" : ""}`}>
                <label>Monthly Price (₱) *</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => handleChange("price", e.target.value)}
                />
                {errors.price && <span className="field-error">{errors.price}</span>}
              </div>
            </div>

            {/* Row 4: Description */}
            <div className="room-form-group">
              <label>Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Brief room description..."
              />
            </div>

            {/* Row 5: Amenities + Policies */}
            <div className="room-form-row">
              <div className="room-form-group">
                <label>Amenities</label>
                <input
                  type="text"
                  value={form.amenities}
                  onChange={(e) => handleChange("amenities", e.target.value)}
                  placeholder="WiFi, AC, Desk (comma-separated)"
                />
              </div>
              <div className="room-form-group">
                <label>Policies</label>
                <input
                  type="text"
                  value={form.policies}
                  onChange={(e) => handleChange("policies", e.target.value)}
                  placeholder="No pets, Quiet hours (comma-separated)"
                />
              </div>
            </div>

            {/* Info: beds will be auto-generated on create */}
            {!isEdit && (
              <div className="room-form-hint">
                <strong>Note:</strong> Beds will be auto-generated based on the room type and capacity.
                You can adjust bed configuration after creation.
              </div>
            )}
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle size={16} className="admin-announcements-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Create Room"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
