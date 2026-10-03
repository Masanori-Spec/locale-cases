import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "@formatjs/icu-messageformat-parser";
import IntlMessageFormat from "intl-messageformat";
import { generate, decodeJson, LIMITS } from "../src/core.js";

// Independent oracle: selected branch identities come from the pinned formatter,
// not Locale Cases' tracer, branch IDs, reductions, or set-cover implementation.
function instrument(message) {
  const ast = parse(message);
  let count = 0;
  const branchIds = [];
  const walk = (nodes, path) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const sitePath = `${path}/${i}`;
      if (node.type === 5 || node.type === 6) {
        for (const [key, option] of Object.entries(node.options)) {
          const id = count++;
          branchIds[id] = `${sitePath}:${encodeURIComponent(key)}`;
          walk(option.value, `${sitePath}/${encodeURIComponent(key)}`);
          option.value.unshift({ type: 0, value: `⟦ORACLE_BRANCH_${id}⟧` });
        }
      } else if (node.children) walk(node.children, sitePath);
    }
  };
  walk(ast, "root");
  return { ast, count, branchIds };
}
function markerSet(formatter, args) {
  const text = formatter.format(args);
  assert.equal(typeof text, "string");
  return new Set(
    [...text.matchAll(/⟦ORACLE_BRANCH_(\d+)⟧/g)].map((m) => Number(m[1])),
  );
}
function vectors(domains, samples = {}) {
  let result = [{ ...samples }];
  for (const [key, values] of Object.entries(domains)) {
    result = result.flatMap((args) =>
      values.map((value) => ({ ...args, [key]: value })),
    );
  }
  return result;
}
function sorted(set) {
  return [...set].sort((a, b) => a - b);
}
function merge(into, from) {
  for (const x of from) into.add(x);
}
async function verify(
  catalog,
  config,
  exhaustiveDomains = config.domains || {},
) {
  const result = await generate(
    JSON.stringify(catalog),
    JSON.stringify(config),
  );
  assert.ok(Array.isArray(result.cases.cases));
  assert.ok(Array.isArray(result.coverage.messages));
  const ids = new Set();
  for (const fixture of result.cases.cases) {
    assert.ok(!ids.has(fixture.id), `duplicate case ID ${fixture.id}`);
    ids.add(fixture.id);
    assert.ok(Object.hasOwn(catalog, fixture.messageId));
    assert.equal(
      new IntlMessageFormat(catalog[fixture.messageId], fixture.locale).format(
        fixture.args,
      ),
      fixture.text,
      `fixture replay: ${fixture.id}`,
    );
  }
  for (const [messageId, message] of Object.entries(catalog)) {
    const marked = instrument(message);
    for (const locale of config.locales) {
      const formatter = new IntlMessageFormat(marked.ast, locale);
      const exhaustive = new Set();
      for (const args of vectors(exhaustiveDomains, config.samples))
        merge(exhaustive, markerSet(formatter, args));
      const selected = new Set();
      const fixtures = result.cases.cases.filter(
        (c) => c.messageId === messageId && c.locale === locale,
      );
      assert.ok(
        fixtures.length > 0,
        `at least one case for ${messageId}/${locale}`,
      );
      for (const fixture of fixtures) {
        const hits = markerSet(formatter, fixture.args);
        merge(selected, hits);
        assert.deepEqual(
          [...new Set(fixture.branches)].sort(),
          [...hits].map((hit) => marked.branchIds[hit]).sort(),
          `case trace IDs ${fixture.id}`,
        );
      }
      assert.deepEqual(
        sorted(selected),
        sorted(exhaustive),
        `finite-domain branch union ${messageId}/${locale}`,
      );
      const coverage = result.coverage.messages.find(
        (c) => c.messageId === messageId && c.locale === locale,
      );
      assert.ok(coverage, `coverage row for ${messageId}/${locale}`);
      assert.equal(
        coverage.branches.length,
        marked.count,
        "all static branches must be listed",
      );
      assert.equal(
        new Set(coverage.branches.map((b) => b.id)).size,
        marked.count,
        "branch IDs must be unique",
      );
      assert.equal(
        coverage.branches.filter((b) => b.observed).length,
        exhaustive.size,
        `observed count ${messageId}/${locale}`,
      );
      assert.equal(
        coverage.branches.filter((b) => !b.observed).length,
        marked.count - exhaustive.size,
        `unobserved count ${messageId}/${locale}`,
      );
      assert.deepEqual(
        coverage.branches
          .filter((b) => b.observed)
          .map((b) => b.id)
          .sort(),
        [...exhaustive].map((hit) => marked.branchIds[hit]).sort(),
        `observed branch IDs ${messageId}/${locale}`,
      );
      const validIds = new Set(coverage.branches.map((b) => b.id));
      const usedIds = new Set();
      for (const fixture of fixtures)
        for (const id of fixture.branches) {
          assert.ok(validIds.has(id));
          usedIds.add(id);
        }
      assert.deepEqual(
        [...usedIds].sort(),
        coverage.branches
          .filter((b) => b.observed)
          .map((b) => b.id)
          .sort(),
      );
    }
  }
  assert.equal(result.coverage.summary.cases, result.cases.cases.length);
  assert.equal(
    result.coverage.summary.observed + result.coverage.summary.unobserved,
    result.coverage.summary.branches,
  );
  return result;
}

