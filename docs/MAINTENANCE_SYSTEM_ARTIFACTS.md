# LilyCrest Maintenance System Artifacts

## 1. Scope

This artifact documents the current maintenance request logic, flow, functions, and integration points in the LilyCrest app.

The maintenance feature supports:

- Tenant/applicant request submission and request history.
- Admin/owner request triage, filtering, assignment, status updates, notes, work logs, and CSV export.
- Branch-scoped access for branch admins.
- Owner access across branches.
- Legacy `/api/maintenance/*` route compatibility while the canonical contract uses `/api/m/maintenance/*`.

## 2. Main Files

### Backend

- `server/server.js`
  - Mounts the maintenance router at:
    - `/api/m/maintenance`
    - `/api/maintenance`

- `server/routes/maintenanceContractRoutes.js`
  - Defines tenant, admin, shared detail, and compatibility routes.
  - Applies `verifyToken` to all maintenance routes.

- `server/controllers/maintenanceController.js`
  - Contains all tenant/admin maintenance request business logic.

- `server/models/MaintenanceRequest.js`
  - Defines the `maintenance_requests` MongoDB collection schema.

- `server/config/maintenance.js`
  - Defines request types, urgency levels, statuses, status transitions, normalization helpers, labels, and notification text.

### Frontend

- `web/src/shared/api/maintenanceApi.js`
  - API wrapper for maintenance endpoints.

- `web/src/shared/hooks/queries/useMaintenance.js`
  - React Query hooks for list/detail/create/update/cancel/reopen operations.

- `web/src/features/tenant/pages/MaintenanceWorkspacePage.jsx`
  - Tenant page wrapper.

- `web/src/features/tenant/components/maintenance/TenantMaintenanceWorkspace.jsx`
  - Tenant-facing maintenance UI.

- `web/src/features/admin/pages/AdminMaintenancePage.jsx`
  - Admin-facing maintenance workspace.

- `web/src/shared/utils/maintenanceConfig.js`
  - Frontend labels, icons, colors, and status metadata.

## 3. Backend Route Contract

All routes require Firebase authentication through `verifyToken`.

### Tenant Routes

| Method | Route | Middleware | Controller | Purpose |
|---|---|---|---|---|
| GET | `/api/m/maintenance/me` | `verifyApplicant` | `getMyRequests` | Fetch current tenant requests |
| POST | `/api/m/maintenance` | `verifyApplicant` | `createRequest` | Create request |
| PUT | `/api/m/maintenance/:requestId` | `verifyApplicant` | `updateMyRequest` | Edit pending request |
| PATCH | `/api/m/maintenance/:requestId/cancel` | `verifyApplicant` | `cancelMyRequest` | Cancel pending request |
| PATCH | `/api/m/maintenance/:requestId/reopen` | `verifyApplicant` | `reopenMyRequest` | Reopen resolved/completed request |

### Admin Routes

| Method | Route | Middleware | Controller | Purpose |
|---|---|---|---|---|
| GET | `/api/m/maintenance/admin/all` | `verifyAdmin`, `filterByBranch`, `requirePermission("manageMaintenance")` | `getAdminAll` | Fetch branch-scoped/all requests |
| PATCH | `/api/m/maintenance/admin/:requestId/status` | `verifyAdmin`, `filterByBranch`, `requirePermission("manageMaintenance")` | `updateAdminRequestStatus` | Update status, notes, assignment, work log |
| PATCH | `/api/m/maintenance/admin/bulk` | `verifyAdmin`, `filterByBranch`, `requirePermission("manageMaintenance")` | `updateAdminBulkRequests` | Bulk update status/assignment/notes |

Bulk payload example:

```json
{
  "requestIds": ["maint_123", "maint_456"],
  "status": "in_progress",
  "assigned_to": "Maintenance Team A",
  "notes": "Assigned and queued for today"
}
```

### Shared Detail Routes

| Method | Route | Controller | Purpose |
|---|---|---|---|
| GET | `/api/m/maintenance/:requestId` | `getRequestById` | Fetch accessible request details |
| GET | `/api/m/maintenance/requests/:requestId` | `getRequestById` | Compatibility detail route |

### Compatibility Routes

The same router is also mounted under `/api/maintenance`.

