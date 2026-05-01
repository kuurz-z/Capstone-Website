# LilyCrest Login, OTP, and SMTP Deployment Analysis

Date: 2026-05-01

## 1. Current Login and OTP Flow

The frontend login starts in `web/src/features/tenant/pages/SignIn.jsx`.

For email/password login:

1. The user signs in with Firebase using `signInWithEmailAndPassword`.
2. The page checks Firebase `emailVerified` for non-admin users.
3. If the Firebase email is verified, the frontend calls `login()` from `web/src/shared/hooks/useAuth.js`.
4. The hook uses `web/src/shared/api/authApi.js`, which posts to:
   - `POST ${VITE_API_URL}/auth/login`
5. `authApi.js` adds:
   - Firebase bearer token
   - `x-device-id`
   - optional `x-session-id`
6. `web/src/shared/api/baseUrl.js` decides the backend URL:
   - production uses `VITE_API_URL` when set
   - otherwise falls back to same-origin `/api`

The deployed frontend is calling:

```txt
https://lilycrest-api.onrender.com/api/auth/login
```

So the live backend is Render, not Vercel.

On the backend:

1. `server/server.js` mounts auth routes at `/api/auth`.
2. `server/routes/authRoutes.js` maps:
   - `POST /api/auth/register` -> `register`
   - `POST /api/auth/login` -> `login`
   - `POST /api/auth/verify-otp` -> `verifyLoginOtp`
   - `POST /api/auth/resend-otp` -> `resendLoginOtp`
3. All auth routes use `verifyToken` from `server/middleware/auth.js`.
4. `verifyToken` validates the Firebase ID token and enforces OTP session checks for protected routes, except:
   - `/api/auth/login`
   - `/api/auth/verify-otp`
   - `/api/auth/resend-otp`
   - `/api/auth/logout`
   - `/api/auth/register`
   - `/api/auth/log-password-reset`
5. `login` in `server/controllers/authController.js` finds the Mongo user by Firebase UID.
6. For non-admin users, `login` requires a stable `x-device-id`.
7. It checks `UserSession.findValidOtpSession`.
8. If there is no valid OTP-verified session, it calls `storeOtpChallenge`.
9. `storeOtpChallenge` generates a 6-digit OTP, hashes it, and upserts a pending inactive `UserSession`.
10. It calls `sendLoginOtpEmail` from `server/config/email.js`.
11. The response returns:

```json
{
  "requiresOtp": true,
  "message": "OTP verification required"
}
```

The OTP page is `web/src/features/public/pages/VerifyEmail.jsx`.

It does not generate or send the OTP. It only displays the OTP form, verifies the code with `POST /api/auth/verify-otp`, and resends with `POST /api/auth/resend-otp`.

Important implementation detail:

`storeOtpChallenge` currently calls `sendLoginOtpEmail(...).then(...).catch(...)` without awaiting it. That means the backend can return `requiresOtp: true` before SMTP succeeds or fails.

## 2. Possible SMTP / Email Sending Issues

Confirmed from code:

- `server/config/email.js` currently creates a Gmail transporter with:

```js
nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

- The live backend needs `EMAIL_USER` and `EMAIL_PASSWORD`.
- The current code does not use `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, or `SMTP_FROM`.
- If Render only has `SMTP_USER` / `SMTP_PASS`, OTP email will not be configured because this backend reads `EMAIL_USER` / `EMAIL_PASSWORD`.
- If local `server/.env` is correct but Render environment variables are missing or old, deployed OTP email will still fail.
- If Gmail app password belongs to a different Gmail account than `EMAIL_USER`, Gmail SMTP authentication can fail.
- If the password was pasted with spaces, hidden characters, or from the wrong Google account, SMTP can fail.
- If `EMAIL_USER` uses `lilycrestadmin@gmail.com`, the app password must be generated from that exact Google account.

Confirmed risky behavior:

- `sendLoginOtpEmail` catches SMTP errors and returns `{ success: false }`.
- `storeOtpChallenge` does not await the result.
- Therefore SMTP failure can be hidden from the login response.
- Tenants can reach the OTP page even when no email was sent.

Possible deployed-only issues:

- Render has not been redeployed after changing environment variables.
- Render has not received the latest code commit.
- Render service uses old `EMAIL_USER` / `EMAIL_PASSWORD`.
- Render service is restarting or sleeping during login.
- Gmail SMTP is timing out or blocked temporarily.
- Auth route returns 503 when email config is missing or an error handler receives `OTP_EMAIL_SEND_FAILED`.

## 3. Deployment Conflict Check

