import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransferTenantModal } from "../features/admin/components/TenantWorkspaceModals.jsx";

// Render the real wizard before any financial preview has arrived.
const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <TransferTenantModal open tenant={{ tenantName: "Transfer smoke test", monthlyRent: 6300 }} detail={{}} loading={false} onClose={() => {}} onSubmit={() => {}} />
  </QueryClientProvider>,
);
