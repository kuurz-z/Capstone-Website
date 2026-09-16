import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import React from 'react';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost'});
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {value:dom.window.navigator, configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {render, fireEvent, waitFor, cleanup, act} = await import('@testing-library/react');
const source = readFileSync(new URL('./StayExtensionRequests.jsx', import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replace('export default function','function');
const {code} = await transform(source, {loader:'jsx',format:'cjs'});
const fixture = { _id:'request-1',status:'approved',fulfillmentState:'action_required',months:6,monthlyRent:6300,
 currentStartDate:'2026-04-15',currentEndDate:'2027-01-14',requestedEndDate:'2027-07-14',
 tenantId:{firstName:'Test',lastName:'Tenant'},roomId:{name:'301'},
 preparationFailure:{code:'LEASE_DURATION_CONFLICT',message:'Renewal dates require review.'}};
function component(fetch) {
 return new Function('React','useCallback','useEffect','useRef','useState','authFetch','showNotification',code+'; return StayExtensionRequests;')
 (React,React.useCallback,React.useEffect,React.useRef,React.useState,fetch,()=>{});
}
test('the Tenants workspace includes the connected extension request component', () => {
 const page = readFileSync(new URL('../pages/TenantsWorkspacePage.jsx', import.meta.url), 'utf8');
 assert.match(page, /import StayExtensionRequests from ['"]\.\.\/components\/StayExtensionRequests['"]/);
 assert.match(page, /<StayExtensionRequests\s+onReviewed=\{\(\) => queryClient\.invalidateQueries\(\)\}/);
});
test('Admin sees the exact preparation error and can retry without approving again',async()=>{
 const calls=[];let retried=false;
 const Component=component(async(url, options)=>{calls.push({url,options});if(options){retried=true;return {};}
 return {requests:[retried?{...fixture,fulfillmentState:'awaiting_contract',preparationFailure:null}:fixture]};});
 try {
 const view=render(React.createElement(Component));
 await waitFor(()=>assert.match(view.getByRole('alert').textContent,/LEASE_DURATION_CONFLICT/));
 assert.equal(view.queryByText('Approve extension'),null);
 fireEvent.click(view.getByText('Retry contract preparation'));
 await waitFor(()=>assert.ok(view.getByText('Contract: awaiting contract')));
 const sent=calls.find(c=>c.options);
 assert.equal(sent.url,'/tenant/stay-extension-requests/request-1');
 assert.equal(JSON.parse(sent.options.body).decision,'retry_preparation');
 assert.equal(view.queryByText('Retry contract preparation'),null);
 } finally {cleanup();}
});
test('prepared approved requests expose no retry action',async()=>{
 const Component=component(async()=>({requests:[{...fixture,fulfillmentState:'awaiting_effective_date',preparationFailure:null}]}));
 try {const view=render(React.createElement(Component));
 await waitFor(()=>assert.ok(view.getByText('Contract: awaiting effective date')));
 assert.equal(view.queryByRole('alert'),null);assert.equal(view.queryByText('Retry contract preparation'),null);
 } finally {cleanup();}
});

test('polling discovers new requests and releases its timer on unmount', async () => {
 const originalSet = window.setInterval, originalClear = window.clearInterval;
 let tick, delay, cleared = false, available = false;
 window.setInterval = (callback, milliseconds) => { tick = callback; delay = milliseconds; return 42; };
 window.clearInterval = (id) => { if (id === 42) cleared = true; };
 const Component = component(async () => ({ requests: available ? [{...fixture, status:'pending', fulfillmentState:null}] : [] }));
 try {
   const view = render(React.createElement(Component));
   await waitFor(() => assert.equal(typeof tick, 'function'));
   assert.equal(delay, 30_000);
   available = true;
   tick();
   await waitFor(() => assert.ok(view.getByText('Approve extension')));
   view.unmount();
   assert.equal(cleared, true);
 } finally { cleanup(); window.setInterval = originalSet; window.clearInterval = originalClear; }
});

test('an older load cannot overwrite the authoritative post-decision response', async () => {
 let resolveOld, reads = 0;
 const Component = component(async (_url, options) => {
   if (options) return {};
   reads += 1;
   if (reads === 2) return new Promise(resolve => { resolveOld = resolve; });
   return { requests: [{ ...fixture, status: reads === 1 ? 'pending' : 'rejected', fulfillmentState: null }] };
 });
 try {
   const view = render(React.createElement(Component));
   await waitFor(() => assert.ok(view.getByText('Approve extension')));
   fireEvent.click(view.getByText('Refresh'));
   fireEvent.click(view.getByText('Reject'));
   await waitFor(() => assert.ok(view.getByText('rejected')));
   await act(async () => { resolveOld({ requests: [{ ...fixture, status: 'pending', fulfillmentState: null }] }); });
   assert.ok(view.getByText('rejected'));
   assert.equal(view.queryByText('Approve extension'), null);
 } finally { cleanup(); }
});

test('hidden tabs do not poll; returning to the tab refreshes and listeners are removed', async () => {
 const originalSet = window.setInterval, originalClear = window.clearInterval;
 const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
 let tick, reads = 0, visibility = 'hidden';
 Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
 window.setInterval = callback => { tick = callback; return 42; };
 window.clearInterval = () => {};
 const Component = component(async () => { reads += 1; return { requests: [] }; });
 try {
   const view = render(React.createElement(Component));
   await waitFor(() => assert.equal(reads, 1));
   await act(async () => { tick(); window.dispatchEvent(new window.Event('focus')); });
   assert.equal(reads, 1);
   visibility = 'visible';
   await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); });
   assert.equal(reads, 2);
   await act(async () => { window.dispatchEvent(new window.Event('focus')); });
   assert.equal(reads, 3);
   view.unmount();
   window.dispatchEvent(new window.Event('focus'));
   document.dispatchEvent(new window.Event('visibilitychange'));
   assert.equal(reads, 3);
 } finally {
   cleanup(); window.setInterval = originalSet; window.clearInterval = originalClear;
   if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
   else delete document.visibilityState;
 }
});
