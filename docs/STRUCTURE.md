# Project Structure Guide

The Lilycrest Dormitory Management System follows a **feature-based architecture** that separates concerns by user roles on the frontend and by domain on the backend.

---

## Root Structure

```
Capstone-Website/
├── docs/                    # 📚 Documentation
│   ├── API.md              # API endpoint reference
│   ├── AUTHENTICATION.md   # Auth system guide
│   ├── DEVELOPER_GUIDE.md  # Practical dev onboarding guide
│   ├── OCCUPANCY_MANAGEMENT.md  # Room/bed occupancy system
│   ├── SECURITY.md         # Security implementation
│   └── STRUCTURE.md        # This file
│
├── server/                  # 🖥️ Backend (Express.js + MongoDB)
│   ├── config/             # Configuration (DB, Firebase, Email)
│   ├── controllers/        # Request handlers & business logic
│   ├── middleware/         # Auth, validation, CSRF, rate limiting
│   ├── models/             # Mongoose schemas
│   ├── routes/             # Express route definitions
│   ├── utils/              # Helper functions & utilities
│   └── server.js           # Entry point
│
├── web/                     # 🌐 Frontend (React + Vite)
│   ├── public/             # Static assets
│   └── src/
│       ├── assets/         # Images
│       ├── features/       # Role-based modules
│       ├── firebase/       # Firebase config
│       ├── shared/         # Shared components/utils
│       ├── App.js          # Main routing
│       └── index.js        # Entry point
│
└── README.md               # Project overview & quick start
```

---

## Frontend Structure (`web/src/`)

```
src/
├── features/                # 🎯 Role-based feature modules
│   ├── public/             # Public pages (no auth required)
│   ├── tenant/             # Tenant/resident features
│   ├── admin/              # Branch admin features
│   └── super-admin/        # System admin features
│
├── shared/                  # ♻️ Shared across all features
│   ├── api/                # API client functions
│   ├── components/         # Reusable UI components
│   ├── guards/             # Route protection components
│   ├── hooks/              # Custom React hooks
│   ├── layouts/            # Page layouts
│   └── utils/              # Helper functions
│
├── assets/                  # 🖼️ Static assets
│   └── images/             # Images by category
│       ├── gpuyat/         # Gil Puyat branch
│       ├── guadalupe/      # Guadalupe branch
│       └── landingpage/    # Landing page
│
├── firebase/                # 🔥 Firebase configuration
│   └── config.js
│
├── App.js                   # Main app with routing
├── AdminApp.js              # Admin app entry
├── App.css                  # Global app styles
├── index.js                 # Entry point
└── index.css                # Global CSS
```

---

## Feature Module Structure

Each feature module follows a consistent pattern:

```
features/{role}/
├── pages/               # Page components
├── components/          # Feature-specific components
├── modals/              # Modal dialogs
├── hooks/               # Feature-specific hooks
├── styles/              # CSS files
└── index.js             # Barrel exports
```

### Public Feature (`features/public/`)

- Landing page with branch information
- Branch information pages (Gil Puyat, Guadalupe)
- Room listings and details with filters
- Inquiry submission modal
- FAQs page

### Tenant Feature (`features/tenant/`)

- Sign up / Sign in / Forgot password
- Branch selection
- Dashboard with overview
- Profile management
- Billing & payment history
- Maintenance requests
- Announcements
- Contract management
- Reservation flow (multi-step)

### Admin Feature (`features/admin/`)

- Admin login
- Dashboard with statistics
- Reservations management (with embedded Inquiries tab)
- Tenant management
- Room management (Availability + Setup + Occupancy tabs)
- Billing management (room-based bill generation)
- User management
- Audit logs

### Super Admin Feature (`features/super-admin/`)

- System dashboard
- User management
- Branch management
- Role/permissions management
- Activity logs
- System settings

---

## Backend Structure (`server/`)

