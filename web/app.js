import { Workbench, SAMPLE_CATALOG, SAMPLE_CONFIG } from "./model.js";
const $ = (id) => document.getElementById(id);
const copy = {
  en: {
    skip: "Skip to editors",
    brandSub: "ICU fixture workbench",
    localOnly: "Runs in this browser",
    eyebrow: "FROM MESSAGE TO TEST CASE",
    title: "Make the branches visible.",
    lede: "Turn ICU messages into concrete arguments, rendered text, and branch evidence. A small starting point for your next snapshot test.",
    scopeTitle: "A bounded experiment",
    scopeNote:
      "Coverage is only for the configured finite inputs. It does not prove linguistic correctness or find a minimum fixture set.",
    inputsTitle: "Define the experiment",
    sampleButton: "Load example ↺",
    catalogLabel: "Message catalog",
    catalogHint: "A flat JSON object: message ID → ICU message string.",
    configLabel: "Locales & inputs",
    configHint: "Choose locales, finite argument domains, and sample values.",
    openJson: "Open JSON file",
    fileLimit: "up to 1 MiB",
    generate: "Generate cases",
    cancel: "Cancel",
    nextStep: "NEXT, INSPECT THE WITNESSES",
    emptyTitle: "Your cases will appear here.",
    emptyNote:
      "The example explores cardinal plurals, ordinals, nested selects, and a plural offset across four locales.",
    resultsTitle: "Inspect the evidence",
    resultTag: "Finite-domain run complete",
    resultCaveat:
      "“Observed” means a branch was selected for at least one supplied input. “Unobserved” is not a proof that a branch is unreachable.",
    casesTab: "Rendered cases",
    coverageTab: "Branch ledger",
    localeFilter: "Locale",
    messageFilter: "Message ID contains",
    previous: "← Previous",
    next: "Next →",
    runtimeTitle: "Runtime & provenance",
    runtimeNote:
      "This browser’s ICU version is not exposed. Plural and number behavior can differ between engines or versions. Review snapshots in the runtime used by your tests.",
    guideTitle: "What goes into the configuration?",
    guideDomainsTitle: "Finite domains",
    guideDomains:
      "Use domains for arguments you want to explore: for example, n: [0, 1, 2, 11, 0.1]. Coverage applies only to these values and any representatives listed in the report.",
    guideSamplesTitle: "Sample values",
    guideSamples:
      "Use samples for plain interpolations such as name. The same catalog is rendered for every requested locale; messages are not translated.",
    guideLimitsTitle: "Explicit limits",
    guideLimits:
      "The engine bounds input, vectors, and output. A limit failure discards the whole run. Reduce a domain, split the catalog, or remove a stricter limits override.",
    footerLocal: "No uploads. No account. No saved input.",
    footerReview: "Snapshot starters. Human review required.",
    ready: "The example is ready. Edit it or generate your first cases.",
    edited: "Inputs changed. Generate again to refresh the evidence.",
    loading: "Reading a file locally… Previous results have been cleared.",
    running: "Exploring the finite inputs in a worker… You can edit or cancel.",
    cancelled: "Cancelled. The worker was stopped and results were cleared.",
    complete: "Run complete. Review the cases before using them in tests.",
    error: "Generation incomplete. No cases or coverage are available.",
    errorTitle: "Generation incomplete",
    errorHelp:
      "Correct the input and generate again. No partial coverage or stale downloads are kept.",
    limitHelp:
      "This run exceeded a bound. Reduce a domain, split the catalog, or remove a stricter limits override, then try again. No partial coverage is reported.",
    fileLarge: "The selected file exceeds 1 MiB.",
    fileEmpty: "The selected file is empty.",
    fileRead: "The file could not be read. Try opening it again.",
    metricCases: "rendered cases",
    metricObserved: "branches observed",
    metricUnobserved: "branches unobserved",
    metricVectors: "vectors evaluated",
    allLocales: "All locales",
    arguments: "Arguments",
    branches: "Selected branch IDs",
    noBranchesSelected: "No conditional branch",
    observed: "Observed",
    unobserved: "Unobserved",
    noBranches: "This message has no conditional branches.",
    domainHeading: "Finite inputs & representatives",
    noMatches: "No results match these filters.",
    catalogFile: "Open catalog JSON file",
    configFile: "Open configuration JSON file",
    showing: (start, end, total) => `${start}–${end} of ${total}`,
    page: (current, total) => `Page ${current} / ${total}`,
    coverageCount: (observed, total) => `${observed} / ${total} observed`,
    vectors: (evaluated, total) =>
      `${evaluated} of ${total} planned representative vectors evaluated`,
  },
  ja: {
    skip: "エディターへ移動",
    brandSub: "ICU テストケース作成ツール",
    localOnly: "このブラウザー内で処理",
    eyebrow: "メッセージから、テストケースへ",
    title: "メッセージの分岐を、見える形に。",
    lede: "ICU メッセージから、具体的な引数・表示結果・分岐の記録を生成します。次のスナップショットテストを作るための、小さな出発点です。",
    scopeTitle: "範囲を決めて確かめる",
    scopeNote:
      "カバレッジの対象は設定した有限の入力です。言語としての正しさや、テストケース数の最小性を保証しません。",
    inputsTitle: "検証する入力を決める",
    sampleButton: "サンプルを読み込む ↺",
    catalogLabel: "メッセージカタログ",
    catalogHint: "JSON オブジェクト：メッセージ ID → ICU メッセージ文字列。",
    configLabel: "ロケールと入力値",
    configHint: "ロケール、引数の有限集合、サンプル値を指定します。",
    openJson: "JSON ファイルを開く",
    fileLimit: "最大 1 MiB",
    generate: "ケースを生成",
    cancel: "キャンセル",
    nextStep: "次に、具体例を確認",
    emptyTitle: "生成したケースがここに並びます。",
    emptyNote:
      "サンプルには、複数形・序数・入れ子の select・plural の offset と、4 つのロケールが含まれています。",
    resultsTitle: "分岐の記録を確認する",
    resultTag: "有限入力の検証が完了",
    resultCaveat:
      "「観測済み」は、指定した入力の少なくとも 1 つでその分岐を選択したという意味です。「未観測」は、到達不能の証明ではありません。",
    casesTab: "表示結果",
    coverageTab: "分岐一覧",
    localeFilter: "ロケール",
    messageFilter: "メッセージ ID で絞り込み",
    previous: "← 前へ",
    next: "次へ →",
    runtimeTitle: "実行環境と入力の記録",
    runtimeNote:
      "ブラウザーの ICU バージョンは取得できません。複数形や数値の表示はエンジンやバージョンによって異なることがあります。テストに使う環境でスナップショットを確認してください。",
    guideTitle: "設定には何を指定しますか？",
    guideDomainsTitle: "有限の入力集合",
    guideDomains:
      "探索する引数を domains で指定します。例：n: [0, 1, 2, 11, 0.1]。対象はこれらの値と、レポートに記載した代表値に限られます。",
    guideSamplesTitle: "サンプル値",
    guideSamples:
      "name などの単純な埋め込みには samples を使います。各ロケールで同じカタログを評価するため、メッセージの翻訳は行いません。",
    guideLimitsTitle: "処理量の制限",
    guideLimits:
      "入力サイズ・組み合わせ数・出力サイズには上限があります。上限を超えると結果全体を破棄します。入力集合を減らす、カタログを分割する、厳しい limits 設定を外すなどで再実行できます。",
    footerLocal: "アップロードなし。アカウント不要。入力の保存なし。",
    footerReview: "スナップショットのたたき台。人による確認が必要です。",
    ready: "サンプルを用意しました。編集するか、そのまま生成できます。",
    edited: "入力を変更しました。再生成すると記録を更新できます。",
    loading: "ファイルをブラウザー内で読み込み中… 以前の結果は消去しました。",
    running: "ワーカーで有限の入力を探索中… 編集・キャンセルできます。",
    cancelled: "キャンセルしました。ワーカーを停止し、結果を消去しました。",
    complete: "生成が完了しました。テストに使う前に内容を確認してください。",
    error: "生成は未完了です。ケース・カバレッジは出力していません。",
    errorTitle: "生成は未完了です",
    errorHelp:
      "入力を修正して再生成してください。部分的なカバレッジや古いダウンロードは残りません。",
    limitHelp:
      "処理上限を超えました。入力集合を減らす、カタログを分割する、厳しい limits 設定を外すなどで再実行してください。部分的なカバレッジは出力しません。",
    fileLarge: "選択したファイルが 1 MiB を超えています。",
    fileEmpty: "選択したファイルは空です。",
    fileRead: "ファイルを読み取れませんでした。もう一度開いてください。",
    metricCases: "表示ケース",
    metricObserved: "観測済みの分岐",
    metricUnobserved: "未観測の分岐",
    metricVectors: "評価した組み合わせ",
    allLocales: "すべて",
    arguments: "引数",
    branches: "選択した分岐 ID",
    noBranchesSelected: "条件分岐なし",
    observed: "観測済み",
    unobserved: "未観測",
    noBranches: "このメッセージには条件分岐がありません。",
    domainHeading: "有限の入力値と代表値",
    noMatches: "条件に一致する結果がありません。",
    catalogFile: "カタログの JSON ファイルを開く",
    configFile: "設定の JSON ファイルを開く",
    showing: (start, end, total) => `${total} 件中 ${start}–${end} 件`,
    page: (current, total) => `${current} / ${total} ページ`,
    coverageCount: (observed, total) => `${total} 分岐中 ${observed} を観測`,
    vectors: (evaluated, total) =>
      `評価済み ${evaluated} 組 / 計画した代表入力 ${total} 組`,
  },
};
let language = "en",
  snapshot,
  lastResult = null,
  view = "cases",
  page = 0;
