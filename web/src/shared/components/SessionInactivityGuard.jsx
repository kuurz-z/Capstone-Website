import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { useSessionInactivity } from "../hooks/useSessionInactivity.js";
import SessionInactivityModal from "./SessionInactivityModal.jsx";
import { showNotification } from "../utils/notification.js";
import { STORAGE_KEY_LAST_ACTIVITY } from "../utils/sessionInactivityCore.js";

/**
 * SessionInactivityGuard
 *
 * Sits inside AuthProvider and wraps the session inactivity lifecycle.
 * When the user is authenticated, it actively monitors inactivity.
 * When the 15-minute timeout fires:
 * - Revokes the auth session and clears tokens in the background.
 * - Displays the "Session Expired" dialog right on screen.
 * - Allows user to click "Sign In Again" (redirects to /signin) or "Go to Homepage" (redirects to /).
 */
export default function SessionInactivityGuard() {
  const { isAuthenticated, logout, setGlobalLoading } = useAuth();
  const navigate = useNavigate();
  const isLoggingOutRef = useRef(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  const handleTimeout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    // Show the Session Expired dialog at 15 minutes
    setShowExpiredModal(true);

    try {
      await logout();
    } catch {
      // Safe fallback if network failure
    } finally {
      if (typeof setGlobalLoading === "function") {
        setGlobalLoading(false);
      }
      try {
        localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
      } catch {
        // Ignore storage access errors
      }
      isLoggingOutRef.current = false;
    }
  }, [logout, setGlobalLoading]);

  const handleSignInAgain = useCallback(() => {
    setShowExpiredModal(false);
    navigate("/signin", { replace: true });
  }, [navigate]);

  const handleGoHome = useCallback(() => {
    setShowExpiredModal(false);
    navigate("/", { replace: true });
    showNotification(
      "You have been signed out due to inactivity.",
      "info",
      5000
    );
  }, [navigate]);

  useSessionInactivity({
    isActive: Boolean(isAuthenticated),
    onTimeout: handleTimeout,
  });

  if (!showExpiredModal) return null;

  return (
    <SessionInactivityModal
      isOpen={showExpiredModal}
      onSignInAgain={handleSignInAgain}
      onGoHome={handleGoHome}
    />
  );
}
