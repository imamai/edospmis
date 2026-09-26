/** Shared between the single-invoice and bulk "Record payment" forms, so the same five options are offered everywhere a payment gets recorded. */
export const PAYMENT_METHODS = ["Cash", "M-Pesa", "Bank transfer", "Card", "Cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
