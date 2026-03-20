import React from "react";
import "./PageShell.css";

/**
 * PageShell — Consistent 3-region layout for every admin page.
 *
 * Usage:
 *   <PageShell tabs={[...]} activeTab={tab} onTabChange={setTab}>
 *     <PageShell.Summary>  <SummaryBar ... />  </PageShell.Summary>
 *     <PageShell.Actions>  <ActionBar ... />    </PageShell.Actions>
 *     <PageShell.Content>  <DataTable ... />    </PageShell.Content>
 *   </PageShell>
 */

function PageShell({ children, tabs, activeTab, onTabChange }) {
  const slots = { summary: null, actions: null, content: null };

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === Summary) slots.summary = child;
    else if (child.type === Actions) slots.actions = child;
    else if (child.type === Content) slots.content = child;
  });

  // Only render slot wrappers if they have real (non-boolean/null) children
  const hasSlot = (slot) =>
    slot && React.Children.toArray(slot.props.children).length > 0;

  return (
    <div className="page-shell">
      {/* Tabs — always at top */}
      {tabs && tabs.length > 0 && (
        <div className="page-shell__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`page-shell__tab ${activeTab === tab.key ? "page-shell__tab--active" : ""}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.icon && <tab.icon size={15} />}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Summary row — only renders if slot has actual content */}
      {hasSlot(slots.summary) && (
        <div className="page-shell__summary">{slots.summary}</div>
      )}

      {/* Actions row — only renders if slot has actual content */}
      {hasSlot(slots.actions) && (
        <div className="page-shell__actions">{slots.actions}</div>
      )}

      {/* Content area */}
      {slots.content && (
        <div className="page-shell__content">{slots.content}</div>
      )}
    </div>
  );
}

/* ── Slot components ── */
function Summary({ children }) { return <>{children}</>; }
function Actions({ children }) { return <>{children}</>; }
function Content({ children }) { return <>{children}</>; }

PageShell.Summary = Summary;
PageShell.Actions = Actions;
PageShell.Content = Content;

export default PageShell;
