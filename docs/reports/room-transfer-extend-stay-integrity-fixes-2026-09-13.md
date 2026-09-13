# Room Transfer + Extend Stay integrity fixes

Date: 2026-09-13. **Not merged or deployed.**

Backend/Web baseline: `8ba8572e43f0ab55afcfe496c386e826c06d01b5` (`D:\Capstone-Website`). Mobile baseline: `544eadcf6655997277c2ded4d23e52437d41dfea` (`D:\LilyCrest\LilyCrest-Clean`). Findings were checked against these HEADs before editing the corresponding areas. Existing unrelated working files were preserved.

## A. Root Cause Confirmation

| Priority | Confirmation at HEAD | Resolution |
|---|---|---|
| 1 | `executeDirectRoomSwapWorkflow` independently exchanged Reservation room/bed values, omitting canonical tenancy/contract/billing cutover. | Retired at the workflow boundary with HTTP 410; existing endpoint cannot mutate tenancy. |
| 2 | `renewStayWorkflow` immediately marked the old Stay renewed, created an active successor and changed `currentStayId`. The existing contract activation job only switched contracts/rent. | Successor Stay is upcoming. Existing activation job owns the complete atomic cutover. |
| 3 | Structured snapshot precedence ignored the renewal's new monthly rent; a transfer override was cleared during renewal activation. | Effective recurring override is set to the signed term rate; generation resolves the coverage term even before activation. |
| 4 | Settlement recomputation enlarged invoices carrying payments. Execution also refreshed paid invoice metadata/timestamps. | Freeze payment-bearing originals; issue a separate supplemental invoice for increases. |
| 5 | Independent collection reads/unique indexes prevented same-type duplicates but not transfer/extension write skew. Scheduling checked extension conflicts outside its transaction. | Shared transactional write to the same Reservation before conflict checks and writes. |
| 6 | Renewal only checked the same tenant's overlapping Stays; the legacy advisory endpoint checked another reservation at room level. | One interval validator checks actual bed/room/capacity allocations and canonical holds, reused by approval and advisory validation. |
| 7 | Offer response handler fetched the actor but did not verify ownership or staff branch/permissions. | Tenant ownership or existing admin role/branch/persisted permission rules required server-side. |
| 8 | Neither request model exposed independent acknowledgement. | Add actor/time metadata only; no competing request status/lifecycle. |

Additional confirmations: accepted-offer claim and renewal were separate commits; renewal generation was a one-shot post-commit attempt; execution claims could survive a crash; settlement creation/linking were separate writes; notifications could be absent after a committed action. Transfer Mobile already refreshed on focus/resume/events, but only reconciled 409 mutation errors. Extension Mobile refreshed only on focus. The existing shared mobile contract hook already handles canonical contract events, focus, foreground and revalidation, so it was reused.

## B. Changes Made

Backend/Web files:

