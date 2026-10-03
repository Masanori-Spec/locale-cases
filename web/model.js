export const MAX_INPUT_BYTES = 1_048_576;
export const SAMPLE_CATALOG = JSON.stringify(
  {
    inbox:
      "{name}, {n, plural, =0 {your inbox is empty} one {you have # message} other {you have # messages}}.",
    invitation:
      "{audience, select, team {{n, plural, one {Invite # teammate} other {Invite # teammates}}} other {Invite a guest}}",
    rank: "Place {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    campaign:
      "{n, plural, offset:1 =0 {Nobody joined} =1 {{name} joined} one {{name} and one other joined} other {{name} and # others joined}}",
  },
  null,
  2,
);
export const SAMPLE_CONFIG = JSON.stringify(
  {
    locales: ["en", "ja", "ar", "ru"],
    domains: { n: [0, 1, 2, 3, 11, 21, 100, 0.1], audience: ["team", "guest"] },
    samples: { name: "Aki" },
  },
  null,
  2,
);

const strings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export function validResult(value) {
  const cases = value?.cases,
    coverage = value?.coverage,
    sum = coverage?.summary;
  if (
    !cases ||
    !coverage ||
    coverage.complete !== true ||
    !sum ||
    !cases.schemaVersion ||
    !coverage.schemaVersion ||
    !cases.metadata ||
    !coverage.metadata ||
    !Array.isArray(cases.cases) ||
    !Array.isArray(coverage.messages) ||
    ![
      "messages",
      "locales",
      "cases",
      "branches",
      "observed",
      "unobserved",
      "evaluatedVectors",
    ].every((key) => count(sum[key])) ||
    sum.cases !== cases.cases.length ||
    sum.branches !== sum.observed + sum.unobserved
  )
    return false;
  if (
    !cases.cases.every(
      (item) =>
        typeof item.id === "string" &&
        typeof item.messageId === "string" &&
        typeof item.locale === "string" &&
        typeof item.text === "string" &&
        item.args &&
        typeof item.args === "object" &&
        !Array.isArray(item.args) &&
        strings(item.branches),
    )
  )
    return false;
  return coverage.messages.every(
    (item) =>
      typeof item.messageId === "string" &&
      typeof item.locale === "string" &&
      count(item.totalVectors) &&
      count(item.evaluatedVectors) &&
      item.evaluatedVectors === item.totalVectors &&
      strings(item.coveredBranches) &&
      strings(item.unobservedBranches) &&
      Array.isArray(item.domains) &&
      item.domains.every(
        (domain) =>
          typeof domain.argument === "string" &&
          typeof domain.type === "string" &&
          typeof domain.source === "string" &&
          Array.isArray(domain.values) &&
          Array.isArray(domain.representatives),
      ) &&
      Array.isArray(item.branches) &&
      item.branches.every(
        (branch) =>
          typeof branch.id === "string" &&
          typeof branch.argument === "string" &&
          typeof branch.kind === "string" &&
          typeof branch.option === "string" &&
          typeof branch.observed === "boolean",
      ),
  );
}

export function fileProblem(file) {
  if (!file || typeof file.text !== "function") return "FILE_READ";
  if (!Number.isFinite(file.size) || file.size <= 0) return "FILE_EMPTY";
  return file.size > MAX_INPUT_BYTES ? "FILE_LARGE" : null;
}

