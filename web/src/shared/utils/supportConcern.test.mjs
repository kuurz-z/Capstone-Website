import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupportConcern as normalize, reconcileSupportConcern, allowedSupportStatuses, supportStatusPayload, supportNotificationUrl } from './supportConcern.js';
const concern = (fields = {}) => ({ id: 'thread-A', revision: 12, status: 'closed', satisfactionRating: 1,
  request: { id: 'A', status: 'open', satisfaction: null, ...fields } });
const rating = { requestId: 'A', rating: 5, feedback: 'Thank you, resolved na po.', submittedAt: '2026-09-27T01:00:00Z' };
test('embedded request wins and an active concern does not inherit compatibility satisfaction', () => {
  const c = normalize(concern());
  assert.equal(c.conversationId, 'thread-A'); assert.equal(c.requestId, 'A');
  assert.equal(c.status, 'open'); assert.equal(c.rating, null); assert.equal(c.ratingState, 'active');
});
test('resolved and unrated', () => assert.equal(normalize(concern({ status: 'resolved' })).ratingState, 'unrated'));
test('resolved rating maps feedback, timestamp, resolution and locks lifecycle', () => {
  const c = normalize(concern({ status: 'resolved', satisfaction: rating, resolvedBy: 'admin', resolvedAt: 'today', closingNote: 'Fixed' }));
  assert.equal(c.rating, 5); assert.equal(c.feedback, rating.feedback); assert.equal(c.ratedAt, rating.submittedAt);
  assert.equal(c.resolvedBy, 'admin'); assert.equal(c.resolutionNote, 'Fixed'); assert.deepEqual(allowedSupportStatuses(c), []);
});
test('mismatched satisfaction reports identity only and cannot render a score or feedback', () => {
  const reports = [];
  const c = normalize(concern({ status: 'resolved', satisfaction: { ...rating, requestId: 'B' } }), (...args) => reports.push(args));
  assert.equal(c.rating, null); assert.equal(c.feedback, ''); assert.equal(c.ratingState, 'unavailable'); assert.equal(reports.length, 1);
});
test('Concern B remains independent of rated A', () => {
  const a = normalize(concern({ status: 'resolved', satisfaction: rating }));
  const b = normalize({ ...concern({ id: 'B' }), id: 'thread-B' });
  assert.equal(a.rating, 5); assert.equal(b.rating, null); assert.equal(b.status, 'open');
});
test('revision 11 cannot overwrite revision 12 rating, status, resolution or assignment', () => {
  const a = normalize(concern({ status: 'resolved', satisfaction: rating, assignedAdminName: 'Admin', resolvedAt: 'today' }));
  assert.equal(reconcileSupportConcern(a, { ...concern(), revision: 11 }), a);
});

test('closed ratings stay readable and an equal revision snapshot cannot erase satisfaction', () => {
  const saved = normalize(concern({ status: 'closed', satisfaction: rating }));
  assert.equal(saved.rating, 5);
  assert.equal(saved.ratingState, 'rated');
  assert.equal(reconcileSupportConcern(saved, concern({ status: 'resolved' })), saved);
});
test('legacy retains historical meaning without inventing request identity', () => {
  const c = normalize({ id: 'thread', legacy: true, requestId: null, status: 'resolved', satisfactionRating: 4 });
  assert.equal(c.requestId, null); assert.equal(c.rating, 4); assert.equal(c.ratingState, 'historical');
});
test('verified mobile flat projection is supported', () => {
  const c = normalize({ id: 'thread-A', requestId: 'A', legacy: false, revision: 4, status: 'resolved', satisfaction: rating });
  assert.equal(c.rating, 5); assert.equal(c.requestId, 'A');
});
test('allowed transitions match backend, required note trimmed and payload targeted', () => {
  assert.deepEqual(allowedSupportStatuses(normalize(concern())), ['in_review', 'waiting_tenant', 'resolved']);
  assert.ok(allowedSupportStatuses(normalize(concern({ status: 'in_review' }))).includes('waiting_tenant'));
  const c = normalize(concern({ status: 'waiting_tenant' }));
  assert.throws(() => supportStatusPayload(c, 'resolved', '  '));
  assert.throws(() => supportStatusPayload(c, 'resolved', 'x'.repeat(1001)));
  assert.equal(supportStatusPayload(normalize(concern()), 'resolved', 'Fixed').status, 'resolved');
  assert.deepEqual(supportStatusPayload(c, 'resolved', ' Fixed '), { requestId: 'A', revision: 12, status: 'resolved', note: 'Fixed' });
  assert.deepEqual(allowedSupportStatuses(normalize(concern({ status: 'closed' }))), []);
});
test('notification route preserves both identities', () => {
  assert.equal(supportNotificationUrl({ data: { request_id: 'A', conversation_id: 'thread-A' } }), '/admin/chat?requestId=A&conversationId=thread-A');
});
test('unrelated maintenance request notifications keep their existing routing', () => {
  assert.equal(supportNotificationUrl({ type: 'maintenance_update', requestId: 'maintenance-A' }), null);
});
