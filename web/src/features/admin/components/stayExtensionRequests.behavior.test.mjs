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
const {render, fireEvent, waitFor, cleanup} = await import('@testing-library/react');
const source = readFileSync(new URL('./StayExtensionRequests.jsx', import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replace('export default function','function');
const {code} = await transform(source, {loader:'jsx',format:'cjs'});
const fixture = { _id:'request-1',status:'approved',fulfillmentState:'action_required',months:6,monthlyRent:6300,
 currentStartDate:'2026-04-15',currentEndDate:'2027-01-14',requestedEndDate:'2027-07-14',
 tenantId:{firstName:'Test',lastName:'Tenant'},roomId:{name:'301'},
 preparationFailure:{code:'LEASE_DURATION_CONFLICT',message:'Renewal dates require review.'}};
function component(fetch) {
 return new Function('React','useCallback','useEffect','useState','authFetch','showNotification',code+'; return StayExtensionRequests;')
 (React,React.useCallback,React.useEffect,React.useState,fetch,()=>{});
}
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
