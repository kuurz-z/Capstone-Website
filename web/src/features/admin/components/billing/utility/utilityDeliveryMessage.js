export function utilityDeliveryMessage(response = {}) {
  const deliveries = response.deliveries || [];
  const outcomes = deliveries.map(item => item.notificationDelivery).filter(Boolean);
  if (outcomes.some(item => !item.notificationPersisted)) return {
    tone: 'warn', message: 'Charges are published. Some tenant notifications still need delivery. Use Retry notifications to check them.',
  };
  if (outcomes.some(item => ['failed', 'partial', 'pending'].includes(item.push?.status))) return {
    tone: 'warn', message: 'In-app notifications are available. Some device notifications need a retry; charges will not be published again.',
  };
  if (outcomes.some(item => item.push?.status === 'no_eligible_token')) return {
    tone: 'info', message: 'In-app notifications are available. Some tenants have no enabled device for push notifications.',
  };
  if (outcomes.some(item => item.push?.status === 'legacy_unverified')) return {
    tone: 'info', message: 'Existing notifications were preserved. Earlier device delivery cannot be confirmed.',
  };
  return { tone: 'success', message: outcomes.length
    ? 'In-app notifications are available. Device notifications were accepted by the push provider.'
    : 'Utility publication is complete.' };
}
