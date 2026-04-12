# Dormitory System Module Analysis V4

Updated on April 8, 2026.

This document is intentionally connected to the original `DORMITORY_SYSTEM_MODULE_ANALYSIS.md`.

The original analysis remains the architecture baseline and the harsh diagnosis of what was wrong in the system. This `v4` is not a replacement for that document. It is the change-focused follow-up that answers a narrower question:

- which original findings are now closed,
- which ones are only partially closed,
- and whether Modules 1 to 4 are now stable enough to support Module 5 and 6 work without forcing another redesign.

## 1. Direct Link Back to the Original Analysis

The original document made six major claims about the system:

1. RBAC and owner governance were not trustworthy enough for production.
2. Reservation lifecycle naming and synchronization were drifting across layers.
3. Room, occupancy, and analytics boundaries were blurred.
4. Billing was operationally strong but structurally fragmented and exposed to stale or unsafe paths.
5. Modules 5 to 8 were weaker and less coherent than Modules 1 to 4.
6. The system should keep the 8-module target, but stabilize Modules 1 to 4 before expanding AI or support-heavy features.

`V4` confirms that those original conclusions were directionally correct. The biggest change is that Modules 1 to 4 are no longer the unstable part of the system.

## 2. What Changed Relative to the Original Diagnosis

### Original Finding: RBAC existed mostly as intent

Current state:

- This is no longer true for the core operational surface.
- `POST /api/auth/set-role` is now owner-only.
- Permission middleware is actively enforced across the main admin route groups, not just declared.
- Owner-only governance and branch-admin permission checks are now much closer to the module design described in the original analysis.

Verdict:

- Closed for Modules 1 to 4.
- Still partially open as a cleanup task because compatibility bridges such as `isSuperAdmin` still exist internally.

### Original Finding: Reservation lifecycle was too loose

Current state:

- Canonical reservation transitions are now enforced through the lifecycle helpers.
- Reservation write paths validate state movement instead of accepting ad hoc status jumps.
- The lifecycle path is now much closer to the original target:
  `pending -> visit_pending -> visit_approved -> payment_pending -> reserved -> moveIn -> moveOut`
  with `cancelled` and `archived` as side exits.

Verdict:

- Closed for operational stability.
- Still partially open for deeper contract/versioning maturity, which the original analysis already described as a next-level improvement rather than emergency stabilization.

### Original Finding: Room and occupancy boundaries were blurry

Current state:

- Room and bed management now behave more like a protected inventory authority.
- Occupancy-changing actions are more tightly coupled to reservation lifecycle behavior instead of casual admin mutation.
- Room archival is now blocked by active reservations, open billing periods, open utility periods, and unresolved maintenance.

Verdict:

- Closed for Module 3 stabilization.
- Remaining work is refinement, not structural rescue.

### Original Finding: Billing was strong but fragmented and unsafe

Current state:

- The old public debug exposure is gone.
- The stale internal legacy room-bill generation path has now also been removed from the controller layer.
- Billing, utility billing, payments, and executive financial overview now have a documented ownership split in `docs/BILLING_MODULE_BOUNDARY.md`.
- Billing remains physically split across route groups, but it is now much better defined and safer than what the original analysis described.

Verdict:

- Closed as a stabilization issue.
- Still partially open as a structural/documentation concern because Module 4 is still implemented across multiple route groups by design.

## 3. Module 1 to 4 Reassessment Against the Original Module Map

### Module 1: Identity, Access, and Administration

- Original concern:
  backend enforcement did not match the intended governance model.
- Current result:
  owner-only governance is substantially real now, permission checks are active, and the role model is functionally centered on `owner`, `branch_admin`, `tenant`, and `applicant`.
- Remaining gap:
  persisted permissions are still backed by a transitional role-default fallback for older branch-admin accounts, and some compatibility naming remains behind the scenes.

Assessment:

- Module 1 now matches the original module plan well enough to stop being a blocker.

