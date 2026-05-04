/**
 * =============================================================================
 * FIREBASE ADMIN SDK CONFIGURATION
 * =============================================================================
 *
 * Firebase Admin SDK initialization for server-side authentication and user management.
 *
 * Purpose:
 * - Verify Firebase ID tokens sent from the client
 * - Manage user custom claims (roles: branch_admin, owner)
 * - Access Firebase Authentication user data
 *
 * Security Notes:
 * - Private key and credentials are stored in environment variables
 * - Never commit service account credentials to version control
 * - Firebase is the single source of truth for authentication
 *
 * Environment Variables Required:
 * - FIREBASE_PROJECT_ID: Your Firebase project ID
 * - FIREBASE_PRIVATE_KEY_ID: Private key ID from service account
 * - FIREBASE_PRIVATE_KEY: Private key (with \n replaced by \\n)
 * - FIREBASE_CLIENT_EMAIL: Service account email
 * - FIREBASE_CLIENT_ID: Client ID
 * - FIREBASE_CLIENT_CERT_URL: Certificate URL
 */

import admin from "firebase-admin";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Service Account Configuration
 *
 * This object contains the credentials needed to authenticate
 * the Firebase Admin SDK with your Firebase project.
 *
 * The private key needs special handling:
 * - In .env file, newlines are stored as "\\n"
 * - We replace them with actual newline characters "\n"
 */
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,

  // Replace escaped newlines with actual newlines for the private key
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),

  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,

  // Standard Firebase Auth URLs
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",

  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: "googleapis.com",
};

const requiredEnvVars = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_PRIVATE_KEY_ID",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_CLIENT_ID",
  "FIREBASE_CLIENT_CERT_URL",
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

const canInitialize = missingEnvVars.length === 0;

/**
 * Initialize Firebase Admin SDK
 *
 * This must be called before using any Firebase Admin features.
 * It authenticates the server with Firebase using the service account.
 *
 * IMPORTANT: Check if already initialized to prevent multiple initialization
 * errors when nodemon restarts the server.
 */
try {
  if (!canInitialize) {
    console.error(
      "❌ Firebase Admin SDK initialization failed: Missing required env vars",
    );
    console.error("⚠️ Missing:", missingEnvVars.join(", "));
  } else if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully");
  } else {
    console.log("ℹ️ Firebase Admin SDK already initialized");
  }
} catch (error) {
  console.error("❌ Firebase Admin SDK initialization failed:", error.message);
  console.error("⚠️ Authentication features will not work!");

  // Don't exit the process - allow server to start for non-auth endpoints
  // This is useful during development or partial outages
}

/**
 * Export Firebase Auth module (lazy)
 *
 * This avoids throwing when Firebase failed to initialize.
 */
export const getAuth = () => {
  if (!admin.apps.length) {
    return null;
  }

  return admin.auth();
};

/**
 * Export Firebase Admin instance
 *
 * Use this for accessing other Firebase services if needed in the future
 * (e.g., Firestore, Cloud Storage, Cloud Messaging)
 */
export default admin;
