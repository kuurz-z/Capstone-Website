/**
 * Financial API - Owner financial overview operations
 */

import { authFetch } from "./httpClient.js";

export const financialApi = {
  /**
   * Get owner financial overview snapshot.
   * Optional branch query: gil-puyat | guadalupe | all
   */
  getOverview: (branch = "all") =>
    authFetch(`/financial/overview?branch=${encodeURIComponent(branch)}`),
};
