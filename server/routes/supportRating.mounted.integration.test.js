import express from 'express';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll, test, expect, jest } from '@jest/globals';
import { normalizeSupportConcern } from '../../web/src/shared/utils/supportConcern.js';

jest.setTimeout(120000);
// Only external providers are replaced. Both routers, authentication middleware,
// stored sessions, tenant lookup, controllers and MongoDB persistence are real.
jest.unstable_mockModule('../config/firebase.js', () => ({ default: {}, getAuth: () => ({
  verifyIdToken: async (token) => ({ uid: token, auth_time: Math.floor(Date.now() / 1000) }),
}) }));
jest.unstable_mockModule('../utils/notificationService.js', () => ({ notify: {
  adminReply: jest.fn().mockResolvedValue({}), general: jest.fn().mockResolvedValue({}), generalOnce: jest.fn().mockResolvedValue({}),
} }));
jest.unstable_mockModule('../utils/socket.js', () => ({ emitToChatAdmins: jest.fn(), emitToUser: jest.fn(),
  emitRoomUpdate: jest.fn(), emitToBranch: jest.fn(), emitToAll: jest.fn(), emitToAdmins: jest.fn(), getIO: jest.fn() }));
const { default: mobileRoutes } = await import('./mobileChatRoutes.js');
const { default: adminRoutes } = await import('./chatRoutes.js');
const { default: analyticsRoutes } = await import('./analyticsRoutes.js');
const { default: UserSession } = await import('../models/UserSession.js');
const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const React = requireWeb('react');
const { renderToStaticMarkup } = requireWeb('react-dom/server');
const { transformSync } = requireWeb('esbuild');
const detailsSource = readFileSync(new URL('../../web/src/features/admin/components/chat/AdminSupportRequestDetails.jsx', import.meta.url), 'utf8');
const detailsCode = transformSync(detailsSource.replace('export default function', 'function'), { loader: 'jsx', jsxFactory: 'React.createElement' }).code;
const AdminDetails = new Function('React', `${detailsCode}; return AdminSupportRequestDetails;`)(React);
let mongo, db, server, origin;
const people = {};
const proof = [];

