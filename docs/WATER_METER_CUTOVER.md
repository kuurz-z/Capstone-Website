# Versioned water billing: deployment and cutover

The new policy is `water-meter-v1`. It applies only to Gil Puyat Private and Double/Sharing rooms. Quad and Guadalupe retain their existing exclusions. This deployment does not convert existing periods or manufacture historical measurements.

## Before enabling the workflow

1. Deploy the API and web changes together after regression and CI checks pass. MongoDB must support transactions, as required by the existing occupancy workflow.
2. Verify the current Water Rate in System Settings as **PHP per m³**. An older configured room-total value must not be accepted as the intended new unit price without review. New periods snapshot the configured or explicitly entered price; later setting changes do not change that snapshot.
3. Verify existing utility lifecycle indexes using the repository's established `utility:migrate-lifecycle-indexes` workflow. Resolve multiple active/manual-review periods before occupancy changes.
4. Add the supplemental invoice index through the normal database deployment process. It does not backfill records or touch paid amounts:

```javascript
db.bills.createIndex(
  { waterSupplementKey: 1 },
  { unique: true, sparse: true, name: "unique_water_supplement" }
);
```

Do not run a blanket `syncIndexes()` against production: it can remove unrelated indexes. No migration or index command has been executed against production as part of this implementation.

## Room-by-room boundary

1. Finish existing legacy water cycles using their original allocation semantics. An absent calculation version means legacy; it does not mean measured consumption.
2. If completing a legacy cycle opens another empty legacy cycle, archive that unpublished successor before establishing the new policy. Issued or paid financial records cannot be deleted, even with `force`.
3. Record a verified physical room reading through **Open Current Period** on the observation day, with the reviewed PHP/m³ rate. The API saves the actual timestamp. An eligible move-in with no active period can also establish this prospective baseline from its required physical observation.
4. If there is no trustworthy older measurement, begin at this baseline. Earlier consumption remains unknown. Historical generation requires an already recorded valid observation and cannot create a fictional opening. Selecting its calendar date preserves the observation's saved time.
5. Capture a fresh observation at every eligible move-in, completed transfer and move-out. Transfer scheduling does not record water readings. Complete Transfer requires readings for each eligible source/destination room; two events on the same room meter at the same instant must agree.
6. At closing, enter the physical closing reading and review the canonical preview and three tables. Missing occupancy-change measurements block calculation rather than trigger a day-based estimate. Sending the draft makes only that period's allocations visible.

An active legacy period continues as legacy until deliberately cut over. Do not set `calculationVersion` on an existing period or copy occupancy-day usage into a meter field.

## Financial and observation safeguards

- `Bill.waterAllocations` identifies each period/room/reservation/tenant allocation. `charges.water` remains its compatibility aggregate. Tenant balances and payment amounts include sent allocations only.
- A paid monthly invoice receives a separate water invoice. This also applies when rent was paid between water draft creation and dispatch. Existing paid invoice fields remain unchanged.
- Water readings are appended. Corrections require a reason and supersede the original, preserving actor, time and linkage. Events describing the same physical instant are corrected together. Unpublished closed periods must be archived first; issued periods remain immutable.
- All occupancy changes and required meter writes share the occupancy transaction. A failed water write rolls back the physical change.
- Vacancy consumption remains room overhead. Occupancy determines who shares each measured segment; duration never substitutes for a water measurement.
- Billing closing dates use the existing Manila date contract. Exact observed occupancy timestamps are retained separately on BedHistory for water segmentation.

## API and client contract

New fields are additive on UtilityReading, UtilityPeriod, Bill, BedHistory, Room, Reservation and Notification. Legacy water projections return null physical readings, usage and unit price, plus the recorded monetary amount and a historical explanation. They never relabel occupancy days as m³.

Canonical water details contain calculation version, unit, readings, measured consumption, saved price, room amount, tenant share, meter events, segments and allocations. Multiple allocations are exposed individually; a combined physical meter reading or combined unit price is unknown, not the first room's reading.

`POST /api/utilities/water/preview` is read-only. Use `periodId` for an active measured cycle so its saved opening instant and price are authoritative. Standalone historical preview additionally needs an existing verified opening matching `startDate` and `startReading`.

Android/iOS client source is absent from this workspace. Backend projections and notification payloads are implemented and tested; native screen rendering, installed-client null handling and notification taps require validation in the separate client repository before claiming mobile rollout completion.

## Recovery

Do not downgrade to an API version that ignores `waterAllocations` after using the new workflow. Pause new water closing/dispatch if a rollout issue appears, retain all observations and financial documents, and deploy a forward correction. Never delete or recalculate issued history as a rollback mechanism.
