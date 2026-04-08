import { useState } from "react";
import { Droplets, Zap } from "lucide-react";
import UtilityBillingTab from "../components/billing/UtilityBillingTab";
import "./AdminBillingPage.css";

const tabs = [
  { id: "electricity", label: "Electricity", icon: Zap },
  { id: "water", label: "Water", icon: Droplets },
];

const workflowStages = [
  {
    id: "setup",
    title: "Setup Period",
    caption: "Choose room and start a new cycle.",
  },
  {
    id: "capture",
    title: "Capture Reading",
    caption: "Record usage inputs and rates.",
  },
  {
    id: "review",
    title: "Review Results",
    caption: "Check totals, timeline, and changes.",
  },
  {
    id: "publish",
    title: "Send Or Export",
    caption: "Send ready charges or export report.",
  },
];

const AdminBillingPage = () => {
  const [activeTab, setActiveTab] = useState("electricity");
  const activePanelId = `billing-panel-${activeTab}`;

  // Visual contract:
  // hero shell + tablist + workspace panel
  return (
    <div className="admin-billing-page">
      <header className="admin-billing-page__hero">
        <div className="admin-billing-page__hero-copy">
          <span className="admin-billing-page__eyebrow">Billing Workspace</span>
          <h1 className="admin-billing-page__heading">Billing Management</h1>
          <p className="admin-billing-page__subtitle">
            Create billing cycles, review results, and send charges in a few
            clear steps.
          </p>
        </div>

        <div className="admin-billing-page__hero-actions">
          <div
            className="admin-billing-page__workspace-tabs"
            role="tablist"
            aria-label="Billing type"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`billing-tab-${tab.id}`}
                  aria-controls={`billing-panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={`admin-billing-tab${activeTab === tab.id ? " is-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="admin-billing-tab__icon">
                    <Icon size={14} />
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <section
        className="admin-billing-page__workspace-panel"
        role="tabpanel"
        id={activePanelId}
        aria-labelledby={`billing-tab-${activeTab}`}
      >
        <div className="admin-billing-page__workflow" aria-label="Billing workflow stages">
          {workflowStages.map((stage, index) => (
            <article key={stage.id} className="admin-billing-stage">
              <span className="admin-billing-stage__index" aria-hidden="true">
                {index + 1}
              </span>
              <div className="admin-billing-stage__content">
                <h2 className="admin-billing-stage__title">{stage.title}</h2>
                <p className="admin-billing-stage__caption">{stage.caption}</p>
              </div>
            </article>
          ))}
        </div>

        {activeTab === "electricity" && (
          <UtilityBillingTab utilityType="electricity" />
        )}
        {activeTab === "water" && <UtilityBillingTab utilityType="water" />}
      </section>
    </div>
  );
};

export default AdminBillingPage;
