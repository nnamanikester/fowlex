// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MoneyInput } from "./money-input";

afterEach(cleanup);

function setup(initial: number | null = null) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = React.useState<number | null>(initial);
    return (
      <MoneyInput
        aria-label="Amount"
        value={value}
        onChange={(kobo) => {
          onChange(kobo);
          setValue(kobo);
        }}
      />
    );
  }
  render(<Harness />);
  return { input: screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" }), onChange };
}

/** Type the way a person does: one character at a time, each one a change event. */
function type(input: HTMLInputElement, chars: string) {
  for (const ch of chars) fireEvent.change(input, { target: { value: input.value + ch } });
}

describe("MoneyInput", () => {
  it("turns typed naira into kobo", () => {
    const { input, onChange } = setup();
    type(input, "18500.5");
    expect(onChange).toHaveBeenLastCalledWith(1_850_050);
    fireEvent.blur(input);
    expect(input.value).toBe("18,500.50");
  });

  it("never yields a fraction of a kobo: a third decimal is ignored", () => {
    const { input, onChange } = setup();
    type(input, "12.345");
    expect(input.value).toBe("12.34");
    for (const [kobo] of onChange.mock.calls) if (kobo !== null) expect(Number.isInteger(kobo)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it("ignores letters and minus signs", () => {
    const { input, onChange } = setup();
    type(input, "-5a0");
    expect(input.value).toBe("50");
    expect(onChange).toHaveBeenLastCalledWith(5000);
  });

  it("shows a value set from outside, and empties to null", () => {
    const { input, onChange } = setup(123456);
    expect(input.value).toBe("1,234.56");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