Local and deployed are not the same environment.

Local:

- `server/.env` is read only when running the backend locally.
- It is ignored by git and is not deployed.
- Local SMTP credentials being correct does not prove deployed SMTP is correct.

Vercel:

- Vercel hosts the frontend at `https://lilycrest-dormitory.vercel.app`.
- Vercel needs frontend variables such as:
  - `VITE_API_URL`
  - `VITE_FIREBASE_*`
- Vercel does not send OTP email unless the backend is also hosted on Vercel, which it is not in the observed live behavior.

Render:

- Render hosts the backend at `https://lilycrest-api.onrender.com`.
- Render is the service that must have:
  - `EMAIL_USER`
  - `EMAIL_PASSWORD`
  - `CORS_ORIGINS` or `FRONTEND_URL`
  - Firebase Admin variables
  - MongoDB variables

Live check:

- `GET https://lilycrest-api.onrender.com/api/health` returns HTTP 200 and healthy MongoDB.
- `POST https://lilycrest-api.onrender.com/api/auth/login` without auth returns HTTP 401 `AUTH_HEADER_MISSING`.
- So the backend is reachable.
- The screenshot showing `POST /api/auth/login 503` most likely comes from the authenticated login route failing internally, not from the backend being unreachable.

Frontend API URL:

- The live console shows the frontend is calling `https://lilycrest-api.onrender.com/api/auth/login`.
- That means `VITE_API_URL` is likely correct on Vercel.
- Wrong API URL is less likely than backend SMTP/env failure.

## 4. Error and Conflict Findings

### Finding 1: OTP email sending is not awaited

- File affected: `server/controllers/authController.js`
- Function affected: `storeOtpChallenge`
- Why it may break OTP sending: The backend saves the OTP and returns `requiresOtp` while email sending continues in the background. If SMTP fails, the tenant still lands on the OTP page with no email.
- How to verify: Add temporary logs around `sendLoginOtpEmail`, then test login on Render and inspect Render logs for email failure after the login response.
- Recommended fix: Await `sendLoginOtpEmail`; if it returns failure, clear the pending OTP or return `OTP_EMAIL_SEND_FAILED` before showing the OTP page.

### Finding 2: Backend reads EMAIL_* but user is thinking in SMTP_* names

- File affected: `server/config/email.js`
- Function affected: transporter setup and all email senders
- Why it may break OTP sending: Render may have `SMTP_USER` and `SMTP_PASS`, but this backend currently only reads `EMAIL_USER` and `EMAIL_PASSWORD`.
- How to verify: Check Render environment variables for the backend service.
- Recommended fix: Either set `EMAIL_USER` and `EMAIL_PASSWORD` in Render, or update code to support both variable families safely.

### Finding 3: Local .env is not deployed

- File affected: `server/.env`
- Function or route affected: all email routes, especially `POST /api/auth/login` and `POST /api/auth/resend-otp`
- Why it may break OTP sending: The app password in local `.env` does not automatically exist in Render.
- How to verify: Render Dashboard -> service -> Environment. Confirm `EMAIL_USER` and `EMAIL_PASSWORD` are set there.
- Recommended fix: Add the same sender credentials to Render environment variables and redeploy/restart the backend.

### Finding 4: Startup validation makes email required in production

- File affected: `server/config/startupValidation.js`
- Function affected: `validateStartupConfig`
- Why it may break deployment: In production, missing `EMAIL_USER` or `EMAIL_PASSWORD` can fail startup validation. If the live service is healthy, it probably has some email values, but they may still be wrong.
- How to verify: Check Render deploy logs for startup validation errors.
- Recommended fix: Keep production validation, but ensure Render has the correct email variables. Optionally improve validation messaging without exposing secrets.

### Finding 5: Current email config is Gmail-only

