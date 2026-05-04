import "./BillingShared.css";

export default function BillingRoomHeader({ icon: Icon, title, branch }) {
  return (
    <div className="billing-room-header">
      <h2 className="billing-room-header__title">
        {Icon ? <Icon size={16} /> : null}
        {title}
      </h2>
      {branch ? <span className="billing-room-header__branch">{branch}</span> : null}
    </div>
  );
}
