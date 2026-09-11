import React, { useState, useEffect } from "react";
import { ImagePlus, LoaderCircle, Trash2, Star, Check, Maximize2 } from "lucide-react";
import { uploadIfFile } from "../../../../shared/utils/firebaseStorageUpload";
import { getThumbnailUrl, getImageFallbackUrl, prefetchOptimizedImage } from "../../../../shared/utils/imageOptimizer";
import RoomImageLightboxModal from "./RoomImageLightboxModal";

const makeImageId = () =>
  `room-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildImageState = (value) => ({
  id: makeImageId(),
  value,
  preview: typeof value === "string" ? getThumbnailUrl(value) : URL.createObjectURL(value),
  name: typeof value === "string" ? "Uploaded image" : value.name,
});

export default function RoomPublicEditForm({ room, onUpdateDraft, onSavePublic, saving }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [form, setForm] = useState({
    name: room.name || "",
    description: room.description || "",
    price: room.price || 0,
    monthlyPrice: room.monthlyPrice || room.price || 0,
    amenities: (room.amenities || []).join(", "),
    policies: (room.policies || []).join(", "),
    isPopular: Boolean(room.isPopular),
    images: (room.images || []).map(buildImageState),
  });

  useEffect(() => {
    if (room) {
      setForm({
        name: room.name || "",
        description: room.description || "",
        price: room.price || 0,
        monthlyPrice: room.monthlyPrice || room.price || 0,
        amenities: (room.amenities || []).join(", "),
        policies: (room.policies || []).join(", "),
        isPopular: Boolean(room.isPopular),
        images: (room.images || []).map(buildImageState),
      });
    }
  }, [room]);

  const handleChange = (field, value) => {
    let nextValue = value;
    if (field === "name") {
      nextValue = value.replace(/[^a-zA-Z\s]/g, "").slice(0, 50);
    }
    const updated = { ...form, [field]: nextValue };
    setForm(updated);

    // Live update live draft for instant preview reflection
    if (onUpdateDraft) {
      onUpdateDraft({
        ...updated,
        amenities: typeof updated.amenities === "string"
          ? updated.amenities.split(",").map((s) => s.trim()).filter(Boolean)
          : updated.amenities,
        policies: typeof updated.policies === "string"
          ? updated.policies.split(",").map((s) => s.trim()).filter(Boolean)
          : updated.policies,
        images: updated.images.map((entry) => entry.preview),
      });
    }
  };

  const handleImageSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter(Boolean);
    if (selectedFiles.length === 0) return;

    const newEntries = selectedFiles.map(buildImageState);
    const updatedImages = [...(form.images || []), ...newEntries];

    handleChange("images", updatedImages);
    event.target.value = "";
  };

  const handleRemoveImage = (imageId) => {
    const updatedImages = (form.images || []).filter((entry) => entry.id !== imageId);
    handleChange("images", updatedImages);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const uploadedImages = await Promise.all(
        (form.images || []).map((entry) => uploadIfFile(entry.value))
      );

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        monthlyPrice: Number(form.monthlyPrice),
        isPopular: Boolean(form.isPopular),
        amenities: form.amenities
          ? form.amenities.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        policies: form.policies
          ? form.policies.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        images: uploadedImages.filter(Boolean),
      };

      await onSavePublic(payload);
    } catch (err) {
      console.error("Failed to save public listing info:", err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div>
          <h4 className="font-semibold text-sm text-foreground">
            Website Content & Listing Details
          </h4>
          <p className="text-xs text-muted-foreground">
            As you type, the live website preview card on the right updates in real time.
          </p>
        </div>
      </div>

      {/* Popular Badge Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-current" />
          <div>
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
              Mark as "Most Popular" Room
            </span>
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              Highlights this room with a golden badge on the landing page
            </span>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPopular}
            onChange={(e) => handleChange("isPopular", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
        </label>
      </div>

      {/* Room Name */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">Room Title / Public Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. Premium Private Suite"
          className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Pricing Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Monthly Rate (₱)</label>
          <input
            type="number"
            min="0"
            value={form.monthlyPrice}
            onChange={(e) => handleChange("monthlyPrice", e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Base Price (₱)</label>
          <input
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => handleChange("price", e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Detailed public description..."
          className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Amenities & Policies */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">Amenities (comma-separated)</label>
        <input
          type="text"
          value={form.amenities}
          onChange={(e) => handleChange("amenities", e.target.value)}
          placeholder="Wi-Fi, Aircon, Private Bathroom, Lockers"
          className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">Policies (comma-separated)</label>
        <input
          type="text"
          value={form.policies}
          onChange={(e) => handleChange("policies", e.target.value)}
          placeholder="No pets, 10 PM quiet hours, Non-smoking"
          className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Image Upload Grid */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">Room Photos</label>
        <div className="border border-dashed border-border rounded-lg p-3 bg-muted/30">
          <label className="flex items-center justify-center gap-2 py-2 px-3 border border-border rounded-md bg-background text-xs font-medium cursor-pointer hover:bg-muted transition-colors text-foreground">
            <ImagePlus size={16} className="text-primary" />
            <span>Upload Photos</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              hidden
              onChange={handleImageSelection}
            />
          </label>

          {form.images?.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {form.images.map((entry, index) => (
                <div
                  key={entry.id}
                  className="relative group rounded-md overflow-hidden border border-border h-20 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                  onClick={() => setLightboxIndex(index)}
                  onMouseEnter={() => prefetchOptimizedImage(entry.value)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View full photo ${entry.name || "Room image"}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLightboxIndex(index);
                    }
                  }}
                  title="Click to view full photo"
                >
                  <img
                    src={entry.preview}
                    alt="Room"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const fb = getImageFallbackUrl(entry.preview);
                      if (fb && fb !== e.currentTarget.src) {
                        e.currentTarget.src = fb;
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[10px] font-semibold pointer-events-none">
                    <Maximize2 size={12} />
                    <span>View</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveImage(entry.id);
                    }}
                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity z-10 cursor-pointer"
                    title="Remove image"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <RoomImageLightboxModal
          images={form.images}
          initialIndex={lightboxIndex}
          roomNumber={form.name || room?.roomNumber || "Room"}
          roomType={room?.type}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
