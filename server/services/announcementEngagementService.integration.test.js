import audience from '../mobile/services/announcementAudience.service.js';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { beforeAll, afterAll, beforeEach, test, expect, jest } from '@jest/globals';
import Announcement from '../models/Announcement.js';
import Acknowledgment from '../models/AcknowledgmentAccount.js';
import { engageAnnouncement, getEngagement, getEngagements } from './announcementEngagementService.js';
let replica, announcementId, userId;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replica.getUri());
  await Acknowledgment.init();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); await replica?.stop(); });
beforeEach(async () => {
  await Promise.all([Announcement.deleteMany({}), Acknowledgment.deleteMany({})]);
  announcementId = new mongoose.Types.ObjectId(); userId = new mongoose.Types.ObjectId();
  await Announcement.collection.insertOne({ _id: announcementId, requiresAcknowledgment: true, acknowledgmentCount: 0, viewCount: 0 });
});
test('opening marks read only and preserves first read timestamp', async () => {
  const first = await engageAnnouncement({ userId, announcementId });
  expect(first.isRead).toBe(true); expect(first.acknowledged).toBe(false);
  expect(await engageAnnouncement({ userId, announcementId })).toEqual(first);
  expect((await Announcement.findById(announcementId)).viewCount).toBe(1);
});
test('concurrent first acknowledgements create one row and increment Admin counts once', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => engageAnnouncement({ userId, announcementId, acknowledge: true })));
  expect(new Set(results.map(x => x.acknowledgedAt.toISOString())).size).toBe(1);
  expect(await Acknowledgment.countDocuments({})).toBe(1);
  const doc = await Announcement.findById(announcementId);
  expect(doc.acknowledgmentCount).toBe(1); expect(doc.viewCount).toBe(1);
  expect(await getEngagement(userId, announcementId)).toEqual(results[0]);
});
test('repeated acknowledgement preserves original timestamp after a fresh read', async () => {
  const first = await engageAnnouncement({ userId, announcementId, acknowledge: true });
  await engageAnnouncement({ userId, announcementId });
  expect(await engageAnnouncement({ userId, announcementId, acknowledge: true })).toEqual(first);
});
test('ordinary announcement rejects acknowledgement without a row or count', async () => {
  await Announcement.updateOne({ _id: announcementId }, { requiresAcknowledgment: false });
  await expect(engageAnnouncement({ userId, announcementId, acknowledge: true })).rejects.toMatchObject({ statusCode: 400 });
  expect(await Acknowledgment.countDocuments({})).toBe(0);
});
test('archived or removed announcement rejects engagement', async () => {
  await Announcement.updateOne({ _id: announcementId }, { isArchived: true });
  await expect(engageAnnouncement({ userId, announcementId })).rejects.toMatchObject({ statusCode: 404 });
  await Announcement.deleteMany({});
  await expect(engageAnnouncement({ userId, announcementId })).rejects.toMatchObject({ statusCode: 404 });
});

test('batch engagement retrieval is account scoped', async () => {
  await engageAnnouncement({ userId, announcementId, acknowledge: true });
  expect((await getEngagements(userId, [announcementId])).get(String(announcementId)).acknowledged).toBe(true);
  expect((await getEngagements(new mongoose.Types.ObjectId(), [announcementId])).size).toBe(0);
});

test('concurrent reads and acknowledgements on a precreated audience row count each transition once', async () => {
 await Acknowledgment.create({ userId, announcementId });
 await Promise.all(Array.from({ length: 16 }, (_, i) => engageAnnouncement({ userId, announcementId, acknowledge: i % 2 === 0 })));
 expect(await Acknowledgment.countDocuments({ userId, announcementId })).toBe(1);
 expect(await Announcement.findById(announcementId)).toMatchObject({ viewCount: 1, acknowledgmentCount: 1 });
});
test('a counter write failure rolls the engagement write back', async () => {
 const counter = jest.spyOn(Announcement, 'updateOne').mockRejectedValueOnce(new Error('counter unavailable'));
 try {
  await expect(engageAnnouncement({ userId, announcementId, acknowledge: true })).rejects.toThrow('counter unavailable');
  expect(await Acknowledgment.countDocuments({ userId, announcementId })).toBe(0);
  expect(await Announcement.findById(announcementId)).toMatchObject({ viewCount: 0, acknowledgmentCount: 0 });
 } finally { counter.mockRestore(); }
 expect((await engageAnnouncement({ userId, announcementId, acknowledge: true })).acknowledged).toBe(true);
 expect(await Announcement.findById(announcementId)).toMatchObject({ viewCount: 1, acknowledgmentCount: 1 });
});

test('audience authorization is rechecked inside the transaction before any engagement write', async () => {
 await Announcement.updateOne({ _id: announcementId }, { targetBranch: 'guadalupe' });
 const authorize = jest.fn((doc) => doc.targetBranch === 'gil-puyat');
 await expect(engageAnnouncement({ userId, announcementId, acknowledge: true, authorize })).rejects.toMatchObject({ statusCode: 404 });
 expect(authorize).toHaveBeenCalled();
 expect(await Acknowledgment.countDocuments({})).toBe(0);
 expect(await Announcement.findById(announcementId)).toMatchObject({ acknowledgmentCount: 0, viewCount: 0 });
});

test('authorization retains legacy branch scope without applying global schema defaults', async () => {
 await Announcement.collection.updateOne({ _id: announcementId }, { $set: { branch: 'guadalupe' }, $unset: { targetBranch: '' } });
 const authorize = (announcement) => audience.canTenantViewAnnouncement({ announcement, tenantContext: { authenticated: true, mongoId: userId, branch: 'gil-puyat' } });
 await expect(engageAnnouncement({ userId, announcementId, acknowledge: true, authorize })).rejects.toMatchObject({ statusCode: 404 });
 expect(await Acknowledgment.countDocuments({})).toBe(0);
});
