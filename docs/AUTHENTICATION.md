# Authentication System Documentation

## Overview

The Lilycrest Dormitory Management System uses **Firebase Authentication** for user authentication and **MongoDB** for storing user data. The backend verifies Firebase tokens and manages user roles.

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
User fills signup form
    ↓
Firebase creates account
    ↓
Verification email sent (Firebase handles this)
    ↓
User signs out immediately
    ↓
User clicks verification link in email
    ↓
User logs in with email/password
    ↓
Backend authenticates and grants access
```

### Flow 2: Google Sign-In (New User)

```
User clicks "Continue with Google"
    ↓
Google OAuth popup appears
    ↓
Firebase creates account (emailVerified = true)
    ↓
Backend creates user record (branch = "")
    ↓
Redirect to branch selection page
    ↓
User selects branch
    ↓
Redirect to branch homepage
```

### Flow 3: Google Sign-In (Existing User)

```
User clicks "Sign in with Google"
    ↓
Firebase authenticates user
    ↓
Backend validates and returns user data
    ↓
Check if branch is selected
    ↓
If no branch → Redirect to branch selection
If branch exists → Redirect to dashboard/homepage
```

---

## Key Implementation Files

### Frontend (React)

| File                                                      | Purpose                    |
| --------------------------------------------------------- | -------------------------- |
| `web/src/features/tenant/pages/SignUp.jsx`                | User registration          |
| `web/src/features/tenant/pages/SignIn.jsx`                | User login                 |
| `web/src/features/tenant/pages/BranchSelection.jsx`       | Branch selection page      |
| `web/src/features/tenant/modals/BranchSelectionModal.jsx` | Branch selection modal     |
| `web/src/shared/hooks/FirebaseAuthContext.js`             | Auth context provider      |
| `web/src/firebase/config.js`                              | Firebase SDK configuration |

### Backend (Express)

| File                        | Purpose                       |
| --------------------------- | ----------------------------- |
| `server/routes/auth.js`     | Auth API endpoints            |
| `server/middleware/auth.js` | Token verification middleware |
| `server/config/firebase.js` | Firebase Admin SDK config     |
| `server/models/User.js`     | User model with auth fields   |

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

## Branch Selection

### When Required

- After Google signup (new users have empty branch)
- Users cannot access dashboard without selecting a branch

### Available Branches

- **Gil Puyat** (`gil-puyat`) - Makati
- **Guadalupe** (`guadalupe`) - Makati

---

## Security Considerations

1. **Firebase as Source of Truth** - All password handling done by Firebase
2. **Token Verification** - Backend verifies Firebase tokens on every request
3. **Role-Based Access** - Different routes for tenant, admin, super-admin
4. **Email Verification** - Required for email/password users before login
5. **Rollback on Failure** - Firebase account deleted if backend registration fails

## Reservation Access & Permissions

### Role-Based Access Control (RBAC)

- **Tenant/User:**
  - Can create, view, and cancel their own reservations.
- **Admin:**
  - Can view, approve, or reject reservations for their branch.
- **Super Admin:**
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