test("oracle: exact match precedes locale plural, including offset and pound", async () => {
  await verify(
    {
      count:
        "{n, plural, offset:1 =0 {none} =2 {exact two #} one {one after offset #} other {other after offset #}}",
    },
    {
      locales: ["en", "ja", "ar", "ru"],
      domains: { n: [-2, -1, 0, 1, 2, 3, 4, 11, 100, 1.1] },
    },
  );
});

test("oracle: all Arabic categories and Russian fractions", async () => {
  const message =
    "{n, plural, zero {zero #} one {one #} two {two #} few {few #} many {many #} other {other #}}";
  const integers = await verify(
    { n: message },
    { locales: ["ar", "ru"], domains: { n: [0, 1, 2, 3, 11, 100] } },
  );
  const ru = integers.coverage.messages.find((row) => row.locale === "ru");
  assert.equal(
    ru.branches.find((branch) => branch.option === "other").observed,
    false,
  );
  const fractions = await verify(
    { n: message },
    { locales: ["ar", "ru"], domains: { n: [0, 1, 2, 3, 11, 100, 1.1] } },
  );
  assert.equal(
    fractions.coverage.messages
      .find((row) => row.locale === "ru")
      .branches.find((branch) => branch.option === "other").observed,
    true,
  );
});

test("oracle: Japanese named one remains unobserved and English exact shadows one", async () => {
  const result = await verify(
    { n: "{n, plural, =1 {exact} one {named} other {fallback}}" },
    {
      locales: ["en", "ja"],
      domains: { n: [0, 1, 2] },
    },
  );
  for (const row of result.coverage.messages)
    assert.equal(row.branches.find((b) => b.option === "one").observed, false);
});

test("oracle: shared arguments at nested, sibling and mixed ordinal/cardinal sites", async () => {
  await verify(
    {
      shared:
        "{n, plural, offset:1 one {{n, selectordinal, one {inner1 #} two {inner2 #} other {inner #}}} other {outer #}} / {n, selectordinal, one {first} two {second} few {third} other {later}} / {n, plural, =3 {three} one {singular} other {plural}}",
    },
    {
      locales: ["en", "ru"],
      domains: { n: [-1, 0, 1, 2, 3, 4, 11, 21, 22, 23, 101] },
    },
  );
});

test("oracle: nested constraints can make syntactic branches unobserved", async () => {
  await verify(
    {
      nested:
        "{g, select, a {{g, select, a {yes} b {impossible} other {impossible too}}} other {{n, plural, one {one} other {many}}}} {g, select, b {b} other {other}}",
    },
    {
      locales: ["en"],
      domains: { g: ["a", "b", "unlisted"], n: [0, 1, 2] },
    },
  );
});

test("oracle: ICU quote escaping and pound nesting retain runtime text", async () => {
  await verify(
    {
      quotes:
        "'{n}' '{'literal'}' '' {n, plural, one {'#' = # {g, select, a {# here} other {'#' there}}} other {'' # items}}",
    },
    {
      locales: ["en", "ar"],
      domains: { n: [1, 2, 100], g: ["a", "other"] },
    },
  );
});

test("oracle: exact numeric selectors use canonical string lookup", async () => {
  await verify(
    {
      noncanonical:
        "{n, plural, =01 {leading} =+1 {plus} =-0 {minus zero} =0 {canonical zero} =1 {canonical one} one {named} other {fallback}}",
    },
    {
      locales: ["en", "ja"],
      domains: { n: [0, -0, 1, -1, 2] },
    },
  );
});

