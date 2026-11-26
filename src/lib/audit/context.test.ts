import { describe, expect, it } from "vitest";

import { currentActor, runAs, setActor, withAuditContext } from "./context";

describe("audit context", () => {
  it("has no actor outside a context, and setActor does nothing there", () => {
    setActor({ id: "u1", name: "Ada" });
    expect(currentActor()).toBeNull();
  });

  it("lets the guard fill in the actor for the rest of the request", async () => {
    const seen = await withAuditContext(async () => {
      expect(currentActor()).toBeNull();
      setActor({ id: "u1", name: "Ada" });
      await Promise.resolve();
      return currentActor();
    });
    expect(seen).toEqual({ id: "u1", name: "Ada" });
  });

  it("runs work as a given actor, with requests kept apart", async () => {
    const [a, b] = await Promise.all([
      runAs({ id: "a", name: "A" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentActor()?.id;
      }),
      runAs({ id: "b", name: "B" }, async () => currentActor()?.id),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
  });
});
