// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { downloadCsv } from "./csv";

describe("downloadCsv", () => {
  it("downloads the file under its name and frees the URL", () => {
    const createObjectURL = vi.fn(() => "blob:fowlex");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    downloadCsv("fowlex-invoices.csv", '﻿"a"\r\n');

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("fowlex-invoices.csv");
    expect(clicked[0].href).toBe("blob:fowlex");
    expect(document.querySelector("a")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fowlex");
  });
});
