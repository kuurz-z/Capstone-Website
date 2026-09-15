import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock.js";

export default function RoomSwapModal({ open, onClose }) {
  useBodyScrollLock(open);
  if (!open) return null;
  return (
    <div className="tenant-workspace-modal__overlay" onClick={onClose}>
      <div className="tenant-workspace-modal" role="dialog" aria-modal="true" aria-labelledby="room-swap-title" onClick={event => event.stopPropagation()}>
        <div className="tenant-workspace-modal__header"><h3 id="room-swap-title">Use Room Transfer</h3></div>
        <div className="tenant-workspace-modal__body">
          <p>Direct room swaps are unavailable. Open each tenant's details and use Room Transfer to schedule an available room and bed. Complete the required payment and transfer checks before moving the tenant.</p>
        </div>
        <div className="tenant-workspace-modal__footer"><button type="button" onClick={onClose}>Return to Tenants</button></div>
      </div>
    </div>
  );
}
