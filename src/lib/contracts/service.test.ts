import { beforeEach, describe, expect, it } from "vitest";

import { contractStatus, endAfter, priceLine, runsOn, validateContract, validateTerms } from "./rules";
import {
  activateContract,
  contractFor,
  createContract,
  createTemplate,
  deleteContract,
  deleteTemplate,
  endContract,
  listContracts,
  listTemplates,
  monthsBetween,
  sendEndingWarnings,
  updateContract,
} from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createCustomer } from "@/lib/customers/service";
import { outbox } from "@/lib/email";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();
beforeEach(() => {
  outbox().length = 0;
});

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const grill = await createCustomer(owner, { name: "The Grill", type: "lounge", termsDays: 14 });
  const terms = {
    customerId: grill.id,
    pricing: "perKg",
    priceKobo: 320_000,
    minBirds: 200,
    minPer: "week",
    deliveryEvery: "weekly",
    termsDays: 14,
    startDate: "2026-11-01",
    endDate: "2027-10-31",
    notes: "",
  };
  return { owner, grill, terms };
}

describe("contracts", () => {
  it("writes a draft, then makes it active: from then the customer's price is the contract's", async () => {
    const { owner, grill, terms } = await farm();
    const draft = await createContract(owner, terms, TODAY);
    expect(draft).toMatchObject({
      number: "CON-2026-0001",
      status: "draft",
      customerName: "The Grill",
      reviewOn: null,
    });
    expect(await contractFor(owner.farmId, grill.id, TODAY)).toBeNull();
    const active = await activateContract(owner, draft.id, TODAY);
    expect(active.status).toBe("active");
    expect(await contractFor(owner.farmId, grill.id, TODAY)).toMatchObject({ id: draft.id, priceKobo: 320_000 });
    expect(await contractFor(owner.farmId, grill.id, "2027-11-01")).toBeNull();
    expect(await contractFor(owner.farmId, "nope", TODAY)).toBeNull();
    expect(await refusal(activateContract(owner, draft.id, TODAY))).toMatchObject({ code: "not_draft" });
  });

  it("never lets two active contracts for a customer overlap", async () => {
    const { owner, terms } = await farm();
    await createContract(owner, { ...terms, activate: true }, TODAY);
    expect(await refusal(createContract(owner, { ...terms, startDate: "2027-06-01", activate: true }, TODAY))).toEqual({
      status: 409,
      code: "overlap",
      field: "startDate",
    });
    const next = await createContract(owner, { ...terms, startDate: "2027-11-01", endDate: "2028-10-31" }, TODAY);
    expect(next.number).toBe("CON-2027-0001");
    expect((await activateContract(owner, next.id, TODAY)).status).toBe("active");
    expect(
      await refusal(
        updateContract(
          owner,
          next.id,
          { ...terms, startDate: "2027-10-01", endDate: "2028-10-31" },
          next.version,
          TODAY,
        ),
      ),
    ).toMatchObject({ code: "stale" });
    const moved = await refusal(
      updateContract(owner, next.id, { ...terms, startDate: "2027-10-01", endDate: "2028-10-31" }, 1, TODAY),
    );
    expect(moved).toMatchObject({ code: "overlap" });
  });

  it("changes a running contract, ends it early, and keeps an ended one as agreed", async () => {
    const { owner, grill, terms } = await farm();
    const c = await createContract(owner, { ...terms, activate: true }, TODAY);
    const changed = await updateContract(
      owner,
      c.id,
      { ...terms, priceKobo: 340_000, reviewOn: "2027-05-01" },
      c.version,
      TODAY,
    );
    expect(changed).toMatchObject({ priceKobo: 340_000, reviewOn: "2027-05-01" });
    expect(await refusal(endContract(owner, c.id, "2026-10-01", TODAY))).toMatchObject({ field: "terminatedOn" });
    const ended = await endContract(owner, c.id, undefined, TODAY);
    expect(ended).toMatchObject({ status: "terminated", terminatedOn: TODAY });
    expect(await contractFor(owner.farmId, grill.id, TODAY)).toBeNull();
    expect(await refusal(updateContract(owner, c.id, terms, ended.version, TODAY))).toMatchObject({ code: "ended" });
    expect(await refusal(endContract(owner, c.id, undefined, TODAY))).toMatchObject({ code: "not_active" });
    expect(await refusal(deleteContract(owner, c.id))).toMatchObject({ code: "not_draft" });
  });

  it("deletes drafts, refuses bad input, and sees an active contract past its end as ended", async () => {
    const { owner, grill, terms } = await farm();
    const draft = await createContract(owner, terms, TODAY);
    await deleteContract(owner, draft.id);
    expect(await listContracts(owner.farmId)).toEqual([]);
    expect(await refusal(deleteContract(owner, draft.id))).toMatchObject({ status: 404 });
    expect(await refusal(createContract(owner, { ...terms, endDate: "2026-01-01" }, TODAY))).toMatchObject({
      field: "endDate",
    });
    expect(await refusal(createContract(owner, { ...terms, customerId: String(oid()) }, TODAY))).toMatchObject({
      field: "customerId",
    });
    const old = await createContract(owner, { ...terms, startDate: "2025-01-01", endDate: "2025-12-31" }, TODAY);
    expect(await refusal(activateContract(owner, old.id, TODAY))).toMatchObject({ code: "past" });
    await createContract(
      owner,
      { ...terms, startDate: "2025-01-01", endDate: "2025-12-31", activate: true },
      "2025-06-01",
    );
    const list = await listContracts(owner.farmId, { customerId: grill.id, today: TODAY });
    expect(list.map((c) => c.status).sort()).toEqual(["draft", "expired"]);
    expect(await listContracts(owner.farmId, { customerId: "nope" })).toEqual([]);
  });

  it("keeps terms as a template, starts the next from it, and removes it", async () => {
    const { owner, terms } = await farm();
    await createContract(owner, { ...terms, saveAsTemplate: "  Lounges  weekly " }, TODAY);
    const [t] = await listTemplates(owner.farmId);
    expect(t).toMatchObject({ name: "Lounges weekly", priceKobo: 320_000, months: 12, minBirds: 200 });
    expect(await refusal(createTemplate(owner, { ...terms, name: "" }))).toMatchObject({ field: "name" });
    expect(await refusal(createTemplate(owner, { ...terms, name: "x", priceKobo: 0 }))).toMatchObject({
      field: "priceKobo",
    });
    expect(await refusal(createTemplate(owner, { ...terms, name: "x", months: 0 }))).toMatchObject({ field: "months" });
    await deleteTemplate(owner, t.id);
    expect(await listTemplates(owner.farmId)).toEqual([]);
    expect(await refusal(deleteTemplate(owner, t.id))).toMatchObject({ status: 404 });
  });

  it("warns the owners and sales 30 days before a contract ends, once per end date", async () => {
    const { owner, terms } = await farm();
    await UserModel.create({ farmId: owner.farmId, email: "ada@f.com", name: "Ada", role: "owner" });
    await UserModel.create({ farmId: owner.farmId, email: "chidi@f.com", name: "Chidi", role: "sales" });
    await UserModel.create({ farmId: owner.farmId, email: "tunde@f.com", name: "Tunde", role: "staff" });
    const c = await createContract(owner, { ...terms, endDate: "2026-12-20", activate: true }, TODAY);
    await createContract(owner, { ...terms, startDate: "2027-01-01", endDate: "2027-12-31", activate: true }, TODAY);
    expect(await sendEndingWarnings("https://app.fowlex.com", TODAY)).toBe(1);
    expect(outbox().map((m) => [m.to, m.subject])).toEqual([
      ["ada@f.com", "The Grill's contract ends in 23 days"],
      ["chidi@f.com", "The Grill's contract ends in 23 days"],
    ]);
    expect(outbox()[0].text).toContain(`https://app.fowlex.com/contracts/${c.id}`);
    expect(await sendEndingWarnings("x", TODAY)).toBe(0);
    // A new end date that's close again is warned about again.
    const fresh = (await listContracts(owner.farmId)).find((x) => x.id === c.id)!;
    await updateContract(owner, c.id, { ...terms, endDate: "2026-12-28" }, fresh.version, TODAY);
    expect(await sendEndingWarnings("x", "2026-12-27")).toBe(1);
    expect(outbox().at(-1)?.subject).toBe("The Grill's contract ends tomorrow");
  });
});

