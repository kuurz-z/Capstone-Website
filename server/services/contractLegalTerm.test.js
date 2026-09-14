import { describe, test, expect } from '@jest/globals';
import { resolveLegalLeaseType } from '../config/contractLegalTerm.js';
import { OFFICIAL_CONTRACT_TEMPLATES } from '../config/contractTemplateRegistry.js';
import { resolveContractTemplate } from './contractTemplateService.js';
import { deriveContractLeaseDates } from './contractLeaseDateService.js';
import { buildContractHtml } from './contractHtmlPdfService.js';
import { resolveAuthoritativeLeasePricing } from './contractPricingResolver.js';

describe('legal templates are independent of ten-month pricing eligibility', () => {
  for (const roomType of ['private', 'double-sharing', 'quadruple-sharing']) {
    test.each([1, 3, 5, 6, 9, 10, 12])(`${roomType}: %i months`, months => {
      const legalType = resolveLegalLeaseType(months);
      expect(legalType).toBe(months < 6 ? 'short-term' : 'long-term');
      const pricing = resolveAuthoritativeLeasePricing({ roomType, room: { type: roomType },
        branch: 'gil-puyat', leaseDurationMonths: months, settings: { longTermLeaseMinMonths: 10 } });
      expect(pricing.leaseType).toBe(months < 10 ? 'short_term' : 'long_term');
      const template = resolveContractTemplate({ branch: 'gil-puyat', roomType, leaseType: legalType,
        ...deriveContractLeaseDates({ leaseStartDate: '2027-01-15T00:00:00+08:00', leaseDurationMonths: months }) });
      expect(template.templateId).toBe(`${roomType}-${legalType}`);
      expect(() => buildContractHtml({ template, property: {}, fields: { tenantLegalName: 'Test Tenant',
        tenantResidentialAddress: 'Test Address', leaseDurationNumber: months } })).not.toThrow();
    });
  }
  test('every currently registered room type is covered; no six-person legal template exists', () => {
    expect([...new Set(OFFICIAL_CONTRACT_TEMPLATES.map(t => t.roomType))].sort())
      .toEqual(['double-sharing', 'private', 'quadruple-sharing']);
  });
});
