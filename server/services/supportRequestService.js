// Adapted from LilyCrest backend/services/supportRequest.service.js (2026-09-27).
// Shared API authority for confirmation transitions, CAS and pending delivery.
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { notify } from '../utils/notificationService.js';
const { ObjectId } = mongoose.Types;
// The built-in unique _id index protects retries even on installations that
// have not provisioned the optional mobile idempotency indexes.
function operationId(...parts) {
  return new ObjectId(createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24));
}

async function createSupportRequest(db, tenant, key, fields) {
  const query = { tenantId: tenant._id, startRequestIds: key };
  let doc = await db.collection('chat_conversations').findOne(query);
  let reusedExisting = Boolean(doc);
  if (!doc) {
    const now = new Date();
    const request = { id: String(new ObjectId()), tenantUserId: tenant.user_id || '',
      branch: fields.branch, concern: fields.concern, category: fields.category, priority: fields.priority,
      status: 'open', assignedAdminId: null, assignedAdminName: '', resolvedAt: null, resolvedBy: null,
      closingNote: '', closedAt: null, closedBy: null, satisfaction: null, satisfactionRating: null,
      satisfactionFeedback: '', satisfactionRatedAt: null, statusHistory: fields.statusHistory,
      createdAt: now, updatedAt: now };
    doc = { ...fields, ...request, _id: operationId('support-start', String(tenant._id), key),
      request, tenantId: tenant._id, startRequestIds: [key], supportRevision: 0,
      initialMessagePending: true, initialMessageActor: tenant };
    delete doc.id;
    try { await db.collection('chat_conversations').insertOne(doc); }
    catch (error) {
      if (error.code !== 11000) throw error;
      doc = await db.collection('chat_conversations').findOne(query);
      if (!doc) throw error;
      reusedExisting = true;
    }
  }
  if (doc.request?.concern !== fields.concern || doc.request?.category !== fields.category
    || JSON.stringify(doc.context || null) !== JSON.stringify(fields.context || null)) {
    throw conflict('This operation key was already used for a different concern.', 'IDEMPOTENCY_CONFLICT');
  }
  return { conversation: doc, reusedExisting };
}

async function rateSupportRequest(db, conversation, tenant, payload) {
  if (String(tenant.role || '').toLowerCase() !== 'tenant') {
    throw Object.assign(new Error('Only tenants can rate a support concern.'), { statusCode: 403, code: 'TENANT_REQUIRED' });
  }
  if (payload?.resolved !== true || !Number.isInteger(payload?.rating) || payload.rating < 1 || payload.rating > 5) {
    throw Object.assign(new Error('Choose a whole-number rating from 1 to 5.'), { statusCode: 400, code: 'INVALID_RATING' });
  }
  if (typeof payload.requestId !== 'string' || !payload.requestId) {
    throw Object.assign(new Error('Select the support concern to rate.'), { statusCode: 400, code: 'REQUEST_REQUIRED' });
  }
  if (payload.feedback !== undefined && (typeof payload.feedback !== 'string' || payload.feedback.length > 1000)) {
    throw Object.assign(new Error('Feedback must be text of at most 1,000 characters.'), { statusCode: 400, code: 'INVALID_FEEDBACK' });
  }
  return mutateConversation(db, conversation._id, (doc) => {
    if (String(doc.tenantId) !== String(tenant._id) || doc.tenantUserId !== tenant.user_id) {
      throw Object.assign(new Error('This support concern does not belong to you.'), { statusCode: 403, code: 'FORBIDDEN' });
    }
    if (doc.request?.id !== payload.requestId) throw conflict('This support concern has changed. Refresh and try again.');
    if (doc.satisfaction || doc.satisfactionRating != null) throw conflict('You have already rated this concern.', 'ALREADY_RATED');
    if (payload.revision != null && payload.revision !== (doc.supportRevision || 0)) throw conflict('This concern changed. Refresh before confirming.');
    if (doc.status !== 'resolved' || !Number.isFinite(Date.parse(doc.resolvedAt)) || !mongoose.isValidObjectId(doc.resolvedBy)) {
      throw conflict('You can rate this concern after an admin resolves it.', 'NOT_RESOLVED');
    }
    const now = new Date();
    const feedback = (payload.feedback || '').trim();
    const eventId = String(new ObjectId());
    return { status: 'closed', closedAt: now, closedBy: tenant._id,
      statusHistory: [...(doc.statusHistory || []), { eventId, eventType: 'tenant_confirmed', status: 'closed',
        note: 'Tenant confirmed the inquiry is resolved.', rating: payload.rating, feedback,
        actorId: tenant._id, actorName: tenant.name || 'Tenant', createdAt: now }],
      supportAdminNotifications: [...(doc.supportAdminNotifications || []), { eventId, eventType: 'tenant_confirmed' }],
      satisfaction: { requestId: doc.request.id, tenantUserId: tenant.user_id,
      resolvedBy: String(doc.resolvedBy), resolvedAt: doc.resolvedAt,
      rating: payload.rating, feedback, submittedAt: now },
      satisfactionRating: payload.rating, satisfactionFeedback: feedback, satisfactionRatedAt: now,
      tenantResolutionConfirmed: true, tenantResolutionAt: now, updatedAt: now };
  });
}

