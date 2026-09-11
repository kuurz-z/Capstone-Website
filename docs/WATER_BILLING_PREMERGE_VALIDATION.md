# PR #172: blocker-fix validation

2026-09-11. The reproduced blockers **F1, F2, F3, F4, F5, F6 and F8 are resolved** and their acceptance regressions pass. Code/test head: `edd373c1`; documentation commits follow. The original audit of `bf2bccfa` is retained below as historical evidence, not the current disposition.

PR: [#172](https://github.com/kuurz-z/Capstone-Website/pull/172), branch `feat/versioned-water-meter-billing`. No merge, production deployment, production migration or native submission was performed. The PR remains draft; its [checks](https://github.com/kuurz-z/Capstone-Website/pull/172/checks) are authoritative for the eventual pushed head.

## Changes and acceptance evidence

| Finding | Status | Verified correction |
| --- | --- | --- |
| F1: mutable opening / inconsistent rate | PASS | Measured PATCH cannot enter legacy water assignments. Opening value, physical timestamp and version remain unchanged; changes require supersession. An intentional open-period rate edit updates the authoritative snapshot and actor/time/previous-rate audit atomically, guarded against concurrent close/edit. Rate-only PATCH preserves100 and preview/generation use54.20 consistently. |
| F2: lost archived-period boundary | PASS | `calculateCanonicalWaterPeriod` supplies room/date observations, BedHistory participants, segmentation and snapshotted pricing to preview and generation. Archived billing provenance does not hide valid evidence. Archive/regenerate100→106→118 returns A12/B6 with identical segments and fingerprint. |
| F3: contradictory backdated reading | PASS | Shared chronology validation checks previous, following and same-instant observations under the room transaction guard.99/120 rejected between100/110;100,105,110 accepted. Corrected, superseded, archived and voided observations are excluded; electricity evidence is separate. Replacement/rollover uses old-final/new-opening semantics and evidence, with existing electricity behavior retained. |
| F4: transfer water baseline context | PASS | Source and destination DTOs independently resolve valid WATER observations. Existing Complete Transfer displays values, dates, m³ units and separate autofill helpers; either lower value is blocked before submission and validated by the server. Quad remains excluded; scheduling stores no readings. |
| F5: allocation projection identity | PASS | Stored allocation ID, period, room, reservation, cycle, usage, amount, price and version are retained. The specific allocation drives tenant detail rows.4m³/200 plus6m³/300 remains two sections and one500 bill total in web/mobile projections, including a missing period document. Same-tenant/different-reservation usage is correct. |
| F6: branch authorization | PASS | Uses the existing resolved admin/owner context. Result access is checked before tenant lookup; close/revise/edit/send also authorize before returning lifecycle/financial detail. Both water/electricity same-branch access and owner access pass; opposite-branch IDs are forbidden. Detail/history/preview/AI review/export regressions cover disclosure paths. Existing route permission middleware remains enforced. |
| F8: stale move-in input | PASS | Unsaved water/electricity/date state resets on cancel, reopen, modal close, same-mounted reservation switch and successful move-in. Query-backed server baselines remain intact. |

`calculationInputs` and SHA-256 `calculationFingerprint` are additive UtilityPeriod snapshot fields. The fingerprint includes opening observation identity, canonical intermediate identities, opening/closing values and timestamps, rate, segments and participant usage/amounts. Duplicate records describing one physical instant use the oldest valid identity. A preview's proposed closing has no persisted ID; its value/time are fingerprinted, while the committed closing ID remains in `meterEvents`. Admin result, tenant and mobile projections carry the saved fingerprint; PDFs consume the same stored projection and do not recalculate.

## Validation

- Focused final backend: **2 suites /33 tests PASS**; includes24 new blocker cases plus9 existing water integrations. Separate parity/mobile run: **3 suites /71 tests PASS**. These groups overlap.
- Full server suite: **352 suites /3,420 tests PASS** (689.894s). The run started before the final additional authorization case; the final33-test focused run covers that case and the last controller changes. Counts overlap and must not be added. Isolated MongoDB replica sets; no production data.
- Full frontend suite: **1,002 tests PASS**, including7 new real-component mount regressions.
- Production web build: **PASS** (3m45s).
- Browser fixture: desktop1440x1000 and narrow390x1000 PASS, zero page errors. Both lower transfer values rejected without API submission; reset scenarios passed. Real components with API stubs, not authenticated end-to-end or native-device validation.
- Required hosted CI must pass on the pushed head. The PR check panel and final handoff record that result; a passing older head does not waive this requirement.

Commands in their package directories:

```powershell
# server
npm.cmd test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB --forceExit
# web
npm.cmd test
npm.cmd run build
```

Browser evidence: [transfer desktop](water-billing-evidence/blocker-fixes/fixed-transfer-1440.png), [transfer narrow](water-billing-evidence/blocker-fixes/fixed-transfer-390.png), [move-in reset desktop](water-billing-evidence/blocker-fixes/fixed-movein-cancel-reset-1440.png), [move-in reset narrow](water-billing-evidence/blocker-fixes/fixed-movein-cancel-reset-390.png), [runtime record](water-billing-evidence/blocker-fixes/fixed-lifecycle-runtime.json).

## Updated merge-readiness matrix

| Area | Status | Evidence / remaining requirement | Merge blocker? |
| --- | --- | --- | --- |
| Historical safety and versioning | PASS | Legacy semantics, immutable sent/paid records, correction and deletion safeguards retained | No |
| Canonical calculation / preview | PASS | Shared resolver, identical fingerprint and segments across normal close and archive/regenerate | No |
| Rate configuration | PASS | Audited open-period price edit; global changes do not rewrite snapshots | No |
| Private | PASS | Measured consumption only | No |
| Double | PASS |100→106→118 gives A12/B6 | No |
| Quad | PASS | Backend policy and UI exclusion | No |
| Move-in | PASS | Atomic meter write retained; all transient reset paths tested | No |
| Transfer / scheduled transfer | PASS | Independent water baselines; fresh completion readings; scheduling unchanged | No |
| Move-out | PASS | Physical reading remains separate from monetary liability | No |
| Meter chronology / recovery | PASS | Neighbor validation, supersession and archived provenance retained | No |
| Bill allocation storage / projection | PASS | Individual identities, usage and amounts; aggregate summed once | No |
| Payments | PASS | Existing bill-level math, visibility and paid-history protection retained | No live-payment claim |
| Admin UI / Tenant Web | PASS | Existing tables, F4/F8 mount and browser regressions | No |
| Mobile API | PASS | Canonical allocation identity and totals; legacy/multi-allocation compatibility | No |
| Android | BLOCKED | Client source and installed-device validation unavailable | Mobile release only |
| iOS | BLOCKED | Client source and installed-device validation unavailable | Mobile release only |
| Notifications | PASS | Existing identity/dedupe/state tests; no native routing claim | No |
| PDF | PARTIAL | Canonical tables retained; F7 long-name header overlap remains | No, documented follow-up |
| Reports | PASS | Existing visible-charge totals and exports retained | Raw overdue DTO follow-up |
| Cutover validation | PASS | Read-only room READY/BLOCKED service; missing/contradictory evidence blocks | No code blocker |
| Production database/indexes | NOT VERIFIED | Operator must verify transaction/index/rate prerequisites before enablement | Deployment prerequisite |
| Security | PASS | Bidirectional branch denial and existing owner scope; detail/send/review/export checks | No |
| Tests / build | PASS |352 full server suites /3,420 tests, final33 focused tests,1,002 frontend tests, production build | Hosted checks must also pass on pushed head |
| Documentation | PASS | This report, implementation report and cutover procedure updated after acceptance verification | No |

## Cutover and remaining limits

Use [WATER_METER_CUTOVER.md](WATER_METER_CUTOVER.md). New read-only command: `node scripts/validate_water_cutover.mjs <roomId> <verifiedReadingId>`. It checks applicable policy, a persisted actor/time baseline and chronological evidence without writes or index creation. Archive/regenerate retains the observation chain. A reset after the selected baseline requires a new baseline rather than claiming an uninterrupted measured cycle.

Before deployment, separately review the intended PHP/m³ tariff, replica-set transactions, lifecycle indexes and `unique_water_supplement`; none were verified in production. Unknown earlier usage must remain unknown. Android/iOS need their client repository, native rendering and installed notification routing checks.

Non-blocking follow-ups remain deliberately unchanged: **F7 long-name PDF header overlap**, **unused legacy utility PDF helper**, and **raw water component in overdue DTO**. Hosted server CI currently excludes integration tests; the new adversarial integration cases are covered by the full isolated local suite.

## Commits added

- `a0576907` canonical boundaries, rates, chronology, access guards and read-only readiness.
- `a6096d45` stored allocation projection identity.
- `0ec04a83` independent transfer water baseline context.
- `1cfc132b` move-in transient state lifecycle.
- `edd373c1`24 backend and7 frontend blocker regressions.
- Documentation/evidence commit follows; use the PR commit list for the final head.

<details>
<summary>Original audit at bf2bccfa — superseded by the verified fixes above</summary>

# PR #172: final pre-merge validation

Audited on 2026-09-11 against `bf2bccfa342467751486c43eb8d094ab54d22957`. The PR is **not ready to merge** despite green CI. Four high-severity defects and three additional implementation gaps remain. A separate, pre-existing PDF header defect is a non-blocking follow-up for this PR.

This was an audit of the requested head. Application code, PR state and production data were not changed. Findings were documented before isolated reproductions were written. Temporary test/React entry files were removed after use. No fixes, commits, pushes, deployments, production migrations or mobile submissions were performed during this audit.

## 1. Scope and provenance

| Item | Verified result |
| --- | --- |
| PR | [#172](https://github.com/kuurz-z/Capstone-Website/pull/172), open, draft, unmerged |
| Local and remote head | `bf2bccfa342467751486c43eb8d094ab54d22957` |
| Branch | `feat/versioned-water-meter-billing` |
| Base | `main`, `625645f02756d91a3f37e8be614d0205c741bfc0` |
| Scope | 89 changed files, 12 commits; water billing, occupancy integration, projections, statements, tests and documentation |
| Auto-merge | Disabled; no merge labels |
| Working tree | Tracked application files clean; `git diff --check` passes |
| Existing untracked files | `.water-visual-qa/`, `output/`, and the three user audit scripts listed below remain outside the PR |
| New local audit output | This report plus `.water-visual-qa/premerge/` evidence and ignored test logs; not committed |
| Migration files | No new executable migration script. Bill schema adds one index; the existing lifecycle index script is reused |
| Documentation | Implementation report, cutover guide, changed-file list, evidence README, six PNG illustrations and a sample PDF |

The preserved untracked scripts are `server/scripts/audit_room_transfer_conflicts.mjs`, `server/scripts/audit_utility_period_lifecycle.mjs`, and `server/scripts/list_tenants_applicants_contract_conflicts.mjs`. They are not part of this PR.

Commits, in order: `a499c592`, `75fea5d0`, `2554c177`, `9d0f49a2`, `37fe5d36`, `f95a81b0`, `a77792fd`, `f31206bd`, `a634c74f`, `993c5a1b`, `a5da99cf`, `bf2bccfa`. The main integration commit contributes no unrelated changes to the PR diff against its current base. One unrelated test-only change isolates the maintenance provider fallback from live AI environment configuration; it changes no maintenance production behavior. Overall scope is appropriate, with that exception explicitly disclosed.

## 2. Findings, root causes and correction targets

### F1 — HIGH: open measured periods still enter the legacy edit path

**Introduced by exposing new measured periods to the existing PATCH implementation. Merge blocker.**

`updateUtilityPeriod` rejects measured snapshots only inside `period.status !== "open"`. An authorized PATCH of an open measured period therefore reaches the legacy water assignments: a supplied `startReading` becomes zero, supplied water `endReading` becomes zero, and a supplied start date is normalized to midnight. Editing `ratePerUnit` also leaves `pricingSnapshot.ratePerUnit` unchanged.

Reproduced: opening observation = 100; PATCH `{startReading:100}` returns 200 and saves period opening = 0 while the immutable observation remains 100. Preview still succeeds because it reconstructs the opening from observations. Closing fails with “Period readings do not match the physical observations.” Separately, PATCH rate 54.20 persists that display field while snapshot/preview remain 50.

Root/affected files: [utilityBillingController.js](../server/controllers/utilityBillingController.js), lines1280–1325; the admin edit caller/display is also affected. Protect measured periods before entering legacy assignments. Physical changes must use audited observation correction, and active-period price/date handling must preserve the selected snapshot contract. Add open-period PATCH regressions, not only closed-snapshot tests.

### F2 — HIGH: preview accepts observations that generation excludes

**Introduced by the combination of retained historical observations and period-filtered closing. Merge blocker.**

Preview reads valid room observations across the date interval. `closePeriodAndGenerateDrafts` additionally requires each observation to belong to the new period or have a null period reference. Archiving retains old period references. Consequently the documented archive-and-regenerate workflow can show a correct preview and fail when generating the same cycle.

Reproduced: verified100 opening and106 second-arrival observation are linked to an unpublished period. Archive it; standalone preview through118 produces A12m³/B6m³. Historical generation then fails with “An occupancy change is missing its measured water boundary”; the106 observation is excluded because it still points to the archived period. The failed transaction correctly creates no Bills.

Root/affected files: [utilityBillingController.js](../server/controllers/utilityBillingController.js), lines484–498,1106–1156,1234–1255,2701–2708; [utilityPeriodLifecycleService.js](../server/services/billing/utilityPeriodLifecycleService.js), lines270–332. Preview and closing need the same validated observation resolver. Preserve observation provenance while allowing valid boundaries to support regeneration. Also cover observations recorded after a closing date but before the administrator closes the earlier cycle.

### F3 — HIGH: backdated closing can introduce decreasing meter history

**New water closing path lacks the two-sided continuity check used by occupancy observations. Merge blocker.**

Closing validates only observations at or before the requested closing date. It does not validate against an already recorded later observation in that room.

Reproduced:100 on Aug1,106 on Aug10,110 on Aug20. Closing Aug15 at120 succeeds, persists a closed cycle and creates draft charges. The room now has120 on Aug15 followed by110 on Aug20. The numerical engine is correct for its selected interval, but the accepted physical history is contradictory and can overstate the earlier bill or prevent the next close.

Root/affected file: [utilityBillingController.js](../server/controllers/utilityBillingController.js), lines442–476. Reuse the same preceding/following/same-instant validation under the room transaction guard for water opening/closing and historical generation. Retain rollback coverage and add a later-observation regression.

### F4 — MEDIUM: Complete Transfer lacks water baseline parity

**New UI gap against the requested Complete Transfer behavior. Merge blocker for design acceptance.**

The actual dialog renders source/destination water m³ inputs, but no previous/current water value or information helper. Electricity displays previous1250 and destination450 in the same fixture. The water fields use a different input structure and are placed separately before electricity. The introductory instructions mention taking electricity readings only.

Root/affected file: [ScheduledRoomTransferCard.jsx](../web/src/features/admin/components/tenants/details/ScheduledRoomTransferCard.jsx), lines589–640. Supply the latest valid WATER baseline for the correct source/destination room and mirror the existing electricity information/input pattern. Backend numeric/continuity validation already exists; that does not satisfy the requested UI parity.

Evidence: [transfer runtime](../.water-visual-qa/premerge/transfer-runtime.txt), [screenshot](../.water-visual-qa/premerge/transfer-1440.png). No physical transfer was submitted in the browser fixture.

### F5 — MEDIUM: projection selects the wrong reservation's usage

**New canonical projection defect. Merge blocker.**

`projectWaterPeriod` selects the first summary matching tenantId and ignores reservation/allocation identity. A tenant who leaves and returns under a second reservation in the same room period can therefore receive the second allocation amount with the first reservation's usage.

Reproduced: same tenant has reservation1 usage2/amount100 and reservation2 usage5/amount250. Projecting allocation2 returns tenantAmount250 but tenantUsageShare2. Stored allocation money and bill-level sums remain correct; the projected usage is wrong. The ordinary leave/return case within one reservation passes the engine test and is a different case.

Root/affected files: [waterProjection.js](../server/services/billing/waterProjection.js), line5; [billing/_helpers.js](../server/controllers/billing/_helpers.js), lines450–455. Resolve by allocation/reservation identity and use the matching stored usage. Add tenant web/mobile projection coverage for two reservations belonging to the same tenant in one period.

### F6 — HIGH: another branch's utility result is readable

**Pre-existing authorization defect in an endpoint extended by this PR. Merge blocker under the requested security audit.**

`getUtilityResult` resolves the administrator but never checks the period's or room's branch. `filterByBranch` attaches request metadata; it does not filter a subsequent Mongoose query automatically. An authenticated branch admin with `manageBilling` can request a known foreign period ID.

Reproduced at controller level: an administrator reassigned to Guadalupe requests a Gil Puyat water result and receives200, both tenant summaries and tenant email data. The router permission guard and branch middleware were inspected separately; neither supplies the missing record-level condition. This is not anonymous access and no production record was accessed. Comparison with main confirms the missing check predates this PR; the PR now adds detailed water snapshots to this endpoint.

Root/affected files: [utilityBillingController.js](../server/controllers/utilityBillingController.js), lines2102–2235; [branchAccess.js](../server/middleware/branchAccess.js), lines63–88. Enforce room/period branch ownership before reading or returning details, retaining owner access. Add route/controller tests for foreign branch denial.

### F7 — MEDIUM: long tenant name overlaps the PDF header

**Pre-existing shared statement header defect. Non-blocking follow-up for this PR's calculation change; PDF acceptance remains partial.**

A canonical sample with 49 events, 48 measured segments and approximately 85-character tenant names generated six pages. The water tables, wrapped occupant/allocation names and final values render across those pages. On page1, the tenant name overprints Bill Date and its value.

Root/affected file: [pdfGenerator.js](../server/utils/pdfGenerator.js), lines396–408. The left tenant text has no column width, while the right column is drawn at the same vertical position. The identical header write exists on main. Constrain/wrap the identity column and advance the next row by actual height. This audit did not change the header.

Evidence: [page1](../.water-visual-qa/premerge/stress-page-1.png), [page6](../.water-visual-qa/premerge/stress-page-6.png), [six-page PDF](../.water-visual-qa/premerge/water-statement-48-segments-long-names.pdf). Extracted text contains all three table headings, final reading 148 and tenant amount PHP1,268.64. This artificial stress fixture verifies presentation, not a production occupancy history.

### F8 — MEDIUM: Cancel/reopen retains a stale water input

**New move-in state reset gap. Merge blocker for consistent physical-reading capture.**

In the actual component fixture, autofill water106/electricity1250, cancel, then reopen Record Move In. Electricity is blank; water remains106. The new water state is not reset with the existing electricity state. This can silently carry an abandoned physical observation into a later submission. The confirmed browser result is Cancel/reopen of the same record; cross-record behavior is not claimed as a completed runtime test.

Root/affected file: [ReservationDetailsModal.jsx](../web/src/features/admin/components/ReservationDetailsModal.jsx), state at548 and cancel path at2263. Reset water with electricity at the appropriate lifecycle boundaries and test reopening. The normal panel layout and baseline helper otherwise match the requested move-in design.

## 3. Historical safety and versioning (§2–4,15,28)

**Historical issued/paid billing safety: PASS for inspected and tested paths.**

- `waterCalculationVersion` maps missing versions to `water-occupancy-legacy`. Only an explicit `water-meter-v1` selects the new engine in `billingEngine.js:533`. Existing periods are not backfilled or silently converted.
- UtilityPeriod version, unit, price snapshot and stored meter/segment/tenant results distinguish new periods. Closed new snapshots reject ordinary update/revise paths. F1 is the open-period exception.
- Legacy projection returns unknown physical readings, consumption and unit rate, retaining money. A newly rendered legacy statement showed PHP900 and the historical explanation, without invented meter values. Receipt meaning/template version was not changed by the water work.
- Issued/sent/released/paid/partially-paid utility history is protected, including force deletion. Deletion archives unpublished periods and retains observations. Generic Bill deletion also rejects non-draft Bills and payment activity.
- Corrections append replacements and mark originals superseded with actor/time/reason. Original readings are not overwritten. However, the advertised recovery flow remains blocked by F2; global observation continuity is incomplete because of F3.
- Current price configuration supports decimals, non-negative validation, owner authorization and actor/time audit. Snapshot tests specifically preserve 52.86 when current input changes to 54.20. New applicable periods obtain the current configured rate. F1 allows an inconsistent editable period display field, so the complete rate workflow is PARTIAL.

No live historical account, statement or receipt was inspected. These conclusions come from code, isolated fixtures, canonical PDF generation and regression evidence.

## 4. Occupancy and calculation (§5–14,16–19,31)

Private/Double move-in requires water within the same transaction as reservation, Stay, BedHistory, role and occupancy changes. The latest-reading hook explicitly requests `water`; blank/negative/lower values are independently rejected by the API. An injected meter-save failure rolls back the move-in. The inline field order is date, electricity, water, then the single submission; there is no rate input there. F8 is the reset exception.

For Private, measured closing minus opening belongs 100% to its occupant. For Double,100→106→118 produces segments 6 for A and 12 shared by A/B, yielding A12m³/B6m³. The engine covers same-date arrivals, second arrivals,2→1, replacement, vacancy and return intervals. It uses occupancy to identify segment members; no day weighting substitutes for measured use. Vacancy is overhead. All BedHistory intervals are enumerated for the measured version. Capacity is only a validity limit, not the divisor used when fewer people occupy the room.

Quad/Guadalupe exclusions remain intact in eligibility checks, workflow requirements and the new low-level engine. Future scheduling stores no water observation. Complete Transfer uses fresh source/destination values at transaction-local actual cutover, including delayed completion. Required meter failure rolls back the transfer. Its backend behavior passes; F4 concerns the UI.

Move-out records final water and closes the exact observed occupancy interval in the transaction. The raw reading is separate from measured usage, future water liability and existing balance. `finalUtilityCharge` is no longer the raw reading; water liability is pending period close. Paid history is not recalculated to invent a settlement value.

Allocations identify period/room/reservation/tenant and accumulate without overwriting another period. Stored allocation amounts sum exactly once into `charges.water`; visibility/payment policy sums sent allocations only. Paid invoices receive supplemental water Bills, including the paid-between-draft-and-send race. Duplicate dispatch and stale combined publication guards are tested. F5 concerns projection identity, not a demonstrated overwrite of stored money.

The pure calculation is canonical, but the end-to-end assertion that preview and generation always agree is **FAIL** because of F1/F2. Electricity retains its original calculation dispatch and occupancy paths. Shared history protection intentionally became stricter for both utilities; that is an approved safety extension, not identical deletion behavior. Existing electricity/payment regressions pass. The shared result-endpoint authorization defect also affects electricity and requires a fix.

## 5. Rendering, mobile, notifications and reports (§20–27,32–33)

The three shared water tables render in admin and tenant fixtures. The full frontend unit-label search found version-aware active billing displays and exports; no active new-meter path was found that labels occupancy days as m³. One pre-existing, apparently unused `generateUtilityStatementPDF` helper still contains `cu.m.` and pro-rata language in `web/src/shared/utils/receiptGenerator.js:1557`. No caller was found. Remove/deprecate or version-guard it before reuse; an assertion that the literal label has vanished from the entire source tree would be false.

The tenant fixture used a link to a paid bill while an older unpaid bill also existed. The requested paid bill expanded and scrolled into view, showing canonical tables without page errors. This is isolated component runtime verification, not an authenticated notification tap. Tenant Bill lookup is scoped to the authenticated user; arbitrary tenant Bill IDs are not accepted. The foreign-branch admin result endpoint remains F6.

Mobile API output carries version, unit, readings, rate, dates, events, segments and allocations, plus compatible snake-case fields. Legacy physical values remain null. Generic hardcoded equal-division wording is replaced by the stored measured/legacy explanation. F5 prevents declaring all canonical projections ready. Source search still found no Android, iOS, Expo/shared client manifests or projects. **Android BLOCKED; iOS BLOCKED.** Installed-client handling and notification taps are untested.

Water notification smoke tests cover DB, push-adapter and realtime payload identity and dedupe. Payloads include billId/billing_id, utility type, period/allocation IDs, notification identity, screen and route. Backend state tests cover Mark Read, Mark All Read, Clear All, persistent unread/dismissal behavior and user/lifecycle/branch visibility. No real push delivery or native tap was performed.

Analytics uses sent allocation amounts for water, and tested billed/paid/outstanding totals remain consistent. Exported legacy physical fields are blank; measured periods expose actual usage/rate. Payment math, partial/full settlement, overpayment guards, mocked PayMongo reconciliation and receipts remain in the verified regression suite. No live payment was made. A pre-existing overdue-list DTO still reads raw water aggregate (`overdueNoticeController.js:176`); no current frontend consumer of that component field was found. Review it before treating it as a payable-water breakdown.

Rate editing is owner-only in the existing settings route. Period mutations, dispatch and corrections require authenticated admin plus `manageBilling`; lifecycle actions retain their existing reservation/tenant permissions. Record-level branch checks exist on mutation/reading routes. F6 is the confirmed result-read exception.

The implementation report's native-client limits are accurate. Its broader preview/generation parity, ready correction/cutover recovery and unconditional projection parity claims need qualification until F1/F2/F5 are fixed. The original short-name PDF illustration cannot establish long-name layout correctness.

## 6. Test provenance and fresh audit evidence (§30)

| Verification | Result | Meaning |
| --- | --- | --- |
| Existing full local server log |351 suites / 3,397 tests PASS|Verified in `server/water-full-suite-release.log`; same server implementation as audited head; not rerun wholesale during this audit |
| Hosted CI at final head |286 server suites / 2,903 tests PASS|[CI run](https://github.com/kuurz-z/Capstone-Website/actions/runs/34556845728); hosted server command excludes integration tests |
| Frontend |995 tests PASS|Verified local final log and hosted frontend CI |
| Production frontend build |PASS|Local final build and final-head hosted build; no new production source edits during audit |
| Fresh focused audit regressions |15 suites / 195 tests PASS|Engine, allocation/history safety, move-in rollback, transfer/move-out, rate settings, payment ledger, mobile projection, notifications, statement and analytics |
| Fresh notification state/route tests |2 suites / 42 tests PASS|Read, read-all, clear/dismiss, visibility and canonical notification bridge |
| New defect characterizations |6 checks confirmed 5 backend defect categories|Two F1 cases, F2,F3,F5,F6; these deliberately assert the incorrect current behavior and are NOT acceptance-test passes |
| Browser fixtures |Normal rendering/deep-link checks pass; F4/F8 confirmed|No authenticated workflow or database submission |
| PDF stress/legacy samples |Tables paginate; F7 header overlap; legacy fallback passes|6-page 48-segment sample plus legacy900-PHP statement |

Counts overlap the full suite and must not be added to 3,397. Green tests do not cover the newly reproduced edge cases. Temporary reproduction code is retained at [waterPremerge.audit.test.js](../.water-visual-qa/premerge/waterPremerge.audit.test.js); it was copied into the server controller test directory for the isolated Jest run and then removed. The [reproduction log](../.water-visual-qa/premerge/reproductions.log), [positive regression log](../.water-visual-qa/premerge/positive-regressions.log), [notification-state log](../.water-visual-qa/premerge/notification-state.log), screenshots and PDF samples are local audit artifacts, outside the PR.

## 7. Database, cutover and deployment review (§28–29)

The documented prospective-baseline policy is correct. The implementation rejects missing historical openings and does not convert existing active legacy periods. However, archive/regenerate recovery is not operational as documented because of F2, and backdated closing is unsafe because of F3. The cutover guide should not be approved unchanged.

### REQUIRED BEFORE FEATURE ENABLEMENT

1. Correct F1–F6 and F8, add acceptance regressions for each and rerun applicable suites/build/CI. Keep the PR draft until this review is resolved.
2. Review the intended current PHP/m³ tariff before deploying. Set the reviewed value before creating any new measured period. Coordinate this with completion of legacy periods under their saved semantics; do not reinterpret a legacy room-total value as the new tariff.
3. Verify MongoDB transaction support and existing required indexes. Inspect/resolve multiple active or manual-review cycles before permitting the affected occupancy operations.
4. Create/verify the new unique sparse Bill index through the controlled database rollout:

```javascript
db.bills.createIndex(
  { waterSupplementKey: 1 },
  { unique: true, sparse: true, name: "unique_water_supplement" }
);
```

5. Verify existing `utilityperiods` indexes: unique active `{utilityType:1,roomId:1}` named `unique_lifecycle_active_utility_period` with nonarchived open/manual-review partial filter; unique `{utilityType:1,roomId:1,startDate:1}` for nonarchived records. Verify existing `unique_reservation_billing_cycle` on Bills as well. The new schema field does not prove that the deployed index exists.
6. The existing `npm.cmd run utility:migrate-lifecycle-indexes` is read-only by default. Its controlled write form is `npm.cmd run utility:migrate-lifecycle-indexes -- --write --confirm-token UTILITY-LIFECYCLE-INDEXES-APPLY`. That script creates missing lifecycle/UtilityHistoricalGap indexes; it does not create `unique_water_supplement`. Inspect its plan against the deployment environment before a separately authorized production write. Do not use blanket `syncIndexes()`.
7. Coordinate an operations pause during API/web rollout and room cutover. There is no new feature flag that stages the water requirement: eligible occupancy workflows begin requiring it when the new API is deployed.

These are instructions for a future deployment, not commands executed by this audit.

### REQUIRED AFTER DEPLOYMENT, BEFORE THE FIRST AFFECTED OPERATION

- Deploy the additive API schemas and matching web UI together. Fields are on UtilityPeriod, UtilityReading, Bill, BedHistory, Room, Reservation and Notification. Schema deployment does not require rewriting old documents.
- Finish each active legacy cycle under its original version. Archive only an eligible unpublished successor if needed, then establish a verified physical opening through the supported workflow. Start measured billing from that actual boundary; earlier unknown consumption remains unknown.
- Confirm the first new period has `water-meter-v1`, unitm3, correct opening/time and reviewed rate snapshot. Verify later move-in/physical transfer/move-out observations against the real meter and correct room IDs.
- Review the first closing preview against persisted segments/allocations, tenant/mobile payload and PDF before dispatch. Verify dispatch once, draft exclusion and unchanged paid history.

### OPTIONAL

Additional lookup indexes for allocation/period reporting may be considered after profiling; they are not required by the present schema contract. Add a dedicated integration-test CI job for the new adversarial cases. Correct the existing PDF header and retire the unused legacy utility statement helper.

### NOT REQUIRED

No historical measurement backfill, no occupancy-day-to-m³ conversion, no rewrite of old paid Bills or receipts, no second meter/occupancy collection, and no new environment variable. Existing MongoDB/auth/push/payment configuration remains in use. Android/iOS build submission is outside this repository and was not performed.

## 8. Merge readiness matrix (§34)

| Area | Status | Severity | Evidence | Merge blocker? |
| --- | --- | --- | --- | --- |
| Scope/provenance |PASS|None|Pinned head/base;89 files; tracked code clean|No |
| Historical safety |PASS|None observed|Version guard, issued/paid deletion tests, legacy PDF|No |
| Calculation version |PASS|None observed|Explicit meter-v1 dispatch; legacy fallback|No |
| Calculation engine |PASS|None observed|Private/Double/return/vacancy tests;12/6 example|No standalone blocker |
| Rate configuration |PARTIAL|High|Current setting/snapshot pass; F1 edit inconsistency|Yes, F1 |
| Move-in |PARTIAL|Medium|Atomic validation passes; F8 stale reset|Yes, F8 |
| Private |PASS|None observed|Measured100% share and partial/vacancy tests|No standalone blocker |
| Double |PASS|None observed|Measured segment membership; arrivals/leavers/return|No standalone blocker |
| Quad |PASS|None observed|UI/workflow/engine exclusions and regressions|No |
| Transfer |PARTIAL|Medium|Atomic physical writes pass; F4 baseline UI missing|Yes, F4 |
| Scheduled transfer |PASS|None observed|No scheduling readings; actual completion timestamp|No standalone blocker |
| Move-out |PASS|None observed|Final observation; raw reading separate from money|No standalone blocker |
| Meter history |PARTIAL|High|Correction append passes; F3 decreasing history accepted|Yes, F3 |
| Bill allocations |PASS|None observed in storage/math|Additive identities, duplicate/race/paid-invoice tests|Projection blocker tracked in F5 |
| Payments |PASS|None observed|Draft/sent visibility; ledger and existing PayMongo regressions|No live-payment claim |
| Admin UI |PARTIAL|High/Medium|Tables/pattern retained; F1/F4|Yes |
| Canonical preview |FAIL|High|F1/F2 reproduced preview/close disagreement|Yes |
| Tenant Web |PARTIAL|Medium|Exact-bill fixture passes; F5 canonical usage mismatch|Yes, F5 |
| Mobile API |PARTIAL|Medium|Additive contract/legacy fallback; F5 identity mismatch|Yes, F5 |
| Android |BLOCKED|Client unavailable|No client source/device validation|Mobile release blocker; not independently a web/API merge blocker |
| iOS |BLOCKED|Client unavailable|No client source/device validation|Mobile release blocker; not independently a web/API merge blocker |
| Notifications |PASS|None observed in backend/fixture|Dedupe/identity and 42 state tests; exact web bill fixture|Native routing remains blocked |
| PDF |PARTIAL|Medium|New tables/legacy pass; pre-existing F7 long-name overlap|No; follow-up F7 |
| Reports |PASS|None observed in tested totals|Visible-water analytics and version-aware exports|No; raw overdue DTO follow-up noted |
| Cutover |FAIL|High|F2 recovery mismatch; F3 continuity|Yes |
| Database/indexes |PARTIAL|Deployment prerequisite|Additive schema; index commands reviewed, production uninspected|Required before enablement; no production action taken |
| Tests |PARTIAL|High coverage gap|Existing CI green; new characterizations expose uncovered defects|Yes, add acceptance tests |
| Security/authorization |FAIL|High|F6 foreign-branch result response|Yes |
| Documentation |PARTIAL|Medium|Mobile limits accurate; parity/recovery claims overstate support|Yes, update alongside fixes |

## 9. Final disposition (§35)

1. **Merge blockers:** F1 open-period editing, F2 observation selection/recovery, F3 closing continuity, F6 branch authorization; also F4 transfer baseline UI, F5 allocation-specific projection and F8 move-in reset. Add regressions and reconcile the report/cutover guide before re-review.
2. **Non-blocking follow-ups:** F7 pre-existing PDF header overlap; unused legacy utility PDF helper; raw overdue-list water component; broader hosted integration coverage. Existing passing tests remain useful but do not waive the blockers.
3. **Required production deployment steps:** only after correction, review and a separate deployment decision: coordinate API/web rollout, reviewed unit tariff, transaction/index prerequisites, operations pause and verified room-by-room prospective baselines as detailed above.
4. **Required post-deployment verification:** correct branch/tenant access; excluded rooms; fresh physical boundary capture and rollback behavior in a safe test environment; preview/close/projection/PDF parity; draft versus sent balance; duplicate send; partial/full payment and paid-history preservation; notification read/clear/exact-bill behavior. Inspect real first-cycle measurements without fabricating production test consumption.
5. **Android/iOS remaining work:** obtain the separate client source, handle measured/legacy/multi-allocation payloads, render detail tables/lists, validate null compatibility, exact-bill taps and notification state on both installed platforms. Backend compatibility is not proof of native runtime readiness.
6. **Draft → Ready for Review:** **No at the audited head.** Keep PR #172 draft until the identified blockers and missing regression coverage are resolved. This audit did not merge it or change its draft state.

MERGE VERDICT:
NOT READY TO MERGE

</details>

## Current disposition

All reproduced web/API merge blockers are resolved. Required checks must be green on the PR head; the final handoff records their outcome. Native mobile and production prerequisites remain separate release requirements. PR #172 remains unmerged.

MERGE VERDICT: READY TO MERGE once required checks on the pushed head pass.
