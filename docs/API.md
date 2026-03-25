# API Documentation

Complete reference for all backend API endpoints.

**Base URL**: `http://localhost:5000/api`

---

## Authentication (`/api/auth`)

| Method | Endpoint         | Auth     | Description        |
| ------ | ---------------- | -------- | ------------------ |
| POST   | `/register`      | Firebase | Register new user  |
| POST   | `/login`         | Firebase | User login         |
| GET    | `/profile`       | JWT      | Get user profile   |
| PUT    | `/profile`       | JWT      | Update profile     |
| PATCH  | `/update-branch` | JWT      | Update user branch |
| POST   | `/set-role`      | Admin    | Set user role      |

### Register User

```http
POST /api/auth/register
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe",
  "branch": "gil-puyat"
}
```

### Login

```http
POST /api/auth/login
Authorization: Bearer <firebase_id_token>
```

### Get Profile

```http
GET /api/auth/profile
Authorization: Bearer <jwt_token>
```

### Update Branch

```http
PATCH /api/auth/update-branch
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "branch": "gil-puyat"
}
```

---

## Rooms (`/api/rooms`)

| Method | Endpoint   | Auth   | Description                  |
| ------ | ---------- | ------ | ---------------------------- |
| GET    | `/`        | Public | Get all rooms (with filters) |
| GET    | `/:roomId` | Public | Get room by ID               |
| POST   | `/`        | Admin  | Create room                  |
| PUT    | `/:roomId` | Admin  | Update room                  |
| DELETE | `/:roomId` | Admin  | Delete room                  |

**Query Parameters** (GET `/`):

- `branch` — Filter by branch (`gil-puyat` | `guadalupe`)
- `type` — Filter by room type
- `available` — Filter by availability (`true` | `false`)

---

## Reservations (`/api/reservations`)

| Method | Endpoint             | Auth  | Description                     |
| ------ | -------------------- | ----- | ------------------------------- |
| GET    | `/`                  | JWT   | Get reservations                |
| GET    | `/:reservationId`    | JWT   | Get reservation by ID           |
| POST   | `/`                  | JWT   | Create reservation              |
| PUT    | `/:reservationId`    | Admin | Update reservation              |
| DELETE | `/:reservationId`    | Admin | Cancel reservation              |
| GET    | `/occupancy/:roomId` | Admin | Get room occupancy status       |
| GET    | `/stats/occupancy`   | Admin | Get branch occupancy statistics |

---

## Inquiries (`/api/inquiries`)

| Method | Endpoint              | Auth   | Description                      |
| ------ | --------------------- | ------ | -------------------------------- |
| GET    | `/`                   | Admin  | Get all inquiries                |
| GET    | `/:inquiryId`         | Public | Get inquiry by ID                |
| POST   | `/`                   | Public | Submit inquiry                   |
| PUT    | `/:inquiryId`         | Admin  | Update inquiry                   |
| PATCH  | `/:inquiryId/respond` | Admin  | Respond to inquiry (sends email) |
| DELETE | `/:inquiryId`         | Admin  | Delete inquiry                   |

---

## Billing (`/api/billing`)

| Method | Endpoint                  | Auth  | Description                   |
| ------ | ------------------------- | ----- | ----------------------------- |
| GET    | `/current`                | JWT   | Get current month's bill      |
| GET    | `/history`                | JWT   | Get payment history           |
| GET    | `/stats`                  | Admin | Get branch billing statistics |
| POST   | `/:billId/mark-paid`      | Admin | Mark bill as paid             |
| GET    | `/rooms`                  | Admin | Get rooms for billing         |
| POST   | `/rooms/:roomId/generate` | Admin | Generate bill for a room      |

**Query Parameters** (GET `/history`):

- `limit` — Max results (default: 50)

---

## Payments (`/api/payments`)

| Method | Endpoint                      | Auth  | Description                                  |
| ------ | ----------------------------- | ----- | -------------------------------------------- |
| POST   | `/bill/:billId/checkout`      | JWT   | Create PayMongo checkout session for a bill   |
| POST   | `/deposit/:resId/checkout`    | JWT   | Create PayMongo checkout session for deposit  |
| GET    | `/session/:sessionId/status`  | JWT   | Check PayMongo checkout session status        |
| GET    | `/history`                    | JWT   | Get payment history for authenticated tenant  |
| GET    | `/bill/:billId/payments`      | JWT   | Get all payments for a specific bill          |
| GET    | `/vacancy-dates`              | Admin | Get expected vacancy dates for occupied beds  |

### Create Bill Checkout

```http
POST /api/payments/bill/:billId/checkout
Authorization: Bearer <jwt_token>
```

Creates a PayMongo checkout session and returns the checkout URL for the tenant to complete payment.

### Create Deposit Checkout

```http
POST /api/payments/deposit/:resId/checkout
Authorization: Bearer <jwt_token>
```

Creates a PayMongo checkout session for a reservation deposit payment.

### Check Session Status

```http
GET /api/payments/session/:sessionId/status
Authorization: Bearer <jwt_token>
```

Returns whether a PayMongo checkout session has been paid.

---

## Announcements (`/api/announcements`)

