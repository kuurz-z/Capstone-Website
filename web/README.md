# Lilycrest Frontend (React)

React-based frontend for the Lilycrest Dormitory Management System.

---

## Technology Stack

- **React 19** — UI framework
- **Vite** — Build tool & dev server
- **React Router** — Client-side routing
- **Firebase Auth** — Authentication
- **Zustand** — Lightweight state management
- **React Query** — Server state & data fetching
- **Socket.io Client** — Real-time notifications
- **libphonenumber-js** — Phone number validation & formatting
- **CSS Modules** — Component styling

---

## Project Structure

```
src/
├── features/              # Role-based modules
│   ├── public/           # Public pages (landing, signup, legal, verify email)
│   ├── tenant/           # Applicant & tenant features
│   ├── admin/            # Branch admin interface
│   ├── super-admin/      # System admin pages (nested in admin layout)
│   └── shared/           # Cross-feature shared components
│
├── shared/               # Shared across all roles
│   ├── api/             # API client functions (14 modules)
│   ├── components/      # Reusable UI components
│   ├── data/            # Static data files
│   ├── guards/          # Route protection (4 guards)
│   ├── hooks/           # Custom React hooks
│   ├── layouts/         # Page layouts
│   ├── lib/             # React Query client & query keys
│   ├── stores/          # Zustand state stores
│   ├── styles/          # Shared CSS files
│   └── utils/           # Helper functions (15+ utilities)
│
├── assets/              # Images and static files
├── firebase/            # Firebase configuration
├── App.js              # Main app with routing
└── index.js            # Entry point
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
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

Get Firebase config from: [Firebase Console](https://console.firebase.google.com/) > Project Settings > Web App

### 3. Run Development Server

```bash
npm run dev
```

App runs on: **http://localhost:3000**

### 4. Build for Production

```bash
npm run build
```

Outputs to `build/` directory.

---

## Available Scripts

| Command           | Description                           |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start Vite dev server with hot reload |
| `npm run build`   | Create production build               |
| `npm run preview` | Preview production build locally      |
| `npm test`        | Run Jest tests                        |

---

## Key Features

### Authentication

- Email/password signup/login
- Google OAuth integration
- Email verification with dedicated verify page
- Password reset
- Unified sign-in for all roles (tenants, admins, super admins)

### Public Features

- Landing page with branch information
- Room listings with filters via Check Availability page
- Inquiry submission modal
- Privacy policy & terms of service pages
- Sign up with comprehensive validation

### Applicant & Tenant Portal

- Profile page with demographic details & document uploads
- Check availability with room browsing & bed selection
- Multi-step reservation flow with payment upload
- Online payment via PayMongo (deposits & monthly bills)
- Billing dashboard with payment history & PDF receipts
- Maintenance request submission & tracking
- Announcements with acknowledgment
- Contract management
- In-app notifications with real-time updates

### Admin Dashboard

- Dashboard with statistics & quick actions
- Reservations management (with embedded Inquiries tab)
- Tenant management
- Room management (Availability + Setup + Occupancy tabs)
- Billing management (room-based bill generation)
- Maintenance request management
- User management
- Audit logs

### Super Admin Panel

- System-wide dashboard with cross-branch comparisons
- Branch management
- Role & permissions management
- System settings

---

## API Integration

All API calls use modular API clients in `shared/api/` with automatic:

- Firebase token injection via `httpClient.js`
- Error handling & response formatting
- Base URL configuration

**API Modules:**

| Module              | Purpose                      |
| ------------------- | ---------------------------- |
| `httpClient.js`     | Core fetch wrapper with auth |
| `apiClient.js`      | Shared API configuration     |
| `authApi.js`        | Authentication endpoints     |
| `roomApi.js`        | Room browsing & management   |
| `reservationApi.js` | Reservation CRUD             |
| `inquiryApi.js`     | Inquiry submission           |
| `billingApi.js`     | Billing & payments           |
| `userApi.js`        | User management              |
| `announcementApi.js`| Announcements                |
| `maintenanceApi.js` | Maintenance requests         |
| `notificationApi.js`| In-app notifications         |
| `auditApi.js`       | Audit log retrieval          |
| `commonApi.js`      | Common/shared utilities      |
| `tenantApi.js`      | Tenant-specific calls        |

---

## Routing Structure

### Public Routes

- `/` — Landing page
- `/signup` — Sign up (unified)
- `/signin` — Sign in (unified, all roles)
- `/forgot-password` — Password reset
- `/verify-email` — Email verification
- `/privacy-policy` — Privacy policy
- `/terms-of-service` — Terms of service

### Protected Routes (Applicant / Tenant)

- `/applicant/profile` — Profile management
- `/applicant/check-availability` — Room browsing & bed selection
- `/applicant/reservation` — Multi-step reservation flow
- `/applicant/billing` — Billing & payments
- `/applicant/maintenance` — Maintenance requests
- `/applicant/announcements` — Announcements
- `/applicant/contracts` — Contract details

### Protected Routes (Admin)

- `/admin/dashboard` — Admin dashboard
- `/admin/reservations` — Inquiries + Reservations
- `/admin/tenants` — Tenant management
- `/admin/room-availability` — Room management (tabs)
- `/admin/billing` — Billing management
- `/admin/maintenance` — Maintenance management
- `/admin/users` — User management
- `/admin/audit-logs` — Audit trail

### Protected Routes (Super Admin — nested under `/admin`)

- `/admin/branches` — Branch management
- `/admin/roles` — Role & permissions
- `/admin/settings` — System settings

### Legacy Redirects

Old `/super-admin/*`, `/tenant/*`, and `/admin/login` paths automatically redirect to their new equivalents.

---

## Route Guards

| Guard                   | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `RequireAuth.jsx`       | Require authenticated user                 |
| `RequireAdmin.jsx`      | Require admin or superAdmin role           |
| `RequireSuperAdmin.jsx` | Require super admin role                   |
| `RequireNonAdmin.jsx`   | Block admins from auth pages (redirect)    |
| `ProtectedRoute`        | Role-based route protection component      |

---

## State Management

### Zustand Stores (`shared/stores/`)

- `notificationStore.js` — In-app notification state & unread counts

### React Query (`shared/lib/`)

- `queryClient.js` — Configured query client with default options
- `queryKeys.js` — Centralized query key definitions for cache management

---

## Custom Hooks

| Hook                     | Purpose                             |
| ------------------------ | ----------------------------------- |
| `useAuth.js`             | Auth state, login, logout, profile  |
| `FirebaseAuthContext.js` | Firebase auth context provider      |
| `useBodyScrollLock.js`   | Prevent body scroll on modal open   |
| `usePermissions.js`      | Check user permissions              |
| `useSocketClient.js`     | WebSocket connection & events       |

---

## Component Patterns

### Feature Module Pattern

Each role has its own feature module with:

- `pages/` — Page components
- `components/` — Feature-specific components
- `modals/` — Modal dialogs
- `hooks/` — Custom hooks
- `styles/` — CSS files
- `index.js` — Barrel exports

### Lazy Loading & Code Splitting

All page components are lazy-loaded with `React.lazy()` for optimal bundle sizes:

```jsx
const BillingPage = React.lazy(
  () => import("./features/tenant/pages/BillingPage"),
);
```

### Route Error Boundaries

Every route is wrapped in `<RouteErrorBoundary>` for crash isolation:

```jsx
<RouteErrorBoundary name="Billing">
  <BillingPage />
</RouteErrorBoundary>
```

---

## Utility Functions

| Utility              | Purpose                                |
| -------------------- | -------------------------------------- |
| `auth.js`            | Auth helper functions                  |
| `authValidation.js`  | Form validation rules                  |
| `constants.js`       | App-wide constants                     |
| `currency.js`        | Currency formatting (₱)               |
| `exportUtils.js`     | Data export (CSV, Excel)               |
| `formatDate.js`      | Date formatting helpers                |
| `formatPaymentMethod.js` | Payment method display formatting  |
| `friendlyError.js`   | User-friendly error messages           |
| `imageUpload.js`     | ImageKit upload helpers                |
| `notification.js`    | Toast notification utilities           |
| `pdfReceipt.js`      | PDF receipt generation                 |
| `pdfUtils.js`        | PDF utility functions                  |
| `psgcApi.js`         | Philippine address API (PSGC)          |
| `receiptGenerator.js`| Receipt template generation            |
| `reservationCode.js` | Reservation code utilities             |

---

## Styling

- Global styles: `App.css`, `index.css`
- Shared styles: `shared/styles/`
- Component styles: Feature-specific CSS files
- Naming convention: BEM (Block Element Modifier)

---

## Development Tips

### Hot Reload

Vite provides instant hot module replacement. Changes appear immediately without full page reload.

### Debugging

- React DevTools for component inspection
- Browser DevTools for network/console debugging
- Firebase Auth state in console: `firebase.auth().currentUser`

### Code Organization

- Keep components small and focused
- Use custom hooks for reusable logic
- Put shared code in `shared/`
- Keep feature code isolated in `features/{role}/`
- Use Zustand for cross-component state, React Query for server state

---

## Deployment

### Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

### Vercel

```bash
vercel --prod
```

### Netlify

```bash
netlify deploy --prod --dir=build
```

---

## Documentation

- [Main README](../README.md) — Project overview
- [API Documentation](../docs/API.md) — API endpoints
- [Authentication Guide](../docs/AUTHENTICATION.md) — Auth flows
- [Project Structure](../docs/STRUCTURE.md) — Full structure
- [Security Guide](../docs/SECURITY.md) — Security implementation
- [Developer Guide](../docs/DEVELOPER_GUIDE.md) — Coding patterns & conventions

---

## Support

For backend API issues, see [server/README.md](../server/README.md)
