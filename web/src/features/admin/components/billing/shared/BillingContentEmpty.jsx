import "./BillingShared.css";

export default function BillingContentEmpty({ icon: Icon, message }) {
  return (
    <div className="billing-content-empty">
      {Icon ? <Icon size={40} strokeWidth={1.5} /> : null}
      <p>{message}</p>
    </div>
  );
}
