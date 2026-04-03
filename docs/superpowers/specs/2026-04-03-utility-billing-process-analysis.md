# Utility Billing Process Analysis: Electricity and Water

This document analyzes the complete, unified billing process for Electricity and Water within the Lilycrest Dormitory Management System, identifying the hybrid strategy used to distribute costs fairly among tenants.

## 1. Unified Architecture

Both Electricity and Water billing share a **Unified Utility Billing Controller** (`utilityBillingController.js`) and a shared **Billing Engine** (`billingEngine.js`). The system distinguishes between the two utilities via parameterized API routes (`/:utilityType/...`), rather than using separate, redundant logic for each.

### 1.1 Data Models
*   **`UtilityPeriod`**: Represents a specific billing cycle for a room (e.g., March 1 to April 1). Tracks `startDate`, `endDate`, `startReading`, `endReading`, `ratePerUnit`, and the computed totals.
*   **`UtilityReading`**: Represents a physical meter reading. It associates the reading size, date, and `eventType` (e.g., `regular-billing`, `move-in`, `move-out`).
*   **`Bill`**: The individual tenant's consolidated invoice, which gathers their calculated shares of rent, electricity, and water into a final workable document.

### 1.2 Room Eligibility
While electricity is billed universally across all rooms, **Water Billing** enforces an eligibility constraint based on room type. Only `private` and `double-sharing` room types are exposed to water billing logic, effectively excluding dormitory-style rooms with communal water access.

---

## 2. The Billing Lifecycle

The administrative flow consists of strict, sequential boundaries enforced to maintain exact alignment with the physical billing cycles.

### Step 1: Opening a Cycle
An administrator opens a new utility period for a room, supplying the `startReading`, `startDate`, and `ratePerUnit`.
*   Validation: Only one open cycle per utility/room combination is permitted at a time.
*   Automatic Chaining: The system typically automatically initializes the *next* utility period using the closing parameters of the previous period.

### Step 2: Intermediate Readings (Optional)
During an open cycle, administrators can record intermediary event readings, specifically `move-in` and `move-out` readings for tenants.
*   These are stored as individual `UtilityReading` records linked to the open period and the specific `tenantId`.
*   They form the basis for the exact **Segment-Based Math** computation.

### Step 3: Closing the Cycle
Administrators finalize the cycle on a target boundary date by inputting the `endReading`.
1.  **Strict Boundary Alignment**: The closing date must match the system's strict cycle boundaries to prevent overlapping fragments.
2.  **Engine Computation**: The cycle parameters, all intermediate readings, and all valid reservations matching the `[startDate, endDate]` timeframe are fed into the `computeBilling` orchestrator.
3.  **Draft Injection**: The system calculates the tenant summaries and automatically generates or updates Draft Bills (`upsertDraftBillsForUtility`) for every valid tenant covering that duration. The system saves the complete snapshot arrays to `UtilityPeriod.tenantSummaries`.

---

## 3. The Hybrid Computation Engine

The system uses `billingEngine.js` to determine each tenant's precise financial burden for a utility cycle. It uses a **Hybrid Strategy** that seamlessly gracefully degrades depending on the strictness of the input data.

### Strategy A: Segment-Based Math (Exact Metering)
When there are intermediate readings (`move-in` or `move-out` events) throughout a period, the engine computes precise costs per-segment.
1.  **Segment Construction**: Every reading acts as a delineator. The period is chopped into chronological segments (e.g., `[start reading -> move-in reading]`, `[move-in reading -> end reading]`).
2.  **Active Occupancy Parsing**: For each segment, the engine calculates exactly which tenants were currently checked-in inside the room.
3.  **Unit Division**: The exact meter difference in that specific segment is divided precisely amongst the active tenants during that segment.
4.  **Consolidation**: The tenant's partial shares from each segment they were present in are summed up to generate their exact total utility usage for the month.

### Strategy B: Graceful Proration Fallback (Calendar Math)
If an Admin failed to or opted not to record intermediate move-in/move-out meter readings, the engine gracefully degrades to purely chronological pro-rata allocation.
1.  **Days Stayed Definition**: The engine determines the exact overlap between the tenant's exact check-in/out dates and the billing period (`[startDate, endDate]`).
2.  **Ratio Generation**: It takes the total consumed units (`endReading - startReading`) and cost (`units * rate`).
3.  **Apportionment**: The system distributes the total cost across all tenants proportionally to their overlapping stay duration using fair remainder distribution arrays.

---

## 4. Occupancy State Filtering

The entire computation engine is strictly chained to the **Reservation** and **Lifecycle** state. 
*   **No Active Occupancy, No Bill**: The billing query explicitly filters for `status: { $in: ["checked-in", "checked-out"] }`.
*   **Shadow Billing Prevention**: Users who hold `confirmed` or `pending` (future) reservations are entirely excluded from the calculation. This prohibits phantom charging of absent, future tenants who haven't crossed the threshold of actually being physically checked into the building.
*   **Snapshot Persistence**: When the math is completed, a snapshot `[tenantSummaries]` is saved forever within the `UtilityPeriod` so historical changes visually freeze preventing later retro-corruption.
