/** The people e2e/server.mts seeds, one per role, all with the same password. */
export const E2E_PASSWORD = "fowlex-e2e-password";

export const E2E_USERS = {
  owner: { email: "owner@fowlex.test", name: "Ada Owner", role: "owner" },
  manager: { email: "manager@fowlex.test", name: "Musa Manager", role: "manager" },
  staff: { email: "staff@fowlex.test", name: "Tunde Staff", role: "staff" },
} as const;
