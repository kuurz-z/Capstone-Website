const axios = require('axios');

const mockGetDb = jest.fn();

jest.mock('../config/database.js', () => ({ getDb: (...args) => mockGetDb(...args) }));
jest.mock('../config/firebase.js', () => ({
  verifyFirebaseIdToken: jest.fn(),
  verifyTenantInFirebase: jest.fn(),
  admin: { auth: () => ({ updateUser: jest.fn(), revokeRefreshTokens: jest.fn() }) },
}));
jest.mock('axios', () => ({ post: jest.fn() }));

const controller = require('./auth.controller.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie() { return this; },
  };
}

function fakeDb(user) {
  return {
    collection(name) {
      if (name === 'users') {
        return {
          findOne: jest.fn(async () => user),
          updateOne: jest.fn(async () => ({ matchedCount: user ? 1 : 0 })),
        };
      }
      if (name === 'login_attempts') {
        return { insertOne: jest.fn(async () => ({ insertedId: 'audit' })) };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

function request(email = 'tenant@example.test', password = 'ValidPassword1!') {
  return { body: { email, password }, headers: {}, ip: '127.0.0.1' };
}

function firebaseError(message) {
  const error = new Error(message);
  error.response = { data: { error: { message } } };
  return error;
}

describe('email/password login error-code contract', () => {
  const originalApiKey = process.env.FIREBASE_API_KEY;

  beforeAll(() => { process.env.FIREBASE_API_KEY = 'test-api-key'; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = originalApiKey;
  });
  beforeEach(() => jest.clearAllMocks());

  test('active tenant plus incorrect password returns INVALID_CREDENTIALS', async () => {
    mockGetDb.mockReturnValue(fakeDb({
      user_id: 'tenant-active',
      email: 'tenant@example.test',
      role: 'tenant',
      accountStatus: 'active',
      tenantStatus: 'active',
      is_active: true,
    }));
    axios.post.mockRejectedValue(firebaseError('INVALID_LOGIN_CREDENTIALS'));

    const res = response();
    await controller.login(request(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual(expect.objectContaining({
      code: 'INVALID_CREDENTIALS',
      detail: 'Incorrect email or password.',
    }));
  });

  test('inactive tenant plus correct credential returns TENANT_INACTIVE', async () => {
    mockGetDb.mockReturnValue(fakeDb({
      user_id: 'tenant-inactive',
      email: 'inactive@example.test',
      role: 'tenant',
      accountStatus: 'deactivated',
      tenantStatus: 'inactive',
      is_active: false,
    }));
    axios.post.mockResolvedValue({ data: { localId: 'firebase-inactive' } });

    const res = response();
    await controller.login(request('inactive@example.test'), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      code: 'TENANT_INACTIVE',
      detail: 'This tenant account is currently inactive. The mobile app is reserved for active checked-in tenants. Please contact the dormitory admin office or check your status on the Lilycrest Web Portal.',
    });
  });

  test('authenticated identity without a tenant record returns TENANT_NOT_REGISTERED', async () => {
    mockGetDb.mockReturnValue(fakeDb(null));
    axios.post.mockResolvedValue({ data: { localId: 'firebase-unregistered' } });

    const res = response();
    await controller.login(request('unregistered@example.test'), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      code: 'TENANT_NOT_REGISTERED',
      detail: 'This account is not registered as an active tenant. The mobile app is reserved for active checked-in tenants. If you are an applicant or have a pending reservation, please sign in via the Lilycrest Web Portal.',
    });
  });
});

describe('auth profile onboarding serialization', () => {
  test('login normalization exposes only the boolean onboarding state', () => {
    const timestamp = new Date('2026-09-01T00:00:00Z');
    const unseen = controller.__test.normalizeUser({ user_id: 'unseen' });
    const seen = controller.__test.normalizeUser({
      user_id: 'seen',
      tenant_onboarding_seen_at: timestamp,
    });

    expect(unseen.tenantOnboardingSeen).toBe(false);
    expect(seen.tenantOnboardingSeen).toBe(true);
    expect(seen.tenant_onboarding_seen_at).toBeUndefined();
  });
});