| File | Change |
|---|---|
| `server/controllers/reservations/tenancyActionsController.js` | Renewal offer ownership, branch and persisted-permission enforcement; acceptance delegates to the transactional canonical workflow; retired swap remains blocked. |
| `server/controllers/reservations/tenancyActionsController.renewalConcurrency.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/controllers/reservations/tenancyActionsController.renewalOfferPricing.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/models/Bill.js` | Supplement parent link and sparse unique settlement identity; original payment records retained. |
| `server/models/Reservation.js` | Shared transactional tenancy mutation revision. |
| `server/models/Stay.js` | Adds upcoming for prepared, not-yet-effective renewal terms. |
| `server/models/StayExtensionRequest.js` | Acknowledgement actor/time metadata; existing decision statuses retained. |
| `server/models/TenantTransferRequest.js` | Acknowledgement actor/time metadata; existing lifecycle statuses retained. |
| `server/routes/stayExtensionRoutes.js` | Existing guarded review endpoint accepts acknowledgement; scoped pending count/filter and fulfillment serialization. |
| `server/routes/tenantTransferRequestRoutes.js` | Permission-guarded acknowledgement endpoint within existing tenant routes. |
| `server/services/autoContractOrchestratorService.js` | Completed renewal preparation is reused instead of regenerated on retry. |
| `server/services/billing/rentGenerator.js` | Prices signed renewal terms by invoice coverage date; blocks a future term without finality. |
| `server/services/billing/rentGenerator.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/services/billing/transferSettlementInvoices.js` | Read-only invoice aggregation and separate supplemental transfer invoices through the existing Bill/payment model. |
| `server/services/contractRenewalActivationService.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/services/contractRenewalActivationService.js` | One atomic effective-date cutover for Stay, contracts, current pointer, rate, BedHistory and unpaid term invoices; missing Stay blocks activation. |
| `server/services/contractService.js` | Serializes canonical successor creation in a transaction to prevent concurrent preparation duplicates. |
| `server/services/renewalOccupancyService.js` | Shared interval validation for authoritative beds, private rooms, capacity, future Stays, reservations and scheduled/temporary holds. |
| `server/services/requestAcknowledgementService.js` | Idempotent acknowledgement with original actor/time and canonical deduplicated delivery. |
| `server/services/scheduledRoomTransfer.delayedCompletion.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/services/scheduledRoomTransfer.schedule.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/services/scheduledRoomTransferService.js` | Transactional exclusion at scheduling; transactionally creates/links settlement; supplemental upward adjustments; preserves paid originals and Manila scheduling behavior. |
| `server/services/scheduledRoomTransferView.js` | Aggregates primary and supplemental balances for readiness and exposes the payable invoice. |
| `server/services/stayExtensionRequestService.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/services/stayExtensionRequestService.js` | Shared exclusion, acknowledgement, preserved current context, derived fulfillment and replayable decision notifications. |
| `server/services/tenancyExclusionService.js` | Single reservation write conflict boundary shared by transfer and renewal transactions. |
| `server/services/tenancyLifecycleReconciliationService.js` | Existing-job retry adapter for missing successor preparation, exact legacy early-switch repair, expired execution claims and missing lifecycle notifications. |
| `server/services/tenantTransferRequestService.js` | Transactional submissions/scheduling claims, acknowledgement serialization and deduplicated action-required events. |
| `server/services/tenantTransferRequestService.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/utils/rentGenerator.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `server/utils/scheduler.js` | Reuses Job 18 for effective-date activation every minute and Job 19 for recovery every five minutes. |
| `server/utils/tenantActionService.js` | Retires direct swaps; prepares upcoming renewals; atomically accepts offers with successor creation; validates extended occupancy; protects paid invoices in canonical transfer cutover. |
| `server/utils/tenantActionService.renewal.integration.test.js` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |
| `web/src/features/admin/components/StayExtensionRequests.jsx` | Pending count/filter, review metadata, fulfillment, acknowledgement, refresh in the existing workspace. |
| `web/src/features/admin/components/TenantDetailModal.jsx` | Acknowledgement action refreshes existing tenant queries/details; transfer wizard preserved. |
| `web/src/features/admin/components/tenants/details/TenantOverviewTab.jsx` | Passes acknowledgement action to the existing transfer card. |
| `web/src/features/admin/components/tenants/details/TenantTransferRequestCard.jsx` | Acknowledge/Reviewed display and Proceed to Transfer; Manila date formatting. |
| `web/src/features/admin/components/tenants/details/tenantTransferRequestCard.test.mjs` | Extends regression coverage or updates fixtures/assertions to the corrected canonical behavior. |

Mobile files (relative to `D:\LilyCrest\LilyCrest-Clean`):

| File | Change |
|---|---|
| `frontend/app/extend-stay.jsx` | Focus/resume/event refresh, stale-response protection, lost-response recovery, Reviewed and approval/fulfillment distinction. |
| `frontend/app/room-transfer.jsx` | Immediate submit guard, stale-response protection and reconciliation after all mutation failures. |
| `frontend/src/utils/roomTransferPresentation.js` | Reviewed label and strict Manila preferred-date validation. |
| `frontend/src/tests/extendStayScreen.test.jsx` | Behavior tests for admin-event/resume refresh, acknowledgement, approved future state, lost responses and duplicate taps. |
| `frontend/src/tests/roomTransferScreenContract.test.js` | Updates recovery regression to include all network failures. |

This report records the implementation and verification; no main module, alternate transfer engine or alternate renewal engine was introduced.

## C. Canonical Transfer Flow

Tenant submission ? transactional exclusion ? `TenantTransferRequest.pending` ? optional acknowledgement ? existing Tenants transfer wizard ? transactional scheduling claim ? existing `ScheduledRoomTransfer` and destination hold ? request scheduled ? settlement/payment readiness ? Admin Complete Transfer ? `transferStayWorkflow()` ? atomic Reservation/Stay/Room/Bed/occupancy/BedHistory/contract/utility/history cutover ? request completed ? canonical notification and mobile refresh.

Direct swap returns 410. Completion remains Admin-driven on or after the scheduled Manila calendar date. Scheduling permits today and future dates; stored time is guidance. No office-hour restriction or automatic physical transfer was introduced.

## D. Canonical Extend Stay Flow

Tenant submission ? transactional exclusion ? `StayExtensionRequest.pending` ? optional acknowledgement ? guarded Approve/Reject. Rejection preserves tenancy and returns the admin reason. Approval revalidates current tenancy/pricing and the whole extended interval in the canonical renewal transaction, records the approved decision and one upcoming successor Stay, and releases the pending request pointer.

Existing contract preparation/signing/publication runs against that successor. Current Stay, legal contract and recurring rate remain unchanged. Job 19 retries preparation; fulfillment is derived as awaiting_contract/preparing/ready-for-effective-date/action_required/effective using `awaiting_effective_date` for a finalized future term. Approval is never represented as signing or activation.

Job 18 calls `activateDueRenewalContracts()` every minute. At the Manila effective date, legal finality plus valid Stay context permit one transaction to activate the successor, close the predecessor, switch the current pointer/contract/rate, update the active BedHistory link and reprice unpaid monthly invoices in the new term. Missing Stay or missing finality blocks activation. The ordinary mobile contract selector then resolves the new current contract.

## E. DB / State Transition Matrix

| Operation | Before | After | Tenancy effect |
|---|---|---|---|
| Transfer submit | No conflicting operation | One pending transfer request | None; transactional revision only |
| Extension submit | No conflicting operation | One pending extension request and pending pointer | None; transactional revision only |
| Acknowledge either | Any existing request; no prior acknowledgement | Original acknowledgement actor/time recorded once | No Stay, room, contract, billing or decision mutation |
| Transfer decline / extension reject | Pending | declined / rejected with reason and reviewer | No tenancy mutation; extension pointer released |
| Transfer schedule | Pending/claimed intent | scheduling ? scheduled; one schedule and destination hold | Destination reserved; current source tenancy remains |
| Transfer upward paid adjustment | Immutable payment-bearing primary | Primary unchanged plus separately payable supplement | No cutover until aggregate settlement is paid |
| Transfer downward paid adjustment | Payment-bearing invoice | Existing manual-review/refund path | No automatic refund or invoice rewrite |
| Transfer complete | Due schedule, valid hold and paid settlement | Schedule executed; request completed | Canonical atomic physical/legal/financial cutover |
| Extension approve | Pending; current effective Stay | Approved request + upcoming successor; original remains current | Future terms prepared, not effective |
| Contract prepare/publish | Upcoming Stay, noncurrent successor | Prepared/signed/published successor | No early current-pointer or rate switch |
| Renewal activation | Due published final successor + valid Stay | Successor active/current; predecessor renewed/replaced | Current Stay/contract/rate switch together |
| Duplicate acceptance/approval | Existing successor or reviewed request | Same successor or conflict/no-op | No duplicate term |
| Crash recovery | Missing document/event or expired execution claim | Canonical retry/replay or claim released | No automatic physical transfer |

The exclusion revision is a transaction serialization device, not an extra business lifecycle. Same-type unique request indexes remain. Historical effective renewals do not block later transfers.

## F. Billing & Contract Validation

- Original structured `pricingSnapshot` is immutable. Activation writes the effective approved rate to both monthlyRent and recurringRentRate.
- New monthly bills choose the signed renewal covering their **billing coverage start**, including bills generated before activation. Upcoming terms without finality are blocked rather than billed at an obsolete rate.
- At activation, unpaid monthly invoices in the new term can be corrected; invoices carrying payments are preserved. Already-paid rent history is not retroactively rewritten.
- Paid/partially paid transfer settlement invoices keep original charges, total, payment history, timestamps and references. A linked `transfer_settlement` supplement carries positive component differences, uses normal payment services and participates in aggregate readiness. Downward/component redistribution remains manual review.
- Settlement invoice creation and schedule linking share a transaction, with a sparse unique settlement key. A missing link is restored by that key without creating another invoice (integration-tested). Execution rechecks the aggregate inside the canonical transaction; a fully paid original is not saved merely to append execution metadata.
- Successor contracts are created through the existing canonical factory, serialized against concurrent generation. Current contract selection remains authoritative; preparation success does not establish legal effectivity.

## G. Mobile ? Web Synchronization

Both APIs expose the same persisted requests used by Tenants. Web acknowledges/reviews within the existing workspace, refreshes detail/query state, and offers extension pending count/filtering. Mobile refreshes on focus, AppState resume and canonical events, ignores stale responses and reconciles after mutation errors. Submission guards plus server uniqueness/exclusion prevent duplicates. A lost extension response is behavior-tested against a subsequent successful server read. Rejection reasons and Reviewed metadata are displayed; extension decision and fulfillment appear separately.

Existing notification methods retain dedupe keys for acknowledgement, declined/rejected, scheduled, action/payment required, completed, approved, preparation/action-required, ready and effective events. Job 19 replays missing persisted lifecycle notifications with the same keys, and retries missing/incomplete successor preparation. Job 18 remains the single activation engine. Expired execution tokens are released after 15 minutes; token fencing prevents an expired worker from committing a physical transfer. Exact legacy future-active/predecessor-renewed records can be repaired when their legal predecessor/current-pointer evidence agrees; ambiguous records are not guessed.

Recovery limitations: a legacy orphan invoice lacking both a schedule link and the new identity key requires evidence-based manual linkage; it is not heuristically attached. Previously accepted offers with no successor can resume through the same canonical response/workflow transaction. External storage and push providers were mocked in integration tests; no real tenant notifications or production data were used for QA.

## H. Test Results

Latest result per suite, without double-counting reruns:

| Area | Passed | Failed | Skipped | Scope |
|---|---:|---:|---:|---|
| Backend | 315 | 0 | 0 | 30 relevant suites; real Mongo replica-set transactions where required |
| Web | 1180 | 0 | 0 | Full existing Node test suite |
| Mobile | 82 | 0 | 0 | 6 request/contract/event suites |

Admin production build passed. Final `git diff --check` passed. The transfer card regression also passed after the final Manila-formatting edit. Earlier development failures were corrected (obsolete early-activation assertions, missing canonical bed fixtures, mock interfaces and a missing-Stay activation fixture); none remain in the latest listed suite results.

Evidence: `.codex-tmp/backend-results-final.json`, `.codex-tmp/backend-verification.json`, `.codex-tmp/backend-settlement-final.json`, `.codex-tmp/mobile-results-final.json`, `.codex-tmp/mobile-targeted-final.json`, `.codex-tmp/web-regressions.log`, `.codex-tmp/web-build.log`.

| Required coverage | Verification |
|---|---|
| 1?2 Mobile submission ? one Web request | Persisted shared requests, concurrent submissions and admin transfer serialization integration tests |
| 3 Acknowledgement actor/time, no tenancy mutation | Both request types, repeated acknowledgement, unchanged Reservation/Stay count and one event |
| 4 Rejection reason reaches mobile | Backend response + mobile admin-event behavior test |
| 5?7 Duplicate same-type and simultaneous cross-type requests | Replica-set concurrent transaction tests |
| 8 Scheduling while extension pending | Scheduling claim blocked; schedule transaction uses the same exclusion |
| 9 Approval while scheduled/executing transfer | Both token-free and executing schedule fixtures blocked |
| 10 Direct swap cannot bypass | Workflow returns 410 with unchanged Reservation |
| 11 Double approval | One successor and one approval notification |
| 12 Foreign tenant offer | Accept and decline both return 403; offer remains pending |
| 13 Future occupancy conflict | Same bed, future reservation and scheduled hold rejected; different shared bed allowed |
| 14?16 Future Stay/current contract/atomic activation | Original remains current; Manila boundary switches Stay/contract/rate together |
| 17 Structured effective/future renewal rate | Coverage-based bill generation and structured activation tests |
| 18?19 Invoice immutability/supplement | Exact paid invoice equality after execution; upward adjustment creates separate invoice |
| 20 Historical renewal | Later canonical scheduling succeeds |
| 21 Failed generation | Upcoming Stay survives; existing Job 19 retry invokes canonical preparation |
| 22 Notification dedupe | Repeated review/replay yields one persisted lifecycle event |
| 23 Mobile admin-action refresh | Event and AppState behavior tests |
| 24 Manila boundaries | Just-before/at-midnight renewal activation and transfer date regressions |

## I. Remaining Business Decisions

No business-policy changes were made to obtain passing tests.

- **Same-day:** preserve today/future scheduling and completion on/after that Manila date. Office-hour restrictions, future-only scheduling and automatic execution remain unapproved alternatives.
- **Outstanding charges:** transfer-specific settlement remains the completion gate; unrelated historical balances are not silently merged. Any new extension arrears gate needs an explicit policy.
- **Deposits:** retain existing evidence/ledger funding, additional-deposit collection and manual downward/refund handling. Renewal does not invent a second deposit workflow.
- **Renewal notice:** existing 1?24 whole-month request range and current lease validity checks remain. No new minimum notice or advance approval window was invented.
- **Legacy data:** malformed/missing contract/Stay relationships and unidentifiable historical orphan invoices require manual evidence review. New canonical approvals cannot activate without a successor Stay.

Operational requirements for eventual release: Mongo transactions must be available; the existing scheduler must run; provision the new sparse Bill identity index using the project's normal model/index deployment process. There were no production writes, merges or deployments in this task.

## J. Final Verdict

| Question | Verdict |
|---|---|
| Is Transfer safe end-to-end? | **Yes for the implemented canonical flow and tested integrity boundaries.** Physical completion remains Admin-controlled. |
| Is Extend Stay safe end-to-end? | **Yes for valid canonical tenancy records.** Missing Stay/finality blocks activation; external signing/storage remains a required real workflow step. |
| Can Web acknowledge both mobile request types? | **Yes.** Actor/time metadata; no decision or tenancy mutation. |
| Are all transfer mutation paths canonical? | **Yes for exposed transfer operations audited here.** Direct swap is retired; the wizard/completion uses the existing engine. |
| Does a future extension preserve the existing current Stay? | **Yes.** Successor is upcoming until canonical activation. |
| Is renewal billing using the effective rate? | **Yes.** Signed coverage term before activation; effective recurring override after activation; paid history preserved. |
| Are paid invoices immutable? | **Yes in transfer settlement recomputation/cutover.** Increases are supplemental; decreases remain manual. |
| Are concurrent transfer/extension requests prevented? | **Yes.** Shared server-side transactional serialization and lifecycle checks. |
| Does Mobile reflect the latest server lifecycle? | **Yes through focus/resume/events and recovery reads.** Offline clients update when connectivity/refresh resumes; server state is authoritative. |

**No merge or deployment was performed.** The listed integrity/security fixes pass their relevant suites; production approval remains a separate release action.