async function call(method, path, body, actor = 'tenant-a') {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(actor ? {
      authorization: `Bearer ${actor}`, 'x-device-id': 'qa-device', 'x-session-id': `qa-${actor}`,
    } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const mobilePath = (id, action = 'resolution') => `/api/m/chat/${id}/${action}`;
const adminPath = (id, action = 'status') => `/api/chat/admin/conversations/${id}/${action}`;
async function start(key, actor = 'tenant-a') {
  const result = await call('POST', '/api/m/chat/start', {
    clientRequestId: key, category: 'billing_concern', initialMessage: `QA concern ${key}`,
  }, actor);
  expect(result.status).toBe(200);
  expect(result.body.conversation.requestId).toBeTruthy();
  return result.body.conversation;
}
async function resolve(conversation) {
  for (const status of ['in_review', 'resolved']) {
    const result = await call('PATCH', adminPath(conversation.id), {
      status, note: 'QA issue corrected.', requestId: conversation.requestId,
    }, 'admin');
    expect(result.status).toBe(200);
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'mounted_support_rating_qa' });
  db = mongoose.connection.db;
  for (const [id, role, branch, permissions] of [
    ['tenant-a', 'tenant', 'gil-puyat', []], ['tenant-b', 'tenant', 'gil-puyat', []],
    ['applicant', 'applicant', 'gil-puyat', []],
    ['admin', 'branch_admin', 'gil-puyat', ['manageUsers']],
    ['other-admin', 'branch_admin', 'guadalupe', ['manageUsers']],
    ['limited-admin', 'branch_admin', 'gil-puyat', []], ['owner', 'owner', 'gil-puyat', []],
  ]) {
    const person = { _id: new mongoose.Types.ObjectId(), user_id: id, firebaseUid: id,
      firstName: 'QA', lastName: id, name: `QA ${id}`, email: `${id}@example.invalid`,
      role, branch, permissions, isActive: true, isArchived: false, accountStatus: 'active', securityVersion: 0 };
    people[id] = person;
    await db.collection('users').insertOne(person);
    await db.collection('user_sessions').insertOne({ session_token: id, user_id: id,
      expires_at: new Date(Date.now() + 3600000), security_version: 0 });
    await UserSession.create({ userId: person._id, sessionId: `qa-${id}`, deviceId: 'qa-device',
      expiresAt: new Date(Date.now() + 3600000), isActive: true,
      assuranceMethod: ['owner', 'branch_admin'].includes(role) ? 'admin_password' : 'login_otp',
      otpVerifiedAt: new Date(), securityVersion: 0 });
  }
  const app = express();
  app.use(express.json());
  app.use('/api/m', mobileRoutes);
  app.use('/api/chat', adminRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
  server = http.createServer(app);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  if (proof.length) console.info('ISOLATED_HTTP_QA_PROOF', JSON.stringify(proof));
  if (server) await new Promise((done) => { server.closeAllConnections(); server.close(done); });
  await mongoose.disconnect();
  await mongo?.stop();
});

test.each([1, 2, 3, 4, 5])('Mobile mounted API saves %i/5 once and Admin reads the same persisted request', async (rating) => {
  const actor = rating % 2 ? 'tenant-a' : 'tenant-b';
  const conversation = await start(`score-${rating}`, actor);
  await resolve(conversation);
  const payload = { resolved: true, requestId: conversation.requestId, rating, feedback: ` QA score ${rating} ` };
  const saved = await call('PATCH', mobilePath(conversation.id), payload, actor);
  expect(saved.status).toBe(200);
  const raw = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(conversation.id) });
  expect(raw.request.satisfaction).toMatchObject({ requestId: conversation.requestId, tenantUserId: actor,
    rating, feedback: `QA score ${rating}`, resolvedBy: String(people.admin._id) });
  expect(await db.collection('chat_conversations').countDocuments({ 'request.id': conversation.requestId,
    'request.satisfaction.rating': rating })).toBe(1);
  const reread = await call('GET', mobilePath(conversation.id, 'messages'), undefined, actor);
  const admin = await call('GET', adminPath(conversation.id, 'messages'), undefined, 'admin');
  for (const result of [saved, reread, admin]) {
    expect(result.status).toBe(200);
    expect(normalizeSupportConcern(result.body.conversation)).toMatchObject({ rating,
      requestId: conversation.requestId, feedback: `QA score ${rating}`, status: 'closed', lifecycleLocked: true });
  }
  const markup = renderToStaticMarkup(React.createElement(AdminDetails,
    { concern: normalizeSupportConcern(admin.body.conversation) }));
  expect(markup).toContain(`${rating} out of 5 stars`);
  expect(markup).toContain(`Feedback: QA score ${rating}`);
  expect(markup).toContain(conversation.requestId);
  const list = await call('GET', `/api/chat/admin/conversations?requestId=${conversation.requestId}`, undefined, 'admin');
  expect(list.body.conversations).toHaveLength(1);
  expect(list.body.conversations[0].tenantUserId).toBe(actor);
  expect((await call('PATCH', mobilePath(conversation.id), payload, actor)).status).toBe(409);
  proof.push({ tenant: actor, conversationId: conversation.id, requestId: conversation.requestId,
    rating, feedback: raw.request.satisfaction.feedback, submittedAt: raw.request.satisfaction.submittedAt,
    databaseCount: 1, adminRating: normalizeSupportConcern(admin.body.conversation).rating });
});

test('invalid ratings and feedback do not mutate a resolved request', async () => {
  const c = await start('invalid-input');
  await resolve(c);
  const base = { resolved: true, requestId: c.requestId, rating: 4 };
  for (const patch of [{ rating: undefined }, { rating: null }, { rating: 0 }, { rating: 6 },
    { rating: 2.5 }, { rating: '5' }, { rating: {} }, { rating: true }, { resolved: 'true' },
    { requestId: undefined }, { feedback: {} }, { feedback: 'x'.repeat(1001) }]) {
    const result = await call('PATCH', mobilePath(c.id), { ...base, ...patch });
    expect(result.status).toBe(400);
    expect(result.body.error).not.toMatch(/CastError|ValidationError|undefined|null/);
  }
  expect((await call('PATCH', mobilePath(c.id), { ...base, requestId: 'another-request' })).status).toBe(409);
  const raw = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(c.id) });
  expect(raw.request.satisfaction).toBeNull();
  const saved = await call('PATCH', mobilePath(c.id), { ...base, feedback: '   ' });
  expect(saved.status).toBe(200);
  expect(saved.body.conversation.satisfaction.feedback).toBe('');
});

