# Lilycrest Backend API

Express.js backend with MongoDB, Firebase Admin SDK, PayMongo, and Socket.io for the Lilycrest Dormitory Management System.

---

## Technology Stack

- **Express.js** — Web framework
- **MongoDB + Mongoose** — Database & ODM
- **Firebase Admin SDK** — Token verification
- **PayMongo** — Online payment processing
- **Socket.io** — Real-time notifications
- **Nodemailer** — Email service
- **Helmet** — Security headers
- **node-cron** — Background job scheduling
- **Pino** — Structured JSON logging
- **ImageKit** — Image upload authentication

---

## Project Structure

```
server/
├── config/
│   ├── constants.js             # Shared constants (status enums, limits)
│   ├── database.js              # MongoDB connection
│   ├── email.js                 # Nodemailer configuration
│   ├── firebase.js              # Firebase Admin SDK
│   └── paymongo.js              # PayMongo API client
│
├── controllers/                  # Business logic (13 controllers)
│   ├── authController.js        # Auth (register, login, profile)
│   ├── usersController.js       # User CRUD & role management
│   ├── roomsController.js       # Room CRUD & configuration
│   ├── reservationsController.js # Reservation lifecycle
│   ├── inquiriesController.js   # Inquiry management
│   ├── billingController.js     # Bill generation & payment
│   ├── paymentController.js     # PayMongo checkout & payment processing
│   ├── announcementsController.js # Announcement management
│   ├── maintenanceController.js # Maintenance requests
│   ├── notificationController.js # In-app notification management
│   ├── occupancyController.js   # Occupancy endpoints
│   ├── auditController.js       # Audit log retrieval
│   └── webhookController.js     # PayMongo webhook handler
│
├── middleware/                   # Express middleware (9 modules)
│   ├── auth.js                  # JWT/Firebase verification
│   ├── branchAccess.js          # Branch-based access control
│   ├── csrf.js                  # CSRF protection
│   ├── errorHandler.js          # Centralized error handling
│   ├── logger.js                # Structured request logging (Pino)
│   ├── permissions.js           # Granular permission checks
│   ├── rateLimiter.js           # Tiered rate limiting (global, auth, public)
│   ├── requestId.js             # Request ID generation & tracing
│   └── validation.js            # Input sanitization & validation
│
├── models/                       # Mongoose schemas (16 models)
│   ├── User.js                  # User accounts & roles
│   ├── Room.js                  # Room definitions & beds
│   ├── Reservation.js           # Multi-step reservations
│   ├── Inquiry.js               # Public inquiries
│   ├── Bill.js                  # Tenant billing records
│   ├── RoomBill.js              # Room-based utility bills
│   ├── Payment.js               # Payment transaction records
│   ├── Announcement.js          # Branch-targeted announcements
│   ├── MaintenanceRequest.js    # Maintenance requests
│   ├── AcknowledgmentAccount.js # Announcement engagement
│   ├── Notification.js          # In-app notifications
│   ├── AuditLog.js              # Admin action audit trail
│   ├── BedHistory.js            # Bed assignment change tracking
│   ├── LoginLog.js              # User login activity
│   ├── UserSession.js           # Active session tracking
│   ├── archive/                 # Archive utility schemas
│   └── index.js                 # Central model exports
│
├── routes/                       # Express routes (13 route files)
│   ├── authRoutes.js            # /api/auth/*
│   ├── usersRoutes.js           # /api/users/*
│   ├── roomsRoutes.js           # /api/rooms/*
│   ├── reservationsRoutes.js    # /api/reservations/*
│   ├── inquiriesRoutes.js       # /api/inquiries/*
│   ├── billingRoutes.js         # /api/billing/*
│   ├── paymentRoutes.js         # /api/payments/*
│   ├── announcementRoutes.js    # /api/announcements/*
│   ├── maintenanceRoutes.js     # /api/maintenance/*
│   ├── notificationRoutes.js    # /api/notifications/*
│   ├── uploadRoutes.js          # /api/upload/*
│   ├── webhookRoutes.js         # /api/webhooks/*
│   └── auditRoutes.js           # /api/audit-logs/*
│
├── utils/
│   ├── auditLogger.js           # Audit logging utility
│   ├── bedLockCleanup.js        # Expired bed lock cleanup
│   ├── gracePeriodJob.js        # Reservation grace period enforcement
│   ├── notificationService.js   # Notification creation & delivery
│   ├── occupancyManager.js      # Room occupancy logic
│   ├── reservationHelpers.js    # Reservation helper functions
│   ├── sanitize.js              # Input sanitization utilities
│   ├── scheduler.js             # Cron job scheduler (grace periods, billing, cleanup)
│   └── socket.js                # Socket.io initialization & event handling
│
└── server.js                    # Express app entry point
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lilycrest

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Email (Gmail)
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-app-specific-password

# CORS
FRONTEND_URL=http://localhost:5173

# PayMongo
PAYMONGO_SECRET_KEY=your-paymongo-secret-key
PAYMONGO_WEBHOOK_SECRET=your-webhook-signing-key

# ImageKit
IMAGEKIT_PRIVATE_KEY=your-imagekit-private-key
```

