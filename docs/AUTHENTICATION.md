# Authentication System Documentation

## Overview

The Lilycrest Dormitory Management System uses **Firebase Authentication** for user authentication and **MongoDB** for storing user data. The backend verifies Firebase tokens and manages user roles. All roles (applicants, tenants, branch admins, and owners) use a unified sign-in page.

---

## Authentication Methods

### 1. Email/Password Registration

- User creates account with email and password
- Firebase sends verification email automatically
- User must verify email before logging in
- Password security handled entirely by Firebase

### 2. Google Sign-In (OAuth)

- Email is **automatically verified** by Google
- No verification email needed
- User must select branch after first login

---

## User Flows

### Flow 1: Email/Password Registration

```
User fills signup form (/signup)
    ↓
Firebase creates account
    ↓
Verification email sent (Firebase handles this)
    ↓
User signs out immediately
    ↓
User clicks verification link in email → /verify-email
    ↓
User logs in with email/password (/signin)
    ↓
Backend authenticates and grants access
```

### Flow 2: Google Sign-In (New User)

```
User clicks "Continue with Google" (/signin)
    ↓
Google OAuth popup appears
    ↓
Firebase creates account (emailVerified = true)
    ↓
Backend creates user record (branch = "")
    ↓
Redirect to branch selection
    ↓
User selects branch
    ↓
Redirect to appropriate dashboard based on role
```

### Flow 3: Google Sign-In (Existing User)

```
User clicks "Sign in with Google" (/signin)
    ↓
Firebase authenticates user
    ↓
Backend validates and returns user data
    ↓
Check if branch is selected
    ↓
If no branch → Redirect to branch selection
If branch exists → Redirect to dashboard/profile
```

### Flow 4: Unified Admin Login

```
Branch admin/owner navigates to /signin
    ↓
Signs in with email/password or Google
    ↓
Backend validates and returns user with admin role
    ↓
RequireAdmin guard permits access to /admin/* routes
    ↓
Redirect to /admin/dashboard
```

---

## Key Implementation Files

### Frontend (React)

| File                                                      | Purpose                     |
| --------------------------------------------------------- | --------------------------- |
| `web/src/features/public/pages/SignUp.jsx`                | User registration           |
| `web/src/features/tenant/pages/SignIn.jsx`                | Unified login (all roles)   |
| `web/src/features/tenant/pages/ForgotPassword.jsx`        | Password reset              |
| `web/src/features/public/pages/VerifyEmail.jsx`           | Email verification page     |
| `web/src/shared/hooks/FirebaseAuthContext.js`             | Auth context provider       |
| `web/src/shared/hooks/useAuth.js`                         | Auth state & methods        |
| `web/src/shared/guards/RequireAdmin.jsx`                  | Branch admin/owner route guard |
| `web/src/shared/guards/RequireNonAdmin.jsx`               | Block branch admins/owners from auth pages |
| `web/src/shared/guards/RequireOwner.jsx`                  | Owner-only route guard         |
| `web/src/shared/components/ProtectedRoute.jsx`            | Role-based route protection  |
| `web/src/firebase/config.js`                              | Firebase SDK configuration   |

### Backend (Express)

| File                        | Purpose                       |
| --------------------------- | ----------------------------- |
| `server/routes/authRoutes.js`     | Auth API endpoints      |
| `server/middleware/auth.js`       | Token verification middleware |
| `server/middleware/permissions.js` | Granular permission checks   |
| `server/config/firebase.js`      | Firebase Admin SDK config     |
| `server/models/User.js`          | User model with auth fields   |
| `server/models/LoginLog.js`      | Login activity tracking       |
| `server/models/UserSession.js`   | Active session tracking       |

---

## API Endpoints

### Registration

```
POST /api/auth/register
Body: { email, firstName, lastName, branch }
Headers: Authorization: Bearer <firebase_token>
```

### Login

```
POST /api/auth/login
Headers: Authorization: Bearer <firebase_token>
Returns: { user, token }
```

### Update Branch

```
PATCH /api/auth/update-branch
Body: { branch: "gil-puyat" | "guadalupe" }
Headers: Authorization: Bearer <token>
```

### Get Profile

```
GET /api/auth/profile
Headers: Authorization: Bearer <token>
Returns: { user }
```

---

## Email Verification

### Key Points

- Firebase handles all email sending
- `emailVerified` status checked at login
- Unverified users are blocked from accessing the system
- Dedicated `/verify-email` page handles verification flow
- Resend verification option available on login page

