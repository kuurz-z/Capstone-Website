/**
 * =============================================================================
 * HTTP CLIENT - Core Authentication & Request Layer
 * =============================================================================
 *
 * Low-level HTTP client with Firebase token management.
 * All domain-specific API modules import from here.
 *
 * =============================================================================
 */

import { auth } from "../../firebase/config";

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// =============================================================================
// HELPER: Get Fresh Firebase ID Token
// =============================================================================

/**
 * Get a fresh Firebase ID token from the current user.
 * This ensures tokens are always valid and not expired.
 *
 * @param {boolean} forceRefresh - Force refresh even if token is still valid
 * @returns {Promise<string|null>} Fresh ID token or null if not logged in
 */
export const getFreshToken = async (forceRefresh = false) => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    console.error("❌ Failed to get fresh token:", error);
    return null;
  }
};

// =============================================================================
// CORE: Authenticated Fetch (always uses fresh token)
// =============================================================================

/**
 * Make authenticated HTTP request with always-fresh Firebase ID token.
 * This function should be used for all protected API endpoints.
 *
 * @param {string} url - API endpoint path (e.g., "/auth/login")
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} API error with response details
 */
export const authFetch = async (url, options = {}, _isRetry = false) => {
  try {
    // Always get a fresh token before each request
    const token = await getFreshToken();

    if (!token) {
      throw new Error(
        "No authorization header provided - user not authenticated",
      );
    }

    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));

      // ── Silent token refresh on 401 (prevents mid-demo crashes) ──
      // If the token expired mid-session, force-refresh and retry once.
      if (response.status === 401 && !_isRetry) {
        const freshToken = await getFreshToken(true); // force refresh
        if (freshToken) {
          return authFetch(url, options, true); // retry exactly once
        }
      }

      let errorMessage = "API request failed";
      if (error && error.error) {
        errorMessage = typeof error.error === "string" ? error.error : error.error.message;
      } else if (error && error.message) {
        errorMessage = error.message;
      }
      
      const apiError = new Error(errorMessage);
      apiError.response = { status: response.status, data: error };
      throw apiError;
    }

    const json = await response.json();
    // Auto-unwrap sendSuccess envelope: { success, data, meta } → data
    if (json && json.success === true && "data" in json) return json.data;
    return json;
  } catch (error) {
    console.error("❌ API Request Error:", error);
    throw error;
  }
};

// =============================================================================
// CORE: Public Fetch (no authentication required)
// =============================================================================

/**
 * Make public HTTP request (no authentication).
 *
 * @param {string} url - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed JSON response
 */
export const publicFetch = async (url, options = {}) => {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));

      const apiError = new Error(
        error.error || error.message || "API request failed",
      );
      apiError.response = { status: response.status, data: error };
      throw apiError;
    }

    const json = await response.json();
    // Auto-unwrap sendSuccess envelope: { success, data, meta } → data
    if (json && json.success === true && "data" in json) return json.data;
    return json;
  } catch (error) {
    console.error("❌ Public API Request Error:", error);
    throw error;
  }
};

// =============================================================================
// HOOK: useApiClient (for React components that need direct access)
// =============================================================================

/**
 * React hook that provides authenticated API methods.
 * Use this inside React components or custom hooks.
 *
 * @example
 * const { authFetch } = useApiClient();
 * const data = await authFetch("/protected/route");
 */
export function useApiClient() {
  return {
    authFetch,
    publicFetch,
    // Convenience methods
    get: (url) => authFetch(url, { method: "GET" }),
    post: (url, data) =>
      authFetch(url, { method: "POST", body: JSON.stringify(data) }),
    put: (url, data) =>
      authFetch(url, { method: "PUT", body: JSON.stringify(data) }),
    delete: (url) => authFetch(url, { method: "DELETE" }),
  };
}
