/**
 * Who can do what: one table from role to permission. The shell hides what a role can't open;
 * step 1.8 adds the server-side guards (requireRole, requirePermission) on top of the same table.
 */
export const ROLES = ["owner", "manager", "finance", "sales", "staff", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  finance: "Finance",
  sales: "Sales",
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
  "supplier.write",
  // Sales
  "customer.read",
  "customer.write",
  "contract.read",
  "contract.write",
  "contract.approve",
  "sales.read",
  "sales.write",
  "invoice.read",
  "invoice.write",
  "payment.write",
  // Money
  "expense.read",
  "expense.write",
  "expense.approve",
  "finance.read",
  // Team
  "people.read",
  "people.write",
  "payroll.read",
  "payroll.run",
  "payout.send",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Partners can do everything. Only they move money, approve (spending and changes to agreed contracts) and change settings. */
const OWNER_ONLY: Permission[] = [
  "expense.approve",
  "contract.approve",
  "payroll.run",
  "payout.send",
  "settings.manage",
];
/** Farm hands log the day and see the birds and stock they look after, but no money. */
const STAFF: Permission[] = ["batch.read", "log.write", "inventory.read"];
/** Every page's read permission: what anyone who needs the whole picture can open. */
const READ_ALL = PERMISSIONS.filter((p) => p.endsWith(".read"));
/**
 * Finance keeps the books: records and edits spending (expenses, categories, repeats) and the
 * payments customers make, and sees
 * everything that makes or costs money (batches, stock, suppliers, sales, invoices, pay) without
 * changing it. Approving, paying out and approving payroll stay with the owners.
 */
const FINANCE: Permission[] = [...READ_ALL, "expense.write", "payment.write"];
/**
 * Sales runs customers, contracts, sales and invoices, and sees the birds and stock there are to
 * sell. No costs, pay or the farm's books.
 */
const SALES: Permission[] = [
  "customer.read",
  "customer.write",
  "contract.read",
  "contract.write",
  "sales.read",
  "sales.write",
  "invoice.read",
  "invoice.write",
  "payment.write",
  "batch.read",
  "inventory.read",
];

const TABLE: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  manager: new Set(PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p))),
  finance: new Set(FINANCE),
  sales: new Set(SALES),
  staff: new Set(STAFF),
  // Customers only reach the portal (step 6.7), never the dashboard.
  customer: new Set(),
};

export function can(role: Role, permission: Permission) {
  return TABLE[role].has(permission);
}

/** Where each role lands: staff on the daily log (no money), sales on sales, customers in their portal. */
export function homeFor(role: Role) {
  return role === "customer" ? "/portal" : role === "staff" ? "/log" : role === "sales" ? "/sales" : "/";
}
