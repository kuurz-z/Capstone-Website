# Support-rating worktree cleanup ? 2026-09-27

## A. Worktree status

**Blocked by unrelated conflict.** This pass removed verified generated outputs and classified the support-rating changes. It did not stage, unstage, commit, push, resolve conflicts, or change application source. Existing staged entries are preserved; the current index is not a support-only commit candidate.

All preserved files were checked against pre-cleanup SHA-256 hashes; no content changed. `git ls-files --stage` exactly matches the initial snapshot. Git could not read the global ignore file due to environment permissions; repository ignore rules and explicit artifact inspection were used.

## B. Intended changes

27 implementation files plus this cleanup report (28 task files). All remain unstaged/untracked.

- `server/controllers/analyticsController.js`
- `server/controllers/analyticsController.test.js`
- `server/controllers/chatController.authority.test.js`
- `server/controllers/chatController.js`
- `server/models/ChatConversation.js`
- `server/services/notifications/notificationService.js`
- `web/src/features/admin/components/chat/AdminChatCloseModal.jsx`
- `web/src/features/admin/components/chat/AdminChatClosedBanner.jsx`
- `web/src/features/admin/components/chat/AdminChatConversationList.jsx`
- `web/src/features/admin/components/chat/AdminChatStatusModal.jsx`
- `web/src/features/admin/components/chat/AdminChatTicketSidebar.jsx`
- `web/src/features/admin/components/chat/chatConstants.js`
- `web/src/features/admin/components/chat/useAdminChat.js`
- `web/src/features/admin/pages/AdminChatPage.jsx`
- `web/src/features/admin/pages/AdminChatPhase4.test.mjs`
- `web/src/features/admin/pages/AdminNotificationsPage.jsx`
- `web/src/features/admin/pages/AnalyticsSupportChatTab.jsx`
- `web/src/shared/api/chatApi.js`
- `web/src/shared/components/NotificationBell.jsx`
- `web/src/shared/hooks/useChatSocket.js`
- `docs/reports/admin-support-ratings-implementation-2026-09-27.md`
- `server/controllers/chatSupportContract.integration.test.js`
- `server/services/supportRequestService.js`
- `web/src/features/admin/components/chat/AdminSupportRequestDetails.jsx`
- `web/src/features/admin/components/chat/supportRating.behavior.test.mjs`
- `web/src/shared/utils/supportConcern.js`
- `web/src/shared/utils/supportConcern.test.mjs`
- `docs/reports/admin-support-ratings-worktree-cleanup-2026-09-27.md`

## C. Unrelated changes

The complete per-file inventory below identifies pre-existing staged and unstaged work and every untracked entry. Billing/penalty chatbot changes, stay extensions, room transfers, contracts, announcements, authentication, tenant profiles, migration scripts, operational receipts, and guide documents are outside this support-rating task.

131 unrelated files were already staged before this pass; those index entries were left intact. Three unrelated unstaged entries are the profile completion script and two integration-test files (the latter appear in status but have no textual diff). Do not include these files in a support-rating commit.

Two nested repository/worktree entries are classified UNKNOWN and preserved without recursive changes. Existing audit harnesses, fixtures, screenshots, reports, receipts, backups and editor state were preserved. Ignored runtime logs were preserved because they may belong to ongoing processes. Empty `server/tmp` contained no test database files. No nonignored `.log`, `.bak`, `.orig`, `.rej`, `.db`, `.sqlite`, `.sqlite3`, `.DS_Store` or `Thumbs.db` files appeared in the initial untracked inventory.

Exact duplicate contents were found in these unrelated artifacts; both copies were preserved because their separate purposes are not established:

- `.codex-tmp/gates-pr173-previous-body.txt` and `.codex-tmp/published-release-report.md`
- `output/Lilycrest_Admin_Guide.pdf` and `output/Lilycrest_Professional_User_Guide.pdf`

## D. Conflicts

**UNRELATED CONFLICT ? NOT INCLUDED IN THIS TASK**

- `server/controllers/roomsController.js`: conflict markers at lines 511, 515 and 604; index status `UU`.
- `node --check server/controllers/roomsController.js` fails at line 511 with a syntax error. The file was not changed.

Scanning tracked and nonignored worktree text, including hidden files and excluding dependencies, found no other unresolved merge-marker file. Nested repositories are outside the parent inventory scan. Whole-repository backend validation/release readiness remains blocked; no attempt was made to modify the conflict for green checks.

## E. Removed noise

- 107 confirmed Jest JSON result files under `.codex-tmp/`; each was identified by report structure (`numTotalTests`, `numPassedTests`, `testResults`, `success`) before removal. Every removed path is listed below.
- `web/build/`: 321 ignored, untracked generated build files removed after verifying the directory contained no tracked files.
- `web/build-admin/`: 200 ignored, untracked generated build files removed after the successful verification build and tracked-file check.

Recovery copies of the 107 JSON outputs and before/after audit evidence are outside the repository at `%TEMP%/support-rating-cleanup-20260927/`. No source, test fixture, documentation or operational receipt was deleted.

## F. Validation

- Backend: **49 tests passed, 5 suites** ? chat support contract, chat authority, analytics, chat route authorization and canonical notification coverage. Isolated MongoMemoryServer databases were stopped by test teardown.
- Frontend/admin: **25 tests passed** ? supportConcern, supportRating behavior, AdminChatPhase4 and AdminChatFilterOptimization.
- Admin production build: **passed** (4,188 modules; 3m 21s), using the established `maxParallelFileOps: 20` Windows workaround. Existing Browserslist age, circular chunk, mixed dynamic/static import and chunk-size warnings remain. No build configuration was changed.
- Task-scoped `git diff --check`: **passed**; all intended new files also checked for trailing whitespace.
- Global `git diff --check`: **fails only on the unrelated rooms-controller conflict markers**.
- `git diff --cached --check`: **fails on pre-existing unrelated whitespace issues**, retained untouched.
- Intended changed/new source was reviewed for debug prints, test-only TODOs, commented-out code, local paths and credential patterns. No accidental task debug code or exposed credential patterns were found. Existing integrity/error logging was preserved. Broader changed source scans found only credential-pattern lines already present in HEAD test files; no values are reproduced here.
- Local checkout paths occur in the implementation report and the contract test; the external reference checkout is configurable through `LILIORA_BACKEND_ROOT`. The component test uses a JSDOM localhost URL. Production support source has no local-checkout or localhost dependency.

Commands run:

```text
cd server
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --roots controllers routes services --runTestsByPath controllers/chatSupportContract.integration.test.js controllers/chatController.authority.test.js controllers/analyticsController.test.js routes/chatRoutes.authorization.test.js services/notifications/phase2CanonicalEventCoverage.integration.test.js

# repository root
node --test web/src/shared/utils/supportConcern.test.mjs web/src/features/admin/components/chat/supportRating.behavior.test.mjs web/src/features/admin/pages/AdminChatPhase4.test.mjs web/src/features/admin/components/chat/AdminChatFilterOptimization.test.mjs

cd web
node --input-type=module -e "import { build } from 'vite'; await build({configFile:'vite.admin.config.js',build:{rollupOptions:{maxParallelFileOps:20}}});"
```

## G. Ready for staging?

NO ? cleanup/blockers remain

## Complete file inventory

Status uses Git porcelain columns: first = index, second = worktree; `??` = untracked. Classification is relative to this support-rating task. Every initial changed/untracked entry is accounted for, including removed files.

### Intended task files

