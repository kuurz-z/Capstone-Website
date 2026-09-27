// Read-only presentation of persisted history, including pre-confirmation records.
// These are system events, never stored as tenant/admin chat messages.
export function supportLifecycleEvents(doc) {
  const events = [];
  for (const [index, entry] of (doc.statusHistory || []).entries()) {
    const type = entry.eventType || (entry.status === 'resolved' ? (doc.request ? 'admin_resolved' : 'historical_resolved') : '');
    if (!['admin_resolved', 'historical_resolved', 'tenant_confirmed', 'tenant_reopened'].includes(type)) continue;
    const message = type === 'admin_resolved'
      ? `Admin marked this inquiry as resolved${entry.note ? `\nResolution note: ${entry.note}` : ''}`
      : type === 'historical_resolved' ? `Inquiry marked resolved${entry.note ? `\n${entry.note}` : ''}`
      : type === 'tenant_reopened'
        ? `Tenant reported the concern is still unresolved\nInquiry reopened${entry.note ? `\n${entry.note}` : ''}`
        : `Tenant confirmed the inquiry is resolved\n${'★'.repeat(entry.rating || 0)} ${entry.rating}/5${entry.feedback ? `\n${entry.feedback}` : ''}`;
    events.push({ id: `lifecycle:${entry.eventId || `${doc.request?.id || doc._id}:${index}`}`,
      eventType: type, senderRole: 'system', message, createdAt: entry.createdAt });
  }
  const rating = doc.request
    ? (doc.satisfaction?.requestId === doc.request.id ? doc.satisfaction.rating : null)
    : doc.satisfactionRating;
  if (rating >= 1 && rating <= 5 && !events.some((e) => e.eventType === 'tenant_confirmed')) {
    const feedback = doc.satisfaction?.feedback || doc.satisfactionFeedback;
    events.push({ id: `lifecycle:rating:${doc.request?.id || doc._id}`, eventType: 'tenant_confirmed', senderRole: 'system',
      message: `Tenant confirmed the inquiry is resolved\n${'★'.repeat(rating)} ${rating}/5${feedback ? `\n${feedback}` : ''}`,
      createdAt: doc.satisfaction?.submittedAt || doc.satisfactionRatedAt || doc.resolvedAt || doc.updatedAt });
  }
  return events;
}
