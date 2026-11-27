import { describe, expect, it } from "vitest";

import { liveBirds, removedBirds } from "./bird-count";

describe("live birds", () => {
  it("is placed less deaths, culls and sold", () => {
    expect(liveBirds({ placed: 1000, deaths: 12, culls: 3, sold: 200 })).toBe(785);
    expect(removedBirds({ deaths: 12, culls: 3, sold: 200 })).toBe(215);
  });

  it("is everything placed before any logs, and never below zero", () => {
    expect(liveBirds({ placed: 1000, deaths: 0, culls: 0, sold: 0 })).toBe(1000);
    expect(liveBirds({ placed: 10, deaths: 8, culls: 2, sold: 5 })).toBe(0);
  });
});
