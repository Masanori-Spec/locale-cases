import test from "node:test";
import assert from "node:assert/strict";
import {
  Workbench,
  validResult,
  fileProblem,
  MAX_INPUT_BYTES,
  SAMPLE_CATALOG,
  SAMPLE_CONFIG,
} from "../web/model.js";
import { generate } from "../src/core.js";

const fixture = () => ({
  cases: {
    schemaVersion: 1,
    metadata: { tool: "Locale Cases" },
    cases: [
      {
        id: "case-00001",
        messageId: "welcome",
        locale: "en",
        args: { name: "Aki" },
        text: "Hello Aki",
        branches: [],
      },
    ],
  },
  coverage: {
    schemaVersion: 1,
    complete: true,
    metadata: { tool: "Locale Cases" },
    summary: {
      messages: 1,
      locales: 1,
      cases: 1,
      branches: 0,
      observed: 0,
      unobserved: 0,
      evaluatedVectors: 1,
    },
    messages: [
      {
        messageId: "welcome",
        locale: "en",
        domains: [
          {
            argument: "name",
            type: "scalar",
            source: "sample",
            values: ["Aki"],
            representatives: ["Aki"],
          },
        ],
        totalVectors: 1,
        evaluatedVectors: 1,
        branches: [],
        coveredBranches: [],
        unobservedBranches: [],
      },
    ],
  },
});
function setup() {
  const workers = [],
    changes = [];
  const model = new Workbench({
    workerFactory: () => {
      const worker = {
        postMessage(data) {
          this.payload = data;
          this.captured = this.onmessage;
          this.capturedError = this.onerror;
          this.capturedMessageError = this.onmessageerror;
        },
        terminate() {
          this.terminated = (this.terminated || 0) + 1;
        },
      };
      workers.push(worker);
      return worker;
    },
    onChange: (value) => changes.push(value),
  });
  const finish = (index = workers.length - 1, result = fixture()) => {
    const worker = workers[index];
    worker.captured({
      data: { type: "result", id: worker.payload.id, result },
    });
  };
  return { model, workers, changes, finish };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const file = (text, size = 10) => ({ size, text: async () => text });

test("shipped sample produces a complete result accepted by UI validator", async () => {
  const result = await generate(SAMPLE_CATALOG, SAMPLE_CONFIG);
  assert.equal(validResult(result), true);
  assert.equal(result.coverage.summary.locales, 4);
  assert.ok(result.coverage.summary.observed > 0);
  assert.ok(result.coverage.summary.unobserved > 0);
});
test("a complete run stops its worker and exposes only the complete result", () => {
  const s = setup();
  assert.equal(s.model.start(), true);
  assert.equal(s.model.status, "running");
  s.finish();
  assert.equal(s.model.status, "complete");
  assert.equal(s.workers[0].terminated, 1);
  assert.equal(s.model.current, null);
  assert.equal(s.model.result.cases.cases.length, 1);
});
test("rapid double run uses a single worker and a later run gets a new identity", () => {
  const s = setup();
  s.model.start();
  assert.equal(s.model.start(), false);
  assert.equal(s.workers.length, 1);
  s.finish();
  s.model.start();
  assert.equal(s.workers.length, 2);
  assert.notEqual(s.workers[0].payload.id, s.workers[1].payload.id);
  assert.equal(s.model.result, null);
});
test("cancel terminates worker; captured late messages cannot restore results", () => {
  const s = setup();
  s.model.start();
  s.model.cancel();
  s.finish();
  assert.equal(s.model.status, "cancelled");
  assert.equal(s.model.result, null);
  assert.equal(s.workers[0].terminated, 1);
});
test("input edit cancels running job and ignores its late success and error", () => {
  const s = setup();
  s.model.start();
  s.model.setInput("catalogText", '{"next":"Hi"}');
  s.finish();
  s.workers[0].capturedError({ preventDefault() {} });
  assert.equal(s.model.status, "edited");
  assert.equal(s.model.inputs.catalogText, '{"next":"Hi"}');
  assert.equal(s.model.result, null);
  assert.equal(s.model.error, null);
});
test("cancel then restart rejects events from old worker even with newest request id", () => {
  const s = setup();
  s.model.start();
  s.model.cancel();
  s.model.start();
  s.workers[0].captured({
    data: { type: "result", id: s.workers[1].payload.id, result: fixture() },
  });
  assert.equal(s.model.status, "running");
  assert.equal(s.model.result, null);
  s.finish(1);
  assert.equal(s.model.status, "complete");
});
test("current worker ignores events with a stale generation", () => {
  const s = setup();
  s.model.start();
  s.workers[0].captured({
    data: {
      type: "result",
      id: s.workers[0].payload.id - 1,
      result: fixture(),
    },
  });
  assert.equal(s.model.status, "running");
  s.finish();
  assert.equal(s.model.status, "complete");
});
test("worker crash clears artifacts and next run can recover", () => {
  const s = setup();
  s.model.start();
  s.finish();
  s.model.start();
  let prevented = false;
  s.workers[1].capturedError({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(s.model.status, "error");
  assert.equal(s.model.error.code, "WORKER_CRASH");
  assert.equal(s.model.result, null);
  assert.equal(s.workers[1].terminated, 1);
  s.model.start();
  s.finish(2);
  assert.equal(s.model.status, "complete");
});
test("worker constructor failure and post failure are recoverable with no stale result", () => {
  const model = new Workbench({
    workerFactory() {
      throw new Error("unavailable");
    },
  });
  model.start();
  assert.equal(model.error.code, "WORKER_START");
  assert.equal(model.result, null);
  const s = setup();
  s.model.workerFactory = () => ({
    postMessage() {
      throw new Error("clone");
    },
    terminate() {},
  });
  s.model.start();
  assert.equal(s.model.error.code, "WORKER_START");
  assert.equal(s.model.result, null);
});
test("unreadable worker responses stop the job", () => {
  const s = setup();
  s.model.start();
  s.workers[0].capturedMessageError();
  assert.equal(s.model.status, "error");
  assert.equal(s.model.error.code, "WORKER_RESPONSE");
  assert.equal(s.workers[0].terminated, 1);
});
test("budget errors never carry partial cases or coverage into UI", () => {
  const s = setup();
  s.model.start();
  s.finish();
  s.model.start();
  const worker = s.workers[1];
  worker.captured({
    data: {
      type: "error",
      id: worker.payload.id,
      error: {
        code: "VECTOR_LIMIT",
        message: "Too many vectors",
        messageId: "<img src=x>",
      },
      result: fixture(),
    },
  });
  assert.equal(s.model.status, "error");
  assert.equal(s.model.result, null);
  assert.equal(s.model.error.code, "VECTOR_LIMIT");
  assert.equal(s.model.error.messageId, "<img src=x>");
});
test("malformed or explicitly incomplete results fail closed", () => {
  for (const result of [
    {},
    { ...fixture(), coverage: { ...fixture().coverage, complete: false } },
    { ...fixture(), cases: { ...fixture().cases, cases: [] } },
  ]) {
    const s = setup();
    s.model.start();
    s.finish(0, result);
    assert.equal(s.model.error.code, "WORKER_RESPONSE");
    assert.equal(s.model.result, null);
  }
});
test("sample/input replacement invalidates results and old pending file reads", async () => {
  const s = setup();
  s.model.start();
  s.finish();
  const gate = deferred();
  const pending = s.model.loadInput("catalogText", {
    size: 10,
    text: () => gate.promise,
  });
  assert.equal(s.model.result, null);
  assert.equal(s.model.status, "loading");
  assert.equal(s.model.start(), false);
  s.model.replaceInputs('{"fresh":"Hi"}', '{"locales":["en"]}');
  gate.resolve("stale");
  assert.equal(await pending, false);
  assert.equal(s.model.inputs.catalogText, '{"fresh":"Hi"}');
  assert.equal(s.model.status, "ready");
});
test("newest file wins when reads complete out of order", async () => {
  const s = setup(),
    first = deferred(),
    second = deferred();
  const a = s.model.loadInput("catalogText", {
    size: 10,
    text: () => first.promise,
  });
  const b = s.model.loadInput("catalogText", {
    size: 10,
    text: () => second.promise,
  });
  second.resolve("new");
  assert.equal(await b, true);
  first.resolve("old");
  assert.equal(await a, false);
  assert.equal(s.model.inputs.catalogText, "new");
});
test("editing one input does not let its pending file overwrite it", async () => {
  const s = setup(),
    gate = deferred();
  const pending = s.model.loadInput("catalogText", {
    size: 10,
    text: () => gate.promise,
  });
  s.model.setInput("catalogText", "user typing");
  gate.resolve("file text");
  assert.equal(await pending, false);
  assert.equal(s.model.inputs.catalogText, "user typing");
});
test("independent file reads can finish in either order without enabling generate early", async () => {
  const s = setup(),
    a = deferred(),
    b = deferred();
  const pa = s.model.loadInput("catalogText", {
    size: 10,
    text: () => a.promise,
  });
  const pb = s.model.loadInput("configText", {
    size: 10,
    text: () => b.promise,
  });
  a.resolve("catalog");
  await pa;
  assert.equal(s.model.pendingReads.size, 1);
  assert.equal(s.model.start(), false);
  b.resolve("config");
  await pb;
  assert.equal(s.model.status, "edited");
  assert.deepEqual(s.model.inputs, {
    catalogText: "catalog",
    configText: "config",
  });
});
test("failed file read is visible, clears old result, and is recoverable", async () => {
  const s = setup();
  s.model.start();
  s.finish();
  assert.equal(
    await s.model.loadInput("catalogText", {
      size: 10,
      text: async () => {
        throw new Error("disk");
      },
    }),
    false,
  );
  assert.equal(s.model.error.code, "FILE_READ");
  assert.equal(s.model.result, null);
  assert.equal(
    await s.model.loadInput("catalogText", file("replacement")),
    true,
  );
  assert.equal(s.model.status, "edited");
  s.model.start();
  s.finish(1);
  assert.equal(s.model.status, "complete");
});
test("oversized/empty files reject before reading and cancellation ignores a late read error", async () => {
  let reads = 0;
  const s = setup();
  const oversized = {
    size: MAX_INPUT_BYTES + 1,
    text: async () => {
      reads++;
      return "x";
    },
  };
  assert.equal(fileProblem(oversized), "FILE_LARGE");
  await s.model.loadInput("catalogText", oversized);
  assert.equal(reads, 0);
  assert.equal(s.model.error.code, "FILE_LARGE");
  assert.equal(fileProblem(file("", 0)), "FILE_EMPTY");
  const gate = deferred();
  const pending = s.model.loadInput("catalogText", {
    size: 10,
    text: () => gate.promise,
  });
  s.model.cancel();
  gate.reject(new Error("late"));
  await pending;
  assert.equal(s.model.status, "cancelled");
  assert.equal(s.model.error, null);
});
test("dispose invalidates a captured worker result and a pending local file", async () => {
  const s = setup();
  s.model.start();
  s.model.dispose();
  s.finish();
  assert.equal(s.model.result, null);
  assert.equal(s.workers[0].terminated, 1);
  const gate = deferred();
  const pending = s.model.loadInput("catalogText", {
    size: 10,
    text: () => gate.promise,
  });
  const before = s.model.inputs.catalogText;
  s.model.dispose();
  gate.resolve("late");
  await pending;
  assert.equal(s.model.inputs.catalogText, before);
});

// A complete marker cannot legitimize a truncated evaluation.
test("partial evaluation counts fail closed even with complete true", () => {
  const value = fixture();
  value.coverage.messages[0].totalVectors = 2;
  assert.equal(validResult(value), false);
  const s = setup();
  s.model.start();
  s.finish(0, value);
  assert.equal(s.model.status, "error");
  assert.equal(s.model.result, null);
});
