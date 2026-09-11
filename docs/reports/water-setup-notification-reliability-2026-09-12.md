# Water setup and utility notification validation

Date: 2026-09-12. Implementation remains uncommitted. No push, merge, deployment, production database access, production notifications, environment changes, or platform configuration changes were performed.

## A. Branches and bases

- Web/server: `fix/water-setup-notification-delivery`, based on fetched `origin/main` at `efe0cca9da5e4f1335735e5b12a191b5a7c57c93`.
- Mobile, separate repository `D:/LilyCrest`: `fix/utility-notification-verification`, based on fetched `origin/master` at `c6054e2ffd58cf2ee5804848a1de93f73681a152`. This repository uses `master`, not `main`.
- Neither HEAD was advanced by a new commit.

## B. File manifest

Web/server: 25 files, including this report. Paths are relative to `D:/Capstone-Website`.

```text
server/controllers/billing/rentBillingController.js
server/controllers/billingController.test.js
server/controllers/monthlyUtilityWorkflow.integration.test.js
server/controllers/utilityBillingController.js
server/controllers/utilityNotificationDelivery.integration.test.js [new]
server/models/UtilityNotificationDelivery.js [new]
server/services/mobileNotificationBridge.js
server/services/notifications/billReleaseNotificationSmoke.test.js
server/services/notifications/mobilePushService.js
server/services/notifications/notificationService.js
server/services/notifications/utilityNotificationDelivery.js [new]
server/utils/utilityBillFlow.js
web/src/features/admin/components/billing/CloseCurrentPeriodModal.jsx
web/src/features/admin/components/billing/NewBillingPeriodModal.jsx
web/src/features/admin/components/billing/OpenCurrentPeriodModal.jsx
web/src/features/admin/components/billing/RecordWaterOpeningModal.jsx
web/src/features/admin/components/billing/UtilityBillingTab.jsx
web/src/features/admin/components/billing/monthlyUtilityWorkflow.mount.test.mjs
web/src/features/admin/components/billing/shared/useBillingNotifier.js
web/src/features/admin/components/billing/utility/UtilityCycleHistoryPanel.jsx
web/src/features/admin/components/billing/utility/UtilityCycleOverviewCard.jsx
web/src/features/admin/components/billing/utility/utilityDeliveryMessage.js [new]
web/src/features/admin/components/billing/utility/waterErrors.js [new]
web/src/features/admin/components/billing/utility/waterErrors.test.mjs [new]
docs/reports/water-setup-notification-reliability-2026-09-12.md [new]
```

Mobile: four files, relative to `D:/LilyCrest/LilyCrest-Clean/frontend`.

```text
app/bill-details.jsx
src/tests/notificationSync.test.js
src/tests/utilityNotificationRouting.test.js [new]
src/utils/navigation.js
```

## C–E. Create Water Cycle and retained backend paths

Water recovery entry points now open one **Create Water Cycle** modal. With no active cycle it explains: “No active water cycle found. Create a water cycle to start billing for this room.” With an active unbilled measured cycle it explains that the existing cycle is being completed and uses **Complete Water Setup** for submission.

The form preserves the actual date and time, including seconds, in Philippine time and submits the equivalent exact UTC instant. It collects the real opening reading, source, reason, and required historical evidence. Evidence is shown only for documented history. The rate is read-only: current global rate for a new cycle, captured rate for an existing cycle.

Successful save displays: “Water billing starts from this verified reading. Earlier usage remains unknown. No bill has been created.” It does not automatically open draft generation.

The existing `recordWaterOpeningRecovery` endpoint/service and `createOpenUtilityPeriodWithBoundary` lifecycle service are retained without modification. The recovery service determines whether to initialize a canonical measured period or repair missing opening evidence. Existing manual initialization APIs remain available to their other callers. No new recovery API or alternate billing engine was introduced.

The redundant **Record Opening Reading** wording and Water-facing **Manual Initialization** entry now use this unified experience. **New Billing Period** and **Start Billing Cycle** buttons retain their existing behavior and labels; only their adjacent recovery entry/error presentation changed.

