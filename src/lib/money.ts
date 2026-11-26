/**
 * Money is stored as whole kobo (integers): ₦1,234.56 is 123456. Naira appear only on screen and in
 * PDFs, through these helpers. No floating-point maths on money anywhere else.
 */

const NAIRA = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const NAIRA_COMPACT = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 1,
});
const GROUPED = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 → "₦1,234.56". `compact` for axes and tight spaces: 125000000 → "₦1.3M". */
export function formatNaira(kobo: number, { compact = false }: { compact?: boolean } = {}) {
  assertKobo(kobo);
  return (compact ? NAIRA_COMPACT : NAIRA).format(kobo / 100);
}

/** 123456 → "1,234.56": naira without the sign, as a MoneyInput shows it. */
export function formatNairaPlain(kobo: number) {
  assertKobo(kobo);
  return GROUPED.format(kobo / 100);
}

/** What a person may type as naira: digits with optional commas, and at most two decimals. */
const TYPED = /^\d[\d,]*(\.\d{0,2})?$|^\.\d{1,2}$/;

/**
 * "₦ 1,234.56" → 123456. Whole kobo or null: more than two decimals, a minus sign or anything that
 * isn't a number gives null rather than a rounded guess. Integer maths only.
 */
export function nairaToKobo(input: string): number | null {
  const text = input.replace(/[₦\s]/g, "");
  if (!text || !TYPED.test(text)) return null;
  const [whole = "", fraction = ""] = text.replace(/,/g, "").split(".");
  const kobo = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(kobo) ? kobo : null;
}

/** True while `input` could still become a valid amount: what MoneyInput lets someone type. */
export function isTypingNaira(input: string) {
  return input === "" || TYPED.test(input.replace(/[₦\s]/g, ""));
}

function assertKobo(kobo: number) {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`Money must be whole kobo, got ${kobo}`);
}
