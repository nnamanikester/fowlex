// Writes the unit-test coverage as a Markdown table to the CI run's summary page.
//   node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";

const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const row = (name) =>
  `| ${name[0].toUpperCase()}${name.slice(1)} | ${total[name].pct}% | ${total[name].covered} / ${total[name].total} |`;

console.log(
  [
    "### Unit test coverage",
    "",
    "| | Covered | |",
    "|---|---:|---:|",
    ...["statements", "branches", "functions", "lines"].map(row),
    "",
    "Covers `src/lib`, `src/models`, `src/app/api` and `src/proxy.ts`; pages and components are covered by the e2e job.",
  ].join("\n"),
);
