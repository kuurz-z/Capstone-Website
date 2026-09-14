import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mkdir = jest.fn();
const writeFile = jest.fn();
const rm = jest.fn();
const rename = jest.fn();
const access = jest.fn(async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); });
const transitionContract = jest.fn(async (contract, status, actorId) => {
  contract.status = status;
  contract.updatedBy = actorId;
  await contract.save();
});
const assertValidContractTransition = jest.fn(() => true);
await jest.unstable_mockModule("fs/promises", () => ({ default: { mkdir, writeFile, rm, rename, access } }));
await jest.unstable_mockModule("./contractService.js", () => ({ transitionContract, assertValidContractTransition }));
const {
  NOTARIZATION_CHECKLIST_KEYS,
  resolveNotarizedContractPath,
  uploadNotarizedContract,
  verifyNotarizedContract,
  rejectNotarizedContract,
} = await import("./contractNotarizationService.js");

const contract = (changes = {}) => Object.assign({
  status: "generated", contractNumber: "TEST-CONTRACT-0001",
  branch: "gil-puyat", contractYear: 2026, generatedVersion: 1,
  generatedStorageKey: "gil-puyat/2026/current.pdf",
  preparedDocuments: [{ version: 1, superseded: false }],
  notarizedDocuments: [], save: jest.fn().mockResolvedValue(undefined),
}, changes);
const upload = (buffer, originalname, mimetype) => ({
  originalname, mimetype, buffer, size: buffer.length,
});
const pdf = () => upload(Buffer.from("%PDF-1.7 notarized"), "notarized.pdf", "application/pdf");
const jpeg = () => upload(Buffer.from([0xff, 0xd8, 0xff, 1]), "notarized.jpg", "image/jpeg");
const png = () => upload(
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), "notarized.png", "image/png",
);
const checklist = () => Object.fromEntries(NOTARIZATION_CHECKLIST_KEYS.map((key) => [key, true]));
const uploadCurrent = (item, file = pdf(), extras = {}) =>
  uploadNotarizedContract({
    contract: item, file, actorId: "admin", preparedDocumentVersion: 1, ...extras,
  });

beforeEach(() => {
  mkdir.mockReset().mockResolvedValue(undefined);
  writeFile.mockReset().mockResolvedValue(undefined);
  rm.mockReset().mockResolvedValue(undefined);
  transitionContract.mockClear();
});

