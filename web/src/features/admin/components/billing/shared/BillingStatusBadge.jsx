import "./BillingShared.css";

export default function BillingStatusBadge({ status, className = "", variantClassPrefix = "" }) {
  const variantClass = variantClassPrefix ? `${variantClassPrefix}--${status}` : "";
  return (
    <span
      className={`billing-status-badge billing-status-badge--${status} ${variantClass} ${className}`.trim()}
    >
      {status}
    </span>
  );
}