test('concurrent starts and rating submissions persist only one request and one immutable rating', async () => {
  const requests = await Promise.all([start('double-start'), start('double-start')]);
  const c = requests[0];
  expect(requests[1].id).toBe(c.id);
  expect(await db.collection('chat_conversations').countDocuments({ startRequestIds: 'double-start' })).toBe(1);
  expect(await db.collection('chat_messages').countDocuments({ conversationId: new mongoose.Types.ObjectId(c.id) })).toBe(1);
  expect((await call('POST', '/api/m/chat/start', { clientRequestId: 'double-start', category: 'billing_concern', initialMessage: 'Different' })).status).toBe(409);
  await resolve(c);
  const attempts = await Promise.all([4, 5].map((rating) => call('PATCH', mobilePath(c.id), { requestId: c.requestId, resolved: true, rating })));
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  const before = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(c.id) });
  for (const action of ['close', 'reopen']) {
    expect((await call('PATCH', mobilePath(c.id, action), { requestId: c.requestId })).status).toBe(409);
  }
  expect((await call('POST', mobilePath(c.id, 'messages'), { message: 'Try reopening' })).status).toBe(409);
  for (const [action, body] of [['status', { status: 'in_review' }], ['priority', { priority: 'urgent' }],
    ['assign', { assignedAdminId: 'me' }], ['close', { note: 'Try changing' }]]) {
    expect((await call('PATCH', adminPath(c.id, action), body, 'admin')).status).toBe(409);
  }
  expect((await call('POST', adminPath(c.id, 'messages'), { message: 'Try changing' }, 'admin')).status).toBe(409);
  const after = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(c.id) });
  expect(after.request).toEqual(before.request);
});

test('real sessions, roles, ownership, missing records and admin permissions fail closed', async () => {
  const c = await start('authorization');
  await resolve(c);
  const body = { resolved: true, requestId: c.requestId, rating: 5 };
  expect((await call('PATCH', mobilePath(c.id), body, null)).status).toBe(401);
  expect((await call('PATCH', mobilePath(c.id), body, 'tenant-b')).status).toBe(403);
  // Applicant fixture cannot acquire tenant eligibility via a forged request body.
  expect((await call('PATCH', mobilePath(c.id), { ...body, role: 'tenant', tenantId: String(people['tenant-a']._id) }, 'applicant')).status).toBe(400);
  // Shared chat permits an applicant with established active tenant context;
  // that compatibility rule must not grant the tenant-only rating action.
  await db.collection('users').updateOne({ _id: people.applicant._id }, { $set: { tenantStatus: 'active' } });
  const applicantConcern = await start('applicant-owned', 'applicant');
  await resolve(applicantConcern);
  expect((await call('PATCH', mobilePath(applicantConcern.id), { ...body, requestId: applicantConcern.requestId }, 'applicant')).status).toBe(403);
  expect((await call('GET', mobilePath(c.id, 'messages'), undefined, 'tenant-b')).status).toBe(403);
  expect((await call('PATCH', mobilePath('invalid'), body)).status).toBe(404);
  expect((await call('PATCH', mobilePath(String(new mongoose.Types.ObjectId())), body)).status).toBe(404);
  for (const actor of ['tenant-a', 'applicant', 'limited-admin']) {
    expect((await call('GET', '/api/chat/admin/conversations', undefined, actor)).status).toBe(403);
  }
  expect((await call('GET', adminPath(c.id, 'messages'), undefined, 'other-admin')).status).toBe(404);
  expect((await call('GET', '/api/analytics/reports/support-chat?range=all', undefined, 'admin')).status).toBe(403);
  await db.collection('chat_conversations').deleteOne({ _id: new mongoose.Types.ObjectId(c.id) });
  expect((await call('PATCH', mobilePath(c.id), body)).status).toBe(404);
});

