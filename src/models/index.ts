import { AdvanceModel } from "./advance";
import { AssetModel } from "./asset";
import { AttendanceModel } from "./attendance";
import { AuditLogModel } from "./audit-log";
import { BatchModel } from "./batch";
import { CounterModel } from "./counter";
import { DailyLogModel } from "./daily-log";
import { EmployeeModel } from "./employee";
import { ExpenseModel } from "./expense";
import { ExpenseCategoryModel } from "./expense-category";
import { FarmModel } from "./farm";
import { HealthEventModel } from "./health-event";
import { HouseModel } from "./house";
import { InventoryItemModel } from "./inventory-item";
import { InviteModel } from "./invite";
import { PasswordResetModel } from "./password-reset";
import { PayoutModel } from "./payout";
import { PayrollRunModel } from "./payroll-run";
import { RecurringExpenseModel } from "./recurring-expense";
import { SettingsModel } from "./settings";
import { StockMovementModel } from "./stock-movement";
import { SupplierModel } from "./supplier";
import { UserModel } from "./user";
import { WebhookEventModel } from "./webhook-event";

/** Every model. A new model joins this list so its indexes are built at deploy time. */
export const ALL_MODELS = [
  AdvanceModel,
  AssetModel,
  AttendanceModel,
  AuditLogModel,
  BatchModel,
  CounterModel,
  DailyLogModel,
  EmployeeModel,
  ExpenseCategoryModel,
  ExpenseModel,
  FarmModel,
  HealthEventModel,
  HouseModel,
  InventoryItemModel,
  InviteModel,
  PasswordResetModel,
  PayoutModel,
  PayrollRunModel,
  RecurringExpenseModel,
  SettingsModel,
  StockMovementModel,
  SupplierModel,
  UserModel,
  WebhookEventModel,
];

/**
 * Makes every model's collection, and brings its indexes in line with the schema (unique emails,
 * one settings per farm, expiring reset links): missing ones are built, and ones the schema changed
 * or dropped are replaced or removed. Data is never touched, so it's safe to run on every deploy.
 */
export async function ensureIndexes() {
  const built: string[] = [];
  for (const model of ALL_MODELS) {
    await model.createCollection().catch((error: { code?: number }) => {
      if (error.code !== 48) throw error; // 48: already exists.
    });
    // Brings the indexes in line with the schema: adds new ones, and replaces or drops changed ones.
    await model.syncIndexes();
    built.push(model.modelName);
  }
  return built;
}
