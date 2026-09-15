jest.mock('../services/announcementEngagement.service', () => ({ engageAnnouncement: jest.fn(async ({ acknowledge }) => ({ isRead: true, acknowledged: acknowledge, acknowledgedAt: acknowledge ? new Date("2026-09-15") : null })), getEngagements: jest.fn(async () => new Map()), getEngagement: jest.fn(async () => ({ isRead: false, readAt: null, acknowledged: false, acknowledgedAt: null })) }));
const mockGetDb = jest.fn();
jest.mock('../config/database.js', () => ({ getDb: (...args) => mockGetDb(...args) }));
jest.mock('../services/pushService.js', () => ({ notifyNewAnnouncement: jest.fn() }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid-0000-0000-0000-000000000000' }));

const {
  getAllAnnouncements,
  dismissAnnouncement,
  dismissAnnouncementsBulk,
  restoreAnnouncement,
} = require('./announcement.controller.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function makeDb({ announcements = [], branchSource = null, users = [], dismissals = [] } = {}) {
  const dismissalStore = [...dismissals];
  return {
    collection(name) {
      if (name === 'announcements') {
        return {
          find: (query) => {
            let docs = announcements;
            const idClause = query?.$and?.find(
              (clause) => Array.isArray(clause.$or) && clause.$or.some((c) => c.announcement_id !== undefined || c._id !== undefined),
            );
            if (idClause) {
              const wantedIds = idClause.$or.map((c) => c.announcement_id).filter(Boolean);
              docs = docs.filter((doc) => wantedIds.includes(doc.announcement_id));
            }
            return { sort: () => ({ toArray: async () => docs }), toArray: async () => docs };
          },
          findOne: async (query) => {
            const wantedId = query?.announcement_id
              || query?.$or?.map((clause) => clause.announcement_id).find(Boolean)
              || query?.$and?.map((clause) => clause.announcement_id).find(Boolean);
            return announcements.find((doc) => doc.announcement_id === wantedId) || null;
          },
        };
      }
      if (name === 'users') {
        return { find: () => ({ toArray: async () => users }) };
      }
      if (name === 'roomoccupancyhistories') {
        return { findOne: async () => (branchSource?.tier === 'occupancy' ? branchSource.doc : null) };
      }
      if (name === 'stays') {
        return { findOne: async () => (['stay', 'occupancy'].includes(branchSource?.tier) ? branchSource.doc : null) };
      }
      if (name === 'bedhistories') {
        return { findOne: async () => (branchSource?.tier === 'bedhistory' ? branchSource.doc : null) };
      }
      if (name === 'reservations') {
        return { findOne: async () => (branchSource?.tier === 'reservation' ? branchSource.doc : null) };
      }
      if (name === 'rooms') {
        return { findOne: async () => {
          if (!['reservation', 'room'].includes(branchSource?.tier)) return null;
          return { branch: branchSource?.doc?.roomBranch || branchSource?.doc?.branch || null };
        } };
      }
      if (name === 'contracts') {
        return { findOne: async () => (branchSource?.tier === 'contract' ? branchSource.doc : null) };
      }
      if (name === 'announcement_dismissals') {
        return {
          find: (query) => ({
            project: () => ({
              toArray: async () => dismissalStore.filter((row) => row.user_id === query.user_id),
            }),
          }),
          updateOne: async (filter, update) => {
            const existing = dismissalStore.find(
              (row) => row.user_id === filter.user_id && row.announcement_id === filter.announcement_id,
            );
            if (existing) {
              Object.assign(existing, update.$set);
            } else {
              dismissalStore.push({ ...filter, ...update.$set, ...update.$setOnInsert });
            }
            return { acknowledged: true };
          },
          bulkWrite: async (operations) => {
            operations.forEach(({ updateOne: { filter, update } }) => {
              const existing = dismissalStore.find(
                (row) => row.user_id === filter.user_id && row.announcement_id === filter.announcement_id,
              );
              if (existing) {
                Object.assign(existing, update.$set);
              } else {
                dismissalStore.push({ ...filter, ...update.$set, ...update.$setOnInsert });
              }
            });
            return { acknowledged: true };
          },
          deleteOne: async (filter) => {
            const index = dismissalStore.findIndex(
              (row) => row.user_id === filter.user_id && row.announcement_id === filter.announcement_id,
            );
            if (index >= 0) dismissalStore.splice(index, 1);
            return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
    __dismissalStore: dismissalStore,
  };
}

describe('announcement.controller getAllAnnouncements — branch visibility', () => {
  beforeEach(() => { mockGetDb.mockReset(); });

  test('a tenant at Branch A does not receive an announcement targeted at Branch B', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [
        { announcement_id: 'a1', title: 'Branch B notice', content: 'x', branch: 'gil-puyat' },
      ],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body).toEqual([]);
  });

  test('a tenant receives an announcement targeted at their own branch', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [
        { announcement_id: 'a1', title: 'Guadalupe notice', content: 'x', branch: 'guadalupe' },
      ],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.length).toBe(1);
    expect(res.body[0].announcement_id).toBe('a1');
  });

  test('a global announcement (no branch field) is visible to every tenant regardless of their own branch', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Global notice', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.length).toBe(1);
  });

  test('a branch-restricted announcement is hidden (fails closed) when the requester branch cannot be confirmed', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Restricted', content: 'x', branch: 'gil-puyat' }],
      branchSource: null,
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body).toEqual([]);
  });

  test('a legacy roomoccupancyhistories record keyed under branchId (not branch) still resolves branch correctly', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [
        { announcement_id: 'a1', title: 'Guadalupe notice', content: 'x', branch: 'guadalupe' },
        { announcement_id: 'a2', title: 'Gil Puyat notice', content: 'x', branch: 'gil-puyat' },
      ],
      branchSource: { tier: 'occupancy', doc: { branchId: 'guadalupe' } },
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.map((a) => a.announcement_id)).toEqual(['a1']);
  });

  test('a private (user-targeted) announcement bypasses branch filtering entirely', async () => {
    mockGetDb.mockReturnValue(makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Just for you', content: 'x', is_private: true, user_id: 't1', branch: 'gil-puyat' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.length).toBe(1);
  });

  test('resolves admin author name from user ID and never exposes raw hex ObjectId', async () => {
    const adminObjectId = '69bb9249dcab8f0bf467a0f4';
    mockGetDb.mockReturnValue(makeDb({
      announcements: [
        {
          announcement_id: 'a1',
          title: 'Renovation update',
          content: 'x',
          publishedBy: adminObjectId,
        },
      ],
      users: [
        {
          _id: adminObjectId,
          firstName: 'Joanne',
          lastName: 'Ong',
          role: 'admin',
        },
      ],
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.length).toBe(1);
    expect(res.body[0].author_name).toBe('Joanne Ong (Admin)');
    expect(res.body[0].author_name).not.toContain(adminObjectId);
  });

  test('falls back to LilyCrest Admin if author ID cannot be resolved, never exposing raw hex', async () => {
    const unknownAdminId = '69bb9249dcab8f0bf467a0f4';
    mockGetDb.mockReturnValue(makeDb({
      announcements: [
        {
          announcement_id: 'a1',
          title: 'General announcement',
          content: 'x',
          publishedBy: unknownAdminId,
        },
      ],
      users: [],
    }));
    const req = { user: { user_id: 't1', _id: 'mongo1' } };
    const res = response();
    await getAllAnnouncements(req, res);
    expect(res.body.length).toBe(1);
    expect(res.body[0].author_name).toBe('LilyCrest Admin');
    expect(res.body[0].author_name).not.toBe(unknownAdminId);
  });
});

describe('announcement.controller dismissAnnouncement — News-tab-only per-tenant hide', () => {
  beforeEach(() => { mockGetDb.mockReset(); });

  test('dismissing an announcement removes it from that tenant\'s own News tab feed', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Global notice', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } };
    const dismissRes = response();
    await dismissAnnouncement(req, dismissRes);
    expect(dismissRes.statusCode).toBe(200);
    expect(dismissRes.body.status).toBe('dismissed');

    const listRes = response();
    // A distinct request object represents a fresh authenticated session.
    await getAllAnnouncements({ user: { user_id: 't1', _id: 'mongo1' } }, listRes);
    expect(listRes.body).toEqual([]);
    expect((await db.collection('announcements').find().sort().toArray())).toHaveLength(1);
  });

  test('Undo restores the same tenant\'s archived announcement without mutating the shared document', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Global notice', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);
    const req = { user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } };

    await dismissAnnouncement(req, response());
    expect(db.__dismissalStore).toHaveLength(1);

    const restoreRes = response();
    await restoreAnnouncement(req, restoreRes);
    expect(restoreRes.body).toEqual({ status: 'restored', announcement_id: 'a1' });
    expect(db.__dismissalStore).toHaveLength(0);

    const listRes = response();
    await getAllAnnouncements(req, listRes);
    expect(listRes.body.map((item) => item.announcement_id)).toEqual(['a1']);
  });

  test('dismissal never mutates or deletes the shared announcement document — it stays visible to every other tenant', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Global notice', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const dismisser = { user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } };
    await dismissAnnouncement(dismisser, response());

    // The underlying document is untouched.
    expect(db.__dismissalStore.length).toBe(1);
    const rawDoc = (await db.collection('announcements').find().sort().toArray())[0];
    expect(rawDoc).toEqual({ announcement_id: 'a1', title: 'Global notice', content: 'x' });

    // A different tenant still sees it — dismissal is per-tenant, not global.
    const otherTenant = { user: { user_id: 't2', _id: 'mongo2' } };
    const otherRes = response();
    await getAllAnnouncements(otherTenant, otherRes);
    expect(otherRes.body.length).toBe(1);
  });

  test('dismissing an announcement never affects that tenant\'s Home bell feed (separate persistence, not shared with notification_dismissals)', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Global notice', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } };
    await dismissAnnouncement(req, response());

    // dismissAnnouncement only ever wrote to announcement_dismissals, never
    // to notification_dismissals (the Home bell's own collection) — proven
    // here by the mock db throwing on any other collection name it wasn't
    // told to expect, which it did not.
    expect(db.__dismissalStore).toEqual([
      expect.objectContaining({ user_id: 't1', announcement_id: 'a1' }),
    ]);
  });

  test('cannot dismiss an announcement outside the caller\'s own branch (404, not a silent no-op)', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'a1', title: 'Branch B notice', content: 'x', branch: 'gil-puyat' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } };
    const res = response();
    await dismissAnnouncement(req, res);

    expect(res.statusCode).toBe(404);
    expect(db.__dismissalStore.length).toBe(0);
  });

  test('unauthenticated dismiss attempt is rejected (401), never resolved to a guessed tenant', async () => {
    const db = makeDb({ announcements: [{ announcement_id: 'a1', title: 'x', content: 'x' }] });
    mockGetDb.mockReturnValue(db);

    const req = { user: null, params: { announcementId: 'a1' } };
    const res = response();
    await dismissAnnouncement(req, res);

    expect(res.statusCode).toBe(401);
  });
});

