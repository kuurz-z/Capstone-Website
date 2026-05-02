import { useState } from "react";
import { Droplets, Zap, Home } from "lucide-react";
import UtilityBillingTab from "../components/billing/UtilityBillingTab";
import RentBillingTab from "../components/billing/RentBillingTab";

const tabs = [
  { id: "electricity", label: "Electricity", icon: Zap },
  { id: "water",       label: "Water",       icon: Droplets },
  { id: "rent",        label: "Rent",        icon: Home },
];

const AdminBillingPage = () => {
  const [activeTab, setActiveTab] = useState("electricity");

  return (
    <div className="px-6 py-4">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate statements, review balances, and follow payment progress
            without leaving the admin workspace
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border bg-amber-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-warning-light text-warning-dark">
              <Zap size={16} />
            </span>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-warning-dark">
                Billing Workspace
              </span>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                Billing Management
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create billing cycles, review results, and send charges in a few
                clear steps.
              </p>
            </div>
          </div>

          <div
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
            role="tablist"
            aria-label="Billing type"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`billing-tab-${tab.id}`}
                  aria-controls={`billing-panel-${tab.id}`}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-amber-400 text-amber-950 shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-card/70">
                    <Icon size={12} />
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="mt-5 min-h-[680px]">
        <section
          role="tabpanel"
          id="billing-panel-electricity"
          aria-labelledby="billing-tab-electricity"
          className={activeTab === "electricity" ? "block" : "hidden"}
        >
          <UtilityBillingTab
            utilityType="electricity"
            isActive={activeTab === "electricity"}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-water"
          aria-labelledby="billing-tab-water"
          className={activeTab === "water" ? "block" : "hidden"}
        >
          <UtilityBillingTab
            utilityType="water"
            isActive={activeTab === "water"}
          />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-rent"
          aria-labelledby="billing-tab-rent"
          className={activeTab === "rent" ? "block" : "hidden"}
        >
          <RentBillingTab isActive={activeTab === "rent"} />
        </section>
      </div>
    </div>
  );
};

export default AdminBillingPage;