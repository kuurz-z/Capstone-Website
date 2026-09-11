# Billing UI, verified Water recovery, and prospective tariffs

Branch: `feat/utility-baseline-and-prospective-rates`

Base: latest fetched `main`, `5a476dbba7f5284f5dd2b2654582f5cd316299c2`

Status: fully validated for one focused local commit; no push, merge, deployment, or production access.

## Audit and implementation

The two cycle operations are not interchangeable. Closing an active period operates on its existing identity, observations, captured pricing, and draft lifecycle. The historical endpoint atomically creates and closes an isolated period when no active period exists, with continuation disabled. Both backend operations remain available.

| Room lifecycle | Previous UI | Updated UI |
| --- | --- | --- |
| Active Electricity/Water cycle | New Billing Period | New Billing Period; no Historical/Start action |
| No active cycle | New Billing Period plus Generate Historical Cycle | Start Billing Cycle, using the existing isolated-cycle endpoint |
| Manual review required | Review warning | Review warning; cycle creation remains unavailable |
| Legacy Water cycle | Separate legacy close | Separate legacy close with explicit measured-cutover explanation |

Manual initialization remains a separate recovery operation. No backend endpoint was deleted or renamed.

### Verified Water recovery

`POST /api/utilities/water/opening-baseline` uses the existing admin/branch/`manageBilling` route middleware and a new transactional service. The UI offers **Record Opening Reading** for `WATER_VERIFIED_BASELINE_REQUIRED`, including the real API error-envelope shape, or a blank opening in the monthly dialog. Manual initialization also exposes recovery on that error.

Inputs are the physical reading (zero is valid; blank is not), actual observation date/time, current/documented-history source, reason, and evidence reference. The form explicitly labels Philippine time and submits a zoned timestamp. Date-only and unzoned observations are rejected. A historical reading requires a reference; a current physical observation must be on the current Philippine calendar day. The reading is not assigned to the tenant's old move-in date.

Recovery creates an ordinary locked Water period-start observation and measured period, or repairs the start of an existing unbilled measured period whose opening lacks usable evidence. In the latter case, its captured tariff remains unchanged. It uses the existing chronology checks, active-period uniqueness, Room observation revision, and transaction boundary. A successful duplicate request returns the existing baseline without adding readings, bills, or audit entries.

An audit entry records the source, reason, evidence, before/after opening, and explicit `unknownConsumptionBeforeBaseline: true` / `generatedCharges: false` markers. Tenant dates and occupancy do not change. Earlier consumption is not estimated or charged. Existing billing allocations, dispatch links, tenant-summary bills, or finalization records block recovery. Existing verified openings require the correction workflow; legacy cycles require an explicit cutover. Overlapping coverage and discarded observations are rejected.

On success, Water queries are invalidated/refetched, the verified reading/time is displayed, and the normal monthly dialog reopens on the recovered period. Future move-ins still require their normal meter observations during check-in.

### One prospective tariff rule

Both runtime creation controllers now resolve the latest global tariff through `resolveCurrentUtilityRate`, including manual initialization and isolated-cycle generation. Electricity continuation already uses this resolver. Measured Water move-in/transfer creation already resolves the current global Water rate. No Room tariff copies or propagation writes were added.

The frontend uses the flat `defaultElectricityRatePerKwh` and `defaultWaterRatePerUnit` settings fields. A valid zero remains zero. Missing settings remain blank rather than displaying a guessed tariff. New-period rate fields are read-only, and a previous closed Electricity cycle no longer supplies the tariff for a newly created cycle. Backend resolution is authoritative if settings change while a form is open.

Already-open periods retain their captured tariff; measured Water retains its pricing snapshot. Settings updates do not rewrite closed/draft/sent/partially-paid/paid periods, allocations, or invoices. Existing explicit correction/revision controls retain their existing protections.

The low-level `createOpenUtilityPeriodWithBoundary` explicit-rate contract is preserved for repair scripts and internal fixtures. Caller tracing also found unused legacy helpers `ensureOpenUtilityPeriodForRoom` and `resolveElectricityRatePerKwh`; no runtime caller currently invokes them. They were not removed or repurposed in this change and should not be introduced into new runtime paths.

### Legacy Water and eligibility

Legacy Water retains its saved flat cycle-charge interpretation. Closing a legacy cycle does not automatically create a measured continuation using the new PHP/m³ tariff. The next measured cycle requires an explicit verified baseline. Existing measured Water closing behavior remains unchanged (no automatic continuation).

