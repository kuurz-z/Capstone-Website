// Legal document bounds, independent of promotional pricing eligibility.
export const LEGAL_LEASE_TERMS = Object.freeze({
  'short-term': Object.freeze({ minimumMonths: 1, maximumMonths: 5 }),
  'long-term': Object.freeze({ minimumMonths: 6, maximumMonths: null }),
});

export function resolveLegalLeaseType(months) {
  const duration = Number(months);
  const match = Object.entries(LEGAL_LEASE_TERMS).find(([, bounds]) =>
    Number.isInteger(duration) && duration >= bounds.minimumMonths &&
    (bounds.maximumMonths === null || duration <= bounds.maximumMonths));
  if (!match) throw Object.assign(new Error('A positive whole-month legal term is required.'), {
    code: 'CONTRACT_LEASE_DURATION_INVALID', statusCode: 422,
  });
  return match[0];
}
