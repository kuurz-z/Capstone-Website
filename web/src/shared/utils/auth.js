import { auth } from "../../firebase/config";
import { showConfirmation, showNotification } from "./notification";
import { authApi } from "../api/authApi";

/**
 * Legacy utility kept for compatibility.
 * Prefer useAuth().logout() plus route flash for routed UI flows.
 *
 * Log out the current user
 * Calls backend to log logout event, then clears Firebase auth session
 * @param {boolean} skipConfirmation - Skip confirmation dialog
 */
export const logout = async (skipConfirmation = false) => {
  try {
    // Show confirmation dialog unless skipped
    if (!skipConfirmation) {
      const confirmed = await showConfirmation(
        "Are you sure you want to logout?",
        "Logout",
        "Cancel",
      );

      if (!confirmed) {
        return false; // User cancelled
      }
    }

    // Routed flows should handle post-logout navigation and success flash.
    // This helper only performs the auth-side sign-out work.
    await authApi.logout();
    return true;
  } catch (error) {
    console.error("Logout error:", error);
    showNotification("Failed to logout. Please try again.", "error");
    throw error;
  }
};

/**
 * Get the current Firebase user
 * @returns {Object|null} Firebase user object or null if not logged in
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};

/**
 * Check if user is logged in
 * @returns {boolean} True if user is logged in
 */
export const isLoggedIn = () => {
  return !!auth.currentUser;
};

// Guide: Use the FirebaseAuthContext to get the current user and role in your app.