| Method | Route | Controller | Purpose |
|---|---|---|---|
| GET | `/api/maintenance/my-requests` | `getMyRequests` | Legacy tenant list |
| POST | `/api/maintenance/requests` | `createRequestCompat` | Legacy create request |
| GET | `/api/maintenance/branch` | `getByBranch` | Legacy admin list |
| PATCH | `/api/maintenance/requests/:requestId` | `updateRequest` | Legacy admin update |
| GET | `/api/maintenance/stats/completion` | `getCompletionStats` | Resolution stats |
| GET | `/api/maintenance/stats/issue-frequency` | `getIssueFrequency` | Issue frequency stats |

## 4. Data Model

Collection: `maintenance_requests`

### Primary Fields

| Field | Purpose |
|---|---|
| `request_id` | Public request identifier, generated as `maint_...` |
| `user_id` | Tenant user identifier |
| `request_type` | One of configured maintenance types |
| `description` | Tenant issue description |
| `urgency` | `low`, `normal`, or `high` |
| `status` | Current request status |
| `assigned_to` | Staff/team assignment |
| `notes` | Admin response shown to tenant |
| `attachments` | Uploaded file metadata |
| `statusHistory` | Timeline entries |
| `work_log` | Admin/internal work notes |
| `reopen_history` | Reopen audit entries |
| `branch` | Branch scope |
| `reservationId` | Active reservation reference |
| `roomId` | Room reference |
| `userId` | MongoDB user reference |
| `isArchived` | Soft archive flag |

### Timestamps

| Field | Meaning |
|---|---|
| `created_at` | Request creation time |
| `updated_at` | Last update time |
| `cancelled_at` | Tenant cancellation time |
| `reopened_at` | Last reopen time |
| `assigned_at` | Assignment update time |
| `work_started_at` | First move to `in_progress` |
| `resolved_at` | Resolution/completion time |
| `closed_at` | Close time |

## 5. Request Types, Urgency, and Statuses

### Request Types

- `maintenance`
- `plumbing`
- `electrical`
- `aircon`
- `cleaning`
- `pest`
- `furniture`
- `other`

### Urgency Levels

- `low`
- `normal`
- `high`

### Statuses

- `pending`
- `viewed`
- `in_progress`
- `waiting_tenant`
- `resolved`
- `completed`
- `rejected`
- `cancelled`
- `closed`

## 6. Status State Machine

Tenant-created requests start as `pending`.

Primary flow: `pending` → `viewed` → `in_progress` → `resolved` → `closed`, with optional `waiting_tenant` when staff need tenant input.

Admin-allowed transitions:

| Current | Allowed Next |
|---|---|
| `pending` | `viewed`, `in_progress`, `rejected`, `waiting_tenant` |
| `viewed` | `in_progress`, `rejected`, `waiting_tenant` |
| `in_progress` | `waiting_tenant`, `resolved`, `completed`, `rejected` |
| `waiting_tenant` | `in_progress`, `resolved`, `completed`, `rejected` |
| `resolved` | `closed` |
| `completed` | `closed` |
| `rejected` | `closed` |
| `cancelled` | none through admin update |
| `closed` | none through admin update |

Tenant-only transitions:

| Action | From | To |
|---|---|---|
| Cancel | `pending` | `cancelled` |
| Reopen | `resolved`, `completed` | `pending` |

Important behavior:

- Tenants can edit only `pending` requests.
- Tenants can cancel only `pending` requests.
- Tenants can reopen only `resolved` or `completed` requests.
- Admins cannot update `cancelled` requests from the UI.
- Backend prevents invalid admin status transitions.
- Closed requests are locked and cannot be updated.
- Admin responses are required when moving to `waiting_tenant`, `resolved`, `completed`, `rejected`, or `closed`.

## 7. Tenant Flow

### Submit Request

1. Tenant opens Maintenance page.
2. Frontend fetches `GET /api/m/maintenance/me?limit=50`.
3. Tenant clicks `New Request`.
4. Tenant selects:
   - request type
   - urgency
   - description
   - optional attachments
