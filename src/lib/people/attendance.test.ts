import { describe, expect, it } from "vitest";

import { attendanceDay, daysWorked, saveAttendance } from "./attendance";
import { formatDays } from "./attendance-rules";
import { createEmployee, setEmployeeStatus } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createBatch } from "@/lib/batches/service";
import { createHouse } from "@/lib/houses/service";
import { createLog } from "@/lib/logs/service";
import { UserModel } from "@/models/user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-27";
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string; message: string }) => ({
      status: e.status,
      code: e.code,
      field: e.field,
      message: e.message,
    }),
  );

async function farm() {
  const owner: CurrentUser = { id: String(oid()), farmId: String(oid()), name: "Ada", email: "a@f.com", role: "owner" };
  const day = { payType: "daily", rateKobo: 400_000, startDate: "2026-11-01" };
  const musa = await createEmployee(owner, { ...day, name: "Musa", email: "musa@f.com" }, TODAY);
  const ngozi = await createEmployee(owner, { ...day, name: "Ngozi", job: "Cleaner" }, TODAY);
  const late = await createEmployee(owner, { ...day, name: "Tunde", startDate: "2026-11-26" }, TODAY);
  await createEmployee(owner, { name: "Bola", payType: "monthly", rateKobo: 6_000_000 }, TODAY);
  return { owner, musa, ngozi, late };
}

describe("attendance", () => {
  it("lists the people paid by the day who worked here that day", async () => {
    const { owner, musa, ngozi, late } = await farm();
    expect((await attendanceDay(owner.farmId, "2026-11-25")).map((r) => r.name)).toEqual(["Musa", "Ngozi"]);
    expect(await attendanceDay(owner.farmId, TODAY)).toMatchObject([
      { employeeId: musa.id, rateKobo: 400_000, status: null, logged: false },
      { employeeId: ngozi.id, job: "Cleaner" },
      { employeeId: late.id },
    ]);
    await setEmployeeStatus(owner, ngozi.id, { status: "left", leftOn: "2026-11-20" }, TODAY);
    expect((await attendanceDay(owner.farmId, TODAY)).map((r) => r.name)).toEqual(["Musa", "Tunde"]);
    expect(await attendanceDay(owner.farmId, "nope")).toEqual([]);
  });

  it("saves a day, changes it, and counts the days (a half day is half)", async () => {
    const { owner, musa, ngozi } = await farm();
    await saveAttendance(
      owner,
      {
        date: "2026-11-24",
        entries: [
          { employeeId: musa.id, status: "present" },
          { employeeId: ngozi.id, status: "half" },
        ],
      },
      TODAY,
    );
    const day = await saveAttendance(
      owner,
      {
        date: "2026-11-25",
        entries: [
          { employeeId: musa.id, status: "present" },
          { employeeId: ngozi.id, status: "absent" },
        ],
      },
      TODAY,
    );
    expect(day.map((r) => r.status)).toEqual(["present", "absent"]);
    // Changed later: Ngozi came after all; Musa's mark cleared.
    await saveAttendance(
      owner,
      {
        date: "2026-11-25",
        entries: [
          { employeeId: musa.id, status: null },
          { employeeId: ngozi.id, status: "present" },
        ],
      },
      TODAY,
    );
    const days = await daysWorked(owner.farmId, "2026-11-01", "2026-11-30");
    expect(days.get(musa.id)).toBe(1);
    expect(days.get(ngozi.id)).toBe(1.5);
    expect((await daysWorked(owner.farmId, "2026-11-25", "2026-11-25")).get(musa.id)).toBe(0);
  });

  it("counts a day someone sent in the daily log as a day they came, unless marked otherwise", async () => {
    const { owner, musa } = await farm();
    const user = await UserModel.create({ farmId: owner.farmId, email: "musa@f.com", name: "Musa", role: "staff" });
    const staff: CurrentUser = { id: user.id, farmId: owner.farmId, name: "Musa", email: "musa@f.com", role: "staff" };
    const house = await createHouse(owner, { name: "House 1", capacity: 5000 });
    const { batch } = await createBatch(
      owner,
      {
        houseId: house.id,
        placedOn: "2026-11-02",
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 0,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
      },
      {},
      TODAY,
    );
    for (const date of ["2026-11-24", "2026-11-25", "2026-11-26"])
      await createLog(staff, { batchId: batch.id, date, deaths: 0, feedKg: 50 }, {}, TODAY);
    expect((await attendanceDay(owner.farmId, "2026-11-26"))[0]).toMatchObject({
      employeeId: musa.id,
      status: null,
      logged: true,
    });
    await saveAttendance(owner, { date: "2026-11-26", entries: [{ employeeId: musa.id, status: "half" }] }, TODAY);
    await saveAttendance(owner, { date: "2026-11-23", entries: [{ employeeId: musa.id, status: "present" }] }, TODAY);
    expect((await daysWorked(owner.farmId, "2026-11-01", TODAY)).get(musa.id)).toBe(3.5);
  });

  it("refuses a day to come, a bad sheet, someone not working then, and a day whose pay is done", async () => {
    const { owner, musa, late } = await farm();
    const entries = [{ employeeId: musa.id, status: "present" }];
    expect(await refusal(saveAttendance(owner, { date: "2026-11-28", entries }, TODAY))).toMatchObject({
      field: "date",
    });
    expect(await refusal(saveAttendance(owner, { date: "nope", entries }, TODAY))).toMatchObject({ field: "date" });
    expect(await refusal(saveAttendance(owner, { date: TODAY, entries: [] }, TODAY))).toMatchObject({
      field: "entries",
    });
    expect(
      await refusal(saveAttendance(owner, { date: TODAY, entries: [{ employeeId: musa.id, status: "late" }] }, TODAY)),
    ).toMatchObject({ field: "entries" });
    expect(
      await refusal(saveAttendance(owner, { date: TODAY, entries: [{ employeeId: "x", status: "present" }] }, TODAY)),
    ).toMatchObject({ field: "entries" });
    expect(
      await refusal(
        saveAttendance(owner, { date: "2026-11-20", entries: [{ employeeId: late.id, status: "present" }] }, TODAY),
      ),
    ).toMatchObject({ field: "entries" });
    expect(
      await refusal(
        saveAttendance(owner, { date: TODAY, entries: [{ employeeId: String(oid()), status: "present" }] }, TODAY),
      ),
    ).toMatchObject({ field: "entries" });
    expect(
      await refusal(
        saveAttendance(owner, { date: TODAY, entries }, TODAY, async () => "November's pay is already worked out."),
      ),
    ).toMatchObject({ status: 409, message: "November's pay is already worked out." });
  });

  it("writes days the way people say them", () => {
    expect([0, 0.5, 1, 4.5, 21].map(formatDays)).toEqual(["0 days", "½ day", "1 day", "4½ days", "21 days"]);
  });
});
