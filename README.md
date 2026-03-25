# 🏢 Lilycrest Dormitory Management System

> A full-stack web-based dormitory management platform designed to handle multi-branch operations, tenant lifecycle management, room-based billing, online payments, real-time notifications, and occupancy tracking — all through a unified, role-based interface.

[![Node.js](https://img.shields.io/badge/Node.js-16%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?logo=socket.io&logoColor=white)](https://socket.io/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Features](#features)
- [API Reference](#api-reference)
- [Security](#security)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Lilycrest DMS is built for **Lilycrest Dormitory**, a multi-branch residential facility operating in Makati, Philippines. The system digitizes and streamlines dormitory operations including:

- **Reservation lifecycle** — from inquiry to check-in via a guided multi-step workflow
- **Room & occupancy management** — real-time bed-level tracking with automatic availability updates
- **Billing & online payments** — room-based utility bill generation with pro-rata distribution and PayMongo checkout
- **Maintenance** — tenant-submitted requests with priority tracking and resolution stats
- **Real-time notifications** — WebSocket-powered in-app notifications with unread counts
- **Audit trail** — comprehensive logging of all administrative actions
- **PDF receipts** — auto-generated payment receipts for tenants

The platform serves four distinct user roles — public visitors, applicants/tenants, branch admins, and system administrators — each with a dedicated, access-controlled interface.

---

## Tech Stack

| Layer          | Technologies                                                                      |
| -------------- | --------------------------------------------------------------------------------- |
| **Frontend**   | React 19, Vite, React Router, Zustand, React Query, Firebase Auth (Client SDK)    |
| **Backend**    | Express.js, MongoDB (Mongoose ODM), Firebase Admin SDK, Socket.io                 |
| **Payments**   | PayMongo (Checkout Sessions, Webhooks)                                            |
| **Email**      | Nodemailer (Gmail SMTP)                                                           |
| **Uploads**    | ImageKit (client-side uploads with server auth)                                   |
| **Auth**       | Firebase Authentication (Email/Password, Google OAuth)                            |
| **Scheduling** | node-cron (grace periods, bed lock cleanup, overdue billing)                      |
| **Security**   | Helmet, input sanitization, CSRF protection, rate limiting, RBAC, branch isolation|

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- [MongoDB Atlas](https://www.mongodb.com/atlas) account
- [Firebase](https://firebase.google.com/) project with Authentication enabled
- [PayMongo](https://www.paymongo.com/) account (for online payments)

### Installation

```bash
# Clone the repository
git clone https://github.com/kuurz-z/Capstone-Website.git
cd Capstone-Website

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../web && npm install
```

### Environment Configuration

**Backend** — create `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/lilycrest
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
FRONTEND_URL=http://localhost:3000
PAYMONGO_SECRET_KEY=your-paymongo-secret-key
PAYMONGO_WEBHOOK_SECRET=your-webhook-signing-key
IMAGEKIT_PRIVATE_KEY=your-imagekit-private-key
```

**Frontend** — create `web/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### Running the Application

```bash
# Terminal 1 — Start backend
cd server && npm run dev

# Terminal 2 — Start frontend
cd web && npm run dev
```

| Service     | URL                   |
| ----------- | --------------------- |
| Frontend    | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health Check| http://localhost:5000/api/health |

---

## Project Structure

```
Capstone-Website/
│
├── server/                      # Express.js Backend
│   ├── config/                 # Database, Firebase, Email, PayMongo, Constants
│   ├── controllers/            # Request handlers (13 controllers)
│   ├── middleware/             # Auth, validation, CSRF, rate limiting, permissions
│   ├── models/                # Mongoose schemas (16 models)
│   ├── routes/                # API route definitions (13 route files)
│   ├── utils/                 # Audit logger, occupancy, scheduler, socket, notifications
│   └── server.js              # Application entry point
│
├── web/                         # React + Vite Frontend
│   └── src/
│       ├── features/           # Role-based UI modules
│       │   ├── public/        # Landing page, signup, legal pages
│       │   ├── tenant/        # Applicant & tenant portal
│       │   ├── admin/         # Branch admin dashboard
│       │   └── super-admin/   # System administration (nested in admin layout)
│       ├── shared/            # Shared components, API layer, hooks, stores, utils
│       └── firebase/          # Firebase configuration
│
└── docs/                        # Technical documentation
```

> For a complete file-by-file breakdown, see [docs/STRUCTURE.md](docs/STRUCTURE.md).

---

## Features

### Public Interface

- Responsive landing page with branch information
- Room browsing with filters (type, price, capacity, availability)
- Online inquiry submission with email notifications
- Privacy policy and terms of service pages
- Email verification flow

### Applicant & Tenant Portal

- Guided multi-step reservation workflow with room & bed selection
- Online payment via PayMongo (deposits & monthly bills)
- Real-time billing dashboard with payment history & PDF receipts
- Maintenance request submission and tracking
- Announcements with read/acknowledgment tracking
- Profile management with demographic details & document uploads
- Contract management
- In-app notifications with real-time updates (WebSocket)

### Admin Dashboard

- Unified reservation and inquiry management
- Room management with 3-tab interface (Availability, Setup, Occupancy)
- Room-based billing with pro-rata utility distribution
- Tenant lifecycle management (pending → confirmed → checked-in → checked-out)
- Maintenance request management
- Comprehensive audit trail for all actions
- Vacancy date forecasting

### System Administration (Super Admin)

- Cross-branch system dashboard with performance comparisons
- Branch management & configuration
- Role and permission management
- System-wide activity logs & user management
- System settings

---

## API Reference

The backend exposes RESTful API endpoints organized by domain:

| Domain         | Base Path              | Auth           |
| -------------- | ---------------------- | -------------- |
| Authentication | `/api/auth`            | Firebase / JWT |
| Rooms          | `/api/rooms`           | Public / Admin |
| Reservations   | `/api/reservations`    | JWT / Admin    |
| Inquiries      | `/api/inquiries`       | Public / Admin |
| Billing        | `/api/billing`         | JWT / Admin    |
| Payments       | `/api/payments`        | JWT / Admin    |
| Announcements  | `/api/announcements`   | JWT / Admin    |
| Maintenance    | `/api/maintenance`     | JWT / Admin    |
| Notifications  | `/api/notifications`   | JWT            |
| Users          | `/api/users`           | Admin          |
| Audit Logs     | `/api/audit-logs`      | Admin          |
| Uploads        | `/api/upload`          | JWT            |
| Webhooks       | `/api/webhooks`        | HMAC Signature |
| Health         | `/api/health`          | Public         |

> For complete endpoint documentation with request/response examples, see [docs/API.md](docs/API.md).

---

## Security

The application implements multiple layers of security:

| Measure                | Implementation                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| **Authentication**     | Firebase Auth with JWT token verification on every request           |
| **Authorization**      | Role-based access control (applicant, tenant, admin, superAdmin)     |
| **Permissions**        | Granular permission checks via dedicated permissions middleware       |
| **Branch Isolation**   | Automatic data filtering ensures users only access their branch      |
| **Input Validation**   | Server-side sanitization against XSS, injection, and malformed input |
| **CSRF Protection**    | Cryptographic token validation on state-changing requests            |
| **Rate Limiting**      | Tiered throttling (global, auth, public) to prevent abuse            |
| **Security Headers**   | Helmet middleware for CSP, HSTS, X-Frame-Options, etc.               |
| **Webhook Verification** | HMAC signature validation on PayMongo webhook callbacks            |
| **Audit Logging**      | All administrative actions recorded with before/after snapshots      |

> For implementation details, see [docs/SECURITY.md](docs/SECURITY.md).

---

## Deployment

### Frontend

```bash
cd web && npm run build
```

Deploy the `build/` directory to **Vercel**, **Netlify**, or **Firebase Hosting**.

### Backend

Deploy to **Railway**, **Render**, or any Node.js-compatible platform. Ensure all environment variables are configured in your hosting provider's settings.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Update `FRONTEND_URL` and `VITE_API_URL` to production domains
- [ ] Use production MongoDB Atlas URI with IP whitelist
- [ ] Use production Firebase credentials
- [ ] Set production PayMongo keys and webhook secret
- [ ] Configure ImageKit production credentials

---

## Documentation

| Document                                             | Description                                  |
| ---------------------------------------------------- | -------------------------------------------- |
| [API Reference](docs/API.md)                         | Complete endpoint documentation              |
| [Authentication](docs/AUTHENTICATION.md)             | Firebase auth flows and setup                |
| [Developer Guide](docs/DEVELOPER_GUIDE.md)           | Coding patterns, conventions, and onboarding |
| [Occupancy Management](docs/OCCUPANCY_MANAGEMENT.md) | Room and bed tracking system                 |
| [Security](docs/SECURITY.md)                         | Security implementation details              |
| [Project Structure](docs/STRUCTURE.md)               | Full file structure reference                |
| [Backend Guide](server/README.md)                    | Backend-specific documentation               |
| [Frontend Guide](web/README.md)                      | Frontend-specific documentation              |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please refer to the [Developer Guide](docs/DEVELOPER_GUIDE.md) for coding conventions and patterns used in this project.

---

## License

This project was developed as a capstone project for academic purposes.

---

<p align="center">
  <strong>Lilycrest Dormitory Management System</strong><br>
  Built with React · Express · MongoDB · Firebase · PayMongo · Socket.io
</p>
