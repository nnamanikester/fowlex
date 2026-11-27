import { describe, expect, it } from "vitest";

import { termsLine, validateCustomer } from "./rules";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  setCustomerStatus,
  updateCustomer,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings/service";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const actor = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const grill = {
  name: "  The Grill   Lounge ",
  type: "lounge",
  contactName: "Chidi",
  phone: "0803 123 4567",
  email: " Orders@Grill.ng ",
  address: "12 Allen Avenue, Ikeja",
  creditLimitKobo: 200_000_000,
  termsDays: 14,
  notes: "",
};

describe("customers", () => {
  it("adds a restaurant with 14-day terms and a ₦2,000,000 limit, tidied", async () => {
    const owner = actor();
    const c = await createCustomer(owner, { ...grill, type: "restaurant" });
    expect(c).toMatchObject({
      name: "The Grill Lounge",
      type: "restaurant",
      phone: "+2348031234567",
      email: "orders@grill.ng",
      creditLimitKobo: 200_000_000,
      termsDays: 14,
      status: "active",
      hasLogin: false,
    });
    expect(await getCustomer(owner.farmId, c.id)).toEqual(c);
    expect(await getCustomer(owner.farmId, "nope")).toBeNull();
    expect(await getCustomer(actor().farmId, c.id)).toBeNull();
  });

  it("starts from the farm's usual terms and no limit when they're left out", async () => {
    const owner = actor();
    await (await getSettings(owner.farmId)).set({ paymentTermsDays: 7 }).save();
    const c = await createCustomer(owner, { name: "Mama Put", type: "individual" });
    expect(c).toMatchObject({ termsDays: 7, creditLimitKobo: null, phone: "", email: "" });
  });

  it("refuses a nameless, mistyped or repeated customer, naming the field", async () => {
    const owner = actor();
    await createCustomer(owner, grill);
    expect(await refusal(createCustomer(owner, { ...grill, name: " " }))).toMatchObject({ field: "name" });
    expect(await refusal(createCustomer(owner, { ...grill, name: "x", phone: "123" }))).toMatchObject({
      field: "phone",
    });
    expect(await refusal(createCustomer(owner, { ...grill, name: "y", termsDays: 400 }))).toMatchObject({
      field: "termsDays",
    });
    expect(await refusal(createCustomer(owner, { ...grill, name: "the grill lounge" }))).toEqual({
      status: 409,
      code: "duplicate",
      field: "name",
    });
  });

  it("edits from a fresh form only, archives and brings back, and deletes", async () => {
    const owner = actor();
    const c = await createCustomer(owner, grill);
    const saved = await updateCustomer(owner, c.id, { ...grill, termsDays: 30 }, c.version);
    expect(saved.termsDays).toBe(30);
    expect(await refusal(updateCustomer(owner, c.id, grill, c.version))).toMatchObject({ code: "stale" });
    expect(await refusal(updateCustomer(owner, c.id, grill, "x"))).toMatchObject({ code: "stale" });

    expect((await setCustomerStatus(owner, c.id, "archived")).status).toBe("archived");
    // Archived, the name is free again; bringing the old one back then clashes.
    const twin = await createCustomer(owner, grill);
    expect(await refusal(setCustomerStatus(owner, c.id, "active"))).toMatchObject({ code: "duplicate" });
    expect(await refusal(setCustomerStatus(owner, c.id, "gone"))).toMatchObject({ field: "status" });
    await deleteCustomer(owner, twin.id);
    expect((await setCustomerStatus(owner, c.id, "active")).status).toBe("active");
    expect((await listCustomers(owner.farmId)).filter((x) => !x.walkIn).map((x) => x.id)).toEqual([c.id]);
    expect(await refusal(deleteCustomer(owner, "nope"))).toMatchObject({ status: 404 });
  });

  it("lists active customers first, A to Z", async () => {
    const owner = actor();
    const zed = await createCustomer(owner, { ...grill, name: "Zed Hotel" });
    await createCustomer(owner, { ...grill, name: "abuja suya" });
    await setCustomerStatus(owner, zed.id, "archived");
    await createCustomer(owner, { ...grill, name: "Bukka Hut" });
    // The walk-in account first, then the active ones A to Z, then archived ones.
    expect((await listCustomers(owner.farmId)).map((c) => c.name)).toEqual([
      "Walk-in customers",
      "abuja suya",
      "Bukka Hut",
      "Zed Hotel",
    ]);
  });
});

describe("customer rules", () => {
  it("checks every field and words the terms", () => {
    expect(
      validateCustomer({
        name: "x".repeat(121),
        type: "bank",
        contactName: 3,
        phone: 1,
        email: "nope",
        address: "x".repeat(301),
        notes: 1,
        creditLimitKobo: -1,
        termsDays: 1.5,
      }),
    ).toEqual({
      name: expect.any(String),
      type: expect.any(String),
      contactName: expect.any(String),
      phone: expect.any(String),
      email: expect.any(String),
      address: expect.any(String),
      notes: expect.any(String),
      creditLimitKobo: expect.any(String),
      termsDays: expect.any(String),
    });
    expect(validateCustomer({ ...grill, email: 4 })).toHaveProperty("email");
    expect([0, 1, 14].map(termsLine)).toEqual(["Pays on delivery", "Pays in 1 day", "Pays in 14 days"]);
  });
});