No initialization charge, bill, fabricated earlier usage, occupancy change, move-in change, history recalculation, rate propagation change, or room eligibility change was added. Legacy Water, chronology, overlap, correction, transaction and financial-history protections remain in their existing services. GP705/GP1008 repair scripts and their shared lifecycle contract were not edited.

## F. Friendly Water errors

The UI maps structured codes and supported older domain messages while retaining backend codes:

| Condition | Admin message |
| --- | --- |
| No verified baseline, no active cycle | Water billing is not active for this room yet. Create a water cycle first. |
| Active cycle missing opening evidence | This cycle needs a verified opening reading before billing can continue. |
| Invalid reading | Enter a valid meter reading of zero or more. |
| Invalid/future observation | Enter when the reading was taken. It cannot be in the future. |
| Missing historical evidence | Add a reference to the record supporting this historical reading. |
| Chronology/decreasing reading | This meter reading conflicts with an existing record. Please check the date and reading. |
| Existing verified opening | An opening reading is already recorded. Use reading correction if it is incorrect. |
| Financial-history lock | This cycle already has billing history and cannot be changed through opening recovery. |
| Legacy Water | Review or close the existing flat-charge cycle before starting metered Water billing. |
| Excluded room/branch | Separate metered Water billing does not apply to this room. |
| Unexpected failure | Unable to complete this action. Please try again. |

Additional mappings cover overlaps, review/correction restrictions, unavailable rates, occupancy conflicts, and room access. Water preview/recovery/notifier paths use the mapper; Electricity messages retain their existing handling.

## G–I. Water/Electricity root fix and retries

The shared defect was treating a fulfilled notification call as success even when persistence returned `null`. Notification persistence and push results now have separate explicit fields. A missing persisted notification can never set `notificationSent: true`.

Financial publication queues a durable delivery record in its transaction. The record has a deterministic event identity, a delivery lease, persistence status, notification ID, attempt count, provider outcome, error and hashes of accepted device tokens. It has no TTL. Canonical Water and Electricity publication safeguards remain in place.

Repeated Send can repair delivery for already-published charges and returns `published: 0`. It does not rewrite the invoice, create a new bill, duplicate charges, or repeat the first-publication email. The history UI exposes **Retry notifications**. Notification retry is admin-triggered through Send; this change does not install a background retry scheduler.

The older generic utility publisher uses the same durable event mechanism. An existing legacy `bill_released:<bill>:invoice:<version>` notification is adopted without creating another alert and is reported as `legacy_unverified`, rather than pretending its historical push outcome is known.

## J–O. Recipients, mobile feed, push and idempotency

- Only eligible current tenant accounts receive utility delivery. Applicant roles/statuses and restricted/inactive accounts are excluded. Canonical IDs and supported legacy business IDs resolve to the canonical account.
- Shared-room tests verify each notification belongs to the matching tenant bill; recipients do not receive other tenants’ bill links.
- Water and Electricity titles identify their utility. Each payload includes bill ID, utility type, period identity and the existing `/bill-details?billId=...` route.
- Real local notification persistence is exercised through the mobile feed bridge. Applicant feeds exclude utility notifications. Existing billing ownership checks remain unchanged and are included in regression tests.
- Mobile notification and push payloads resolve to the same bill route. The bill screen’s Back actions return to Billing, including a cold-route fallback.
- Push outcomes distinguish `accepted`, `partial`, `failed`, `no_eligible_token`, pending work and legacy-unverified delivery. No token means an in-app-only result. Acceptance means provider acceptance, not proof of OS display; foreground presentation remains controlled by the mobile client.
- Duplicate/concurrent Send tests verify one bill/event/push. Retrying persistence failures reuses the event key; retrying push preserves the existing notification/read state. Partial retries skip device tokens already recorded as accepted.

## P–U. Validation

