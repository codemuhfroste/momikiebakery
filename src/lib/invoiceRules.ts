// When the store must write an invoice in its BIR-registered booklet. This
// system is not BIR-registered: its printouts are only supplementary
// receipts, so End of Day lists what the cashier has to invoice by hand.
//
// For a non-VAT seller (RR 7-2024, as the store understands it — still to be
// confirmed with its bookkeeper / RDO):
//  - one invoice for each sale above the threshold;
//  - one summary invoice for the day's smaller sales once their total goes
//    over the threshold;
//  - an invoice whenever a buyer asks, whatever the amount.
//
// Sources differ on "more than ₱500" vs "₱500 or more". Until that is
// confirmed, a sale of exactly ₱500 is treated as needing its own invoice:
// writing one too many is safe, missing one is not.
export const INVOICE_THRESHOLD = 500;
export const INVOICE_AT_THRESHOLD = true; // false = only sales strictly above ₱500

export function needsOwnInvoice(total: number): boolean {
  return INVOICE_AT_THRESHOLD ? total >= INVOICE_THRESHOLD - 0.004 : total > INVOICE_THRESHOLD + 0.004;
}
