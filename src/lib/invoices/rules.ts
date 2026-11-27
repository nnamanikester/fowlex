// Safe for the browser: no model or database imports here.

/** Stored: a draft being checked, sent to the customer, or voided (its number kept). */
export const INVOICE_STATES = ["draft", "sent", "void"] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];
/** What a person sees: a sent invoice is part-paid, paid or overdue by its payments and due date. */
export type InvoiceStatus = "draft" | "sent" | "part-paid" | "paid" | "overdue" | "void";
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  "part-paid": "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};
export const INVOICE_TONE = {
  draft: "neutral",
  sent: "info",
  "part-paid": "warning",
  paid: "success",
  overdue: "danger",
  void: "neutral",
} as const;

export type InvoiceLine = { orderId: string | null; description: string; amountKobo: number };

/** Where an invoice stands: payments and the due date decide, once it's out. */
export function invoiceStatus(
  i: { state: InvoiceState; totalKobo: number; paidKobo: number; dueDate: string },
  today: string,
): InvoiceStatus {
  if (i.state === "void") return "void";
  if (i.totalKobo > 0 && i.paidKobo >= i.totalKobo) return "paid";
  // Money paid on a draft means the customer has it: it's part paid, not just a draft.
  if (i.state === "draft") return i.paidKobo > 0 ? "part-paid" : "draft";
  if (i.dueDate < today) return "overdue";
  return i.paidKobo > 0 ? "part-paid" : "sent";
}

/** VAT on the amount after discount, from basis points (750 is 7.5%), to the kobo. */
export const vatOn = (kobo: number, rateBps: number) => Math.round((kobo * rateBps) / 10_000);

/** Subtotal, VAT and total from the lines and a discount. */
export function invoiceTotals(lines: { amountKobo: number }[], discountKobo: number, vatRateBps: number | null) {
  const subtotalKobo = lines.reduce((n, l) => n + l.amountKobo, 0);
  const taxable = Math.max(0, subtotalKobo - discountKobo);
  const vatKobo = vatRateBps ? vatOn(taxable, vatRateBps) : 0;
  return { subtotalKobo, discountKobo, vatKobo, totalKobo: taxable + vatKobo };
}
