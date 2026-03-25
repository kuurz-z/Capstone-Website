import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { formatBranch, formatRoomType } from "../../utils/formatters";

/**
 * Generate default beds based on room type and capacity.
 * - private          → single beds
 * - double-sharing   → 1 upper + 1 lower per bunk
 * - quadruple-sharing→ 2 upper + 2 lower per bunk pair
 */
function generateBeds(type, capacity) {
  const beds = [];

  if (type === "private") {
    for (let i = 1; i <= capacity; i++) {
      beds.push({ id: `bed-${i}`, position: "single", status: "available" });
    }
  } else {
    // For shared rooms, alternate upper/lower
    for (let i = 1; i <= capacity; i++) {
      const position = i % 2 === 1 ? "upper" : "lower";
      beds.push({ id: `bed-${i}`, position, status: "available" });
    }
  }

  return beds;
}

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
};

export default function RoomFormModal({ room, onClose, onSave }) {
  const isEdit = Boolean(room);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

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
      });
    }
  }, [room]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
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
                  <option value="gil-puyat">Gil Puyat</option>
                  <option value="guadalupe">Guadalupe</option>
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
                  onChange={(e) => handleChange("capacity", e.target.value)}
                />
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
              {saving
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
