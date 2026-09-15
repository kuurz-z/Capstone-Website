# Enforce Solitary Tenancy Lifecycle & Contract Acknowledgement Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure stay extensions are strictly confined within their single reservation lifecycle, auto-cancelled upon move-out, and guarantee that all new contracts (initial reservation draft, extension renewal, and final notarized lease) strictly require tenant acknowledgement before progressing.

**Architecture:**
1. Tenancy lifecycle isolation guarantees that all stay extensions (`StayExtensionRequest`, `upcoming` Stay, and renewal `Contract`) are bound strictly to the active reservation. Move-out terminates and archives the entire lifecycle.
2. Every new reservation generates a fresh contract with a unique version and hash, requiring explicit tenant review and acknowledgement (`POST /api/contracts/my/:id/acknowledgement`).
3. An end-to-end multi-lifecycle integration test suite verifies the complete round-trip across new booking -> draft acknowledgement -> extension -> renewal acknowledgement -> move-out -> re-booking -> fresh Term #1 acknowledgement.

**Tech Stack:** Node.js, Express.js, MongoDB / Mongoose, Jest, React / Vite.

**Spec:** [docs/superpowers/plans/2026-09-16-enforce-solo-lifecycle-and-contract-acknowledgement.md](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/docs/superpowers/plans/2026-09-16-enforce-solo-lifecycle-and-contract-acknowledgement.md)

## Global Constraints
- Strictly enforce standardized API contracts (`{ success: true, ... }`).
- Terminology: "Tenant" (NEVER "Resident"), "Rent" (NEVER "Rental Fee"), "Assistant" (NEVER "Copilot"), "Owner" (NEVER "Super Admin").
- Atomic operations on MongoDB documents to prevent race conditions.
- Zero breaking changes to mobile endpoints (`/api/mobile/...`).

---

### Task 1: Contract Acknowledgement Multi-Lifecycle Integration Test Suite

**Files:**
- Create: `server/services/contractAcknowledgementService.multiLifecycle.integration.test.js`

**Interfaces:**
- Consumes: `acknowledgeContract`, `getAcknowledgementStatusForContract`, `moveOutStayWorkflow`, `renewStayWorkflow`, `resolveTenantCanonicalContract`, `resolveTenantUpcomingContract`
- Produces: Verified end-to-end integration test proving that every new contract lifecycle requires acknowledgement and that past acknowledgements do not leak across move-outs.

- [ ] **Step 1: Write integration test for multi-lifecycle contract acknowledgement**

