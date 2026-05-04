# Ignored Local Changes Guideline

This branch was checked out after intentionally discarding uncommitted local work from `main`.
The discarded work should not be treated as part of the `vince` branch unless it is reintroduced
deliberately through a reviewed commit or pull request.

## Ignored Change Areas

The discarded local work touched these areas:

- Authentication controller behavior in `server/controllers/authController.js`
- Email configuration in `server/config/email.js`
- User and user session models in `server/models/User.js`, `server/models/UserSession.js`, and `server/models/index.js`
- Auth routes and access guard tests in `server/routes/authRoutes.js`, `server/routes/accessGuards.test.js`, and `server/controllers/reservationsController.access.test.js`
- Maintenance controller and route changes in `server/controllers/maintenanceController.js` and `server/routes/maintenanceRoutes.js`
- Server startup changes in `server/server.js`
- Public and tenant auth UI changes in sign in, sign up, forgot password, verify email, reset password, and auth action pages
- Frontend auth API, HTTP client, session client, and auth hook changes
- Auth form styling changes in `web/src/shared/styles/auth-forms.css`
- Removed untracked auth audit and handoff documents
- Removed untracked mobile/server service directories that were not committed on the previous branch

## Handling Rule

Do not assume any of the discarded changes are available on `vince`.
If a feature from the ignored work is still needed, recreate it from the current `vince` branch state,
keep the patch scoped, and verify it against the current branch behavior before committing.

## Branch State Note

The checkout target is `vince`, tracking `origin/vince`.
The only leftover untracked item after cleanup was `.codex-run-logs/`, because Windows reported some
log files as in use during cleanup.