test("oracle: prototype-like message IDs and select options do not collide", async () => {
  const catalog = JSON.parse(
    '{"__proto__":"{g,select,__proto__{p} constructor{c} prototype{q} other{o}}","constructor":"{g,select,__proto__{P} other{O}}","toString":"safe"}',
  );
  const result = await verify(catalog, {
    locales: ["en"],
    domains: {
      g: ["__proto__", "constructor", "prototype", "toString", "unlisted"],
    },
  });
  assert.ok(result.cases.cases.some((c) => c.messageId === "__proto__"));
  assert.equal(Object.prototype.polluted, undefined);
});

test("oracle: plain placeholders use one shared sample alongside selectors", async () => {
  await verify(
    {
      hello:
        "{name}: {n, plural, one {{name} has # item} other {{name} has # items}}",
    },
    {
      locales: ["en", "ja"],
      domains: { n: [0, 1, 2] },
      samples: { name: 'A <B> & "C"' },
    },
  );
});

test("oracle: output is deterministic across repeated calls", async () => {
  const catalog = {
    z: "{b,select,x{{n,plural,one{one}other{many}}}other{else}}",
    a: "{n,selectordinal,one{st}two{nd}few{rd}other{th}}",
  };
  const config = {
    locales: ["en", "ja"],
    domains: { n: [0, 1, 2, 3, 11, 21], b: ["x", "y"] },
  };
  assert.deepEqual(
    await generate(JSON.stringify(catalog), JSON.stringify(config)),
    await generate(JSON.stringify(catalog), JSON.stringify(config)),
  );
});