| Check | Result |
| --- | --- |
| Focused Water recovery + mobile bridge/routes/ownership | 84 passed, 4 suites, zero failures |
| Publication, retry, monthly workflow and real push transport boundary | 59 passed, 3 suites, zero failures |
| Mobile notification/routing, cold transforms (`--no-cache`) | 23 passed, 6 suites, zero failures |
| Complete utility/billing/notification regression | 845 passed, 71 suites, zero failures |
| Full server | 3,651 passed, 361 suites, zero failures |
| Full web frontend | 1,180 passed, zero failures/skips/cancellations |
| Production build | PASS, Vite production build |
| Local visual review | PASS, desktop, 390px dark and 320px light; focus/escape, form scrolling and historical evidence |

Water coverage includes new baseline, missing opening on an existing unbilled cycle, exact historical timestamps, no charge/occupancy/move-in mutation, paid/finalized locks, chronology/overlap/exclusions, rollback and concurrent recovery. Existing prospective-rate and legacy flat-charge tests are retained.

Notification coverage includes `null`, thrown persistence failure, actual failed model save, failed/partial push, no token, applicant exclusion, shared-room targeting, both utilities, concurrent/repeated Send, transaction rollback, committed publication recovery, legacy publisher compatibility, deep links and mobile feed visibility.

The mobile sync fixture now isolates unrelated presentation providers, keeps stable router mocks, waits for the real feed request, and initializes RNTL’s lazy native renderer once in bounded setup. Notification assertions retain their normal timeout. The cold-cache run passed.

Commands used (server commands run from `server`, web commands from `web`):

```text
npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB --forceExit --silent
npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB --silent --forceExit --runTestsByPath <71 manifest paths>
npm test -- --runInBand --silent --forceExit --runTestsByPath controllers/utilityProspectiveRates.integration.test.js services/mobileNotificationBridge.test.js routes/mobileNotificationRoutes.test.js routes/mobileBillingRoutes.mount.test.js
npm test -- --runInBand --silent --forceExit --runTestsByPath controllers/utilityNotificationDelivery.integration.test.js controllers/monthlyUtilityWorkflow.integration.test.js services/notifications/billReleaseNotificationSmoke.test.js
npm test
npm run build
```

Mobile command, from `D:/LilyCrest/LilyCrest-Clean/frontend`:

```text
node node_modules/jest/bin/jest.js --runInBand --silent --no-cache --runTestsByPath src/tests/notificationSync.test.js src/tests/utilityNotificationRouting.test.js src/tests/nativePushTransport.test.js src/tests/notificationNavigationState.test.js src/tests/unifiedNotificationsContract.test.js src/tests/pushRegistrationDedup.test.js
```

Logs and the exact 71-path regression manifest are in the session TEMP directory, named `water-setup-*`. Earlier fixture failures were corrected: a unit mock needed the new delivery boundary and tenant fixtures needed active tenant status. A direct Node Jest invocation without the repository’s ESM flag was replaced with `npm test`. The initial serial full run was superseded by the final two-worker run.

## V. Git and original files

All changes are unstaged and uncommitted. No original untracked files were added to the index. The original 91 web/server untracked paths and SHA-256 hashes match the saved baseline. The separate mobile repository’s 364 original untracked files also match their baseline. Task-created files are listed explicitly above and are additional untracked files. Generated build output remains ignored. `git diff --check` is clean.

## W. Remaining limits and verdict

No production/device delivery was attempted; external push/email boundaries were mocked. Provider acceptance cannot prove an OS banner was displayed. An external provider accepting a request followed by a process crash before its result is saved remains an ambiguous distributed-system window; retained event/collapse identities and accepted-token tracking reduce repeat alerts but are not a claim of exactly-once physical device display. Historical generic delivery remains explicitly unverified. Delivery retries are separate from paid financial history.

No unresolved test, build or implementation blocker was found within this scope. Production/device delivery remains untested by design; the mobile changes are in a separate repository and must be reviewed alongside the web/server changes before any later release.

**IMPLEMENTATION VALIDATED — READY TO COMMIT**
