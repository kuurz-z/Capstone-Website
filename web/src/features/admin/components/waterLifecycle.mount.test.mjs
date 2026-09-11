import { register } from 'node:module';
import { before, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { mount } from '../../../test-fixtures/reactMountHarness.mjs';
import { fireEvent, getByRole, getByLabelText, queryByLabelText } from '@testing-library/dom';

register('../../../test-fixtures/waterLifecycleLoader.mjs', import.meta.url);
const state = globalThis.__waterLifecycleTest = {
  api: {}, notifications: [], submits: [],
  queryClient: { invalidateQueries: async () => {} },
};
let Transfer, MoveIn, mounted;
const room = {_id:'room-1',type:'double-sharing',branch:'gil-puyat',name:'Room 201'};
const reservation = {id:'reservation-1',customer:'Sample Tenant',status:'reserved',initialPaymentStatus:'paid',paymentStatus:'paid_in_full',roomId:room,room:'201',roomType:room.type,branch:room.branch,moveInDate:'2026-08-10',leaseDuration:12,selectedBed:'A',monthlyRent:6500};
const transfer = {reservationId:reservation.id,currentRoom:{id:'room-1',name:'Room 201',type:'private'},scheduledRoom:{id:'room-2',name:'Room 202',type:'double-sharing'},effectiveTransferDate:'2026-08-10',completable:true,status:'ready_for_transfer',statusLabel:'Ready for transfer',transferBalance:{hasBill:false},addendum:{status:'acknowledged'}};
const preview = (required=true) => ({electricity:{subMetered:true,previousReading:1250},destinationElectricity:{subMetered:true,currentReading:450},water:{required,previousReading:106,lastRecordedReadingDate:'2026-08-03T00:00:00+08:00',roomId:'room-1'},destinationWater:{required,previousReading:84.2,lastRecordedReadingDate:'2026-08-07T00:00:00+08:00',roomId:'room-2'},deposit:{heldKnown:true}});
before(async () => {
  ({default:Transfer} = await import('./tenants/details/ScheduledRoomTransferCard.jsx'));
  ({default:MoveIn} = await import('./ReservationDetailsModal.jsx'));
});
afterEach(() => { mounted?.unmount(); mounted=null; state.notifications.length=0; state.submits.length=0; });
const button = (name, root=document.body) => getByRole(root,'button',{name,exact:true});
const input = name => getByLabelText(document.body,name,{exact:true});
const click = async element => { await act(async () => { fireEvent.click(element); }); };
const fill = (element,value) => act(() => {fireEvent.change(element,{target:{value}});});
async function openTransfer(required=true) {
  state.api.getRoomTransferPreview=async()=>({transferPreview:preview(required)});
  state.api.completeRoomTransfer=async(...args)=>{state.submits.push(args);return {outcome:'executed'};};
  mounted=mount(React.createElement(Transfer,{transfer}));
  await click(button('Complete Transfer'));
}
function moveInElement(entry=reservation,onClose=()=>{}) {return React.createElement(MoveIn,{reservation:entry,onClose,onUpdate:()=>{}});}
async function openMoveIn() {mounted=mount(moveInElement());await click(button('Record Move In'));}
const water = () => input('Starting Water Reading *');
const electricity = () => input('Starting Electricity Reading *');
const date = () => document.querySelector('input[type="date"]');
function dirtyMoveIn() {fill(water(),'120');fill(electricity(),'1300');fill(date(),'2026-08-09');}
function assertBlankMoveIn(expectedDate='2026-08-10') {assert.equal(water().value,'');assert.equal(electricity().value,'');assert.equal(date().value,expectedDate);}

test('transfer water helpers retain distinct room baselines/dates and fill only their own field',async()=>{
  await openTransfer();
  const source=input('Source Water Reading *'),destination=input('Destination Water Reading *');
  assert.equal(source.min,'106');assert.equal(destination.min,'84.2');
  assert.match(source.parentElement.parentElement.textContent,/106\.00.*Aug.*3.*2026/s);
  assert.match(destination.parentElement.parentElement.textContent,/84\.20.*Aug.*7.*2026/s);
  await click(button('Use source water baseline'));
  assert.equal(source.value,'106');assert.equal(destination.value,'');
  await click(button('Use destination water baseline'));
  assert.equal(source.value,'106');assert.equal(destination.value,'84.2');
  for (const placeholder of ['Meter reading now, in the OLD room','Meter reading now, in the NEW room']) {
    assert.equal(document.querySelector(`input[placeholder="${placeholder}"]`).value,'','water helper must not fill electricity');
  }
});
test('transfer rejects either room reading below its own baseline before API submission',async()=>{
  await openTransfer();
  const dialog=getByRole(document.body,'dialog');
  fill(input('Source Water Reading *'),'105');fill(input('Destination Water Reading *'),'84.2');
  await click(button('Complete Transfer',dialog));
  assert.match(state.notifications.at(-1)[0],/source water reading cannot be lower/);
  assert.equal(state.submits.length,0);
  fill(input('Source Water Reading *'),'106');fill(input('Destination Water Reading *'),'84.1');
  await click(button('Complete Transfer',dialog));
  assert.match(state.notifications.at(-1)[0],/destination water reading cannot be lower/);
  assert.equal(state.submits.length,0);
});
test('transfer hides water fields and helpers when server preview excludes Quad rooms',async()=>{
  await openTransfer(false);
  assert.equal(queryByLabelText(document.body,'Source Water Reading *',{exact:true}),null);
  assert.equal(queryByLabelText(document.body,'Destination Water Reading *',{exact:true}),null);
  assert.equal(document.querySelector('[aria-label="Use source water baseline"]'),null);
});
test('move-in cancel/reopen clears unsaved water/electricity and restores scheduled date',async()=>{
  await openMoveIn();dirtyMoveIn();await click(button('Cancel'));await click(button('Record Move In'));assertBlankMoveIn();
});
test('move-in same-mounted reservation switch clears readings/date before opening new record',async()=>{
  await openMoveIn();dirtyMoveIn();
  mounted.rerender(moveInElement({...reservation,id:'reservation-2',customer:'Second Tenant',moveInDate:'2026-08-11',roomId:{...room,_id:'room-2'}}));
  assert.equal(queryByLabelText(document.body,'Starting Water Reading *',{exact:true}),null);
  await click(button('Record Move In'));assertBlankMoveIn('2026-08-11');assert.match(water().placeholder,/900/);
});
test('move-in close clears the form even when parent keeps component mounted',async()=>{
  await openMoveIn();dirtyMoveIn();await click(button('Close'));await click(button('Record Move In'));assertBlankMoveIn();
});
test('successful move-in clears both readings and date before another form opening',async()=>{
  state.api.update=async(...args)=>{state.submits.push(args);return {};};
  await openMoveIn();dirtyMoveIn();await click(button('Move In'));await click(button('Yes, Move In'));
  assert.equal(state.submits.length,1);
  assert.equal(state.submits[0][1].waterMeterReading,120);
  assert.equal(state.submits[0][1].meterReading,1300);
  await click(button('Record Move In'));assertBlankMoveIn();
});