describe("direct signed-and-notarized Path B", () => {
  test.each(["generated", "awaiting_signatures", "partially_signed", "signed", "awaiting_notarization"])(
    "%s accepts direct upload without changing status",
    async (status) => {
      const item = contract({ status });
      await uploadCurrent(item);
      expect(item.status).toBe(status);
      expect(item.notarizedDocumentVersion).toBe(1);
    },
  );

  test.each([[pdf, "application/pdf"], [jpeg, "image/jpeg"], [png, "image/png"]])(
    "valid private %s upload succeeds",
    async (factory, mimeType) => {
      const item = contract();
      const document = await uploadCurrent(item, factory());
      expect(document.mimeType).toBe(mimeType);
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("notarized-contracts"), expect.any(Buffer),
        expect.objectContaining({ flag: "wx", mode: 0o600 }),
      );
    },
  );

  test("format, signature mismatch, traversal, and prepared-version mismatch are rejected", async () => {
    await expect(uploadCurrent(contract(), upload(Buffer.from("bad"), "bad.txt", "text/plain")))
      .rejects.toMatchObject({ code: "SIGNED_DOCUMENT_UNSUPPORTED_TYPE" });
    await expect(uploadCurrent(contract(), upload(Buffer.from("%PDF-x"), "bad.jpg", "image/jpeg")))
      .rejects.toMatchObject({ code: "SIGNED_DOCUMENT_TYPE_MISMATCH" });
    expect(() => resolveNotarizedContractPath("../escape.pdf"))
      .toThrow(expect.objectContaining({ code: "INVALID_NOTARIZED_STORAGE_KEY" }));
    await expect(uploadNotarizedContract({
      contract: contract(), file: pdf(), actorId: "admin", preparedDocumentVersion: 2,
    })).rejects.toMatchObject({ code: "NOTARIZED_PREPARED_VERSION_MISMATCH" });
  });

  test("oversized scan is rejected before private storage", async () => {
    const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    buffer.write("%PDF-");
    await expect(uploadCurrent(
      contract(), upload(buffer, "too-large.pdf", "application/pdf"),
    )).rejects.toMatchObject({ code: "SIGNED_DOCUMENT_TOO_LARGE", statusCode: 413 });
    expect(writeFile).not.toHaveBeenCalled();
  });

  test("closed, published, and missing-prepared Contracts are rejected", async () => {
    for (const item of [
      contract({ status: "archived" }),
      contract({ status: "generated", finalStorageKey: "final.pdf" }),
      contract({ generatedStorageKey: null }),
    ]) {
      await expect(uploadCurrent(item)).rejects.toHaveProperty("code");
    }
  });

  test("replacement preserves the prior version and requires a reason", async () => {
    const item = contract();
    await uploadCurrent(item);
    await expect(uploadCurrent(item))
      .rejects.toMatchObject({ code: "NOTARIZED_DOCUMENT_REPLACEMENT_REASON_REQUIRED" });
    await uploadCurrent(item, pdf(), { replacementReason: "Clearer seal" });
    expect(item.notarizedDocuments).toHaveLength(2);
    expect(item.notarizedDocuments[0]).toMatchObject({
      superseded: true, replacementReason: "Clearer seal",
    });
  });

  test("optional notarial details are stored without inventing missing values", async () => {
    const item = contract();
    const document = await uploadCurrent(item, pdf(), {
      notarialDetails: { notaryName: "A. Notary", seriesYear: 2026 },
    });
    expect(document.notarialDetails).toMatchObject({
      notaryName: "A. Notary", seriesYear: 2026, notarizationPlace: "",
    });
  });

  test("verification requires current version and every checklist item", async () => {
    const item = contract();
    await expect(verifyNotarizedContract({
      contract: item, actorId: "admin", documentVersion: 1, checklist: checklist(),
    })).rejects.toMatchObject({ code: "NOTARIZED_DOCUMENT_REQUIRED" });
    await uploadCurrent(item);
    await expect(verifyNotarizedContract({
      contract: item, actorId: "admin", documentVersion: 1, checklist: {},
    })).rejects.toMatchObject({ code: "NOTARIZED_DOCUMENT_CHECKLIST_INCOMPLETE" });
    await expect(verifyNotarizedContract({
      contract: item, actorId: "admin", documentVersion: 2, checklist: checklist(),
    })).rejects.toMatchObject({ code: "NOTARIZED_DOCUMENT_VERSION_MISMATCH" });
  });

  test("successful verification marks notarized but never publishes or activates", async () => {
    const item = contract();
    await uploadCurrent(item);
    await verifyNotarizedContract({
      contract: item, actorId: "admin", documentVersion: 1,
      checklist: checklist(), notes: "Paper and scan verified",
    });
    expect(item.status).toBe("notarized");
    expect(item.notarizationVerifiedAt).toBeInstanceOf(Date);
    expect(item.publishedAt).toBeUndefined();
    expect(item.finalStorageKey).toBeUndefined();
  });

  test("rejection preserves history, clears the current pointer, and keeps status pending", async () => {
    const item = contract({ status: "awaiting_notarization" });
    await uploadCurrent(item);
    await rejectNotarizedContract({
      contract: item, actorId: "admin", documentVersion: 1, reason: "Seal is cropped",
    });
    expect(item.status).toBe("awaiting_notarization");
    expect(item.notarizedStorageKey).toBeNull();
    expect(item.notarizedDocuments[0]).toMatchObject({
      superseded: true, rejectionReason: "Seal is cropped", rejectedBy: "admin",
    });
  });
});