Gil Puyat Private and Double remain measured-Water eligible. Gil Puyat Quad and Guadalupe remain excluded from separate measured Water billing. Electricity's existing eligible room types are unchanged. All eligible new periods resolve global settings dynamically, without per-room copies.

## Files changed

Application:

- `server/controllers/utilityBillingController.js`
- `server/routes/utilityBillingRoutes.js`
- `server/services/billing/waterOpeningRecovery.js` (new)
- `web/src/features/admin/components/billing/UtilityBillingTab.jsx`
- `web/src/features/admin/components/billing/NewBillingPeriodModal.jsx`
- `web/src/features/admin/components/billing/OpenCurrentPeriodModal.jsx`
- `web/src/features/admin/components/billing/CloseCurrentPeriodModal.jsx`
- `web/src/features/admin/components/billing/RecordWaterOpeningModal.jsx` (new)
- `web/src/features/admin/components/billing/utility/UtilityCycleOverviewCard.jsx`
- `web/src/shared/api/utilityApi.js`
- `web/src/shared/hooks/queries/useUtility.js`

Tests and fixtures:

- `server/controllers/utilityProspectiveRates.integration.test.js` (new)
- `server/controllers/monthlyUtilityWorkflow.integration.test.js`
- `server/controllers/utilityBillingController.lifecycle.integration.test.js`
- `server/controllers/waterBlockers.integration.test.js`
- `server/controllers/waterMeterBilling.integration.test.js`
- `web/src/features/admin/components/billing/monthlyUtilityWorkflow.mount.test.mjs`
- `web/src/features/admin/components/billing/utilityLifecycleUi.test.mjs`
- `web/src/test-fixtures/monthlyUtilityLoader.mjs`

Documentation: this report.

## Validation

Integration tests use isolated MongoMemoryReplSet databases; external DB environment variables are overridden with an unreachable localhost address.

- Frontend: 1,164 passed, zero failed.
- Local browser: desktop 1440×1000 and mobile 390×844, light/dark, both cycle-action states, evidence requirement, exact recovery payload, keyboard focus containment/restoration; passed with zero browser errors.
- New backend coverage includes fresh/zero tariffs, stale client/prior tariffs, captured open/history prices, all eligible room types, legacy semantics, exact recovery, unknown prior consumption, recovery-to-draft generation, chronology, overlap, branch exclusion, financial/finalization protection, transaction rollback, and concurrent duplicate requests.
- Complete utility regression: 533 passed across 46 suites, zero failed (252.624 seconds). Covers stale closing reset, Electricity chronology/engine, Water meter-v1, draft visibility/breakdown, paid-invoice/history preservation, lifecycle transactions, notifications, and mobile billing.
- Final changed-backend rerun: 46 passed across two suites, zero failed (44.412 seconds), including 37 prospective-rate/recovery checks and the corrected Water preview fixture. This includes two additional malformed-input checks added after the complete utility run.
- Full server rerun on the final uncommitted state after the fixture correction: **360 suites passed, 3,628 tests passed, zero failures** (484.447 seconds). Command: `npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB --forceExit`. No suite filters or skips were used. The corrected Water preview fixture configures the global PHP50 tariff and retains its expected PHP300/PHP600 tenant charges. Log: `%TEMP%/utility-cleanup-full-before-commit.log`.
- Production build: passed (`npm run build`, 3m 60s). Non-blocking Browserslist data-age notice; dependencies were not modified.

## Operational boundaries and remaining considerations

Before committing, the 20-file manifest and all file contents were verified unchanged throughout the complete server rerun. The 91 pre-existing untracked files were compared by path and SHA-256 and remain unchanged and untracked. The commit scope is exactly 16 modified tracked files and four new task files (this report, recovery service, recovery modal, and new integration suite). Only this report was then updated to record the completed validation. Test logs and browser screenshots remain outside the repository in the user's temporary directory. Build output is ignored; no generated artifacts are included. `git diff --check` passes.

No production data was read or mutated. This report accompanies the authorized focused local commit; no merge, push, or deployment is included. Changes remain on the feature branch for pre-merge review.

Historical evidence references are administrator attestations, not automatically authenticated documents. Existing verified readings and financially linked periods deliberately require their established correction/review workflow. Legacy Water requires explicit cutover rather than automatic tariff conversion. No schema migration or production backfill is included.
