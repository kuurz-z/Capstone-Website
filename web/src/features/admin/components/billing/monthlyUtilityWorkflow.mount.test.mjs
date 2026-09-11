import { register } from 'node:module';
import { before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { mount } from '../../../../test-fixtures/reactMountHarness.mjs';
import { fireEvent, getByRole, getByLabelText, getAllByRole, queryByRole } from '@testing-library/dom';
import { completedUtilityPeriodId, selectUtilityPeriod, readyUtilityCycles } from './utility/monthlyBillingWorkflow.js';

register('../../../../test-fixtures/monthlyUtilityLoader.mjs',import.meta.url);
const room = {id:'room-1',name:'Room 201',roomNumber:'201',type:'private',branch:'gil-puyat',activeTenantCount:1,billingState:'open'};
const opening = {id:'period-1',status:'open',startDate:'2026-08-01T00:00:00+08:00',startReading:100,ratePerUnit:50,pricingSnapshot:{ratePerUnit:50},calculationVersion:'water-meter-v1'};
const summary = {tenantId:'tenant-1',tenantName:'Monthly Tenant',reservationId:'reservation-1',billAmount:900,totalUsage:18,billId:'bill-1',billStatus:'draft'};
const completed = {...opening,status:'closed',billingState:'ready_to_send',endDate:'2026-09-01T00:00:00+08:00',endReading:118,computedTotalUsage:18,computedTotalCost:900,tenantSummaries:[summary]};
const next = {...opening,id:'period-next',startDate:completed.endDate,startReading:118};
const preview = {...completed,meterEvents:[{eventType:'periodStart',date:opening.startDate,reading:100}],segments:[],tenantSummaries:[summary]};
let Modal, Tab, History, mounted;
const state = globalThis.__monthlyUtilityTest = {api:{},notifications:[],calls:[],periods:[],rooms:[],afterClose:null};
state.hook = (name,type,id) => {
  if (name === 'useUtilityRooms') return {data:state.rooms};
  if (name === 'useUtilityPeriods') return {data:id ? state.periods : []};
  if (name === 'useUtilityReadings') return {data:[]};
  if (name === 'useUtilityLatestReading') return {data:{reading:{reading:100}}};
  if (name === 'useUtilityResult') return {data:{result:state.periods.find(p=>p.id===id)}};
  return {isPending:false,mutateAsync:async payload=>{
    state.calls.push({name,type,payload});
    if (name === 'useCloseUtilityPeriod') {state.afterClose?.();return {result:{periodId:'period-1',nextPeriodId:'period-next'}};}
    if (name === 'useGenerateHistoricalUtilityPeriod') return {result:{periodId:'historical-1'}};
    return {};
  }};
};
before(async()=>{
  ({default:Modal}=await import('./NewBillingPeriodModal.jsx'));
  ({default:Tab}=await import('./UtilityBillingTab.jsx'));
  ({default:History}=await import('./utility/UtilityCycleHistoryPanel.jsx'));
});
beforeEach(()=>{
  state.calls=[];state.notifications=[];state.afterClose=null;
  state.rooms=[room];state.periods=[opening];
  state.api.previewWater=async payload=>{state.calls.push({name:'previewWater',payload});return {result:preview};};
});
afterEach(()=>{mounted?.unmount();mounted=null;});
const button=(name,root=document.body)=>getByRole(root,'button',{name,exact:true});
const input=name=>getByLabelText(document.body,name,{exact:true});
const click=async element=>act(async()=>{fireEvent.click(element);});
const fill=(element,value)=>act(()=>{fireEvent.change(element,{target:{value}});});
const settlePreview=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,400));});
const modal=(type,props={})=>React.createElement(Modal,{isOpen:true,onClose:()=>{},onSuccess:()=>{},utilityType:type,selectedRoomId:room.id,roomName:room.name,roomBranch:room.branch,activeTenantCount:1,openPeriodForRoom:opening,periods:[opening],defaultRatePerUnit:50,...props});

