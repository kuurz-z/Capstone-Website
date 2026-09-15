import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export const GENERATED_CONTRACT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../private/generated-contracts",
);

// Same physical directories contractSigningService.js's SIGNED_CONTRACT_ROOT
// and contractNotarizationService.js's NOTARIZED_CONTRACT_ROOT resolve to
// (both computed the same way, from a sibling file in this same directory) —
// declared again here, rather than imported from those modules, so this
// module (which they both depend on for storage primitives) never has to
// import back from either of them.
const SIGNED_ARTIFACT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../private/signed-contracts",
);
const NOTARIZED_ARTIFACT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../private/notarized-contracts",
);

const ARTIFACT_ROOTS = Object.freeze({
  signed: SIGNED_ARTIFACT_ROOT,
  notarized: NOTARIZED_ARTIFACT_ROOT,
});

export const sanitizeContractFileSegment = (value, fallback = "contract") => {
  const sanitized = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return sanitized || fallback;
};

const ensureInsideRoot = (candidate) => {
  const root = path.resolve(GENERATED_CONTRACT_ROOT);
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    const error = new Error("Invalid private Contract storage path.");
    error.code = "CONTRACT_STORAGE_PATH_INVALID";
    error.statusCode = 400;
    throw error;
  }
  return resolved;
};

export const buildPreparedContractStorage = ({
  contractId,
  branch,
  year,
  contractNumber,
  tenantLegalName,
  roomType,
  leaseType,
  contractDate,
  version,
  storageAttemptId = null,
}) => {
  const safeBranch = sanitizeContractFileSegment(branch);
  const safeContractNumber = sanitizeContractFileSegment(contractNumber);
  const safeTenantName = sanitizeContractFileSegment(tenantLegalName, "Tenant");
  const safeRoomType = sanitizeContractFileSegment(roomType, "Room");
  const safeLeaseType = sanitizeContractFileSegment(leaseType, "Lease");
  const safeContractDate = sanitizeContractFileSegment(contractDate, "Undated");
  const fileName =
    `Lease_${safeTenantName}_${safeRoomType}_${safeLeaseType}_${safeContractDate}_v${version}.pdf`;
  const relativeDirectory = contractId
    ? path.join(
      "contracts",
      sanitizeContractFileSegment(contractId),
      "prepared",
      ...(storageAttemptId ? [sanitizeContractFileSegment(storageAttemptId)] : []),
    )
    : path.join(safeBranch, String(year), safeContractNumber);
  const storageKey = path.join(relativeDirectory, fileName).replaceAll("\\", "/");
  const absolutePath = ensureInsideRoot(path.join(GENERATED_CONTRACT_ROOT, storageKey));
  return { fileName, storageKey, absolutePath, directory: path.dirname(absolutePath) };
};

export const writePrivateContractAtomically = async (target, bytes) => {
  await fs.mkdir(target.directory, { recursive: true, mode: 0o700 });
  try {
    await fs.access(target.absolutePath);
    const error = new Error("Prepared Contract version already exists.");
    error.code = "CONTRACT_FILE_VERSION_EXISTS";
    error.statusCode = 409;
    throw error;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporaryPath = ensureInsideRoot(
    `${target.absolutePath}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await fs.rename(temporaryPath, target.absolutePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return target;
};

export const removePrivateContractFile = async (absolutePath) => {
  const safePath = ensureInsideRoot(absolutePath);
  await fs.rm(safePath, { force: true });
};

export const resolvePrivateContractStorageKey = (storageKey) =>
  ensureInsideRoot(path.join(GENERATED_CONTRACT_ROOT, String(storageKey || "")));

// Generic counterparts of the four Prepared-only helpers above, for the
// "signed" and "notarized" contract-artifact kinds. Kept as separate
// functions (rather than generalizing the Prepared ones in place) so the
// already-heavily-tested Draft/Prepared storage path is never touched by
// this migration.
const ensureInsideArtifactRoot = (kind, candidate) => {
  const root = ARTIFACT_ROOTS[kind];
  if (!root) {
    const error = new Error(`Unknown contract artifact kind: ${kind}`);
    error.code = "CONTRACT_STORAGE_PATH_INVALID";
    error.statusCode = 400;
    throw error;
  }
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    const error = new Error("Invalid private Contract storage path.");
    error.code = "CONTRACT_STORAGE_PATH_INVALID";
    error.statusCode = 400;
    throw error;
  }
  return resolved;
};

// storageKey convention: contracts/<contractId>/<kind>/<fileName> — same
// contractId-scoped shape buildPreparedContractStorage already uses for
// generated Drafts.
export const buildContractArtifactStorage = ({ kind, contractId, fileName }) => {
  const root = ARTIFACT_ROOTS[kind];
  if (!root) throw Object.assign(new Error(`Unknown contract artifact kind: ${kind}`), { code: "CONTRACT_STORAGE_PATH_INVALID", statusCode: 400 });
  const relativeDirectory = path.join("contracts", sanitizeContractFileSegment(contractId), kind);
  const storageKey = path.join(relativeDirectory, fileName).replaceAll("\\", "/");
  const absolutePath = ensureInsideArtifactRoot(kind, path.join(root, storageKey));
  return { kind, fileName, storageKey, absolutePath, directory: path.dirname(absolutePath) };
};

export const writeContractArtifactAtomically = async (target, bytes) => {
  await fs.mkdir(target.directory, { recursive: true, mode: 0o700 });
  try {
    await fs.access(target.absolutePath);
    const error = new Error("A document already exists at this storage key.");
    error.code = "CONTRACT_FILE_VERSION_EXISTS";
    error.statusCode = 409;
    throw error;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporaryPath = ensureInsideArtifactRoot(
    target.kind, `${target.absolutePath}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await fs.rename(temporaryPath, target.absolutePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return target;
};

export const removeContractArtifactFile = async (kind, absolutePath) => {
  const safePath = ensureInsideArtifactRoot(kind, absolutePath);
  await fs.rm(safePath, { force: true });
};

export const resolveContractArtifactStorageKey = (kind, storageKey) =>
  ensureInsideArtifactRoot(kind, path.join(ARTIFACT_ROOTS[kind], String(storageKey || "")));