describe('announcement.controller dismissAnnouncementsBulk — batched News-tab-only per-tenant hide', () => {
  beforeEach(() => { mockGetDb.mockReset(); });

  test('bulk-dismissing several announcements hides all of them from that tenant\'s News tab only', async () => {
    const db = makeDb({
      announcements: [
        { announcement_id: 'ann_a1', title: 'One', content: 'x' },
        { announcement_id: 'ann_a2', title: 'Two', content: 'x' },
        { announcement_id: 'ann_a3', title: 'Three', content: 'x' },
      ],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, body: { ids: ['ann_a1', 'ann_a2'] } };
    const res = response();
    await dismissAnnouncementsBulk(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'dismissed', announcement_ids: ['ann_a1', 'ann_a2'] });

    const listReq = { user: { user_id: 't1', _id: 'mongo1' } };
    const listRes = response();
    await getAllAnnouncements(listReq, listRes);
    expect(listRes.body.map((a) => a.announcement_id)).toEqual(['ann_a3']);

    // Never mutates the shared documents or another tenant's view.
    const otherRes = response();
    await getAllAnnouncements({ user: { user_id: 't2', _id: 'mongo2' } }, otherRes);
    expect(otherRes.body.length).toBe(3);
  });

  test('rejects the whole batch (404) if any id does not exist, and writes no dismissal rows at all', async () => {
    const db = makeDb({
      announcements: [{ announcement_id: 'ann_a1', title: 'One', content: 'x' }],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, body: { ids: ['ann_a1', 'ann_doesnotexist1'] } };
    const res = response();
    await dismissAnnouncementsBulk(req, res);

    expect(res.statusCode).toBe(404);
    expect(db.__dismissalStore.length).toBe(0);
  });

  test('rejects a batch containing an announcement outside the caller\'s own branch (404), writes nothing', async () => {
    const db = makeDb({
      announcements: [
        { announcement_id: 'ann_a1', title: 'Own branch', content: 'x', branch: 'guadalupe' },
        { announcement_id: 'ann_a2', title: 'Other branch', content: 'x', branch: 'gil-puyat' },
      ],
      branchSource: { tier: 'occupancy', doc: { branch: 'guadalupe' } },
    });
    mockGetDb.mockReturnValue(db);

    const req = { user: { user_id: 't1', _id: 'mongo1' }, body: { ids: ['ann_a1', 'ann_a2'] } };
    const res = response();
    await dismissAnnouncementsBulk(req, res);

    expect(res.statusCode).toBe(404);
    expect(db.__dismissalStore.length).toBe(0);
  });

  test('rejects an empty ids array (400)', async () => {
    const db = makeDb({ announcements: [] });
    mockGetDb.mockReturnValue(db);
    const res = response();
    await dismissAnnouncementsBulk({ user: { user_id: 't1' }, body: { ids: [] } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('rejects more than 100 ids (400)', async () => {
    const db = makeDb({ announcements: [] });
    mockGetDb.mockReturnValue(db);
    const tooMany = Array.from({ length: 101 }, (_, i) => `ann_${i.toString(16).padStart(8, '0')}`);
    const res = response();
    await dismissAnnouncementsBulk({ user: { user_id: 't1' }, body: { ids: tooMany } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('rejects malformed ids (400)', async () => {
    const db = makeDb({ announcements: [] });
    mockGetDb.mockReturnValue(db);
    const res = response();
    await dismissAnnouncementsBulk({ user: { user_id: 't1' }, body: { ids: ['<script>alert(1)</script>'] } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('unauthenticated bulk-dismiss attempt is rejected (401)', async () => {
    const db = makeDb({ announcements: [{ announcement_id: 'a1', title: 'x', content: 'x' }] });
    mockGetDb.mockReturnValue(db);
    const res = response();
    await dismissAnnouncementsBulk({ user: null, body: { ids: ['a1'] } }, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('mobile engagement audience and explicit intent', () => {
  const controller = require('./announcement.controller');
  const service = require('../services/announcementEngagement.service');
  beforeEach(() => jest.clearAllMocks());
  test('read delegates canonical Mongo IDs without acknowledgement', async () => {
    mockGetDb.mockReturnValue(makeDb({ announcements: [{ _id: 'canonical', announcement_id: 'a1', content: 'x', requiresAcknowledgment: true }] }));
    const res = response();
    await controller.markRead({ user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(service.engageAnnouncement).toHaveBeenCalledWith({ userId: 'mongo1', announcementId: 'canonical', acknowledge: false, authorize: expect.any(Function) });
    expect(res.body).toMatchObject({ requiresAcknowledgment: true, isRead: true, acknowledged: false, acknowledgedAt: null });
  });
  test('explicit action acknowledges and returns canonical DTO', async () => {
    mockGetDb.mockReturnValue(makeDb({ announcements: [{ _id: 'canonical', announcement_id: 'a1', content: 'x', requiresAcknowledgment: true }] }));
    const res = response();
    await controller.acknowledge({ user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } }, res);
    expect(res.body.acknowledged).toBe(true);
    expect(service.engageAnnouncement).toHaveBeenCalledWith({ userId: 'mongo1', announcementId: 'canonical', acknowledge: true, authorize: expect.any(Function) });
  });
  test.each([{ isArchived: true }, { is_private: true, user_id: 'other' }, { branch: 'guadalupe' }])('invisible announcement prevents all writes %j', async (fields) => {
    mockGetDb.mockReturnValue(makeDb({ announcements: [{ announcement_id: 'a1', content: 'x', ...fields }] }));
    const res = response();
    await controller.acknowledge({ user: { user_id: 't1', _id: 'mongo1' }, params: { announcementId: 'a1' } }, res);
    expect(res.statusCode).toBe(404); expect(service.engageAnnouncement).not.toHaveBeenCalled();
  });
});
