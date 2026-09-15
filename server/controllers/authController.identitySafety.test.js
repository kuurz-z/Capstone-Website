import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const findOne = jest.fn();
const saveNewUser = jest.fn();
const audit = { log: jest.fn(), logLogin: jest.fn(), logRegistration: jest.fn(), logError: jest.fn() };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const session = { createSession: jest.fn(), findValidSession: jest.fn() };
class UserModel {
  constructor(data) { Object.assign(this, data); this._id = "new-mongo-user"; }
  save() { return saveNewUser(this); }
  static findOne(query) { return findOne(query); }
}

await jest.unstable_mockModule("../models/index.js", () => ({
  User: UserModel, UserSession: session, LoginLog: { logEvent: jest.fn() }, Reservation: {}, Stay: {},
}));
await jest.unstable_mockModule("../config/email.js", () => ({ sendLoginOtpEmail: jest.fn(), sendPasswordChangedEmail: jest.fn() }));
await jest.unstable_mockModule("../config/firebase.js", () => ({ getAuth: jest.fn() }));
await jest.unstable_mockModule("../middleware/logger.js", () => ({ default: logger }));
await jest.unstable_mockModule("../middleware/validation.js", () => ({
  sanitizeName: (v) => v, sanitizePhone: (v) => v, sanitizeText: (v) => v,
}));
await jest.unstable_mockModule("../utils/auditLogger.js", () => ({ default: audit }));
await jest.unstable_mockModule("../services/sessionInvalidationService.js", () => ({ invalidateUserSessions: jest.fn() }));
await jest.unstable_mockModule("../services/tenantProfileService.js", () => ({
  resolveTenantOccupancyDetails: jest.fn(), resolveTenantPersonalDetails: jest.fn(),
}));

