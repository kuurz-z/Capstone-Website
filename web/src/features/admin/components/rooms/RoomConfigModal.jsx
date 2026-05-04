import { useEffect, useState } from "react";
import { formatRoomType, formatBranch } from "../../utils/formatters";
import {
 ArrowDown,
 ArrowUp,
 Image as ImageIcon,
 Lock,
 Pencil,
 Plus,
 Trash2,
 X,
} from "lucide-react";
import useEscapeClose from "../../../../shared/hooks/useEscapeClose";

export default function RoomConfigModal({
 room,
 onClose,
 onSave,
 onEdit,
 onDelete,
}) {
 const [saving, setSaving] = useState(false);
 const [draftRoom, setDraftRoom] = useState(room);
 useEscapeClose(true, onClose);

 useEffect(() => {
 setDraftRoom(room);
 }, [room]);

 const getBedStatus = (bed) =>
 bed.status || (bed.available === false ? "occupied" : "available");

 const setBeds = (updater) => {
 setDraftRoom((current) => ({
 ...current,
 beds: updater([...(current?.beds || [])]),
 }));
 };

 const handleToggleMaintenance = (bedId) => {
 setBeds((beds) =>
 beds.map((bed) => {
 if (bed.id !== bedId) return bed;
 const currentStatus = getBedStatus(bed);
 if (["occupied", "reserved", "locked"].includes(currentStatus)) {
 return bed;
 }

 return {
 ...bed,
 status: currentStatus === "maintenance" ? "available" : "maintenance",
 };
 }),
 );
 };

 const handleBedFieldChange = (bedId, field, value) => {
 setBeds((beds) =>
 beds.map((bed) => (bed.id === bedId ? { ...bed, [field]: value } : bed)),
 );
 };

 const handleAddBed = () => {
 setBeds((beds) => [
 ...beds,
 {
 id: `bed-${beds.length + 1}`,
 position: "single",
 status: "available",
 },
 ]);
 };

 const handleMoveBed = (bedId, direction) => {
 setBeds((beds) => {
 const index = beds.findIndex((bed) => bed.id === bedId);
 const nextIndex = direction === "up" ? index - 1 : index + 1;
 if (index === -1 || nextIndex < 0 || nextIndex >= beds.length) {
 return beds;
 }

 const nextBeds = [...beds];
 const [movedBed] = nextBeds.splice(index, 1);
 nextBeds.splice(nextIndex, 0, movedBed);
 return nextBeds;
 });
 };

 const handleRemoveBed = (bedId) => {
 setBeds((beds) => beds.filter((bed) => bed.id !== bedId));
 };

 const handleSave = async () => {
 setSaving(true);
 try {
 if (onSave) await onSave(draftRoom);
 onClose();
 } catch (err) {
 console.error("Failed to save room config:", err);
 } finally {
 setSaving(false);
 }
 };

 if (!draftRoom) return null;

 return (
 <div className="admin-modal-overlay" onClick={onClose}>
 <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
 <div className="admin-modal-header">
 <h2>Configure Room: {draftRoom.name}</h2>
 <div className="room-config-modal__header-actions">
 {onEdit && (
 <button
 type="button"
 className="room-config-modal__icon-btn"
 onClick={() => onEdit(draftRoom)}
 aria-label="Edit room"
 title="Edit room"
 >
 <Pencil size={16} />
 </button>
 )}
 {onDelete && (
 <button
 type="button"
 className="room-config-modal__icon-btn room-config-modal__icon-btn--danger"
 onClick={() => onDelete(draftRoom)}
 aria-label="Archive room"
 title="Archive room"
 >
 <Trash2 size={16} />
 </button>
 )}
 <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
 <X size={20} />
 </button>
 </div>
 </div>

 <div className="admin-modal-body">
 <div className="room-info-section">
 <h3>Room Information</h3>
 <div className="info-grid">
 <div>
 <strong>Type</strong>
 {formatRoomType(draftRoom.type)}
 </div>
 <div>
 <strong>Capacity</strong>
 {draftRoom.capacity} pax
 </div>
 <div>
 <strong>Floor</strong>
 Floor {draftRoom.floor}
 </div>
 <div>
 <strong>Branch</strong>
 {formatBranch(draftRoom.branch)}
 </div>
 <div>
 <strong>Base Price</strong>
 ₱{Number(draftRoom.price || 0).toLocaleString()}
 </div>
 </div>
 </div>

 <div className="bed-config-section">
 <h3>Room Images</h3>
 {draftRoom.images?.length ? (
 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
 gap: 12,
 }}
 >
 {draftRoom.images.map((image, index) => (
 <img
 key={`${image}-${index}`}
 src={image}
 alt={`${draftRoom.name} ${index + 1}`}
 style={{
 width: "100%",
 height: 108,
 borderRadius: 12,
 objectFit: "cover",
 border: "1px solid rgba(15, 23, 42, 0.08)",
 }}
 />
 ))}
 </div>
 ) : (
 <p className="no-beds" style={{ display: "flex", gap: 8, alignItems: "center" }}>
 <ImageIcon size={16} />
 No room images saved yet. Use Edit Room to upload photos.
 </p>
 )}
 </div>

 <div className="bed-config-section">
 <div
 style={{
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 gap: 12,
 marginBottom: 12,
 }}
 >
 <h3 style={{ margin: 0 }}>Bed Configuration</h3>
 <button
 type="button"
 className="btn-secondary"
 onClick={handleAddBed}
 style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
 >
 <Plus size={14} />
 Add Bed
 </button>
 </div>
 <div className="bed-list">
 {draftRoom.beds && draftRoom.beds.length > 0 ? (
 draftRoom.beds.map((bed, index) => {
 const status = getBedStatus(bed);
 const isLocked = ["occupied", "reserved", "locked"].includes(status);
 return (
 <div key={`${bed.id || "bed"}-${index}`} className="bed-item">
 <div className="bed-info">
 <input
 className="bed-id"
 value={bed.id || ""}
 onChange={(event) =>
 handleBedFieldChange(bed.id, "id", event.target.value)
 }
 disabled={isLocked}
 style={{ maxWidth: 100 }}
 />
 <select
 className="bed-position"
 value={bed.position || "single"}
 onChange={(event) =>
 handleBedFieldChange(bed.id, "position", event.target.value)
 }
 disabled={isLocked}
 >
 <option value="single">Single</option>
 <option value="upper">Upper</option>
 <option value="lower">Lower</option>
 </select>
 <span className={`status-badge ${status}`}>
 {status.charAt(0).toUpperCase() + status.slice(1)}
 </span>
 </div>
 <div className="bed-actions">
 <button
 type="button"
 className={status === "maintenance" ? "btn-primary" : "btn-secondary"}
 onClick={() => handleToggleMaintenance(bed.id)}
 disabled={isLocked}
 style={{ padding: "4px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
 >
 {status === "maintenance" ? (
 "Unlock"
 ) : (
 <>
 <Lock size={12} />
 Maintenance
 </>
 )}
 </button>
 <button
 type="button"
 className="btn-secondary"
 onClick={() => handleMoveBed(bed.id, "up")}
 disabled={index === 0}
 style={{ padding: "4px 8px" }}
 aria-label="Move bed up"
 >
 <ArrowUp size={12} />
 </button>
 <button
 type="button"
 className="btn-secondary"
 onClick={() => handleMoveBed(bed.id, "down")}
 disabled={index === draftRoom.beds.length - 1}
 style={{ padding: "4px 8px" }}
 aria-label="Move bed down"
 >
 <ArrowDown size={12} />
 </button>
 <button
 type="button"
 className="btn-secondary"
 onClick={() => handleRemoveBed(bed.id)}
 disabled={isLocked}
 style={{ padding: "4px 8px", color: "#DC2626" }}
 aria-label="Remove bed"
 >
 <Trash2 size={12} />
 </button>
 </div>
 </div>
 );
 })
 ) : (
 <p className="no-beds">No beds have been configured for this room.</p>
 )}
 </div>
 </div>

 <div className="occupancy-info">
 <h3>Current Occupancy</h3>
 <div className="occupancy-bar">
 <div
 className="occupancy-fill"
 style={{
 width: `${((draftRoom.currentOccupancy || 0) / (draftRoom.capacity || 1)) * 100}%`,
 }}
 />
 </div>
 <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
 {draftRoom.currentOccupancy} of {draftRoom.capacity} beds currently occupied
 </p>
 </div>
 </div>

 <div className="admin-modal-footer">
 <button className="btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn-primary" onClick={handleSave} disabled={saving}>
 {saving ? "Saving Changes..." : "Save Changes"}
 </button>
 </div>
 </div>
 </div>
 );
}
