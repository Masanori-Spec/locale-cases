import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { IntlMessageFormat } from "intl-messageformat";

export const VERSION = "0.1.0";
export const DEPENDENCIES = Object.freeze({
  parser: "3.5.20",
  intlMessageformat: "12.1.2",
});
export const LIMITS = Object.freeze({
  inputBytes: 1048576,
  messageBytes: 16384,
  messages: 200,
  locales: 8,
  depth: 32,
  astNodes: 2000,
  domainValues: 512,
  arguments: 32,
  vectorsPerMessage: 10000,
  vectorsPerRun: 100000,
  workUnits: 2000000,
  outputBytes: 8388608,
  valueBytes: 4096,
  renderBytes: 262144,
  idBytes: 1024,
});
const has = (o, k) => Object.hasOwn(o, k);
const bytes = (s) => new TextEncoder().encode(s).length;
const dangerous = new Set([
  "__proto__",
  "prototype",
  ...Object.getOwnPropertyNames(Object.prototype),
]);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export class LocaleCasesError extends Error {
  constructor(code, message, messageId) {
    super(
      messageId === undefined
        ? message
        : `Message ${JSON.stringify(messageId)}: ${message}`,
    );
    this.name = "LocaleCasesError";
    this.code = code;
    if (messageId !== undefined) this.messageId = messageId;
    this.complete = false;
  }
}
function fail(code, message, id) {
  throw new LocaleCasesError(code, message, id);
}
function record(o) {
  return o !== null && typeof o === "object" && !Array.isArray(o);
}
function scalar(v) {
  return (
    typeof v === "string" ||
    (typeof v === "number" &&
      Number.isFinite(v) &&
      Math.abs(v) <= Number.MAX_SAFE_INTEGER)
  );
}
function unicodeOK(s) {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
function checkName(name) {
  if (dangerous.has(name))
    fail(
      "INPUT",
      `Unsafe argument identifier ${JSON.stringify(name)} is not supported`,
    );
}

// A bounded JSON decoder rejects duplicate keys instead of silently losing catalog entries.
export function decodeJson(
  text,
  label = "Input",
  maxBytes = LIMITS.inputBytes,
) {
  if (typeof text !== "string" || bytes(text) > maxBytes)
    fail("LIMIT", `${label} must be text at most ${maxBytes} UTF-8 bytes`);
  let i = 0;
  const ws = () => {
    while (/[\t\n\r ]/.test(text[i] || "X")) i++;
  };
  const bad = () => fail("INPUT", `${label}: invalid JSON near character ${i}`);
  function str() {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        let decoded;
        try {
          decoded = JSON.parse(text.slice(start, i));
        } catch {
          bad();
        }
        if (!unicodeOK(decoded))
          fail("INPUT", `${label}: unpaired UTF-16 surrogate is not supported`);
        return decoded;
      }
      if (c === "\\") i++;
    }
    bad();
  }
  function value(depth) {
    if (depth > 40) fail("LIMIT", `${label}: JSON nesting exceeds 40`);
    ws();
    const c = text[i];
    if (c === '"') return str();
    if (c === "{" || c === "[") {
      i++;
      const object = c === "{",
        out = object ? Object.create(null) : [],
        end = object ? "}" : "]";
      ws();
      if (text[i] === end) {
        i++;
        return out;
      }
      while (i < text.length) {
        if (object) {
          ws();
          if (text[i] !== '"') bad();
          const k = str();
          if (has(out, k))
            fail("INPUT", `${label}: duplicate key ${JSON.stringify(k)}`);
          ws();
          if (text[i++] !== ":") bad();
          out[k] = value(depth + 1);
        } else out.push(value(depth + 1));
        ws();
        if (text[i] === end) {
          i++;
          return out;
        }
        if (text[i++] !== ",") bad();
      }
      bad();
    }
    const m =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(i),
      );
    if (!m) bad();
    i += m[0].length;
    return JSON.parse(m[0]);
  }
  const result = value(0);
  ws();
  if (i !== text.length) bad();
  return result;
}
function limitsFor(config) {
  const out = { ...LIMITS };
  if (config.limits !== undefined) {
    if (!record(config.limits)) fail("CONFIG", "limits must be an object");
    for (const [k, v] of Object.entries(config.limits)) {
      if (!has(LIMITS, k) || !Number.isSafeInteger(v) || v < 1 || v > LIMITS[k])
        fail(
          "CONFIG",
          `Limit ${k} must be an integer in 1..${LIMITS[k] ?? "unsupported"}`,
        );
      out[k] = v;
    }
  }
  return out;
}
function validateConfig(config) {
  if (!record(config)) fail("CONFIG", "Configuration must be a JSON object");
  for (const k of Object.keys(config))
    if (!["locales", "domains", "samples", "limits"].includes(k))
      fail("CONFIG", `Unknown configuration key ${JSON.stringify(k)}`);
  const limits = limitsFor(config);
  if (
    !Array.isArray(config.locales) ||
    !config.locales.length ||
    config.locales.length > limits.locales
  )
    fail("CONFIG", `Supply 1..${limits.locales} explicit locales`);
  let locales;
  try {
    if (config.locales.some((l) => typeof l !== "string")) throw Error();
    locales = Intl.getCanonicalLocales(config.locales);
  } catch {
    fail("CONFIG", "Locales must be valid BCP 47 language tags");
  }
  for (const l of locales) {
    if (
      !Intl.PluralRules.supportedLocalesOf([l], { localeMatcher: "lookup" })
        .length ||
      !Intl.NumberFormat.supportedLocalesOf([l], { localeMatcher: "lookup" })
        .length
    )
      fail("CONFIG", `Locale ${l} is not supported by this runtime`);
  }
  for (const kind of ["domains", "samples"]) {
    if (config[kind] !== undefined && !record(config[kind]))
      fail("CONFIG", `${kind} must be an object`);
    for (const [k, v] of Object.entries(config[kind] || {})) {
      checkName(k);
      if (kind === "domains") {
        if (
          !Array.isArray(v) ||
          !v.length ||
          v.length > limits.domainValues ||
          v.some((x) => !scalar(x) || typeof x !== typeof v[0])
        )
          fail(
            "CONFIG",
            `Domain ${k} needs 1..${limits.domainValues} same-type strings or finite safe numbers`,
          );
      } else if (!scalar(v))
        fail("CONFIG", `Sample ${k} must be a string or finite safe number`);
      for (const x of kind === "domains" ? v : [v])
        if (typeof x === "string" && bytes(x) > limits.valueBytes)
          fail(
            "LIMIT",
            `Value for ${k} exceeds ${limits.valueBytes} UTF-8 bytes`,
          );
    }
  }
  for (const k of Object.keys(config.domains || {}))
    if (has(config.samples || {}, k))
      fail("CONFIG", `Argument ${k} cannot have both a domain and a sample`);
  return {
    locales: locales.sort(cmp),
    limits,
    domains: config.domains || Object.create(null),
    samples: config.samples || Object.create(null),
  };
}
function parseMessage(message, id, limits, structuralBudget, localeCount) {
  if (bytes(id) > limits.idBytes)
    fail("LIMIT", `Message ID exceeds ${limits.idBytes} UTF-8 bytes`);
  if (typeof message !== "string")
    fail("INPUT", "Catalog values must be strings", id);
  if (bytes(message) > limits.messageBytes)
    fail("LIMIT", `Message exceeds ${limits.messageBytes} UTF-8 bytes`, id);
  // Conservative raw-brace guard protects the recursive upstream parser before AST validation.
  let depth = 0;
  for (const c of message) {
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    if (depth > 64)
      fail(
        "LIMIT",
        "Raw brace nesting exceeds 64 (including quoted literals)",
        id,
      );
  }
  if (/^\s*\.(?:input|local|match)\b/.test(message) || /^\s*\{\{/.test(message))
    fail("UNSUPPORTED", "MessageFormat 2 is not supported", id);
  let ast;
  try {
    ast = parse(message, { captureLocation: false, requiresOtherClause: true });
  } catch (e) {
    fail("PARSE", String(e.message), id);
  }
  const argumentsMap = new Map(),
    selectors = [],
    branches = [];
  let count = 0;
  function walk(nodes, path, depth) {
    if (depth > limits.depth)
      fail("LIMIT", `AST nesting exceeds ${limits.depth}`, id);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        p = `${path}/${i}`;
      if (++count > limits.astNodes)
        fail("LIMIT", `AST exceeds ${limits.astNodes} nodes`, id);
      if (
        ![
          TYPE.literal,
          TYPE.argument,
          TYPE.select,
          TYPE.plural,
          TYPE.pound,
        ].includes(n.type)
      )
        fail(
          "UNSUPPORTED",
          "Only literals, arguments, select, plural, selectordinal and # are supported; no styles or tags",
          id,
        );
      if (n.type === TYPE.literal || n.type === TYPE.pound) continue;
      checkName(n.value);
      let a = argumentsMap.get(n.value);
      if (!a) {
        a = { name: n.value, type: "scalar", selectors: [] };
        argumentsMap.set(n.value, a);
      }
      if (n.type === TYPE.argument) continue;
      const type = n.type === TYPE.select ? "string" : "number";
      if (a.type !== "scalar" && a.type !== type)
        fail(
          "TYPE",
          `Argument ${n.value} is used as both string select and numeric plural`,
          id,
        );
      a.type = type;
      if (
        n.type === TYPE.plural &&
        (!Number.isSafeInteger(n.offset) || n.offset < 0)
      )
        fail("INPUT", "Plural offset must be a nonnegative safe integer", id);
      const site = {
        node: n,
        path: p,
        argument: n.value,
        kind:
          n.type === TYPE.select
            ? "select"
            : n.pluralType === "ordinal"
              ? "selectordinal"
              : "plural",
      };
      selectors.push(site);
      a.selectors.push(site);
      for (const key of Object.keys(n.options)) {
        if (n.type === TYPE.plural && key.startsWith("=")) {
          const v = Number(key.slice(1));
          if (!scalar(v))
            fail(
              "INPUT",
              `Exact selector ${key} is outside safe finite numeric range`,
              id,
            );
        }
        if (++count > limits.astNodes)
          fail(
            "LIMIT",
            `AST nodes plus option arms exceed ${limits.astNodes}`,
            id,
          );
        const branch = {
          id: `${p}:${encodeURIComponent(key)}`,
          argument: n.value,
          kind: site.kind,
          option: key,
          path: p,
        };
        structuralBudget.bytes +=
          localeCount *
          (bytes(serialize(branch)) + bytes(JSON.stringify(branch.id)) + 128);
        if (structuralBudget.bytes > limits.outputBytes)
          fail("LIMIT", "Static branch metadata exceeds output budget", id);
        branches.push(branch);
        walk(
          n.options[key].value,
          `${p}/${encodeURIComponent(key)}`,
          depth + 1,
        );
      }
    }
  }
  walk(ast, "root", 0);
  if (argumentsMap.size > limits.arguments)
    fail("LIMIT", `Message exceeds ${limits.arguments} arguments`, id);
  return { id, message, ast, argumentsMap, selectors, branches };
}
function choose(site, value, pr) {
  const n = site.node;
  if (n.type === TYPE.select) return has(n.options, value) ? value : "other";
  const exact = `=${value}`;
  if (has(n.options, exact)) return exact;
  const category = pr[n.pluralType].select(value - n.offset);
  return has(n.options, category) ? category : "other";
}
function defaultNumbers(sites, spend) {
  const values = Array.from({ length: 201 }, (_, i) => i).concat([
    0.1, 0.5, 1.1, 1.5, 2.1, 1000, 1000000,
  ]);
  for (const s of sites) {
    spend();
    for (const k of Object.keys(s.node.options))
      if (k.startsWith("=")) values.push(Number(k.slice(1)));
    for (const d of [-1, 0, 1, 2, 3]) {
      const x = s.node.offset + d;
      if (scalar(x)) values.push(x);
    }
  }
  return [...new Set(values)].sort((a, b) => a - b);
}
function domainFor(a, config, locale, id, spend) {
  let values, source;
  if (has(config.domains, a.name)) {
    values = [...new Set(config.domains[a.name])];
    source = "explicit";
  } else if (has(config.samples, a.name)) {
    values = [config.samples[a.name]];
    source = "sample";
  } else if (a.type === "number") {
    values = defaultNumbers(a.selectors, spend);
    source = "default-numeric";
  } else if (a.type === "string") {
    const keys = [
      ...new Set(
        a.selectors
          .flatMap((s) => Object.keys(s.node.options))
          .filter((k) => k !== "other"),
      ),
    ].sort(cmp);
    let fallback = "__other__";
    while (keys.includes(fallback)) fallback += "_";
    values = keys.concat(fallback);
    source = "default-select";
  } else
    fail("SAMPLE", `Placeholder ${a.name} needs a sample or finite domain`, id);
  for (const v of values)
    if (typeof v === "string" && bytes(v) > config.limits.valueBytes)
      fail(
        "LIMIT",
        `Value for ${a.name} exceeds ${config.limits.valueBytes} bytes`,
        id,
      );
  if (values.length > config.limits.domainValues)
    fail(
      "LIMIT",
      `Domain ${a.name} exceeds ${config.limits.domainValues} values`,
      id,
    );
  if (a.type !== "scalar" && values.some((v) => typeof v !== a.type))
    fail("TYPE", `Argument ${a.name} requires ${a.type} values`, id);
  if (a.type === "number")
    for (const v of values)
      for (const s of a.selectors)
        if (!scalar(v - s.node.offset))
          fail(
            "INPUT",
            `Argument ${a.name} minus offset exceeds safe numeric range`,
            id,
          );
  const pr = {
    cardinal: new Intl.PluralRules(locale, { type: "cardinal" }),
    ordinal: new Intl.PluralRules(locale, { type: "ordinal" }),
  };
  const signatures = new Set(),
    representatives = [];
  for (const v of values) {
    const signature = JSON.stringify(
      a.selectors.map((s) => {
        spend();
        return choose(s, v, pr);
      }),
    );
    if (!signatures.has(signature)) {
      signatures.add(signature);
      representatives.push(v);
    }
  }
  return { argument: a.name, type: a.type, source, values, representatives };
}
function runtimeInfo() {
  if (typeof process !== "undefined" && process.versions?.node)
    return {
      environment: "node",
      node: process.versions.node,
      v8: process.versions.v8,
      icu: process.versions.icu || "unknown",
      cldr: process.versions.cldr || "unknown",
      unicode: process.versions.unicode || "unknown",
    };
  return {
    environment: "browser",
    userAgent:
      typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    icu: "not exposed by browser",
    cldr: "not exposed by browser",
    unicode: "not exposed by browser",
  };
}
async function digest(text) {
  const raw = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(raw)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function serialize(value) {
  return JSON.stringify(value, null, 2) + "\n";
}
export async function generate(catalogText, configText) {
  const rawConfig = decodeJson(configText, "Config"),
    config = validateConfig(rawConfig),
    catalog = decodeJson(catalogText, "Catalog", config.limits.inputBytes);
  if (bytes(configText) > config.limits.inputBytes)
    fail("LIMIT", "Config exceeds inputBytes limit");
  if (!record(catalog) || !Object.keys(catalog).length)
    fail(
      "INPUT",
      "Catalog must be a nonempty flat object of message IDs to strings",
    );
  const ids = Object.keys(catalog).sort(cmp);
  if (ids.length > config.limits.messages)
    fail("LIMIT", `Catalog exceeds ${config.limits.messages} messages`);
  const structuralBudget = { bytes: 0 };
  const parsed = ids.map((id) =>
    parseMessage(
      catalog[id],
      id,
      config.limits,
      structuralBudget,
      config.locales.length,
    ),
  );
  const globalTypes = new Map();
  for (const m of parsed)
    for (const a of m.argumentsMap.values()) {
      const old = globalTypes.get(a.name);
      if (old && old !== "scalar" && a.type !== "scalar" && old !== a.type)
        fail(
          "TYPE",
          `Argument ${a.name} has conflicting types across the catalog`,
          m.id,
        );
      if (!old || old === "scalar") globalTypes.set(a.name, a.type);
    }
  for (const k of [
    ...Object.keys(config.domains),
    ...Object.keys(config.samples),
  ])
    if (!globalTypes.has(k))
      fail("CONFIG", `Unknown configured argument ${JSON.stringify(k)}`);
  // Plain references inherit selector type and default domain from all same-name sites in the catalog.
  const globalSites = new Map();
  for (const m of parsed)
    for (const a of m.argumentsMap.values()) {
      if (!globalSites.has(a.name)) globalSites.set(a.name, []);
      globalSites.get(a.name).push(...a.selectors);
    }
  let work = 0;
  const spend = (n = 1) => {
    work += n;
    if (work > config.limits.workUnits)
      fail(
        "WORK_LIMIT",
        `Run exceeds ${config.limits.workUnits} work units; no report was produced`,
      );
  };
  const domainCache = new Map(),
    plans = [];
  let runVectors = 0;
  for (const m of parsed)
    for (const locale of config.locales) {
      const domains = [...m.argumentsMap.values()]
        .sort((a, b) => cmp(a.name, b.name))
        .map((a) => {
          const key = JSON.stringify([a.name, locale]);
          if (!domainCache.has(key))
            domainCache.set(
              key,
              domainFor(
                {
                  ...a,
                  type: globalTypes.get(a.name),
                  selectors: globalSites.get(a.name),
                },
                config,
                locale,
                m.id,
                spend,
              ),
            );
          return domainCache.get(key);
        });
      let total = 1;
      for (const d of domains) {
        if (total > config.limits.vectorsPerMessage / d.representatives.length)
          fail(
            "VECTOR_LIMIT",
            `Reduced domain product exceeds ${config.limits.vectorsPerMessage} vectors per message/locale; no report was produced`,
            m.id,
          );
        total *= d.representatives.length;
      }
      runVectors += total;
      if (runVectors > config.limits.vectorsPerRun)
        fail(
          "VECTOR_LIMIT",
          `Run exceeds ${config.limits.vectorsPerRun} vectors; no report was produced`,
          m.id,
        );
      plans.push({ m, locale, domains, total });
    }
  const metadata = {
    tool: "Locale Cases",
    version: VERSION,
    dependencies: DEPENDENCIES,
    sourceSha256: await digest(catalogText),
    configSha256: await digest(configText),
    runtime: runtimeInfo(),
    coverageScope:
      "Only the listed finite domains. Unobserved does not mean globally unreachable.",
    reduction:
      "Deterministic greedy set cover; not guaranteed minimum. Covers branch arms, not every path or rendered string.",
    purpose:
      "Snapshot starter fixtures; generated expected text is not proof of translation correctness.",
    limits: config.limits,
  };
  const cases = [],
    messages = [];
  let outputUsed = bytes(serialize(metadata)) * 2 + 4096;
  const reserve = (value) => {
    outputUsed += bytes(serialize(value)) + 64;
    if (outputUsed > config.limits.outputBytes)
      fail(
        "LIMIT",
        `Combined output exceeds ${config.limits.outputBytes} bytes; no report was produced`,
      );
  };
  for (const { m, locale, domains, total } of plans) {
    const pr = {
      cardinal: new Intl.PluralRules(locale, { type: "cardinal" }),
      ordinal: new Intl.PluralRules(locale, { type: "ordinal" }),
    };
    const siteMap = new Map(m.selectors.map((s) => [s.path, s]));
    const unique = new Map(),
      observed = new Set();
    function trace(nodes, path, args, seen) {
      for (let i = 0; i < nodes.length; i++) {
        spend();
        const n = nodes[i],
          p = `${path}/${i}`;
        if (n.type !== TYPE.select && n.type !== TYPE.plural) continue;
        const key = choose(siteMap.get(p), args[n.value], pr);
        seen.push(`${p}:${encodeURIComponent(key)}`);
        trace(
          n.options[key].value,
          `${p}/${encodeURIComponent(key)}`,
          args,
          seen,
        );
      }
    }
    for (let v = 0; v < total; v++) {
      let index = v;
      const args = Object.create(null);
      for (let i = domains.length - 1; i >= 0; i--) {
        const d = domains[i];
        args[d.argument] = d.representatives[index % d.representatives.length];
        index = Math.floor(index / d.representatives.length);
      }
      const seen = [];
      trace(m.ast, "root", args, seen);
      for (const b of seen) observed.add(b);
      const signature = JSON.stringify(seen);
      if (!unique.has(signature))
        unique.set(signature, { args, branches: seen });
    }
    const candidates = [...unique.values()],
      scores = candidates.map((c) => c.branches.length),
      inverted = new Map();
    for (let i = 0; i < candidates.length; i++)
      for (const b of candidates[i].branches) {
        if (!inverted.has(b)) inverted.set(b, []);
        inverted.get(b).push(i);
      }
    const left = new Set(observed),
      selected = [];
    if (!left.size) selected.push(candidates[0]);
    while (left.size) {
      let best = -1,
        score = 0;
      for (let i = 0; i < scores.length; i++) {
        spend();
        if (scores[i] > score) {
          score = scores[i];
          best = i;
        }
      }
      if (best < 0)
        fail(
          "INTERNAL",
          "Coverage reduction did not preserve its finite domain",
        );
      selected.push(candidates[best]);
      for (const b of candidates[best].branches)
        if (left.delete(b))
          for (const i of inverted.get(b)) {
            spend();
            scores[i]--;
          }
    }
    const formatter = new IntlMessageFormat(m.ast, locale);
    for (const c of selected) {
      let estimated = 0;
      function estimate(nodes, path) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i],
            p = `${path}/${i}`;
          if (n.type === TYPE.literal) estimated += bytes(n.value);
          else if (n.type === TYPE.argument)
            estimated += bytes(String(c.args[n.value]));
          else if (n.type === TYPE.pound) estimated += 128;
          else {
            const key = choose(siteMap.get(p), c.args[n.value], pr);
            estimate(n.options[key].value, `${p}/${encodeURIComponent(key)}`);
          }
          if (estimated > config.limits.renderBytes)
            fail(
              "LIMIT",
              `Rendered text upper bound exceeds ${config.limits.renderBytes} bytes`,
              m.id,
            );
        }
      }
      estimate(m.ast, "root");
      let text;
      try {
        text = formatter.format(c.args);
      } catch (e) {
        fail("RENDER", String(e.message), m.id);
      }
      if (typeof text !== "string")
        fail("RENDER", "Runtime returned a non-string", m.id);
      const fixture = {
        id: `case-${String(cases.length + 1).padStart(5, "0")}`,
        messageId: m.id,
        locale,
        args: c.args,
        text,
        branches: c.branches,
      };
      reserve(fixture);
      cases.push(fixture);
    }
    const report = {
      messageId: m.id,
      locale,
      resolvedLocale: formatter.resolvedOptions().locale,
      domains,
      totalVectors: total,
      evaluatedVectors: total,
      branches: m.branches.map((b) => ({ ...b, observed: observed.has(b.id) })),
      coveredBranches: m.branches
        .filter((b) => observed.has(b.id))
        .map((b) => b.id),
      unobservedBranches: m.branches
        .filter((b) => !observed.has(b.id))
        .map((b) => b.id),
    };
    reserve(report);
    messages.push(report);
  }
  const branches = messages.reduce((n, m) => n + m.branches.length, 0),
    unobserved = messages.reduce((n, m) => n + m.unobservedBranches.length, 0);
  const result = {
    cases: { schemaVersion: 1, metadata, cases },
    coverage: {
      schemaVersion: 1,
      metadata,
      complete: true,
      summary: {
        messages: parsed.length,
        locales: config.locales.length,
        cases: cases.length,
        branches,
        observed: branches - unobserved,
        unobserved,
        evaluatedVectors: runVectors,
        workUnits: work,
      },
      messages,
    },
  };
  if (
    bytes(serialize(result.cases)) + bytes(serialize(result.coverage)) >
    config.limits.outputBytes
  )
    fail(
      "LIMIT",
      `Combined output exceeds ${config.limits.outputBytes} bytes; no report was produced`,
    );
  return result;
}
