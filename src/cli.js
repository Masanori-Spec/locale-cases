#!/usr/bin/env node
import { readFile, mkdir, writeFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, serialize, LIMITS } from "./core.js";
const HELP = `Locale Cases — finite-domain ICU snapshot starter fixtures\n\nnode src/cli.js --catalog messages.json --config config.json --out NEW_DIRECTORY\n\nWrites cases.json and coverage.json to a new directory. Never overwrites.\nAll calculation and validation finish before output creation. No network calls.\nInput catalog: flat JSON messageId:string. Config: explicit locales, optional\ndomains, samples and lower-only limits. See README.md for the bounded claim.\n`;
async function readBounded(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > LIMITS.inputBytes)
    throw Error(
      `Input must be a regular file at most ${LIMITS.inputBytes} bytes: ${file}`,
    );
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text) > LIMITS.inputBytes)
    throw Error("Input grew beyond the byte limit");
  return text;
}
export async function main(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(HELP);
    return;
  }
  const opts = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (
      !["--catalog", "--config", "--out"].includes(k) ||
      has(opts, k) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith("--")
    )
      throw Error(
        "Use --catalog FILE --config FILE --out NEW_DIRECTORY; --help for details",
      );
    opts[k] = argv[i + 1];
  }
  if (Object.keys(opts).length !== 3)
    throw Error("Use --catalog FILE --config FILE --out NEW_DIRECTORY");
  const output = path.resolve(opts["--out"]);
  try {
    await lstat(output);
    throw Error(`Output already exists; refusing overwrite: ${output}`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const [catalog, config] = await Promise.all([
    readBounded(opts["--catalog"]),
    readBounded(opts["--config"]),
  ]);
  const result = await generate(catalog, config);
  // mkdir is the atomic exclusive reservation. If a normal I/O error occurs,
  // remove only our own two files and directory; never touch a pre-existing path.
  await mkdir(output);
  try {
    await writeFile(path.join(output, "cases.json"), serialize(result.cases), {
      flag: "wx",
    });
    await writeFile(
      path.join(output, "coverage.json"),
      serialize(result.coverage),
      { flag: "wx" },
    );
  } catch (e) {
    await rm(path.join(output, "cases.json"), { force: true });
    await rm(path.join(output, "coverage.json"), { force: true });
    await import("node:fs/promises").then((fs) => fs.rmdir(output));
    throw e;
  }
  const s = result.coverage.summary;
  process.stdout.write(
    `${s.cases} starter fixtures; ${s.observed}/${s.branches} branch arms observed within listed domains; ${s.unobserved} unobserved.\n${output}\n`,
  );
}
const has = (o, k) => Object.hasOwn(o, k);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(
      `INCOMPLETE — no usable coverage report: ${e.code ? `${e.code}: ` : ""}${e.message}\n`,
    );
    process.exitCode = 1;
  });
