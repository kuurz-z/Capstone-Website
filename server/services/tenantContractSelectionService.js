import { Contract, Stay } from "../models/index.js";

// Single source of truth for "is this Stay currently in effect" — i.e. the
// tenant's authoritative current lease. Historically this was defined
// three different ways across the codebase: this selector (active +
// ending_soon), and several call sites in tenantActionService.js /
// tenancyActionsController.js that matched only the exact "active" status.
// That divergence meant a Stay flipping active -> ending_soon (which is a
// normal, expected transition, not an anomaly) would still be "current" for
// this selector's ranking purposes but silently stop being "current" for
// ensureActiveStay/renewal/transfer, which would then fall through to
// creating a second Stay for the same reservation. Every current-lease
// lookup in the codebase should resolve through resolveCurrentStayFor* below
// instead of querying Stay directly with its own status list.
export const CURRENT_STAY_STATUSES = Object.freeze(["active", "ending_soon"]);

export const resolveCurrentStayForReservation = (reservationId, { session = null } = {}) =>
  Stay.findOne({ reservationId, status: { $in: CURRENT_STAY_STATUSES } })
    .sort({ leaseStartDate: -1 })
    .session(session);

export const resolveCurrentStayForTenant = (tenantId, { session = null } = {}) =>
  Stay.findOne({ tenantId, status: { $in: CURRENT_STAY_STATUSES } })
    .sort({ leaseStartDate: -1 })
    .session(session);

const PRIMARY_VISIBLE_STATUSES = new Set([
  "generated",
  "awaiting_signatures",
  "partially_signed",
  "signed",
  "awaiting_notarization",
  "notarized",
  "ready_for_publication",
  "published",
  "active",
  "expiring_soon",
]);

// Pre-generation lifecycle stages. Excluded from the default (web "My
// Contract") eligibility set intentionally — see
// tenantContractSelectionService.test.js "does not expose an internal
// incomplete Contract" / "without exposing legacy drafts". The mobile app's
// Contract requirement is different: a tenant must see their authoritative
// Contract as soon as it exists, before the prepared PDF is generated. Opt in
// per call site with `includeEarlyStages` rather than changing the shared
// default, so web behavior is unaffected.
// Exported so cascade cleanup (contractArchiveService.js's
// archiveContractForCancelledReservation) targets exactly the statuses this
// selector treats as pre-generation drafts — keeping "what counts as an
// early-stage Contract" defined in one place.
export const EARLY_STAGE_STATUSES = new Set([
  "draft",
  "incomplete",
  "ready_for_generation",
]);

const HISTORY_VISIBLE_STATUSES = new Set([
  "expired",
  "renewed",
  "replaced",
  "terminated",
  "cancelled",
  "archived",
  "completed",
]);

const id = (value) => String(value?._id || value || "");
const sameId = (left, right) => Boolean(id(left)) && id(left) === id(right);

export const isResidentContractEligible = (contract, { includeEarlyStages = false } = {}) => {
  if (!contract) return false;
  const statusVisible = PRIMARY_VISIBLE_STATUSES.has(contract.status) ||
    (includeEarlyStages && EARLY_STAGE_STATUSES.has(contract.status));
  if (!statusVisible) return false;
  if (contract.archivedAt) return false;
  if (contract.isCurrent === false || contract.isCanonical === false) return false;
  if (contract.duplicateOfContractId || contract.supersededByContractId || contract.supersededBy) {
    return false;
  }
  if (contract.publicationStatus === "withdrawn" || contract.publicationStatus === "internal") {
    return false;
  }
  return (
    contract.tenantVisible === true ||
    ["ready_for_resident", "published"].includes(contract.publicationStatus) ||
    // Backward compatibility for verified pre-publication records created
    // before publicationStatus existed, and for freshly created Contracts
    // (publicationStatus is unset until an admin acts on it) reached via
    // includeEarlyStages.
    contract.publicationStatus == null
  );
};

const relationshipRank = (contract, activeStay) => {
  if (!activeStay) return contract.isCurrent === false ? -1 : 100;
  if (sameId(contract.stayId, activeStay._id)) return 400;
  if (sameId(contract.reservationId, activeStay.reservationId)) return 300;
  if (sameId(contract.applicationId, activeStay.reservationId)) return 200;
  return -1;
};

