# Fix Move-Out Bed Release and Isolate Tenancy Lifecycles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure moving out a tenant properly releases all physical bed slots (even when referenced by position labels like "lower"), cascade-cancels unfulfilled stay extensions/upcoming stays/draft renewal contracts, and strictly isolates new reservation lifecycles from past tenancies so past extensions never appear on new reservations.

**Architecture:** 
1. `Room.vacateBed()` is upgraded to match beds flexibly across `id`, `code`, `_id`, `bedNumber`, `position` (case-insensitive), and tenant/reservation/lock references.
2. `tenantActionService.moveOutStayWorkflow` is upgraded to cascade-cancel all unfulfilled renewal contracts (in any pre-effective status: draft, generated, published, etc.), upcoming stays, and pending extension requests.
3. `tenantContractSelectionService` is upgraded so `resolveTenantUpcomingContract` and `attachContractLineage` are scoped strictly to the current active tenancy lifecycle, preventing past expired/moved-out contracts from contaminating new reservations.
4. An automated repair script cleans up Room 204's stuck Lower Bed and repairs stale orphaned extension records.

**Tech Stack:** Node.js, Express.js, MongoDB / Mongoose, Jest, React / Vite.

**Spec:** [docs/superpowers/plans/2026-09-16-fix-moveout-bed-release-and-tenancy-isolation.md](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/docs/superpowers/plans/2026-09-16-fix-moveout-bed-release-and-tenancy-isolation.md)

## Global Constraints
- Strictly enforce standardized API contracts (`{ success: true, ... }`).
- Terminology: "Tenant" (NEVER "Resident"), "Rent" (NEVER "Rental Fee"), "Assistant" (NEVER "Copilot"), "Owner" (NEVER "Super Admin").
- Atomic operations on MongoDB documents to prevent race conditions.
- Zero breaking changes to mobile endpoints (`/api/mobile/...`).

---

### Task 1: Multi-Attribute Bed Vacating in `Room.js`

**Files:**
- Modify: `server/models/Room.js`
- Create Test: `server/models/Room.vacateBed.test.js`

**Interfaces:**
- Consumes: `Room.beds` array schema with fields `id`, `code`, `_id`, `bedNumber`, `position`, `status`, `occupiedBy`, `lockedBy`.
- Produces: `room.vacateBed(bedId, userId, reservationId)` returning `boolean` indicating if a bed was vacated.

- [ ] **Step 1: Write the failing unit test for `Room.vacateBed`**

```javascript
// server/models/Room.vacateBed.test.js
import mongoose from "mongoose";
import Room from "./Room.js";

describe("Room.vacateBed multi-attribute matching", () => {
  let room;

  beforeEach(() => {
    room = new Room({
      name: "Room 204",
      roomNumber: "204",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 2,
      price: 5400,
      beds: [
        {
          id: "bed-1",
          code: "204-B-L",
          position: "lower",
          bunkBlock: "B",
          status: "occupied",
          occupiedBy: {
            userId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
            reservationId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439022"),
            occupiedSince: new Date(),
          },
        },
        {
          id: "bed-2",
          code: "204-B-U",
          position: "upper",
          bunkBlock: "B",
          status: "occupied",
          occupiedBy: {
            userId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439033"),
            reservationId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439044"),
            occupiedSince: new Date(),
          },
        },
        {
          id: "bed-3",
          code: "204-A-L",
          position: "lower",
          bunkBlock: "A",
          status: "available",
        },
        {
          id: "bed-4",
          code: "204-A-U",
          position: "upper",
          bunkBlock: "A",
          status: "available",
        },
      ],
    });
  });

  test("vacates bed when bedId is passed as position string 'lower' and matches occupiedBy.userId", () => {
    const tenantId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    const resId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439022");
    const vacated = room.vacateBed("lower", tenantId, resId);

    expect(vacated).toBe(true);
    const targetBed = room.beds.find((b) => b.id === "bed-1");
    expect(targetBed.status).toBe("available");
    expect(targetBed.occupiedBy.userId).toBeNull();
    expect(targetBed.occupiedBy.reservationId).toBeNull();
    // Second bed should still remain occupied
    const otherBed = room.beds.find((b) => b.id === "bed-2");
    expect(otherBed.status).toBe("occupied");
  });

  test("vacates bed when bedId is passed as bed code '204-B-L'", () => {
    const vacated = room.vacateBed("204-B-L");
    expect(vacated).toBe(true);
    const targetBed = room.beds.find((b) => b.code === "204-B-L");
    expect(targetBed.status).toBe("available");
  });

  test("vacates bed matching tenantId even if bedId is null", () => {
    const tenantId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439033");
    const vacated = room.vacateBed(null, tenantId, null);
    expect(vacated).toBe(true);
    const targetBed = room.beds.find((b) => b.id === "bed-2");
    expect(targetBed.status).toBe("available");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/models/Room.vacateBed.test.js` in `Capstone-Website/server`
