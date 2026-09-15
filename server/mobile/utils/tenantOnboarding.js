'use strict';

// Project the internal timestamp into the stable boolean consumed by the
// mobile client. Keep the timestamp server-only even on auth responses that
// otherwise use the existing broad legacy profile shape.
function withTenantOnboardingState(doc) {
  if (!doc) return doc;
  const user = { ...doc };
  user.tenantOnboardingSeen = Boolean(user.tenant_onboarding_seen_at);
  delete user.tenant_onboarding_seen_at;
  return user;
}

module.exports = { withTenantOnboardingState };
