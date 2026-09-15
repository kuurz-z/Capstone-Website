import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanNotificationMessage,
  cleanRedundantToastPrefix,
  formatNotificationTitle,
  sanitizeToastMessage,
  summarizeAnnouncementMessage,
} from "./notification.js";

test("summarizeAnnouncementMessage returns clean message", () => {
  assert.equal(
    summarizeAnnouncementMessage(""),
    "A new announcement is available.",
  );

  assert.equal(
    summarizeAnnouncementMessage(null),
    "A new announcement is available.",
  );

  assert.equal(
    summarizeAnnouncementMessage("Scheduled water outage at 2 PM"),
    "Scheduled water outage at 2 PM",
  );
});

test("formatNotificationTitle transforms past verbs into clean nouns", () => {
  assert.equal(formatNotificationTitle("Reservation Cancelled"), "Reservation Cancellation");
  assert.equal(formatNotificationTitle("Payment Confirmed"), "Payment Confirmation");
});

test("cleanNotificationMessage cleans unwanted placeholders and legacy announcement suffixes", () => {
  assert.equal(
    cleanNotificationMessage("Your reservation N/A has been cancelled."),
    "Your reservation has been cancelled.",
  );
  assert.equal(
    cleanNotificationMessage("Scheduled water outage at 2 PM • View in Announcements"),
    "Scheduled water outage at 2 PM",
  );
});

test("cleanRedundantToastPrefix strips redundant Application Approved prefix into punchy copy", () => {
  assert.equal(
    cleanRedundantToastPrefix(
      "Application Approved for Payment: Your application for GP – Room 201 has been approved. You can now proceed to pay the reservation fee to secure your room.",
    ),
    "Application approved for GP – Room 201. You can now proceed to payment to secure your room.",
  );

  assert.equal(
    cleanRedundantToastPrefix(
      "Reservation Confirmed: Your reservation for Room 201 has been confirmed.",
    ),
    "Your reservation for Room 201 has been confirmed.",
  );

  assert.equal(
    cleanRedundantToastPrefix(
      "Payment Confirmed: Your payment of ₱5,000 for August 2026 has been received and confirmed.",
    ),
    "Your payment of ₱5,000 for August 2026 has been received and confirmed.",
  );
});

test("sanitizeToastMessage converts robotic deletion guards into friendly and professional copy", () => {
  const movedInResult = sanitizeToastMessage(
    "This tenant has already moved in. Please process a move-out workflow first.",
    "warning",
  );
  assert.equal(
    movedInResult,
    "This tenant has already moved in. To end their stay or remove this record, please process a move-out from the Tenants workspace.",
  );

  const reservedResult = sanitizeToastMessage(
    "Confirmed reserved bookings cannot be deleted directly. Please process a cancellation or move-in/move-out workflow first.",
    "error",
  );
  assert.equal(
    reservedResult,
    "This reservation is confirmed. Please complete the move-in process or cancel the reservation before deleting.",
  );
});

test("sanitizeToastMessage replaces Failed to with Unable to and enforces Lilycrest terminology", () => {
  assert.equal(
    sanitizeToastMessage("Failed to delete reservation", "error"),
    "Unable to delete reservation",
  );
  assert.equal(
    sanitizeToastMessage("Failed to update resident profile", "error"),
    "Unable to update tenant profile",
  );
  assert.equal(
    sanitizeToastMessage("Failed to update rental fee", "error"),
    "Unable to update rent",
  );
  assert.equal(
    sanitizeToastMessage("Super Admin access granted", "info"),
    "Owner access granted",
  );
  assert.equal(
    sanitizeToastMessage("Failed to update room occupancy", "error"),
    "Unable to update room stay",
  );
});

test("sanitizeToastMessage converts utility continuity errors to friendly actionable feedback", () => {
  assert.equal(
    sanitizeToastMessage("The utility period does not contain the requested occupancy time. Review period continuity first.", "error"),
    "Unable to process move-out. The selected move-out time cannot be earlier than when the tenant moved into the room.",
  );
  assert.equal(
    sanitizeToastMessage("This room has previous billing history but no valid active period. Review or initialize continuity before continuing.", "error"),
    "Unable to complete this action. This room requires an active electricity billing period to be opened first.",
  );
  assert.equal(
    sanitizeToastMessage("Multiple active electricity periods were found. Resolve the billing conflict first.", "error"),
    "Unable to complete this action due to multiple active electricity billing periods. Please resolve the open billing periods first.",
  );
  assert.equal(
    sanitizeToastMessage("No active electricity period exists for this room.", "error"),
    "No active electricity billing period exists for this room. Please open a billing period first.",
  );
});