### Code Example: Check Verification Status

```javascript
// In SignIn.jsx
const userCredential = await signInWithEmailAndPassword(auth, email, password);

if (!userCredential.user.emailVerified) {
  await auth.signOut();
  showNotification("Please verify your email first", "warning");
  return;
}
```

---

## Route Guards

### RequireNonAdmin

Prevents `branch_admin` and `owner` users from accessing auth pages (`/signin`, `/signup`, `/forgot-password`). Redirects them to `/admin/dashboard` if already authenticated.

### RequireAdmin

Ensures only users with `branch_admin` or `owner` role can access `/admin/*` routes.

### RequireOwner

Additional layer on top of RequireAdmin — ensures only `owner` users can access `/admin/branches`, `/admin/roles`, `/admin/settings`.

### ProtectedRoute

Generic role-based route wrapper that checks `requiredRole` and optionally `requireAuth`.

---

## Branch Selection

### When Required

- After Google signup (new users have empty branch)
- Users cannot access dashboard without selecting a branch

### Available Branches

- **Gil Puyat** (`gil-puyat`) — Makati
- **Guadalupe** (`guadalupe`) — Makati

---

## Security Considerations

1. **Firebase as Source of Truth** — All password handling done by Firebase
2. **Token Verification** — Backend verifies Firebase tokens on every request
3. **Role-Based Access** — Different routes for applicant, tenant, branch admin, and owner
4. **Email Verification** — Required for email/password users before login
5. **Rollback on Failure** — Firebase account deleted if backend registration fails
6. **Login Tracking** — Login activity recorded via `LoginLog` model
7. **Session Tracking** — Active sessions tracked via `UserSession` model

## Reservation Access & Permissions

### Role-Based Access Control (RBAC)

- **Applicant/Tenant:**
  - Can create, view, and cancel their own reservations.
- **Branch Admin:**
  - Can view, approve, or reject reservations for their branch.
- **Owner:**
  - Can view and manage all reservations across branches.

### Reservation Workflow Authentication

- All reservation actions require a valid Firebase token.
- Backend checks user role before allowing reservation actions.
- Unauthorized or insufficient permissions result in 401/403 errors.

### Example: Reservation API Call

```
POST /api/reservations
Authorization: Bearer <firebase_id_token>
```

---

## Integration with Reservation Workflow

- Authentication is enforced on all reservation endpoints.
- Role checks ensure only authorized users can perform reservation actions.
- Reservation status changes (approve, cancel, complete) are restricted by role.

## Firebase Setup

### Prerequisites

1. Firebase project with Authentication enabled
2. Google Sign-In provider enabled
3. Email/Password provider enabled

### Environment Variables (web/.env)

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Environment Variables (server/.env)

```env
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Current Frontend Route/Auth Model

Authentication-aware routing now follows this structure:

1. `web/src/App.js` mounts auth and theme providers.
2. `web/src/app/routes/AppRoutes.jsx` composes public, tenant, admin, and legacy route groups.
3. Route guards enforce navigation policy.
4. `RouteShell` wraps route elements with route-level error boundaries.

### Route Guard Summary

- `RequireNonAdmin`
  Prevents authenticated users from staying on `/signin`, `/signup`, and `/forgot-password`.
  Admin roles redirect to `/admin/dashboard`.
  Applicant and tenant roles redirect to the default portal route.
  Social-auth and resend-verification flows temporarily bypass the redirect.

- `RequireAdmin`
  Allows only `branch_admin` and `owner` into `/admin/*`.

- `RequireOwner`
  Restricts owner-only admin routes such as `/admin/branches`, `/admin/roles`, `/admin/settings`, `/admin/financial`, and `/admin/dashboard/super`.

- `RequireSuperAdmin`
  Legacy alias that now delegates to `RequireOwner`. Prefer `RequireOwner` in all new code and docs.

### Permission Resolution

- Persisted admin permissions are evaluated first.
- Owners bypass permission checks.
- Branch-admin role defaults are still used only as a transitional fallback for older accounts without explicit saved permissions.

- `ProtectedRoute`
  Shared role-aware wrapper used for applicant/tenant/public gating.

### Canonical Route Files

- `web/src/app/routes/AppRoutes.jsx`
- `web/src/app/routes/publicRoutes.jsx`
- `web/src/app/routes/tenantRoutes.jsx`
- `web/src/app/routes/adminRoutes.jsx`
- `web/src/app/routes/legacyRoutes.jsx`
