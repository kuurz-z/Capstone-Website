/**
 * mobilePushService.js
 *
 * Sends mobile push notifications (Expo + FCM) from the Capstone server.
 * Reads push tokens from the same `users` MongoDB collection the mobile bridge
 * writes to, so no separate token store is needed.
 *
 * Designed to be called fire-and-forget (non-blocking) from server utilities
 * like announcementDispatch. All failures are caught and logged; they never
 * surface to callers.
 */

import mongoose from "mongoose";
import admin from "firebase-admin";
import axios from "axios";
import logger from "../middleware/logger.js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;
const FCM_CHUNK_SIZE = 500;
const DEFAULT_CHANNEL_ID = "default";

function isExpoPushToken(token) {
  return (
    typeof token === "string" &&
    /^(Expo|Exponent)PushToken\[[A-Za-z0-9-_=]+\]$/.test(token.trim())
  );
}

function clipText(value, max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function extractPushTokens(user) {
  const seen = new Set();
  const entries = [];

  const add = (token, provider = null) => {
    const t = String(token || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    entries.push({ token: t, provider: String(provider || "").trim() || null });
  };

  if (Array.isArray(user.push_tokens)) {
    for (const entry of user.push_tokens) {
      if (typeof entry === "string") {
        add(entry);
      } else if (entry && typeof entry === "object") {
        add(entry.token || entry.push_token || entry.value, entry.provider);
      }
    }
  }

  if (user.push_token) {
    add(user.push_token, user.push_provider);
  }

  return entries;
}

function stringifyData(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  if (typeof value === "object" && value?._id) {
    return toObjectId(value._id);
  }
  return null;
}

async function removeInvalidTokens(tokens = []) {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (!uniqueTokens.length) return;

  const db = mongoose.connection.db;
  if (!db) return;

  try {
    const now = new Date();
    await Promise.all([
      db.collection("users").updateMany(
        { push_token: { $in: uniqueTokens } },
        {
          $set: {
            push_token: null,
            push_provider: null,
            push_platform: null,
            push_token_updated: now,
          },
        },
      ),
      db.collection("users").updateMany(
        { "push_tokens.token": { $in: uniqueTokens } },
        {
          $pull: { push_tokens: { token: { $in: uniqueTokens } } },
          $set: { push_token_updated: now },
        },
      ),
    ]);
  } catch (err) {
    logger.warn({ err }, "[MobilePush] Failed to clean invalid push tokens");
  }
}

async function sendToExpo(entries, { title, body, data }) {
  if (!entries.length) return 0;
  let successCount = 0;
  const invalidTokens = [];

  await Promise.all(
    chunkArray(entries, EXPO_CHUNK_SIZE).map(async (batch) => {
      try {
        const messages = batch.map((e) => ({
          to: e.token,
          title,
          body,
          data,
          sound: "default",
          channelId: DEFAULT_CHANNEL_ID,
          priority: "high",
        }));

        const resp = await axios.post(EXPO_PUSH_ENDPOINT, messages, {
          headers: { "Content-Type": "application/json" },
          timeout: 12000,
        });

        const tickets = Array.isArray(resp.data?.data) ? resp.data.data : [];
        tickets.forEach((ticket, index) => {
          if (ticket?.status === "ok") {
            successCount += 1;
            return;
          }

          if (ticket?.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(batch[index]?.token);
          }

          logger.warn(
            {
              details: ticket?.details || null,
              message: ticket?.message || "",
            },
            "[MobilePush] Expo ticket returned an error",
          );
        });
      } catch (err) {
        logger.warn({ err }, "[MobilePush] Expo batch failed");
      }
    }),
  );

  if (invalidTokens.length) {
    await removeInvalidTokens(invalidTokens);
  }

  return successCount;
}

async function sendToFCM(tokens, { title, body, data }) {
  if (!tokens.length || !admin.apps.length) return 0;
  let successCount = 0;
  const invalidTokens = [];

  await Promise.all(
    chunkArray(tokens, FCM_CHUNK_SIZE).map(async (batch) => {
      try {
        const resp = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: stringifyData(data),
          android: {
            priority: "high",
            notification: { channelId: DEFAULT_CHANNEL_ID, sound: "default" },
          },
        });
        successCount += resp.successCount;
        resp.responses.forEach((result, index) => {
          const code = result?.error?.code || result?.error?.errorInfo?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(batch[index]);
          }
        });
      } catch (err) {
        logger.warn({ err }, "[MobilePush] FCM batch failed");
      }
    }),
  );

  if (invalidTokens.length) {
    await removeInvalidTokens(invalidTokens);
  }

  return successCount;
}

