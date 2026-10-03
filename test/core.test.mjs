import test from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  decodeJson,
  LIMITS,
  LocaleCasesError,
  serialize,
} from "../src/core.js";
const run = (m, c = { locales: ["en"] }) =>
  generate(
    JSON.stringify(typeof m === "string" ? { m } : m),
    JSON.stringify(c),
  );
const bad = (m, c, code) =>
  assert.rejects(
    () => run(m, c),
    (e) =>
      e instanceof LocaleCasesError &&
      e.complete === false &&
      (!code || e.code === code),
  );

test("default finite domains are visible and stable with fallback collision avoidance", async () => {
  const r = await run(
    "{n, plural, =999 {X} one {Y} other {Z}} {s,select,__other__{A} other{B}}",
  );
  const d = r.coverage.messages[0].domains;
  assert.ok(d[0].values.includes(999));
  assert.equal(d[1].values.at(-1), "__other___");
  assert.equal(r.coverage.complete, true);
  assert.ok(r.coverage.metadata.sourceSha256.match(/^[a-f0-9]{64}$/));
});
test("canonical locale list is deduplicated sorted and resolved", async () => {
  const r = await run("Hi", { locales: ["ja", "en-us", "en-US"] });
  assert.deepEqual(
    r.coverage.messages.map((m) => m.locale),
    ["en-US", "ja"],
  );
  assert.equal(r.cases.cases.length, 2);
});
test("plain args require sample, retain number/string semantics, domain reduction is branch only", async () => {
  await bad("Hi {who}", { locales: ["en"] }, "SAMPLE");
  const r = await run("{who} {n}", {
    locales: ["en"],
    samples: { who: "Aki" },
    domains: { n: [2, 3] },
  });
  assert.equal(r.cases.cases[0].text, "Aki 2");
  assert.deepEqual(r.coverage.messages[0].domains[0].values, [2, 3]);
  assert.equal(r.cases.cases.length, 1);
});
test("quoted literals and empty message create one fixture without selectors", async () => {
  for (const m of ["", "'{x}' and ''", "'<script>bad</script>'"]) {
    const r = await run(m);
    assert.equal(r.cases.cases.length, 1);
    assert.equal(r.coverage.summary.branches, 0);
  }
});
test("hostile message IDs remain own entries and hostile samples stay text", async () => {
  const catalog = JSON.parse(
    '{"__proto__":"{name}","constructor":"{name}","<script>":"{name}"}',
  );
  const r = await run(catalog, {
    locales: ["en"],
    samples: { name: "<img src=x onerror=alert(1)> \u202Eevil &amp;" },
  });
  assert.equal(r.cases.cases.length, 3);
  assert.ok(r.cases.cases.every((c) => c.text.includes("<img")));
  assert.equal({}.polluted, undefined);
});
test("all dangerous argument identifiers rejected in source and config", async () => {
  for (const name of [
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "hasOwnProperty",
  ]) {
    await bad(`{${name}}`, { locales: ["en"] }, "INPUT");
    await bad(
      "Hi",
      { locales: ["en"], samples: JSON.parse(`{"${name}":"x"}`) },
      "INPUT",
    );
  }
});
test("unsupported formats tags functions and MF2 fail closed", async () => {
  for (const m of [
    "{x,number}",
    "{x,number,::currency/USD}",
    "{x,date,short}",
    "{x,time}",
    "<b>Hi</b>",
    "{x,custom}",
    "{{hello}}",
    ".input {$x}\n{{hello}}",
  ])
    await bad(m, { locales: ["en"] });
});
test("invalid syntax and missing other fail with message ID", async () => {
  for (const m of ["{", "{n,plural,one{x}}", "{s,select,a{x}}"])
    await assert.rejects(
      () => run(m),
      (e) => e.code === "PARSE" && e.messageId === "m",
    );
});
test("argument conflicts within and across messages fail", async () => {
  await bad(
    "{x,plural,other{x}} {x,select,other{x}}",
    { locales: ["en"] },
    "TYPE",
  );
  await bad(
    { a: "{x,plural,other{x}}", b: "{x,select,other{x}}" },
    { locales: ["en"] },
    "TYPE",
  );
  await bad(
    "{n,plural,other{x}}",
    { locales: ["en"], domains: { n: ["1"] } },
    "TYPE",
  );
});
test("configuration is strict", async () => {
  for (const c of [
    {},
    { locales: [] },
    { locales: ["bad_locale"] },
    { locales: ["zz-ZZ"] },
    { locales: [123] },
    { locales: ["en"], custom: true },
    { locales: ["en"], domains: [] },
    { locales: ["en"], samples: [] },
    { locales: ["en"], domains: { n: [] } },
    { locales: ["en"], domains: { n: [1, "x"] } },
    { locales: ["en"], samples: { n: {} } },
    { locales: ["en"], domains: { n: [1] }, samples: { n: 1 } },
    { locales: ["en"], samples: { unknown: 1 } },
  ])
    await bad("{n}", c);
});
test("nonfinite oversized and unsafe numeric values fail; finite fractions and safe integers work", async () => {
  for (const value of ["1e999", "9007199254740992", "-9007199254740992"])
    await assert.rejects(
      () =>
        generate('{"m":"{n}"}', `{"locales":["en"],"samples":{"n":${value}}}`),
      LocaleCasesError,
    );
  const r = await run("{n}", {
    locales: ["en"],
    domains: { n: [Number.MAX_SAFE_INTEGER, 0.1, -1] },
  });
  assert.equal(r.cases.cases.length, 1);
  await bad(
    "{n,plural,offset:9007199254740991 other{x}}",
    { locales: ["en"], domains: { n: [-1] } },
    "INPUT",
  );
});
test("duplicate JSON keys and malformed/nested JSON are rejected", () => {
  for (const s of [
    '{"a":"x","a":"y"}',
    '{"a":1,}',
    "[1,]",
    '{"a":01}',
    '{"a":"\\x"}',
    '"unterminated',
    "true garbage",
    "[ ".repeat(42) + "0" + "]".repeat(42),
  ])
    assert.throws(() => decodeJson(s), LocaleCasesError);
  assert.equal(decodeJson('{"a":"b\\\"c"}').a, 'b"c');
});
test("catalog shape and message ID/bytes are bounded", async () => {
  for (const x of [{}, [], { m: 2 }, { m: {} }])
    await bad(x, { locales: ["en"] });
  await run("x".repeat(LIMITS.messageBytes));
  await bad("x".repeat(LIMITS.messageBytes + 1), { locales: ["en"] }, "LIMIT");
  await bad(
    { ["x".repeat(LIMITS.idBytes + 1)]: "ok" },
    { locales: ["en"] },
    "LIMIT",
  );
});
test("input bytes checked before parsing", async () => {
  assert.throws(
    () => decodeJson(" ".repeat(LIMITS.inputBytes + 1)),
    (e) => e.code === "LIMIT",
  );
  await bad("ok", { locales: ["en"], limits: { inputBytes: 1 } }, "LIMIT");
});
test("message and locale count exact defaults", async () => {
  await run(
    Object.fromEntries(Array.from({ length: 200 }, (_, i) => ["m" + i, "x"])),
  );
  await bad(
    Object.fromEntries(Array.from({ length: 201 }, (_, i) => ["m" + i, "x"])),
    { locales: ["en"] },
    "LIMIT",
  );
  await run("x", { locales: ["en", "ja", "ar", "ru", "fr", "de", "es", "it"] });
  await bad(
    "x",
    { locales: ["en", "ja", "ar", "ru", "fr", "de", "es", "it", "pt"] },
    "CONFIG",
  );
});
test("AST, depth and argument lower-only limits", async () => {
  await run("x {n}", {
    locales: ["en"],
    samples: { n: "x" },
    limits: { astNodes: 2 },
  });
  await bad(
    "x {n}",
    { locales: ["en"], samples: { n: "x" }, limits: { astNodes: 1 } },
    "LIMIT",
  );
  await bad(
    "{n,plural,other{{s,select,other{x}}}}",
    { locales: ["en"], limits: { depth: 1 } },
    "LIMIT",
  );
  const m = Array.from({ length: 33 }, (_, i) => `{v${i}}`).join("");
  await bad(m, { locales: ["en"] }, "LIMIT");
  for (const v of [0, -1, 1.5, LIMITS.messages + 1])
    await bad("x", { locales: ["en"], limits: { messages: v } }, "CONFIG");
  await bad("x", { locales: ["en"], limits: { mystery: 1 } }, "CONFIG");
});
test("domain and scalar size limits protect input expansion", async () => {
  await run("{n}", {
    locales: ["en"],
    domains: { n: Array.from({ length: 512 }, (_, i) => i) },
  });
  await bad(
    "{n}",
    {
      locales: ["en"],
      domains: { n: Array.from({ length: 513 }, (_, i) => i) },
    },
    "CONFIG",
  );
  await bad(
    "{n}",
    { locales: ["en"], samples: { n: "a".repeat(4097) } },
    "LIMIT",
  );
  await bad(
    "{n}{n}{n}",
    { locales: ["en"], samples: { n: "abcd" }, limits: { renderBytes: 10 } },
    "LIMIT",
  );
});
test("vector budgets preflight complete run, failures never return partial output", async () => {
  const m = "{n,plural,=0{z} one{o} other{x}}";
  await bad(
    m,
    {
      locales: ["en"],
      domains: { n: [0, 1, 2] },
      limits: { vectorsPerMessage: 2 },
    },
    "VECTOR_LIMIT",
  );
  await bad(
    { a: m, b: m },
    {
      locales: ["en"],
      domains: { n: [0, 1, 2] },
      limits: { vectorsPerRun: 5 },
    },
    "VECTOR_LIMIT",
  );
  const r = await run(m, {
    locales: ["en"],
    domains: { n: [0, 1, 2] },
    limits: { vectorsPerMessage: 3, vectorsPerRun: 3 },
  });
  assert.equal(r.coverage.summary.evaluatedVectors, 3);
});
test("work and output budgets visibly incomplete", async () => {
  await bad(
    "{n,plural,one{o} other{x}}",
    { locales: ["en"], domains: { n: [1, 2] }, limits: { workUnits: 1 } },
    "WORK_LIMIT",
  );
  await bad("Hi", { locales: ["en"], limits: { outputBytes: 1 } }, "LIMIT");
});
test("same-runtime exact source/config produce byte identical exports", async () => {
  const c = { locales: ["en", "ja"], domains: { n: [0, 1, 2] } };
  const a = await run("{n,plural,one{o} other{#}}", c),
    b = await run("{n,plural,one{o} other{#}}", c);
  assert.equal(serialize(a), serialize(b));
  assert.ok(a.coverage.metadata.runtime.icu);
});
