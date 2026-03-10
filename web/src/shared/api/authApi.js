/**
 * =============================================================================
 * AUTH API SERVICE (Legacy Compatibility)
 * =============================================================================
 *
 * DEPRECATION NOTICE:
 * This file is maintained for backward compatibility with the useAuth hook.
 * For new code, use the authApi from apiClient.js which uses fresh tokens.
 *
 * Migration Guide:
 * - Old: import { authApi } from '../api/authApi'
 * - New: import { authApi } from '../api/apiClient'
 *
 * @deprecated Use apiClient.js authApi instead
 * =============================================================================
 */

import { auth } from "../../firebase/config";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Get fresh Firebase ID token for API requests.
 * Forces refresh to ensure token validity.
 *
 * @returns {Promise<string|null>} Fresh ID token or null if not authenticated
 * @private
 */
const getFreshToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(true);
  } catch (error) {
    console.error("Failed to get token:", error);
    return null;
  }
};

/**
 * Make authenticated request with fresh Firebase token.
 *
 * @param {string} url - API endpoint path (relative to API_BASE_URL)
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} API error with message
 * @private
 */
const authRequest = async (url, options = {}) => {
  const token = await getFreshToken();
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // Create error with .response property so callers can check status codes
    // (e.g., Google sign-up flow checks error.response?.status === 404)
    const error = new Error(
      errorData.error || errorData.message || "Request failed",
    );
    error.response = {
      status: response.status,
      data: errorData,
    };
    throw error;
  }

  return response.json();
};

/**
 * Auth API methods for the useAuth hook.
 * @deprecated Use apiClient.js authApi for new implementations
 */
export const authApi = {
  /**
   * Authenticate user with backend after Firebase sign-in
   * @returns {Promise<Object>} User data from backend
   */
  login: () => authRequest("/auth/login", { method: "POST" }),

  /**
   * Check if user exists in backend (doesn't create audit log)
   * Used for Google sign-in flow to check before registration
   * @returns {Promise<Object>} User data from backend
   */
  checkUser: () =>
    authRequest("/auth/login?checkOnly=true", { method: "POST" }),

  /**
   * Register new user in backend after Firebase account creation
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user data
   */
  register: (userData) =>
    authRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  /**
   * Sign out user from Firebase and backend
   * @returns {Promise<Object>} Success message
   */
  logout: async () => {
    try {
      console.log("🔐 [Logout] Starting backend logout call...");
      // Call backend logout endpoint first to log the logout
      const response = await authRequest("/auth/logout", { method: "POST" });
      console.log("✅ [Logout] Backend logout successful:", response);
    } catch (error) {
      console.error(
        "❌ [Logout] Backend logout error:",
        error.message || error,
      );
    }
    // Always sign out from Firebase even if backend fails
    console.log("🔐 [Logout] Signing out from Firebase...");
    await auth.signOut();
    console.log("✅ [Logout] Firebase signout complete");
    return { message: "Logged out successfully" };
  },

  /**
   * Get current user's profile from backend
   * @returns {Promise<Object>} User profile data
   */
  getCurrentUser: () => authRequest("/auth/profile"),
};
