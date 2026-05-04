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
│   ├── config/             # Configuration (DB, Firebase, Email, PayMongo, Constants)
│   ├── controllers/        # Request handlers & business logic (13 controllers)
│   ├── middleware/         # Auth, validation, CSRF, rate limiting, permissions
│   ├── models/             # Mongoose schemas (16 models)
│   ├── routes/             # Express route definitions (13 route files)
│   ├── utils/              # Helper functions, scheduler, socket, notifications
│   └── server.js           # Entry point
│
├── web/                     # 🌐 Frontend (React + Vite)
│   ├── public/             # Static assets
│   └── src/
│       ├── assets/         # Images
│       ├── features/       # Role-based modules
│       ├── firebase/       # Firebase config
│       ├── shared/         # Shared components/utils/stores
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
│   ├── tenant/             # Applicant & tenant features
│   ├── admin/              # Branch admin features
│   ├── super-admin/        # Owner features (legacy folder name, nested in admin layout)
│   └── shared/             # Cross-feature shared components
│
├── shared/                  # ♻️ Shared across all features
│   ├── api/                # API client functions (14 modules)
│   ├── components/         # Reusable UI components
│   ├── data/               # Static data files
│   ├── guards/             # Route protection components
│   ├── hooks/              # Custom React hooks
│   ├── layouts/            # Page layouts
│   ├── lib/                # React Query client & query keys
│   ├── stores/             # Zustand state stores
│   ├── styles/             # Shared CSS files
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
├── context/             # React context providers
└── index.js             # Barrel exports
```

### Public Feature (`features/public/`)

- Landing page with branch information
- Sign up with comprehensive validation
- Email verification page
- Privacy policy & terms of service
- 404 Not Found page

### Tenant Feature (`features/tenant/`)

- Sign in / Forgot password
- Profile management with demographic details & document uploads
- Check availability with room browsing & bed selection
- Multi-step reservation flow with payment
- Dashboard with overview
- Billing & payment history with PDF receipts
- Maintenance requests
- Announcements with acknowledgment
- Contract management

### Admin Feature (`features/admin/`)

- Dashboard with statistics & quick actions
- Reservations management (with embedded Inquiries tab)
- Tenant management
- Room management (Availability + Setup + Occupancy tabs)
- Billing management (bills, verification, readiness, publishing, reports)
- Maintenance management
- User management
- Audit logs

### Owner Feature (`features/super-admin/`)

Pages nested inside the admin layout via `RequireOwner` guard:

- System-wide dashboard with cross-branch comparisons
- Branch management
- Role/permissions management
- System settings

Note: the folder name remains `features/super-admin/` for compatibility, but the canonical role is `owner`.

---

## Backend Structure (`server/`)

```
server/
├── config/
│   ├── constants.js             # Shared constants & status enums
│   ├── database.js              # MongoDB connection
│   ├── email.js                 # Nodemailer configuration
│   ├── firebase.js              # Firebase Admin SDK
│   └── paymongo.js              # PayMongo API client
│
├── controllers/
│   ├── authController.js        # Auth (register, login, profile)
│   ├── usersController.js       # User CRUD & role management
│   ├── roomsController.js       # Room CRUD & configuration
│   ├── reservationsController.js # Reservation lifecycle
│   ├── inquiriesController.js   # Inquiry management
│   ├── billingController.js     # Bill generation & payment
│   ├── paymentController.js     # PayMongo checkout & processing
│   ├── announcementsController.js # Announcement management
│   ├── maintenanceController.js # Maintenance requests
│   ├── notificationController.js # In-app notifications
│   ├── occupancyController.js   # Occupancy endpoints
│   ├── auditController.js       # Audit log retrieval
│   └── webhookController.js     # PayMongo webhook handler
│
├── middleware/
│   ├── auth.js                  # JWT/Firebase token verification
│   ├── branchAccess.js          # Branch-based access control
│   ├── csrf.js                  # CSRF token protection
│   ├── errorHandler.js          # Centralized error handling
│   ├── logger.js                # Structured request logging (Pino)
│   ├── permissions.js           # Granular permission checks
│   ├── rateLimiter.js           # Tiered rate limiting
│   ├── requestId.js             # Request ID generation & tracing
│   └── validation.js            # Input sanitization & validation
│
├── models/
│   ├── User.js                  # User accounts & roles
│   ├── Room.js                  # Room definitions & beds
│   ├── Reservation.js           # Multi-step reservations
│   ├── Inquiry.js               # Public inquiries
│   ├── Bill.js                  # Tenant billing records
│   ├── RoomBill.js              # Room-based utility bills
│   ├── Payment.js               # Payment transactions
│   ├── Announcement.js          # Branch-targeted announcements
│   ├── MaintenanceRequest.js    # Maintenance requests
│   ├── AcknowledgmentAccount.js # Announcement engagement
│   ├── Notification.js          # In-app notifications
│   ├── AuditLog.js              # Admin action audit trail
│   ├── BedHistory.js            # Bed assignment tracking
│   ├── LoginLog.js              # User login activity
│   ├── UserSession.js           # Active session tracking
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
│   ├── scheduler.js             # Cron job scheduler
│   └── socket.js                # Socket.io initialization
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
| `billingApi.js`      | Bills, reports, publishing, and billing admin actions |
| `announcementApi.js` | Announcements                                |
| `maintenanceApi.js`  | Maintenance requests                         |
| `notificationApi.js` | In-app notifications                         |
| `auditApi.js`        | Audit log retrieval                          |
| `commonApi.js`       | Common/shared API utilities                  |
| `tenantApi.js`       | Tenant-specific API calls                    |

