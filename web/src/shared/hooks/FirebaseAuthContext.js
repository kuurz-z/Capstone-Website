/**
 * =============================================================================
 * FIREBASE AUTH CONTEXT
 * =============================================================================
 *
 * Provides Firebase authentication state and always-fresh ID tokens.
 * This is the low-level Firebase auth hook - for app-level auth, use useAuth.
 *
 * IMPORTANT: This context does NOT auto-login users. Users must explicitly
 * login via the appropriate login page (admin or tenant).
 *
 * Usage:
 *   // Wrap your app with the provider
 *   <FirebaseAuthProvider>
 *     <App />
 *   </FirebaseAuthProvider>
 *
 *   // Use in components
 *   function MyComponent() {
 *     const { user, idToken, loading, getFreshIdToken, signOut } = useFirebaseAuth();
 *     ...
 *   }
 *
 * Context Values:
 * - user: Firebase User object (or null if not authenticated)
 * - idToken: Current ID token (refreshed automatically)
 * - loading: True while checking auth state
 * - getFreshIdToken: Function to force-refresh the token
 * - signOut: Function to sign out user
 * =============================================================================
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { auth, isFirebaseConfigured } from "../../firebase/config";
import { onIdTokenChanged, signOut as firebaseSignOut } from "firebase/auth";

// Default context value for TypeScript-like type safety
const FirebaseAuthContext = createContext({
  user: null,
  idToken: null,
  loading: true,
  getFreshIdToken: async () => null,
  signOut: async () => {},
});

/**
 * Firebase Auth Provider Component
 * Listens to Firebase auth state changes and provides context to children.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function FirebaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen for auth state and token changes
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setIdToken(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Get fresh token whenever auth state changes
        const token = await firebaseUser.getIdToken();
        setIdToken(token);
      } else {
        setIdToken(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  /**
   * Force refresh the ID token
   * Use this when you need to ensure the token is absolutely fresh,
   * such as before making a critical API call.
   *
   * @returns {Promise<string|null>} Fresh ID token or null if not authenticated
   */
  const getFreshIdToken = useCallback(async () => {
    if (user) {
      return user.getIdToken(true); // true = force refresh
    }
    return null;
  }, [user]);

  /**
   * Sign out the current user
   * Clears Firebase auth state and local storage
   */
  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      // Clear any cached auth data
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      setUser(null);
      setIdToken(null);
    } catch (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  }, []);

  return (
    <FirebaseAuthContext.Provider
      value={{ user, idToken, getFreshIdToken, loading, signOut }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
}

/**
 * Hook to access Firebase auth context
 * @returns {Object} Firebase auth context value
 */
export function useFirebaseAuth() {
  return useContext(FirebaseAuthContext);
}
