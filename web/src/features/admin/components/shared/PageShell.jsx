import React from "react";

/**
 * PageShell — Consistent 3-region layout for every admin page.
 *
 * Usage:
 * <PageShell tabs={[...]} activeTab={tab} onTabChange={setTab}>
 * <PageShell.Summary> <SummaryBar ... /> </PageShell.Summary>
 * <PageShell.Actions> <ActionBar ... /> </PageShell.Actions>
 * <PageShell.Content> <DataTable ... /> </PageShell.Content>
 * </PageShell>
 */

function PageShell({ children, tabs, activeTab, onTabChange }) {
 const slots = { summary: null, actions: null, content: null };
 const extras = [];

 React.Children.forEach(children, (child) => {
 if (!React.isValidElement(child)) {
 if (child != null && child !== false) extras.push(child);
 return;
 }
 if (child.type === Summary) slots.summary = child;
 else if (child.type === Actions) slots.actions = child;
 else if (child.type === Content) slots.content = child;
 else extras.push(child);
 });

 // Only render slot wrappers if they have real (non-boolean/null) children
 const hasSlot = (slot) =>
 slot && React.Children.toArray(slot.props.children).length > 0;

 return (
 <div className="flex flex-col gap-6 pb-8">
 {/* Tabs — always at top */}
 {tabs && tabs.length > 0 && (
 <div className="flex gap-2 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="Workspace sections">
 {tabs.map((tab) => (
 <button
 key={tab.key}
 id={`page-shell-tab-${tab.key}`}
 type="button"
 role="tab"
 aria-selected={activeTab === tab.key}
 aria-controls={`page-shell-panel-${tab.key}`}
 className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${activeTab === tab.key ? "border-border bg-card text-card-foreground shadow-[inset_0_-2px_0_var(--color-primary)]" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted"}`}
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
 <div>{slots.summary}</div>
 )}

 {/* Actions row — only renders if slot has actual content */}
 {hasSlot(slots.actions) && (
 <div>{slots.actions}</div>
 )}

 {/* Content area */}
 {slots.content && (
 <div>{slots.content}</div>
 )}

 {extras}
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