const pageSize = 24;
const t = (key) => copy[language][key];
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const machine = new Workbench({
  workerFactory: () =>
    new Worker(new URL("./dist/worker.js", import.meta.url), {
      type: "module",
    }),
  onChange: render,
});
function clearDownloads() {
  $("download-cases").disabled = true;
  $("download-coverage").disabled = true;
}
function render(state) {
  snapshot = state;
  for (const [key, id] of [
    ["catalogText", "catalog-input"],
    ["configText", "config-input"],
  ])
    if ($(id).value !== state.inputs[key]) $(id).value = state.inputs[key];
  $("generate-button").disabled = state.status === "running" || state.pending;
  $("cancel-button").hidden = state.status !== "running" && !state.pending;
  $("status-text").textContent = t(state.status) || t("ready");
  $("error-region").hidden = !state.error;
  if (state.error) {
    $("error-title").textContent = t("errorTitle");
    const fileErrors = {
      FILE_LARGE: "fileLarge",
      FILE_EMPTY: "fileEmpty",
      FILE_READ: "fileRead",
    };
    const message = fileErrors[state.error.code]
      ? t(fileErrors[state.error.code])
      : state.error.message;
    $("error-message").textContent = [
      state.error.code,
      state.error.messageId,
      message,
    ]
      .filter(Boolean)
      .join(" · ");
    $("error-help").textContent = t(
      /LIMIT/.test(state.error.code) ? "limitHelp" : "errorHelp",
    );
  }
  const result = state.status === "complete" && state.result;
  $("results").hidden = !result;
  $("empty-state").hidden = Boolean(result);
  clearDownloads();
  if (result) {
    if (lastResult !== result) {
      lastResult = result;
      page = 0;
      $("message-filter").value = "";
      $("locale-filter").value = "";
      renderLocaleOptions(true);
    }
    renderMetrics();
    renderList();
    $("runtime-metadata").textContent = JSON.stringify(
      result.cases.metadata,
      null,
      2,
    );
    $("download-cases").disabled = false;
    $("download-coverage").disabled = false;
  } else {
    lastResult = null;
    $("result-list").replaceChildren();
    $("metrics").replaceChildren();
    $("runtime-metadata").textContent = "";
  }
}
function renderLocaleOptions(reset = false) {
  const selected = reset ? "" : $("locale-filter").value;
  const locales = [
    ...new Set(
      snapshot.result.cases.cases
        .map((item) => item.locale)
        .concat(snapshot.result.coverage.messages.map((item) => item.locale)),
    ),
  ];
  const options = [
    node("option", "", t("allLocales")),
    ...locales.map((locale) => node("option", "", locale)),
  ];
  options[0].value = "";
  locales.forEach((locale, index) => {
    options[index + 1].value = locale;
  });
  $("locale-filter").replaceChildren(...options);
  $("locale-filter").value = selected;
}
function renderMetrics() {
  const sum = snapshot.result.coverage.summary;
  const values = [
    [sum.cases, "metricCases"],
    [sum.observed, "metricObserved"],
    [sum.unobserved, "metricUnobserved"],
    [sum.evaluatedVectors, "metricVectors"],
  ];
  $("metrics").replaceChildren(
    ...values.map(([value, label]) => {
      const item = node("div", "metric");
      item.append(
        node(
          "span",
          "metric-value",
          new Intl.NumberFormat(language).format(value),
        ),
        node("span", "metric-label", t(label)),
      );
      return item;
    }),
  );
}
function caseCard(item) {
  const article = node("article", "case-card"),
    head = node("div", "case-heading"),
    identity = node("div", "case-identity");
  const id = node("code", "", item.messageId);
  id.dir = "auto";
  identity.append(id, node("span", "locale-tag", item.locale));
  head.append(identity, node("span", "case-number", item.id));
  const body = node("p", "case-text", item.text);
  body.dir = "auto";
  const details = node("div", "case-details");
  details.append(
    node("span", "detail-label", t("arguments")),
    node("pre", "", JSON.stringify(item.args, null, 2)),
  );
  details.append(
    node(
      "p",
      "case-branches",
      `${t("branches")}: ${item.branches.length ? item.branches.join(" · ") : t("noBranchesSelected")}`,
    ),
  );
  article.append(head, body, details);
  return article;
}
function coverageCard(item) {
  const details = node("details", "coverage-card"),
    summary = node("summary"),
    identity = node("span", "coverage-identity");
  const id = node("code", "", item.messageId);
  id.dir = "auto";
  identity.append(id, node("span", "locale-tag", item.locale));
  summary.append(
    identity,
    node(
      "span",
      "coverage-counter",
      t("coverageCount")(item.coveredBranches.length, item.branches.length),
    ),
  );
  details.append(summary);
  const list = node("ul", "branch-list");
  for (const branch of item.branches) {
    const row = node("li", "branch-row"),
      body = node("div", "branch-body");
    body.append(
      node(
        "strong",
        "",
        `${branch.argument} · ${branch.kind} · ${branch.option}`,
      ),
      node("span", "branch-path", branch.id),
    );
    if (branch.path !== undefined)
      body.append(
        node(
          "span",
          "branch-path",
          typeof branch.path === "string"
            ? branch.path
            : JSON.stringify(branch.path),
        ),
      );
    row.append(
      node(
        "span",
        `branch-state${branch.observed ? "" : " unobserved"}`,
        t(branch.observed ? "observed" : "unobserved"),
      ),
      body,
    );
    list.append(row);
  }
  if (item.branches.length) details.append(list);
  else details.append(node("p", "no-branches", t("noBranches")));
  const domains = node("div", "domain-detail");
  domains.append(
    node("h4", "", t("domainHeading")),
    node("pre", "", JSON.stringify(item.domains, null, 2)),
    node("p", "", t("vectors")(item.evaluatedVectors, item.totalVectors)),
  );
  details.append(domains);
  return details;
}
function renderList() {
  if (!snapshot.result) return;
  const locale = $("locale-filter").value,
    query = $("message-filter").value.toLowerCase();
  const source =
    view === "cases"
      ? snapshot.result.cases.cases
      : snapshot.result.coverage.messages;
  const items = source.filter(
    (item) =>
      (!locale || item.locale === locale) &&
      item.messageId.toLowerCase().includes(query),
  );
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  page = Math.min(page, pages - 1);
  const start = page * pageSize,
    visible = items.slice(start, start + pageSize);
  $("result-list").replaceChildren(
    ...(visible.length
      ? visible.map(view === "cases" ? caseCard : coverageCard)
      : [node("p", "no-matches", t("noMatches"))]),
  );
  $("result-count").textContent = t("showing")(
    items.length ? start + 1 : 0,
    Math.min(start + pageSize, items.length),
    items.length,
  );
  $("page-label").textContent = t("page")(page + 1, pages);
  $("previous-page").disabled = page === 0;
  $("next-page").disabled = page + 1 >= pages;
  $("cases-tab").setAttribute("aria-pressed", String(view === "cases"));
  $("coverage-tab").setAttribute("aria-pressed", String(view === "coverage"));
}
function translate() {
  document.documentElement.lang = language;
  document.title =
    language === "ja"
      ? "Locale Cases · ICU テストケース作成ツール"
      : "Locale Cases · ICU fixture workbench";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  $("lang-en").setAttribute("aria-pressed", String(language === "en"));
  $("lang-ja").setAttribute("aria-pressed", String(language === "ja"));
  $("catalog-file").setAttribute("aria-label", t("catalogFile"));
  $("config-file").setAttribute("aria-label", t("configFile"));
  if (snapshot?.result) renderLocaleOptions();
  render(machine.snapshot());
}
for (const [id, key] of [
  ["catalog-input", "catalogText"],
  ["config-input", "configText"],
])
  $(id).addEventListener("input", (event) =>
    machine.setInput(key, event.target.value),
  );
