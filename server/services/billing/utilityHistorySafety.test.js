import { assertUtilityHistoryMutable, waterCalculationVersion } from './utilityHistorySafety.js';

describe('utility financial history protection', () => {
  test.each([
    { status: 'paid' }, { status: 'partially-paid' }, { paidAmount: 1 },
    { releasedAt: new Date() }, { issuedAt: new Date() }, { sentAt: new Date() },
    { utilityDispatch: { water: { state: 'sent' } } },
  ])('rejects destructive changes to issued or paid history: %j', bill => {
    expect(() => assertUtilityHistoryMutable([bill], 'water')).toThrow(/cannot be deleted/);
  });
  test('allows an unpublished unpaid draft', () => {
    expect(() => assertUtilityHistoryMutable([{status:'draft', charges:{water:42}}], 'water')).not.toThrow();
  });
  test('missing versions remain legacy, never meter consumption', () => {
    expect(waterCalculationVersion({computedTotalUsage:31, ratePerUnit:900})).toBe('water-occupancy-legacy');
    expect(waterCalculationVersion({calculationVersion:'water-meter-v1'})).toBe('water-meter-v1');
  });
});
