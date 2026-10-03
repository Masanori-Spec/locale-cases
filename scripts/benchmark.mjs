import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { generate } from "../src/core.js";
const scenarios = [
  {
    name: "50 messages × 4 locales, plural + select",
    catalog: Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `message.${i}`,
        "{n,plural,zero{zero} one{one} two{two} few{few} many{many} other{# items}} {role,select,owner{Edit} viewer{Read} other{Request access}}",
      ]),
    ),
    config: {
      locales: ["en", "ja", "ar", "ru"],
      domains: {
        n: [0, 1, 2, 3, 11, 100, 0.1],
        role: ["owner", "viewer", "guest"],
      },
    },
  },
  {
    name: "4,096 representative vectors in one message",
    catalog: {
      product: Array.from(
        { length: 4 },
        (_, i) =>
          `{s${i},select,${Array.from({ length: 8 }, (_, j) => `v${j}{${j}}`).join(" ")} other{x}}`,
      ).join(" / "),
    },
    config: {
      locales: ["en"],
      domains: Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          `s${i}`,
          Array.from({ length: 8 }, (_, j) => `v${j}`),
        ]),
      ),
    },
  },
];
const results = [];
for (const scenario of scenarios) {
  const times = [];
  let report;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    report = await generate(
      JSON.stringify(scenario.catalog),
      JSON.stringify(scenario.config),
    );
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  results.push({
    name: scenario.name,
    runs: 5,
    medianMs: +times[2].toFixed(2),
    minMs: +times[0].toFixed(2),
    maxMs: +times[4].toFixed(2),
    summary: report.coverage.summary,
    outputBytes: Buffer.byteLength(JSON.stringify(report)),
    runtime: report.coverage.metadata.runtime,
  });
}
const output =
  JSON.stringify(
    {
      note: "Synthetic local microbenchmarks, not an SLA or user-demand evidence. Includes cold first run; no browser/UI time. Runtime/machine differences matter.",
      platform: process.platform,
      arch: process.arch,
      results,
    },
    null,
    2,
  ) + "\n";
const index = process.argv.indexOf("--out");
if (index >= 0) await writeFile(process.argv[index + 1], output);
else process.stdout.write(output);