| Status | Classification | Path |
| --- | --- | --- |
| ` M` | KEEP | `server/controllers/analyticsController.js` |
| ` M` | KEEP | `server/controllers/analyticsController.test.js` |
| ` M` | KEEP | `server/controllers/chatController.authority.test.js` |
| ` M` | KEEP | `server/controllers/chatController.js` |
| ` M` | KEEP | `server/models/ChatConversation.js` |
| ` M` | KEEP | `server/services/notifications/notificationService.js` |
| ` M` | KEEP | `web/src/features/admin/components/chat/AdminChatCloseModal.jsx` |
| ` M` | KEEP | `web/src/features/admin/components/chat/AdminChatClosedBanner.jsx` |
| ` M` | KEEP | `web/src/features/admin/components/chat/AdminChatConversationList.jsx` |
| ` M` | KEEP | `web/src/features/admin/components/chat/AdminChatStatusModal.jsx` |
| ` M` | KEEP | `web/src/features/admin/components/chat/AdminChatTicketSidebar.jsx` |
| ` M` | KEEP | `web/src/features/admin/components/chat/chatConstants.js` |
| ` M` | KEEP | `web/src/features/admin/components/chat/useAdminChat.js` |
| ` M` | KEEP | `web/src/features/admin/pages/AdminChatPage.jsx` |
| ` M` | KEEP | `web/src/features/admin/pages/AdminChatPhase4.test.mjs` |
| ` M` | KEEP | `web/src/features/admin/pages/AdminNotificationsPage.jsx` |
| ` M` | KEEP | `web/src/features/admin/pages/AnalyticsSupportChatTab.jsx` |
| ` M` | KEEP | `web/src/shared/api/chatApi.js` |
| ` M` | KEEP | `web/src/shared/components/NotificationBell.jsx` |
| ` M` | KEEP | `web/src/shared/hooks/useChatSocket.js` |
| `??` | KEEP | `docs/reports/admin-support-ratings-implementation-2026-09-27.md` |
| `??` | KEEP | `server/controllers/chatSupportContract.integration.test.js` |
| `??` | KEEP | `server/services/supportRequestService.js` |
| `??` | KEEP | `web/src/features/admin/components/chat/AdminSupportRequestDetails.jsx` |
| `??` | KEEP | `web/src/features/admin/components/chat/supportRating.behavior.test.mjs` |
| `??` | KEEP | `web/src/shared/utils/supportConcern.js` |
| `??` | KEEP | `web/src/shared/utils/supportConcern.test.mjs` |
| `??` | KEEP | `docs/reports/admin-support-ratings-worktree-cleanup-2026-09-27.md` |

### Unrelated existing files

