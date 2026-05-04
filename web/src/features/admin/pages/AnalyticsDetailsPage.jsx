import React, { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
 ArrowLeft,
 BedDouble,
 Receipt,
 Wrench,
 DollarSign,
 ShieldAlert,
 PanelsTopLeft,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import PageShell from "../components/shared/PageShell";
import {
 buildAnalyticsSummaryHref,
 normalizeAnalyticsState,
} from "./analyticsNavigation.mjs";
import AnalyticsOccupancyTab from "./AnalyticsOccupancyTab";
import AnalyticsBillingTab from "./AnalyticsBillingTab";
import AnalyticsOperationsTab from "./AnalyticsOperationsTab";
import AnalyticsConsolidatedTab from "./AnalyticsConsolidatedTab";
import AnalyticsFinancialsTab from "./AnalyticsFinancialsTab";
import AnalyticsMonitoringTab from "./AnalyticsMonitoringTab";
import "../styles/admin-reports.css";

const BASE_TABS = [
 { key: "occupancy", label: "Occupancy", icon: BedDouble },
 { key: "billing", label: "Billing", icon: Receipt },
 { key: "operations", label: "Operations", icon: Wrench },
];

const OWNER_TABS = [
 { key: "consolidated", label: "Consolidated", icon: PanelsTopLeft },
 { key: "financials", label: "Financials", icon: DollarSign },
 { key: "monitoring", label: "System Monitoring", icon: ShieldAlert },
];

function resolveTabComponent(tabKey, sharedProps) {
 switch (tabKey) {
 case "billing":
 return <AnalyticsBillingTab {...sharedProps} />;
 case "operations":
 return <AnalyticsOperationsTab {...sharedProps} />;
 case "consolidated":
 return <AnalyticsConsolidatedTab {...sharedProps} />;
 case "financials":
 return <AnalyticsFinancialsTab {...sharedProps} />;
 case "monitoring":
 return <AnalyticsMonitoringTab {...sharedProps} />;
 case "occupancy":
 default:
 return <AnalyticsOccupancyTab {...sharedProps} />;
 }
}

export default function AnalyticsDetailsPage() {
 const { user } = useAuth();
 const [searchParams, setSearchParams] = useSearchParams();
 const isOwner = user?.role === "owner";

 const tabs = useMemo(
 () => [...BASE_TABS, ...(isOwner ? OWNER_TABS : [])],
 [isOwner],
 );

 const requestedTab = searchParams.get("tab") || BASE_TABS[0].key;
 const allowedTabKeys = tabs.map((tab) => tab.key);
 const requestedRange = searchParams.get("range");
 const requestedBranch = searchParams.get("branch");
 const {
 activeTab,
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
 }, [
 activeTab,
 branch,
 isOwner,
 range,
 requestedBranch,
 requestedRange,
 requestedTab,
 searchParams,
 setSearchParams,
 ]);

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
 const summaryHref = buildAnalyticsSummaryHref({
 range,
 branch,
 isOwner,
 });

 return (
 <PageShell tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange}>
 <PageShell.Actions>
 <div className="flex justify-end">
 <Link
 to={summaryHref}
 className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
 >
 <ArrowLeft size={16} />
 Back to Summary
 </Link>
 </div>
 </PageShell.Actions>
 <PageShell.Content>
 {resolveTabComponent(activeTab, sharedProps)}
 </PageShell.Content>
 </PageShell>
 );
}
