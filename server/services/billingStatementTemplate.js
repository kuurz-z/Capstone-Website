/**
 * Persisted identity of the canonical billing-statement layout.
 *
 * Increment this value whenever generateBillPdf() changes presentation or
 * document semantics. Existing cached PDFs then become stale deterministically
 * even when the underlying Bill data itself did not change.
 */
export const BILL_STATEMENT_TEMPLATE_VERSION = 5;
export const BILL_STATEMENT_TEMPLATE_MARKER =
  `lilycrest-billing-statement/v${BILL_STATEMENT_TEMPLATE_VERSION}`;
