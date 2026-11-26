import { AuditLogModel } from "./audit-log";
import { BatchModel } from "./batch";
import { CounterModel } from "./counter";
import { DailyLogModel } from "./daily-log";
import { FarmModel } from "./farm";
import { HealthEventModel } from "./health-event";
import { HouseModel } from "./house";
import { InviteModel } from "./invite";
import { PasswordResetModel } from "./password-reset";
import { SettingsModel } from "./settings";
import { UserModel } from "./user";

/** Every model. A new model joins this list so its indexes are built at deploy time. */
export const ALL_MODELS = [
  AuditLogModel,
  BatchModel,
  CounterModel,
  DailyLogModel,
  FarmModel,
  HealthEventModel,
  HouseModel,
  InviteModel,
  PasswordResetModel,
  SettingsModel,
  UserModel,
];

/**
 * Makes every model's collection and indexes (unique emails, one settings per farm, expiring reset
 * links) if they're missing. Never drops anything, so it's safe to run on every deploy.
 */
export async function ensureIndexes() {
  const built: string[] = [];
  for (const model of ALL_MODELS) {
    await model.createCollection().catch((error: { code?: number }) => {
      if (error.code !== 48) throw error; // 48: already exists.
    });
    await model.createIndexes();
    built.push(model.modelName);
  }
  return built;
}
