import "server-only";

import { listItems } from "./items";
import { quantity } from "./rules";
import { connectDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { FarmModel } from "@/models/farm";
import { InventoryItemModel } from "@/models/inventory-item";
import { UserModel } from "@/models/user";

/** The farm's items at or under their reorder level, lowest first. */
export async function lowStock(farmId: string) {
  return (await listItems(farmId)).filter((i) => i.low).sort((a, b) => a.onHand - b.onHand);
}

/**
 * Tells each farm's owners, by email, about items that have just run low: once per item, until it
 * is restocked above its reorder level and runs low again. Returns how many emails went out.
 */
export async function sendLowStockAlerts(origin: string, now = new Date()) {
  await connectDb();
  let sent = 0;
  for (const farm of await FarmModel.find({}, { name: 1 }).lean()) {
    const farmId = String(farm._id);
    const items = await listItems(farmId);
    // Restocked: ready to warn again next time.
    const recovered = items.filter((i) => !i.low).map((i) => i.id);
    if (recovered.length)
      await InventoryItemModel.updateMany(
        { _id: { $in: recovered }, lowAlertedAt: { $ne: null } },
        { $set: { lowAlertedAt: null } },
      );

    const told = new Set(
      (await InventoryItemModel.find({ farmId, lowAlertedAt: { $ne: null } }, { _id: 1 }).lean()).map((i) =>
        String(i._id),
      ),
    );
    const fresh = items.filter((i) => i.low && !told.has(i.id));
    if (!fresh.length) continue;
    const owners = await UserModel.find({ farmId, role: "owner", status: "active" }, { email: 1, name: 1 }).lean();
    const lines = fresh.map(
      (i) => `- ${i.name}: ${quantity(i.onHand, i.unit)} left (reorder below ${quantity(i.reorderLevel!, i.unit)})`,
    );
    const subject =
      fresh.length === 1 ? `${fresh[0].name} is running low` : `${fresh.length} items are running low at ${farm.name}`;
    for (const owner of owners) {
      await sendEmail({
        to: owner.email,
        subject,
        text: [
          `Hi ${owner.name},`,
          "",
          "These are at or under their reorder level:",
          ...lines,
          "",
          `Buy more: ${origin}/inventory`,
        ].join("\n"),
      });
      sent++;
    }
    await InventoryItemModel.updateMany({ _id: { $in: fresh.map((i) => i.id) } }, { $set: { lowAlertedAt: now } });
  }
  return sent;
}
