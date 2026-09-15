const mockGetDb = jest.fn();
jest.mock('./config/database.js', () => ({ getDb: (...args) => mockGetDb(...args) }));
jest.mock('./config/firebase.js', () => ({ verifyFirebaseIdToken: jest.fn(), verifyTenantInFirebase: jest.fn(), admin: { auth: () => ({}) } }));
jest.mock('./controllers/auth.controller.js', () => ({
  register: (_q, r) => r.sendStatus(410), login: jest.fn(), googleSignIn: jest.fn(), verifyOtp: jest.fn(), resendOtp: jest.fn(), logout: jest.fn(), changePassword: jest.fn(), forgotPassword: jest.fn(), getResetPasswordPage: jest.fn(), resetPassword: jest.fn(),
  getMe: (q, r) => r.json({ userId: q.user.user_id, role: q.user.role }),
}));
jest.mock('./controllers/dashboard.controller.js', () => ({ getDashboard: (q, r) => r.json({ tenant: q.user.user_id }) }));
jest.mock('./controllers/announcement.controller.js', () => ({
  getAllAnnouncements: (q, r) => r.json({ visibility: q.user ? 'private' : 'public', userId: q.user?.user_id || null }),
  getAnnouncementDetail: (q, r) => r.json({ announcementId: q.params.announcementId, userId: q.user?.user_id || null }),
  markRead: (q, r) => r.json({ isRead: true, acknowledged: false, userId: q.user.user_id }),
  acknowledge: (q, r) => r.json({ acknowledged: true, userId: q.user.user_id }),
  createAnnouncement: (q, r) => r.json({ admin: q.user.user_id }),
  dismissAnnouncement: (q, r) => r.json({ status: 'dismissed', userId: q.user?.user_id || null }),
  dismissAnnouncementsBulk: (q, r) => r.json({ status: 'dismissed', userId: q.user?.user_id || null }),
  restoreAnnouncement: (q, r) => r.json({ status: 'restored', userId: q.user?.user_id || null }),
}));

const express = require('express'); const http = require('http');
const authRoutes = require('./routes/auth.routes.js'); const dashboardRoutes = require('./routes/dashboard.routes.js'); const announcementRoutes = require('./routes/announcement.routes.js');
const wrapper = require('./middleware/auth.js'); const { createMobileAuth } = require('./security/mobileAuthCore.js');

const state = { users: new Map(), sessions: new Map(), deleted: [] };
const db = { collection(name) {
  if (name === 'user_sessions') return { async findOne(q) { const s = state.sessions.get(q.session_token); return s && s.expires_at > new Date() ? { ...s } : null; }, async deleteMany(q) { state.deleted.push(q); for (const [key, value] of state.sessions) if (value.user_id === q.user_id || key === q.session_token) state.sessions.delete(key); } };
  if (name === 'users') return { async findOne(q) { return state.users.get(q.user_id) || null; } };
  if (name === 'login_attempts') return { async insertOne() {} };
  throw new Error(name);
} };

