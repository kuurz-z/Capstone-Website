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
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyBsMEkwGFKfxp_0pItM_g5FzzG8g9Sra1o",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "dormitorymanagement-caps-572cf.firebaseapp.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    "dormitorymanagement-caps-572cf",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "dormitorymanagement-caps-572cf.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "784085654130",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:784085654130:web:2fc1e42f23f78d665300eb",
};

/**
 * Initialize Firebase App
 *
 * This creates the Firebase app instance that all other
 * Firebase services will use.
 */
let app;
try {
  app = initializeApp(firebaseConfig);
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
export const auth = getAuth(app);

/**
 * Export Firebase app instance
 *
 * Use this if you need to access other Firebase services
 * (e.g., Firestore, Storage, Analytics)
 */
export default app;
