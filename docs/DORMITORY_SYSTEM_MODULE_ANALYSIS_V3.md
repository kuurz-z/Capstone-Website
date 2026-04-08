# Dormitory System Module Analysis V3

Updated on April 8, 2026.

This version updates the `v2` assessment after the latest hardening work on Modules 1 to 4. The earlier `v2` document correctly identified the remaining risks at that time, but several of those risks are now closed in the current codebase.

## 1. Executive Reassessment

- Modules 1 to 4 are now the most stable part of the system by a clear margin.
- The previous high-risk issues in access control and billing exposure have been substantially reduced.
- The system now has stronger guardrails around owner-only governance, permission-based admin access, reservation lifecycle transitions, room archival safety, and billing security.
- The remaining work for Modules 1 to 4 is mostly consolidation and cleanup, not core stabilization.

## 2. What Changed Since V2

### Module 1: Identity, Access, and Administration

- `POST /api/auth/set-role` is now protected by `verifyOwner` in `server/routes/authRoutes.js`.
- Permission middleware is no longer just defined. It is now actively used across admin routes in reservations, rooms, billing, utility billing, maintenance, announcements, reports, payments, and users.
- `server/middleware/permissions.js` now supports role-default fallback permissions for branch admins when explicit permissions are not yet stored.
- Report access is now gated with `viewReports` on audit and digital twin routes.

### Module 2: Reservation and Tenant Lifecycle Management

- Reservation lifecycle rules are now formalized in `server/utils/lifecycleNaming.js` through `ALLOWED_RESERVATION_STATUS_TRANSITIONS`.
- Admin and user reservation write paths now validate status transitions through `canTransitionReservationStatus`.
- Reservation management routes now require `manageReservations` for admin actions.
- The lifecycle dictionary is more strictly enforced than in `v2`.

### Module 3: Room, Bed, and Occupancy Management

- Room CRUD and bed-status routes now require `manageRooms`.
- Room archival safeguards were expanded: archiving is now blocked not only by active reservations or open billing periods, but also by unresolved maintenance work in `server/controllers/roomsController.js`.
- Module 3 is now closer to being a protected source-of-truth inventory module rather than just a CRUD surface.

### Module 4: Billing, Payments, and Assisted Billing

- The public debug billing exposure has been removed. `force-rent` route usage was removed from the live server path, and `server/routes/forceRentRoute.js` was deleted.
- Billing admin routes now require `manageBilling`.
- Utility billing routes now apply `manageBilling` at router level.
- Payment vacancy-date reporting now also requires billing permission.
- A shared admin-access helper now exists in `server/utils/adminAccess.js` and is used by billing and utility billing controllers.

### Test Maturity

- The backend test surface increased again after this hardening pass.
- Current result on April 8, 2026: 17 test suites passed, 82 tests passed.
- New tests now cover permission middleware behavior, route access guards, invalid reservation lifecycle transitions, and room archive blocking when unresolved maintenance exists.

## 3. V2 Risks That Are Now Closed

These issues were open in `v2` but are no longer valid as current high-risk findings.

- `set-role` being admin-accessible instead of owner-only: resolved.
- Permission middleware existing but not being enforced on routes: resolved for the main Modules 1 to 4 surfaces and several adjacent admin routes.
- Public `GET /api/billing/force-rent` exposure: resolved.

## 4. Current High-Risk Findings After the Latest Hardening

The risk profile has shifted. The remaining issues are more focused.

### Important

- Module 4 is still split across `billingRoutes.js`, `paymentRoutes.js`, `utilityBillingRoutes.js`, and `financialRoutes.js`. Security is better, but the module surface is still fragmented.
- Legacy `super-admin` compatibility naming still exists in parts of middleware, controllers, tests, and frontend structure. The effective role model is `owner`, but cleanup is incomplete.
- Permission fallback is pragmatic, but not yet least-privilege-perfect. A branch admin without an explicit stored permission list still inherits a broad default set. That is better for continuity, but weaker than a fully explicit permission model.

### Medium

