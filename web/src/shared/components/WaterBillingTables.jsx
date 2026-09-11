const number = value => value == null ? 'Unknown' : Number(value).toLocaleString('en-PH',{maximumFractionDigits:4});
const money = value => value == null ? 'Unknown' : `₱${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}) : 'Unknown';
const eventLabel = type => ({moveIn:'Move-In',moveOut:'Move-Out',periodStart:'Opening Baseline',periodEnd:'Billing Closing'})[type] || type;
const cell = 'border-b border-border px-3 py-2 text-left';
function Table({title,headers,rows}) {
  return <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs text-foreground">
    <caption className="px-3 py-2 text-left text-sm font-semibold">{title}</caption>
    <thead className="bg-muted/40"><tr>{headers.map(h=><th key={h} scope="col" className={cell}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j} className={cell}>{v}</td>)}</tr>)}</tbody>
  </table></div>;
}
export default function WaterBillingTables({data}) {
  if (!data) return null;
  if (data.allocations) return <div className="space-y-5">{data.allocations.map((a,i)=><WaterBillingTables key={a.allocationId || i} data={a}/>)}</div>;
  if (data.calculationVersion !== 'water-meter-v1') return <p className="text-xs text-muted-foreground">Historical water allocation. Physical readings, consumption, and price per m³ are unknown. Recorded charge: {money(data.tenantAmount ?? data.record?.myShare ?? data.computedTotalCost)}.</p>;
  const rate=data.ratePerCubicMeter ?? data.pricingSnapshot?.ratePerUnit ?? data.ratePerUnit;
  const segments=data.consumptionSegments || data.segments || [];
  const allocations=data.tenantAllocations || (data.tenantSummaries || []).map(s=>({tenantName:s.tenantName,consumptionShare:s.totalUsage,rate,amount:s.billAmount}));
  return <div className="space-y-3" aria-label="Water billing details">
    {data.roomName && <p className="text-sm font-semibold">{data.roomName} {data.record?.cycleStart && ` \u00b7 ${date(data.record.cycleStart)} \u2013 ${date(data.record.cycleEnd)}`}</p>}
    <Table title="Meter Reading History" headers={['Event','Date','Reading (m³)']} rows={(data.meterEvents || []).map(e=>[eventLabel(e.eventType),date(e.date || e.observedAt),number(e.reading)])}/>
    <Table title="Consumption Segments" headers={['Period','Opening (m³)','Closing (m³)','Consumption (m³)','Occupants']} rows={segments.map(s=>[`${date(s.startDate)} – ${date(s.endDate)}`,number(s.readingFrom),number(s.readingTo),number(s.unitsConsumed),(s.coveredTenantNames || []).join(', ') || `Vacant (${s.activeTenantCount || 0})`])}/>
    <Table title="Tenant Allocation" headers={['Tenant','Consumption Share (m³)','Rate (PHP/m³)','Final Charge']} rows={allocations.map(a=>[a.tenantName,number(a.consumptionShare),money(a.rate),money(a.amount)])}/>
  </div>;
}
