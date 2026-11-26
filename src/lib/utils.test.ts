import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins classes and drops falsy values", () => {
    expect(cn("p-2", false && "hidden", undefined, "text-sm")).toBe("p-2 text-sm");
  });

  it("lets a later Tailwind class win", () => {
    expect(cn("p-2 bg-fowlex-red", "p-4")).toBe("bg-fowlex-red p-4");
  });
});