describe("contract details", () => {
  it("keeps the signed copy, words the warning for today, and refuses unknown contracts", async () => {
    const { owner, terms } = await farm();
    await UserModel.create({ farmId: owner.farmId, email: "ada@f.com", name: "Ada", role: "owner" });
    const c = await createContract(
      owner,
      { ...terms, endDate: TODAY, document: { url: "/api/uploads/x", name: "signed.pdf" }, activate: true },
      "2026-11-01",
    );
    expect(c.document).toEqual({ url: "/api/uploads/x", name: "signed.pdf" });
    expect(await sendEndingWarnings("x", TODAY)).toBe(1);
    expect(outbox().at(-1)?.subject).toBe("The Grill's contract ends today");
    expect(outbox().at(-1)?.text).toContain("(₦3,200.00 a kg)");
    expect(await refusal(activateContract(owner, "nope", TODAY))).toMatchObject({ status: 404 });
    expect(await refusal(deleteTemplate(owner, "nope"))).toMatchObject({ status: 404 });
  });
});

describe("contract rules", () => {
  it("works out end dates, lengths and status", () => {
    expect(endAfter("2026-11-01", 12)).toBe("2027-10-31");
    expect(endAfter("2026-01-31", 1)).toBe("2026-02-27");
    expect(endAfter("2026-11-15", 3)).toBe("2027-02-14");
    expect(monthsBetween("2026-11-01", "2027-10-31")).toBe(12);
    expect(monthsBetween("2026-11-01", "2026-11-10")).toBe(1);
    expect(contractStatus({ status: "active", endDate: "2026-11-26" }, TODAY)).toBe("expired");
    expect(contractStatus({ status: "draft", endDate: "2026-11-26" }, TODAY)).toBe("draft");
    expect(runsOn({ status: "active", startDate: "2026-11-01", endDate: "2026-12-01" }, TODAY)).toBe(true);
    expect(runsOn({ status: "draft", startDate: "2026-11-01", endDate: "2026-12-01" }, TODAY)).toBe(false);
    expect(priceLine("₦3,200.00", "perKg")).toBe("₦3,200.00 a kg");
  });

  it("names every field that's wrong", () => {
    expect(
      Object.keys(
        validateTerms({ pricing: "x", priceKobo: 0, minBirds: 0, minPer: "day", deliveryEvery: "x", termsDays: -1 }),
      ),
    ).toEqual(["pricing", "priceKobo", "minBirds", "minPer", "deliveryEvery", "termsDays"]);
    expect(
      Object.keys(
        validateContract({
          pricing: "perKg",
          priceKobo: 1,
          minBirds: null,
          minPer: "week",
          deliveryEvery: "weekly",
          termsDays: 0,
          customerId: "x",
          startDate: "x",
          endDate: "y",
          reviewOn: "z",
          notes: 4,
          document: "x",
        }),
      ),
    ).toEqual(["customerId", "startDate", "endDate", "reviewOn", "notes", "document"]);
  });
});
