import { describe, expect, test } from "@jest/globals";
import {
  attachContractLineage,
  buildTermLabel,
  computeContractDurationMonths,
  computeDocumentReadinessScore,
  isResidentContractEligible,
  selectCanonicalTenantContract,
} from "./tenantContractSelectionService.js";

const contract = (overrides = {}) => ({
  _id: overrides._id || "contract-1",
  tenantId: "tenant-1",
  reservationId: "reservation-1",
  stayId: "stay-1",
  status: "generated",
  isCurrent: true,
  isCanonical: true,
  publicationStatus: "ready_for_resident",
  preparedDocuments: [{ version: 1, superseded: false }],
  ...overrides,
});
const activeStay = { _id: "stay-1", reservationId: "reservation-1" };

describe("resident canonical Contract selection", () => {
  test("returns one canonical prepared Contract", () => {
    expect(selectCanonicalTenantContract({ contracts: [contract()], activeStay })?._id)
      .toBe("contract-1");
  });

  test("ignores a newer needs-attention duplicate", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({ _id: "canonical" }),
        contract({
          _id: "duplicate",
          status: "incomplete",
          duplicateOfContractId: "canonical",
          isCanonical: false,
          publicationStatus: "internal",
        }),
      ],
      activeStay,
    });
    expect(selected._id).toBe("canonical");
  });

  test("does not expose an internal incomplete Contract", () => {
    expect(selectCanonicalTenantContract({
      contracts: [contract({ status: "incomplete", publicationStatus: "internal" })],
      activeStay,
    })).toBeNull();
  });

  test.each([
    { status: "voided" },
    { status: "cancelled" },
    { status: "rejected" },
    { duplicateOfContractId: "contract-0", isCanonical: false },
    { supersededByContractId: "contract-2", isCurrent: false },
  ])("excludes invalid primary Contract %#", (overrides) => {
    expect(isResidentContractEligible(contract(overrides))).toBe(false);
  });

  test("returns a safe integrity conflict for multiple canonical candidates when strictIntegrityCheck is enabled", () => {
    expect(() => selectCanonicalTenantContract({
      contracts: [contract({ _id: "one" }), contract({ _id: "two" })],
      activeStay,
      strictIntegrityCheck: true,
    })).toThrow("Multiple tenant-visible canonical Contracts were found.");
  });

  test("gracefully tie-breaks multiple canonical contracts by default without throwing", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [contract({ _id: "one" }), contract({ _id: "two" })],
      activeStay,
    });
    expect(selected?._id).toBe("one");
  });

  test("computeDocumentReadinessScore calculates points accurately based on document readiness", () => {
    expect(computeDocumentReadinessScore(null)).toBe(0);
    expect(computeDocumentReadinessScore({})).toBe(0);
    expect(computeDocumentReadinessScore({ status: "draft" })).toBe(0);
    expect(computeDocumentReadinessScore({ status: "generated" })).toBe(1);
    expect(computeDocumentReadinessScore({ preparedDocuments: [{ version: 1 }] })).toBe(1);
    expect(computeDocumentReadinessScore({ signedDocuments: [{ version: 1 }] })).toBe(2);
    expect(computeDocumentReadinessScore({ status: "generated", signedDocuments: [{ version: 1 }] })).toBe(3);
    expect(computeDocumentReadinessScore({ notarizedDocuments: [{ version: 1 }] })).toBe(4);
    expect(computeDocumentReadinessScore({
      status: "generated",
      preparedDocuments: [{ version: 1 }],
      signedDocuments: [{ version: 1 }],
      notarizedDocuments: [{ version: 1 }],
    })).toBe(7);
  });

  test("gracefully tie-breaks multiple canonical contracts by document readiness score", () => {
    const preparedOnly = contract({
      _id: "prepared-contract",
      status: "generated",
      preparedDocuments: [{ version: 1 }],
      signedDocuments: [],
      notarizedDocuments: [],
    });
    const signedContract = contract({
      _id: "signed-contract",
      status: "signed",
      preparedDocuments: [{ version: 1 }],
      signedDocuments: [{ version: 1 }],
      notarizedDocuments: [],
    });
    const notarizedContract = contract({
      _id: "notarized-contract",
      status: "notarized",
      preparedDocuments: [{ version: 1 }],
      signedDocuments: [{ version: 1 }],
      notarizedDocuments: [{ version: 1 }],
    });

    // Notarized (+4 +2 +1 = 7) beats Signed (+2 +1 = 3) and Prepared (+1 = 1)
    const selected1 = selectCanonicalTenantContract({
      contracts: [preparedOnly, signedContract, notarizedContract],
      activeStay,
    });
    expect(selected1._id).toBe("notarized-contract");

    // Signed (+2 +1 = 3) beats Prepared (+1 = 1)
    const selected2 = selectCanonicalTenantContract({
      contracts: [preparedOnly, signedContract],
      activeStay,
    });
    expect(selected2._id).toBe("signed-contract");
  });

  test("gracefully tie-breaks identical multiple canonical contracts by newest creation date", () => {
    const older = contract({
      _id: "older-contract",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const newer = contract({
      _id: "newer-contract",
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    });
    const selected = selectCanonicalTenantContract({
      contracts: [older, newer],
      activeStay,
    });
    expect(selected._id).toBe("newer-contract");
  });

  test("gracefully tie-breaks multiple canonical contracts by newest update date over older creation date", () => {
    const updatedContract = contract({
      _id: "updated-contract",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    });
    const olderUpdatedContract = contract({
      _id: "older-updated-contract",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-15T00:00:00.000Z"),
    });
    const selected = selectCanonicalTenantContract({
      contracts: [olderUpdatedContract, updatedContract],
      activeStay,
    });
    expect(selected._id).toBe("updated-contract");
  });

  test("gracefully tie-breaks multiple canonical contracts by version when timestamps match", () => {
    const v1Contract = contract({
      _id: "v1-contract",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      version: 1,
    });
    const v2Contract = contract({
      _id: "v2-contract",
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      version: 2,
    });
    const selected = selectCanonicalTenantContract({
      contracts: [v1Contract, v2Contract],
      activeStay,
    });
    expect(selected._id).toBe("v2-contract");
  });

  test("prefers the Contract linked to the active stay over an older stay", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({ _id: "old", stayId: "stay-old", reservationId: "reservation-old" }),
        contract({ _id: "current" }),
      ],
      activeStay,
    });
    expect(selected._id).toBe("current");
  });

  test("selects an active renewal while the prior Contract is superseded", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({
          _id: "previous",
          status: "renewed",
          isCurrent: false,
          supersededByContractId: "renewal",
        }),
        contract({ _id: "renewal", contractPurpose: "renewal" }),
      ],
      activeStay,
    });
    expect(selected._id).toBe("renewal");
  });

  test("a not-yet-effective renewal successor never outranks its still-active predecessor, even when it already carries the new (already-swapped) Stay's stayId", () => {
    // Reproduces the exact scenario found during Phase 2 research:
    // renewStayWorkflow swaps the active Stay immediately at acceptance,
    // before the new lease even starts, so a freshly-generated renewal
    // successor Contract can carry the *new* Stay's stayId (rank 400)
    // while its predecessor only matches by reservationId (rank 300) —
    // without the fix, the not-yet-effective successor would win.
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({ _id: "current", status: "active" }),
        contract({
          _id: "renewal-successor",
          contractPurpose: "renewal",
          replacesContractId: "current",
          status: "published",
          stayId: "stay-1", // matches activeStay — would otherwise rank 400
          leaseStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
      ],
      activeStay,
      now: new Date(),
    });
    expect(selected._id).toBe("current");
  });

  test("a renewal successor whose effective date has already arrived is eligible to be selected (post-activation, isCurrent already flipped)", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({ _id: "old", status: "replaced", isCurrent: false, supersededByContractId: "renewal-successor" }),
        contract({
          _id: "renewal-successor",
          contractPurpose: "renewal",
          replacesContractId: "old",
          status: "active",
          leaseStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }),
      ],
      activeStay: { _id: "stay-1", reservationId: "reservation-1" },
      now: new Date(),
    });
    expect(selected._id).toBe("renewal-successor");
  });

  test("keeps legacy generated Contracts visible without exposing legacy drafts", () => {
    expect(isResidentContractEligible(contract({ publicationStatus: undefined }))).toBe(true);
    expect(isResidentContractEligible(contract({
      status: "draft",
      publicationStatus: undefined,
    }))).toBe(false);
  });

  test("draft/incomplete/ready_for_generation stay invisible by default (unchanged Web behavior)", () => {
    for (const status of ["draft", "incomplete", "ready_for_generation"]) {
      expect(isResidentContractEligible(contract({ status, publicationStatus: undefined }))).toBe(false);
    }
  });

  test("includeEarlyStages surfaces a fresh draft Contract for the tenant that owns it (mobile-only opt-in)", () => {
    for (const status of ["draft", "incomplete", "ready_for_generation"]) {
      expect(isResidentContractEligible(
        contract({ status, publicationStatus: undefined }),
        { includeEarlyStages: true },
      )).toBe(true);
    }
  });

  test("includeEarlyStages does not weaken ownership/withdrawal/archival guards", () => {
    expect(isResidentContractEligible(
      contract({ status: "draft", archivedAt: new Date() }),
      { includeEarlyStages: true },
    )).toBe(false);
    expect(isResidentContractEligible(
      contract({ status: "draft", isCurrent: false }),
      { includeEarlyStages: true },
    )).toBe(false);
    expect(isResidentContractEligible(
      contract({ status: "draft", publicationStatus: "withdrawn" }),
      { includeEarlyStages: true },
    )).toBe(false);
    expect(isResidentContractEligible(
      contract({ status: "draft", duplicateOfContractId: "canonical" }),
      { includeEarlyStages: true },
    )).toBe(false);
  });

  test("selectCanonicalTenantContract with includeEarlyStages returns the tenant's own draft Contract", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [contract({ _id: "draft-1", status: "draft", publicationStatus: undefined })],
      activeStay,
      includeEarlyStages: true,
    });
    expect(selected?._id).toBe("draft-1");
  });

  test("selectCanonicalTenantContract without includeEarlyStages still hides the same draft Contract (Web unaffected)", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [contract({ _id: "draft-1", status: "draft", publicationStatus: undefined })],
      activeStay,
    });
    expect(selected).toBeNull();
  });

  test("archived metadata excludes a record even when its stale status is resident-visible", () => {
    expect(selectCanonicalTenantContract({
      contracts: [contract({ status: "generated", archivedAt: new Date() })],
      activeStay,
    })).toBeNull();
  });

  // Tenant Details required scenario: a historical Contract (expired/terminal
  // status) sitting alongside the tenant's current Contract must never win —
  // the frontend must display exactly what this selector returns, never guess.
  test("historical Contract never outranks the current Contract for the same tenant", () => {
    const historical = contract({
      _id: "historical",
      status: "expired",
      isCurrent: false,
      stayId: "stay-old",
      reservationId: "reservation-old",
    });
    const current = contract({ _id: "current" });
    const selected = selectCanonicalTenantContract({
      contracts: [historical, current],
      activeStay,
    });
    expect(selected._id).toBe("current");
  });

  // Tenant Details required scenario: an archived Contract sitting alongside
  // the tenant's current (non-archived) Contract must never win.
  test("archived Contract never outranks the current (non-archived) Contract for the same tenant", () => {
    const archived = contract({
      _id: "archived",
      archivedAt: new Date(),
      isCurrent: false,
    });
    const current = contract({ _id: "current" });
    const selected = selectCanonicalTenantContract({
      contracts: [archived, current],
      activeStay,
    });
    expect(selected._id).toBe("current");
  });

  // Reproduces the production mobile/web discrepancy where the tenant's
  // admin-visible "Verified Active Stay" Contract (dates, room, PDF) was
  // authoritative, but the mobile app still showed "Preparing Contract" with
  // different (stale) dates for the same tenant. Root cause: a pre-generation
  // draft Contract created at reservation time inherits the active Stay's
  // stayId (relationshipRank 400); the later, fully-generated/active Contract
  // for the same stay is only linked by reservationId (rank 300) because its
  // stayId was never backfilled. Ranking by relationship strength alone let
  // the stale draft outrank the real, tenant-visible Contract whenever
  // includeEarlyStages is true (mobile's opt-in) — exactly reproducing wrong
  // dates and a false "Preparing" state despite a real PDF existing.
  test("a stale early-stage draft must never outrank a later fully-generated Contract for the same stay", () => {
    const staleDraft = contract({
      _id: "draft-old",
      status: "draft",
      publicationStatus: undefined,
      stayId: "stay-1",
      leaseStartDate: "2026-09-13",
      leaseEndDate: "2027-09-13",
    });
    const correctedActive = contract({
      _id: "active-new",
      status: "active",
      publicationStatus: "published",
      tenantVisible: true,
      stayId: null,
      leaseStartDate: "2026-08-12",
      leaseEndDate: "2027-09-12",
    });
    const selected = selectCanonicalTenantContract({
      contracts: [staleDraft, correctedActive],
      activeStay,
      includeEarlyStages: true,
    });
    expect(selected?._id).toBe("active-new");
  });

  test("among Contracts of the same tier, relationship strength still decides (unchanged)", () => {
    const selected = selectCanonicalTenantContract({
      contracts: [
        contract({ _id: "old", stayId: "stay-old", reservationId: "reservation-old" }),
        contract({ _id: "current", stayId: "stay-1" }),
      ],
      activeStay,
    });
    expect(selected._id).toBe("current");
  });

  // Reproduces the production defect: a tenant cancels a Reservation before
  // its draft Contract ever leaves early-stage, then reserves again. Without
  // cascade archival (contractArchiveService.js's
  // archiveContractForCancelledReservation, called from
  // cancellationController.js on every cancel path), both drafts are
  // equally eligible under includeEarlyStages and this throws
  // MULTIPLE_CANONICAL_CONTRACTS for Admin PDF download, Tenant Web
  // /api/contracts/my, and Mobile alike (confirmed against the live
  // "LIL-GP-2026-00021 / LIL-GP-2026-00022" tenant record).
  test("an orphaned draft from a cancelled Reservation collides with the tenant's real draft until archived (in strict integrity mode)", () => {
    const cancelledReservationOrphan = contract({
      _id: "orphan-from-cancelled-reservation",
      reservationId: "reservation-cancelled",
      status: "draft",
      publicationStatus: undefined,
    });
    const currentDraft = contract({
      _id: "current-draft",
      reservationId: "reservation-active",
      status: "draft",
      publicationStatus: undefined,
    });

    expect(() => selectCanonicalTenantContract({
      contracts: [cancelledReservationOrphan, currentDraft],
      activeStay: null,
      includeEarlyStages: true,
      strictIntegrityCheck: true,
    })).toThrow(expect.objectContaining({ code: "MULTIPLE_CANONICAL_CONTRACTS" }));

    const selected = selectCanonicalTenantContract({
      contracts: [
        { ...cancelledReservationOrphan, archivedAt: new Date(), isCurrent: false, isCanonical: false },
        currentDraft,
      ],
      activeStay: null,
      includeEarlyStages: true,
    });
    expect(selected?._id).toBe("current-draft");
  });
});

