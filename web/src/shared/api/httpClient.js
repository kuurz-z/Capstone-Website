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
import { API_BASE_URL } from "./baseUrl";

export const API_URL = API_BASE_URL;

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
    console.error("Failed to get fresh token:", error);
    return null;
  }
};

const parseApiJson = (json, preserveEnvelope = false) => {
  if (json && json.success === true && "data" in json && !preserveEnvelope) {
    return json.data;
  }

  return json;
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
    const {
      preserveEnvelope = false,
      headers: optionHeaders,
      ...fetchOptions
    } = options;

    const token = await getFreshToken();

    if (!token) {
      throw new Error(
        "No authorization header provided - user not authenticated",
      );
    }

    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...optionHeaders,
    };

    const response = await fetch(`${API_URL}${url}`, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));

      if (response.status === 401 && !_isRetry) {
        const freshToken = await getFreshToken(true);
        if (freshToken) {
          return authFetch(url, options, true);
        }
      }

      let errorMessage = "API request failed";
      if (error && error.error) {
        errorMessage =
          typeof error.error === "string"
            ? error.error
            : error.error.message;
      } else if (error && error.message) {
        errorMessage = error.message;
      }

      const apiError = new Error(errorMessage);
      apiError.response = { status: response.status, data: error };
      throw apiError;
    }

    const json = await response.json();
    return parseApiJson(json, preserveEnvelope);
  } catch (error) {
    console.error("API Request Error:", error);
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
    const {
      preserveEnvelope = false,
      headers: optionHeaders,
      ...fetchOptions
    } = options;

    const headers = {
      "Content-Type": "application/json",
      ...optionHeaders,
    };

    const response = await fetch(`${API_URL}${url}`, {
      ...fetchOptions,
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
    return parseApiJson(json, preserveEnvelope);
  } catch (error) {
    console.error("Public API Request Error:", error);
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
    get: (url) => authFetch(url, { method: "GET" }),
    post: (url, data) =>
      authFetch(url, { method: "POST", body: JSON.stringify(data) }),
    put: (url, data) =>
      authFetch(url, { method: "PUT", body: JSON.stringify(data) }),
    delete: (url) => authFetch(url, { method: "DELETE" }),
  };
}
