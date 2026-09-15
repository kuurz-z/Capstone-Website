const mockController = {
  getMe: jest.fn(),
  updateMe: jest.fn(),
  markTenantOnboardingSeen: jest.fn(),
  savePushToken: jest.fn(),
  uploadDocument: jest.fn(),
  getUserDocuments: jest.fn(),
  getDocumentFile: jest.fn(),
  deleteDocument: jest.fn(),
};

jest.mock('../controllers/user.controller.js', () => mockController);
jest.mock('../config/database.js', () => ({ getDb: jest.fn() }));

const router = require('./user.routes.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('POST /users/me/manual-guide-seen is present and rejects unauthenticated requests', async () => {
  const layer = router.stack.find((entry) => entry.route?.path === '/me/manual-guide-seen');
  expect(layer).toBeDefined();
  expect(layer.route.methods.post).toBe(true);
  expect(layer.route.stack).toHaveLength(3);

  const res = response();
  const next = jest.fn();
  await layer.route.stack[0].handle({ headers: {}, cookies: {} }, res, next);

  expect(res.statusCode).toBe(401);
  expect(res.body.code).toBe('NOT_AUTHENTICATED');
  expect(next).not.toHaveBeenCalled();
  expect(mockController.markTenantOnboardingSeen).not.toHaveBeenCalled();
});