### Module 2: Reservation and Tenant Lifecycle Management

- Original concern:
  reservation flow was strong, but vocabulary and lifecycle ownership were inconsistent.
- Current result:
  lifecycle naming is more disciplined, transitions are enforced, and admin reservation actions are permission-gated.
- Remaining gap:
  contract/versioning depth is still lighter than the ideal architecture described in the original analysis.

Assessment:

- Module 2 is now stable enough to serve as the tenant lifecycle backbone.

### Module 3: Room, Bed, and Occupancy Management

- Original concern:
  room inventory was valuable, but analytics and occupancy concerns were bleeding into it.
- Current result:
  the room layer is better protected, archive blockers reflect real operational dependencies, and occupancy authority is more clearly tied to lifecycle events.
- Remaining gap:
  the system can still improve assignment-policy depth and longer-term room-rate history, but those are not blockers to Module 5 and 6.

Assessment:

- Module 3 now behaves like a real source-of-truth module.

### Module 4: Billing, Payments, and Assisted Billing

- Original concern:
  billing was powerful but spread out, stale, and partly unsafe.
- Current result:
  billing permissions are enforced, the unsafe debug path is removed, the dead legacy room-bill path is removed, and the route ownership split is now documented.
- Remaining gap:
  the implementation still spans several route groups, so consolidation is conceptual rather than physical.

Assessment:

- Module 4 is now stable and supportable.

## 4. Original Findings That Are Still Open

These are not failures of the Module 1 to 4 stabilization work. They are the issues that the original analysis said would become more visible once the core was hardened.

### Still Open from the Original Analysis

- Modules 5 and 6 still carry identity-resolution drift in places where Firebase UID and Mongo `User._id` usage are not fully normalized.
- Support, announcements, policies, and maintenance still need stronger workflow ownership and cleaner boundaries.
- Reports and analytics still depend on cleaner upstream module joins and more stable KPI definitions.
- Legacy `super-admin` compatibility naming still exists in some non-canonical paths, even though `owner` is now the real governance model.

## 5. Readiness for Module 5 and 6

This is the main new conclusion in `v4`.

Compared with the original analysis, the system is now in a different phase:

- Modules 1 to 4 no longer need emergency stabilization.
- They now need normal maintenance and gradual cleanup only.
- The stronger architectural risk has moved outward to Modules 5 to 8, especially maintenance, announcements, communication delivery, support, and analytics consistency.

Readiness verdict:

- Yes, Modules 1 to 4 are now stable enough to support Module 5 and 6 work.
- The current risk is no longer "core modules are too unstable to build on."
- The current risk is "Module 5 and 6 must be designed to respect the now-stable boundaries of Modules 1 to 4."

## 6. Evidence Snapshot for This V4 Assessment

This `v4` conclusion is based on the implemented state of the project at the time of writing:

- owner-only role assignment and stronger permission enforcement in the backend,
- canonical reservation transition enforcement,
- stricter room archival blockers,
- documented Module 4 route ownership boundaries,
- removal of public billing debug exposure,
- removal of the dead legacy room-bill generation function,
- updated docs for API, authentication, structure, and billing boundaries,
- backend verification passing with `17/17` suites and `82/82` tests,
- frontend production build completing successfully.

## 7. Final V4 Conclusion

The original `DORMITORY_SYSTEM_MODULE_ANALYSIS.md` was correct to demand that Modules 1 to 4 be stabilized before the system expanded further.

That stabilization phase has now largely succeeded.

`V4` therefore changes the headline conclusion:

- Original conclusion:
  Modules 1 to 4 were operationally promising but too inconsistent and weakly enforced to trust as the platform base.
- V4 conclusion:
  Modules 1 to 4 are now the strongest and most dependable part of the system, and they are stable enough to support the next focused work on Modules 5 and 6.

The remaining architectural pressure is no longer inside the core operational modules. It has shifted to the surrounding modules that still need identity cleanup, workflow definition, and cross-module coherence.