5. Attachments are uploaded through ImageKit before form submit.
6. Frontend sends `POST /api/m/maintenance`.
7. Backend:
   - finds MongoDB user by Firebase UID
  - validates type, urgency, and minimum description length
  - blocks duplicate open requests with the same type and description
   - finds active reservation using current resident statuses
   - copies branch, reservation, and room references
   - creates request with `pending` status
   - writes initial `statusHistory` event
8. Frontend invalidates maintenance queries and refreshes the request list.

### View Request History

Tenant list shows:

- request type
- created date
- urgency
- status
- description
- ETA estimate
- SLA state
- attachment count/links
- admin response
- status timeline

## 8. Admin Flow

### List and Filter Requests

1. Admin opens `/admin/maintenance`.
2. Frontend calls `GET /api/m/maintenance/admin/all`.
3. Backend applies:
   - Firebase auth
   - admin role check
   - branch filter
   - `manageMaintenance` permission
4. Admin can filter by:
   - status
   - request type
   - urgency
   - date range
   - branch, owner only
   - search text, client-side
  - quick filters: needs action, unassigned, high priority, delayed, waiting for tenant
5. Admin can sort by:
   - newest first
   - urgency high first
6. Admin can export filtered results to CSV.
7. Admin can select multiple rows and apply a bulk status/assignment update.

### Detail and Update

1. Admin selects a row.
2. Frontend fetches `GET /api/m/maintenance/:requestId`.
3. Drawer shows:
   - tenant details
   - branch
   - type
   - urgency
   - status
   - SLA
   - timestamps
   - description
   - attachments
   - reopen history
   - status timeline
   - work log
4. Admin submits:
   - status
   - assignment
   - admin response
   - optional work log note
5. Frontend sends `PATCH /api/m/maintenance/admin/:requestId/status`.
6. Backend validates transition, enforces required notes for waiting/resolve/close, updates fields, appends timeline/work log, and notifies tenant when status changes.

## 9. Access Control

### Tenant Access

Tenant routes require `verifyApplicant`.

Tenant request ownership is enforced with:

- request `user_id`
- current DB user `user_id`

If they do not match, backend returns forbidden access.

### Admin Access

Admin list/update routes require:

- `verifyAdmin`
- `filterByBranch`
- `requirePermission("manageMaintenance")`

Branch admins are limited to their branch. Owners can access all branches and can optionally filter by branch.

### Shared Detail Access

`getRequestById` allows:

- owner: any branch
- branch admin: own branch only
- tenant: own request only

## 10. SLA Logic

SLA is computed in the controller response, not stored as a field.

Target hours:

| Urgency | Target |
|---|---|
| `low` | 120 hours |
| `normal` | 48 hours |
| `high` | 24 hours |

SLA base time:

- `reopened_at` if present
- otherwise `created_at`

SLA labels:

| Label | Meaning |
|---|---|
| `closed` | Status is resolved, completed, rejected, or cancelled |
| `delayed` | Open and past target time |
| `priority` | High urgency and still open |
| `on_track` | Open and within target time |

## 11. Frontend Data Flow

### API Wrapper

`maintenanceApi` wraps:

- tenant list/create/update/cancel/reopen/detail
- admin list/update
- legacy stats endpoints

### React Query Hooks

`useMaintenance.js` provides:

- `useMyMaintenanceRequests`
- `useAdminMaintenanceRequests`
- `useMaintenanceRequest`
- `useCreateMaintenanceRequest`
- `useUpdateMyMaintenanceRequest`
- `useCancelMaintenanceRequest`
- `useReopenMaintenanceRequest`
- `useUpdateMaintenanceRequest`
- stats hooks

Mutation success invalidates `queryKeys.maintenance.all`.

## 12. Function Map

### Controller Functions

| Function | Responsibility |
|---|---|
| `getMyRequests` | Tenant request list |
| `getAdminAll` | Admin branch-scoped request list |
| `createRequest` | Canonical request creation |
| `createRequestCompat` | Legacy create payload adapter |
| `getRequestById` | Shared detail lookup with access rules |
| `updateMyRequest` | Tenant edit for pending requests |
| `cancelMyRequest` | Tenant cancel for pending requests |
| `reopenMyRequest` | Tenant reopen for resolved/completed requests |
| `updateAdminRequestStatus` | Admin status/assignment/notes/work-log updates |
| `updateAdminRequestStatusCompat` | Legacy admin update payload adapter |
| `getCompletionStats` | Completed/resolved aggregate stats |
| `getIssueFrequency` | Frequency aggregate stats |