async function reopenSupportRequest(db, conversation, tenant, payload) {
  if (tenant.role !== 'tenant') throw Object.assign(new Error('Only the owner tenant can reopen an inquiry.'), { statusCode: 403, code: 'TENANT_REQUIRED' });
  if (typeof payload?.requestId !== 'string' || !payload.requestId.trim()) throw Object.assign(new Error('Select the inquiry to reopen.'), { statusCode: 400, code: 'REQUEST_REQUIRED' });
  if (payload.note != null && (typeof payload.note !== 'string' || payload.note.length > 1000)) throw Object.assign(new Error('The note must be text of at most 1,000 characters.'), { statusCode: 400, code: 'INVALID_NOTE' });
  return mutateConversation(db, conversation._id, (doc) => {
    if (String(doc.tenantId) !== String(tenant._id) || doc.tenantUserId !== tenant.user_id) throw Object.assign(new Error('This inquiry does not belong to you.'), { statusCode: 403, code: 'FORBIDDEN' });
    if (doc.request?.id !== payload.requestId) throw conflict('Wrong inquiry identity.', 'REQUEST_MISMATCH');
    if (payload.revision != null && payload.revision !== (doc.supportRevision || 0)) throw conflict('This concern changed. Refresh before confirming.');
    if (doc.status !== 'resolved' || doc.satisfaction || doc.satisfactionRating != null || !doc.resolvedAt || !doc.resolvedBy) throw conflict('This inquiry is not awaiting confirmation.', 'INVALID_TRANSITION');
    const now = new Date();
    const eventId = String(new ObjectId());
    return { status: 'open', resolvedAt: null, resolvedBy: null, closingNote: '', resolutionDurationMinutes: null,
      tenantResolutionConfirmed: false, tenantResolutionAt: null, reopenedAt: now, updatedAt: now,
      reopenCount: Number(doc.reopenCount || 0) + 1,
      statusHistory: [...(doc.statusHistory || []), { eventId, eventType: 'tenant_reopened', status: 'open',
        note: (payload.note || '').trim(), actorId: tenant._id, actorName: tenant.name || 'Tenant', createdAt: now,
        resolvedAt: doc.resolvedAt, resolvedBy: doc.resolvedBy, resolutionNote: doc.closingNote }],
      supportAdminNotifications: [...(doc.supportAdminNotifications || []), { eventId, eventType: 'tenant_reopened' }],
    };
  });
}
async function notifySupportReply(tenantUserId, event) {
  const tenant = await mongoose.connection.db.collection('users').findOne({ user_id: tenantUserId });
  if (!tenant) throw new Error('Support notification tenant not found.');
  const result = await notify.adminReply(tenant._id, event.conversationId, event.messageId || event.eventId, event);
  if (!result) throw new Error("Support notification persistence failed.");
  return result;
}

const ALLOWED_TRANSITIONS = Object.freeze({
  open: ['in_review', 'waiting_tenant', 'resolved'],
  in_review: ['waiting_tenant', 'resolved'],
  waiting_tenant: ['in_review', 'resolved'],
  resolved: [],
  closed: [],
});
const REQUEST_FIELDS = new Set([
  'status', 'category', 'priority', 'concern', 'assignedAdminId', 'assignedAdminName',
  'resolvedAt', 'resolvedBy', 'closingNote', 'closedAt', 'closedBy', 'statusHistory',
  'satisfactionRating', 'satisfactionFeedback', 'satisfactionRatedAt', 'satisfaction',
  'tenantResolutionConfirmed', 'tenantResolutionAt', 'reopenedAt', 'reopenCount', 'updatedAt',
]);