| Method | Endpoint                       | Auth  | Description                      |
| ------ | ------------------------------ | ----- | -------------------------------- |
| GET    | `/`                            | JWT   | Get announcements                |
| GET    | `/unacknowledged`              | JWT   | Get unacknowledged announcements |
| POST   | `/`                            | Admin | Create announcement              |
| POST   | `/:announcementId/read`        | JWT   | Mark as read                     |
| POST   | `/:announcementId/acknowledge` | JWT   | Acknowledge announcement         |
| GET    | `/user/engagement-stats`       | JWT   | Get user engagement stats        |

**Query Parameters** (GET `/`):

- `limit` — Max results (default: 50)
- `category` — Filter by category

---

## Maintenance (`/api/maintenance`)

| Method | Endpoint                 | Auth  | Description                |
| ------ | ------------------------ | ----- | -------------------------- |
| GET    | `/my-requests`           | JWT   | Get tenant's requests      |
| GET    | `/branch`                | Admin | Get all branch requests    |
| POST   | `/requests`              | JWT   | Create maintenance request |
| GET    | `/requests/:requestId`   | JWT   | Get request details        |
| PATCH  | `/requests/:requestId`   | Admin | Update request status      |
| GET    | `/stats/completion`      | Admin | Get completion statistics  |
| GET    | `/stats/issue-frequency` | Admin | Get issue frequency stats  |

---

## Notifications (`/api/notifications`)

| Method | Endpoint                   | Auth | Description                 |
| ------ | -------------------------- | ---- | --------------------------- |
| GET    | `/`                        | JWT  | Get notifications (paginated)|
| GET    | `/unread-count`            | JWT  | Get unread notification count|
| PATCH  | `/read-all`                | JWT  | Mark all as read             |
| PATCH  | `/:notificationId/read`    | JWT  | Mark single as read          |

---

## Users (`/api/users`)

| Method | Endpoint           | Auth  | Description           |
| ------ | ------------------ | ----- | --------------------- |
| GET    | `/`                | Admin | Get all users         |
| GET    | `/:userId`         | Admin | Get user by ID        |
| GET    | `/email/:username` | Admin | Get email by username |
| GET    | `/stats`           | Admin | Get user statistics   |
| PUT    | `/:userId`         | Admin | Update user           |
| DELETE | `/:userId`         | Admin | Delete user           |

---

## Uploads (`/api/upload`)

| Method | Endpoint         | Auth | Description                                |
| ------ | ---------------- | ---- | ------------------------------------------ |
| GET    | `/imagekit-auth` | JWT  | Get ImageKit upload authentication params  |

### Get ImageKit Auth

```http
GET /api/upload/imagekit-auth
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "uuid-token",
    "expire": 1234567890,
    "signature": "hmac-sha1-signature"
  }
}
```

---

## Webhooks (`/api/webhooks`)

| Method | Endpoint    | Auth           | Description                       |
| ------ | ----------- | -------------- | --------------------------------- |
| POST   | `/paymongo` | HMAC Signature | Receive PayMongo payment events   |

> **Note:** Webhook routes are registered before the global rate limiter and JSON body parser to preserve raw body for HMAC signature verification. No JWT auth is required — verification is done via PayMongo's webhook signing secret.

---

## Audit Logs (`/api/audit-logs`)

| Method | Endpoint | Auth  | Description    |
| ------ | -------- | ----- | -------------- |
| GET    | `/`      | Admin | Get audit logs |

---

## Health (`/api/health`)

| Method | Endpoint | Auth   | Description                         |
| ------ | -------- | ------ | ----------------------------------- |
| GET    | `/`      | Public | Deep health check                   |

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "mongodb": { "status": "ok", "latency": "5ms" },
      "memory": { "status": "ok", "heapUsed": "45MB", "heapTotal": "64MB" },
      "uptime": "3600s"
    },
    "environment": "development"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-21T00:00:00.000Z"
  }
}
```

---

## Error Responses

All error responses follow a consistent format:

### 400 Bad Request

```json
{
  "error": "Validation failed",
  "details": ["Username must be 3-30 characters", "Invalid email format"]
}
```

### 401 Unauthorized

```json
{
  "error": "No token provided"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```

### 404 Not Found

```json
{
  "error": "Resource not found"
}
```

### 429 Too Many Requests

```json
{
  "error": "Too many requests, please try again later"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

### Common Error Codes

| Code                   | Description              |
| ---------------------- | ------------------------ |
| `VALIDATION_ERROR`     | Input validation failed  |
| `AUTH_FAILED`          | Authentication failed    |
| `UNAUTHORIZED`         | Insufficient permissions |
| `NOT_FOUND`            | Resource not found       |
| `BRANCH_ACCESS_DENIED` | Branch access violation  |

---

## Authentication Types

| Type             | Usage                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| **Firebase**     | `Authorization: Bearer <firebase_id_token>` — Used for register/login  |
| **JWT**          | `Authorization: Bearer <jwt_token>` — Used for all protected endpoints |
| **Admin**        | JWT + admin/superAdmin role required                                   |
| **Public**       | No authentication needed                                               |
| **HMAC Signature** | PayMongo webhook signing secret verification                         |