for (const type of ['electricity','water']) {
  test(`${type}: primary New Billing Period opens monthly context and safely closes the existing ID`,async()=>{
    mounted=mount(React.createElement(Tab,{utilityType:type}));
    fill(input('Filter billing cycle status'),'sent');
    await click(button('New Billing Period'));
    assert.ok(getByRole(document.body,'dialog',{name:'New Billing Period'}));
    const unit=type==='water'?'m\u00b3':'kWh';
    assert.equal(input('Cycle Start').value,'2026-08-01');
    assert.equal(input('Cycle Start').disabled,false);
    assert.equal(input(`Opening Reading (${unit})`).value,'100');
    assert.equal(input(`Opening Reading (${unit})`).disabled,true);
    assert.equal(input(`Rate (PHP/${unit})`).disabled,true);
    assert.equal(input('Cycle End').disabled,false);
    fill(input('Select billing cycle duration preset'),'15d');
    assert.equal(input('Cycle End').value,'2026-08-16');
    fill(input('Select billing cycle duration preset'),'1mo');
    assert.equal(input('Cycle End').value,'2026-08-15');
    fill(input('Cycle End'),'2026-09-01');
    fill(input(`Closing Reading (${unit})`),'118');
    if(type==='water') {
      await settlePreview();
      for(const name of ['Meter Reading History','Consumption Segments','Tenant Allocation']) assert.ok(getByRole(document.body,'table',{name}));
      assert.equal(state.calls.find(c=>c.name==='previewWater').payload.periodId,'period-1');
    }
    assert.match(input('Live Cycle Calculation Preview').textContent,/18.*900/s);
    await click(button('Generate Draft Bills'));
    assert.deepEqual(state.calls.filter(c=>c.name!=='previewWater'),[{name:'useCloseUtilityPeriod',type,payload:{periodId:'period-1',startDate:'2026-08-01',startReading:100,endDate:'2026-09-01',endReading:118}}]);
    // Delayed query refresh: the new open period must not replace the completed selection.
    state.periods=[next,completed];state.rooms=[{...room,readyPeriods:[completed]}];
    mounted.rerender(React.createElement(Tab,{utilityType:type}));
    const region=getByRole(document.body,'region',{name:'Selected cycle tenant breakdown'});
    assert.match(region.textContent,/Monthly Tenant/);
    assert.ok(button('Send'));
    assert.equal(getAllByRole(document.body,'button',{name:'View',exact:true}).length,2);
    mounted.rerender(React.createElement(Tab,{utilityType:type}));
    assert.match(getByRole(document.body,'region',{name:'Selected cycle tenant breakdown'}).textContent,/Monthly Tenant/);
    await click(button('Send'));
    assert.equal(state.calls.some(c=>c.name==='useSendUtilityPeriod'),false,'Send requires confirmation');
    await click(button('Send Now'));
    assert.deepEqual(state.calls.filter(c=>c.name==='useSendUtilityPeriod'),[{name:'useSendUtilityPeriod',type,payload:{periodId:'period-1'}}]);
  });
}

test('no-active monthly form uses atomic generation without opening/deleting or sending',async()=>{
  let focused;
  mounted=mount(modal('electricity',{openPeriodForRoom:null,periods:[],onSuccess:id=>{focused=id;}}));
  fill(input('Cycle Start'),'2026-08-01');fill(input('Opening Reading (kWh)'),'100');fill(input('Closing Reading (kWh)'),'118');
  assert.equal(input('Cycle Start').disabled,false);
  await click(button('Generate Draft Bills'));
  assert.deepEqual(state.calls.map(c=>c.name),['useGenerateHistoricalUtilityPeriod']);
  assert.equal(focused,'historical-1');
});