const { buildRegistrationUserPayload, login, register } = await import("./authController.js");
const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe("authentication identity safety", () => {
  beforeEach(() => jest.clearAllMocks());

  test("same email with a different UID returns 409 without mutating the stored user", async () => {
    const stored = {
      _id: "mongo-1", firebaseUid: "canonical-uid", email: "person@example.test",
      role: "tenant", permissions: ["existing"], branch: "guadalupe", accountStatus: "active",
      save: jest.fn(),
    };
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
    const req = {
      id: "request-identity-1", query: {}, headers: {},
      user: { uid: "attempted-uid", email: "Person@Example.Test", firebase: { sign_in_provider: "google.com" } },
    };
    const res = response();
    await login(req, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: "IDENTITY_CONFLICT" } });
    expect(stored).toMatchObject({
      firebaseUid: "canonical-uid", role: "tenant", permissions: ["existing"],
      branch: "guadalupe", accountStatus: "active",
    });
    expect(stored.save).not.toHaveBeenCalled();
    expect(session.createSession).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ eventType: "AUTH_IDENTITY_CONFLICT", requestId: "request-identity-1" }),
    }));
    const serializedLogs = JSON.stringify([
      logger.warn.mock.calls,
      audit.log.mock.calls.map(([entry]) => entry.metadata),
    ]);
    expect(serializedLogs).not.toContain("canonical-uid");
    expect(serializedLogs).not.toContain("attempted-uid");
  });

  test("new social identity lookup returns the safe 404 path without logging raw identity", async () => {
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const req = {
      id: "request-new-social",
      query: { checkOnly: "true" },
      headers: {},
      user: {
        uid: "disposable-social-identity",
        email: "new-social@example.test",
        firebase: { sign_in_provider: "google.com" },
      },
    };
    const res = response();
    await login(req, res, jest.fn());
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: "USER_NOT_FOUND" });
    const logs = JSON.stringify(logger.info.mock.calls);
    expect(logs).not.toContain(req.user.uid);
    expect(logs).not.toContain(req.user.email);
  });

  test("same UID registration retry returns the existing onboarding profile without saving", async () => {
    const stored = {
      _id: "mongo-1", firebaseUid: "same-uid", email: "person@example.test", username: "person",
      firstName: "Test", lastName: "Person", branch: null, role: "applicant",
      onboardingStatus: "verification_pending", save: jest.fn(),
    };
    findOne.mockResolvedValueOnce(stored);
    const req = {
      id: "request-retry-1", headers: {},
      user: { uid: "same-uid", email: "person@example.test", email_verified: false },
      sanitizedData: { username: "person", firstName: "Test", lastName: "Person" },
    };
    const res = response();
    await register(req, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ code: "ONBOARDING_RESUMED", user: { onboardingStatus: "verification_pending" } });
    expect(stored.save).not.toHaveBeenCalled();
  });

  test("social profile completion creates once and same-UID retry returns the safe payload", async () => {
    const created = {
      _id: "mongo-social",
      firebaseUid: "social-uid",
      email: "social@example.test",
      username: "social-user",
      firstName: "Social",
      lastName: "User",
      branch: null,
      role: "applicant",
      permissions: [],
      onboardingStatus: "profile_complete",
    };
    findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    saveNewUser.mockImplementationOnce(async (value) => {
      Object.assign(value, created);
      return value;
    });
    const req = {
      id: "social-register",
      headers: {},
      user: { uid: "social-uid", email: "social@example.test", email_verified: true },
      sanitizedData: { username: "social-user", firstName: "Social", lastName: "User" },
    };
    const first = response();
    const retry = response();
    await register(req, first, jest.fn());
    await register(req, retry, jest.fn());
    expect(first.statusCode).toBe(201);
    expect(retry.body).toMatchObject({ code: "ONBOARDING_RESUMED", user: { id: "mongo-social" } });
    expect(saveNewUser).toHaveBeenCalledTimes(1);
    expect(first.body.user).not.toHaveProperty("firebaseUid");
    expect(retry.body.user).not.toHaveProperty("firebaseUid");
  });

  test("OAuth login returns a minimized payload and sets the protected session cookie", async () => {
    const stored = {
      _id: "mongo-social",
      firebaseUid: "social-uid",
      email: "social@example.test",
      username: "social-user",
      firstName: "Social",
      lastName: "User",
      role: "applicant",
      permissions: [],
      accountStatus: "active",
      isActive: true,
      isEmailVerified: true,
      securityVersion: 0,
      save: jest.fn(),
    };
    findOne.mockResolvedValueOnce(stored);
    session.createSession.mockResolvedValueOnce({ sessionId: "opaque-test-session" });
    const req = {
      id: "social-login",
      query: {},
      headers: { "x-device-id": "test-device" },
      user: {
        uid: "social-uid",
        email: "social@example.test",
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      },
    };
    const res = { ...response(), cookie: jest.fn() };
    await login(req, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("sessionId", "opaque-test-session");
    expect(res.body.user).not.toHaveProperty("firebaseUid");
    expect(res.cookie).toHaveBeenCalledWith(
      "lilycrest_web_session",
      "opaque-test-session",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  test("duplicate-key race resolves to the one profile created for the verified UID", async () => {
    const stored = {
      _id: "mongo-winner", firebaseUid: "race-uid", email: "race@example.test", username: "race",
      firstName: "Race", lastName: "Winner", branch: null, role: "applicant", permissions: [],
      onboardingStatus: "verification_pending",
    };
    findOne
      .mockResolvedValueOnce(null) // initial UID lookup
      .mockResolvedValueOnce(null) // email ownership lookup
      .mockResolvedValueOnce(null) // username lookup
      .mockResolvedValueOnce(stored); // duplicate-key reconciliation by UID
    saveNewUser.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: 11000 }));
    const req = {
      id: "request-race-1", headers: {},
      user: { uid: "race-uid", email: "race@example.test", email_verified: false },
      sanitizedData: { username: "race", firstName: "Race", lastName: "Winner" },
    };
    const res = response();
    await register(req, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ code: "ONBOARDING_RESUMED", user: { onboardingStatus: "verification_pending" } });
    expect(res.body.user).not.toHaveProperty("firebaseUid");
    expect(saveNewUser).toHaveBeenCalledTimes(1);
  });

  test("all registration payloads share the same safe shape", () => {
    const payload = buildRegistrationUserPayload({
      _id: "mongo-1", user_id: "public-1", firebaseUid: "never-return-this",
      email: "person@example.test", username: "person", firstName: "Test", lastName: "Person",
      phone: null, branch: null, role: "applicant", permissions: [], isEmailVerified: false,
      onboardingStatus: "verification_pending", otpHash: "never-return-this-either",
      createdAt: new Date().toISOString(),
    });
    expect(Object.keys(payload).sort()).toEqual([
      "branch", "createdAt", "email", "firstName", "id", "isEmailVerified",
      "isNewAccount", "lastName", "onboardingStatus", "permissions", "phone",
      "role", "user_id", "username",
    ].sort());
    expect(payload).not.toHaveProperty("firebaseUid");
    expect(payload).not.toHaveProperty("otpHash");
  });

  test("buildRegistrationUserPayload respects isNewAccount option", () => {
    const user = { _id: "mongo-1", email: "test@example.test" };
    const defaultPayload = buildRegistrationUserPayload(user);
    expect(defaultPayload.isNewAccount).toBe(true);

    const resumedPayload = buildRegistrationUserPayload(user, { isNewAccount: false });
    expect(resumedPayload.isNewAccount).toBe(false);
  });
});