let seed = 0x6a09e667;
function rand(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
function leaf() {
  return `leaf${rand(1000)}`;
}
function randomMessage(depth = 0) {
  if (depth === 3 || rand(5) === 0) return leaf();
  const nested = () => randomMessage(depth + 1);
  if (rand(3) === 0)
    return `{g, select, a {${nested()}} b {${nested()}} other {${nested()}}}`;
  const argument = rand(2) === 0 ? "n" : "m";
  const type = rand(3) === 0 ? "selectordinal" : "plural";
  const offset = rand(3);
  const exact = rand(4);
  return `{${argument}, ${type}, offset:${offset} =${exact} {${nested()}} one {${nested()}} two {${nested()}} few {${nested()}} other {${nested()}}}`;
}
test("oracle: seeded randomized exhaustive formatter union equals reduced selected union", async () => {
  const config = {
    locales: ["en", "ja", "ar", "ru"],
    domains: {
      n: [-1, 0, 1, 2, 3, 11, 21, 1.1],
      m: [0, 1, 2, 3, 11, 1.1],
      g: ["a", "b", "other", "unlisted"],
    },
  };
  for (let i = 0; i < 20; i++) {
    const message = `${randomMessage()} / ${randomMessage(1)} / {n} {m} {g}`;
    await verify({ [`random${i}`]: message }, config);
  }
});

async function rejectsStructured(catalog, config, expectedCode) {
  await assert.rejects(
    () =>
      generate(
        typeof catalog === "string" ? catalog : JSON.stringify(catalog),
        typeof config === "string" ? config : JSON.stringify(config),
      ),
    (error) => {
      assert.equal(error.name, "LocaleCasesError");
      assert.equal(error.complete, false);
      assert.equal(typeof error.code, "string");
      if (expectedCode) assert.equal(error.code, expectedCode);
      return true;
    },
  );
}

test("security: prototype argument names rejected in catalog and config", async () => {
  for (const name of [
    "__proto__",
    "prototype",
    "constructor",
    "toString",
    "hasOwnProperty",
    "__defineGetter__",
    "valueOf",
  ]) {
    await rejectsStructured({ bad: `{${name}}` }, { locales: ["en"] });
    await rejectsStructured(
      { fine: "fine" },
      `{"locales":["en"],"samples":{${JSON.stringify(name)}:"polluted"}}`,
    );
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test("security: malformed UTF-16 selector keys produce controlled failures", async () => {
  for (const invalid of ["\ud800", "\udc00", "\ud800A"]) {
    await rejectsStructured(
      { bad: `{g, select, ${invalid} {yes} other {no}}` },
      { locales: ["en"] },
    );
  }
});

test("security: duplicate JSON keys including escaped equivalents rejected", async () => {
  for (const text of [
    '{"x":"first","x":"second"}',
    '{"x":"first","\\u0078":"second"}',
    '{"__proto__":"a","__proto__":"b"}',
  ]) {
    await rejectsStructured(text, { locales: ["en"] }, "INPUT");
  }
  await rejectsStructured(
    { x: "{n}" },
    '{"locales":["en"],"samples":{"n":1,"n":2}}',
    "INPUT",
  );
});

test("security: JSON decoder agrees with JSON.parse for escaped and nested valid values", () => {
  const values = [
    "",
    'literal \\" quote " slash / \b\f\n\r\t',
    0,
    -1,
    0.1,
    true,
    false,
    null,
    { a: [0, { ["__proto__"]: "literal", unicode: "😀漢字" }], empty: {} },
    ["[{}]", "𝄞", "�"],
  ];
  for (const value of values) {
    const text = JSON.stringify(value);
    assert.equal(JSON.stringify(decodeJson(text)), text);
  }
});

test("security: invalid JSON and unsupported catalog formats reject", async () => {
  for (const text of [
    "",
    "{}",
    "[]",
    '{"x":1}',
    '{"x":{"nested":"message"}}',
    '{"x":"ok",}',
    '{"x":"unterminated}',
    '{"x":"ok"}junk',
    '{"x":"ok"}\u00a0',
    '{"x":01}',
    '{"x":NaN}',
  ]) {
    await rejectsStructured(text, { locales: ["en"] });
  }
  for (const message of [
    "{n, number}",
    "{n, date, short}",
    "<b>rich</b>",
    "{n, plural, one {x}}",
    ".input {$n :number}\n{{hi}}",
  ]) {
    await rejectsStructured(
      { x: message },
      { locales: ["en"], samples: { n: 1 } },
    );
  }
});

test("security: config rejects unknown fields, unsafe numbers and conflicting types", async () => {
  for (const config of [
    {},
    { locales: [] },
    { locales: ["not_a_locale"] },
    { locales: ["zz"] },
    { locales: ["en"], surprise: true },
    { locales: ["en"], domains: { n: [] } },
    { locales: ["en"], domains: { n: [1, "1"] } },
    { locales: ["en"], domains: { n: [null] } },
    { locales: ["en"], domains: { n: [Number.MAX_SAFE_INTEGER + 1] } },
    { locales: ["en"], domains: { n: ["1"] } },
    { locales: ["en"], domains: { n: [1] }, samples: { n: 1 } },
    { locales: ["en"], samples: { unknown: 1 } },
    { locales: ["en"], limits: { vectorsPerRun: LIMITS.vectorsPerRun + 1 } },
    { locales: ["en"], limits: { madeUp: 5 } },
    { locales: ["en"], limits: { workUnits: 0 } },
  ])
    await rejectsStructured({ x: "{n,plural,one{one}other{other}}" }, config);
  await rejectsStructured(
    {
      a: "{n,plural,one{one}other{other}}",
      b: "{n,select,one{one}other{other}}",
    },
    { locales: ["en"] },
    "TYPE",
  );
  await rejectsStructured({ x: "{plain}" }, { locales: ["en"] }, "SAMPLE");
  await rejectsStructured(
    { x: "{n,plural,offset:9007199254740991 one{one}other{other}}" },
    { locales: ["en"], domains: { n: [-1] } },
  );
  await rejectsStructured(
    { x: "{n,plural,=9007199254740992{big}other{other}}" },
    { locales: ["en"] },
  );
});

test("limits: lower-only budgets reject all-or-nothing", async () => {
  const catalog = {
    x: "{a,select,A{{n,plural,one{one}other{other}}}other{else}}",
    y: "{n}",
  };
  const base = {
    locales: ["en", "ja"],
    domains: { n: [0, 1, 2], a: ["A", "B"] },
  };
  for (const limits of [
    { inputBytes: 10 },
    { messageBytes: 10 },
    { messages: 1 },
    { locales: 1 },
    { depth: 1 },
    { astNodes: 1 },
    { domainValues: 1 },
    { arguments: 1 },
    { vectorsPerMessage: 1 },
    { vectorsPerRun: 1 },
    { workUnits: 1 },
    { outputBytes: 1 },
  ]) {
    await rejectsStructured(catalog, { ...base, limits });
  }
});

test("limits: deeply nested JSON and ICU inputs reject before unbounded recursion", async () => {
  const json = "[".repeat(1000) + "0" + "]".repeat(1000);
  await rejectsStructured(json, { locales: ["en"] }, "LIMIT");
  const message =
    "{g,select,x{".repeat(1000) + "leaf" + "}other{o}}".repeat(1000);
  await rejectsStructured({ x: message }, { locales: ["en"] }, "LIMIT");
});

test("limits: planning/reduction obeys workUnits before repeated global selector work", async () => {
  const catalog = Object.fromEntries(
    Array.from({ length: 25 }, (_, i) => [
      `m${i}`,
      "{n,plural,one{one}other{other}} ".repeat(10),
    ]),
  );
  const original = Intl.PluralRules.prototype.select;
  let calls = 0;
  Intl.PluralRules.prototype.select = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  try {
    await rejectsStructured(
      catalog,
      {
        locales: ["en", "ja"],
        domains: { n: [0, 1, 2, 3, 4] },
        limits: { workUnits: 1 },
      },
      "WORK_LIMIT",
    );
    assert.ok(
      calls < 100,
      `workUnits=1 still performed ${calls} plural selections during planning`,
    );
  } finally {
    Intl.PluralRules.prototype.select = original;
  }
});

test("oracle: inferred domains are explicit audit data and preserve their own finite union", async () => {
  const catalog = {
    count: "{n,plural,offset:2 =999{exact}one{one}other{other}}",
    label: "Value: {n}",
    choice: "{g,select,__other__{a}__other___{b}constructor{c}other{fallback}}",
    shared: "{g,select,another{a}other{o}}",
  };
  const config = { locales: ["en", "ja"] };
  const first = await generate(JSON.stringify(catalog), JSON.stringify(config));
  const domains = {};
  for (const row of first.coverage.messages)
    for (const domain of row.domains) {
      assert.ok(domain.source.startsWith("default-"));
      assert.ok(domain.values.length >= domain.representatives.length);
      assert.ok(
        domain.representatives.every((value) => domain.values.includes(value)),
      );
      domains[domain.argument] = domain.values;
    }
  assert.ok(domains.n.includes(999));
  assert.ok(domains.g.includes("__other____"));
  await verify(catalog, config, domains);
});

test("oracle: scalar domains intentionally produce branch fixtures rather than all rendered strings", async () => {
  const result = await verify(
    { plain: "Hi {name}" },
    { locales: ["en"], domains: { name: ["Alice", "Bob", "Carol"] } },
  );
  assert.equal(result.cases.cases.length, 1);
  assert.equal(result.coverage.messages[0].domains[0].values.length, 3);
  assert.equal(
    result.coverage.messages[0].domains[0].representatives.length,
    1,
  );
});

test("oracle: canonical locale aliases and duplicates yield one canonical row", async () => {
  const result = await generate(
    JSON.stringify({ x: "{n,plural,one{one}other{other}}" }),
    JSON.stringify({ locales: ["EN-us", "en-US"], domains: { n: [0, 1] } }),
  );
  assert.equal(result.coverage.summary.locales, 1);
  assert.equal(result.coverage.messages.length, 1);
  assert.equal(result.coverage.messages[0].locale, "en-US");
  for (const fixture of result.cases.cases)
    assert.equal(
      new IntlMessageFormat(
        "{n,plural,one{one}other{other}}",
        fixture.locale,
      ).format(fixture.args),
      fixture.text,
    );
});

test("limits: byte guards cover Unicode samples, message IDs and repeated rendered values", async () => {
  await rejectsStructured(
    { x: "{name}" },
    { locales: ["en"], samples: { name: "界界" }, limits: { valueBytes: 3 } },
    "LIMIT",
  );
  await rejectsStructured(
    { "long-id": "hello" },
    { locales: ["en"], limits: { idBytes: 3 } },
    "LIMIT",
  );
  await rejectsStructured(
    { x: "{name}".repeat(100) },
    {
      locales: ["en"],
      samples: { name: "abcdefghij" },
      limits: { renderBytes: 100 },
    },
    "LIMIT",
  );
  const allowed = await generate(
    JSON.stringify({ x: "{name}" }),
    JSON.stringify({
      locales: ["en"],
      samples: { name: "界" },
      limits: { valueBytes: 3 },
    }),
  );
  assert.equal(allowed.cases.cases[0].text, "界");
});

test("limits: static branch metadata amplification rejects before row serialization", async () => {
  const ancestor = "x".repeat(4000);
  const arms = Array.from({ length: 800 }, (_, i) => `k${i}{}`).join(" ");
  const message = `{g,select,${ancestor} {{h,select,${arms} other{}}}other{safe}}`;
  assert.ok(Buffer.byteLength(message) < LIMITS.messageBytes);
  await assert.rejects(
    () =>
      generate(
        JSON.stringify({ x: message }),
        JSON.stringify({
          locales: ["en"],
          domains: { g: ["other"], h: ["other"] },
        }),
      ),
    (error) => {
      assert.equal(error.name, "LocaleCasesError");
      assert.equal(error.code, "LIMIT");
      assert.equal(error.complete, false);
      assert.match(error.message, /Static branch metadata/);
      return true;
    },
  );
});
