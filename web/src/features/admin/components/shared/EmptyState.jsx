import { Inbox } from "lucide-react";
import "./EmptyState.css";

/**
 * EmptyState — "No data" placeholder with icon, title, and description.
 */
export default function EmptyState({ icon: Icon = Inbox, title = "No data", description }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon size={32} />
      </div>
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__desc">{description}</p>}
    </div>
  );
}