| Initial status | Classification | Path |
| --- | --- | --- |
| `A ` | UNRELATED | `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` |
| `A ` | UNRELATED | `docs/reports/extend-stay-web-backend-review-2026-09-16.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-15-code-review-remediation.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-15-moveout-billing-termination-and-settlement.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-15-tenant-assistant-penalty-detection.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-16-auth-optimization-and-test-parity.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-16-enforce-solo-lifecycle-and-contract-acknowledgement.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-16-fix-all-time-rent-billing-duplicate.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-16-fix-moveout-bed-release-and-tenancy-isolation.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-16-profile-date-of-birth-validation-relaxation.md` |
| `A ` | UNRELATED | `docs/superpowers/plans/2026-09-27-billing-sort-and-status-filters.md` |
| `M ` | UNRELATED | `server/controllers/announcementsController.js` |
| `M ` | UNRELATED | `server/controllers/announcementsController.test.js` |
| `M ` | UNRELATED | `server/controllers/authController.identitySafety.test.js` |
| `M ` | UNRELATED | `server/controllers/authController.js` |
| `M ` | UNRELATED | `server/controllers/billing/_helpers.js` |
| `A ` | UNRELATED | `server/controllers/billing/billingHelpers.formatBill.test.js` |
| `M ` | UNRELATED | `server/controllers/contractController.js` |
| `A ` | UNRELATED | `server/controllers/contractController.termLineage.integration.test.js` |
| `M ` | UNRELATED | `server/controllers/monthlyUtilityWorkflow.integration.test.js` |
| `M ` | UNRELATED | `server/controllers/paymentController.js` |
| `M ` | UNRELATED | `server/controllers/paymentController.test.js` |
| `M ` | UNRELATED | `server/controllers/reservations/cancellationController.js` |
| `M ` | UNRELATED | `server/controllers/reservations/reservationLifecycleController.cancellationGuard.integration.test.js` |
| `M ` | UNRELATED | `server/controllers/reservations/reservationLifecycleController.js` |
| `M ` | UNRELATED | `server/controllers/reservations/reservationLifecycleController.moveInContractRepair.integration.test.js` |
| `M ` | UNRELATED | `server/controllers/reservations/tenancyActionsController.js` |
| `M ` | UNRELATED | `server/controllers/reservations/tenancyActionsController.renewalConcurrency.integration.test.js` |
| `M ` | UNRELATED | `server/controllers/reservations/tenancyActionsController.renewalOfferPricing.integration.test.js` |
| ` M` | UNRELATED | `server/controllers/reservations/tenancyActionsController.scheduledTransferBranch.integration.test.js` |
| `A ` | UNRELATED | `server/controllers/roomsController.syncBedUser.test.js` |
| `M ` | UNRELATED | `server/controllers/usersController.js` |
| `M ` | UNRELATED | `server/controllers/usersController.test.js` |
| `M ` | UNRELATED | `server/mobile/announcementAudience.security.test.js` |
| `M ` | UNRELATED | `server/mobile/controllers/announcement.controller.js` |
| `M ` | UNRELATED | `server/mobile/controllers/announcement.controller.test.js` |
| `M ` | UNRELATED | `server/mobile/mountedRoutes.behavior.test.js` |
| `M ` | UNRELATED | `server/mobile/routes/announcement.routes.js` |
| `A ` | UNRELATED | `server/mobile/services/announcementEngagement.service.js` |
| `M ` | UNRELATED | `server/models/AcknowledgmentAccount.js` |
| `M ` | UNRELATED | `server/models/Room.js` |
| `A ` | UNRELATED | `server/models/Room.vacateBed.test.js` |
| `M ` | UNRELATED | `server/models/Stay.js` |
| `M ` | UNRELATED | `server/models/StayExtensionRequest.js` |
| `M ` | UNRELATED | `server/models/index.js` |
| `A ` | UNRELATED | `server/scripts/check_user_contracts.mjs` |
| ` M` | UNRELATED | `server/scripts/complete_tenant_profiles_postmigration.mjs` |
| `A ` | UNRELATED | `server/scripts/generate_pdf.mjs` |
| `A ` | UNRELATED | `server/scripts/reconcile_room_204_moveout.mjs` |
| `A ` | UNRELATED | `server/scripts/reconcile_stay_contract_dates.integration.test.js` |
| `A ` | UNRELATED | `server/scripts/reconcile_stay_contract_dates.md` |
| `A ` | UNRELATED | `server/scripts/reconcile_stay_contract_dates.mjs` |
| `A ` | UNRELATED | `server/scripts/repair_room204_and_stale_extensions.mjs` |
| `A ` | UNRELATED | `server/scripts/repair_room204_and_stale_extensions.test.mjs` |
| `A ` | UNRELATED | `server/services/announcementEngagementService.integration.test.js` |
| `A ` | UNRELATED | `server/services/announcementEngagementService.js` |
| `M ` | UNRELATED | `server/services/autoContractOrchestratorService.js` |
| `M ` | UNRELATED | `server/services/autoContractOrchestratorService.test.js` |
| `M ` | UNRELATED | `server/services/billing/roomUtilityBoundaryService.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantAssistantService.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantAssistantService.test.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantChatbotService.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantChatbotService.test.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantContextResolver.js` |
| `M ` | UNRELATED | `server/services/chatbot/tenantContextResolver.test.js` |
| `A ` | UNRELATED | `server/services/contractAcknowledgementService.multiLifecycle.integration.test.js` |
| ` M` | UNRELATED | `server/services/contractRoomTransferActivationService.integration.test.js` |
| `M ` | UNRELATED | `server/services/contractService.js` |
| `A ` | UNRELATED | `server/services/moveInContractDateSync.integration.test.js` |
| `A ` | UNRELATED | `server/services/moveInContractDateSync.js` |
| `M ` | UNRELATED | `server/services/moveOutClearanceService.js` |
| `M ` | UNRELATED | `server/services/moveOutClearanceService.test.js` |
| `M ` | UNRELATED | `server/services/occupancy/occupancyManager.js` |
| `A ` | UNRELATED | `server/services/occupancy/stayTerminationCascade.test.js` |
| `A ` | UNRELATED | `server/services/stayContractIntegrity.js` |
| `A ` | UNRELATED | `server/services/stayContractIntegrity.test.js` |
| `A ` | UNRELATED | `server/services/stayContractRepairPlan.js` |
| `A ` | UNRELATED | `server/services/stayContractRepairPlan.test.js` |
| `M ` | UNRELATED | `server/services/stayExtensionRequestService.integration.test.js` |
| `M ` | UNRELATED | `server/services/stayExtensionRequestService.js` |
| `M ` | UNRELATED | `server/services/tenantContractSelectionService.integration.test.js` |
| `M ` | UNRELATED | `server/services/tenantContractSelectionService.js` |
| `A ` | UNRELATED | `server/services/tenantContractSelectionService.lifecycleIsolation.test.js` |
| `M ` | UNRELATED | `server/services/tenantContractSelectionService.test.js` |
| `M ` | UNRELATED | `server/services/tenantContractViewService.js` |
| `M ` | UNRELATED | `server/utils/depositUtils.js` |
| `M ` | UNRELATED | `server/utils/depositUtils.test.js` |
| `M ` | UNRELATED | `server/utils/scheduler.js` |
| `M ` | UNRELATED | `server/utils/scheduler.test.js` |
| `M ` | UNRELATED | `server/utils/tenantActionService.currentStayResolution.integration.test.js` |
| `M ` | UNRELATED | `server/utils/tenantActionService.js` |
| `A ` | UNRELATED | `server/utils/tenantActionService.moveOutCascade.integration.test.js` |
| `M ` | UNRELATED | `server/utils/tenantActionService.moveOutContractSync.integration.test.js` |
| `A ` | UNRELATED | `server/utils/tenantActionService.parseDateTime.test.js` |
| `M ` | UNRELATED | `server/utils/tenantActionService.renewal.integration.test.js` |
| `A ` | UNRELATED | `server/utils/tenantActionService.shortTermExtension.test.js` |
| `M ` | UNRELATED | `server/utils/utilityBillFlow.js` |
| `M ` | UNRELATED | `web/src/features/admin/components/MoveOutClearanceCalculator.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/OverdueNoticeTracker.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/ReservationDetailsModal.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/TenantDetailModal.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/TenantWorkspaceModals.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/billing/RentBillingTab.jsx` |
| `A ` | UNRELATED | `web/src/features/admin/components/billing/billingFiltersAndSorting.test.mjs` |
| `M ` | UNRELATED | `web/src/features/admin/components/rooms/DoubleDeckRoomCard.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/rooms/RoomConfigModal.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/components/rooms/RoomImageLightboxModal.jsx` |
| `A ` | UNRELATED | `web/src/features/admin/components/rooms/privateRoomOccupancyDisplay.test.mjs` |
| `M ` | UNRELATED | `web/src/features/admin/components/rooms/roomImageLightboxModal.test.mjs` |
| `M ` | UNRELATED | `web/src/features/admin/components/tenants/details/TenantOverviewTab.jsx` |
| `M ` | UNRELATED | `web/src/features/admin/pages/TenantsWorkspacePage.jsx` |
| `A ` | UNRELATED | `web/src/features/public/pages/SignUp.googleCollisionRecovery.test.mjs` |
| `M ` | UNRELATED | `web/src/features/public/pages/SignUp.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/ReservationDashboard.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/assistant/TenantAssistantDrawer.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/assistant/cards/TenantBillingBreakdownCard.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/assistant/tenantAssistant.test.mjs` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/BillingTab.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/DashboardTab.jsx` |
| `A ` | UNRELATED | `web/src/features/tenant/components/profile/DashboardTab.responsive.test.mjs` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/ProfileCompletionCard.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/ReservationAgreementPage.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/reservationCancellationUi.js` |
| `M ` | UNRELATED | `web/src/features/tenant/components/profile/reservationCancellationUi.test.mjs` |
| `M ` | UNRELATED | `web/src/features/tenant/pages/ContractsPage.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/pages/SignIn.googleOnboarding.test.mjs` |
| `M ` | UNRELATED | `web/src/features/tenant/pages/SignIn.jsx` |
| `M ` | UNRELATED | `web/src/features/tenant/styles/profile-page.css` |
| `M ` | UNRELATED | `web/src/features/tenant/styles/tenant-assistant.css` |
| `M ` | UNRELATED | `web/src/shared/layouts/TenantLayout.css` |
| `M ` | UNRELATED | `web/src/shared/utils/authToasts.js` |
| `A ` | UNRELATED | `web/src/shared/utils/authToasts.test.mjs` |
| `M ` | UNRELATED | `web/src/shared/utils/notification.js` |
| `M ` | UNRELATED | `web/src/shared/utils/notificationSummary.test.mjs` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/apply.0.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/apply.1.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/apply.2.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/audit.mjs` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/backend-billing-after.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/backend-billing.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/backend-transfer-after.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/dry-run.0.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/final-dry-run.0.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/integrity-after.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/integrity-before.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/integrity.mjs` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/inventory-and-plan.md` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/inventory.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/reconciliation-report.md` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/release-recheck.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/release-recheck.mjs` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/repeated-apply.0.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/repeated-apply.1.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/repeated-apply.2.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/review-manifest.json` |
| `??` | UNRELATED | `.billing-cycle-reconciliation/validation-summary.json` |
| `??` | UNRELATED | `.codex-tmp/audit-missing-surnames.mjs` |
| `??` | UNRELATED | `.codex-tmp/audit-name-capitalization.mjs` |
| `??` | UNRELATED | `.codex-tmp/audit-tenant-profile-scope.mjs` |
| `??` | UNRELATED | `.codex-tmp/backend-batched-progress.json` |
| `??` | UNRELATED | `.codex-tmp/backend-combined.json` |
| `??` | UNRELATED | `.codex-tmp/backend-pr.md` |
| `??` | UNRELATED | `.codex-tmp/backend-suite-inventory.json` |
| `??` | UNRELATED | `.codex-tmp/christian-contract-status.mjs` |
| `??` | UNRELATED | `.codex-tmp/combine-release-results.cjs` |
| `??` | UNRELATED | `.codex-tmp/contract-duration-audit.md` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/__mocks__/NativeModules.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/_layout.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/announcements.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/billing.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/chatbot.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/dashboard.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/home.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/profile.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/(tabs)/services.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/_layout.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/about.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/auth-callback.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/bill-details.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/billing-history.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/change-password.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/contract-viewer.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/debug/api-health.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/document-viewer.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/documents.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/extend-stay.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/forgot-password.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/home.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/house-rules.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/image-viewer.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/index.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/login.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/my-documents.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/notifications.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/otp-verify.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/outstanding-balance.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/payment-cancel.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/payment-success.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/payment.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/privacy-policy.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/reset-password.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/room-transfer.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/settings.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/survey-form.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/surveys.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/app/terms-of-service.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/babel.config.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/jest.setup.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/package.json` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/AppHeader.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/AttachmentPickerSheet.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/BrandHeader.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/GoogleSignInButton.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/HomeMonthlyRate.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/ImageLightbox.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/ProfilePhotoCropModal.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/PropertyShowcase.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/StyledModal.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/WaterBreakdown.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/assistant/InquiryCard.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/assistant/LilyAssistantFab.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/assistant/LilyFlowerIcon.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/assistant/MessageBubble.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/assistant/QuickActionCard.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/components/ui/LilycrestUI.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/api.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/features.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/firebase.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/googleSignIn.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/maps.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/config/qaRuntime.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/context/AlertContext.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/context/AuthContext.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/context/ThemeContext.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/context/ToastContext.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/hooks/useAssistantChat.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/hooks/useAsyncCall.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/hooks/useCanonicalAnnouncements.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/hooks/useContractAcknowledgement.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/hooks/useTenantContract.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/screens/LilyAssistantScreen.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/api.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/authDiagnostics.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/billingState.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/canonicalEvents.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/documentManager.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/firebaseStorageUpload.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/imageDocumentManager.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/imageUpload.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/logger.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/mobileApiReadiness.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/notifications.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/profileImage.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/rememberedEmail.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/secureCredentials.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/sessionEvents.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/services/surveyDrafts.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/accountStatus.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/androidBranding.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/announcementAcknowledgementScreen.test.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/announcementIsolation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/announcementPresentation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/announcementsCategoryChips.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/announcementsFlatList.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/apiConfig.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/apiSessionExpiryInterceptor.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/appHeaderNotificationControls.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/attachmentPicker.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/authContextBranchPersistence.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/authContextSessionExpiry.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/authContextValueMemoization.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/authFlowContracts.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/authStability.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billDetailsCanonicalBreakdown.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billDetailsScheduleReconciliation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingDocumentCache.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingLatestDtoIntegration.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingMissingValueDisplay.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingOutstandingAggregate.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingPaymentProofRemoval.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingSchedulePresentation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingScreenState.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingStatementReceiptButtons.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingStatusConsistency.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/billingUiPolish.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/buildIdentity.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/buildProvenanceMetadata.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/canonicalAnnouncements.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/canonicalEvents.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/changePasswordContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/changePasswordToggle.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/chatReconciliation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/contractAcknowledgement.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/contractDocumentCache.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/contractPresentation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/contractSurveyDisplay.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/criticalMobileFixes.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/debugRouteProductionGate.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/documentManager.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/documentViewerActions.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/easCopyGoogleServices.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/extendStayScreen.test.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/extensionLifecycle.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/firebaseStorageUpload.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/forgotPasswordValidation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/gitBuildIdentity.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/googleAuthError.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/homeContractEndAuthority.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/homeMonthlyRate.test.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/homeNotificationCanonicalState.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/homeRoomPhotoInteractionIsolation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/homeTruthfulState.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/imageLightbox.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/iosPushTokenRotation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/lilyTopicUx.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/loginPasswordToggle.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceAttachmentUx.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceAttachmentViewer.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceCanonicalStatus.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceFormRegression.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceRating.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceReopenConfirmation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/maintenanceRequestRace.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/mobileAuditPresentation.test.jsx` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/mobileContractSupportReconciliation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/mobileParityRouting.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/nativePushTransport.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/navigationBootstrap.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/navigationRegressionAudit.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/navigationRouterIntegration.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/navigationStateMachine.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationDismissClear.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationFilters.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationNavigationState.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationResponseReplay.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationSync.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/notificationsFilterUi.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/passwordPolicy.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/paymentSuccessContractRefresh.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/phase2NotificationNavigation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/phase4InquiryAttachments.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/productionMutationGuards.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/profileImagePersistence.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/profilePendingMoveIn.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/profilePhotoCrop.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/profilePhotoCropIntegration.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/propertyShowcaseLightbox.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/pushInstallationIdentity.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/pushRegistrationDedup.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/qaBuildEnvironment.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/qaRuntime.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/releaseArtifactContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/rememberedEmail.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/roomTransferErrors.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/roomTransferPresentation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/roomTransferScreenContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/secureCredentials.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/settingsChangePasswordIcon.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/signInWithGoogleRetry.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/startupLoginUx.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/supportAttachmentCap.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/supportConversationPresentation.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/surveyDrafts.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/surveyFeedbackHidden.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/surveyFormSafeFallback.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/surveyMobilePolish.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/surveysListFallback.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/themeModalMaintenance.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/themeTokens.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/unifiedNotificationsContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/unifiedNotificationsScreen.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/useAssistantChat.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/useTenantContract.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/utilityNotificationRouting.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/tests/visualSystemStatic.test.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/theme/tokens.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/accountStatus.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/announcementEngagement.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/announcementPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/attachmentPicker.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/authStability.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingBreakdown.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingDocumentCache.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingInsights.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingSchedulePresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingScreenState.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/billingStatus.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/chatAttachmentViewer.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/chatErrorMessage.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/contractPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/downloadBillPdf.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/extendStayPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/googleAuthError.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/homePresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/latestRequest.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/lilyTopicSuggestions.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/maintenanceAttachmentViewer.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/maintenanceContract.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/maintenanceForm.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/maintenanceRating.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/maintenanceStatus.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/mobileDiagnostics.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/navigation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/notificationFilters.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/notificationPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/passwordValidation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/profilePhotoCrop.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/roomTransferErrors.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/roomTransferPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/supportConversationPresentation.js` |
| `??` | UNRELATED | `.codex-tmp/extend-mobile-check/src/utils/surveyForm.js` |
| `??` | UNRELATED | `.codex-tmp/extend-stay-file-classification.md` |
| `??` | UNRELATED | `.codex-tmp/gates-aggregate.cjs` |
| `??` | UNRELATED | `.codex-tmp/gates-backend-final-summary.json` |
| `??` | UNRELATED | `.codex-tmp/gates-batched-progress.json` |
| `??` | UNRELATED | `.codex-tmp/gates-compatibility.json` |
| `??` | UNRELATED | `.codex-tmp/gates-pr173-previous-body.txt` |
| `??` | UNRELATED | `.codex-tmp/gates-pr70-body.md` |
| `??` | UNRELATED | `.codex-tmp/gates-pr70-previous-body.txt` |
| `??` | UNRELATED | `.codex-tmp/gates-production-evidence.json` |
| `??` | UNRELATED | `.codex-tmp/gates-production-evidence.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/activate.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/backend.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/clock.json` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/clock.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/compatibility.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/connected-evidence.json` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/connected.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/firebase.json` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/manifest.json` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/reconcile.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/reconciliation-evidence.json` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/setup.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/synthetic-final-renewal.pdf` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/utilities.mjs` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/web-styled.png` |
| `??` | UNRELATED | `.codex-tmp/gates-qa/web-tenants.png` |
| `??` | UNRELATED | `.codex-tmp/gatesfinal-batched-progress.json` |
| `??` | UNRELATED | `.codex-tmp/inspect-profile-cas-failure.mjs` |
| `??` | UNRELATED | `.codex-tmp/mobile-combined.json` |
| `??` | UNRELATED | `.codex-tmp/mobile-pr.md` |
| `??` | UNRELATED | `.codex-tmp/postledger-batched-progress.json` |
| `??` | UNRELATED | `.codex-tmp/premerge-backend-batched.json` |
| `??` | UNRELATED | `.codex-tmp/premerge-gates-batched.json` |
| `??` | UNRELATED | `.codex-tmp/premerge-gatesfinal-batched.json` |
| `??` | UNRELATED | `.codex-tmp/premerge-postledger-batched.json` |
| `??` | UNRELATED | `.codex-tmp/profile-audit-summary.mjs` |
| `??` | UNRELATED | `.codex-tmp/published-release-report.md` |
| `??` | UNRELATED | `.codex-tmp/release-backend-final-rollup.json` |
| `??` | UNRELATED | `.codex-tmp/release-execution-20260915.json` |
| `??` | UNRELATED | `.codex-tmp/release-readonly.mjs` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-00` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-01` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-02` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-03` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-04` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-05` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-06` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-07` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-08` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-09` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-10` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-11` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batch-12` |
| `??` | UNRELATED | `.codex-tmp/review-backend-batches-summary.txt` |
| `??` | UNRELATED | `.codex-tmp/review-backend-testlist.txt` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-audit-db.json` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-audit-db.mjs` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-audit-probes.json` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-audit-probes.mjs` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-error-inventory.mjs` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-fix-release-paths.txt` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-fix-targeted-paths.txt` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-mobile-error-probe.json` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-mobile-error-probe.mjs` |
| `??` | UNRELATED | `.codex-tmp/room-transfer-no-external-network.cjs` |
| `??` | UNRELATED | `.codex-tmp/run-backend-batches.cjs` |
| `??` | UNRELATED | `.codex-tmp/run-review-backend-batches.sh` |
| `??` | UNRELATED | `.codex-tmp/source-water-deployment-20260915.json` |
| `??` | UNRELATED | `.codex-tmp/source-water-pr-body.txt` |
| `??` | UNRELATED | `.codex-tmp/unrelated-contract-blockers.mjs` |
| `??` | UNRELATED | `.codex-tmp/verify-postmigration-audit-event.mjs` |
| `??` | UNRELATED | `.codex-tmp/verify-postmigration-recurrence.mjs` |
| `??` | UNRELATED | `.codex-tmp/verify-user-name-ui.mjs` |
| `??` | UNRELATED | `.codex-tmp/water-audit-boundary.mjs` |
| `??` | UNRELATED | `.codex-tmp/water-audit-evidence.json` |
| `??` | UNRELATED | `.codex-tmp/water-audit-ui-prepare.mjs` |
| `??` | UNRELATED | `.codex-tmp/water-audit-ui.test.mjs` |
| `??` | UNRELATED | `.room-transfer-release-checks/conflict-details.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/conflict-details.mjs` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/backend-reconciled.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/backend.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/billing.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/final-files.txt` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/index-check.0.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/index-postdeploy.0.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/index-reconciled.0.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/migration-jest.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/pr-body.md` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/release-paths.txt` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/reviewed-hashes.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/staged.diff` |
| `??` | UNRELATED | `.room-transfer-release-checks/final-release/test-diff.txt` |
| `??` | UNRELATED | `.room-transfer-release-checks/index-review.json` |
| `??` | UNRELATED | `.room-transfer-release-checks/index-review.mjs` |
| `??` | UNRELATED | `.room-transfer-release-checks/release-report.md` |
| `??` | UNRELATED | `.water-visual-qa/README.md` |
| `??` | UNRELATED | `.water-visual-qa/capture.mjs` |
| `??` | UNRELATED | `.water-visual-qa/fixture.jsx` |
| `??` | UNRELATED | `.water-visual-qa/pr-body.md` |
| `??` | UNRELATED | `.water-visual-qa/premerge/browser-audit.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/canonical-stress-projection.json` |
| `??` | UNRELATED | `.water-visual-qa/premerge/findings.md` |
| `??` | UNRELATED | `.water-visual-qa/premerge/fixed-lifecycle-browser.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/fixed-lifecycle-runtime.json` |
| `??` | UNRELATED | `.water-visual-qa/premerge/fixture.jsx` |
| `??` | UNRELATED | `.water-visual-qa/premerge/legacy-pdf.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/pdf-text-and-bounds.json` |
| `??` | UNRELATED | `.water-visual-qa/premerge/server.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/stress-pdf.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/verify-cutover-cli.mjs` |
| `??` | UNRELATED | `.water-visual-qa/premerge/waterPremerge.audit.test.js` |
| `??` | UNRELATED | `.water-visual-qa/render-water-pdf.mjs` |
| `??` | UNRELATED | `.water-visual-qa/server.mjs` |
| `??` | UNRELATED | `docs/reports/extend-stay-notifications-implementation-2026-09-16.md` |
| `??` | UNRELATED | `docs/reports/monthly-utility-combined-merge-audit-2026-09-11.md` |
| `??` | UNRELATED | `docs/reports/room-transfer-consolidated-fix-report-2026-09-15.md` |
| `??` | UNRELATED | `docs/reports/room-transfer-error-inventory-2026-09-15.md` |
| `??` | UNRELATED | `docs/reports/room-transfer-extend-stay-preproduction-gates-2026-09-13.md` |
| `??` | UNRELATED | `docs/reports/room-transfer-extend-stay-release-validation-2026-09-13.md` |
| `??` | UNRELATED | `docs/reports/room-transfer-full-qa-audit-2026-09-15.md` |
| `??` | UNRELATED | `output/Lilycrest_Admin_Guide.pdf` |
| `??` | UNRELATED | `output/Lilycrest_Professional_User_Guide.pdf` |
| `??` | UNRELATED | `output/Lilycrest_Tenant_and_Applicant_Guide.pdf` |
| `??` | UNRELATED | `output/missing-surname-completion-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/missing-surname-completion-receipt-2026-09-16.json` |
| `??` | UNRELATED | `output/person-name-capitalization-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/person-name-capitalization-receipt-2026-09-16.json` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/FINAL_OPERATIONAL_GATE.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/MERGE_AND_PREFLIGHT_STATUS.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/POST_MERGE_STATUS.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/implementation_plan.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/mobile-repository-followup.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/nonblocking-followups.md` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/postmerge-server-results.json` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/read-only-preflight.mjs` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/required-indexes.json` |
| `??` | UNRELATED | `output/pr172-merge-preparation-20260911/review-query.json` |
| `??` | UNRELATED | `output/seed-account-purge-audit.json` |
| `??` | UNRELATED | `output/seed-account-purge-plan.json` |
| `??` | UNRELATED | `output/seed-account-purge-result.json` |
| `??` | UNRELATED | `output/seed-contract-file-purge-plan.json` |
| `??` | UNRELATED | `output/seed-contract-file-purge-result.json` |
| `??` | UNRELATED | `output/seed-purge-dependency-details.txt` |
| `??` | UNRELATED | `output/seed-purge-external-inventory.json` |
| `??` | UNRELATED | `output/seeded-tenant-emails-2026-09-27.txt` |
| `??` | UNRELATED | `output/survey-seed-dry-run-2026-09-16.csv` |
| `??` | UNRELATED | `output/survey-seed-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-dry-run-2026-09-16.md` |
| `??` | UNRELATED | `output/survey-seed-executable-plan-final-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-executable-plan-final-2026-09-16.manifest.plan.json` |
| `??` | UNRELATED | `output/survey-seed-executable-plan-revision-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-executable-plan-revision-2026-09-16.manifest.plan.json` |
| `??` | UNRELATED | `output/survey-seed-execution-dependency-audit-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-execution-final-drift-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-execution-final-validation-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-execution-receipt-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-execution-revision-drift-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-execution-revision-validation-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-final-plan-2026-09-16.csv` |
| `??` | UNRELATED | `output/survey-seed-final-plan-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-final-plan-2026-09-16.manifest.plan.json` |
| `??` | UNRELATED | `output/survey-seed-final-plan-2026-09-16.md` |
| `??` | UNRELATED | `output/survey-seed-identity-presentation-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-identity-presentation-receipt-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postcommit-followup-verification-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postcorrection-independent-verification-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postfailure-rollback-check-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postfix-readonly-verification-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postmigration-correction-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postmigration-correction-receipt-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postmigration-reconciliation-audit-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postwrite-verification-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-postwrite-verification-2026-09-16.transaction-diagnostics.json` |
| `??` | UNRELATED | `output/survey-seed-prewrite-drift-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-transaction-executor-self-check-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-unresolved-utility-history-audit-2026-09-16.json` |
| `??` | UNRELATED | `output/survey-seed-update-path-compatibility-2026-09-16.json` |
| `??` | UNRELATED | `output/system-accounts-2026-09-27.md` |
| `??` | UNRELATED | `output/tenant-conflict-report-2026-09-15.xlsx` |
| `??` | UNRELATED | `output/tenant-profile-completion-dry-run-2026-09-16.json` |
| `??` | UNRELATED | `output/tenant-profile-completion-independent-verification-2026-09-16.json` |
| `??` | UNRELATED | `output/tenant-profile-completion-receipt-2026-09-16.json` |
| `??` | UNRELATED | `server/scripts/audit_room_transfer_conflicts.mjs` |
| `??` | UNRELATED | `server/scripts/audit_seed_account_purge.mjs` |
| `??` | UNRELATED | `server/scripts/audit_survey_seed_candidates.mjs` |
| `??` | UNRELATED | `server/scripts/audit_survey_seed_execution_dependencies.mjs` |
| `??` | UNRELATED | `server/scripts/audit_survey_seed_unresolved_utility_history.mjs` |
| `??` | UNRELATED | `server/scripts/audit_utility_period_lifecycle.mjs` |
| `??` | UNRELATED | `server/scripts/check_survey_seed_migration_drift.mjs` |
| `??` | UNRELATED | `server/scripts/delete_account_by_email.mjs` |
| `??` | UNRELATED | `server/scripts/execute_survey_seed_migration.mjs` |
| `??` | UNRELATED | `server/scripts/finalize_survey_seed_execution_plan.mjs` |
| `??` | UNRELATED | `server/scripts/generate_conflict_report_xlsx.mjs` |
| `??` | UNRELATED | `server/scripts/inspect_seed_purge_dependencies.mjs` |
| `??` | UNRELATED | `server/scripts/list_tenants_applicants_contract_conflicts.mjs` |
| `??` | UNRELATED | `server/scripts/prepare_survey_seed_execution_revision.mjs` |
| `??` | UNRELATED | `server/scripts/prepare_survey_seed_migration_plan.mjs` |
| `??` | UNRELATED | `server/scripts/purge_confirmed_seed_accounts.mjs` |
| `??` | UNRELATED | `server/scripts/purge_seed_contract_files.mjs` |
| `??` | UNRELATED | `server/scripts/repair_survey_seed_identity_presentation.mjs` |
| `??` | UNRELATED | `server/scripts/rollback_survey_seed_migration.mjs` |
| `??` | UNRELATED | `server/scripts/survey_seed_migration_common.mjs` |
| `??` | UNRELATED | `server/scripts/survey_seed_update_path_safety.mjs` |
| `??` | UNRELATED | `server/scripts/validate_survey_seed_execution_revision.mjs` |
| `??` | UNRELATED | `server/scripts/validate_survey_seed_final_execution_plan.mjs` |
| `??` | UNRELATED | `server/scripts/validate_survey_seed_transaction_executor.mjs` |
| `??` | UNRELATED | `server/scripts/validate_survey_seed_update_path_compatibility.mjs` |
| `??` | UNRELATED | `server/scripts/verify_survey_seed_migration.mjs` |