Expected: FAIL due to position label matching and multi-attribute checks not matching when multiple occupied beds exist.

- [ ] **Step 3: Update `Room.prototype.vacateBed` in `server/models/Room.js`**

Modify `server/models/Room.js`:
```javascript
roomSchema.methods.vacateBed = function (bedId, userId, reservationId) {
  const normBedId = bedId ? String(bedId).trim().toLowerCase() : null;
  const normUserId = userId ? String(userId?._id || userId).trim() : null;
  const normResId = reservationId ? String(reservationId?._id || reservationId).trim() : null;

  // 1. Direct match by specific bed ID, code, Mongo ID, or bedNumber
  let bed = this.beds?.find((b) => {
    const bId = b.id ? String(b.id).trim().toLowerCase() : "";
    const bCode = b.code ? String(b.code).trim().toLowerCase() : "";
    const bMongoId = b._id ? String(b._id).trim().toLowerCase() : "";
    const bNum = b.bedNumber != null ? String(b.bedNumber) : "";
    return normBedId && (bId === normBedId || bCode === normBedId || bMongoId === normBedId || bNum === normBedId);
  });

  // 2. Match by occupant ownership (userId or reservationId)
  if (!bed && (normUserId || normResId)) {
    bed = this.beds?.find((b) => {
      const bUserId = b.occupiedBy?.userId ? String(b.occupiedBy.userId).trim() : "";
      const bResId = b.occupiedBy?.reservationId ? String(b.occupiedBy.reservationId).trim() : "";
      const bLockedBy = b.lockedBy ? String(b.lockedBy).trim() : "";

      if (normUserId && (bUserId === normUserId || bLockedBy === normUserId)) {
        // If bedId specified position, verify position matches
        if (normBedId && ["upper", "lower", "single"].includes(normBedId)) {
          return String(b.position || "").toLowerCase() === normBedId;
        }
        return true;
      }
      if (normResId && bResId === normResId) {
        if (normBedId && ["upper", "lower", "single"].includes(normBedId)) {
          return String(b.position || "").toLowerCase() === normBedId;
        }
        return true;
      }
      return false;
    });
  }

  // 3. Match by bed position if only one occupied bed with that position exists
  if (!bed && normBedId && ["upper", "lower", "single"].includes(normBedId)) {
    const matchingPositionBeds = this.beds?.filter(
      (b) => String(b.position || "").toLowerCase() === normBedId && b.status === "occupied"
    );
    if (matchingPositionBeds?.length === 1) {
      bed = matchingPositionBeds[0];
    }
  }

  // 4. Fallback: if only 1 occupied bed exists in room, vacate that bed
  if (!bed && Array.isArray(this.beds) && this.beds.filter((b) => b.status === "occupied").length === 1) {
    bed = this.beds.find((b) => b.status === "occupied");
  }

  if (!bed) return false;

  bed.status = "available";
  bed.lockedBy = null;
  bed.lockExpiresAt = null;
  bed.occupiedBy = {
    userId: null,
    reservationId: null,
    occupiedSince: null,
  };
  return true;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/models/Room.vacateBed.test.js`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add server/models/Room.js server/models/Room.vacateBed.test.js
