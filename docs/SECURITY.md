# Security Implementation

> Overview of security measures implemented in the Lilycrest Dormitory Management System to protect against common web vulnerabilities and enforce data integrity.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [CSRF Protection](#csrf-protection)
- [Branch-Level Data Isolation](#branch-level-data-isolation)
- [Rate Limiting](#rate-limiting)
- [Security Headers](#security-headers)
- [Webhook Security](#webhook-security)
- [Audit Logging](#audit-logging)
- [Validation Rules Reference](#validation-rules-reference)
- [Error Handling](#error-handling)

---

## Architecture Overview

Security is implemented across multiple layers of the application stack:

```
Client Request
    │
    ▼
┌─────────────────────────┐
│   Security Headers      │  Helmet (CSP, HSTS, X-Frame-Options)
├─────────────────────────┤
│   Rate Limiter          │  Tiered throttling (global, auth, public)
├─────────────────────────┤
│   Token Verification    │  Firebase Admin SDK validates JWT
├─────────────────────────┤
│   Role & Branch Guard   │  RBAC + branch-level data isolation
├─────────────────────────┤
│   Permission Check      │  Granular permission verification
├─────────────────────────┤
│   Input Validation      │  Sanitize & validate all user input
├─────────────────────────┤
│   CSRF Verification     │  Token check on state-changing requests
├─────────────────────────┤
│   Controller Logic      │  Business rules with audit logging
├─────────────────────────┤
│   Mongoose ODM          │  Schema-enforced data integrity
└─────────────────────────┘
```

**Key files:**

| File                         | Responsibility                               |
| ---------------------------- | -------------------------------------------- |
| `middleware/auth.js`         | JWT/Firebase token verification, role guards |
| `middleware/validation.js`   | Input sanitization and format validation     |
| `middleware/csrf.js`         | CSRF token generation and verification       |
| `middleware/branchAccess.js` | Branch-level data isolation                  |
| `middleware/permissions.js`  | Granular permission checks                   |
| `middleware/rateLimiter.js`  | Tiered request rate limiting                 |
| `middleware/errorHandler.js` | Centralized error handling                   |

---

## Authentication & Authorization

### Authentication Flow

The system uses **Firebase Authentication** as the identity provider with server-side verification:

1. User authenticates via Firebase (email/password or Google OAuth)
2. Firebase issues an ID token to the client
3. Client includes the token in the `Authorization` header on every API request
4. Backend verifies the token using Firebase Admin SDK
5. Verified user data is attached to the request object for downstream use

### Role-Based Access Control (RBAC)

Four roles are enforced through middleware guards:

| Role         | Scope    | Capabilities                                                                |
| ------------ | -------- | --------------------------------------------------------------------------- |
| `applicant`  | Public   | Browse rooms, submit inquiries, create reservations                         |
| `tenant`     | Personal | View own bills, submit maintenance requests, manage profile                 |
| `branch_admin` | Branch | Manage reservations, tenants, rooms, and billing within assigned branch     |
| `owner`        | System | Full access across all branches, user/role management, system configuration |

**Middleware chain example:**

```javascript
router.put(
  "/:id",
  verifyToken, // Authenticate
  verifyAdmin, // Authorize (branch_admin or owner)
  filterByBranch, // Restrict to user's branch
  controller.update, // Execute
);
```

### Granular Permissions

**File:** `middleware/permissions.js`

Beyond role checks, specific actions are gated by fine-grained permission checks. This allows controlling access at a more granular level than the four base roles.

---

## Input Validation & Sanitization

**File:** `middleware/validation.js`

All user-supplied input is sanitized and validated before processing. The middleware prevents:

- **Cross-Site Scripting (XSS)** — HTML entities are escaped; `<script>` tags are neutralized
- **Injection Attacks** — Combined with Mongoose ODM's parameterized queries, raw input never reaches the database
- **Malformed Data** — Strict format enforcement on all fields

### Sanitization Functions

| Function             | Purpose               | Rules                                             |
| -------------------- | --------------------- | ------------------------------------------------- |
| `sanitizeString()`   | General text cleaning | Escapes `<`, `>`, `&`, `"`, `'`, `/`              |
| `sanitizeEmail()`    | Email normalization   | RFC 5322 format, trimmed, lowercased              |
| `sanitizeUsername()` | Username enforcement  | 3–30 chars, alphanumeric plus `-` and `_`         |
| `sanitizeName()`     | Name formatting       | 2–50 chars, letters, spaces, `-`, `'`             |
| `sanitizePhone()`    | Phone normalization   | 7+ digits, allows `+` and `-`                     |
| `validateBranch()`   | Branch enum check     | Only `gil-puyat` or `guadalupe`                   |
| `validateRole()`     | Role enum check       | Only `applicant`, `tenant`, `branch_admin`, `owner` |
| `isValidObjectId()`  | MongoDB ID check      | 24-character hex string                           |
| `isValidDate()`      | Date format check     | ISO 8601 format (`YYYY-MM-DD`)                    |

### Example: XSS Prevention

```
Input:  <script>alert('xss')</script>
Output: &lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;
```

The sanitized output is stored safely and rendered without executing embedded scripts.

---

## CSRF Protection

**File:** `middleware/csrf.js`

State-changing requests (POST, PUT, PATCH, DELETE) are protected against Cross-Site Request Forgery:

- **Token generation** — 32-byte cryptographic random tokens (64 hex characters)
- **Token validation** — Tokens are verified via request headers, body, or query parameters
- **Firebase Auth bypass** — Routes using Firebase ID tokens already carry implicit CSRF protection through the bearer token mechanism

---

## Branch-Level Data Isolation

**File:** `middleware/branchAccess.js`

Multi-tenancy is enforced at the query level to prevent cross-branch data access:

```javascript
// Every database query automatically scopes to the user's branch
const bills = await Bill.find({
  userId: req.user.uid,
  branch: req.user.branch, // Injected by middleware
});
```

**Guarantees:**

- Tenants can only view their own data within their assigned branch
- Branch admins can only manage resources within their assigned branch
- Owners can access resources across all branches
- No accidental data leakage between branches

---

## Rate Limiting

**File:** `middleware/rateLimiter.js`

Tiered rate limiting protects against brute-force, credential-stuffing, and denial-of-service attacks:

| Tier       | Scope                 | Limit            | Purpose                          |
| ---------- | --------------------- | ---------------- | -------------------------------- |
| **Global** | All endpoints         | 1000 / 15 min    | General abuse prevention         |
| **Auth**   | `/api/auth/*`         | Strict per-IP    | Brute-force login prevention     |
| **Public** | `/api/inquiries/*`    | Moderate per-IP  | Spam inquiry prevention          |

Excessive requests from a single source are rejected with a `429 Too Many Requests` response.

> **Note:** Webhook routes (`/api/webhooks`) are registered **before** the rate limiter to prevent PayMongo callbacks from being throttled.

---

## Security Headers

**File:** `server.js` (via Helmet)

The server uses [Helmet](https://helmetjs.github.io/) to set secure HTTP headers:

| Header                    | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| Content-Security-Policy   | Restricts resource loading sources             |
| Strict-Transport-Security | Enforces HTTPS connections                     |
| X-Content-Type-Options    | Prevents MIME-type sniffing                    |
| X-Frame-Options           | Prevents clickjacking                          |
| X-XSS-Protection          | Enables browser XSS filtering                 |

---

## Webhook Security

**File:** `controllers/webhookController.js`

PayMongo payment webhooks are secured via HMAC signature verification:

1. PayMongo signs each webhook payload with a shared secret
2. The webhook controller receives the raw body (before JSON parsing)
3. An HMAC-SHA256 signature is computed and compared to PayMongo's signature
4. Invalid signatures are rejected with a 401 response

This ensures that only genuine PayMongo events are processed, preventing forged payment confirmations.

---

## Audit Logging

**File:** `utils/auditLogger.js`
**Model:** `models/AuditLog.js`

All administrative actions are recorded with:

| Field            | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `userId`         | Who performed the action                                  |
| `action`         | What was done (e.g., `UPDATE_RESERVATION`, `DELETE_USER`) |
| `resourceType`   | Type of resource affected                                 |
| `resourceId`     | ID of the affected resource                               |
| `changes.before` | State before the change                                   |
| `changes.after`  | State after the change                                    |
| `branch`         | Which branch the action occurred in                       |
| `timestamp`      | When the action was performed                             |

Audit logs are immutable and accessible only to branch admin and owner roles.

---

## Validation Rules Reference

### Field-Level Rules

| Field           | Min      | Max | Allowed Characters         | Format                                  |
| --------------- | -------- | --- | -------------------------- | --------------------------------------- |
| Username        | 3        | 30  | Letters, numbers, `-`, `_` | Lowercased                              |
| Email           | —        | —   | RFC 5322 compliant         | Trimmed, lowercased                     |
| First/Last Name | 2        | 50  | Letters, spaces, `-`, `'`  | —                                       |
| Phone           | 7 digits | —   | Numbers, `+`, `-`          | —                                       |
| Branch          | —        | —   | Enum only                  | `gil-puyat` or `guadalupe`              |
| Role            | —        | —   | Enum only                  | `applicant`, `tenant`, `branch_admin`, `owner` |
| MongoDB ID      | 24       | 24  | Hex characters             | —                                       |
| Date            | —        | —   | ISO 8601                   | `YYYY-MM-DD`                            |

---

## Error Handling

**File:** `middleware/errorHandler.js`

Validation failures return structured, predictable error responses:

```json
{
  "error": "Validation failed",
  "details": ["Username must be 3-30 characters", "Invalid email format"]
}
```

**Frontend integration:**

```javascript
try {
  await authApi.register(data);
} catch (error) {
  if (error.details) {
    setErrors(error.details); // Display field-level errors
  }
}
```

---

## Standards Compliance

| Standard     | Coverage                                               |
| ------------ | ------------------------------------------------------ |
| OWASP Top 10 | XSS, Injection, Broken Auth, Security Misconfiguration |
| RFC 5322     | Email format validation                                |
| ISO 8601     | Date format validation                                 |

---

## References

- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Mongoose Security Considerations](https://mongoosejs.com/docs/security.html)
- [Helmet.js](https://helmetjs.github.io/)
- [PayMongo Webhooks](https://developers.paymongo.com/docs/webhooks)

---

## Frontend Guard Model

The frontend mirrors backend authorization through a centralized route-guard layer:

- `RequireAdmin` protects `/admin/*`
- `RequireOwner` protects owner-only admin pages
- `RequireNonAdmin` redirects authenticated users away from auth-only pages
- `ProtectedRoute` gates applicant/tenant/public route access patterns

These guards improve navigation consistency and reduce accidental route leakage in the client, but backend authorization remains the actual enforcement boundary.