### Unresolved conflicts

| Initial status | Classification | Path |
| --- | --- | --- |
| `UU` | UNRELATED | `server/controllers/roomsController.js` |

### Unknown ? preserved, do not stage

| Initial status | Classification | Path |
| --- | --- | --- |
| `??` | UNKNOWN | `.codex-tmp/contract-duration-audit/` |
| `??` | UNKNOWN | `.codex-tmp/extend-stay-web-backend/` |

### Removed generated files

| Initial status | Classification | Path |
| --- | --- | --- |
| `??` | REMOVE | `.codex-tmp/backend-batch-1.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-10.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-11.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-12.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-13.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-2.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-3.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-4.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-5.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-6.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-7.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-8.json` |
| `??` | REMOVE | `.codex-tmp/backend-batch-9.json` |
| `??` | REMOVE | `.codex-tmp/backend-results-final.json` |
| `??` | REMOVE | `.codex-tmp/backend-results.json` |
| `??` | REMOVE | `.codex-tmp/backend-settlement-final.json` |
| `??` | REMOVE | `.codex-tmp/backend-targeted-final.json` |
| `??` | REMOVE | `.codex-tmp/backend-verification.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-ci.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-current-stay.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-final-full.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-final-preparation.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-final-recheck.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-focused.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-initial-tests.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-integration-final.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-lock-check.json` |
| `??` | REMOVE | `.codex-tmp/duration-fix-prep.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-1.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-10.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-11.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-12.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-13.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-2.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-3.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-4.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-5.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-6.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-7.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-8.json` |
| `??` | REMOVE | `.codex-tmp/gates-batch-9.json` |
| `??` | REMOVE | `.codex-tmp/gates-finalization-tests.json` |
| `??` | REMOVE | `.codex-tmp/gates-mobile-tests-final.json` |
| `??` | REMOVE | `.codex-tmp/gates-mobile-tests.json` |
| `??` | REMOVE | `.codex-tmp/gates-renewal-tests.json` |
| `??` | REMOVE | `.codex-tmp/gates-transfer-billing-tests.json` |
| `??` | REMOVE | `.codex-tmp/gatesfinal-batch-1.json` |
| `??` | REMOVE | `.codex-tmp/gatesfinal-batch-2.json` |
| `??` | REMOVE | `.codex-tmp/gatesfinal-batch-3.json` |
| `??` | REMOVE | `.codex-tmp/gatesfinal-batch-4.json` |
| `??` | REMOVE | `.codex-tmp/gatesfinal-batch-5.json` |
| `??` | REMOVE | `.codex-tmp/main-contract-audit-backend.json` |
| `??` | REMOVE | `.codex-tmp/mobile-results-final.json` |
| `??` | REMOVE | `.codex-tmp/mobile-results.json` |
| `??` | REMOVE | `.codex-tmp/mobile-targeted-final.json` |
| `??` | REMOVE | `.codex-tmp/postledger-batch-1.json` |
| `??` | REMOVE | `.codex-tmp/postledger-batch-2.json` |
| `??` | REMOVE | `.codex-tmp/postmerge-critical-20260915.json` |
| `??` | REMOVE | `.codex-tmp/premerge-controller.json` |
| `??` | REMOVE | `.codex-tmp/premerge-currentstay.json` |
| `??` | REMOVE | `.codex-tmp/premerge-extension.json` |
| `??` | REMOVE | `.codex-tmp/premerge-mobile-full.json` |
| `??` | REMOVE | `.codex-tmp/premerge-paid-adjustment.json` |
| `??` | REMOVE | `.codex-tmp/premerge-payment-final.json` |
| `??` | REMOVE | `.codex-tmp/premerge-scheduler.json` |
| `??` | REMOVE | `.codex-tmp/premerge-scheduling.json` |
| `??` | REMOVE | `.codex-tmp/premerge-workspace-scheduler.json` |
| `??` | REMOVE | `.codex-tmp/premerge-workspace.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-00.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-01.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-02.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-03.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-04.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-05.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-06.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-07.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-08.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-09.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-10.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-11.json` |
| `??` | REMOVE | `.codex-tmp/review-backend-review-backend-batch-12.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-audit-core.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-audit-rules.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-audit-unit.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-backend-final.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-backend-full.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-core-final.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-core.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-core2.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-execution.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-extra.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-final-followup.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-last-core.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-regression.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-release.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-repairs.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-rules.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-shared-repairs.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-targeted-final.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-unit-final.json` |
| `??` | REMOVE | `.codex-tmp/room-transfer-fix-unit.json` |
| `??` | REMOVE | `.codex-tmp/water-audit-existing-tests.json` |
| `??` | REMOVE | `.codex-tmp/water-fix-affected-1.json` |
| `??` | REMOVE | `.codex-tmp/water-fix-affected-2.json` |
| `??` | REMOVE | `.codex-tmp/water-fix-focused.json` |
| `??` | REMOVE | `.codex-tmp/water-hotfix-main-compatibility.json` |
| `??` | REMOVE | `.codex-tmp/water-hotfix-postmerge.json` |