/** One disposable worker per run. No stale event can restore an invalidated result. */
export class Workbench {
  constructor({ workerFactory, onChange = () => {} } = {}) {
    this.workerFactory = workerFactory;
    this.onChange = onChange;
    this.inputs = { catalogText: SAMPLE_CATALOG, configText: SAMPLE_CONFIG };
    this.status = "ready";
    this.result = null;
    this.error = null;
    this.generation = 0;
    this.current = null;
    this.readTokens = { catalogText: 0, configText: 0 };
    this.pendingReads = new Set();
  }
  snapshot() {
    return {
      inputs: { ...this.inputs },
      status: this.status,
      result: this.result,
      error: this.error,
      pending: this.pendingReads.size > 0,
    };
  }
  emit() {
    this.onChange(this.snapshot());
  }
  retire() {
    this.generation++;
    const task = this.current;
    this.current = null;
    if (task?.worker) {
      task.worker.onmessage = null;
      task.worker.onerror = null;
      task.worker.onmessageerror = null;
      task.worker.terminate();
    }
    this.result = null;
    this.error = null;
  }
  setInput(key, text) {
    if (!Object.hasOwn(this.inputs, key)) throw new TypeError("Unknown editor");
    this.readTokens[key]++;
    this.pendingReads.delete(key);
    this.retire();
    this.inputs[key] = text;
    this.status = this.pendingReads.size ? "loading" : "edited";
    this.emit();
  }
  replaceInputs(catalogText, configText) {
    this.readTokens.catalogText++;
    this.readTokens.configText++;
    this.pendingReads.clear();
    this.retire();
    this.inputs = { catalogText, configText };
    this.status = "ready";
    this.emit();
  }
  async loadInput(key, file) {
    if (!Object.hasOwn(this.inputs, key)) throw new TypeError("Unknown editor");
    const token = ++this.readTokens[key];
    this.retire();
    this.pendingReads.add(key);
    this.status = "loading";
    this.emit();
    try {
      const code = fileProblem(file);
      if (code) throw Object.assign(new Error(code), { code });
      const text = await file.text();
      if (this.readTokens[key] !== token) return false;
      this.inputs[key] = text;
      this.pendingReads.delete(key);
      this.status = this.pendingReads.size ? "loading" : "edited";
      this.emit();
      return true;
    } catch (error) {
      if (this.readTokens[key] !== token) return false;
      this.pendingReads.delete(key);
      this.error = {
        code: error.code || "FILE_READ",
        message: error.message || "Could not read file",
      };
      this.status = "error";
      this.emit();
      return false;
    }
  }
  cancel() {
    this.readTokens.catalogText++;
    this.readTokens.configText++;
    this.pendingReads.clear();
    this.retire();
    this.status = "cancelled";
    this.emit();
  }
  start() {
    if (this.status === "running" || this.pendingReads.size) return false;
    this.retire();
    this.status = "running";
    const task = { id: this.generation, worker: null };
    this.current = task;
    const active = () => this.current === task && this.generation === task.id;
    const finish = (status, result, error) => {
      if (!active()) return;
      this.retire();
      this.status = status;
      this.result = result;
      this.error = error;
      this.emit();
    };
    this.emit();
    try {
      task.worker = this.workerFactory();
      task.worker.onmessage = ({ data }) => {
        if (!active() || data?.id !== task.id) return;
        if (data.type === "result" && validResult(data.result))
          finish("complete", data.result, null);
        else if (data.type === "error")
          finish("error", null, {
            code:
              typeof data.error?.code === "string"
                ? data.error.code
                : "WORKER_ERROR",
            message:
              typeof data.error?.message === "string"
                ? data.error.message
                : "Worker failed",
            messageId:
              typeof data.error?.messageId === "string"
                ? data.error.messageId
                : undefined,
          });
        else
          finish("error", null, {
            code: "WORKER_RESPONSE",
            message: "The worker returned an incomplete response.",
          });
      };
      task.worker.onerror = (event) => {
        event.preventDefault?.();
        finish("error", null, {
          code: "WORKER_CRASH",
          message: "The worker stopped unexpectedly. Try generating again.",
        });
      };
      task.worker.onmessageerror = () =>
        finish("error", null, {
          code: "WORKER_RESPONSE",
          message: "The worker response could not be read.",
        });
      task.worker.postMessage({
        type: "generate",
        id: task.id,
        ...this.inputs,
      });
    } catch {
      finish("error", null, {
        code: "WORKER_START",
        message: "The worker could not start. Reload the page or try again.",
      });
    }
    return true;
  }
  dispose() {
    this.readTokens.catalogText++;
    this.readTokens.configText++;
    this.pendingReads.clear();
    this.retire();
  }
}
