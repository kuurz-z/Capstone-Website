# Lilycrest Backend API

Express.js backend with MongoDB and Firebase Admin SDK for the Lilycrest Dormitory Management System.

---

## Technology Stack

- **Express.js** — Web framework
- **MongoDB + Mongoose** — Database & ODM
- **Firebase Admin SDK** — Token verification
- **Nodemailer** — Email service
- **JWT** — Token-based authentication

---

## Project Structure

```
server/
├── config/
│   ├── database.js              # MongoDB connection
│   ├── firebase.js              # Firebase Admin SDK
│   └── email.js                 # Nodemailer configuration
│
├── controllers/                  # Business logic (10 controllers)
│   ├── authController.js        # Auth (register, login, profile)
│   ├── usersController.js       # User CRUD & role management
│   ├── roomsController.js       # Room CRUD & configuration
│   ├── reservationsController.js # Reservation lifecycle
│   ├── inquiriesController.js   # Inquiry management
│   ├── billingController.js     # Bill generation & payment
│   ├── announcementsController.js # Announcement management
│   ├── maintenanceController.js # Maintenance requests
│   ├── occupancyController.js   # Occupancy endpoints
│   └── auditController.js      # Audit log retrieval
│
├── middleware/                   # Express middleware (8 modules)
│   ├── auth.js                  # JWT/Firebase verification
│   ├── branchAccess.js          # Branch-based access control
│   ├── csrf.js                  # CSRF protection
│   ├── errorHandler.js          # Centralized error handling
│   ├── logger.js                # Request logging
│   ├── rateLimiter.js           # Rate limiting
│   ├── requestId.js             # Request ID generation
│   └── validation.js            # Input sanitization & validation
│
├── models/                       # Mongoose schemas (10 models)
│   ├── User.js                  # User accounts & roles
│   ├── Room.js                  # Room definitions & beds
│   ├── Reservation.js           # Multi-step reservations
│   ├── Inquiry.js               # Public inquiries
│   ├── Bill.js                  # Tenant billing records
│   ├── RoomBill.js              # Room-based utility bills
│   ├── Announcement.js          # Branch-targeted announcements
│   ├── MaintenanceRequest.js    # Maintenance requests
│   ├── AcknowledgmentAccount.js # Announcement engagement
│   ├── AuditLog.js              # Admin action audit trail
│   ├── archive/                 # Archive utility schemas
│   └── index.js                 # Central model exports
│
├── routes/                       # Express routes (9 route files)
│   ├── authRoutes.js            # /api/auth/*
│   ├── usersRoutes.js           # /api/users/*
│   ├── roomsRoutes.js           # /api/rooms/*
│   ├── reservationsRoutes.js    # /api/reservations/*
│   ├── inquiriesRoutes.js       # /api/inquiries/*
│   ├── billingRoutes.js         # /api/billing/*
│   ├── announcementRoutes.js    # /api/announcements/*
│   ├── maintenanceRoutes.js     # /api/maintenance/*
│   └── auditRoutes.js           # /api/audit-logs/*
│
├── utils/
│   ├── auditLogger.js           # Audit logging utility
│   ├── occupancyManager.js      # Room occupancy logic
│   └── reservationHelpers.js    # Reservation helper functions
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
FRONTEND_URL=http://localhost:3000
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

### Users (`/api/users`)

| Method | Endpoint   | Auth  | Description    |
| ------ | ---------- | ----- | -------------- |
| GET    | `/`        | Admin | Get all users  |
| GET    | `/:userId` | Admin | Get user by ID |
| PUT    | `/:userId` | Admin | Update user    |
| DELETE | `/:userId` | Admin | Delete user    |

### Audit Logs (`/api/audit-logs`)

| Method | Endpoint | Auth  | Description    |
| ------ | -------- | ----- | -------------- |
| GET    | `/`      | Admin | Get audit logs |

See [docs/API.md](../docs/API.md) for complete endpoint documentation with request/response examples.

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

- **Input Validation & Sanitization** — XSS protection, format validation (`middleware/validation.js`)
- **CSRF Protection** — Cryptographic token validation (`middleware/csrf.js`)
- **Branch Isolation** — Automatic branch filtering, users only access their branch data
- **Rate Limiting** — Protection against brute force on auth endpoints (`middleware/rateLimiter.js`)
- **Role-Based Access Control** — `user` → `tenant` → `admin` → `superAdmin`

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
| `Announcement`          | Branch-targeted announcements with engagement tracking |
| `MaintenanceRequest`    | Maintenance request tracking with categories           |
| `AcknowledgmentAccount` | Announcement read/acknowledge tracking                 |
| `AuditLog`              | Comprehensive admin action audit trail                 |

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