### 3. Run Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

Server runs on: **http://localhost:5000**

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint         | Auth     | Description        |
| ------ | ---------------- | -------- | ------------------ |
| POST   | `/register`      | Firebase | Register new user  |
| POST   | `/login`         | Firebase | User login         |
| GET    | `/profile`       | JWT      | Get user profile   |
| PUT    | `/profile`       | JWT      | Update profile     |
| PATCH  | `/update-branch` | JWT      | Update user branch |
| POST   | `/set-role`      | Admin    | Set user role      |

### Rooms (`/api/rooms`)

| Method | Endpoint   | Auth   | Description                  |
| ------ | ---------- | ------ | ---------------------------- |
| GET    | `/`        | Public | Get all rooms (with filters) |
| GET    | `/:roomId` | Public | Get room by ID               |
| POST   | `/`        | Admin  | Create room                  |
| PUT    | `/:roomId` | Admin  | Update room                  |
| DELETE | `/:roomId` | Admin  | Delete room                  |

### Reservations (`/api/reservations`)

| Method | Endpoint          | Auth  | Description        |
| ------ | ----------------- | ----- | ------------------ |
| GET    | `/`               | JWT   | Get reservations   |
| GET    | `/:reservationId` | JWT   | Get by ID          |
| POST   | `/`               | JWT   | Create reservation |
| PUT    | `/:reservationId` | Admin | Update reservation |
| DELETE | `/:reservationId` | Admin | Cancel reservation |

### Inquiries (`/api/inquiries`)

| Method | Endpoint              | Auth   | Description           |
| ------ | --------------------- | ------ | --------------------- |
| GET    | `/`                   | Admin  | Get all inquiries     |
| POST   | `/`                   | Public | Submit inquiry        |
| PATCH  | `/:inquiryId/respond` | Admin  | Respond (sends email) |

### Billing (`/api/billing`)

| Method | Endpoint                  | Auth  | Description          |
| ------ | ------------------------- | ----- | -------------------- |
| GET    | `/current`                | JWT   | Current month's bill |
| GET    | `/history`                | JWT   | Payment history      |
| GET    | `/stats`                  | Admin | Branch billing stats |
| POST   | `/:billId/mark-paid`      | Admin | Mark as paid         |
| GET    | `/rooms`                  | Admin | Rooms for billing    |
| POST   | `/rooms/:roomId/generate` | Admin | Generate room bill   |

### Payments (`/api/payments`)

| Method | Endpoint                      | Auth  | Description                          |
| ------ | ----------------------------- | ----- | ------------------------------------ |
| POST   | `/bill/:billId/checkout`      | JWT   | Create PayMongo checkout for bill    |
| POST   | `/deposit/:resId/checkout`    | JWT   | Create PayMongo checkout for deposit |
| GET    | `/session/:sessionId/status`  | JWT   | Check checkout session status        |
| GET    | `/history`                    | JWT   | Get payment history                  |
| GET    | `/bill/:billId/payments`      | JWT   | Get payments for a bill              |
| GET    | `/vacancy-dates`              | Admin | Get expected vacancy dates           |

### Announcements (`/api/announcements`)

| Method | Endpoint           | Auth  | Description         |
| ------ | ------------------ | ----- | ------------------- |
| GET    | `/`                | JWT   | Get announcements   |
| POST   | `/`                | Admin | Create announcement |
| POST   | `/:id/acknowledge` | JWT   | Acknowledge         |

### Maintenance (`/api/maintenance`)

| Method | Endpoint        | Auth  | Description       |
| ------ | --------------- | ----- | ----------------- |
| GET    | `/my-requests`  | JWT   | Tenant's requests |
| POST   | `/requests`     | JWT   | Create request    |
| PATCH  | `/requests/:id` | Admin | Update status     |

### Notifications (`/api/notifications`)

| Method | Endpoint                   | Auth | Description           |
| ------ | -------------------------- | ---- | --------------------- |
| GET    | `/`                        | JWT  | Get notifications     |
| GET    | `/unread-count`            | JWT  | Get unread count      |
| PATCH  | `/read-all`                | JWT  | Mark all as read      |
| PATCH  | `/:notificationId/read`    | JWT  | Mark single as read   |

### Users (`/api/users`)

| Method | Endpoint   | Auth  | Description    |
| ------ | ---------- | ----- | -------------- |
| GET    | `/`        | Admin | Get all users  |
| GET    | `/:userId` | Admin | Get user by ID |
| PUT    | `/:userId` | Admin | Update user    |
| DELETE | `/:userId` | Admin | Delete user    |

### Uploads (`/api/upload`)

| Method | Endpoint         | Auth | Description                     |
| ------ | ---------------- | ---- | ------------------------------- |
| GET    | `/imagekit-auth` | JWT  | Get ImageKit upload credentials |

### Webhooks (`/api/webhooks`)

