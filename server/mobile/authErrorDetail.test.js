const fs = require('fs');
const path = require('path');

describe('Mobile Auth Error Detail Integration', () => {
  const authControllerPath = path.resolve(__dirname, 'controllers/auth.controller.js');

  test('tenantLoginRestriction detail messages integrate the explanatory web portal note', () => {
    const content = fs.readFileSync(authControllerPath, 'utf-8');
    expect(content).toMatch(/This account is not registered as an active tenant\..*web portal/is);
    expect(content).toMatch(/This tenant account is currently inactive\..*web portal/is);
  });
});