test('request list refetch, valid filters, escaped search, empty results and legacy starts remain compatible', async () => {
  const c = await start('filters');
  const mine = await call('GET', '/api/m/chat/me');
  expect(mine.status).toBe(200);
  expect(mine.body.conversations.some((item) => item.id === c.id && item.tenantUserId === 'tenant-a')).toBe(true);
  const exact = await call('GET', `/api/chat/admin/conversations?requestId=${c.requestId}&status=open&category=billing_concern&priority=normal`, undefined, 'admin');
  expect(exact.body.conversations).toHaveLength(1);
  const empty = await call('GET', '/api/chat/admin/conversations?search=%5Bdoes-not-exist%5D', undefined, 'admin');
  expect(empty.status).toBe(200);
  expect(empty.body.conversations).toEqual([]);
  // Invalid enum filters retain the existing ignore-filter contract.
  const ignored = await call('GET', `/api/chat/admin/conversations?requestId=${c.requestId}&status=invalid`, undefined, 'admin');
  expect(ignored.status).toBe(200);
  expect(ignored.body.conversations).toHaveLength(1);
  const legacy = await call('POST', '/api/m/chat/start', { category: 'general_inquiry', initialMessage: 'Legacy client concern' });
  expect(legacy.status).toBe(200);
  expect(legacy.body.conversation.legacy).toBe(true);
  expect(legacy.body.conversation.id).not.toBe(c.id);
  const duplicateMessages = await Promise.all([1, 2].map(() => call('POST', mobilePath(c.id, 'messages'),
    { message: 'Follow-up', clientMessageId: 'same-message-key' })));
  expect(duplicateMessages.map((r) => r.status)).toEqual([200, 200]);
  expect(duplicateMessages[0].body.message.id).toBe(duplicateMessages[1].body.message.id);
  expect(await db.collection('chat_messages').countDocuments({ conversationId: new mongoose.Types.ObjectId(c.id), clientMessageId: 'same-message-key' })).toBe(1);
});

test('only admin-resolved requests can be rated; unrated reopen and close preserve lifecycle policy', async () => {
  const c = await start('lifecycle');
  const body = { resolved: true, requestId: c.requestId, rating: 3 };
  expect((await call('PATCH', mobilePath(c.id), body)).status).toBe(409);
  const replied = await call('POST', adminPath(c.id, 'messages'), { message: 'Checking your concern', clientMessageId: 'qa-admin-reply' }, 'admin');
  expect(replied.status).toBe(200);
  expect(replied.body.conversation.status).toBe('waiting_tenant');
  expect((await call('PATCH', mobilePath(c.id), body)).status).toBe(409);
  const resolved = await call('PATCH', adminPath(c.id), { status: 'resolved', note: 'Fixed' }, 'admin');
  expect(resolved.status).toBe(200);
  const reopened = await call('PATCH', mobilePath(c.id, 'reopen'), { requestId: c.requestId });
  expect(reopened.status).toBe(200);
  expect(reopened.body.conversation.status).toBe('open');
  expect(reopened.body.conversation.resolvedAt).toBeNull();
  expect(reopened.body.conversation.resolutionDurationMinutes).toBeNull();
  expect((await call('PATCH', mobilePath(c.id, 'close'), {})).status).toBe(409);
  expect((await call('PATCH', mobilePath(c.id), body)).status).toBe(409);
  expect((await call('PATCH', mobilePath(c.id, 'reopen'), { requestId: c.requestId })).status).toBe(409);
});

test('owner analytics uses persisted request ratings and the canonical branch', async () => {
  const records = await db.collection('chat_conversations').find({ 'request.satisfaction.rating': { $in: [3, 4, 5] }, startRequestIds: { $in: ['score-3', 'score-4', 'score-5'] } }).toArray();
  expect(records).toHaveLength(3);
  // Scope the three real API-created records to the other branch. Deliberately
  // leave the compatibility projection stale to exercise request authority.
  await db.collection('chat_conversations').updateMany({ _id: { $in: records.map((c) => c._id) } }, { $set: { 'request.branch': 'guadalupe' } });
  const report = await call('GET', '/api/analytics/reports/support-chat?range=all&branch=guadalupe', undefined, 'owner');
  expect(report.status).toBe(200);
  expect(report.body.data.kpis).toMatchObject({ ratedConversationsCount: 3, avgSatisfactionRating: 4 });
  const list = await call('GET', '/api/chat/admin/conversations?branch=guadalupe', undefined, 'owner');
  expect(list.body.conversations.map((c) => c.id).sort()).toEqual(records.map((c) => String(c._id)).sort());
});

