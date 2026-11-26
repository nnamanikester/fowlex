/**
 * Who can do what: one table from role to permission. The shell hides what a role can't open;
 * step 1.8 adds the server-side guards (requireRole, requirePermission) on top of the same table.
 */
export const ROLES = ["owner", "manager", "staff", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  customer: "Customer",
};

export const PERMISSIONS = [
  // Farm
  "batch.read",
  "batch.write",
  "log.write",
  "inventory.read",
  "inventory.write",
  "supplier.read",
  // Sales
  "customer.read",
  "contract.read",
  "sales.read",
  "invoice.read",
  // Money
  "expense.read",
  "expense.write",
  "expense.approve",
  "finance.read",
  // Team
  "people.read",
  "payroll.read",
  "payroll.run",
  "payout.send",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Partners can do everything. Only they move money, approve and change settings. */
const OWNER_ONLY: Permission[] = ["expense.approve", "payroll.run", "payout.send", "settings.manage"];
/** Farm hands log the day and see the birds and stock they look after, but no money. */
const STAFF: Permission[] = ["batch.read", "log.write", "inventory.read"];

const TABLE: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  manager: new Set(PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p))),
  staff: new Set(STAFF),
  // Customers only reach the portal (step 6.7), never the dashboard.
  customer: new Set(),
};

export function can(role: Role, permission: Permission) {
  return TABLE[role].has(permission);
}
