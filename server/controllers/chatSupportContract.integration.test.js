import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, afterAll, test, expect, jest } from '@jest/globals';
import { normalizeSupportConcern } from '../../web/src/shared/utils/supportConcern.js';

jest.setTimeout(120000);
jest.unstable_mockModule('../utils/notificationService.js', () => ({ notify: { adminReply: jest.fn().mockResolvedValue({}), general: jest.fn() } }));
jest.unstable_mockModule('../utils/socket.js', () => ({ emitToChatAdmins: jest.fn(), emitToUser: jest.fn() }));
const web = await import('./chatController.js');
const { default: Conversation } = await import('../models/ChatConversation.js');
let mongo, db, mobile, tenant, admin, a;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } });
const adminReq = (body = {}, id = a.id, actor = admin) => ({ authUser: actor, branchFilter: actor.branch, query: {}, params: { conversationId: id }, body });
const mobileReq = (body = {}, id = a?.id) => ({ user: tenant, query: {}, params: { conversationId: id }, body });
async function call(fn, req) { const res = response(); await fn(req, res); return res; }

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'admin_support_contract_test' });
  db = mongoose.connection.db;
  // Execute the actual remediated mobile controller. Only storage/push providers
  // are injected; request creation, rating mutation and serializer are real code.
  const root = process.env.LILIORA_BACKEND_ROOT || 'D:/LilyCrest/LilyCrest-Clean/backend';
  const require = createRequire(path.join(root, 'package.json'));
  require('../backend/config/database').getDb = () => db;
  require('../backend/services/pushService').notifySupportReply = async () => ({});
  mobile = require('../backend/controllers/chat.controller');
  tenant = { _id: new mongoose.Types.ObjectId(), user_id: 'contract-tenant', name: 'Contract Tenant', role: 'tenant', branch: 'gil-puyat', isActive: true };
  admin = { _id: new mongoose.Types.ObjectId(), user_id: 'contract-admin', name: 'Contract Admin', role: 'branch_admin', branch: 'gil-puyat', permissions: ['manageUsers'] };
  await db.collection('users').insertMany([tenant, admin]);
  await db.collection('chat_conversations').createIndex({ tenantUserId: 1, startRequestIds: 1 }, { unique: true });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('mobile creates A; Capstone replies/resolves; actual mobile saves 5/5; admin refetch displays same request', async () => {
  const started = await call(mobile.startConversation, mobileReq({ clientRequestId: 'contract-A', category: 'billing_concern', initialMessage: 'Please review this charge.' }));
  expect(started.statusCode).toBe(200);
  a = started.body.conversation;
  expect(a.requestId).not.toBe(a.id);
  const review = await call(web.updateAdminConversationStatus, adminReq({ status: 'in_review', requestId: a.requestId }));
  expect(review.statusCode).toBe(200);
  const reply = await call(web.sendAdminMessage, adminReq({ message: 'We reviewed the bill.', clientMessageId: 'admin-review-A' }));
  expect(reply.statusCode).toBe(200);
  expect(reply.body.conversation.request.status).toBe('waiting_tenant');
  const noNote = await call(web.updateAdminConversationStatus, adminReq({ status: 'resolved', note: '  ' }));
  expect(noNote.statusCode).toBe(400);
  const resolved = await call(web.updateAdminConversationStatus, adminReq({ status: 'resolved', note: ' Corrected the charge. ', requestId: a.requestId, revision: reply.body.conversation.revision }));
  expect(resolved.statusCode).toBe(200);
  expect(resolved.body.conversation.request.closingNote).toBe('Corrected the charge.');
  const rated = await call(mobile.confirmConversationResolution, mobileReq({ requestId: a.requestId, resolved: true, rating: 5, feedback: 'Thank you, resolved na po.' }));
  expect(rated.statusCode).toBe(200);
  // This is the real mobile HTTP projection, not a manually invented fixture.
  expect(normalizeSupportConcern(rated.body.conversation).rating).toBe(5);
  const fetched = await call(web.getAdminConversationMessages, adminReq());
  expect(fetched.statusCode).toBe(200);
  const normalized = normalizeSupportConcern(fetched.body.conversation);
  expect(normalized).toMatchObject({ requestId: a.requestId, status: 'resolved', rating: 5,
    feedback: 'Thank you, resolved na po.', resolvedBy: String(admin._id), lifecycleLocked: true });
  expect(normalized.ratedAt).toBeTruthy(); expect(normalized.resolvedAt).toBeTruthy();
  const list = await call(web.getAdminConversations, adminReq());
  expect(list.statusCode).toBe(200);
  expect(normalizeSupportConcern(list.body.conversations.find((c) => c.id === a.id)).rating).toBe(5);
});

