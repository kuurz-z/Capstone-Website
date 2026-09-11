**Monthly utility billing — targeted four-blocker fix pass**

Branch: `feat/versioned-water-meter-billing`.
Pre-commit validation HEAD: `f3297573fff1606f7611a70b896d53ce6e28487e`.
This report records the completed fix pass and its pre-commit validation. The status snapshot below was recorded before committing; the commit containing this report packages the verified fixes. No merge, deployment or production database access was performed. The earlier combined audit is retained separately as the record of the reproduced defects.

**Implementation and acceptance evidence**

| Blocker | Fix | Acceptance coverage |
|---|---|---|
| B1: stale closing reading | Clear transient closing input when the end actually changes, including end changes caused by duration or start edits. Existing keyed/cancelled Water preview handling invalidates derived results. | Both mounted forms clear the reading and amount; Water tables disappear until a fresh preview; an unchanged end preserves the entry; re-entry produces a usable preview. Persisted observations are untouched. |
| B2: Electricity chronology | Validate nearest valid previous/next observations and agreement at the same timestamp for opening, closing, reading edits and occupancy/transfer boundary writes. Ignore archived, voided, corrected and superseded observations. | Valid 100–120 interpolation passes; 99 and 130 fail. Create and update/date-only edit paths are exercised. Replacement/rollover tests separate the outgoing final from the incoming opening, including multiple observations at the replacement timestamp. Water chronology code is unchanged. |
| B3: direct draft breakdown | Apply `getVisibleBillCharges` in the shared tenant-breakdown builder, using the same canonical policy as list/detail projections. | Real mobile HTTP requests hide draft Electricity/Water breakdowns, then return the correct amount after Send. Normal lists and Bill detail stay filtered; foreign ownership returns 404. Legacy Water is guarded; measured Water's sent-allocation projection remains intact. |
| B4: paid rent invoice mutation | Extend Water's stable supplemental-invoice identity pattern to Electricity. Paid invoices get a separate draft; Electricity publication re-reads inside a transaction and creates a supplement if payment completed after generation. | PHP 10,000 rent with 0/4,000/10,000 paid, plus PHP 1,000 Electricity: unpaid/partial invoices preserve paidAmount and ledger; fully paid invoice remains byte-for-byte unchanged. Draft liability is hidden until Send. Duplicate upsert, already-sent rejection, publication retry, old payment/receipt metadata and Water preservation are covered. |

Electricity supplements use `electricitySupplementKey` with a unique sparse index and link to the original paid invoice. They leave `billingCycleStart` null, following the supplemental-invoice pattern rather than claiming the original rent-cycle key. The common identity helper retains Water's existing key format. Measured Water publication/allocation code and both calculation engines are unchanged.

Electricity transactional opening/closing/occupancy writes serialize through a room observation revision. At a replacement timestamp, chronology resolves the replacement event even when an outgoing period-end observation was created later. The old meter's final value is compared to earlier observations; the new meter's reading is compared to later observations.

The older exact-observation lifecycle test used 999 at 08:00 followed by an ordinary opening of 100 at noon. The fixture now uses 90 at 08:00, preserving its purpose (earlier same-day consumption must not enter the recovered interval) while satisfying the required same-meter chronology. No production history was edited.

**Validation**

- Full frontend: **1,016 passed, 0 failed**, 8 suites.
- Production frontend build: **PASS**, Vite completed in 2m 18s.
- Final combined server regression: **495 passed, 0 failed**, all **45 suites passed**, in 144.969 seconds. This was one combined final run against the finished application changes and test fixtures.
- `git diff --check`: PASS; normal LF/CRLF conversion notices only.

Tests use disposable local MongoDB instances and mocked outbound email/push. The new supplement indexes are explicitly created and exercised in the local acceptance database. An attempted all-model index synchronization encountered the existing rent index declaration combining sparse and partial options; that unrelated schema declaration was left unchanged, and tests install only the relevant supplement indexes. No production index operation was performed.

Validation logs are in the Windows temporary directory: `blocker-fix-web.log`, `blocker-fix-build.log`, and `blocker-fix-server-final.log`. Earlier focused logs document the reproduced failures, fixture corrections, and acceptance checks. The final server selection covers monthly schedules/lifecycle, Electricity/Water engines, room boundaries/transfers, history safety, visibility/mobile endpoints, payment ledgers/checkout, notifications, permission/branch authorization, PDF generation/cache, and historical gaps. This is a relevant server selection, not the entire server repository suite.

**Files included in the blocker-fix commit**

| File | Purpose |
|---|---|
| `web/src/features/admin/components/billing/NewBillingPeriodModal.jsx` | Reset closing input on actual cutoff changes |
| `web/src/features/admin/components/billing/monthlyUtilityWorkflow.mount.test.mjs` | UI workflow and B1 acceptance |
| `web/src/features/admin/components/billing/utility/monthlyUtilitySchedule.test.mjs` | Retained prior audit's month/year/timezone regressions |
| `server/controllers/billing/_helpers.js` | Canonical tenant-breakdown visibility |
| `server/controllers/utilityBillingController.js` | Electricity closing/edit/boundary checks |
| `server/services/billing/electricityChronology.js` | Valid observation and physical-meter neighbor validation |
| `server/services/billing/electricityChronology.test.js` | Interpolation, same-timestamp and reset/rollover acceptance |
| `server/services/billing/roomUtilityBoundaryService.js` | Transactional Electricity occupancy/transfer validation |
| `server/services/billing/utilityPeriodLifecycleService.js` | Validate new Electricity opening |
| `server/models/Room.js` | Electricity observation transaction revision |
| `server/models/Bill.js` | Stable Electricity supplement identity/index |
| `server/utils/utilityBillFlow.js` | Paid-invoice-safe draft upsert and publication |
| `server/controllers/monthlyUtilityWorkflow.integration.test.js` | Real persistence/HTTP acceptance for B2–B4 and shared workflow regressions |
| `server/controllers/utilityBillingController.lifecycle.integration.test.js` | Chronological recovered-interval fixture |
| This report | Fix scope, validation and file inventory |

Existing unrelated untracked files and the earlier audit report remain untouched. No commit was added during the original fix pass; commit metadata for this package is recorded in Git history.

**Pre-commit validation status snapshot**

A. Current HEAD: `f3297573fff1606f7611a70b896d53ce6e28487e` (fixes are uncommitted).
B. Blocker 1: PASS.
C. Blocker 2: PASS.
D. Blocker 3: PASS.
E. Blocker 4: PASS.
F. Electricity engine: PASS; source unchanged.
G. Water meter-v1: PASS; engine and chronology source unchanged.
H. Paid-history preservation: PASS.
I. Mobile draft visibility: PASS.
J. Frontend tests: 1,016/1,016 passed.
K. Server tests: 495/495 passed across 45 selected suites.
L. Production build: PASS.
M. Files changed: 9 application files, 5 test files (including retained prior-audit schedule coverage), and this report; inventory above.
N. Commits added: 0.
O. Remaining merge blockers within the four-blocker scope: none. The verdict applies to the reviewed working-tree changes, which still need to be committed before merging.

CODE MERGE VERDICT: READY TO MERGE
