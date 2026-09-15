// A cycle has one nonarchived regular-rent parent invoice. Legacy utilities
// may be typed monthly and retain rent-cycle dates, but do not own rent.
// Voided/waived parents retain ownership: replacing them requires the existing
// reviewed archive workflow. Installments are owned by their parent invoice.
export const RENT_BILL_CYCLE_INDEX = {
  name: 'unique_reservation_billing_cycle',
  key: { reservationId: 1, billingCycleStart: 1 },
  unique: true,
  partialFilterExpression: {
    reservationId: { $type: 'objectId' },
    billingCycleStart: { $type: 'date' },
    billType: 'monthly',
    'charges.rent': { $gt: 0 },
    isArchived: false,
    parentInvoiceId: null,
  },
};