/**
 * Send a mobile push notification to a specific set of MongoDB user _ids.
 * Looks up their push tokens in the `users` collection and delivers via Expo
 * and/or FCM depending on each device's registered token type.
 *
 * @param {Array<ObjectId|string>} recipientIds - MongoDB _id values of target users
 * @param {{ title: string, body: string, data?: Record<string,string> }} payload
 * @returns {Promise<number>} number of successful deliveries
 */
export async function sendMobilePushToRecipients(recipientIds, { title, body, data = {} }) {
  if (!recipientIds?.length) return 0;

  const db = mongoose.connection.db;
  if (!db) {
    logger.warn("[MobilePush] MongoDB not ready — push skipped");
    return 0;
  }

  try {
    const normalizedRecipientIds = recipientIds
      .map((recipientId) => toObjectId(recipientId))
      .filter(Boolean);

    if (!normalizedRecipientIds.length) {
      logger.warn("[MobilePush] No valid recipient ids resolved");
      return 0;
    }

    const users = await db
      .collection("users")
      .find(
        {
          _id: { $in: normalizedRecipientIds },
          $or: [
            { push_token: { $exists: true, $nin: [null, ""] } },
            { "push_tokens.0": { $exists: true } },
          ],
        },
        { projection: { push_token: 1, push_provider: 1, push_tokens: 1 } },
      )
      .toArray();

    const allEntries = users.flatMap(extractPushTokens);
    if (!allEntries.length) return 0;

    const expoEntries = allEntries.filter((e) => isExpoPushToken(e.token));
    const fcmTokens = allEntries
      .filter((e) => !isExpoPushToken(e.token) && e.provider !== "apns")
      .map((e) => e.token);

    const stringData = stringifyData(data);
    const [expoCount, fcmCount] = await Promise.all([
      sendToExpo(expoEntries, { title, body, data: stringData }),
      sendToFCM(fcmTokens, { title, body, data: stringData }),
    ]);

    const totalSent = expoCount + fcmCount;
    logger.info(
      {
        requestedRecipients: normalizedRecipientIds.length,
        matchedUsers: users.length,
        expoDevices: expoEntries.length,
        fcmDevices: fcmTokens.length,
        sent: totalSent,
      },
      "[MobilePush] Delivery completed",
    );
    return totalSent;
  } catch (err) {
    logger.warn({ err }, "[MobilePush] sendMobilePushToRecipients failed");
    return 0;
  }
}

/**
 * Send a mobile push notification for a newly published announcement.
 * Targets a pre-resolved list of recipient user _ids (already branch-filtered
 * by the announcement dispatch caller).
 *
 * @param {import('../models/Announcement').default} announcement
 * @param {Array<ObjectId|string>} recipientIds
 * @returns {Promise<number>} successful delivery count
 */
export async function sendMobilePushAnnouncement(announcement, recipientIds) {
  const title = String(announcement.title || "New Announcement").trim();
  const body =
    clipText(announcement.content, 110) || "A new announcement is available.";

  return sendMobilePushToRecipients(recipientIds, {
    title,
    body,
    data: {
      type: "announcement",
      announcement_id: String(announcement._id),
      screen: "announcements",
      url: "/(tabs)/announcements",
    },
  });
}

export async function sendMobilePushBill(userId, bill, options = {}) {
  const billingMonth =
    String(options.billingMonth || bill?.billingMonthLabel || bill?.billingMonth || bill?.description || "New billing statement").trim();
  const amount = Number(options.totalAmount ?? bill?.totalAmount ?? bill?.total ?? bill?.amount ?? 0);
  const dueDate = options.dueDate || bill?.dueDateLabel || bill?.dueDate || "the due date";
  const billId = options.billId || bill?._id || bill?.billing_id || bill?.bill_id || "";
  const billType = options.billType || bill?.billType || "bill";
  const title = billType === "rent" ? "New Rent Bill Available" : "New Bill Available";
  const body = billType === "rent"
    ? `Your rent bill for ${billingMonth} is now available.`
    : `Your bill for ${billingMonth} is PHP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}. Due by ${dueDate}.`;

  return sendMobilePushToRecipients([userId], {
    title,
    body,
    data: {
      type: "billing_new",
      billing_id: String(billId),
      screen: "billing",
      url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
    },
  });
}