for (const type of ['electricity','water']) test(`${type}: editable starts follow evidence and monthly cutoff, including partial cycles`,async()=>{
  const unit=type==='water'?'m\u00b3':'kWh';
  mounted=mount(modal(type,{openPeriodForRoom:null,periods:[],latestReading:{date:'2026-09-20T10:00:00+08:00',reading:120},readings:[{date:'2026-09-20T10:00:00+08:00',reading:120},{date:'2026-10-15T00:00:00+08:00',reading:125}]}));
  assert.equal(input('Cycle Start').value,'2026-09-20');
  assert.equal(input('Cycle End').value,'2026-10-15');
  assert.equal(input(`Opening Reading (${unit})`).value,'120');
  fill(input('Cycle Start'),'2026-10-15');
  assert.equal(input('Cycle End').value,'2026-11-15');
  assert.equal(input(`Opening Reading (${unit})`).value,'125');
  fill(input('Cycle Start'),'2026-10-16');
  assert.equal(input(`Opening Reading (${unit})`).value,'');
  assert.equal(button('Generate Draft Bills').disabled,true);
  assert.doesNotMatch(document.body.textContent,/recommended send window|wait 3 days|countdown/i);
});

test('Water rejects stale preview after the closing observation changes',async()=>{
  mounted=mount(modal('water'));
  fill(input('Closing Reading (m\u00b3)'),'118');await settlePreview();
  assert.equal(button('Generate Draft Bills').disabled,false);
  fill(input('Closing Reading (m\u00b3)'),'120');
  assert.equal(button('Generate Draft Bills').disabled,true);
  assert.equal(queryByRole(document.body,'table',{name:'Tenant Allocation'}),null);
  await settlePreview();assert.equal(button('Generate Draft Bills').disabled,false);
});

test('legacy Water keeps truthful history labels and cannot be silently finalized as measured water',()=>{
  mounted=mount(modal('water',{openPeriodForRoom:{...opening,calculationVersion:'legacy'}}));
  assert.match(document.body.textContent,/legacy Water billing/);
  assert.equal(button('Generate Draft Bills').disabled,true);
  assert.equal(document.querySelector('input[aria-label="Opening Reading (m\u00b3)"]'),null);
  mounted.unmount();
  const p={...completed,calculationVersion:'legacy'};
  mounted=mount(React.createElement(History,{utilityType:'water',periods:[p],filteredPeriods:[p],pagedPeriods:[p],periodsPage:1,totalPeriodPages:1,selectedPeriodId:p.id}));
  assert.match(mounted.container.textContent,/Legacy room total:/);
  assert.doesNotMatch(mounted.container.textContent,/\/m\u00b3|100.*118|Consumption: 18/);
  const measured={...completed,startReading:100.1234,endReading:118.2345};
  mounted.rerender(React.createElement(History,{utilityType:'water',periods:[measured],filteredPeriods:[measured],pagedPeriods:[measured],periodsPage:1,totalPeriodPages:1,selectedPeriodId:measured.id}));
  assert.match(mounted.container.textContent,/100\.1234.*118\.2345/);
});

test('batch ready discovers and sends both completed periods in an active room',async()=>{
  const older={...completed,id:'period-older',startDate:'2026-07-01',endDate:'2026-08-01'};
  state.periods=[next,completed,older];state.rooms=[{...room,readyPeriods:[completed,older]}];
  mounted=mount(React.createElement(Tab,{utilityType:'water'}));
  await click(button('Send Ready (2)'));
  assert.match(document.body.textContent,/2.*cycles/s);
  const send=getAllByRole(document.body,'button').find(b=>/Send Selected/.test(b.textContent));
  assert.ok(send);await click(send);
  assert.deepEqual(state.calls.filter(c=>c.name==='useSendUtilityPeriod').map(c=>c.payload.periodId).sort(),['period-1','period-older']);
});

test('completed selection survives stale lists, next-cycle refresh and a deliberate selection change',()=>{
  assert.equal(completedUtilityPeriodId({result:{periodId:'done',nextPeriodId:'next'}}),'done');
  for(const periods of [[],[next],[next,completed]]) assert.equal(selectUtilityPeriod({periods,selectedId:'period-1',completedId:'period-1'}),'period-1');
  assert.equal(selectUtilityPeriod({periods:[next,completed],selectedId:next.id,completedId:completed.id}),next.id);
  assert.equal(selectUtilityPeriod({periods:[next],selectedId:'other-room',completedId:null}),next.id);
  assert.deepEqual(readyUtilityCycles([{...room,readyPeriods:[completed]}]).map(c=>[c.roomId,c.period.id]),[[room.id,completed.id]]);
});
