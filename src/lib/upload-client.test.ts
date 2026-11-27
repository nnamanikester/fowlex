// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { shrinkImage, uploadReceipt } from "./upload-client";

afterEach(() => vi.unstubAllGlobals());
const pdf = () => new File([new Uint8Array(10)], "r.pdf", { type: "application/pdf" });

describe("receipt upload in the browser", () => {
  it("sends PDFs and HEIC photos as they are, and keeps a photo the browser can't draw", async () => {
    const file = pdf();
    expect(await shrinkImage(file)).toBe(file);
    const heic = new File([new Uint8Array(10)], "r.heic", { type: "image/heic" });
    expect(await shrinkImage(heic)).toBe(heic);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("can't decode");
      }),
    );
    const jpeg = new File([new Uint8Array(10)], "r.jpg", { type: "image/jpeg" });
    expect(await shrinkImage(jpeg)).toBe(jpeg);
  });

  it("shrinks a big photo to a JPEG at most 1,600 px long, and keeps the original if that's smaller", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000 })),
    );
    const drawn: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: (_: unknown, x: number, y: number, w: number, h: number) => drawn.push([w, h]),
    } as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((done) => done(new Blob([new Uint8Array(5)], { type: "image/jpeg" })));
    const big = new File([new Uint8Array(100)], "photo.png", { type: "image/png" });
    const small = await shrinkImage(big);
    expect(drawn[0]).toEqual([1600, 1200]);
    expect(small).toMatchObject({ name: "photo.jpg", type: "image/jpeg", size: 5 });
    toBlob.mockImplementation((done) => done(new Blob([new Uint8Array(500)])));
    expect(await shrinkImage(big)).toBe(big);
  });

  it("returns where the receipt is kept, or an error shaped like the API's", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ url: "/api/uploads/1", name: "r.pdf" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await uploadReceipt(pdf())).toEqual({ url: "/api/uploads/1", name: "r.pdf" });
    fetch.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: { code: "invalid_upload", message: "Keep it under 5 MB." } }), {
          status: 400,
        }),
    );
    await expect(uploadReceipt(pdf())).rejects.toEqual({
      status: 400,
      code: "invalid_upload",
      message: "Keep it under 5 MB.",
    });
    fetch.mockImplementationOnce(async () => new Response("oops", { status: 500 }));
    await expect(uploadReceipt(pdf())).rejects.toMatchObject({ status: 500, code: "unknown" });
    fetch.mockImplementationOnce(async () => {
      throw new TypeError("offline");
    });
    await expect(uploadReceipt(pdf())).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
