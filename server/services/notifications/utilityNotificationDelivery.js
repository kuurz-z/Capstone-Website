import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Delivery from '../../models/UtilityNotificationDelivery.js';
import Notification from '../../models/Notification.js';
import Bill from '../../models/Bill.js';
import UtilityPeriod from '../../models/UtilityPeriod.js';
import notify from './notificationService.js';
import { sendMobilePushToRecipients } from './mobilePushService.js';
import { formatManilaDate } from '../../utils/dateUtils.js';
import mobileAuthCore from '../../mobile/security/mobileAuthCore.js';

export async function resolveUtilityNotificationRecipient(identity) {
  const value = identity?._id || identity;
  const query = mongoose.isValidObjectId(value)
    ? { _id: new mongoose.Types.ObjectId(String(value)) } : { user_id: String(value || '') };
  const user = await mongoose.connection.db.collection('users').findOne(query);
  const tenantStatus = String(user?.tenantStatus || user?.tenant_status || '').toLowerCase();
  return user && user.role === 'tenant' && (!tenantStatus || tenantStatus === 'active') &&
    mobileAuthCore.evaluateAccount({ ...user, user_id: user.user_id || String(user._id) }).allowed ? user : null;
}

// The existing notification key is retained. _id makes job insertion safe even
// before secondary indexes are built. This write belongs to publication's txn.
export async function queueUtilityNotification({ bill, period, utilityType, utilityAmount, allocations = [], session = null }) {
  const userId = bill.userId?._id || bill.userId;
  const periodId = period._id || period.id;
  const eventId = `${utilityType}:${periodId}`;
  const eventKey = `utility_charge_available:${bill._id}:${eventId}`;
  const id = `${userId}:${eventKey}`;
  const payload = {
    eventKey, eventId, billId: String(bill._id), utilityPeriodId: String(periodId),
    allocationIds: allocations.map(a => a.allocationId).filter(Boolean).sort(),
    billingMonth: formatManilaDate(bill.utilityCycleEnd || period.endDate || bill.billingMonth, 'MMMM YYYY'),
    dueDate: formatManilaDate(bill.dueDate, 'MMMM D, YYYY'),
    utilityAmount: Number(utilityAmount), totalAmount: Number(bill.totalAmount),
  };
  await Delivery.updateOne({ _id: id }, { $setOnInsert: {
    billId: bill._id, userId, utilityType, periodId, payload,
  } }, { upsert: true, session });
  return id;
}

export async function queuePublishedBillUtilityNotifications(bill, session = null) {
  const ids = [];
  for (const utilityType of ['electricity', 'water']) {
    if (Number(bill.charges?.[utilityType] || 0) <= 0) continue;
    const allocations = utilityType === 'water' ? (bill.waterAllocations || []).filter(a => a.state === 'sent') : [];
    const periodIds = allocations.length ? [...new Set(allocations.map(a => String(a.utilityPeriodId)))]
      : [bill.utilityDispatch?.[utilityType]?.periodId].filter(Boolean);
    if (!periodIds.length) {
      const period = await UtilityPeriod.findOne({ utilityType, 'tenantSummaries.billId': bill._id, isArchived: false }).session(session);
      if (period) periodIds.push(period._id);
    }
    if (!periodIds.length) throw new Error('Utility publication requires a linked billing period.');
    for (const periodId of periodIds) {
      const period = await UtilityPeriod.findById(periodId).session(session);
      if (!period || period.utilityType !== utilityType) throw new Error('Utility publication period does not match.');
      const selected = allocations.filter(a => String(a.utilityPeriodId) === String(periodId));
      ids.push(await queueUtilityNotification({ bill, period, utilityType, allocations: selected, session,
        utilityAmount: selected.length ? selected.reduce((sum, a) => sum + Number(a.amount), 0) : bill.charges[utilityType] }));
    }
  }
  return ids;
}

const publicResult = job => ({
  publicationSucceeded: true,
  notificationPersisted: job?.notificationStatus === 'persisted',
  notificationId: job?.notificationId ? String(job.notificationId) : null,
  notificationStatus: job?.notificationStatus || 'pending',
  push: { status: job?.push?.status || 'pending', attempted: !!job?.push?.attempted,
    accepted: Number(job?.push?.accepted || 0) },
  retryable: job?.push?.status !== 'accepted' && job?.push?.status !== 'legacy_unverified',
  error: job?.error || '',
});

