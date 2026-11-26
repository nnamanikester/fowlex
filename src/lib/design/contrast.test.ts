import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every text colour in globals.css meets WCAG AA (4.5:1) on the backgrounds it is used on, in both
 * themes. Reads the real stylesheet, so a token change that breaks contrast fails here.
 */
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

type Rgb = [number, number, number];

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n  }", start));
  const tokens: Record<string, Rgb> = {};
  for (const [, name, r, g, b] of body.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)) {
    tokens[name] = [Number(r), Number(g), Number(b)];
  }
  return tokens;
}

const light = block(":root");
// Dark overrides what it changes; the rest (the sidebar text, charcoal) carries over from :root.
const dark = { ...light, ...block(".dark") };

function luminance([r, g, b]: Rgb) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background tokens it appears on] */
const PAIRS: [string, string[]][] = [
  ["fg", ["canvas", "surface", "surface-raised", "surface-subtle", "surface-muted"]],
  ["fg-heading", ["canvas", "surface", "surface-raised"]],
  ["fg-muted", ["canvas", "surface", "surface-raised", "surface-subtle"]],
  ["fg-subtle", ["canvas", "surface", "surface-raised", "surface-subtle"]],
  ["brand-fg", ["canvas", "surface", "brand-subtle"]],
  ["brand-ink", ["brand-solid", "brand-solid-hover"]],
  ["comb-fg", ["canvas", "surface", "comb-subtle"]],
  ["success-fg", ["surface", "success-subtle"]],
  ["warning-fg", ["surface", "warning-subtle"]],
  ["danger-fg", ["surface", "danger-subtle"]],
  ["info-fg", ["surface", "info-subtle"]],
  ["nav-fg", ["nav"]],
  ["nav-muted", ["nav"]],
  ["nav-subtle", ["nav"]],
  ["nav-accent", ["nav"]],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_, tokens) => {
  for (const [text, backgrounds] of PAIRS) {
    for (const bg of backgrounds) {
      it(`${text} on ${bg} is at least 4.5:1`, () => {
        expect(tokens[text], `--${text} is missing`).toBeDefined();
        expect(tokens[bg], `--${bg} is missing`).toBeDefined();
        expect(contrast(tokens[text], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("white text on danger buttons is at least 4.5:1", () => {
    expect(contrast([255, 255, 255], tokens.danger)).toBeGreaterThanOrEqual(4.5);
  });
});