## Final Git status and diff stat

`git status`:

```text
On branch fix/room-transfer-consolidated-20260915
Your branch and 'origin/main' have diverged,
and have 12 and 24 different commits each, respectively.
  (use "git pull" if you want to integrate the remote branch with yours)

You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Changes to be committed:
	new file:   docs/PRODUCT_REQUIREMENTS_DOCUMENT.md
	new file:   docs/reports/extend-stay-web-backend-review-2026-09-16.md
	new file:   docs/superpowers/plans/2026-09-15-code-review-remediation.md
	new file:   docs/superpowers/plans/2026-09-15-moveout-billing-termination-and-settlement.md
	new file:   docs/superpowers/plans/2026-09-15-tenant-assistant-penalty-detection.md
	new file:   docs/superpowers/plans/2026-09-16-auth-optimization-and-test-parity.md
	new file:   docs/superpowers/plans/2026-09-16-enforce-solo-lifecycle-and-contract-acknowledgement.md
	new file:   docs/superpowers/plans/2026-09-16-fix-all-time-rent-billing-duplicate.md
	new file:   docs/superpowers/plans/2026-09-16-fix-moveout-bed-release-and-tenancy-isolation.md
	new file:   docs/superpowers/plans/2026-09-16-profile-date-of-birth-validation-relaxation.md
	new file:   docs/superpowers/plans/2026-09-27-billing-sort-and-status-filters.md
	modified:   server/controllers/announcementsController.js
	modified:   server/controllers/announcementsController.test.js
	modified:   server/controllers/authController.identitySafety.test.js
	modified:   server/controllers/authController.js
	modified:   server/controllers/billing/_helpers.js
	new file:   server/controllers/billing/billingHelpers.formatBill.test.js
	modified:   server/controllers/contractController.js
	new file:   server/controllers/contractController.termLineage.integration.test.js
	modified:   server/controllers/monthlyUtilityWorkflow.integration.test.js
	modified:   server/controllers/paymentController.js
	modified:   server/controllers/paymentController.test.js
	modified:   server/controllers/reservations/cancellationController.js
	modified:   server/controllers/reservations/reservationLifecycleController.cancellationGuard.integration.test.js
	modified:   server/controllers/reservations/reservationLifecycleController.js
	modified:   server/controllers/reservations/reservationLifecycleController.moveInContractRepair.integration.test.js
	modified:   server/controllers/reservations/tenancyActionsController.js
	modified:   server/controllers/reservations/tenancyActionsController.renewalConcurrency.integration.test.js
	modified:   server/controllers/reservations/tenancyActionsController.renewalOfferPricing.integration.test.js
	new file:   server/controllers/roomsController.syncBedUser.test.js
	modified:   server/controllers/usersController.js
	modified:   server/controllers/usersController.test.js
	modified:   server/mobile/announcementAudience.security.test.js
	modified:   server/mobile/controllers/announcement.controller.js
	modified:   server/mobile/controllers/announcement.controller.test.js
	modified:   server/mobile/mountedRoutes.behavior.test.js
	modified:   server/mobile/routes/announcement.routes.js
	new file:   server/mobile/services/announcementEngagement.service.js
	modified:   server/models/AcknowledgmentAccount.js
	modified:   server/models/Room.js
	new file:   server/models/Room.vacateBed.test.js
	modified:   server/models/Stay.js
	modified:   server/models/StayExtensionRequest.js
	modified:   server/models/index.js
	new file:   server/scripts/check_user_contracts.mjs
	new file:   server/scripts/generate_pdf.mjs
	new file:   server/scripts/reconcile_room_204_moveout.mjs
	new file:   server/scripts/reconcile_stay_contract_dates.integration.test.js
	new file:   server/scripts/reconcile_stay_contract_dates.md
	new file:   server/scripts/reconcile_stay_contract_dates.mjs
	new file:   server/scripts/repair_room204_and_stale_extensions.mjs
	new file:   server/scripts/repair_room204_and_stale_extensions.test.mjs
	new file:   server/services/announcementEngagementService.integration.test.js
	new file:   server/services/announcementEngagementService.js
	modified:   server/services/autoContractOrchestratorService.js
	modified:   server/services/autoContractOrchestratorService.test.js
	modified:   server/services/billing/roomUtilityBoundaryService.js
	modified:   server/services/chatbot/tenantAssistantService.js
	modified:   server/services/chatbot/tenantAssistantService.test.js
	modified:   server/services/chatbot/tenantChatbotService.js
	modified:   server/services/chatbot/tenantChatbotService.test.js
	modified:   server/services/chatbot/tenantContextResolver.js
	modified:   server/services/chatbot/tenantContextResolver.test.js
	new file:   server/services/contractAcknowledgementService.multiLifecycle.integration.test.js
	modified:   server/services/contractService.js
	new file:   server/services/moveInContractDateSync.integration.test.js
	new file:   server/services/moveInContractDateSync.js
	modified:   server/services/moveOutClearanceService.js
	modified:   server/services/moveOutClearanceService.test.js
	modified:   server/services/occupancy/occupancyManager.js
	new file:   server/services/occupancy/stayTerminationCascade.test.js
	new file:   server/services/stayContractIntegrity.js
	new file:   server/services/stayContractIntegrity.test.js
	new file:   server/services/stayContractRepairPlan.js
	new file:   server/services/stayContractRepairPlan.test.js
	modified:   server/services/stayExtensionRequestService.integration.test.js
	modified:   server/services/stayExtensionRequestService.js
	modified:   server/services/tenantContractSelectionService.integration.test.js
	modified:   server/services/tenantContractSelectionService.js
	new file:   server/services/tenantContractSelectionService.lifecycleIsolation.test.js
	modified:   server/services/tenantContractSelectionService.test.js
	modified:   server/services/tenantContractViewService.js
	modified:   server/utils/depositUtils.js
	modified:   server/utils/depositUtils.test.js
	modified:   server/utils/scheduler.js
	modified:   server/utils/scheduler.test.js
	modified:   server/utils/tenantActionService.currentStayResolution.integration.test.js
	modified:   server/utils/tenantActionService.js
	new file:   server/utils/tenantActionService.moveOutCascade.integration.test.js
	modified:   server/utils/tenantActionService.moveOutContractSync.integration.test.js
	new file:   server/utils/tenantActionService.parseDateTime.test.js
	modified:   server/utils/tenantActionService.renewal.integration.test.js
	new file:   server/utils/tenantActionService.shortTermExtension.test.js
	modified:   server/utils/utilityBillFlow.js
	modified:   web/src/features/admin/components/MoveOutClearanceCalculator.jsx
	modified:   web/src/features/admin/components/OverdueNoticeTracker.jsx
	modified:   web/src/features/admin/components/ReservationDetailsModal.jsx
	modified:   web/src/features/admin/components/TenantDetailModal.jsx
	modified:   web/src/features/admin/components/TenantWorkspaceModals.jsx
	modified:   web/src/features/admin/components/billing/RentBillingTab.jsx
	new file:   web/src/features/admin/components/billing/billingFiltersAndSorting.test.mjs
	modified:   web/src/features/admin/components/rooms/DoubleDeckRoomCard.jsx
	modified:   web/src/features/admin/components/rooms/RoomConfigModal.jsx
	modified:   web/src/features/admin/components/rooms/RoomImageLightboxModal.jsx
	new file:   web/src/features/admin/components/rooms/privateRoomOccupancyDisplay.test.mjs
	modified:   web/src/features/admin/components/rooms/roomImageLightboxModal.test.mjs
	modified:   web/src/features/admin/components/tenants/details/TenantOverviewTab.jsx
	modified:   web/src/features/admin/pages/TenantsWorkspacePage.jsx
	new file:   web/src/features/public/pages/SignUp.googleCollisionRecovery.test.mjs
	modified:   web/src/features/public/pages/SignUp.jsx
	modified:   web/src/features/tenant/components/ReservationDashboard.jsx
	modified:   web/src/features/tenant/components/assistant/TenantAssistantDrawer.jsx
	modified:   web/src/features/tenant/components/assistant/cards/TenantBillingBreakdownCard.jsx
	modified:   web/src/features/tenant/components/assistant/tenantAssistant.test.mjs
	modified:   web/src/features/tenant/components/profile/BillingTab.jsx
	modified:   web/src/features/tenant/components/profile/DashboardTab.jsx
	new file:   web/src/features/tenant/components/profile/DashboardTab.responsive.test.mjs
	modified:   web/src/features/tenant/components/profile/ProfileCompletionCard.jsx
	modified:   web/src/features/tenant/components/profile/ReservationAgreementPage.jsx
	modified:   web/src/features/tenant/components/profile/reservationCancellationUi.js
	modified:   web/src/features/tenant/components/profile/reservationCancellationUi.test.mjs
	modified:   web/src/features/tenant/pages/ContractsPage.jsx
	modified:   web/src/features/tenant/pages/SignIn.googleOnboarding.test.mjs
	modified:   web/src/features/tenant/pages/SignIn.jsx
	modified:   web/src/features/tenant/styles/profile-page.css
	modified:   web/src/features/tenant/styles/tenant-assistant.css
	modified:   web/src/shared/layouts/TenantLayout.css
	modified:   web/src/shared/utils/authToasts.js
	new file:   web/src/shared/utils/authToasts.test.mjs
	modified:   web/src/shared/utils/notification.js
	modified:   web/src/shared/utils/notificationSummary.test.mjs

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   server/controllers/roomsController.js

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   server/controllers/analyticsController.js
	modified:   server/controllers/analyticsController.test.js
	modified:   server/controllers/chatController.authority.test.js
	modified:   server/controllers/chatController.js
	modified:   server/controllers/reservations/tenancyActionsController.scheduledTransferBranch.integration.test.js
	modified:   server/models/ChatConversation.js
	modified:   server/scripts/complete_tenant_profiles_postmigration.mjs
	modified:   server/services/contractRoomTransferActivationService.integration.test.js
	modified:   server/services/notifications/notificationService.js
	modified:   web/src/features/admin/components/chat/AdminChatCloseModal.jsx
	modified:   web/src/features/admin/components/chat/AdminChatClosedBanner.jsx
	modified:   web/src/features/admin/components/chat/AdminChatConversationList.jsx
	modified:   web/src/features/admin/components/chat/AdminChatStatusModal.jsx
	modified:   web/src/features/admin/components/chat/AdminChatTicketSidebar.jsx
	modified:   web/src/features/admin/components/chat/chatConstants.js
	modified:   web/src/features/admin/components/chat/useAdminChat.js
	modified:   web/src/features/admin/pages/AdminChatPage.jsx
	modified:   web/src/features/admin/pages/AdminChatPhase4.test.mjs
	modified:   web/src/features/admin/pages/AdminNotificationsPage.jsx
	modified:   web/src/features/admin/pages/AnalyticsSupportChatTab.jsx
	modified:   web/src/shared/api/chatApi.js
	modified:   web/src/shared/components/NotificationBell.jsx
	modified:   web/src/shared/hooks/useChatSocket.js

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.billing-cycle-reconciliation/
	.codex-tmp/
	.room-transfer-release-checks/
	.water-visual-qa/
	docs/reports/admin-support-ratings-implementation-2026-09-27.md
	docs/reports/admin-support-ratings-worktree-cleanup-2026-09-27.md
	docs/reports/extend-stay-notifications-implementation-2026-09-16.md
	docs/reports/monthly-utility-combined-merge-audit-2026-09-11.md
	docs/reports/room-transfer-consolidated-fix-report-2026-09-15.md
	docs/reports/room-transfer-error-inventory-2026-09-15.md
	docs/reports/room-transfer-extend-stay-preproduction-gates-2026-09-13.md
	docs/reports/room-transfer-extend-stay-release-validation-2026-09-13.md
	docs/reports/room-transfer-full-qa-audit-2026-09-15.md
	output/
	server/controllers/chatSupportContract.integration.test.js
	server/scripts/audit_room_transfer_conflicts.mjs
	server/scripts/audit_seed_account_purge.mjs
	server/scripts/audit_survey_seed_candidates.mjs
	server/scripts/audit_survey_seed_execution_dependencies.mjs
	server/scripts/audit_survey_seed_unresolved_utility_history.mjs
	server/scripts/audit_utility_period_lifecycle.mjs
	server/scripts/check_survey_seed_migration_drift.mjs
	server/scripts/delete_account_by_email.mjs
	server/scripts/execute_survey_seed_migration.mjs
	server/scripts/finalize_survey_seed_execution_plan.mjs
	server/scripts/generate_conflict_report_xlsx.mjs
	server/scripts/inspect_seed_purge_dependencies.mjs
	server/scripts/list_tenants_applicants_contract_conflicts.mjs
	server/scripts/prepare_survey_seed_execution_revision.mjs
	server/scripts/prepare_survey_seed_migration_plan.mjs
	server/scripts/purge_confirmed_seed_accounts.mjs
	server/scripts/purge_seed_contract_files.mjs
	server/scripts/repair_survey_seed_identity_presentation.mjs
	server/scripts/rollback_survey_seed_migration.mjs
	server/scripts/survey_seed_migration_common.mjs
	server/scripts/survey_seed_update_path_safety.mjs
	server/scripts/validate_survey_seed_execution_revision.mjs
	server/scripts/validate_survey_seed_final_execution_plan.mjs
	server/scripts/validate_survey_seed_transaction_executor.mjs
	server/scripts/validate_survey_seed_update_path_compatibility.mjs
	server/scripts/verify_survey_seed_migration.mjs
	server/services/supportRequestService.js
	web/src/features/admin/components/chat/AdminSupportRequestDetails.jsx
	web/src/features/admin/components/chat/supportRating.behavior.test.mjs
	web/src/shared/utils/supportConcern.js
	web/src/shared/utils/supportConcern.test.mjs
```

