/**
 * =============================================================================
 * USE AUTH HOOK
 * =============================================================================
 *
 * Custom hook for managing authentication state and operations.
 * Works with both Firebase Auth and the backend user database.
 *
 * SEPARATION OF CONCERNS:
 * - Admin login: /admin/login → requires admin/superAdmin role
 * - Tenant login: /tenant/signin → for regular users/tenants
 *
 * The system starts with NO authenticated user. Users must explicitly
 * login through the appropriate login page.
 *
 * Usage:
 *   function MyComponent() {
 *     const { user, isAuthenticated, loading, login, logout, isAdmin } = useAuth();
 *     ...
 *   }
 *
 * Note: This hook must be used within an AuthProvider component.
 * For Firebase-specific auth state, use useFirebaseAuth from FirebaseAuthContext.
 * =============================================================================
 */

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
} from "react";
import { authApi } from "../api/authApi";
import { auth } from "../../firebase/config";
import { useFirebaseAuth } from "./FirebaseAuthContext";

const AuthContext = createContext(null);

/**
 * Auth Provider Component
 * Wraps the application to provide authentication context.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  // Global loading state for UX (spinner overlay)
  const [globalLoading, setGlobalLoading] = useState(false);
  // Logout intent to control post-logout redirects (state for React re-renders)
  const [logoutIntent, setLogoutIntent] = useState(null);
  // Ref version of logoutIntent for synchronous access (survives batching)
  const logoutIntentRef = useRef(null);
  // Ref to prevent logout from executing multiple times (survives re-renders)
  const logoutExecutedRef = useRef(false);
  // Ref to prevent redirect from executing multiple times
  const redirectExecutedRef = useRef(false);
  const { user: firebaseUser, loading: firebaseLoading } = useFirebaseAuth();

  // Sync with Firebase auth state
  // CRITICAL: This effect syncs React state with Firebase auth state
  // Route guards (RequireAdmin, RequireNonAdmin) handle redirects
  useEffect(() => {
    if (firebaseLoading) return;

    if (firebaseUser) {
      // Firebase user exists, try to get backend user data
      // Reset logout refs when user logs in (fresh session)
      logoutExecutedRef.current = false;
      redirectExecutedRef.current = false;
      logoutIntentRef.current = null; // Clear ref
      setLogoutIntent(null); // Clear any stale logout intent
      checkAuth();
    } else {
      // No Firebase user, clear state
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      // Clear local storage
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");

      // DO NOT clear logoutIntent here - route guards need it to show "Signing out..."
      // The intent will be cleared when user logs in again (see firebaseUser branch above)
      // Route guards will handle the actual redirect based on current URL
    }
  }, [firebaseUser, firebaseLoading]);

  /**
   * Check if user is authenticated by fetching profile from backend
   * @private
   */
  const checkAuth = async () => {
    try {
      const userData = await authApi.getCurrentUser();

      // Guard: If Firebase user was signed out while this API call was in-flight
      // (e.g. during social signup duplicate detection), don't set authenticated state
      if (!auth.currentUser) {
        setUser(null);
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      setUser(userData);
      setIsAuthenticated(true);

      // Log current user info to console
      const displayName =
        `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
        userData.username ||
        "Unknown";
      console.table({
        Name: displayName,
        Email: userData.email || "N/A",
        Role: userData.role || "N/A",
        Username: userData.username || "N/A",
      });
    } catch (error) {
      // User not authenticated in backend - clear state
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Login user after Firebase authentication
   * @returns {Promise<Object>} User data from backend
   */
  // Login with global loading
  const login = async () => {
    setGlobalLoading(true);
    try {
      const userData = await authApi.login();
      const resolvedUser = userData.user || userData;
      setUser(resolvedUser);
      setIsAuthenticated(true);

      // Log login info to console
      const displayName =
        `${resolvedUser.firstName || ""} ${resolvedUser.lastName || ""}`.trim() ||
        resolvedUser.username ||
        "Unknown";
      console.table({
        Name: displayName,
        Email: resolvedUser.email || "N/A",
        Role: resolvedUser.role || "N/A",
        Username: resolvedUser.username || "N/A",
      });

      return userData;
    } finally {
      setGlobalLoading(false);
    }
  };

  /**
   * Logout user from Firebase and clear state
   *
   * PURE AUTH LOGIC - NO UI SIDE EFFECTS
   * - Executes signOut exactly once (ref guarded)
   * - Clears auth state and local storage
   * - Returns branch info for caller to handle redirect
   * - Throws error on failure for caller to handle notification
   *
   * SEQUENCE:
   * 1. Guard against duplicate execution
   * 2. Set loading state
   * 3. Capture user branch before clearing state
   * 4. Execute Firebase signOut
   * 5. Clear local state
   * 6. Return branch for caller to navigate
   *
   * @param {string} branchOverride - Optional branch override
   * @returns {Promise<{success: boolean, branch: string}>} Logout result with branch
   * @throws {Error} If logout fails
   */
  const logout = async (branchOverride) => {
    // GUARD: Prevent duplicate logout execution
    if (logoutExecutedRef.current) {
      return { success: false, branch: null };
    }
    logoutExecutedRef.current = true;
    setGlobalLoading(true);

    // Capture branch BEFORE clearing user state
    let branch = branchOverride;
    if (!branch && user && user.branch) {
      branch = user.branch;
    }
    const branchHome = branch ? `/${branch}` : "/";

    try {
      // Set logout intent for route guards
      const isAdminRole =
        user && (user.role === "admin" || user.role === "superAdmin");
      const intent = isAdminRole ? user.role : "user";
      logoutIntentRef.current = intent;
      setLogoutIntent(intent);

      // Execute Firebase signOut
      await authApi.logout();

      // Clear React state
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");

      // Return branch for caller to handle navigation
      // NOTE: Don't turn off globalLoading here - page will reload and clear it
      // This keeps the loading overlay visible during navigation for smooth UX
      return { success: true, branch: branchHome };
    } catch (error) {
      console.error("Logout error:", error);
      // Reset ref on error so user can retry
      logoutExecutedRef.current = false;
      logoutIntentRef.current = null;
      // Only turn off loading on error
      setGlobalLoading(false);
      throw error; // Let caller handle error notification
    }
  };

  /**
   * Refresh user data from backend
   */
  const refreshUser = async () => {
    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  };

  /**
   * Update user data in state (used after profile updates)
   * @param {Object} userData - Updated user data
   */
  const updateUser = (userData) => {
    setUser(userData);
    // Also update localStorage for persistence
    localStorage.setItem("user", JSON.stringify(userData));
  };

  /**
   * Check if current user is an admin or super admin
   * @returns {boolean} True if user has admin privileges
   */
  const isAdmin = () => {
    return user?.role === "admin" || user?.role === "superAdmin";
  };

  /**
   * Check if current user is a super admin
   * @returns {boolean} True if user is super admin
   */
  const isSuperAdmin = () => {
    return user?.role === "superAdmin";
  };

  /**
   * Get logout intent synchronously from ref
   * Used by route guards that need immediate access during React batching
   * @returns {string|null} The logout intent role or null
   */
  const getLogoutIntent = () => logoutIntentRef.current;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        globalLoading,
        setGlobalLoading,
        // Expose logoutIntent state for React re-render triggers
        logoutIntent,
        // Expose ref getter for synchronous access during batching
        getLogoutIntent,
        login,
        logout,
        refreshUser,
        updateUser,
        isAdmin,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to access authentication context
 * @returns {Object} Auth context value
 * @throws {Error} If used outside AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