for (const [id, key] of [
  ["catalog-file", "catalogText"],
  ["config-file", "configText"],
])
  $(id).addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) machine.loadInput(key, file);
    event.target.value = "";
  });
$("sample-button").addEventListener("click", () => {
  machine.replaceInputs(SAMPLE_CATALOG, SAMPLE_CONFIG);
});
$("generate-button").addEventListener("click", () => machine.start());
$("cancel-button").addEventListener("click", () => machine.cancel());
$("lang-en").addEventListener("click", () => {
  language = "en";
  translate();
});
$("lang-ja").addEventListener("click", () => {
  language = "ja";
  translate();
});
$("cases-tab").addEventListener("click", () => {
  view = "cases";
  page = 0;
  renderList();
});
$("coverage-tab").addEventListener("click", () => {
  view = "coverage";
  page = 0;
  renderList();
});
$("locale-filter").addEventListener("change", () => {
  page = 0;
  renderList();
});
$("message-filter").addEventListener("input", () => {
  page = 0;
  renderList();
});
$("previous-page").addEventListener("click", () => {
  page--;
  renderList();
});
$("next-page").addEventListener("click", () => {
  page++;
  renderList();
});
for (const kind of ["cases", "coverage"])
  $(`download-${kind}`).addEventListener("click", () => {
    if (snapshot.status !== "complete" || !snapshot.result) return;
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(snapshot.result[kind], null, 2)}\n`], {
        type: "application/json",
      }),
    );
    const anchor = node("a");
    anchor.href = url;
    anchor.download = `${kind}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
window.addEventListener("pagehide", () => machine.dispose());
translate();