### Important Helpers

| Helper | Responsibility |
|---|---|
| `getDbUser` | Load MongoDB user by Firebase UID |
| `ensureTenantAccess` | Enforce tenant ownership |
| `ensureAdminAccess` | Enforce branch access for non-owner admins |
| `serializeMaintenanceRequest` | Stable API response shape |
| `normalizeAttachments` | Validate/clean attachment entries |
| `getSlaState` | Compute SLA state |
| `buildMaintenanceDocument` | Create request document from tenant and reservation |
| `findAccessibleRequest` | Find request by `request_id` or Mongo `_id` |

## 13. Response Shape

Maintenance responses use the shared success wrapper through `sendSuccess`.

Single request payload:

```json
{
  "request": {
    "id": "maint_...",
    "request_id": "maint_...",
    "user_id": "user_...",
    "request_type": "plumbing",
    "description": "Issue details",
    "urgency": "normal",
    "status": "pending",
    "assigned_to": null,
    "notes": null,
    "attachments": [],
    "statusHistory": [],
    "slaState": {
      "targetHours": 48,
      "targetAt": "date",
      "isDelayed": false,
      "isHighPriorityUnresolved": false,
      "label": "on_track"
    },
    "tenant": {},
    "branch": "branch",
    "roomId": "room id",
    "reservationId": "reservation id"
  }
}
```

List payload:

```json
{
  "count": 1,
  "requests": []
}
```

## 14. Current Risks and Edge Cases

1. Legacy and canonical routes are both active.
   - This is intentional compatibility, but it increases route surface area.

2. Shared detail routes are defined after compatibility routes.
   - Current order is acceptable because specific routes appear before `/:requestId`.

3. Tenant create requires an active reservation.
   - A Firebase/Mongo user without a current resident reservation receives `NO_ACTIVE_STAY`.

4. Attachments are trusted as already-uploaded metadata.
   - The backend validates presence of `name`, `uri`, and `type`, but does not upload or scan files.

5. Admin notes are tenant-visible.
   - `notes` is shown as Admin Response on the tenant page. Internal-only notes should use `work_log_note`.

6. Admin transition rules are strict.
  - Resolved/completed/rejected requests may only move to `closed`.
   - Reopen is tenant-only.

7. Branch access depends on request `branch`.
   - If old records have missing/invalid branch, branch admins may be blocked.

8. Frontend currently has no tenant edit/cancel/reopen controls in the visible tenant workspace.
   - Hooks and backend support exist, but the current UI shown here mainly submits and displays history.

9. Completion/frequency stats are still on compatibility `/api/maintenance/*` endpoints.
   - Admin page primarily uses canonical list/update endpoints.

10. Duplicate request prevention is enforced server-side.
  - Tenants will be redirected to the existing open request when the same type and description are submitted in the recent window.

## 15. Maintenance Flow Diagram

```text
Tenant
  |
  | POST /api/m/maintenance
  v
verifyToken -> verifyApplicant
  |
  v
Find Mongo user by Firebase UID
  |
  v
Validate type, urgency, description, attachments
  |
  v
Find active reservation
  |
  v
Create maintenance_requests document
  |
  v
Return request -> React Query invalidates list -> UI refreshes
```

```text
Admin
  |
  | PATCH /api/m/maintenance/admin/:requestId/status
  v
verifyToken -> verifyAdmin -> filterByBranch -> manageMaintenance permission
  |
  v
Find request
  |
  v
Enforce branch access
  |
  v
Validate status transition
  |
  v
Update status/notes/assignment/work log
  |
  v
Append status history
  |
  v
Notify tenant on status change
  |
  v
Return updated request -> React Query invalidates list/detail
```

## 16. Recommended Next Artifacts

For implementation or QA handoff, create these next:

- Maintenance API test matrix.
- Tenant UI capability gap list for edit/cancel/reopen controls.
- Admin status transition QA checklist.
- Seed data scenarios for each status and urgency.
- Branch access test cases for owner vs branch admin.