describe("term lineage and duration computation", () => {
  test("computeContractDurationMonths calculates months accurately", () => {
    expect(computeContractDurationMonths({ leaseDurationMonths: 6 })).toBe(6);
    expect(computeContractDurationMonths({ leaseDurationMonths: "3" })).toBe(3);
    expect(computeContractDurationMonths({
      leaseStartDate: "2026-02-01",
      leaseEndDate: "2026-05-01",
    })).toBe(3);
    expect(computeContractDurationMonths({})).toBe(12);
  });

  test("buildTermLabel formats initial stay and extension terms", () => {
    expect(buildTermLabel(1, {})).toBe("Term #1: Initial Stay");
    expect(buildTermLabel(2, {})).toBe("Term #2: Stay Extension");
    expect(buildTermLabel(3, {})).toBe("Term #3: Stay Extension");
  });

  test("attachContractLineage assigns chronological term numbers and labels", () => {
    const contracts = [
      {
        _id: "c2",
        leaseStartDate: "2026-08-01",
        createdAt: "2026-07-15",
        leaseDurationMonths: 3,
        status: "active",
      },
      {
        _id: "c1",
        leaseStartDate: "2026-02-01",
        createdAt: "2026-01-15",
        leaseDurationMonths: 6,
        status: "expired",
      },
      {
        _id: "c3",
        leaseStartDate: "2026-11-01",
        createdAt: "2026-10-15",
        leaseDurationMonths: 3,
        status: "generated",
      },
      {
        _id: "c-dup",
        duplicateOfContractId: "c1",
        status: "draft",
      },
    ];

    const withLineage = attachContractLineage(contracts);
    expect(withLineage).toHaveLength(4);

    const c1Res = withLineage.find((c) => c._id === "c1");
    expect(c1Res.termNumber).toBe(1);
    expect(c1Res.termLabel).toBe("Term #1: Initial Stay");
    expect(c1Res.isShortTerm).toBe(false);

    const c2Res = withLineage.find((c) => c._id === "c2");
    expect(c2Res.termNumber).toBe(2);
    expect(c2Res.termLabel).toBe("Term #2: Stay Extension");
    expect(c2Res.isShortTerm).toBe(true);

    const c3Res = withLineage.find((c) => c._id === "c3");
    expect(c3Res.termNumber).toBe(3);
    expect(c3Res.termLabel).toBe("Term #3: Stay Extension");
    expect(c3Res.isShortTerm).toBe(true);
  });
});