export async function deliverUtilityNotification(id) {
  let job = await Delivery.findById(id).lean();
  if (!job) return { ...publicResult(null), error: 'Notification delivery is not queued.' };
  if (['accepted', 'legacy_unverified'].includes(job.push?.status)) return publicResult(job);
  const leaseToken = randomUUID();
  job = await Delivery.findOneAndUpdate({ _id: id,
    $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }],
  }, { $set: { leaseToken, leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true }).lean();
  if (!job) return { ...publicResult(await Delivery.findById(id).lean()), inProgress: true };
  const update = async fields => {
    await Delivery.updateOne({ _id: id, leaseToken }, { $set: fields });
    Object.assign(job, fields);
  };
  try {
    if (['accepted', 'legacy_unverified'].includes(job.push?.status)) return publicResult(job);
    const bill = await Bill.findOne({ _id: job.billId, userId: job.userId, isArchived: false }).lean();
    const sent = job.utilityType === 'water' && bill?.waterAllocations?.length
      ? bill.waterAllocations.some(a => String(a.utilityPeriodId) === String(job.periodId) && a.state === 'sent')
      : bill?.utilityDispatch?.[job.utilityType]?.state === 'sent';
    if (!bill || bill.status === 'draft' || !sent) throw new Error('Only published utility charges can notify tenants.');
    const recipient = await resolveUtilityNotificationRecipient(job.userId);
    if (!recipient) {
      await update({ notificationStatus: 'recipient_excluded', push: { status: 'recipient_excluded', attempted: false, accepted: 0 }, error: 'Recipient is not an eligible current tenant.' });
      return publicResult(job);
    }
    const p = job.payload;
    // Old generic publication used a different event key. Adopt its canonical
    // record without resending an alert; historical provider delivery is unknown.
    if (!job.notificationId) {
      const legacy = await Notification.findOne({ userId: recipient._id,
        dedupeKey: `bill_released:${job.billId}:invoice:${Number(bill.invoiceVersion || 1)}` }).lean();
      if (legacy) {
        await update({ notificationId: legacy._id, notificationStatus: 'persisted',
          push: { status: 'legacy_unverified', attempted: false, accepted: 0 }, error: '' });
        return publicResult(job);
      }
    }
    const notification = await notify.utilityChargeAvailable(recipient._id, job.utilityType,
      p.billingMonth, p.utilityAmount, p.totalAmount, p.dueDate, { ...p, persistOnly: true });
    if (!notification?._id) throw new Error('Notification record was not persisted.');
    await update({ notificationId: notification._id, notificationStatus: 'persisted', error: '' });
    const title = `${job.utilityType === 'water' ? 'Water' : 'Electricity'} Charge Available`;
    const push = await sendMobilePushToRecipients([recipient._id], {
      title, body: notification.message,
      data: { notification_id: String(notification._id), event_key: p.eventKey,
        type: 'bill_generated', utilityType: job.utilityType, billId: p.billId, billing_id: p.billId,
        utilityPeriodId: p.utilityPeriodId, allocationIds: p.allocationIds.join(','),
        screen: 'billing', url: `/bill-details?billId=${p.billId}` },
    }, { detailed: true, acceptedTokenHashes: job.acceptedTokenHashes });
    if (!push || !['accepted', 'no_eligible_token', 'partial', 'failed'].includes(push.status)) {
      throw new Error('Push provider did not return a delivery outcome.');
    }
    await update({ push: { status: push.status, attempted: push.attempted,
      accepted: Number(job.push?.accepted || 0) + Number(push.accepted || 0) },
      acceptedTokenHashes: [...new Set([...job.acceptedTokenHashes, ...(push.acceptedTokenHashes || [])])],
      error: push.error || '' });
  } catch (error) {
    await update({ error: error.message, ...(job.notificationStatus !== 'persisted'
      ? { notificationStatus: 'failed' } : { push: { status: 'failed', attempted: true, accepted: Number(job.push?.accepted || 0) } }) });
  } finally {
    await Delivery.updateOne({ _id: id, leaseToken }, { $unset: { leaseToken: 1, leaseUntil: 1 } });
  }
  return publicResult(job);
}
