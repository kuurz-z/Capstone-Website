# API Documentation

Current reference for the main backend API groups.

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
| POST   | `/set-role`      | Owner    | Set user role      |

---

## Rooms (`/api/rooms`)

| Method | Endpoint                       | Auth  | Description                  |
| ------ | ------------------------------ | ----- | ---------------------------- |
| GET    | `/`                            | Public| Get all rooms with filters   |
| GET    | `/:roomId`                     | Public| Get room by ID               |
| POST   | `/`                            | Admin | Create room                  |
| PUT    | `/:roomId`                     | Admin | Update room                  |
| DELETE | `/:roomId`                     | Admin | Archive room                 |
| PATCH  | `/:roomId/beds/:bedId/status`  | Admin | Update bed maintenance state |

---

## Reservations (`/api/reservations`)

| Method | Endpoint                     | Auth  | Description                          |
| ------ | ---------------------------- | ----- | ------------------------------------ |
| GET    | `/`                          | JWT   | Get reservations                     |
| GET    | `/current-residents`         | Admin | Get current residents                |
| GET    | `/my-contract`               | JWT   | Get active tenant contract view      |
| GET    | `/:reservationId`            | JWT   | Get reservation by ID                |
| POST   | `/`                          | JWT   | Create reservation                   |
| PUT    | `/:reservationId`            | Admin | Update reservation                   |
| PUT    | `/:reservationId/user`       | JWT   | Update own reservation               |
| DELETE | `/:reservationId`            | JWT   | Delete reservation                   |
| PUT    | `/:reservationId/extend`     | Admin | Extend reservation move-in deadline  |
| PUT    | `/:reservationId/release`    | Admin | Release reserved slot                |
| PUT    | `/:reservationId/archive`    | Admin | Archive reservation                  |
| PUT    | `/:reservationId/renew`      | Admin | Renew tenant contract                |
| PUT    | `/:reservationId/checkout`   | Admin | Move out tenant                      |
| PUT    | `/:reservationId/transfer`   | Admin | Transfer tenant room/bed             |
| GET    | `/occupancy/:roomId`         | JWT   | Get room occupancy snapshot          |
| GET    | `/stats/occupancy`           | JWT   | Get branch occupancy statistics      |
| GET    | `/vacancy-forecast`          | Admin | Get vacancy forecast read model      |

Canonical lifecycle:
- `pending -> visit_pending -> visit_approved -> payment_pending -> reserved -> moveIn -> moveOut`
- side exits: `cancelled`, `archived`

---

## Billing (`/api/billing`)

| Method | Endpoint                 | Auth  | Description                            |
| ------ | ------------------------ | ----- | -------------------------------------- |
| GET    | `/current`               | JWT   | Get current month's bill               |
| GET    | `/history`               | JWT   | Get billing history                    |
| GET    | `/my-bills`              | JWT   | Get all visible tenant bills           |
| GET    | `/:billId/utility-breakdown/:utilityType` | JWT | Get tenant utility breakdown by bill |
| POST   | `/:billId/submit-proof`  | JWT   | Submit payment proof for a bill        |
| GET    | `/stats`                 | Admin | Get branch billing statistics          |
| GET    | `/branch`                | Admin | Get bills for a branch                 |
| GET    | `/rooms`                 | Admin | Get billable rooms and occupants       |
| GET    | `/pending-verifications` | Admin | Get bills awaiting proof verification  |
| GET    | `/report`                | Admin | Get billing report summary             |
| POST   | `/:billId/verify`        | Admin | Approve or reject payment proof        |
| POST   | `/:billId/mark-paid`     | Admin | Mark bill as paid                      |
| DELETE | `/:billId`               | Admin | Delete an unpaid/orphaned bill         |
| POST   | `/apply-penalties`       | Admin | Apply late penalties                   |
| GET    | `/readiness`             | Admin | Get room publish-readiness state       |
| POST   | `/publish/:roomId`       | Admin | Publish draft bills for one room       |
| GET    | `/export`                | Admin | Export billing rows for CSV/reporting  |

---

## Payments (`/api/payments`)

