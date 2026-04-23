/**
 * =============================================================================
 * NOTIFICATION UTILITY
 * =============================================================================
 *
 * Provides toast notifications and confirmation dialogs for user feedback.
 *
 * Functions:
 * - showNotification(): Display toast message (success, error, warning, info)
 * - showConfirmation(): Display confirmation dialog with OK/Cancel buttons
 *
 * Styling:
 * - CSS must be imported: import '../styles/notification.css'
 * - Uses custom CSS classes for animations and styling
 */

import { publishNotification } from "./notificationBus";

/**
 * Show notification toast
 *
 * Displays a temporary message at the top of the screen.
 * Automatically dismisses after the specified duration.
 *
 * DUPLICATE PREVENTION:
 * - Removes existing notifications before showing new one
 * - Debounces rapid calls with same message to prevent StrictMode duplicates
 * - Uses unique ID to track notification state
 *
 * @param {string} message - Notification message to display
 * @param {string} type - Notification type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 *
 * @example
 * showNotification('Login successful!', 'success');
 * showNotification('Invalid credentials', 'error', 5000);
 */

let lastNotification = { message: "", timestamp: 0 };
const DEBOUNCE_MS = 200; // Prevent duplicate consecutive notifications

export const showNotification = (
  message,
  type = "info",
  duration = 3000,
  options = {},
) => {
  if (!message) {
    return null;
  }

  const now = Date.now();
  if (
    message === lastNotification.message &&
    now - lastNotification.timestamp < DEBOUNCE_MS
  ) {
    return null;
  }
  lastNotification = { message, timestamp: now };

  return publishNotification({
    message,
    type,
    duration,
    ...options,
  });
};

/**
 * Show confirmation dialog
 *
 * Displays a modal dialog asking the user to confirm or cancel an action.
 * Returns a Promise that resolves to true (confirmed) or false (cancelled).
 *
 * @param {string} message - Confirmation message to display
 * @param {string} confirmText - Confirm button text (default: 'Confirm')
 * @param {string} cancelText - Cancel button text (default: 'Cancel')
 *
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 *
 * @example
 * const confirmed = await showConfirmation('Are you sure?', 'Yes', 'No');
 * if (confirmed) {
 *   // User clicked Yes
 * }
 */
export const showConfirmation = (
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
) => {
  return new Promise((resolve) => {
    try {
      // Remove any existing confirmation dialogs
      const existing = document.getElementById("app-confirmation");
      if (existing) {
        existing.remove();
      }

      // Create confirmation dialog overlay
      const overlay = document.createElement("div");
      overlay.id = "app-confirmation";
      overlay.className = "confirmation-overlay";

      // Build confirmation dialog HTML
      overlay.innerHTML = `
        <div class="confirmation-dialog">
          <div class="confirmation-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 4C12.96 4 4 12.96 4 24C4 35.04 12.96 44 24 44C35.04 44 44 35.04 44 24C44 12.96 35.04 4 24 4ZM24 26C22.9 26 22 25.1 22 24V16C22 14.9 22.9 14 24 14C25.1 14 26 14.9 26 16V24C26 25.1 25.1 26 24 26ZM26 34H22V30H26V34Z" fill="#FF8C42"/>
            </svg>
          </div>
          <div class="confirmation-message">${message}</div>
          <div class="confirmation-buttons">
            <button class="confirmation-btn confirmation-btn-cancel" data-action="cancel">${cancelText}</button>
            <button class="confirmation-btn confirmation-btn-confirm" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `;

      // Add event listeners for user interaction
      overlay.addEventListener("click", (e) => {
        try {
          // Close on overlay click (outside dialog)
          if (e.target === overlay) {
            overlay.remove();
            resolve(false);
            return;
          }

          // Handle button clicks
          const action = e.target.dataset.action;
          if (action === "confirm") {
            overlay.remove();
            resolve(true);
          } else if (action === "cancel") {
            overlay.remove();
            resolve(false);
          }
        } catch (error) {
          console.error("Error handling confirmation action:", error);
          overlay.remove();
          resolve(false);
        }
      });

      // Add confirmation dialog to document
      document.body.appendChild(overlay);
    } catch (error) {
      // Fallback to browser confirm if custom dialog fails
      console.error("Failed to show confirmation dialog:", error);
      resolve(window.confirm(message));
    }
  });
};