Module 4 route ownership:
- `billingRoutes.js`: bills, verification, penalties, readiness, publishing, reports, exports
- `paymentRoutes.js`: checkout sessions and payment history
- `utilityBillingRoutes.js`: utility periods, readings, results, revisions, send/close workflows
- `financialRoutes.js`: owner-only executive financial overview

### Guards (`shared/guards/`)

| Guard                   | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `RequireAuth.jsx`       | Require authenticated user              |
| `RequireAdmin.jsx`      | Require `branch_admin` or `owner` role  |
| `RequireOwner.jsx`      | Require `owner` role                    |
| `RequireNonAdmin.jsx`   | Block admins from auth pages (redirect) |

### Hooks (`shared/hooks/`)

| Hook                     | Purpose                             |
| ------------------------ | ----------------------------------- |
| `useAuth.js`             | Auth state, login, logout, profile  |
| `FirebaseAuthContext.js` | Firebase auth context provider      |
| `useBodyScrollLock.js`   | Prevent body scroll on modal open   |
| `usePermissions.js`      | Check user permissions              |
| `useSocketClient.js`     | WebSocket connection & events       |

### State Management (`shared/stores/` & `shared/lib/`)

| File                    | Purpose                              |
| ----------------------- | ------------------------------------ |
| `notificationStore.js`  | Zustand store for notification state |
| `queryClient.js`        | React Query client configuration     |
| `queryKeys.js`          | Centralized query key definitions    |

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
| Stores      | camelCase + Store      | `notificationStore.js`|
| Query Keys  | camelCase              | `queryKeys.js`        |

---

## Route Structure

### Public Routes

| Path                | Component           |
| ------------------- | ------------------- |
| `/`                 | LandingPage         |
| `/signup`           | SignUp              |
| `/signin`           | SignIn              |
| `/forgot-password`  | ForgotPassword      |
| `/verify-email`     | VerifyEmail         |
| `/privacy-policy`   | PrivacyPolicyPage   |
| `/terms-of-service` | TermsOfServicePage  |

### Applicant / Tenant Routes (Protected)

| Path                            | Component              |
| ------------------------------- | ---------------------- |
| `/applicant/profile`            | ProfilePage            |
| `/applicant/check-availability` | CheckAvailabilityPage  |
| `/applicant/reservation`        | ReservationFlowPage    |
| `/applicant/billing`            | BillingPage            |
| `/applicant/maintenance`        | MaintenancePage        |
| `/applicant/announcements`      | AnnouncementsPage      |
| `/applicant/contracts`          | ContractsPage          |

### Admin Routes (Protected)

| Path                       | Component            |
| -------------------------- | -------------------- |
| `/admin/dashboard`         | Dashboard            |
| `/admin/reservations`      | ReservationsPage     |
| `/admin/tenants`           | TenantsPage          |
| `/admin/room-availability` | RoomAvailabilityPage |
| `/admin/billing`           | AdminBillingPage     |
| `/admin/maintenance`       | MaintenancePage      |
| `/admin/users`             | UserManagementPage   |
| `/admin/audit-logs`        | AuditLogsPage        |

### Owner Routes (Protected — nested under `/admin`)

| Path               | Component            |
| ------------------ | -------------------- |
| `/admin/branches`  | BranchManagementPage |
| `/admin/roles`     | RolePermissionsPage  |
| `/admin/settings`  | SystemSettingsPage   |

### Legacy Redirects

| Old Path                     | Redirects To                |
| ---------------------------- | --------------------------- |
| `/admin/login`               | `/signin`                   |
| `/tenant/forgot-password`    | `/forgot-password`          |
| `/super-admin/*`             | `/admin/*` (equivalent)     |
| `/applicant/dashboard`       | `/applicant/profile`        |
| `/applicant/rooms`           | `/applicant/check-availability` |

---

## Canonical Route Layer

The current frontend route architecture is split deliberately between a thin app shell and a canonical route layer:

- `web/src/App.js`
  Mounts providers, scroll handling, global loading UI, and the route host
- `web/src/app/lazyPages.js`
  Centralizes lazy page imports for route-level code splitting
- `web/src/app/routes/AppRoutes.jsx`
  Composes all route groups into the single runtime route tree
- `web/src/app/routes/publicRoutes.jsx`
  Owns public pages and auth-only routes
- `web/src/app/routes/tenantRoutes.jsx`
  Owns applicant and tenant-facing routes
- `web/src/app/routes/adminRoutes.jsx`
  Owns admin and owner-facing routes
- `web/src/app/routes/legacyRoutes.jsx`
  Preserves backward-compatible redirects for old bookmarked URLs
- `web/src/app/routes/RouteShell.jsx`
  Wraps route elements in route-level error boundaries

This means `web/src/app/routes/*` is the canonical route source of truth. `App.js` should remain a composition shell, not a second place where routes are defined.
