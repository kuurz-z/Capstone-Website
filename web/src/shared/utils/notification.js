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

// Track last notification to prevent duplicates from StrictMode double-renders
let lastNotification = { message: "", timestamp: 0 };
const DEBOUNCE_MS = 100; // Prevent same notification within 100ms

export const showNotification = (message, type = "info", duration = 3000) => {
  try {
    // DEBOUNCE: Prevent duplicate notifications from StrictMode or rapid calls
    const now = Date.now();
    if (
      message === lastNotification.message &&
      now - lastNotification.timestamp < DEBOUNCE_MS
    ) {
      return;
    }
    lastNotification = { message, timestamp: now };

    // Remove any existing notifications to avoid duplicates
    const existing = document.getElementById("app-notification");
    if (existing) {
      existing.remove();
    }

    // Create notification element
    const notification = document.createElement("div");
    notification.id = "app-notification";
    notification.className = `notification notification-${type}`;

    // Icon SVGs based on notification type
    const icons = {
      success:
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z" fill="currentColor"/></svg>',
      error:
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V13H11V15ZM11 11H9V5H11V11Z" fill="currentColor"/></svg>',
      warning:
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M1 17H19L10 2L1 17ZM11 14H9V12H11V14ZM11 10H9V6H11V10Z" fill="currentColor"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM11 15H9V9H11V15ZM11 7H9V5H11V7Z" fill="currentColor"/></svg>',
    };

    // Build notification HTML
    notification.innerHTML = `
      <div class="notification-icon">${icons[type] || icons.info}</div>
      <div class="notification-message">${message}</div>
      <button class="notification-close" onclick="this.parentElement.remove()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
        </svg>
      </button>
    `;

    // Add notification to document
    document.body.appendChild(notification);

    // Auto remove after specified duration with fade-out animation
    setTimeout(() => {
      try {
        if (notification.parentElement) {
          notification.classList.add("notification-fade-out");
          setTimeout(() => {
            if (notification.parentElement) {
              notification.remove();
            }
          }, 300); // Wait for fade-out animation
        }
      } catch (error) {
        console.error("❌ Error removing notification:", error);
      }
    }, duration);
  } catch (error) {
    // Fallback to console if notification fails
    console.error("❌ Failed to show notification:", error);
  }
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
              <path d="M24 4C12.96 4 4 12.96 4 24C4 35.04 12.96 44 24 44C35.04 44 44 35.04 44 24C44 12.96 35.04 4 24 4ZM24 26C22.9 26 22 25.1 22 24V16C22 14.9 22.9 14 24 14C25.1 14 26 14.9 26 16V24C26 25.1 25.1 26 24 26ZM26 34H22V30H26V34Z" fill="#D4982B"/>
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
          console.error("❌ Error handling confirmation action:", error);
          overlay.remove();
          resolve(false);
        }
      });

      // Add confirmation dialog to document
      document.body.appendChild(overlay);
    } catch (error) {
      // Fallback to browser confirm if custom dialog fails
      console.error("❌ Failed to show confirmation dialog:", error);
      resolve(window.confirm(message));
    }
  });
};