function conflict(message, code = 'CONVERSATION_CHANGED') {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

function currentConversation(doc) {
  return doc?.request ? { ...doc, ...doc.request, _id: doc._id, request: doc.request } : doc;
}

function requestFields(doc, fields) {
  const updates = { ...fields };
  if (doc.request) {
    for (const [key, value] of Object.entries(fields)) {
      if (REQUEST_FIELDS.has(key)) updates[`request.${key}`] = value;
    }
  }
  return updates;
}

function assertTransition(doc, next) {
  if (doc.status === next) return;
  const allowed = ALLOWED_TRANSITIONS[doc.status]?.includes(next);
  if (!allowed || ((doc.satisfaction || doc.satisfactionRating != null) && next !== doc.status)) {
    throw conflict('This status transition is not allowed.', 'INVALID_TRANSITION');
  }
}

async function mutateConversation(db, id, build) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const raw = await db.collection('chat_conversations').findOne({ _id: id });
    if (!raw) throw conflict('Support conversation no longer exists.');
    const doc = currentConversation(raw);
    const fields = await build(doc);
    if (!fields) return doc;
    const result = await db.collection('chat_conversations').updateOne(
      { _id: id, supportRevision: raw.supportRevision ?? null },
      { $set: requestFields(raw, fields), $inc: { supportRevision: 1 } },
    );
    if (result.matchedCount) return currentConversation(await db.collection('chat_conversations').findOne({ _id: id }));
  }
  throw conflict('Support is busy. Retry this operation.');
}

async function completeMessage(db, message) {
  if (!message.completionPending) return;
  const freshMessage = await db.collection('chat_messages').findOne({ _id: message._id });
  if (!freshMessage?.completionPending) return;
  const eventId = String(message._id);
  const asAdmin = message.senderRole !== 'tenant';
  const conversation = await mutateConversation(db, message.conversationId, async (doc) => {
    if ((doc.appliedMessageIds || []).includes(eventId)) return null;
    const history = [...(doc.statusHistory || [])];
    const newer = !doc.lastMessageAt || new Date(message.createdAt) >= new Date(doc.lastMessageAt);
    const active = !['resolved', 'closed'].includes(doc.status);
    const status = asAdmin && active && newer ? 'waiting_tenant' : doc.status;
    if (status !== doc.status) assertTransition(doc, status);
    history.push({ status, eventId, note: asAdmin ? 'Admin replied.' : 'Tenant replied.',
      actorId: message.senderId, actorName: message.senderName, createdAt: message.createdAt });
    const fields = {
      status, statusHistory: history,
      appliedMessageIds: [...(doc.appliedMessageIds || []), eventId],
      unreadAdminCount: await db.collection('chat_messages').countDocuments({ conversationId: message.conversationId, senderRole: 'tenant', readAt: null }),
      unreadTenantCount: await db.collection('chat_messages').countDocuments({ conversationId: message.conversationId, senderRole: { $in: ['admin', 'superadmin', 'owner'] }, readAt: null }),
      updatedAt: new Date(),
    };
    if (newer) {
      fields.lastMessage = message.message || `Sent ${(message.attachments || []).length} attachment(s)`;
      fields.lastMessageAt = message.createdAt;
    }
    if (asAdmin && active && newer) {
      fields.assignedAdminId = message.senderId;
      fields.assignedAdminName = message.senderName;
      if (!doc.firstAdminReplyAt) {
        fields.firstAdminReplyAt = message.createdAt;
        fields.firstAdminReplyMinutes = Math.max(0, Math.round((new Date(message.createdAt) - new Date(doc.createdAt)) / 60000));
      }
    }
    return fields;
  });
  if (asAdmin) {
    await notifySupportReply(conversation.tenantUserId, {
      adminName: message.senderName, message: message.message || 'You received a support attachment.',
      conversationId: String(conversation._id), requestId: conversation.request?.id || '',
      messageId: eventId, durable: true,
    });
  }
  await db.collection('chat_messages').updateOne({ _id: message._id }, { $set: { completionPending: false } });
}