test('rated A rejects reopen, close, assignment, priority and reply; stale revision is a conflict', async () => {
  for (const status of ['in_review', 'closed']) {
    expect((await call(web.updateAdminConversationStatus, adminReq({ status, note: 'Try changing' }))).statusCode).toBe(409);
  }
  expect((await call(web.updateAdminConversationStatus, adminReq({ status: 'in_review', revision: 0 }))).statusCode).toBe(409);
  expect((await call(web.assignAdminConversation, adminReq({ assignedAdminId: 'me' }))).statusCode).toBe(409);
  expect((await call(web.updateAdminConversationPriority, adminReq({ priority: 'urgent' }))).statusCode).toBe(409);
  expect((await call(web.sendAdminMessage, adminReq({ message: 'Another reply' }))).statusCode).toBe(409);
  expect((await call(web.closeAdminConversation, adminReq({ note: 'Try closing' }))).statusCode).toBe(409);
});

test('mobile Concern B is separate and open; A retains its immutable rating', async () => {
  const started = await call(mobile.startConversation, mobileReq({ clientRequestId: 'contract-B', category: 'billing_concern', initialMessage: 'A separate concern.' }));
  expect(started.statusCode).toBe(200);
  const b = normalizeSupportConcern(started.body.conversation);
  expect(b.requestId).not.toBe(a.requestId); expect(b.conversationId).not.toBe(a.id);
  expect(b.rating).toBeNull(); expect(b.status).toBe('open');
  expect((await call(web.updateAdminConversationStatus, adminReq({ status: 'resolved', note: 'Invalid direct resolve' }, b.id))).statusCode).toBe(409);
  expect((await call(web.updateAdminConversationStatus, adminReq({ status: 'in_review', requestId: a.requestId }, b.id))).statusCode).toBe(409);
  expect(normalizeSupportConcern((await call(web.getAdminConversationMessages, adminReq())).body.conversation).rating).toBe(5);
});

test('unauthorized cross-branch admin cannot read the rated request', async () => {
  const other = { ...admin, _id: new mongoose.Types.ObjectId(), branch: 'guadalupe' };
  expect((await call(web.getAdminConversationMessages, adminReq({}, a.id, other))).statusCode).toBe(404);
});

test('explicitly assigned cross-branch admin can read; stale compatibility projection cannot leak ratings into another queue', async () => {
  const assigned = { ...admin, _id: new mongoose.Types.ObjectId(), branch: 'guadalupe' };
  // Controlled fixture changes, not administrative mutation of a real rated request.
  await Conversation.collection.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { 'request.assignedAdminId': assigned._id } });
  expect((await call(web.getAdminConversationMessages, adminReq({}, a.id, assigned))).statusCode).toBe(200);
  await Conversation.collection.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { branch: 'guadalupe', status: 'open' } });
  const stranger = { ...assigned, _id: new mongoose.Types.ObjectId() };
  const hidden = await call(web.getAdminConversations, adminReq({}, a.id, stranger));
  expect(hidden.body.conversations.some((c) => c.id === a.id)).toBe(false);
  const req = adminReq(); req.query = { requestId: a.requestId, status: 'resolved' };
  const scoped = await call(web.getAdminConversations, req);
  expect(scoped.body.conversations).toHaveLength(1);
  expect(normalizeSupportConcern(scoped.body.conversations[0]).rating).toBe(5);
});

test('legacy rating remains historical and new requests are excluded from auto-close', async () => {
  const legacy = await Conversation.collection.insertOne({ tenantId: tenant._id, tenantName: 'Legacy Tenant', branch: 'gil-puyat', status: 'closed', satisfactionRating: 4 });
  const read = await call(web.getAdminConversationMessages, adminReq({}, String(legacy.insertedId)));
  expect(read.statusCode).toBe(200);
  expect(normalizeSupportConcern(read.body.conversation)).toMatchObject({ legacy: true, requestId: null, rating: 4, ratingState: 'historical' });
  await Conversation.collection.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { lastMessageAt: new Date(0) } });
  await web.autoCloseInactiveChatConversations();
  expect((await Conversation.collection.findOne({ _id: new mongoose.Types.ObjectId(a.id) })).request.status).toBe('resolved');
});
