import { afterEach, describe, expect, it, vi } from "vitest";

import { outbox, sendEmail } from "./email";

const email = { to: "ada@fowlex.com", subject: "Hello", text: "Body" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("keeps the email in the outbox without a Resend key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await sendEmail(email);
    expect(outbox().at(-1)).toMatchObject(email);
  });

  it("sends through Resend with the key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Fowlex <hi@fowlex.com>");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const before = outbox().length;
    await sendEmail(email);
    expect(outbox().length).toBe(before);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Fowlex <hi@fowlex.com>", to: ["ada@fowlex.com"] });
    expect(JSON.parse(init.body as string).attachments).toBeUndefined();
    await sendEmail({ ...email, attachments: [{ filename: "Payslip.pdf", content: "JVBERi0=" }] });
    const [, withFile] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(withFile.body as string).attachments).toEqual([{ filename: "Payslip.pdf", content: "JVBERi0=" }]);
  });

  it("fails loudly when Resend refuses", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("domain not verified", { status: 403 })),
    );
    await expect(sendEmail(email)).rejects.toThrow("Resend refused the email (403): domain not verified");
  });
});