- File affected: `server/config/email.js`
- Function affected: Nodemailer transporter
- Why it may break SMTP sending: If credentials are for Mailjet or another SMTP provider, `service: "gmail"` is wrong.
- How to verify: Confirm whether the intended provider is Gmail. For Gmail, use `EMAIL_USER=lilycrestadmin@gmail.com` and its Google App Password.
- Recommended fix: If staying with Gmail, keep Gmail config. If using generic SMTP, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` support.

### Finding 6: Error handling hides the useful SMTP failure from the frontend

- File affected: `server/config/email.js`, `server/controllers/authController.js`, `web/src/features/tenant/pages/SignIn.jsx`
- Function affected: `sendLoginOtpEmail`, `storeOtpChallenge`, login error display
- Why it may break diagnosis: The SMTP error is only printed server-side. The frontend only knows OTP is required or that login failed.
- How to verify: Inspect Render logs during a login attempt.
- Recommended fix: Log structured SMTP failure details server-side and return `OTP_EMAIL_SEND_FAILED` when sending fails before OTP page navigation.

### Finding 7: Auth API retry can mask first 401 error details

- File affected: `web/src/shared/api/authApi.js`
- Function affected: `authRequest`
- Why it may break diagnosis: On any 401, the client retries before parsing the backend error body. This is usually okay for token refresh, but can obscure OTP/session-specific debugging.
- How to verify: Watch console/network response bodies for `/api/auth/profile`, `/api/auth/verify-otp`, and `/api/auth/resend-otp`.
- Recommended fix: Parse error body before retrying, and avoid retrying OTP/session errors.

## 5. Recommended Fix Plan

Safe minimal plan:

1. In Render backend environment, confirm the actual deployed values:
   - `EMAIL_USER`
   - `EMAIL_PASSWORD`
   - `NODE_ENV`
   - `FRONTEND_URL` or `CORS_ORIGINS`
2. Restart or redeploy the Render backend after environment changes.
3. In `server/controllers/authController.js`, change `storeOtpChallenge` so it awaits `sendLoginOtpEmail`.
4. If email sending fails, return `OTP_EMAIL_SEND_FAILED` and do not let the frontend proceed to the OTP page.
5. In `server/config/email.js`, either:
   - keep Gmail-only but make logs clearer, or
   - support both `EMAIL_*` and `SMTP_*` safely.
6. In `web/src/shared/api/authApi.js`, improve 401 error handling so OTP/session errors are not hidden by token refresh retry.
7. Deploy backend first, then frontend only if frontend code changes are made.
8. Test on live:
   - login with a tenant
   - confirm `/api/auth/login` returns `requiresOtp`
   - confirm Render logs show email sent
   - confirm Gmail receives the OTP
   - verify OTP completes session creation

Exact code-change targets, if approved:

- `server/controllers/authController.js`
  - Await `sendLoginOtpEmail`.
  - Log OTP challenge creation and email status.
  - Throw `OTP_EMAIL_SEND_FAILED` when SMTP fails.

- `server/config/email.js`
  - Add safe env resolution for `EMAIL_USER` / `EMAIL_PASSWORD` and optionally `SMTP_USER` / `SMTP_PASS`.
  - Add transporter timeouts.
  - Add clearer logs without printing passwords.

- `web/src/shared/api/authApi.js`
  - Parse backend error JSON before token refresh retry.
  - Avoid retrying known OTP/session errors.

## 6. Logging and Debugging Improvements

Add backend logs at these points:

- `server/controllers/authController.js`
  - Before OTP generation:
    - user id
    - email
    - device id present or missing
  - After OTP saved:
    - user id
    - pending session id
    - expiry timestamp
    - do not log the OTP value in production
  - Before email send:
    - recipient email
    - configured sender email
  - After email success:
    - message id
    - recipient email
  - After email failure:
    - full SMTP error message
    - SMTP error code/command/response when available
    - recipient email

- `server/config/email.js`
  - On startup:
    - whether email config is present
    - sender email
    - provider type
    - never log password
  - On `transporter.verify` failure:
    - full sanitized error object

- `web/src/features/tenant/pages/SignIn.jsx`
  - In development only, log backend login response code and `requiresOtp`.

- `web/src/features/public/pages/VerifyEmail.jsx`
  - In development only, log verify/resend response code.

## 7. Final Recommendation

The most likely reason tenants are not receiving OTP emails in the deployed/live version is:

The live backend is Render, but SMTP credentials were being edited locally and/or using different variable names than the code reads. The current backend code reads `EMAIL_USER` and `EMAIL_PASSWORD`, and local `server/.env` is not deployed to Render.

The second major issue is:

The OTP email send is not awaited. This allows the frontend to proceed to the OTP page even if the email fails after the response.

Most likely issue category:

- SMTP credential/config problem: high likelihood
- Render/backend environment variable problem: high likelihood
- Backend deployment problem: medium likelihood
- Wrong API URL problem: low likelihood, because live frontend is calling Render
- OTP logic problem: medium likelihood, because OTP is saved but email result is not enforced
- Email provider limitation: medium likelihood, depending on Gmail app password/account settings

Recommended immediate action:

First confirm and fix Render backend environment variables. Then patch the backend so OTP email sending is awaited and failures block the OTP page with a clear `OTP_EMAIL_SEND_FAILED` response.
