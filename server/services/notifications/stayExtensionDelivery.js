import { randomUUID } from 'node:crypto';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { emitToUser } from '../../utils/socket.js';
import logger from '../../middleware/logger.js';
import { sendMobilePushToRecipients } from './mobilePushService.js';

export const extensionEventKey = (requestId, event) => `stay_extension:${requestId}:${event}`;

// The inbox row and request transition commit together. No network calls in
// the transaction, and no second event/request collection to reconcile.
export async function queueStayExtensionNotification(request, event, session) {
  if (!session) throw new Error('Extension notification requires the request transaction.');
  const dedupeKey = extensionEventKey(request._id, event);
  const message = event === 'Submitted' ? 'Your stay extension request is pending Admin review.'
    : event === 'Approved' ? 'Your extension was approved. Your successor lease follows the contract preparation and signing process.'
    : `Your extension request was rejected.${request.adminNote ? ` ${request.adminNote}` : ''}`;
  await Notification.updateOne({ userId: request.tenantId, dedupeKey }, { $setOnInsert: {
    userId: request.tenantId, dedupeKey, type: 'general', title: `Stay Extension ${event}`, message,
    roleAtCreation: 'tenant', entityType: 'reservation', entityId: String(request.reservationId),
    actionUrl: '/extend-stay', data: {
      type: 'stay_extension', screen: 'extend-stay', url: '/extend-stay',
      extension_request_id: String(request._id), reservation_id: String(request.reservationId), event,
    },
    pushDelivery: { kind: 'stay_extension', status: 'pending', attempts: 0, acceptedTokenHashes: [], nextAttemptAt: new Date() },
  } }, { upsert: true, session });
}

export async function deliverStayExtensionNotification(userId, dedupeKey) {
  const leaseToken = randomUUID();
  const now = new Date();
  const notification = await Notification.findOneAndUpdate({
    userId, dedupeKey, 'pushDelivery.kind': 'stay_extension',
    'pushDelivery.status': { $ne: 'accepted' },
    $or: [{ 'pushDelivery.leaseUntil': null }, { 'pushDelivery.leaseUntil': { $lte: now } }],
  }, { $set: { 'pushDelivery.leaseToken': leaseToken, 'pushDelivery.leaseUntil': new Date(now.getTime() + 120000) },
    $inc: { 'pushDelivery.attempts': 1 } }, { new: true }).lean();
  if (!notification) return;
  let result;
  try {
    const tenant = await User.findById(userId).select('role tenantStatus accountStatus isArchived').lean();
    if (!tenant || tenant.role !== 'tenant' || tenant.tenantStatus !== 'active' || tenant.isArchived ||
        (tenant.accountStatus && tenant.accountStatus !== 'active')) {
      result = { status: 'no_eligible_token', error: 'Recipient is not an active tenant.' };
    } else {
      try { emitToUser(userId, 'notification:new', notification); } catch { /* Inbox polling recovers realtime failures. */ }
      result = await sendMobilePushToRecipients([userId], {
        title: notification.title, body: notification.message,
        data: { ...notification.data, notification_id: String(notification._id), event_key: dedupeKey },
      }, { detailed: true, acceptedTokenHashes: notification.pushDelivery.acceptedTokenHashes || [] });
      if (!['accepted', 'partial', 'failed', 'no_eligible_token'].includes(result?.status)) throw new Error('Push delivery outcome unavailable.');
    }
  } catch (error) {
    result = { status: 'failed', error: error.message };
  }
  const delay = result.status === 'no_eligible_token' ? 3600000
    : Math.min(3600000, 60000 * 2 ** Math.min(notification.pushDelivery.attempts - 1, 6));
  await Notification.updateOne({ _id: notification._id, 'pushDelivery.leaseToken': leaseToken }, {
    $set: { 'pushDelivery.status': result.status, 'pushDelivery.error': result.error || '',
      'pushDelivery.acceptedTokenHashes': [...new Set([...(notification.pushDelivery.acceptedTokenHashes || []), ...(result.acceptedTokenHashes || [])])],
      'pushDelivery.nextAttemptAt': new Date(Date.now() + delay) },
    $unset: { 'pushDelivery.leaseUntil': 1, 'pushDelivery.leaseToken': 1 },
  });
  return result;
}

export async function retryStayExtensionNotifications() {
  const rows = await Notification.find({ 'pushDelivery.kind': 'stay_extension',
    'pushDelivery.status': { $ne: 'accepted' }, 'pushDelivery.nextAttemptAt': { $lte: new Date() },
  }).sort({ 'pushDelivery.nextAttemptAt': 1 }).limit(50).select('userId dedupeKey').lean();
  for (const row of rows) {
    try { await deliverStayExtensionNotification(row.userId, row.dedupeKey); }
    catch (error) { logger.warn({ err: error }, 'Extension notification retry failed'); }
  }
}
