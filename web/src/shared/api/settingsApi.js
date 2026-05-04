import { authFetch } from "./httpClient.js";

export const settingsApi = {
  getBusinessSettings: () => authFetch("/settings/business"),
  updateBusinessSettings: (payload) =>
    authFetch("/settings/business", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateBranchSettings: (branch, payload) =>
    authFetch(`/settings/branch/${branch}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
