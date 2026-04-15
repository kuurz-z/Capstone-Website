import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  BedDouble,
  Receipt,
  Wrench,
  DollarSign,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import PageShell from "../components/shared/PageShell";
import {
  normalizeAnalyticsState,
} from "./analyticsNavigation.mjs";
import AnalyticsOverviewTab from "./AnalyticsOverviewTab";
import AnalyticsOccupancyTab from "./AnalyticsOccupancyTab";
import AnalyticsBillingTab from "./AnalyticsBillingTab";
import AnalyticsOperationsTab from "./AnalyticsOperationsTab";
import AnalyticsFinancialsTab from "./AnalyticsFinancialsTab";
import AnalyticsMonitoringTab from "./AnalyticsMonitoringTab";

const BASE_TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "occupancy", label: "Occupancy", icon: BedDouble },
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "operations", label: "Operations", icon: Wrench },
];

const OWNER_TABS = [
  { key: "financials", label: "Financials", icon: DollarSign },
  { key: "monitoring", label: "System Monitoring", icon: ShieldAlert },
];

function resolveTabComponent(tabKey, sharedProps) {
  switch (tabKey) {
    case "occupancy":
      return <AnalyticsOccupancyTab {...sharedProps} />;
    case "billing":
      return <AnalyticsBillingTab {...sharedProps} />;
    case "operations":
      return <AnalyticsOperationsTab {...sharedProps} />;
    case "financials":
      return <AnalyticsFinancialsTab {...sharedProps} />;
    case "monitoring":
      return <AnalyticsMonitoringTab {...sharedProps} />;
    case "overview":
    default:
      return <AnalyticsOverviewTab {...sharedProps} />;
  }
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = user?.role === "owner";

  const tabs = useMemo(
    () => [...BASE_TABS, ...(isOwner ? OWNER_TABS : [])],
    [isOwner],
  );

  const defaultTab = "overview";
  const requestedTab = searchParams.get("tab") || defaultTab;
  const allowedTabKeys = tabs.map((tab) => tab.key);
  const requestedRange = searchParams.get("range");
  const requestedBranch = searchParams.get("branch");
  const {
    activeTab,
    allowedRanges,
    range,
    branch,
  } = normalizeAnalyticsState({
    requestedTab,
    requestedRange,
    requestedBranch,
    isOwner,
    userBranch: user?.branch || "gil-puyat",
  });

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let changed = false;

    if (requestedTab !== activeTab) {
      nextParams.set("tab", activeTab);
      changed = true;
    }

    if (requestedRange !== range) {
      nextParams.set("range", range);
      changed = true;
    }

    if (isOwner) {
      if (requestedBranch !== branch) {
        nextParams.set("branch", branch);
        changed = true;
      }
    } else if (searchParams.has("branch")) {
      nextParams.delete("branch");
      changed = true;
    }

    if (!changed) return;
    setSearchParams(nextParams, { replace: true });
  }, [activeTab, branch, isOwner, range, requestedRange, requestedTab, searchParams, setSearchParams]);

  const handleTabChange = (nextTab) => {
    if (!allowedTabKeys.includes(nextTab)) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleRangeChange = (nextRange) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("range", nextRange);
    setSearchParams(nextParams, { replace: true });
  };

  const handleBranchChange = (nextBranch) => {
    if (!isOwner) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("branch", nextBranch);
    setSearchParams(nextParams, { replace: true });
  };

  const sharedProps = {
    branch,
    range,
    isOwner,
    onRangeChange: handleRangeChange,
    onBranchChange: handleBranchChange,
  };

  return (
    <PageShell tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange}>
      <PageShell.Content>
        {resolveTabComponent(activeTab, sharedProps)}
      </PageShell.Content>
    </PageShell>
  );
}
