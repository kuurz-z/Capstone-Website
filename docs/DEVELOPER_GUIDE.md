# Developer Guide

Practical guide for programmers working on the Lilycrest Dormitory Management System. Covers setup, conventions, and common patterns.

---

## Getting Started

### Prerequisites

| Tool          | Version | Purpose                   |
| ------------- | ------- | ------------------------- |
| Node.js       | 16+     | Runtime                   |
| MongoDB Atlas | —       | Database (cloud)          |
| Firebase      | —       | Authentication            |
| PayMongo      | —       | Online payment processing |
| npm           | 8+      | Package manager           |

### Setup Steps

1. **Clone the repo** and install dependencies:

```bash
git clone <repository-url>
cd Capstone-Website

cd server && npm install
cd ../web && npm install
```

2. **Create environment files** — see the sections below for required variables.

3. **Start both servers**:

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd web && npm run dev
```

---

## Environment Variables

### Backend (`server/.env`)

| Variable                | Example                   | Description                      |
| ----------------------- | ------------------------- | -------------------------------- |
| `PORT`                  | `5000`                    | Server port                      |
| `NODE_ENV`              | `development`             | Environment mode                 |
| `MONGODB_URI`           | `mongodb+srv://...`       | MongoDB Atlas connection string  |
| `FIREBASE_PROJECT_ID`   | `your-project-id`         | Firebase project ID              |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk@...`   | Firebase service account email   |
| `FIREBASE_PRIVATE_KEY`  | `"-----BEGIN PRIVATE..."` | Firebase private key (in quotes) |
| `EMAIL_USER`            | `your-gmail@gmail.com`    | Gmail for sending emails         |
| `EMAIL_PASSWORD`        | `your-app-password`       | Gmail app-specific password      |
| `FRONTEND_URL`          | `http://localhost:3000`   | Frontend URL for CORS            |
| `PAYMONGO_SECRET_KEY`   | `sk_test_...`             | PayMongo API secret key          |
| `PAYMONGO_WEBHOOK_SECRET`| `whsk_...`               | PayMongo webhook signing key     |
| `IMAGEKIT_PRIVATE_KEY`  | `private_...`             | ImageKit private key for uploads |

### Frontend (`web/.env`)

| Variable                            | Example                     | Description             |
| ----------------------------------- | --------------------------- | ----------------------- |
| `VITE_API_URL`                      | `http://localhost:5000/api` | Backend API base URL    |
| `VITE_FIREBASE_API_KEY`             | `AIza...`                   | Firebase web API key    |
| `VITE_FIREBASE_AUTH_DOMAIN`         | `project.firebaseapp.com`   | Firebase auth domain    |
| `VITE_FIREBASE_PROJECT_ID`          | `your-project-id`           | Firebase project ID     |
| `VITE_FIREBASE_STORAGE_BUCKET`      | `project.appspot.com`       | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456...`                 | Firebase messaging ID   |
| `VITE_FIREBASE_APP_ID`              | `1:123...`                  | Firebase app ID         |

> **Tip**: Get Firebase config from [Firebase Console](https://console.firebase.google.com/) → Project Settings → Web App

---

## Code Conventions

### Naming Rules

| Type             | Convention             | Example                  |
| ---------------- | ---------------------- | ------------------------ |
| React components | PascalCase             | `InquiryItem.jsx`        |
| Page components  | PascalCase + Page      | `DashboardPage.jsx`      |
| React hooks      | camelCase + use        | `useInquiries.js`        |
| CSS files        | kebab-case             | `admin-dashboard.css`    |
| Utility files    | camelCase              | `formatDate.js`          |
| Constants        | UPPER_SNAKE_CASE       | `API_BASE_URL`           |
| Route files      | camelCase + Routes     | `authRoutes.js`          |
| Controller files | camelCase + Controller | `authController.js`      |
| Model files      | PascalCase             | `User.js`                |
| Zustand stores   | camelCase + Store      | `notificationStore.js`   |
| Branches         | kebab-case             | `gil-puyat`, `guadalupe` |
| Roles            | snake_case             | `branch_admin`, `tenant` |

### File Organization

- **Frontend**: Feature-based modules under `web/src/features/{role}/`
- **Backend**: Domain-based organization in `server/` (controllers, models, routes)
- **Shared code**: Goes in `web/src/shared/`
- **Feature-specific code**: Stays in its feature module
- **State management**: Zustand stores in `web/src/shared/stores/`
- **Query management**: React Query config in `web/src/shared/lib/`

---

## Key Patterns

### 1. API Client Pattern (Frontend)

All API calls go through domain-specific modules in `web/src/shared/api/`:

```javascript
// Import from the specific API module
import { billingApi } from "../shared/api/billingApi";

// Use in a component
const loadBills = async () => {
  const data = await billingApi.getCurrentBilling();
  setBills(data);
};
```

The `httpClient.js` module handles:

- Automatic Firebase token injection
- Error response formatting
- Base URL configuration

### 2. Branch Isolation Pattern (Backend)

All queries automatically filter by the user's branch:

```javascript
// In controllers — always include branch filtering
const bills = await Bill.find({ userId, branch: req.user.branch });

// Admin queries filter by their branch too
const stats = await Bill.getPaymentStats(req.user.branch);
```

### 3. Embedded Component Pattern (Frontend)

Components can work standalone (full page) or embedded in tabs:

```jsx
function InquiriesPage({ isEmbedded = false }) {
  const content = <section>...</section>;

  if (isEmbedded) return content;  // No sidebar/header
  return (
    <div className="admin-layout">
      <Sidebar />
      {content}
    </div>
  );
}