// A stayId/reservationId match is only a relevance signal between Contracts
// that are otherwise equally "real" — it must never let a pre-generation
// draft outrank a Contract that has actually progressed (generated or
// beyond). Without this tier, a draft created at reservation time (and thus
// still carrying the original Stay's stayId) can outrank the tenant's later,
// fully-generated/published Contract for the same stay whenever that later
// Contract's stayId was never backfilled — reproduced in
// tenantContractSelectionService.test.js "a stale early-stage draft must
// never outrank a later fully-generated Contract for the same stay". This
// only changes ranking among candidates already passing
// isResidentContractEligible, so it can only matter when includeEarlyStages
// is true (mobile) — Web's default candidate set never contains an
// early-stage Contract in the first place, so this tier is a no-op there.
const stageTier = (contract) => (EARLY_STAGE_STATUSES.has(contract.status) ? 0 : 1);

// A renewal/replacement successor Contract is generated well before it
// takes effect (createSuccessorContractForRenewal/
// createReplacementContractForTransfer never touch the predecessor's
// isCurrent, and the successor itself is created with isCurrent: false —
// but renewStayWorkflow already swaps the tenant's active Stay immediately
// at acceptance, which would otherwise make relationshipRank's stayId match
// (400) outrank the still-legally-current predecessor's reservationId match
// (300) the instant the successor is generated, long before it's even
// signed. This must never happen — "current" always means "in effect
// today". A not-yet-effective successor is exposed separately via
// resolveTenantUpcomingContract below, not through this selector.
const isNotYetEffectiveSuccessor = (contract, now) => {
  if (!contract.replacesContractId) return false;
  if (!contract.leaseStartDate) return false;
  return new Date(contract.leaseStartDate).getTime() > now.getTime();
};

export const computeDocumentReadinessScore = (contract) => {
  if (!contract) return 0;
  let score = 0;
  if (Array.isArray(contract.notarizedDocuments) && contract.notarizedDocuments.length > 0) {
    score += 4;
  }
  if (Array.isArray(contract.signedDocuments) && contract.signedDocuments.length > 0) {
    score += 2;
  }
  if (
    (Array.isArray(contract.preparedDocuments) && contract.preparedDocuments.length > 0) ||
    contract.status === "generated"
  ) {
    score += 1;
  }
  return score;
};

