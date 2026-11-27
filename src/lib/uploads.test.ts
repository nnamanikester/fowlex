import { afterEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() => vi.fn(async (path: string) => ({ url: `https://blob.example/${path}` })));
vi.mock("@vercel/blob", () => ({ put }));

import { localUploads, storeUpload } from "./uploads";

afterEach(() => vi.unstubAllEnvs());
const file = (type = "image/jpeg", bytes = 10, name = "My receipt (1).jpg") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("receipt uploads", () => {
  it("puts receipts in Blob under a path nobody can guess", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x");
    const kept = await storeUpload("farm1", file());
    expect(kept.name).toBe("My receipt 1.jpg");
    expect(kept.url).toMatch(/^https:\/\/blob\.example\/receipts\/farm1\/[\w-]{36}-My-receipt-1\.jpg$/);
    expect(put).toHaveBeenCalledWith(expect.any(String), expect.any(File), {
      access: "public",
      contentType: "image/jpeg",
    });
  });

  it("keeps them in memory without a store in development or tests, and refuses in production", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const kept = await storeUpload("farm1", file("application/pdf", 3, "%%%"));
    expect(kept).toMatchObject({ name: "receipt" });
    expect(localUploads().get(kept.url.split("/").pop()!)).toMatchObject({ type: "application/pdf", farmId: "farm1" });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPLOADS_LOCAL", "");
    await expect(storeUpload("farm1", file())).rejects.toMatchObject({ status: 503 });
  });

  it("takes photos and PDFs up to 5 MB, and nothing else", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(storeUpload("f", "text")).rejects.toMatchObject({ status: 400 });
    await expect(storeUpload("f", file("image/jpeg", 0))).rejects.toMatchObject({ status: 400 });
    await expect(storeUpload("f", file("text/html"))).rejects.toMatchObject({ message: /photo/ });
    await expect(storeUpload("f", file("image/png", 5 * 1024 * 1024 + 1))).rejects.toMatchObject({
      message: "Keep it under 5 MB.",
    });
  });
});
