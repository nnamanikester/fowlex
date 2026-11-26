/** The people e2e/server.mts seeds, all with the same password. */
export const E2E_PASSWORD = "fowlex-e2e-password";

export const E2E_USERS = {
  owner: { email: "owner@fowlex.test", name: "Ada Owner", role: "owner" },
  manager: { email: "manager@fowlex.test", name: "Musa Manager", role: "manager" },
  staff: { email: "staff@fowlex.test", name: "Tunde Staff", role: "staff" },
  customer: { email: "buyer@grill-lounge.test", name: "The Grill Lounge", role: "customer" },
  /** Only for the password-reset test, which changes this person's password. */
  forgetful: { email: "forgetful@fowlex.test", name: "Femi Forgetful", role: "staff" },
} as const;

/** Today in Lagos, and a day so many days before it, as the app counts them. */
const lagosToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const daysAgo = (days: number) => {
  const d = new Date(`${lagosToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/** Houses and batches e2e/server.mts seeds, so the shell and batch pages have something real. */
export const E2E_HOUSES = [
  { name: "House 1", capacity: 5000 },
  { name: "House 2", capacity: 2000 },
] as const;
export const E2E_BATCHES = [
  { house: "House 1", placedOn: daysAgo(24), delivered: 1000, day: 24 },
  { house: "House 2", placedOn: daysAgo(10), delivered: 1200, day: 10 },
].map((b, i) => ({ ...b, code: `B-${b.placedOn.slice(0, 4)}-${String(i + 1).padStart(2, "0")}` }));