git commit -m "fix(room): enhance vacateBed with multi-attribute position and ownership matching"
```

---

### Task 2: Move-Out Cascade Cancellation of Stays, Extensions & Renewal Contracts

**Files:**
- Modify: `server/utils/tenantActionService.js`
- Create Test: `server/utils/tenantActionService.moveOutCascade.integration.test.js`

**Interfaces:**
- Consumes: `moveOutStayWorkflow({ reservationId, payload, actorId })`
- Produces: Complete cancellation of all upcoming stays, extension requests, and draft/generated renewal contracts linked to the moved-out tenancy.

- [ ] **Step 1: Write integration test for move-out cascade cancellation**

```javascript
// server/utils/tenantActionService.moveOutCascade.integration.test.js
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  Contract,
  Reservation,
  Room,
  Stay,
  User,
} from "../models/index.js";
import StayExtensionRequest from "../models/StayExtensionRequest.js";
import { moveOutStayWorkflow } from "./tenantActionService.js";

describe("moveOutStayWorkflow cascade cleanup", () => {
  let mongod;
  let tenant, admin, room, reservation, activeStay, upcomingStay, currentContract, renewalContract, extensionRequest;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();

    tenant = await User.create({
      firstName: "Test",
      lastName: "Tenant",
      email: "tenant@example.com",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });

    admin = await User.create({
      firstName: "Admin",
      lastName: "User",
      email: "admin@example.com",
      role: "admin",
      branch: "gil-puyat",
    });

    room = await Room.create({
      name: "Room 204",
      roomNumber: "204",
      branch: "gil-puyat",
      type: "quadruple-sharing",
      capacity: 4,
      currentOccupancy: 1,
      price: 5400,
      beds: [
        {
          id: "bed-1",
          code: "204-B-L",
          position: "lower",
          bunkBlock: "B",
          status: "occupied",
          occupiedBy: { userId: tenant._id, occupiedSince: new Date() },
        },
        { id: "bed-2", code: "204-B-U", position: "upper", bunkBlock: "B", status: "available" },
      ],
    });

    reservation = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      branch: "gil-puyat",
      status: "moveIn",
      checkInDate: new Date("2026-06-15"),
      leaseDuration: 3,
      monthlyRent: 5400,
      selectedBed: { id: "bed-1", position: "lower", code: "204-B-L" },
    });

    activeStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      branch: "gil-puyat",
      roomId: room._id,
      bedId: "lower", // Notice position string
      leaseStartDate: new Date("2026-06-15"),
      leaseEndDate: new Date("2026-09-15"),
      monthlyRent: 5400,
      status: "active",
    });

    reservation.currentStayId = activeStay._id;
    await reservation.save();

    currentContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      stayId: activeStay._id,
      branch: "gil-puyat",
      roomNumber: "204",
      bedLabel: "204-B-L",
      status: "active",
      isCurrent: true,
      isCanonical: true,
      leaseStartDate: new Date("2026-06-15"),
      leaseEndDate: new Date("2026-09-15"),
      leaseDurationMonths: 3,
      monthlyRent: 5400,
    });

    upcomingStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      previousStayId: activeStay._id,
      branch: "gil-puyat",
      roomId: room._id,
      bedId: "lower",
      leaseStartDate: new Date("2026-09-16"),
      leaseEndDate: new Date("2026-12-16"),
      monthlyRent: 5400,
      status: "upcoming",
    });

    renewalContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      stayId: upcomingStay._id,
      replacesContractId: currentContract._id,
      contractPurpose: "renewal",
      branch: "gil-puyat",
      roomNumber: "204",
      bedLabel: "204-B-L",
      status: "generated", // generated status
      isCurrent: false,
      isCanonical: true,
      leaseStartDate: new Date("2026-09-16"),
      leaseEndDate: new Date("2026-12-16"),
      leaseDurationMonths: 3,
      monthlyRent: 5400,
    });

    extensionRequest = await StayExtensionRequest.create({
      tenantId: tenant._id,
      reservationId: reservation._id,
      stayId: activeStay._id,
      contractId: currentContract._id,
      roomId: room._id,
      branch: "gil-puyat",
      status: "approved",
      successorStayId: upcomingStay._id,
      months: 3,
      monthlyRent: 5400,
      currentStartDate: new Date("2026-06-15"),
      currentEndDate: new Date("2026-09-15"),
      requestedEndDate: new Date("2026-12-16"),
    });
  });

  test("moveOutStayWorkflow cancels renewal contracts, upcoming stays, and extension requests", async () => {
    await moveOutStayWorkflow({
      reservationId: reservation._id,
      payload: {
        confirm: true,
        moveOutDate: "2026-09-15",
        reason: "normal_completion",
      },
      actorId: admin._id,
    });

    // 1. Current contract is expired
    const updatedCurrent = await Contract.findById(currentContract._id);
    expect(updatedCurrent.status).toBe("expired");
    expect(updatedCurrent.isCurrent).toBe(false);

    // 2. Renewal contract in 'generated' status is cancelled
    const updatedRenewal = await Contract.findById(renewalContract._id);
    expect(updatedRenewal.status).toBe("cancelled");

    // 3. Upcoming stay is cancelled
    const updatedUpcomingStay = await Stay.findById(upcomingStay._id);
    expect(updatedUpcomingStay.status).toBe("cancelled");

    // 4. StayExtensionRequest is marked cancelled
    const updatedExtension = await StayExtensionRequest.findById(extensionRequest._id);
    expect(updatedExtension.status).toBe("cancelled");

    // 5. Room bed is vacated
    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.beds[0].status).toBe("available");
    expect(updatedRoom.currentOccupancy).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/utils/tenantActionService.moveOutCascade.integration.test.js`
Expected: FAIL because `moveOutStayWorkflow` only cancels published renewals and doesn't cancel upcoming stays or extension requests.

- [ ] **Step 3: Update `moveOutStayWorkflow` in `server/utils/tenantActionService.js`**

Modify lines 3425-3443 in `server/utils/tenantActionService.js`:
```javascript
        // Cancel all unfulfilled successor/renewal/replacement contracts in any pre-effective status
        const UNFULFILLED_SUCCESSOR_STATUSES = [
          "draft",
          "incomplete",
          "ready_for_generation",
          "generated",
          "awaiting_signatures",
          "partially_signed",
          "signed",
          "awaiting_notarization",
          "ready_for_publication",
          "published",
          "renewal_pending",
        ];

        const danglingRenewals = await Contract.find({
          $or: [
            { replacesContractId: currentContract._id },
            { reservationId: reservation._id, contractPurpose: { $in: ["renewal", "replacement"] } },
          ],
          status: { $in: UNFULFILLED_SUCCESSOR_STATUSES },
        }).session(session);

        for (const renewal of danglingRenewals) {
          await transitionContract(
            renewal,
            "cancelled",
            actorId,
            "predecessor_moved_out",
            session,
          );
        }

        // Cancel all future/upcoming Stays linked to this reservation/tenant
        await Stay.updateMany(
          {
            $or: [
              { reservationId: reservation._id },
              { tenantId: reservation.userId?._id || reservation.userId },
            ],
            status: "upcoming",
          },
          {
            $set: {
              status: "cancelled",
              endedAt: moveOutAt,
              endReason: "tenant_moved_out",
              updatedBy: actorId,
            },
          },
          { session }
        );

        // Cancel any open or approved StayExtensionRequests
        await StayExtensionRequest.updateMany(
          {
            $or: [
              { reservationId: reservation._id },
              { tenantId: reservation.userId?._id || reservation.userId },
            ],
            status: { $in: ["pending", "approved"] },
          },
          {
            $set: {
              status: "cancelled",
              adminNote: "Cancelled automatically due to tenant move-out.",
              reviewedBy: actorId,
              reviewedAt: new Date(),
            },
          },
          { session }
        );
        reservation.pendingExtensionRequestId = undefined;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/utils/tenantActionService.moveOutCascade.integration.test.js`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add server/utils/tenantActionService.js server/utils/tenantActionService.moveOutCascade.integration.test.js
git commit -m "fix(tenancy): cascade-cancel upcoming stays, extension requests, and renewal contracts on move-out"
```

---

### Task 3: Contract Lineage & Upcoming Contract Tenancy Isolation

**Files:**
- Modify: `server/services/tenantContractSelectionService.js`
- Modify: `server/controllers/contractController.js`
- Create Test: `server/services/tenantContractSelectionService.lifecycleIsolation.test.js`

**Interfaces:**
- Consumes: `resolveTenantUpcomingContract(tenantId)`, `attachContractLineage(contracts)`, `getMyCurrentContract(req, res)`
- Produces: Upcoming contracts and lineage counts strictly bounded by the active tenancy lifecycle.

- [ ] **Step 1: Write unit test for lifecycle isolation**

```javascript
// server/services/tenantContractSelectionService.lifecycleIsolation.test.js
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Contract, Stay, User, Reservation } from "../models/index.js";
import {
  resolveTenantUpcomingContract,
  attachContractLineage,
} from "./tenantContractSelectionService.js";

describe("tenantContractSelectionService lifecycle isolation", () => {
  let mongod, tenant, oldReservation, newReservation, oldStay, newStay, oldContract, oldUpcomingStay, oldRenewalContract, newContract;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();

    tenant = await User.create({
      firstName: "Test",
      lastName: "Tenant",
      email: "tenant@example.com",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });

    // 1. Old reservation (moved-out)
    oldReservation = await Reservation.create({
      userId: tenant._id,
      status: "moveOut",
      checkInDate: new Date("2026-01-01"),
      moveOutDate: new Date("2026-06-01"),
    });

    oldStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: oldReservation._id,
      status: "completed",
      leaseStartDate: new Date("2026-01-01"),
      leaseEndDate: new Date("2026-06-01"),
    });

    oldContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: oldReservation._id,
      stayId: oldStay._id,
      status: "expired",
      isCurrent: false,
      leaseStartDate: new Date("2026-01-01"),
      leaseEndDate: new Date("2026-06-01"),
    });

    // Stale renewal from old stay (cancelled)
    oldRenewalContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: oldReservation._id,
      contractPurpose: "renewal",
      replacesContractId: oldContract._id,
      status: "cancelled",
      isCurrent: false,
    });

    // 2. New reservation (current)
    newReservation = await Reservation.create({
      userId: tenant._id,
      status: "moveIn",
      checkInDate: new Date("2026-09-16"),
    });

    newStay = await Stay.create({
      tenantId: tenant._id,
      reservationId: newReservation._id,
      status: "active",
      leaseStartDate: new Date("2026-09-16"),
      leaseEndDate: new Date("2026-12-16"),
    });

    newContract = await Contract.create({
      tenantId: tenant._id,
      reservationId: newReservation._id,
      stayId: newStay._id,
      status: "active",
      isCurrent: true,
      isCanonical: true,
      leaseStartDate: new Date("2026-09-16"),
      leaseEndDate: new Date("2026-12-16"),
    });
  });

  test("resolveTenantUpcomingContract returns null when no active upcoming stay exists for the current tenancy", async () => {
    const upcoming = await resolveTenantUpcomingContract(tenant._id);
    expect(upcoming).toBeNull();
  });

  test("attachContractLineage starts new reservation tenancy at Term #1", async () => {
    const allContracts = await Contract.find({ tenantId: tenant._id });
    const lineage = attachContractLineage(allContracts, { activeReservationId: newReservation._id });
    const currentNew = lineage.find((c) => String(c._id) === String(newContract._id));
    expect(currentNew.termNumber).toBe(1);
    expect(currentNew.termLabel).toBe("Term #1: Initial Stay");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/services/tenantContractSelectionService.lifecycleIsolation.test.js`
Expected: FAIL due to lineage treating all lifetime contracts as consecutive terms.

- [ ] **Step 3: Update `resolveTenantUpcomingContract` and `attachContractLineage` in `tenantContractSelectionService.js`**

Modify `server/services/tenantContractSelectionService.js`:
```javascript
export const resolveTenantUpcomingContract = async (tenantId) => {
  const [canonical, activeStay] = await Promise.all([
    resolveTenantCanonicalContract(tenantId).catch(() => null),
    resolveCurrentStayForTenant(tenantId).lean().catch(() => null),
  ]);

  if (!canonical || !activeStay) return null;

  // Find upcoming Stays strictly chained to the current active stay
  const upcomingStays = await Stay.find({
    tenantId,
    previousStayId: activeStay._id,
    status: "upcoming",
  }).select("_id").lean();

  const upcomingStayIds = (upcomingStays || []).map((s) => s._id);
  const orConditions = [{ replacesContractId: canonical._id }];
  if (upcomingStayIds.length > 0) {
    orConditions.push({ stayId: { $in: upcomingStayIds } });
  }

  const upcoming = await Contract.find({
    tenantId,
    $or: orConditions,
    status: { $in: Array.from(UPCOMING_VISIBLE_STATUSES) },
    archivedAt: null,
    duplicateOfContractId: null,
  }).sort({ createdAt: -1 });

  return upcoming[0] || null;
};

export const attachContractLineage = (contracts = [], options = {}) => {
  const validContracts = contracts.filter((c) => {
    if (!c) return false;
    if (c.duplicateOfContractId || c.archivedAt) return false;
    if (["voided", "cancelled", "rejected"].includes(c.status)) return false;
    return true;
  });

  // Group contracts by reservationId so each tenancy lifecycle has its own independent Term #1 -> Term #N progression
  const lineageMap = new Map();
  const reservationGroups = new Map();

  validContracts.forEach((contract) => {
    const resKey = contract.reservationId ? String(contract.reservationId) : "standalone";
    if (!reservationGroups.has(resKey)) {
      reservationGroups.set(resKey, []);
    }
    reservationGroups.get(resKey).push(contract);
  });

  reservationGroups.forEach((groupContracts) => {
    const sorted = [...groupContracts].sort((a, b) => {
      const startA = a.leaseStartDate ? new Date(a.leaseStartDate).getTime() : new Date(a.createdAt || 0).getTime();
      const startB = b.leaseStartDate ? new Date(b.leaseStartDate).getTime() : new Date(b.createdAt || 0).getTime();
      if (startA !== startB) return startA - startB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    sorted.forEach((contract, index) => {
      const termNumber = index + 1;
      const durationMonths = computeContractDurationMonths(contract);
      const isShortTerm = durationMonths < 6;
      const termLabel = buildTermLabel(termNumber, contract);
      lineageMap.set(String(contract._id || contract.id), {
        termNumber,
        termLabel,
        isShortTerm,
        leaseDurationMonths: durationMonths,
      });
    });
  });

  return contracts.map((c) => {
    const contractId = String(c._id || c.id || "");
    const lineage = lineageMap.get(contractId) || {
      termNumber: 1,
      termLabel: "Term #1: Initial Stay",
      isShortTerm: computeContractDurationMonths(c) < 6,
      leaseDurationMonths: computeContractDurationMonths(c),
    };
    if (c.toObject) {
      return { ...c.toObject(), ...lineage };
    }
    return { ...c, ...lineage };
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/services/tenantContractSelectionService.lifecycleIsolation.test.js`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add server/services/tenantContractSelectionService.js server/controllers/contractController.js server/services/tenantContractSelectionService.lifecycleIsolation.test.js
git commit -m "fix(contracts): isolate contract lineage and upcoming renewals by tenancy lifecycle"
```

---

### Task 4: Database Repair Script for Room 204 & Orphaned Extension Records

**Files:**
- Create: `server/scripts/repair_room204_and_stale_extensions.mjs`

**Interfaces:**
- Consumes: Database connection via `server/config/database.js` or `dotenv`.
- Produces: Cleaned Room 204 beds and cancelled orphaned extension records.

- [ ] **Step 1: Write repair script**

```javascript
// server/scripts/repair_room204_and_stale_extensions.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Room, Reservation, Contract, Stay, User } from "../models/index.js";
import StayExtensionRequest from "../models/StayExtensionRequest.js";

dotenv.config();

async function runRepair() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lilycrest";
  console.log("Connecting to MongoDB:", mongoUri);
  await mongoose.connect(mongoUri);

  try {
    console.log("\n--- REPAIRING ROOM 204 ---");
    const room = await Room.findOne({ roomNumber: "204" });
    if (room) {
      console.log(`Found Room 204 (capacity: ${room.capacity}, currentOccupancy: ${room.currentOccupancy})`);
      let freedBeds = 0;
      for (const bed of room.beds) {
        // Check if the bed occupant is moved-out or inactive
        if (bed.status === "occupied" || bed.status === "reserved" || bed.status === "locked") {
          const occupantUserId = bed.occupiedBy?.userId || bed.lockedBy;
          const occupantResId = bed.occupiedBy?.reservationId;

          let shouldFree = false;
          if (occupantUserId) {
            const user = await User.findById(occupantUserId).lean();
            if (!user || user.tenantStatus === "moved_out" || user.tenantStatus === "inactive") {
              shouldFree = true;
            }
          }
          if (occupantResId) {
            const res = await Reservation.findById(occupantResId).lean();
            if (!res || ["moveOut", "cancelled", "rejected", "completed"].includes(res.status)) {
              shouldFree = true;
            }
          }

          if (shouldFree) {
            console.log(`Freeing stuck bed slot ${bed.code || bed.id} (${bed.position}) previously marked ${bed.status}`);
            bed.status = "available";
            bed.lockedBy = null;
            bed.lockExpiresAt = null;
            bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
            freedBeds++;
          }
        }
      }

      // Recalculate real current occupancy based on active occupants
      const activeBeds = room.beds.filter((b) => b.status === "occupied" || b.status === "reserved");
      room.currentOccupancy = activeBeds.length;
      room.updateAvailability();
      await room.save();
      console.log(`Room 204 updated: freed ${freedBeds} beds. New occupancy: ${room.currentOccupancy}, available: ${room.available}`);
    } else {
      console.log("Room 204 not found in database.");
    }

    console.log("\n--- REPAIRING ORPHANED EXTENSION RECORDS & CONTRACTS ---");
    // Find moved-out reservations that have dangling upcoming stays or generated renewal contracts
    const movedOutReservations = await Reservation.find({ status: "moveOut" }).select("_id userId").lean();
    for (const res of movedOutReservations) {
      const cancelledRenewals = await Contract.updateMany(
        {
          reservationId: res._id,
          contractPurpose: { $in: ["renewal", "replacement"] },
          status: { $in: ["generated", "awaiting_signatures", "published", "renewal_pending", "ready_for_publication"] },
        },
        {
          $set: {
            status: "cancelled",
            cancellationReason: "predecessor_moved_out",
            isCurrent: false,
          },
        }
      );
      if (cancelledRenewals.modifiedCount > 0) {
        console.log(`Reservation ${res._id}: cancelled ${cancelledRenewals.modifiedCount} stale renewal contract(s).`);
      }

      const cancelledStays = await Stay.updateMany(
        {
          reservationId: res._id,
          status: "upcoming",
        },
        {
          $set: {
            status: "cancelled",
            endReason: "tenant_moved_out",
          },
        }
      );
      if (cancelledStays.modifiedCount > 0) {
        console.log(`Reservation ${res._id}: cancelled ${cancelledStays.modifiedCount} stale upcoming stay(s).`);
      }

      const cancelledExts = await StayExtensionRequest.updateMany(
        {
          reservationId: res._id,
          status: { $in: ["pending", "approved"] },
        },
        {
          $set: {
            status: "cancelled",
            adminNote: "Cancelled via move-out repair.",
          },
        }
      );
      if (cancelledExts.modifiedCount > 0) {
        console.log(`Reservation ${res._id}: cancelled ${cancelledExts.modifiedCount} stale extension request(s).`);
      }
    }

    console.log("\nRepair completed successfully.");
  } catch (error) {
    console.error("Repair failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

runRepair();
```

- [ ] **Step 2: Commit script**

```bash
git add server/scripts/repair_room204_and_stale_extensions.mjs
git commit -m "feat(scripts): add automated repair script for Room 204 beds and stale extension records"
```

---

### Task 5: Verification & Full Suite Run

- [ ] **Step 1: Run all unit and integration test suites**
- [ ] **Step 2: Run web build check (`npm run build`)**
- [ ] **Step 3: Run the repair script against local MongoDB instance**