- Some route comments and documentation are now stale relative to enforcement. For example, parts of route descriptions still refer to admin behavior that has changed to owner-only or permission-gated behavior.
- The cross-module identity drift outside Modules 1 to 4 still exists: maintenance and announcements continue to use `req.user.uid` directly in places where models expect Mongo `ObjectId` references. This remains a Module 5 and 6 issue.
- Module 2 lifecycle is stricter now, but contract/versioning is still not a dedicated subsystem. The module is stable operationally, but still lighter than the architecture described in the ideal module map.

## 5. Updated Module-by-Module Assessment

### Module 1: Identity, Access, and Administration

- Status: hardened and much closer to production-ready than before.
- What is now stable:
- owner-only governance for role assignment and financial oversight, active permission enforcement, account-status blocking, branch-aware user access, and session revocation.
- What is still weak:
- explicit permission persistence and cleanup of legacy owner/super-admin compatibility naming.
- Final assessment:
- Module 1 is no longer a major blocker. The remaining work is refinement, not rescue.

### Module 2: Reservation and Tenant Lifecycle Management

- Status: strong operational core.
- What is now stable:
- canonical statuses, synchronized user lifecycle, guarded transitions, move-in prerequisites, and permission-protected admin management.
- What is still weak:
- contract/versioning depth and some remaining comment/doc drift.
- Final assessment:
- Module 2 is now stable enough to act as the main tenant-lifecycle engine.

### Module 3: Room, Bed, and Occupancy Management

- Status: stable and protected.
- What is now stable:
- branch protection, permission-based room management, bed maintenance locking, archival safety, and occupancy dependency on reservation lifecycle.
- What is still weak:
- advanced assignment policy and rate-history depth remain limited.
- Final assessment:
- Module 3 now behaves more like a real inventory authority and less like a loosely guarded admin page backend.

### Module 4: Billing, Payments, and Assisted Billing

- Status: secure and operationally mature, but still structurally spread out.
- What is now stable:
- billing permissions, utility workflow separation, owner financial isolation, room publishing, verification flow, and removal of public billing debug exposure.
- What is still weak:
- the billing domain is still conceptually one module but physically fragmented across several route groups.
- Final assessment:
- Module 4 no longer needs emergency hardening. It now needs consolidation and documentation cleanup.

### Modules 5 to 8

- These are now more clearly the weakest part of the system.
- The stronger Modules 1 to 4 become, the more visible the identity and boundary drift is in maintenance, announcements, support, and analytics.

## 6. Revised Synchronization Review

### What is now synchronized better

- Role governance now matches owner-level intent more closely.
- Permission definitions now match route enforcement much better.
- Reservation lifecycle writes are more consistently validated against one canonical transition map.
- Room archival safety now reflects more of the operational dependencies around occupancy, billing, and maintenance.
- Billing and utility billing now share a clearer admin access context.

### What still needs synchronization

- Route descriptions, docs, and some UI naming need to catch up with the hardened backend.
- Billing still needs one clearer conceptual boundary for developers, even if routes remain separate internally.
- Firebase UID to Mongo `_id` resolution still needs to become consistent in Modules 5 and 6.
- Legacy `super-admin` naming should continue to be retired from frontend and compatibility paths.

## 7. Updated Build Recommendation

### Best next focus after this pass

1. Consolidate Module 4 documentation and developer-facing boundaries.
2. Clean legacy `super-admin` naming across frontend and backend compatibility layers.
3. Fix identity-resolution drift in maintenance and announcements.
4. Then move to deeper Module 5 to 8 cleanup.

### Specific actions to take next

1. Document the final billing ownership split clearly: bills, payments, utilities, and owner financial overview.
2. Remove or rename remaining `isSuperAdmin` and `super-admin` references where the canonical role is already `owner`.
3. Standardize `Firebase UID -> Mongo User._id` resolution in maintenance and announcements controllers and models.
4. Update docs and route comments to match the current permission-gated and owner-gated behavior.
5. Only after that, expand maintenance, policy, support, and analytics modules.

## 8. Final V3 Conclusion

- Compared with the original analysis and `v2`, Modules 1 to 4 have now crossed from “stabilizing” into “controlled and supportable.”
- The most important architectural shift is that access control is now much closer to real enforcement, not just intent.
- The strongest unresolved issues are no longer inside the core operational modules themselves. They are now around consolidation, naming cleanup, and identity consistency in adjacent modules.
- The project is now in a much better position to shift attention from core operational stabilization to broader system coherence in Modules 5 to 8.