async function persistMessage(db, conversation, user, { message, attachments = [], clientMessageId = '', asAdmin = false }) {
  const query = { conversationId: conversation._id, senderId: user._id, clientMessageId };
  let stored = clientMessageId ? await db.collection('chat_messages').findOne(query) : null;
  let replay = Boolean(stored);
  if (stored) {
    if (stored.message !== message || JSON.stringify((stored.attachments || []).map((a) => a.attachmentId)) !== JSON.stringify(attachments.map((a) => a.attachmentId))) {
      throw conflict('This operation key was already used for a different message.', 'IDEMPOTENCY_CONFLICT');
    }
  } else {
    if (['resolved', 'closed'].includes(conversation.status)) throw conflict('Reopen this unrated concern or start a new concern before sending.', 'CONVERSATION_CLOSED');
    const now = new Date();
    stored = {
      _id: clientMessageId ? operationId('support-message', String(conversation._id), String(user._id), clientMessageId) : new ObjectId(),
      conversationId: conversation._id, requestId: conversation.request?.id || null,
      senderId: user._id || null, senderUserId: user.user_id || String(user._id),
      senderName: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || (asAdmin ? 'Admin' : 'Tenant'),
      senderRole: asAdmin ? (user.role === 'superadmin' ? 'superadmin' : 'admin') : 'tenant',
      message, attachments, readAt: null, createdAt: now, updatedAt: now, completionPending: true,
      ...(clientMessageId ? { clientMessageId } : {}),
    };
    try { await db.collection('chat_messages').insertOne(stored); }
    catch (error) {
      if (error.code !== 11000 || !clientMessageId) throw error;
      return persistMessage(db, conversation, user, { message, attachments, clientMessageId, asAdmin });
    }
  }
  await completeMessage(db, stored);
  const updated = currentConversation(await db.collection('chat_conversations').findOne({ _id: conversation._id }));
  return { message: stored, conversation: updated, idempotentReplay: replay };
}

async function reconcileSupport(db, conversationId = null) {
  const starts = await db.collection('chat_conversations').find({ initialMessagePending: true,
    ...(conversationId ? { _id: conversationId } : {}) }).limit(100).toArray();
  for (const doc of starts) {
    if (!doc.request || !doc.initialMessageActor) continue;
    await persistMessage(db, currentConversation(doc), doc.initialMessageActor, {
      message: doc.request.concern, clientMessageId: `start:${doc.startRequestIds[0]}`,
    });
    await db.collection('chat_conversations').updateOne({ _id: doc._id }, { $set: { initialMessagePending: false } });
  }
  const messages = await db.collection('chat_messages').find({ completionPending: true,
    ...(conversationId ? { conversationId } : {}) }).sort({ createdAt: 1, _id: 1 }).limit(100).toArray();
  for (const message of messages) await completeMessage(db, message);
  const conversations = await db.collection('chat_conversations').find({
    'supportNotification.pending': true, ...(conversationId ? { _id: conversationId } : {}),
  }).limit(100).toArray();
  for (const doc of conversations) {
    const event = doc.supportNotification;
    await notifySupportReply(doc.tenantUserId, { ...event, conversationId: String(doc._id), requestId: doc.request?.id || '', durable: true });
    await db.collection('chat_conversations').updateOne({ _id: doc._id, 'supportNotification.eventId': event.eventId },
      { $set: { 'supportNotification.pending': false } });
  }
  const adminEvents = await db.collection('chat_conversations').find({ 'supportAdminNotifications.0': { $exists: true },
    ...(conversationId ? { _id: conversationId } : {}) }).limit(100).toArray();
  for (const raw of adminEvents) {
    const doc = currentConversation(raw);
    const admins = await db.collection('users').find({ isArchived: false, accountStatus: 'active',
      $or: [{ role: 'owner' }, { role: 'branch_admin', branch: doc.branch, permissions: 'manageUsers' },
        ...(mongoose.isValidObjectId(doc.assignedAdminId) ? [{ _id: new ObjectId(String(doc.assignedAdminId)), role: 'branch_admin', permissions: 'manageUsers' }] : [])] }).toArray();
    for (const event of doc.supportAdminNotifications) {
      for (const admin of admins) {
        const reopened = event.eventType === 'tenant_reopened';
        const result = await notify.generalOnce(admin._id, reopened ? 'Support inquiry reopened' : 'Support inquiry confirmed',
          reopened ? 'The tenant reported that the concern is still unresolved. The inquiry is open again.' : 'The tenant confirmed the inquiry is resolved and submitted a rating.',
          `support:${event.eventId}:${admin._id}`, { reuseExisting: true, throwOnFailure: true,
            entityType: 'chat', entityId: String(doc._id), actionUrl: `/admin/chat?conversationId=${doc._id}&requestId=${doc.request.id}`,
            data: { conversationId: String(doc._id), requestId: doc.request.id, eventType: event.eventType } });
        if (!result) throw new Error('Support admin notification persistence failed.');
      }
      await db.collection('chat_conversations').updateOne({ _id: doc._id }, { $pull: { supportAdminNotifications: { eventId: event.eventId } } });
    }
  }
}

export { ALLOWED_TRANSITIONS, assertTransition, currentConversation, requestFields,
  mutateConversation, persistMessage, reconcileSupport, conflict, createSupportRequest, rateSupportRequest, reopenSupportRequest };
