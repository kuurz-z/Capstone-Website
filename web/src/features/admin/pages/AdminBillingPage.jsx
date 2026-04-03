import { useState } from "react";
import { Droplets, Send, Zap } from "lucide-react";
import UtilityBillingTab from "../components/billing/UtilityBillingTab";
import InvoicePublishTab from "../components/billing/InvoicePublishTab";
import "./AdminBillingPage.css";

const tabs = [
  { id: "electricity", label: "Electricity", icon: Zap },
  { id: "water", label: "Water", icon: Droplets },
  { id: "invoices", label: "Issue Invoices", icon: Send },
];

const AdminBillingPage = () => {
  const [activeTab, setActiveTab] = useState("electricity");

  // Visual contract:
  // hero shell + tablist + workspace panel
  return (
    <div className="admin-billing-page">
      <header className="admin-billing-page__hero">
        <div className="admin-billing-page__hero-copy">
          <span className="admin-billing-page__eyebrow">Billing Workspace</span>
          <h1 className="admin-billing-page__heading">Billing Management</h1>
          <p className="admin-billing-page__subtitle">
            Manage utility cycles, review tenant splits, and publish invoices from one workspace.
          </p>
        </div>

        <div
          className="admin-billing-page__hero-actions admin-billing-page__workspace-tabs"
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
                aria-selected={activeTab === tab.id}
                className={`admin-billing-tab${activeTab === tab.id ? " is-active" : ""}${tab.id === "invoices" ? " admin-billing-tab--publish" : ""}`}
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
      </header>

      <section className="admin-billing-page__workspace-panel">
        {activeTab === "electricity" && <UtilityBillingTab utilityType="electricity" />}
        {activeTab === "water" && <UtilityBillingTab utilityType="water" />}
        {activeTab === "invoices" && <InvoicePublishTab />}
      </section>
    </div>
  );
};

export default AdminBillingPage;
