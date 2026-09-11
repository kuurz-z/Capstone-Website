/**
 * =============================================================================
 * USE AUTH HOOK
 * =============================================================================
 *
 * Custom hook for managing authentication state and operations.
 * Works with both Firebase Auth and the backend user database.
 *
 * SEPARATION OF CONCERNS:
 * - Shared login: /signin -> used by applicants, tenants, branch admins, and owners
 * - Admin area: /admin/* -> requires branch_admin or owner role
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
  useCallback,
  createContext,
  useContext,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/authApi";
import {
  getAuthErrorCode,
  isOtpDeliveryAccepted,
  shouldDeferProfileRequest,
} from "../api/authFlowState";
import { reservationApi } from "../api/reservationApi";
import {
  clearApplicationSession,
  hasApplicationSession,
  getOtpPending,
  isLoginInProgress,
  setOtpPending,
} from "../api/authSession";
import { auth } from "../../firebase/config";
import { useFirebaseAuth } from "./FirebaseAuthContext";
import { USER_ROLES } from "../utils/constants";
import { queryKeys } from "../lib/queryKeys";
import { prewarmIdleWorkspaceRoutes } from "../lib/routePrefetch";

const AuthContext =
  import.meta.env.DEV
    ? (globalThis.__CAPSTONE_AUTH_CONTEXT__ ??=
        createContext(null))
    : createContext(null);

const TENANT_WARM_ROUTES = ["/applicant/profile", "/applicant/reservation"];

const attachManagedFirebaseIdentity = (userData) => {
  if (!userData || !auth.currentUser?.uid) return userData;
  if (userData.firebaseUid === auth.currentUser.uid) return userData;
  return { ...userData, firebaseUid: auth.currentUser.uid };
};

const isSameUser = (userA, userB) => {
  if (userA === userB) return true;
  if (!userA || !userB) return false;
  return JSON.stringify(userA) === JSON.stringify(userB);
};

const warmTenantRouteData = (queryClient, userData) => {
  const isTenantPortalUser =
    userData?.role === USER_ROLES.APPLICANT || userData?.role === USER_ROLES.TENANT;
  const pathname = window.location.pathname;

  if (!isTenantPortalUser || !TENANT_WARM_ROUTES.includes(pathname)) {
    return;
  }

  queryClient.prefetchQuery({
    queryKey: queryKeys.reservations.all({}),
    queryFn: () => reservationApi.getAll({}),
    staleTime: 30 * 1000,
  });

  if (pathname === "/applicant/profile") {
    import("../../features/tenant/pages/ProfilePage").catch(() => {});
  } else if (pathname === "/applicant/reservation") {
    import("../../features/tenant/pages/ReservationFlowPage").catch(() => {});
  }
};

/**
 * Pre-warm admin dashboard data immediately after auth resolves.
 * Fires analyticsApi.getDashboard in the background while the lazy
 * Dashboard.jsx chunk is still downloading, so by the time the page
 * mounts the data is already in the React Query cache.
 * This overlaps Phase B (chunk download) with Phase C (data fetch),
 * effectively eliminating the dashboard data spinner on fresh open.
 */