| Method | Endpoint    | Auth           | Description                  |
| ------ | ----------- | -------------- | ---------------------------- |
| POST   | `/paymongo` | HMAC Signature | PayMongo payment callback    |

### Audit Logs (`/api/audit-logs`)

| Method | Endpoint | Auth  | Description    |
| ------ | -------- | ----- | -------------- |
| GET    | `/`      | Admin | Get audit logs |

### Health (`/api/health`)

| Method | Endpoint | Auth   | Description                               |
| ------ | -------- | ------ | ----------------------------------------- |
| GET    | `/`      | Public | Deep health check (DB, memory, uptime)    |

See [docs/API.md](../docs/API.md) for complete endpoint documentation with request/response examples.
For tenant monthly-billing checkout rollout and sandbox verification, see [docs/TENANT_BILLING_CHECKOUT_ROLLOUT.md](../docs/TENANT_BILLING_CHECKOUT_ROLLOUT.md).

---

## Authentication Flow

```
User signs in → Firebase Auth → Returns ID token
    ↓
Request with token → Firebase Admin verifies → Returns user data
    ↓
Middleware chain: verifyToken → verifyAdmin → filterByBranch → handler
```

---

## Security Features

- **Helmet** — Secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **Input Validation & Sanitization** — XSS protection, format validation (`middleware/validation.js`)
- **CSRF Protection** — Cryptographic token validation (`middleware/csrf.js`)
- **Branch Isolation** — Automatic branch filtering, users only access their branch data
- **Rate Limiting** — Tiered protection: global (1000/15min), auth (strict), public (`middleware/rateLimiter.js`)
- **Role-Based Access Control** — `applicant` → `tenant` → `admin` → `superAdmin`
- **Granular Permissions** — Fine-grained permission checks (`middleware/permissions.js`)
- **Webhook Security** — HMAC signature verification on PayMongo callbacks
- **Graceful Shutdown** — Clean database and socket disconnection on SIGTERM/SIGINT

---

## Database Models

| Model                   | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `User`                  | Accounts with Firebase UID, roles, branches            |
| `Room`                  | Room definitions with beds, capacity, pricing          |
| `Reservation`           | Multi-step reservation lifecycle                       |
| `Inquiry`               | Public inquiry submissions                             |
| `Bill`                  | Tenant billing records                                 |
| `RoomBill`              | Room-based utility bill generation                     |
| `Payment`               | Payment transaction records (PayMongo & manual)        |
| `Announcement`          | Branch-targeted announcements with engagement tracking |
| `MaintenanceRequest`    | Maintenance request tracking with categories           |
| `AcknowledgmentAccount` | Announcement read/acknowledge tracking                 |
| `Notification`          | In-app notification records with read status           |
| `AuditLog`              | Comprehensive admin action audit trail                 |
| `BedHistory`            | Bed assignment change tracking                         |
| `LoginLog`              | User login activity records                            |
| `UserSession`           | Active session tracking                                |

---

## Background Jobs

The server runs scheduled background jobs via `utils/scheduler.js`:

| Job                  | Schedule    | Description                                         |
| -------------------- | ----------- | --------------------------------------------------- |
| Grace Period Check   | Every 5 min | Auto-expire reservations past their grace period     |
| Bed Lock Cleanup     | Every 10 min| Release expired bed locks from abandoned reservations|
| Overdue Bill Check   | Daily       | Flag overdue bills and notify tenants                |

---

## Error Handling

Standard error responses:

```json
{
  "error": "Error message",
  "details": ["Validation error 1", "Validation error 2"],
  "code": "ERROR_CODE"
}
```

Common error codes: `VALIDATION_ERROR`, `AUTH_FAILED`, `UNAUTHORIZED`, `NOT_FOUND`, `BRANCH_ACCESS_DENIED`

---

## Development

### Test API Endpoints

Use Postman, Insomnia, or curl:

```bash
# Get all rooms
curl http://localhost:5000/api/rooms

# Health check
curl http://localhost:5000/api/health

# Register user (with Firebase token)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Authorization: Bearer <firebase-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","firstName":"John","lastName":"Doe"}'
```

---

## Deployment

### Environment Variables

- Update `MONGODB_URI` to production database
- Update `FRONTEND_URL` to production domain
- Use production Firebase credentials
- Set production PayMongo keys and webhook secret
- Configure ImageKit production credentials

### Production Mode

```bash
NODE_ENV=production npm start
```

### Hosting Options

- **Railway** — Deploy via GitHub integration
- **Render** — Automatic deployment from repo
- **Google Cloud Run** — Use Docker container
- **AWS EC2** — Deploy with PM2

---

## Documentation

- [Main README](../README.md) — Project overview
- [API Documentation](../docs/API.md) — Complete API reference
- [Authentication Guide](../docs/AUTHENTICATION.md) — Auth implementation
- [Security Guide](../docs/SECURITY.md) — Security features
- [Project Structure](../docs/STRUCTURE.md) — Full structure
- [Developer Guide](../docs/DEVELOPER_GUIDE.md) — Coding patterns & conventions
