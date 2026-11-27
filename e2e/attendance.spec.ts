import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

test("tick who came, see the month's days and pay, and mark everyone at once", async ({ page }, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const add = async (name: string) =>
    (
      await page.request.post("/api/employees", {
        data: { name, payType: "daily", rateKobo: 400_000, startDate: lagos(-5) },
      })
    ).json();
  const a = await add(`Amaka ${tag}`);
  await add(`Bayo ${tag}`);

  await page.goto(`/people/attendance?date=${lagos(-1)}`);
  await expect(page.getByRole("main").getByText("Yesterday")).toBeVisible();
  await page
    .getByRole("group", { name: `Amaka ${tag}: came to work?` })
    .getByRole("button", { name: "Came" })
    .click();
  await page
    .getByRole("group", { name: `Bayo ${tag}: came to work?` })
    .getByRole("button", { name: "Half day" })
    .click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText(/^Saved: \d+ of \d+ came that day\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  const amaka = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: `Amaka ${tag}` });
  await expect(amaka).toContainText("1 day");
  await expect(amaka).toContainText("₦4,000.00 this month");
  await expect(
    page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: `Bayo ${tag}` }),
  ).toContainText("½ day");

  await page.getByRole("button", { name: "The day after" }).click();
  await expect(page.getByRole("main").getByText("Today")).toBeVisible();
  await page.getByRole("button", { name: /^(Everyone came|The other \d+ came)$/ }).click();
  const came = page.getByRole("group", { name: `Amaka ${tag}: came to work?` }).getByRole("button", { name: "Came" });
  await expect(came).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText(/^Saved: \d+ of \d+ came today\.$/)).toBeVisible();
  expect(
    (await (await page.request.get(`/api/attendance?date=${lagos()}`)).json()).find(
      (r: { employeeId: string }) => r.employeeId === a.id,
    ).status,
  ).toBe("present");
  expect(errors).toEqual([]);
});
