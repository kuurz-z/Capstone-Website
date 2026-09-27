import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const axiosPost = jest.fn(async () => ({ data: { data: [{ status: "ok" }] } }));

await jest.unstable_mockModule("axios", () => ({
  default: { post: axiosPost },
}));

await jest.unstable_mockModule("../../middleware/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

await jest.unstable_mockModule("../../utils/socket.js", () => ({
  emitToUser: jest.fn(),
}));

const { notify } = await import("./notificationService.js");
const Notification = (await import("../../models/Notification.js")).default;
const {
  dismissNotification,
  listUserNotifications,
} = await import("../mobileNotificationBridge.js");

let mongod;
let tenantGil;
let tenantGilPeer;
let tenantGuadalupe;

async function seedTenant(label, branch) {
  const _id = new mongoose.Types.ObjectId();
  const user_id = `tenant-${label}`;
  await mongoose.connection.db.collection("users").insertOne({
    _id,
    user_id,
    firebaseUid: `firebase-${label}`,
    email: `${label}@example.test`,
    username: label,
    role: "tenant",
    branch,
    push_token: `ExponentPushToken[${label}]`,
  });
  await mongoose.connection.db.collection("stays").insertOne({
    tenantId: _id,
    branch,
    status: "active",
  });
  return { _id, user_id, branch };
}

async function feedFor(tenant) {
  return listUserNotifications(
    mongoose.connection.db,
    tenant.user_id,
    tenant._id,
  );
}

async function dismissFor(tenant, notification) {
  return dismissNotification(
    mongoose.connection.db,
    tenant.user_id,
    notification.notification_id,
    tenant._id,
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "phase2_notification_events" });
  await Notification.syncIndexes();
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
}, 60_000);

beforeEach(async () => {
  axiosPost.mockReset();
  axiosPost.mockResolvedValue({ data: { data: [{ status: "ok" }] } });
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
  tenantGil = await seedTenant("gil", "gil-puyat");
  tenantGilPeer = await seedTenant("gil-peer", "gil-puyat");
  tenantGuadalupe = await seedTenant("guadalupe", "guadalupe");
});

