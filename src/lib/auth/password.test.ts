import { describe, expect, it } from "vitest";

import { PASSWORD_MIN, passwordStrength } from "./password";

describe("passwordStrength", () => {
  it("asks for the minimum first", () => {
    expect(passwordStrength("")).toMatchObject({ score: 0, label: "" });
    expect(passwordStrength("abc")).toMatchObject({ score: 0, label: "Too short", hint: "5 more characters to go." });
    expect(passwordStrength("a".repeat(PASSWORD_MIN - 1)).hint).toBe("1 more character to go.");
  });

  it("flags common words, patterns and personal details", () => {
    expect(passwordStrength("password123").label).toBe("Easy to guess");
    expect(passwordStrength("myfowlexfarm").label).toBe("Easy to guess");
    expect(passwordStrength("aaaaaaaaaa").label).toBe("Easy to guess");
    expect(passwordStrength("abcdefghij").label).toBe("Easy to guess");
    expect(passwordStrength("ngozi-is-here", ["Ngozi"]).label).toBe("Easy to guess");
  });

  it("rewards length and variety", () => {
    expect(passwordStrength("kola-nut7")).toMatchObject({ score: 2, label: "Fair" });
    expect(passwordStrength("kolanutpepper")).toMatchObject({ score: 3, label: "Good" });
    expect(passwordStrength("Kola-nuts & pepper 9")).toMatchObject({ score: 4, label: "Strong" });
  });
});
