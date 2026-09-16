# Reconcile historical Stay end-date drift

This tool changes only `Stay.leaseEndDate` and `Stay.updatedAt`. It never signs,
publishes, cancels, or edits Contracts, renewal offers, or transfer workflows.
An active account alone does not establish an extension entitlement.

Run from `server`. Store evidence under `private/` (gitignored).

```sh
node scripts/reconcile_stay_contract_dates.mjs --dotenv-path /secure/server.env --expected-db lilycrest-dormitory --output private/stay-date-repair/review.json
```

Review every proposed repair before applying. The planner requires one active
Stay, an authoritative current published/active Contract, matching tenant,
reservation, room and start date, a consistent whole-month legal term, and no
open successor/renewal/transfer/move-out workflow. Ambiguous cases are reported
for admin review, never guessed or automatically cancelled.

```sh
node scripts/reconcile_stay_contract_dates.mjs --dotenv-path /secure/server.env --expected-db lilycrest-dormitory --apply --plan private/stay-date-repair/review.json --output private/stay-date-repair/before-images.json
```

Apply revalidates the reviewed plan before writing, saves complete Stay
before-images, then revalidates each record inside a transaction and uses a
compare-and-set update. Evidence files are never overwritten. The adjacent
`.outcomes.jsonl` journal records committed repairs. A stale plan aborts rather
than overwriting a concurrent transaction; earlier individual repairs may have
committed, so review the journal and regenerate the dry-run after any failure.
For recovery, use the before-image only after confirming no later legitimate
transaction changed that Stay; never blindly restore a full document.

Repeat the dry-run after applying and verify the actual tenant-facing API.
Records blocked by a pending renewal offer or successor contract require a
separate admin decision; do not remove those safeguards to make the count zero.
