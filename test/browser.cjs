/* Run in CI on Ubuntu 22.04 with Playwright Chromium installed.
 * Chromium sandbox is explicitly enabled. Never add sandbox-bypass flags. */
const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../web");
const artifacts = path.resolve(
  process.env.UI_ARTIFACT_DIR || "test-results/locale-cases-ui",
);
const tests = [],
  test = (name, run) => tests.push({ name, run });
let browser, server, base, sampleCatalog, sampleConfig, sampleResult;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};
async function setup({ width = 1440, mock = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 1100 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [],
    outside = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(base) && !request.url().startsWith("blob:"))
      outside.push(request.url());
  });
  if (mock)
    await page.addInitScript(() => {
      window.__workers = [];
      window.Worker = class {
        constructor() {
          this.terminated = 0;
          window.__workers.push(this);
        }
        postMessage(payload) {
          this.payload = payload;
          this.savedMessage = this.onmessage;
          this.savedError = this.onerror;
        }
        terminate() {
          this.terminated++;
        }
        result(value, id = this.payload.id) {
          this.savedMessage({ data: { type: "result", id, result: value } });
        }
        fail() {
          this.savedError({ preventDefault() {} });
        }
      };
    });
  if (!mock)
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__nativeWorkers = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.terminated = 0;
          window.__nativeWorkers.push(this);
        }
        terminate() {
          this.terminated++;
          return super.terminate();
        }
      };
    });
  await page.goto(base);
  await expect(page.locator("#catalog-input")).not.toHaveValue("");
  return { page, context, errors, outside };
}
async function close(s) {
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.outside, []);
  await s.context.close();
}
async function complete(s) {
  await s.page.locator("#generate-button").click();
  try {
    await expect(s.page.locator("#results")).toBeVisible({ timeout: 15000 });
  } catch (error) {
    await s.page.screenshot({
      path: path.join(artifacts, "generation-failure.png"),
      fullPage: true,
    });
    error.message += `\nStatus: ${await s.page.locator("#status-text").textContent()}\nError: ${await s.page.locator("#error-region").textContent()}\nPage errors: ${JSON.stringify(s.errors)}`;
    throw error;
  }
}
async function overflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
async function mockResult(s, index) {
  await s.page.evaluate(
    ({ result, index }) => window.__workers[index].result(result),
    { result: sampleResult, index },
  );
}
async function download(page, kind) {
  const waiting = page.waitForEvent("download");
  await page.locator(`#download-${kind}`).click();
  const item = await waiting;
  assert.equal(item.suggestedFilename(), `${kind}.json`);
  const file = path.join(artifacts, `${kind}.json`);
  await item.saveAs(file);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

test("desktop keyboard entry: skip link clipped at rest, visible when focused", async () => {
  const s = await setup(),
    p = s.page;
  assert.equal(
    await p
      .locator(".skip-link")
      .evaluate(
        (el) =>
          getComputedStyle(el).clipPath === "inset(50%)" &&
          el.getBoundingClientRect().width <= 1,
      ),
    true,
  );
  await p.keyboard.press("Tab");
  await expect(p.locator(".skip-link")).toBeFocused();
  const bounds = await p.locator(".skip-link").boundingBox();
  assert.ok(bounds.width > 100 && bounds.x >= 0 && bounds.y >= 0);
  await p.screenshot({
    path: path.join(artifacts, "desktop-focused-skip.png"),
  });
  await p.keyboard.press("Enter");
  await expect(p.locator("#workspace")).toBeFocused();
  await expect(p.locator("#catalog-input")).toHaveAccessibleName(
    "Message catalog",
  );
  await expect(p.locator("#config-input")).toHaveAccessibleName(
    "Locales & inputs",
  );
  await expect(p.locator("#download-cases")).toBeDisabled();
  await overflow(p);
  await p.screenshot({
    path: path.join(artifacts, "desktop-initial.png"),
    fullPage: true,
  });
  await close(s);
});
test("real worker: example results, filtered cases, branch ledger, provenance", async () => {
  const s = await setup();
  await complete(s);
  const p = s.page;
  await expect(p.locator("#error-region")).toBeHidden();
  assert.ok((await p.locator(".case-card").count()) > 0);
  await expect(p.locator("#download-cases")).toBeEnabled();
  await p.locator("#locale-filter").selectOption("ja");
  assert.ok((await p.locator(".case-card").count()) > 0);
  for (const tag of await p.locator(".case-card .locale-tag").allTextContents())
    assert.equal(tag, "ja");
  await p.locator("#message-filter").fill("inbox");
  for (const id of await p.locator(".case-identity code").allTextContents())
    assert.equal(id, "inbox");
  await p.locator("#message-filter").fill("");
  await p.locator("#locale-filter").selectOption("");
  await p.screenshot({
    path: path.join(artifacts, "desktop-cases.png"),
    fullPage: true,
  });
  await p.locator("#coverage-tab").click();
  await expect(p.locator(".coverage-card")).toHaveCount(16);
  await p.locator(".coverage-card summary").first().click();
  assert.ok((await p.locator(".branch-row").count()) > 0);
  await p.locator(".runtime-details summary").click();
  await expect(p.locator("#runtime-metadata")).toContainText(
    "not exposed by browser",
  );
  await overflow(p);
  await p.screenshot({
    path: path.join(artifacts, "desktop-coverage.png"),
    fullPage: true,
  });
  await close(s);
});
test("downloaded JSON shapes, source fingerprints, fixture replay, coverage witnesses", async () => {
  const s = await setup();
  await complete(s);
  const cases = await download(s.page, "cases"),
    coverage = await download(s.page, "coverage");
  assert.equal(cases.schemaVersion, 1);
  assert.equal(coverage.schemaVersion, 1);
  assert.equal(coverage.complete, true);
  assert.equal(cases.cases.length, coverage.summary.cases);
  assert.equal(
    cases.metadata.sourceSha256,
    createHash("sha256").update(sampleCatalog).digest("hex"),
  );
  assert.equal(
    cases.metadata.configSha256,
    createHash("sha256").update(sampleConfig).digest("hex"),
  );
  assert.deepEqual(cases.metadata, coverage.metadata);
  assert.equal(cases.metadata.runtime.environment, "browser");
  const { IntlMessageFormat } = await import("intl-messageformat");
  const catalog = JSON.parse(sampleCatalog);
  for (const fixture of cases.cases) {
    assert.equal(
      new IntlMessageFormat(catalog[fixture.messageId], fixture.locale).format(
        fixture.args,
      ),
      fixture.text,
    );
    const message = coverage.messages.find(
      (item) =>
        item.messageId === fixture.messageId && item.locale === fixture.locale,
    );
    assert.ok(message);
    for (const branch of fixture.branches)
      assert.ok(message.coveredBranches.includes(branch));
  }
  for (const message of coverage.messages) {
    const witnessed = new Set(
      cases.cases
        .filter(
          (item) =>
            item.messageId === message.messageId &&
            item.locale === message.locale,
        )
        .flatMap((item) => item.branches),
    );
    assert.deepEqual(
      [...witnessed].sort(),
      [...message.coveredBranches].sort(),
    );
  }
  await close(s);
});
test("language toggle preserves result, inputs and usable downloads", async () => {
  const s = await setup();
  await complete(s);
  const p = s.page,
    before = await p.locator("#catalog-input").inputValue();
  await p.locator("#lang-ja").click();
  await expect(p.locator("html")).toHaveAttribute("lang", "ja");
  await expect(p.locator("#results-title")).toHaveText("分岐の記録を確認する");
  await expect(p.locator("#download-coverage")).toBeEnabled();
  assert.equal(await p.locator("#catalog-input").inputValue(), before);
  await p.screenshot({
    path: path.join(artifacts, "desktop-japanese.png"),
    fullPage: true,
  });
  await p.locator("#lang-en").click();
  await expect(p.locator("#results")).toBeVisible();
  await close(s);
});
test("390px and 320px Japanese layout has no horizontal page overflow", async () => {
  for (const width of [390, 320]) {
    const s = await setup({ width });
    await s.page.locator("#lang-ja").click();
    await complete(s);
    await overflow(s.page);
    await s.page.screenshot({
      path: path.join(artifacts, `mobile-${width}-japanese-cases.png`),
      fullPage: true,
    });
    await s.page.locator("#coverage-tab").click();
    await s.page.locator(".coverage-card summary").first().click();
    await overflow(s.page);
    await s.page.screenshot({
      path: path.join(artifacts, `mobile-${width}-japanese-coverage.png`),
      fullPage: true,
    });
    await s.page.evaluate(() => window.scrollTo(0, 650));
    assert.equal(
      await s.page
        .locator(".skip-link")
        .evaluate(
          (el) =>
            getComputedStyle(el).clipPath === "inset(50%)" &&
            el.getBoundingClientRect().width <= 1,
        ),
      true,
    );
    await s.page.locator(".skip-link").focus();
    const bounds = await s.page.locator(".skip-link").boundingBox();
    assert.ok(bounds.width > 100 && bounds.x >= 0 && bounds.y >= 0);
    await overflow(s.page);
    await close(s);
  }
});
test("hostile IDs and substituted markup/bidi remain text at 320px", async () => {
  const s = await setup({ width: 320 }),
    p = s.page;
  const messageId =
    "<script>window.injected=true</script>" + "x".repeat(200) + "\u202Eabc";
  const value = '<img src=x onerror="window.injected=true">\u202Eabc';
  await p
    .locator("#catalog-input")
    .fill(JSON.stringify({ [messageId]: "{name}" }));
  await p
    .locator("#config-input")
    .fill(JSON.stringify({ locales: ["en"], samples: { name: value } }));
  await complete(s);
  assert.equal(await p.locator(".case-text").textContent(), value);
  assert.equal(await p.locator(".case-identity code").textContent(), messageId);
  assert.equal(await p.locator("#results img, #results script").count(), 0);
  assert.equal(await p.evaluate(() => Boolean(window.injected)), false);
  await overflow(p);
  await p.locator("#coverage-tab").click();
  await p.locator(".coverage-card summary").click();
  await overflow(p);
  await close(s);
});
test("invalid JSON and budget failures discard entire run, then recover in Japanese", async () => {
  const s = await setup();
  await complete(s);
  const p = s.page;
  await p.locator("#catalog-input").fill("{");
  await expect(p.locator("#results")).toBeHidden();
  await expect(p.locator("#download-cases")).toBeDisabled();
  await p.locator("#generate-button").click();
  await expect(p.locator("#error-region")).toContainText("INPUT");
  await expect(p.locator("#results")).toBeHidden();
  await p.locator("#lang-ja").click();
  await expect(p.locator("#error-title")).toHaveText("生成は未完了です");
  await p
    .locator("#catalog-input")
    .fill(JSON.stringify({ n: "{n, plural, one {One} other {Other}}" }));
  await p.locator("#config-input").fill(
    JSON.stringify({
      locales: ["en"],
      domains: { n: [0, 1, 2] },
      limits: { vectorsPerMessage: 1 },
    }),
  );
  await p.locator("#generate-button").click();
  await expect(p.locator("#error-region")).toContainText("VECTOR_LIMIT");
  await expect(p.locator("#download-coverage")).toBeDisabled();
  await expect(p.locator("#results")).toBeHidden();
  await p.screenshot({
    path: path.join(artifacts, "japanese-budget-error.png"),
    fullPage: true,
  });
  await p.locator("#sample-button").click();
  await expect(p.locator("#error-region")).toBeHidden();
  await complete(s);
  await expect(p.locator("#download-cases")).toBeEnabled();
  await close(s);
});
test("sample reload, catalog file and config edits clear old results immediately", async () => {
  const s = await setup();
  await complete(s);
  const p = s.page;
  await p.locator("#sample-button").click();
  await expect(p.locator("#results")).toBeHidden();
  await expect(p.locator("#download-cases")).toBeDisabled();
  await complete(s);
  await p.locator("#catalog-file").setInputFiles({
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"message":"Hello"}'),
  });
  await expect(p.locator("#results")).toBeHidden();
  await expect(p.locator("#download-coverage")).toBeDisabled();
  await expect(p.locator("#catalog-input")).toHaveValue('{"message":"Hello"}');
  await p.locator("#config-file").setInputFiles({
    name: "config.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"locales":["en"]}'),
  });
  await expect(p.locator("#config-input")).toHaveValue('{"locales":["en"]}');
  await complete(s);
  await p.locator("#config-input").fill('{"locales":["ja"]}');
  await expect(p.locator("#results")).toBeHidden();
  await expect(p.locator("#download-cases")).toBeDisabled();
  await close(s);
});
test("oversized and empty local files fail before any worker generation", async () => {
  const s = await setup({ mock: true }),
    p = s.page;
  await p.locator("#catalog-file").setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1048577),
  });
  await expect(p.locator("#error-region")).toContainText("1 MiB");
  await p.locator("#config-file").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(0),
  });
  await expect(p.locator("#error-region")).toContainText("empty");
  assert.equal(await p.evaluate(() => window.__workers.length), 0);
  await expect(p.locator("#download-cases")).toBeDisabled();
  await close(s);
});
test("real worker cancel and edit terminate native workers before restart", async () => {
  const s = await setup(),
    p = s.page;
  await p.evaluate(() => {
    document.getElementById("generate-button").click();
    document.getElementById("cancel-button").click();
  });
  assert.equal(await p.evaluate(() => window.__nativeWorkers[0].terminated), 1);
  await expect(p.locator("#status-text")).toContainText("Cancelled");
  await expect(p.locator("#results")).toBeHidden();
  await p.evaluate(() => {
    document.getElementById("generate-button").click();
    const editor = document.getElementById("catalog-input");
    editor.value += " ";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await p.evaluate(() => window.__nativeWorkers[1].terminated), 1);
  await expect(p.locator("#results")).toBeHidden();
  await complete(s);
  assert.equal(await p.evaluate(() => window.__nativeWorkers.length), 3);
  assert.equal(await p.evaluate(() => window.__nativeWorkers[2].terminated), 1);
  await close(s);
});
test("mock worker termination on cancel, stale callback isolation, and restart", async () => {
  const s = await setup({ mock: true }),
    p = s.page;
  await p.locator("#generate-button").click();
  await expect(p.locator("#cancel-button")).toBeVisible();
  await p.locator("#cancel-button").click();
  assert.equal(await p.evaluate(() => window.__workers[0].terminated), 1);
  await mockResult(s, 0);
  await expect(p.locator("#results")).toBeHidden();
  await p.locator("#generate-button").click();
  await p.evaluate(
    ({ result }) =>
      window.__workers[0].result(result, window.__workers[1].payload.id),
    { result: sampleResult },
  );
  await expect(p.locator("#results")).toBeHidden();
  await mockResult(s, 1);
  await expect(p.locator("#results")).toBeVisible();
  await expect(p.locator("#download-cases")).toBeEnabled();
  await close(s);
});
test("edit while running stops worker and rapid repeated click cannot double-run", async () => {
  const s = await setup({ mock: true }),
    p = s.page;
  await p.locator("#generate-button").evaluate((button) => {
    button.click();
    button.click();
  });
  assert.equal(await p.evaluate(() => window.__workers.length), 1);
  await p.locator("#config-input").fill('{"locales":["en"]}');
  assert.equal(await p.evaluate(() => window.__workers[0].terminated), 1);
  await mockResult(s, 0);
  await expect(p.locator("#results")).toBeHidden();
  await expect(p.locator("#cancel-button")).toBeHidden();
  await expect(p.locator("#download-cases")).toBeDisabled();
  await close(s);
});
test("worker crash and malformed response expose error with no artifacts; next run works", async () => {
  const s = await setup({ mock: true }),
    p = s.page;
  await p.locator("#generate-button").click();
  await p.evaluate(() => window.__workers[0].fail());
  await expect(p.locator("#error-region")).toContainText("WORKER_CRASH");
  await expect(p.locator("#download-coverage")).toBeDisabled();
  await p.locator("#generate-button").click();
  await p.evaluate(() => window.__workers[1].result({}));
  await expect(p.locator("#error-region")).toContainText("WORKER_RESPONSE");
  await p.locator("#generate-button").click();
  await mockResult(s, 2);
  await expect(p.locator("#error-region")).toBeHidden();
  await expect(p.locator("#results")).toBeVisible();
  await close(s);
});

(async () => {
  const model = await import("../web/model.js"),
    core = await import("../src/core.js");
  sampleCatalog = model.SAMPLE_CATALOG;
  sampleConfig = model.SAMPLE_CONFIG;
  sampleResult = await core.generate(sampleCatalog, sampleConfig);
  await fs.mkdir(artifacts, { recursive: true });
  server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const relative = pathname.replace(/^\/workbench\//, "") || "index.html";
      if (
        ![
          "index.html",
          "app.js",
          "model.js",
          "styles.css",
          "favicon.svg",
          "dist/worker.js",
        ].includes(relative)
      ) {
        res.writeHead(404);
        return res.end();
      }
      const data = await fs.readFile(path.join(root, relative));
      res.writeHead(200, {
        "Content-Type": mime[path.extname(relative)] || "text/plain",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/workbench/`;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    for (const item of tests) {
      await item.run();
      console.log(`PASS ${item.name}`);
    }
    console.log(
      `${tests.length} browser scenarios passed (real worker + isolated lifecycle mocks)`,
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
