// Safe for the browser: no model or database imports here.

/** How a customer paid: through Paystack, in cash, or by bank transfer to the farm's account. */
export const PAYMENT_METHODS = ["bank-transfer", "cash", "paystack"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  "bank-transfer": "Bank transfer",
  cash: "Cash",
  paystack: "Paystack",
};
