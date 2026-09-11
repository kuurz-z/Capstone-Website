import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('./WaterBillingTables.jsx',import.meta.url),'utf8');
const code=transformSync(source,{loader:'jsx',jsx:'transform'}).code;
const Tables=new Function('React',code.replace('export default function WaterBillingTables','return function WaterBillingTables'))(React);

test('tenant water breakdown renders the three auditable snapshot tables',()=>{
 const html=renderToStaticMarkup(React.createElement(Tables,{data:{calculationVersion:'water-meter-v1',ratePerUnit:50,
 meterEvents:[{eventType:'moveIn',date:'2026-08-01',reading:100}],segments:[{startDate:'2026-08-01',endDate:'2026-09-01',readingFrom:100,readingTo:118,unitsConsumed:18,coveredTenantNames:['A','B']}],
 tenantSummaries:[{tenantName:'A',totalUsage:12,billAmount:600},{tenantName:'B',totalUsage:6,billAmount:300}]}}));
 assert.equal((html.match(/<table /g)||[]).length,3);
 for(const label of ['Meter Reading History','Consumption Segments','Tenant Allocation','m³','600.00','300.00']) assert.ok(html.includes(label),label);
});

test('mixed allocations retain unknown legacy measurements and recorded money',()=>{
 const html=renderToStaticMarkup(React.createElement(Tables,{data:{allocations:[{allocationId:'legacy',tenantAmount:75},{allocationId:'meter',calculationVersion:'water-meter-v1',tenantAllocations:[{tenantName:'A',consumptionShare:2,rate:50,amount:100}]}]}}));
 assert.ok(html.includes('are unknown'));assert.ok(html.includes('75.00'));assert.ok(html.includes('100.00'));
});
