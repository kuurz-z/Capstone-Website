/**
 * ============================================================================
 * MOBILE PUSH SERVICE
 * ============================================================================
 *
 * Sends mobile push notifications (Expo + FCM) from the Capstone server.
 */

import mongoose from "mongoose";
import admin from "firebase-admin";
import axios from "axios";
import { createHash } from 'node:crypto';
import logger from "../../middleware/logger.js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;
const FCM_CHUNK_SIZE = 500;
const DEFAULT_CHANNEL_ID = "default";
const tokenHash = token => createHash('sha256').update(token).digest('hex');

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
  const explicitlyDisabled = new Set(
    Array.isArray(user.push_tokens)
      ? user.push_tokens
        .filter((entry) => entry && typeof entry === "object" && entry.enabled === false)
        .map((entry) => String(entry.token || entry.push_token || entry.value || "").trim())
        .filter(Boolean)
      : [],
  );
  const entries = [];

  const add = (token, provider = null, platform = null) => {
    const t = String(token || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    entries.push({
      token: t,
      provider: String(provider || "").trim() || null,
      platform: String(platform || "").trim().toLowerCase() || null,
    });
  };

  if (Array.isArray(user.push_tokens)) {
    for (const entry of user.push_tokens) {
      if (typeof entry === "string") {
        add(entry);
      } else if (entry && typeof entry === "object") {
        if (entry.enabled === false) continue;
        add(entry.token || entry.push_token || entry.value, entry.provider, entry.platform || entry.device_platform);
      }
    }
  }

  if (user.push_token && !explicitlyDisabled.has(String(user.push_token).trim())) {
    add(user.push_token, user.push_provider, user.push_platform);
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
  if (!entries.length) return { accepted: 0, attempted: 0, acceptedTokenHashes: [] };
  let successCount = 0;
  const acceptedTokenHashes = [];
  const invalidTokens = [];

  await Promise.all(
    chunkArray(entries, EXPO_CHUNK_SIZE).map(async (batch) => {
      try {
        const collapseId = String(data?.event_key || data?.notification_id || "").trim().slice(0, 64);
        const messages = batch.map((e) => ({
          to: e.token,
          title,
          body,
          data,
          sound: "default",
          channelId: DEFAULT_CHANNEL_ID,
          priority: "high",
          ...(collapseId ? { collapseId } : {}),
          ...(collapseId && e.platform === "android" ? { tag: collapseId } : {}),
        }));

        const resp = await axios.post(EXPO_PUSH_ENDPOINT, messages, {
          headers: { "Content-Type": "application/json" },
          timeout: 12000,
        });

        const tickets = Array.isArray(resp.data?.data) ? resp.data.data : [];
        tickets.forEach((ticket, index) => {
          if (ticket?.status === "ok") {
            successCount += 1;
            if (batch[index]) acceptedTokenHashes.push(tokenHash(batch[index].token));
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

  return { accepted: successCount, attempted: entries.length, acceptedTokenHashes };
}

async function sendToFCM(tokens, { title, body, data }) {
  if (!tokens.length || !admin.apps.length) return { accepted: 0, attempted: 0, acceptedTokenHashes: [] };
  let successCount = 0;
  const acceptedTokenHashes = [];
  const invalidTokens = [];

  await Promise.all(
    chunkArray(tokens, FCM_CHUNK_SIZE).map(async (batch) => {
      try {
        const eventKey = String(data?.event_key || data?.notification_id || "").trim();
        const notificationTag = eventKey.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 64);
        const resp = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: stringifyData(data),
          android: {
            priority: "high",
            ...(notificationTag ? { collapseKey: notificationTag } : {}),
            notification: {
              channelId: DEFAULT_CHANNEL_ID,
              sound: "default",
              ...(notificationTag ? { tag: notificationTag } : {}),
            },
          },
        });
        successCount += resp.successCount;
        resp.responses.forEach((result, index) => {
          if (result.success) acceptedTokenHashes.push(tokenHash(batch[index]));
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

  return { accepted: successCount, attempted: tokens.length, acceptedTokenHashes };
}

export async function sendMobilePushToRecipients(recipientIds, { title, body, data = {} }, options = {}) {
  const outcome = (status, extra = {}) => options.detailed
    ? { status, attempted: false, accepted: 0, acceptedTokenHashes: [], ...extra }
    : Number(extra.accepted || 0);
  if (!recipientIds?.length) return outcome('no_eligible_token');

  const db = mongoose.connection.db;
  if (!db) {
    logger.warn("[MobilePush] MongoDB not ready — push skipped");
    return outcome('failed', { error: 'Push storage is unavailable.' });
  }

  try {
    const normalizedRecipientIds = recipientIds
      .map((recipientId) => toObjectId(recipientId))
      .filter(Boolean);

    if (!normalizedRecipientIds.length) {
      logger.warn("[MobilePush] No valid recipient ids resolved");
      return outcome('failed', { error: 'No canonical recipient IDs.' });
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
        { projection: { push_token: 1, push_provider: 1, push_platform: 1, push_tokens: 1 } },
      )
      .toArray();

    // A token may temporarily appear in both the legacy scalar field and the
    // installation array, or even on two accounts after account switching.
    // Dispatch it once per logical event while registration cleanup converges.
    const entriesByToken = new Map();
    for (const entry of users.flatMap(extractPushTokens)) {
      const current = entriesByToken.get(entry.token);
      if (!current || (!current.platform && entry.platform)) {
        entriesByToken.set(entry.token, entry);
      }
    }
    const enabledEntries = [...entriesByToken.values()];
    if (!enabledEntries.length) return outcome('no_eligible_token');
    const alreadyAccepted = new Set(options.acceptedTokenHashes || []);
    const allEntries = enabledEntries.filter(entry => !alreadyAccepted.has(tokenHash(entry.token)));
    if (!allEntries.length) return outcome('accepted');

    const expoEntries = allEntries.filter((e) => isExpoPushToken(e.token));
    const fcmTokens = allEntries
      .filter((e) => !isExpoPushToken(e.token) && e.provider !== "apns")
      .map((e) => e.token);

    const stringData = stringifyData(data);
    const [expoResult, fcmResult] = await Promise.all([
      sendToExpo(expoEntries, { title, body, data: stringData }),
      sendToFCM(fcmTokens, { title, body, data: stringData }),
    ]);

    const totalSent = expoResult.accepted + fcmResult.accepted;
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
    return outcome(totalSent === allEntries.length ? 'accepted' : totalSent ? 'partial' : 'failed', {
      attempted: expoResult.attempted + fcmResult.attempted > 0,
      accepted: totalSent,
      acceptedTokenHashes: [...expoResult.acceptedTokenHashes, ...fcmResult.acceptedTokenHashes],
      eligibleTokens: enabledEntries.length,
      ...(totalSent < allEntries.length ? { error: 'One or more devices were not accepted by the push provider.' } : {}),
    });
  } catch (err) {
    logger.warn({ err }, "[MobilePush] sendMobilePushToRecipients failed");
    return outcome('failed', { error: 'Push delivery failed.' });
  }
}

export async function sendMobilePushAnnouncement(announcement, recipientIds) {
  const title = String(announcement.title || "New Announcement").trim();
  const body =
    clipText(announcement.content, 110) || "A new announcement is available.";

  return sendMobilePushToRecipients(recipientIds, {
    title,
    body,
    data: {
      event_key: `announcement:${String(announcement._id)}`,
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
      ...(options.data || {}),
      event_key: options.data?.event_key || (billId ? `billing:${String(billId)}` : "billing"),
      type: "billing_new",
      billing_id: String(billId),
      screen: "billing",
      url: billId ? `/bill-details?billId=${String(billId)}` : "/(tabs)/billing",
    },
  });
}
