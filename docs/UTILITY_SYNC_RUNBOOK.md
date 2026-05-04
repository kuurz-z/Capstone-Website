# Utility Sync Runbook

Verified against the repository on April 2, 2026.

## Purpose

This runbook covers the new repair flow for utility billing drift:

- diagnose electricity rooms with orphan readings or missing periods
- repair current-state electricity period bootstrapping
- archive orphan finalized water history
- verify a room is ready for the next 15th billing close

## Commands

Run diagnostics without changing data:

```bash
cd server
npm run utility:diagnose
```

Run a branch-scoped diagnostic:

```bash
cd server
npm run utility:diagnose -- --branch=gil-puyat
```

Run the repair in dry-run mode:

```bash
cd server
npm run utility:repair
```

Persist the repair:

```bash
cd server
npm run utility:repair -- --write
```

## What The Repair Does

Electricity:

- finds rooms with active occupancy and orphan `MeterReading` rows
- creates one open `BillingPeriod` from the earliest active anchor reading if needed
- attaches orphan readings to that period
- does not close the period
- does not generate `BillingResult` or `Bill` rows

Water:

- finds finalized `WaterBillingRecord` rows with no overlapping reservations
- archives them as orphaned utility history
- preserves the record for audit purposes

## Ready-For-Close Checklist

A room is ready for the next regular electricity close when:

- it has exactly one open `BillingPeriod`
- it has no orphan meter readings
- it has no `electricity_missing_movein_anchor` issue
- the admin has recorded the current cutoff reading for the room
- if the room type is water-billable, the matching water record is finalized or intentionally waiting

## Notes

- Electricity now auto-opens on first valid move-in meter reading when no open period exists.
- Electricity and water both target a 15th-cycle operational cadence after bootstrap.
- `quadruple-sharing` remains excluded from water billing in the current product rules.