`git diff --stat` (unstaged tracked changes only; excludes untracked implementation files):

```text
 server/controllers/analyticsController.js          |  17 ++-
 server/controllers/analyticsController.test.js     |   3 +-
 .../controllers/chatController.authority.test.js   |   4 +-
 server/controllers/chatController.js               | 105 ++++++++++++--
 server/controllers/roomsController.js              | Unmerged
 server/controllers/roomsController.js              | 156 ++++++++++++++++++---
 server/models/ChatConversation.js                  |   3 +
 .../complete_tenant_profiles_postmigration.mjs     |  12 +-
 .../services/notifications/notificationService.js  |   6 +-
 .../admin/components/chat/AdminChatCloseModal.jsx  |   2 +-
 .../components/chat/AdminChatClosedBanner.jsx      |   4 +-
 .../components/chat/AdminChatConversationList.jsx  |  21 +--
 .../admin/components/chat/AdminChatStatusModal.jsx |  15 +-
 .../components/chat/AdminChatTicketSidebar.jsx     |  15 +-
 .../admin/components/chat/chatConstants.js         |   4 +-
 .../features/admin/components/chat/useAdminChat.js | 149 ++++++++++++++------
 web/src/features/admin/pages/AdminChatPage.jsx     |   5 +-
 .../features/admin/pages/AdminChatPhase4.test.mjs  |   9 +-
 .../admin/pages/AdminNotificationsPage.jsx         |   3 +
 .../admin/pages/AnalyticsSupportChatTab.jsx        |   8 +-
 web/src/shared/api/chatApi.js                      |   4 +-
 web/src/shared/components/NotificationBell.jsx     |   3 +
 web/src/shared/hooks/useChatSocket.js              |   2 +-
 22 files changed, 424 insertions(+), 126 deletions(-)
```

## Follow-up scratch cleanup ? 2026-09-27

The user subsequently authorized removing obsolete worktree material. This supersedes the earlier retained-artifact inventory: 21 untracked seed scripts were removed in a separate pass, followed by 431 scratch/output files in this pass.

- `.codex-tmp/`: 333 files, including 246 temporary copied mobile-source files.
- `.billing-cycle-reconciliation/`: 22 old audit files.
- `.room-transfer-release-checks/`: 18 old release-check files.
- `output/`: 58 generated operational/audit files; guides and the spreadsheet deliverable retained.

Recovery copies were verified by SHA-256 before deleting each original. All preserved file hashes and Git index entries matched the pre-pass snapshot. No application code was changed; prior 74-test and admin-build results remain the latest runtime validation.

Git porcelain entries fell from 630 to 199: 131 staged, 23 unstaged, one unresolved conflict, and 44 untracked entries. The two registered nested worktrees and reusable `.water-visual-qa` fixtures are preserved. The unrelated rooms-controller conflict remains untouched. Nothing staged, committed or pushed.

Recovery archive: `C:\Users\leigh\AppData\Local\Temp\capstone-obsolete-worktree-20260927-225746`. The archive includes the removal manifest and before/after verification evidence.
