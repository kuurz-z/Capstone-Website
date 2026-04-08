/**
 * =============================================================================
 * FIREBASE CONFIGURATION (Frontend)
 * =============================================================================
 *
 * Firebase SDK initialization for client-side authentication.
 *
 * Features:
 * - Email/password authentication
 * - Social authentication (Google, Facebook)
 * - Email verification
 * - Session management
 *
 * Environment Variables:
 * All Firebase credentials should be stored in .env file:
 * - REACT_APP_FIREBASE_API_KEY
 * - REACT_APP_FIREBASE_AUTH_DOMAIN
 * - REACT_APP_FIREBASE_PROJECT_ID
 * - REACT_APP_FIREBASE_STORAGE_BUCKET
 * - REACT_APP_FIREBASE_MESSAGING_SENDER_ID
 * - REACT_APP_FIREBASE_APP_ID
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

/**
 * Firebase Configuration
 *
 * This configuration connects your frontend app to your Firebase project.
 * For production, all values should come from environment variables.
 *
 * Security Note:
 * - API keys in client-side code are normal and expected
 * - Firebase security is enforced through Firestore/Auth rules
 * - Never put service account credentials in client code
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

const createFallbackAuth = () => ({
  currentUser: null,
  signOut: async () => {},
});

/**
 * Initialize Firebase App
 *
 * This creates the Firebase app instance that all other
 * Firebase services will use.
 */
let app;
let auth;
try {
  if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } else {
    console.warn(
      "Firebase is not configured. Public pages will still render, but auth features are disabled.",
    );
    auth = createFallbackAuth();
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  throw error;
}

/**
 * Initialize Firebase Authentication
 *
 * This provides access to all authentication methods:
 * - createUserWithEmailAndPassword()
 * - signInWithEmailAndPassword()
 * - signInWithPopup()
 * - sendEmailVerification()
 * - sendPasswordResetEmail()
 * - etc.
 *
 * Usage:
 *   import { auth } from './firebase/config';
 *   await signInWithEmailAndPassword(auth, email, password);
 */
export { auth, isFirebaseConfigured };

/**
 * Export Firebase app instance
 *
 * Use this if you need to access other Firebase services
 * (e.g., Firestore, Storage, Analytics)
 */
export default app;
