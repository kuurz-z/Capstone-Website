/**
 * ============================================================================
 * MOBILE APP BRIDGE — Firebase adapter
 * ============================================================================
 *
 * Re-exports Firebase Admin functions using the SAME initialized instance
 * from the main server.  The mobile controllers import from
 * '../config/firebase' which resolves to this file.
 * ============================================================================
 */

import admin from "firebase-admin";

// Firebase is already initialized by the main server (config/firebase.js).
// We just re-export the same admin instance and helper functions.

export function initializeFirebase() {
  // No-op — already initialized by main server.
  return admin.apps[0] || null;
}

export async function verifyFirebaseIdToken(idToken) {
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
}

export async function verifyTenantInFirebase(email) {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    return {
      firebase_id: userRecord.uid,
      email: userRecord.email,
      name: userRecord.displayName || null,
      phone: userRecord.phoneNumber || null,
      picture: userRecord.photoURL || null,
    };
  } catch (_) {
    return null;
  }
}

export function getFirebaseApp() {
  return admin.apps[0] || null;
}

export { admin };
export default admin;