// Usage as standalone page:
<InquiriesPage />

// Usage embedded in a tab:
<InquiriesPage isEmbedded={true} />
```

### 4. Auth Middleware Chain (Backend)

Protected routes use a middleware chain:

```javascript
router.post(
  "/some-action",
  verifyToken, // 1. Verify Firebase/JWT token
  verifyAdmin, // 2. Check role (optional)
  filterByBranch, // 3. Apply branch filter (optional)
  handler, // 4. Execute controller
);
```

### 5. Audit Logging (Backend)

All admin mutations are logged using `auditLogger.js`:

```javascript
await AuditLogger.log({
  userId: req.user.uid,
  action: "UPDATE_RESERVATION",
  resourceType: "reservation",
  resourceId: reservation._id,
  changes: { before: oldData, after: newData },
  branch: req.user.branch,
});
```

### 6. Zustand Store Pattern (Frontend)

Global state management with Zustand:

```javascript
// shared/stores/notificationStore.js
import { create } from "zustand";

const useNotificationStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
}));
```

### 7. React Query Pattern (Frontend)

Server state management with centralized query keys:

```javascript
// shared/lib/queryKeys.js
export const queryKeys = {
  billing: { current: ["billing", "current"], history: ["billing", "history"] },
};

// In a component
const { data } = useQuery({
  queryKey: queryKeys.billing.current,
  queryFn: () => billingApi.getCurrentBilling(),
});
```

### 8. WebSocket Pattern (Frontend)

Real-time communication via Socket.io:

```javascript
// shared/hooks/useSocketClient.js
const socket = useSocketClient();

useEffect(() => {
  socket.on("notification", (data) => {
    // Update notification count
  });
}, [socket]);
```

### 9. PayMongo Checkout Pattern (Backend)

Online payment flow:

```javascript
// 1. Tenant requests checkout session
const session = await paymongoClient.createCheckoutSession({
  amount, description, metadata
});

// 2. Tenant completes payment on PayMongo hosted page

// 3. PayMongo sends webhook → webhookController verifies HMAC → updates bill/reservation
```

---

## How to Add a New Feature

### Adding a New API Endpoint

1. **Create/update the model** in `server/models/` if new data is needed
2. **Create controller functions** in `server/controllers/`
3. **Create route file** in `server/routes/` (e.g., `newFeatureRoutes.js`)
4. **Register routes** in `server/server.js`:
   ```javascript
   import newFeatureRoutes from "./routes/newFeatureRoutes.js";
   app.use("/api/new-feature", newFeatureRoutes);
   ```
5. **Create frontend API module** in `web/src/shared/api/` (e.g., `newFeatureApi.js`)
6. **Build the UI** in the appropriate feature module (`features/admin/`, `features/tenant/`, etc.)

### Adding a New Page

1. Create the page component in `features/{role}/pages/`
2. Create the CSS file in `features/{role}/styles/`
3. Add the route in `App.js` with `React.lazy()` and `<RouteErrorBoundary>`
4. Wrap with appropriate guard (`ProtectedRoute`, `RequireAdmin`, etc.)
5. Add sidebar link if needed (in the layout component)

---

## Roles & Access Levels

| Role         | Access                     | Can Do                                                              |
| ------------ | -------------------------- | ------------------------------------------------------------------- |
| `applicant`  | Public pages + reservation | Browse rooms, submit inquiries, create reservations                 |
| `tenant`     | Tenant portal              | View bills, submit maintenance requests, manage profile, pay online |
| `branch_admin` | Admin dashboard          | Manage reservations, tenants, rooms, and billing for their branch   |
| `owner`        | System-wide administration | Cross-branch access, branch configuration, permission management    |

Role transitions:

- New signup → `applicant`
- Reservation moved in → automatically promoted to `tenant`
- Manual promotion → `branch_admin` or `owner` (by owner only)

---

## Troubleshooting

### "CORS error" in browser console

- Check that `FRONTEND_URL` in `server/.env` matches your frontend URL exactly

### "Firebase token expired" errors

- The `httpClient.js` automatically refreshes tokens — check if `getFreshToken()` is called

### "Branch access denied"

- The user's branch doesn't match the resource's branch
- Check `req.user.branch` in the middleware chain

### Build fails with import errors

- Make sure you're using the correct import path (relative, not absolute)
- Frontend uses `VITE_` prefix for env vars, not `REACT_APP_`

### PayMongo webhook not received

- Ensure webhook routes are registered **before** `express.json()` in `server.js`
- Check that `PAYMONGO_WEBHOOK_SECRET` matches the key set in PayMongo dashboard
- Webhook endpoint must be publicly accessible (can't test on localhost without a tunnel)

---

## Documentation Map

| Need             | Read                                                    |
| ---------------- | ------------------------------------------------------- |
| Project overview | [README.md](../README.md)                               |
| API endpoints    | [docs/API.md](API.md)                                   |
| Auth system      | [docs/AUTHENTICATION.md](AUTHENTICATION.md)             |
| Security details | [docs/SECURITY.md](SECURITY.md)                         |
| File structure   | [docs/STRUCTURE.md](STRUCTURE.md)                       |
| Occupancy system | [docs/OCCUPANCY_MANAGEMENT.md](OCCUPANCY_MANAGEMENT.md) |
| Backend setup    | [server/README.md](../server/README.md)                 |
| Frontend setup   | [web/README.md](../web/README.md)                       |