const getCandidateTimestamp = (contract) => {
  const raw = contract?.updatedAt || contract?.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const getCandidateVersion = (contract) => {
  const v = Number(contract?.version);
  return Number.isNaN(v) ? 0 : v;
};

export const selectCanonicalTenantContract = ({
  contracts = [],
  activeStay = null,
  includeEarlyStages = false,
  now = new Date(),
  strictIntegrityCheck = false,
}) => {
  const eligibleIds = new Set(
    contracts
      .filter((contract) => isResidentContractEligible(contract, { includeEarlyStages }))
      .map((contract) => id(contract._id)),
  );
  const candidates = contracts
    .filter((contract) => isResidentContractEligible(contract, { includeEarlyStages }))
    .filter((contract) => !(
      isNotYetEffectiveSuccessor(contract, now) &&
      eligibleIds.has(id(contract.replacesContractId))
    ))
    .map((contract) => ({
      contract,
      rank: relationshipRank(contract, activeStay),
      tier: stageTier(contract),
    }))
    .filter(({ rank }) => rank >= 0);
  if (!candidates.length) return null;

  // Tier first (progressed Contracts always beat early-stage drafts),
  // relationship strength only breaks ties within the same tier.
  const highestTier = Math.max(...candidates.map(({ tier }) => tier));
  const tiered = candidates.filter(({ tier }) => tier === highestTier);
  const highestRank = Math.max(...tiered.map(({ rank }) => rank));
  const highest = tiered.filter(({ rank }) => rank === highestRank);

  if (highest.length === 1) {
    return highest[0].contract;
  }

  if (strictIntegrityCheck) {
    throw Object.assign(
      new Error("Multiple tenant-visible canonical Contracts were found."),
      {
        code: "MULTIPLE_CANONICAL_CONTRACTS",
        statusCode: 409,
        candidateCount: highest.length,
      },
    );
  }

  // Secondary tie-breaker: document readiness score first
  const withScores = highest.map((item) => ({
    ...item,
    docScore: computeDocumentReadinessScore(item.contract),
  }));

  const maxDocScore = Math.max(...withScores.map((item) => item.docScore));
  const scoredCandidates = withScores.filter((item) => item.docScore === maxDocScore);

  if (scoredCandidates.length === 1) {
    return scoredCandidates[0].contract;
  }

  // Tertiary tie-breaker: most recent updatedAt / createdAt timestamp, then version
  const sorted = [...scoredCandidates].sort((a, b) => {
    const timeA = getCandidateTimestamp(a.contract);
    const timeB = getCandidateTimestamp(b.contract);
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    const verA = getCandidateVersion(a.contract);
    const verB = getCandidateVersion(b.contract);
    if (verA !== verB) {
      return verB - verA;
    }
    return 0;
  });

  return sorted[0].contract;
};

export const resolveTenantCanonicalContract = async (
  tenantId,
  { includeEarlyStages = false, strictIntegrityCheck = false } = {},
) => {
  const [activeStay, contracts] = await Promise.all([
    resolveCurrentStayForTenant(tenantId).lean(),
    // Ownership is unconditional (tenantId scoping only) — includeEarlyStages
    // only widens which *statuses* of the tenant's own Contracts are
    // eligible, never whose Contracts are considered.
    Contract.find({ tenantId }).sort({ createdAt: -1 }),
  ]);
  return selectCanonicalTenantContract({
    contracts,
    activeStay,
    includeEarlyStages,
    strictIntegrityCheck,
  });
};

// Renewal/transfer entry points (tenantActionService.js) need "the tenant's
// current authoritative Contract for THIS reservation" — previously each
// implemented its own ad-hoc `Contract.findOne({reservationId, isCurrent:
// true}).sort({version:-1})`, which (a) used a different definition of
// "current" than the tenant-facing selector above (no ranking/tie-break,
// just "newest version"), and (b) could silently pick a wrong/stale record
// on the exact data shape (two isCurrent:true Contracts for one
// reservation) that makes the tenant-facing selector throw
// MULTIPLE_CANONICAL_CONTRACTS — same underlying anomaly, two different
// behaviors depending on which code path ran first. Renewal, transfer, and
// contract generation must all resolve "the current lease" through this one
// function so they can never disagree with each other or with what the
// tenant sees on /contracts/current.
export const resolveAuthoritativeCurrentContract = async ({
  reservationId = null,
  tenantId = null,
  includeEarlyStages = false,
  now = new Date(),
  strictIntegrityCheck = false,
  session = null,
} = {}) => {
  if (!reservationId && !tenantId) {
    throw new Error("resolveAuthoritativeCurrentContract requires a reservationId or tenantId");
  }

  const activeStay = reservationId
    ? await resolveCurrentStayForReservation(reservationId, { session })
    : await resolveCurrentStayForTenant(tenantId, { session });

  const scopeTenantId = tenantId || activeStay?.tenantId || null;
  const contracts = scopeTenantId
    ? await Contract.find({ tenantId: scopeTenantId }).session(session).sort({ createdAt: -1 })
    : await Contract.find({ reservationId }).session(session).sort({ createdAt: -1 });

  return selectCanonicalTenantContract({
    contracts,
    activeStay,
    includeEarlyStages,
    now,
    strictIntegrityCheck,
  });
};

export const computeContractDurationMonths = (contract) => {
  if (contract?.leaseDurationMonths != null && !Number.isNaN(Number(contract.leaseDurationMonths))) {
    return Number(contract.leaseDurationMonths);
  }
  if (contract?.leaseStartDate && contract?.leaseEndDate) {
    const start = new Date(contract.leaseStartDate);
    const end = new Date(contract.leaseEndDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      return Math.max(1, months);
    }
  }
  return 12;
};

export const buildTermLabel = (termNumber, contract) => {
  if (termNumber === 1) {
    return "Term #1: Initial Stay";
  }
  return `Term #${termNumber}: Stay Extension`;
};

export const attachContractLineage = (contracts = []) => {
  const validContracts = contracts.filter((c) => {
    if (!c) return false;
    if (c.duplicateOfContractId || c.archivedAt) return false;
    if (["voided", "cancelled", "rejected"].includes(c.status)) return false;
    return true;
  });

  const parentMap = new Map();
  const find = (i) => {
    let root = i;
    while (parentMap.has(root) && parentMap.get(root) !== root) {
      root = parentMap.get(root);
    }
    let curr = i;
    while (parentMap.has(curr) && parentMap.get(curr) !== root) {
      const next = parentMap.get(curr);
      parentMap.set(curr, root);
      curr = next;
    }
    return root;
  };

  const union = (a, b) => {
    if (!a || !b) return;
    const rootA = find(String(a));
    const rootB = find(String(b));
    if (rootA !== rootB) {
      parentMap.set(rootA, rootB);
    }
  };

  const hasAnyReservationOrChain = validContracts.some(
    (c) => Boolean(c.reservationId || c.applicationId || c.replacesContractId || c.parentContractId)
  );

  if (!hasAnyReservationOrChain) {
    validContracts.forEach((c) => {
      const cid = String(c._id || c.id || "");
      if (cid) {
        if (!parentMap.has(cid)) parentMap.set(cid, cid);
        union(cid, "__default_group__");
      }
    });
  } else {
    validContracts.forEach((c) => {
      const cid = String(c._id || c.id || "");
      if (!cid) return;
      if (!parentMap.has(cid)) parentMap.set(cid, cid);

      const resId = c.reservationId ? String(c.reservationId._id || c.reservationId) : null;
      const appId = c.applicationId ? String(c.applicationId._id || c.applicationId) : null;
      const replacesId = c.replacesContractId ? String(c.replacesContractId._id || c.replacesContractId) : null;
      const parentId = c.parentContractId ? String(c.parentContractId._id || c.parentContractId) : null;

      if (resId) {
        if (!parentMap.has(resId)) parentMap.set(resId, resId);
        union(cid, resId);
      }
      if (appId) {
        if (!parentMap.has(appId)) parentMap.set(appId, appId);
        union(cid, appId);
      }
      if (replacesId) {
        if (!parentMap.has(replacesId)) parentMap.set(replacesId, replacesId);
        union(cid, replacesId);
      }
      if (parentId) {
        if (!parentMap.has(parentId)) parentMap.set(parentId, parentId);
        union(cid, parentId);
      }
    });
  }

  // Group contracts by their root key
  const groups = new Map();
  validContracts.forEach((c) => {
    const cid = String(c._id || c.id || "");
    const root = cid ? find(cid) : "__fallback__";
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(c);
  });

  const lineageMap = new Map();
  groups.forEach((groupContracts) => {
    const sorted = [...groupContracts].sort((a, b) => {
      const startA = a.leaseStartDate ? new Date(a.leaseStartDate).getTime() : new Date(a.createdAt || 0).getTime();
      const startB = b.leaseStartDate ? new Date(b.leaseStartDate).getTime() : new Date(b.createdAt || 0).getTime();
      if (startA !== startB) return startA - startB;
      const createdA = new Date(a.createdAt || 0).getTime();
      const createdB = new Date(b.createdAt || 0).getTime();
      return createdA - createdB;
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
      const obj = c.toObject();
      return { ...obj, ...lineage };
    }
    return { ...c, ...lineage };
  });
};

export const resolveTenantContractHistoryWithLineage = async (tenantId) => {
  const [canonical, allContracts] = await Promise.all([
    resolveTenantCanonicalContract(tenantId).catch(() => null),
    Contract.find({ tenantId }).sort({ leaseStartDate: 1, createdAt: 1 }),
  ]);
  const canonicalId = canonical ? String(canonical._id) : null;
  const contractsWithLineage = attachContractLineage(allContracts);

  return contractsWithLineage.filter((contract) => {
    if (canonicalId && String(contract._id) === canonicalId) return false;
    if (contract.duplicateOfContractId) return false;
    return HISTORY_VISIBLE_STATUSES.has(contract.status);
  });
};

export const resolveTenantContractHistory = resolveTenantContractHistoryWithLineage;

// The "upcoming" leg of the current/upcoming/history triad (spec §AI): a
// generated or final successor of the tenant's current contract whose
// effective date hasn't arrived yet. Shared by web and mobile — neither
// gets its own resolver (spec §AJ).
const UPCOMING_VISIBLE_STATUSES = new Set([
  "generated",
  "awaiting_signatures",
  "partially_signed",
  "signed",
  "awaiting_notarization",
  "notarized",
  "ready_for_publication",
  "published",
]);

export const resolveTenantUpcomingContract = async (tenantId) => {
  const [canonical, activeStay] = await Promise.all([
    resolveTenantCanonicalContract(tenantId).catch(() => null),
    resolveCurrentStayForTenant(tenantId).lean().catch(() => null),
  ]);

  if (!canonical && !activeStay) return null;

  let upcomingStayIds = [];
  if (activeStay) {
    const upcomingStays = await Stay.find({
      tenantId,
      status: "upcoming",
      previousStayId: activeStay._id,
    }).select("_id").lean().catch(() => []);
    upcomingStayIds = (upcomingStays || []).map((s) => s._id);
  }

  const orConditions = [];
  if (canonical) {
    orConditions.push({ replacesContractId: canonical._id });
  }
  if (upcomingStayIds.length > 0) {
    orConditions.push({ stayId: { $in: upcomingStayIds } });
  }

  if (orConditions.length === 0) return null;

  const upcoming = await Contract.find({
    tenantId,
    $or: orConditions,
  }).sort({ createdAt: -1 });

  return (
    upcoming.find((contract) => {
      if (canonical && String(contract._id) === String(canonical._id)) return false;
      return (
        UPCOMING_VISIBLE_STATUSES.has(contract.status) &&
        !contract.archivedAt &&
        contract.duplicateOfContractId == null
      );
    }) || null
  );
};
