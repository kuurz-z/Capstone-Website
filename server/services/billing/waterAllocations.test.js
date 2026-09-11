import { upsertWaterAllocation } from './waterAllocations.js';
import { getVisibleBillCharges, syncBillAmounts } from './billingPolicy.js';

function add(bill, id, amount) {
  return upsertWaterAllocation(bill, {period:{_id:id, calculationVersion:'water-meter-v1', pricingSnapshot:{ratePerUnit:50}},
    room:{_id:id}, summary:{reservationId:'r',tenantId:'t',totalUsage:amount/50,billAmount:amount}});
}
test('two rooms accumulate exactly once; draft is hidden; sent counted once', () => {
  const bill = {_id:'bill',charges:{water:0},status:'draft',paidAmount:0};
  add(bill,'roomA',600); add(bill,'roomB',300); add(bill,'roomA',600);
  expect(bill.waterAllocations).toHaveLength(2);
  expect(bill.charges.water).toBe(900);
  expect(getVisibleBillCharges(bill).water).toBe(0);
  bill.waterAllocations[0].state='sent';
  expect(getVisibleBillCharges(bill).water).toBe(300);
  bill.waterAllocations[1].state='sent';
  bill.paidAmount=100;
  syncBillAmounts(bill);
  expect(bill.remainingAmount).toBe(800);
  expect(() => add(bill,'roomA',650)).toThrow(/cannot be rewritten/);
});
test('legacy money remains money alongside a new allocation', () => {
  const bill = {_id:'bill',charges:{water:900},status:'pending'};
  upsertWaterAllocation(bill,{period:{_id:'p',calculationVersion:'water-meter-v1'},room:{_id:'room'},
    summary:{tenantId:'t',reservationId:'r',billAmount:100,totalUsage:2},legacyDispatch:{state:'sent'}});
  expect(bill.charges.water).toBe(1000);
  expect(getVisibleBillCharges(bill).water).toBe(900);
  expect(bill.waterAllocations[0].calculationVersion).toBe('water-occupancy-legacy');
  expect(bill.waterAllocations[0].usage).toBeUndefined();
});