test('direct admin resolve awaits confirmation; repeat resolve does not duplicate notifications or events', async () => {
  const { notify } = await import('../utils/notificationService.js');
  const c = await start('confirmation-direct');
  notify.adminReply.mockClear();
  const payload = { status: 'resolved', note: 'Issue corrected.', requestId: c.requestId };
  expect((await call('PATCH', adminPath(c.id), payload, 'other-admin')).status).toBe(404);
  const attempts = await Promise.all([1, 2].map(() => call('PATCH', adminPath(c.id), payload, 'admin')));
  expect(attempts.every((r) => r.status === 200)).toBe(true);
  const saved = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation;
  expect(saved.status).toBe('resolved');
  expect(saved.closedAt).toBeNull();
  expect(saved.tenantResolutionConfirmed).toBe(false);
  expect(saved.resolvedBy).toBe(String(people.admin._id));
  expect(saved.lifecycleEvents.filter((e) => e.eventType === 'admin_resolved')).toHaveLength(1);
  const notificationIds = notify.adminReply.mock.calls.map((args) => args[2]);
  expect(new Set(notificationIds).size).toBe(1); // transport dedupes this persisted event key
  expect(notify.adminReply.mock.calls[0][0]).toEqual(people['tenant-a']._id);
  expect(notify.adminReply.mock.calls[0][3].message).toContain('Please confirm');
  expect((await call('PATCH', adminPath(c.id, 'close'), { note: 'Bypass' }, 'admin')).status).toBe(409);
  expect((await call('PATCH', mobilePath(c.id, 'rating'), { requestId: c.requestId, rating: 1, revision: saved.revision })).status).toBe(200);
  const closed = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation;
  expect(closed.status).toBe('closed');
  expect(closed.closedAt).toBeTruthy();
  expect(closed.tenantResolutionConfirmed).toBe(true);
  expect(closed.lifecycleEvents.filter((e) => e.eventType === 'tenant_confirmed')).toHaveLength(1);
});

test('NO requires the owner tenant and same request; reopens the same thread with history and notifies admins once', async () => {
  const { notify } = await import('../utils/notificationService.js');
  const c = await start('confirmation-no');
  await resolve(c);
  const body = { requestId: c.requestId, note: 'The concern persists.' };
  expect((await call('PATCH', mobilePath(c.id, 'reopen'), body, 'tenant-b')).status).toBe(403);
  expect((await call('PATCH', mobilePath(c.id, 'reopen'), {})).status).toBe(400);
  expect((await call('PATCH', mobilePath(c.id, 'reopen'), { requestId: 'wrong' })).status).toBe(409);
  notify.generalOnce.mockClear();
  const result = await call('PATCH', mobilePath(c.id, 'reopen'), body);
  expect(result.status).toBe(200);
  expect(result.body.conversation).toMatchObject({ id: c.id, requestId: c.requestId, status: 'open', satisfactionRating: null });
  expect(result.body.conversation.lifecycleEvents.map((e) => e.eventType)).toEqual(['admin_resolved', 'tenant_reopened']);
  expect(result.body.conversation.statusHistory.at(-1).resolutionNote).toBe('QA issue corrected.');
  const deliveries = notify.generalOnce.mock.calls.length;
  expect(deliveries).toBeGreaterThan(0);
  expect(notify.generalOnce.mock.calls.every((args) => ['admin', 'owner'].some((id) => String(people[id]._id) === String(args[0])))).toBe(true);
  expect(notify.generalOnce.mock.calls[0][2]).toContain('still unresolved');
  expect((await call('PATCH', mobilePath(c.id, 'reopen'), body)).status).toBe(409);
  await call('GET', mobilePath(c.id, 'messages'));
  expect(notify.generalOnce.mock.calls).toHaveLength(deliveries);
  expect((await call('POST', mobilePath(c.id, 'messages'), { message: 'Continuing in this thread', clientMessageId: 'after-no' })).status).toBe(200);
  expect(await db.collection('chat_messages').countDocuments({ conversationId: new mongoose.Types.ObjectId(c.id) })).toBe(2);
});

