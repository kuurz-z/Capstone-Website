jest.mock('./services/announcementEngagement.service', () => ({ getEngagements: jest.fn(async () => new Map()), getEngagement: jest.fn(async () => ({ isRead: false, readAt: null, acknowledged: false, acknowledgedAt: null })) }));
const mockGetDb = jest.fn();
jest.mock('./config/database.js', () => ({ getDb: (...args) => mockGetDb(...args) }));
jest.mock('./config/firebase.js', () => ({
  verifyFirebaseIdToken: jest.fn(),
  verifyTenantInFirebase: jest.fn(),
  admin: { auth: () => ({}) },
}));
jest.mock('./services/pushService.js', () => ({ notifyNewAnnouncement: jest.fn() }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid-0000-0000-0000-000000000000' }));

const express = require('express');
const http = require('http');
const { ObjectId } = require('mongodb');
const announcementRoutes = require('./routes/announcement.routes.js');

const IDS = {
  guadalupe: new ObjectId('64b000000000000000000001'),
  gilPuyat: new ObjectId('64b000000000000000000002'),
  unknown: new ObjectId('64b000000000000000000003'),
};

function makeState() {
  const users = [
    { _id: IDS.guadalupe, user_id: 'tenant-guadalupe', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 0 },
    { _id: IDS.gilPuyat, user_id: 'tenant-gil-puyat', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 0 },
    { _id: IDS.unknown, user_id: 'tenant-unknown', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 0 },
  ];
  const sessions = new Map(users.map((user) => [user.user_id, {
    user_id: user.user_id,
    session_token: user.user_id,
    security_version: 0,
    expires_at: new Date(Date.now() + 60_000),
  }]));
  const stays = [
    { tenantId: IDS.guadalupe, branch: 'guadalupe', status: 'active', leaseStartDate: new Date('2026-08-01') },
    { tenantId: IDS.gilPuyat, branch: 'gil-puyat', status: 'active', leaseStartDate: new Date('2026-08-01') },
  ];
  const announcements = [
    { _id: new ObjectId('65b000000000000000000001'), announcement_id: 'ann_guadalupe', title: 'Guadalupe notice', content: 'Branch only', targetBranch: 'guadalupe', visibility: 'tenants-only', publicationStatus: 'published', startsAt: new Date('2026-08-01'), isArchived: false },
    { _id: new ObjectId('65b000000000000000000002'), announcement_id: 'ann_gil_puyat', title: 'Gil Puyat notice', content: 'Branch only', targetBranch: 'gil-puyat', visibility: 'tenants-only', publicationStatus: 'published', startsAt: new Date('2026-08-01'), isArchived: false },
    { _id: new ObjectId('65b000000000000000000003'), announcement_id: 'ann_global', title: 'Global notice', content: 'For both', targetBranch: 'both', visibility: 'tenants-only', publicationStatus: 'published', startsAt: new Date('2026-08-01'), isArchived: false },
  ];
  return { users, sessions, stays, announcements, dismissals: [] };
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function announcementIdFromQuery(query = {}) {
  const clauses = query.$and || [query];
  for (const clause of clauses) {
    if (clause.announcement_id) return String(clause.announcement_id);
    for (const candidate of clause.$or || []) {
      if (candidate.announcement_id) return String(candidate.announcement_id);
      if (candidate._id) return String(candidate._id);
    }
  }
  return null;
}

function makeDb(state) {
  return {
    collection(name) {
      if (name === 'user_sessions') {
        return {
          findOne: async (query) => state.sessions.get(query.session_token) || null,
          deleteMany: async () => {},
        };
      }
      if (name === 'users') {
        return {
          findOne: async (query) => state.users.find((user) => user.user_id === query.user_id) || null,
          find: () => ({ toArray: async () => state.users }),
        };
      }
      if (name === 'login_attempts') return { insertOne: async () => {} };
      if (name === 'stays') {
        return { findOne: async (query) => state.stays.find((stay) => sameId(stay.tenantId, query.tenantId)) || null };
      }
      if (['bedhistories', 'reservations', 'rooms', 'contracts'].includes(name)) {
        return { findOne: async () => null };
      }
      if (name === 'announcements') {
        return {
          find: () => ({ sort: () => ({ toArray: async () => state.announcements }) }),
          findOne: async (query) => {
            const wanted = announcementIdFromQuery(query);
            return state.announcements.find((announcement) =>
              sameId(announcement.announcement_id, wanted) || sameId(announcement._id, wanted)) || null;
          },
        };
      }
      if (name === 'announcement_dismissals') {
        return {
          find: (query) => ({
            project: () => ({ toArray: async () => state.dismissals.filter((row) => row.user_id === query.user_id) }),
          }),
          updateOne: async () => {},
          bulkWrite: async () => {},
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/m/announcements', announcementRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path = '', token = null) {
  const response = await fetch(`${baseUrl}/api/m/announcements${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

describe('mounted /api/m/announcements canonical audience isolation', () => {
  let state;

  beforeEach(() => {
    state = makeState();
    mockGetDb.mockReturnValue(makeDb(state));
  });

  test('CASE A: Guadalupe-only is visible to an authenticated Guadalupe tenant', async () => {
    await withServer(async (baseUrl) => {
      const result = await request(baseUrl, '', 'tenant-guadalupe');
      expect(result.status).toBe(200);
      expect(result.body.map((item) => item.announcement_id)).toEqual(
        expect.arrayContaining(['ann_guadalupe', 'ann_global']),
      );
    });
  });

  test('CASE B: Guadalupe-only is absent for Gil Puyat and direct detail returns 404', async () => {
    await withServer(async (baseUrl) => {
      const list = await request(baseUrl, '', 'tenant-gil-puyat');
      expect(list.body.map((item) => item.announcement_id)).not.toContain('ann_guadalupe');
      expect((await request(baseUrl, '/ann_guadalupe', 'tenant-gil-puyat')).status).toBe(404);
    });
  });

  test('CASE C: Gil Puyat-only has the inverse branch behavior', async () => {
    await withServer(async (baseUrl) => {
      const gil = await request(baseUrl, '', 'tenant-gil-puyat');
      const guadalupe = await request(baseUrl, '', 'tenant-guadalupe');
      expect(gil.body.map((item) => item.announcement_id)).toContain('ann_gil_puyat');
      expect(guadalupe.body.map((item) => item.announcement_id)).not.toContain('ann_gil_puyat');
    });
  });

  test('CASE D: targetBranch=both is visible to both authorized branches', async () => {
    await withServer(async (baseUrl) => {
      for (const token of ['tenant-guadalupe', 'tenant-gil-puyat']) {
        const result = await request(baseUrl, '', token);
        expect(result.body.map((item) => item.announcement_id)).toContain('ann_global');
      }
    });
  });

  test('CASE E: unresolved branch exposes global but fails closed on branch-scoped items', async () => {
    await withServer(async (baseUrl) => {
      const result = await request(baseUrl, '', 'tenant-unknown');
      expect(result.body.map((item) => item.announcement_id)).toEqual(['ann_global']);
    });
  });

  test('CASE F: unauthenticated News requests reveal no tenant announcement content', async () => {
    await withServer(async (baseUrl) => {
      const result = await request(baseUrl);
      expect(result.status).toBe(401);
      expect(JSON.stringify(result.body)).not.toContain('Guadalupe notice');
    });
  });

  test('CASE H: authorized direct-ID retrieval succeeds only inside the announcement audience', async () => {
    await withServer(async (baseUrl) => {
      expect((await request(baseUrl, '/ann_guadalupe', 'tenant-guadalupe')).status).toBe(200);
      expect((await request(baseUrl, '/ann_guadalupe', 'tenant-gil-puyat')).status).toBe(404);
    });
  });
});