```javascript
// server/services/contractAcknowledgementService.multiLifecycle.integration.test.js
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  Contract,
  ContractAcknowledgement,
  Reservation,
  Room,
  Stay,
  User,
} from "../models/index.js";
import {
  acknowledgeContract,
  getAcknowledgementStatusForContract,
} from "./contractAcknowledgementService.js";
import { moveOutStayWorkflow, renewStayWorkflow } from "../utils/tenantActionService.js";
import {
  resolveTenantCanonicalContract,
  resolveTenantUpcomingContract,
  attachContractLineage,
} from "./tenantContractSelectionService.js";

describe("Contract Acknowledgement & Solitary Lifecycle Integration", () => {
  let mongod;
  let tenant, admin, room;

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
      firstName: "Leander",
      lastName: "Ponce",
      email: "tenant@example.com",
      role: "tenant",
      tenantStatus: "active",
      branch: "gil-puyat",
    });

    admin = await User.create({
      firstName: "Admin",
      lastName: "Officer",
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
      currentOccupancy: 0,
      price: 5400,
      beds: [
        { id: "bed-1", code: "204-B-L", position: "lower", bunkBlock: "B", status: "available" },
        { id: "bed-2", code: "204-B-U", position: "upper", bunkBlock: "B", status: "available" },
      ],
    });
  });

  test("Lifecycle 1: Book -> Acknowledge -> Extend -> Acknowledge Renewal -> Move-Out", async () => {
    // 1. Initial Reservation
    const res1 = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      branch: "gil-puyat",
      status: "moveIn",
      checkInDate: new Date("2026-06-15"),
      leaseDuration: 3,
      monthlyRent: 5400,
      selectedBed: { id: "bed-1", position: "lower", code: "204-B-L" },
    });

    const stay1 = await Stay.create({
      tenantId: tenant._id,
      reservationId: res1._id,
      roomId: room._id,
      bedId: "bed-1",
      branch: "gil-puyat",
      leaseStartDate: new Date("2026-06-15"),
      leaseEndDate: new Date("2026-09-15"),
      monthlyRent: 5400,
      status: "active",
    });
    res1.currentStayId = stay1._id;
    await res1.save();

    const contract1 = await Contract.create({
      tenantId: tenant._id,
      reservationId: res1._id,
      stayId: stay1._id,
      branch: "gil-puyat",
      roomNumber: "204",
      bedLabel: "204-B-L",
      status: "generated",
      isCurrent: true,
      isCanonical: true,
      leaseStartDate: new Date("2026-06-15"),
      leaseEndDate: new Date("2026-09-15"),
      leaseDurationMonths: 3,
      monthlyRent: 5400,
      preparedDocuments: [
        { version: 1, fileHash: "hash-c1-v1", path: "contracts/c1-v1.pdf", createdAt: new Date() },
      ],
    });

    // Verify acknowledgement is initially required but not acknowledged
    let ackStatus1 = await getAcknowledgementStatusForContract(contract1, tenant._id);
    expect(ackStatus1.required).toBe(true);
    expect(ackStatus1.acknowledged).toBe(false);

    // Tenant acknowledges draft
    await acknowledgeContract({
      contractId: contract1._id,
      tenantId: tenant._id,
      req: { ip: "127.0.0.1", get: () => "TestBrowser" },
    });

    ackStatus1 = await getAcknowledgementStatusForContract(contract1, tenant._id);
    expect(ackStatus1.required).toBe(true);
    expect(ackStatus1.acknowledged).toBe(true);

    // 2. Extend Stay (Term #2)
    const renewResult = await renewStayWorkflow({
      reservationId: res1._id,
      actorId: admin._id,
      payload: {
        confirm: true,
        newLeaseStartDate: "2026-09-16",
        newLeaseEndDate: "2026-12-16",
        monthlyRent: 5400,
      },
    });

    const upcomingContract = await resolveTenantUpcomingContract(tenant._id);
    expect(upcomingContract).not.toBeNull();
    expect(upcomingContract.contractPurpose).toBe("renewal");

    // Upcoming renewal contract also requires its own acknowledgement
    let ackUpcoming = await getAcknowledgementStatusForContract(upcomingContract, tenant._id);
    expect(ackUpcoming.required).toBe(true);
    expect(ackUpcoming.acknowledged).toBe(false);

    await acknowledgeContract({
      contractId: upcomingContract._id,
      tenantId: tenant._id,
      req: { ip: "127.0.0.1", get: () => "TestBrowser" },
    });

    ackUpcoming = await getAcknowledgementStatusForContract(upcomingContract, tenant._id);
    expect(ackUpcoming.acknowledged).toBe(true);

    // 3. Move Out
    await moveOutStayWorkflow({
      reservationId: res1._id,
      payload: { confirm: true, moveOutDate: "2026-09-15", reason: "normal_completion" },
      actorId: admin._id,
    });

    // Upcoming contract must now be cancelled
    const cancelledUpcoming = await resolveTenantUpcomingContract(tenant._id);
    expect(cancelledUpcoming).toBeNull();

    // 4. Lifecycle 2: Brand New Reservation
    const res2 = await Reservation.create({
      userId: tenant._id,
      roomId: room._id,
      branch: "gil-puyat",
      status: "moveIn",
      checkInDate: new Date("2026-10-01"),
      leaseDuration: 3,
      monthlyRent: 5400,
      selectedBed: { id: "bed-2", position: "upper", code: "204-B-U" },
    });

    const stay2 = await Stay.create({
      tenantId: tenant._id,
      reservationId: res2._id,
      roomId: room._id,
      bedId: "bed-2",
      branch: "gil-puyat",
      leaseStartDate: new Date("2026-10-01"),
      leaseEndDate: new Date("2027-01-01"),
      monthlyRent: 5400,
      status: "active",
    });
    res2.currentStayId = stay2._id;
    await res2.save();

    const contract2 = await Contract.create({
      tenantId: tenant._id,
      reservationId: res2._id,
      stayId: stay2._id,
      branch: "gil-puyat",
      roomNumber: "204",
      bedLabel: "204-B-U",
      status: "generated",
      isCurrent: true,
      isCanonical: true,
      leaseStartDate: new Date("2026-10-01"),
      leaseEndDate: new Date("2027-01-01"),
      leaseDurationMonths: 3,
      monthlyRent: 5400,
      preparedDocuments: [
        { version: 1, fileHash: "hash-c2-v1", path: "contracts/c2-v1.pdf", createdAt: new Date() },
      ],
    });

    // Check canonical contract is contract2
    const canonical2 = await resolveTenantCanonicalContract(tenant._id);
    expect(String(canonical2._id)).toBe(String(contract2._id));

    // Check term lineage: contract2 is Term #1: Initial Stay
    const allContracts = await Contract.find({ tenantId: tenant._id });
    const lineage = attachContractLineage(allContracts);
    const c2Lineage = lineage.find((c) => String(c._id) === String(contract2._id));
    expect(c2Lineage.termNumber).toBe(1);
    expect(c2Lineage.termLabel).toBe("Term #1: Initial Stay");

    // Check acknowledgement for new contract: MUST BE REQUIRED & NOT ACKNOWLEDGED
    let ackStatus2 = await getAcknowledgementStatusForContract(contract2, tenant._id);
    expect(ackStatus2.required).toBe(true);
    expect(ackStatus2.acknowledged).toBe(false);

    // Tenant acknowledges new contract draft
    await acknowledgeContract({
      contractId: contract2._id,
      tenantId: tenant._id,
      req: { ip: "127.0.0.1", get: () => "TestBrowser" },
    });

    ackStatus2 = await getAcknowledgementStatusForContract(contract2, tenant._id);
    expect(ackStatus2.acknowledged).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- server/services/contractAcknowledgementService.multiLifecycle.integration.test.js`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add server/services/contractAcknowledgementService.multiLifecycle.integration.test.js
git commit -m "test(contract): add multi-lifecycle contract acknowledgement and solitary stay extension integration suite"
```

---

### Task 2: Verification Suite

- [ ] **Step 1: Run complete test suite covering contract lifecycle & acknowledgements**
- [ ] **Step 2: Run web build check**
