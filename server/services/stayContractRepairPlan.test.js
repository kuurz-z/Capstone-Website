import { describe, test, expect } from '@jest/globals';
import { planStayContractDateRepair } from './stayContractRepairPlan.js';

const fixture = () => ({
  now: new Date('2026-09-16T00:00:00Z'),
  tenant: { _id: 'tenant', role: 'tenant', tenantStatus: 'active' },
  stays: [{ _id: 'stay', roomId: 'room', leaseStartDate: '2026-08-24T16:00:00Z', leaseEndDate: '2027-02-28T00:00:00Z' }],
  contract: { _id: 'contract', tenantId: 'tenant', reservationId: 'reservation', roomId: 'room', isCurrent: true,
    status: 'published', leaseStartDate: '2026-08-24T16:00:00Z', leaseEndDate: '2027-02-24T16:00:00Z', leaseDurationMonths: 6 },
  reservation: { _id: 'reservation', userId: 'tenant', roomId: 'room', status: 'moveIn', currentStayId: 'stay' },
  roomExists: true, blockers: [],
});
describe('conservative Stay end-date repair planning', () => {
  test('proposes only the drifted end date and never mutates the source records', () => {
    const input = fixture(); const before = JSON.stringify(input);
    expect(planStayContractDateRepair(input)).toMatchObject({status:'repair',oldEndDate:'2027-02-28T00:00:00.000Z',newEndDate:'2027-02-24T16:00:00.000Z'});
    expect(JSON.stringify(input)).toBe(before);
  });
  test('an already corrected record is idempotent', () => {
    const input = fixture(); input.stays[0].leaseEndDate = input.contract.leaseEndDate;
    expect(planStayContractDateRepair(input)).toEqual({status:'aligned'});
  });
  test('an inclusive final day is valid and is never rewritten', () => {
    const input = fixture(); input.stays[0].leaseEndDate = '2027-02-24T15:59:59.999Z';
    expect(planStayContractDateRepair(input)).toEqual({status:'aligned'});
  });
  test.each(['open_workflow','room_relationship','term_requires_review','contract_term_requires_review','current_contract_not_ready','missing_or_ambiguous_active_stay','contract_relationship'])(
    'refuses automatic repair for %s', reason => {
      const input = fixture();
      if(reason==='open_workflow') input.blockers=['renewal'];
      if(reason==='room_relationship') input.contract.roomId='other';
      if(reason==='term_requires_review') input.stays[0].leaseStartDate='2026-08-29';
      if(reason==='contract_term_requires_review') input.contract.leaseDurationMonths=5;
      if(reason==='current_contract_not_ready') input.contract.status='draft';
      if(reason==='missing_or_ambiguous_active_stay') input.stays.push({...input.stays[0],_id:'other'});
      if(reason==='contract_relationship') input.contract.tenantId='other';
      expect(planStayContractDateRepair(input)).toEqual({status:'review',reason});
    });
});
