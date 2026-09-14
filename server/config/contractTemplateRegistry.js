import path from "path";
import { fileURLToPath } from "url";
import { LEGAL_LEASE_TERMS } from './contractLegalTerm.js';

const templateDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../private/contract-templates/v1",
);

const createTemplate = ({
  templateId,
  displayName,
  roomType,
  leaseType,
  sourceFileName,
  checksum,
}) => Object.freeze({
  templateId,
  displayName,
  roomType,
  leaseType,
  ...LEGAL_LEASE_TERMS[leaseType],
  sourceFileName,
  sourceFilePath: path.join(templateDirectory, sourceFileName),
  templateVersion: "1.0.0",
  legalContentVersion: "2026-07-27",
  checksumAlgorithm: "sha256",
  checksum,
  active: true,
});

export const OFFICIAL_CONTRACT_TEMPLATES = Object.freeze([
  createTemplate({
    templateId: "private-short-term",
    displayName: "Private Room — Short Term",
    roomType: "private",
    leaseType: "short-term",
    sourceFileName: "Lease_Private_Room_ShortTerm.pdf",
    checksum: "54e85d044c0c4edf427283afa0d34f0357fad8678a333a94cdfc5cb19eb95f20",
  }),
  createTemplate({
    templateId: "private-long-term",
    displayName: "Private Room — Long Term",
    roomType: "private",
    leaseType: "long-term",
    sourceFileName: "Lease_Private_Room_LongTerm.pdf",
    checksum: "161561dd9e96a2ede6a0f784f3f588e3e77d6ddb4768c6312eb22cca38b88259",
  }),
  createTemplate({
    templateId: "double-sharing-short-term",
    displayName: "Double Sharing — Short Term",
    roomType: "double-sharing",
    leaseType: "short-term",
    sourceFileName: "Lease_Double_Sharing_ShortTerm.pdf",
    checksum: "c73adb1ed4a903ba56b1af69eb51823f6268e66bd2dca3b750b5986ee495fb61",
  }),
  createTemplate({
    templateId: "double-sharing-long-term",
    displayName: "Double Sharing — Long Term",
    roomType: "double-sharing",
    leaseType: "long-term",
    sourceFileName: "Lease_Double_Sharing_LongTerm.pdf",
    checksum: "6a17fda7a55d2419f1d1c5b1597f8c1d4e7bdc39b82a33b373a9b1777dde9122",
  }),
  createTemplate({
    templateId: "quadruple-sharing-short-term",
    displayName: "Quadruple Sharing — Short Term",
    roomType: "quadruple-sharing",
    leaseType: "short-term",
    sourceFileName: "Lease_Quadruple_Sharing_ShortTerm.pdf",
    checksum: "68d69696bd90ce7a4d58acf798acd62799771b436ebaaf2dc2e9d7567095c7ac",
  }),
  createTemplate({
    templateId: "quadruple-sharing-long-term",
    displayName: "Quadruple Sharing — Long Term",
    roomType: "quadruple-sharing",
    leaseType: "long-term",
    sourceFileName: "Lease_Quadruple_Sharing_LongTerm.pdf",
    checksum: "d28a4b521f3a467a96e9fd108b3b6a68c0a355aa14000cccdcadbef68fdb2656",
  }),
]);

export const createTemplateRegistry = (templates = OFFICIAL_CONTRACT_TEMPLATES) => {
  const registry = new Map();
  for (const template of templates) {
    if (!template?.templateId) throw new Error("Official template ID is required.");
    if (registry.has(template.templateId)) {
      const error = new Error(`Duplicate official template ID: ${template.templateId}`);
      error.code = "DUPLICATE_CONTRACT_TEMPLATE_ID";
      throw error;
    }
    registry.set(template.templateId, template);
  }
  return registry;
};

export const OFFICIAL_CONTRACT_TEMPLATE_REGISTRY =
  createTemplateRegistry(OFFICIAL_CONTRACT_TEMPLATES);

export { templateDirectory as CONTRACT_TEMPLATE_DIRECTORY };