```
server/
├── config/
│   ├── database.js              # MongoDB connection
│   ├── firebase.js              # Firebase Admin SDK
│   └── email.js                 # Nodemailer configuration
│
├── controllers/
│   ├── authController.js        # Auth (register, login, profile)
│   ├── usersController.js       # User CRUD & role management
│   ├── roomsController.js       # Room CRUD & configuration
│   ├── reservationsController.js # Reservation lifecycle
│   ├── inquiriesController.js   # Inquiry management
│   ├── billingController.js     # Bill generation & payment
│   ├── announcementsController.js # Announcement management
│   ├── maintenanceController.js # Maintenance requests
│   ├── occupancyController.js   # Occupancy endpoints
│   └── auditController.js       # Audit log retrieval
│
├── middleware/
│   ├── auth.js                  # JWT/Firebase token verification
│   ├── branchAccess.js          # Branch-based access control
│   ├── csrf.js                  # CSRF token protection
│   ├── errorHandler.js          # Centralized error handling
│   ├── logger.js                # Request logging
│   ├── rateLimiter.js           # Rate limiting
│   ├── requestId.js             # Request ID generation
│   └── validation.js            # Input sanitization & validation
│
├── models/
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
├── routes/
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

## Shared Components (`shared/`)

### API Layer (`shared/api/`)

| File                 | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `httpClient.js`      | Core fetch wrapper with auth token injection |
| `apiClient.js`       | Shared API client configuration              |
| `authApi.js`         | Authentication endpoints                     |
| `roomApi.js`         | Room browsing & management                   |
| `reservationApi.js`  | Reservation CRUD                             |
| `inquiryApi.js`      | Inquiry submission & management              |
| `userApi.js`         | User management                              |
| `billingApi.js`      | Billing & payment                            |
| `announcementApi.js` | Announcements                                |
| `maintenanceApi.js`  | Maintenance requests                         |
| `auditApi.js`        | Audit log retrieval                          |
| `commonApi.js`       | Common/shared API utilities                  |
| `tenantApi.js`       | Tenant-specific API calls                    |

### Guards (`shared/guards/`)

| Guard                   | Purpose                    |
| ----------------------- | -------------------------- |
| `RequireAuth.jsx`       | Require authenticated user |
| `RequireAdmin.jsx`      | Require admin role         |
| `RequireSuperAdmin.jsx` | Require super admin role   |

### Hooks (`shared/hooks/`)

| Hook                     | Purpose                        |
| ------------------------ | ------------------------------ |
| `useAuth.js`             | Auth state and methods         |
| `FirebaseAuthContext.js` | Firebase auth context provider |

---

## Naming Conventions

| Type        | Convention             | Example               |
| ----------- | ---------------------- | --------------------- |
| Components  | PascalCase             | `InquiryItem.jsx`     |
| Pages       | PascalCase + Page      | `DashboardPage.jsx`   |
| Hooks       | camelCase + use        | `useInquiries.js`     |
| Styles      | kebab-case             | `admin-dashboard.css` |
| Utils       | camelCase              | `formatDate.js`       |
| Constants   | UPPER_SNAKE_CASE       | `API_BASE_URL`        |
| Routes      | camelCase + Routes     | `authRoutes.js`       |
| Controllers | camelCase + Controller | `authController.js`   |
| Models      | PascalCase             | `User.js`             |

---

## Route Structure

### Public Routes

| Path               | Component          |
| ------------------ | ------------------ |
| `/`                | LandingPage        |
| `/gil-puyat`       | GPuyatPage         |
| `/gil-puyat/rooms` | GPuyatRoomsPage    |
| `/guadalupe`       | GuadalupePage      |
| `/guadalupe/rooms` | GuadalupeRoomsPage |
| `/faqs`            | FAQsPage           |

### Tenant Routes (Protected)

| Path                       | Component         |
| -------------------------- | ----------------- |
| `/tenant/signin`           | SignIn            |
| `/tenant/signup`           | SignUp            |
| `/tenant/forgot-password`  | ForgotPassword    |
| `/tenant/branch-selection` | BranchSelection   |
| `/tenant/dashboard`        | TenantDashboard   |
| `/tenant/profile`          | ProfilePage       |
| `/tenant/billing`          | BillingPage       |
| `/tenant/maintenance`      | MaintenancePage   |
| `/tenant/announcements`    | AnnouncementsPage |
| `/tenant/contracts`        | ContractsPage     |

### Admin Routes (Protected)

| Path                       | Component            |
| -------------------------- | -------------------- |
| `/admin/login`             | AdminLoginPage       |
| `/admin/dashboard`         | Dashboard            |
| `/admin/reservations`      | ReservationsPage     |
| `/admin/tenants`           | TenantsPage          |
| `/admin/room-availability` | RoomAvailabilityPage |
| `/admin/billing`           | AdminBillingPage     |
| `/admin/users`             | UserManagement       |
| `/admin/audit-logs`        | AuditLogs            |

### Super Admin Routes (Protected)

| Path                     | Component            |
| ------------------------ | -------------------- |
| `/super-admin/dashboard` | SuperAdminDashboard  |
| `/super-admin/users`     | UserManagementPage   |
| `/super-admin/branches`  | BranchManagementPage |
| `/super-admin/logs`      | ActivityLogsPage     |
| `/super-admin/settings`  | SystemSettingsPage   |