test('rating versus reopen race has exactly one winner; stale resolution revision cannot confirm a later resolution', async () => {
  const c = await start('confirmation-race');
  await resolve(c);
  const revision = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation.revision;
  const results = await Promise.all([
    call('PATCH', mobilePath(c.id, 'rating'), { requestId: c.requestId, rating: 5, revision }),
    call('PATCH', mobilePath(c.id, 'reopen'), { requestId: c.requestId, revision }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation;
  expect(saved.lifecycleEvents.filter((e) => ['tenant_confirmed', 'tenant_reopened'].includes(e.eventType))).toHaveLength(1);
  expect(saved.status === 'closed' ? saved.satisfactionRating === 5 : saved.status === 'open' && saved.satisfactionRating === null).toBe(true);
  const other = await start('stale-resolution');
  await resolve(other);
  const old = (await call('GET', mobilePath(other.id, 'messages'))).body.conversation;
  await call('PATCH', mobilePath(other.id, 'reopen'), { requestId: other.requestId });
  await resolve(other);
  expect((await call('PATCH', mobilePath(other.id, 'rating'), { requestId: other.requestId, revision: old.revision, rating: 4 })).status).toBe(409);
});

test('notification failure does not hide saved state and retries keep their event identity', async () => {
  const { notify } = await import('../utils/notificationService.js');
  const c = await start('delivery-retry');
  await resolve(c);
  const revision = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation.revision;
  notify.generalOnce.mockRejectedValueOnce(new Error('Offline delivery'));
  expect((await call('PATCH', mobilePath(c.id, 'rating'), { requestId: c.requestId, rating: 5, revision })).status).toBe(200);
  const raw = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(c.id) });
  expect(raw.supportAdminNotifications).toHaveLength(1);
  const reread = await call('GET', mobilePath(c.id, 'messages'));
  expect(reread.body.conversation.satisfactionRating).toBe(5);
  const retried = await db.collection('chat_conversations').findOne({ _id: raw._id });
  expect(retried.supportAdminNotifications).toHaveLength(0);
});

test('the explicit rating endpoint requires a valid observed revision before any mutation', async () => {
  const c = await start('required-rating-revision');
  await resolve(c);
  for (const revision of [undefined, null, '2', -1, 1.5, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    const result = await call('PATCH', mobilePath(c.id, 'rating'), { requestId: c.requestId, rating: 5, revision });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('REVISION_REQUIRED');
  }
  const saved = (await call('GET', mobilePath(c.id, 'messages'))).body.conversation;
  expect(saved.status).toBe('resolved');
  expect(saved.satisfaction).toBeNull();
  expect((await call('PATCH', mobilePath(c.id, 'rating'), { requestId: c.requestId, rating: 5, revision: saved.revision })).status).toBe(200);
});

test('legacy saved ratings stay historical; an explicit admin action upgrades only an unrated legacy thread', async () => {
  const c = await start('legacy-upgrade');
  await db.collection('chat_conversations').updateOne({ _id: new mongoose.Types.ObjectId(c.id) }, { $unset: { request: '' } });
  expect((await call('PATCH', mobilePath(c.id), { resolved: true, rating: 5 })).status).toBe(409);
  const resolved = await call('PATCH', adminPath(c.id), { status: 'resolved', note: 'Legacy issue addressed.' }, 'admin');
  expect(resolved.status).toBe(200);
  expect(resolved.body.conversation.requestId).toBeTruthy();
  expect(resolved.body.conversation.id).toBe(c.id);
  const historical = await start('legacy-rated');
  await db.collection('chat_conversations').updateOne({ _id: new mongoose.Types.ObjectId(historical.id) }, {
    $unset: { request: '' }, $set: { status: 'resolved', satisfactionRating: 4, satisfactionFeedback: 'Historical feedback' },
  });
  const before = await db.collection('chat_conversations').findOne({ _id: new mongoose.Types.ObjectId(historical.id) });
  expect((await call('PATCH', mobilePath(historical.id, 'reopen'), {})).status).toBe(409);
  expect((await call('PATCH', adminPath(historical.id), { status: 'resolved', note: 'Cannot change history' }, 'admin')).status).toBe(409);
  const saved = (await call('GET', mobilePath(historical.id, 'messages'))).body.conversation;
  expect(saved.satisfactionRating).toBe(4);
  expect(saved.lifecycleEvents.filter((e) => e.eventType === 'tenant_confirmed')).toHaveLength(1);
  expect(saved.lifecycleEvents.at(-1).message).toContain('Historical feedback');
  expect((await db.collection('chat_conversations').findOne({ _id: before._id })).request).toBeUndefined();
});