function add(token, user, session = {}) { state.users.set(user.user_id, user); state.sessions.set(token, { user_id: user.user_id, session_token: token, security_version: 0, expires_at: new Date(Date.now() + 60000), ...session }); }
async function request(path, { token, cookie, query = '', method = 'GET', body = {} } = {}) {
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.cookies = {}; const match = /session_token=([^;]+)/.exec(req.headers.cookie || ''); if (match) req.cookies.session_token = decodeURIComponent(match[1]); next(); });
  app.use('/api/m/auth', authRoutes); app.use('/api/m/dashboard', dashboardRoutes); app.use('/api/m/announcements', announcementRoutes);
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { const response = await fetch(`http://127.0.0.1:${server.address().port}${path}${query}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie: `session_token=${cookie}` } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

describe('mounted mobile route authentication', () => {
  beforeEach(() => { state.users.clear(); state.sessions.clear(); state.deleted = []; mockGetDb.mockReturnValue(db); });

  test.each([['bearer', { token: 'good' }], ['cookie', { cookie: 'good' }]])('%s token reaches a real mounted route', async (_label, transport) => {
    add('good', { user_id: 't1', role: 'tenant', accountStatus: 'active', tenantStatus: 'active', securityVersion: 0 });
    expect(await request('/api/m/auth/me', transport)).toEqual({ status: 200, body: { userId: 't1', role: 'tenant' } });
  });

  test.each([['missing', {}], ['query', { query: '?token=good' }]])('%s token cannot authenticate', async (_label, transport) => {
    add('good', { user_id: 't1', role: 'tenant', accountStatus: 'active', tenantStatus: 'active', securityVersion: 0 });
    expect((await request('/api/m/auth/me', transport)).status).toBe(401);
  });

  test.each([
    ['active tenant', { role: 'tenant', tenantStatus: 'active', accountStatus: 'active' }, 200],
    ['applicant', { role: 'tenant', tenantStatus: 'applicant', accountStatus: 'active' }, 403],
    ['moved out', { role: 'tenant', tenantStatus: 'moved_out', accountStatus: 'active' }, 403],
    ['deactivated', { role: 'tenant', tenantStatus: 'active', accountStatus: 'active', isActive: false }, 403],
  ])('%s access to mounted tenant route', async (_label, fields, status) => {
    add('session', { user_id: 'u1', securityVersion: 0, ...fields }); expect((await request('/api/m/dashboard/me', { token: 'session' })).status).toBe(status);
  });

  test('stale security-version session cannot reach mounted tenant route', async () => {
    add('old', { user_id: 'u1', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 2 }, { security_version: 1 });
    const result = await request('/api/m/dashboard/me', { token: 'old' }); expect(result.status).toBe(403); expect(result.body.code).toBe('SESSION_REVOKED');
  });

  test.each([['branch admin', 'branch_admin', ['manageAnnouncements'], 'gil-puyat', 200], ['owner', 'owner', [], null, 200], ['tenant', 'tenant', [], null, 403], ['admin without permission', 'branch_admin', [], 'gil-puyat', 403]])('%s access to mounted admin route', async (_label, role, permissions, branch, status) => {
    add('admin', { user_id: 'u1', role, permissions, branch, tenantStatus: role === 'tenant' ? 'active' : undefined, accountStatus: 'active', securityVersion: 0 });
    const result = await request('/api/m/announcements', { token: 'admin', method: 'POST', body: { title: 'x', content: 'y', branch: branch || 'guadalupe' } }); expect(result.status).toBe(status);
  });

  test('branch-admin spoofing another announcement branch is rejected by real mounted route', async () => {
    add('admin', { user_id: 'u1', role: 'branch_admin', permissions: ['manageAnnouncements'], branch: 'gil-puyat', accountStatus: 'active', securityVersion: 0 });
    const result = await request('/api/m/announcements', { token: 'admin', method: 'POST', body: { title: 'x', content: 'y', branchId: 'guadalupe' } });
    expect(result.status).toBe(403); expect(result.body.code).toBe('BRANCH_ACCESS_DENIED');
  });

  test('active tenant reaches the mounted announcement route with resolved identity', async () => {
    add('optional', { user_id: 'u1', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 0 });
    const result = await request('/api/m/announcements', { token: 'optional' });
    expect(result).toEqual({ status: 200, body: { visibility: 'private', userId: 'u1' } });
  });

  test.each([
    ['anonymous', null, {}, 401],
    ['suspended', 'suspended', { token: 'optional' }, 403],
    ['archived', 'active', { token: 'optional' }, 403],
  ])('%s user cannot reach tenant announcements', async (_label, accountStatus, transport, status) => {
    if (accountStatus) add('optional', { user_id: 'u1', role: 'tenant', tenantStatus: 'active', accountStatus, isArchived: _label === 'archived', securityVersion: 0 });
    expect((await request('/api/m/announcements', transport)).status).toBe(status);
  });

  test.each([['invalid token', 'missing'], ['expired session', 'expired']])('%s cannot reach the mounted announcement route', async (_label, token) => {
    if (token === 'expired') add(token, { user_id: 'u1', role: 'tenant', tenantStatus: 'active', accountStatus: 'active', securityVersion: 0 }, { expires_at: new Date(0) });
    const result = await request('/api/m/announcements', { token }); expect(result.status).toBe(401);
  });

  test('CommonJS wrapper and factory expose identical shared-core behavior', async () => {
    expect(wrapper.__mobileAuthCore).toBe(createMobileAuth);
  });
});

test.each(['read', 'acknowledge'])('announcement %s requires mobile authentication', async (action) => {
  expect((await request(`/api/m/announcements/ann_1/${action}`, { method: 'POST' })).status).toBe(401);
});
