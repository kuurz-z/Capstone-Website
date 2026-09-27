const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('en-PH') : '—';

export default function AdminSupportRequestDetails({ concern }) {
  const c = concern;
  return <details key={`${c.id}:${c.requestId || 'legacy'}`} aria-label="Support request details" className="admin-chat-request border-b border-border bg-card text-xs shrink-0 group">
    <summary className="cursor-pointer px-3 py-2 list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold min-w-0 break-words">{c.legacy ? 'Historical conversation' : `Support request ${c.requestId || '(identity unavailable)'}`}</h3>
        <span className="shrink-0 text-muted-foreground group-open:hidden">View details <span aria-hidden="true">▾</span></span>
        <span className="shrink-0 text-muted-foreground hidden group-open:inline">Hide details <span aria-hidden="true">▴</span></span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        <span>Status: {c.status || '—'}</span><span>Priority: {c.priority || '—'}</span>
        <span className="min-w-0 break-words">Assigned: {c.assignedAdminName || 'Unassigned'}</span>
      </p>
    </summary>
    <div className="admin-chat-request-body px-3 pb-3 space-y-3" tabIndex={0} role="region" aria-label="Request metadata and satisfaction">
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {[['Concern', c.concern], ['Category', c.category], ['Priority', c.priority], ['Status', c.status],
        ['Assigned admin', c.assignedAdminName || 'Unassigned'], ['Created at', dateLabel(c.createdAt)],
        ['Resolved at', dateLabel(c.resolvedAt)], ['Resolved by', c.resolvedBy], ['Resolution note', c.resolutionNote]]
        .map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}
    </dl>
    {['rated', 'unrated', 'unavailable', 'historical'].includes(c.ratingState) && <div aria-label="Tenant Satisfaction" className="border-t border-border pt-2 space-y-1">
      <h4 className="font-semibold">{c.legacy ? 'Historical conversation satisfaction' : 'Tenant Satisfaction'}</h4>
      {c.ratingState === 'unavailable' ? <p>Rating unavailable: association could not be verified.</p>
        : c.ratingState === 'unrated' ? <p>Not yet rated</p> : <>
          <p aria-label={`${c.rating} out of 5 stars`}>{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)} {c.rating}/5</p>
          {c.feedback && <p className="whitespace-pre-wrap break-words">Feedback: {c.feedback}</p>}
          {c.ratedAt && <p>Submitted: {dateLabel(c.ratedAt)}</p>}
          {!c.legacy && <p>Completed historical support. Tenant rating is read-only.</p>}
        </>}
    </div>}
    </div>
  </details>;
}