| Method | Endpoint                     | Auth  | Description                               |
| ------ | ---------------------------- | ----- | ----------------------------------------- |
| POST   | `/bill/:billId/checkout`     | JWT   | Create PayMongo checkout for a bill       |
| POST   | `/deposit/:resId/checkout`   | JWT   | Create PayMongo checkout for deposit      |
| GET    | `/session/:sessionId/status` | JWT   | Check checkout session payment status     |
| GET    | `/history`                   | JWT   | Get payment history for current user      |
| GET    | `/bill/:billId/payments`     | JWT   | Get bill payment records                  |
| GET    | `/vacancy-dates`             | Admin | Get expected vacancy dates for occupied beds |

---

## Utilities (`/api/utilities`)

Utility billing owns periods, readings, computed results, revisions, and send/close workflows.

Key patterns:
- `GET /:utilityType/rooms`
- `GET /:utilityType/readings/:roomId`
- `GET /:utilityType/periods/:roomId`
- `GET /:utilityType/results/:periodId`
- `POST /:utilityType/periods`
- `POST /:utilityType/readings`
- `PATCH /:utilityType/periods/:id/close`
- `POST /:utilityType/periods/:id/send`
- `POST /:utilityType/batch-close`
- `POST /:utilityType/results/:periodId/revise`

---

## Financial (`/api/financial`)

| Method | Endpoint    | Auth  | Description                          |
| ------ | ----------- | ----- | ------------------------------------ |
| GET    | `/overview` | Owner | Executive financial overview by branch |

---

## Users (`/api/users`)

| Method | Endpoint                | Auth  | Description                  |
| ------ | ----------------------- | ----- | ---------------------------- |
| GET    | `/stats`                | Admin | Get user statistics          |
| GET    | `/branch/:branch`       | Owner | Get users by branch          |
| GET    | `/email-by-username`    | Public| Get email by username        |
| POST   | `/`                     | Owner | Create user                  |
| PATCH  | `/:userId/suspend`      | Admin | Suspend user                 |
| PATCH  | `/:userId/reactivate`   | Admin | Reactivate user              |
| PATCH  | `/:userId/ban`          | Owner | Ban user                     |
| PATCH  | `/:userId/permissions`  | Owner | Update admin permissions     |
| GET    | `/`                     | Admin | Get users                    |
| GET    | `/my-stays`             | JWT   | Get current user stay history|
| GET    | `/:userId`              | Admin | Get user by ID               |
| PUT    | `/:userId`              | Owner | Update user                  |
| DELETE | `/:userId`              | Owner | Delete user                  |

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
| GET    | `/scheduled`             | Admin | Get scheduled work         |
| GET    | `/costs`                 | Admin | Get maintenance cost summary |

---

## Audit Logs (`/api/audit-logs`)

| Method | Endpoint                   | Auth  | Description                |
| ------ | -------------------------- | ----- | -------------------------- |
| GET    | `/`                        | Admin | Get audit logs             |
| GET    | `/stats`                   | Admin | Get audit statistics       |
| GET    | `/security/failed-logins`  | Admin | Get failed login activity  |
| GET    | `/:id`                     | Admin | Get specific audit log     |
| POST   | `/`                        | JWT   | Create audit log entry     |
| POST   | `/export`                  | Admin | Export audit logs          |
| DELETE | `/cleanup`                 | Owner | Cleanup old audit logs     |

---

## Module 4 Route Ownership

- `/api/billing`
  Bills, verification, penalties, readiness, publishing, reporting, exports
- `/api/payments`
  Checkout sessions and payment history only
- `/api/utilities`
  Utility periods, readings, results, revisions, send/close workflows
- `/api/financial`
  Owner-only executive financial overview

---

## Authentication Types

| Type             | Usage                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| **Firebase**     | `Authorization: Bearer <firebase_id_token>` for register/login         |
| **JWT**          | `Authorization: Bearer <jwt_token>` for protected endpoints            |
| **Admin**        | JWT + `branch_admin` or `owner` role                                   |
| **Owner**        | JWT + `owner` role                                                     |
| **Public**       | No authentication needed                                               |
| **HMAC Signature** | PayMongo webhook signing secret verification                         |
