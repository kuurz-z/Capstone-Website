// New HTTP responses may contain the embedded request or its authoritative
// projection (the mobile backend currently emits requestId + flat fields).
export function normalizeSupportConcern(conversation, report = console.error) {
  if (!conversation) return null;
  const request = conversation.request;
  const requestId = request?.id || (conversation.legacy !== true ? conversation.requestId : null) || null;
  const legacy = !requestId && !request;
  const source = request || conversation;
  const satisfaction = source.satisfaction;
  const mismatch = Boolean(satisfaction && (!requestId || satisfaction.requestId !== requestId));
  if (mismatch) report('Support satisfaction association mismatch', { requestId, satisfactionRequestId: satisfaction.requestId });
  const validScore = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
  const completed = !legacy && ['resolved', 'closed'].includes(source.status) && satisfaction && !mismatch && validScore(satisfaction.rating);
  const historical = legacy && validScore(source.satisfactionRating);
  const rating = completed ? satisfaction.rating : historical ? source.satisfactionRating : null;
  const ratingState = mismatch || (!legacy && satisfaction && !completed) ? 'unavailable'
    : completed ? 'rated' : historical ? 'historical' : legacy ? 'legacy'
    : source.status === 'resolved' ? 'unrated' : 'active';
  return {
    ...conversation,
    // id remains the thread id for existing message components.
    id: String(conversation.id || conversation._id || ''),
    conversationId: String(conversation.id || conversation._id || ''),
    requestId, legacy,
    ...Object.fromEntries(['concern', 'category', 'priority', 'status', 'branch', 'assignedAdminId',
      'assignedAdminName', 'resolvedAt', 'resolvedBy', 'closingNote', 'statusHistory', 'createdAt', 'updatedAt']
      .map((key) => [key, source[key] ?? (request ? null : conversation[key])])),
    resolutionNote: source.closingNote || '',
    rating, ratingState,
    feedback: rating !== null ? (completed ? satisfaction.feedback : source.satisfactionFeedback) || '' : '',
    ratedAt: rating !== null ? (completed ? satisfaction.submittedAt : source.satisfactionRatedAt) || null : null,
    revision: Number(conversation.supportRevision ?? conversation.revision ?? 0),
    lifecycleLocked: historical || source.status === 'closed' || (source.status === 'resolved' && Boolean(satisfaction || source.satisfactionRating != null)),
  };
}

export function reconcileSupportConcern(current, incoming) {
  if (!incoming) return current;
  const next = normalizeSupportConcern(incoming);
  if (!current || current.conversationId !== next.conversationId) return next;
  if (current.requestId && next.requestId !== current.requestId) {
    console.error('Support request identity changed', { conversationId: current.conversationId });
    return current;
  }
  if (['rated', 'historical'].includes(current.ratingState) && !['rated', 'historical'].includes(next.ratingState)) return current;
  return current.revision > next.revision ? current : next;
}

// Matches the shared API's supportRequestService.js admin transitions.
export function allowedSupportStatuses(concern) {
  if (!concern || concern.lifecycleLocked) return [];
  if (concern.legacy) return ['open', 'in_review', 'waiting_tenant', 'resolved', 'closed'].filter((s) => s !== concern.status);
  return ({ open: ['in_review', 'waiting_tenant', 'resolved'], in_review: ['waiting_tenant', 'resolved'],
    waiting_tenant: ['in_review', 'resolved'], resolved: [], closed: [] })[concern.status] || [];
}

export function supportStatusPayload(concern, status, note = '') {
  if (!allowedSupportStatuses(concern).includes(status)) throw new Error('This status transition is not allowed. Refresh the concern.');
  const trimmed = note.trim();
  if (status === 'resolved' && !trimmed) throw new Error('A resolution note is required.');
  if (trimmed.length > 1000) throw new Error('The note must be at most 1000 characters.');
  return { status, note: trimmed, ...(concern.requestId ? { requestId: concern.requestId, revision: concern.revision } : {}) };
}

export function supportNotificationUrl(notification) {
  const data = notification?.data || notification?.metadata || {};
  const requestId = notification?.requestId || data.requestId || data.request_id;
  const conversationId = notification?.conversationId || data.conversationId || data.conversation_id;
  const support = conversationId || notification?.entityType === 'chat' || /^(chat|support)_/.test(notification?.type || '') || notification?.actionUrl?.startsWith('/admin/chat');
  if (!support || (!requestId && !conversationId)) return null;
  const params = new URLSearchParams();
  if (requestId) params.set('requestId', requestId);
  if (conversationId) params.set('conversationId', conversationId);
  return `/admin/chat?${params}`;
}
