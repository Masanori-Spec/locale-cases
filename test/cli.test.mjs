import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  mkdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const cli = path.resolve("src/cli.js");
async function area(fn) {
  const d = await mkdtemp(path.join(tmpdir(), "locale-cases-test-"));
  try {
    await writeFile(
      path.join(d, "messages.json"),
      '{"m":"{n,plural,one{one} other{# things}}"}',
    );
    await writeFile(
      path.join(d, "config.json"),
      '{"locales":["en"],"domains":{"n":[1,2]}}',
    );
    await fn(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}
const invoke = (d, extra = []) =>
  spawnSync(
    process.execPath,
    [
      cli,
      "--catalog",
      path.join(d, "messages.json"),
      "--config",
      path.join(d, "config.json"),
      "--out",
      path.join(d, "out"),
      ...extra,
    ],
    { encoding: "utf8" },
  );
test("CLI creates two reports without touching either input", () =>
  area(async (d) => {
    const before = await readFile(path.join(d, "messages.json"));
    const r = invoke(d);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(await readdir(path.join(d, "out")), [
      "cases.json",
      "coverage.json",
    ]);
    const cases = JSON.parse(await readFile(path.join(d, "out/cases.json")));
    assert.equal(cases.cases.length, 2);
    assert.deepEqual(await readFile(path.join(d, "messages.json")), before);
    assert.equal(invoke(d).status, 1);
    assert.equal(
      JSON.parse(await readFile(path.join(d, "out/cases.json"))).cases.length,
      2,
    );
  }));
test("CLI rejects even an empty existing output directory", () =>
  area(async (d) => {
    await mkdir(path.join(d, "out"));
    const r = invoke(d);
    assert.equal(r.status, 1);
    assert.deepEqual(await readdir(path.join(d, "out")), []);
  }));
test("invalid input and late budget failures leave no output artifacts", () =>
  area(async (d) => {
    await writeFile(
      path.join(d, "config.json"),
      '{"locales":["en"],"domains":{"n":[1,2]},"limits":{"workUnits":1}}',
    );
    const r = invoke(d);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INCOMPLETE/);
    assert.deepEqual(await readdir(d), ["config.json", "messages.json"]);
    await writeFile(path.join(d, "messages.json"), "{");
    assert.equal(invoke(d).status, 1);
    assert.deepEqual(await readdir(d), ["config.json", "messages.json"]);
  }));
test("CLI rejects unrecognized or repeated flags; help available", () =>
  area(async (d) => {
    assert.equal(invoke(d, ["--force", "yes"]).status, 1);
    assert.equal(invoke(d, ["--out", "x"]).status, 1);
    assert.equal(
      spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).status,
      0,
    );
  }));
