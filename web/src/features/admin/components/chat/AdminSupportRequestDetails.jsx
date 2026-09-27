const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('en-PH') : '—';

export default function AdminSupportRequestDetails({ concern }) {
  const c = concern;
  return <section aria-label="Support request details" className="border-b border-border bg-card p-4 text-xs space-y-3 max-h-64 overflow-y-auto shrink-0">
    <h3 className="font-semibold">{c.legacy ? 'Historical conversation' : `Support request ${c.requestId || '(identity unavailable)'}`}</h3>
    <dl className="grid grid-cols-2 gap-2">
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
  </section>;
}