describe("Phase 2 canonical event persistence and mobile feed", () => {
  test('support reopen outbox delivers one persisted notification per authorized admin across concurrent retries', async () => {
    const { reconcileSupport } = await import('../supportRequestService.js');
    await mongoose.connection.db.collection('users').updateOne({ _id: tenantGilPeer._id }, { $set: {
      role: 'branch_admin', permissions: ['manageUsers'], accountStatus: 'active', isArchived: false,
    } });
    const id = new mongoose.Types.ObjectId();
    const requestId = String(new mongoose.Types.ObjectId());
    await mongoose.connection.db.collection('chat_conversations').insertOne({ _id: id,
      tenantUserId: tenantGil.user_id, tenantId: tenantGil._id,
      request: { id: requestId, branch: 'gil-puyat', status: 'open', assignedAdminId: tenantGilPeer._id },
      supportAdminNotifications: [{ eventId: 'reopened-event', eventType: 'tenant_reopened' }],
    });
    await Promise.all([reconcileSupport(mongoose.connection.db, id), reconcileSupport(mongoose.connection.db, id)]);
    await reconcileSupport(mongoose.connection.db, id);
    const notices = await Notification.find({ entityId: String(id) }).lean();
    expect(notices).toHaveLength(1);
    expect(String(notices[0].userId)).toBe(String(tenantGilPeer._id));
    expect(notices[0].message).toContain('still unresolved');
    expect(notices[0].data).toMatchObject({ conversationId: String(id), requestId });
    expect(notices[0].actionUrl).toContain(requestId);
    expect((await mongoose.connection.db.collection('chat_conversations').findOne({ _id: id })).supportAdminNotifications).toEqual([]);
  });
  test("contract prepared retry dedupes, final remains distinct after dismissal, and recipient ownership is exact", async () => {
    const contractId = new mongoose.Types.ObjectId();

    await notify.contractDocumentReady(tenantGil._id, "prepared", contractId, 1);
    await notify.contractDocumentReady(tenantGil._id, "prepared", contractId, 1);

    let feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "contract_document_ready",
      contract_id: String(contractId),
      url: "/contract-viewer",
    });
    expect(await feedFor(tenantGilPeer)).toEqual([]);
    expect(await feedFor(tenantGuadalupe)).toEqual([]);

    expect((await dismissFor(tenantGil, feed[0])).status).toBe(200);
    await notify.contractDocumentReady(tenantGil._id, "final", contractId, 1);

    feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Final Contract Ready");
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);
  });

  test("persisted admin message identity dedupes the same reply but permits the next reply after dismissal", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const messageOne = new mongoose.Types.ObjectId();
    const messageTwo = new mongoose.Types.ObjectId();

    await notify.adminReply(tenantGil._id, conversationId, messageOne);
    await notify.adminReply(tenantGil._id, conversationId, messageOne);

    let feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "chat_reply",
      conversation_id: String(conversationId),
      url: "/(tabs)/chatbot",
    });
    const legacyNotice = await Notification.findOne({ userId: tenantGil._id });
    expect(legacyNotice.message).toContain('Confirm whether your concern was resolved.');
    expect(await feedFor(tenantGilPeer)).toEqual([]);
    expect(await feedFor(tenantGuadalupe)).toEqual([]);

    await dismissFor(tenantGil, feed[0]);
    await notify.adminReply(tenantGil._id, conversationId, messageTwo);

    feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0].dedup_key).toBe(`chat_reply:${conversationId}:${messageTwo}`);
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);
  });

  test("request status notification persists the request identity and tenant-scoped push payload", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    const requestId = String(new mongoose.Types.ObjectId());
    const event = { requestId, status: 'resolved', durable: true, message: 'Your support inquiry was marked as resolved. Please confirm if your concern has been addressed.' };
    const first = await notify.adminReply(tenantGil._id, conversationId, eventId, event);
    const retry = await notify.adminReply(tenantGil._id, conversationId, eventId, event);
    expect(String(retry._id)).toBe(String(first._id));
    const notices = await Notification.find({ userId: tenantGil._id }).lean();
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('Please confirm your inquiry is resolved');
    expect(notices[0]).toMatchObject({ message: event.message,
      data: { requestId, conversationId: String(conversationId) } });
    const pushes = axiosPost.mock.calls.flatMap(([, body]) => Array.isArray(body) ? body : [body]);
    expect(pushes.some((push) => push.data?.requestId === requestId
      && push.data?.conversation_id === String(conversationId))).toBe(true);
    expect(await feedFor(tenantGilPeer)).toEqual([]);
  });

  test("bill release retry dedupes while a later persisted payment event remains visible after dismissal", async () => {
    const billId = new mongoose.Types.ObjectId();
    const paymentId = new mongoose.Types.ObjectId();
    const releaseOptions = {
      billId,
      billType: "rent",
      actionUrl: `/bill-details?billId=${billId}`,
      eventId: "invoice:1",
    };

    await notify.billGenerated(tenantGil._id, "August 2026", 5_400, "August 31, 2026", releaseOptions);
    await notify.billGenerated(tenantGil._id, "August 2026", 5_400, "August 31, 2026", releaseOptions);

    let feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "bill_generated",
      billing_id: String(billId),
      url: `/bill-details?billId=${billId}`,
    });
    expect(await feedFor(tenantGilPeer)).toEqual([]);
    expect(await feedFor(tenantGuadalupe)).toEqual([]);

    await dismissFor(tenantGil, feed[0]);
    await notify.paymentApproved(tenantGil._id, "August 2026", 5_400, {
      billId,
      eventId: paymentId,
    });

    feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "payment_confirmed",
      billing_id: String(billId),
    });
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);
  });

  test("a persisted overdue notice dedupes on its notice ID while a later notice stage remains distinct", async () => {
    const billId = new mongoose.Types.ObjectId();
    const noticeOneId = new mongoose.Types.ObjectId();
    const noticeTwoId = new mongoose.Types.ObjectId();
    const baseNotice = {
      notificationType: "bill_due_reminder",
      title: "Payment Reminder: Overdue Rent Balance",
      message: "Your released bill is overdue.",
      billId,
      pushType: "overdue_notice",
    };

    await notify.billingNotice(tenantGil._id, { ...baseNotice, eventId: noticeOneId });
    await notify.billingNotice(tenantGil._id, { ...baseNotice, eventId: noticeOneId });
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(1);

    const firstFeed = await feedFor(tenantGil);
    await dismissFor(tenantGil, firstFeed[0]);
    await notify.billingNotice(tenantGil._id, {
      ...baseNotice,
      title: "URGENT DEMAND: Overdue Rent Notice",
      eventId: noticeTwoId,
    });

    const freshFeed = await feedFor(tenantGil);
    expect(freshFeed).toHaveLength(1);
    expect(freshFeed[0].title).toBe("URGENT DEMAND: Overdue Rent Notice");
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);
    expect(await feedFor(tenantGilPeer)).toEqual([]);
    expect(await feedFor(tenantGuadalupe)).toEqual([]);
  });

  test("scheduled due and persisted penalty events dedupe the same observation without collapsing later events", async () => {
    const billId = new mongoose.Types.ObjectId();
    const penaltyAppliedAt = new Date("2026-08-18T00:10:00.000Z");

    await notify.billDueReminder(tenantGil._id, "August 2026", 5_400, 3, {
      billId,
      eventId: "due:3",
    });
    await notify.billDueReminder(tenantGil._id, "August 2026", 5_400, 3, {
      billId,
      eventId: "due:3",
    });
    await notify.penaltyApplied(tenantGil._id, "August 2026", 50, 1, {
      billId,
      eventId: penaltyAppliedAt,
    });
    await notify.penaltyApplied(tenantGil._id, "August 2026", 50, 1, {
      billId,
      eventId: penaltyAppliedAt,
    });

    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);

    await notify.billDueReminder(tenantGil._id, "August 2026", 5_400, 0, {
      billId,
      eventId: "due:0",
    });
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(3);
  });

  test("maintenance events are event-specific, tenant-scoped, and exclude provider-private data", async () => {
    const requestId = "maint_phase2_001";
    const requestSource = {
      request_id: requestId,
      privateContact: "09171234567",
      quotedCost: 12500,
      internalNotes: "Negotiated private discount",
    };
    const assignmentOptions = { eventId: "service_provider_assigned:2026-08-18T00:00:00.000Z" };

    await notify.maintenanceProviderAssigned(
      tenantGil._id,
      "plumbing",
      "Authorized Plumbing Specialist",
      requestId,
      assignmentOptions,
    );
    await notify.maintenanceProviderAssigned(
      tenantGil._id,
      "plumbing",
      "Authorized Plumbing Specialist",
      requestId,
      assignmentOptions,
    );

    let feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "maintenance_update",
      request_id: requestId,
      url: "/(tabs)/services",
    });
    expect(feed[0].body).toContain("Authorized Plumbing Specialist");
    expect(feed[0].body).not.toContain(requestSource.privateContact);
    expect(feed[0].body).not.toContain(String(requestSource.quotedCost));
    expect(feed[0].body).not.toContain(requestSource.internalNotes);
    expect(await feedFor(tenantGilPeer)).toEqual([]);
    expect(await feedFor(tenantGuadalupe)).toEqual([]);

    await dismissFor(tenantGil, feed[0]);
    await notify.maintenanceUpdated(
      tenantGil._id,
      "plumbing",
      "resolved",
      requestId,
      { statusChanged: true, eventId: "status:2026-08-18T01:00:00.000Z" },
    );

    feed = await feedFor(tenantGil);
    expect(feed).toHaveLength(1);
    expect(feed[0].dedup_key).toContain("maintenance_update");
    expect(await Notification.countDocuments({ userId: tenantGil._id })).toBe(2);
    expect(requestSource).toEqual({
      request_id: requestId,
      privateContact: "09171234567",
      quotedCost: 12500,
      internalNotes: "Negotiated private discount",
    });
  });
});