const warmAdminRouteData = (queryClient, userData) => {
  const isAdminUser =
    userData?.role === USER_ROLES.BRANCH_ADMIN ||
    userData?.role === USER_ROLES.OWNER ||
    userData?.role === "super_admin";
  const pathname = window.location.pathname;

  if (!isAdminUser || !pathname.startsWith("/admin")) return Promise.resolve();

  const isOwner =
    userData?.role === "super_admin" || userData?.role === USER_ROLES.OWNER;
  const params = { range: "30d", ...(isOwner ? { branch: "all" } : {}) };

  // Pre-warm the Dashboard JS chunk simultaneously.
  const chunkPromise = import("../../features/admin/pages/Dashboard").catch(
    () => {},
  );

  // Pre-fetch dashboard analytics into the React Query cache.
  // Uses the exact same queryKey and staleTime as useDashboardData so the
  // cache hit is guaranteed when Dashboard.jsx calls useQuery.
  const queryPromise = import("../api/analyticsApi")
    .then(({ analyticsApi }) => {
      return queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.admin(params),
        queryFn: () => analyticsApi.getDashboard(params),
        staleTime: 30 * 1000,
      });
    })
    .catch(() => {});

  return Promise.all([chunkPromise, queryPromise]);
};

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
  const profileRequestRef = useRef(null);
  const sessionInitializationRef = useRef(null);
  const { user: firebaseUser, loading: firebaseLoading, getFreshIdToken } =
    useFirebaseAuth();
  const queryClient = useQueryClient();

  const initializeBackendSession = useCallback(async () => {
    if (sessionInitializationRef.current) return sessionInitializationRef.current;
    const request = authApi.login();
    sessionInitializationRef.current = request;
    try {
      return await request;
    } finally {
      if (sessionInitializationRef.current === request) {
        sessionInitializationRef.current = null;
      }
    }
  }, []);

  const fetchProfileOnce = useCallback(async () => {
    if (profileRequestRef.current) return profileRequestRef.current;
    const request = authApi.getCurrentUser();
    profileRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (profileRequestRef.current === request) profileRequestRef.current = null;
    }
  }, []);

  /**
   * Check if user is authenticated by fetching profile from backend
   * @private
   */
  const checkAuth = useCallback(async () => {
    // Guard: Skip auth check during email verification resend flow.
    // The resend button temporarily signs in to Firebase just to call
    // sendEmailVerification(). We must NOT treat that transient sign-in
    // as a real login session or the user gets navigated in unexpectedly.
    if (
      sessionStorage.getItem("resendInProgress") === "1" ||
      sessionStorage.getItem("socialAuthInProgress") === "1" ||
      isLoginInProgress() ||
      getOtpPending()
    ) {
      setLoading(false);
      return;
    }

    try {
      if (!hasApplicationSession()) {
        const loginResult = await initializeBackendSession();
        if (isOtpDeliveryAccepted(loginResult)) {
          setOtpPending();
          setUser(null);
          setIsAuthenticated(false);
          if (window.location.pathname !== "/verify-otp") {
            window.location.replace("/verify-otp");
          }
          return;
        }
      }
      const userData = await fetchProfileOnce();

      // Guard: If Firebase user was signed out while this API call was in-flight
      // (e.g. during social signup duplicate detection), don't set authenticated state
      if (!auth.currentUser) {
        setUser(null);
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      // Guard: double-check the resend and social auth flags in case they were set while the
      // API call was in-flight (the transient sign-in can be very fast)
      if (
        sessionStorage.getItem("resendInProgress") === "1" ||
        sessionStorage.getItem("socialAuthInProgress") === "1" ||
        isLoginInProgress() ||
        getOtpPending()
      ) {
        setLoading(false);
        return;
      }

      const resolvedUser = attachManagedFirebaseIdentity(userData);
      setUser(resolvedUser);
      setIsAuthenticated(true);
      queryClient.setQueryData(["users", "currentUser"], resolvedUser);
      warmTenantRouteData(queryClient, resolvedUser);
      warmAdminRouteData(queryClient, resolvedUser);
      prewarmIdleWorkspaceRoutes(queryClient, resolvedUser);

    } catch (error) {
      // User not authenticated in backend - clear state
      if (
        getAuthErrorCode(error) === "OTP_SESSION_REQUIRED" ||
        getAuthErrorCode(error) === "OTP_SESSION_INVALID"
      ) {
        clearApplicationSession();
        try {
          const loginResult = await initializeBackendSession();
          if (isOtpDeliveryAccepted(loginResult)) {
            setOtpPending();
            if (window.location.pathname !== "/verify-otp") {
              window.location.replace("/verify-otp");
            }
          }
        } catch (_) {
          // Preserve the original authentication failure state.
        }
      }
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [fetchProfileOnce, initializeBackendSession, queryClient]);

  const refreshUser = useCallback(async () => {
    if (shouldDeferProfileRequest({
      firebaseUser: auth.currentUser,
      loginInProgress: isLoginInProgress(),
      otpPending: getOtpPending(),
    })) return null;

    try {
      const userData = await fetchProfileOnce();
      const resolvedUser = attachManagedFirebaseIdentity(userData);
      queryClient.setQueryData(["users", "currentUser"], resolvedUser);
      setUser((prev) => {
        if (
          prev?.role &&
          prev.role !== userData.role &&
          typeof getFreshIdToken === "function"
        ) {
          getFreshIdToken().catch(() => {});
        }
        return resolvedUser;
      });
      setIsAuthenticated(true);
      return resolvedUser;
    } catch (error) {
      const statusCode = error.response?.status || error.status;
      const errorCode = getAuthErrorCode(error);

      // OTP_SESSION_REQUIRED/INVALID are explicit, authoritative signals from
      // the backend that the session is gone - clear immediately.
      if (errorCode === "OTP_SESSION_REQUIRED" || errorCode === "OTP_SESSION_INVALID") {
        clearApplicationSession();
        setUser(null);
        setIsAuthenticated(false);
        return null;
      }

      // A bare 401 is ambiguous - it can mean the session is genuinely gone,
      // or it can be a transient backend hiccup (e.g. a cold start) returning
      // 401 instead of a 5xx. Retry once before treating it as a real logout,
      // so a passing blip doesn't silently sign the user out mid-session.
      // 500ms is sufficient to cover transient hiccups without freezing the UI.
      if (statusCode === 401) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const userData = await fetchProfileOnce();
          const resolvedUser = attachManagedFirebaseIdentity(userData);
          queryClient.setQueryData(["users", "currentUser"], resolvedUser);
          setUser(resolvedUser);
          setIsAuthenticated(true);
          return resolvedUser;
        } catch (retryError) {
          const retryStatus = retryError.response?.status || retryError.status;
          const retryCode = getAuthErrorCode(retryError);
          if (
            retryStatus === 401 ||
            retryCode === "OTP_SESSION_REQUIRED" ||
            retryCode === "OTP_SESSION_INVALID"
          ) {
            clearApplicationSession();
            setUser(null);
            setIsAuthenticated(false);
          } else {
            console.warn("User refresh failed.");
          }
          return null;
        }
      }

      console.warn("User refresh failed.");
      return null;
    }
  }, [fetchProfileOnce, getFreshIdToken, queryClient]);

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
      clearApplicationSession();
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
  }, [firebaseUser, firebaseLoading, checkAuth]);



  /**
   * Login user after Firebase authentication
   * @returns {Promise<Object>} User data from backend
   */
  // Login with global loading
  const login = async () => {
    setGlobalLoading(true);
    try {
      const userData = await authApi.login();
      if (isOtpDeliveryAccepted(userData)) {
        setUser(null);
        setIsAuthenticated(false);
        return userData;
      }
      if (userData?.requiresOtp) {
        const error = new Error("OTP delivery was not confirmed.");
        error.code = "OTP_DELIVERY_UNCONFIRMED";
        throw error;
      }
      const resolvedUser = attachManagedFirebaseIdentity(userData.user || userData);
      setUser(resolvedUser);
      setIsAuthenticated(true);
      queryClient.setQueryData(["users", "currentUser"], resolvedUser);
      warmTenantRouteData(queryClient, resolvedUser);
      warmAdminRouteData(queryClient, resolvedUser);
      prewarmIdleWorkspaceRoutes(queryClient, resolvedUser);

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
        user && (user.role === "branch_admin" || user.role === "owner");
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

      // Purge cached assistant conversations from sessionStorage
      try {
        sessionStorage.removeItem("lilycrest_tenant_assistant_msgs");
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("lilycrest_tenant_assistant_msgs")) {
            sessionStorage.removeItem(key);
          }
        }
      } catch {
        // Ignore storage cleanup failures
      }

      // Return branch for caller to handle navigation
      // NOTE: Don't turn off globalLoading here - the route transition clears it.
      // This keeps the loading overlay visible during navigation for smooth UX.
      return { success: true, branch: branchHome };
    } catch (error) {
      console.error("Logout failed.");
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
  useEffect(() => {
    if (firebaseLoading || !firebaseUser) return undefined;

    const syncAuthProfile = () => {
      if (isLoginInProgress() || getOtpPending()) return;
      refreshUser().catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncAuthProfile();
      }
    };

    const intervalId = window.setInterval(syncAuthProfile, 5 * 60 * 1000);
    window.addEventListener("focus", syncAuthProfile);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncAuthProfile);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [firebaseLoading, firebaseUser, refreshUser]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const key = event?.query?.queryKey;
      if (!Array.isArray(key) || key[0] !== "users" || key[1] !== "currentUser") {
        return;
      }

      const nextUser = attachManagedFirebaseIdentity(event.query.state.data);
      if (!nextUser || !auth.currentUser) return;

      setUser((prev) => {
        if (isSameUser(prev, nextUser)) {
          return prev;
        }
        if (
          prev?.role &&
          prev.role !== nextUser.role &&
          typeof getFreshIdToken === "function"
        ) {
          getFreshIdToken().catch(() => {});
        }
        return nextUser;
      });
      setIsAuthenticated((prev) => (prev ? prev : true));
    });

    return unsubscribe;
  }, [getFreshIdToken, queryClient]);

  /**
   * Update user data in state (used after profile updates)
   * @param {Object} userData - Updated user data
   */
  const updateUser = (userData) => {
    const resolvedUser = attachManagedFirebaseIdentity(userData);
    setUser((prev) => (isSameUser(prev, resolvedUser) ? prev : resolvedUser));
    setIsAuthenticated(Boolean(userData));
  };

  /**
   * Check if current user is a branch admin or owner
   * @returns {boolean} True if user has admin privileges
   */
  const isAdmin = () => {
    return (
      user?.role === USER_ROLES.BRANCH_ADMIN || user?.role === USER_ROLES.OWNER
    );
  };

  /**
   * Check if current user is an owner
   * @returns {boolean} True if user is an owner
   */
  const isOwner = () => {
    return user?.role === USER_ROLES.OWNER;
  };

  /**
   * Check if current user belongs to the applicant/tenant portal
   * @returns {boolean} True if user is not an admin role
   */
  const isPortalUser = () => {
    return (
      user?.role === USER_ROLES.APPLICANT || user?.role === USER_ROLES.TENANT
    );
  };

  /**
   * Get the default landing route for the current authenticated user
   * @returns {string} Canonical post-auth destination
   */
  const getDefaultRoute = () => {
    if (isOwner() || isAdmin()) {
      return "/admin/dashboard";
    }

    if (user?.role === USER_ROLES.TENANT) {
      return "/applicant/profile";
    }

    return "/applicant/check-availability";
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
        isOwner,
        isPortalUser,
        getDefaultRoute,
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

/**
 * Optional auth hook for public routes that can render without AuthProvider.
 * @returns {Object|null} Auth context value or null if provider is missing.
 */
export const useOptionalAuth = () => useContext(AuthContext);
