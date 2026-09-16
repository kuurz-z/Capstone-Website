# Extend Stay web/backend review — 2026-09-16

## Scope and eligibility

**BLOCKED ON REAL TENANT TRACE.** No trustworthy available evidence identifies the authenticated tenant who saw the generic Administration message. Historical QA reports explicitly use synthetic records. The recently added Room 204 repair script concerns moved-out reservation cleanup and does not identify the reproducing active tenant. It was inspected, not executed.

No tenant data, eligibility guard, authentication middleware, or canonical tenant/contract selector was changed. No mobile repository was modified during this web/backend finalization. No production deployment or mobile build was started.

## Repository and isolation

The original workspace started on `fix/room-transfer-consolidated-20260915`, HEAD `aa941bfd5a2c66e3b88541fa088fbc362ab10ae3`, with an empty index. Fetch succeeded. That branch contained 11 migration commits not in main; main contained 17 newer commits. Branch configuration, remote HEAD and repository CI identify `main` as the merge target.

Only eight reviewed reliability source/test files were committed as `359ba30e` on the original branch. That scoped commit was cleanly cherry-picked as `ddb5525b` onto `fix/extend-stay-notification-reliability-20260916`, based on `origin/main` at `b09c4d95604cb74f75bd65252f3b61616fd6dbf4`. The unrelated migration commits are excluded from this feature branch. The isolated worktree is inside the authorized workspace; other worktrees were not modified.

## Review and corrections

- Submitted/approved/rejected inbox persistence uses the existing Notification model and the same transaction as the request transition. Regression tests prove that notification-write failure rolls back submission and either admin decision.
- Delivery uses the existing push transport after commit, persistent retry metadata, bounded batches/backoff, worker leases and accepted-device hashes. Duplicate submission/decision and partial-delivery retry tests pass. Provider acceptance is not proof of physical receipt; a crash between acceptance and its database update can still duplicate physical delivery. A running scheduler and eligible device registration remain prerequisites.
- Admin requests refresh every 30 seconds while visible, on focus/visibility return, and after review. Tests cover out-of-order responses, hidden tabs and cleanup.
- **Proven separate web integration defect:** main commit `b09c4d95` removed the import and only mount of StayExtensionRequests from TenantsWorkspacePage. The added mount regression failed on that version. Restoring those two lines makes it pass, while preserving main's newer tenancy changes. This does not establish or fix the original tenant eligibility cause.
- Room Transfer and main's short-term/multi-lifecycle rules remain covered by fresh regressions.

## Validation

Original source before commit: 108 backend tests, six web checks, JavaScript syntax checks, whitespace checks and the production Vite build passed.

Main-based feature validation:

```text
# server
npm test -- --runInBand --runTestsByPath services/stayExtensionRequestService.integration.test.js services/mobileNotificationBridge.test.js routes/mobileNotificationRoutes.test.js services/renewalContractPreparation.integration.test.js utils/scheduler.test.js utils/tenantActionService.transferThenRenewMoveOut.integration.test.js utils/tenantActionService.currentStayResolution.integration.test.js utils/tenantActionService.shortTermExtension.test.js services/contractAcknowledgementService.multiLifecycle.integration.test.js
# 113 tests passed before the added scheduler-registration regression.
npm test -- --runInBand --runTestsByPath utils/scheduler.test.js
# 19 passed with the added regression: 114 distinct backend tests in the latest-per-suite rollup.

# web
node --test src/features/admin/components/stayExtensionRequests.behavior.test.mjs
# Six checks passed; the mount check first failed on the uncorrected main-based page.
npm run build
# Passed, 4,186 modules transformed.
git diff --check
# Passed. Node --check also passed for changed backend JavaScript and test files.
```

PowerShell execution policy blocked npm.ps1; npm.cmd runs the same scripts successfully without changing that policy. There is no configured executable lint script or installed ESLint binary in these packages; Node syntax checks and the Vite build are the applicable static/build checks. No failing tests were removed or hidden. Build warnings concern existing Browserslist data and mixed static/dynamic imports.

## File classification and cleanup

Every pre-existing dirty/untracked path was individually classified in a local, excluded inventory: 8 A (scoped source/tests), 333 B (unrelated developer work or historical evidence), 844 C (known prior Extend Stay validation copies/caches).

- A: Notification model, new stayExtensionDelivery service, request service and integration tests, tenantActionService, scheduler, admin component and behavior tests. This finalization additionally includes the restored TenantsWorkspacePage mount, scheduler registration test and this report.
- B, preserved/excluded: two pre-existing Room Transfer test status-only modifications; all other untracked scripts/reports, billing/room-transfer/water QA folders, historical audit worktree and output/migration receipts. The earlier cross-mobile implementation report remains local and is not part of this web/backend commit.
- C: only the verified link-free `extend-stay-jest` and `extend-stay-consistent-jest` caches were deleted (598 files), and can be regenerated. The older mobile validation copy is retained; its dependency junction points outside this task's scope. No recursive operation was performed on that junction or the mobile repository.

Unrelated work is intentionally preserved, so the original workspace must not be described as clean merely because the isolated feature worktree is clean. No blanket staging, reset, clean, force-push, credential files, logs, caches or generated outputs belong in this commit.
