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
    <div>
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate statements, review balances, and follow payment progress
            without leaving the admin workspace
          </p>
        </div>

        <div
          className="flex flex-col gap-4 rounded-xl border border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
        >
          <div className="flex items-start gap-3">
            <Zap size={20} style={{ color: "var(--warning-dark)", marginTop: "2px", flexShrink: 0 }} />
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--warning-dark)" }}
              >
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
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
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
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition"
                  style={
                    isActive
                      ? {
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          boxShadow: "var(--shadow-sm)",
                        }
                      : { color: "var(--muted-foreground)" }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--muted)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "";
                  }}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={15} />
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
          <UtilityBillingTab utilityType="electricity" isActive={activeTab === "electricity"} />
        </section>

        <section
          role="tabpanel"
          id="billing-panel-water"
          aria-labelledby="billing-tab-water"
          className={activeTab === "water" ? "block" : "hidden"}
        >
          <UtilityBillingTab utilityType="water" isActive={activeTab === "water"} />
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